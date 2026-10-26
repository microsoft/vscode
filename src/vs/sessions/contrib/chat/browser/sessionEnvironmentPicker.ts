/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../base/browser/dom.js';
import { renderIcon } from '../../../../base/browser/ui/iconLabel/iconLabels.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { Disposable, DisposableStore, IDisposable } from '../../../../base/common/lifecycle.js';
import { autorun, IObservable, observableValue } from '../../../../base/common/observable.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { localize } from '../../../../nls.js';
import { ActionListItemKind, IActionListItem } from '../../../../platform/actionWidget/browser/actionList.js';
import { IActionWidgetService } from '../../../../platform/actionWidget/browser/actionWidget.js';
import { IMenuService, MenuItemAction } from '../../../../platform/actions/common/actions.js';
import { cloudSandboxAddress } from '../../../../platform/agentHost/common/cloudSandboxAgentHost.js';
import { IMissionControlEnvironmentService } from '../../../../platform/agentHost/common/missionControlEnvironment.js';
import { getEntryAddress, IRemoteAgentHostService, RemoteAgentHostEntryType, RemoteAgentHostsEnabledSettingId } from '../../../../platform/agentHost/common/remoteAgentHostService.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { ContextKeyExpression, IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IContextMenuService } from '../../../../platform/contextview/browser/contextView.js';
import { IHoverService } from '../../../../platform/hover/browser/hover.js';
import { IHoverDelegate } from '../../../../base/browser/ui/hover/hoverDelegate.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { logSettingExperimentTrigger } from '../../../../platform/telemetry/common/experimentTrigger.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { Menus } from '../../../browser/menus.js';
import { getAgentHostConnectionStatusLabel, isAgentHostEnvironmentAvailable, isAgentHostProvider, isRemoteSessionCreationEnvironment } from '../../../common/agentHostSessionsProvider.js';
import { SessionWorkspacePickerGroupContext } from '../../../common/contextkeys.js';
import { ISessionWorkspace, SESSION_WORKSPACE_GROUP_REMOTE } from '../../../services/sessions/common/session.js';
import { ISessionsProvider } from '../../../services/sessions/common/sessionsProvider.js';
import { ISessionsProvidersService } from '../../../services/sessions/browser/sessionsProvidersService.js';
import { URI } from '../../../../base/common/uri.js';
import { IAction } from '../../../../base/common/actions.js';
import { OPEN_REMOTES_EDITOR_COMMAND_ID } from '../../../common/sessionCommands.js';
import { registerPickerKeybindingPresentation } from './newChatPickerKeybinding.js';
import { createSessionPickerToolbar } from './sessionPickerToolbar.js';
import { Schemas } from '../../../../base/common/network.js';
import { isWindows } from '../../../../base/common/platform.js';
import { ENVIRONMENT_PICKER_MANAGE_REMOTES_SETTING, ENVIRONMENT_PICKER_SETTING } from '../common/constants.js';

export interface ISessionCreationEnvironment {
	readonly id: string;
	readonly kind: 'local' | 'cloud' | 'remote' | 'container';
	readonly label: string;
	readonly icon: ThemeIcon;
	readonly providerIds: readonly string[];
	readonly description?: string;
}

export function getSessionCreationEnvironments(providers: readonly ISessionsProvider[]): ISessionCreationEnvironment[] {
	const visible = providers.filter(provider => provider.supportsWorkspaceSelection !== false
		&& (!isAgentHostProvider(provider) || provider.isVisibleInEnvironmentPicker?.get() !== false));
	const local = visible.filter(provider => provider.environment.id === 'local');
	const cloud = visible.filter(provider => provider.environment.id === 'cloud' && !isAgentHostProvider(provider));
	const environments: ISessionCreationEnvironment[] = [];
	if (local.length) {
		environments.push({ id: 'local', kind: 'local', label: localize('environmentPicker.local', "This Computer"), icon: Codicon.deviceDesktop, providerIds: local.map(provider => provider.id) });
	}
	if (cloud.length) {
		environments.push({ id: 'cloud', kind: 'cloud', label: localize('environmentPicker.cloud', "Cloud"), icon: Codicon.cloud, providerIds: cloud.map(provider => provider.id) });
	}
	for (const provider of visible) {
		const environment = getRemoteSessionCreationEnvironment(provider);
		if (environment) {
			environments.push(environment);
		}
	}
	return environments;
}

/** Describes a remote independently of picker visibility so an existing draft can retain its destination. */
export function getRemoteSessionCreationEnvironment(provider: ISessionsProvider, containerRequested = false): ISessionCreationEnvironment | undefined {
	if (!isRemoteSessionCreationEnvironment(provider)) {
		return undefined;
	}
	return {
		id: containerRequested ? `container:${provider.id}` : provider.id,
		kind: containerRequested ? 'container' : 'remote',
		label: containerRequested ? localize('environmentPicker.container', "Dev Container") : provider.label,
		icon: containerRequested ? Codicon.remote : provider.icon, providerIds: [provider.id],
		description: getAgentHostConnectionStatusLabel(provider.connectionStatus.get()),
	};
}

