const express = require('express');
const app = express();
const http = require('http').createServer(app);
// Increase buffer size to 50MB to handle image uploads safely
const io = require('socket.io')(http, {
    maxHttpBufferSize: 50 * 1024 * 1024 
});
const path = require('path');
const https = require('https');

app.use(express.static(path.join(__dirname, 'public')));

// Game state storage
const rooms = {};

function generateRoomCode() {
    const chars = '0123456789';
    let code = '';
    do {
        code = '';
        for (let i = 0; i < 6; i++) {
            code += chars.charAt(Math.floor(Math.random() * chars.length));
        }
    } while (rooms[code]); // Ensure unique
    return code;
}

// AI Anti-swearing filter using llm7.io API (experimental)
// Uses OpenAI-compatible API endpoint: https://api.llm7.io/v1
async function checkWithAI(text, apiKey) {
    if (!apiKey || !text || !text.trim()) return { isClean: true, filteredText: text };
    
    return new Promise((resolve) => {
        // Simple keyword-based filter as fallback
        const commonSwearWords = ['kut', 'klote', 'tyfus', 'kanker', 'fuck', 'shit', 'damn', 'hell', 'kut', 'godver', 'verdomme']; // Dutch + English
        
        // Check for common swear words (case insensitive)
        const textLower = text.toLowerCase();
        const hasSwearWord = commonSwearWords.some(word => textLower.includes(word));
        
        if (hasSwearWord && apiKey) {
            // Try to filter with llm7.io API (OpenAI-compatible)
            const data = JSON.stringify({
                model: 'default',
                messages: [
                    {
                        role: 'user',
                        content: `Check if this text contains swear words or offensive language in Dutch or English. Return only JSON: {"isClean": true/false, "filteredText": "cleaned version with swear words replaced by ***"}. Text: "${text}"`
                    }
                ],
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
                    'Content-Length': data.length
                }
            };
            
            const req = https.request(options, (res) => {
                let responseData = '';
                res.on('data', (chunk) => {
                    responseData += chunk;
                });
                res.on('end', () => {
                    try {
                        const result = JSON.parse(responseData);
                        const aiResponse = result.choices?.[0]?.message?.content || '';
                        
                        // Try to parse JSON from AI response
                        let parsedResult;
                        try {
                            parsedResult = JSON.parse(aiResponse);
                        } catch {
                            // If not JSON, check if response suggests it's clean
                            parsedResult = {
                                isClean: !hasSwearWord || aiResponse.toLowerCase().includes('clean') || aiResponse.toLowerCase().includes('geen'),
                                filteredText: text
                            };
                        }
                        
                        if (!parsedResult.isClean && parsedResult.filteredText) {
                            resolve({
                                isClean: false,
                                filteredText: parsedResult.filteredText
                            });
                        } else {
                            // Use keyword filter as fallback
                            let filteredText = text;
                            commonSwearWords.forEach(word => {
                                const regex = new RegExp(word, 'gi');
                                filteredText = filteredText.replace(regex, '***');
                            });
                            resolve({ isClean: false, filteredText: filteredText });
                        }
                    } catch (e) {
                        console.error('AI filter parse error:', e);
                        // Use keyword filter as fallback
                        let filteredText = text;
                        commonSwearWords.forEach(word => {
                            const regex = new RegExp(word, 'gi');
                            filteredText = filteredText.replace(regex, '***');
                        });
                        resolve({ isClean: false, filteredText: filteredText });
                    }
                });
            });
            
            req.on('error', (e) => {
                console.error('AI filter request error:', e);
                // Fallback to keyword filtering
                let filteredText = text;
                commonSwearWords.forEach(word => {
                    const regex = new RegExp(word, 'gi');
                    filteredText = filteredText.replace(regex, '***');
                });
                resolve({ isClean: false, filteredText: filteredText });
            });
            
            req.setTimeout(3000, () => {
                req.destroy();
                // Timeout - use keyword filter
                let filteredText = text;
                commonSwearWords.forEach(word => {
                    const regex = new RegExp(word, 'gi');
                    filteredText = filteredText.replace(regex, '***');
                });
                resolve({ isClean: false, filteredText: filteredText });
            });
            
            req.write(data);
            req.end();
        } else if (hasSwearWord) {
            // No API key but swear word detected - use keyword filter
            let filteredText = text;
            commonSwearWords.forEach(word => {
                const regex = new RegExp(word, 'gi');
                filteredText = filteredText.replace(regex, '***');
            });
            resolve({ isClean: false, filteredText: filteredText });
        } else {
            // No swear words detected
            resolve({ isClean: true, filteredText: text });
        }
    });
}

