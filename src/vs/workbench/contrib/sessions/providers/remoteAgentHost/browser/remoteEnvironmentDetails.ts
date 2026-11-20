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
import { IInstantiationService } from '../../../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../../../platform/log/common/log.js';
import { INotificationService } from '../../../../../../platform/notification/common/notification.js';
import { defaultButtonStyles } from '../../../../../../platform/theme/browser/defaultStyles.js';
import { ICustomizationRemote, IRemotesModel } from './remotesModel.js';
import { getConnectionLabel, getRemoteMetadataLabel, getRemoteTypeLabel, remoteAgentRunBehaviorDescription, renderConnectionStatus } from './remotesTable.js';

/** A focused page in Remote Environments for choosing how agents run on an environment. */
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
	private taskError: string | undefined;
	private remote: ICustomizationRemote;

	constructor(
		remote: ICustomizationRemote,
		private readonly model: IRemotesModel,
		private readonly close: () => void,
		private readonly onDidChangeBusy: (busy: boolean) => void,
		@IInstantiationService instantiationService: IInstantiationService,
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
			localize('remotes.runBehavior', "Agent run behavior")));
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
		this.renderRunBehavior();
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
		const options = { ...defaultButtonStyles, secondary, hoverDelegate: this.hoverDelegate };
		const button = this.controls.add(new Button(container, options));
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
		this.button(actions, localize('remotes.cancelDetails', "Cancel"), this.close);
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
		renderConnectionStatus(indicator, remote);
		dom.append(connection, dom.$('span', undefined, getConnectionLabel(remote)));
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
	}

	update(remote: ICustomizationRemote): void {
		const previous = this.remote;
		this.remote = remote;
		if (RemoteAgentHostConnectionStatus.isConnected(remote.connectionStatus) && !RemoteAgentHostConnectionStatus.isConnected(previous.connectionStatus)) {
			this.taskError = undefined;
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
		status(localize('remotes.detailsWorking', "Working..."));
		this.onDidChangeBusy(true);
		try {
			await task();
			if (!this._store.isDisposed) {
				this.feedback.textContent = '';
			}
		} catch (error) {
			if (this._store.isDisposed && !isCancellationError(error)) {
				this.notificationService.error(error);
			}
			if (!this._store.isDisposed) {
				if (isCancellationError(error)) {
					status(localize('remotes.detailsCancelled', "Cancelled."));
				} else {
					this.taskError = toErrorMessage(error);
					this.logService.error('[Remote Environments]', error);
					this.feedback.textContent = this.selectedPreference !== undefined && this.model.getPreferredAgentLocation(this.remote.id) === this.selectedPreference
						? localize('remotes.runBehaviorReconnectFailed', "Your choice was saved, but reconnection failed: {0}", sanitizeConnectionDiagnosticText(this.taskError))
						: localize('remotes.runBehaviorSaveFailed', "Couldn't save your choice. Try again.");
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
				this.updateIdentity();
				this.updateCurrentChoice();
				this.updateSaveButton();
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
		const current = this.model.getPreferredAgentLocation(this.remote.id);
		const noChoice = localize('remotes.noRunChoice', "None");
		return [
			this.domNode.innerText,
			localize('remotes.savedRunChoice', "Saved choice: {0}", this.currentChoices.find(choice => choice.value === current)?.label ?? noChoice),
			localize('remotes.selectedRunChoice', "Selected choice: {0}", this.currentChoices.find(choice => choice.value === this.selectedPreference)?.label ?? noChoice),
		].join('\n');
	}
}
