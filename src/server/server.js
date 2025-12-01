require('dotenv').config();

const express       = require('express');
const mysql         = require('mysql2/promise');
const session       = require("express-session");
const exphbs        = require('express-handlebars');
const path          = require('path');
const { Server }    = require("socket.io");
const http          = require("http");
const MySQLStore    = require("express-mysql-session")(session);

const app = express()
const server = http.createServer(app);
const io = new Server(server);

// Handle socket connections
io.on("connection", (socket) => {
  console.log("A user connected:", socket.id);

  // Join a lobby room
  socket.on("joinLobby", (lobbyId) => {
    socket.join(`lobby-${lobbyId}`);
    console.log(`Socket ${socket.id} joined lobby-${lobbyId}`);
  });
  
  socket.on("disconnect", () => {
    console.log("A user disconnected:", socket.id);
  });
});

/**
 * Establish Database Connection
 */
const pool = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASS,
    database: process.env.DB_NAME,
    port: process.env.DB_PORT,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    namedPlaceholders: true 
});
module.exports = pool;

const sessionStore = new MySQLStore({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASS,
    database: process.env.DB_NAME,
    port: process.env.DB_PORT
});

/** 
 * Configure Templating and Default Routes 
*/

app.engine('hbs', exphbs.engine({
    extname: 'hbs',
    defaultLayout: 'main'
}));
app.set('view engine', 'hbs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static('public'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

/** 
 * Initialize Session Handling 
*/
app.use(
  session({
    secret: process.env.SESSION_SECRET,   // Use an environment variable
    resave: false,
    saveUninitialized: true,
    store: sessionStore,
    cookie: {
      httpOnly: true,
      secure: false, 
      maxAge: 1000 * 60 * 60 * 24 * 365  // 1 year
    }
  })
);

async function lobbyProtection(req, res, next){
// Redirect to Game Lobby if they've already joined a Lobby
    const [isCurrentlyJoinedToLobby] = await pool.query(`
        SELECT rc.room_id, gs.started_on
        FROM clients c
        JOIN rooms_clients rc ON (rc.client_id = c.id)
        LEFT JOIN rooms r ON (rc.room_id = r.id)
        LEFT JOIN game_sessions gs ON (gs.id = r.game_session_id)
        WHERE  
            c.client_session = :clientSession
        LIMIT 1;             
    `, {
       clientSession: req.session.id 
    });
    if (isCurrentlyJoinedToLobby.length){
        if (isCurrentlyJoinedToLobby[0].started_on){
            return res.redirect(`/lobby/${isCurrentlyJoinedToLobby[0].room_id}/play-game`);
        } else {
            return res.redirect(`/lobby/${isCurrentlyJoinedToLobby[0].room_id}`);
        }

    }

    // Redirect to Game Lobby if they're currently hosting a Lobby
    const [isCurrentlyASessionHost] = await pool.query(`
        SELECT r.id, gs.started_on
        FROM rooms r
        JOIN game_sessions gs ON (gs.id = r.game_session_id) 
        WHERE host_client=:hostSessionID
    `, {hostSessionID: req.session.id});
    if (isCurrentlyASessionHost.length){
        if (isCurrentlyASessionHost[0].started_on){
            return res.redirect(`/lobby/${isCurrentlyASessionHost[0].id}/play-game`);
        } else {
            return res.redirect(`/lobby/${isCurrentlyASessionHost[0].id}`);
        }
    }
    
    return next();
} 

/** 
 * Create Application Routes 
*/
app.get('/', lobbyProtection, async (req, res) => {
    res.render('index');
});

function randomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomPassword(length){
    const charset = "ABCDEFGHIJKLMNOPQRSTUVWXYZ"
    let password = "";
    for (let i = 0; i < length ; i++){
        password += charset[randomInt(0,charset.length-1)];
    }
    return (password);
}

function shuffle(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1)); 
        [array[i], array[j]] = [array[j], array[i]];  // swap
    }
    return array;
}

app.get("/create-game", lobbyProtection, async(req, res) => {
    res.render("create-game");
});

