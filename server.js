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

// Global helper for finishing rounds
function finishRound(roomCode) {
    const room = rooms[roomCode];
    if (!room) return;

    let votesByOption = { 1: [], 2: [] };
    let answers = []; 

    Object.entries(room.votes).forEach(([playerId, vote]) => {
        const player = room.players.find(p => p.id === playerId);
        if (player) {
            votesByOption[vote.choice].push(player.name);
            if (vote.answer) {
                // Include the CHOICE so we know context
                answers.push({ 
                    name: player.name, 
                    text: vote.answer,
                    choice: vote.choice 
                });
            }
        }
    });

    const winningChoice = votesByOption[1].length >= votesByOption[2].length ? 1 : 2;

    io.to(roomCode).emit('vote-result', { 
        winningChoice,
        votesByOption, 
        dilemma: room.dilemma,
        answers: answers
    });

    room.votes = {};
    
    const delay = (room.dilemma.type === 'question') ? (answers.length * 10000 + 2000) : 6000;
    
    room.dilemma = null;
    room.round++;
    room.turnIndex = (room.turnIndex + 1) % room.players.length;

    setTimeout(() => {
        if (rooms[roomCode]) { 
            io.to(roomCode).emit('new-round', { 
                turnId: room.players[room.turnIndex].id,
                round: room.round
            });
        }
    }, delay);
}

io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    socket.on('create-room', ({ playerName, maxPlayers, allowedModes }) => {
        if (!playerName || playerName.length > 12) return;
        
        const roomCode = generateRoomCode();
        rooms[roomCode] = {
            players: [{
                id: socket.id,
                name: playerName
            }],
            settings: {
                maxPlayers: maxPlayers || 2,
                allowedModes: allowedModes || ['dilemma', 'question', 'photo']
            },
            started: false,
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
            room.votes[socket.id] = { choice, answer };
            
            // Broadcast progress
            const voters = Object.keys(room.votes).map(id => {
                const p = room.players.find(pl => pl.id === id);
                return p ? p.name : 'Unknown';
            });
            io.to(roomCode).emit('update-vote-status', voters);

            const votersCount = room.players.length - 1;
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
        
        if (room.votes[socket.id]) {
            delete room.votes[socket.id];
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
             
             if (room.dilemma && !wasCreator) {
                 const votersCount = room.players.length - 1;
                 const currentVotes = Object.keys(room.votes).length;
                 if (currentVotes >= votersCount) {
                     finishRound(roomCode);
                 }
             }

             io.to(roomCode).emit('player-update', room.players);
        }
    }
}

const PORT = process.env.PORT || 3000;
http.listen(PORT, () => {
    console.log(`Listening on port ${PORT}`);
});
