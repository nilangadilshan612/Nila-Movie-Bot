/**
 * @file src/handler.js
 * @description Message handler utama untuk memproses pesan dan menjalankan plugin
 * @author Ourin-AI Team
 * @version 2.1.0
 */

const config = require('../config');
const { isSelf } = require('../config');
const { serialize } = require('./lib/serialize');
const { getPlugin, getPluginCount } = require('./lib/plugins');
const { getDatabase } = require('./lib/database');
const { createErrorMessage } = require('./lib/formatter');
const { getUptime } = require('./connection');
const { logger, logMessage, logCommand } = require('./lib/colors');
const { isLid, lidToJid } = require('./lib/lidHelper');

const spamMap = new Map();

function isSpamming(jid) {
    if (!config.features?.antiSpam) return false;

    const now = Date.now();
    const lastMessage = spamMap.get(jid) || 0;
    const interval = config.features?.antiSpamInterval || 3000;

    if (now - lastMessage < interval) {
        return true;
    }

    spamMap.set(jid, now);
    return false;
}

function checkPermission(m, pluginConfig = {}) {
    if (pluginConfig.isOwner && !m.isOwner) {
        return { allowed: false, reason: config.Messages?.ownerOnly || '🚫 Owner only!' };
    }

    if (pluginConfig.isPremium && !m.isPremium && !m.isOwner) {
        return { allowed: false, reason: config.Messages?.premiumOnly || '💎 Premium only!' };
    }

    if (pluginConfig.isGroup && !m.isGroup) {
        return { allowed: false, reason: config.Messages?.groupOnly || '👥 Group only!' };
    }

    if (pluginConfig.isPrivate && m.isGroup) {
        return { allowed: false, reason: config.Messages?.privateOnly || '📱 Private chat only!' };
    }

    return { allowed: true, reason: '' };
}

function checkMode(m) {
    const mode = config.mode || 'public';

    if (mode === 'self') {
        return Boolean(m.fromMe || m.isOwner);
    }

    return true;
}

function extractCommandFallback(m) {
    const body = (m.body || m.text || '').trim();
    if (!body) return null;

    const mainPrefix = config.command?.prefix || '.';
    const altPrefixes = Array.isArray(config.command?.alternativePrefix)
        ? config.command.alternativePrefix
        : ['!', '#', '/'];
    const prefixes = [mainPrefix, ...altPrefixes].filter(Boolean);

    const matchedPrefix = prefixes.find((p) => body.startsWith(p));
    if (!matchedPrefix) return null;

    const withoutPrefix = body.slice(matchedPrefix.length).trim();
    if (!withoutPrefix) return null;

    const parts = withoutPrefix.split(/\s+/);
    const command = parts.shift().toLowerCase();
    const args = parts;
    const text = args.join(' ');

    return {
        prefix: matchedPrefix,
        command,
        args,
        text
    };
}

async function sendSafeReply(sock, m, text) {
    if (typeof m.reply === 'function') {
        await m.reply(text);
        return;
    }
    if (m.chat) {
        await sock.sendMessage(m.chat, { text }, { quoted: m });
    }
}

