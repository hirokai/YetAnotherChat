DROP TABLE if exists temporary_tokens;

CREATE TABLE temporary_tokens
(
    user_id text not null,
    timestamp INTEGER not null,
    kind text not null,
    token text not null
);
