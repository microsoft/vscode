/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { SequencerByKey } from '../../../../base/common/async.js';
import { equals } from '../../../../base/common/objects.js';
import { localize } from '../../../../nls.js';
import { IChatStatusCanvas, parseChatStatusCanvasContent, readChatStatusCanvases, statusCanvasLimits, UPDATE_CARD_CANVAS_TOOL, withChatStatusCanvases } from '../../common/chatStatusCanvas.js';
import { ChatInteractivity, ChatOriginKind, isSessionStatusArchived, readSessionCreationReference } from '../../common/state/sessionState.js';
import type { IServerToolGroup } from './agentServerToolHost.js';

export interface IStatusCanvasServerToolAccessor {
	persist(session: string, canvases: readonly IChatStatusCanvas[]): Promise<void>;
}

export function createStatusCanvasServerToolGroup(accessor?: IStatusCanvasServerToolAccessor): IServerToolGroup {
	const mutations = new SequencerByKey<string>();
	const strings = { type: 'array' as const, maxItems: statusCanvasLimits.items, items: { type: 'string' as const, minLength: 1, maxLength: statusCanvasLimits.text } };
	return {
		definitions: [{
			name: UPDATE_CARD_CANVAS_TOOL,
			title: 'Update Status Canvas',
			description: '<instructions>Publish a concise status snapshot on your own chat card before your final response when you finish a meaningful work turn. Replace the entire snapshot with the current topic/step, work just completed, tracked pull request URLs and next steps or blockers. Use empty arrays when there are no items. Report only observed work; PR links do not assert current CI or merge status. This updates display data only: it does not open the board, send messages, change runtime/read state or control other chats. The host supplies ownership and revision; never target another chat. Skip conversational turns and unchanged snapshots. Await the saved revision before finishing; if interrupted, the previous snapshot remains labeled with its original update time.</instructions>',
			inputSchema: {
				type: 'object',
				required: ['kind', 'topic', 'currentStep', 'justDone', 'pullRequests', 'nextSteps'],
				properties: {
					kind: { type: 'string', enum: ['status'] },
					topic: { type: 'string', minLength: 1, maxLength: statusCanvasLimits.title },
					currentStep: { type: 'string', minLength: 1, maxLength: statusCanvasLimits.text },
					justDone: strings,
					pullRequests: { type: 'array', maxItems: statusCanvasLimits.items, items: {
						type: 'object', additionalProperties: false, required: ['url'],
						properties: { url: { type: 'string', maxLength: statusCanvasLimits.url, description: 'Absolute HTTPS pull request URL. Live state is supplied by VS Code, not this snapshot.' } },
					} },
					nextSteps: strings,
				},
			},
			topLevelChatOnly: true,
			requiresTurnProvenance: true,
			deferLoading: false,
			annotations: { readOnlyHint: false, destructiveHint: false },
		}],
		isEnabled: () => !!accessor,
		isEnabledForSession: () => !!accessor,
		getDisplay: () => ({
			displayName: localize('statusCanvas.tool', "Update Status Canvas"),
			invocationMessage: localize('statusCanvas.updating', "Updating this chat's status canvas"),
			pastTenseMessage: localize('statusCanvas.updated', "Updated this chat's status canvas"),
		}),
		execute: (stateManager, context, _name, args) => {
			const content = parseChatStatusCanvasContent(args);
			const turnId = context.turnId;
			if (!accessor || !turnId) {
				throw new Error('A status canvas update requires an active turn.');
			}
			const check = () => {
				const session = stateManager.getSessionState(context.sessionUri);
				const chat = session?.chats.find(chat => chat.resource === context.chatUri);
				if (!accessor || !session || !chat || !context.turnId || stateManager.getActiveTurnId(context.chatUri) !== context.turnId
					|| isSessionStatusArchived(session.status) || isSessionStatusArchived(chat.status) || chat.origin?.kind === ChatOriginKind.Tool
					|| readSessionCreationReference(session._meta)
					|| chat.interactivity === ChatInteractivity.Hidden || chat.interactivity === ChatInteractivity.ReadOnly) {
					throw new Error('A status canvas update requires the invoking user chat and its current active turn.');
				}
				return session;
			};
			check();
			return mutations.queue(context.sessionUri, async () => {
				const state = check();
				const previous = readChatStatusCanvases(state._meta).filter(canvas => state.chats.some(chat => chat.resource === canvas.chat));
				const current = previous.find(canvas => canvas.chat === context.chatUri);
				if (current && current.turnId === turnId && equals(parseChatStatusCanvasContent(current, true), content)) {
					return JSON.stringify({ saved: true, revision: current.revision, updatedAt: current.updatedAt });
				}
				const snapshot: IChatStatusCanvas = Object.freeze({
					...content, chat: context.chatUri, turnId, revision: (current?.revision ?? 0) + 1, updatedAt: new Date().toISOString(),
				});
				const next = [...previous.filter(canvas => canvas.chat !== context.chatUri), snapshot];
				try {
					await accessor.persist(context.sessionUri, next);
					check();
				} catch (error) {
					// A failed receipt can follow a durable write; also undo writes superseded during persistence.
					try {
						await accessor.persist(context.sessionUri, previous);
					} catch (rollbackError) {
						throw new AggregateError([error, rollbackError], 'Status canvas save failed; restoring its previous snapshot also failed. Retry after storage recovers.');
					}
					throw error;
				}
				stateManager.setSessionMeta(context.sessionUri, withChatStatusCanvases(check()._meta, next));
				return JSON.stringify({ saved: true, revision: snapshot.revision, updatedAt: snapshot.updatedAt });
			});
		},
	};
}
