/**
 * @file src/connection.js
 * @description Handler koneksi WhatsApp menggunakan Baileys dengan Pairing Code support
 * @author Ourin-AI Team
 * @version 1.0.0
 */

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
const readline = require('readline');
const config = require('../config');
const colors = require('./lib/colors');
const { extendSocket } = require('./lib/sockHelper');
const { isLid, lidToJid, decodeAndNormalize } = require('./lib/lidHelper');

const connectionState = {
    isConnected: false,
    isReady: false,
    sock: null,
    reconnectAttempts: 0,
    connectedAt: null
};

const logger = pino({ 
    level: 'silent'
});

let rl = null;

const originalConsoleLog = console.log;
const originalConsoleError = console.error;

const suppressPatterns = [
    'Failed to decrypt message',
    'Bad MAC',
    'Session error',
    'Closing session',
    'SessionEntry',
    'Closing open session',
    '_chains',
    'chainKey',
    'registrationId',
    'currentRatchet',
    'ephemeralKeyPair',
    'indexInfo',
    'baseKey'
];

console.log = (...args) => {
    const message = args.join(' ');
    const shouldSuppress = suppressPatterns.some(pattern => message.includes(pattern));
    if (!shouldSuppress) {
        originalConsoleLog.apply(console, args);
    }
};

console.error = (...args) => {
    const message = args.join(' ');
    const shouldSuppress = suppressPatterns.some(pattern => message.includes(pattern));
    if (!shouldSuppress) {
        originalConsoleError.apply(console, args);
    }
};

function createReadlineInterface() {
    if (rl) {
        rl.close();
    }
    rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });
    return rl;
}

function askQuestion(question) {
    return new Promise((resolve) => {
        const interface = createReadlineInterface();
        interface.question(question, (answer) => {
            interface.close();
            resolve(answer.trim());
        });
    });
}

