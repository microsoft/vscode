/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../nls.js';
import { DisposableStore, IDisposable } from '../../../../base/common/lifecycle.js';
import type { IJSONSchema } from '../../../../base/common/jsonSchema.js';
import type { IRange } from '../../../../editor/common/core/range.js';
import { URI } from '../../../../base/common/uri.js';
import { ToolDataSource, type ILanguageModelToolsService, type IPreparedToolInvocation, type IToolData, type IToolImpl, type IToolInvocation, type IToolInvocationPreparationContext, type IToolResult } from '../../../../workbench/contrib/chat/common/tools/languageModelToolsService.js';
import { AgentFeedbackKind, AgentFeedbackState, type IAgentFeedback, type IAgentFeedbackService } from './agentFeedbackService.js';
import { ISessionsManagementService } from '../../../services/sessions/common/sessionsManagement.js';

export const addCommentToolName = 'addComment';
export const listCommentsToolName = 'listComments';
export const deleteCommentsToolName = 'deleteComments';
export const resolveCommentsToolName = 'resolveComments';

const addCommentDescription = 'Add a comment to a file range.';
const listCommentsDescription = 'List comments for this session.';
const deleteCommentsDescription = 'Delete comments for this session.';
const resolveCommentsDescription = 'Mark comments for this session as resolved or unresolved.';

const addCommentInputSchema: IJSONSchema = {
	type: 'object',
	properties: {
		resourceUri: {
			type: 'string',
			description: 'URI of the file to add a comment to.',
		},
		range: {
			type: 'object',
			description: 'One-based text range to comment on.',
			properties: {
				startLineNumber: { type: 'number', description: 'One-based start line number.' },
				startColumn: { type: 'number', description: 'One-based start column.' },
				endLineNumber: { type: 'number', description: 'One-based end line number.' },
				endColumn: { type: 'number', description: 'One-based end column.' },
			},
			required: ['startLineNumber', 'startColumn', 'endLineNumber', 'endColumn'],
		},
		text: {
			type: 'string',
			description: 'Comment text to add.',
		},
	},
	required: ['resourceUri', 'range', 'text'],
};

const listCommentsInputSchema: IJSONSchema = {
	type: 'object',
	properties: {},
};

const deleteCommentsInputSchema: IJSONSchema = {
	type: 'object',
	properties: {
		commentIds: {
			type: 'array',
			description: 'Comment IDs to delete.',
			items: { type: 'string' },
		},
	},
	required: ['commentIds'],
};

const resolveCommentsInputSchema: IJSONSchema = {
	type: 'object',
	properties: {
		commentIds: {
			type: 'array',
			description: 'Comment IDs to update.',
			items: { type: 'string' },
		},
		resolved: {
			type: 'boolean',
			description: 'Whether the comments should be marked as resolved. Defaults to true.',
		},
	},
	required: ['commentIds'],
};

const addCommentToolData: IToolData = {
	id: addCommentToolName,
	toolReferenceName: addCommentToolName,
	source: ToolDataSource.Internal,
	displayName: localize('agentFeedback.addCommentTool.displayName', "Add Comment (Agent Feedback)"),
	modelDescription: addCommentDescription,
	inputSchema: addCommentInputSchema,
};

const listCommentsToolData: IToolData = {
	id: listCommentsToolName,
	toolReferenceName: listCommentsToolName,
	source: ToolDataSource.Internal,
	displayName: localize('agentFeedback.listCommentsTool.displayName', "List Comments (Agent Feedback)"),
	modelDescription: listCommentsDescription,
	inputSchema: listCommentsInputSchema,
};

const deleteCommentsToolData: IToolData = {
	id: deleteCommentsToolName,
	toolReferenceName: deleteCommentsToolName,
	source: ToolDataSource.Internal,
	displayName: localize('agentFeedback.deleteCommentsTool.displayName', "Delete Comments (Agent Feedback)"),
	modelDescription: deleteCommentsDescription,
	inputSchema: deleteCommentsInputSchema,
};

