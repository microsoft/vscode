/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { groupBy } from '../../../../base/common/arrays.js';
import { URI } from '../../../../base/common/uri.js';
import { localize } from '../../../../nls.js';
import { ResourceWithCommentThreads } from '../common/commentModel.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { isMarkdownString } from '../../../../base/common/htmlContent.js';
export function threadHasMeaningfulComments(thread) {
    return !!thread.comments && !!thread.comments.length && thread.comments.some(comment => isMarkdownString(comment.body) ? comment.body.value.length > 0 : comment.body.length > 0);
}
export class CommentsModel extends Disposable {
    get resourceCommentThreads() { return this._resourceCommentThreads; }
    constructor() {
        super();
        this._resourceCommentThreads = [];
        this.commentThreadsMap = new Map();
    }
    updateResourceCommentThreads() {
        const includeLabel = this.commentThreadsMap.size > 1;
        this._resourceCommentThreads = [...this.commentThreadsMap.values()].map(value => {
            return value.resourceWithCommentThreads.map(resource => {
                resource.ownerLabel = includeLabel ? value.ownerLabel : undefined;
                return resource;
            }).flat();
        }).flat();
    }
    setCommentThreads(uniqueOwner, owner, ownerLabel, commentThreads) {
        this.commentThreadsMap.set(uniqueOwner, { ownerLabel, resourceWithCommentThreads: this.groupByResource(uniqueOwner, owner, commentThreads) });
        this.updateResourceCommentThreads();
    }
    deleteCommentsByOwner(uniqueOwner) {
        if (uniqueOwner) {
            const existingOwner = this.commentThreadsMap.get(uniqueOwner);
            this.commentThreadsMap.set(uniqueOwner, { ownerLabel: existingOwner?.ownerLabel, resourceWithCommentThreads: [] });
        }
        else {
            this.commentThreadsMap.clear();
        }
        this.updateResourceCommentThreads();
    }
    updateCommentThreads(event) {
        const { uniqueOwner, owner, ownerLabel, removed, changed, added } = event;
        const threadsForOwner = this.commentThreadsMap.get(uniqueOwner)?.resourceWithCommentThreads || [];
        removed.forEach(thread => {
            // Find resource that has the comment thread
            const matchingResourceIndex = threadsForOwner.findIndex((resourceData) => resourceData.id === thread.resource);
            const matchingResourceData = matchingResourceIndex >= 0 ? threadsForOwner[matchingResourceIndex] : undefined;
            // Find comment node on resource that is that thread and remove it
            const index = matchingResourceData?.commentThreads.findIndex((commentThread) => commentThread.threadId === thread.threadId) ?? 0;
            if (index >= 0) {
                matchingResourceData?.commentThreads.splice(index, 1);
            }
            // If the comment thread was the last thread for a resource, remove that resource from the list
            if (matchingResourceData?.commentThreads.length === 0) {
                threadsForOwner.splice(matchingResourceIndex, 1);
            }
        });
        changed.forEach(thread => {
            // Find resource that has the comment thread
            const matchingResourceIndex = threadsForOwner.findIndex((resourceData) => resourceData.id === thread.resource);
            const matchingResourceData = matchingResourceIndex >= 0 ? threadsForOwner[matchingResourceIndex] : undefined;
            if (!matchingResourceData) {
                return;
            }
            // Find comment node on resource that is that thread and replace it
            const index = matchingResourceData.commentThreads.findIndex((commentThread) => commentThread.threadId === thread.threadId);
            if (index >= 0) {
                matchingResourceData.commentThreads[index] = ResourceWithCommentThreads.createCommentNode(uniqueOwner, owner, URI.parse(matchingResourceData.id), thread);
            }
            else if (thread.comments && thread.comments.length) {
                matchingResourceData.commentThreads.push(ResourceWithCommentThreads.createCommentNode(uniqueOwner, owner, URI.parse(matchingResourceData.id), thread));
            }
        });
        added.forEach(thread => {
            const existingResource = threadsForOwner.filter(resourceWithThreads => resourceWithThreads.resource.toString() === thread.resource);
            if (existingResource.length) {
                const resource = existingResource[0];
                if (thread.comments && thread.comments.length) {
                    resource.commentThreads.push(ResourceWithCommentThreads.createCommentNode(uniqueOwner, owner, resource.resource, thread));
                }
            }
            else {
                threadsForOwner.push(new ResourceWithCommentThreads(uniqueOwner, owner, URI.parse(thread.resource), [thread]));
            }
        });
        this.commentThreadsMap.set(uniqueOwner, { ownerLabel, resourceWithCommentThreads: threadsForOwner });
        this.updateResourceCommentThreads();
        return removed.length > 0 || changed.length > 0 || added.length > 0;
    }
    hasCommentThreads() {
        // There's a resource with at least one thread
        return !!this._resourceCommentThreads.length && this._resourceCommentThreads.some(resource => {
            // At least one of the threads in the resource has comments
            return (resource.commentThreads.length > 0) && resource.commentThreads.some(thread => {
                // At least one of the comments in the thread is not empty
                return threadHasMeaningfulComments(thread.thread);
            });
        });
    }
    getMessage() {
        if (!this._resourceCommentThreads.length) {
            return localize('noComments', "There are no comments in this workspace yet.");
        }
        else {
            return '';
        }
    }
    groupByResource(uniqueOwner, owner, commentThreads) {
        const resourceCommentThreads = [];
        const commentThreadsByResource = new Map();
        for (const group of groupBy(commentThreads, CommentsModel._compareURIs)) {
            commentThreadsByResource.set(group[0].resource, new ResourceWithCommentThreads(uniqueOwner, owner, URI.parse(group[0].resource), group));
        }
        commentThreadsByResource.forEach((v, i, m) => {
            resourceCommentThreads.push(v);
        });
        return resourceCommentThreads;
    }
    static _compareURIs(a, b) {
        const resourceA = a.resource.toString();
        const resourceB = b.resource.toString();
        if (resourceA < resourceB) {
            return -1;
        }
        else if (resourceA > resourceB) {
            return 1;
        }
        else {
            return 0;
        }
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY29tbWVudHNNb2RlbC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL2NvbW1lbnRzL2Jyb3dzZXIvY29tbWVudHNNb2RlbC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUFDNUQsT0FBTyxFQUFFLEdBQUcsRUFBRSxNQUFNLGdDQUFnQyxDQUFDO0FBRXJELE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSxvQkFBb0IsQ0FBQztBQUM5QyxPQUFPLEVBQUUsMEJBQTBCLEVBQThCLE1BQU0sMkJBQTJCLENBQUM7QUFDbkcsT0FBTyxFQUFFLFVBQVUsRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBQ2xFLE9BQU8sRUFBRSxnQkFBZ0IsRUFBRSxNQUFNLHdDQUF3QyxDQUFDO0FBRTFFLE1BQU0sVUFBVSwyQkFBMkIsQ0FBQyxNQUFxQjtJQUNoRSxPQUFPLENBQUMsQ0FBQyxNQUFNLENBQUMsUUFBUSxJQUFJLENBQUMsQ0FBQyxNQUFNLENBQUMsUUFBUSxDQUFDLE1BQU0sSUFBSSxNQUFNLENBQUMsUUFBUSxDQUFDLElBQUksQ0FBQyxPQUFPLENBQUMsRUFBRSxDQUFDLGdCQUFnQixDQUFDLE9BQU8sQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUMsT0FBTyxDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsTUFBTSxHQUFHLENBQUMsQ0FBQyxDQUFDLENBQUMsT0FBTyxDQUFDLElBQUksQ0FBQyxNQUFNLEdBQUcsQ0FBQyxDQUFDLENBQUM7QUFFbkwsQ0FBQztBQVNELE1BQU0sT0FBTyxhQUFjLFNBQVEsVUFBVTtJQUc1QyxJQUFJLHNCQUFzQixLQUFtQyxPQUFPLElBQUksQ0FBQyx1QkFBdUIsQ0FBQyxDQUFDLENBQUM7SUFHbkc7UUFFQyxLQUFLLEVB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