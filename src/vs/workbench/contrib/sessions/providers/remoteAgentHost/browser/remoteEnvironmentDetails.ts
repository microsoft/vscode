/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../../base/browser/dom.js';
import { status } from '../../../../../../base/browser/ui/aria/aria.js';
import { Button } from '../../../../../../base/browser/ui/button/button.js';
import { createInstantHoverDelegate } from '../../../../../../base/browser/ui/hover/hoverDelegateFactory.js';
import { Radio } from '../../../../../../base/browser/ui/radio/radio.js';
import { DomScrollableElement } from '../../../../../../base/browser/ui/scrollbar/scrollableElement.js';
import { StandardKeyboardEvent } from '../../../../../../base/browser/keyboardEvent.js';
import { RunOnceScheduler } from '../../../../../../base/common/async.js';
import { KeyCode } from '../../../../../../base/common/keyCodes.js';
import { Action } from '../../../../../../base/common/actions.js';
import { Codicon } from '../../../../../../base/common/codicons.js';
import { toErrorMessage } from '../../../../../../base/common/errorMessage.js';
import { isCancellationError } from '../../../../../../base/common/errors.js';
import { Disposable, DisposableStore, toDisposable } from '../../../../../../base/common/lifecycle.js';
import { isWindows } from '../../../../../../base/common/platform.js';
import { ScrollbarVisibility } from '../../../../../../base/common/scrollable.js';
import { generateUuid } from '../../../../../../base/common/uuid.js';
import { ThemeIcon } from '../../../../../../base/common/themables.js';
import { localize } from '../../../../../../nls.js';
import { WorkbenchToolBar } from '../../../../../../platform/actions/browser/toolbar.js';
import { sanitizeConnectionDiagnosticText } from '../../../../../../platform/agentHost/common/connectionDiagnostics.js';
import { RemoteAgentHostLocationPreference } from '../../../../../../platform/agentHost/common/remoteAgentHostLocationPreference.js';
import { orderRemoteAgentHostLocationOptions } from '../../../../../../platform/agentHost/common/remoteAgentHostLocationPreferenceDialog.js';
import { RemoteAgentHostConnectionStatus } from '../../../../../../platform/agentHost/common/remoteAgentHostService.js';
import { IClipboardService } from '../../../../../../platform/clipboard/common/clipboardService.js';
import { ICommandService } from '../../../../../../platform/commands/common/commands.js';
import { IInstantiationService } from '../../../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../../../platform/log/common/log.js';
import { INotificationService } from '../../../../../../platform/notification/common/notification.js';
import { Link } from '../../../../../../platform/opener/browser/link.js';
import { IOpenerService } from '../../../../../../platform/opener/common/opener.js';
import { defaultButtonStyles } from '../../../../../../platform/theme/browser/defaultStyles.js';
import { IEditorService } from '../../../../../services/editor/common/editorService.js';
import { IConnectionDiagnosticsService } from './connectionDiagnostics.js';
import { RemoteAgentHostCommandIds } from './remoteAgentHostCommandIds.js';
import { getRemoteTroubleshootingGuide, IRemoteTroubleshootingGuide, RemoteTroubleshootingAction } from './remoteTroubleshooting.js';
import { ICustomizationRemote, IRemotesModel, IRemoteTroubleshootingInfo, RemoteKind } from './remotesModel.js';
import { getConnectionLabel, getRemoteMetadataLabel, getRemoteTypeLabel, remoteAgentRunBehaviorDescription, renderConnectionStatus } from './remotesTable.js';

/** Registered by the Agents window, which hosts Remote Environments. */
const exportAgentHostDebugLogsCommandId = 'agentHost.exportDebugLogs';

export type RemoteEnvironmentDetailsMode = 'runBehavior' | 'troubleshoot';

/** Operations of Remote Environments that the details page reuses, so they keep its pending state and error handling. */
export interface IRemoteEnvironmentDetailsDelegate {
	close(): void;
	onDidChangeBusy(busy: boolean): void;
	newSession(): Promise<void>;
	openConfiguration(kind: RemoteKind): Promise<void>;
	showExtension(extensionId: string): Promise<void>;
	signInToTunnels(): Promise<void>;
	refresh(): Promise<void>;
	deleteRemote(): Promise<void>;
}

type DetailsOperation = 'connect' | 'connectHost' | 'disconnect' | 'update' | 'restart' | 'diagnostics' | 'action';

