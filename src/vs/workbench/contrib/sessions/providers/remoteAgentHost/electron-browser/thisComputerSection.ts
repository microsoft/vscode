/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/thisComputerSection.css';
import * as dom from '../../../../../../base/browser/dom.js';
import { StandardKeyboardEvent } from '../../../../../../base/browser/keyboardEvent.js';
import { Button, ButtonWithDropdown } from '../../../../../../base/browser/ui/button/button.js';
import { AnchorAlignment } from '../../../../../../base/browser/ui/contextview/contextview.js';
import { HoverStyle } from '../../../../../../base/browser/ui/hover/hover.js';
import { createInstantHoverDelegate } from '../../../../../../base/browser/ui/hover/hoverDelegateFactory.js';
import { renderIcon } from '../../../../../../base/browser/ui/iconLabel/iconLabels.js';
import { InputBox, MessageType } from '../../../../../../base/browser/ui/inputbox/inputBox.js';
import { IRadioOptionItem, Radio } from '../../../../../../base/browser/ui/radio/radio.js';
import { DomScrollableElement } from '../../../../../../base/browser/ui/scrollbar/scrollableElement.js';
import { Codicon } from '../../../../../../base/common/codicons.js';
import { Action } from '../../../../../../base/common/actions.js';
import { KeyCode } from '../../../../../../base/common/keyCodes.js';
import { Disposable, toDisposable } from '../../../../../../base/common/lifecycle.js';
import { isWindows, OS, OperatingSystem } from '../../../../../../base/common/platform.js';
import { ScrollbarVisibility } from '../../../../../../base/common/scrollable.js';
import { ThemeIcon } from '../../../../../../base/common/themables.js';
import { generateUuid } from '../../../../../../base/common/uuid.js';
import { localize } from '../../../../../../nls.js';
import { WorkbenchToolBar } from '../../../../../../platform/actions/browser/toolbar.js';
import { GitHubEnvironmentsEnabledSettingId } from '../../../../../../platform/agentHost/common/missionControlEnvironment.js';
import { ICommandService } from '../../../../../../platform/commands/common/commands.js';
import { IContextMenuService, IContextViewService } from '../../../../../../platform/contextview/browser/contextView.js';
import { IHoverService } from '../../../../../../platform/hover/browser/hover.js';
import { IInstantiationService } from '../../../../../../platform/instantiation/common/instantiation.js';
import { Link } from '../../../../../../platform/opener/browser/link.js';
import { showWindowLogActionId } from '../../../../../services/log/common/logConstants.js';
import { RemoteTunnelCommandIds } from '../../../../remoteTunnel/electron-browser/remoteTunnel.contribution.js';
import { defaultButtonStyles, defaultInputBoxStyles } from '../../../../../../platform/theme/browser/defaultStyles.js';
import { devTunnelSharingClients, getOffDetail, gitHubEnvironmentSharingClients, gitHubEnvironmentSharingDiscovery, GitHubEnvironmentsAvailability, RemoteConnectionsMethod, RemoteConnectionsSharing, RemoteConnectionsState, validateSharingName } from '../../../../chat/electron-browser/remoteConnectionsSharing.js';
import { IPreferencesService } from '../../../../../services/preferences/common/preferences.js';
import { TOGGLE_REMOTE_CONNECTIONS_COMMAND_ID } from '../../../common/sessionCommands.js';

type SharingMethod = Exclude<RemoteConnectionsMethod, 'off'>;

const sharingChoices: Record<SharingMethod, { label: string; points: readonly string[]; detail?: string }> = {
	githubEnvironment: {
		label: localize('thisComputer.githubEnvironment', "GitHub Environment"),
		points: [
			gitHubEnvironmentSharingClients,
			gitHubEnvironmentSharingDiscovery,
		],
		detail: localize('thisComputer.githubHistory', "GitHub stores session actions for history. Conversation content isn't end-to-end encrypted."),
	},
	devTunnel: {
		label: localize('thisComputer.devTunnel', "Dev Tunnel"),
		points: [
			devTunnelSharingClients,
			localize('thisComputer.tunnelAccount', "Connect with the GitHub account used to share this computer"),
		],
	},
};

