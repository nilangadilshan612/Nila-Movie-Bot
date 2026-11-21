/**
 * @file src/lib/serialize.js
 * @description Message serializer lengkap dengan full fitur untuk memformat pesan WhatsApp
 * @author Ourin-AI Team
 * @version 2.1.0
 */

const {
    downloadContentFromMessage,
    getContentType,
    jidDecode
} = require('@rexxhayanasi/elaina-baileys');
const { writeFileSync, mkdirSync, existsSync } = require('fs');
const { join } = require('path');
const config = require('../../config');
const { isLid, lidToJid, convertLidArray } = require('./lidHelper');

function decodeJid(jid) {
    if (!jid) return null;
    if (/:\d+@/gi.test(jid)) {
        const decoded = jidDecode(jid) || {};
        return (decoded.user && decoded.server && decoded.user + '@' + decoded.server) || jid;
    }
    return jid;
}

function normalizeJid(jid) {
    let decoded = decodeJid(jid);
    if (!decoded) return null;
    if (isLid(decoded)) {
        decoded = lidToJid(decoded);
    }
    return decoded;
}

function getMessageType(message) {
    if (!message) return null;
    return getContentType(message);
}

function getMessageBody(message, type) {
    if (!message || !type) return '';

    const messageContent = message[type];
    if (!messageContent) return '';

    switch (type) {
        case 'conversation':
            return message.conversation || '';
        case 'extendedTextMessage':
            return messageContent.text || '';
        case 'imageMessage':
        case 'videoMessage':
        case 'documentMessage':
            return messageContent.caption || '';
        case 'buttonsResponseMessage':
            return messageContent.selectedButtonId || '';
        case 'listResponseMessage':
            return messageContent.singleSelectReply?.selectedRowId || '';
        case 'templateButtonReplyMessage':
            return messageContent.selectedId || '';
        case 'interactiveResponseMessage':
            try {
                return JSON.parse(messageContent.nativeFlowResponseMessage?.paramsJson || '{}')?.id || '';
            } catch {
                return '';
            }
        case 'pollCreationMessage':
            return messageContent.name || '';
        default:
            return '';
    }
}

function getAllPrefixes(defaultPrefix = '.') {
    const mainPrefix = config.command?.prefix || defaultPrefix || '.';
    const altList = Array.isArray(config.command?.alternativePrefix)
        ? config.command.alternativePrefix
        : ['!', '#', '/'];
    const customList = Array.isArray(config.command?.prefixList)
        ? config.command.prefixList
        : [];

    const combined = [mainPrefix, ...altList, ...customList]
        .filter((p) => typeof p === 'string' && p.length > 0);

    return [...new Set(combined)];
}

function parseCommand(body, prefix = '.') {
    const result = {
        isCommand: false,
        command: '',
        prefix: '',
        args: [],
        text: '',
        fullArgs: ''
    };

    if (!body || typeof body !== 'string') return result;

    const trimmedBody = body.trim();
    const prefixList = getAllPrefixes(prefix);

    for (const p of prefixList) {
        if (trimmedBody.startsWith(p)) {
            const withoutPrefix = trimmedBody.slice(p.length).trim();
            if (!withoutPrefix) break;

            const parts = withoutPrefix.split(/\s+/);
            const rawCmd = parts[0] || '';
            if (!rawCmd) break;

            result.isCommand = true;
            result.prefix = p;
            result.command = config.command?.caseSensitive
                ? rawCmd
                : rawCmd.toLowerCase();
            result.args = parts.slice(1);
            result.text = result.args.join(' ');
            result.fullArgs = withoutPrefix.slice(rawCmd.length).trim();

            break;
        }
    }

    return result;
}

