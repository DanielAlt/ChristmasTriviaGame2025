CREATE TABLE clients (
    id               INTEGER PRIMARY KEY AUTO_INCREMENT,
    name             VARCHAR(255) NOT NULL,
    client_session   VARCHAR(255) NOT NULL
);

CREATE TABLE games (
    id              INTEGER PRIMARY KEY AUTO_INCREMENT,
    name            VARCHAR(255) NOT NULL,
    type            VARCHAR(255) DEFAULT NULL,
    description     TEXT DEFAULT NULL
);

CREATE TABLE questions (
    id              INTEGER PRIMARY KEY AUTO_INCREMENT,
    game_id         INTEGER NOT NULL,
    question_text   TEXT NOT NULL,
    question_image  VARCHAR(255) DEFAULT NULL,
    option_text1    VARCHAR(255) DEFAULT NULL,
    option_text2    VARCHAR(255) DEFAULT NULL,
    option_text3    VARCHAR(255) DEFAULT NULL,
    option_text4    VARCHAR(255) DEFAULT NULL,
    answer          VARCHAR(255) NOT NULL,
    time_limit      INTEGER,
    created_at      DATETIME NOT NULL,
    updated_at      DATETIME DEFAULT NULL,
    points_awarded  INTEGER,
    FOREIGN KEY (game_id) REFERENCES games(id)
);

CREATE TABLE game_sessions (
    id              INTEGER PRIMARY KEY AUTO_INCREMENT,
    started_on      DATETIME,
    question_id     INTEGER NOT NULL,
    FOREIGN KEY (question_id) REFERENCES questions(id)
);

CREATE TABLE rooms (
    id                  INTEGER PRIMARY KEY AUTO_INCREMENT,
    password            CHAR(6) NOT NULL,
    locked              BOOLEAN NOT NULL DEFAULT FALSE,
    host_client         VARCHAR(255) NOT NULL,
    created_at          DATETIME NOT NULL,
    game_id             INTEGER NOT NULL,
    game_session_id     INTEGER DEFAULT NULL,
    FOREIGN KEY (game_id) REFERENCES games(id),
    FOREIGN KEY (game_session_id) REFERENCES game_sessions(id)
);

CREATE TABLE rooms_clients (
    room_id     INTEGER NOT NULL,
    client_id   INTEGER NOT NULL,
    PRIMARY KEY (room_id, client_id),
    FOREIGN KEY (room_id) REFERENCES rooms(id),
    FOREIGN KEY (client_id) REFERENCES clients(id)
);

CREATE TABLE game_session_leaderboards (
    game_session_id     INTEGER NOT NULL,
    client_id           INTEGER NOT NULL,
    score               INTEGER,
    PRIMARY KEY (game_session_id, client_id),
    FOREIGN KEY (game_session_id) REFERENCES game_sessions(id),
    FOREIGN KEY (client_id) REFERENCES clients(id)
);
