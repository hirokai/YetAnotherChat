type PostCommentModelParams = {
    user_id: string,
    session_id: string,
    timestamp: number,
    comments: {
        for_user: string,
        content: string,
    }[],
    original_url?: string,
    sent_to?: string,
    source?: string,
    encrypt: EncryptionMode,
    comment_id?: string,
}