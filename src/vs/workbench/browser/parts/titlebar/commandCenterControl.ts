/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { isActiveDocument, reset } from '../../../../base/browser/dom.js';
import { BaseActionViewItem, IBaseActionViewItemOptions } from '../../../../base/browser/ui/actionbar/actionViewItems.js';
import { getDefaultHoverDelegate } from '../../../../base/browser/ui/hover/hoverDelegateFactory.js';
import { IHoverDelegate } from '../../../../base/browser/ui/hover/hoverDelegate.js';
import { renderIcon } from '../../../../base/browser/ui/iconLabel/iconLabels.js';
import { IAction, SubmenuAction } from '../../../../base/common/actions.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { localize } from '../../../../nls.js';
import { createActionViewItem } from '../../../../platform/actions/browser/menuEntryActionViewItem.js';
import { HiddenItemStrategy, MenuWorkbenchToolBar, WorkbenchToolBar } from '../../../../platform/actions/browser/toolbar.js';
import { MenuId, MenuRegistry, SubmenuItemAction } from '../../../../platform/actions/common/actions.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { IQuickInputService } from '../../../../platform/quickinput/common/quickInput.js';
import { WindowTitle } from './windowTitle.js';
import { IEditorGroupsService } from '../../../services/editor/common/editorGroupsService.js';
import { IHoverService } from '../../../../platform/hover/browser/hover.js';
import { IAgentHQService } from '../../../contrib/chat/browser/agentHQ/agentHQService.js';
import { AgentHQOverlay } from '../../../contrib/chat/browser/agentHQ/agentHQOverlay.js';

export class CommandCenterControl {

	private readonly _disposables = new DisposableStore();

	private readonly _onDidChangeVisibility = this._disposables.add(new Emitter<void>());
	readonly onDidChangeVisibility: Event<void> = this._onDidChangeVisibility.event;

	readonly element: HTMLElement = document.createElement('div');

	constructor(
		windowTitle: WindowTitle,
		hoverDelegate: IHoverDelegate,
		@IInstantiationService instantiationService: IInstantiationService,
		@IQuickInputService quickInputService: IQuickInputService,
	) {
		this.element.classList.add('command-center');

		const titleToolbar = instantiationService.createInstance(MenuWorkbenchToolBar, this.element, MenuId.CommandCenter, {
			contextMenu: MenuId.TitleBarContext,
			hiddenItemStrategy: HiddenItemStrategy.NoHide,
			toolbarOptions: {
				primaryGroup: () => true,
			},
			telemetrySource: 'commandCenter',
			actionViewItemProvider: (action, options) => {
				if (action instanceof SubmenuItemAction && action.item.submenu === MenuId.CommandCenterCenter) {
					return instantiationService.createInstance(CommandCenterCenterViewItem, action, windowTitle, { ...options, hoverDelegate });
				} else {
					return createActionViewItem(instantiationService, action, { ...options, hoverDelegate });
				}
			}
		});

		this._disposables.add(Event.filter(quickInputService.onShow, () => isActiveDocument(this.element), this._disposables)(this._setVisibility.bind(this, false)));
		this._disposables.add(quickInputService.onHide(this._setVisibility.bind(this, true)));
		this._disposables.add(titleToolbar);
	}

	private _setVisibility(show: boolean): void {
		this.element.classList.toggle('hide', !show);
		this._onDidChangeVisibility.fire();
	}

	dispose(): void {
		this._disposables.dispose();
	}
}


class CommandCenterCenterViewItem extends BaseActionViewItem {

	private static readonly _quickOpenCommandId = 'workbench.action.quickOpenWithModes';

	private readonly _hoverDelegate: IHoverDelegate;

	constructor(
		private readonly _submenu: SubmenuItemAction,
		private readonly _windowTitle: WindowTitle,
		options: IBaseActionViewItemOptions,
		@IHoverService private readonly _hoverService: IHoverService,
		@IKeybindingService private _keybindingService: IKeybindingService,
		@IInstantiationService private _instaService: IInstantiationService,
		@IEditorGroupsService private _editorGroupService: IEditorGroupsService,
		@IAgentHQService private readonly _agentHQService: IAgentHQService,
	) {
		super(undefined, _submenu.actions.find(action => action.id === 'workbench.action.quickOpenWithModes') ?? _submenu.actions[0], options);
		this._hoverDelegate = options.hoverDelegate ?? getDefaultHoverDelegate('mouse');
	}

