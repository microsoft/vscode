/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../../base/browser/dom.js';
import { Button } from '../../../../../../base/browser/ui/button/button.js';
import { createInstantHoverDelegate } from '../../../../../../base/browser/ui/hover/hoverDelegateFactory.js';
import { renderIcon } from '../../../../../../base/browser/ui/iconLabel/iconLabels.js';
import { Radio } from '../../../../../../base/browser/ui/radio/radio.js';
import { DomScrollableElement } from '../../../../../../base/browser/ui/scrollbar/scrollableElement.js';
import { StandardKeyboardEvent } from '../../../../../../base/browser/keyboardEvent.js';
import { KeyCode } from '../../../../../../base/common/keyCodes.js';
import { Action } from '../../../../../../base/common/actions.js';
import { Codicon } from '../../../../../../base/common/codicons.js';
import { cancelOnDispose } from '../../../../../../base/common/cancellation.js';
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
import { IInstantiationService } from '../../../../../../platform/instantiation/common/instantiation.js';
import { ICommandService } from '../../../../../../platform/commands/common/commands.js';
import { IClipboardService } from '../../../../../../platform/clipboard/common/clipboardService.js';
import { ILogService } from '../../../../../../platform/log/common/log.js';
import { INotificationService } from '../../../../../../platform/notification/common/notification.js';
import { Link } from '../../../../../../platform/opener/browser/link.js';
import { defaultButtonStyles } from '../../../../../../platform/theme/browser/defaultStyles.js';
import { IConnectionDiagnosticsService } from './connectionDiagnostics.js';
import { IEditorService } from '../../../../../services/editor/common/editorService.js';
import { ICustomizationRemote, IRemotesModel } from './remotesModel.js';
import { getConnectionIcon, getConnectionLabel, getRemoteMetadataLabel, getRemoteTypeLabel, remoteAgentRunBehaviorDescription, remoteConnectionMethodLabel } from './remotesTable.js';

