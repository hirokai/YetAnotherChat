DROP TABLE if exists thread;

CREATE TABLE thread
(
    id text not null unique,
    "name" text not null
);

DROP TABLE if exists email_in_thread;

CREATE TABLE email_in_thread
(
    email_id text not null,
    thread_id text not null
);

DROP TABLE if exists member_in_email;

CREATE TABLE member_in_email
(
    member_email text not null,
    -- role: FROM,TO,CC
    "role" text not null
);

DROP TABLE if exists intention_email;

CREATE TABLE intention_email
(
    email_id text not null,
    member_email text not null,
    -- intention: SHARE_OK,SHARE_NG
    "intention" text not null
);
