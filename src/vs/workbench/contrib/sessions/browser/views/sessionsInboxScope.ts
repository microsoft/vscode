/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../base/browser/dom.js';
import { status } from '../../../../../base/browser/ui/aria/aria.js';
import { createInstantHoverDelegate } from '../../../../../base/browser/ui/hover/hoverDelegateFactory.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { Disposable, toDisposable } from '../../../../../base/common/lifecycle.js';
import { autorun, derived, IObservable, observableSignalFromEvent } from '../../../../../base/common/observable.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { localize } from '../../../../../nls.js';
import { ActionListItemKind, IActionListItem, IActionListOptions } from '../../../../../platform/actionWidget/browser/actionList.js';
import { IActionWidgetService } from '../../../../../platform/actionWidget/browser/actionWidget.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { ISession, ISessionEnvironment } from '../../../../services/sessions/common/session.js';
import { getCompactCodicon } from '../../../chat/browser/chatIcons.js';
import { getNoWorkspaceChoicePresentation } from '../chat/noWorkspaceChoice.js';
import { ENVIRONMENT_PICKER_LIST_OPTIONS } from '../chat/sessionEnvironmentPicker.js';
import { createSessionPickerToolbar } from '../chat/sessionPickerToolbar.js';
import { WORKSPACE_PICKER_LIST_OPTIONS } from '../chat/sessionWorkspacePicker.js';
import { getInboxWorkspaceOptions, getSessionEnvironments, SessionsListFilters } from './sessionsListFilters.js';

interface IInboxScopePickerItem {
	readonly checked: boolean;
	readonly run: () => void;
}

function getEnvironmentIcon(environment: string): ThemeIcon {
	return environment === 'local' ? Codicon.deviceDesktop : environment === 'cloud' ? Codicon.cloud : Codicon.remote;
}

export class SessionsInboxScope extends Disposable {
	readonly element: HTMLElement;
	private activeTrigger: HTMLElement | undefined;

