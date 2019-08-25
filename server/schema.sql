CREATE TABLE comments
(
    id text not null unique,
    comment text,
    timestamp integer not null,
    user_id text not null,
    session_id text,
    original_url text,
    sent_to text,
    source text,
    encrypt text,
    for_user text,
    encrypt_group text,
    comment_blob blob,
    fingerprint text,
    fingerprint_from text,
    fingerprint_to text
);

CREATE TABLE session_current_members
(
    session_id text,
    user_id text not null,
    source text,
    unique(session_id,user_id)
);

CREATE TABLE user_connections
(
    user_id text not null,
    socket_id text,
    timestamp integer not null
);

CREATE TABLE files
(
    id text not null,
    user_id text not null,
    path text not null,
    timestamp integer not null,
    kind text
);

CREATE TABLE session_events
(
    id text not null,
    session_id text,
    user_id text not null,
    timestamp integer,
    action text
);

CREATE TABLE user_emails
(
    user_id text not null,
    email text not null
);

CREATE TABLE private_key_temporary
(
    timestamp integer not null,
    user_id text not null,
    private_key text unique not null
);

CREATE TABLE sessions
(
    id text not null unique,
    timestamp integer not null,
    name text not null
);

CREATE TABLE users
(
    id text not null unique,
    timestamp integer not null,
    source text,
    name text not null,
    fullname text,
    password text,
    db_local_password text
);

CREATE TABLE public_keys
(
    timestamp integer,
    user_id text,
    for_user text,
    public_key text unique,
    private_fingerprint text
);

CREATE TABLE user_configs
(
    timestamp integer not null,
    user_id text not null,
    config_name text not null,
    config_value text not null
);
