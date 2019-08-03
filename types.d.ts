interface RoomInfo {
    name: string,
    numMessages: Map<string, number>,
    firstMsgTime: number,
    lastMsgTime: number,
    id: string,
    timestamp: number,
    members: Array<string>
}

interface PostCommentResponse {
    ok: boolean,
    data?: CommentTyp,
    error?: string
}


interface AxiosResponse<T> {
    data: T
}


type CommentTyp = {
    kind: "comment";
    id: string,
    user_id: string,
    comment: string,
    session_id: string,
    timestamp: number,
    original_url: string,
    sent_to: string,
    source: string
}

type SessionEvent = {
    kind: "event";
    id: string,
    user_id: string,
    session_id: string,
    timestamp: number,
    action: string,
}

interface MailgunParsed {
    id: string,
    subject: string,
    user_id: string,
    comment: string,
    timestamp: number,
    message_id: string,
    references: string[]
    sent_to: string,
    body: any
}

interface ChatEntryClient {
    id: String,
    user: string,
    comment: string,
    session: string,
    timestamp: string,
    originalUrl: string,
    sentTo: string,
    source: string
    kind: string,
    action: string
}

interface UserSlack {
    id: string,
    real_name: string,
    name: string,
    username: string,
    avatar: string
}


interface User {
    id: string,
    name: string,
    username: string,
    avatar: string
}


interface JsonResponse<T> {
    json: (r: T) => void;
}

interface AuthedParams {
    token: string
}

interface GetSessionsOfParams extends AuthedParams {
    of_members: string,
}

type GetSessionResponse = { ok: boolean, data: RoomInfo }
type PatchSessionResponse = { ok: boolean }
type DeleteCommentResponse = { ok: boolean, data?: DeleteCommentData }
type DeleteCommentData = { comment_id: string, session_id: string }
type GetSessionsResponse = { ok: boolean, data: RoomInfo[] }
type GetUsersResponse = {
    ok: boolean, data: {
        users: string[]
    }
}

type PostSessionsResponse = {
    ok: boolean,
    data?: { id: string },
    error?: string
}

type PostCommentData = {
    user: string,
    session: string,
    comment: string,
    temporary_id: string,   //generated at client to avoid duplicate addition by socket notification.
}


interface GetCommentsParams extends AuthedParams {
    session: string
}

interface PostSessionsParam extends AuthedParams {
    name: string,
    members: string[],
}

interface JoinSessionParam extends AuthedParams {
    session_id: string,
    user_id: string,
}

type JoinSessionResponse = {
    ok: boolean,
    data?: { id: string },
    error?: string
}

type PrivateUserInfo = {
    find_user: (string) => string,
    test_myself: string,
    allowed_users: string[],
    allowed_passwords: string[]
}