app.post('/create-game', lobbyProtection, async(req, res) => {

    const gameID = 1;
    
    // Count the number of questions, choose a random starting question
    const question_total_sql = "SELECT id FROM questions WHERE game_id=:game_id";
    const [question_total]   = await pool.query(question_total_sql, {game_id: gameID});
    const randomSeed = randomInt(0,question_total.length-1)
    const starting_question  = question_total[randomSeed].id;

    // Create the game Session
    const create_game_session_sql = 
        `INSERT INTO game_sessions(
            question_id
        ) VALUES (:question_id);`;

    const [gameSession] = await pool.execute(create_game_session_sql, {
        question_id: starting_question
    });

    // Create the 'Room/Lobby' 
    // TODO : Avoid PASSWORD COLLISIONS
    const create_room_sql = 
        `INSERT INTO rooms(
            password, 
            host_client, 
            created_at, 
            game_id, 
            game_session_id
        ) VALUES (
            :password, 
            :host_client, 
            NOW(), 
            :game_id, 
            :game_session_id
        );`;

    const [room] = await pool.execute(create_room_sql, {
        password: randomPassword(6), 
        host_client: req.session.id, 
        game_id: gameID, 
        game_session_id: gameSession.insertId
    });

    // Redirect to the new Lobby
    res.redirect(`/lobby/${room.insertId}`);
});

app.get("/lobby/join", lobbyProtection, async (req, res) => {
    res.render("join-lobby")
});

app.post("/lobby/join", lobbyProtection, async(req, res) => {
    /**
     * Collect Input Data and Validate it 
     */
    let name      = req.body.name;
    let password  = req.body.password;

    if (name.length > 255){
        req.session.errors  = {name: "'name' cannot exceed 255 characters"};
        return res.status(422).send({name: "'name' cannot exceed 255 characters"});
    }
    if (password.length !== 6){
        req.session.errors =  {password: "'password' must be 6 characters"};
        return res.status(422).send({password: "'password' must be 6 characters"});
    }

    password = password.toUpperCase();

    /** 
     * Find the appropriate Lobby from the Password 
    */
    const [myLobby] = await pool.query(
        `SELECT * FROM rooms where trim(rooms.password) = :password LIMIT 1;`,
        {password: password}
    ); 
    if (!myLobby[0]) return res.status(422).send({password: "incorrect password"});
    
    /** 
     * Check if the client exists already 
    */
    const [clientCheck] = await pool.query(
        "SELECT * FROM clients WHERE client_session = :clientSession LIMIT 1;",
        {clientSession: req.session.id}
    )
    const clientPreExists = (!!clientCheck[0]);
    let createClient;
    if (!clientPreExists){
        /**
         * Create the Client if not exists 
        */
        [createClient] = await pool.execute(`
            INSERT INTO clients (
                name, 
                client_session
            ) VALUES (
                :name, 
                :client_session
            );
        `, {
            name: name,
            client_session: req.session.id
        });
    }

    /** 
     * Assure Client is not already assigned to Room, if so Redirect to Room
    */
    const [clientRoomCheck] = await pool.query(`
        SELECT * FROM rooms_clients 
        WHERE 
            room_id=:roomID AND 
            client_id=:clientID 
        LIMIT 1;
    `, {
        roomID: myLobby[0].id,
        clientID: clientPreExists ? clientCheck[0].id : createClient.insertId
    }); 

    if (clientRoomCheck[0]) return res.redirect(`/lobby/${myLobby[0].id}`);

    const [assignClientToRoom] = await pool.execute(`
        INSERT INTO rooms_clients(room_id, client_id) VALUES (:roomID, :clientID);       
    `, {
        roomID: myLobby[0].id,
        clientID: clientPreExists ? clientCheck[0].id : createClient.insertId
    });

    // Notify all clients in the lobby
    io.to(`lobby-${myLobby[0].id}`).emit("player-join", { name });

    res.redirect(`/lobby/${myLobby[0].id}`);
});

app.get("/lobby/:id", async (req, res) => {

    // Get Room Info
    const [roomInfo] = await pool.query(`
        SELECT * FROM rooms WHERE rooms.id = :roomID
    `, {roomID: req.params.id});
    if (!roomInfo[0]) return res.status(404).render("not-found");
    const isRoomOwner = (req.session.id == roomInfo[0].host_client);

    // Get Game Info
    const [gameInfo] = await pool.query(`
        SELECT * FROM games WHERE (
            games.id = (SELECT r.game_id FROM rooms r WHERE r.id=:roomID)
        ) LIMIT 1;
    `, {roomID: req.params.id});
    if (!gameInfo[0]) return res.status(404).render("not-found");
    
    // Get all Connected Clients 
    const [connectedClients] = await pool.query(`
        SELECT c.name, c.client_session
        FROM rooms_clients rc 
        LEFT JOIN clients c ON (c.id = rc.client_id)  
        WHERE rc.room_id = :roomID
    `, {
        roomID: req.params.id
    });

    // If this player has not joined, or is not the Host; redirect to Join Page
    const isHost = (req.session.id == roomInfo[0].host_client);
    let isPlayer = false;
    for (let i=0; i < connectedClients.length; i++){
        if (req.session.id == connectedClients[i].client_session){
            isPlayer = true;
        }
    }
    if (!isPlayer && !isHost){
        return res.redirect("/lobby/join");
    }

    // Get My Info
    const [myInfo] = await pool.query(`
        SELECT * FROM clients WHERE client_session = :clientSession
    `, {clientSession: req.session.id});
    for(let i = 0; i  < connectedClients.length; i++){
        if (myInfo[0] && connectedClients[i].name == myInfo[0].name){
            connectedClients[i].isMe = true;
        }
    }

    // Return Lobby HTML
    res.render("lobby", {
        gameInfo: gameInfo[0], 
        roomInfo: roomInfo[0],
        isRoomOwner: isRoomOwner,
        connectedClients: connectedClients,
        myInfo: myInfo
    });
});