/** The local-computer summary and its sharing settings page. */
export class ThisComputerSection extends Disposable {
	readonly domNode: HTMLElement;
	private readonly details: HTMLElement;
	private readonly scrollable: DomScrollableElement;
	private readonly sharing: RemoteConnectionsSharing;
	private readonly name: HTMLElement;
	private readonly rename: Action;
	private readonly renameToolbar: WorkbenchToolBar;
	private readonly renameContainer: HTMLElement;
	private readonly shareButton: Button;
	private readonly stopButton: ButtonWithDropdown;
	private readonly optionsButton: Button;
	private readonly statusIcon: HTMLElement;
	private readonly radio: Radio;
	private readonly status: HTMLElement;
	private readonly preview: HTMLElement;
	private readonly pageDescription: HTMLElement;
	private readonly policy: HTMLElement;
	private readonly feedback: HTMLElement;
	private readonly feedbackContainer: HTMLElement;
	private readonly feedbackLog: HTMLElement;
	private readonly applyButton: Button;
	private readonly cancelButton: Button;
	private readonly backAction: Action;
	private readonly backToolbar: WorkbenchToolBar;
	private readonly navigation: HTMLElement;
	private readonly nameInput: InputBox;
	private readonly nameHint: HTMLElement;
	private nameDrafts: Partial<Record<SharingMethod, string>> = {};
	private initialNameDraft: string | undefined;
	private readonly policyText = localize('thisComputer.policyDisabled', "Sharing through GitHub Environments is disabled by your organization. Contact your administrator.");
	private methods: readonly SharingMethod[] = [];
	private itemsKey = '';
	private selectedMethod: SharingMethod | undefined;
	private applying = false;
	private changeFailed = false;
	private failedMethod: SharingMethod = 'devTunnel';
	private renaming = false;
	private showingOptions = false;

	get isExpanded(): boolean {
		return this.showingOptions;
	}

	get isBusy(): boolean {
		return this.applying || this.renaming || this.sharing.pendingMethod !== undefined;
	}

