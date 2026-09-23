/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as DOM from '../../../../../base/browser/dom.js';
import { Button } from '../../../../../base/browser/ui/button/button.js';
import { HighlightedLabel } from '../../../../../base/browser/ui/highlightedlabel/highlightedLabel.js';
import { InputBox } from '../../../../../base/browser/ui/inputbox/inputBox.js';
import { IListRenderer, IListVirtualDelegate } from '../../../../../base/browser/ui/list/list.js';
import { IObjectTreeElement, ObjectTreeElementCollapseState } from '../../../../../base/browser/ui/tree/tree.js';
import { StandardMouseEvent } from '../../../../../base/browser/mouseEvent.js';
import { IAnchor } from '../../../../../base/browser/ui/contextview/contextview.js';
import { Action } from '../../../../../base/common/actions.js';
import { Delayer } from '../../../../../base/common/async.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { Emitter } from '../../../../../base/common/event.js';
import { IMatch, matchesContiguousSubString } from '../../../../../base/common/filters.js';
import { KeyCode } from '../../../../../base/common/keyCodes.js';
import { Disposable, DisposableStore } from '../../../../../base/common/lifecycle.js';
import { autorun, derived, IObservable, IReader, observableSignalFromEvent, observableValue } from '../../../../../base/common/observable.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { URI } from '../../../../../base/common/uri.js';
import { localize } from '../../../../../nls.js';
import { ExtensionIdentifier } from '../../../../../platform/extensions/common/extensions.js';
import { IContextMenuService, IContextViewService } from '../../../../../platform/contextview/browser/contextView.js';
import { IDialogService } from '../../../../../platform/dialogs/common/dialogs.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { IHoverService } from '../../../../../platform/hover/browser/hover.js';
import { WorkbenchObjectTree } from '../../../../../platform/list/browser/listService.js';
import { IOpenerService } from '../../../../../platform/opener/common/opener.js';
import { defaultButtonStyles, defaultInputBoxStyles } from '../../../../../platform/theme/browser/defaultStyles.js';
import { IWorkbenchEnvironmentService } from '../../../../services/environment/common/environmentService.js';
import { ExtensionState, IExtension, IExtensionsWorkbenchService } from '../../../extensions/common/extensions.js';
import { ILanguageModelToolsService, IToolData, IToolSet, ToolDataSource } from '../../common/tools/languageModelToolsService.js';
import { countEnabledCustomizationTools, getToolSetTriState, IAgentHostToolSetEnablementService, isToolEnabledInSet, IToolEnablementState } from '../agentSessions/agentHost/agentHostToolSetEnablementService.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { ChatConfiguration } from '../../common/constants.js';
import { CustomizationGroupHeaderRenderer, CUSTOMIZATION_GROUP_HEADER_HEIGHT, ICustomizationGroupHeaderEntry } from './customizationGroupHeaderRenderer.js';
import { asTreeRenderer, CustomizationListLayout, CustomizationTreeTabs, getCustomizationListLayout, getSelectedCustomizationGroup, ICustomizationTreeGroup } from './customizationTree.js';
import { CustomizationToggle } from './customizationToggle.js';
import './media/aiCustomizationManagement.css';

const $ = DOM.$;

export function isToolsTreeKeyboardTarget(target: HTMLElement, row: HTMLElement): boolean {
	return target === row;
}

interface IToolViewModel {
	readonly tool: IToolData;
	readonly nameMatches?: IMatch[];
}

interface IToolSetViewModel {
	readonly toolSet: IToolSet;
	readonly allToolIds: string[];
	readonly visibleTools: IToolViewModel[];
	readonly nameMatches?: IMatch[];
	/** When searching, sets are force-expanded to reveal matching tools regardless of user state. */
	readonly forceExpanded: boolean;
	readonly readOnly: boolean;
	/** Precomputed subtitle (own `detail`, or an extension description) shown under the set's name. */
	readonly detail?: string;
}

//#region Virtualized tool rows

/** A flattened row in a section's virtualized list: either a tool-set header or one of its member tools. */
interface IToolsSetRowEntry {
	readonly type: 'set';
	readonly vm: IToolSetViewModel;
}

interface IToolsToolRowEntry {
	readonly type: 'tool';
	readonly setVm: IToolSetViewModel;
	readonly toolVm: IToolViewModel;
}

type IToolsRowEntry = IToolsSetRowEntry | IToolsToolRowEntry;

interface IToolsGroupEntry extends ICustomizationGroupHeaderEntry {
	readonly groupKey: string;
}

interface IToolsEmptyRowEntry {
	readonly type: 'empty';
	readonly id: string;
	readonly label: string;
}

type IToolsTreeEntry = IToolsGroupEntry | IToolsRowEntry | IToolsEmptyRowEntry;

const TOOLS_SET_ROW_TEMPLATE_ID = 'toolsSetRow';
const TOOLS_TOOL_ROW_TEMPLATE_ID = 'toolsToolRow';
// Row heights derived from the fixed single-line label/subtext CSS plus each row kind's vertical padding.
const TOOLS_SET_ROW_PADDING = 16; // --vscode-spacing-size80 (8px) top + bottom
const TOOLS_TOOL_ROW_PADDING = 12; // --vscode-spacing-size60 (6px) top + bottom
const TOOLS_ROW_LABEL_HEIGHT = 18;
const TOOLS_ROW_SUBTEXT_HEIGHT = 14;
function computeToolsRowHeight(entry: IToolsRowEntry): number {
	if (entry.type === 'set') {
		return TOOLS_SET_ROW_PADDING + TOOLS_ROW_LABEL_HEIGHT + (entry.vm.detail ? TOOLS_ROW_SUBTEXT_HEIGHT : 0);
	}
	const description = entry.toolVm.tool.userDescription ?? entry.toolVm.tool.modelDescription;
	return TOOLS_TOOL_ROW_PADDING + TOOLS_ROW_LABEL_HEIGHT + (description ? TOOLS_ROW_SUBTEXT_HEIGHT : 0);
}