/** A focused page in Remote Environments for choosing how agents run on an environment, or for troubleshooting its connection. */
export class RemoteEnvironmentDetails extends Disposable {
	readonly domNode = dom.$('.remotes-environment-details');
	private readonly body: HTMLElement;
	private readonly footer: HTMLElement;
	private readonly title: HTMLElement;
	private readonly owner: HTMLElement;
	private readonly identityDetail: HTMLElement;
	private readonly backAction: Action;
	private readonly backToolbar: WorkbenchToolBar;
	private readonly feedback: HTMLElement;
	private readonly reportFeedback = dom.$('p.remotes-details-feedback.remotes-report-feedback', { id: generateUuid(), role: 'status', 'aria-atomic': 'true' });
	private readonly controls = this._register(new DisposableStore());
	private readonly scrollable: DomScrollableElement;
	private readonly hoverDelegate = this._register(createInstantHoverDelegate());
	private readonly buttons: Button[] = [];
	/** The page's focusable controls by a stable key, so focus survives re-rendering. */
	private readonly focusables = new Map<string, HTMLElement>();
	private busy = false;
	private radio: Radio | undefined;
	private selectedPreference: RemoteAgentHostLocationPreference | undefined;
	private readonly currentChoices: { value: RemoteAgentHostLocationPreference; element: HTMLElement; label: string; detail: string; option: HTMLElement }[] = [];
	private saveButton: Button | undefined;
	private reportLink: Link | undefined;
	private info: IRemoteTroubleshootingInfo | undefined;
	private infoRequest = 0;
	private guide: IRemoteTroubleshootingGuide | undefined;
	private taskError: string | undefined;
	private connectionProgress: string | undefined;
	private remote: ICustomizationRemote;

	constructor(
		remote: ICustomizationRemote,
		readonly mode: RemoteEnvironmentDetailsMode,
		private readonly model: IRemotesModel,
		private readonly delegate: IRemoteEnvironmentDetailsDelegate,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IConnectionDiagnosticsService private readonly diagnosticsService: IConnectionDiagnosticsService,
		@ICommandService private readonly commandService: ICommandService,
		@IEditorService private readonly editorService: IEditorService,
		@IClipboardService private readonly clipboardService: IClipboardService,
		@IOpenerService private readonly openerService: IOpenerService,
		@ILogService private readonly logService: ILogService,
		@INotificationService private readonly notificationService: INotificationService,
	) {
		super();
		this.remote = remote;
		this._register(toDisposable(() => this.domNode.remove()));
		const navigation = dom.append(this.domNode, dom.$('.remotes-task-navigation'));
		this.backAction = this._register(new Action('remotes.back', localize('remotes.backToEnvironments', "Back to Remote Environments"),
			ThemeIcon.asClassName(Codicon.arrowLeft), true, () => this.goBack()));
		this.backToolbar = this._register(instantiationService.createInstance(WorkbenchToolBar, dom.append(navigation, dom.$('.remotes-task-back')), {
			ariaLabel: localize('remotes.navigation', "Page navigation"), hoverDelegate: this.hoverDelegate,
		}));
		this.backToolbar.setActions([this.backAction]);
		const heading = dom.append(navigation, dom.$('.remotes-task-heading'));
		this.title = dom.append(heading, dom.$('h2.remotes-task-title', { id: generateUuid() },
			mode === 'runBehavior' ? localize('remotes.runBehavior', "Agent run behavior") : localize('remotes.troubleshoot', "Troubleshoot connection")));
		this.owner = dom.$('dd.remotes-details-owner', { id: generateUuid() }, remote.name);
		this.identityDetail = dom.$('dl.remotes-task-identity-detail');
		this.domNode.setAttribute('role', 'region');
		this.domNode.setAttribute('aria-labelledby', `${this.title.id} ${this.owner.id}`);
		this.body = dom.$('.remotes-details-body');
		this.scrollable = this._register(new DomScrollableElement(this.body, { horizontal: ScrollbarVisibility.Hidden, vertical: ScrollbarVisibility.Auto }));
		// Moving focus below the fold scrolls the body natively; keep the scrollbar in sync.
		this._register(dom.addDisposableListener(this.body, dom.EventType.SCROLL, () => this.scrollable.setScrollPosition({ scrollTop: this.body.scrollTop })));
		dom.append(this.domNode, this.scrollable.getDomNode());
		this.feedback = dom.$('p.remotes-details-feedback', { id: generateUuid(), role: 'status', 'aria-atomic': 'true' });
		this.footer = dom.$('.remotes-details-actions.remotes-details-footer');
		if (mode === 'runBehavior') {
			this.updateIdentity();
			this.renderRunBehavior();
		} else {
			this.renderTroubleshooting();
			void this.loadTroubleshootingInfo();
			const reload = this._register(new RunOnceScheduler(() => {
				if (!this.busy) {
					void this.loadTroubleshootingInfo();
				}
			}, 100));
			this._register(model.onDidChangeTroubleshootingInfo(() => reload.schedule()));
		}
		const observer = this._register(new dom.DisposableResizeObserver('RemoteEnvironmentDetails', () => this.scrollable.scanDomNode(), dom.getWindow(this.domNode)));
		this._register(observer.observe(this.domNode));
		this._register(dom.addDisposableListener(this.domNode, dom.EventType.KEY_DOWN, event => {
			const keyboard = new StandardKeyboardEvent(event);
			if (keyboard.keyCode === KeyCode.Escape && !keyboard.altKey && !keyboard.ctrlKey && !keyboard.metaKey && !keyboard.shiftKey) {
				keyboard.preventDefault();
				keyboard.stopPropagation();
				this.goBack();
			}
		}, true));
	}