async function serializeQuotedMessage(message, type, sock) {
    if (!message || !type) return null;

    const messageContent = message[type];
    if (!messageContent) return null;

    const contextInfo = messageContent.contextInfo;
    if (!contextInfo || !contextInfo.quotedMessage) return null;

    const quotedMessage = contextInfo.quotedMessage;
    const quotedType = getMessageType(quotedMessage);
    const quotedSender = normalizeJid(contextInfo.participant || '') || '';

    const quoted = {
        id: contextInfo.stanzaId || '',
        sender: quotedSender,
        senderNumber: quotedSender.replace(/@.+/g, ''),
        type: quotedType,
        body: getMessageBody(quotedMessage, quotedType),
        message: quotedMessage,
        mentionedJid: convertLidArray(contextInfo.mentionedJid || []),
        isMedia: ['imageMessage', 'videoMessage', 'audioMessage', 'stickerMessage', 'documentMessage'].includes(quotedType),
        isImage: quotedType === 'imageMessage',
        isVideo: quotedType === 'videoMessage',
        isAudio: quotedType === 'audioMessage',
        isSticker: quotedType === 'stickerMessage',
        isDocument: quotedType === 'documentMessage'
    };

    quoted.download = async (filename = null) => {
        if (!quoted.isMedia) return null;

        const stream = await downloadContentFromMessage(
            quotedMessage[quotedType],
            quotedType.replace('Message', '')
        );

        let buffer = Buffer.from([]);
        for await (const chunk of stream) {
            buffer = Buffer.concat([buffer, chunk]);
        }

        if (filename) {
            const tempDir = join(process.cwd(), 'storage', 'temp');
            if (!existsSync(tempDir)) {
                mkdirSync(tempDir, { recursive: true });
            }
            const filepath = join(tempDir, filename);
            writeFileSync(filepath, buffer);
            return filepath;
        }

        return buffer;
    };

    return quoted;
}

function createContextInfo(jid, text, title = '', body = '', thumbnail = null) {
    const contextInfo = {
        mentionedJid: [],
        forwardingScore: 999,
        isForwarded: true
    };

    if (jid && text) {
        contextInfo.quotedMessage = {
            conversation: text
        };
        contextInfo.participant = jid;
        contextInfo.stanzaId = 'OURINAI' + Date.now();
    }

    if (title || body || thumbnail) {
        contextInfo.externalAdReply = {
            showAdAttribution: true,
            title: title || config.bot?.name || 'Ourin-AI',
            body: body || '',
            mediaType: 1,
            renderLargerThumbnail: true,
            thumbnail: thumbnail,
            sourceUrl: ''
        };
    }

    return contextInfo;
}