app.post("/lobby/:id/start-timer", async(req, res) => {

    const minClients = 3;

    // Check to assure Lobby exists. 
    const [myLobby] = await pool.query(
        `SELECT 1 FROM rooms WHERE rooms.id = :roomID LIMIT 1;`,
        {roomID: req.params.id}
    );
    if (!myLobby[0]) return res.status(404).render("not-found");

    // Check clientConnections to assure the minimum number of clients has joined
    const [numClients] = await pool.query(
        `SELECT COUNT(*) as count FROM rooms_clients WHERE room_id=:roomID`,
        {roomID: req.params.id}
    ); 
    if (!numClients[0]) return res.status(404).render("not-found");

    if (numClients[0].count < minClients){
        return res.status(422).send({
            "message": "Not Enough Players in Lobby"
        });
    }

    // Assure the requesting user is the Game HOST 
    const [isGameHost] = await pool.query(
        `SELECT 1 FROM rooms WHERE host_client = :hostClient LIMIT 1;`,
        { hostClient: req.session.id }
    );
    if (!isGameHost[0]){
        return res.status(403).send({
            "message": "Only the Host can Start a Game Timer"
        });
    }

    // Notify all clients in the lobby Game is about to begin
    io.to(`lobby-${req.params.id}`).emit("timer-start", {time: 30});

    res.send({message:"counter started"});
});

app.post("/lobby/:id/start-game", async(req, res) => {
    // Check to assure Lobby exists. 
    const [myLobby] = await pool.query(
        `SELECT * FROM rooms WHERE rooms.id = :roomID LIMIT 1;`,
        {roomID: req.params.id}
    );
    if (!myLobby[0]) return res.status(404).render("not-found");

    // Check clientConnections to assure the minimum number of clients has joined
    const minClients = 3;
    const [numClients] = await pool.query(
        `SELECT COUNT(*) as count FROM rooms_clients WHERE room_id=:roomID`,
        {roomID: req.params.id}
    ); 
    if (!numClients[0]) return res.status(404).render("not-found");

    if (numClients[0].count < minClients){
        return res.status(422).send({
            "message": "Not Enough Players in Lobby"
        });
    }

    // Assure the requesting user is the Game HOST 
    const [isGameHost] = await pool.query(
        `SELECT 1 FROM rooms WHERE host_client = :hostClient LIMIT 1;`,
        { hostClient: req.session.id }
    );
    if (!isGameHost[0]){
        return res.status(403).send({
            "message": "Only the Host can Start a Game"
        });
    }

    // Set the game to Started
    console.log(myLobby[0]);
    const [gameSessionUpdate] = await pool.execute(`
        UPDATE game_sessions SET started_on = NOW() WHERE game_sessions.id=:gameSessionID;
    `, {gameSessionID: myLobby[0].game_session_id});

    // Notify all clients in the lobby Game starts Now!
    io.to(`lobby-${req.params.id}`).emit("game-start", {url: 
        `/lobby/${req.params.id}/play-game`
    });

    res.send({"message": "The game begins now"});
});