	private goBack(): void {
		if (this.busy) {
			return;
		}
		this.delegate.close();
	}

	private button(container: HTMLElement, label: string, run: () => void, secondary = true, focusKey?: string): Button {
		const options = { ...defaultButtonStyles, secondary, hoverDelegate: this.hoverDelegate };
		const button = this.controls.add(new Button(container, options));
		button.label = label;
		this.controls.add(button.onDidClick(run));
		this.buttons.push(button);
		if (focusKey) {
			this.focusables.set(focusKey, button.element);
		}
		return button;
	}

	private renderRunBehavior(): void {
		const description = dom.append(this.body, dom.$('p.remotes-task-description.remotes-run-description', { id: generateUuid() }, remoteAgentRunBehaviorDescription));
		this.body.appendChild(this.identityDetail);
		const field = dom.append(this.body, dom.$('section.remotes-run-field'));
		const fieldTitle = dom.append(field, dom.$('h3.remotes-run-question', { id: generateUuid() },
			localize('remotes.runPreference', "Preferred run behavior")));
		const choices = orderRemoteAgentHostLocationOptions('VS Code', undefined).map(choice => ({ value: choice.preference, label: choice.label, detail: choice.detail }));
		let selected = this.selectedPreference = this.model.getPreferredAgentLocation(this.remote.id) ?? choices[0].value;
		const radio = this.radio = this.controls.add(new Radio({
			items: choices.map(choice => ({
				text: choice.label, ariaLabel: localize('remotes.runChoiceLabel', "{0}. {1}", choice.label, choice.detail), isActive: choice.value === selected,
			})), hoverDelegate: this.hoverDelegate,
		}));
		radio.domNode.classList.add('remotes-run-choices', 'remotes-method-choices');
		radio.domNode.setAttribute('aria-labelledby', fieldTitle.id);
		radio.domNode.setAttribute('aria-describedby', description.id);
		field.appendChild(radio.domNode);
		for (const [index, element] of radio.optionElements.entries()) {
			const current = dom.append(element, dom.$('span.remotes-choice-current'));
			dom.append(element, dom.$('span.remotes-choice-description', undefined, choices[index].detail));
			this.currentChoices.push({ value: choices[index].value, element: current, label: choices[index].label, detail: choices[index].detail, option: element });
		}
		this.updateCurrentChoice();
		if (this.remote.kind === 'tunnel') {
			dom.append(field, dom.$('p.remotes-run-hint', undefined,
				localize('remotes.runTunnelLimits', "If this Dev Tunnel is shared by VS Code, keep that remote window open to stay connected.")));
		}
		const actionSection = dom.append(this.body, dom.$('section.remotes-run-actions'));
		const saveHint = dom.append(actionSection, dom.$('p.remotes-run-hint', { id: generateUuid() },
			localize('remotes.runSaveEffects', "Your choice applies on the next connection. Existing sessions are not moved.")));
		actionSection.append(this.footer, this.feedback);
		const actions = this.footer;
		this.button(actions, localize('remotes.cancelDetails', "Cancel"), () => this.delegate.close());
		const save = this.saveButton = this.button(actions, localize('remotes.saveRunBehaviorOnly', "Save"), () => {
			if (selected && !this.busy) {
				const preference = selected;
				void this.run(async () => {
					const result = await this.model.changePreferredAgentLocation(this.remote.id, preference);
					this.feedback.textContent = '';
					status(result === 'saved'
						? localize('remotes.runSaved', "Saved. Your choice applies the next time you connect.")
						: localize('remotes.runReconnected', "Saved and reconnected."));
					save.enabled = false;
				});
			}
		}, false);
		save.element.setAttribute('aria-describedby', `${saveHint.id} ${this.feedback.id}`);
		if (isWindows) {
			actions.prepend(save.element);
		}
		this.controls.add(radio.onDidSelect(index => {
			selected = this.selectedPreference = choices[index].value;
			this.feedback.textContent = '';
			this.updateSaveButton();
		}));
		this.updateSaveButton();
	}