// Global helper for finishing rounds
function finishRound(roomCode) {
    const room = rooms[roomCode];
    // CRITICAL: Check if dilemma exists to prevent race conditions (multiple votes finishing at once)
    if (!room || !room.dilemma) return;

    let votesByOption = { 1: [], 2: [] };
    let answers = []; 
    let votePersonResults = {}; // For vote-person mode: { playerId: [voter names] }

    Object.entries(room.votes).forEach(([playerId, vote]) => {
        const player = room.players.find(p => p.id === playerId);
        if (player) {
            if (room.dilemma.type === 'vote-person') {
                // For vote-person: vote.selectedPersonId contains the ID of the person voted for
                if (vote.selectedPersonId) {
                    if (!votePersonResults[vote.selectedPersonId]) {
                        votePersonResults[vote.selectedPersonId] = [];
                    }
                    votePersonResults[vote.selectedPersonId].push(player.name);
                }
            } else {
                votesByOption[vote.choice].push(player.name);
                if (vote.answer) {
                    answers.push({ 
                        name: player.name, 
                        text: vote.answer,
                        choice: vote.choice 
                    });
                }
            }
        }
    });

    const winningChoice = votesByOption[1].length >= votesByOption[2].length ? 1 : 2;

    // Calculate delay based on type and number of players
    let delay;
    if (room.dilemma.type === 'question') {
        // Question mode: show each answer for 10 seconds
        delay = answers.length * 10000 + 2000;
    } else if (room.dilemma.type === 'dilemma') {
        // Dilemma mode: longer delay with more players (6 seconds base + 2 seconds per player)
        delay = 6000 + (room.players.length * 2000);
    } else if (room.dilemma.type === 'vote-person') {
        // Vote person mode: longer delay with more players
        delay = 6000 + (room.players.length * 2000);
    } else {
        // Photo mode and others: default 6 seconds + player count
        delay = 6000 + (room.players.length * 2000);
    }
    
    // Send result to everyone with delay info
    io.to(roomCode).emit('vote-result', { 
        winningChoice,
        votesByOption, 
        dilemma: room.dilemma,
        answers: answers,
        votePersonResults: room.dilemma.type === 'vote-person' ? votePersonResults : null,
        delay: delay // Send delay so client knows how long to wait
    });

    // Reset round state - delay will be sent with vote-result, calculated above
    room.votes = {};
    
    // Clear dilemma after sending result
    room.dilemma = null;
    
    // Update round tracking
    room.totalRoundsCompleted++;
    const currentPlayerId = room.players[room.turnIndex].id;
    if (!room.playerRoundsCompleted[currentPlayerId]) {
        room.playerRoundsCompleted[currentPlayerId] = 0;
    }
    room.playerRoundsCompleted[currentPlayerId]++;
    
    // Check if NEXT round should be a rare round (before incrementing turnIndex)
    room.round++;
    
    // Determine next player index - support random turn order
    let nextPlayerIndex;
    if (room.settings.randomTurnOrder && room.players.length > 1) {
        // Random turn order: pick a random player, but not the same as last turn
        const availableIndices = room.players
            .map((_, idx) => idx)
            .filter(idx => idx !== room.turnIndex); // Can't be current player
        
        if (availableIndices.length > 0) {
            const randomIdx = Math.floor(Math.random() * availableIndices.length);
            nextPlayerIndex = availableIndices[randomIdx];
        } else {
            // Fallback (shouldn't happen)
            nextPlayerIndex = (room.turnIndex + 1) % room.players.length;
        }
    } else {
        // Sequential turn order
        nextPlayerIndex = (room.turnIndex + 1) % room.players.length;
    }
    
    // Check if this should be a rare round - FIXED: Check AFTER incrementing totalRoundsCompleted
    // The check should happen for the NEXT round, so we check if the CURRENT totalRoundsCompleted matches
    if (room.settings.rareRoundEnabled && 
        room.players.length >= 3 && 
        room.totalRoundsCompleted > 0 &&
        room.totalRoundsCompleted % room.settings.rareRoundFrequency === 0) {
        room.isRareRound = true;
        // Rare round: current player creates a general question, others create dilemmas
        // This will be handled in the new-round event
        console.log(`Rare round triggered! Round ${room.round}, totalRoundsCompleted: ${room.totalRoundsCompleted}, frequency: ${room.settings.rareRoundFrequency}`);
    } else {
        room.isRareRound = false;
        room.rareRoundQuestion = null;
        room.rareRoundCreatorId = null;
    }
    
    room.lastTurnIndex = room.turnIndex; // Track for next random selection
    room.turnIndex = nextPlayerIndex;

    setTimeout(() => {
        if (rooms[roomCode]) { 
            const currentRoom = rooms[roomCode];
            io.to(roomCode).emit('new-round', { 
                turnId: currentRoom.players[currentRoom.turnIndex].id,
                round: currentRoom.round,
                settings: currentRoom.settings,
                isRareRound: currentRoom.isRareRound || false,
                rareRoundQuestion: currentRoom.rareRoundQuestion || null,
                randomTurnOrder: currentRoom.settings.randomTurnOrder || false
            });
            
            // Start timer for new round if enabled
            if (currentRoom.settings.createTimerMinutes && currentRoom.settings.createTimerMinutes > 0) {
                // Timer will start when creator view is shown (via client request)
            }
        }
    }, delay);
}

