/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../base/common/uri.js';
import { ILogService } from '../../../../log/common/log.js';
import { parseWorkflowMessagePresentation, type WorkflowMessagePresentation } from '../../../../workflow/common/workflowMessage.js';
import type { IAgentHostChatContribution, IAgentHostChatContributionContext, IDispatchedAction, IHydrationContext, IIncomingRequest, IOutgoingTurn, ITurnEnd, IncomingRequestDisposition } from '../../../common/agentHostChatContributionsService.js';
import { readWorkflowMessagePresentation, toWorkflowMessageMeta } from '../../../common/meta/agentWorkflowMeta.js';
import { ISessionDataService, type ISessionDatabase } from '../../../common/sessionDataService.js';
import { ActionType } from '../../../common/state/sessionActions.js';
import { chatStorageUri, MessageKind, type Turn } from '../../../common/state/sessionState.js';
import { IAgentHostLocalTurns } from '../../agentHostLocalTurns.js';
import { IAgentHostSessionTitleController } from '../../agentHostSessionTitleController.js';
import { IAgentHostWorkflowService } from '../../workflow/agentHostWorkflowService.js';

export class WorkflowContribution extends Disposable implements IAgentHostChatContribution {
	static readonly id = 'workflow';
	readonly order = 250;

	constructor(
		protected readonly _context: IAgentHostChatContributionContext,
		@IAgentHostWorkflowService private readonly _workflows: IAgentHostWorkflowService,
		@ISessionDataService private readonly _sessionDataService: ISessionDataService,
		@IAgentHostLocalTurns private readonly _localTurns: IAgentHostLocalTurns,
		@IAgentHostSessionTitleController private readonly _titleController: IAgentHostSessionTitleController,
		@ILogService private readonly _logService: ILogService,
	) {
		super();
	}

	onIncomingRequest(request: IIncomingRequest): IncomingRequestDisposition | undefined {
		return this._workflows.onIncomingRequest(request);
	}

	onTurnEnd(turn: ITurnEnd): void {
		this._workflows.onTurnEnd(turn);
	}

	onDidDispatchAction(observed: IDispatchedAction): void {
		this._workflows.onDidDispatchAction(observed);
		const action = observed.action;
		if (!observed.rejectionReason && action.type === ActionType.ChatTurnStarted && action.message.origin.kind === MessageKind.User
			&& this._workflows.ownsContinuation(observed.session) && this._localTurns.isLocal(observed.channel, action.turnId)) {
			this._titleController.seedTitleFromFirstMessage(observed.session, action.message.text, observed.channel);
		}
	}

	async onOutgoingTurn(turn: IOutgoingTurn): Promise<undefined> {
		const presentation = readWorkflowMessagePresentation(turn.message);
		if (turn.message.origin.kind !== MessageKind.SystemNotification || !presentation) {
			return undefined;
		}
		const storage = chatStorageUri(turn.chat);
		if (!storage) {
			return undefined;
		}
		const ref = this._sessionDataService.openDatabase(storage);
		try {
			await ref.object.setTurnRequestSource(turn.turnId, JSON.stringify(presentation));
		} finally {
			ref.dispose();
		}
		return undefined;
	}

	async onHydrateTurns(context: IHydrationContext, turns: readonly Turn[]): Promise<readonly Turn[]> {
		const storage = chatStorageUri(URI.parse(context.chat));
		if (turns.length === 0 || !storage) {
			return turns;
		}
		const ref = await this._sessionDataService.tryOpenDatabase(storage);
		if (!ref) {
			return turns;
		}
		try {
			const sources = await ref.object.getTurnRequestSources();
			const legacy = await this._legacyPresentations(context, ref.object, sources);
			return turns.map(turn => {
				const raw = sources.get(turn.id);
				let presentation = legacy.get(turn.id);
				if (raw !== undefined) {
					try {
						presentation = parseWorkflowMessagePresentation(JSON.parse(raw));
						if (!presentation) {
							this._logService.warn(`[WorkflowContribution] Unsupported or invalid request source for turn ${turn.id}`);
						}
					} catch (error) {
						this._logService.warn(`[WorkflowContribution] Could not read request source for turn ${turn.id}`, error);
					}
				}
				if (!presentation) {
					return turn;
				}
				return {
					...turn,
					message: {
						...turn.message,
						origin: { kind: MessageKind.SystemNotification },
						_meta: { ...turn.message._meta, ...toWorkflowMessageMeta(undefined, presentation) },
					},
				};
			});
		} finally {
			ref.dispose();
		}
	}

	private async _legacyPresentations(context: IHydrationContext, database: ISessionDatabase, sources: ReadonlyMap<string, string>): Promise<ReadonlyMap<string, WorkflowMessagePresentation>> {
		const result = new Map<string, WorkflowMessagePresentation>();
		const run = await this._workflows.getWorkflowRun(URI.parse(context.session)).catch((error: unknown) => {
			this._logService.warn(`[WorkflowContribution] Could not restore legacy workflow labels for ${context.chat}`, error);
			return undefined;
		});
		if (!run || run.chat !== context.chat) {
			return result;
		}
		const checkpoints = new Map(Object.entries(run.firstTurns).map(([checkpoint, turn]) => [turn, checkpoint]));
		for (const receipt of run.receipts) {
			if (receipt.turnId) {
				checkpoints.set(receipt.turnId, receipt.checkpointId);
			}
		}
		if (run.assignment) {
			checkpoints.set(run.assignment.turnId, run.assignment.checkpointId);
		}
		for (const [turnId, checkpointId] of checkpoints) {
			const checkpoint = run.snapshot.checkpoints.find(checkpoint => checkpoint.id === checkpointId);
			if (sources.has(turnId) || !checkpoint) {
				continue;
			}
			const presentation: WorkflowMessagePresentation = {
				kind: 'workflow', workflowLabel: run.snapshot.label, checkpointLabel: checkpoint.label,
			};
			result.set(turnId, presentation);
			const eventId = await database.getTurnEventId(turnId);
			if (eventId) {
				result.set(eventId, presentation);
			}
		}
		return result;
	}
}