	private updateSaveButton(): void {
		if (!this.saveButton) {
			return;
		}
		const connected = RemoteAgentHostConnectionStatus.isConnected(this.remote.connectionStatus);
		this.saveButton.label = connected ? localize('remotes.saveRunBehavior', "Save and Reconnect") : localize('remotes.saveRunBehaviorOnly', "Save");
		this.saveButton.setTitle(connected
			? localize('remotes.saveRunBehaviorConnected', "Save the selected behavior and reconnect this environment.")
			: localize('remotes.saveRunBehaviorDisconnected', "Save the selected behavior for the next connection. This does not connect the environment."));
		this.saveButton.enabled = !this.busy && this.selectedPreference !== undefined && this.selectedPreference !== this.model.getPreferredAgentLocation(this.remote.id)
			&& !RemoteAgentHostConnectionStatus.isConnecting(this.remote.connectionStatus) && !RemoteAgentHostConnectionStatus.isReconnecting(this.remote.connectionStatus);
	}

	private updateIdentity(): void {
		this.owner.textContent = this.remote.name;
		dom.clearNode(this.identityDetail);
		const field = (label: string, value: string) => {
			dom.append(this.identityDetail, dom.$('dt', undefined, label));
			return dom.append(this.identityDetail, dom.$('dd', undefined, value));
		};
		dom.append(this.identityDetail, dom.$('dt', undefined, localize('remotes.environment', "Environment")));
		this.identityDetail.appendChild(this.owner);
		const connection = field(localize('remotes.status', "Status"), '');
		connection.classList.add('remotes-recovery-status');
		const indicator = dom.append(connection, dom.$('span.remotes-connection-indicator', { 'aria-hidden': 'true' }));
		const remote = this.taskError ? { ...this.remote, lastConnectionError: this.taskError } : this.remote;
		renderConnectionStatus(indicator, remote, this.connectionProgress ? true : undefined);
		dom.append(connection, dom.$('span', undefined, this.connectionProgress ?? getConnectionLabel(remote)));
		field(localize('remotes.connectionType', "Connection type"), getRemoteTypeLabel(this.remote.kind));
		const system = getRemoteMetadataLabel(this.remote, 'system');
		if (system) {
			field(localize('remotes.operatingSystem', "Operating system"), system);
		}
		if (this.remote.detail && this.remote.kind === 'ssh') {
			field(localize('remotes.hostAddress', "Host address"), this.remote.detail);
		} else if (this.remote.detail && this.remote.kind === 'wsl') {
			field(localize('remotes.distribution', "Distribution"), this.remote.detail);
		}
		if (this.mode !== 'troubleshoot') {
			return;
		}
		const metadata = this.remote.metadata;
		if (metadata?.lastOnlineAt !== undefined) {
			field(localize('remotes.lastOnline', "Last seen online"), new Date(metadata.lastOnlineAt).toLocaleString());
		}
		if (metadata?.lastConnectedAt !== undefined) {
			field(localize('remotes.lastConnectedFromDevice', "Last connected from this computer"), new Date(metadata.lastConnectedAt).toLocaleString());
		}
		if (this.remote.lastHeartbeatAt !== undefined) {
			field(localize('remotes.lastHeartbeat', "Last heartbeat"), new Date(this.remote.lastHeartbeatAt).toLocaleString());
		}
		const step = this.info?.lastStep;
		if (step) {
			const time = new Date(step.timestamp).toLocaleTimeString();
			field(localize('remotes.lastStep', "Last connection step"), step.outcome === 'failed'
				? step.error ? localize('remotes.lastStepFailedWithError', "{0} failed at {1}: {2}", step.phase, time, step.error) : localize('remotes.lastStepFailed', "{0} failed at {1}", step.phase, time)
				: step.outcome === 'succeeded' ? localize('remotes.lastStepSucceeded', "{0} succeeded at {1}", step.phase, time)
					: localize('remotes.lastStepStarted', "{0} started at {1}", step.phase, time));
		}
		const connectionStatus = this.remote.connectionStatus;
		if (connectionStatus.kind === 'reconnecting' && connectionStatus.nextAttemptAt !== undefined) {
			field(localize('remotes.nextAttempt', "Next automatic attempt"), new Date(connectionStatus.nextAttemptAt).toLocaleTimeString());
		}
		for (const fact of this.guide?.facts ?? []) {
			field(fact.label, fact.value);
		}
	}

	update(remote: ICustomizationRemote): void {
		const previous = this.remote;
		this.remote = remote;
		if (RemoteAgentHostConnectionStatus.isConnected(remote.connectionStatus) && !RemoteAgentHostConnectionStatus.isConnected(previous.connectionStatus)) {
			this.taskError = undefined;
		}
		if (this.mode === 'troubleshoot' && !this.busy) {
			if (remote.connectionStatus.kind !== previous.connectionStatus.kind || remote.lastConnectionError !== previous.lastConnectionError
				|| remote.canUpdateServer !== previous.canUpdateServer
				|| JSON.stringify([remote.metadata?.server, remote.metadata?.serverBuild]) !== JSON.stringify([previous.metadata?.server, previous.metadata?.serverBuild])) {
				// Connection steps, resolved facts and versions may have changed with the connection.
				void this.loadTroubleshootingInfo();
			}
			if (JSON.stringify(this.getGuide()) !== JSON.stringify(this.guide)) {
				this.feedback.textContent = '';
				this.renderTroubleshooting();
				return;
			}
		}
		this.updateIdentity();
		this.updateCurrentChoice();
		this.updateSaveButton();
		this.scrollable.scanDomNode();
	}

