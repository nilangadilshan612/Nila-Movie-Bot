/**
 * ═══════════════════════════════════════════════════════════════════
 *                       NILA-MOVIE-BOT CONFIG
 *                          Version 1.2.0
 * ═══════════════════════════════════════════════════════════════════
 * 
 * මේ ෆයිල් එකේ බොට්ගේ සියලුම සැකසුම් (Settings) අඩංගු වේ.
 * අනිවාර්යයෙන් වෙනස් කළ යුතු තැන් [අනිවාර්යයි] ලෙස සඳහන් කර ඇත.
 * අනෙකුත් සැකසුම් සඳහා සුදුසු මූලික අගයන් (Default) දැනටමත් යොදා ඇත.
 * 
 * ═══════════════════════════════════════════════════════════════════
 */

const config = {

    // ═══════════════════════════════════════════════════════════════
    // [අනිවාර්යයි] OWNER සැකසුම්
    // ═══════════════════════════════════════════════════════════════
    // 
    // Owner number එකට බොට්ගේ සම්පූර්ණ පාලනය (Full Access) හිමි වේ.
    // ආකෘතිය (Format): '947xxxxxxxx' (මුලට '+' හෝ '0' නොමැතිව හෝ '+94...' ලෙස)
    // උදාහරණ: ['94712345678'] හෝ ['94712345678', '94787654321']
    //
    owner: {
        name: 'Nilanga',
        number: ['+94789766005']
    },

    // ═══════════════════════════════════════════════════════════════
    // [අනිවාර්යයි] බොට් MODE එක
    // ═══════════════════════════════════════════════════════════════
    //
    // 'public' = සියලු දෙනාටම බොට් භාවිත කළ හැක
    // 'self'   = බොට් account එකට (fromMe) පමණක් භාවිත කළ හැක
    //
    mode: 'public',

    // ═══════════════════════════════════════════════════════════════
    // බොට් විස්තර
    // ═══════════════════════════════════════════════════════════════
    bot: {
        name: 'Nila-Movie-Bot',
        version: '1.2.0',
        description: 'Nilanga Movie & Group Automation Bot',
        developer: 'Nilanga',
        number: null
    },

    // ═══════════════════════════════════════════════════════════════
    // COMMAND සැකසුම්
    // ═══════════════════════════════════════════════════════════════
    command: {
        // Commands පටන් ගන්නා ප්‍රධාන Prefix එක (උදා: .menu, .ping)
        prefix: '.',
        
        // භාවිත කළ හැකි වෙනත් Prefix වර්ග
        alternativePrefix: ['!', '#', '/']
    },

    // ═══════════════════════════════════════════════════════════════
    // දෛනික භාවිත සීමා (DAILY LIMITS)
    // ═══════════════════════════════════════════════════════════════
    limits: {
        // සාමාන්‍ය user කෙනෙකුට දිනකට ලැබෙන සීමාව
        default: 200,
        
        // Premium user කෙනෙකුට දිනකට ලැබෙන සීමාව
        premium: 300,
        
        // Owner සඳහා සීමාව (-1 = සීමාවක් නැත / Unlimited)
        owner: -1
    },

    // ═══════════════════════════════════════════════════════════════
    // PREMIUM සහ BANNED USERS ලැයිස්තු
    // ═══════════════════════════════════════════════════════════════
    premiumUsers: [],
    bannedUsers: [],

    // ═══════════════════════════════════════════════════════════════
    // විශේෂාංග ON / OFF සැකසුම්
    // ═══════════════════════════════════════════════════════════════
    features: {
        // Anti spam - එක දිගට commands යවන අය තාවකාලිකව නැවැත්වීම
        antiSpam: true,
        antiSpamInterval: 3000,
        
        // Anti call - එන WhatsApp calls auto reject කිරීම
        antiCall: true,
        
        // Auto read - එන messages auto seen/read ලෙස සලකුණු කිරීම
        autoRead: false,
        
        // Auto typing - reply යවන්න කලින් "typing..." පෙන්වීම
        autoTyping: true,
        
        // Log message - messages console/logs වල පෙන්වීම
        logMessage: true,
        
        // Daily limit reset - දිනපතා 00:00 ට දෛනික limit reset කිරීම
        dailyLimitReset: true
    },

    // ═══════════════════════════════════════════════════════════════
    // WELCOME සහ GOODBYE සැකසුම්
    // ═══════════════════════════════════════════════════════════════
    welcome: {
        // අලුත් groups වල default විදිහට welcome active ද
        defaultEnabled: true
    },
    
    goodbye: {
        // අලුත් groups වල default විදිහට goodbye active ද
        defaultEnabled: true
    },

    // ═══════════════════════════════════════════════════════════════
    // STICKER සැකසුම්
    // ═══════════════════════════════════════════════════════════════
    sticker: {
        packname: 'Nila-Movie-Bot',
        author: 'Nilanga'
    },

    // ═══════════════════════════════════════════════════════════════
    // බොට් පණිවිඩ (BOT MESSAGES)
    // ═══════════════════════════════════════════════════════════════
    Messages: {
        wait: '⏳ පොඩ්ඩක් රැඳී සිටින්න...',
        success: '✅ සාර්ථකයි!',
        error: '❌ දෝෂයක් සිදු වුණා!',
        ownerOnly: '🚫 මේ command එක owner ට පමණයි!',
        premiumOnly: '💎 මේ command එක premium users ලට පමණයි!',
        groupOnly: '👥 මේ command එක group වලට පමණයි!',
        privateOnly: '📱 මේ command එක private chat වලට පමණයි!',
        cooldown: '⏱️ තත්පර %time% ක් රැඳී සිටින්න!',
        limitExceeded: '📊 ඔයාගේ දෛනික limit එක අවසන්!',
        banned: '🚫 ඔයාව මේ bot එකෙන් ban කරලා තියෙන්නේ!'
    },

    // ═══════════════════════════════════════════════════════════════
    // SCHEDULER සැකසුම්
    // ═══════════════════════════════════════════════════════════════
    scheduler: {
        // Limit reset වන පැය (0-23)
        resetHour: 0,
        // Limit reset වන මිනිත්තුව (0-59)
        resetMinute: 0
    },

    // ═══════════════════════════════════════════════════════════════
    // BACKUP සැකසුම්
    // ═══════════════════════════════════════════════════════════════
    backup: {
        // ස්වයංක්‍රීය backup සක්‍රීයද
        enabled: true,
        
        // Backup වන කාල පරතරය (පැය ගණනින්)
        intervalHours: 24,
        
        // Backups තබා ගන්නා දින ගණන
        retainDays: 7
    },

    // ═══════════════════════════════════════════════════════════════
    // DATABASE සැකසුම්
    // ═══════════════════════════════════════════════════════════════
    database: {
        path: './src/database'
    },

    // ═══════════════════════════════════════════════════════════════
    // SESSION සැකසුම්
    // ═══════════════════════════════════════════════════════════════
    session: {
        path: './sessions',
        usePairingCode: true
    },

    // ═══════════════════════════════════════════════════════════════
    // CHANNEL (NEWSLETTER) සැකසුම්
    // ═══════════════════════════════════════════════════════════════
    saluran: {
        id: '',
        name: 'Nila-Movie-Bot',
        link: ''
    }
}

