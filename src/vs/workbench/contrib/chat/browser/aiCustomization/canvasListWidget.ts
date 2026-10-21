/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/canvasListWidget.css';
import * as DOM from '../../../../../base/browser/dom.js';
import { Button } from '../../../../../base/browser/ui/button/button.js';
import { getDefaultHoverDelegate } from '../../../../../base/browser/ui/hover/hoverDelegateFactory.js';
import { IMouseEvent } from '../../../../../base/browser/mouseEvent.js';
import { IManagedHover } from '../../../../../base/browser/ui/hover/hover.js';
import { InputBox } from '../../../../../base/browser/ui/inputbox/inputBox.js';
import { IListRenderer, IListVirtualDelegate } from '../../../../../base/browser/ui/list/list.js';
import { IObjectTreeElement, ObjectTreeElementCollapseState } from '../../../../../base/browser/ui/tree/tree.js';
import { RenderIndentGuides } from '../../../../../base/browser/ui/tree/abstractTree.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { KeyCode } from '../../../../../base/common/keyCodes.js';
import { Action, IAction } from '../../../../../base/common/actions.js';
import { Emitter } from '../../../../../base/common/event.js';
import { Disposable, DisposableStore } from '../../../../../base/common/lifecycle.js';
import { autorun } from '../../../../../base/common/observable.js';
import { isMacintosh, isWindows } from '../../../../../base/common/platform.js';
import { dirname, isEqual } from '../../../../../base/common/resources.js';
import { Schemas } from '../../../../../base/common/network.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { localize } from '../../../../../nls.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { IContextMenuService, IContextViewService } from '../../../../../platform/contextview/browser/contextView.js';
import { IDialogService } from '../../../../../platform/dialogs/common/dialogs.js';
import { IHoverService } from '../../../../../platform/hover/browser/hover.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { ILabelService } from '../../../../../platform/label/common/label.js';
import { WorkbenchObjectTree } from '../../../../../platform/list/browser/listService.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import { defaultInputBoxStyles, getButtonStyles } from '../../../../../platform/theme/browser/defaultStyles.js';
import { CanvasCustomizationSourceGroup, CanvasCustomizationStatus, ICanvasCustomizationRow, ICanvasCustomizationService } from '../../common/canvasCustomizations.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';
import { IAgentPluginService } from '../../common/plugins/agentPluginService.js';
import { IAgentPluginItem } from '../agentPluginEditor/agentPluginItems.js';
import { IAICustomizationManagementSectionWidget } from './aiCustomizationManagementSectionRegistry.js';
import { createInstalledPluginItem } from './mcpListWidget.js';
import { MiddleEllipsisPathLabel } from './aiCustomizationListWidgetUtils.js';
import { CUSTOMIZATION_GROUP_HEADER_HEIGHT, CUSTOMIZATION_GROUP_HEADER_HEIGHT_WITH_SEPARATOR, CustomizationGroupHeaderRenderer, ICustomizationGroupHeaderEntry } from './customizationGroupHeaderRenderer.js';
import { CustomizationToggle } from './customizationToggle.js';
import { asTreeRenderer, customizationTreeStyles, getCustomizationTreeContentHeight } from './customizationTree.js';

const $ = DOM.$;

const CANVAS_ROW_HEIGHT = 44;
const CANVAS_GROUP_TEMPLATE_ID = 'canvasGroupHeader';
const CANVAS_ROW_TEMPLATE_ID = 'canvasRow';

interface ICanvasGroupHeaderEntry extends ICustomizationGroupHeaderEntry {
	readonly group: CanvasCustomizationSourceGroup;
}

interface ICanvasRowEntry {
	readonly type: 'canvas-row';
	readonly row: ICanvasCustomizationRow;
	readonly extensionsDisabled: boolean;
}

type ICanvasListEntry = ICanvasGroupHeaderEntry | ICanvasRowEntry;

class CanvasListDelegate implements IListVirtualDelegate<ICanvasListEntry> {
	getHeight(element: ICanvasListEntry): number {
		if (element.type === 'group-header') {
			return element.isFirst ? CUSTOMIZATION_GROUP_HEADER_HEIGHT : CUSTOMIZATION_GROUP_HEADER_HEIGHT_WITH_SEPARATOR;
		}
		return CANVAS_ROW_HEIGHT;
	}

