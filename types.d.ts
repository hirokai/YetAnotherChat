declare module "defs" {
    export interface RoomInfo {
        name: string,
        numMessages: number,
        firstMsgTime: string,
        lastMsgTime: string,
        id: string,
        timestamp: number,
        members: Array<string>
    }
    export default RoomInfo
}