DROP TABLE IF EXISTS users;
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

DROP TABLE IF EXISTS comments;
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
    timestamp integer not null
);

DROP TABLE IF EXISTS files;
CREATE TABLE files
(
    id text not null,
    user_id text not null,
    path text not null,
    timestamp integer not null,
    kind text
);

DROP TABLE IF EXISTS session_events;
CREATE TABLE session_events
(
    id text not null,
    session_id text,
    user_id text not null,
    timestamp integer,
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
    timestamp integer not null,
    user_id text not null,
    private_key text unique not null
);

DROP TABLE IF EXISTS sessions;
CREATE TABLE sessions
(
    id text not null unique,
    timestamp integer not null,
    name text not null
);

DROP TABLE IF EXISTS public_keys;
CREATE TABLE public_keys
(
    timestamp integer,
    user_id text,
    for_user text,
    public_key text unique,
    private_fingerprint text
);

DROP TABLE IF EXISTS user_configs;
CREATE TABLE user_configs
(
    timestamp integer not null,
    user_id text not null,
    config_name text not null,
    config_value text not null
);

DROP TABLE IF EXISTS profiles;
CREATE TABLE profiles
(
    timestamp integer not null,
    user_id text not null,
    profile_name text not null,
    profile_value text not null
);