class ToolsTreeDelegate implements IListVirtualDelegate<IToolsTreeEntry> {
	getHeight(entry: IToolsTreeEntry): number {
		if (entry.type === 'group-header') {
			return CUSTOMIZATION_GROUP_HEADER_HEIGHT;
		}
		if (entry.type === 'empty') {
			return 54;
		}
		return computeToolsRowHeight(entry);
	}

	getTemplateId(entry: IToolsTreeEntry): string {
		if (entry.type === 'group-header') {
			return 'toolsGroupHeader';
		}
		if (entry.type === 'empty') {
			return 'toolsEmptyRow';
		}
		return entry.type === 'set' ? TOOLS_SET_ROW_TEMPLATE_ID : TOOLS_TOOL_ROW_TEMPLATE_ID;
	}
}

class ToolsEmptyRowRenderer implements IListRenderer<IToolsEmptyRowEntry, HTMLElement> {
	readonly templateId = 'toolsEmptyRow';

	renderTemplate(container: HTMLElement): HTMLElement {
		return DOM.append(container, $('.plugin-inventory-empty.tools-tree-empty-row'));
	}

	renderElement(entry: IToolsEmptyRowEntry, _index: number, templateData: HTMLElement): void {
		templateData.textContent = entry.label;
	}

	disposeTemplate(): void { }
}

interface IToolsSetRowTemplateData {
	readonly container: HTMLElement;
	readonly checkbox: CustomizationToggle;
	readonly label: HighlightedLabel;
	readonly subtext: HTMLElement;
	readonly count: HTMLElement;
	readonly alwaysAvailable: HTMLElement;
	readonly moreButton: HTMLButtonElement;
	readonly chevron: HTMLElement;
	readonly templateDisposables: DisposableStore;
	readonly elementDisposables: DisposableStore;
	currentSetId: string | undefined;
}

/** Renders a tool-set header row: checkbox/tri-state, name + detail, enabled count, more actions, chevron. */
class ToolsSetRowRenderer implements IListRenderer<IToolsSetRowEntry, IToolsSetRowTemplateData> {
	readonly templateId = TOOLS_SET_ROW_TEMPLATE_ID;
	private readonly _templates = new Set<IToolsSetRowTemplateData>();
	private _focusedSetId: string | undefined;

	constructor(
		private readonly _instantiationService: IInstantiationService,
		private readonly _sessionType: string,
		private readonly _enablementService: IAgentHostToolSetEnablementService,
		private readonly _isExpanded: (vm: IToolSetViewModel, reader: IReader) => boolean,
		private readonly _toggleExpand: (setId: string) => void,
		private readonly _resolveExtension: (ts: IToolSet) => IExtension | undefined,
		private readonly _showExtensionMenu: (anchor: HTMLElement, extension: IExtension) => void,
	) { }

	renderTemplate(container: HTMLElement): IToolsSetRowTemplateData {
		container.classList.add('tools-list-setrow');
		const templateDisposables = new DisposableStore();

		const checkbox = templateDisposables.add(this._instantiationService.createInstance(CustomizationToggle, { ariaLabel: '', checked: false, triState: true }));
		checkbox.setTabIndex(-1);
		container.appendChild(checkbox.domNode);
		templateDisposables.add(DOM.addDisposableGenericMouseDownListener(checkbox.domNode, event => DOM.EventHelper.stop(event, true)));

		const main = DOM.append(container, $('.tools-list-row-main'));
		const text = DOM.append(main, $('.tools-list-row-text'));
		const labelEl = DOM.append(text, $('span.tools-list-row-label'));
		const label = templateDisposables.add(new HighlightedLabel(labelEl));
		const subtext = DOM.append(text, $('span.tools-list-row-subtext'));

		const alwaysAvailable = DOM.append(container, $('span.tools-list-always-available'));
		alwaysAvailable.textContent = localize('toolsAlwaysAvailable', "Always Available");
		const count = DOM.append(container, $('span.tools-list-row-count'));

		const moreButton = DOM.append(container, $('button.tools-list-more-action')) as HTMLButtonElement;
		moreButton.type = 'button';
		moreButton.tabIndex = -1;
		moreButton.classList.add(...ThemeIcon.asClassNameArray(Codicon.ellipsis));
		templateDisposables.add(DOM.addDisposableGenericMouseDownListener(moreButton, event => DOM.EventHelper.stop(event, true)));

		const chevron = DOM.append(container, $('a.tools-list-chevron.codicon')) as HTMLAnchorElement;
		chevron.setAttribute('aria-hidden', 'true');

		const template = { container, checkbox, label, subtext, count, alwaysAvailable, moreButton, chevron, templateDisposables, elementDisposables: templateDisposables.add(new DisposableStore()), currentSetId: undefined };
		this._templates.add(template);
		return template;
	}