	getTemplateId(element: ICanvasListEntry): string {
		return element.type === 'group-header' ? CANVAS_GROUP_TEMPLATE_ID : CANVAS_ROW_TEMPLATE_ID;
	}
}

/**
 * Workspace extensions live in `<root>/.github/extensions/` and user extensions
 * in `~/.copilot/extensions/`, so their labels start at that folder.
 */
function getSourceFolderLabel(row: ICanvasCustomizationRow, labelService: ILabelService): string {
	if (!row.sourceUri) {
		return row.extensionName;
	}
	const folder = dirname(row.sourceUri);
	const anchor = row.sourceGroup === CanvasCustomizationSourceGroup.Workspace ? '.github' : '.copilot';
	const segments = folder.path.split('/');
	const index = segments.lastIndexOf(anchor);
	return index >= 0 ? segments.slice(index).join('/') : labelService.getUriLabel(folder, { relative: true });
}

function getToggleAriaLabel(row: ICanvasCustomizationRow): string {
	return row.canvasId
		? localize('canvasToggleAriaLabel', "Enable {0}", row.displayName)
		: localize('canvasExtensionToggleAriaLabel', "Enable Copilot Extension {0}", row.extensionName);
}

function getCanvasSourceLabel(row: ICanvasCustomizationRow, labelService: ILabelService): string {
	return row.sourceGroup === CanvasCustomizationSourceGroup.Plugin
		? localize('canvasPluginSource', "Plugin: {0}", row.pluginName ?? row.extensionName)
		: getSourceFolderLabel(row, labelService);
}

function getCanvasSourceTooltip(row: ICanvasCustomizationRow, labelService: ILabelService): string {
	return row.sourceGroup === CanvasCustomizationSourceGroup.Plugin
		? localize('canvasOpenPlugin', "Open plugin {0}", row.pluginName ?? row.extensionName)
		: localize('canvasOpenSourceFile', "Open {0}", row.sourceUri ? labelService.getUriLabel(row.sourceUri, { noPrefix: true }) : getSourceFolderLabel(row, labelService));
}

function getRowAriaLabel(row: ICanvasCustomizationRow): string {
	const state = row.enabled ? localize('canvasStateOn', "On") : localize('canvasStateOff', "Off");
	return row.canvasId
		? localize('canvasRowAriaLabel', "{0}, from {1}, {2}", row.displayName, row.extensionName, state)
		: localize('canvasExtensionRowAriaLabel', "Copilot Extension {0}, {1}", row.extensionName, state);
}

interface ICanvasRowTemplateData {
	readonly container: HTMLElement;
	readonly name: HTMLElement;
	readonly sourcePath: HTMLElement;
	readonly sourcePathLabel: MiddleEllipsisPathLabel;
	readonly sourcePathHover: IManagedHover;
	readonly toggle: CustomizationToggle;
	readonly moreButton: Button;
	readonly templateDisposables: DisposableStore;
	readonly elementDisposables: DisposableStore;
}

class CanvasRowRenderer implements IListRenderer<ICanvasRowEntry, ICanvasRowTemplateData> {
	readonly templateId = CANVAS_ROW_TEMPLATE_ID;

	constructor(
		private readonly onToggle: (row: ICanvasCustomizationRow, enabled: boolean) => void,
		private readonly onRevealSource: (row: ICanvasCustomizationRow) => void,
		private readonly onShowMenu: (row: ICanvasCustomizationRow, anchor: HTMLElement) => void,
		private readonly hoverService: IHoverService,
		private readonly labelService: ILabelService,
	) { }