	private updateCurrentChoice(): void {
		const current = this.model.getPreferredAgentLocation(this.remote.id);
		for (const choice of this.currentChoices) {
			choice.element.textContent = localize('remotes.currentChoice', "Saved preference");
			choice.element.hidden = choice.value !== current;
			choice.option.setAttribute('aria-label', localize('remotes.choiceState', "{0}. {1} {2}", choice.label, choice.detail, choice.value === current ? choice.element.textContent : '').trim());
		}
	}

	private getGuide(): IRemoteTroubleshootingGuide {
		return getRemoteTroubleshootingGuide(this.remote, this.info ?? {}, this.taskError ?? this.remote.lastConnectionError);
	}

	/** Reads the facts that need configuration or other services; the page shows what it knows until they arrive. */
	private async loadTroubleshootingInfo(): Promise<void> {
		const request = ++this.infoRequest;
		try {
			const info = await this.model.getTroubleshootingInfo(this.remote.id);
			if (request === this.infoRequest && !this._store.isDisposed && JSON.stringify(info) !== JSON.stringify(this.info)) {
				this.info = info;
				if (!this.busy) {
					this.renderTroubleshooting();
				}
			}
		} catch (error) {
			this.logService.trace('[Remote Environments] Couldn\'t read troubleshooting information', error);
		}
	}

	private renderTroubleshooting(): void {
		const active = dom.getActiveElement();
		const focusedKey = [...this.focusables].find(([, element]) => element.contains(active))?.[0];
		const hadFocus = !!focusedKey || dom.isHTMLElement(active) && this.body.contains(active);
		this.controls.clear();
		this.buttons.length = 0;
		this.focusables.clear();
		this.reportLink = undefined;
		dom.clearNode(this.body);
		dom.clearNode(this.footer);
		const remote = this.remote;
		const guide = this.guide = this.getGuide();
		const connected = RemoteAgentHostConnectionStatus.isConnected(remote.connectionStatus);
		const pending = RemoteAgentHostConnectionStatus.isConnecting(remote.connectionStatus) || RemoteAgentHostConnectionStatus.isReconnecting(remote.connectionStatus);
		const error = this.taskError ?? remote.lastConnectionError;
		if (!connected && !pending && error && !this.feedback.textContent) {
			this.feedback.textContent = localize('remotes.connectionFailureDetail', "Connection failed: {0}", sanitizeConnectionDiagnosticText(error));
		}
		this.updateIdentity();
		this.body.appendChild(this.identityDetail);

		const next = dom.append(this.body, dom.$('section.remotes-recovery-next'));
		next.appendChild(this.feedback);
		for (const text of guide.guidance) {
			dom.append(next, dom.$('p.remotes-recovery-guidance', undefined, text));
		}
		if (!guide.guidance.length && !connected && !pending && !error && remote.availability !== 'online' && remote.unavailableReason) {
			dom.append(next, dom.$('p.remotes-recovery-guidance', undefined, remote.unavailableReason));
		}
		if (guide.command) {
			const { label, value } = guide.command;
			const command = dom.append(next, dom.$('.remotes-recovery-command'));
			const labelElement = dom.append(command, dom.$('p.remotes-recovery-command-label', { id: generateUuid() }, label));
			const row = dom.append(command, dom.$('.remotes-recovery-command-row'));
			dom.append(row, dom.$('code', { 'aria-labelledby': labelElement.id }, value));
			const copy = this.button(row, localize('remotes.copyCommand', "Copy"), () => void this.copyCommand(value), true, 'copyCommand');
			copy.element.setAttribute('aria-label', localize('remotes.copyCommandLabel', "Copy command: {0}", value));
		}
		if (guide.primary) {
			this.actionButton(guide.primary, false);
		}
		for (const action of guide.actions) {
			this.actionButton(action, true);
		}
		next.appendChild(this.footer);
		this.footer.hidden = !this.footer.childElementCount;
		const documentation = dom.append(next, dom.$('p.remotes-recovery-links'));
		this.controls.add(this.instantiationService.createInstance(Link, documentation, guide.documentation, { hoverDelegate: this.hoverDelegate }));
		this.setFocusable('documentation', documentation.firstElementChild);

		const supportTitleId = generateUuid();
		const support = dom.append(this.body, dom.$('section.remotes-recovery-support', { 'aria-labelledby': supportTitleId }));
		dom.append(support, dom.$('h3.remotes-recovery-heading', { id: supportTitleId }, localize('remotes.collectDiagnostics', "Collect diagnostics")));
		dom.append(support, dom.$('p', undefined, connected
			? localize('remotes.reportPurposeConnected', "Collect a diagnostic report to investigate session problems. It may include names, addresses, and local logs for all environments. Review and remove sensitive details before sharing.")
			: localize('remotes.reportPurpose', "Collect a diagnostic report to troubleshoot the connection. It may include names, addresses, and local logs for all environments. Review and remove sensitive details before sharing.")));
		const reportActions = dom.append(support, dom.$('.remotes-details-actions'));
		const copyReport = this.button(reportActions, localize('remotes.copyReport', "Copy Report"), () => void this.run(async () => {
			const contents = await this.getDiagnosticContents();
			if (contents !== undefined) {
				await this.clipboardService.writeText(contents);
				if (!this._store.isDisposed) {
					status(localize('remotes.reportCopied', "Report copied."));
				}
			}
		}, 'diagnostics'), true, 'copyReport');
		copyReport.element.setAttribute('aria-describedby', this.reportFeedback.id);
		const exportLogs = this.button(reportActions, localize('remotes.exportAgentHostLogs', "Export Agent Host Debug Logs..."),
			() => void this.executeCommand(exportAgentHostDebugLogsCommandId), true, 'exportLogs');
		exportLogs.setTitle(localize('remotes.exportAgentHostLogsDetail', "Save the agent host logs of this computer and its connections to a file you can attach to an issue."));
		const reportLink = dom.append(support, dom.$('p.remotes-recovery-links'));
		this.reportLink = this.controls.add(this.instantiationService.createInstance(Link, reportLink, {
			label: localize('remotes.openReport', "Open Diagnostic Report"), href: '#',
			title: localize('remotes.openReportTooltip', "Open diagnostic report in the editor"),
		}, { opener: () => void this.run(() => this.openDiagnosticReport(), 'diagnostics'), hoverDelegate: this.hoverDelegate }));
		reportLink.firstElementChild?.setAttribute('aria-describedby', this.reportFeedback.id);
		this.setFocusable('openReport', reportLink.firstElementChild);
		support.appendChild(this.reportFeedback);

		const focusTarget = focusedKey && this.focusables.get(focusedKey);
		if (focusTarget) {
			focusTarget.focus();
		} else if (hadFocus) {
			const primary = guide.primary && this.focusables.get(guide.primary);
			if (primary) {
				primary.focus();
			} else {
				this.backToolbar.focus();
			}
		}
		this.scrollable.scanDomNode();
	}