const resolveCommentsToolData: IToolData = {
	id: resolveCommentsToolName,
	toolReferenceName: resolveCommentsToolName,
	source: ToolDataSource.Internal,
	displayName: localize('agentFeedback.resolveCommentsTool.displayName', "Resolve Comments (Agent Feedback)"),
	modelDescription: resolveCommentsDescription,
	inputSchema: resolveCommentsInputSchema,
};

interface IAddCommentToolParameters {
	readonly resourceUri?: unknown;
	readonly range?: unknown;
	readonly text?: unknown;
}

interface IAddCommentToolRange {
	readonly startLineNumber?: unknown;
	readonly startColumn?: unknown;
	readonly endLineNumber?: unknown;
	readonly endColumn?: unknown;
}

interface IDeleteCommentsToolParameters {
	readonly commentIds?: unknown;
}

interface IResolveCommentsToolParameters {
	readonly commentIds?: unknown;
	readonly resolved?: unknown;
}

function getRequiredString(value: unknown, field: string, toolName = addCommentToolName): string {
	if (typeof value !== 'string' || value.length === 0) {
		throw new Error(`Invalid ${toolName} input: ${field} must be a non-empty string.`);
	}
	return value;
}

function getRequiredPositiveInteger(value: unknown, field: string): number {
	if (typeof value !== 'number' || !Number.isInteger(value) || value < 1) {
		throw new Error(`Invalid ${addCommentToolName} input: ${field} must be a positive integer.`);
	}
	return value;
}

function getAddCommentToolArgs(invocation: IToolInvocation): { resourceUri: URI; range: IRange; text: string } {
	const parameters = invocation.parameters as IAddCommentToolParameters;
	const resourceUri = URI.parse(getRequiredString(parameters.resourceUri, 'resourceUri'));
	const text = getRequiredString(parameters.text, 'text');
	const rangeRaw = parameters.range;
	if (!rangeRaw || typeof rangeRaw !== 'object' || Array.isArray(rangeRaw)) {
		throw new Error(`Invalid ${addCommentToolName} input: range must be an object.`);
	}
	const range = rangeRaw as IAddCommentToolRange;
	return {
		resourceUri,
		text,
		range: {
			startLineNumber: getRequiredPositiveInteger(range.startLineNumber, 'range.startLineNumber'),
			startColumn: getRequiredPositiveInteger(range.startColumn, 'range.startColumn'),
			endLineNumber: getRequiredPositiveInteger(range.endLineNumber, 'range.endLineNumber'),
			endColumn: getRequiredPositiveInteger(range.endColumn, 'range.endColumn'),
		},
	};
}

function getCommentIds(value: unknown): readonly string[] {
	if (!Array.isArray(value) || value.length === 0) {
		throw new Error(`Invalid ${deleteCommentsToolName} input: commentIds must be a non-empty string array.`);
	}
	const ids: string[] = [];
	for (const item of value) {
		ids.push(getRequiredString(item, 'commentIds[]', deleteCommentsToolName));
	}
	return [...new Set(ids)];
}

function getResolveCommentIds(value: unknown): readonly string[] {
	if (!Array.isArray(value) || value.length === 0) {
		throw new Error(`Invalid ${resolveCommentsToolName} input: commentIds must be a non-empty string array.`);
	}
	const ids: string[] = [];
	for (const item of value) {
		ids.push(getRequiredString(item, 'commentIds[]', resolveCommentsToolName));
	}
	return [...new Set(ids)];
}

function getResolvedFlag(value: unknown): boolean {
	if (value === undefined) {
		return true;
	}
	if (typeof value !== 'boolean') {
		throw new Error(`Invalid ${resolveCommentsToolName} input: resolved must be a boolean.`);
	}
	return value;
}

/**
 * Returns the feedback items that are visible to the agent: everything except
 * items still in the {@link AgentFeedbackState.Created} state, which the user
 * has not accepted yet.
 */
function getListableFeedback(agentFeedbackService: IAgentFeedbackService, sessionResource: URI): readonly IAgentFeedback[] {
	return agentFeedbackService.getFeedback(sessionResource).filter(item => item.state !== AgentFeedbackState.Created);
}

