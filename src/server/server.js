// Server-related functions will go here
var express = require('express');
var http = require('http');
var path = require('path');
var socket = require('socket.io');

var app = express();
var server = http.Server(app);
var io = socket(server);

var room = require('./room');
var player = require('./player');
var arrow = require('./arrow');
var collision = require('./collision');

/*
    Informal Player Interface {
        name: string,
        id: string,
        isInThisRoom: string
    }
*/

app.set('port', 4200);
app.use('/', express.static(path.join(__dirname, '../../')));

app.get('/', function(request, response) {
    response.sendFile(path.join(__dirname, '../../index.html'));
});

server.listen(process.env.PORT || 4200, function() {
    console.log('Starting server on port 4200');
});

io.on('connection', function(socket) {
    socket.on('connect', function() {
        console.log(socket.id);
    });

    socket.on('ConnectToServer', function(playerData) {
        console.log('Connecting using id: ' + socket.id);
        var data = playerData;  // information such as nicknames, location?, character
        var roomId = room.joinRoom(socket.id);
        var identity = {
            name: playerData.name,
            characterIndex: playerData.characterIndex,
            roomId: roomId,
            id: socket.id
        }

        socket.join(roomId);    // Join a socket.io room 
        player.addPlayerToServer(playerData, socket.id, roomId); // Adds player to player array for server
        
        socket.emit('JoinedRoom', identity);
    })

    socket.on('SendPlayerData', function(data) {
        player.updatePlayer(data.playerData, socket.id, data.roomId);
        /*
        var players = player.getPlayers();
        var playerIds = room.getPlayersInRoom(data.roomId); // Get the player ids from the room the player is in.
        var playersInRoom = [];

        if(!playerIds) {
            return;
        }

        for(var i = 0; i < playerIds.length; i++) {
            for(var j = 0; j < players.length; j++) {
                if(playerIds[i] == players[j].id) {
                    playersInRoom.push(players[i]);
                    break;
                }
            }
        }
        // Using the player id, get their information and put that in an array.

        io.sockets.in(data.roomId).emit('GetRoomPlayerData', playersInRoom);
        */
    })

    socket.on('AddArrowData', function(data) {
        room.createArrowInRoom(data.isInThisRoom, data);
        arrow.addArrowToServer(data, socket.id, data.isInThisRoom);
    })

    socket.on('RemoveArrowData', function(data) {
        // delete from room too!
        var arrowIndex = arrow.getArrowIndexById(data.id);
        room.removeArrowFromRoom(data.roomId, arrowIndex)
        arrow.deleteArrowAt(arrowIndex);
    })

    socket.on('SendArrowData', function(data) {
        var arrowIds = room.getArrowsInRoom(data.roomId);
        var arrowsInRoom = [];

        arrowsInRoom = arrow.updateAllArrowsInRoom(arrowIds, data.roomId);

        io.sockets.in(data.roomId).emit('GetRoomArrowData', arrowsInRoom);
    })

    socket.on('SendPickupData', function(data) {
        var pickupObjs = room.getPickupsInRoom(data.roomId);
        io.sockets.in(data.roomId).emit('GetRoomPickupData', pickupObjs);
    })

    socket.on('CheckCollision', function(roomId) {
        // Check collisions
        // Check if anyone was hit by an arrow
        // Send Death response ONLY to the client who died.
        // Send Score respone to ALL clients
        // Send Message respone to ALL clients (bob killed jim)
        var players = player.getPlayers();
        var arrows = arrow.getArrows();

        var c = collision.returnCollided(roomId, players, arrows);

        if(c != undefined) {
            if(players[player.getPlayerIndexById(c.player.id)].isDead) {return;}
            if(c.arrow != undefined) {
                var collisionData = {
                    playerWhoDied: players[player.getPlayerIndexById(c.player.id)],
                    playerWhoKilled: players[player.getPlayerIndexById(c.arrow.belongsTo)]
                }
                
                socket.broadcast.to(collisionData.playerWhoDied.id).emit('YouDied');
                socket.broadcast.to(collisionData.playerWhoKilled.id).emit('YouKilled');
                io.sockets.in(roomId).emit('PlayerWasKilled', collisionData);
            } else {
                if(socket.id == c.player.id) {
                    socket.emit('AddArrowCount');
                } else {
                    socket.broadcast.to(c.player.id).emit('AddArrowCount');
                }
            }
        }
    })

    socket.on("disconnect", function(playerData) {
        var data = playerData;
        var players = player.getPlayers();

        for(var i = 0; i < players.length; i++) {
            if(players[i].id == socket.id) {
                room.removePlayerFromRoom(players[i].isInThisRoom, players[i].id);
                if(room.isRoomEmpty(players[i].isInThisRoom)) {
                    room.deleteRoom(players[i].isInThisRoom);
                }
                player.deletePlayerAt(i);
            }
        }

        console.log('Connection id: ' + socket.id + ' has disconnected from the server');
        socket.emit('Disconnected');
    })

    setInterval(() => {
        var rooms = room.getRooms();
        for(var i = 0; i < rooms.length; i++) {
            var roomId = rooms[i].roomId;
    
            // Update Players
            var players = player.getPlayers();
            var playerIds = room.getPlayersInRoom(roomId); // Get the player ids from the room the player is in.
            var playersInRoom = [];
    
            if(!playerIds) {
                return;
            }
    
            for(var i = 0; i < playerIds.length; i++) {
                for(var j = 0; j < players.length; j++) {
                    if(playerIds[i] == players[j].id) {
                        playersInRoom.push(players[i]);
                        break;
                    }
                }
            }
    
            // Update Arrows
            var arrowIds = room.getArrowsInRoom(roomId);
            var arrowsInRoom = [];
    
            arrowsInRoom = arrow.updateAllArrowsInRoom(arrowIds, roomId);
    
            // Update Pickups
            var pickupObjs = room.getPickupsInRoom(roomId);
    
            var arrows = arrow.getArrows();
            var c = collision.returnCollided(roomId, players, arrows);
    
            if(c != undefined) {
                if(players[player.getPlayerIndexById(c.player.id)].isDead) {return;}
                if(c.arrow != undefined) {
                    var collisionData = {
                        playerWhoDied: players[player.getPlayerIndexById(c.player.id)],
                        playerWhoKilled: players[player.getPlayerIndexById(c.arrow.belongsTo)]
                    }
                    
                    socket.broadcast.to(collisionData.playerWhoDied.id).emit('YouDied');
                    socket.broadcast.to(collisionData.playerWhoKilled.id).emit('YouKilled');
                    io.sockets.in(roomId).emit('PlayerWasKilled', collisionData);
                } else {
                    if(socket.id == c.player.id) {
                        socket.emit('AddArrowCount');
                    } else {
                        socket.broadcast.to(c.player.id).emit('AddArrowCount');
                    }
                }
            }
    
            io.sockets.in(roomId).emit('GetRoomPlayerData', playersInRoom);
            io.sockets.in(roomId).emit('GetRoomArrowData', arrowsInRoom);
            io.sockets.in(roomId).emit('GetRoomPickupData', pickupObjs);
        }
    }, 1000 / 60);

});