	constructor(
		container: HTMLElement,
		private readonly onDidChangeExpansion: (expanded: boolean) => void,
		@IInstantiationService instantiationService: IInstantiationService,
		@ICommandService commandService: ICommandService,
		@IHoverService hoverService: IHoverService,
		@IPreferencesService preferencesService: IPreferencesService,
		@IContextMenuService contextMenuService: IContextMenuService,
		@IContextViewService contextViewService: IContextViewService,
	) {
		super();
		const state = this._register(instantiationService.createInstance(RemoteConnectionsState));
		this.sharing = this._register(instantiationService.createInstance(RemoteConnectionsSharing, state, () => commandService.executeCommand(TOGGLE_REMOTE_CONNECTIONS_COMMAND_ID), 'remotesEditor'));

		const titleId = generateUuid();
		this.domNode = dom.append(container, dom.$('section.remotes-this-computer', { 'aria-labelledby': titleId }));
		this._register(toDisposable(() => this.domNode.remove()));
		this.navigation = dom.append(this.domNode, dom.$('.remotes-task-navigation'));
		const hoverDelegate = this._register(createInstantHoverDelegate());
		this.backAction = this._register(new Action('remotes.back', localize('thisComputer.back', "Back to Remote Environments"),
			ThemeIcon.asClassName(Codicon.arrowLeft), true, () => this.close()));
		this.backToolbar = this._register(instantiationService.createInstance(WorkbenchToolBar, dom.append(this.navigation, dom.$('.remotes-task-back')), {
			ariaLabel: localize('thisComputer.navigation', "Page navigation"), hoverDelegate,
		}));
		this.backToolbar.setActions([this.backAction]);
		const heading = dom.append(this.navigation, dom.$('.remotes-task-heading'));
		const taskTitleId = generateUuid();
		dom.append(heading, dom.$('h2.remotes-task-title', { id: taskTitleId }, localize('thisComputer.sharingTitle', "Share this computer")));
		const system = OS === OperatingSystem.Windows ? localize('thisComputer.windows', "Windows")
			: OS === OperatingSystem.Macintosh ? localize('thisComputer.mac', "macOS") : localize('thisComputer.linux', "Linux");
		const sectionHeading = dom.append(this.domNode, dom.$('.remotes-this-computer-heading'));
		dom.append(sectionHeading, renderIcon(Codicon.deviceDesktop)).setAttribute('aria-hidden', 'true');
		dom.append(sectionHeading, dom.$('h2.remotes-this-computer-title', { id: titleId }, localize('thisComputer.title', "This computer")));
		const header = dom.append(this.domNode, dom.$('.remotes-this-computer-header'));
		const summary = dom.append(header, dom.$('.remotes-this-computer-summary'));
		const nameRow = dom.append(summary, dom.$('.remotes-this-computer-name-row'));
		this.name = dom.append(nameRow, dom.$('.remotes-this-computer-name'));
		const hoverLifecycleOptions = { groupId: generateUuid() };
		this._register(hoverService.setupDelayedHover(this.name, () => ({ content: this.sharing.name ?? '', style: HoverStyle.Pointer }), hoverLifecycleOptions));
		this.renameContainer = dom.append(nameRow, dom.$('.remotes-this-computer-rename'));
		this.rename = this._register(new Action('remotes.renameThisComputer', localize('thisComputer.rename', "Change Sharing Name"), ThemeIcon.asClassName(Codicon.edit), true, () => this.renameComputer()));
		this.renameToolbar = this._register(instantiationService.createInstance(WorkbenchToolBar, this.renameContainer, {
			ariaLabel: localize('thisComputer.nameActions', "Sharing name actions"),
			hoverDelegate,
		}));
		this.renameToolbar.setActions([this.rename]);
		const statusContainer = dom.append(summary, dom.$('.remotes-this-computer-status'));
		dom.append(statusContainer, dom.$('span.remotes-this-computer-system', undefined, system));
		this.statusIcon = dom.append(statusContainer, dom.$('span.remotes-sharing-status-icon', { 'aria-hidden': 'true' }));
		this.status = dom.append(statusContainer, dom.$('span', { role: 'status' }));
		this.preview = dom.append(statusContainer, dom.$('span.remotes-sharing-preview', undefined, localize('thisComputer.preview', "Preview")));
		this._register(hoverService.setupDelayedHover(this.status, () => ({
			content: this.sharing.activeMethod === 'off'
				? localize('thisComputer.notSharedDetail', "Sharing is off. Agent sessions continue running on this computer.")
				: this.sharing.getState().isConnecting
					? localize('thisComputer.startingDetail', "Setting up sharing so your other devices can connect")
					: localize('thisComputer.sharedDetail', "Other devices can access this computer's agent sessions, tools, and files. Keep VS Code running and this computer awake and online."),
			style: HoverStyle.Pointer,
		}), hoverLifecycleOptions));
		this._register(hoverService.setupDelayedHover(this.preview, {
			content: localize('thisComputer.previewDetail', "GitHub Environments is in preview, so features and availability may change"),
			style: HoverStyle.Pointer,
		}, hoverLifecycleOptions));
		const controls = dom.append(nameRow, dom.$('.remotes-this-computer-share'));
		this.shareButton = this._register(new Button(controls, { ...defaultButtonStyles, secondary: true, hoverDelegate }));
		this.shareButton.label = localize('thisComputer.share', "Share This Computer");
		this.shareButton.setTitle(localize('thisComputer.shareDetail', "Choose how other devices access this computer's agent sessions, tools, and files"));
		const switchActions = (['githubEnvironment', 'devTunnel'] as const).map(method => this._register(new Action(
			`remotes.share.${method}`, method === 'githubEnvironment'
			? localize('thisComputer.shareViaGitHub', "Share via GitHub Environment (Preview)")
			: localize('thisComputer.shareViaTunnel', "Share via Dev Tunnel"),
			undefined, true, async () => {
				if (!this.isBusy && !this.sharing.getState().isConnecting && this.sharing.activeMethod !== 'off' && this.sharing.activeMethod !== method
					&& (method !== 'githubEnvironment' || this.sharing.gitHubEnvironmentsAvailability === 'enabled')) {
					await this.apply(method);
				}
			},
		)));
		this.stopButton = this._register(new ButtonWithDropdown(controls, {
			...defaultButtonStyles, secondary: true, hoverDelegate,
			actions: {
				getActions: () => switchActions.filter((action, index) => {
					const method = index === 0 ? 'githubEnvironment' : 'devTunnel';
					action.enabled = !this.isBusy && !this.sharing.getState().isConnecting
						&& (method !== 'githubEnvironment' || this.sharing.gitHubEnvironmentsAvailability === 'enabled');
					return method !== this.sharing.activeMethod
						&& (method !== 'githubEnvironment' || this.sharing.gitHubEnvironmentsAvailability !== 'unavailable');
				})
			},
			addPrimaryActionToDropdown: false,
			contextMenuProvider: {
				showContextMenu: delegate => contextMenuService.showContextMenu({
					...delegate,
					getAnchor: () => this.stopButton.element,
					anchorAlignment: AnchorAlignment.RIGHT,
				}),
			},
		}));
		this.stopButton.label = localize('thisComputer.stop', "Stop Sharing");
		this.stopButton.setTitle(getOffDetail());
		this.optionsButton = this.stopButton.dropdownButton;
		this.optionsButton.setTitle(localize('thisComputer.optionsDetail', "Stop sharing, then choose another connection method"));
		this.optionsButton.setAriaLabel(localize('thisComputer.options', "Change Connection Method"));
		this.details = dom.append(this.domNode, dom.$('section.remotes-sharing-details', { id: generateUuid() }));
		this.details.setAttribute('aria-labelledby', taskTitleId);
		this.details.hidden = true;
		this.shareButton.element.setAttribute('aria-controls', this.details.id);
		this._register(this.shareButton.onDidClick(() => this.toggleOptions()));
		this._register(this.stopButton.onDidClick(() => {
			if (this.sharing.activeMethod !== 'off' && !this.isBusy) {
				void this.apply('off');
			}
		}));
		const body = dom.$('.remotes-sharing-body');
		this.pageDescription = dom.append(body, dom.$('p.remotes-this-computer-description', { id: generateUuid() },
			localize('thisComputer.shareOverview', "Let your other devices use this computer's agent sessions, tools, and files. Work runs here, so keep VS Code running and this computer awake and online.")));
		this.scrollable = this._register(new DomScrollableElement(body, { horizontal: ScrollbarVisibility.Hidden, vertical: ScrollbarVisibility.Auto }));
		dom.append(this.details, this.scrollable.getDomNode()).classList.add('remotes-sharing-scroll');
		const typeField = dom.append(body, dom.$('.remotes-sharing-type-field'));
		const methodTitleId = generateUuid();
		dom.append(typeField, dom.$('h3.remotes-sharing-question', { id: methodTitleId },
			localize('thisComputer.sharingQuestion', "Choose a connection method to start sharing")));
		this.radio = this._register(new Radio({ items: [], allowNoSelection: true, hoverDelegate }));
		this.radio.domNode.classList.add('remotes-sharing-choices', 'remotes-method-choices');
		this.radio.domNode.setAttribute('aria-labelledby', methodTitleId);
		typeField.appendChild(this.radio.domNode);
		this._register(this.radio.onDidSelect(index => {
			if (!this.applying) {
				this.selectedMethod = this.methods[index];
				if (this.selectedMethod && this.initialNameDraft !== undefined) {
					this.nameDrafts[this.selectedMethod] = this.initialNameDraft;
					this.initialNameDraft = undefined;
				}
				this.changeFailed = false;
				this.feedback.textContent = '';
				this.update();
			}
		}));
		this.policy = dom.append(typeField, dom.$('p.remotes-sharing-policy', { id: generateUuid() }));
		dom.append(this.policy, renderIcon(Codicon.briefcase)).setAttribute('aria-hidden', 'true');
		dom.append(this.policy, dom.$('span', undefined, `${this.policyText} `));
		this._register(instantiationService.createInstance(Link, this.policy, {
			label: localize('thisComputer.viewSetting', "View Setting"), href: '#',
		}, { opener: () => { void preferencesService.openSettings({ query: `@id:${GitHubEnvironmentsEnabledSettingId}` }); } }));
		const nameField = dom.append(body, dom.$('.remotes-sharing-name-field'));
		const nameLabel = dom.append(nameField, dom.$('label.remotes-sharing-question', undefined,
			localize('thisComputer.nameLabel', "Sharing name")));
		this.nameInput = this._register(new InputBox(nameField, contextViewService, {
			inputBoxStyles: defaultInputBoxStyles,
			ariaLabel: localize('thisComputer.nameLabel', "Sharing name"),
			placeholder: localize('thisComputer.namePlaceholder', "Sharing name"),
			validationOptions: {
				validation: value => {
					const content = this.selectedMethod && this.sharing.namesLoaded ? validateSharingName(this.selectedMethod, value) : undefined;
					return content ? { content, type: MessageType.ERROR } : null;
				},
			},
		}));
		this.nameHint = dom.append(nameField, dom.$('p.remotes-sharing-name-hint', { id: generateUuid() }));
		this.nameInput.inputElement.id = generateUuid();
		nameLabel.setAttribute('for', this.nameInput.inputElement.id);
		this._register(dom.addDisposableListener(this.nameInput.inputElement, dom.EventType.INPUT, () => {
			if (!this.isBusy) {
				if (this.selectedMethod) {
					this.nameDrafts[this.selectedMethod] = this.nameInput.value;
				} else {
					this.initialNameDraft = this.nameInput.value;
				}
				this.updateNameValidation();
			}
		}));
		this.feedbackContainer = dom.append(body, dom.$('.remotes-sharing-feedback-container'));
		this.feedback = dom.append(this.feedbackContainer, dom.$('p.remotes-sharing-feedback', { id: generateUuid(), role: 'status', 'aria-atomic': 'true' }));
		this.feedbackLog = dom.append(this.feedbackContainer, dom.$('span'));
		this._register(instantiationService.createInstance(Link, this.feedbackLog, {
			label: localize('thisComputer.openSharingLog', "Open Sharing Log"), href: '#',
		}, {
			opener: async () => {
				await commandService.executeCommand('workbench.action.closeModalEditor');
				await commandService.executeCommand(this.failedMethod === 'devTunnel' ? RemoteTunnelCommandIds.showLog : showWindowLogActionId);
			}
		}));
		const footer = dom.append(body, dom.$('.remotes-sharing-footer'));
		this.cancelButton = this._register(new Button(footer, { ...defaultButtonStyles, secondary: true, hoverDelegate }));
		this.cancelButton.label = localize('thisComputer.cancel', "Cancel");
		this._register(this.cancelButton.onDidClick(() => this.close()));
		this.applyButton = this._register(new Button(footer, { ...defaultButtonStyles, hoverDelegate }));
		this.applyButton.label = localize('thisComputer.start', "Start Sharing");
		this.applyButton.element.setAttribute('aria-describedby', `${this.pageDescription.id} ${this.feedback.id}`);
		this.stopButton.element.setAttribute('aria-describedby', this.feedback.id);
		this._register(this.applyButton.onDidClick(() => {
			if (this.applyButton.enabled && this.selectedMethod) {
				void this.apply(this.selectedMethod);
			}
		}));
		if (isWindows) {
			footer.prepend(this.applyButton.element);
		}
		body.appendChild(this.feedbackContainer);
		const help = dom.append(body, dom.$('p.remotes-sharing-help'));
		this._register(instantiationService.createInstance(Link, help, {
			label: localize('thisComputer.sharingGuide', "Choose how to connect"),
			href: 'https://code.visualstudio.com/docs/agents/run/remote-agent-sessions#_choose-how-to-connect',
		}, { hoverDelegate }));
		this._register(dom.addDisposableListener(this.domNode, dom.EventType.KEY_DOWN, event => {
			const keyboardEvent = new StandardKeyboardEvent(event);
			if (this.showingOptions && keyboardEvent.keyCode === KeyCode.Escape && !keyboardEvent.altKey && !keyboardEvent.ctrlKey && !keyboardEvent.metaKey && !keyboardEvent.shiftKey) {
				keyboardEvent.preventDefault();
				keyboardEvent.stopPropagation();
				this.close();
			}
		}, true));
		this._register(this.sharing.onDidChange(() => this.update()));
		this.update();
	}

