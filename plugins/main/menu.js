/**
 * @file plugins/main/menu.js
 * @description Plugin menu dengan desain baru - semua command ditampilkan di menu utama
 * @author Ourin-AI Team
 * @version 6.1.0
 */

const config = require('../../config');
const { formatUptime, getTimeGreeting } = require('../../src/lib/formatter');
const { getCommandsByCategory, getCategories } = require('../../src/lib/plugins');
const fs = require('fs');
const path = require('path');

const pluginConfig = {
    name: 'menu',
    alias: ['help', 'bantuan', 'commands', 'm'],
    category: 'main',
    description: 'Menampilkan menu utama bot',
    usage: '.menu',
    example: '.menu',
    isOwner: false,
    isPremium: false,
    isGroup: false,
    isPrivate: false,
    cooldown: 5,
    limit: 0,
    isEnabled: true
};

const CATEGORY_EMOJIS = {
    owner: '👑',
    main: '🏠',
    utility: '🔧',
    fun: '🎮',
    group: '👥',
    download: '📥',
    search: '🔍',
    tools: '🛠️',
    sticker: '🖼️',
    ai: '🤖',
    game: '🎯',
    media: '🎬',
    info: 'ℹ️'
};

function formatTime(date) {
    return date.toLocaleTimeString('id-ID', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
    });
}

function formatDateShort(date) {
    const days = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
    const months = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
    return `${days[date.getDay()]}, ${date.getDate()} ${months[date.getMonth()]} ${date.getFullYear()}`;
}

function getSafeUser(db, m) {
    if (!db || typeof db.getUser !== 'function') return null;
    return db.getUser(m.sender) || (m.senderNumber ? db.getUser(`${m.senderNumber}@s.whatsapp.net`) : null);
}

function getSafeUserCount(db) {
    try {
        if (db && typeof db.getUserCount === 'function') {
            return db.getUserCount();
        }
        if (db && db.data && Array.isArray(db.data.users)) {
            return db.data.users.length;
        }
        if (db && db.data && db.data.users && typeof db.data.users === 'object') {
            return Object.keys(db.data.users).length;
        }
    } catch {
        // Ignore
    }
    return 1;
}