async function serialize(sock, msg, store = {}) {
    if (!msg || !msg.message) return null;

    const m = {};

    m.key = msg.key;
    m.id = msg.key.id;
    m.chat = normalizeJid(msg.key.remoteJid) || '';
    m.fromMe = Boolean(msg.key.fromMe);
    m.isGroup = m.chat.endsWith('@g.us');

    const botJidNormalized = normalizeJid(sock.user?.id) || '';

    const rawSender = m.isGroup
        ? msg.key.participant
        : m.fromMe
            ? (sock.user?.id || m.chat)
            : m.chat;

    m.sender = normalizeJid(rawSender) || '';
    m.senderNumber = m.sender ? m.sender.replace(/@.+/g, '') : '';

    m.pushName = msg.pushName || m.senderNumber || 'User';

    m.isOwner = typeof config.isOwner === 'function' ? config.isOwner(m.senderNumber || m.sender) : false;
    m.isPremium = typeof config.isPremium === 'function' ? config.isPremium(m.senderNumber || m.sender) : false;
    m.isBanned = typeof config.isBanned === 'function' ? config.isBanned(m.senderNumber || m.sender) : false;
    m.isBot = m.fromMe;

    let messageData = msg.message;
    if (messageData.ephemeralMessage) {
        messageData = messageData.ephemeralMessage.message;
    }
    if (messageData.viewOnceMessageV2) {
        messageData = messageData.viewOnceMessageV2.message;
        m.isViewOnce = true;
    }
    if (messageData.viewOnceMessage) {
        messageData = messageData.viewOnceMessage.message;
        m.isViewOnce = true;
    }
    if (messageData.documentWithCaptionMessage) {
        messageData = messageData.documentWithCaptionMessage.message;
    }

    m.type = getMessageType(messageData);
    m.message = messageData;
    m.body = getMessageBody(messageData, m.type);

    const parsed = parseCommand(m.body, config.command?.prefix || '.');
    m.isCommand = parsed.isCommand;
    m.command = parsed.command;
    m.prefix = parsed.prefix;
    m.args = parsed.args;
    m.text = parsed.text;
    m.fullArgs = parsed.fullArgs;

    m.isQuoted = false;
    m.quoted = await serializeQuotedMessage(messageData, m.type, sock);
    if (m.quoted) {
        m.isQuoted = true;
    }

    const messageContent = messageData[m.type];
    m.mentionedJid = convertLidArray(messageContent?.contextInfo?.mentionedJid || []);

    m.isMedia = ['imageMessage', 'videoMessage', 'audioMessage', 'stickerMessage', 'documentMessage'].includes(m.type);
    m.isImage = m.type === 'imageMessage';
    m.isVideo = m.type === 'videoMessage';
    m.isAudio = m.type === 'audioMessage';
    m.isSticker = m.type === 'stickerMessage';
    m.isDocument = m.type === 'documentMessage';
    m.isContact = m.type === 'contactMessage' || m.type === 'contactsArrayMessage';
    m.isLocation = m.type === 'locationMessage' || m.type === 'liveLocationMessage';
    m.isPoll = m.type === 'pollCreationMessage';

    m.groupMetadata = null;
    m.isAdmin = false;
    m.isBotAdmin = false;
    m.groupName = '';
    m.groupDesc = '';
    m.groupMembers = [];
    m.groupAdmins = [];

    if (m.isGroup) {
        try {
            m.groupMetadata = store.groupMetadata?.[m.chat] || await sock.groupMetadata(m.chat);
            m.groupName = m.groupMetadata.subject || '';
            m.groupDesc = m.groupMetadata.desc || '';
            m.groupMembers = m.groupMetadata.participants || [];
            m.groupAdmins = m.groupMembers
                .filter((p) => p.admin)
                .map((p) => normalizeJid(p.id) || p.id);
            m.isAdmin = m.groupAdmins.includes(m.sender);
            m.isBotAdmin = m.groupAdmins.includes(botJidNormalized);
        } catch {
            // Silent fail for group metadata
        }
    }

    m.remoteJid = m.chat;
    m.jid = m.chat;
    m.from = m.chat;
    m.to = m.chat;
    m.botNumber = botJidNormalized.replace(/@.+/g, '') || '';
    m.botJid = botJidNormalized;
    m.botName = sock.user?.name || config.bot?.name || 'Ourin-AI';
    m.messageId = m.id;
    m.chatId = m.chat;
    m.senderId = m.sender;
    m.isPrivate = !m.isGroup;
    m.isPrivateChat = !m.isGroup;
    m.isGroupChat = m.isGroup;
    m.mediaType = m.type;
    m.hasMedia = m.isMedia;
    m.mimetype = messageData[m.type]?.mimetype || '';
    m.fileLength = messageData[m.type]?.fileLength || 0;
    m.fileName = messageData[m.type]?.fileName || '';
    m.seconds = messageData[m.type]?.seconds || 0;
    m.ptt = messageData[m.type]?.ptt || false;
    m.isAnimated = messageData[m.type]?.isAnimated || false;
    m.quotedMsg = m.quoted;
    m.quotedBody = m.quoted?.body || '';
    m.quotedSender = m.quoted?.sender || '';
    m.quotedType = m.quoted?.type || '';
    m.hasQuotedMedia = m.quoted?.isMedia || false;
    m.hasQuotedImage = m.quoted?.isImage || false;
    m.hasQuotedVideo = m.quoted?.isVideo || false;
    m.hasQuotedSticker = m.quoted?.isSticker || false;
    m.hasQuotedAudio = m.quoted?.isAudio || false;
    m.hasQuotedDocument = m.quoted?.isDocument || false;
    m.isReply = m.isQuoted;
    m.hasMentions = m.mentionedJid.length > 0;
    m.isForwarded = messageData[m.type]?.contextInfo?.isForwarded || false;
    m.forwardingScore = messageData[m.type]?.contextInfo?.forwardingScore || 0;
    m.expiration = messageData[m.type]?.contextInfo?.expiration || 0;
    m.ephemeralSettingTimestamp = msg.messageTimestamp || 0;

    m.reply = async (text, options = {}) => {
        const defaultOptions = {
            contextInfo: {
                mentionedJid: options.mentions || [],
                ...options.contextInfo
            }
        };

        return sock.sendMessage(m.chat, {
            text,
            ...defaultOptions,
            ...options
        }, {
            quoted: options.quoted !== false ? msg : undefined
        });
    };

    m.replyWithMentions = async (text) => {
        const mentions = [...text.matchAll(/@(\d+)/g)].map((match) => `${match[1]}@s.whatsapp.net`);
        return m.reply(text, { mentions });
    };

    m.replyImage = async (image, caption = '', options = {}) => {
        let buffer = image;
        if (typeof image === 'string' && image.startsWith('http')) {
            const axios = require('axios');
            const response = await axios.get(image, { responseType: 'arraybuffer' });
            buffer = Buffer.from(response.data);
        }

        return sock.sendMessage(m.chat, {
            image: buffer,
            caption,
            contextInfo: options.contextInfo,
            mentions: options.mentions || []
        }, {
            quoted: options.quoted !== false ? msg : undefined
        });
    };

    m.replyVideo = async (video, caption = '', options = {}) => {
        let buffer = video;
        if (typeof video === 'string' && video.startsWith('http')) {
            const axios = require('axios');
            const response = await axios.get(video, { responseType: 'arraybuffer' });
            buffer = Buffer.from(response.data);
        }

        return sock.sendMessage(m.chat, {
            video: buffer,
            caption,
            gifPlayback: options.gif || false,
            contextInfo: options.contextInfo,
            mentions: options.mentions || []
        }, {
            quoted: options.quoted !== false ? msg : undefined
        });
    };

    m.replyAudio = async (audio, ptt = false, options = {}) => {
        let buffer = audio;
        if (typeof audio === 'string' && audio.startsWith('http')) {
            const axios = require('axios');
            const response = await axios.get(audio, { responseType: 'arraybuffer' });
            buffer = Buffer.from(response.data);
        }

        return sock.sendMessage(m.chat, {
            audio: buffer,
            ptt,
            mimetype: 'audio/mpeg'
        }, {
            quoted: options.quoted !== false ? msg : undefined
        });
    };

    m.replySticker = async (sticker, options = {}) => {
        let buffer = sticker;
        if (typeof sticker === 'string' && sticker.startsWith('http')) {
            const axios = require('axios');
            const response = await axios.get(sticker, { responseType: 'arraybuffer' });
            buffer = Buffer.from(response.data);
        }

        return sock.sendMessage(m.chat, {
            sticker: buffer
        }, {
            quoted: options.quoted !== false ? msg : undefined
        });
    };

    m.replyDocument = async (document, fileName, mimetype = 'application/octet-stream', options = {}) => {
        let buffer = document;
        if (typeof document === 'string' && document.startsWith('http')) {
            const axios = require('axios');
            const response = await axios.get(document, { responseType: 'arraybuffer' });
            buffer = Buffer.from(response.data);
        }

        return sock.sendMessage(m.chat, {
            document: buffer,
            fileName,
            mimetype,
            caption: options.caption || ''
        }, {
            quoted: options.quoted !== false ? msg : undefined
        });
    };

    m.replyContact = async (number, name, options = {}) => {
        const cleanNumber = number.replace(/[^0-9]/g, '');

        const vcard = `BEGIN:VCARD
VERSION:3.0
FN:${name}
TEL;type=CELL;type=VOICE;waid=${cleanNumber}:+${cleanNumber}
END:VCARD`;

        return sock.sendMessage(m.chat, {
            contacts: {
                displayName: name,
                contacts: [{ vcard }]
            }
        }, {
            quoted: options.quoted !== false ? msg : undefined
        });
    };

    m.replyLocation = async (latitude, longitude, options = {}) => {
        return sock.sendMessage(m.chat, {
            location: {
                degreesLatitude: latitude,
                degreesLongitude: longitude,
                name: options.name || '',
                address: options.address || ''
            }
        }, {
            quoted: options.quoted !== false ? msg : undefined
        });
    };

    m.replyWithQuote = async (text, fakeJid, fakeText, options = {}) => {
        const fakeMsg = {
            key: {
                fromMe: false,
                participant: fakeJid,
                remoteJid: m.chat
            },
            message: {
                conversation: fakeText
            },
            pushName: options.pushName || 'Bot'
        };

        return sock.sendMessage(m.chat, {
            text,
            contextInfo: {
                ...createContextInfo(fakeJid, fakeText, options.title, options.body, options.thumbnail),
                mentionedJid: options.mentions || []
            }
        }, {
            quoted: fakeMsg
        });
    };

    m.replyWithPreview = async (text, preview, options = {}) => {
        return sock.sendMessage(m.chat, {
            text,
            contextInfo: {
                externalAdReply: {
                    showAdAttribution: true,
                    title: preview.title || config.bot?.name || 'Ourin-AI',
                    body: preview.body || '',
                    mediaType: 1,
                    renderLargerThumbnail: true,
                    thumbnail: preview.thumbnail,
                    sourceUrl: preview.sourceUrl || ''
                },
                mentionedJid: options.mentions || []
            }
        }, {
            quoted: options.quoted !== false ? msg : undefined
        });
    };

    m.react = async (emoji) => {
        return sock.sendMessage(m.chat, {
            react: {
                text: emoji,
                key: msg.key
            }
        });
    };

    m.download = async (filename = null) => {
        if (!m.isMedia) return null;

        const stream = await downloadContentFromMessage(
            messageData[m.type],
            m.type.replace('Message', '')
        );

        let buffer = Buffer.from([]);
        for await (const chunk of stream) {
            buffer = Buffer.concat([buffer, chunk]);
        }

        if (filename) {
            const tempDir = join(process.cwd(), 'storage', 'temp');
            if (!existsSync(tempDir)) {
                mkdirSync(tempDir, { recursive: true });
            }
            const filepath = join(tempDir, filename);
            writeFileSync(filepath, buffer);
            return filepath;
        }

        return buffer;
    };

    m.delete = async () => {
        return sock.sendMessage(m.chat, {
            delete: msg.key
        });
    };

    m.forward = async (jid, forceForward = false) => {
        return sock.sendMessage(jid, {
            forward: msg,
            force: forceForward
        });
    };

    m.copy = async (jid, options = {}) => {
        const content = {};

        if (m.isImage) {
            content.image = await m.download();
            content.caption = m.body;
        } else if (m.isVideo) {
            content.video = await m.download();
            content.caption = m.body;
        } else if (m.isAudio) {
            content.audio = await m.download();
        } else if (m.isSticker) {
            content.sticker = await m.download();
        } else if (m.isDocument) {
            content.document = await m.download();
            content.fileName = messageData[m.type]?.fileName || 'file';
            content.mimetype = messageData[m.type]?.mimetype;
        } else {
            content.text = m.body;
        }

        return sock.sendMessage(jid, content, options);
    };

    m.timestamp = msg.messageTimestamp;
    m.raw = msg;

    return m;
}

function getNumber(jid) {
    if (!jid) return '';
    return jid.replace(/@.+/g, '');
}

function createJid(number) {
    if (!number) return '';
    const cleaned = number.replace(/[^0-9]/g, '');
    return cleaned + '@s.whatsapp.net';
}

module.exports = {
    serialize,
    decodeJid,
    getMessageType,
    getMessageBody,
    parseCommand,
    serializeQuotedMessage,
    createContextInfo,
    getNumber,
    createJid
};