async function startConnection(options = {}) {
    const sessionPath = path.join(process.cwd(), 'storage', config.session?.folderName || 'session');
    
    if (!fs.existsSync(sessionPath)) {
        fs.mkdirSync(sessionPath, { recursive: true });
    }
    
    const { state, saveCreds } = await useMultiFileAuthState(sessionPath);
    
    const { version, isLatest } = await fetchLatestBaileysVersion();
    colors.logger.info('Connection', `Menggunakan WA v${version.join('.')}, isLatest: ${isLatest}`);
    
    const usePairingCode = false;
    const pairingNumber = config.session?.pairingNumber || config.bot?.number || '94789766005';
    
    const sock = makeWASocket({
        version,
        logger,
        printQRInTerminal: true,
        auth: {
            creds: state.creds,
            keys: makeCacheableSignalKeyStore(state.keys, logger)
        },
        browser: ['Mac OS', 'Safari', '14.4.1'],
        syncFullHistory: false,
        generateHighQualityLinkPreview: true,
        markOnlineOnConnect: true,
        defaultQueryTimeoutMs: undefined
    });
    
    connectionState.sock = sock;
    extendSocket(sock);
    
    if (usePairingCode && !sock.authState.creds.registered) {
        let phoneNumber = pairingNumber || '94789766005';
        
        if (!phoneNumber) {
            console.log('');
            colors.logger.warn('Pairing', 'Nomor pairing tidak diset di config!');
            console.log('');
            phoneNumber = await askQuestion(colors.cyan('📱 Masukkan nomor WhatsApp (contoh: 94789766005): '));
        }
        
        phoneNumber = phoneNumber.replace(/[^0-9]/g, '');
        
        if (!phoneNumber.startsWith('94')) {
            if (phoneNumber.startsWith('0')) {
                phoneNumber = '94' + phoneNumber.slice(1);
            } else {
                phoneNumber = '94' + phoneNumber;
            }
        }
        
        colors.logger.info('Pairing', `Meminta pairing code untuk ${phoneNumber}...`);
        
        try {
            const code = await sock.requestPairingCode(phoneNumber);
            console.log('');
            console.log(colors.createBanner([
                '',
                '   PAIRING CODE   ',
                '',
                `   ${colors.bold(colors.brightGreen(code))}   `,
                '',
                '  Masukkan kode ini di WhatsApp  ',
                '  Settings > Linked Devices > Link a Device  ',
                ''
            ], 'green'));
            console.log('');
        } catch (error) {
            const errMsg = error?.message || error?.output?.payload?.message || JSON.stringify(error) || 'Unknown error';
            colors.logger.error('Pairing', 'Gagal mendapatkan pairing code:', errMsg);
        }
    }
    
    sock.ev.on('creds.update', saveCreds);
    
    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;
        
        if (qr && !usePairingCode) {
            colors.logger.info('QR', 'QR Code diterima, silakan scan!');
        }
        
        if (connection === 'close') {
            connectionState.isConnected = false;
            
            const shouldReconnect = (lastDisconnect?.error instanceof Boom)
                ? lastDisconnect.error.output?.statusCode !== DisconnectReason.loggedOut
                : true;
            
            const statusCode = lastDisconnect?.error?.output?.statusCode;
            colors.logger.warn('Connection', `Terputus. Status: ${statusCode}. Reconnect: ${shouldReconnect}`);
            
            if (shouldReconnect) {
                connectionState.reconnectAttempts++;
                const maxAttempts = config.session?.maxReconnectAttempts || 10;
                
                if (connectionState.reconnectAttempts <= maxAttempts) {
                    const delay = config.session?.reconnectInterval || 5000;
                    colors.logger.info('Connection', `Menyambung ulang dalam ${delay}ms... (${connectionState.reconnectAttempts}/${maxAttempts})`);
                    
                    setTimeout(() => {
                        startConnection(options);
                    }, delay);
                } else {
                    colors.logger.error('Connection', 'Maksimum percobaan reconnect tercapai. Restart manual diperlukan.');
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
            if (botNumber) {
                config.setBotNumber(botNumber);
                colors.logger.info('Bot', `Bot number set: ${botNumber}`);
            }
            
            console.log('');
            colors.logger.success('Connection', 'Terhubung ke WhatsApp!');
            colors.logger.info('Bot', `Nama: ${config.bot?.name || 'Ourin-AI'}`);
            colors.logger.info('Bot', `Nomor: ${botNumber || 'Unknown'}`);
            console.log('');
        }
        
        if (options.onConnectionUpdate) {
            await options.onConnectionUpdate(update, sock);
        }
    });
    
    sock.ev.on('messages.upsert', async ({ messages, type }) => {
        if (type !== 'notify') return;
        
        if (!connectionState.isReady) {
            colors.logger.debug('Skip', 'Connection not ready yet');
            return;
        }
        
        for (const msg of messages) {
            if (!msg.message) continue;
            
            let jid = msg.key.remoteJid || '';
            
            if (jid === 'status@broadcast') continue;
            
            if (jid.endsWith('@newsletter')) {
                colors.logger.debug('Skip', 'Newsletter message filtered');
                continue;
            }
            
            if (isLid(jid)) {
                jid = lidToJid(jid);
                msg.key.remoteJid = jid;
                colors.logger.debug('LID', `Converted remoteJid to ${jid}`);
            }
            
            if (msg.key.participant && isLid(msg.key.participant)) {
                msg.key.participant = lidToJid(msg.key.participant);
            }
            
            if (jid.endsWith('@broadcast')) {
                colors.logger.debug('Skip', 'Broadcast message filtered');
                continue;
            }
            
            if (!jid || jid === 'undefined' || jid.length < 5) {
                colors.logger.debug('Skip', 'Invalid JID filtered');
                continue;
            }
            
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
        if (options.onGroupUpdate) {
            await options.onGroupUpdate(update, sock);
        }
    });
    
    sock.ev.on('groups.update', async (updates) => {
        for (const update of updates) {
            colors.logger.debug('Group', `Updated: ${update.id}`);
        }
    });
    
    if (config.features?.antiCall) {
        sock.ev.on('call', async (calls) => {
            for (const call of calls) {
                if (call.status === 'offer') {
                    colors.logger.warn('Call', `Menolak panggilan dari ${call.from}`);
                    await sock.rejectCall(call.id, call.from);
                    
                    await sock.sendMessage(call.from, {
                        text: '🚫 *Auto Reject Call*\n\nMaaf, bot tidak menerima panggilan. Silakan kirim pesan teks saja.'
                    });
                }
            }
        });
    }
    
    return sock;
}

function getConnectionState() {
    return connectionState;
}

function getSocket() {
    return connectionState.sock;
}

function isConnected() {
    return connectionState.isConnected;
}

function getUptime() {
    if (!connectionState.connectedAt) return 0;
    return Date.now() - connectionState.connectedAt.getTime();
}

async function logout() {
    try {
        const sessionPath = path.join(process.cwd(), 'storage', config.session?.folderName || 'session');
        
        if (connectionState.sock) {
            await connectionState.sock.logout();
        }
        
        if (fs.existsSync(sessionPath)) {
            fs.rmSync(sessionPath, { recursive: true, force: true });
        }
        
        connectionState.isConnected = false;
        connectionState.sock = null;
        connectionState.connectedAt = null;
        
        colors.logger.success('Connection', 'Logged out dan session dihapus');
        return true;
    } catch (error) {
        colors.logger.error('Connection', 'Logout error:', error.message);
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