	renderElement(entry: IToolsSetRowEntry, _index: number, data: IToolsSetRowTemplateData): void {
		data.elementDisposables.clear();
		data.currentSetId = entry.vm.toolSet.id;
		data.container.removeAttribute('aria-selected');
		const vm = entry.vm;
		const ts = vm.toolSet;
		const setName = ts.description ?? ts.referenceName;

		data.label.set(setName, vm.nameMatches);
		data.subtext.style.display = vm.detail ? '' : 'none';
		data.subtext.textContent = vm.detail ?? '';
		data.alwaysAvailable.style.display = 'none';
		data.checkbox.domNode.style.display = '';
		data.checkbox.domNode.style.visibility = vm.readOnly ? 'hidden' : '';

		if (!vm.readOnly) {
			data.checkbox.setAriaLabel(localize('toolsSetCheckbox', "Enable {0}", setName));
			data.elementDisposables.add(data.checkbox.onChange(() => {
				this._enablementService.setToolSetEnabled(this._sessionType, ts.id, vm.allToolIds, data.checkbox.checked === true);
			}));
		}

		// Tri-state, enabled count and aria-checked all follow the same enablement observable.
		data.elementDisposables.add(autorun(reader => {
			const state = this._enablementService.observe(this._sessionType).read(reader);
			const triState = getToolSetTriState(state, ts.id, vm.allToolIds);
			if (!vm.readOnly) {
				data.checkbox.checked = triState;
				data.container.setAttribute('aria-checked', triState === 'mixed' ? 'mixed' : String(triState));
			} else {
				data.container.removeAttribute('aria-checked');
			}
			const enabledCount = vm.allToolIds.reduce((n, id) => n + (isToolEnabledInSet(state, ts.id, id) ? 1 : 0), 0);
			data.count.textContent = `${enabledCount}/${vm.allToolIds.length}`;
			data.count.setAttribute('aria-label', localize('toolsRowEnabledOfTotal', "{0} of {1} tools enabled", enabledCount, vm.allToolIds.length));
		}));

		data.elementDisposables.add(autorun(reader => {
			const expanded = this._isExpanded(vm, reader);
			data.chevron.classList.toggle('codicon-chevron-down-compact', expanded);
			data.chevron.classList.toggle('codicon-chevron-right-compact', !expanded);
			data.container.setAttribute('aria-expanded', String(expanded));
		}));

		const extension = this._resolveExtension(ts);
		data.moreButton.style.display = extension ? '' : 'none';
		data.moreButton.tabIndex = extension && entry.vm.toolSet.id === this._focusedSetId ? 0 : -1;
		if (extension) {
			const moreLabel = localize('toolsSetMoreActions', "More actions for {0}", setName);
			data.moreButton.setAttribute('aria-label', moreLabel);
			data.moreButton.title = moreLabel;
			data.elementDisposables.add(DOM.addDisposableListener(data.moreButton, 'click', e => {
				DOM.EventHelper.stop(e, true);
				this._showExtensionMenu(data.moreButton, extension);
			}));
		}

		// Clicking the row body (not the checkbox/more-actions button) toggles expand/collapse.
		data.elementDisposables.add(DOM.addDisposableListener(data.container, 'click', e => {
			if (data.checkbox.domNode.contains(e.target as Node) || data.moreButton.contains(e.target as Node)) {
				return;
			}
			this._toggleExpand(ts.id);
		}));
	}

	setFocusedSetId(setId: string | undefined): void {
		this._focusedSetId = setId;
		for (const template of this._templates) {
			template.moreButton.tabIndex = template.moreButton.style.display !== 'none' && template.currentSetId === setId ? 0 : -1;
		}
	}

	disposeTemplate(data: IToolsSetRowTemplateData): void {
		this._templates.delete(data);
		data.templateDisposables.dispose();
	}
}

interface IToolsToolRowTemplateData {
	readonly container: HTMLElement;
	readonly checkbox: CustomizationToggle;
	readonly label: HighlightedLabel;
	readonly subtext: HTMLElement;
	readonly alwaysAvailable: HTMLElement;
	readonly templateDisposables: DisposableStore;
	readonly elementDisposables: DisposableStore;
}

/** Renders a member-tool row nested (visually, via padding) under its tool-set header. */
class ToolsToolRowRenderer implements IListRenderer<IToolsToolRowEntry, IToolsToolRowTemplateData> {
	readonly templateId = TOOLS_TOOL_ROW_TEMPLATE_ID;

	constructor(
		private readonly _instantiationService: IInstantiationService,
		private readonly _sessionType: string,
		private readonly _enablementService: IAgentHostToolSetEnablementService,
	) { }

	renderTemplate(container: HTMLElement): IToolsToolRowTemplateData {
		container.classList.add('tools-list-toolrow');
		const templateDisposables = new DisposableStore();

		const checkbox = templateDisposables.add(this._instantiationService.createInstance(CustomizationToggle, { ariaLabel: '', checked: false }));
		checkbox.setTabIndex(-1);
		container.appendChild(checkbox.domNode);
		templateDisposables.add(DOM.addDisposableGenericMouseDownListener(checkbox.domNode, event => DOM.EventHelper.stop(event, true)));

		const text = DOM.append(container, $('.tools-list-row-text'));
		const labelEl = DOM.append(text, $('span.tools-list-row-label'));
		const label = templateDisposables.add(new HighlightedLabel(labelEl));
		const subtext = DOM.append(text, $('span.tools-list-row-subtext'));

		const alwaysAvailable = DOM.append(container, $('span.tools-list-always-available'));
		alwaysAvailable.textContent = localize('toolsAlwaysAvailable', "Always Available");

		return { container, checkbox, label, subtext, alwaysAvailable, templateDisposables, elementDisposables: templateDisposables.add(new DisposableStore()) };
	}