	override render(container: HTMLElement): void {
		super.render(container);
		container.classList.add('command-center-center');
		container.classList.toggle('multiple', (this._submenu.actions.length > 1));

		const hover = this._store.add(this._hoverService.setupManagedHover(this._hoverDelegate, container, this.getTooltip()));

		// update label & tooltip when window title changes
		this._store.add(this._windowTitle.onDidChange(() => {
			hover.update(this.getTooltip());
		}));

		const groups: (readonly IAction[])[] = [];
		for (const action of this._submenu.actions) {
			if (action instanceof SubmenuAction) {
				groups.push(action.actions);
			} else {
				groups.push([action]);
			}
		}


		for (let i = 0; i < groups.length; i++) {
			const group = groups[i];

			// nested toolbar
			const toolbar = this._instaService.createInstance(WorkbenchToolBar, container, {
				hiddenItemStrategy: HiddenItemStrategy.NoHide,
				telemetrySource: 'commandCenterCenter',
				actionViewItemProvider: (action, options) => {
					options = {
						...options,
						hoverDelegate: this._hoverDelegate,
					};

					if (action.id !== CommandCenterCenterViewItem._quickOpenCommandId) {
						return createActionViewItem(this._instaService, action, options);
					}

					const that = this;

					return this._instaService.createInstance(class CommandCenterQuickPickItem extends BaseActionViewItem {

						constructor() {
							super(undefined, action, options);
						}

						override render(container: HTMLElement): void {
							super.render(container);
							container.classList.toggle('command-center-quick-pick');
							container.role = 'button';
							container.setAttribute('aria-description', this.getTooltip());
							const action = this.action;

							// icon (agent or search)
							const icon = document.createElement('span');
							icon.ariaHidden = 'true';
							icon.className = action.class ?? '';
							icon.classList.add('search-icon');

							// label: agent session or workspace name
							const label = this._getLabel();
							const labelElement = document.createElement('span');
							labelElement.classList.add('search-label');
							labelElement.textContent = label;
							reset(container, icon, labelElement);

							const hover = this._store.add(that._hoverService.setupManagedHover(that._hoverDelegate, container, this.getTooltip()));

							// Override click to show agent HQ overlay
							this._store.add(that._instaService.createInstance(AgentHQOverlay).onDidClose(() => {
								// Clean up after overlay closes
							}));
							
							container.onclick = (e) => {
								e.preventDefault();
								e.stopPropagation();
								const overlay = that._instaService.createInstance(AgentHQOverlay);
								overlay.show();
							};

							// update label & tooltip when agent session changes
							this._store.add(that._agentHQService.onDidChangeMostRecentSession(() => {
								hover.update(this.getTooltip());
								labelElement.textContent = this._getLabel();
								this._updateIcon(icon);
							}));

							// update label & tooltip when window title changes
							this._store.add(that._windowTitle.onDidChange(() => {
								hover.update(this.getTooltip());
								labelElement.textContent = this._getLabel();
							}));

							// update label & tooltip when tabs visibility changes
							this._store.add(that._editorGroupService.onDidChangeEditorPartOptions(({ newPartOptions, oldPartOptions }) => {
								if (newPartOptions.showTabs !== oldPartOptions.showTabs) {
									hover.update(this.getTooltip());
									labelElement.textContent = this._getLabel();
								}
							}));

							// Initial icon setup
							this._updateIcon(icon);
						}

						private _updateIcon(icon: HTMLElement): void {
							const session = that._agentHQService.mostRecentSession;
							if (session) {
								icon.className = '';
								icon.classList.add('codicon', `codicon-${session.icon.id}`);
							}
						}

						protected override getTooltip() {
							return that.getTooltip();
						}

						private _getLabel(): string {
							const session = that._agentHQService.mostRecentSession;
							if (session) {
								// Show agent session info
								const statusIcon = session.status === 2 ? '$(loading~spin)' : 
												 session.status === 0 ? '$(error)' : '$(check)';
								return `${statusIcon} ${session.label}`;
							}

							// Fallback to workspace name
							const { prefix, suffix } = that._windowTitle.getTitleDecorations();
							let label = that._windowTitle.workspaceName;
							if (that._windowTitle.isCustomTitleFormat()) {
								label = that._windowTitle.getWindowTitle();
							} else if (that._editorGroupService.partOptions.showTabs === 'none') {
								label = that._windowTitle.fileName ?? label;
							}
							if (!label) {
								label = localize('label.dfl', "Search");
							}
							if (prefix) {
								label = localize('label1', "{0} {1}", prefix, label);
							}
							if (suffix) {
								label = localize('label2', "{0} {1}", label, suffix);
							}

							return label.replaceAll(/\r\n|\r|\n/g, '\u23CE');
						}
					});
				}
			});
			toolbar.setActions(group);
			this._store.add(toolbar);


			// spacer
			if (i < groups.length - 1) {
				const icon = renderIcon(Codicon.circleSmallFilled);
				icon.style.padding = '0 8px';
				icon.style.height = '100%';
				icon.style.opacity = '0.5';
				container.appendChild(icon);
			}
		}
	}

	protected override getTooltip() {
		const session = this._agentHQService.mostRecentSession;
		if (session) {
			// Show agent session tooltip
			const statusText = session.status === 2 ? 'In Progress' : 
							 session.status === 0 ? 'Failed' : 'Completed';
			return localize('agentHQ.tooltip', "{0} - {1} ({2})", session.providerLabel, session.label, statusText);
		}

		// tooltip: full windowTitle
		const kb = this._keybindingService.lookupKeybinding(this.action.id)?.getLabel();
		const title = kb
			? localize('title', "Search {0} ({1}) \u2014 {2}", this._windowTitle.workspaceName, kb, this._windowTitle.value)
			: localize('title2', "Search {0} \u2014 {1}", this._windowTitle.workspaceName, this._windowTitle.value);

		return title;
	}
}

MenuRegistry.appendMenuItem(MenuId.CommandCenter, {
	submenu: MenuId.CommandCenterCenter,
	title: localize('title3', "Command Center"),
	icon: Codicon.shield,
	order: 101,
});
