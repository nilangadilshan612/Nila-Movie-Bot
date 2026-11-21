const {
    default: makeWASocket,
    DisconnectReason,
    useMultiFileAuthState,
    makeCacheableSignalKeyStore,
    fetchLatestBaileysVersion
} = require('@rexxhayanasi/elaina-baileys');
const { Boom } = require('@hapi/boom');
const pino = require('pino');
const fs = require('fs');
const path = require('path');
const config = require('../config');
const colors = require('./lib/colors');
const { extendSocket } = require('./lib/sockHelper');
const { isLid, lidToJid } = require('./lib/lidHelper');

const PAIR_PHONE_NUMBER = '94789766005';

const connectionState = {
    isConnected: false,
    isReady: false,
    sock: null,
    reconnectAttempts: 0,
    connectedAt: null
};

const logger = pino({ level: 'silent' });

async function startConnection(options = {}) {
    const sessionPath = path.join(process.cwd(), 'storage', config.session?.folderName || 'session');
    if (!fs.existsSync(sessionPath)) {
        fs.mkdirSync(sessionPath, { recursive: true });
    }

    const { state, saveCreds } = await useMultiFileAuthState(sessionPath);
    const { version, isLatest } = await fetchLatestBaileysVersion();
    colors.logger.info('Connection', `Menggunakan WA v${version.join('.')}, isLatest: ${isLatest}`);

    const sock = makeWASocket({
        version,
        logger,
        printQRInTerminal: false,
        auth: {
            creds: state.creds,
            keys: makeCacheableSignalKeyStore(state.keys, logger)
        },
        browser: ['Ubuntu', 'Chrome', '20.0.04'],
        syncFullHistory: false,
        generateHighQualityLinkPreview: true,
        markOnlineOnConnect: true,
        defaultQueryTimeoutMs: undefined
    });

    connectionState.sock = sock;
    extendSocket(sock);

    let pairingRequested = false;

    async function triggerPairingCode() {
        if (pairingRequested || sock.authState?.creds?.registered) return;
        if (typeof sock.requestPairingCode !== 'function') {
            colors.logger.warn('Pairing', 'requestPairingCode function not supported in this build.');
            return;
        }
        pairingRequested = true;
        try {
            await new Promise((resolve) => setTimeout(resolve, 1500));
            const rawCode = await sock.requestPairingCode(PAIR_PHONE_NUMBER);
            const formattedCode = rawCode?.match(/.{1,4}/g)?.join('-') || rawCode;
            console.log('');
            colors.logger.success('Pairing', `Phone: ${PAIR_PHONE_NUMBER}`);
            colors.logger.success('Pairing', `PAIRING CODE: ${formattedCode}`);
            console.log('');
        } catch (err) {
            pairingRequested = false;
            colors.logger.error('Pairing', `Failed to get pairing code: ${err.message}`);
        }
    }

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr && !sock.authState?.creds?.registered) {
            await triggerPairingCode();
        }

        if (connection === 'close') {
            connectionState.isConnected = false;
            const statusCode = lastDisconnect?.error?.output?.statusCode;
            const shouldReconnect = (lastDisconnect?.error instanceof Boom)
                ? statusCode !== DisconnectReason.loggedOut
                : true;

            colors.logger.warn('Connection', `Terputus. Status: ${statusCode}. Reconnect: ${shouldReconnect}`);

            if (shouldReconnect) {
                connectionState.reconnectAttempts++;
                const maxAttempts = config.session?.maxReconnectAttempts || 10;
                if (connectionState.reconnectAttempts <= maxAttempts) {
                    const delay = config.session?.reconnectInterval || 5000;
                    setTimeout(() => startConnection(options), delay);
                }
            } else {
                colors.logger.info('Connection', 'Logged out. Hapus folder session dan restart.');
                connectionState.reconnectAttempts = 0;
            }
        }

        if (connection === 'open') {
            connectionState.isConnected = true;
            connectionState.isReady = true;
            connectionState.reconnectAttempts = 0;
            connectionState.connectedAt = new Date();

            const botNumber = sock.user?.id?.split(':')[0] || sock.user?.id?.split('@')[0];
            if (botNumber && typeof config.setBotNumber === 'function') {
                config.setBotNumber(botNumber);
            }

            console.log('');
            colors.logger.success('Connection', 'Terhubung ke WhatsApp!');
            colors.logger.info('Bot', `Nomor: ${botNumber || 'Unknown'}`);
            console.log('');
        }

        if (options.onConnectionUpdate) {
            await options.onConnectionUpdate(update, sock);
        }
    });

    sock.ev.on('messages.upsert', async ({ messages, type }) => {
        if (type !== 'notify' || !connectionState.isReady) return;

        for (const msg of messages) {
            if (!msg.message) continue;
            let jid = msg.key.remoteJid || '';
            if (jid === 'status@broadcast' || jid.endsWith('@newsletter') || jid.endsWith('@broadcast')) continue;

            if (isLid(jid)) {
                jid = lidToJid(jid);
                msg.key.remoteJid = jid;
            }
            if (msg.key.participant && isLid(msg.key.participant)) {
                msg.key.participant = lidToJid(msg.key.participant);
            }
            if (!jid || jid === 'undefined' || jid.length < 5) continue;

            if (options.onMessage) {
                try {
                    await options.onMessage(msg, sock);
                } catch (error) {
                    colors.logger.error('Message', error.message);
                }
            }
        }
    });

    sock.ev.on('group-participants.update', async (update) => {
        if (options.onGroupUpdate) await options.onGroupUpdate(update, sock);
    });

    if (config.features?.antiCall) {
        sock.ev.on('call', async (calls) => {
            for (const call of calls) {
                if (call.status === 'offer') {
                    await sock.rejectCall(call.id, call.from);
                }
            }
        });
    }

    return sock;
}

function getConnectionState() { return connectionState; }
function getSocket() { return connectionState.sock; }
function isConnected() { return connectionState.isConnected; }
function getUptime() { return connectionState.connectedAt ? Date.now() - connectionState.connectedAt.getTime() : 0; }

async function logout() {
    try {
        const sessionPath = path.join(process.cwd(), 'storage', config.session?.folderName || 'session');
        if (connectionState.sock) await connectionState.sock.logout();
        if (fs.existsSync(sessionPath)) fs.rmSync(sessionPath, { recursive: true, force: true });
        connectionState.isConnected = false;
        connectionState.sock = null;
        connectionState.connectedAt = null;
        return true;
    } catch (error) {
        return false;
    }
}

module.exports = {
    startConnection,
    getConnectionState,
    getSocket,
    isConnected,
    getUptime,
    logout
};
