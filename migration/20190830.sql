DROP TABLE if exists contacts;

CREATE TABLE contacts
(
    user_id text not null,
    contact_id text not null,
    timestamp INTEGER not null,
    source text
);