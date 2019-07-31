interface RoomInfo {
    name: string,
    numMessages: number,
    firstMsgTime: string,
    lastMsgTime: string,
    id: string,
    timestamp: number,
    members: Array<string>
}

interface CommentPostResponse {
    json: (r: {
        ok: boolean,
        data: {
            timestamp: number,
            comment: string,
            user_id: string,
        }
    }) => void;
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

interface GetCommentsParams extends AuthedParams {
    session: string
}

interface PostSessionsParam {
    name: string,
    members: string[],
    token: string
}