app.get("/lobby/:id/play-game", async(req, res) => {

    // Assure Room Exists, get room Info    
    const [lobbyInfo] = await pool.query(`
        SELECT * FROM rooms WHERE rooms.id = :roomID LIMIT 1;
    `, {roomID: req.params.id}); 
    if (!lobbyInfo[0]) return res.status(404).render("not-found");


    const isGameHost = (lobbyInfo[0].host_client == req.session.id);

    // Assure Player belongs to Room get PLayer Info (or is host)
    const [playerInfo] = await pool.query(`
        SELECT 
            c.name, c.id
        FROM clients c
        JOIN rooms_clients rc ON (rc.client_id = c.id)
        WHERE 
            c.client_session = :clientSession AND
            rc.room_id = :roomID
    `, {
        clientSession: req.session.id,
        roomID: req.params.id
    });

    if (!playerInfo[0] && !isGameHost) return res.status(404).render("not-found");

    const [allPlayers] = await pool.query(`
        SELECT 
            c.name, c.id 
        FROM clients c
        JOIN rooms_clients rc ON (rc.client_id = c.id)
        WHERE 
            rc.room_id = :roomID;
    `, {
        roomID: req.params.id
    });

    // Get the Game Session Object
    const [gameSession] = await pool.query(`
        SELECT * from game_sessions WHERE game_sessions.id = :gameSessionID LIMIT 1;
    `, {
        gameSessionID: lobbyInfo[0].game_session_id
    });
    if (!gameSession[0]) return res.status(500).render("internal-error");
    
    // if the Game Hasn't started, boot the player back to the lobby
    if (!gameSession[0].started_on){
        return res.redirect(`/lobby/${request.params.id}`);
    }

    // Assure the Player has not already Lied
    if (!isGameHost){
        const [myPreviousLie] = await pool.query(`
            SELECT 1 FROM game_session_answers 
            WHERE 
                client_id=:clientID AND 
                question_id=:questionID AND 
                game_session_id=:gameSessionID;
        `, {
            clientID: playerInfo[0].id,
            questionID: gameSession[0].question_id,
            gameSessionID: gameSession[0].id
        });
        if (myPreviousLie.length){
            return res.redirect(`/lobby/${req.params.id}/play-game/${lobbyInfo[0].game_session_id}/waiting-room`);
        }
    }

    // Get the current Question 
    const [question] = await pool.query(`
        SELECT * FROM questions   
        WHERE questions.id = :questionID LIMIT 1;
    `, { questionID : gameSession[0].question_id }
    );
    if (!question[0]) return res.status(500).render("internial-error");

    // Get the Current Submitted 'lies'
    const [existingAnswers] = await pool.query(`
        SELECT * FROM  game_session_answers WHERE 
            game_session_id = :gameSessionID AND 
            question_id = :questionID;
    `, {
        gameSessionID: gameSession[0].id,
        questionID: gameSession[0].question_id
    })

    res.render("game", {
        question: question[0],
        gameSession: gameSession[0],
        playerInfo: playerInfo[0],
        lobbyInfo: lobbyInfo[0],
        isGameHost: isGameHost,
        existingAnswers: existingAnswers,
        allPlayers: allPlayers
    });
});

app.post("/lobby/:lobby_id/play-game/:game_session_id/submit-lie", async (req, res) => {

    // Assure Room Exists, get room Info
    const [lobbyInfo] = await pool.query(`
        SELECT * FROM rooms WHERE rooms.id = :roomID LIMIT 1;
    `, {roomID: req.params.lobby_id}); 
    if (!lobbyInfo[0]) return res.status(404).render("not-found");

    // Assure Game Session Exists, get session Info
    const [gameSessionInfo] = await pool.query(`
        SELECT * FROM game_sessions WHERE game_sessions.id=:gameSessionsID LIMIT 1;
    `, {gameSessionsID: req.params.game_session_id });
    if (!gameSessionInfo[0]) return res.status(404).render("not-found");

    // Host is Banned from answering Questions
    const isGameHost = (lobbyInfo[0].host_client == req.session.id);
    if (isGameHost) return res.status(422).send({"message": "The Game Host cannot submit answers"});

    // Assure Player belongs to Room get PLayer Info
    const [playerInfo] = await pool.query(`
        SELECT 
            c.name, c.id
        FROM clients c
        JOIN rooms_clients rc ON (rc.client_id = c.id)
        WHERE 
            c.client_session = :clientSession AND
            rc.room_id = :roomID
    `, {
        clientSession: req.session.id,
        roomID: req.params.lobby_id
    });
    if (!playerInfo[0]) return res.status(403).send({
        message: "You are not permitted to answer in this room"
    });

    // Get User Input and validate 
    const lie_submitted = req.body.answer;
    if (lie_submitted.length > 255){
        return res.status(422).send({
            message: "The lie you submitted is too long, try something shorter"
        });
    }

    // Assure the Player has not already Lied
    const [myPreviousLie] = await pool.query(`
        SELECT 1 FROM game_session_answers 
        WHERE 
            client_id=:clientID AND 
            question_id=:questionID AND 
            game_session_id=:gameSessionID;
    `, {
        clientID: playerInfo[0].id,
        questionID: gameSessionInfo[0].question_id,
        gameSessionID: req.params.game_session_id
    });
    if (myPreviousLie.length){
        // return res.status(422).send({"message": "You already answered this question"});
        return res.redirect(`/lobby/${req.params.lobby_id}/play-game/${req.params.game_session_id}/waiting-room`);
    }

    // Create the lie and Update the Host's Websocket
    const [myLie] = await pool.execute(`
        INSERT INTO game_session_answers(
            game_session_id,
            client_id,
            question_id, 
            answer
        ) VALUES (
            :gameSessionID,
            :clientID,
            :questionID,
            :answer 
        );
    `, {
        clientID: playerInfo[0].id,
        questionID: gameSessionInfo[0].question_id,
        gameSessionID: req.params.game_session_id,
        answer: lie_submitted
    });

    
    // Notify all clients in the game, an answer is submitted and by whom
    io.to(`lobby-${req.params.lobby_id}`).emit("answer-submitted", {playerName: 
        playerInfo[0].name
    });
    
    return res.redirect(`/lobby/${req.params.lobby_id}/play-game/${req.params.game_session_id}/waiting-room`);
});

