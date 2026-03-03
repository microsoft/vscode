/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { renderAsPlaintext } from '../../../../../base/browser/markdownRenderer.js';
import { Disposable, DisposableResourceMap, IDisposable } from '../../../../../base/common/lifecycle.js';
import { autorun, autorunIterableDelta, IObservable, ISettableObservable, observableValue } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { migrateLegacyTerminalToolSpecificData } from '../../common/chat.js';
import { IChatModel } from '../../common/model/chatModel.js';
import { IChatService, IChatToolInvocation, ToolConfirmKind } from '../../common/chatService/chatService.js';
import { ILanguageService } from '../../../../../editor/common/languages/language.js';

export interface IAgentSessionApprovalInfo {
	readonly label: string;
	readonly languageId: string | undefined;
	confirm(): void;
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

		const setIfChanged = (value: IAgentSessionApprovalInfo | undefined) => {
			const current = settable.get();
			if (current === value) {
				return;
			}
			if (current !== undefined && value !== undefined && current.label === value.label && current.languageId === value.languageId) {
				return;
			}
			settable.set(value, undefined);
		};

		return autorun(reader => {
			const needsInput = model.requestNeedsInput.read(reader);
			if (!needsInput) {
				setIfChanged(undefined);
				return;
			}

			const lastResponse = model.lastRequest?.response;
			if (!lastResponse?.response?.value) {
				setIfChanged(undefined);
				return;
			}

			for (const part of lastResponse.response.value) {
				if (part.kind !== 'toolInvocation') {
					continue;
				}
				const state = part.state.read(reader);
				if (state.type === IChatToolInvocation.StateKind.WaitingForConfirmation || state.type === IChatToolInvocation.StateKind.WaitingForPostApproval) {
					let label: string;
					let languageId: string | undefined;
					if (part.toolSpecificData?.kind === 'terminal') {
						const terminalData = migrateLegacyTerminalToolSpecificData(part.toolSpecificData);
						label = terminalData.presentationOverrides?.commandLine ?? terminalData.commandLine.forDisplay ?? terminalData.commandLine.userEdited ?? terminalData.commandLine.toolEdited ?? terminalData.commandLine.original;
						languageId = this._languageService.getLanguageIdByLanguageName(terminalData.presentationOverrides?.language ?? terminalData.language) ?? undefined;
					} else if (needsInput.detail) {
						label = needsInput.detail;
					} else {
						const msg = part.invocationMessage;
						label = typeof msg === 'string' ? msg : renderAsPlaintext(msg);
					}

					const confirmState = state;
					setIfChanged({
						label,
						languageId,
						confirm: () => confirmState.confirm({ type: ToolConfirmKind.UserAction }),
					});
					return;
				}
			}

			setIfChanged(undefined);
		});
	}
}
