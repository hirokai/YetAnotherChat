DROP TABLE if exists email;

CREATE TABLE email
(
    id text not null unique,
    message_id text not null,
    timestamp bigint not null,
    email_from text not null,
    email_to text,
    email_text text,
    reply_to text
);