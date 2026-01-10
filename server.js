const express = require('express');
const app = express();
const http = require('http').createServer(app);
// Increase buffer size to 50MB to handle image uploads safely
const io = require('socket.io')(http, {
    maxHttpBufferSize: 50 * 1024 * 1024 
});
const path = require('path');

app.use(express.static(path.join(__dirname, 'public')));

// Game state storage
const rooms = {};

function generateRoomCode() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = '';
    do {
        code = '';
        for (let i = 0; i < 6; i++) {
            code += chars.charAt(Math.floor(Math.random() * chars.length));
        }
    } while (rooms[code]); // Ensure unique
    return code;
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

    // Send result to everyone
    io.to(roomCode).emit('vote-result', { 
        winningChoice,
        votesByOption, 
        dilemma: room.dilemma,
        answers: answers,
        votePersonResults: room.dilemma.type === 'vote-person' ? votePersonResults : null
    });

    // Reset round state
    room.votes = {};
    
    // Calculate delay based on type and number of players
    let delay;
    if (room.dilemma.type === 'question') {
        // Question mode: show each answer for 10 seconds
        delay = answers.length * 10000 + 2000;
    } else if (room.dilemma.type === 'dilemma') {
        // Dilemma mode: longer delay with more players (6 seconds base + 2 seconds per player)
        delay = 6000 + (room.players.length * 2000);
    } else {
        // Other modes: default 6 seconds
        delay = 6000;
    }
    
    // Clear dilemma after sending result
    room.dilemma = null;
    room.round++;
    room.turnIndex = (room.turnIndex + 1) % room.players.length;

    setTimeout(() => {
        if (rooms[roomCode]) { 
            io.to(roomCode).emit('new-round', { 
                turnId: room.players[room.turnIndex].id,
                round: room.round,
                settings: rooms[roomCode].settings
            });
            
            // Start timer for new round if enabled
            const newRoom = rooms[roomCode];
            if (newRoom.settings.createTimerMinutes && newRoom.settings.createTimerMinutes > 0) {
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
    const status = room.players.map(p => {
        if (p.id === creatorId) return null; // Creator doesn't vote
        return {
            name: p.name,
            voted: !!room.votes[p.id]
        };
    }).filter(Boolean);

    io.to(roomCode).emit('update-vote-status', status);
}

io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    socket.on('create-room', ({ playerName, maxPlayers, allowedModes, createTimerMinutes, maxRounds, rareRoundEnabled, rareRoundFrequency }) => {
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
                rareRoundFrequency: rareRoundFrequency || 5 // Every X questions
            },
            started: false,
            turnIndex: 0, 
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
                            settings: nextRoom.settings
                        });
                    }
                }, 2000);
            }
        }, 2000);
    }

    socket.on('submit-dilemma', ({ roomCode, option1, option2, type, question, isAutoSubmit }) => {
        const room = rooms[roomCode];
        if (room && room.players[room.turnIndex].id === socket.id) {
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

            room.dilemma = { option1, option2, type, question: question || null };
            room.votes = {}; // Ensure votes are fresh
            room.dilemmaStartTime = Date.now();
            
            // Stop create timer
            stopCreateTimer(roomCode);
            
            socket.to(roomCode).emit('dilemma-received', { 
                option1, option2, type, question: question || null,
                creatorName: room.players[room.turnIndex].name 
            });
            
            socket.emit('waiting-for-vote');
            broadcastVoteStatus(roomCode); // Show initial status
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
            const votersCount = Math.max(0, room.players.length - 1);
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
                        settings: room.settings
                    });
                 }
             } else {
                 if (playerIndex < room.turnIndex) {
                     room.turnIndex--;
                 }
                 
                 // If waiting for votes, check if leaving voter makes it complete
                 if (room.dilemma) {
                     const votersCount = Math.max(0, room.players.length - 1);
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

// Check for inactive players periodically (5 minutes timeout)
setInterval(() => {
    const now = Date.now();
    const INACTIVE_TIMEOUT = 5 * 60 * 1000; // 5 minutes
    
    for (const [roomCode, room] of Object.entries(rooms)) {
        if (!room.playerLastActive) continue;
        
        for (const [playerId, lastActive] of Object.entries(room.playerLastActive)) {
            if (now - lastActive > INACTIVE_TIMEOUT) {
                // Player inactive for too long, find and remove them
                const playerIndex = room.players.findIndex(p => p.id === playerId);
                if (playerIndex !== -1) {
                    const socket = io.sockets.sockets.get(playerId);
                    if (socket) {
                        handleDisconnect(socket, roomCode);
                    }
                }
            }
        }
    }
}, 30000); // Check every 30 seconds

const PORT = process.env.PORT || 3000;
http.listen(PORT, () => {
    console.log(`Listening on port ${PORT}`);
});