	renderElement(entry: IToolsToolRowEntry, _index: number, data: IToolsToolRowTemplateData): void {
		data.elementDisposables.clear();
		data.container.removeAttribute('aria-selected');
		const { setVm, toolVm } = entry;
		const tool = toolVm.tool;
		const toolName = tool.displayName ?? tool.id;

		data.container.classList.toggle('readonly', setVm.readOnly);
		data.label.set(toolName, toolVm.nameMatches);
		const description = tool.userDescription ?? tool.modelDescription;
		data.subtext.style.display = description ? '' : 'none';
		data.subtext.textContent = description ?? '';
		data.alwaysAvailable.style.display = setVm.readOnly ? '' : 'none';
		data.checkbox.domNode.style.display = setVm.readOnly ? 'none' : '';

		if (!setVm.readOnly) {
			data.checkbox.setAriaLabel(localize('toolsToolCheckbox', "Enable {0}", toolName));
			data.elementDisposables.add(data.checkbox.onChange(() => {
				this._enablementService.setToolEnabled(this._sessionType, setVm.toolSet.id, tool.id, data.checkbox.checked === true);
			}));
			data.elementDisposables.add(autorun(reader => {
				const enabled = isToolEnabledInSet(this._enablementService.observe(this._sessionType).read(reader), setVm.toolSet.id, tool.id);
				data.checkbox.checked = enabled;
				data.container.setAttribute('aria-checked', String(enabled));
			}));
			data.elementDisposables.add(DOM.addDisposableListener(data.container, 'click', e => {
				if (data.checkbox.domNode.contains(e.target as Node)) {
					return;
				}
				this._enablementService.setToolEnabled(this._sessionType, setVm.toolSet.id, tool.id, !data.checkbox.checked);
			}));
		} else {
			data.container.removeAttribute('aria-checked');
		}
	}

	disposeTemplate(data: IToolsToolRowTemplateData): void {
		data.templateDisposables.dispose();
	}
}

//#endregion

/**
 * Chat Customizations → Tools: a searchable, collapsible tree of tool sets and their member
 * tools. Enablement is read/written via {@link IAgentHostToolSetEnablementService}, scoped to
 * `sessionType` (the agent host is the only target for Tools customizations).
 */
export class ToolsListWidget extends Disposable {

	readonly element: HTMLElement;

	private readonly _onDidChangeItemCount = this._register(new Emitter<number>());
	readonly onDidChangeItemCount = this._onDidChangeItemCount.event;

	private readonly _searchQuery = observableValue<string>('toolsSearchQuery', '');
	private readonly _expanded = observableValue<ReadonlySet<string>>('toolsExpanded', new Set());
	private readonly _delayedSearch = this._register(new Delayer<void>(200));
	private readonly _tabActionDisposables = this._register(new DisposableStore());

	private _searchInput!: InputBox;
	private _header!: HTMLElement;
	private _searchRow!: HTMLElement;
	private _treeContainer!: HTMLElement;
	private _tree!: WorkbenchObjectTree<IToolsTreeEntry>;
	private _treeTabs!: CustomizationTreeTabs;
	private _emptyState!: HTMLElement;

	private _lastCount = -1;
	private _lastHeight = 0;
	private _lastWidth = 0;

	private readonly _collapsedGroups = new Set<string>();
	private _selectedGroupKey: string | undefined;
	private _currentModel: readonly IToolSetViewModel[] = [];
	private _setRenderer!: ToolsSetRowRenderer;

	/** Read-only tool sets injected for the current session type (e.g. the Copilot CLI built-ins). */
	private readonly _staticReadOnlySets: readonly IToolSet[];

	constructor(
		private readonly _sessionType: string,
		@ILanguageModelToolsService private readonly _toolsService: ILanguageModelToolsService,
		@IAgentHostToolSetEnablementService private readonly _enablementService: IAgentHostToolSetEnablementService,
		@IContextViewService private readonly _contextViewService: IContextViewService,
		@IContextMenuService private readonly _contextMenuService: IContextMenuService,
		@IDialogService private readonly _dialogService: IDialogService,
		@IOpenerService private readonly _openerService: IOpenerService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@IExtensionsWorkbenchService private readonly _extensionsWorkbenchService: IExtensionsWorkbenchService,
		@IWorkbenchEnvironmentService private readonly _environmentService: IWorkbenchEnvironmentService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@IHoverService private readonly _hoverService: IHoverService,
	) {
		super();

		this._staticReadOnlySets = this._createStaticReadOnlySets();

		this.element = $('.tools-list-widget');
		this._createHeader();
		this._createSearchRow();

		this._treeTabs = this._register(new CustomizationTreeTabs(this.element, localize('toolsGroups', "Tool Groups")));
		this._treeTabs.element.classList.add('tools-tree-tabs');
		this._register(this._treeTabs.onDidSelect(groupKey => {
			this._selectedGroupKey = groupKey;
			this._renderTreeGroups();
		}));

		this._treeContainer = DOM.append(this.element, $('.tools-list-tree.customization-tree-container'));
		this._createTree();
		this._emptyState = DOM.append(this.element, $('.list-empty-state'));
		this._emptyState.style.display = 'none';

		const viewModel = this._createViewModel();
		this._register(autorun(reader => {
			this._currentModel = viewModel.read(reader);
			this._render(this._currentModel);
		}));

		this._register(autorun(reader => {
			this._expanded.read(reader);
			this._renderTreeGroups();
		}));
		this._register(this._configurationService.onDidChangeConfiguration(event => {
			if (event.affectsConfiguration(ChatConfiguration.ChatCustomizationsListLayout)) {
				this._renderTreeGroups();
				this.layout(this._lastHeight, this._lastWidth);
			}
		}));

		this._register(autorun(reader => {
			// Badge counts enabled individual tools across all visible sets, ignoring the search filter.
			const count = countEnabledCustomizationTools(this._toolsService.toolSets.read(reader), this._readState(reader), reader);
			if (count !== this._lastCount) {
				this._lastCount = count;
				this._onDidChangeItemCount.fire(count);
			}
		}));
	}

