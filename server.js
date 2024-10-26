const express = require('express');
const multer = require('multer');
const path = require('path');
const crypto = require('crypto');
const fs = require('fs');
const cors = require('cors');
const http = require('http');
const socketIo = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.static('public'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use('/uploads', express.static('uploads'));

// ... (keep all your existing multer configuration and routes) ...

// Checkers game logic
let waitingPlayer = null;

io.on('connection', (socket) => {
    console.log('A user connected');

    if (waitingPlayer) {
        // Start a game
        const gameId = Math.random().toString(36).substring(7);
        socket.join(gameId);
        waitingPlayer.join(gameId);
        io.to(gameId).emit('gameStart', { gameId: gameId });
        io.to(waitingPlayer.id).emit('playerAssign', { color: 'red' });
        io.to(socket.id).emit('playerAssign', { color: 'black' });
        waitingPlayer = null;
    } else {
        waitingPlayer = socket;
    }

    socket.on('makeMove', (move) => {
        socket.to(move.gameId).emit('opponentMove', move);
    });

    socket.on('disconnect', () => {
        if (waitingPlayer === socket) {
            waitingPlayer = null;
        }
        console.log('User disconnected');
    });
});

// ... (keep all your existing routes and middleware) ...

// Start the server
server.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
});
