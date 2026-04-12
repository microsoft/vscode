/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { Range } from '../../../../editor/common/core/range.js';
export var SessionEditorCommentSource;
(function (SessionEditorCommentSource) {
    SessionEditorCommentSource["AgentFeedback"] = "agentFeedback";
    SessionEditorCommentSource["CodeReview"] = "codeReview";
    SessionEditorCommentSource["PRReview"] = "prReview";
})(SessionEditorCommentSource || (SessionEditorCommentSource = {}));
export function getCodeReviewComments(reviewState) {
    return reviewState.kind === "result" /* CodeReviewStateKind.Result */ ? reviewState.comments : [];
}
export function getPRReviewComments(prReviewState) {
    return prReviewState?.kind === "loaded" /* PRReviewStateKind.Loaded */ ? prReviewState.comments : [];
}
export function getSessionEditorComments(sessionResource, agentFeedbackItems, reviewState, prReviewState) {
    const comments = [];
    for (const item of agentFeedbackItems) {
        comments.push({
            id: toSessionEditorCommentId("agentFeedback" /* SessionEditorCommentSource.AgentFeedback */, item.id),
            sourceId: item.id,
            source: "agentFeedback" /* SessionEditorCommentSource.AgentFeedback */,
            sessionResource,
            resourceUri: item.resourceUri,
            range: item.range,
            text: item.text,
            suggestion: item.suggestion,
            canConvertToAgentFeedback: false,
        });
    }
    for (const item of getCodeReviewComments(reviewState)) {
        comments.push({
            id: toSessionEditorCommentId("codeReview" /* SessionEditorCommentSource.CodeReview */, item.id),
            sourceId: item.id,
            source: "codeReview" /* SessionEditorCommentSource.CodeReview */,
            sessionResource,
            resourceUri: item.uri,
            range: item.range,
            text: item.body,
            suggestion: item.suggestion,
            severity: item.severity,
            canConvertToAgentFeedback: true,
        });
    }
    for (const item of getPRReviewComments(prReviewState)) {
        comments.push({
            id: toSessionEditorCommentId("prReview" /* SessionEditorCommentSource.PRReview */, item.id),
            sourceId: item.id,
            source: "prReview" /* SessionEditorCommentSource.PRReview */,
            sessionResource,
            resourceUri: item.uri,
            range: item.range,
            text: item.body,
            canConvertToAgentFeedback: true,
        });
    }
    comments.sort(compareSessionEditorComments);
    return comments;
}
export function compareSessionEditorComments(a, b) {
    return a.resourceUri.toString().localeCompare(b.resourceUri.toString())
        || Range.compareRangesUsingStarts(Range.lift(a.range), Range.lift(b.range))
        || a.source.localeCompare(b.source)
        || a.sourceId.localeCompare(b.sourceId);
}
export function groupNearbySessionEditorComments(items, lineThreshold = 5) {
    if (items.length === 0) {
        return [];
    }
    const sorted = [...items].sort(compareSessionEditorComments);
    const groups = [];
    let currentGroup = [sorted[0]];
    for (let i = 1; i < sorted.length; i++) {
        const firstItem = currentGroup[0];
        const currentItem = sorted[i];
        const sameResource = currentItem.resourceUri.toString() === firstItem.resourceUri.toString();
        const verticalSpan = currentItem.range.startLineNumber - firstItem.range.startLineNumber;
        if (sameResource && verticalSpan <= lineThreshold) {
            currentGroup.push(currentItem);
        }
        else {
            groups.push(currentGroup);
            currentGroup = [currentItem];
        }
    }
    groups.push(currentGroup);
    return groups;
}
export function getResourceEditorComments(resourceUri, comments) {
    const resource = resourceUri.toString();
    return comments.filter(comment => comment.resourceUri.toString() === resource);
}
export function toSessionEditorCommentId(source, sourceId) {
    return `${source}:${sourceId}`;
}
export function hasAgentFeedbackComments(comments) {
    return comments.some(comment => comment.source === "agentFeedback" /* SessionEditorCommentSource.AgentFeedback */);
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2Vzc2lvbkVkaXRvckNvbW1lbnRzLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvc2Vzc2lvbnMvY29udHJpYi9hZ2VudEZlZWRiYWNrL2Jyb3dzZXIvc2Vzc2lvbkVkaXRvckNvbW1lbnRzLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sRUFBVSxLQUFLLEVBQUUsTUFBTSx5Q0FBeUMsQ0FBQztBQUt4RSxNQUFNLENBQU4sSUFBa0IsMEJBSWpCO0FBSkQsV0FBa0IsMEJBQTBCO0lBQzNDLDZEQUErQixDQUFBO0lBQy9CLHVEQUF5QixDQUFBO0lBQ3pCLG1EQUFxQixDQUFBO0FBQ3RCLENBQUMsRUFKaUIsMEJBQTBCLEtBQTFCLDBCQUEwQixRQUkzQztBQWVELE1BQU0sVUFBVSxxQkFBcUIsQ0FBQyxXQUE2QjtJQUNsRSxPQUFPLFdBQVcsQ0FBQyxJQUFJLDhDQUErQixDQUFDLENBQUMsQ0FBQyxXQUFXLENBQUMsUUFBUSxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUM7QUFDcEYsQ0FBQztBQUVELE1BQU0sVUFBVSxtQkFBbUIsQ0FBQyxhQUF5QztJQUM1RSxPQUFPLGFBQWEsRUFBRSxJQUFJLDRDQUE2QixDQUFDLENBQUMsQ0FBQyxhQUFhLENBQUMsUUFBUSxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUM7QUFDdkYsQ0FBQztBQUVELE1BQU0sVUFBVSx3QkFBd0IsQ0FDdkMsZUFBb0IsRUFDcEIsa0JBQTZDLEVBQzdDLFdBQTZCLEVBQzdCLGFBQThCO0lBRTlCLE1BQU0sUUFBUSxHQUE0QixFQUFFLENBQUM7SUFFN0MsS0FBSyxNQUFNLElBQUksSUFBSSxrQkFBa0IsRUFBRSxDQUFDO1FBQ3ZDLFFBQVEsQ0FBQyxJQUFJLENBQUM7WUFDYixFQUFFLEVBQUUsd0JBQXdCLGlFQUEyQyxJQUFJLENBQUMsRUFBRSxDQUFDO1lBQy9FLFFB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