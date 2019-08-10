type RoomInfo = {
    name: string,
    numMessages: Map<string, number>,
    firstMsgTime: number,
    lastMsgTime: number,
    id: string,
    timestamp: number,
    members: Array<string>
}

type RoomInfoClient = {
    name: string,
    numMessages: object,
    firstMsgTime: number,
    lastMsgTime: number,
    id: string,
    timestamp: string,
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

type ChatFile = {
    id: string,
    user_id: string,
    timestamp: number,
    session_id: string
    url: string,
    file_id: string
    kind: string,
}

interface MailgunParsed {
    id: string,
    subject: string,
    from: string,
    comment: string,
    timestamp: number,
    message_id: string,
    lines: { start: number, end: number },
    references: string[]
    sent_to: string,
    heading: string,
    body: any,
}

type MailThreadItem = {
    from: string,
    timestamp: number,
    comment: string,
    heading: string,
    lines: { start: number, end: number }
};

type MailGroup = {
    session_id: string,
    session_name: string,
    data: MailgunParsed[]
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
    action: string,
    url?: string
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
    fullname: string,
    username: string,
    emails: string[],
    avatar: string
}

// For merge user
interface UserSubset { username: string, fullname: string, id: string }

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

type PostFileResponse = { ok: boolean, data?: PostFileResponseData }
type PostFileResponseData = {
    user_id: string,
    file_id: string,
    path: string
}
type DeleteFileRequestParam = { id: string }
type DeleteFileRequestData = { user_id: string }
type DeleteFileResponse = { ok: boolean, data?: DeleteFileData }
type DeleteFileData = { user_id: string, file_id: string }

type DeleteCommentData = { comment_id: string, session_id: string }
type GetSessionsResponse = { ok: boolean, data: RoomInfo[] }
type GetUsersResponse = {
    ok: boolean, data?: {
        users: User[]
    }
}
type GetUserResponse = {
    ok: boolean, data: {
        user: User
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
    temporary_id: string,
    file_id?: string,
}

interface JoinSessionParam extends AuthedParams {
    session_id: string,
    user_id: string,
}

type JoinSessionResponse = {
    ok: boolean,
    data?: { id: string, members: string[] },
    error?: string
}

type PrivateUserInfo = {
    find_user: (string) => string,
    test_myself: { username: string, email: string, fullname: string, password: string },
    allowed_users: string[],
    allowed_passwords: string[]
}

type UserTableFromEmail = {
    [email: string]: { name: string, names: string[], id: string, email: string }
} 