/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../base/browser/dom.js';
import { StandardKeyboardEvent } from '../../../../../base/browser/keyboardEvent.js';
import { status } from '../../../../../base/browser/ui/aria/aria.js';
import { Button } from '../../../../../base/browser/ui/button/button.js';
import { renderIcon } from '../../../../../base/browser/ui/iconLabel/iconLabels.js';
import { InputBox } from '../../../../../base/browser/ui/inputbox/inputBox.js';
import { IListRenderer } from '../../../../../base/browser/ui/list/list.js';
import { RenderIndentGuides } from '../../../../../base/browser/ui/tree/abstractTree.js';
import { IObjectTreeElement, ObjectTreeElementCollapseState } from '../../../../../base/browser/ui/tree/tree.js';
import { CancellationTokenSource } from '../../../../../base/common/cancellation.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { KeyCode } from '../../../../../base/common/keyCodes.js';
import { Disposable, DisposableStore, MutableDisposable } from '../../../../../base/common/lifecycle.js';
import { autorun } from '../../../../../base/common/observable.js';
import { OperatingSystem } from '../../../../../base/common/platform.js';
import { localize } from '../../../../../nls.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IContextViewService } from '../../../../../platform/contextview/browser/contextView.js';
import { IHoverService } from '../../../../../platform/hover/browser/hover.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { IKeybindingService } from '../../../../../platform/keybinding/common/keybinding.js';
import { WorkbenchObjectTree } from '../../../../../platform/list/browser/listService.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import { defaultButtonStyles, defaultInputBoxStyles } from '../../../../../platform/theme/browser/defaultStyles.js';
import { AccessibilityVerbositySettingId } from '../../../../../workbench/contrib/accessibility/browser/accessibilityConfiguration.js';
import { CUSTOMIZATION_GROUP_HEADER_HEIGHT, CustomizationGroupHeaderRenderer, ICustomizationGroupHeaderEntry } from '../../../../../workbench/contrib/chat/browser/aiCustomization/customizationGroupHeaderRenderer.js';
import { CustomizationToggle } from '../../../../../workbench/contrib/chat/browser/aiCustomization/customizationToggle.js';
import { asTreeRenderer, customizationTreeStyles, getCustomizationTreeContentHeight } from '../../../../../workbench/contrib/chat/browser/aiCustomization/customizationTree.js';
import { getVisibleRemoteKinds, ICustomizationRemote, IRemotesModel, RemoteKind, remoteKindLabels } from './remotesModel.js';
import '../../../../../workbench/contrib/chat/browser/aiCustomization/media/aiCustomizationManagement.css';
import './media/remotesWidget.css';

interface IRemoteEntry {
	readonly type: 'remote';
	readonly remote: ICustomizationRemote;
	readonly checked: boolean;
	readonly busy: boolean;
}

interface IRemoteGroupEntry extends ICustomizationGroupHeaderEntry {
	readonly warning?: string;
}

type RemoteTreeEntry = IRemoteGroupEntry | IRemoteEntry;

interface IRemoteTemplate {
	readonly container: HTMLElement;
	readonly name: HTMLElement;
	readonly detail: HTMLElement;
	readonly toggle: CustomizationToggle;
	readonly disposables: DisposableStore;
	readonly elementDisposables: DisposableStore;
	entry?: IRemoteEntry;
}

class RemoteRenderer implements IListRenderer<IRemoteEntry, IRemoteTemplate> {
	readonly templateId = 'remote';
	private readonly templates = new Set<IRemoteTemplate>();
	private focusedId: string | undefined;

	constructor(
		private readonly hoverService: IHoverService,
		private readonly setEnabled: (id: string, enabled: boolean) => void,
	) { }

	renderTemplate(container: HTMLElement): IRemoteTemplate {
		const disposables = new DisposableStore();
		const elementDisposables = disposables.add(new DisposableStore());
		container.classList.add('remotes-list-item');
		const details = dom.append(container, dom.$('.remotes-details'));
		const name = dom.append(details, dom.$('.remotes-name'));
		const detail = dom.append(details, dom.$('.remotes-detail'));
		const toggle = disposables.add(new CustomizationToggle({ ariaLabel: '' }));
		dom.append(container, toggle.domNode);
		const template: IRemoteTemplate = { container, name, detail, toggle, disposables, elementDisposables };
		disposables.add(dom.addDisposableGenericMouseDownListener(toggle.domNode, event => dom.EventHelper.stop(event, true)));
		disposables.add(dom.addDisposableListener(toggle.domNode, dom.EventType.KEY_DOWN, event => {
			const keyboardEvent = new StandardKeyboardEvent(event);
			if (keyboardEvent.keyCode === KeyCode.Space || keyboardEvent.keyCode === KeyCode.Enter) {
				keyboardEvent.stopPropagation();
			}
		}));
		disposables.add(toggle.onChange(enabled => {
			if (template.entry) {
				this.setEnabled(template.entry.remote.id, enabled);
			}
		}));
		this.templates.add(template);
		return template;
	}

