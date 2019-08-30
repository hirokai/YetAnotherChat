DROP TABLE if exists contacts;

CREATE TABLE contacts
(
    user_id text not null,
    contact_id text not null,
    timestamp INTEGER not null,
    source text
);

DROP TABLE if exists workspaces;

CREATE TABLE workspaces
(
    id TEXT not null,
    name TEXT not null,
    timestamp INTEGER not null,
    kind TEXT,
    metadata TEXT
);

DROP TABLE if exists users_in_workspaces;

CREATE TABLE users_in_workspaces
(
    user_id text not null,
    workspace_id text not null,
    timestamp INTEGER not null,
    metadata TEXT
);