function toSerializedFeedback(feedback: readonly IAgentFeedback[]) {
	return feedback.map(item => ({
		id: item.id,
		resourceUri: item.resourceUri.toString(),
		range: item.range,
		text: item.text,
		kind: item.kind,
		resolved: item.state === AgentFeedbackState.Resolved,
		...(item.replies ? { replies: item.replies } : {}),
	}));
}

function serializeFeedback(feedback: readonly IAgentFeedback[]): string {
	return JSON.stringify({ comments: toSerializedFeedback(feedback) }, undefined, 2);
}

function createAddCommentTool(agentFeedbackService: IAgentFeedbackService, sessionsManagementService: ISessionsManagementService): IToolImpl {
	return {
		async invoke(invocation: IToolInvocation): Promise<IToolResult> {
			const chatResource = invocation.context?.sessionResource;
			if (!chatResource) {
				throw new Error(`Invalid ${addCommentToolName} invocation: chat resource is required.`);
			}
			const session = sessionsManagementService.getSessionForChatResource(chatResource);
			if (!session) {
				throw new Error(`Invalid ${addCommentToolName} invocation: session not found for chat resource ${chatResource.toString()}.`);
			}
			const { resourceUri, range, text } = getAddCommentToolArgs(invocation);
			// The agent adds comments in the Created state; the user accepts them
			// before they are acted upon.
			agentFeedbackService.addFeedback(session.session.resource, resourceUri, range, text, undefined, undefined, undefined, AgentFeedbackKind.AgentReview, AgentFeedbackState.Created);
			return { content: [{ kind: 'text', value: localize('agentFeedback.addCommentTool.result', "Comment added.") }] };
		},
		async prepareToolInvocation(): Promise<IPreparedToolInvocation> {
			return {
				invocationMessage: localize('agentFeedback.addCommentTool.invocation', "Adding Comment"),
				pastTenseMessage: localize('agentFeedback.addCommentTool.pastTense', "Added Comment"),
			};
		},
	};
}

function createListCommentsTool(agentFeedbackService: IAgentFeedbackService, sessionsManagementService: ISessionsManagementService): IToolImpl {
	return {
		async invoke(invocation: IToolInvocation): Promise<IToolResult> {
			const chatResource = invocation.context?.sessionResource;
			if (!chatResource) {
				throw new Error(`Invalid ${listCommentsToolName} invocation: chat resource is required.`);
			}
			const session = sessionsManagementService.getSessionForChatResource(chatResource);
			if (!session) {
				throw new Error(`Invalid ${listCommentsToolName} invocation: session not found for chat resource ${chatResource.toString()}.`);
			}

			return { content: [{ kind: 'text', value: serializeFeedback(getListableFeedback(agentFeedbackService, session.session.resource)) }] };
		},
		async prepareToolInvocation(): Promise<IPreparedToolInvocation> {
			return {
				invocationMessage: localize('agentFeedback.listCommentsTool.invocation', "Listing Comments"),
				pastTenseMessage: localize('agentFeedback.listCommentsTool.pastTense', "Listed Comments"),
			};
		},
	};
}

