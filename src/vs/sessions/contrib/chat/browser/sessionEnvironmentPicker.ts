/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../base/browser/dom.js';
import { renderIcon } from '../../../../base/browser/ui/iconLabel/iconLabels.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { Disposable, DisposableStore, IDisposable } from '../../../../base/common/lifecycle.js';
import { autorun, IObservable } from '../../../../base/common/observable.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { localize } from '../../../../nls.js';
import { ActionListItemKind, IActionListItem } from '../../../../platform/actionWidget/browser/actionList.js';
import { IActionWidgetService } from '../../../../platform/actionWidget/browser/actionWidget.js';
import { IMenuService, MenuItemAction } from '../../../../platform/actions/common/actions.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IHoverService } from '../../../../platform/hover/browser/hover.js';
import { getDefaultHoverDelegate } from '../../../../base/browser/ui/hover/hoverDelegateFactory.js';
import { Menus } from '../../../browser/menus.js';
import { isAgentHostProvider } from '../../../common/agentHostSessionsProvider.js';
import { SessionWorkspacePickerGroupContext } from '../../../common/contextkeys.js';
import { SESSION_WORKSPACE_GROUP_REMOTE } from '../../../services/sessions/common/session.js';
import { ISessionsProvider } from '../../../services/sessions/common/sessionsProvider.js';
import { URI } from '../../../../base/common/uri.js';
import { IAction } from '../../../../base/common/actions.js';

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
		if (!isAgentHostProvider(provider) || !provider.connectionStatus || provider.hostGroup) {
			continue;
		}
		const connection = provider.connectionStatus.get();
		const description = connection.kind === 'connected'
			? localize('environmentPicker.connected', "Connected")
			: connection.kind === 'connecting'
				? localize('environmentPicker.connecting', "Connecting")
				: localize('environmentPicker.disconnected', "Disconnected");
		environments.push({ id: provider.id, kind: 'remote', label: provider.label, icon: provider.icon, providerIds: [provider.id], description });
	}
	return environments;
}

export function getEnvironmentWorkspaceProvider(environment: ISessionCreationEnvironment, providers: readonly ISessionsProvider[], folderUri: URI): ISessionsProvider | undefined {
	return providers.find(provider => environment.providerIds.includes(provider.id)
		&& provider.supportsWorkspaceSelection !== false
		&& (!isAgentHostProvider(provider) || provider.isVisibleInEnvironmentPicker?.get() !== false)
		&& provider.resolveWorkspace(folderUri)
		&& (environment.kind !== 'cloud' || provider.getSessionTypes(folderUri).length > 0));
}

interface IEnvironmentPickerItem {
	readonly run: () => Promise<void>;
	readonly checked?: boolean;
}

export class SessionEnvironmentPicker extends Disposable {
	constructor(
		private readonly environments: IObservable<readonly ISessionCreationEnvironment[]>,
		private readonly selected: IObservable<ISessionCreationEnvironment | undefined>,
		private readonly select: (environment: ISessionCreationEnvironment) => Promise<void>,
		private readonly getActions: (environment: ISessionCreationEnvironment) => IAction[] = () => [],
		@IActionWidgetService private readonly actionWidgetService: IActionWidgetService,
		@IMenuService private readonly menuService: IMenuService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
		@IHoverService private readonly hoverService: IHoverService,
	) {
		super();
	}

	render(container: HTMLElement): IDisposable & { readonly element: HTMLElement } {
		const store = new DisposableStore();
		const slot = dom.append(container, dom.$('.sessions-chat-picker-slot.sessions-workspace-category-picker-slot'));
		container.prepend(slot);
		const trigger = dom.append(slot, dom.$('a.action-label'));
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
			}
		});
		const tooltip = store.add(this.hoverService.setupManagedHover(getDefaultHoverDelegate('mouse'), trigger, ''));
		store.add(autorun(reader => {
			const environment = this.selected.read(reader);
			dom.clearNode(trigger);
			dom.append(trigger, renderIcon(environment?.icon ?? Codicon.deviceDesktop));
			const label = dom.append(trigger, dom.$('span.sessions-chat-dropdown-label'));
			label.textContent = environment?.label ?? localize('environmentPicker.choose', "Environment");
			const accessibleLabel = localize('environmentPicker.trigger', "Choose Environment, {0}", label.textContent);
			trigger.setAttribute('aria-label', accessibleLabel);
			tooltip.update(accessibleLabel);
		}));
		const open = () => this.showPicker(trigger);
		store.add(dom.addDisposableListener(trigger, dom.EventType.CLICK, open));
		store.add(dom.addDisposableListener(trigger, dom.EventType.KEY_DOWN, event => {
			if (event.key === 'Enter' || event.key === ' ' || event.key === 'ArrowDown') {
				dom.EventHelper.stop(event, true);
				open();
			}
		}));
		return { element: slot, dispose: () => store.dispose() };
	}

	private showPicker(trigger: HTMLElement): void {
		if (this.actionWidgetService.isVisible) {
			return;
		}
		const items: IActionListItem<IEnvironmentPickerItem>[] = this.environments.get().map(environment => ({
			kind: ActionListItemKind.Action,
			label: environment.label,
			description: environment.description,
			submenuActions: this.getActions(environment),
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
		}, { className: 'sessions-new-chat-picker-list', minWidth: 240 });
	}
}