	private toggleOptions(): void {
		if (this.isBusy) {
			return;
		}
		if (this.showingOptions) {
			this.close();
			return;
		}
		const active = this.sharing.activeMethod;
		this.selectedMethod = active === 'off' ? undefined : active;
		this.nameDrafts = {};
		this.initialNameDraft = undefined;
		this.itemsKey = '';
		this.showingOptions = true;
		this.changeFailed = false;
		this.feedback.textContent = '';
		this.update();
		this.onDidChangeExpansion(true);
		this.layout();
		this.scrollable.setScrollPosition({ scrollTop: 0 });
		this.backToolbar.focus();
	}

	close(): void {
		if (this.isBusy) {
			return;
		}
		this.showingOptions = false;
		this.update();
		this.onDidChangeExpansion(false);
		(this.sharing.activeMethod === 'off' ? this.shareButton : this.optionsButton).focus();
	}

	private async renameComputer(): Promise<void> {
		if (this.isBusy || !this.rename.enabled) {
			return;
		}
		this.renaming = true;
		this.update();
		try {
			await this.sharing.rename();
		} finally {
			this.renaming = false;
			if (!this._store.isDisposed) {
				this.update();
				if (this.showingOptions) {
					(this.renameContainer.hidden ? this.backToolbar : this.renameToolbar).focus();
				} else {
					this.focus();
				}
			}
		}
	}