export type RemoteEnvironmentDetailsMode = 'runBehavior' | 'troubleshoot';

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
	private readonly controls = this._register(new DisposableStore());
	private readonly scrollable: DomScrollableElement;
	private readonly hoverDelegate = this._register(createInstantHoverDelegate());
	private readonly buttons: Button[] = [];
	private busy = false;
	private radio: Radio | undefined;
	private selectedPreference: RemoteAgentHostLocationPreference | undefined;
	private readonly currentChoices: { value: RemoteAgentHostLocationPreference; element: HTMLElement; label: string; detail: string; option: HTMLElement }[] = [];
	private saveButton: Button | undefined;
	private recoveryButton: Button | undefined;
	private disconnectButton: Button | undefined;
	private reportLink: Link | undefined;
	private reportLinkElement: HTMLAnchorElement | undefined;
	private readonly reportFeedback = dom.$('p.remotes-details-feedback.remotes-report-feedback', { id: generateUuid(), role: 'status', 'aria-atomic': 'true' });
	private copyReport: Button | undefined;
	private taskError: string | undefined;
	private readonly token = cancelOnDispose(this._store);
	private remote: ICustomizationRemote;

	constructor(
		remote: ICustomizationRemote,
		readonly mode: RemoteEnvironmentDetailsMode,
		private readonly model: IRemotesModel,
		private readonly close: () => void,
		private readonly onDidChangeBusy: (busy: boolean) => void,
		private readonly newSession: () => Promise<void>,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IConnectionDiagnosticsService private readonly diagnosticsService: IConnectionDiagnosticsService,
		@ICommandService private readonly commandService: ICommandService,
		@IEditorService private readonly editorService: IEditorService,
		@IClipboardService private readonly clipboardService: IClipboardService,
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
		this.updateIdentity();
		this.domNode.setAttribute('role', 'region');
		this.domNode.setAttribute('aria-labelledby', `${this.title.id} ${this.owner.id}`);
		this.body = dom.$('.remotes-details-body');
		this.scrollable = this._register(new DomScrollableElement(this.body, { horizontal: ScrollbarVisibility.Hidden, vertical: ScrollbarVisibility.Auto }));
		dom.append(this.domNode, this.scrollable.getDomNode());
		this.feedback = dom.$('p.remotes-details-feedback', { id: generateUuid(), role: 'status', 'aria-atomic': 'true' });
		this.footer = dom.$('.remotes-details-actions.remotes-details-footer');
		if (mode === 'runBehavior') {
			this.renderRunBehavior();
		} else {
			this.renderTroubleshooting();
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
		this.close();
	}

	private button(container: HTMLElement, label: string, run: () => void, secondary = true): Button {
		const button = this.controls.add(new Button(container, { ...defaultButtonStyles, secondary, hoverDelegate: this.hoverDelegate }));
		button.label = label;
		this.controls.add(button.onDidClick(run));
		this.buttons.push(button);
		return button;
	}

	private renderRunBehavior(): void {
		const description = dom.append(this.body, dom.$('p.remotes-task-description.remotes-run-description', { id: generateUuid() }, remoteAgentRunBehaviorDescription));
		this.body.appendChild(this.identityDetail);
		const field = dom.append(this.body, dom.$('section.remotes-run-field'));
		const fieldTitle = dom.append(field, dom.$('h3.remotes-run-question', { id: generateUuid() },
			localize('remotes.runPreference', "Preferred run behavior")));
		const choices = orderRemoteAgentHostLocationOptions('VS Code', undefined).map(choice => ({ value: choice.preference, label: choice.label, detail: choice.detail }));
		let selected = this.selectedPreference = this.model.getPreferredAgentLocation(this.remote.id);
		const radio = this.radio = this.controls.add(new Radio({
			items: choices.map(choice => ({
				text: choice.label, ariaLabel: localize('remotes.runChoiceLabel', "{0}. {1}", choice.label, choice.detail), isActive: choice.value === selected,
			})), allowNoSelection: selected === undefined, hoverDelegate: this.hoverDelegate,
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
		this.button(actions, localize('remotes.cancelDetails', "Cancel"), this.close);
		const save = this.saveButton = this.button(actions, localize('remotes.saveRunBehaviorOnly', "Save"), () => {
			if (selected && !this.busy) {
				const preference = selected;
				void this.run(async () => {
					const result = await this.model.changePreferredAgentLocation(this.remote.id, preference);
					this.feedback.textContent = result === 'saved'
						? localize('remotes.runSaved', "Saved. Your choice applies the next time you connect.")
						: localize('remotes.runReconnected', "Saved and reconnected.");
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
		indicator.classList.toggle('connected', RemoteAgentHostConnectionStatus.isConnected(this.remote.connectionStatus));
		dom.append(indicator, renderIcon(getConnectionIcon(this.remote)));
		dom.append(connection, dom.$('span', undefined, getConnectionLabel(this.remote)));
		field(remoteConnectionMethodLabel, getRemoteTypeLabel(this.remote.kind));
		const system = getRemoteMetadataLabel(this.remote, 'system');
		if (system) {
			field(localize('remotes.operatingSystem', "Operating system"), system);
		}
		if (this.remote.detail && this.remote.kind === 'ssh') {
			field(localize('remotes.hostAddress', "Host address"), this.remote.detail);
		} else if (this.remote.detail && this.remote.kind === 'wsl') {
			field(localize('remotes.distribution', "Distribution"), this.remote.detail);
		}
		if (this.mode === 'troubleshoot') {
			const metadata = this.remote.metadata;
			if (metadata?.lastOnlineAt !== undefined) {
				field(localize('remotes.lastOnline', "Last seen online"), new Date(metadata.lastOnlineAt).toLocaleString());
			}
			if (metadata?.lastConnectedAt !== undefined) {
				field(localize('remotes.lastConnectedFromDevice', "Last connected from this computer"), new Date(metadata.lastConnectedAt).toLocaleString());
			}
		}
	}

	update(remote: ICustomizationRemote): void {
		const previous = this.remote;
		this.remote = remote;
		if (RemoteAgentHostConnectionStatus.isConnected(remote.connectionStatus) && !RemoteAgentHostConnectionStatus.isConnected(previous.connectionStatus)) {
			this.taskError = undefined;
			if (this.mode === 'troubleshoot') {
				this.feedback.textContent = '';
			}
		}
		this.updateIdentity();
		this.updateCurrentChoice();
		this.updateSaveButton();
		if (this.mode === 'troubleshoot' && (remote.connectionStatus.kind !== previous.connectionStatus.kind
			|| remote.lastConnectionError !== previous.lastConnectionError || remote.unavailableReason !== previous.unavailableReason
			|| remote.availability !== previous.availability && (remote.availability === 'offline' || previous.availability === 'offline')
			|| RemoteAgentHostConnectionStatus.isIncompatible(remote.connectionStatus) && RemoteAgentHostConnectionStatus.isIncompatible(previous.connectionStatus)
			&& remote.connectionStatus.vscodeUpgradeMethod !== previous.connectionStatus.vscodeUpgradeMethod)) {
			if (!this.busy) {
				this.feedback.textContent = '';
				this.renderTroubleshooting();
			}
		}
		this.scrollable.scanDomNode();
	}

	private updateCurrentChoice(): void {
		const current = this.model.getPreferredAgentLocation(this.remote.id);
		for (const choice of this.currentChoices) {
			choice.element.textContent = choice.value === current ? localize('remotes.currentChoice', "Saved preference") : '';
			choice.element.hidden = choice.value !== current;
			choice.option.setAttribute('aria-label', localize('remotes.choiceState', "{0}. {1} {2}", choice.label, choice.detail, choice.element.textContent).trim());
		}
	}

	private renderTroubleshooting(): void {
		this.controls.clear();
		this.buttons.length = 0;
		this.recoveryButton = undefined;
		this.disconnectButton = undefined;
		dom.clearNode(this.body);
		dom.clearNode(this.footer);
		const remote = this.remote;
		const incompatible = RemoteAgentHostConnectionStatus.isIncompatible(remote.connectionStatus);
		const offline = remote.availability === 'offline' && !remote.startsOnConnect;
		const connected = RemoteAgentHostConnectionStatus.isConnected(remote.connectionStatus);
		const pending = RemoteAgentHostConnectionStatus.isConnecting(remote.connectionStatus) || RemoteAgentHostConnectionStatus.isReconnecting(remote.connectionStatus);
		const failed = !!(remote.lastConnectionError || this.taskError);
		this.updateIdentity();
		this.body.appendChild(this.identityDetail);
		const guidance = !connected && !pending && !incompatible && remote.unavailableReason !== getConnectionLabel(remote)
			? remote.unavailableReason : undefined;
		if (guidance) {
			dom.append(this.body, dom.$('p.remotes-recovery-guidance', undefined, guidance));
		}
		const recovery = dom.append(this.body, dom.$('section.remotes-recovery-next'));
		if (!connected && !pending) {
			const steps = incompatible
				? [remote.connectionStatus.vscodeUpgradeMethod
					? localize('remotes.recoveryUpdateServer', "Update the remote server to a compatible version, then reconnect.")
					: localize('remotes.recoveryUpdateDevices', "Use compatible versions of VS Code and the remote server, then reconnect.")]
				: remote.kind === 'ssh' ? [
					localize('remotes.recoverySSHOnline', "Keep the remote computer awake and connected to the network."),
					localize('remotes.recoverySSHSignIn', "Check that you can sign in to this address using SSH."),
				] : remote.kind === 'wsl' ? [remote.startsOnConnect
					? localize('remotes.recoveryWSLConnect', "Select Connect to start this distribution and connect to it.")
					: offline ? localize('remotes.recoveryWSLInstalled', "Check that this distribution is installed by running wsl --list --verbose in a terminal.")
						: localize('remotes.recoveryWSLStart', "Start this distribution in WSL.")]
					: [
						localize('remotes.recoverySharing', "On the remote computer, check that sharing is running through {0}.", getRemoteTypeLabel(remote.kind)),
						localize('remotes.recoveryAccount', "Sign in with the same account on both computers."),
						localize('remotes.recoveryAwake', "Keep the remote computer awake and connected to the network."),
					];
			dom.append(recovery, dom.$('h3.remotes-recovery-heading', undefined, localize('remotes.recoveryNext', "Try these steps")));
			const list = dom.append(recovery, dom.$('ol.remotes-recovery-steps'));
			for (const step of steps) {
				dom.append(list, dom.$('li', undefined, step));
			}
		}
		const actions = this.footer;
		if (connected) {
			this.recoveryButton = this.button(actions, localize('remotes.newSession', "New Session"), () => void this.newSession(), false);
			this.disconnectButton = this.button(actions, localize('remotes.disconnectAction', "Disconnect"), () => void this.run(async () => {
				await this.model.setConnected(remote.id, false);
			}, 'disconnect'));
			this.disconnectButton.setTitle(localize('remotes.disconnectDetail', "Disconnect from {0}. Its agent tasks keep running.", remote.name));
			this.disconnectButton.element.setAttribute('aria-describedby', this.feedback.id);
		} else if (incompatible && remote.connectionStatus.vscodeUpgradeMethod) {
			this.recoveryButton = this.button(actions, localize('remotes.updateRemote', "Update Server"), () => void this.run(async () => {
				await this.model.updateServer(remote.id);
				this.taskError = undefined;
			}, 'update'), false);
		} else if (offline) {
			this.recoveryButton = this.button(actions, localize('remotes.checkAvailability', "Refresh"), () => void this.run(async () => {
				const failedKinds = await this.model.refresh(this.token);
				this.feedback.textContent = failedKinds.includes(remote.kind)
					? localize('remotes.refreshFailed', "Couldn't refresh this environment. Check your network and try again.")
					: this.remote.availability === 'offline' ? localize('remotes.stillOffline', "This environment is still offline. Follow the steps above, then refresh.")
						: localize('remotes.refreshComplete', "Environment list refreshed.");
			}, 'refresh'), false);
		} else if (!connected && !pending && !incompatible) {
			this.recoveryButton = this.button(actions, failed ? localize('remotes.retryConnection', "Retry Connection") : localize('remotes.connect', "Connect"), () => void this.run(async () => {
				await this.model.setConnected(remote.id, true);
				this.taskError = undefined;
			}, 'connect'), false);
		}
		if (!connected) {
			this.recoveryButton?.element.setAttribute('aria-describedby', this.feedback.id);
		}
		recovery.append(this.footer, this.feedback);
		if (!connected && !pending) {
			const documentation = dom.append(recovery, dom.$('p.remotes-recovery-links'));
			this.controls.add(this.instantiationService.createInstance(Link, documentation, {
				label: localize('remotes.connectionHelp', "Remote connection setup guide"), href: 'https://code.visualstudio.com/docs/agents/run/remote-agent-sessions',
			}, { hoverDelegate: this.hoverDelegate }));
		}
		const supportTitleId = generateUuid();
		const support = dom.append(this.body, dom.$('section.remotes-recovery-support', { 'aria-labelledby': supportTitleId }));
		dom.append(support, dom.$('h3.remotes-recovery-heading', { id: supportTitleId }, localize('remotes.collectDiagnostics', "Collect diagnostics")));
		const report = dom.append(support, dom.$('div.remotes-recovery-report'));
		dom.append(report, dom.$('p', undefined, connected
			? localize('remotes.reportPurposeConnected', "Collect a diagnostic report to investigate session problems. It may include names, addresses, and local logs for all environments. Review and remove sensitive details before sharing.")
			: localize('remotes.reportPurpose', "Collect a diagnostic report to troubleshoot the connection. It may include names, addresses, and local logs for all environments. Review and remove sensitive details before sharing.")));
		const reportActions = dom.append(report, dom.$('.remotes-details-actions'));
		this.copyReport = this.button(reportActions, localize('remotes.copyReport', "Copy Report"), () => void this.run(async () => {
			const contents = await this.getDiagnosticContents();
			if (contents !== undefined) {
				await this.clipboardService.writeText(contents);
				this.reportFeedback.textContent = localize('remotes.reportCopied', "Report copied.");
			}
		}, 'diagnostics'));
		this.copyReport.element.classList.add('remotes-copy-report');
		this.copyReport.element.setAttribute('aria-describedby', this.reportFeedback.id);
		report.appendChild(this.reportFeedback);
		const reportLink = dom.append(report, dom.$('p.remotes-recovery-links'));
		this.reportLink = this.controls.add(this.instantiationService.createInstance(Link, reportLink, {
			label: localize('remotes.openReport', "Open Diagnostic Report"), href: '#',
			title: localize('remotes.openReportTooltip', "Open diagnostic report in the editor"),
		}, { opener: () => void this.run(() => this.exportDiagnostics(), 'diagnostics'), hoverDelegate: this.hoverDelegate }));
		this.reportLinkElement = reportLink.firstElementChild as HTMLAnchorElement;
		this.reportLinkElement.setAttribute('aria-describedby', this.reportFeedback.id);
		this.scrollable.scanDomNode();
	}

	private async getDiagnosticContents(): Promise<string | undefined> {
		const snapshot = await this.diagnosticsService.getSnapshot();
		if (this._store.isDisposed) {
			return;
		}
		const error = this.taskError ?? this.remote.lastConnectionError;
		return error
			? localize('remotes.reportWithError', "{0}\n\nLatest error for {1}:\n{2}", snapshot.text, sanitizeConnectionDiagnosticText(this.remote.name), sanitizeConnectionDiagnosticText(error))
			: snapshot.text;
	}

	private async exportDiagnostics(): Promise<void> {
		const contents = await this.getDiagnosticContents();
		if (contents === undefined) {
			return;
		}
		await this.commandService.executeCommand('workbench.action.closeModalEditor');
		await this.editorService.openEditor({ contents, languageId: 'plaintext', options: { pinned: true } });
	}

	private async run(task: () => Promise<void>, operation?: 'connect' | 'disconnect' | 'update' | 'refresh' | 'diagnostics'): Promise<void> {
		if (this.busy) {
			return;
		}
		this.busy = true;
		const diagnostics = operation === 'diagnostics';
		const feedback = diagnostics ? this.reportFeedback : this.feedback;
		const focusCopy = diagnostics && dom.getActiveElement() === this.copyReport?.element;
		const focusReport = diagnostics && dom.getActiveElement() === this.reportLinkElement;
		const focusDisconnect = dom.getActiveElement() === this.disconnectButton?.element;
		this.domNode.setAttribute('aria-busy', 'true');
		this.radio?.setEnabled(false);
		this.backAction.enabled = false;
		const enabled = new Map(this.buttons.map(button => [button, button.enabled]));
		this.buttons.forEach(button => button.enabled = false);
		if (this.reportLink) {
			this.reportLink.enabled = false;
		}
		const working = operation === 'connect' ? localize('remotes.detailsConnecting', "Connecting...")
			: operation === 'disconnect' ? localize('remotes.detailsDisconnecting', "Disconnecting...")
				: operation === 'update' ? localize('remotes.detailsUpdating', "Updating server...")
					: operation === 'refresh' ? localize('remotes.detailsRefreshing', "Refreshing environments...")
						: diagnostics ? localize('remotes.detailsCollecting', "Collecting diagnostic report...")
							: localize('remotes.detailsWorking', "Working...");
		feedback.textContent = working;
		this.onDidChangeBusy(true);
		try {
			await task();
			if (!this._store.isDisposed && feedback.textContent === working) {
				feedback.textContent = '';
			}
		} catch (error) {
			if (this._store.isDisposed && !isCancellationError(error)) {
				this.notificationService.error(error);
			}
			if (!this._store.isDisposed) {
				if (!isCancellationError(error)) {
					if (!diagnostics) {
						this.taskError = toErrorMessage(error);
					}
					this.logService.error('[Remote Environments]', error);
				}
				if (isCancellationError(error)) {
					feedback.textContent = localize('remotes.detailsCancelled', "Cancelled.");
				} else if (diagnostics) {
					feedback.textContent = localize('remotes.reportFailed', "Couldn't open or copy the diagnostic report. Try again.");
				} else if (operation === 'connect') {
					feedback.textContent = localize('remotes.connectFailed', "Couldn't connect. Try the steps above, then retry. Open the diagnostic report for details.");
				} else if (operation === 'disconnect') {
					feedback.textContent = localize('remotes.disconnectFailed', "Couldn't disconnect. Try again, or open the diagnostic report for details.");
				} else if (operation === 'update') {
					feedback.textContent = localize('remotes.updateFailed', "Couldn't update the server. Try again, or open the diagnostic report for details.");
				} else if (operation === 'refresh') {
					feedback.textContent = localize('remotes.refreshFailed', "Couldn't refresh this environment. Check your network and try again.");
				} else if (this.mode === 'runBehavior' && this.selectedPreference !== undefined && this.model.getPreferredAgentLocation(this.remote.id) === this.selectedPreference) {
					feedback.textContent = localize('remotes.runBehaviorFailed', "Your choice was saved, but reconnection failed. Go back and select Troubleshoot Connection.");
				} else {
					feedback.textContent = localize('remotes.runBehaviorSaveFailed', "Couldn't save your choice. Try again.");
				}
			}
		} finally {
			this.busy = false;
			this.onDidChangeBusy(false);
			if (!this._store.isDisposed) {
				this.backAction.enabled = true;
				this.domNode.setAttribute('aria-busy', 'false');
				this.radio?.setEnabled(true);
				this.buttons.forEach(button => button.enabled = enabled.get(button) ?? true);
				if (this.mode === 'runBehavior') {
					this.updateCurrentChoice();
					this.updateSaveButton();
				} else {
					this.renderTroubleshooting();
					if (focusCopy) {
						this.copyReport?.focus();
					} else if (focusReport) {
						this.reportLinkElement?.focus();
					} else if (focusDisconnect && this.disconnectButton) {
						this.disconnectButton.focus();
					} else if (!diagnostics && this.recoveryButton) {
						this.recoveryButton.focus();
					} else {
						this.backToolbar.focus();
					}
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
		const content = this.domNode.textContent ?? '';
		if (this.mode !== 'runBehavior') {
			return content;
		}
		const current = this.model.getPreferredAgentLocation(this.remote.id);
		const noChoice = localize('remotes.noRunChoice', "None");
		return [
			content,
			localize('remotes.savedRunChoice', "Saved choice: {0}", this.currentChoices.find(choice => choice.value === current)?.label ?? noChoice),
			localize('remotes.selectedRunChoice', "Selected choice: {0}", this.currentChoices.find(choice => choice.value === this.selectedPreference)?.label ?? noChoice),
		].join('\n');
	}
}
