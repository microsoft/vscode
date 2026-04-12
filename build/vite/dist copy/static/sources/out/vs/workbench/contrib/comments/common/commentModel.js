/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
export class CommentNode {
    constructor(uniqueOwner, owner, resource, comment, thread) {
        this.uniqueOwner = uniqueOwner;
        this.owner = owner;
        this.resource = resource;
        this.comment = comment;
        this.thread = thread;
        this.isRoot = false;
        this.replies = [];
        this.threadId = thread.threadId;
        this.range = thread.range;
        this.threadState = thread.state;
        this.threadRelevance = thread.applicability;
        this.contextValue = thread.contextValue;
        this.controllerHandle = thread.controllerHandle;
        this.threadHandle = thread.commentThreadHandle;
    }
    hasReply() {
        return this.replies && this.replies.length !== 0;
    }
    get lastUpdatedAt() {
        if (this._lastUpdatedAt === undefined) {
            let updatedAt = this.comment.timestamp || '';
            if (this.replies.length) {
                const reply = this.replies[this.replies.length - 1];
                const replyUpdatedAt = reply.lastUpdatedAt;
                if (replyUpdatedAt > updatedAt) {
                    updatedAt = replyUpdatedAt;
                }
            }
            this._lastUpdatedAt = updatedAt;
        }
        return this._lastUpdatedAt;
    }
}
export class ResourceWithCommentThreads {
    constructor(uniqueOwner, owner, resource, commentThreads) {
        this.uniqueOwner = uniqueOwner;
        this.owner = owner;
        this.id = resource.toString();
        this.resource = resource;
        this.commentThreads = commentThreads.filter(thread => thread.comments && thread.comments.length).map(thread => ResourceWithCommentThreads.createCommentNode(uniqueOwner, owner, resource, thread));
    }
    static createCommentNode(uniqueOwner, owner, resource, commentThread) {
        const { comments } = commentThread;
        const commentNodes = comments.map(comment => new CommentNode(uniqueOwner, owner, resource, comment, commentThread));
        if (commentNodes.length > 1) {
            commentNodes[0].replies = commentNodes.slice(1, commentNodes.length);
        }
        commentNodes[0].isRoot = true;
        return commentNodes[0];
    }
    get lastUpdatedAt() {
        if (this._lastUpdatedAt === undefined) {
            let updatedAt = '';
            // Return result without cahcing as we expect data to arrive later
            if (!this.commentThreads.length) {
                return updatedAt;
            }
            for (const thread of this.commentThreads) {
                const threadUpdatedAt = thread.lastUpdatedAt;
                if (threadUpdatedAt && threadUpdatedAt > updatedAt) {
                    updatedAt = threadUpdatedAt;
                }
            }
            this._lastUpdatedAt = updatedAt;
        }
        return this._lastUpdatedAt;
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY29tbWVudE1vZGVsLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvY29tbWVudHMvY29tbW9uL2NvbW1lbnRNb2RlbC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQVloRyxNQUFNLE9BQU8sV0FBVztJQVd2QixZQUNpQixXQUFtQixFQUNuQixLQUFhLEVBQ2IsUUFBYSxFQUNiLE9BQWdCLEVBQ2hCLE1BQXFCO1FBSnJCLGdCQUFXLEdBQVgsV0FBVyxDQUFRO1FBQ25CLFVBQUssR0FBTCxLQUFLLENBQVE7UUFDYixhQUFRLEdBQVIsUUFBUSxDQUFLO1FBQ2IsWUFBTyxHQUFQLE9BQU8sQ0FBUztRQUNoQixXQUFNLEdBQU4sTUFBTSxDQUFlO1FBZnRDLFdBQU0sR0FBWSxLQUFLLENBQUM7UUFDeEIsWUFBTyxHQUFrQixFQUFFLENBQUM7UUFlM0IsSUFBSSxDQUFDLFFBQVEsR0FBRyxNQUFNLENBQUMsUUFBUSxDQUFDO1FBQ2hDLElBQUksQ0FBQyxLQUFLLEdBQUcsTUFBTSxDQUFDLEtBQUssQ0FBQztRQUMxQixJQUFJLENBQUMsV0FBVyxHQUFHLE1BQU0sQ0FBQyxLQUFLLENBQUM7UUFDaEMsSUFBSSxDQUFDLGVBQWUsR0FBRyxNQUFNLENBQUMsYUFBYSxDQUFDO1FBQzVDLElBQUksQ0FBQyxZQUFZLEdBQUcsTUFBTSxDQUFDLFlBQVksQ0FBQztRQUN4QyxJQUFJLENBQUMsZ0JBQWdCLEdBQUcsTUFBTSxDQUFDLGdCQUFnQixDQUFDO1FBQ2hELElBQUksQ0FBQyxZQUFZLEdBQUcsTUFBTSxDQUFDLG1CQUFtQixDQUFDO0lBQ2hELENBQUM7SUFFRCxRQUFRO1FBQ1AsT0FBTyxJQUFJLENBQUMsT0FBTyxJQUFJLElBQUksQ0FBQyxPQUFPLENBQUMsTUFBTSxLQUFLLENBQUMsQ0FBQztJQUNsRCxDQUFDO0lBSUQsSUFB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