	private async apply(method: RemoteConnectionsMethod): Promise<void> {
		if (this.isBusy) {
			return;
		}
		this.applying = true;
		this.changeFailed = false;
		this.failedMethod = method === 'off' ? this.sharing.usesGitHubEnvironment ? 'githubEnvironment' : 'devTunnel' : method;
		this.feedback.textContent = method === 'off'
			? localize('thisComputer.stopping', "Stopping sharing...")
			: localize('thisComputer.starting', "Starting sharing via {0}...", sharingChoices[method].label);
		this.update();
		let error: string | undefined;
		try {
			error = await this.sharing.selectMethod(method, method !== 'off' && this.showingOptions ? this.nameInput.value : undefined);
		} finally {
			this.applying = false;
			if (!this._store.isDisposed) {
				this.update();
				if (!error && this.sharing.activeMethod === method) {
					this.feedback.textContent = '';
					this.close();
				} else {
					this.changeFailed = true;
					this.feedback.textContent = method === 'off'
						? localize('thisComputer.stopFailed', "Sharing didn't stop. Open the sharing log for details, then try again.")
						: localize('thisComputer.startFailed', "Sharing via {0} didn't start. Open the sharing log for details, then try again.", sharingChoices[method].label);
					if (error) {
						this.feedback.textContent = localize('thisComputer.sharingFailureDetail', "{0} {1}", this.feedback.textContent, error);
					}
					this.update();
					this.layout();
				}
			}
		}
	}

