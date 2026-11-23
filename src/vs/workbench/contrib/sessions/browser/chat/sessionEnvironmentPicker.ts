/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../base/browser/dom.js';
import { renderIcon } from '../../../../../base/browser/ui/iconLabel/iconLabels.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { escapeMarkdownSyntaxTokens } from '../../../../../base/common/htmlContent.js';
import { Disposable, DisposableStore, IDisposable } from '../../../../../base/common/lifecycle.js';
import { autorun, IObservable, observableValue } from '../../../../../base/common/observable.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { localize } from '../../../../../nls.js';
import { ActionListItemKind, IActionListItem, IActionListOptions } from '../../../../../platform/actionWidget/browser/actionList.js';
import { IActionWidgetService } from '../../../../../platform/actionWidget/browser/actionWidget.js';
import { IMenuService, MenuItemAction } from '../../../../../platform/actions/common/actions.js';
import { cloudSandboxAddress } from '../../../../../platform/agentHost/common/cloudSandboxAgentHost.js';
import { IExtensionRemoteAgentHostsService, toExtensionRemoteAgentHostEntry } from '../../../../../platform/agentHost/common/extensionRemoteAgentHosts.js';
import { IMissionControlEnvironmentService } from '../../../../../platform/agentHost/common/missionControlEnvironment.js';
import { getEntryAddress, IRemoteAgentHostService, RemoteAgentHostEntryType, RemoteAgentHostsEnabledSettingId, type RemoteAgentHostConnection } from '../../../../../platform/agentHost/common/remoteAgentHostService.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { ContextKeyExpression, IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { IContextMenuService } from '../../../../../platform/contextview/browser/contextView.js';
import { IHoverService } from '../../../../../platform/hover/browser/hover.js';
import { IHoverDelegate } from '../../../../../base/browser/ui/hover/hoverDelegate.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { IKeybindingService } from '../../../../../platform/keybinding/common/keybinding.js';
import { logSettingExperimentTrigger } from '../../../../../platform/telemetry/common/experimentTrigger.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import { Menus } from '../menus.js';
import { getAgentHostConnectionStatusLabel, isAgentHostEnvironmentAvailable, isAgentHostProvider, isRemoteSessionCreationEnvironment } from '../../common/agentHostSessionsProvider.js';
import { SessionWorkspacePickerGroupContext } from '../../common/contextkeys.js';
import { ISessionWorkspace, SESSION_WORKSPACE_GROUP_REMOTE } from '../../../../services/sessions/common/session.js';
import { ISessionsProvider } from '../../common/sessionsProvider.js';
import { ISessionsProvidersService } from '../sessionsProvidersService.js';
import { URI } from '../../../../../base/common/uri.js';
import { IAction } from '../../../../../base/common/actions.js';
import { getManageRemoteEnvironmentsDescription, OPEN_REMOTES_EDITOR_COMMAND_ID } from '../../common/sessionCommands.js';
import { registerPickerKeybindingPresentation } from './newChatPickerKeybinding.js';
import { createSessionPickerToolbar } from './sessionPickerToolbar.js';
import { Schemas } from '../../../../../base/common/network.js';
import { isWindows } from '../../../../../base/common/platform.js';
import { ENVIRONMENT_PICKER_MANAGE_REMOTES_SETTING, ENVIRONMENT_PICKER_SETTING } from '../../common/chatConstants.js';
import { LocalDevContainerEnvironmentHost } from '../../common/devContainerAgentHostService.js';

export interface ISessionCreationEnvironment {
	readonly id: string;
	readonly kind: 'local' | 'cloud' | 'remote' | 'container';
	readonly label: string;
	readonly icon: ThemeIcon;
	readonly providerIds: readonly string[];
	readonly description?: string;
}