function isOwner(number) {
    if (!number) return false
    const cleanNumber = number.replace(/[^0-9]/g, '')
    
    if (config.bot.number) {
        const botClean = config.bot.number.replace(/[^0-9]/g, '')
        if (cleanNumber.includes(botClean) || botClean.includes(cleanNumber)) {
            return true
        }
    }
    
    return config.owner.number.some(owner => {
        const cleanOwner = owner.replace(/[^0-9]/g, '')
        return cleanNumber.includes(cleanOwner) || cleanOwner.includes(cleanNumber)
    })
}

function isPremium(number) {
    if (!number) return false
    if (isOwner(number)) return true
    
    const cleanNumber = number.replace(/[^0-9]/g, '')
    return config.premiumUsers.some(premium => {
        const cleanPremium = premium.replace(/[^0-9]/g, '')
        return cleanNumber.includes(cleanPremium) || cleanPremium.includes(cleanNumber)
    })
}

function isBanned(number) {
    if (!number) return false
    if (isOwner(number)) return false
    
    const cleanNumber = number.replace(/[^0-9]/g, '')
    return config.bannedUsers.some(banned => {
        const cleanBanned = banned.replace(/[^0-9]/g, '')
        return cleanNumber.includes(cleanBanned) || cleanBanned.includes(cleanNumber)
    })
}

function setBotNumber(number) {
    if (number) {
        config.bot.number = number.replace(/[^0-9]/g, '')
    }
}

function isSelf(number) {
    if (!number || !config.bot.number) return false
    const cleanNumber = number.replace(/[^0-9]/g, '')
    const botNumber = config.bot.number.replace(/[^0-9]/g, '')
    return cleanNumber.includes(botNumber) || botNumber.includes(cleanNumber)
}

function getConfig() {
    return config
}

module.exports = {
    ...config,
    config,
    getConfig,
    isOwner,
    isPremium,
    isBanned,
    setBotNumber,
    isSelf
}