	private setFocusable(key: string, element: Element | null): void {
		if (dom.isHTMLElement(element)) {
			this.focusables.set(key, element);
		}
	}

	private actionButton(action: RemoteTroubleshootingAction, secondary: boolean): void {
		const button = this.button(this.footer, this.getActionLabel(action), () => this.runAction(action), secondary, action);
		button.element.setAttribute('aria-describedby', this.feedback.id);
		if (action === 'disconnect') {
			button.setTitle(localize('remotes.disconnectDetail', "Disconnect from {0}. Sessions may continue running on the remote computer.", this.remote.name));
		}
	}

	private getActionLabel(action: RemoteTroubleshootingAction): string {
		switch (action) {
			case 'connect': return localize('remotes.connectAction', "Connect");
			case 'retry': return localize('remotes.retryConnection', "Retry Connection");
			case 'updateServer': return localize('remotes.updateServer', "Update Server");
			case 'signIn': return localize('remotes.signIn', "Sign In");
			case 'connectHost': return localize('remotes.connectHost', "Connect {0}", this.info?.devContainer?.hostName ?? '');
			case 'newSession': return localize('remotes.newSession', "New Session");
			case 'disconnect': return localize('remotes.disconnectAction', "Disconnect");
			case 'openSSHConfig': return localize('remotes.openSSHConfig', "Open SSH Configuration");
			case 'forgetHostKey': return localize('remotes.forgetHostKey', "Forget Saved Host Key...");
			case 'connectViaSSH': return localize('remotes.connectViaSSH', "Connect via SSH...");
			case 'restartDistribution': return localize('remotes.restartDistribution', "Restart Distribution...");
			case 'refresh': return localize('remotes.refreshAction', "Refresh");
			case 'deleteTunnel': return localize('remotes.deleteTunnel', "Delete Dev Tunnel...");
			case 'openEnvironmentSettings': return localize('remotes.openGroupSettings', "Open Settings");
			case 'removeEnvironment': return localize('remotes.removeEnvironment', "Remove Environment...");
			case 'showExtension': return localize('remotes.showExtension', "Show {0} Extension", this.remote.contributedBy?.displayName ?? '');
			case 'reportExtensionIssue': return localize('remotes.reportExtensionIssue', "Report Issue");
			case 'showLog': return localize('remotes.showLog', "Show Log");
			case 'deleteDevContainer': return localize('remotes.deleteDevContainer', "Delete Dev Container...");
		}
	}

