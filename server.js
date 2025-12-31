const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);
const path = require('path');

app.use(express.static(path.join(__dirname, 'public')));

// Game state storage
const rooms = {};

function generateRoomCode() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    let code = '';
    do {
        code = '';
        for (let i = 0; i < 6; i++) {
            code += chars.charAt(Math.floor(Math.random() * chars.length));
        }
    } while (rooms[code]); // Ensure unique
    return code;
}

io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    socket.on('create-room', ({ playerName, maxPlayers, gameMode }) => {
        // Validate inputs
        if (!playerName || playerName.length > 12) return;
        
        const roomCode = generateRoomCode();
        rooms[roomCode] = {
            players: [{
                id: socket.id,
                name: playerName
            }],
            settings: {
                maxPlayers: maxPlayers || 2,
                mode: gameMode || 'mixed'
            },
            started: false, // Flag to prevent joining mid-game
            turnIndex: 0, 
            dilemma: null,
            round: 1,
            votes: {}
        };

        socket.join(roomCode);
        socket.emit('room-created', { code: roomCode, players: rooms[roomCode].players });
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

        // Check for duplicate names
        const nameExists = room.players.some(p => p.name.toLowerCase() === playerName.toLowerCase());
        if (nameExists) {
            socket.emit('error', 'Naam is al in gebruik in deze kamer!');
            return;
        }

        room.players.push({
            id: socket.id,
            name: playerName
        });
        
        socket.join(roomCode);
        
        // Notify the joining player specifically
        socket.emit('join-success', { 
            code: roomCode, 
            players: room.players,
            settings: room.settings 
        });

        // Notify everyone in room of new player list
        io.to(roomCode).emit('player-update', room.players);

        // Auto-start only if max players reached
        if (room.players.length === parseInt(room.settings.maxPlayers)) {
            startGame(roomCode);
        }
    });

    socket.on('start-game-request', (roomCode) => {
        const room = rooms[roomCode];
        // Only the host (first player) can start
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
        io.to(roomCode).emit('game-start', { 
            turnId: room.players[room.turnIndex].id,
            round: room.round,
            players: room.players,
            settings: room.settings
        });
    }

    socket.on('submit-dilemma', ({ roomCode, option1, option2, type }) => {
        const room = rooms[roomCode];
        if (room && room.players[room.turnIndex].id === socket.id) {
            room.dilemma = { option1, option2, type };
            
            socket.to(roomCode).emit('dilemma-received', { 
                option1, option2, type, 
                creatorName: room.players[room.turnIndex].name 
            });
            
            socket.emit('waiting-for-vote');
        }
    });

    socket.on('vote', ({ roomCode, choice, answer }) => {
        const room = rooms[roomCode];
        if (room) {
            // Track votes
            room.votes[socket.id] = { choice, answer };

            // Check if everyone (except creator) has voted
            const votersCount = room.players.length - 1;
            const currentVotes = Object.keys(room.votes).length;

            if (currentVotes >= votersCount) {
                finishRound(roomCode);
            }
        }
    });

    function finishRound(roomCode) {
        const room = rooms[roomCode];
        if (!room) return;

        let count1 = 0;
        let count2 = 0;
        let answers = []; 

        Object.values(room.votes).forEach(v => {
            if (v.choice === 1) count1++;
            if (v.choice === 2) count2++;
            if (v.answer) answers.push(v.answer);
        });

        const winningChoice = count1 >= count2 ? 1 : 2;

        io.to(roomCode).emit('vote-result', { 
            winningChoice,
            stats: { 1: count1, 2: count2 },
            dilemma: room.dilemma,
            answers: answers 
        });

        // Reset for next round
        room.votes = {};
        room.dilemma = null;
        room.round++;
        
        // Rotate turn
        room.turnIndex = (room.turnIndex + 1) % room.players.length;

        const delay = (answers.length > 0) ? 12000 : 6000;
        
        setTimeout(() => {
            if (rooms[roomCode]) { 
                io.to(roomCode).emit('new-round', { 
                    turnId: room.players[room.turnIndex].id,
                    round: room.round
                });
            }
        }, delay);
    }

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
             if (wasCreator) {
                 room.turnIndex = room.turnIndex % room.players.length;
                 if (room.started) {
                    io.to(roomCode).emit('new-round', {
                        turnId: room.players[room.turnIndex].id,
                        round: room.round
                    });
                 }
             } else if (playerIndex < room.turnIndex) {
                 room.turnIndex--;
             }
             
             io.to(roomCode).emit('player-update', room.players);
        }
    }
}

const PORT = process.env.PORT || 3000;
http.listen(PORT, () => {
    console.log(`Listening on port ${PORT}`);
});