	private update(): void {
		const state = this.sharing.getState();
		const active = this.sharing.activeMethod;
		const pending = this.sharing.pendingMethod;
		const availability = this.sharing.gitHubEnvironmentsAvailability;
		const methods: SharingMethod[] = [];
		if (availability !== 'unavailable' || active === 'githubEnvironment' || this.selectedMethod === 'githubEnvironment') {
			methods.push('githubEnvironment');
		}
		methods.push('devTunnel');
		if (this.selectedMethod && !methods.includes(this.selectedMethod)) {
			this.selectedMethod = undefined;
		}
		const itemsKey = `${methods.join(',')}:${availability}:${this.isBusy}:${active}`;
		if (itemsKey !== this.itemsKey) {
			const hadFocus = this.radio.optionElements.some(element => dom.isActiveElement(element));
			this.itemsKey = itemsKey;
			this.methods = methods;
			this.radio.setItems(methods.map(method => this.getItem(method, availability)));
			for (const [index, element] of this.radio.optionElements.entries()) {
				const choice = sharingChoices[methods[index]];
				element.dataset.sharingMethod = methods[index];
				if (methods[index] === 'githubEnvironment') {
					dom.append(element, dom.$('span.remotes-sharing-preview', undefined, localize('thisComputer.preview', "Preview")));
				}
				const points = dom.append(element, dom.$('ul.remotes-sharing-choice-description'));
				for (const point of choice.points) {
					dom.append(points, dom.$('li', undefined, point));
				}
				if (choice.detail) {
					dom.append(element, dom.$('p.remotes-sharing-choice-detail', undefined, choice.detail));
				}
			}
			if (hadFocus && !this.isBusy) {
				this.cancelButton.focus();
			}
		}
		if (this.selectedMethod) {
			this.radio.setActiveItem(methods.indexOf(this.selectedMethod));
		}
		this.policy.hidden = availability !== 'policyDisabled';
		if (this.policy.hidden) {
			this.radio.domNode.removeAttribute('aria-describedby');
		} else {
			this.radio.domNode.setAttribute('aria-describedby', this.policy.id);
		}
		const name = this.sharing.name;
		this.name.textContent = name ?? '';
		this.name.hidden = !name;
		this.renameContainer.hidden = this.showingOptions || active === 'off' || !name;
		this.rename.enabled = !!name && active !== 'off' && !state.isConnecting && !this.isBusy;
		this.details.hidden = !this.showingOptions;
		this.navigation.hidden = !this.showingOptions;
		this.domNode.classList.toggle('sharing-expanded', this.showingOptions);
		this.domNode.classList.toggle('sharing-active', active !== 'off');
		this.preview.hidden = active !== 'githubEnvironment';
		this.stopButton.element.hidden = this.showingOptions || active === 'off';
		this.shareButton.element.hidden = this.showingOptions || active !== 'off';
		this.shareButton.enabled = !this.isBusy;
		this.stopButton.enabled = !this.isBusy;
		this.shareButton.element.setAttribute('aria-expanded', String(this.showingOptions));
		dom.clearNode(this.statusIcon);
		dom.append(this.statusIcon, renderIcon(pending !== undefined ? ThemeIcon.modify(Codicon.loadingCompact, 'spin') : active === 'off' ? Codicon.circleSlashCompact
			: state.isConnecting ? ThemeIcon.modify(Codicon.loadingCompact, 'spin') : Codicon.radioTower));
		this.status.textContent = pending !== undefined ? pending === 'off' ? localize('thisComputer.stopping', "Stopping sharing...")
			: localize('thisComputer.starting', "Starting sharing via {0}...", sharingChoices[pending].label)
			: active === 'off' ? localize('thisComputer.notShared', "Not shared")
				: state.isConnecting ? localize('thisComputer.starting', "Starting sharing via {0}...", sharingChoices[active].label)
					: localize('thisComputer.sharedVia', "Sharing via {0}", sharingChoices[active].label);
		const feedbackParent = this.showingOptions ? this.pageDescription.parentElement! : this.domNode;
		if (this.feedbackContainer.parentElement !== feedbackParent) {
			if (this.showingOptions) {
				this.cancelButton.element.parentElement!.after(this.feedbackContainer);
			} else {
				feedbackParent.appendChild(this.feedbackContainer);
			}
		}
		this.feedbackContainer.hidden = !this.changeFailed && !this.applying;
		this.feedbackContainer.classList.toggle('sharing-failed', this.changeFailed);
		this.feedbackLog.hidden = !this.changeFailed;
		this.applyButton.label = active === 'off' ? localize('thisComputer.start', "Start Sharing") : localize('thisComputer.switch', "Switch Method");
		this.applyButton.setTitle(active === 'off'
			? localize('thisComputer.startDetail', "Share this computer using the selected connection method and sharing name")
			: localize('thisComputer.switchDetail', "Stop sharing with the current method and start with the selected method"));
		this.nameInput.setEnabled(!this.isBusy && this.sharing.namesLoaded);
		this.nameInput.value = this.selectedMethod ? this.nameDrafts[this.selectedMethod] ?? this.sharing.getNameForMethod(this.selectedMethod) ?? '' : this.initialNameDraft ?? name ?? '';
		this.updateNameValidation();
		this.cancelButton.enabled = !this.isBusy;
		this.backAction.enabled = !this.isBusy;
		this.details.setAttribute('aria-busy', String(this.isBusy));
		this.layout();
	}

