/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { renderAsPlaintext } from '../../../../../base/browser/markdownRenderer.js';
import { combinedDisposable, Disposable, DisposableMap, DisposableResourceMap, DisposableStore, IDisposable, toDisposable } from '../../../../../base/common/lifecycle.js';
import { autorun, autorunIterableDelta, IObservable, IReader, ISettableObservable, ObservableMap, observableFromEvent, observableSignalFromEvent, observableValue } from '../../../../../base/common/observable.js';
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
		const store = new DisposableStore();
		const settable = this._getOrCreateApproval(model.sessionResource.toString());
		// Request removal is announced before the model removes it from getRequests().
		const requests = observableFromEvent(this, model.onDidChange, event =>
			model.getRequests().filter(request => event?.kind !== 'removeRequest' || request.id !== event.requestId));
		// The approval each response is waiting for, if any.
		const pendingApprovals = new ObservableMap<IChatResponseModel, IAgentSessionApprovalInfo>();

		const setIfChanged = (value: IAgentSessionApprovalInfo | undefined) => {
			const current = settable.get();
			if (current === value || (current !== undefined && value !== undefined && isSameApproval(current, value))) {
				return;
			}
			settable.set(value, undefined);
		};

		store.add(autorun(reader => {
			const pending = pendingApprovals.observable.read(reader);
			if (pending.size > 0) {
				// Prefer the current request, then approvals from retained agents in older responses.
				for (const request of requests.read(reader).toReversed()) {
					const approval = request.response && pending.get(request.response);
					if (approval && !request.isHiddenFromTranscript && !(request.shouldBeRemovedOnSend && !request.shouldBeRemovedOnSend.afterUndoStop)) {
						setIfChanged(approval);
						return;
					}
				}
			}
			setIfChanged(undefined);
		}));

		// Watch each response on its own, so a streamed update re-evaluates only the response that changed instead of
		// every response in the session.
		const responseTrackers = store.add(new DisposableMap<IChatResponseModel>());
		store.add(autorunIterableDelta(
			reader => requests.read(reader).flatMap(request => request.response ? [request.response] : []),
			({ addedValues, removedValues }) => {
				for (const response of addedValues) {
					responseTrackers.set(response, this._trackResponse(response, pendingApprovals));
				}
				for (const response of removedValues) {
					responseTrackers.deleteAndDispose(response);
				}
			}
		));

		return store;
	}

	private _trackResponse(response: IChatResponseModel, pendingApprovals: ObservableMap<IChatResponseModel, IAgentSessionApprovalInfo>): IDisposable {
		const changed = observableSignalFromEvent(this, response.onDidChange);
		return combinedDisposable(
			autorun(reader => {
				const approval = this._getPendingApproval(response, changed, reader);
				const current = pendingApprovals.get(response);
				if (!approval) {
					pendingApprovals.delete(response);
				} else if (!current || !isSameApproval(current, approval)) {
					pendingApprovals.set(response, approval);
				}
			}),
			toDisposable(() => pendingApprovals.delete(response)),
		);
	}

	private _getPendingApproval(response: IChatResponseModel, changed: IObservable<void>, reader: IReader): IAgentSessionApprovalInfo | undefined {
		if (response.isCanceled) {
			return undefined;
		}
		changed.read(reader);
		const needsInput = response.isPendingConfirmation.read(reader);
		if (!needsInput) {
			return undefined;
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
				return {
					approvalId: part.toolCallId,
					kind,
					label,
					languageId,
					since: new Date(),
					confirm: () => IChatToolInvocation.confirmWith(part, { type: ToolConfirmKind.UserAction, ...(selectedButton ? { selectedButton } : {}) }),
				};
			}
		}
		return undefined;
	}
}

function isSameApproval(a: IAgentSessionApprovalInfo, b: IAgentSessionApprovalInfo): boolean {
	return a.approvalId === b.approvalId && a.kind === b.kind && a.label === b.label && a.languageId === b.languageId;
}