async function handler(m, { sock, config: botConfig, db, uptime }) {
    const prefix = botConfig.command?.prefix || '.';
    const user = getSafeUser(db, m);
    const now = new Date();
    const timeStr = formatTime(now);
    const dateStr = formatDateShort(now);

    const categories = getCategories();
    const commandsByCategory = getCommandsByCategory();

    let totalCommands = 0;
    for (const category of categories) {
        totalCommands += (commandsByCategory[category] || []).length;
    }

    let userRole = 'User';
    let roleEmoji = '👤';
    if (m.isOwner) {
        userRole = 'Owner';
        roleEmoji = '👑';
    } else if (m.isPremium) {
        userRole = 'Premium';
        roleEmoji = '💎';
    }

    const greeting = typeof getTimeGreeting === 'function' ? getTimeGreeting() : 'Halo';
    const uptimeFormatted = typeof formatUptime === 'function' ? formatUptime(uptime) : `${Math.floor((uptime || 0) / 1000)}s`;
    const totalUsers = getSafeUserCount(db);
    const pushName = m.pushName || m.senderNumber || 'User';

    let txt = '';

    txt += `Hallo ${pushName} ${greeting.includes('pagi') ? '🌅' : greeting.includes('siang') ? '☀️' : greeting.includes('sore') ? '🌇' : '🌙'}\n`;
    txt += `${greeting}! Selamat datang di *${botConfig.bot?.name || 'Nila-Movie-Bot'}*\n\n`;

    txt += `╭┈┈⽗「 🤖 *BOT INFO* 」\n`;
    txt += `││ ރ Nama: *${botConfig.bot?.name || 'Nila-Movie-Bot'}*\n`;
    txt += `││ ރ Versi: *v${botConfig.bot?.version || '1.2.0'}*\n`;
    txt += `││ ރ Mode: *${(botConfig.mode || 'public').toUpperCase()}*\n`;
    txt += `││ ރ Prefix: *[ ${prefix} ]*\n`;
    txt += `││ ރ Uptime: *${uptimeFormatted}*\n`;
    txt += `││ ރ Total User: *${totalUsers}*\n`;
    txt += `││ ރ Total Command: *${totalCommands}*\n`;
    txt += `╰┈┈┈┈┈┈┈┈⽗\n\n`;

    txt += `╭┈┈⽗「 👤 *USER INFO* 」\n`;
    txt += `││ ރ Nama: *${pushName}*\n`;
    txt += `││ ރ Role: *${roleEmoji} ${userRole}*\n`;
    txt += `││ ރ Limit: *${user?.limit ?? 25}*\n`;
    txt += `││ ރ Waktu: *${timeStr}*\n`;
    txt += `││ ރ Tanggal: *${dateStr}*\n`;
    txt += `╰┈┈┈┈┈┈┈┈⽗\n\n`;

    const categoryOrder = ['owner', 'main', 'utility', 'tools', 'fun', 'game', 'download', 'search', 'sticker', 'media', 'ai', 'group', 'info'];

    const sortedCategories = [...categories].sort((a, b) => {
        const indexA = categoryOrder.indexOf(a);
        const indexB = categoryOrder.indexOf(b);
        return (indexA === -1 ? 999 : indexA) - (indexB === -1 ? 999 : indexB);
    });

    for (const category of sortedCategories) {
        if (category === 'owner' && !m.isOwner) continue;

        const commands = commandsByCategory[category] || [];
        if (commands.length === 0) continue;

        const emoji = CATEGORY_EMOJIS[category] || '📋';
        const categoryName = category.toUpperCase();

        txt += `╭┈┈⽗「 ${emoji} \`${categoryName}\` 」\n`;

        for (const cmd of commands) {
            txt += `││ ރ ${prefix}${cmd}\n`;
        }

        txt += `╰┈┈┈┈┈┈┈┈⽗\n\n`;
    }

    txt += `© *${botConfig.bot?.name || 'Nila-Movie-Bot'}* | ${new Date().getFullYear()}\n`;
    txt += `Developer: *${botConfig.bot?.developer || 'Nilanga'}*`;

    await sendMenuWithUI(m, sock, txt, botConfig);
}

async function sendMenuWithUI(m, sock, text, botConfig) {
    const botName = botConfig.bot?.name || 'Nila-Movie-Bot';
    const imagePath = path.join(process.cwd(), 'assets', 'images', 'ourin.jpg');
    const thumbPath = path.join(process.cwd(), 'assets', 'images', 'ourin2.jpg');

    const imageBuffer = fs.existsSync(imagePath) ? fs.readFileSync(imagePath) : null;
    const thumbBuffer = fs.existsSync(thumbPath) ? fs.readFileSync(thumbPath) : null;

    const messageContent = {};

    if (thumbBuffer) {
        messageContent.contextInfo = {
            mentionedJid: m.sender ? [m.sender] : [],
            externalAdReply: {
                title: botName,
                body: `v${botConfig.bot?.version || '1.2.0'} | ${botConfig.mode || 'public'}`,
                mediaType: 1,
                showAdAttribution: false,
                renderLargerThumbnail: false,
                thumbnail: thumbBuffer
            }
        };
    }

    if (imageBuffer) {
        messageContent.image = imageBuffer;
        messageContent.caption = text;
    } else {
        messageContent.text = text;
    }

    try {
        await sock.sendMessage(m.chat, messageContent, { quoted: m.raw || m.key ? { key: m.key, message: m.message } : undefined });
    } catch {
        try {
            await sock.sendMessage(m.chat, { text });
        } catch {
            if (typeof m.reply === 'function') {
                await m.reply(text);
            }
        }
    }
}

module.exports = {
    config: pluginConfig,
    handler
};