async function messageHandler(msg, sock) {
    try {
        const m = await serialize(sock, msg);
        if (!m || !m.message) return;

        const db = getDatabase();

        const selfModeEnabled = db.setting ? db.setting('selfMode') : false;
        if (selfModeEnabled && !isSelf(m.senderNumber) && !m.fromMe) {
            return;
        }

        if (m.isBanned) {
            logger.warn('Banned user', m.sender || m.senderNumber);
            return;
        }

        if (!checkMode(m)) {
            return;
        }

        if (config.features?.autoRead && m.key) {
            await sock.readMessages([m.key]).catch(() => {});
        }

        const safeName = (m.pushName && m.pushName.trim() && m.pushName !== 'Unknown')
            ? m.pushName.trim()
            : (m.senderNumber || 'User');

        if (m.sender && typeof db.setUser === 'function') {
            db.setUser(m.sender, {
                name: safeName,
                lastSeen: new Date().toISOString()
            });
        }

        const fallbackCmd = extractCommandFallback(m);
        const isCmd = Boolean(m.isCommand || fallbackCmd);

        if (!m.prefix && fallbackCmd) m.prefix = fallbackCmd.prefix;
        if (!m.command && fallbackCmd) m.command = fallbackCmd.command;
        if (!Array.isArray(m.args) && fallbackCmd) m.args = fallbackCmd.args;
        if (typeof m.text !== 'string' && fallbackCmd) m.text = fallbackCmd.text;

        if (config.features?.logMessage && !isCmd) {
            const chatType = m.isGroup ? 'group' : 'private';
            logMessage(chatType, safeName, m.body || '');
        }

        if (!isCmd || !m.command) return;

        if (isSpamming(m.sender || m.chat)) {
            return;
        }

        const plugin = getPlugin(m.command);
        if (!plugin) {
            return;
        }

        if (plugin.config && plugin.config.isEnabled === false) {
            return;
        }

        const permission = checkPermission(m, plugin.config || {});
        if (!permission.allowed) {
            await sendSafeReply(sock, m, permission.reason);
            return;
        }

        const user = m.sender && typeof db.getUser === 'function' ? db.getUser(m.sender) : null;

        if (!m.isOwner && plugin.config?.cooldown > 0 && typeof db.checkCooldown === 'function') {
            const cooldownRemaining = db.checkCooldown(m.sender, m.command, plugin.config.cooldown);
            if (cooldownRemaining) {
                const cooldownMsg = (config.Messages?.cooldown || '⏱️ තත්පර %time% ක් රැඳී සිටින්න!')
                    .replace('%time%', cooldownRemaining);
                await sendSafeReply(sock, m, cooldownMsg);
                return;
            }
        }

        if (!m.isOwner && !m.isPremium && plugin.config?.limit > 0 && typeof db.updateLimit === 'function') {
            const currentLimit = user?.limit ?? config.limits?.default ?? 200;
            if (currentLimit < plugin.config.limit) {
                await sendSafeReply(sock, m, config.Messages?.limitExceeded || '📊 ඔයාගේ දෛනික limit එක අවසන්!');
                return;
            }
            db.updateLimit(m.sender, -plugin.config.limit);
        }

        if (config.features?.autoTyping && m.chat) {
            await sock.sendPresenceUpdate('composing', m.chat).catch(() => {});
        }

        const context = {
            sock,
            m,
            config,
            db,
            uptime: getUptime(),
            plugins: {
                count: getPluginCount()
            }
        };

        const chatType = m.isGroup ? 'group' : 'private';
        logCommand(`${m.prefix || '.'}${m.command}`, safeName, chatType);

        await plugin.handler(m, context);

        if (!m.isOwner && plugin.config?.cooldown > 0 && typeof db.setCooldown === 'function') {
            db.setCooldown(m.sender, m.command, plugin.config.cooldown);
        }

        if (typeof db.incrementStat === 'function') {
            db.incrementStat('commandsExecuted');
            db.incrementStat(`command_${m.command}`);
        }

        if (config.features?.autoTyping && m.chat) {
            await sock.sendPresenceUpdate('paused', m.chat).catch(() => {});
        }
    } catch (error) {
        logger.error('Handler', error.message);

        try {
            const m = await serialize(sock, msg);
            if (m) {
                await sendSafeReply(sock, m, createErrorMessage('Command එක process කරද්දී දෝෂයක් සිදු වුණා!'));
            }
        } catch {
            logger.error('Failed to send error message');
        }
    }
}

async function groupHandler(update, sock) {
    try {
        const { id: groupJid, participants, action } = update;
        const db = getDatabase();

        let groupData = db.getGroup(groupJid);
        if (!groupData) {
            db.createGroup(groupJid, {
                welcome: config.welcome?.defaultEnabled ?? true,
                goodbye: config.goodbye?.defaultEnabled ?? true,
                leave: config.goodbye?.defaultEnabled ?? true
            });
            groupData = db.getGroup(groupJid);
        }

        const groupMeta = await sock.groupMetadata(groupJid);

        let sendWelcomeMessage, sendGoodbyeMessage;
        try {
            sendWelcomeMessage = require('../plugins/group/welcome').sendWelcomeMessage;
            sendGoodbyeMessage = require('../plugins/group/goodbye').sendGoodbyeMessage;
        } catch {
            return;
        }

        for (let participant of participants || []) {
            if (isLid(participant)) {
                participant = lidToJid(participant);
            }

            if (action === 'add' && typeof sendWelcomeMessage === 'function') {
                await sendWelcomeMessage(sock, groupJid, participant, groupMeta);
            }

            if (action === 'remove' && typeof sendGoodbyeMessage === 'function') {
                await sendGoodbyeMessage(sock, groupJid, participant, groupMeta);
            }
        }
    } catch (error) {
        console.error('[GroupHandler] Error:', error.message);
    }
}

module.exports = {
    messageHandler,
    groupHandler,
    checkPermission,
    checkMode,
    isSpamming
};