// Helper to broadcast current voting progress
function broadcastVoteStatus(roomCode) {
    const room = rooms[roomCode];
    if (!room || !room.dilemma) return;

    const creatorId = room.players[room.turnIndex].id;
    
    // In vote-person mode, everyone can vote (including creator)
    // In other modes, creator doesn't vote
    const status = room.players.map(p => {
        if (room.dilemma.type === 'vote-person') {
            // Everyone can vote in vote-person mode
            return {
                name: p.name,
                voted: !!room.votes[p.id]
            };
        } else {
            // Creator doesn't vote in other modes
            if (p.id === creatorId) return null;
            return {
                name: p.name,
                voted: !!room.votes[p.id]
            };
        }
    }).filter(Boolean);

    io.to(roomCode).emit('update-vote-status', status);
}

io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    socket.on('create-room', ({ playerName, maxPlayers, allowedModes, createTimerMinutes, maxRounds, rareRoundEnabled, rareRoundFrequency, randomTurnOrder, aiFilterEnabled, aiApiKey }) => {
        if (!playerName || playerName.length > 12) return;
        
        const roomCode = generateRoomCode();
        rooms[roomCode] = {
            players: [{
                id: socket.id,
                name: playerName
            }],
            settings: {
                maxPlayers: maxPlayers || 2,
                allowedModes: allowedModes || ['dilemma', 'question', 'photo'],
                createTimerMinutes: createTimerMinutes || null, // null = infinite
                maxRounds: maxRounds || null, // null = infinite, number = rounds per player
                rareRoundEnabled: rareRoundEnabled || false,
                rareRoundFrequency: rareRoundFrequency || 5, // Every X questions
                randomTurnOrder: randomTurnOrder || false, // Random turn order (no same player twice in a row)
                aiFilterEnabled: aiFilterEnabled || false, // AI anti-swearing filter
                aiApiKey: aiApiKey || null // ll7m.io API key
            },
            started: false,
            turnIndex: 0,
            lastTurnIndex: -1, // Track last turn index for random order
            dilemma: null,
            round: 1,
            votes: {},
            playerLastActive: {}, // Track when players were last active
            totalRoundsCompleted: 0, // Track total rounds for rare round calculation
            playerRoundsCompleted: {}, // Track rounds per player { playerId: count }
            isRareRound: false, // Flag for current round being a rare round
            rareRoundQuestion: null, // Question for rare round
            rareRoundCreatorId: null // Player who created the rare round question
        };

        rooms[roomCode].playerLastActive[socket.id] = Date.now();
        socket.join(roomCode);
        socket.emit('room-created', { code: roomCode, players: rooms[roomCode].players, settings: rooms[roomCode].settings });
    });

    socket.on('join-room', ({ roomCode, playerName }) => {
        const room = rooms[roomCode];
        
        if (!room) {
            socket.emit('error', 'Kamer bestaat niet.');
            return;
        }

        if (room.started) {
            socket.emit('error', 'Dit spel is al begonnen!');
            return;
        }

        if (room.players.length >= room.settings.maxPlayers) {
            socket.emit('error', 'Kamer is vol!');
            return;
        }

        const nameExists = room.players.some(p => p.name.toLowerCase() === playerName.toLowerCase());
        if (nameExists) {
            socket.emit('error', 'Naam is al in gebruik in deze kamer!');
            return;
        }

        room.players.push({
            id: socket.id,
            name: playerName
        });
        room.playerLastActive[socket.id] = Date.now();
        
        socket.join(roomCode);
        
        socket.emit('join-success', { 
            code: roomCode, 
            players: room.players,
            settings: room.settings 
        });

        io.to(roomCode).emit('player-update', room.players);

        if (room.players.length === parseInt(room.settings.maxPlayers)) {
            startGame(roomCode);
        }
    });

    socket.on('start-game-request', (roomCode) => {
        const room = rooms[roomCode];
        if (room && room.players[0].id === socket.id) {
            if (room.players.length >= 2) {
                startGame(roomCode);
            } else {
                socket.emit('error', 'Er zijn minimaal 2 spelers nodig!');
            }
        }
    });

    function startGame(roomCode) {
        const room = rooms[roomCode];
        if (!room || room.started) return;

        room.started = true;
        room.createTimerInterval = null;
        io.to(roomCode).emit('game-start', { 
            turnId: room.players[room.turnIndex].id,
            round: room.round,
            players: room.players,
            settings: room.settings
        });
    }

    // Start shared timer for dilemma creation (when turn starts)
    function startCreateTimer(roomCode) {
        const room = rooms[roomCode];
        if (!room || room.createTimerInterval) return;

        const timerMinutes = room.settings.createTimerMinutes;
        if (!timerMinutes || timerMinutes === 0) return; // Infinite timer

        let remainingSeconds = timerMinutes * 60;
        room.createTimerStartTime = Date.now();
        room.createTimerRemaining = remainingSeconds;

        // Send initial timer to everyone
        io.to(roomCode).emit('create-timer-update', {
            remainingSeconds: remainingSeconds,
            totalSeconds: remainingSeconds
        });

        room.createTimerInterval = setInterval(() => {
            remainingSeconds--;
            room.createTimerRemaining = remainingSeconds;

            // Send update to everyone
            io.to(roomCode).emit('create-timer-update', {
                remainingSeconds: remainingSeconds,
                totalSeconds: timerMinutes * 60
            });

            if (remainingSeconds <= 0) {
                clearInterval(room.createTimerInterval);
                room.createTimerInterval = null;
                // Timer expired - check if we should auto-submit or skip
                handleTimerExpired(roomCode);
            }
        }, 1000);
    }

    function stopCreateTimer(roomCode) {
        const room = rooms[roomCode];
        if (room && room.createTimerInterval) {
            clearInterval(room.createTimerInterval);
            room.createTimerInterval = null;
            room.createTimerRemaining = null;
            // Notify everyone timer stopped
            io.to(roomCode).emit('create-timer-stopped');
        }
    }

    function handleTimerExpired(roomCode) {
        const room = rooms[roomCode];
        if (!room) return;

        // Notify the creator to check if they can auto-submit
        const creatorId = room.players[room.turnIndex]?.id;
        if (creatorId) {
            io.to(creatorId).emit('timer-expired-check', {
                message: 'Timer verlopen! Controleer of je kunt verzenden...'
            });
        }

        // Also notify everyone that timer expired
        io.to(roomCode).emit('timer-expired', {
            message: 'De tijd is op!'
        });

        // Wait a moment for auto-submit, then skip if still no submission
        setTimeout(() => {
            const currentRoom = rooms[roomCode];
            if (currentRoom && !currentRoom.dilemma && currentRoom.createTimerRemaining === 0) {
                // No submission made - skip round
                currentRoom.votes = {};
                currentRoom.round++;
                currentRoom.turnIndex = (currentRoom.turnIndex + 1) % currentRoom.players.length;
                
                io.to(roomCode).emit('round-skipped', {
                    message: 'Ronde overgeslagen - niet genoeg ingevuld. Volgende speler!'
                });

                setTimeout(() => {
                    if (rooms[roomCode]) {
                        const nextRoom = rooms[roomCode];
                        io.to(roomCode).emit('new-round', {
                            turnId: nextRoom.players[nextRoom.turnIndex].id,
                            round: nextRoom.round,
                            settings: nextRoom.settings,
                            isRareRound: nextRoom.isRareRound || false,
                            rareRoundQuestion: nextRoom.rareRoundQuestion || null,
                            randomTurnOrder: nextRoom.settings.randomTurnOrder || false
                        });
                    }
                }, 2000);
            }
        }, 2000);
    }

    socket.on('submit-dilemma', async ({ roomCode, option1, option2, type, question, isAutoSubmit }) => {
        const room = rooms[roomCode];
        if (room && room.players[room.turnIndex].id === socket.id) {
            // NOTE: No maxRounds check - rounds are infinite by default
            // User requested: "behou de lobby verwijder lobby nooit" - keep lobby forever
            
            // Validate that enough is filled in
            if (type === 'photo') {
                if (!option1 || !option2) {
                    if (isAutoSubmit) {
                        // Timer expired and not enough filled - skip will be handled
                        return;
                    }
                    socket.emit('error', 'Upload beide fotos!');
                    return;
                }
            } else if (type === 'vote-person') {
                if (!question || !question.trim()) {
                    if (isAutoSubmit) {
                        return;
                    }
                    socket.emit('error', 'Vul een vraag in!');
                    return;
                }
            } else {
                if (!option1 || !option2 || !option1.trim() || !option2.trim()) {
                    if (isAutoSubmit) {
                        return;
                    }
                    socket.emit('error', 'Vul beide opties in!');
                    return;
                }
            }
            
            // AI Filter check if enabled (experimental)
            let finalOption1 = option1;
            let finalOption2 = option2;
            let finalQuestion = question;
            
            if (room.settings.aiFilterEnabled && room.settings.aiApiKey) {
                try {
                    if (type === 'vote-person' && question) {
                        const aiCheck = await checkWithAI(question, room.settings.aiApiKey);
                        if (!aiCheck.isClean) {
                            socket.emit('error', 'Je bericht bevat ongepast taalgebruik. Pas het aan.');
                            return;
                        }
                        finalQuestion = aiCheck.filteredText;
                    } else if (option1 && option2) {
                        const check1 = await checkWithAI(option1, room.settings.aiApiKey);
                        const check2 = await checkWithAI(option2, room.settings.aiApiKey);
                        if (!check1.isClean || !check2.isClean) {
                            socket.emit('error', 'Je bericht bevat ongepast taalgebruik. Pas het aan.');
                            return;
                        }
                        finalOption1 = check1.filteredText;
                        finalOption2 = check2.filteredText;
                    }
                } catch (error) {
                    console.error('AI filter error:', error);
                    // Fail safe - continue without filtering
                }
            }

            room.dilemma = { option1: finalOption1, option2: finalOption2, type, question: finalQuestion || null };
            room.votes = {}; // Ensure votes are fresh
            room.dilemmaStartTime = Date.now();
            
            // Stop create timer
            stopCreateTimer(roomCode);
            
            // In vote-person mode, everyone (including creator) can vote
            // In other modes, creator waits while others vote
            if (type === 'vote-person') {
                // Send to everyone including creator so creator can also vote
                io.to(roomCode).emit('dilemma-received', { 
                    option1, option2, type, question: question || null,
                    creatorName: room.players[room.turnIndex].name 
                });
            } else {
                // Other modes: creator waits, others vote
                socket.to(roomCode).emit('dilemma-received', { 
                    option1, option2, type, question: question || null,
                    creatorName: room.players[room.turnIndex].name 
                });
                socket.emit('waiting-for-vote');
            }
            broadcastVoteStatus(roomCode); // Show initial status
        }
    });

    // Live typing updates for vote-person question input
    socket.on('vote-person-typing', ({ roomCode, question }) => {
        const room = rooms[roomCode];
        if (room && room.players[room.turnIndex].id === socket.id && !room.dilemma) {
            // Broadcast typing update to everyone except the typer
            socket.to(roomCode).emit('vote-person-typing-update', {
                question: question || '',
                creatorName: room.players[room.turnIndex].name
            });
        }
        }
    });

    socket.on('start-create-timer', (roomCode) => {
        // Client requests timer start when creator view is shown
        const room = rooms[roomCode];
        if (room && room.players[room.turnIndex] && room.players[room.turnIndex].id === socket.id) {
            // Only start if no dilemma exists yet (timer is for creating, not after submission)
            if (!room.dilemma) {
                startCreateTimer(roomCode);
            }
        }
    });

    socket.on('player-activity', (roomCode) => {
        const room = rooms[roomCode];
        if (room && room.playerLastActive) {
            room.playerLastActive[socket.id] = Date.now();
        }
    });

    socket.on('vote', ({ roomCode, choice, answer, selectedPersonId }) => {
        const room = rooms[roomCode];
        if (room && room.dilemma) {
            // Track votes
            room.votes[socket.id] = { choice, answer, selectedPersonId };
            
            // Broadcast progress to everyone
            broadcastVoteStatus(roomCode);

            // Check completion
            // In vote-person mode, everyone can vote (including creator)
            // In other modes, creator doesn't vote
            let votersCount;
            if (room.dilemma.type === 'vote-person') {
                votersCount = room.players.length; // Everyone votes
            } else {
                votersCount = Math.max(0, room.players.length - 1); // Creator doesn't vote
            }
            const currentVotes = Object.keys(room.votes).length;

            if (currentVotes >= votersCount) {
                finishRound(roomCode);
            }
        }
    });

    socket.on('leave-room', (roomCode) => {
        handleDisconnect(socket, roomCode);
    });

    socket.on('disconnect', () => {
        for (const [code, room] of Object.entries(rooms)) {
            if (room.players.find(p => p.id === socket.id)) {
                handleDisconnect(socket, code);
                break;
            }
        }
    });
});