	renderTemplate(container: HTMLElement): ICanvasRowTemplateData {
		const templateDisposables = new DisposableStore();
		container.classList.add('mcp-server-item', 'canvas-row');
		container.style.minHeight = `${CANVAS_ROW_HEIGHT}px`;

		const details = DOM.append(container, $('.mcp-server-details'));
		const nameRow = DOM.append(details, $('.mcp-server-name-row'));
		const name = DOM.append(nameRow, $('.mcp-server-name'));
		const secondaryLine = DOM.append(details, $('.mcp-server-secondary-line.has-source'));
		const sourcePath = DOM.append(secondaryLine, $('a.mcp-server-source-path.canvas-row-source'));
		sourcePath.setAttribute('href', '#');
		const sourcePathLabel = templateDisposables.add(new MiddleEllipsisPathLabel(sourcePath));
		const sourcePathHover = templateDisposables.add(this.hoverService.setupManagedHover(getDefaultHoverDelegate('element'), sourcePath, ''));

		const actions = DOM.append(container, $('.mcp-server-actions'));
		const toggle = templateDisposables.add(new CustomizationToggle({ ariaLabel: '' }));
		actions.appendChild(toggle.domNode);
		const moreButton = templateDisposables.add(new Button(actions, {
			...getButtonStyles({
				buttonSecondaryBackground: undefined,
				buttonSecondaryForeground: undefined,
				buttonSecondaryHoverBackground: undefined,
				buttonSecondaryBorder: undefined,
			}),
			secondary: true,
		}));
		moreButton.element.classList.add('canvas-row-more');
		moreButton.icon = Codicon.ellipsis;
		templateDisposables.add(DOM.addDisposableListener(moreButton.element, DOM.EventType.MOUSE_DOWN, e => e.stopPropagation()));

		return { container, name, sourcePath, sourcePathLabel, sourcePathHover, toggle, moreButton, templateDisposables, elementDisposables: templateDisposables.add(new DisposableStore()) };
	}

	renderElement(entry: ICanvasRowEntry, _index: number, templateData: ICanvasRowTemplateData): void {
		templateData.elementDisposables.clear();
		const { row } = entry;

		templateData.container.classList.toggle('disabled', !row.enabled);
		templateData.container.classList.toggle('extension-row', !row.canvasId);
		templateData.name.textContent = row.displayName;

		templateData.sourcePathLabel.set(getCanvasSourceLabel(row, this.labelService));
		templateData.sourcePath.classList.toggle('source-link', row.sourceGroup === CanvasCustomizationSourceGroup.Plugin);
		const revealLabel = getCanvasSourceTooltip(row, this.labelService);
		templateData.sourcePathHover.update(revealLabel);
		templateData.sourcePath.setAttribute('aria-label', revealLabel);
		templateData.elementDisposables.add(DOM.addDisposableListener(templateData.sourcePath, DOM.EventType.MOUSE_DOWN, e => e.stopPropagation()));
		templateData.elementDisposables.add(DOM.addStandardDisposableListener(templateData.sourcePath, DOM.EventType.KEY_DOWN, e => {
			if (e.keyCode === KeyCode.Enter) {
				e.stopPropagation();
			}
		}));
		templateData.elementDisposables.add(DOM.addDisposableListener(templateData.sourcePath, DOM.EventType.CLICK, e => {
			e.preventDefault();
			e.stopPropagation();
			this.onRevealSource(row);
		}));

		templateData.toggle.checked = row.enabled;
		templateData.toggle.disabled = entry.extensionsDisabled;
		templateData.toggle.setAriaLabel(getToggleAriaLabel(row));
		templateData.elementDisposables.add(templateData.toggle.onChange(enabled => this.onToggle(row, enabled)));

		const moreLabel = localize('canvasMoreActions', "More actions for {0}", row.displayName);
		templateData.moreButton.setTitle(moreLabel);
		templateData.moreButton.element.setAttribute('aria-label', moreLabel);
		templateData.elementDisposables.add(templateData.moreButton.onDidClick(e => {
			e?.stopPropagation();
			this.onShowMenu(row, templateData.moreButton.element);
		}));
	}

	disposeTemplate(templateData: ICanvasRowTemplateData): void {
		templateData.templateDisposables.dispose();
	}
}

/**
 * PROTOTYPE: Canvases page in the Chat Customizations editor. Shows canvases
 * grouped by the source of their declaring Copilot extension, with
 * extension-level enablement and navigation to the extension's source.
 */
export class CanvasListWidget extends Disposable implements IAICustomizationManagementSectionWidget {

	readonly element: HTMLElement;

	private readonly _onDidRequestShowPlugin = this._register(new Emitter<IAgentPluginItem>());
	readonly onDidRequestShowPlugin = this._onDidRequestShowPlugin.event;

	private readonly listView: HTMLElement;
	private readonly searchInput: InputBox;
	private readonly notice: HTMLElement;
	private readonly emptyContainer: HTMLElement;
	private readonly emptyText: HTMLElement;
	private readonly emptySubtext: HTMLElement;
	private readonly listContainer: HTMLElement;
	private readonly tree: WorkbenchObjectTree<ICanvasListEntry>;

	private searchQuery = '';
	private visible = false;
	private layoutDeferred = false;

