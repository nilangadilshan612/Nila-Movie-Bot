/**
 * @file plugins/main/owner.js
 * @description Plugin untuk menampilkan informasi kontak owner
 * @author Ourin-AI Team
 * @version 1.0.1
 */

const pluginConfig = {
    name: 'owner',
    alias: ['creator', 'dev', 'developer'],
    category: 'main',
    description: 'Menampilkan kontak owner bot',
    usage: '.owner',
    example: '.owner',
    isOwner: false,
    isPremium: false,
    isGroup: false,
    isPrivate: false,
    cooldown: 10,
    limit: 0,
    isEnabled: true
};

async function handler(m, { sock, config: botConfig }) {
    const ownerNumbers = Array.isArray(botConfig.owner?.number) && botConfig.owner.number.length > 0
        ? botConfig.owner.number
        : ['94789766005'];
    const ownerName = botConfig.owner?.name || 'Nilanga';
    const botName = botConfig.bot?.name || 'Nila-Movie-Bot';

    let ownerText = `👑 *Kontak Owner Bot*\n\n`;
    ownerText += `Nama: *${ownerName}*\n`;
    ownerText += `Bot: *${botName}*\n\n`;
    ownerText += `Jika ada pertanyaan atau masalah, silakan hubungi owner!`;

    if (typeof m.reply === 'function') {
        await m.reply(ownerText);
    } else if (m.chat) {
        await sock.sendMessage(m.chat, { text: ownerText });
    }

    const quotedMsg = m.raw || (m.key && m.message ? { key: m.key, message: m.message } : undefined);

    for (const number of ownerNumbers) {
        const cleanNumber = String(number || '').replace(/[^0-9]/g, '');
        if (!cleanNumber || !m.chat) continue;

        const vcard = `BEGIN:VCARD
VERSION:3.0
FN:${ownerName} (Owner ${botName})
TEL;type=CELL;type=VOICE;waid=${cleanNumber}:+${cleanNumber}
END:VCARD`;

        await sock.sendMessage(m.chat, {
            contacts: {
                displayName: ownerName,
                contacts: [{ vcard }]
            }
        }, quotedMsg ? { quoted: quotedMsg } : {});
    }
}

module.exports = {
    config: pluginConfig,
    handler
};