export function getEnvironmentWorkspaceProvider(environment: ISessionCreationEnvironment, providers: readonly ISessionsProvider[], folderUri: URI): ISessionsProvider | undefined {
	return resolveEnvironmentWorkspace(environment, providers, folderUri)?.provider;
}

export function resolveEnvironmentWorkspace(environment: ISessionCreationEnvironment, providers: readonly ISessionsProvider[], folderUri: URI): { readonly provider: ISessionsProvider; readonly workspace: ISessionWorkspace } | undefined {
	for (const provider of providers) {
		if (!environment.providerIds.includes(provider.id)
			|| provider.supportsWorkspaceSelection === false
			|| isAgentHostProvider(provider) && !isAgentHostEnvironmentAvailable(provider)) {
			continue;
		}
		const workspace = provider.resolveWorkspace(folderUri);
		if (workspace && (environment.kind !== 'cloud' || provider.getSessionTypes(folderUri).length > 0)) {
			return { provider, workspace };
		}
	}
	return undefined;
}

export function getDefaultSessionCreationEnvironment(environments: readonly ISessionCreationEnvironment[], folderUri: URI | undefined, providerId: string | undefined, containerRequested = false, selectedProvider?: ISessionsProvider): ISessionCreationEnvironment | undefined {
	const local = environments.find(environment => environment.kind === 'local');
	if (folderUri?.scheme === Schemas.file && !containerRequested && local) {
		return local;
	}
	return environments.find(environment => (environment.kind === 'container') === containerRequested && environment.providerIds.includes(providerId ?? ''))
		?? (selectedProvider && selectedProvider.id === providerId ? getRemoteSessionCreationEnvironment(selectedProvider, containerRequested) : undefined)
		?? local;
}

interface IEnvironmentPickerItem {
	readonly run: () => Promise<void>;
	readonly checked?: boolean;
}

export interface IEnvironmentPickerRenderOptions {
	readonly focusCommand?: { readonly id: string; readonly when: ContextKeyExpression; readonly enabled: IObservable<boolean> };
	readonly hoverDelegate?: IHoverDelegate;
}

export class SessionEnvironmentPicker extends Disposable {
	private readonly _isVisible = observableValue(this, false);
	readonly isVisible: IObservable<boolean> = this._isVisible;
	private _trigger: HTMLElement | undefined;

	constructor(
		private readonly environments: IObservable<readonly ISessionCreationEnvironment[]>,
		private readonly selected: IObservable<ISessionCreationEnvironment | undefined>,
		private readonly select: (environment: ISessionCreationEnvironment) => Promise<void>,
		private readonly getActions: (environment: ISessionCreationEnvironment) => IAction[] = () => [],
		@IActionWidgetService private readonly actionWidgetService: IActionWidgetService,
		@IMenuService private readonly menuService: IMenuService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
		@IHoverService _hoverService: IHoverService,
		@ICommandService private readonly commandService: ICommandService,
		@IContextMenuService private readonly contextMenuService: IContextMenuService,
		@IKeybindingService private readonly keybindingService: IKeybindingService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@ITelemetryService private readonly telemetryService: ITelemetryService,
		@ISessionsProvidersService private readonly sessionsProvidersService: ISessionsProvidersService,
		@IRemoteAgentHostService private readonly remoteAgentHostService: IRemoteAgentHostService,
		@IMissionControlEnvironmentService private readonly environmentService: IMissionControlEnvironmentService,
	) {
		super();
	}

	render(container: HTMLElement, options?: IEnvironmentPickerRenderOptions): IDisposable & { readonly element: HTMLElement } {
		const store = new DisposableStore();
		this._isVisible.set(true, undefined);
		store.add({
			dispose: () => {
				this._isVisible.set(false, undefined);
			}
		});
		const slot = dom.append(container, dom.$('.sessions-chat-picker-slot.sessions-workspace-category-picker-slot'));
		container.prepend(slot);
		const { trigger, action } = createSessionPickerToolbar(store, slot, this.instantiationService,
			options?.focusCommand?.id ?? 'sessions.environmentPicker', localize('environmentPicker.chooseEnvironment', "Choose Environment"),
			() => this.showPicker(), options?.hoverDelegate);
		this._trigger = trigger;
		trigger.role = 'button';
		trigger.tabIndex = 0;
		trigger.setAttribute('aria-haspopup', 'listbox');
		trigger.setAttribute('aria-expanded', 'false');
		store.add({
			dispose: () => {
				if (trigger.getAttribute('aria-expanded') === 'true') {
					this.actionWidgetService.hide();
				}
				slot.remove();
				if (this._trigger === trigger) {
					this._trigger = undefined;
				}
			}
		});
		store.add(autorun(reader => {
			const environment = this.selected.read(reader);
			dom.clearNode(trigger);
			dom.append(trigger, renderIcon(environment?.icon ?? Codicon.deviceDesktop));
			const label = dom.append(trigger, dom.$('span.sessions-chat-dropdown-label'));
			label.textContent = environment?.label ?? localize('environmentPicker.choose', "Environment");
			const accessibleLabel = localize('environmentPicker.trigger', "Choose Environment, {0}", label.textContent);
			trigger.setAttribute('aria-label', accessibleLabel);
			if (options?.focusCommand) {
				registerPickerKeybindingPresentation(
					reader.store,
					trigger,
					accessibleLabel,
					options.focusCommand.id,
					options.focusCommand.when,
					options.focusCommand.enabled,
					this.commandService,
					this.contextMenuService,
					action,
					this.keybindingService,
				);
			} else {
				action.tooltip = accessibleLabel;
			}
		}));
		store.add(dom.addDisposableListener(trigger, dom.EventType.KEY_DOWN, event => {
			if (event.key === 'Enter' || event.key === ' ' || event.key === 'ArrowDown') {
				dom.EventHelper.stop(event, true);
				this.showPicker();
			}
		}));
		return { element: slot, dispose: () => store.dispose() };
	}

