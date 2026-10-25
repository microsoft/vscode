/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { renderAsPlaintext } from '../../../../../base/browser/markdownRenderer.js';
import { Disposable, DisposableResourceMap, IDisposable } from '../../../../../base/common/lifecycle.js';
import { autorun, autorunIterableDelta, IObservable, ISettableObservable, observableFromEvent, observableSignalFromEvent, observableValue } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { migrateLegacyTerminalToolSpecificData } from '../../common/chat.js';
import { IChatModel, IChatResponseModel } from '../../common/model/chatModel.js';
import { IChatService, IChatToolInvocation, ToolConfirmKind } from '../../common/chatService/chatService.js';
import { ILanguageService } from '../../../../../editor/common/languages/language.js';

/**
 * The kind of attention a pending approval needs. Lets consumers tailor UI
 * (e.g. a summary message) to what the user is actually being asked to do.
 */
export const enum AgentSessionApprovalKind {
	/** A terminal command is waiting to be run. */
	Terminal = 'terminal',
	/** The agent is asking the user a question / needs a free-form response. */
	Question = 'question',
	/** Some other tool invocation is waiting for confirmation. */
	Other = 'other',
}

export interface IAgentSessionApprovalInfo {
	readonly approvalId: string;
	readonly kind: AgentSessionApprovalKind;
	readonly label: string;
	readonly languageId: string | undefined;
	readonly since: Date;
	confirm(): void;
}

/**
 * A stable identity for a specific pending approval.
 */
export function agentSessionApprovalId(info: IAgentSessionApprovalInfo): string {
	return info.approvalId;
}

/**
 * Tracks approval state for all live chat sessions. For each session,
 * exposes an observable that emits {@link IAgentSessionApprovalInfo}
 * when a tool invocation is waiting for user confirmation, or `undefined`
 * when no approval is needed.
 */
export class AgentSessionApprovalModel extends Disposable {

	private readonly _approvals = new Map<string, ISettableObservable<IAgentSessionApprovalInfo | undefined>>();
	private readonly _modelTrackers = this._register(new DisposableResourceMap());

	constructor(
		@IChatService private readonly _chatService: IChatService,
		@ILanguageService private readonly _languageService: ILanguageService,
	) {
		super();

		this._register(autorunIterableDelta(
			reader => this._chatService.chatModels.read(reader),
			({ addedValues, removedValues }) => {
				for (const model of addedValues) {
					this._modelTrackers.set(model.sessionResource, this._trackModel(model));
				}
				for (const model of removedValues) {
					this._modelTrackers.deleteAndDispose(model.sessionResource);
					this._approvals.get(model.sessionResource.toString())?.set(undefined, undefined);
				}
			}
		));
	}

	getApproval(sessionResource: URI): IObservable<IAgentSessionApprovalInfo | undefined> {
		return this._getOrCreateApproval(sessionResource.toString());
	}

	private _getOrCreateApproval(key: string): ISettableObservable<IAgentSessionApprovalInfo | undefined> {
		let obs = this._approvals.get(key);
		if (!obs) {
			obs = observableValue<IAgentSessionApprovalInfo | undefined>(`sessionApproval.${key}`, undefined);
			this._approvals.set(key, obs);
		}
		return obs;
	}

	private _trackModel(model: IChatModel): IDisposable {
		const settable = this._getOrCreateApproval(model.sessionResource.toString());
		// Request removal is announced before the model removes it from getRequests().
		const requests = observableFromEvent(this, model.onDidChange, event =>
			model.getRequests().filter(request => event?.kind !== 'removeRequest' || request.id !== event.requestId));
		const responseChanges = new WeakMap<IChatResponseModel, IObservable<void>>();

		const setIfChanged = (value: IAgentSessionApprovalInfo | undefined) => {
			const current = settable.get();
			if (current === value) {
				return;
			}
			if (current !== undefined && value !== undefined && current.approvalId === value.approvalId && current.kind === value.kind && current.label === value.label && current.languageId === value.languageId) {
				return;
			}
			settable.set(value, undefined);
		};

		return autorun(reader => {
			// Prefer the current request, then approvals from retained agents in older responses.
			for (const request of requests.read(reader).toReversed()) {
				const response = request.response;
				if (!response || response.isCanceled || request.isHiddenFromTranscript || (request.shouldBeRemovedOnSend && !request.shouldBeRemovedOnSend.afterUndoStop)) {
					continue;
				}

				let changed = responseChanges.get(response);
				if (!changed) {
					changed = observableSignalFromEvent(this, response.onDidChange);
					responseChanges.set(response, changed);
				}
				changed.read(reader);
				const needsInput = response.isPendingConfirmation.read(reader);
				if (!needsInput) {
					continue;
				}

				for (const part of response.pendingToolInvocations.read(reader)) {
					if (part.presentation === 'hidden' || (part.toolSpecificData?.kind === 'modifiedFilesConfirmation' && part.toolSpecificData.options.length !== 1)) {
						continue;
					}
					const state = part.state.read(reader);
					if (state.type === IChatToolInvocation.StateKind.WaitingForConfirmation || state.type === IChatToolInvocation.StateKind.WaitingForPostApproval) {
						const title = IChatToolInvocation.getConfirmationMessages(part)?.title;
						const detail = title ? typeof title === 'string' ? title : renderAsPlaintext(title) : needsInput.detail;
						let label: string;
						let languageId: string | undefined;
						let kind: AgentSessionApprovalKind;
						if (part.toolSpecificData?.kind === 'terminal') {
							const terminalData = migrateLegacyTerminalToolSpecificData(part.toolSpecificData);
							label = terminalData.presentationOverrides?.commandLine ?? terminalData.commandLine.forDisplay ?? terminalData.commandLine.userEdited ?? terminalData.commandLine.toolEdited ?? terminalData.commandLine.original;
							languageId = this._languageService.getLanguageIdByLanguageName(terminalData.presentationOverrides?.language ?? terminalData.language) ?? undefined;
							kind = AgentSessionApprovalKind.Terminal;
						} else if (detail) {
							label = detail;
							kind = AgentSessionApprovalKind.Question;
						} else {
							const msg = part.invocationMessage;
							label = typeof msg === 'string' ? msg : renderAsPlaintext(msg);
							kind = AgentSessionApprovalKind.Other;
						}

						const selectedButton = part.toolSpecificData?.kind === 'modifiedFilesConfirmation' ? part.toolSpecificData.options[0] : undefined;
						setIfChanged({
							approvalId: part.toolCallId,
							kind,
							label,
							languageId,
							since: new Date(),
							confirm: () => IChatToolInvocation.confirmWith(part, { type: ToolConfirmKind.UserAction, ...(selectedButton ? { selectedButton } : {}) }),
						});
						return;
					}
				}
			}

			setIfChanged(undefined);
		});
	}
}
