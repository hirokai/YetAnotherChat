type RoomInfo = {
    name: string,
    numMessages: { [key: string]: number },
    firstMsgTime: number,
    lastMsgTime: number,
    id: string,
    timestamp: number,
    members: string[],
    owner: string,
    workspace?: string,
    visibility: SessionVisibility
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
    owner: string
    workspace: string
    visibility: SessionVisibility
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

type EncryptionMode = 'ecdh.v1' | 'none'
type ChatEntryKind = 'comment' | 'file' | 'event';

interface ChatEntryCommon {
    kind: string
    id: string,
    user_id: string,
    session_id: string,
    timestamp: number,
    comment: string,
    encrypt: EncryptionMode,
    fingerprint: { from?: string, to?: string }
}

interface CommentTyp extends ChatEntryCommon {
    kind: "comment";
    original_url?: string,
    sent_to?: string,
    source: string,
}

interface SessionEvent extends ChatEntryCommon {
    kind: "event";
    action: string,
    encrypt: 'none',
}

interface ChatFile extends ChatEntryCommon {
    kind: 'file',
    url: string,
    file_id: string
}

interface MailgunParsed {
    id: string,
    subject: string,
    from: string,
    comment: string,
    timestamp: number,
    message_id?: string,
    lines: { start: number, end: number },
    references: string[]
    sent_to: string,
    heading: string,
    body: any,
}

type MailThreadItem = {
    from?: string,
    timestamp?: number,
    comment: string,
    heading?: string,
    lines?: { start: number, end: number }
};

type MailGroup = {
    session_id: string,
    session_name: string,
    data: MailgunParsed[]
}

type ChatEntryClient = CommentTypClient | ChatFileClient | SessionEventClient

interface ChatEntryClientCommon {
    kind: string
    id: string
    comment: string
    formattedTime: string
    timestamp: number
    session: string
    user: string
    encrypt: "ecdh.v1" | "none"
}

interface CommentTypClient extends ChatEntryClientCommon {
    kind: "comment"
    comment: string
    originalUrl: string
    sentTo: string
    source: string
}

interface ChatFileClient extends ChatEntryClientCommon {
    kind: "file"
    url: string
    file_id: string
    thumbnailBase64: string
}

interface SessionEventClient extends ChatEntryClientCommon {
    kind: "event"
    action: string
}

type WorkspaceVisibility = 'public' | 'url' | 'private';
type SessionVisibility = 'public' | 'workspace' | 'url' | 'private';

interface Workspace {
    id: string
    name: string
    owner: string,
    members: string[],
    visibility: WorkspaceVisibility
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
    timestamp: number,
    fullname?: string,
    username: string,
    emails: string[],
    avatar: string,
    online: boolean,
    publicKey?: JsonWebKey,
    registered: boolean,
    fingerprint?: string,
    profile?: { [key: string]: string },
}

type UserClient = {
    id: string,
    fullname: string,
    username: string,
    emails: string[],
    avatar: string,
    online: boolean,
    registered: boolean,
    fingerprint: string,
    profile: string[][]
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
    user_id: string
}

type GetPublicKeysResponse = {
    ok: boolean,
    publicKey?: JsonWebKey,
    privateKeyFingerprint?: string
}

type GetPrivateKeyResponse = {
    ok: boolean,
    privateKey?: JsonWebKey
}

type PostPrivateKeyResponse = {
    ok: boolean
}

interface PostPublicKeyParams extends AuthedParams {
    publicKey: JsonWebKey,
    privateKeyFingerprint: string,
    for_user: string
}

type UpdatePublicKeyParams = PostPublicKeyParams

interface GetEmailsParams extends AuthedParams {
}

type EmailClient = { from: string, subject: string, date: string, timestamp: number, message_id: string }
type Email = { from: string, subject: string, timestamp: number, message_id: string }
type GetEmailsResponse = { ok: boolean, data: Email[] }

type EmailDetail = { from: string, subject: string, timestamp: number, message_id: string, text: string }
type GetEmailResponse = { ok: boolean, data: EmailDetail }

interface GetSessionsOfParams extends AuthedParams {
    of_members: string,
}

type GetSessionsResponse = { ok: boolean, data?: RoomInfo[] }
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
    publicKey?: JsonWebKey,
    privateKey?: JsonWebKey,
    fingerPrint: { publicKey?: string, privateKey?: string }
}

type GetCommentsResponse = { ok: boolean, data?: ChatEntry[] }
type DeleteCommentResponse = { ok: boolean, data?: DeleteCommentData, error?: string }
type DeleteCommentData = { comment_id: string, encrypt_group: string, session_id: string }