	private _createHeader(): void {
		this._header = DOM.append(this.element, $('.section-title-header'));
		DOM.append(DOM.append(this._header, $('.section-title-row')), $('h2.section-title')).textContent = localize('toolsListTitle', "Tools");

		const description = DOM.append(this._header, $('p.section-title-description'));
		DOM.append(description, $('span.section-title-description-text')).textContent = localize('toolsListSubtitle', "Enable or disable the tools available to chat. Disabled tools are not advertised to the agent. Tools other than Copilot's built-in tools run on the client and require it to be connected.");
		// Whitespace node so the gap collapses when the link wraps.
		description.appendChild(document.createTextNode(' '));

		const learnMore = DOM.append(description, $('a.section-title-link')) as HTMLAnchorElement;
		learnMore.textContent = localize('learnMoreTools', "Learn more about tools");
		learnMore.href = 'https://code.visualstudio.com/docs/agent-customization/tools?referrer=in-product';
		this._register(DOM.addDisposableListener(learnMore, 'click', e => {
			e.preventDefault();
			void this._openerService.open(URI.parse(learnMore.href));
		}));
	}

	private _createSearchRow(): void {
		this._searchRow = DOM.append(this.element, $('.tools-list-search-and-button-container'));
		const searchContainer = DOM.append(this._searchRow, $('.tools-list-search-container'));
		this._searchInput = this._register(new InputBox(searchContainer, this._contextViewService, {
			placeholder: localize('searchPlaceholder', "Type to search..."),
			inputBoxStyles: defaultInputBoxStyles,
			ariaLabel: localize('toolsSearchAria', "Search tools"),
		}));
		this._register(this._searchInput.onDidChange(() => {
			this._delayedSearch.trigger(() => {
				this._searchQuery.set(this._searchInput.value, undefined);
			}).catch(() => { /* delayer disposed */ });
		}));
	}

	private _createTree(): void {
		this._setRenderer = new ToolsSetRowRenderer(
			this._instantiationService,
			this._sessionType,
			this._enablementService,
			(vm, reader) => vm.forceExpanded || this._expanded.read(reader).has(vm.toolSet.id),
			setId => this._toggleCollapsed(setId),
			ts => this._resolveExtensionForToolSet(ts),
			(anchor, extension) => this._showExtensionContextMenu(anchor, extension),
		);
		const groupRenderer = new CustomizationGroupHeaderRenderer<IToolsGroupEntry>(
			'toolsGroupHeader',
			this._hoverService,
			(entry, container, disposables) => this._renderTreeGroupActions(entry, container, disposables),
		);
		this._tree = this._register(this._instantiationService.createInstance(
			WorkbenchObjectTree<IToolsTreeEntry>,
			'ToolsManagementTree',
			this._treeContainer,
			new ToolsTreeDelegate(),
			[
				asTreeRenderer(groupRenderer),
				asTreeRenderer(this._setRenderer),
				asTreeRenderer(new ToolsToolRowRenderer(this._instantiationService, this._sessionType, this._enablementService)),
				asTreeRenderer(new ToolsEmptyRowRenderer()),
			],
			{
				indent: 8,
				hideTwistiesOfChildlessElements: false,
				multipleSelectionSupport: false,
				horizontalScrolling: false,
				openOnSingleClick: true,
				identityProvider: { getId: entry => this._treeEntryId(entry) },
				accessibilityProvider: {
					getWidgetAriaLabel: () => localize('toolsTreeAriaLabel', "Tools"),
					getAriaLabel: entry => this._getTreeEntryLabel(entry),
				},
				keyboardNavigationLabelProvider: {
					getKeyboardNavigationLabel: entry => this._getTreeEntryLabel(entry),
				},
			},
		));
		this._register(this._tree.onDidChangeSelection(() => this._tree.setSelection([])));
		this._register(this._tree.onDidChangeFocus(event => {
			const entry = event.elements[0];
			this._setRenderer.setFocusedSetId(entry?.type === 'set' ? entry.vm.toolSet.id : undefined);
		}));
		this._register(this._tree.onDidChangeCollapseState(event => {
			const entry = event.node.element;
			if (!entry || entry.type !== 'group-header') {
				return;
			}
			if (event.node.collapsed) {
				this._collapsedGroups.add(entry.groupKey);
			} else {
				this._collapsedGroups.delete(entry.groupKey);
			}
		}));
		this._register(DOM.addStandardDisposableListener(this._tree.getHTMLElement(), DOM.EventType.KEY_DOWN, event => {
			if (event.keyCode !== KeyCode.Space && event.keyCode !== KeyCode.Enter) {
				return;
			}
			const entry = this._tree.getFocus()[0];
			if (entry && entry.type !== 'group-header' && entry.type !== 'empty') {
				this._activateToolEntry(entry, event.keyCode === KeyCode.Enter);
				event.preventDefault();
				event.stopPropagation();
			}
		}));
	}

	private _readState(reader: IReader): IToolEnablementState {
		return this._enablementService.observe(this._sessionType).read(reader);
	}

	private _createStaticReadOnlySets(): readonly IToolSet[] {
		const tools: IToolData[] = COPILOT_CLI_TOOLS.map(t => ({
			id: `copilot-cli:${t.name}`,
			displayName: t.name,
			modelDescription: t.description,
			source: ToolDataSource.Internal,
			canBeReferencedInPrompt: false,
		}));
		const copilotCliSet: IToolSet = {
			id: 'copilot-cli',
			referenceName: 'copilotCli',
			icon: Codicon.copilot,
			source: ToolDataSource.Internal,
			description: localize('clientToolSet.copilotCli.description', "Copilot"),
			detail: localize('clientToolSet.copilotCli.detail', "Built-in tools the Copilot agent runs inside its own runtime."),
			getTools: () => tools,
		};
		return [copilotCliSet];
	}

	private _createViewModel(): IObservable<readonly IToolSetViewModel[]> {
		// Refresh when extensions change so tool sets from an uninstalled extension drop out immediately (their tools linger in the extension host until reload).
		const extensionsChanged = observableSignalFromEvent(this, this._extensionsWorkbenchService.onChange);
		return derived(reader => {
			extensionsChanged.read(reader);
			const query = this._searchQuery.read(reader).trim();

			const result: IToolSetViewModel[] = [];
			for (const ts of [...this._toolsService.toolSets.read(reader), ...this._staticReadOnlySets]) {
				const vm = this._toViewModel(reader, ts, query);
				if (vm) {
					result.push(vm);
				}
			}
			result.sort((a, b) => sortKey(a.toolSet).localeCompare(sortKey(b.toolSet)));
			return result;
		});
	}

