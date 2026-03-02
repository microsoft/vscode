/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { autorun } from '../../../../../base/common/observable.js';
import { Disposable, DisposableStore } from '../../../../../base/common/lifecycle.js';
import { IRemoteControlConfirmation, IRemoteControlMainService } from '../../../../../platform/remoteControl/common/remoteControl.js';
import { IChatService, IChatTerminalToolInvocationData, IChatToolInvocation, ILegacyChatTerminalToolInvocationData, ToolConfirmKind } from '../../common/chatService/chatService.js';
import { IChatModel, IChatResponseModel } from '../../common/model/chatModel.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { INotificationService, Severity } from '../../../../../platform/notification/common/notification.js';
import { Action2, registerAction2 } from '../../../../../platform/actions/common/actions.js';
import { ServicesAccessor } from '../../../../../platform/instantiation/common/instantiation.js';
import { localize, localize2 } from '../../../../../nls.js';
import { toAction } from '../../../../../base/common/actions.js';
import { migrateLegacyTerminalToolSpecificData } from '../../common/chat.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../../common/contributions.js';
import { IMarkdownString } from '../../../../../base/common/htmlContent.js';

/**
 * Extracts the plain text from a string or IMarkdownString.
 */
function toPlainText(value: string | IMarkdownString | undefined): string {
	if (!value) {
		return '';
	}
	if (typeof value === 'string') {
		return value;
	}
	return value.value;
}

/**
 * Workbench contribution that monitors chat agent tool invocations and
 * bridges pending terminal command confirmations to the RemoteControlMainService
 * HTTP server for remote approval/denial from a phone or browser.
 */
export class RemoteControlContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.remoteControl';

	private readonly _trackedModels = new Map<string, DisposableStore>();
	private readonly _trackedInvocations = new Map<string, DisposableStore>();
	private readonly _pendingConfirmations = new Map<string, { invocation: IChatToolInvocation; data: IRemoteControlConfirmation }>();

	constructor(
		@IChatService private readonly chatService: IChatService,
		@IRemoteControlMainService private readonly remoteControlService: IRemoteControlMainService,
		@ILogService private readonly logService: ILogService,
		@INotificationService private readonly notificationService: INotificationService,
	) {
		super();

		// Listen for confirmations coming from the remote web client
		this._register(this.remoteControlService.onDidReceiveConfirmation(response => {
			this._handleRemoteConfirmation(response);
		}));

		// Watch for new chat models being created
		this._register(this.chatService.onDidCreateModel(model => {
			this._watchModel(model);
		}));

		// Watch existing models
		this._register(autorun(reader => {
			const models = this.chatService.chatModels.read(reader);
			for (const model of models) {
				if (!this._trackedModels.has(model.sessionResource.toString())) {
					this._watchModel(model);
				}
			}
		}));
	}

	private _watchModel(model: IChatModel): void {
		const key = model.sessionResource.toString();
		if (this._trackedModels.has(key)) {
			return;
		}

		const store = new DisposableStore();
		this._trackedModels.set(key, store);

		// When the model fires addRequest, the response is already created on request.response.
		// Subscribe to that response's onDidChange to discover new tool invocation parts.
		store.add(model.onDidChange(e => {
			if (e.kind === 'addRequest' && e.request.response) {
				this._watchResponse(e.request.response, store);
			}
		}));

		// Watch responses that already exist on the model
		for (const request of model.getRequests()) {
			if (request.response) {
				this._watchResponse(request.response, store);
			}
		}

		// Clean up when model is disposed
		store.add(model.onDidDispose(() => {
			// Remove any pending confirmations from this model
			for (const [toolCallId] of this._pendingConfirmations) {
				this._pendingConfirmations.delete(toolCallId);
			}
			store.dispose();
			this._trackedModels.delete(key);
			this._pushConfirmations();
		}));
	}

	private _watchResponse(response: IChatResponseModel, store: DisposableStore): void {
		// Scan the response immediately for any tool invocations already present
		this._scanResponseForInvocations(response);

		// Re-scan whenever the response content changes (new parts added)
		store.add(response.onDidChange(() => {
			this._scanResponseForInvocations(response);
		}));
	}

	private _scanResponseForInvocations(response: IChatResponseModel): void {
		for (const part of response.response.value) {
			if (part.kind !== 'toolInvocation') {
				continue;
			}

			const invocation = part as IChatToolInvocation;

			// Already watching this invocation's state
			if (this._trackedInvocations.has(invocation.toolCallId)) {
				continue;
			}

			// Set up a per-invocation autorun that reacts to state changes
			const invocationStore = new DisposableStore();
			this._trackedInvocations.set(invocation.toolCallId, invocationStore);

			invocationStore.add(autorun(reader => {
				const state = invocation.state.read(reader);
				this._handleInvocationState(invocation, state);
			}));
		}
	}

	private _handleInvocationState(invocation: IChatToolInvocation, state: IChatToolInvocation.State): void {
		if (state.type === IChatToolInvocation.StateKind.WaitingForConfirmation) {
			// Check if this is a terminal tool invocation
			const terminalData = this._getTerminalData(invocation);
			if (terminalData && !this._pendingConfirmations.has(invocation.toolCallId)) {
				const title = state.confirmationMessages?.title
					? toPlainText(state.confirmationMessages.title)
					: toPlainText(invocation.invocationMessage);

				const data: IRemoteControlConfirmation = {
					toolCallId: invocation.toolCallId,
					toolId: invocation.toolId,
					command: terminalData.commandLine.toolEdited ?? terminalData.commandLine.original,
					cwd: terminalData.cwd ? terminalData.cwd.path ?? '' : '',
					language: terminalData.language,
					title,
					timestamp: Date.now(),
				};

				this._pendingConfirmations.set(invocation.toolCallId, { invocation, data });
				this._pushConfirmations();
				this.logService.info(`[RemoteControl] New pending confirmation: ${invocation.toolCallId} — ${data.command}`);
			}
		} else {
			// No longer waiting — remove if tracked
			if (this._pendingConfirmations.has(invocation.toolCallId)) {
				this._pendingConfirmations.delete(invocation.toolCallId);
				this._pushConfirmations();
			}

			// Clean up observation for terminal states
			if (state.type === IChatToolInvocation.StateKind.Completed || state.type === IChatToolInvocation.StateKind.Cancelled) {
				const invocationStore = this._trackedInvocations.get(invocation.toolCallId);
				invocationStore?.dispose();
				this._trackedInvocations.delete(invocation.toolCallId);
			}
		}
	}

	private _getTerminalData(invocation: IChatToolInvocation): IChatTerminalToolInvocationData | undefined {
		const data = invocation.toolSpecificData;
		if (!data || data.kind !== 'terminal') {
			return undefined;
		}
		return migrateLegacyTerminalToolSpecificData(data as IChatTerminalToolInvocationData | ILegacyChatTerminalToolInvocationData);
	}

	private _pushConfirmations(): void {
		const confirmations = Array.from(this._pendingConfirmations.values()).map(p => p.data);
		this.remoteControlService.updatePendingConfirmations(confirmations);
	}

	private _handleRemoteConfirmation(response: { toolCallId: string; approved: boolean; editedCommand?: string }): void {
		const pending = this._pendingConfirmations.get(response.toolCallId);
		if (!pending) {
			this.logService.warn(`[RemoteControl] Received confirmation for unknown toolCallId: ${response.toolCallId}`);
			return;
		}

		const state = pending.invocation.state.get();
		if (state.type !== IChatToolInvocation.StateKind.WaitingForConfirmation) {
			this.logService.warn(`[RemoteControl] Tool ${response.toolCallId} is no longer waiting for confirmation`);
			return;
		}

		this.logService.info(`[RemoteControl] Applying remote confirmation: ${response.toolCallId} ${response.approved ? 'APPROVED' : 'DENIED'}`);

		// Apply edited command if provided
		if (response.approved && response.editedCommand) {
			const terminalData = this._getTerminalData(pending.invocation);
			if (terminalData) {
				terminalData.commandLine.userEdited = response.editedCommand;
			}
		}

		// Call confirm on the state
		const reason = response.approved
			? { type: ToolConfirmKind.UserAction as const }
			: { type: ToolConfirmKind.Denied as const };

		state.confirm(reason);

		// Remove from pending
		this._pendingConfirmations.delete(response.toolCallId);
		this._pushConfirmations();

		// Show notification on the desktop
		const action = response.approved ? 'approved' : 'denied';
		this.notificationService.notify({
			severity: Severity.Info,
			message: localize('remoteControl.confirmationApplied', "Remote: Command {0} via phone", action),
		});
	}

	override dispose(): void {
		for (const store of this._trackedModels.values()) {
			store.dispose();
		}
		this._trackedModels.clear();
		for (const store of this._trackedInvocations.values()) {
			store.dispose();
		}
		this._trackedInvocations.clear();
		super.dispose();
	}
}

