DROP TABLE IF EXISTS users;
CREATE TABLE users
(
    id text not null unique,
    timestamp bigint not null,
    source text,
    name text not null,
    fullname text,
    password text,
    db_local_password text
);

DROP TABLE IF EXISTS comments;
CREATE TABLE comments
(
    id text not null unique,
    comment text,
    timestamp bigint not null,
    user_id text not null,
    session_id text,
    original_url text,
    sent_to text,
    source text,
    encrypt text,
    for_user text,
    encrypt_group text,
    comment_blob bytea,
    fingerprint text,
    fingerprint_from text,
    fingerprint_to text
);

DROP TABLE IF EXISTS session_current_members;
CREATE TABLE session_current_members
(
    session_id text,
    user_id text not null,
    source text,
    unique(session_id,user_id)
);

DROP TABLE IF EXISTS user_connections;
CREATE TABLE user_connections
(
    user_id text not null,
    socket_id text,
    timestamp bigint not null
);

DROP TABLE IF EXISTS files;
CREATE TABLE files
(
    id text not null,
    user_id text not null,
    path text not null,
    timestamp bigint not null,
    kind text
);

DROP TABLE IF EXISTS session_events;
CREATE TABLE session_events
(
    id text not null,
    session_id text,
    user_id text not null,
    timestamp bigint,
    action text
);

DROP TABLE IF EXISTS user_emails;
CREATE TABLE user_emails
(
    user_id text not null,
    email text not null
);

DROP TABLE IF EXISTS private_key_temporary;
CREATE TABLE private_key_temporary
(
    timestamp bigint not null,
    user_id text not null,
    private_key text unique not null
);

DROP TABLE IF EXISTS sessions;
CREATE TABLE sessions
(
    id text not null unique,
    timestamp bigint not null,
    name text not null,
    workspace text,
    visibility text
);

DROP TABLE IF EXISTS public_keys;
CREATE TABLE public_keys
(
    timestamp bigint,
    user_id text,
    for_user text,
    public_key text unique,
    private_fingerprint text
);

DROP TABLE IF EXISTS user_configs;
CREATE TABLE user_configs
(
    timestamp bigint not null,
    user_id text not null,
    config_name text not null,
    config_value text not null
);

DROP TABLE IF EXISTS profiles;
CREATE TABLE profiles
(
    timestamp bigint not null,
    user_id text not null,
    profile_name text not null,
    profile_value text not null
);

DROP TABLE if exists contacts;

CREATE TABLE contacts
(
    user_id text not null,
    contact_id text not null,
    timestamp bigint not null,
    source text
);

DROP TABLE if exists workspaces;

CREATE TABLE workspaces
(
    id TEXT not null,
    name TEXT not null,
    timestamp bigint not null,
    kind TEXT,
    visibility TEXT,
    metadata TEXT
);

DROP TABLE if exists users_in_workspaces;

CREATE TABLE users_in_workspaces
(
    user_id text not null,
    workspace_id text not null,
    timestamp bigint not null,
    metadata TEXT
);

DROP TABLE if exists temporary_tokens;

CREATE TABLE temporary_tokens
(
    user_id text not null,
    timestamp bigint not null,
    kind text not null,
    token text not null
);