	private _toViewModel(reader: IReader, ts: IToolSet, query: string): IToolSetViewModel | undefined {
		if (ts.deprecated) {
			return undefined;
		}
		// Hide extension-provided sets whose extension is gone or being removed.
		if (ts.source.type === 'extension') {
			const extensionId = ts.source.extensionId;
			const installed = this._extensionsWorkbenchService.local.find(e => ExtensionIdentifier.equals(e.identifier.id, extensionId));
			if (!installed || installed.state === ExtensionState.Uninstalling || installed.state === ExtensionState.Uninstalled) {
				return undefined;
			}
		}
		const memberTools = Array.from(ts.getTools(reader));
		if (memberTools.length === 0) {
			return undefined;
		}
		const allToolIds = memberTools.map(t => t.id);

		let visibleTools: IToolViewModel[] = memberTools.map(tool => ({ tool }));
		let nameMatches: IMatch[] | undefined;
		if (query) {
			nameMatches = matchesContiguousSubString(query, ts.description ?? ts.referenceName) ?? undefined;
			if (nameMatches) {
				visibleTools = memberTools.map(tool => ({ tool, nameMatches: matchesContiguousSubString(query, tool.displayName ?? tool.id) ?? undefined }));
			} else {
				visibleTools = [];
				for (const tool of memberTools) {
					const toolMatches = matchesContiguousSubString(query, tool.displayName ?? tool.id);
					if (toolMatches) {
						visibleTools.push({ tool, nameMatches: toolMatches });
					}
				}
				if (visibleTools.length === 0) {
					return undefined;
				}
			}
		}

		return {
			toolSet: ts,
			allToolIds,
			visibleTools,
			nameMatches,
			forceExpanded: query !== '',
			readOnly: ts.id === 'copilot-cli',
			detail: this._resolveSetDetail(ts)
		};
	}

	layout(height: number, width: number): void {
		this._lastHeight = height;
		this._lastWidth = width;
		if (this.element.parentElement?.style.display === 'none') {
			return;
		}
		this.element.classList.toggle('narrow-layout', width < 500);
		this._searchInput.layout();
		const headerHeight = this._header.offsetHeight;
		const searchHeight = this._searchRow.offsetHeight;
		const tabsHeight = this._treeTabs.element.style.display === 'none' ? 0 : this._treeTabs.element.offsetHeight;
		const treeHeight = Math.max(0, height - headerHeight - searchHeight - tabsHeight);
		this._treeContainer.style.height = `${treeHeight}px`;
		this._tree.layout(treeHeight, width);
	}

	/** Move keyboard focus to the search box. */
	focusSearch(): void {
		this._searchInput.focus();
		this._searchInput.select();
	}

	/** Re-emit the current item count. Called once at startup to seed the section badge. */
	fireItemCount(): void {
		this._onDidChangeItemCount.fire(this._lastCount === -1 ? 0 : this._lastCount);
	}

	private _render(model: readonly IToolSetViewModel[]): void {
		this._currentModel = model;
		this._renderTreeGroups();
	}

	private _renderTreeGroups(): void {
		if (!this._tree) {
			return;
		}
		const query = this._searchQuery.get().trim();
		if (this._currentModel.length === 0 && query) {
			this._tree.setChildren(null);
			this._treeContainer.style.display = 'none';
			this._treeTabs.element.style.display = 'none';
			this._showTreeEmptyState(
				localize('noMatchingTools', "No tools match '{0}'", query),
				localize('tryDifferentSearch', "Try a different search term"),
			);
			return;
		}

		const groups = [
			this._createTreeGroup(
				'builtin',
				localize('builtInToolsSection', "Built-in Tools"),
				localize('builtInToolsSectionDescription', "Tools provided by the active agent and VS Code."),
				localize('builtInToolsSectionEmpty', "No built-in tool sets are available."),
				this._currentModel.filter(vm => vm.toolSet.source.type === 'internal' || vm.toolSet.source.type === 'external'),
			),
			this._createTreeGroup(
				'connected',
				localize('connectedToolsSection', "Connected Sources"),
				localize('connectedToolsSectionDescription', "Tool sets provided by MCP servers and user configuration."),
				localize('connectedToolsSectionEmpty', "No connected tool sources are available."),
				this._currentModel.filter(vm => vm.toolSet.source.type === 'mcp' || vm.toolSet.source.type === 'user'),
			),
			this._createTreeGroup(
				'extensions',
				localize('installedToolExtensionsSection', "Extension Tools"),
				localize('installedToolExtensionsSectionDescription', "Tool sets contributed by installed extensions."),
				localize('extensionToolsSectionEmpty', "No extension tools are installed."),
				this._currentModel.filter(vm => vm.toolSet.source.type === 'extension'),
			),
		].filter(group => !query || group.count > 0);

		this._emptyState.style.display = 'none';
		this._treeContainer.style.display = '';
		this._treeTabs.clearActions();
		this._tabActionDisposables.clear();
		const layout = getCustomizationListLayout(this._configurationService);
		this.element.classList.toggle('tabs-layout', layout === CustomizationListLayout.Tabs);
		this.element.classList.toggle('tree-layout', layout === CustomizationListLayout.Tree);
		this._treeTabs.element.style.display = layout === CustomizationListLayout.Tabs ? '' : 'none';

		if (layout === CustomizationListLayout.Tabs) {
			const selected = getSelectedCustomizationGroup(groups, this._selectedGroupKey);
			this._selectedGroupKey = selected?.id;
			if (selected) {
				this._treeTabs.setGroups(groups, selected.id);
				if (selected.id === 'extensions') {
					this._renderBrowseToolsAction(this._treeTabs.actionsElement, this._tabActionDisposables);
				}
				this._tree.setChildren(null);
				this._tree.setChildren(null, selected.children.map(element => ({ element })));
			}
		} else {
			const children: IObjectTreeElement<IToolsTreeEntry>[] = groups.map(group => ({
				element: group.element,
				collapsible: true,
				collapsed: this._collapsedGroups.has(group.id)
					? ObjectTreeElementCollapseState.PreserveOrCollapsed
					: ObjectTreeElementCollapseState.PreserveOrExpanded,
				children: group.children.map(element => ({ element })),
			}));
			this._tree.setChildren(null);
			this._tree.setChildren(null, children);
		}
		if (this._lastHeight > 0) {
			this.layout(this._lastHeight, this._lastWidth);
		}
	}

