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

interface CommentTyp {
    user_id: string,
    comment: string,
    session_id: string,
    timestamp: number,
    original_url: string,
    sent_to: string,
}

interface CommentTypClient {
    user: string,
    comment: string,
    session: string,
    timestamp: string,
    originalUrl: string,
    sentTo: string,
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

declare enum Timespan {
    day,
    week,
    month
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

interface GetSessionResponse { ok: boolean, data: RoomInfo }
interface PatchSessionResponse { ok: boolean }

interface GetSessionsResponse { ok: boolean, data: RoomInfo[] }

interface PostSessionsResponse {
    ok: boolean,
    data?: { id: string },
    error?: string
}

interface PostCommentData {
    user: string,
    session: string,
    comment: string,
}


interface GetCommentsParams extends AuthedParams {
    session: string
}

interface PostSessionsParam {
    name: string,
    members: string[],
    token: string
}