// --- Commands ---

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'workbench.action.remoteControl.start',
			title: localize2('remoteControl.start', "Start Remote Control Server"),
			f1: true,
			category: localize2('remoteControl', "Remote Control"),
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const notificationService = accessor.get(INotificationService);

		// Get the contribution instance — use the chat service to find it
		// For simplicity, we call the main service directly
		const remoteControlService = accessor.get(IRemoteControlMainService);

		try {
			const info = await remoteControlService.startServer();

			notificationService.notify({
				severity: Severity.Info,
				message: localize(
					'remoteControl.started',
					"Remote Control started at {0}\nOpen this URL on your phone to approve/deny agent commands.",
					info.url
				),
				actions: {
					primary: [
						toAction({
							id: 'remoteControl.copyUrl',
							label: localize('remoteControl.copyUrl', "Copy URL"),
							run: () => {
								navigator.clipboard?.writeText(info.url);
							},
						})
					]
				}
			});
		} catch (err) {
			notificationService.error(localize('remoteControl.startFailed', "Failed to start Remote Control: {0}", String(err)));
		}
	}
});

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'workbench.action.remoteControl.stop',
			title: localize2('remoteControl.stop', "Stop Remote Control Server"),
			f1: true,
			category: localize2('remoteControl', "Remote Control"),
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const remoteControlService = accessor.get(IRemoteControlMainService);
		const notificationService = accessor.get(INotificationService);

		await remoteControlService.stopServer();
		notificationService.info(localize('remoteControl.stopped', "Remote Control server stopped."));
	}
});

// Register the contribution
registerWorkbenchContribution2(RemoteControlContribution.ID, RemoteControlContribution, WorkbenchPhase.AfterRestored);
