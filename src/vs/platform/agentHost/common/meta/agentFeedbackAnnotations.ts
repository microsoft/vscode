/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export type { AgentFeedbackKindValue, AgentFeedbackStateValue, IFeedbackPullRequest, IFeedbackAnnotationMeta, AgentFeedbackAuthorValue, IFeedbackAnnotationEntryMeta } from './vscode/agentFeedbackAnnotations.js';
export { FEEDBACK_ANNOTATION_META_KEY, VIEW_UNREVIEWED_COMMENTS_TOOL_NAME, ADD_COMMENT_TOOL_NAME, isViewUnreviewedCommentsTool, isAddCommentTool, authorForFeedbackKind, feedbackAnnotationEntryMeta, readFeedbackAnnotationEntryAuthor, resolveFeedbackEntryAuthor, readFeedbackAnnotationMeta } from './vscode/agentFeedbackAnnotations.js';