	renderElement(entry: IRemoteEntry, _index: number, template: IRemoteTemplate): void {
		template.elementDisposables.clear();
		template.entry = entry;
		const { remote } = entry;
		template.container.dataset.remoteId = remote.id;
		template.container.classList.toggle('disabled', !entry.checked);
		template.container.setAttribute('aria-busy', String(entry.busy));
		template.name.textContent = remote.name;
		template.detail.textContent = remote.unavailableReason ?? remote.detail;
		template.toggle.checked = entry.checked;
		template.toggle.disabled = !!remote.unavailableReason;
		template.toggle.setAriaLabel(
			localize('remotes.switchLabel', "Show {0} ({1}) in the location picker", remote.name, remoteKindLabels[remote.kind]),
			remote.unavailableReason ?? (entry.checked ? localize('remotes.hideRemote', "Hide {0} from the location picker", remote.name) : localize('remotes.showRemote', "Show {0} in the location picker", remote.name)),
		);
		template.toggle.setTabIndex(remote.id === this.focusedId ? 0 : -1);
		template.elementDisposables.add(this.hoverService.setupDelayedHover(template.name, { content: remote.name }));
		template.elementDisposables.add(this.hoverService.setupDelayedHover(template.detail, { content: template.detail.textContent }));
	}

	setFocusedId(id: string | undefined): void {
		this.focusedId = id;
		for (const template of this.templates) {
			template.toggle.setTabIndex(template.entry?.remote.id === id ? 0 : -1);
		}
	}

	disposeElement(_entry: IRemoteEntry, _index: number, template: IRemoteTemplate): void {
		template.elementDisposables.clear();
		template.entry = undefined;
	}

	disposeTemplate(template: IRemoteTemplate): void {
		this.templates.delete(template);
		template.disposables.dispose();
	}
}

export class RemotesWidget extends Disposable {
	readonly domNode: HTMLElement;
	private readonly tree: WorkbenchObjectTree<RemoteTreeEntry>;
	private readonly treeContainer: HTMLElement;
	private readonly message: HTMLElement;
	private readonly searchInput: InputBox;
	private readonly refreshButton: Button;
	private readonly refreshRequest = this._register(new MutableDisposable<CancellationTokenSource>());
	private readonly pending = new Map<string, boolean>();
	private readonly kinds: readonly RemoteKind[];
	private visible = false;
	private query = '';
	private failedKinds: readonly RemoteKind[] = [];