	constructor(
		container: HTMLElement,
		filters: SessionsListFilters,
		sessions: IObservable<readonly ISession[]>,
		environments: IObservable<readonly ISessionEnvironment[]>,
		@IInstantiationService instantiationService: IInstantiationService,
		@IActionWidgetService private readonly actionWidgetService: IActionWidgetService,
	) {
		super();
		this.element = dom.append(container, dom.$('.sessions-inbox-scope'));
		this._register(toDisposable(() => this.hidePicker()));
		const hoverDelegate = this._register(createInstantHoverDelegate());
		const changed = observableSignalFromEvent(this, filters.onDidChange);
		const options = derived(this, reader => {
			changed.read(reader);
			const catalog = sessions.read(reader);
			const scope = filters.inboxScope;
			const environmentOptions = new Map(getSessionEnvironments(environments.read(reader)).map(environment => [environment.id, environment]));
			const availableEnvironments = new Set(environmentOptions.keys());
			for (const session of catalog) {
				if (!environmentOptions.has(session.environment)) {
					environmentOptions.set(session.environment, {
						id: session.environment,
						label: scope.environment?.id === session.environment ? scope.environment.label : session.environment,
					});
				}
			}
			if (scope.environment && !environmentOptions.has(scope.environment.id)) {
				environmentOptions.set(scope.environment.id, scope.environment);
			}
			return {
				scope,
				environments: [...environmentOptions.values()].map(environment => ({
					id: environment.id,
					label: environment.label,
					disconnected: environment.isConnected?.read(reader) === false,
					unavailable: !availableEnvironments.has(environment.id),
				})),
				workspaces: getInboxWorkspaceOptions(catalog, scope.environment?.id, reader),
				hasQuickChats: catalog.some(session => (!scope.environment || scope.environment.id === session.environment) && session.isQuickChat?.read(reader)),
			};
		});
		const workspaceLabel = derived(this, reader => {
			const { scope, workspaces } = options.read(reader);
			if (scope.workspace === undefined) {
				return localize('allWorkspaces', "All Workspaces");
			}
			if (scope.workspace === 'none') {
				return localize('noWorkspace', "No Workspace");
			}
			const selected = scope.workspace;
			return workspaces.find(workspace => workspace.resource === selected.resource && workspace.environment === selected.environment)?.label
				?? localize('unavailableWorkspace', "Unavailable: {0}", selected.label);
		});
		const environmentLabel = derived(this, reader => {
			const { scope, environments } = options.read(reader);
			if (!scope.environment) {
				return localize('allEnvironments', "All Environments");
			}
			const selected = environments.find(environment => environment.id === scope.environment?.id);
			return selected?.unavailable
				? localize('unavailableEnvironment', "Unavailable: {0}", selected.label)
				: selected?.disconnected
					? localize('disconnectedEnvironment', "Disconnected: {0}", selected.label)
					: selected?.label ?? scope.environment.label;
		});
		const announce = () => status(localize('scopeChanged', "Inbox scope: {0}, {1}.", workspaceLabel.get(), environmentLabel.get()));
		const workspaceContainer = dom.append(this.element, dom.$('.scope-picker.workspace-picker'));
		const workspace = createSessionPickerToolbar(this._store, workspaceContainer, instantiationService, 'sessions.inboxWorkspace',
			localize('workspaceFilter', "Filter Inbox by Workspace"), () => pickWorkspace(), hoverDelegate);
		const environmentContainer = dom.append(this.element, dom.$('.scope-picker.environment-picker'));
		const environment = createSessionPickerToolbar(this._store, environmentContainer, instantiationService, 'sessions.inboxEnvironment',
			localize('environmentFilter', "Filter Inbox by Environment"), () => pickEnvironment(), hoverDelegate);
		const workspaceIcon = dom.append(workspace.trigger, dom.$('span', { 'aria-hidden': 'true' }));
		const workspaceLabelElement = dom.append(workspace.trigger, dom.$('span.scope-label'));
		const environmentIcon = dom.append(environment.trigger, dom.$('span', { 'aria-hidden': 'true' }));
		const environmentLabelElement = dom.append(environment.trigger, dom.$('span.scope-label'));
		for (const [picker, show] of [[workspace, () => pickWorkspace()], [environment, () => pickEnvironment()]] as const) {
			picker.trigger.setAttribute('aria-haspopup', 'listbox');
			picker.trigger.setAttribute('aria-expanded', 'false');
			this._register(dom.addDisposableListener(picker.trigger, dom.EventType.KEY_DOWN, event => {
				if (event.key === 'Enter' || event.key === ' ' || event.key === 'ArrowDown') {
					dom.EventHelper.stop(event, true);
					show();
				}
			}));
		}
		this._register(autorun(reader => {
			const workspaceText = workspaceLabel.read(reader);
			const environmentText = environmentLabel.read(reader);
			workspaceLabelElement.textContent = workspaceText;
			environmentLabelElement.textContent = environmentText;
			workspace.trigger.setAttribute('aria-label', localize('workspaceScopeLabel', "Filter Inbox by Workspace: {0}", workspaceText));
			environment.trigger.setAttribute('aria-label', localize('environmentScopeLabel', "Filter Inbox by Environment: {0}", environmentText));
			const scope = options.read(reader).scope;
			workspaceIcon.className = ThemeIcon.asClassName(getCompactCodicon(scope.workspace === 'none' ? getNoWorkspaceChoicePresentation(undefined).icon : Codicon.folder));
			environmentIcon.className = ThemeIcon.asClassName(getCompactCodicon(scope.environment ? getEnvironmentIcon(scope.environment.id) : Codicon.globe));
			workspace.action.tooltip = scope.workspace && scope.workspace !== 'none'
				? localize('workspaceScopeDescription', "{0}: {1}", workspaceText, scope.workspace.description ?? scope.workspace.resource)
				: workspaceText;
			environment.action.tooltip = environmentText;
		}));

		const pickWorkspace = () => {
			const { scope, workspaces, environments, hasQuickChats } = options.get();
			const items: IActionListItem<IInboxScopePickerItem>[] = [{
				kind: ActionListItemKind.Action,
				label: localize('allWorkspaces', "All Workspaces"),
				group: { title: '', icon: Codicon.folder },
				item: { checked: scope.workspace === undefined, run: () => filters.setInboxWorkspace(undefined) },
			}];
			if (hasQuickChats || scope.workspace === 'none') {
				items.push({
					kind: ActionListItemKind.Action,
					label: localize('noWorkspace', "No Workspace"),
					group: { title: '', icon: getNoWorkspaceChoicePresentation(undefined).icon },
					item: { checked: scope.workspace === 'none', run: () => filters.setInboxWorkspace('none') },
				});
			}
			for (const workspace of workspaces) {
				items.push({
					kind: ActionListItemKind.Action,
					label: workspace.label,
					description: localize('workspaceLocation', "{0} - {1}", workspace.description ?? workspace.resource, environments.find(environment => environment.id === workspace.environment)?.label ?? workspace.environment),
					group: { title: '', icon: Codicon.folder },
					item: {
						checked: !!scope.workspace && scope.workspace !== 'none' && scope.workspace.resource === workspace.resource && scope.workspace.environment === workspace.environment,
						run: () => filters.setInboxWorkspace(workspace),
					},
				});
			}
			this.showPicker(workspace.trigger, items, localize('workspaceFilter', "Filter Inbox by Workspace"), {
				...WORKSPACE_PICKER_LIST_OPTIONS,
				showFilter: true,
				focusFilterOnOpen: true,
				filterPlaceholder: localize('searchWorkspaces', "Search"),
			}, announce);
		};
		const pickEnvironment = () => {
			const { scope, environments } = options.get();
			const selectEnvironment = (environment: { id: string; label: string } | undefined) => {
				if (filters.setInboxEnvironment(environment)) {
					status(localize('workspaceScopeReset', "Inbox environment: {0}. Workspace reset to All Workspaces.", environmentLabel.get()));
				} else {
					announce();
				}
			};
			const items: IActionListItem<IInboxScopePickerItem>[] = [{
				kind: ActionListItemKind.Action,
				label: localize('allEnvironments', "All Environments"),
				group: { title: '', icon: Codicon.globe },
				item: { checked: scope.environment === undefined, run: () => selectEnvironment(undefined) },
			}, ...environments.map(environment => ({
				kind: ActionListItemKind.Action,
				label: environment.label,
				description: environment.unavailable ? localize('unavailable', "Unavailable") : environment.disconnected ? localize('disconnected', "Disconnected") : undefined,
				group: { title: '', icon: getEnvironmentIcon(environment.id) },
				item: {
					checked: environment.id === scope.environment?.id,
					run: () => selectEnvironment({ id: environment.id, label: environment.label }),
				},
			}))];
			this.showPicker(environment.trigger, items, localize('environmentFilter', "Filter Inbox by Environment"), ENVIRONMENT_PICKER_LIST_OPTIONS);
		};
	}

	private showPicker(trigger: HTMLElement, items: IActionListItem<IInboxScopePickerItem>[], label: string, options: IActionListOptions, onSelect?: () => void): void {
		if (this._store.isDisposed || this.element.hidden || this.actionWidgetService.isVisible) {
			return;
		}
		this.activeTrigger = trigger;
		trigger.setAttribute('aria-expanded', 'true');
		this.actionWidgetService.show('sessionsInboxScope', false, items, {
			onSelect: item => {
				this.actionWidgetService.hide();
				if (!this._store.isDisposed && !this.element.hidden) {
					item.run();
					onSelect?.();
				}
			},
			onHide: () => {
				this.activeTrigger = undefined;
				trigger.setAttribute('aria-expanded', 'false');
				if (!this._store.isDisposed && !this.element.hidden && trigger.isConnected) {
					trigger.focus();
				}
			},
		}, trigger, undefined, [], { getWidgetAriaLabel: () => label }, options);
	}

	private hidePicker(): void {
		if (this.activeTrigger) {
			this.actionWidgetService.hide(true);
		}
	}

	setVisible(visible: boolean): void {
		this.element.hidden = !visible;
		if (!visible) {
			this.hidePicker();
		}
	}
}