	private updateNameValidation(): void {
		const method = this.selectedMethod;
		const error = this.nameInput.validate();
		const showHint = !this.sharing.namesLoaded || method === 'devTunnel';
		this.nameHint.textContent = !this.sharing.namesLoaded ? localize('thisComputer.loadingName', "Loading sharing names...")
			: localize('thisComputer.tunnelNameHint', "Use up to 20 letters, numbers, underscores, or dashes.");
		this.nameHint.classList.toggle('not-applicable', !showHint);
		if (showHint) {
			this.nameInput.inputElement.setAttribute('aria-describedby', this.nameHint.id);
		} else {
			this.nameInput.inputElement.removeAttribute('aria-describedby');
		}
		this.applyButton.enabled = !this.isBusy && !this.sharing.getState().isConnecting && !!method
			&& this.sharing.namesLoaded && !error && method !== this.sharing.activeMethod
			&& (method !== 'githubEnvironment' || this.sharing.gitHubEnvironmentsAvailability === 'enabled');
	}

	private getItem(method: SharingMethod, availability: GitHubEnvironmentsAvailability): IRadioOptionItem {
		const choice = sharingChoices[method];
		return {
			text: choice.label,
			ariaLabel: localize('thisComputer.methodLabel', "{0}. {1}", method === 'githubEnvironment'
				? localize('thisComputer.previewMethod', "{0}, Preview", choice.label) : choice.label,
				[...choice.points, ...(choice.detail ? [choice.detail] : [])].join('. ')),
			isActive: method === this.selectedMethod,
			disabled: this.isBusy || method === 'githubEnvironment' && availability !== 'enabled',
		};
	}