app.get("/lobby/:lobby_id/play-game/:game_session_id/waiting-room", async (req, res) => {
    // Check to assure Lobby exists. 
    const [myLobby] = await pool.query(
        `SELECT * FROM rooms WHERE rooms.id = :roomID LIMIT 1;`,
        {roomID: req.params.lobby_id}
    );
    if (!myLobby[0]) return res.status(404).render("not-found");
   
    // Assure Game Session Exists, get session Info
    const [gameSessionInfo] = await pool.query(`
        SELECT * FROM game_sessions WHERE game_sessions.id=:gameSessionsID LIMIT 1;
    `, {gameSessionsID: req.params.game_session_id });
    if (!gameSessionInfo[0]) return res.status(404).render("not-found");

    // Determine GameSession State (redirect if state incorrect)
    if (gameSessionInfo[0].ceremony_state == "answer"){
        res.redirect(`/lobby/${req.params.lobby_id}/play-game/${req.params.game_session_id}/answer-ceremony`)
    }

    res.render("game-holdingRoom", {
        gameSession: gameSessionInfo[0],
        lobbyInfo: myLobby[0],
        answerMode: false
    });
});

app.post("/lobby/:lobby_id/play-game/:game_session_id/answer-ceremony", async (req, res) => {

    // Check to assure Lobby exists. 
    const [myLobby] = await pool.query(
        `SELECT * FROM rooms WHERE rooms.id = :roomID LIMIT 1;`,
        {roomID: req.params.lobby_id}
    );
    if (!myLobby[0]) return res.status(404).render("not-found");

    // Assure Game Session Exists, get session Info
    const [gameSessionInfo] = await pool.query(`
        SELECT * FROM game_sessions WHERE game_sessions.id=:gameSessionsID LIMIT 1;
    `, {gameSessionsID: req.params.game_session_id });
    if (!gameSessionInfo[0]) return res.status(404).render("not-found");

    // Assure the requesting user is the Game HOST 
    const [isGameHost] = await pool.query(
        `SELECT 1 FROM rooms WHERE host_client = :hostClient LIMIT 1;`,
        { hostClient: req.session.id }
    );
    if (!isGameHost[0]){
        return res.status(403).send({
            "message": "Only the Host can iniate the Answer Ceremony"
        });
    }

    // Update GameSession Ceremony State
    const [gameSessionStore] = await pool.execute(`
        UPDATE game_sessions SET ceremony_state = 'answer' WHERE id=:gameSessionID;
    `, {
        gameSessionID: gameSessionInfo[0].id
    });
   
    // Get the current Question 
    const [question] = await pool.query(`
        SELECT * FROM questions   
        WHERE questions.id = :questionID LIMIT 1;
    `, { questionID : gameSessionInfo[0].question_id }
    );
    if (!question[0]) return res.status(500).render("internal-error");

    // Get the Current Submitted 'lies'
    const [existingAnswers] = await pool.query(`
        SELECT * FROM  game_session_answers WHERE 
            game_session_id = :gameSessionID AND 
            question_id = :questionID;
    `, {
        gameSessionID: gameSessionInfo[0].id,
        questionID: gameSessionInfo[0].question_id
    });

    shuffledAnswers = shuffle(existingAnswers);

    // Create the game_session_answer_ceremony
    let answer_dict = {
        answer1       : undefined,
        answer1Client : undefined,
        answer2       : undefined,
        answer2Client : undefined,
        answer3       : undefined,
        answer3Client : undefined,
        answer4       : undefined, 
        answer4Client : undefined
    } 
    let notAllowedAnswers = [];
    for (let i = 0; i < shuffledAnswers.length; i++){
        // If the submitted answer is the real answer choose a default lie 
        // If it happens more than once, choose a different default lie
        if (shuffledAnswers[i].answer.trim().toLowerCase() == question[0].answer.trim().toLowerCase()){
            let defaultOptions = ['option_text1', 'option_text2', 'option_text3', 'option_text4'];
            let defaultOption; 
            for (let j = 0; j < defaultOptions.length; j++){
                if (notAllowedAnswers.indexOf(defaultOptions[j]) === -1 ){
                    defaultOption = defaultOptions[j];
                    notAllowedAnswers.push(defaultOptions[j]);
                    break;
                }
            }
            answer_dict["answer" + (i+1)] = question[0][defaultOption]
            answer_dict["answer" + (i+1) + "Client"] = shuffledAnswers[i].client_id;
        } else {
            answer_dict["answer" + (i+1)] = shuffledAnswers[i].answer.trim().toLowerCase();
            answer_dict["answer" + (i+1) + "Client"] = shuffledAnswers[i].client_id;
        }
    }
    answer_dict.answer4 = question[0].answer;
    answer_dict.answer4Client = 0;


    const [myCeremonyStore] = await pool.execute(`
        INSERT INTO game_session_answer_ceremony(
            game_session_id,
            question_id,
            answer1,
            answer1_client,
            answer2,
            answer2_client,
            answer3,
            answer3_client,
            answer4,
            answer4_client,
            correct_answer
        ) VALUES (
            :gameSessionID,
            :questionID,
            :answer1,
            :answer1Client,
            :answer2,
            :answer2Client,
            :answer3,
            :answer3Client,
            :answer4,
            :answer4Client,
            :correctAnswer
        );
    `,{...{
        gameSessionID: gameSessionInfo[0].id,
        questionID: gameSessionInfo[0].question_id,
        correctAnswer: question[0].answer,
    }, ...answer_dict});

    // Notify all clients that the Answer Ceremony starts Now!
    io.to(`lobby-${req.params.lobby_id}`).emit("answer-ceremony", {url: 
        `/lobby/${req.params.lobby_id}/play-game/${req.params.game_session_id}/answer-ceremony`
    });

});