	constructor(
		container: HTMLElement,
		private readonly model: IRemotesModel,
		operatingSystem: OperatingSystem,
		@IInstantiationService instantiationService: IInstantiationService,
		@IContextViewService contextViewService: IContextViewService,
		@IHoverService hoverService: IHoverService,
		@INotificationService private readonly notificationService: INotificationService,
		@IConfigurationService configurationService: IConfigurationService,
		@IKeybindingService keybindingService: IKeybindingService,
	) {
		super();
		this._register(model);
		this.kinds = getVisibleRemoteKinds(operatingSystem);
		this.domNode = dom.append(container, dom.$('.mcp-list-widget.remotes-widget'));
		const header = dom.append(this.domNode, dom.$('.section-title-header'));
		const titleRow = dom.append(header, dom.$('.section-title-row'));
		dom.append(titleRow, dom.$('h2.section-title')).textContent = localize('remotes.title', "Remotes");
		this.refreshButton = this._register(new Button(dom.append(titleRow, dom.$('.section-title-actions')), { ...defaultButtonStyles, secondary: true, small: true }));
		this.refreshButton.label = localize('remotes.refresh', "Refresh");
		this._register(this.refreshButton.onDidClick(() => { void this.refresh(); }));
		dom.append(header, dom.$('p.section-title-description')).textContent = localize('remotes.description', "Choose which remotes appear in the New Session location picker. Hiding a remote may disconnect it.");
		const searchContainer = dom.append(dom.append(this.domNode, dom.$('.list-search-and-button-container')), dom.$('.list-search-container'));
		this.searchInput = this._register(new InputBox(searchContainer, contextViewService, {
			placeholder: localize('remotes.searchPlaceholder', "Type to search..."),
			ariaLabel: localize('remotes.searchLabel', "Search remotes"),
			inputBoxStyles: defaultInputBoxStyles,
		}));
		this._register(this.searchInput.onDidChange(query => this.setSearchQuery(query)));
		this.message = dom.append(this.domNode, dom.$('.remotes-message', { role: 'status' }));
		this.treeContainer = dom.append(this.domNode, dom.$('.mcp-list-container.customization-tree-container'));
		let label = localize('remotes.treeLabel', "Remotes shown in the New Session location picker");
		const helpKeybinding = keybindingService.lookupKeybinding('editor.action.accessibilityHelp')?.getAriaLabel();
		if (configurationService.getValue<boolean>(AccessibilityVerbositySettingId.Remotes) && helpKeybinding) {
			label = localize('remotes.treeLabelWithHelp', "{0}. Use {1} for accessibility help.", label, helpKeybinding);
		}
		const renderer = new RemoteRenderer(hoverService, (id, enabled) => { void this.setEnabled(id, enabled); });
		this.tree = this._register(instantiationService.createInstance(WorkbenchObjectTree<RemoteTreeEntry>,
			'RemotesCustomizationTree', this.treeContainer, {
			getHeight: entry => entry.type === 'group-header' ? CUSTOMIZATION_GROUP_HEADER_HEIGHT : 56,
			getTemplateId: entry => entry.type === 'group-header' ? 'remoteGroup' : renderer.templateId,
		}, [
			asTreeRenderer(new CustomizationGroupHeaderRenderer<IRemoteGroupEntry>('remoteGroup', hoverService, undefined, (entry, container, disposables) => {
				if (entry.warning) {
					const icon = dom.append(container, renderIcon(Codicon.warning));
					icon.classList.add('remotes-refresh-warning');
					icon.setAttribute('aria-hidden', 'true');
					disposables.add(hoverService.setupDelayedHover(icon, { content: entry.warning }));
				}
			})),
			asTreeRenderer(renderer),
		], {
			indent: 8,
			renderIndentGuides: RenderIndentGuides.None,
			hideTwistiesOfChildlessElements: false,
			overrideStyles: customizationTreeStyles,
			multipleSelectionSupport: false,
			setRowLineHeight: false,
			horizontalScrolling: false,
			identityProvider: { getId: entry => entry.type === 'group-header' ? entry.id : entry.remote.id },
			keyboardNavigationLabelProvider: { getKeyboardNavigationLabel: entry => entry.type === 'group-header' ? entry.label : entry.remote.name },
			accessibilityProvider: {
				getWidgetAriaLabel: () => label,
				getAriaLabel: entry => entry.type === 'group-header'
					? entry.warning
						? localize('remotes.groupWarningLabel', "{0}, {1} remotes. Warning: {2}", entry.label, entry.count, entry.warning)
						: localize('remotes.groupLabel', "{0}, {1} remotes", entry.label, entry.count)
					: this.getRemoteAriaLabel(entry.remote, entry.checked),
			},
		}));
		this._register(this.tree.onDidChangeFocus(event => {
			const entry = event.elements[0];
			renderer.setFocusedId(entry?.type === 'remote' ? entry.remote.id : undefined);
		}));
		this._register(dom.addDisposableListener(this.searchInput.inputElement, dom.EventType.KEY_DOWN, event => {
			const keyboardEvent = new StandardKeyboardEvent(event);
			if (keyboardEvent.keyCode === KeyCode.DownArrow) {
				keyboardEvent.preventDefault();
				this.tree.domFocus();
				if (!this.tree.getFocus().length) {
					this.tree.focusFirst();
				}
			}
		}));
		const resizeObserver = this._register(new dom.DisposableResizeObserver('RemotesWidget', () => this.layout(), dom.getWindow(this.domNode)));
		this._register(resizeObserver.observe(this.domNode));
		this._register(autorun(reader => {
			this.model.remotes.read(reader);
			this.render();
		}));
	}

	setVisible(visible: boolean): void {
		if (this.visible === visible) {
			return;
		}
		this.visible = visible;
		if (visible) {
			void this.refresh();
		} else {
			this.cancelRefresh();
		}
	}

	setSearchQuery(query: string): void {
		const normalizedQuery = query.toLowerCase().trim();
		const changed = this.query !== normalizedQuery;
		this.query = normalizedQuery;
		this.searchInput.value = query;
		if (changed) {
			this.render();
		}
	}

	private cancelRefresh(): void {
		this.refreshRequest.value?.cancel();
		this.refreshRequest.clear();
		this.refreshButton.enabled = true;
	}