export function getSessionCreationEnvironments(providers: readonly ISessionsProvider[]): ISessionCreationEnvironment[] {
	// Container-backed providers are offered as the Dev Container option of their source environment, not as separate environments.
	const visible = providers.filter(provider => provider.supportsWorkspaceSelection !== false
		&& (!isAgentHostProvider(provider) || provider.isVisibleInEnvironmentPicker?.get() !== false && !provider.devContainerSourceWorkspace));
	const local = visible.filter(provider => provider.environment.id === 'local');
	const cloud = visible.filter(provider => provider.environment.id === 'cloud' && !isAgentHostProvider(provider) && provider.sessionTypes.length > 0);
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

/** Labels the environment that runs the selected folder in the Dev Container that the folder configures, unlike standalone Dev Containers. */
export function getFolderDevContainerEnvironmentLabel(): string {
	return localize('environmentPicker.container', "Dev Container for Folder");
}

/** Describes a remote independently of picker visibility so an existing draft can retain its destination. */
export function getRemoteSessionCreationEnvironment(provider: ISessionsProvider, containerRequested = false): ISessionCreationEnvironment | undefined {
	if (!isRemoteSessionCreationEnvironment(provider)) {
		return undefined;
	}
	return {
		id: containerRequested ? `container:${provider.id}` : provider.id,
		kind: containerRequested ? 'container' : 'remote',
		label: containerRequested ? getFolderDevContainerEnvironmentLabel() : provider.label,
		icon: containerRequested ? Codicon.remote : provider.icon, providerIds: [provider.id],
		description: getAgentHostConnectionStatusLabel(provider.connectionStatus.get()),
	};
}

export function getEnvironmentWorkspaceProvider(environment: ISessionCreationEnvironment, providers: readonly ISessionsProvider[], folderUri: URI, resolveMetadata = true): ISessionsProvider | undefined {
	return resolveEnvironmentWorkspace(environment, providers, folderUri, resolveMetadata)?.provider;
}

export function resolveEnvironmentWorkspace(environment: ISessionCreationEnvironment, providers: readonly ISessionsProvider[], folderUri: URI, resolveMetadata = true): { readonly provider: ISessionsProvider; readonly workspace: ISessionWorkspace } | undefined {
	for (const provider of providers) {
		if (!environment.providerIds.includes(provider.id)
			|| provider.supportsWorkspaceSelection === false
			|| isAgentHostProvider(provider) && !isAgentHostEnvironmentAvailable(provider)) {
			continue;
		}
		const workspace = resolveMetadata ? provider.resolveWorkspace(folderUri) : provider.resolveWorkspace(folderUri, { resolveMetadata: false });
		if (workspace && (environment.kind !== 'cloud' || provider.getSessionTypes(folderUri).length > 0)) {
			return { provider, workspace };
		}
	}
	return undefined;
}

export function getDefaultSessionCreationEnvironment(environments: readonly ISessionCreationEnvironment[], folderUri: URI | undefined, providerId: string | undefined, containerRequested = false, selectedProvider?: ISessionsProvider, preserveProvider = false): ISessionCreationEnvironment | undefined {
	const local = environments.find(environment => environment.kind === 'local');
	if (folderUri?.scheme === Schemas.file && !containerRequested && local && !preserveProvider) {
		return local;
	}
	return environments.find(environment => (environment.kind === 'container') === containerRequested && environment.providerIds.includes(providerId ?? ''))
		?? (selectedProvider && selectedProvider.id === providerId ? getRemoteSessionCreationEnvironment(selectedProvider, containerRequested) : undefined)
		?? local;
}

/**
 * The environment a draft keeps for the user's pick: as currently listed, or as picked while one of
 * its providers is registered, such as a host hidden from the picker. Once all of them are gone, for
 * example because their host was unregistered, the pick no longer applies; it applies again if a
 * provider of it returns, as when one is recreated.
 */
export function getPickedSessionCreationEnvironment(picked: ISessionCreationEnvironment, environments: readonly ISessionCreationEnvironment[], providers: readonly ISessionsProvider[]): ISessionCreationEnvironment | undefined {
	return environments.find(environment => environment.id === picked.id)
		?? (providers.some(provider => picked.providerIds.includes(provider.id)) ? picked : undefined);
}

interface IEnvironmentPickerItem {
	readonly run: () => Promise<void>;
	readonly checked?: boolean;
}

export const ENVIRONMENT_PICKER_LIST_OPTIONS = {
	className: 'sessions-new-chat-picker-list',
	minWidth: 240,
	hideDefaultKeybindingTooltip: true,
} as const satisfies IActionListOptions;

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
		@IExtensionRemoteAgentHostsService private readonly extensionRemoteAgentHostsService: IExtensionRemoteAgentHostsService,
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
			const accessibleLabel = localize('environmentPicker.trigger', "Environment where the agent runs: {0}", label.textContent);
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
			hover: { content: this.getEnvironmentHover(environment, escapeMarkdownSyntaxTokens) },
			ariaDescription: this.getEnvironmentHover(environment, text => text),
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
					const tooltip = action.tooltip;
					items.push({
						kind: ActionListItemKind.Action,
						label: action.label,
						disabled: !action.enabled,
						hover: tooltip ? { content: escapeMarkdownSyntaxTokens(tooltip) } : undefined,
						ariaDescription: tooltip || undefined,
						group: { title: '', icon: ThemeIcon.isThemeIcon(action.item.icon) ? action.item.icon : undefined },
						item: { run: async () => { await action.run(); } },
					});
				}
			}
		}
		if (remotesEnabled && environmentPickerEnabled) {
			logSettingExperimentTrigger(this.telemetryService, ENVIRONMENT_PICKER_MANAGE_REMOTES_SETTING);
			if (showManage) {
				const manageHover = getManageRemoteEnvironmentsDescription();
				items.push(
					{ kind: ActionListItemKind.Separator, label: '' },
					{
						kind: ActionListItemKind.Action,
						label: localize('environmentPicker.manage', "Manage Remote Environments..."),
						hover: { content: manageHover },
						ariaDescription: manageHover,
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
			getAriaLabel: item => [item.description, item.ariaDescription].reduce<string>((label, part) => typeof part === 'string' && part
				? localize('environmentPicker.item', "{0}, {1}", label, part) : label, item.label ?? ''),
			getWidgetAriaLabel: () => localize('environmentPicker.title', "Environment"),
		}, ENVIRONMENT_PICKER_LIST_OPTIONS);
	}

	/** @param escape Escapes host-supplied text, such as names, for where the hover is rendered. */
	private getEnvironmentHover(environment: ISessionCreationEnvironment, escape: (text: string) => string): string {
		switch (environment.kind) {
			case 'local':
				return localize('environmentPicker.localHover', "Run this session directly on this computer");
			case 'cloud':
				return localize('environmentPicker.cloudHover', "Run this session in the cloud on GitHub");
			case 'container':
				return localize('environmentPicker.containerHover', "Run this session in a dev container for the selected folder");
			case 'remote': {
				const label = escape(environment.label);
				const connection = this.getConnection(environment);
				if (connection === 'devContainer') {
					return localize('environmentPicker.devContainerHover', "Run this session in a dev container on {0}", escape(this.getDevContainerHostLabel(environment) ?? ''));
				}
				if (connection === 'githubEnvironment') {
					return localize('environmentPicker.githubEnvironmentHover', "Run this session on {0}, shared through GitHub Environments", label);
				}
				switch (connection?.type) {
					case RemoteAgentHostEntryType.SSH:
						return localize('environmentPicker.sshHover', "Run this session on {0} over SSH", label);
					case RemoteAgentHostEntryType.Tunnel:
						return localize('environmentPicker.tunnelHover', "Run this session on {0} through a dev tunnel", label);
					case RemoteAgentHostEntryType.WSL:
						return localize('environmentPicker.wslHover', "Run this session on {0} in WSL", label);
					case RemoteAgentHostEntryType.Extension:
						return localize('environmentPicker.extensionHover', "Run this session on {0}, registered by the {1} extension", label, escape(connection.extensionDisplayName));
					default:
						return localize('environmentPicker.remoteHover', "Run this session on {0}", label);
				}
			}
		}
	}

	private isManagedInRemotes(environment: ISessionCreationEnvironment): boolean {
		const connection = this.getConnection(environment);
		if (connection === 'githubEnvironment' || connection === 'devContainer') {
			return true;
		}
		switch (connection?.type) {
			case RemoteAgentHostEntryType.SSH:
			case RemoteAgentHostEntryType.Tunnel:
			case RemoteAgentHostEntryType.Extension:
				return true;
			case RemoteAgentHostEntryType.WSL:
				return isWindows;
			default:
				return false;
		}
	}

	private getDevContainerHostLabel(environment: ISessionCreationEnvironment): string | undefined {
		const provider = environment.kind === 'remote' && this.sessionsProvidersService.getProvider(environment.providerIds[0]);
		const host = provider && isAgentHostProvider(provider) ? provider.devContainerEnvironmentHost : undefined;
		if (host === LocalDevContainerEnvironmentHost) {
			return localize('environmentPicker.devContainerThisComputer', "this computer");
		}
		return host && (this.remoteAgentHostService.getDisplayNameOverride(host)
			?? this.remoteAgentHostService.configuredEntries.find(entry => getEntryAddress(entry) === host)?.name
			?? host);
	}

	/**
	 * The connection behind a remote environment, `'githubEnvironment'` for a host shared through GitHub Environments,
	 * or `'devContainer'` for a Dev Container environment.
	 */
	private getConnection(environment: ISessionCreationEnvironment): 'githubEnvironment' | 'devContainer' | RemoteAgentHostConnection | undefined {
		const provider = environment.kind === 'remote' && this.sessionsProvidersService.getProvider(environment.providerIds[0]);
		if (!provider || !isAgentHostProvider(provider) || !provider.remoteAddress) {
			return undefined;
		}
		if (provider.devContainerEnvironmentHost) {
			return 'devContainer';
		}
		if (this.environmentService.enabled && this.environmentService.accountKey
			&& this.environmentService.hosts.get().some(host => host.kind === 'user-local' && cloudSandboxAddress(host.id) === provider.remoteAddress)) {
			return 'githubEnvironment';
		}
		const remoteAddress = provider.remoteAddress;
		const configured = this.remoteAgentHostService.configuredEntries.find(entry => getEntryAddress(entry) === remoteAddress)?.connection;
		// An extension's host that the user disconnected is not dialed, so only its registration describes it.
		const registered = configured ? undefined : this.extensionRemoteAgentHostsService.hosts.get().find(host => host.address === remoteAddress);
		return configured ?? (registered && toExtensionRemoteAgentHostEntry(registered).connection);
	}
}
