'use strict';

const express = require('express');
const app = express();
const http = require('http').createServer(app);
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const path = require('path');
const https = require('https');
const crypto = require('crypto');

// ─── HTTP Rate Limiting ─────────────────────────────────────────────
const httpLimiter = rateLimit({
    windowMs: 1 * 60 * 1000, // 1 minute
    max: 120,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Te veel verzoeken. Probeer het later opnieuw.' }
});
app.use(httpLimiter);

// ─── Security Headers ───────────────────────────────────────────────
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", "'unsafe-inline'"],
            styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
            fontSrc: ["'self'", "https://fonts.gstatic.com"],
            imgSrc: ["'self'", "data:", "blob:"],
            connectSrc: ["'self'", "ws:", "wss:"]
        }
    }
}));

// ─── Compression ────────────────────────────────────────────────────
app.use(compression({
    level: 6,
    threshold: 1024,
    filter: (req, res) => {
        if (req.headers['x-no-compression']) return false;
        return compression.filter(req, res);
    }
}));

// ─── Static Files with Cache ────────────────────────────────────────
app.use(express.static(path.join(__dirname, 'public'), {
    maxAge: '1h',
    etag: true
}));

// ─── Socket.IO Setup ────────────────────────────────────────────────
const io = require('socket.io')(http, {
    maxHttpBufferSize: 5 * 1024 * 1024, // 5MB max per message
    pingTimeout: 30000,
    pingInterval: 10000
});

// ─── Game State ─────────────────────────────────────────────────────
const rooms = {};

// ─── Player Statistics (persistent in-memory, keyed by session token) ──
const playerStats = {}; // token -> { name, wins, losses, gamesPlayed, questionsCreated, votescast, lastSeen }

// ─── Reconnect State (60s grace) ────────────────────────────────────
const disconnectedPlayers = {}; // token -> { roomCode, playerData, votes, timeout, disconnectedAt }

// ─── Avatar Emoji Pool ──────────────────────────────────────────────
const AVATAR_EMOJIS = [
    '😎', '🤠', '👻', '🦊', '🐱', '🐶', '🦁', '🐸', '🐨', '🐼',
    '🦄', '🐲', '🦋', '🌸', '⭐', '🔥', '💎', '🎭', '🎪', '🍄',
    '🌈', '🎮', '🎯', '🎸', '🚀', '🌙', '🍀', '🎃', '🤖', '👽',
    '🧙', '🦸', '🧛', '🧜', '🧚', '🎪', '🏆', '💀', '🎩', '🤡'
];

// ─── Would You Rather Questions ─────────────────────────────────────
const WOULD_YOU_RATHER_QUESTIONS = [
    { option1: 'Altijd de waarheid moeten zeggen', option2: 'Altijd moeten liegen' },
    { option1: 'Kunnen vliegen', option2: 'Gedachten kunnen lezen' },
    { option1: 'Nooit meer slapen', option2: 'Nooit meer eten' },
    { option1: 'In het verleden leven', option2: 'In de toekomst leven' },
    { option1: 'Onzichtbaar zijn', option2: 'Kunnen teleporteren' },
    { option1: 'Altijd 10 minuten te laat zijn', option2: 'Altijd 20 minuten te vroeg zijn' },
    { option1: 'Nooit meer internet', option2: 'Nooit meer muziek' },
    { option1: 'Eeuwig leven maar arm', option2: '10 jaar leven maar rijk' },
    { option1: 'Kunnen praten met dieren', option2: 'Alle talen spreken' },
    { option1: 'Geen armen hebben', option2: 'Geen benen hebben' },
    { option1: 'Elke dag regen', option2: 'Elke dag 40 graden' },
    { option1: 'Beroemd maar gehaat', option2: 'Onbekend maar geliefd' },
    { option1: 'In de ruimte wonen', option2: 'Op de bodem van de oceaan wonen' },
    { option1: 'Nooit meer douchen', option2: 'Nooit meer je tanden poetsen' },
    { option1: 'Altijd moeten zingen', option2: 'Altijd moeten dansen' },
    { option1: 'Superkracht maar alleen in je slaap', option2: 'Normaal maar altijd gelukkig' },
    { option1: 'Terug naar je 10e jaar met alles wat je weet', option2: '10 miljoen euro nu' },
    { option1: 'Nooit meer je telefoon gebruiken', option2: 'Nooit meer TV kijken' },
    { option1: 'Alles weten maar niets voelen', option2: 'Alles voelen maar niets weten' },
    { option1: '1 jaar gevangenis', option2: '5 jaar huisarrest' }
];

// ─── Category Question Banks ────────────────────────────────────────
const CATEGORY_QUESTIONS = {
    grappig: [
        { option1: 'Altijd per ongeluk hardop denken', option2: 'Altijd per ongeluk boeren na elke zin' },
        { option1: 'Overal een clownsneus dragen', option2: 'Overal op crocs lopen' },
        { option1: 'Alleen in rijm kunnen praten', option2: 'Alleen in vragen kunnen praten' },
        { option1: 'Elke keer dat je niest valt er confetti uit', option2: 'Elke keer dat je lacht maak je een gek geluid' },
        { option1: 'Je ondergoed over je kleren dragen', option2: 'Je kleren binnenstebuiten dragen' }
    ],
    serieus: [
        { option1: 'Weten wanneer je doodgaat', option2: 'Weten hoe je doodgaat' },
        { option1: 'Nooit meer kunnen liegen', option2: 'Nooit meer de waarheid herkennen' },
        { option1: 'Je droomleven maar alleen', option2: 'Een normaal leven maar met dierbaren' },
        { option1: 'De hele wereld redden maar niemand weet het', option2: 'Beroemd worden maar niets bereiken' },
        { option1: '1 persoon redden die je kent', option2: '100 vreemden redden' }
    ],
    dark: [
        { option1: 'Weten dat je over 1 jaar doodgaat', option2: 'Op elk moment kunnen sterven' },
        { option1: 'Opgesloten in een kamer voor 10 jaar', option2: 'Amnesia en opnieuw beginnen' },
        { option1: 'Nooit meer pijn voelen', option2: 'Nooit meer verdriet voelen' },
        { option1: 'Iedereen vergeet dat je bestaat', option2: 'Je vergeet iedereen die je kent' },
        { option1: 'Eeuwig leven terwijl iedereen sterft', option2: 'Nu sterven met iedereen die je liefhebt' }
    ],
    random: [
        { option1: 'Alleen kaas mogen eten voor een jaar', option2: 'Nooit meer kaas mogen eten' },
        { option1: 'Supermacht: eten naar je hand laten vliegen', option2: 'Supermacht: wifi overal' },
        { option1: 'In een film leven', option2: 'In een videogame leven' },
        { option1: 'Een draak als huisdier', option2: 'Een eenhoorn als huisdier' },
        { option1: 'Alleen maar fluisteren', option2: 'Alleen maar schreeuwen' }
    ]
};

// ─── Scoreboard Helpers ─────────────────────────────────────────────

/**
 * Initialize scoreboard for a room if not present.
 */
function initScoreboard(room) {
    if (!room.scoreboard) {
        room.scoreboard = {};
    }
}

/**
 * Award points to players based on vote timing and uniqueness.
 * @param {object} room
 */
function calculateScoreboardPoints(room) {
    if (!room || !room.scoreboard) return;

    const voteEntries = Object.entries(room.votes);
    if (voteEntries.length === 0) return;

    // Sort by vote time (earliest first)
    const sorted = voteEntries
        .filter(([, v]) => v.voteTime)
        .sort((a, b) => a[1].voteTime - b[1].voteTime);

    // Points for speed: fastest gets 3, second gets 2, rest gets 1
    sorted.forEach(([playerId], index) => {
        if (!room.scoreboard[playerId]) room.scoreboard[playerId] = { speed: 0, unique: 0, total: 0 };
        const speedPoints = index === 0 ? 3 : (index === 1 ? 2 : 1);
        room.scoreboard[playerId].speed += speedPoints;
        room.scoreboard[playerId].total += speedPoints;
    });

    // Uniqueness bonus: if you're the only one who picked an option, +2
    const choiceCounts = {};
    voteEntries.forEach(([, v]) => {
        if (v.choice) {
            choiceCounts[v.choice] = (choiceCounts[v.choice] || 0) + 1;
        }
    });
    voteEntries.forEach(([playerId, v]) => {
        if (v.choice && choiceCounts[v.choice] === 1) {
            if (!room.scoreboard[playerId]) room.scoreboard[playerId] = { speed: 0, unique: 0, total: 0 };
            room.scoreboard[playerId].unique += 2;
            room.scoreboard[playerId].total += 2;
        }
    });
}