	showPicker(): void {
		const trigger = this._trigger;
		if (!trigger || this.actionWidgetService.isVisible) {
			return;
		}
		const remotesEnabled = this.configurationService.getValue<boolean>(RemoteAgentHostsEnabledSettingId);
		const environmentPickerEnabled = this.configurationService.getValue<boolean>(ENVIRONMENT_PICKER_SETTING);
		const showManage = remotesEnabled && environmentPickerEnabled && this.configurationService.getValue<boolean>(ENVIRONMENT_PICKER_MANAGE_REMOTES_SETTING);
		const items: IActionListItem<IEnvironmentPickerItem>[] = this.environments.get().map(environment => ({
			kind: ActionListItemKind.Action,
			label: environment.label,
			description: environment.description,
			submenuActions: showManage && this.isManagedInRemotes(environment) ? undefined : this.getActions(environment),
			group: { title: '', icon: environment.icon },
			item: { run: () => this.select(environment), checked: environment.id === this.selected.get()?.id },
		}));
		const context = this.contextKeyService.createOverlay([[SessionWorkspacePickerGroupContext.key, SESSION_WORKSPACE_GROUP_REMOTE]]);
		const actions = this.menuService.getMenuActions(Menus.SessionWorkspaceManage, context, { renderShortTitle: true }).flatMap(([, actions]) => actions);
		if (actions.length) {
			items.push({ kind: ActionListItemKind.Separator, label: '' });
			for (const action of actions) {
				if (action instanceof MenuItemAction) {
					items.push({
						kind: ActionListItemKind.Action,
						label: action.label,
						disabled: !action.enabled,
						group: { title: '', icon: ThemeIcon.isThemeIcon(action.item.icon) ? action.item.icon : undefined },
						item: { run: async () => { await action.run(); } },
					});
				}
			}
		}
		if (remotesEnabled && environmentPickerEnabled) {
			logSettingExperimentTrigger(this.telemetryService, ENVIRONMENT_PICKER_MANAGE_REMOTES_SETTING);
			if (showManage) {
				items.push(
					{ kind: ActionListItemKind.Separator, label: '' },
					{
						kind: ActionListItemKind.Action,
						label: localize('environmentPicker.manage', "Manage..."),
						group: { title: '', icon: Codicon.settingsGear },
						item: { run: async () => { await this.commandService.executeCommand(OPEN_REMOTES_EDITOR_COMMAND_ID); } },
					},
				);
			}
		}
		trigger.setAttribute('aria-expanded', 'true');
		this.actionWidgetService.show('sessionEnvironmentPicker', false, items, {
			onSelect: async item => {
				this.actionWidgetService.hide();
				await item.run();
			},
			onHide: () => {
				trigger.setAttribute('aria-expanded', 'false');
				if (trigger.isConnected) {
					trigger.focus();
				}
			},
		}, trigger, undefined, [], {
			getAriaLabel: item => typeof item.description === 'string' && item.description
				? localize('environmentPicker.item', "{0}, {1}", item.label ?? '', item.description) : item.label ?? '',
			getWidgetAriaLabel: () => localize('environmentPicker.title', "Environment"),
		}, { className: 'sessions-new-chat-picker-list', minWidth: 240, hideDefaultKeybindingTooltip: true });
	}

	private isManagedInRemotes(environment: ISessionCreationEnvironment): boolean {
		const provider = environment.kind === 'remote' && this.sessionsProvidersService.getProvider(environment.providerIds[0]);
		if (!provider || !isAgentHostProvider(provider) || !provider.remoteAddress) {
			return false;
		}
		if (this.environmentService.enabled && this.environmentService.accountKey
			&& this.environmentService.hosts.get().some(host => host.kind === 'user-local' && cloudSandboxAddress(host.id) === provider.remoteAddress)) {
			return true;
		}
		const connection = this.remoteAgentHostService.configuredEntries.find(entry => getEntryAddress(entry) === provider.remoteAddress)?.connection;
		switch (connection?.type) {
			case RemoteAgentHostEntryType.SSH:
			case RemoteAgentHostEntryType.Tunnel:
				return true;
			case RemoteAgentHostEntryType.WSL:
				return isWindows;
			default:
				return false;
		}
	}
}