	focus(): void {
		if (this.showingOptions) {
			this.radio.focusActiveItem();
		} else {
			(this.sharing.activeMethod === 'off' ? this.shareButton : this.stopButton).focus();
		}
	}

	layout(): void {
		this.scrollable.scanDomNode();
	}

	getAccessibilityContent(): string {
		const summary = [this.showingOptions ? localize('thisComputer.sharingTitle', "Share this computer") : localize('thisComputer.title', "This computer"),
		...(this.showingOptions ? [] : [this.sharing.name ?? '']), this.status.textContent ?? '',
		...(this.preview.hidden ? [] : [this.preview.textContent ?? '']),
		...(this.feedbackContainer.hidden ? [] : [this.feedback.textContent ?? ''])];
		return [...summary, ...(this.showingOptions ? [
			this.pageDescription.textContent ?? '',
			localize('thisComputer.sharingQuestion', "Choose a connection method to start sharing"),
			...this.methods.map(method => {
				const choice = sharingChoices[method];
				return localize('thisComputer.accessibleChoice', "{0}. {1}. {2}", choice.label,
					[...choice.points, ...(choice.detail ? [choice.detail] : [])].join('. '),
					method === this.selectedMethod ? localize('thisComputer.selected', "Selected") : '');
			}),
			...(this.policy.hidden ? [] : [this.policyText]),
			localize('thisComputer.accessibleName', "Sharing name: {0}", this.nameInput.value),
			!this.sharing.namesLoaded || this.selectedMethod === 'devTunnel' ? this.nameHint.textContent ?? '' : '',
		] : [])].join('\n');
	}
}