type PostEmailReplyData = { message: string }

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
    data?: User
}

type GetProfileResponse = {
    ok: boolean,
    user_id: string
    data: { [key: string]: string }
}

type GetProfilesResponse = {
    ok: boolean,
    user_id: string
    data: { [key: string]: { [key: string]: string } }
}

type UpdateProfileResponse = {
    ok: boolean,
    user_id: string
    data: { [key: string]: string }
}

interface UpdateUserData {
    username?: string
    fullname?: string
    email?: string
}

interface UpdateProfileData {
    profile?: { [key: string]: string }
}

type UpdateUserResponse = {
    ok: boolean
    data?: User
    error?: string
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


interface UpdateSessionsBody {
    id: string,
    visibility?: SessionVisibility
}

interface UpdateSessionsResponse {
    ok: boolean
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

type GetConfigResponse = { ok: boolean, data?: string[][] }

type GetWorkspaceResponse = {
    ok: boolean,
    data?: Workspace
}

type PostWorkspaceData = {
    name: string,
    members: string[]
}

type DeleteWorkspaceResponse = {
    ok: boolean
}

type OkResponse = {
    ok: boolean
}

type QuitWorkspaceResponse = OkResponse

type UpdateWorkspaceData = {
    name?: string,
    visibility?: WorkspaceVisibility
}

type UpdateWorkspaceResponse = {
    ok: boolean
}

type PostWorkspaceResponse = {
    ok: boolean,
    data?: Workspace
}

type GetWorkspacesResponse = {
    ok: boolean,
    data?: Workspace[]
}

type PostConfigData = {
    key: string,
    value: string
}

type PostConfigResponse = { ok: boolean }


type UserTableFromEmail = {
    [email: string]: { name: string, names: string[], id: string, email: string }
}

type CommentsNewSocket = {
    __type: string,
    temporary_id: string,
    entry: CommentTyp,
}

type WorkspacesUpdateSocket = {
    __type: 'workspaces.update',
    timestamp: number
    data: { name?: string }
}


type SessionsNewSocket = {
    __type: 'sessions.new',
    id: string,
    temporary_id: string,
}

type SessionsDeleteSocket = {
    __type: 'sessions.delete',
    id: string,
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

type UsersNewSocket = {
    __type: 'users.new',
    timestamp: number,
    user: User,
}

type UsersUpdateSocket = {
    __type: 'users.update',
    action: 'online' | 'public_key' | 'profile' | 'user';
    timestamp: number,
    user_id: string,
    online?: boolean,
    user?: User,
    profile?: { [key: string]: string }
    public_key?: JsonWebKey,
}

type UserOnlineStatus = { [key: string]: boolean }

interface ElmAppPorts {
    getMessages: (any) => any;
    onChangeComments: {
        send: (any) => void
    }
}

interface ElmMailPorts {
    feedEmails: PortFn
}

interface ElmApp {
    ports: ElmAppPorts;
}

interface ElmMail {
    ports: ElmMailPorts;
}

interface PortFn {
    send: (any) => void;
}


type EncryptedData = {
    iv: string,
    data: string
}

type LocalConfig = {
    show_toppane: boolean
    expand_toppane: boolean
    expand_chatinput: boolean
    show_users_with_email_only: boolean
    email_workspace: string | null
}

type UserInWorkspaceMetadata = {
    role?: 'owner' | 'member'
}

interface MyResponse extends Response {
    token: any;
    header: (k: string, v: string) => void;
}

interface MyPostRequest<T> {
    token: any;
    body: T;
    params: { [key: string]: string }
    decoded: { username: string, user_id: string, iap: number, exp: number }
}

interface GetAuthRequest extends Request {
    token: any
    query: { [key: string]: string }
    params: { [key: string]: string }
    decoded: { username: string, user_id: string, iap: number, exp: number }
}

interface GetAuthRequest1<T> {
    token: any
    query: T
    params: { [key: string]: string }
    decoded: { username: string, user_id: string, iap: number, exp: number }
}

interface PostRequest<T> {
    decoded: { user_id: string, username: string },
    body: T
    params?: any
}

interface DeleteRequest<T, U> {
    decoded: { user_id: string, username: string },
    body: U,
    params: T
}

type RegisterResponse = {
    ok: boolean,
    error?: string,
    error_code?: number,
    token?: string,
    decoded?: object,
    local_db_password?: string
}