	private runAction(action: RemoteTroubleshootingAction): void {
		if (this.busy) {
			return;
		}
		const id = this.remote.id;
		switch (action) {
			case 'connect':
			case 'retry':
				void this.run(() => this.model.setConnected(id, true), 'connect');
				break;
			case 'connectHost': {
				const hostId = this.info?.devContainer?.hostId;
				if (hostId) {
					void this.run(() => this.model.setConnected(hostId, true), 'connectHost');
				}
				break;
			}
			case 'disconnect':
				void this.run(() => this.model.setConnected(id, false), 'disconnect');
				break;
			case 'updateServer':
				void this.run(() => this.model.updateServer(id), 'update');
				break;
			case 'restartDistribution':
				void this.run(() => this.model.restartWSLDistribution(id), 'restart');
				break;
			case 'forgetHostKey':
				void this.run(async () => {
					await this.model.forgetSSHHostKey(id);
					status(localize('remotes.hostKeyForgotten', "Saved host key forgotten. Retry the connection to verify the new key."));
				}, 'action');
				break;
			case 'showLog':
				void this.run(() => this.model.showConnectionLog(id), 'action');
				break;
			case 'signIn':
				void this.run(() => this.delegate.signInToTunnels(), 'action');
				break;
			case 'refresh':
				void this.run(() => this.delegate.refresh(), 'action');
				break;
			case 'newSession':
				// Opening a session leaves this page, which can't show what happens next.
				void this.delegate.newSession();
				break;
			case 'openSSHConfig':
				void this.run(() => this.delegate.openConfiguration('ssh'), 'action');
				break;
			case 'openEnvironmentSettings':
				void this.run(() => this.delegate.openConfiguration('environment'), 'action');
				break;
			case 'connectViaSSH':
				void this.run(async () => { await this.commandService.executeCommand(RemoteAgentHostCommandIds.connectViaSSH); }, 'action');
				break;
			case 'showExtension': {
				const extension = this.remote.contributedBy;
				if (extension) {
					void this.run(() => this.delegate.showExtension(extension.extensionId), 'action');
				}
				break;
			}
			case 'reportExtensionIssue': {
				const url = this.info?.extension?.issuesUrl;
				if (url) {
					void this.run(async () => { await this.openerService.open(url); }, 'action');
				}
				break;
			}
			case 'deleteTunnel':
			case 'removeEnvironment':
			case 'deleteDevContainer':
				void this.run(() => this.delegate.deleteRemote(), 'action');
				break;
		}
	}

	/** Runs a command with its own progress, such as exporting logs, without blocking the page. */
	private async executeCommand(id: string): Promise<void> {
		try {
			await this.commandService.executeCommand(id);
		} catch (error) {
			if (!isCancellationError(error)) {
				this.notificationService.error(error);
			}
		}
	}

	private async copyCommand(value: string): Promise<void> {
		try {
			await this.clipboardService.writeText(value);
			status(localize('remotes.commandCopied', "Command copied."));
		} catch (error) {
			this.notificationService.error(error);
		}
	}

	private async getDiagnosticContents(): Promise<string | undefined> {
		const snapshot = await this.diagnosticsService.getSnapshot();
		if (this._store.isDisposed) {
			return undefined;
		}
		const error = this.taskError ?? this.remote.lastConnectionError;
		return error
			? localize('remotes.reportWithError', "{0}\n\nLatest error for {1}:\n{2}", snapshot.text, sanitizeConnectionDiagnosticText(this.remote.name), sanitizeConnectionDiagnosticText(error))
			: snapshot.text;
	}

	private async openDiagnosticReport(): Promise<void> {
		const contents = await this.getDiagnosticContents();
		if (contents === undefined) {
			return;
		}
		await this.commandService.executeCommand('workbench.action.closeModalEditor');
		await this.editorService.openEditor({ contents, languageId: 'plaintext', options: { pinned: true } });
	}

	private getWorkingLabel(operation: DetailsOperation | undefined): string {
		switch (operation) {
			case 'connect':
			case 'connectHost': return localize('remotes.detailsConnecting', "Connecting...");
			case 'disconnect': return localize('remotes.detailsDisconnecting', "Disconnecting...");
			case 'update': return localize('remotes.detailsUpdating', "Updating server...");
			case 'restart': return localize('remotes.detailsRestarting', "Restarting distribution...");
			case 'diagnostics': return localize('remotes.detailsCollecting', "Collecting diagnostic report...");
			default: return localize('remotes.detailsWorking', "Working...");
		}
	}