/**
 * Get formatted scoreboard for emission.
 */
function getScoreboardData(room) {
    if (!room || !room.scoreboard) return [];
    return room.players.map(p => {
        const s = room.scoreboard[p.id] || { speed: 0, unique: 0, total: 0 };
        return { name: p.name, id: p.id, avatar: p.avatar || '😎', speed: s.speed, unique: s.unique, total: s.total };
    }).sort((a, b) => b.total - a.total);
}

// ─── Player Statistics Helpers ──────────────────────────────────────

/**
 * Get or create player stats by session token.
 * @param {string} token
 * @param {string} name
 * @returns {object}
 */
function getPlayerStats(token, name) {
    if (!token) return null;
    if (!playerStats[token]) {
        playerStats[token] = {
            name: name || 'Speler',
            wins: 0,
            losses: 0,
            gamesPlayed: 0,
            questionsCreated: 0,
            votesCast: 0,
            lastSeen: Date.now()
        };
    }
    if (name) playerStats[token].name = name;
    playerStats[token].lastSeen = Date.now();
    return playerStats[token];
}

/**
 * Update stats after a round finishes.
 * @param {object} room
 * @param {number} winningChoice
 */
function updatePlayerStatsAfterRound(room, winningChoice) {
    if (!room) return;
    Object.entries(room.votes).forEach(([playerId, vote]) => {
        const player = room.players.find(p => p.id === playerId);
        if (!player || !player.sessionToken) return;
        const stats = getPlayerStats(player.sessionToken, player.name);
        if (!stats) return;
        stats.votesCast++;
        if (winningChoice !== 0) {
            if (vote.choice === winningChoice) {
                stats.wins++;
            } else {
                stats.losses++;
            }
        }
    });
}

// ─── Anti-DDoS: Per-IP Connection Tracking ──────────────────────────
const ipConnections = {};
const MAX_CONNECTIONS_PER_IP = 8;

// ─── Stale Room Cleanup (every 10 minutes) ──────────────────────────
setInterval(() => {
    const now = Date.now();
    const STALE_THRESHOLD = 30 * 60 * 1000; // 30 minutes

    for (const [code, room] of Object.entries(rooms)) {
        if (!room.players || room.players.length === 0) {
            cleanupRoom(code);
            continue;
        }

        // Check if all players are idle beyond threshold
        const timestamps = room.players.map(
            p => (room.playerLastActive && room.playerLastActive[p.id]) || 0
        );
        const lastActivity = timestamps.length > 0 ? Math.max(...timestamps) : 0;

        if (lastActivity > 0 && now - lastActivity > STALE_THRESHOLD) {
            io.to(code).emit('game-ended', 'Kamer gesloten wegens inactiviteit.');
            cleanupRoom(code);
        }
    }
}, 10 * 60 * 1000);

// ─── Stale IP Cleanup (every 5 minutes) ─────────────────────────────
setInterval(() => {
    for (const [ip, count] of Object.entries(ipConnections)) {
        if (count <= 0) {
            delete ipConnections[ip];
        }
    }
}, 5 * 60 * 1000);

// ─── Stale Player Stats Cleanup (every 1 hour) ─────────────────────
setInterval(() => {
    const now = Date.now();
    const STATS_STALE_THRESHOLD = 7 * 24 * 60 * 60 * 1000; // 7 days
    for (const [token, stats] of Object.entries(playerStats)) {
        if (now - stats.lastSeen > STATS_STALE_THRESHOLD) {
            delete playerStats[token];
        }
    }
}, 60 * 60 * 1000);

/**
 * Safely remove a room and all associated resources.
 * @param {string} code - Room code to clean up
 */
function cleanupRoom(code) {
    const room = rooms[code];
    if (!room) return;

    if (room.createTimerInterval) {
        clearInterval(room.createTimerInterval);
    }
    if (room.voteTimerInterval) {
        clearInterval(room.voteTimerInterval);
    }
    io.in(code).socketsLeave(code);
    delete rooms[code];
}

// ─── Utility: Text Sanitization ─────────────────────────────────────

/**
 * Sanitize user-provided text by stripping dangerous characters.
 * @param {*} text - Raw input
 * @param {number} maxLen - Maximum allowed length
 * @returns {string} Sanitized text
 */
function sanitizeText(text, maxLen = 200) {
    if (!text || typeof text !== 'string') return '';
    return text
        .replace(/[<>]/g, '')
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#x27;')
        .trim()
        .slice(0, maxLen);
}

/**
 * Sanitize a player name to alphanumeric + limited special chars.
 * @param {*} name - Raw name input
 * @returns {string} Sanitized name (max 12 chars)
 */
function sanitizeName(name) {
    if (!name || typeof name !== 'string') return '';
    return name
        .replace(/[^a-zA-Z0-9_\-\s\u00C0-\u024F\u1E00-\u1EFF]/g, '')
        .trim()
        .slice(0, 12);
}

/**
 * Sanitize a chat message — strip HTML but allow wider character set.
 * @param {*} text - Raw chat message
 * @returns {string} Sanitized message (max 300 chars)
 */
function sanitizeChatMessage(text) {
    if (!text || typeof text !== 'string') return '';
    return text
        .replace(/[<>]/g, '')
        .trim()
        .slice(0, 300);
}

/**
 * Validate a room code format (exactly 6 digits).
 * @param {*} code - Room code to validate
 * @returns {boolean}
 */
function isValidRoomCode(code) {
    return typeof code === 'string' && /^\d{6}$/.test(code);
}

/**
 * Validate that a socket is a member of the given room.
 * @param {string} socketId
 * @param {string} roomCode
 * @returns {boolean}
 */
function isPlayerInRoom(socketId, roomCode) {
    const room = rooms[roomCode];
    if (!room) return false;
    return room.players.some(p => p.id === socketId);
}

/**
 * Validate that an emoji is from the allowed avatar pool.
 * @param {string} emoji
 * @returns {boolean}
 */
function isValidAvatar(emoji) {
    return typeof emoji === 'string' && AVATAR_EMOJIS.includes(emoji);
}

// ─── Anti-DDoS: Per-Socket Rate Limiter ─────────────────────────────

/**
 * Create a sliding-window rate limiter for a single socket.
 * @param {number} maxEvents - Max events allowed in window
 * @param {number} windowMs - Window size in milliseconds
 * @returns {function(): boolean} Returns true if within limit
 */
function createRateLimiter(maxEvents = 25, windowMs = 1000) {
    const events = [];
    return function check() {
        const now = Date.now();
        while (events.length > 0 && events[0] < now - windowMs) {
            events.shift();
        }
        if (events.length >= maxEvents) {
            return false;
        }
        events.push(now);
        return true;
    };
}

// ─── Room Code Generator ────────────────────────────────────────────

/**
 * Generate a unique 6-digit room code using crypto-safe randomness.
 * @returns {string} 6-digit room code
 */
function generateRoomCode() {
    const MAX_ATTEMPTS = 100;
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
        const bytes = crypto.randomBytes(4);
        const num = bytes.readUInt32BE(0) % 1000000;
        const code = String(num).padStart(6, '0');
        if (!rooms[code]) return code;
    }
    return String(Date.now() % 1000000).padStart(6, '0');
}

// ─── AI Filter: Keyword-Based Fallback ──────────────────────────────
const SWEAR_WORDS = [
    'kut', 'klote', 'tyfus', 'kanker', 'fuck', 'shit',
    'damn', 'hell', 'godver', 'verdomme'
];

/**
 * Replace known swear words with asterisks.
 * @param {string} text
 * @returns {string} Filtered text
 */
function keywordFilter(text) {
    let filtered = text;
    SWEAR_WORDS.forEach(word => {
        const pattern = new RegExp(`\\b${word}\\b`, 'gi');
        filtered = filtered.replace(pattern, '***');
    });
    return filtered;
}

/**
 * Quick check if text contains any known swear words.
 * @param {string} text
 * @returns {boolean}
 */
function hasSwearWords(text) {
    const lower = text.toLowerCase();
    return SWEAR_WORDS.some(word => lower.includes(word));
}