app.get("/lobby/:lobby_id/play-game/:game_session_id/answer-ceremony", async (req, res) => {

    // Check to assure Lobby exists. 
    const [lobbyInfo] = await pool.query(
        `SELECT * FROM rooms WHERE rooms.id = :roomID LIMIT 1;`,
        {roomID: req.params.lobby_id}
    );
    if (!lobbyInfo[0]) return res.status(404).render("not-found");

    // Assure Game Session Exists, get session Info
    const [gameSessionInfo] = await pool.query(`
        SELECT * FROM game_sessions WHERE game_sessions.id=:gameSessionsID LIMIT 1;
    `, {gameSessionsID: req.params.game_session_id });
    if (!gameSessionInfo[0]) return res.status(404).render("not-found");


    const isGameHost = (lobbyInfo[0].host_client == req.session.id);

    // Assure Player belongs to Room get PLayer Info (or is host)
    const [playerInfo] = await pool.query(`
        SELECT 
            c.name, c.id
        FROM clients c
        JOIN rooms_clients rc ON (rc.client_id = c.id)
        WHERE 
            c.client_session = :clientSession AND
            rc.room_id = :roomID
    `, {
        clientSession: req.session.id,
        roomID: req.params.lobby_id
    });

    if (!playerInfo[0] && !isGameHost) return res.status(404).render("not-found");

    const [allPlayers] = await pool.query(`
        SELECT 
            c.name, c.id 
        FROM clients c
        JOIN rooms_clients rc ON (rc.client_id = c.id)
        WHERE 
            rc.room_id = :roomID;
    `, {
        roomID: req.params.lobby_id
    });

    // Get the current Question 
    const [question] = await pool.query(`
        SELECT * FROM questions   
        WHERE questions.id = :questionID LIMIT 1;
    `, { questionID : gameSessionInfo[0].question_id }
    );
    if (!question[0]) return res.status(500).render("internial-error");

    // Get the game_session_answer_ceremony
    const [answers] = await pool.query(`
        SELECT * 
        FROM game_session_answer_ceremony 
        WHERE 
            question_id = :questionID AND 
            game_session_id = :gameSessionID;
    `, {
        questionID: question[0].id,
        gameSessionID: gameSessionInfo[0].id
    });

    // Get The number of Answers already submitted
    const [answersSubmitted] = await pool.query(`
        SELECT * 
        FROM game_session_trueanswers 
        WHERE 
            game_session_id = :gameSessionID AND
            question_id = :questionID;
        `
    , {
        questionID: question[0].id,
        gameSessionID: gameSessionInfo[0].id    
    });
    
    res.render("game-answer-ceremony", {
        lobbyInfo: lobbyInfo[0],
        gameSession: gameSessionInfo[0],
        question: question[0],
        answers: answers[0],
        answersSubmitted: answersSubmitted,
        isGameHost: isGameHost,
        allPlayers: allPlayers
    })
});