	private getFailureMessage(operation: DetailsOperation | undefined, error: string): string {
		switch (operation) {
			case 'connect': return localize('remotes.connectionFailureDetail', "Connection failed: {0}", sanitizeConnectionDiagnosticText(error));
			case 'connectHost': return localize('remotes.hostConnectionFailed', "Couldn't connect {0}: {1}", this.info?.devContainer?.hostName ?? '', sanitizeConnectionDiagnosticText(error));
			case 'disconnect': return localize('remotes.disconnectFailed', "Couldn't disconnect. Try again, or open the diagnostic report for details.");
			case 'update': return sanitizeConnectionDiagnosticText(error);
			case 'restart': return localize('remotes.restartFailed', "Couldn't restart the distribution: {0}", sanitizeConnectionDiagnosticText(error));
			case 'diagnostics': return localize('remotes.reportFailed', "Couldn't open or copy the diagnostic report. Try again.");
			case 'action': return sanitizeConnectionDiagnosticText(error);
			default: return this.selectedPreference !== undefined && this.model.getPreferredAgentLocation(this.remote.id) === this.selectedPreference
				? localize('remotes.runBehaviorReconnectFailed', "Your choice was saved, but reconnection failed: {0}", sanitizeConnectionDiagnosticText(error))
				: localize('remotes.runBehaviorSaveFailed', "Couldn't save your choice. Try again.");
		}
	}

	private async run(task: () => Promise<void>, operation?: DetailsOperation): Promise<void> {
		if (this.busy) {
			return;
		}
		this.busy = true;
		const diagnostics = operation === 'diagnostics';
		const feedback = diagnostics ? this.reportFeedback : this.feedback;
		this.domNode.setAttribute('aria-busy', 'true');
		this.radio?.setEnabled(false);
		this.backAction.enabled = false;
		const enabled = new Map(this.buttons.map(button => [button, button.enabled]));
		this.buttons.forEach(button => button.enabled = false);
		if (this.reportLink) {
			this.reportLink.enabled = false;
		}
		const working = this.getWorkingLabel(operation);
		if (this.mode === 'troubleshoot' && (operation === 'connect' || operation === 'disconnect' || operation === 'update' || operation === 'restart')) {
			this.connectionProgress = working;
			this.updateIdentity();
		}
		status(working);
		this.delegate.onDidChangeBusy(true);
		try {
			await task();
			if (!this._store.isDisposed) {
				feedback.textContent = '';
				if (operation === 'connect' || operation === 'update' || operation === 'restart') {
					this.taskError = undefined;
					status(getConnectionLabel(this.remote));
				}
			}
		} catch (error) {
			if (this._store.isDisposed && !isCancellationError(error)) {
				this.notificationService.error(error);
			}
			if (!this._store.isDisposed) {
				if (isCancellationError(error)) {
					status(localize('remotes.detailsCancelled', "Cancelled."));
				} else {
					const message = toErrorMessage(error);
					// Connection failures are the remote's state; other failures only explain what didn't work.
					if (this.mode === 'runBehavior' || operation === 'connect' || operation === 'update' || operation === 'restart') {
						this.taskError = message;
					}
					this.logService.error('[Remote Environments]', error);
					feedback.textContent = this.getFailureMessage(operation, message);
				}
			}
		} finally {
			this.busy = false;
			this.connectionProgress = undefined;
			this.delegate.onDidChangeBusy(false);
			if (!this._store.isDisposed) {
				this.backAction.enabled = true;
				this.domNode.setAttribute('aria-busy', 'false');
				this.radio?.setEnabled(true);
				this.buttons.forEach(button => button.enabled = enabled.get(button) ?? true);
				if (this.reportLink) {
					this.reportLink.enabled = true;
				}
				if (this.mode === 'runBehavior') {
					this.updateIdentity();
					this.updateCurrentChoice();
					this.updateSaveButton();
				} else if (!diagnostics) {
					this.renderTroubleshooting();
					void this.loadTroubleshootingInfo();
				}
				this.scrollable.scanDomNode();
			}
		}
	}

	get isBusy(): boolean {
		return this.busy;
	}

	layout(): void {
		this.scrollable.scanDomNode();
	}

	focus(): void {
		this.backToolbar.focus();
	}

	getAccessibilityContent(): string {
		if (this.mode !== 'runBehavior') {
			return this.domNode.innerText;
		}
		const current = this.model.getPreferredAgentLocation(this.remote.id);
		const noChoice = localize('remotes.noRunChoice', "None");
		return [
			this.domNode.innerText,
			localize('remotes.savedRunChoice', "Saved choice: {0}", this.currentChoices.find(choice => choice.value === current)?.label ?? noChoice),
			localize('remotes.selectedRunChoice', "Selected choice: {0}", this.currentChoices.find(choice => choice.value === this.selectedPreference)?.label ?? noChoice),
		].join('\n');
	}
}