	private async refresh(): Promise<void> {
		this.cancelRefresh();
		const request = new CancellationTokenSource();
		this.refreshRequest.value = request;
		this.refreshButton.enabled = false;
		this.message.textContent = localize('remotes.loading', "Looking for remotes...");
		this.layout();
		try {
			const failedKinds = await this.model.refresh(request.token);
			if (!request.token.isCancellationRequested && !this._store.isDisposed) {
				this.failedKinds = failedKinds;
				this.message.textContent = '';
				this.render();
				if (failedKinds.some(kind => this.kinds.includes(kind))) {
					status(localize('remotes.refreshWarnings', "Some remote locations could not be refreshed. Check the warnings on the remote groups for details."));
				}
			}
		} catch (error) {
			if (!request.token.isCancellationRequested) {
				this.notificationService.error(error);
				this.message.textContent = '';
				this.layout();
			}
		} finally {
			if (this.refreshRequest.value === request) {
				this.refreshButton.enabled = true;
				this.refreshRequest.clear();
			}
		}
	}

	private getFilteredRemotes(): readonly ICustomizationRemote[] {
		return this.model.remotes.get().filter(remote => this.kinds.includes(remote.kind)
			&& `${remote.name} ${remote.detail} ${remoteKindLabels[remote.kind]}`.toLowerCase().includes(this.query));
	}

	private render(): void {
		const remotes = this.getFilteredRemotes();
		const children = this.kinds.map((kind, index): IObjectTreeElement<RemoteTreeEntry> => {
			const entries = remotes.filter(remote => remote.kind === kind);
			const warning = this.getRefreshWarning(kind);
			return {
				element: {
					type: 'group-header', id: `remote-group-${kind}`, label: remoteKindLabels[kind],
					icon: Codicon.remote, count: entries.length, isFirst: index === 0, collapsed: false,
					warning,
					description: warning ?? localize('remotes.groupDescription', "{0} locations available for new sessions.", remoteKindLabels[kind]),
				},
				collapsible: true,
				collapsed: this.query ? ObjectTreeElementCollapseState.Expanded : ObjectTreeElementCollapseState.PreserveOrExpanded,
				children: entries.map(remote => ({
					element: { type: 'remote', remote, checked: this.pending.get(remote.id) ?? remote.enabled, busy: this.pending.has(remote.id) },
				})),
			};
		});
		this.tree.setChildren(null, children);
		if (!this.tree.getFocus().length) {
			this.tree.setFocus([children[0].element]);
		}
		this.layout();
	}

	private async setEnabled(id: string, enabled: boolean): Promise<void> {
		if (this.pending.has(id)) {
			this.render();
			return;
		}
		this.pending.set(id, enabled);
		this.render();
		try {
			await this.model.setEnabled(id, enabled);
		} catch (error) {
			this.notificationService.error(error);
		} finally {
			this.pending.delete(id);
			if (!this._store.isDisposed) {
				this.render();
			}
		}
	}

	private getRemoteAriaLabel(remote: ICustomizationRemote, enabled = remote.enabled): string {
		return localize('remotes.accessibleRow', "{0}: {1}. {2}", remote.name,
			enabled ? localize('remotes.shown', "Shown") : localize('remotes.hidden', "Not shown"), remote.unavailableReason ?? remote.detail);
	}

	private getRefreshWarning(kind: RemoteKind): string | undefined {
		if (!this.failedKinds.includes(kind)) {
			return undefined;
		}
		switch (kind) {
			case 'ssh': return localize('remotes.sshRefreshWarning', "Could not read your SSH hosts. Check your SSH configuration. See the Window log for more details.");
			case 'wsl': return localize('remotes.wslRefreshWarning', "Could not refresh WSL distributions. Check that WSL is available. See the Window log for more details.");
			case 'tunnel': return localize('remotes.tunnelRefreshWarning', "Could not refresh tunnels. Check your sign-in and network connection. See the Window log for more details.");
			case 'devContainer': return localize('remotes.devContainerRefreshWarning', "Could not refresh Dev Containers. Check that Docker is running. See the Window log for more details.");
		}
	}

	getAccessibilityContent(): string {
		const remotes = this.getFilteredRemotes();
		return this.kinds.flatMap(kind => {
			const warning = this.getRefreshWarning(kind);
			return [
				remoteKindLabels[kind],
				...(warning ? [warning] : []),
				...remotes.filter(remote => remote.kind === kind).map(remote => this.getRemoteAriaLabel(remote)),
			];
		}).join('\n');
	}

	focus(): void {
		this.searchInput.focus();
	}

	layout(): void {
		if (this.domNode.clientWidth > 0 && this.domNode.clientHeight > 0) {
			this.tree.layout(getCustomizationTreeContentHeight(this.domNode, this.treeContainer, this.domNode.clientHeight), this.treeContainer.clientWidth);
		}
	}

	override dispose(): void {
		this.cancelRefresh();
		super.dispose();
		this.domNode.remove();
	}
}