app.post("/lobby/:lobby_id/play-game/:game_session_id/submit-answer", async (req, res) => {
    // Check to assure Lobby exists. 
    const [myLobby] = await pool.query(
        `SELECT * FROM rooms WHERE rooms.id = :roomID LIMIT 1;`,
        {roomID: req.params.lobby_id}
    );
    if (!myLobby[0]) return res.status(404).render("not-found");

    // Assure Game Session Exists, get session Info
    const [gameSessionInfo] = await pool.query(`
        SELECT * FROM game_sessions WHERE game_sessions.id=:gameSessionsID LIMIT 1;
    `, {gameSessionsID: req.params.game_session_id });
    if (!gameSessionInfo[0]) return res.status(404).render("not-found");

    // Assure the requesting user is a valid player for this lobby
    const [playerInfo] = await pool.query(
        `SELECT 
            c.id, c.name 
        FROM clients c 
        JOIN rooms_clients rc ON (rc.client_id = c.id)
        WHERE 
            c.client_session = :clientSession AND 
            rc.room_id = :roomID
        LIMIT 1;`,
        { 
            clientSession: req.session.id,
            roomID: myLobby[0].id
        }
    );
    if (!playerInfo[0]){
        return res.status(403).send({
            "message": "You are not assigned to this Lobby"
        });
    }

    // Check if user already Answered, Boot them to waiting room
    const [existingAnswers] = await pool.query(`
        SELECT * 
        FROM game_session_trueanswers 
        WHERE 
             game_session_id = :gameSessionID AND 
             client_id = :clientID AND 
             question_id = :questionID
    `, {
        gameSessionID: gameSessionInfo[0].id,
        clientID: playerInfo[0].id,
        questionID: gameSessionInfo[0].question_id
    });
    if (existingAnswers.length){
        return res.redirect(`/lobby/${req.params.lobby_id}/play-game/${gameSessionInfo[0].id}/answer-ceremony/waiting-room`)
    }

    const [getPossibleAnswers] = await pool.query(`
        SELECT * 
        FROM game_session_answer_ceremony 
        WHERE 
            game_session_id = :gameSessionID AND
            question_id = :questionID
    `, {
        gameSessionID: gameSessionInfo[0].id,
        questionID: gameSessionInfo[0].question_id
    }
    );

    let possibleAnswers = [];
    possibleAnswers.push(getPossibleAnswers[0].answer1.trim().toLowerCase());
    possibleAnswers.push(getPossibleAnswers[0].answer2.trim().toLowerCase());
    possibleAnswers.push(getPossibleAnswers[0].answer3.trim().toLowerCase());
    possibleAnswers.push(getPossibleAnswers[0].answer4.trim().toLowerCase());

    // Get the User Input and Validate
    const myAnswer = req.body.answer.trim().toLowerCase();
    if (possibleAnswers.indexOf(myAnswer) === -1){
        return res.status(422).send({"message": "That's not one of the avaiable answers"});
    }

    const answerStore = await pool.execute(`
        INSERT INTO game_session_trueanswers(
            game_session_id,
            client_id,
            question_id,
            answer
        ) VALUES (
            :gameSessionID, 
            :clientID,
            :questionID,
            :answer
        );
    `, {
        gameSessionID: gameSessionInfo[0].id, 
        clientID: playerInfo[0].id,
        questionID: gameSessionInfo[0].question_id,
        answer: myAnswer
    });
    

        // Notify all clients that the Answer Ceremony starts Now!
    io.to(`lobby-${req.params.lobby_id}`).emit("answer-submitted", {teamName: 
        playerInfo[0].name
    });

    res.redirect(`/lobby/${req.params.lobby_id}/play-game/${gameSessionInfo[0].id}/answer-ceremony/waiting-room`)

});

app.get("/lobby/:lobby_id/play-game/:game_session_id/answer-ceremony/waiting-room", async (req, res) => {
    // Check to assure Lobby exists. 
    const [myLobby] = await pool.query(
        `SELECT * FROM rooms WHERE rooms.id = :roomID LIMIT 1;`,
        {roomID: req.params.lobby_id}
    );
    if (!myLobby[0]) return res.status(404).render("not-found");
   
    // Assure Game Session Exists, get session Info
    const [gameSessionInfo] = await pool.query(`
        SELECT * FROM game_sessions WHERE game_sessions.id=:gameSessionsID LIMIT 1;
    `, {gameSessionsID: req.params.game_session_id });
    if (!gameSessionInfo[0]) return res.status(404).render("not-found");

    res.render("game-holdingRoom", {
        gameSession: gameSessionInfo[0],
        lobbyInfo: myLobby[0],
        answerMode: true
    });    
});

