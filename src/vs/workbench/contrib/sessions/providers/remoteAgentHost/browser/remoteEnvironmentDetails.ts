/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../../base/browser/dom.js';
import { Button } from '../../../../../../base/browser/ui/button/button.js';
import { createInstantHoverDelegate } from '../../../../../../base/browser/ui/hover/hoverDelegateFactory.js';
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
import { RemoteAgentHostConnectionStatus } from '../../../../../../platform/agentHost/common/remoteAgentHostService.js';
import { IInstantiationService } from '../../../../../../platform/instantiation/common/instantiation.js';
import { ICommandService } from '../../../../../../platform/commands/common/commands.js';
import { ILogService } from '../../../../../../platform/log/common/log.js';
import { INotificationService } from '../../../../../../platform/notification/common/notification.js';
import { Link } from '../../../../../../platform/opener/browser/link.js';
import { defaultButtonStyles } from '../../../../../../platform/theme/browser/defaultStyles.js';
import { IConnectionDiagnosticsService } from './connectionDiagnostics.js';
import { IEditorService } from '../../../../../services/editor/common/editorService.js';
import { ICustomizationRemote, IRemotesModel } from './remotesModel.js';
import { getRemoteMetadataLabel, getRemoteTypeLabel } from './remotesTable.js';

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
	private reportLink: Link | undefined;
	private taskError: string | undefined;
	private readonly token = cancelOnDispose(this._store);
	private remote: ICustomizationRemote;

	constructor(
		remote: ICustomizationRemote,
		readonly mode: RemoteEnvironmentDetailsMode,
		private readonly model: IRemotesModel,
		private readonly close: () => void,
		private readonly onDidChangeBusy: (busy: boolean) => void,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IConnectionDiagnosticsService private readonly diagnosticsService: IConnectionDiagnosticsService,
		@ICommandService private readonly commandService: ICommandService,
		@IEditorService private readonly editorService: IEditorService,
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
			ariaLabel: localize('remotes.navigation', "Page Navigation"), hoverDelegate: this.hoverDelegate,
		}));
		this.backToolbar.setActions([this.backAction]);
		const heading = dom.append(navigation, dom.$('.remotes-task-heading'));
		this.title = dom.append(heading, dom.$('h2.remotes-task-title', { id: generateUuid() },
			mode === 'runBehavior' ? localize('remotes.runBehavior', "Agent run behavior") : localize('remotes.troubleshoot', "Troubleshoot connection")));
		this.owner = dom.append(heading, dom.$('p.remotes-details-owner', { id: generateUuid() }, remote.name));
		this.identityDetail = dom.append(heading, dom.$('dl.remotes-task-identity-detail'));
		this.updateIdentity();
		this.domNode.setAttribute('role', 'region');
		this.domNode.setAttribute('aria-labelledby', `${this.title.id} ${this.owner.id}`);
		this.body = dom.$('.remotes-details-body');
		this.scrollable = this._register(new DomScrollableElement(this.body, { horizontal: ScrollbarVisibility.Hidden, vertical: ScrollbarVisibility.Auto }));
		dom.append(this.domNode, this.scrollable.getDomNode());
		this.feedback = dom.$('p.remotes-details-feedback', { role: 'status' });
		this.footer = dom.$('.remotes-details-actions.remotes-details-footer');
		if (mode === 'runBehavior') {
			this.renderRunBehavior();
		} else {
			this.renderTroubleshooting();
		}
		if (mode === 'runBehavior') {
			this.body.append(this.feedback, this.footer);
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
		dom.append(this.body, dom.$('p.remotes-task-description', undefined, localize('remotes.runBehaviorDescription', "Choose whether agents remain available after the remote VS Code window closes.")));
		const choices: readonly { value: RemoteAgentHostLocationPreference; label: string; detail: string }[] = [
			{ value: 'dedicated', label: localize('remotes.independentAgents', "Keep working after VS Code closes"), detail: localize('remotes.independentAgentsDetail', "Run agents separately from the remote editor. Keep the computer awake and online while they work.") },
			{ value: 'editor', label: localize('remotes.editorAgents', "Use the remote VS Code window"), detail: localize('remotes.editorAgentsDetail', "Use agents in an open VS Code window on the remote computer. They aren't available after that window closes.") },
		];
		let selected = this.selectedPreference = this.model.getPreferredAgentLocation(this.remote.id);
		const radio = this.radio = this.controls.add(new Radio({
			items: choices.map(choice => ({
				text: choice.label, ariaLabel: localize('remotes.runChoiceLabel', "{0}. {1}", choice.label, choice.detail), isActive: choice.value === selected,
			})), allowNoSelection: selected === undefined
		}));
		radio.domNode.classList.add('remotes-run-choices', 'remotes-method-choices');
		radio.domNode.setAttribute('aria-labelledby', this.title.id);
		this.body.appendChild(radio.domNode);
		for (const [index, element] of radio.optionElements.entries()) {
			const current = dom.append(element, dom.$('span.remotes-choice-current'));
			dom.append(element, dom.$('span.remotes-choice-description', undefined, choices[index].detail));
			this.currentChoices.push({ value: choices[index].value, element: current, label: choices[index].label, detail: choices[index].detail, option: element });
		}
		this.updateCurrentChoice();
		const actions = this.footer;
		this.button(actions, localize('remotes.cancelDetails', "Cancel"), this.close);
		const save = this.saveButton = this.button(actions, localize('remotes.saveRunBehavior', "Save and Reconnect"), () => {
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
		if (isWindows) {
			actions.prepend(save.element);
		}
		save.enabled = false;
		this.controls.add(radio.onDidSelect(index => {
			selected = this.selectedPreference = choices[index].value;
			save.enabled = selected !== this.model.getPreferredAgentLocation(this.remote.id);
		}));
	}

	private updateIdentity(): void {
		this.owner.textContent = localize('remotes.environmentName', "Environment: {0}", this.remote.name);
		dom.clearNode(this.identityDetail);
		const field = (label: string, value: string) => {
			dom.append(this.identityDetail, dom.$('dt', undefined, label));
			dom.append(this.identityDetail, dom.$('dd', undefined, value));
		};
		field(localize('remotes.connectionMethod', "Connection method"), getRemoteTypeLabel(this.remote.kind));
		const system = getRemoteMetadataLabel(this.remote, 'system');
		if (system) {
			field(localize('remotes.operatingSystem', "Operating system"), system);
		}
		if (this.remote.detail && this.remote.kind === 'ssh') {
			field(localize('remotes.hostAddress', "Host address"), this.remote.detail);
		} else if (this.remote.detail && this.remote.kind === 'wsl') {
			field(localize('remotes.distribution', "Distribution"), this.remote.detail);
		}
	}

	update(remote: ICustomizationRemote): void {
		const previous = this.remote;
		this.remote = remote;
		this.updateIdentity();
		this.updateCurrentChoice();
		if (this.mode === 'troubleshoot' && (remote.connectionStatus.kind !== previous.connectionStatus.kind
			|| remote.lastConnectionError !== previous.lastConnectionError || remote.unavailableReason !== previous.unavailableReason)) {
			if (!this.busy) {
				this.renderTroubleshooting();
			}
		}
	}

	private updateCurrentChoice(): void {
		const current = this.model.getPreferredAgentLocation(this.remote.id);
		for (const choice of this.currentChoices) {
			choice.element.textContent = choice.value === current ? localize('remotes.currentChoice', "Current") : '';
			choice.element.hidden = choice.value !== current;
			choice.option.setAttribute('aria-label', localize('remotes.choiceState', "{0}. {1}. {2}", choice.label, choice.detail, choice.element.textContent));
		}
	}

	private renderTroubleshooting(): void {
		this.controls.clear();
		this.buttons.length = 0;
		dom.clearNode(this.body);
		dom.clearNode(this.footer);
		const remote = this.remote;
		const incompatible = RemoteAgentHostConnectionStatus.isIncompatible(remote.connectionStatus);
		const offline = !!remote.unavailableReason;
		const connected = RemoteAgentHostConnectionStatus.isConnected(remote.connectionStatus);
		const pending = RemoteAgentHostConnectionStatus.isConnecting(remote.connectionStatus) || RemoteAgentHostConnectionStatus.isReconnecting(remote.connectionStatus);
		const failed = !!(remote.lastConnectionError || this.taskError);
		dom.append(this.body, dom.$('h3.remotes-recovery-heading', undefined, localize('remotes.connectionStatus', "Connection status")));
		dom.append(this.body, dom.$('p.remotes-recovery-status', undefined, connected
			? localize('remotes.connectionReady', "Connected")
			: pending ? localize('remotes.connectionPending', "Connecting...")
				: incompatible ? localize('remotes.connectionUpdate', "An update is needed")
					: offline ? localize('remotes.connectionOffline', "This environment is offline")
						: failed ? localize('remotes.connectionUnavailable', "Can't connect")
							: localize('remotes.connectionIdle', "Not connected")));
		if (connected || pending) {
			dom.append(this.body, dom.$('p', undefined, connected
				? localize('remotes.recoveryConnected', "The connection is ready. Return to your session to continue.")
				: localize('remotes.recoveryPending', "Waiting for the environment to respond.")));
		} else {
			const steps = incompatible
				? [remote.connectionStatus.vscodeUpgradeMethod
					? localize('remotes.recoveryUpdateServer', "Update the remote server to a compatible version, then reconnect.")
					: localize('remotes.recoveryUpdateDevices', "Update VS Code on both devices, then reconnect.")]
				: remote.kind === 'ssh' ? [
					localize('remotes.recoverySSHOnline', "Keep the remote computer awake and connected to the network."),
					localize('remotes.recoverySSHSignIn', "Check that you can sign in to this address using SSH."),
				] : remote.kind === 'wsl' ? [localize('remotes.recoveryWSLStart', "Start this distribution in WSL.")]
					: [
						localize('remotes.recoverySharing', "On the other computer, turn on sharing."),
						localize('remotes.recoveryAccount', "Sign in with the same account on both devices."),
						localize('remotes.recoveryAwake', "Keep the other computer awake and connected to the network."),
					];
			dom.append(this.body, dom.$('h3.remotes-recovery-heading.remotes-recovery-next', undefined, localize('remotes.recoveryNext', "Try these steps")));
			const list = dom.append(this.body, dom.$('ol.remotes-recovery-steps'));
			for (const step of steps) {
				dom.append(list, dom.$('li', undefined, step));
			}
		}
		const actions = this.footer;
		const done = this.button(actions, localize('remotes.done', "Done"), this.close);
		if (incompatible && remote.connectionStatus.vscodeUpgradeMethod) {
			this.button(actions, localize('remotes.updateRemote', "Update Server"), () => void this.run(async () => {
				await this.model.updateServer(remote.id);
				this.taskError = undefined;
			}), false);
		} else if (offline) {
			this.button(actions, localize('remotes.checkAvailability', "Refresh"), () => void this.run(async () => {
				const failedKinds = await this.model.refresh(this.token);
				this.feedback.textContent = failedKinds.includes(remote.kind)
					? localize('remotes.refreshFailed', "Couldn't refresh this environment. Check your network and try again.")
					: this.remote.unavailableReason ? localize('remotes.stillOffline', "Still offline. Check sharing on the other computer, then refresh again.")
						: localize('remotes.refreshComplete', "List refreshed.");
			}), false);
		} else if (!connected) {
			const retry = this.button(actions, pending ? localize('remotes.connectingAction', "Connecting...")
				: failed ? localize('remotes.retryConnection', "Retry Connection") : localize('remotes.connect', "Connect"), () => void this.run(async () => {
					await this.model.setConnected(remote.id, true);
					this.taskError = undefined;
				}), false);
			retry.enabled = !pending;
		}
		if (isWindows) {
			actions.appendChild(done.element);
		}
		this.body.append(this.feedback, this.footer);
		const supportTitleId = generateUuid();
		const support = dom.append(this.body, dom.$('section.remotes-recovery-support', { 'aria-labelledby': supportTitleId }));
		dom.append(support, dom.$('h3.remotes-recovery-heading', { id: supportTitleId }, localize('remotes.moreHelp', "More help")));
		this.controls.add(this.instantiationService.createInstance(Link, support, {
			label: localize('remotes.connectionHelp', "Remote connection setup guide"), href: 'https://code.visualstudio.com/docs/agents/run/remote-agent-sessions',
		}, {}));
		const report = dom.append(support, dom.$('section.remotes-recovery-report'));
		dom.append(report, dom.$('h3.remotes-recovery-heading', undefined, localize('remotes.diagnosticReport', "Diagnostic report")));
		dom.append(report, dom.$('p', undefined, localize('remotes.reportPurpose', "If these steps don't help, open a report to investigate connection failures or include with a bug report.")));
		dom.append(report, dom.$('p', undefined, localize('remotes.reportPrivacy', "Includes names, addresses, and local logs for all environments, not remote logs. Review before sharing.")));
		this.reportLink = this.controls.add(this.instantiationService.createInstance(Link, report, {
			label: localize('remotes.openReport', "Open Diagnostic Report"), href: '#',
		}, { opener: () => void this.run(() => this.exportDiagnostics()) }));
		this.scrollable.scanDomNode();
	}

	private async exportDiagnostics(): Promise<void> {
		const snapshot = await this.diagnosticsService.getSnapshot();
		if (this._store.isDisposed) {
			return;
		}
		const error = this.taskError ?? this.remote.lastConnectionError;
		const contents = error
			? localize('remotes.reportWithError', "{0}\n\nLatest error for {1}:\n{2}", snapshot.text, sanitizeConnectionDiagnosticText(this.remote.name), sanitizeConnectionDiagnosticText(error))
			: snapshot.text;
		await this.commandService.executeCommand('workbench.action.closeModalEditor');
		await this.editorService.openEditor({ contents, languageId: 'plaintext', options: { pinned: true } });
	}

	private async run(task: () => Promise<void>): Promise<void> {
		if (this.busy) {
			return;
		}
		this.busy = true;
		this.domNode.setAttribute('aria-busy', 'true');
		this.radio?.setEnabled(false);
		this.backAction.enabled = false;
		const enabled = new Map(this.buttons.map(button => [button, button.enabled]));
		this.buttons.forEach(button => button.enabled = false);
		if (this.reportLink) {
			this.reportLink.enabled = false;
		}
		this.feedback.textContent = localize('remotes.detailsWorking', "Working...");
		this.onDidChangeBusy(true);
		try {
			await task();
			if (!this._store.isDisposed && this.feedback.textContent === localize('remotes.detailsWorking', "Working...")) {
				this.feedback.textContent = '';
			}
		} catch (error) {
			if (this._store.isDisposed && !isCancellationError(error)) {
				this.notificationService.error(error);
			}
			if (!this._store.isDisposed) {
				if (!isCancellationError(error)) {
					this.taskError = toErrorMessage(error);
					this.logService.error('[Remote Environments]', error);
				}
				this.feedback.textContent = isCancellationError(error) ? localize('remotes.detailsCancelled', "Cancelled.")
					: this.mode === 'runBehavior' && this.selectedPreference !== undefined && this.model.getPreferredAgentLocation(this.remote.id) === this.selectedPreference
						? localize('remotes.runBehaviorFailed', "Your choice was saved, but reconnection failed. Go back and choose Troubleshoot Connection.")
						: this.mode === 'troubleshoot'
							? localize('remotes.recoveryFailed', "That didn't work. Try again, or open the diagnostic report for details.")
							: localize('remotes.runBehaviorSaveFailed', "Couldn't save your choice. Try again.");
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
					if (this.saveButton) {
						this.saveButton.enabled = this.selectedPreference !== undefined && this.selectedPreference !== this.model.getPreferredAgentLocation(this.remote.id);
					}
				} else {
					this.renderTroubleshooting();
					this.backToolbar.focus();
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
		return this.domNode.textContent ?? '';
	}
}