/**
 * Check text against AI moderation API, falling back to keyword filter.
 * @param {string} text - Text to check
 * @param {string} apiKey - LLM API key
 * @returns {Promise<{isClean: boolean, filteredText: string}>}
 */
async function checkWithAI(text, apiKey) {
    if (!text || !text.trim()) {
        return { isClean: true, filteredText: text };
    }

    if (!hasSwearWords(text)) {
        return { isClean: true, filteredText: text };
    }

    if (!apiKey) {
        return { isClean: false, filteredText: keywordFilter(text) };
    }

    return new Promise((resolve) => {
        const data = JSON.stringify({
            model: 'default',
            messages: [{
                role: 'user',
                content: `Check if this text contains swear words or offensive language in Dutch or English. Return only JSON: {"isClean": true/false, "filteredText": "cleaned version with swear words replaced by ***"}. Text: "${text}"`
            }],
            temperature: 0.1
        });

        const options = {
            hostname: 'api.llm7.io',
            port: 443,
            path: '/v1/chat/completions',
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`,
                'Content-Length': Buffer.byteLength(data)
            }
        };

        const req = https.request(options, (res) => {
            let responseData = '';
            res.on('data', (chunk) => { responseData += chunk; });
            res.on('end', () => {
                try {
                    const result = JSON.parse(responseData);
                    const aiResponse = result.choices?.[0]?.message?.content || '';
                    let parsedResult;
                    try {
                        parsedResult = JSON.parse(aiResponse);
                    } catch {
                        parsedResult = {
                            isClean: aiResponse.toLowerCase().includes('clean') ||
                                     aiResponse.toLowerCase().includes('geen'),
                            filteredText: text
                        };
                    }
                    if (parsedResult.isClean) {
                        resolve({ isClean: true, filteredText: text });
                    } else if (parsedResult.filteredText) {
                        resolve({ isClean: false, filteredText: parsedResult.filteredText });
                    } else {
                        resolve({ isClean: false, filteredText: keywordFilter(text) });
                    }
                } catch {
                    resolve({ isClean: false, filteredText: keywordFilter(text) });
                }
            });
        });

        req.on('error', () => {
            resolve({ isClean: false, filteredText: keywordFilter(text) });
        });
        req.setTimeout(3000, () => {
            req.destroy();
            resolve({ isClean: false, filteredText: keywordFilter(text) });
        });

        req.write(data);
        req.end();
    });
}

// ─── Round Finishing Logic ───────────────────────────────────────────

/**
 * Tally votes, broadcast results, and schedule the next round.
 * @param {string} roomCode
 */
function finishRound(roomCode) {
    const room = rooms[roomCode];
    if (!room || !room.dilemma) return;

    stopVoteTimer(roomCode);

    const votesByOption = { 1: [], 2: [] };
    const answers = [];
    const votePersonResults = {};

    Object.entries(room.votes).forEach(([playerId, vote]) => {
        const player = room.players.find(p => p.id === playerId);
        if (!player) return;

        if (room.dilemma.type === 'vote-person') {
            if (vote.selectedPersonId) {
                if (!votePersonResults[vote.selectedPersonId]) {
                    votePersonResults[vote.selectedPersonId] = [];
                }
                votePersonResults[vote.selectedPersonId].push(player.name);
            }
        } else {
            if (vote.choice === 1 || vote.choice === 2) {
                votesByOption[vote.choice].push(player.name);
            }
            if (vote.answer) {
                answers.push({ name: player.name, text: vote.answer, choice: vote.choice });
            }
        }
    });

    const votes1Count = votesByOption[1].length;
    const votes2Count = votesByOption[2].length;
    const winningChoice = votes1Count === votes2Count ? 0 : (votes1Count > votes2Count ? 1 : 2);

    // Track game history
    const totalVoters = votes1Count + votes2Count;
    const controversyScore = totalVoters > 0
        ? 1 - Math.abs(votes1Count - votes2Count) / totalVoters
        : 0;
    room.gameHistory.push({
        round: room.round,
        dilemma: { ...room.dilemma },
        votesByOption: { 1: [...votesByOption[1]], 2: [...votesByOption[2]] },
        votePersonResults: room.dilemma.type === 'vote-person' ? { ...votePersonResults } : null,
        winningChoice,
        answers: answers.map(a => ({ ...a })),
        controversyScore
    });

    // Calculate scoreboard points
    if (room.settings.scoreboardEnabled) {
        initScoreboard(room);
        calculateScoreboardPoints(room);
    }

    // Update player stats
    updatePlayerStatsAfterRound(room, winningChoice);

    // Track question creator stats
    const creatorId = room.players[room.turnIndex]?.id;
    if (creatorId) {
        const creator = room.players.find(p => p.id === creatorId);
        if (creator && creator.sessionToken) {
            const stats = getPlayerStats(creator.sessionToken, creator.name);
            if (stats) stats.questionsCreated++;
        }
    }

    // Calculate result display delay based on type
    let delay;
    if (room.dilemma.type === 'question') {
        delay = answers.length * 10000 + 2000;
    } else {
        delay = 6000 + (room.players.length * 2000);
    }

    io.to(roomCode).emit('vote-result', {
        winningChoice,
        votesByOption,
        dilemma: room.dilemma,
        answers,
        votePersonResults: room.dilemma.type === 'vote-person' ? votePersonResults : null,
        delay,
        scoreboard: room.settings.scoreboardEnabled ? getScoreboardData(room) : null
    });

    // Reset round state
    room.votes = {};
    room.dilemma = null;
    room.totalRoundsCompleted++;

    const currentPlayerId = room.players[room.turnIndex]?.id;
    if (currentPlayerId) {
        if (!room.playerRoundsCompleted[currentPlayerId]) {
            room.playerRoundsCompleted[currentPlayerId] = 0;
        }
        room.playerRoundsCompleted[currentPlayerId]++;
    }

    room.round++;

    // Determine next player index
    let nextPlayerIndex;
    if (room.settings.randomTurnOrder && room.players.length > 1) {
        const availableIndices = room.players
            .map((_, idx) => idx)
            .filter(idx => idx !== room.turnIndex);
        nextPlayerIndex = availableIndices.length > 0
            ? availableIndices[Math.floor(Math.random() * availableIndices.length)]
            : (room.turnIndex + 1) % room.players.length;
    } else {
        nextPlayerIndex = (room.turnIndex + 1) % room.players.length;
    }

    // Check if this is a rare round
    if (room.settings.rareRoundEnabled &&
        room.players.length >= 3 &&
        room.totalRoundsCompleted > 0 &&
        room.totalRoundsCompleted % room.settings.rareRoundFrequency === 0) {
        room.isRareRound = true;
    } else {
        room.isRareRound = false;
        room.rareRoundQuestion = null;
        room.rareRoundCreatorId = null;
    }

    room.lastTurnIndex = room.turnIndex;
    room.turnIndex = nextPlayerIndex;

    // Schedule next round emission after result display
    setTimeout(() => {
        if (!rooms[roomCode]) return;
        const r = rooms[roomCode];
        if (!r.players.length) return;

        io.to(roomCode).emit('new-round', {
            turnId: r.players[r.turnIndex]?.id,
            round: r.round,
            settings: r.settings,
            isRareRound: r.isRareRound || false,
            rareRoundQuestion: r.rareRoundQuestion || null,
            randomTurnOrder: r.settings.randomTurnOrder || false
        });
    }, delay);
}

// ─── Vote Status Broadcaster ────────────────────────────────────────

/**
 * Send current vote status (who has voted) to all room members.
 * @param {string} roomCode
 */
function broadcastVoteStatus(roomCode) {
    const room = rooms[roomCode];
    if (!room || !room.dilemma) return;

    const creatorId = room.players[room.turnIndex]?.id;
    if (!creatorId) return;

    const status = room.players.map(p => {
        if (room.dilemma.type === 'vote-person') {
            return { name: p.name, avatar: p.avatar || '😎', voted: !!room.votes[p.id] };
        }
        if (p.id === creatorId) return null;
        return { name: p.name, avatar: p.avatar || '😎', voted: !!room.votes[p.id] };
    }).filter(Boolean);

    io.to(roomCode).emit('update-vote-status', status);
}

// ─── Timer Helpers ──────────────────────────────────────────────────

/**
 * Start the creation timer for the current turn's player.
 * @param {string} roomCode
 */
function startCreateTimer(roomCode) {
    const room = rooms[roomCode];
    if (!room || room.createTimerInterval) return;

    const timerMinutes = room.settings.createTimerMinutes;
    if (!timerMinutes || timerMinutes === 0) return;

    let remainingSeconds = timerMinutes * 60;
    room.createTimerStartTime = Date.now();
    room.createTimerRemaining = remainingSeconds;

    io.to(roomCode).emit('create-timer-update', {
        remainingSeconds,
        totalSeconds: remainingSeconds
    });

    room.createTimerInterval = setInterval(() => {
        remainingSeconds--;
        room.createTimerRemaining = remainingSeconds;

        io.to(roomCode).emit('create-timer-update', {
            remainingSeconds,
            totalSeconds: timerMinutes * 60
        });

        if (remainingSeconds <= 0) {
            clearInterval(room.createTimerInterval);
            room.createTimerInterval = null;
            handleTimerExpired(roomCode);
        }
    }, 1000);
}

/**
 * Stop any running creation timer for a room.
 * @param {string} roomCode
 */
function stopCreateTimer(roomCode) {
    const room = rooms[roomCode];
    if (room && room.createTimerInterval) {
        clearInterval(room.createTimerInterval);
        room.createTimerInterval = null;
        room.createTimerRemaining = null;
        io.to(roomCode).emit('create-timer-stopped');
    }
}

/**
 * Handle timer expiry — notify creator, then skip round if nothing submitted.
 * @param {string} roomCode
 */
function handleTimerExpired(roomCode) {
    const room = rooms[roomCode];
    if (!room) return;

    const creatorId = room.players[room.turnIndex]?.id;
    if (creatorId) {
        io.to(creatorId).emit('timer-expired-check', {
            message: 'Timer verlopen! Controleer of je kunt verzenden...'
        });
    }

    io.to(roomCode).emit('timer-expired', { message: 'De tijd is op!' });

    setTimeout(() => {
        const currentRoom = rooms[roomCode];
        if (!currentRoom || currentRoom.dilemma || currentRoom.createTimerRemaining !== 0) return;

        currentRoom.votes = {};
        currentRoom.round++;

        if (currentRoom.players.length > 0) {
            currentRoom.turnIndex = (currentRoom.turnIndex + 1) % currentRoom.players.length;
        }

        io.to(roomCode).emit('round-skipped', {
            message: 'Ronde overgeslagen - niet genoeg ingevuld. Volgende speler!'
        });

        setTimeout(() => {
            if (!rooms[roomCode]) return;
            const r = rooms[roomCode];
            if (r.players.length > 0) {
                io.to(roomCode).emit('new-round', {
                    turnId: r.players[r.turnIndex]?.id,
                    round: r.round,
                    settings: r.settings,
                    isRareRound: r.isRareRound || false,
                    rareRoundQuestion: r.rareRoundQuestion || null,
                    randomTurnOrder: r.settings.randomTurnOrder || false
                });
            }
        }, 2000);
    }, 2000);
}

// ─── Vote Timer (Timed Mode) ────────────────────────────────────────

/**
 * Start a countdown timer for voters.
 * @param {string} roomCode
 */
function startVoteTimer(roomCode) {
    const room = rooms[roomCode];
    if (!room || !room.settings.timedModeEnabled || !room.settings.timedModeSeconds) return;
    stopVoteTimer(roomCode);

    let remaining = room.settings.timedModeSeconds;
    room.voteTimerRemaining = remaining;

    io.to(roomCode).emit('vote-timer-update', {
        remainingSeconds: remaining,
        totalSeconds: room.settings.timedModeSeconds
    });

    room.voteTimerInterval = setInterval(() => {
        remaining--;
        room.voteTimerRemaining = remaining;

        io.to(roomCode).emit('vote-timer-update', {
            remainingSeconds: remaining,
            totalSeconds: room.settings.timedModeSeconds
        });

        if (remaining <= 0) {
            stopVoteTimer(roomCode);
            handleVoteTimerExpired(roomCode);
        }
    }, 1000);
}

/**
 * Stop the vote timer.
 */
function stopVoteTimer(roomCode) {
    const room = rooms[roomCode];
    if (room && room.voteTimerInterval) {
        clearInterval(room.voteTimerInterval);
        room.voteTimerInterval = null;
        room.voteTimerRemaining = null;
        io.to(roomCode).emit('vote-timer-stopped');
    }
}

/**
 * When vote timer expires, assign random votes to players who haven't voted.
 */
function handleVoteTimerExpired(roomCode) {
    const room = rooms[roomCode];
    if (!room || !room.dilemma) return;

    const creatorId = room.players[room.turnIndex]?.id;

    room.players.forEach(p => {
        if (room.votes[p.id]) return;

        if (room.dilemma.type === 'vote-person') {
            const others = room.players.filter(o => o.id !== p.id);
            if (others.length > 0) {
                const target = others[Math.floor(Math.random() * others.length)];
                room.votes[p.id] = {
                    choice: 1,
                    answer: null,
                    selectedPersonId: target.id,
                    voteTime: Date.now(),
                    wasRandom: true
                };
            }
        } else {
            if (p.id === creatorId) return;
            const randomChoice = Math.random() < 0.5 ? 1 : 2;
            room.votes[p.id] = {
                choice: randomChoice,
                answer: null,
                selectedPersonId: null,
                voteTime: Date.now(),
                wasRandom: true
            };
        }
    });

    io.to(roomCode).emit('vote-timer-expired', { message: 'Tijd is op! Random stemmen toegewezen.' });

    const votersCount = room.dilemma.type === 'vote-person'
        ? room.players.length
        : Math.max(0, room.players.length - 1);

    if (Object.keys(room.votes).length >= votersCount) {
        finishRound(roomCode);
    }
}

// ─── Tournament Mode Logic ──────────────────────────────────────────

/**
 * Initialize a tournament bracket for a room.
 */
function initTournament(roomCode) {
    const room = rooms[roomCode];
    if (!room) return;

    const allQuestions = [];
    const categories = room.settings.selectedCategories.length > 0
        ? room.settings.selectedCategories
        : ['grappig', 'serieus', 'dark', 'random'];

    categories.forEach(cat => {
        if (CATEGORY_QUESTIONS[cat]) {
            CATEGORY_QUESTIONS[cat].forEach(q => allQuestions.push({ ...q, category: cat }));
        }
    });

    WOULD_YOU_RATHER_QUESTIONS.forEach(q => allQuestions.push({ ...q, category: 'wyr' }));

    const shuffled = allQuestions.sort(() => Math.random() - 0.5);
    const bracketSize = shuffled.length >= 8 ? 8 : Math.min(4, shuffled.length);
    const picked = shuffled.slice(0, bracketSize);

    room.tournament = {
        bracket: picked,
        currentMatchIndex: 0,
        results: [],
        phase: bracketSize === 8 ? 'quarter' : 'semi',
        winners: []
    };

    return room.tournament;
}

/**
 * Get the current tournament match.
 */
function getCurrentTournamentMatch(room) {
    if (!room || !room.tournament) return null;
    const t = room.tournament;
    const idx = t.currentMatchIndex;

    if (t.phase === 'quarter') {
        if (idx < 4) return { match: t.bracket[idx * 2], match2: t.bracket[idx * 2 + 1], index: idx };
    } else if (t.phase === 'semi') {
        if (idx < 2) return { match: t.winners[idx * 2] || t.bracket[idx * 2], match2: t.winners[idx * 2 + 1] || t.bracket[idx * 2 + 1], index: idx };
    } else if (t.phase === 'final') {
        if (idx === 0 && t.winners.length >= 2) {
            const lastTwo = t.winners.slice(-2);
            return { match: lastTwo[0], match2: lastTwo[1], index: 0 };
        }
    }
    return null;
}

/**
 * Advance tournament to the next match/phase.
 */
function advanceTournament(room, winningOption) {
    if (!room || !room.tournament) return null;
    const t = room.tournament;

    t.winners.push(winningOption);
    t.currentMatchIndex++;

    const matchesPerPhase = t.phase === 'quarter' ? 4 : (t.phase === 'semi' ? 2 : 1);

    if (t.currentMatchIndex >= matchesPerPhase) {
        t.currentMatchIndex = 0;
        if (t.phase === 'quarter') {
            t.phase = 'semi';
        } else if (t.phase === 'semi') {
            t.phase = 'final';
        } else {
            t.phase = 'done';
            return { done: true, champion: winningOption };
        }
    }

    return { done: false, phase: t.phase, matchIndex: t.currentMatchIndex };
}

// ─── Room Browser: Get Public Rooms ─────────────────────────────────

/**
 * Get list of rooms visible in the lobby browser.
 * Only rooms that are not started, not full, and have isPublic=true.
 * @returns {Array}
 */
function getPublicRooms() {
    const result = [];
    for (const [code, room] of Object.entries(rooms)) {
        if (!room.started && room.settings.isPublic && room.players.length < room.settings.maxPlayers) {
            result.push({
                code,
                hostName: room.players[0]?.name || 'Onbekend',
                hostAvatar: room.players[0]?.avatar || '😎',
                playerCount: room.players.length,
                maxPlayers: room.settings.maxPlayers,
                modes: room.settings.allowedModes,
                hasTimer: !!room.settings.createTimerMinutes,
                hasTournament: !!room.settings.tournamentEnabled,
                hasScoreboard: !!room.settings.scoreboardEnabled,
                createdAt: room.createdAt || Date.now()
            });
        }
    }
    // Sort by most recent first
    result.sort((a, b) => b.createdAt - a.createdAt);
    return result.slice(0, 20); // Max 20 rooms in browser
}

// ─── Disconnect Handler & Session Persistence ───────────────────────
const disconnections = {}; // token -> { roomCode, timeout }

/**
 * Handle a player disconnecting — either voluntary or accidental.
 * @param {object} socket
 * @param {string} roomCode
 * @param {boolean} isVoluntary - true if player chose to leave
 */
function handleDisconnect(socket, roomCode, isVoluntary = false) {
    const room = rooms[roomCode];
    if (!room) return;

    const playerIndex = room.players.findIndex(p => p.id === socket.id);
    if (playerIndex === -1) return;

    const token = socket.handshake?.auth?.token;
    const player = room.players[playerIndex];

    if (!isVoluntary && token && typeof token === 'string' && token.length < 100) {
        if (disconnections[token]) clearTimeout(disconnections[token].timeout);

        disconnectedPlayers[token] = {
            roomCode,
            playerData: { ...player },
            votes: room.votes[socket.id] ? { ...room.votes[socket.id] } : null,
            disconnectedAt: Date.now()
        };

        io.to(roomCode).emit('player-disconnected', {
            name: player.name,
            avatar: player.avatar || '😎',
            timeout: 60
        });

        disconnections[token] = {
            roomCode,
            token,
            timeout: setTimeout(() => {
                if (rooms[roomCode]) {
                    const idx = rooms[roomCode].players.findIndex(p => p.sessionToken === token);
                    if (idx !== -1) {
                        removePlayerFully(roomCode, idx);
                    }
                }
                delete disconnections[token];
                delete disconnectedPlayers[token];
            }, 60000)
        };
        return;
    }

    removePlayerFully(roomCode, playerIndex);
}

/**
 * Fully remove a player from a room and handle game state consequences.
 * @param {string} roomCode
 * @param {number} playerIndex - Index in room.players array
 */
function removePlayerFully(roomCode, playerIndex) {
    const room = rooms[roomCode];
    if (!room) return;
    if (playerIndex < 0 || playerIndex >= room.players.length) return;

    const player = room.players[playerIndex];
    const socketId = player.id;
    const wasCreator = (playerIndex === room.turnIndex);
    const leavingPlayerName = player.name;

    delete room.votes[socketId];
    if (room.playerLastActive) delete room.playerLastActive[socketId];

    room.players.splice(playerIndex, 1);

    const socket = io.sockets.sockets.get(socketId);
    if (socket) socket.leave(roomCode);

    io.to(roomCode).emit('player-left', {
        name: leavingPlayerName,
        remaining: room.players
    });

    // Broadcast chat system message about player leaving
    io.to(roomCode).emit('chat-message', {
        type: 'system',
        message: leavingPlayerName + ' heeft het spel verlaten',
        timestamp: Date.now()
    });

    if (room.players.length < 2 && room.settings.maxPlayers > 1) {
        io.to(roomCode).emit('game-ended', 'Te weinig spelers over.');
        cleanupRoom(roomCode);
    } else if (room.players.length === 0) {
        cleanupRoom(roomCode);
    } else {
        if (wasCreator) {
            room.turnIndex = room.turnIndex % room.players.length;
            room.dilemma = null;
            room.votes = {};
            stopCreateTimer(roomCode);
            if (room.started) {
                io.to(roomCode).emit('new-round', {
                    turnId: room.players[room.turnIndex]?.id,
                    round: room.round,
                    settings: room.settings,
                    isRareRound: room.isRareRound || false,
                    rareRoundQuestion: room.rareRoundQuestion || null,
                    randomTurnOrder: room.settings.randomTurnOrder || false
                });
            }
        } else {
            if (playerIndex < room.turnIndex) room.turnIndex--;

            if (room.dilemma) {
                const votersCount = room.dilemma.type === 'vote-person'
                    ? room.players.length
                    : Math.max(0, room.players.length - 1);
                const currentVotes = Object.keys(room.votes).length;
                if (currentVotes >= votersCount) {
                    finishRound(roomCode);
                } else {
                    broadcastVoteStatus(roomCode);
                }
            }
        }
        io.to(roomCode).emit('player-update', room.players);
    }
}

// ─── Socket Connection Handler ──────────────────────────────────────
io.on('connection', (socket) => {
    const token = socket.handshake?.auth?.token;
    const ip = socket.handshake.headers['x-forwarded-for']?.split(',')[0]?.trim()
        || socket.handshake.address;

    // ── Session Recovery ─────────────────────────────────────────────
    if (token && typeof token === 'string' && token.length < 100 && disconnections[token]) {
        const { roomCode, timeout } = disconnections[token];
        const room = rooms[roomCode];

        if (room) {
            const player = room.players.find(p => p.sessionToken === token);

            if (player) {
                clearTimeout(timeout);
                delete disconnections[token];

                const oldId = player.id;
                player.id = socket.id;
                player.sessionToken = token;

                const savedState = disconnectedPlayers[token];
                if (room.votes[oldId]) {
                    room.votes[socket.id] = room.votes[oldId];
                    delete room.votes[oldId];
                } else if (savedState?.votes) {
                    room.votes[socket.id] = savedState.votes;
                }
                delete disconnectedPlayers[token];

                socket.join(roomCode);
                socket.emit('join-success', {
                    code: roomCode,
                    players: room.players,
                    settings: room.settings
                });

                io.to(roomCode).emit('player-reconnected', {
                    name: player.name,
                    avatar: player.avatar || '😎'
                });

                // Broadcast chat system message
                io.to(roomCode).emit('chat-message', {
                    type: 'system',
                    message: player.name + ' is teruggekomen',
                    timestamp: Date.now()
                });

                if (room.started) {
                    socket.emit('game-start', {
                        turnId: room.players[room.turnIndex]?.id,
                        round: room.round,
                        players: room.players,
                        settings: room.settings
                    });

                    if (room.dilemma && room.players[room.turnIndex]?.id !== socket.id) {
                        socket.emit('dilemma-received', {
                            ...room.dilemma,
                            creatorName: room.players[room.turnIndex]?.name
                        });
                        if (!room.votes[socket.id]) {
                            socket.emit('waiting-for-vote');
                        }
                    }
                }

                // Send chat history
                if (room.chatHistory && room.chatHistory.length > 0) {
                    socket.emit('chat-history', room.chatHistory.slice(-50));
                }

                ipConnections[ip] = (ipConnections[ip] || 0) + 1;
                return;
            }
        }
        clearTimeout(disconnections[token]?.timeout);
        delete disconnections[token];
        delete disconnectedPlayers[token];
    }

    // ── Per-IP Connection Limit ──────────────────────────────────────
    if (!ipConnections[ip]) ipConnections[ip] = 0;
    ipConnections[ip]++;

    if (ipConnections[ip] > MAX_CONNECTIONS_PER_IP) {
        socket.emit('error', 'Te veel verbindingen vanaf dit IP.');
        socket.disconnect(true);
        ipConnections[ip]--;
        return;
    }

    // ── Per-Socket Rate Limiter ──────────────────────────────────────
    const rateLimiter = createRateLimiter(25, 1000);
    const chatRateLimiter = createRateLimiter(5, 3000); // Chat: 5 messages per 3 seconds

    function checkRate() {
        if (!rateLimiter()) {
            console.warn(`Rate limit exceeded: ${socket.id} (${ip})`);
            socket.emit('error', 'Te snel! Wacht even.');
            return false;
        }
        return true;
    }

    // ── Create Room ──────────────────────────────────────────────────
    socket.on('create-room', ({
        playerName, maxPlayers, allowedModes, createTimerMinutes,
        rareRoundEnabled, rareRoundFrequency, randomTurnOrder,
        aiFilterEnabled, aiApiKey,
        timedModeEnabled, timedModeSeconds,
        tournamentEnabled,
        scoreboardEnabled,
        selectedCategories,
        isPublic,
        avatar
    }) => {
        if (!checkRate()) return;

        const name = sanitizeName(playerName);
        if (!name || name.length > 12) return;

        const playerAvatar = isValidAvatar(avatar) ? avatar : AVATAR_EMOJIS[Math.floor(Math.random() * AVATAR_EMOJIS.length)];

        const clampedMaxPlayers = Math.min(Math.max(parseInt(maxPlayers) || 2, 2), 8);
        const validModes = ['dilemma', 'question', 'photo', 'vote-person', 'would-you-rather'];
        const clampedModes = Array.isArray(allowedModes)
            ? allowedModes.filter(m => validModes.includes(m))
            : ['dilemma', 'question'];
        if (clampedModes.length === 0) clampedModes.push('dilemma');

        const clampedTimerMinutes = createTimerMinutes
            ? Math.min(Math.max(parseInt(createTimerMinutes) || 0, 0), 10)
            : null;

        const clampedTimedSeconds = timedModeEnabled
            ? Math.min(Math.max(parseInt(timedModeSeconds) || 15, 5), 60)
            : null;

        const validCategories = ['grappig', 'serieus', 'dark', 'random'];
        const clampedCategories = Array.isArray(selectedCategories)
            ? selectedCategories.filter(c => validCategories.includes(c))
            : [];

        const roomCode = generateRoomCode();

        // Initialize player stats
        const sessionToken = socket.handshake?.auth?.token || null;
        if (sessionToken) {
            const stats = getPlayerStats(sessionToken, name);
            if (stats) stats.gamesPlayed++;
        }

        rooms[roomCode] = {
            players: [{
                id: socket.id,
                name,
                sessionToken,
                avatar: playerAvatar
            }],
            settings: {
                maxPlayers: clampedMaxPlayers,
                allowedModes: clampedModes,
                createTimerMinutes: clampedTimerMinutes,
                maxRounds: null,
                rareRoundEnabled: !!rareRoundEnabled,
                rareRoundFrequency: Math.min(Math.max(parseInt(rareRoundFrequency) || 5, 3), 20),
                randomTurnOrder: !!randomTurnOrder,
                aiFilterEnabled: !!aiFilterEnabled,
                aiApiKey: (aiFilterEnabled && typeof aiApiKey === 'string') ? aiApiKey.slice(0, 200) : null,
                timedModeEnabled: !!timedModeEnabled,
                timedModeSeconds: clampedTimedSeconds,
                tournamentEnabled: !!tournamentEnabled,
                scoreboardEnabled: !!scoreboardEnabled,
                selectedCategories: clampedCategories,
                isPublic: !!isPublic
            },
            started: false,
            turnIndex: 0,
            lastTurnIndex: -1,
            dilemma: null,
            round: 1,
            votes: {},
            playerLastActive: { [socket.id]: Date.now() },
            totalRoundsCompleted: 0,
            playerRoundsCompleted: {},
            isRareRound: false,
            rareRoundQuestion: null,
            rareRoundCreatorId: null,
            createTimerInterval: null,
            createTimerRemaining: null,
            scoreboard: {},
            voteTimerInterval: null,
            voteTimerRemaining: null,
            tournament: null,
            usedWyrIndices: [],
            usedCategoryIndices: {},
            spectators: [],
            gameHistory: [],
            chatHistory: [],
            createdAt: Date.now()
        };

        socket.join(roomCode);
        socket.emit('room-created', {
            code: roomCode,
            players: rooms[roomCode].players,
            settings: rooms[roomCode].settings
        });
    });

    // ── Browse Rooms (Lobby Browser) ─────────────────────────────────
    socket.on('browse-rooms', () => {
        if (!checkRate()) return;
        socket.emit('room-list', getPublicRooms());
    });

    // ── Join Room ────────────────────────────────────────────────────
    socket.on('join-room', ({ roomCode, playerName, avatar }) => {
        if (!checkRate()) return;

        const name = sanitizeName(playerName);
        if (!name) return socket.emit('error', 'Ongeldige naam.');

        if (!isValidRoomCode(roomCode)) {
            return socket.emit('error', 'Ongeldige kamercode.');
        }

        const room = rooms[roomCode];
        if (!room) return socket.emit('error', 'Kamer bestaat niet.');

        const playerAvatar = isValidAvatar(avatar) ? avatar : AVATAR_EMOJIS[Math.floor(Math.random() * AVATAR_EMOJIS.length)];

        // If game already started or room is full, join as spectator
        if (room.started || room.players.length >= room.settings.maxPlayers) {
            if (!room.spectators) room.spectators = [];
            if (room.spectators.some(s => s.name.toLowerCase() === name.toLowerCase()) ||
                room.players.some(p => p.name.toLowerCase() === name.toLowerCase())) {
                return socket.emit('error', 'Naam is al in gebruik in deze kamer!');
            }

            room.spectators.push({ id: socket.id, name, avatar: playerAvatar });
            socket.join(roomCode);
            socket.emit('spectator-joined', {
                code: roomCode,
                players: room.players,
                spectatorCount: room.spectators.length,
                settings: room.settings
            });

            if (room.started) {
                socket.emit('game-start', {
                    turnId: room.players[room.turnIndex]?.id,
                    round: room.round,
                    players: room.players,
                    settings: room.settings,
                    isSpectator: true
                });
                if (room.dilemma) {
                    socket.emit('dilemma-received', {
                        ...room.dilemma,
                        creatorName: room.players[room.turnIndex]?.name,
                        isSpectator: true
                    });
                }
            }

            // Send chat history to spectator
            if (room.chatHistory && room.chatHistory.length > 0) {
                socket.emit('chat-history', room.chatHistory.slice(-50));
            }

            io.to(roomCode).emit('spectator-count', room.spectators.length);
            return;
        }

        if (room.players.some(p => p.name.toLowerCase() === name.toLowerCase())) {
            return socket.emit('error', 'Naam is al in gebruik in deze kamer!');
        }

        const sessionToken = socket.handshake?.auth?.token || null;
        if (sessionToken) {
            const stats = getPlayerStats(sessionToken, name);
            if (stats) stats.gamesPlayed++;
        }

        room.players.push({
            id: socket.id,
            name,
            sessionToken,
            avatar: playerAvatar
        });
        room.playerLastActive[socket.id] = Date.now();

        socket.join(roomCode);
        socket.emit('join-success', {
            code: roomCode,
            players: room.players,
            settings: room.settings
        });
        io.to(roomCode).emit('player-update', room.players);

        // Broadcast chat system message about player joining
        io.to(roomCode).emit('chat-message', {
            type: 'system',
            message: name + ' is de kamer binnengekomen',
            timestamp: Date.now()
        });

        // Send chat history to new player
        if (room.chatHistory && room.chatHistory.length > 0) {
            socket.emit('chat-history', room.chatHistory.slice(-50));
        }

        if (room.players.length === room.settings.maxPlayers) {
            startGame(roomCode);
        }
    });

    // ── Start Game Request ───────────────────────────────────────────
    socket.on('start-game-request', (roomCode) => {
        if (!checkRate()) return;
        if (!isValidRoomCode(roomCode)) return;

        const room = rooms[roomCode];
        if (!room) return;

        if (room.players[0]?.id !== socket.id) return;

        if (room.players.length >= 2) {
            startGame(roomCode);
        } else {
            socket.emit('error', 'Er zijn minimaal 2 spelers nodig!');
        }
    });

    /**
     * Start the game for a room.
     * @param {string} roomCode
     */
    function startGame(roomCode) {
        const room = rooms[roomCode];
        if (!room || room.started) return;

        room.started = true;
        room.createTimerInterval = null;

        io.to(roomCode).emit('game-start', {
            turnId: room.players[room.turnIndex]?.id,
            round: room.round,
            players: room.players,
            settings: room.settings
        });
    }

    // ── Chat Message ─────────────────────────────────────────────────
    socket.on('chat-message', ({ roomCode, message }) => {
        if (!checkRate()) return;
        if (!chatRateLimiter()) {
            socket.emit('error', 'Te snel! Wacht even met chatten.');
            return;
        }
        if (!isValidRoomCode(roomCode)) return;

        const room = rooms[roomCode];
        if (!room) return;

        // Allow both players and spectators to chat
        const player = room.players.find(p => p.id === socket.id);
        const spectator = !player && room.spectators ? room.spectators.find(s => s.id === socket.id) : null;
        if (!player && !spectator) return;

        const cleanMessage = sanitizeChatMessage(message);
        if (!cleanMessage) return;

        // Apply swear word filter if AI filter is enabled
        let finalMessage = cleanMessage;
        if (room.settings.aiFilterEnabled) {
            finalMessage = keywordFilter(cleanMessage);
        }

        const chatEntry = {
            type: 'player',
            name: player ? player.name : spectator.name,
            avatar: player ? (player.avatar || '😎') : (spectator.avatar || '😎'),
            message: finalMessage,
            isSpectator: !!spectator,
            timestamp: Date.now()
        };

        // Store in chat history (max 100 messages)
        if (!room.chatHistory) room.chatHistory = [];
        room.chatHistory.push(chatEntry);
        if (room.chatHistory.length > 100) {
            room.chatHistory = room.chatHistory.slice(-100);
        }

        // Broadcast to everyone in the room
        io.to(roomCode).emit('chat-message', chatEntry);
    });

    // ── Update Avatar ────────────────────────────────────────────────
    socket.on('update-avatar', ({ roomCode, avatar }) => {
        if (!checkRate()) return;
        if (!isValidRoomCode(roomCode)) return;
        if (!isValidAvatar(avatar)) return;

        const room = rooms[roomCode];
        if (!room) return;

        const player = room.players.find(p => p.id === socket.id);
        if (!player) return;

        player.avatar = avatar;
        io.to(roomCode).emit('player-update', room.players);
    });

    // ── Request Player Stats ─────────────────────────────────────────
    socket.on('request-stats', () => {
        if (!checkRate()) return;
        const t = socket.handshake?.auth?.token;
        if (!t) return;
        const stats = playerStats[t];
        if (stats) {
            socket.emit('player-stats', {
                name: stats.name,
                wins: stats.wins,
                losses: stats.losses,
                gamesPlayed: stats.gamesPlayed,
                questionsCreated: stats.questionsCreated,
                votesCast: stats.votesCast,
                winRate: stats.votesCast > 0 ? Math.round((stats.wins / stats.votesCast) * 100) : 0
            });
        } else {
            socket.emit('player-stats', {
                name: 'Nieuw',
                wins: 0,
                losses: 0,
                gamesPlayed: 0,
                questionsCreated: 0,
                votesCast: 0,
                winRate: 0
            });
        }
    });

    // ── Submit Dilemma ───────────────────────────────────────────────
    socket.on('submit-dilemma', async ({ roomCode, option1, option2, type, question, isAutoSubmit }) => {
        if (!checkRate()) return;
        if (!isValidRoomCode(roomCode)) return;

        const room = rooms[roomCode];
        if (!room) return;
        if (room.players[room.turnIndex]?.id !== socket.id) return;
        if (room.dilemma) return;

        const validTypes = ['dilemma', 'question', 'photo', 'vote-person', 'would-you-rather'];
        if (!validTypes.includes(type)) return;

        const isPhoto = type === 'photo';

        const finalOption1 = isPhoto ? option1 : sanitizeText(option1, 500);
        const finalOption2 = isPhoto ? option2 : sanitizeText(option2, 500);
        const finalQuestion = question ? sanitizeText(question, 300) : null;

        if (isPhoto) {
            if (!option1 || !option2) {
                if (!isAutoSubmit) socket.emit('error', 'Upload beide fotos!');
                return;
            }
            const MAX_PHOTO_SIZE = 2 * 1024 * 1024;
            if (typeof option1 !== 'string' || !option1.startsWith('data:image/') ||
                typeof option2 !== 'string' || !option2.startsWith('data:image/')) {
                socket.emit('error', 'Ongeldige foto data.');
                return;
            }
            if (option1.length > MAX_PHOTO_SIZE || option2.length > MAX_PHOTO_SIZE) {
                socket.emit('error', 'Foto is te groot! Maximaal 2MB per foto.');
                return;
            }
        } else if (type === 'vote-person') {
            if (!finalQuestion) {
                if (!isAutoSubmit) socket.emit('error', 'Vul een vraag in!');
                return;
            }
        } else {
            if (!finalOption1 || !finalOption2) {
                if (!isAutoSubmit) socket.emit('error', 'Vul beide opties in!');
                return;
            }
        }

        if (room.settings.aiFilterEnabled && room.settings.aiApiKey) {
            try {
                if (type === 'vote-person' || isPhoto) {
                    if (finalQuestion) {
                        const check = await checkWithAI(finalQuestion, room.settings.aiApiKey);
                        if (!check.isClean) {
                            socket.emit('error', 'Je vraag bevat ongepast taalgebruik. Pas het aan.');
                            return;
                        }
                    }
                } else if (finalOption1 && finalOption2) {
                    const [c1, c2] = await Promise.all([
                        checkWithAI(finalOption1, room.settings.aiApiKey),
                        checkWithAI(finalOption2, room.settings.aiApiKey)
                    ]);
                    if (!c1.isClean || !c2.isClean) {
                        socket.emit('error', 'Je bericht bevat ongepast taalgebruik. Pas het aan.');
                        return;
                    }
                }
            } catch (error) {
                console.error('AI filter error:', error.message || error);
            }
        }

        room.dilemma = {
            option1: isPhoto ? option1 : finalOption1,
            option2: isPhoto ? option2 : finalOption2,
            type,
            question: finalQuestion
        };
        room.votes = {};
        room.dilemmaStartTime = Date.now();

        stopCreateTimer(roomCode);

        const dilemmaPayload = {
            option1: room.dilemma.option1,
            option2: room.dilemma.option2,
            type,
            question: finalQuestion,
            creatorName: room.players[room.turnIndex]?.name
        };

        if (type === 'vote-person') {
            io.to(roomCode).emit('dilemma-received', dilemmaPayload);
        } else {
            socket.to(roomCode).emit('dilemma-received', dilemmaPayload);
            socket.emit('waiting-for-vote');
        }
        broadcastVoteStatus(roomCode);

        if (room.settings.timedModeEnabled && room.settings.timedModeSeconds) {
            startVoteTimer(roomCode);
        }
    });

    // ── Live Typing for Vote-Person ──────────────────────────────────
    let lastTypingBroadcast = 0;
    socket.on('vote-person-typing', ({ roomCode, question }) => {
        if (!checkRate()) return;

        const now = Date.now();
        if (now - lastTypingBroadcast < 150) return;
        lastTypingBroadcast = now;

        if (!isValidRoomCode(roomCode)) return;
        const room = rooms[roomCode];
        if (!room) return;
        if (room.players[room.turnIndex]?.id !== socket.id) return;
        if (room.dilemma) return;

        socket.to(roomCode).emit('vote-person-typing-update', {
            question: question ? sanitizeText(question, 300) : '',
            creatorName: room.players[room.turnIndex]?.name
        });
    });

    // ── Start Create Timer ───────────────────────────────────────────
    socket.on('start-create-timer', (roomCode) => {
        if (!checkRate()) return;
        if (!isValidRoomCode(roomCode)) return;

        const room = rooms[roomCode];
        if (!room) return;
        if (room.players[room.turnIndex]?.id !== socket.id) return;
        if (room.dilemma) return;

        startCreateTimer(roomCode);
    });

    // ── Would You Rather: Request Next Question ───────────────────────
    socket.on('request-wyr', ({ roomCode, category }) => {
        if (!checkRate()) return;
        if (!isValidRoomCode(roomCode)) return;

        const room = rooms[roomCode];
        if (!room) return;
        if (room.players[room.turnIndex]?.id !== socket.id) return;
        if (room.dilemma) return;

        let pool;
        let usedKey;

        if (category && CATEGORY_QUESTIONS[category]) {
            pool = CATEGORY_QUESTIONS[category];
            usedKey = category;
            if (!room.usedCategoryIndices[usedKey]) room.usedCategoryIndices[usedKey] = [];
        } else {
            pool = WOULD_YOU_RATHER_QUESTIONS;
            usedKey = '_wyr';
            if (!room.usedCategoryIndices[usedKey]) room.usedCategoryIndices[usedKey] = [];
        }

        const used = room.usedCategoryIndices[usedKey];
        const available = pool.map((q, i) => i).filter(i => !used.includes(i));

        if (available.length === 0) {
            room.usedCategoryIndices[usedKey] = [];
            available.push(...pool.map((_, i) => i));
        }

        const idx = available[Math.floor(Math.random() * available.length)];
        room.usedCategoryIndices[usedKey].push(idx);
        const question = pool[idx];

        socket.emit('wyr-question', {
            option1: question.option1,
            option2: question.option2,
            category: usedKey === '_wyr' ? 'would-you-rather' : usedKey
        });
    });

    // ── Tournament: Initialize ──────────────────────────────────────
    socket.on('start-tournament', (roomCode) => {
        if (!checkRate()) return;
        if (!isValidRoomCode(roomCode)) return;

        const room = rooms[roomCode];
        if (!room) return;
        if (room.players[0]?.id !== socket.id) return;

        const tournament = initTournament(roomCode);
        if (!tournament) return;

        io.to(roomCode).emit('tournament-started', {
            bracket: tournament.bracket.map(q => ({ option1: q.option1, option2: q.option2, category: q.category })),
            phase: tournament.phase,
            totalMatches: tournament.bracket.length
        });

        emitTournamentMatch(roomCode);
    });

    // ── Tournament: Emit Current Match ──────────────────────────────
    function emitTournamentMatch(roomCode) {
        const room = rooms[roomCode];
        if (!room || !room.tournament) return;

        const match = getCurrentTournamentMatch(room);
        if (!match) return;

        room.dilemma = {
            option1: match.match.option1 + ' vs ' + match.match.option2,
            option2: match.match2.option1 + ' vs ' + match.match2.option2,
            type: 'tournament',
            question: 'Welk dilemma is beter?'
        };
        room.votes = {};
        room.dilemmaStartTime = Date.now();

        io.to(roomCode).emit('tournament-match', {
            dilemma1: { option1: match.match.option1, option2: match.match.option2 },
            dilemma2: { option1: match.match2.option1, option2: match.match2.option2 },
            phase: room.tournament.phase,
            matchIndex: match.index
        });

        if (room.settings.timedModeEnabled) {
            startVoteTimer(roomCode);
        }
    }

    // ── Request Scoreboard ──────────────────────────────────────────
    socket.on('request-scoreboard', (roomCode) => {
        if (!isValidRoomCode(roomCode)) return;
        const room = rooms[roomCode];
        if (!room || !room.settings.scoreboardEnabled) return;

        initScoreboard(room);
        socket.emit('scoreboard-data', getScoreboardData(room));
    });

    // ── Emoji Reaction ───────────────────────────────────────────────
    socket.on('emoji-reaction', ({ roomCode, emoji }) => {
        if (!checkRate()) return;
        if (!isValidRoomCode(roomCode)) return;
        const room = rooms[roomCode];
        if (!room) return;

        if (!emoji || typeof emoji !== 'string' || emoji.length > 8) return;

        const player = room.players.find(p => p.id === socket.id);
        if (!player) return;

        socket.to(roomCode).emit('emoji-reaction', {
            emoji,
            playerName: player.name,
            playerId: socket.id
        });
    });

    // ── Game History Request ─────────────────────────────────────────
    socket.on('request-game-history', (roomCode) => {
        if (!isValidRoomCode(roomCode)) return;
        const room = rooms[roomCode];
        if (!room) return;

        socket.emit('game-history', {
            history: room.gameHistory,
            players: room.players.map(p => ({ name: p.name, id: p.id, avatar: p.avatar || '😎' }))
        });
    });

    // ── Custom Questions (validated on server) ───────────────────────
    socket.on('submit-custom-questions', ({ roomCode, questions }) => {
        if (!checkRate()) return;
        if (!isValidRoomCode(roomCode)) return;
        const room = rooms[roomCode];
        if (!room) return;
        if (room.players[0]?.id !== socket.id) return;

        if (!Array.isArray(questions) || questions.length > 50) return;

        const sanitized = questions.filter(q =>
            q && typeof q.option1 === 'string' && typeof q.option2 === 'string'
        ).map(q => ({
            option1: sanitizeText(q.option1, 500),
            option2: sanitizeText(q.option2, 500),
            custom: true
        }));

        if (!room.customQuestions) room.customQuestions = [];
        room.customQuestions = sanitized;
        socket.emit('custom-questions-saved', { count: sanitized.length });
    });

    // ── Player Activity Heartbeat ────────────────────────────────────
    socket.on('player-activity', (roomCode) => {
        if (typeof roomCode !== 'string') return;
        const room = rooms[roomCode];
        if (room && room.playerLastActive && isPlayerInRoom(socket.id, roomCode)) {
            room.playerLastActive[socket.id] = Date.now();
        }
    });

    // ── Cast Vote ────────────────────────────────────────────────────
    socket.on('vote', ({ roomCode, choice, answer, selectedPersonId }) => {
        if (!checkRate()) return;
        if (!isValidRoomCode(roomCode)) return;

        const room = rooms[roomCode];
        if (!room || !room.dilemma) return;

        if (!isPlayerInRoom(socket.id, roomCode)) return;

        if (room.votes[socket.id]) return;

        if (room.dilemma.type === 'vote-person') {
            if (!selectedPersonId || typeof selectedPersonId !== 'string') return;
            if (!room.players.some(p => p.id === selectedPersonId)) return;
            if (selectedPersonId === socket.id) return;
        } else {
            if (choice !== 1 && choice !== 2) return;
        }

        const cleanAnswer = answer ? sanitizeText(answer, 500) : null;

        room.votes[socket.id] = {
            choice,
            answer: cleanAnswer,
            selectedPersonId: selectedPersonId || null,
            voteTime: Date.now()
        };
        broadcastVoteStatus(roomCode);

        const votersCount = room.dilemma.type === 'vote-person'
            ? room.players.length
            : Math.max(0, room.players.length - 1);

        if (Object.keys(room.votes).length >= votersCount) {
            finishRound(roomCode);
        }
    });

    // ── Leave Room ───────────────────────────────────────────────────
    socket.on('leave-room', (roomCode) => {
        if (typeof roomCode !== 'string') return;
        handleDisconnect(socket, roomCode, true);
    });

    // ── Disconnect ───────────────────────────────────────────────────
    socket.on('disconnect', () => {
        if (ipConnections[ip]) {
            ipConnections[ip]--;
            if (ipConnections[ip] <= 0) delete ipConnections[ip];
        }

        for (const [code, room] of Object.entries(rooms)) {
            if (room.players.find(p => p.id === socket.id)) {
                handleDisconnect(socket, code);
                break;
            }
            if (room.spectators) {
                const specIdx = room.spectators.findIndex(s => s.id === socket.id);
                if (specIdx !== -1) {
                    room.spectators.splice(specIdx, 1);
                    io.to(code).emit('spectator-count', room.spectators.length);
                    break;
                }
            }
        }
    });
});

// ─── Health Check Endpoint ──────────────────────────────────────────
app.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        rooms: Object.keys(rooms).length,
        uptime: Math.floor(process.uptime())
    });
});

// ─── API: Room List for Browser ─────────────────────────────────────
app.get('/api/rooms', (req, res) => {
    res.json(getPublicRooms());
});

// ─── Graceful Shutdown ──────────────────────────────────────────────
function shutdown() {
    console.log('Shutting down gracefully...');
    for (const [code] of Object.entries(rooms)) {
        io.to(code).emit('game-ended', 'Server wordt herstart. Probeer opnieuw te verbinden.');
        cleanupRoom(code);
    }
    io.close();
    http.close(() => {
        console.log('Server closed.');
        process.exit(0);
    });
    setTimeout(() => process.exit(1), 5000);
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

// ─── Start Server ───────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
http.listen(PORT, () => {
    console.log(`Dilema server running on port ${PORT}`);
});