	private _createTreeGroup(id: string, label: string, description: string, emptyMessage: string, setVms: readonly IToolSetViewModel[]): ICustomizationTreeGroup<IToolsTreeEntry> {
		const entries = setVms.length > 0
			? this._computeSectionEntries(setVms)
			: [{ type: 'empty' as const, id: `empty:${id}`, label: emptyMessage }];
		const element: IToolsGroupEntry = {
			type: 'group-header',
			id: `tools-group-${id}`,
			groupKey: id,
			label,
			icon: Codicon.tools,
			count: setVms.length,
			isFirst: false,
			description,
			collapsed: this._collapsedGroups.has(id),
		};
		return { id, label, description, count: setVms.length, element, children: entries };
	}

	private _renderTreeGroupActions(entry: IToolsGroupEntry, container: HTMLElement, disposables: DisposableStore): void {
		if (getCustomizationListLayout(this._configurationService) === CustomizationListLayout.Tree && entry.groupKey === 'extensions') {
			this._renderBrowseToolsAction(container, disposables);
		}
	}

	private _renderBrowseToolsAction(container: HTMLElement, disposables: DisposableStore): void {
		if (this._environmentService.isSessionsWindow) {
			return;
		}
		const browseLabel = localize('toolsBrowseMarketplace', "Browse Marketplace");
		const actions = DOM.append(container, $('.tools-inventory-section-actions'));
		const browseButton = disposables.add(new Button(actions, {
			...defaultButtonStyles,
			secondary: true,
			supportIcons: true,
			title: browseLabel,
			ariaLabel: browseLabel,
		}));
		browseButton.label = `$(${Codicon.library.id}) ${browseLabel}`;
		disposables.add(browseButton.onDidClick(() => {
			void this._extensionsWorkbenchService.openSearch('@tag:language-model-tools');
		}));
	}

	private _showTreeEmptyState(text: string, subtext: string): void {
		DOM.clearNode(this._emptyState);
		this._emptyState.style.display = 'flex';
		const header = DOM.append(this._emptyState, $('.empty-state-header'));
		DOM.append(header, $('.empty-state-text')).textContent = text;
		DOM.append(this._emptyState, $('.empty-state-subtext')).textContent = subtext;
	}

	private _treeEntryId(entry: IToolsTreeEntry): string {
		if (entry.type === 'group-header') {
			return entry.id;
		}
		if (entry.type === 'empty') {
			return entry.id;
		}
		return this._entryRowId(entry);
	}

	private _getTreeEntryLabel(entry: IToolsTreeEntry): string {
		if (entry.type === 'group-header') {
			return entry.label;
		}
		if (entry.type === 'empty') {
			return entry.label;
		}
		return entry.type === 'set'
			? entry.vm.toolSet.description ?? entry.vm.toolSet.referenceName
			: entry.toolVm.tool.displayName ?? entry.toolVm.tool.id;
	}

	/** Flattens a section's tool sets into rows, expanding each set's tools when the set is expanded. */
	private _computeSectionEntries(setVms: readonly IToolSetViewModel[]): IToolsRowEntry[] {
		const entries: IToolsRowEntry[] = [];
		for (const vm of setVms) {
			entries.push({ type: 'set', vm });
			if (this._isRowExpanded(vm)) {
				for (const toolVm of vm.visibleTools) {
					entries.push({ type: 'tool', setVm: vm, toolVm });
				}
			}
		}
		return entries;
	}

	private _isRowExpanded(vm: IToolSetViewModel): boolean {
		return vm.forceExpanded || this._expanded.get().has(vm.toolSet.id);
	}

	private _entryRowId(entry: IToolsRowEntry): string {
		return entry.type === 'set' ? `set:${entry.vm.toolSet.id}` : `tool:${entry.setVm.toolSet.id}:${entry.toolVm.tool.id}`;
	}

	/**
	 * Space always toggles enablement (no-op for read-only rows). Enter toggles enablement too, except
	 * on a read-only *set* row, where it expands/collapses instead (a read-only tool row does nothing).
	 * This mirrors the original mouse-vs-keyboard asymmetry, where clicking the row body (not its
	 * checkbox) toggles expand/collapse but Space/Enter on a focused row toggle its checkbox.
	 */
	private _activateToolEntry(entry: IToolsRowEntry, viaEnter: boolean): void {
		const readOnly = entry.type === 'set' ? entry.vm.readOnly : entry.setVm.readOnly;
		if (readOnly) {
			if (viaEnter && entry.type === 'set') {
				this._toggleCollapsed(entry.vm.toolSet.id);
			}
			return;
		}
		if (entry.type === 'set') {
			const vm = entry.vm;
			const current = getToolSetTriState(this._currentState(), vm.toolSet.id, vm.allToolIds);
			this._enablementService.setToolSetEnabled(this._sessionType, vm.toolSet.id, vm.allToolIds, current !== true);
		} else {
			const { setVm, toolVm } = entry;
			const current = isToolEnabledInSet(this._currentState(), setVm.toolSet.id, toolVm.tool.id);
			this._enablementService.setToolEnabled(this._sessionType, setVm.toolSet.id, toolVm.tool.id, !current);
		}
	}

