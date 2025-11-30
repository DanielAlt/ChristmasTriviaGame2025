require('dotenv').config();

const express       = require('express');
const mysql         = require('mysql2/promise');
const session       = require("express-session");
const exphbs        = require('express-handlebars');
const path          = require('path');
const { Server }    = require("socket.io");
const http          = require("http");

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
    cookie: {
      httpOnly: true,      // Mitigates XSS
      secure: false,       // Set true behind HTTPS
      maxAge: 1000 * 60 * 60 * 24 * 365  // 1 year
    }
  })
);

/** 
 * Create Application Routes 
*/
app.get('/', async (req, res) => {
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

app.get("/create-game", async(req, res) => {
    res.render("create-game");
});

app.post('/create-game', async(req, res) => {

    const gameID = 1;
    
    // Count the number of questions, choose a random starting question
    const question_total_sql = "SELECT id FROM questions WHERE game_id=:game_id";
    const [question_total]   = await pool.query(question_total_sql, {game_id: gameID});
    const randomSeed = randomInt(0,question_total.length-1)
    const starting_question  = question_total[randomSeed].id;

    // Create the game Session
    const create_game_session_sql = 
        `INSERT INTO game_sessions(
            started_on, question_id
        ) VALUES (NOW(), :question_id);`;

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

app.get("/lobby/join", async (req, res) => {
    res.render("join-lobby")
});

app.post("/lobby/join", async(req, res) => {
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
    io.to(`lobby-${myLobby[0].id}`).emit("notifications", { name });

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
        SELECT c.name
        FROM rooms_clients rc 
        LEFT JOIN clients c ON (c.id = rc.client_id)  
        WHERE rc.room_id = :roomID
    `, {
        roomID: req.params.id
    });

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

// Start server
server.listen(process.env.APP_PORT, () => {
  console.log("Server running on http://localhost:3000");
});