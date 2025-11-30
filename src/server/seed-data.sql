INSERT INTO games(name, type, description) VALUES (
    'Holiday Lies',
    'Trivia',
    'Holiday Lies is a Trivia Game with a Twist! Players submit Answers to trick each other'
);

INSERT INTO questions(
    game_id,
    question_text, 
    answer, 
    time_limit, 
    created_at, 
    points_awarded
) VALUES (
    1,
    'What artist released the top grossing holiday album of all time?',
    'Elvis Presley',
    60000,
    NOW(),
    10
);

INSERT INTO questions(
    game_id,
    question_text, 
    answer, 
    time_limit, 
    created_at, 
    points_awarded
) VALUES (
    1,
    'In Home Alone 2, what name does Marv come up with to rebrand "The Wet Bandits"?',
    'The Sticky Bandits',
    60000,
    NOW(),
    10
);

INSERT INTO questions(
    game_id,
    question_text, 
    answer, 
    time_limit, 
    created_at, 
    points_awarded
) VALUES (
    1,
    'In Charles Dickens "A Christmas Carol," what was Mr. Scrooges first name?',
    'Ebenezer',
    60000,
    NOW(),
    10
);

INSERT INTO questions(
    game_id,
    question_text, 
    answer, 
    time_limit, 
    created_at, 
    points_awarded
) VALUES (
    1,
    'In Charles Dickens "A Christmas Carol," what was Mr. Scrooges first name?',
    'Ebenezer',
    60000,
    NOW(),
    10
);