	constructor(
		container: HTMLElement,
		@ICanvasCustomizationService private readonly canvasService: ICanvasCustomizationService,
		@IContextViewService contextViewService: IContextViewService,
		@IHoverService hoverService: IHoverService,
		@ILabelService labelService: ILabelService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IDialogService private readonly dialogService: IDialogService,
		@IEditorService private readonly editorService: IEditorService,
		@IAgentPluginService private readonly agentPluginService: IAgentPluginService,
		@INotificationService private readonly notificationService: INotificationService,
		@IContextMenuService private readonly contextMenuService: IContextMenuService,
		@ICommandService private readonly commandService: ICommandService,
	) {
		super();
		this.element = DOM.append(container, $('.mcp-list-widget.canvas-list-widget'));
		this.listView = DOM.append(this.element, $('.canvas-list-view'));
		const header = DOM.append(this.listView, $('.section-title-header'));
		const titleRow = DOM.append(header, $('.section-title-row'));
		DOM.append(titleRow, $('h2.section-title')).textContent = localize('canvasesTitle', "Canvases");
		DOM.append(header, $('p.section-title-description')).textContent = localize('canvasesDescription', "Interactive panels that Copilot Extensions can open beside a chat.");

		const searchAndButtonContainer = DOM.append(this.listView, $('.list-search-and-button-container'));
		const searchContainer = DOM.append(searchAndButtonContainer, $('.list-search-container'));
		this.searchInput = this._register(new InputBox(searchContainer, contextViewService, {
			placeholder: localize('searchCanvasesPlaceholder', "Type to search..."),
			ariaLabel: localize('searchCanvasesAriaLabel', "Search canvases"),
			inputBoxStyles: defaultInputBoxStyles,
		}));
		this._register(this.searchInput.onDidChange(value => {
			this.searchQuery = value;
			this.render();
		}));

		this.notice = DOM.append(this.listView, $('.canvas-list-notice'));
		DOM.append(this.notice, $(ThemeIcon.asCSSSelector(Codicon.info)));
		DOM.append(this.notice, $('span')).textContent = localize('canvasExtensionsDisabledNotice', "Copilot Extensions are disabled, so canvases can't load.");

		this.emptyContainer = DOM.append(this.listView, $('.mcp-empty-state'));
		this.emptyText = DOM.append(DOM.append(this.emptyContainer, $('.empty-state-header')), $('.empty-text'));
		this.emptySubtext = DOM.append(this.emptyContainer, $('.empty-subtext'));

		this.listContainer = DOM.append(this.listView, $('.mcp-list-container.customization-tree-container'));
		const rowRenderer = new CanvasRowRenderer(
			(row, enabled) => void this.setEnabled(row, enabled),
			row => this.openSource(row),
			(row, anchor) => this.showRowMenu(row, anchor),
			hoverService,
			labelService,
		);
		this.tree = this._register(instantiationService.createInstance(
			WorkbenchObjectTree<ICanvasListEntry>,
			'CanvasCustomizationsTree',
			this.listContainer,
			new CanvasListDelegate(),
			[
				asTreeRenderer(new CustomizationGroupHeaderRenderer<ICanvasGroupHeaderEntry>(CANVAS_GROUP_TEMPLATE_ID, hoverService)),
				asTreeRenderer(rowRenderer),
			],
			{
				indent: 8,
				renderIndentGuides: RenderIndentGuides.None,
				hideTwistiesOfChildlessElements: false,
				overrideStyles: customizationTreeStyles,
				multipleSelectionSupport: false,
				setRowLineHeight: false,
				horizontalScrolling: false,
				openOnSingleClick: false,
				identityProvider: { getId: entry => entry.type === 'group-header' ? entry.id : entry.row.id },
				accessibilityProvider: {
					getAriaLabel: entry => entry.type === 'group-header'
						? localize('canvasGroupAriaLabel', "{0}, {1} items", entry.label, entry.count)
						: getRowAriaLabel(entry.row),
					getWidgetAriaLabel: () => localize('canvasesListAriaLabel', "Canvases"),
				},
			},
		));
		this._register(this.tree.onContextMenu(e => {
			if (e.element && e.element.type === 'canvas-row') {
				this.showRowMenu(e.element.row, e.anchor);
			}
		}));
		this._register(this.tree.onDidOpen(e => {
			if (e.element && e.element.type === 'canvas-row') {
				this.openSource(e.element.row);
			}
		}));

		this._register(autorun(reader => {
			this.canvasService.rows.read(reader);
			this.canvasService.extensionsDisabled.read(reader);
			this.render();
		}));

		const resizeObserver = this._register(new DOM.DisposableResizeObserver('CanvasListWidget', () => this.relayout(), DOM.getWindow(this.element)));
		this._register(resizeObserver.observe(this.element));
	}

