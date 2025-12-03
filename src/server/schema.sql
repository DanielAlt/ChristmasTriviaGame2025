DROP DATABASE framework_fun;
CREATE DATABASE framework_fun;

use framework_fun;

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
    ceremony_state  VARCHAR(255) NOT NULL DEFAULT 'play',
    isComplete INTEGER DEFAULT 0,
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

CREATE TABLE game_session_answers(
    id INTEGER PRIMARY KEY AUTO_INCREMENT,
    game_session_id INTEGER NOT NULL,
    client_id INTEGER NOT NULL,
    question_id INTEGER NOT NULL,
    answer VARCHAR(255) NOT NULL,
    FOREIGN KEY (game_session_id) REFERENCES game_sessions(id),
    FOREIGN KEY (client_id) REFERENCES clients(id),
    FOREIGN KEY (question_id) REFERENCES questions(id)
);

CREATE TABLE game_session_trueanswers(
    id INTEGER PRIMARY KEY AUTO_INCREMENT,
    game_session_id INTEGER NOT NULL,
    client_id INTEGER NOT NULL,
    question_id INTEGER NOT NULL,
    answer VARCHAR(255) NOT NULL,
    FOREIGN KEY (game_session_id) REFERENCES game_sessions(id),
    FOREIGN KEY (client_id) REFERENCES clients(id),
    FOREIGN KEY (question_id) REFERENCES questions(id)
);

CREATE TABLE game_session_answer_ceremony(
    id INTEGER PRIMARY KEY AUTO_INCREMENT,
    game_session_id INTEGER NOT NULL,
    question_id INTEGER NOT NULL,
    answer1 VARCHAR(255),
    answer1_client INTEGER,
    answer2 VARCHAR(255),
    answer2_client INTEGER,
    answer3 VARCHAR(255),
    answer3_client INTEGER,
    answer4 VARCHAR(255),
    answer4_client INTEGER,
    correct_answer VARCHAR(255)
);

CREATE TABLE game_session_leaderboards (
    id                  INTEGER PRIMARY KEY AUTO_INCREMENT,
    game_session_id     INTEGER NOT NULL,
    question_id         INTEGER NOT NULL,
    client_id           INTEGER NOT NULL,
    score               INTEGER,
    FOREIGN KEY (question_id) REFERENCES questions(id),
    FOREIGN KEY (game_session_id) REFERENCES game_sessions(id),
    FOREIGN KEY (client_id) REFERENCES clients(id)
);

INSERT INTO games(name, type, description) VALUES (
    'Holiday Lies',
    'Trivia',
    'Holiday Lies is a Trivia Game with a Twist! Players submit Answers to trick each other'
);

INSERT INTO questions(
    game_id,
    question_text, 
    answer, 
    option_text1,
    option_text2,
    option_text3,
    option_text4,
    time_limit, 
    created_at, 
    points_awarded
) VALUES (
    1,
    'What artist released the top grossing holiday album of all time?',
    'Elvis Presley',
    "Justin Beiber",
    "Taylor Swift",
    "Wham",
    "Madonna",
    60000,
    NOW(),
    10
);

INSERT INTO questions(
    game_id,
    question_text, 
    answer, 
    option_text1,
    option_text2,
    option_text3,
    option_text4,
    time_limit, 
    created_at, 
    points_awarded
) VALUES (
    1,
    'In Home Alone 2, what name does Marv come up with to rebrand "The Wet Bandits"?',
    'The Sticky Bandits',
    "The Sly Bandits",
    "The Cat Burglars",
    "The Kidnappers",
    "The Desperados",
    60000,
    NOW(),
    10
);

INSERT INTO questions(
    game_id,
    question_text, 
    answer, 
    option_text1,
    option_text2,
    option_text3,
    option_text4,
    time_limit, 
    created_at, 
    points_awarded
) VALUES (
    1,
    'In Charles Dickens "A Christmas Carol," what was Mr. Scrooges first name?',
    'Ebenezer',
    "Arnold",
    "Aloysius",
    "Martin",
    "Phineas",
    60000,
    NOW(),
    10
);

INSERT INTO questions(
    game_id,
    question_text, 
    answer, 
    option_text1,
    option_text2,
    option_text3,
    option_text4,
    time_limit, 
    created_at, 
    points_awarded
) VALUES (
    1,
    "What was the name of The Grinch's dog in The Grinch who Stole Christmas",
    'Max',
    "Fido",
    "Spot",
    "Radar",
    "Dog",
    60000,
    NOW(),
    10
);

INSERT INTO questions(
    game_id,
    question_text, 
    answer, 
    option_text1,
    option_text2,
    option_text3,
    option_text4,
    time_limit, 
    created_at, 
    points_awarded
) VALUES (
    1,
    "In Friends, which character dresses up as the 'Holiday Armadillo' to teach his son about Hanukkah?",
    "Ross",
    "Monika",
    "Rachael",
    "Chandler",
    "Joey",
    60000,
    NOW(),
    10
);

INSERT INTO questions(
    game_id,
    question_text, 
    answer, 
    option_text1,
    option_text2,
    option_text3,
    option_text4,
    time_limit, 
    created_at, 
    points_awarded
) VALUES (
    1,
    "In the Santa Schmanta episode of American Dad, who sings the opening musical number with Roger the Alien?",
    "Snot",
    "Steve",
    "Stan",
    "Francine",
    "Klaus",
    60000,
    NOW(),
    10
);

INSERT INTO questions(
    game_id,
    question_text, 
    answer, 
    option_text1,
    option_text2,
    option_text3,
    option_text4,
    time_limit, 
    created_at, 
    points_awarded
) VALUES (
    1,
    "What is the name of the building where the classic holiday movie 'Die Hard' takes place?",
    "Nakatomi Plaza",
    "The Empire State Building",
    "The World Trade Center",
    "The Eaton Center",
    "The Louvre",
    60000,
    NOW(),
    10
);

INSERT INTO questions(
    game_id,
    question_text, 
    answer, 
    option_text1,
    option_text2,
    option_text3,
    option_text4,
    time_limit, 
    created_at, 
    points_awarded
) VALUES (
    1,
    "What is the name of the evil magician in Frosty the Snowman?",
    "Professor Hinkle",
    "Mr. Fantastic",
    "Mr. Kudgle",
    "Professor mcCarthy",
    "Randall Hincher",
    60000,
    NOW(),
    10
);

INSERT INTO questions(
    game_id,
    question_text, 
    answer, 
    option_text1,
    option_text2,
    option_text3,
    option_text4,
    time_limit, 
    created_at, 
    points_awarded
) VALUES (
    1,
    " In Home Alone, where does Kevin's family go for Christmas?",
    "Paris",
    "London",
    "Tokyo",
    "Montreal",
    "Amsterdam",
    60000,
    NOW(),
    10
);

INSERT INTO questions(
    game_id,
    question_text, 
    answer, 
    option_text1,
    option_text2,
    option_text3,
    option_text4,
    time_limit, 
    created_at, 
    points_awarded
) VALUES (
    1,
    "What's the highest-grossing Christmas movie of all time?",
    "Home Alone",
    "The Nightmare Before Christmas",
    "Elf",
    "Jingle All The Way",
    "The Santa Claus 2",
    60000,
    NOW(),
    10
);