function createDeleteCommentsTool(agentFeedbackService: IAgentFeedbackService, sessionsManagementService: ISessionsManagementService): IToolImpl {
	return {
		async invoke(invocation: IToolInvocation): Promise<IToolResult> {
			const chatResource = invocation.context?.sessionResource;
			if (!chatResource) {
				throw new Error(`Invalid ${deleteCommentsToolName} invocation: chat resource is required.`);
			}
			const session = sessionsManagementService.getSessionForChatResource(chatResource);
			if (!session) {
				throw new Error(`Invalid ${deleteCommentsToolName} invocation: session not found for chat resource ${chatResource.toString()}.`);
			}

			const parameters = invocation.parameters as IDeleteCommentsToolParameters;
			const ids = getCommentIds(parameters.commentIds);
			const existingIds = new Set(getListableFeedback(agentFeedbackService, session.session.resource).map(item => item.id));
			const deleted: string[] = [];
			const notFound: string[] = [];
			for (const id of ids) {
				if (existingIds.has(id)) {
					agentFeedbackService.removeFeedback(session.session.resource, id);
					deleted.push(id);
				} else {
					notFound.push(id);
				}
			}

			return {
				content: [{
					kind: 'text',
					value: JSON.stringify({
						deletedCommentIds: deleted,
						notFoundCommentIds: notFound,
						remainingComments: toSerializedFeedback(getListableFeedback(agentFeedbackService, session.session.resource)),
					}, undefined, 2),
				}],
			};
		},
		async prepareToolInvocation(): Promise<IPreparedToolInvocation> {
			return {
				invocationMessage: localize('agentFeedback.deleteCommentsTool.invocation', "Deleting Comments"),
				pastTenseMessage: localize('agentFeedback.deleteCommentsTool.pastTense', "Deleted Comments"),
			};
		},
	};
}

function createResolveCommentsTool(agentFeedbackService: IAgentFeedbackService, sessionsManagementService: ISessionsManagementService): IToolImpl {
	return {
		async invoke(invocation: IToolInvocation): Promise<IToolResult> {
			const chatResource = invocation.context?.sessionResource;
			if (!chatResource) {
				throw new Error(`Invalid ${resolveCommentsToolName} invocation: chat resource is required.`);
			}
			const session = sessionsManagementService.getSessionForChatResource(chatResource);
			if (!session) {
				throw new Error(`Invalid ${resolveCommentsToolName} invocation: session not found for chat resource ${chatResource.toString()}.`);
			}

			const parameters = invocation.parameters as IResolveCommentsToolParameters;
			const ids = getResolveCommentIds(parameters.commentIds);
			const resolved = getResolvedFlag(parameters.resolved);
			const existingIds = new Set(getListableFeedback(agentFeedbackService, session.session.resource).map(item => item.id));
			const updated: string[] = [];
			const notFound: string[] = [];
			for (const id of ids) {
				if (existingIds.has(id)) {
					agentFeedbackService.setFeedbackResolved(session.session.resource, id, resolved);
					updated.push(id);
				} else {
					notFound.push(id);
				}
			}

			return {
				content: [{
					kind: 'text',
					value: JSON.stringify({
						resolved,
						updatedCommentIds: updated,
						notFoundCommentIds: notFound,
						comments: toSerializedFeedback(getListableFeedback(agentFeedbackService, session.session.resource)),
					}, undefined, 2),
				}],
			};
		},
		async prepareToolInvocation(context: IToolInvocationPreparationContext): Promise<IPreparedToolInvocation> {
			const resolved = getResolvedFlag((context.parameters as IResolveCommentsToolParameters).resolved);
			return resolved
				? {
					invocationMessage: localize('agentFeedback.resolveCommentsTool.invocation', "Resolving Comments"),
					pastTenseMessage: localize('agentFeedback.resolveCommentsTool.pastTense', "Resolved Comments"),
				}
				: {
					invocationMessage: localize('agentFeedback.unresolveCommentsTool.invocation', "Unresolving Comments"),
					pastTenseMessage: localize('agentFeedback.unresolveCommentsTool.pastTense', "Unresolved Comments"),
				};
		},
	};
}

export function registerAgentFeedbackTools(toolsService: ILanguageModelToolsService, agentFeedbackService: IAgentFeedbackService, sessionsManagementService: ISessionsManagementService): IDisposable {
	const store = new DisposableStore();
	store.add(toolsService.registerTool(addCommentToolData, createAddCommentTool(agentFeedbackService, sessionsManagementService)));
	store.add(toolsService.registerTool(listCommentsToolData, createListCommentsTool(agentFeedbackService, sessionsManagementService)));
	store.add(toolsService.registerTool(deleteCommentsToolData, createDeleteCommentsTool(agentFeedbackService, sessionsManagementService)));
	store.add(toolsService.registerTool(resolveCommentsToolData, createResolveCommentsTool(agentFeedbackService, sessionsManagementService)));
	return store;
}