	private async setEnabled(row: ICanvasCustomizationRow, enabled: boolean): Promise<void> {
		if (!enabled && !await this.confirmDisable(row)) {
			// Re-render to put the switch back on.
			this.render();
			return;
		}
		await this.canvasService.setEnabled(row, enabled);
	}

	/** Asks for confirmation only when disabling also disables other canvases from the same Copilot Extension. */
	private async confirmDisable(row: ICanvasCustomizationRow): Promise<boolean> {
		const siblings = this.canvasService.rows.get()
			.filter(candidate => candidate.extensionId === row.extensionId && candidate.canvasId && candidate.id !== row.id)
			.map(candidate => candidate.displayName);
		if (siblings.length === 0) {
			return true;
		}
		const detail = siblings.length === 1
			? localize('canvasDisableDetailOneSibling', "This also disables '{0}', because both canvases come from the Copilot Extension '{1}'.", siblings[0], row.extensionName)
			: localize('canvasDisableDetailSiblings', "This also disables {0} other canvases from the Copilot Extension '{1}': {2}.", siblings.length, row.extensionName, siblings.join(', '));
		const { confirmed } = await this.dialogService.confirm({
			type: 'warning',
			message: localize('canvasDisableTitle', "Disable '{0}'?", row.displayName),
			detail,
			primaryButton: localize({ key: 'canvasDisableButton', comment: ['&& denotes a mnemonic'] }, "&&Disable"),
		});
		return confirmed;
	}

	private showRowMenu(row: ICanvasCustomizationRow, anchor: HTMLElement | IMouseEvent): void {
		const disposables = new DisposableStore();
		const actions = this.getRowActions(row, disposables);
		this.contextMenuService.showContextMenu({
			getAnchor: () => anchor,
			getActions: () => actions,
			onHide: () => disposables.dispose(),
		});
	}

	private getRowActions(row: ICanvasCustomizationRow, disposables: DisposableStore): IAction[] {
		const action = (id: string, label: string, run: () => unknown) => disposables.add(new Action(id, label, undefined, true, async () => { await run(); }));
		const extensionsDisabled = this.canvasService.extensionsDisabled.get();
		const groups: IAction[][] = [[], [], []];

		if (row.canvasId && row.enabled && row.status === CanvasCustomizationStatus.Running && !extensionsDisabled) {
			groups[0].push(action('canvas.show', localize('canvasMenuShow', "Show Canvas"), () => this.canvasService.openCanvas(row)));
		}

		if (row.sourceGroup === CanvasCustomizationSourceGroup.Plugin) {
			groups[1].push(action('canvas.showPlugin', localize('canvasMenuShowPlugin', "Show Plugin"), () => this.openSource(row)));
		} else if (row.sourceUri && row.sourceUri.scheme === Schemas.file) {
			const sourceUri = row.sourceUri;
			const revealLabel = isWindows ? localize('canvasMenuRevealWindows', "Reveal in File Explorer") : isMacintosh ? localize('canvasMenuRevealMac', "Reveal in Finder") : localize('canvasMenuRevealLinux', "Open Containing Folder");
			groups[1].push(action('canvas.revealInOS', revealLabel, () => this.commandService.executeCommand('revealFileInOS', sourceUri)));
		}

		if (!extensionsDisabled) {
			groups[2].push(row.enabled
				? action('canvas.disable', localize('canvasMenuDisable', "Disable"), () => this.setEnabled(row, false))
				: action('canvas.enable', localize('canvasMenuEnable', "Enable"), () => this.setEnabled(row, true)));
		}
		return groups.flat();
	}