app.post("/lobby/:lobby_id/play-game/:game_session_id/answer-reveal-ceremony", async (req, res) => {
    // Check to assure Lobby exists. 
    const [myLobby] = await pool.query(
        `SELECT * FROM rooms WHERE rooms.id = :roomID LIMIT 1;`,
        {roomID: req.params.lobby_id}
    );
    if (!myLobby[0]) return res.status(404).render("not-found");

    // Assure Game Session Exists, get session Info
    const [gameSessionInfo] = await pool.query(`
        SELECT * FROM game_sessions WHERE game_sessions.id=:gameSessionsID LIMIT 1;
    `, {gameSessionsID: req.params.game_session_id });
    if (!gameSessionInfo[0]) return res.status(404).render("not-found");

    // Assure the requesting user is the Game HOST 
    const [isGameHost] = await pool.query(
        `SELECT 1 FROM rooms WHERE host_client = :hostClient LIMIT 1;`,
        { hostClient: req.session.id }
    );
    if (!isGameHost[0]){
        return res.status(403).send({
            "message": "Only the Host can iniate the Answer Reveal Ceremony"
        });
    }

    // Update GameSession Ceremony State
    const [gameSessionStore] = await pool.execute(`
        UPDATE game_sessions SET ceremony_state = 'answer-reveal' WHERE id=:gameSessionID;
    `, {
        gameSessionID: gameSessionInfo[0].id
    });

    // Get the current Question 
    const [question] = await pool.query(`
        SELECT * FROM questions   
        WHERE questions.id = :questionID LIMIT 1;
    `, { questionID : gameSessionInfo[0].question_id }
    );
    if (!question[0]) return res.status(500).render("internal-error");

    // Get the Ceremony Data  
    const [answerCeremony] = await pool.query(`
        SELECT * 
        FROM game_session_answer_ceremony 
        WHERE  
            game_session_id = :gameSessionID AND
            question_id = :questionID;
    `, {
        gameSessionID: gameSessionInfo[0].id,
        questionID: gameSessionInfo[0].question_id 
    });

    // Get the players Answers
    const [playersAnswers] = await pool.query(`
        SELECT * 
        FROM game_session_trueanswers
        WHERE 
            game_session_id = :gameSessionID AND
            question_id = :questionID;
    `, {
        gameSessionID: gameSessionInfo[0].id,
        questionID: gameSessionInfo[0].question_id
    });

    // Determine Player Scores
    scores = {}    
    for (let j = 0 ; j < playersAnswers.length; j++){
        scores[playersAnswers[j].client_id] = 0; 
    }

    for (let i = 0 ; i < playersAnswers.length; i++){
        if (playersAnswers[i].answer.trim().toLowerCase() == answerCeremony[0].correct_answer){
            scores[playersAnswers[i].client_id] += 10;
        }

        if (playersAnswers[i].answer.trim().toLowerCase() == answerCeremony[0].answer1){
            scores[answerCeremony[0].answer1_client] += 5;
        }
        if (playersAnswers[i].answer.trim().toLowerCase() == answerCeremony[0].answer2){
            scores[answerCeremony[0].answer2_client] += 5;
        }
        if (playersAnswers[i].answer.trim().toLowerCase() == answerCeremony[0].answer3){
            scores[answerCeremony[0].answer3_client] += 5;
        }
    }

    // Save Scores to Leaderboards
    const scoreKeys = Object.keys(scores);
    for (let x = 0; x < scoreKeys.length; x++){
        const myLeaderBoardStore = await pool.execute(`
            INSERT INTO game_session_leaderboards (
                game_session_id, 
                question_id,
                client_id,
                score
            ) VALUES (
                :gameSessionID,
                :questionID,
                :clientID,
                :score 
            );
        `, {
            gameSessionID: gameSessionInfo[0].id,
            clientID: scoreKeys[x],
            questionID: gameSessionInfo[0].question_id,
            score: scores[scoreKeys[x]]
        });
    }

    // Notify all clients that the Answer Reveal Ceremony Begins Now!
    io.to(`lobby-${req.params.lobby_id}`).emit("answer-reveal-ceremony", {url: 
        `/lobby/${req.params.lobby_id}/play-game/${gameSessionInfo[0].id}/answer-reveal-ceremony`
    });

    res.send({message: "Calculated Scores, Answer Reveal Ceremony"});
});

app.get("/lobby/:lobby_id/play-game/:game_session_id/answer-reveal-ceremony", async (req, res) => {
    res.send("answer reveal ceremony");
});



// start-game -> join-lobby -> play-game -> waiting room -> answer ceremony

// Start server
server.listen(process.env.APP_PORT, () => {
  console.log("Server running on http://localhost:3000");
});