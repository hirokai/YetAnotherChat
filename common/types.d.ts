type RoomInfo = {
    name: string,
    numMessages: { [key: string]: number },
    firstMsgTime: number,
    lastMsgTime: number,
    id: string,
    timestamp: number,
    members: string[]
}

type RoomInfoClient = {
    name: string,
    numMessages: object,
    firstMsgTime: number,
    lastMsgTime: number,
    id: string,
    timestamp: number,
    formattedTime: string,
    members: Array<string>
}

interface PostCommentResponse {
    ok: boolean,
    data?: CommentTyp,
    error?: string
}

interface CommentsDeleteResponse {
    ok: boolean
}


interface AxiosResponse<T> {
    data: T
}

type ChatEntry = CommentTyp | SessionEvent | ChatFile

type CommentChange = NewComment | UpdateComment | DeleteComment

interface NewComment {
    __type: "new";
    comment: ChatEntry
}

interface UpdateComment {
    __type: "update"
    id: string
    comment: ChatEntry
}

interface DeleteComment {
    __type: "delete";
    id: string
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
    source: string,
    encrypt: string,
}

type SessionEvent = {
    kind: "event";
    id: string,
    user_id: string,
    session_id: string,
    timestamp: number,
    action: string,
    encrypt: 'none',
}

type ChatFile = {
    id: string,
    user_id: string,
    timestamp: number,
    session_id: string
    url: string,
    file_id: string
    kind: string,
    encrypt: string,
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
    id: string,
    user: string,
    comment: string,
    session: string,
    timestamp: number,
    formattedTime: string,
    originalUrl: string,
    sentTo: string,
    source: string
    kind: string,
    action: string,
    url?: string,
    encrypt: string
}

interface UserSlack {
    id: string,
    real_name: string,
    name: string,
    username: string,
    avatar: string
}


type User = {
    id: string,
    fullname: string,
    username: string,
    emails: string[],
    avatar: string,
    online: boolean,
    publicKey: JsonWebKey
}

type UserClient = {
    id: string,
    fullname: string,
    username: string,
    emails: string[],
    avatar: string,
    online: boolean,
    fingerprint: string,
}

// For merge user
interface UserSubset { username: string, fullname: string, id: string }

interface JsonResponse<T> {
    json: (r: T) => void;
    status: (s: number) => JsonResponse<T>;
}

interface AuthedParams {
    // token: string
}

interface LoginParams extends AuthedParams {
    username: string,
    password: string,
}

type GetPublicKeysParams = {
    token: string,
    user_id: string
}

type GetPublicKeysResponse = {
    ok: boolean,
    data?: JsonWebKey
}

interface PostPublicKeyParams extends AuthedParams {
    publicKey: JsonWebKey,
    for_user: string
}

type UpdatePublicKeyParams = PostPublicKeyParams

interface GetSessionsOfParams extends AuthedParams {
    of_members: string,
}

type GetSessionsResponse = { ok: boolean, data: RoomInfo[] }
type GetSessionResponse = { ok: boolean, data?: RoomInfo }
type PatchSessionResponse = { ok: boolean }


interface PostCommentData extends AuthedParams {
    comments: { for_user: string, content: string }[],     //Encrypted by different public keys.
    encrypt: string, //Encryption method (ECDH, etc.)
    temporary_id: string,   //generated at client to avoid duplicate addition by socket notification.
}
interface GetCommentsParams extends AuthedParams {
    after?: number
    by_user?: string
}

interface GetCommentsDeltaData {
    last_updated: number,
    cached_ids: string[],
}

type MyKeyCacheData = {
    id: string,
    keyPair: CryptoKeyPair,
    fingerPrint: { publicKey: string, privateKey: string }
}

type GetCommentsResponse = { ok: boolean, data: ChatEntry[] }
type DeleteCommentResponse = { ok: boolean, data?: DeleteCommentData, error?: string }
type DeleteCommentData = { comment_id: string, encrypt_group: string, session_id: string }

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

type GetUsersResponse = {
    ok: boolean,
    data?: {
        users: User[]
    }
}
type GetUserResponse = {
    ok: boolean,
    data: {
        user: User
    }
}

type PostSessionsResponse = {
    ok: boolean,
    data?: RoomInfo,
    error?: string
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

type CommentsNewSocket = {
    __type: string,
    temporary_id: string,
    entry: ChatEntry,
}

type SessionsNewSocket = {
    __type: 'sessions.new',
    id: string,
    temporary_id: string,
}

type SessionsUpdateSocket = {
    __type: 'sessions.update',
    id: string,
    name: string,
    timestamp: number
}

type CommentsDeleteSocket = {
    __type: 'comments.delete',
    id: string,
    session_id: string,
}

type FilesDeleteSocket = {
    __type: 'files.delete',
}

type UsersUpdateSocket = {
    __type: 'users.update',
    user_id: string,
    online?: boolean,
    timestamp: number
}

type UserOnlineStatus = { [key: string]: boolean }

interface ElmAppPorts {
    getMessages: (any) => any;
    onChangeComments: {
        send: (any) => void
    }
}

interface ElmApp {
    ports: ElmAppPorts;
}

interface PortFn {
    send: (any) => void;
}


type EncryptedData = {
    iv: string,
    data: string
}