	/**
	 * Subtitle for a tool-set row: the set's own `detail`, or for extension sets the extension's
	 * description (falling back to a generic "contributed by" label).
	 */
	private _resolveSetDetail(ts: IToolSet): string | undefined {
		if (ts.detail) {
			return ts.detail;
		}
		if (ts.source.type !== 'extension') {
			return undefined;
		}
		const source = ts.source;
		const extension = this._extensionsWorkbenchService.local.find(e => ExtensionIdentifier.equals(e.identifier.id, source.extensionId));
		return extension?.description || localize('toolsSetExtensionDetail', "Tools contributed by {0}", source.label);
	}

	private _toggleCollapsed(toolSetId: string): void {
		const next = new Set(this._expanded.get());
		if (next.has(toolSetId)) {
			next.delete(toolSetId);
		} else {
			next.add(toolSetId);
		}
		this._expanded.set(next, undefined);
	}

	private _currentState(): IToolEnablementState {
		return this._enablementService.getState(this._sessionType);
	}

	/** Resolve the installed, non-builtin extension backing an extension-provided tool set. */
	private _resolveExtensionForToolSet(ts: IToolSet): IExtension | undefined {
		if (ts.source.type !== 'extension') {
			return undefined;
		}
		const source = ts.source;
		const extension = this._extensionsWorkbenchService.local.find(e => ExtensionIdentifier.equals(e.identifier.id, source.extensionId));
		if (!extension || extension.local?.isBuiltin) {
			return undefined;
		}
		return extension;
	}

	private _showExtensionContextMenu(anchor: HTMLElement | StandardMouseEvent | IAnchor, extension: IExtension): void {
		const disposables = new DisposableStore();
		const uninstallAction = disposables.add(new Action(
			'toolsList.uninstallExtension',
			localize('uninstallExtension', "Uninstall Extension"),
			undefined,
			true,
			() => this._uninstallExtension(extension),
		));
		this._contextMenuService.showContextMenu({
			getAnchor: () => anchor,
			getActions: () => [uninstallAction],
			onHide: () => disposables.dispose(),
		});
	}

	private async _uninstallExtension(extension: IExtension): Promise<void> {
		const result = await this._dialogService.confirm({
			message: localize('confirmUninstallToolExtension', "Do you want to uninstall the extension '{0}'?", extension.displayName),
			detail: localize('confirmUninstallToolExtensionDetail', "This extension may contribute more than tools. Uninstalling it removes all of its contributions."),
			primaryButton: localize('uninstallExtensionBtn', "Uninstall Extension"),
			type: 'question',
		});
		if (result.confirmed) {
			await this._extensionsWorkbenchService.uninstall(extension);
		}
	}
}

/**
 * The Copilot CLI's built-in tools, surfaced read-only for reference. Mirrored from the published
 * "Tool availability values" table (the SDK does not expose this list at runtime); keep in sync:
 * https://docs.github.com/en/copilot/reference/copilot-cli-reference/cli-command-reference#tool-availability-values
 */
const COPILOT_CLI_TOOLS: readonly { readonly name: string; readonly description: string }[] = [
	// Shell tools
	{ name: 'bash / powershell', description: localize('copilotCliTool.shell', "Execute commands") },
	{ name: 'list_bash / list_powershell', description: localize('copilotCliTool.listShell', "List active shell sessions") },
	{ name: 'read_bash / read_powershell', description: localize('copilotCliTool.readShell', "Read output from a shell session") },
	{ name: 'stop_bash / stop_powershell', description: localize('copilotCliTool.stopShell', "Terminate a shell session") },
	{ name: 'write_bash / write_powershell', description: localize('copilotCliTool.writeShell', "Send input to a shell session") },
	// File operation tools
	{ name: 'apply_patch', description: localize('copilotCliTool.applyPatch', "Apply patches (used by some models instead of edit/create)") },
	{ name: 'create', description: localize('copilotCliTool.create', "Create new files") },
	{ name: 'edit', description: localize('copilotCliTool.edit', "Edit files via string replacement") },
	{ name: 'view', description: localize('copilotCliTool.view', "Read files or directories") },
	// Agent and task delegation tools
	{ name: 'list_agents', description: localize('copilotCliTool.listAgents', "List available agents") },
	{ name: 'read_agent', description: localize('copilotCliTool.readAgent', "Check background agent status") },
	{ name: 'task', description: localize('copilotCliTool.task', "Run subagents") },
	// Other tools
	{ name: 'ask_user', description: localize('copilotCliTool.askUser', "Ask the user a question") },
	{ name: 'glob', description: localize('copilotCliTool.glob', "Find files matching patterns") },
	{ name: 'grep (or rg)', description: localize('copilotCliTool.grep', "Search for text in files") },
	{ name: 'skill', description: localize('copilotCliTool.skill', "Invoke custom skills") },
	{ name: 'web_fetch', description: localize('copilotCliTool.webFetch', "Fetch and parse web content") },
];

const CUSTOM_TOOL_SET_ORDER: Record<string, number> = {
	'copilot-cli': 0,
	'vscode-general': 1,
	'vscode-tasks': 2,
	'vscode-browser': 3,
	'vscode-notebooks': 4,
};

function sortKey(toolSet: IToolSet): string {
	const sourcePriority = toolSet.source.type === 'internal' ? '0' : '1';
	const order = CUSTOM_TOOL_SET_ORDER[toolSet.id];
	const orderKey = order !== undefined ? String(order) : `9-${toolSet.description ?? toolSet.referenceName}`;
	return `${sourcePriority}-${orderKey}`;
}