	private openSource(row: ICanvasCustomizationRow): void {
		if (row.sourceGroup === CanvasCustomizationSourceGroup.Plugin) {
			const plugin = this.agentPluginService.plugins.get().find(candidate => row.pluginUri ? isEqual(candidate.uri, row.pluginUri) : candidate.label === row.pluginName);
			if (plugin) {
				this._onDidRequestShowPlugin.fire(createInstalledPluginItem(plugin));
			} else {
				this.notificationService.info(localize('canvasPluginNotFound', "The plugin '{0}' isn't installed in this window.", row.pluginName ?? row.extensionName));
			}
			return;
		}
		if (row.sourceUri) {
			void this.editorService.openEditor({ resource: row.sourceUri, options: { pinned: true } });
		}
	}

	private render(): void {
		const extensionsDisabled = this.canvasService.extensionsDisabled.get();
		const query = this.searchQuery.trim().toLowerCase();
		const rows = this.canvasService.rows.get().filter(row => !query
			|| row.displayName.toLowerCase().includes(query)
			|| row.extensionName.toLowerCase().includes(query)
			|| row.description?.toLowerCase().includes(query)
			|| row.pluginName?.toLowerCase().includes(query));

		const groups: { group: CanvasCustomizationSourceGroup; label: string; description: string; icon: ThemeIcon; alwaysShow: boolean }[] = [
			{ group: CanvasCustomizationSourceGroup.User, label: localize('canvasUserGroup', "User"), description: localize('canvasUserGroupDescription', "Canvases from Copilot Extensions in ~/.copilot/extensions, available in every workspace."), icon: Codicon.account, alwaysShow: true },
			{ group: CanvasCustomizationSourceGroup.Workspace, label: localize('canvasWorkspaceGroup', "Workspace"), description: localize('canvasWorkspaceGroupDescription', "Canvases from Copilot Extensions in this workspace's .github/extensions folder."), icon: Codicon.folder, alwaysShow: true },
			{ group: CanvasCustomizationSourceGroup.Plugin, label: localize('canvasPluginGroup', "Plugins"), description: localize('canvasPluginGroupDescription', "Canvases from Copilot Extensions shipped by installed plugins."), icon: Codicon.plug, alwaysShow: false },
		];
		const children: IObjectTreeElement<ICanvasListEntry>[] = [];
		for (const definition of groups) {
			const groupRows = rows.filter(row => row.sourceGroup === definition.group);
			if (!definition.alwaysShow && groupRows.length === 0) {
				continue;
			}
			children.push({
				element: { type: 'group-header', id: `canvas-group-${definition.group}`, group: definition.group, label: definition.label, icon: definition.icon, description: definition.description, count: groupRows.length, isFirst: children.length === 0, collapsed: false },
				collapsible: true,
				collapsed: ObjectTreeElementCollapseState.PreserveOrExpanded,
				children: groupRows.map(row => ({ element: { type: 'canvas-row', row, extensionsDisabled } })),
			});
		}
		this.tree.setChildren(null, children);

		this.notice.style.display = extensionsDisabled ? '' : 'none';
		const empty = rows.length === 0;
		this.listContainer.style.display = empty ? 'none' : '';
		this.emptyContainer.style.display = empty ? 'flex' : 'none';
		if (empty) {
			this.emptyText.textContent = query
				? localize('noMatchingCanvases', "No canvases match '{0}'", this.searchQuery)
				: localize('noCanvases', "No canvases yet");
			this.emptySubtext.textContent = query
				? localize('tryDifferentCanvasSearch', "Try a different search term")
				: localize('noCanvasesSubtext', "Canvases come from Copilot Extensions in ~/.copilot/extensions, .github/extensions, or installed plugins.");
		}
		this.relayout();
	}

	layout(): void {
		this.relayout();
	}

	private relayout(): void {
		if (!this.visible || this.listView.style.display === 'none') {
			return;
		}
		const height = this.listView.clientHeight;
		if (height === 0) {
			// The container can still be display:none on the frame it becomes visible.
			if (!this.layoutDeferred) {
				this.layoutDeferred = true;
				DOM.getWindow(this.element).requestAnimationFrame(() => {
					this.layoutDeferred = false;
					this.relayout();
				});
			}
			return;
		}
		const listHeight = getCustomizationTreeContentHeight(this.listView, this.listContainer, height);
		this.listContainer.style.height = `${listHeight}px`;
		this.tree.layout(listHeight, this.listContainer.clientWidth || undefined);
	}

	focus(): void {
		this.searchInput.focus();
	}

	setSearchQuery(query: string): void {
		this.searchInput.value = query;
	}

	setVisible(visible: boolean): void {
		this.visible = visible;
		this.relayout();
	}
}
