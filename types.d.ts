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

interface GetSessionsResponse {
    json: (r: {
        ok: boolean,
        data: RoomInfo[]
    }) => void;
}