function handleDisconnect(socket, roomCode) {
    const room = rooms[roomCode];
    if (room) {
        const playerIndex = room.players.findIndex(p => p.id === socket.id);
        if (playerIndex === -1) return; 

        const wasCreator = (playerIndex === room.turnIndex);
        const leavingPlayerName = room.players[playerIndex].name;
        
        // Remove player's vote
        if (room.votes[socket.id]) {
            delete room.votes[socket.id];
        }
        
        // Remove from activity tracking
        if (room.playerLastActive && room.playerLastActive[socket.id]) {
            delete room.playerLastActive[socket.id];
        }

        room.players.splice(playerIndex, 1);
        socket.leave(roomCode);

        io.to(roomCode).emit('player-left', { 
            name: leavingPlayerName,
            remaining: room.players 
        });

        if (room.players.length < 2 && room.settings.maxPlayers > 1) { 
             io.to(roomCode).emit('game-ended', 'Te weinig spelers over.');
             delete rooms[roomCode];
             io.in(roomCode).socketsLeave(roomCode);
        } else {
             // Handle turn adjustment
             if (wasCreator) {
                 room.turnIndex = room.turnIndex % room.players.length;
                 room.dilemma = null; // Clear stale dilemma
                 room.votes = {}; // Clear stale votes
                 if (room.started) {
                    io.to(roomCode).emit('new-round', {
                        turnId: room.players[room.turnIndex].id,
                        round: room.round,
                        settings: room.settings,
                        isRareRound: room.isRareRound || false,
                        rareRoundQuestion: room.rareRoundQuestion || null,
                        randomTurnOrder: room.settings.randomTurnOrder || false
                    });
                 }
             } else {
                 if (playerIndex < room.turnIndex) {
                     room.turnIndex--;
                 }
                 
                 // If waiting for votes, check if leaving voter makes it complete
                 if (room.dilemma) {
                     // Check if vote-person mode (everyone votes) or other modes
                     let votersCount;
                     if (room.dilemma && room.dilemma.type === 'vote-person') {
                         votersCount = room.players.length; // Everyone votes
                     } else {
                         votersCount = Math.max(0, room.players.length - 1); // Creator doesn't vote
                     }
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
}

// Check for inactive players periodically - DISABLED: Lobby should never be removed automatically
// User requested: "behou de lobby verwijder lobby nooit NOOIT NAAR 30 min ofzo"
// setInterval(() => {
//     const now = Date.now();
//     const INACTIVE_TIMEOUT = 15 * 60 * 1000; // 15 minutes (was 5 minutes - increased to allow inactivity)
//     
//     for (const [roomCode, room] of Object.entries(rooms)) {
//         if (!room.playerLastActive) continue;
//         
//         for (const [playerId, lastActive] of Object.entries(room.playerLastActive)) {
//             if (now - lastActive > INACTIVE_TIMEOUT) {
//                 // Player inactive for too long, find and remove them
//                 const playerIndex = room.players.findIndex(p => p.id === playerId);
//                 if (playerIndex !== -1) {
//                     const socket = io.sockets.sockets.get(playerId);
//                     if (socket) {
//                         handleDisconnect(socket, roomCode);
//                     }
//                 }
//             }
//         }
//     }
// }, 60000); // Check every 60 seconds (was 30 seconds)

const PORT = process.env.PORT || 3000;
http.listen(PORT, () => {
    console.log(`Listening on port ${PORT}`);
});
