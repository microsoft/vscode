/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { raceCancellationError } from '../../../../base/common/async.js';
import { CancellationToken, CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { toErrorMessage } from '../../../../base/common/errorMessage.js';
import { isCancellationError } from '../../../../base/common/errors.js';
import { Event } from '../../../../base/common/event.js';
import { Disposable, MutableDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { autorun, derived, observableSignal, ObservablePromise } from '../../../../base/common/observable.js';
import { localize } from '../../../../nls.js';
import { IWorkbenchContribution } from '../../../../workbench/common/contributions.js';
import { ChatContextPick, IChatContextPickService } from '../../../../workbench/contrib/chat/browser/attachments/chatContextPickService.js';
import { ISessionsManagementService } from '../../../services/sessions/common/sessionsManagement.js';
import { ISessionCanvasService } from './sessionCanvasService.js';
import { toCanvasContextVariableEntry } from './sessionCanvasContext.js';

/** Attaches canvas context to the requesting composer without submitting a request. */
export class SessionCanvasContextContribution extends Disposable implements IWorkbenchContribution {
	static readonly ID = 'workbench.contrib.sessionCanvasContext';

	private readonly _picker = this._register(new MutableDisposable());

	constructor(
		@IChatContextPickService private readonly _chatContextPickService: IChatContextPickService,
		@ISessionsManagementService private readonly _sessionsManagementService: ISessionsManagementService,
		@ISessionCanvasService private readonly _canvasService: ISessionCanvasService,
	) {
		super();

		this._register(autorun(reader => {
			if (this._canvasService.enabled.read(reader)) {
				if (!this._picker.value) {
					this._registerPicker();
				}
			} else {
				this._picker.clear();
			}
		}));
	}

	private _registerPicker(): void {
		this._picker.value = this._chatContextPickService.registerChatContextItem({
			type: 'pickerPick',
			label: localize('sessionCanvasContext.label', "Canvas Instance..."),
			icon: Codicon.browser,
			asPicker: widget => {
				const model = widget.viewModel;
				const inputEditor = widget.inputEditor;
				const attachments = widget.attachmentModel;
				const owner = model && this._sessionsManagementService.getSessionForChatResource(model.sessionResource);
				const isCurrentComposer = () => widget.viewModel === model && widget.inputEditor === inputEditor && widget.attachmentModel === attachments;
				return {
					placeholder: localize('sessionCanvasContext.placeholder', "Select a canvas instance to attach as context"),
					picks: (_query, token) => {
						const retry = observableSignal('canvasContextRetry');
						const request = derived(reader => {
							retry.read(reader);
							const cts = new CancellationTokenSource(token);
							reader.store.add(toDisposable(() => cts.dispose(true)));
							reader.store.add(Event.once<void>(inputEditor.onDidDispose)(() => cts.cancel()));
							return new ObservablePromise(this._getPicks(owner, isCurrentComposer, cts.token, () => retry.trigger(undefined)));
						});
						return derived(reader => {
							if (!this._canvasService.enabled.read(reader)) {
								return {
									busy: false,
									picks: [this._message(localize('sessionCanvasContext.disabled', "Local canvases are unavailable. Re-enable local canvases and AI features in Settings to attach a canvas."))],
								};
							}
							const result = request.read(reader).promiseResult.read(reader);
							return { busy: result === undefined, picks: result?.data ?? [] };
						});
					},
				};
			},
		});
	}

	private _message(label: string): ChatContextPick {
		return { label, disabled: true, asAttachment: () => 'noop' };
	}

	private async _getPicks(owner: ReturnType<ISessionsManagementService['getSessionForChatResource']>, isCurrentComposer: () => boolean, token: CancellationToken, retry: () => void): Promise<ChatContextPick[]> {
		if (!owner) {
			return [this._message(localize('sessionCanvasContext.noSession', "This composer is not bound to a local canvas chat."))];
		}
		if (token.isCancellationRequested || !isCurrentComposer()) {
			return [];
		}
		try {
			const target = this._canvasService.getTarget(owner.session.resource, owner.chat.resource);
			const generation = target.canvases.connectionGeneration.get();
			const isCurrent = () => !token.isCancellationRequested && isCurrentComposer()
				&& this._canvasService.getTarget(owner.session.resource, owner.chat.resource).canvases === target.canvases
				&& target.canvases.connectionGeneration.get() === generation;
			const state = await raceCancellationError(target.canvases.refresh(), token);
			if (!isCurrent()) {
				return [this._message(localize('sessionCanvasContext.changed', "The composer or canvas connection changed. Close this picker and select Canvas Instance again."))];
			}
			if (!state.supported) {
				return [this._message(localize('sessionCanvasContext.unsupported', "This chat does not support local canvases."))];
			}
			if (!state.instances.length) {
				return [this._message(localize('sessionCanvasContext.empty', "This chat has no open canvas instances."))];
			}
			return state.instances.map(instance => ({
				label: instance.title ?? instance.canvasId,
				description: instance.canvasId,
				detail: instance.availability === 'ready' ? instance.url : localize('sessionCanvasContext.unavailable', "Endpoint unavailable"),
				asAttachment: () => {
					try {
						if (isCurrent()) {
							const reference = target.canvases.getContextReference?.(instance.instanceId);
							if (reference) {
								return toCanvasContextVariableEntry(reference, instance.title ?? instance.canvasId);
							}
						}
					} catch {
						// A removed target or disabled feature cannot attach to the captured composer.
					}
					return 'noop';
				},
			}));
		} catch (error) {
			if (isCancellationError(error)) {
				return [];
			}
			return [{
				label: localize('sessionCanvasContext.retry', "Retry Loading Canvas Instances"),
				detail: localize('sessionCanvasContext.refreshFailed', "Could not load canvas instances: {0}", toErrorMessage(error)),
				asAttachment: () => {
					if (!token.isCancellationRequested && isCurrentComposer()) {
						retry();
					}
					return 'noop';
				},
			}];
		}
	}
}
