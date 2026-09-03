/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as DOM from '../../../../../base/browser/dom.js';
import { IKeyboardEvent } from '../../../../../base/browser/keyboardEvent.js';
import { Button } from '../../../../../base/browser/ui/button/button.js';
import { HighlightedLabel } from '../../../../../base/browser/ui/highlightedlabel/highlightedLabel.js';
import { InputBox } from '../../../../../base/browser/ui/inputbox/inputBox.js';
import { IListContextMenuEvent, IListRenderer, IListVirtualDelegate } from '../../../../../base/browser/ui/list/list.js';
import { DomScrollableElement } from '../../../../../base/browser/ui/scrollbar/scrollableElement.js';
import { Checkbox, TriStateCheckbox } from '../../../../../base/browser/ui/toggle/toggle.js';
import { StandardMouseEvent } from '../../../../../base/browser/mouseEvent.js';
import { IAnchor } from '../../../../../base/browser/ui/contextview/contextview.js';
import { Action } from '../../../../../base/common/actions.js';
import { Delayer } from '../../../../../base/common/async.js';
import { CancellationToken, CancellationTokenSource } from '../../../../../base/common/cancellation.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { Emitter } from '../../../../../base/common/event.js';
import { IMatch, matchesContiguousSubString } from '../../../../../base/common/filters.js';
import { KeyCode } from '../../../../../base/common/keyCodes.js';
import { Disposable, DisposableStore, MutableDisposable, toDisposable } from '../../../../../base/common/lifecycle.js';
import { autorun, derived, IObservable, IReader, observableSignalFromEvent, observableValue } from '../../../../../base/common/observable.js';
import { ScrollbarVisibility } from '../../../../../base/common/scrollable.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { URI } from '../../../../../base/common/uri.js';
import { localize } from '../../../../../nls.js';
import { ExtensionIdentifier } from '../../../../../platform/extensions/common/extensions.js';
import { IContextMenuService, IContextViewService } from '../../../../../platform/contextview/browser/contextView.js';
import { IDialogService } from '../../../../../platform/dialogs/common/dialogs.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { WorkbenchList } from '../../../../../platform/list/browser/listService.js';
import { layoutVirtualizedSectionList, layoutVirtualizedSections, setupCollapsibleSection } from './customizationCardList.js';
import { IOpenerService } from '../../../../../platform/opener/common/opener.js';
import { defaultButtonStyles, defaultCheckboxStyles, defaultInputBoxStyles } from '../../../../../platform/theme/browser/defaultStyles.js';
import { IExtensionManifestPropertiesService } from '../../../../services/extensions/common/extensionManifestPropertiesService.js';
import { IWorkbenchEnvironmentService } from '../../../../services/environment/common/environmentService.js';
import { ExtensionState, IExtension, IExtensionsWorkbenchService } from '../../../extensions/common/extensions.js';
import { GalleryItemInstallState, GalleryItemRenderer, IGalleryItemProvider } from './galleryItemRenderer.js';
import { ILanguageModelToolsService, IToolData, IToolSet, ToolDataSource } from '../../common/tools/languageModelToolsService.js';
import { countEnabledCustomizationTools, getToolSetTriState, IAgentHostToolSetEnablementService, isToolEnabledInSet, IToolEnablementState } from '../agentSessions/agentHost/agentHostToolSetEnablementService.js';
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
	readonly kind: 'set';
	readonly vm: IToolSetViewModel;
}

interface IToolsToolRowEntry {
	readonly kind: 'tool';
	readonly setVm: IToolSetViewModel;
	readonly toolVm: IToolViewModel;
}

type IToolsRowEntry = IToolsSetRowEntry | IToolsToolRowEntry;

/** One section (Built-in / Connected / Extension) rendered as its own virtualized `WorkbenchList`. */
interface IToolsSectionList {
	readonly list: WorkbenchList<IToolsRowEntry>;
	/** Flattened rows currently spliced into {@link list}; reassigned (not mutated) on refresh. */
	entries: readonly IToolsRowEntry[];
	/** Stable set view models backing this section, used to recompute {@link entries} on expand/collapse. */
	readonly setVms: readonly IToolSetViewModel[];
	readonly container: HTMLElement;
	readonly label: string;
}

const TOOLS_SET_ROW_TEMPLATE_ID = 'toolsSetRow';
const TOOLS_TOOL_ROW_TEMPLATE_ID = 'toolsToolRow';
// Row heights derived from the fixed single-line label/subtext CSS plus each row kind's vertical padding.
const TOOLS_SET_ROW_PADDING = 16; // --vscode-spacing-size80 (8px) top + bottom
const TOOLS_TOOL_ROW_PADDING = 12; // --vscode-spacing-size60 (6px) top + bottom
const TOOLS_ROW_LABEL_HEIGHT = 18;
const TOOLS_ROW_SUBTEXT_HEIGHT = 14;
/** Caps a section's own scroll viewport height; sections with more content scroll internally. */
const TOOLS_SECTION_MAX_HEIGHT = 320;

function computeToolsRowHeight(entry: IToolsRowEntry): number {
	if (entry.kind === 'set') {
		return TOOLS_SET_ROW_PADDING + TOOLS_ROW_LABEL_HEIGHT + (entry.vm.detail ? TOOLS_ROW_SUBTEXT_HEIGHT : 0);
	}
	const description = entry.toolVm.tool.userDescription ?? entry.toolVm.tool.modelDescription;
	return TOOLS_TOOL_ROW_PADDING + TOOLS_ROW_LABEL_HEIGHT + (description ? TOOLS_ROW_SUBTEXT_HEIGHT : 0);
}

class ToolsRowDelegate implements IListVirtualDelegate<IToolsRowEntry> {
	getHeight(entry: IToolsRowEntry): number {
		return computeToolsRowHeight(entry);
	}
	getTemplateId(entry: IToolsRowEntry): string {
		return entry.kind === 'set' ? TOOLS_SET_ROW_TEMPLATE_ID : TOOLS_TOOL_ROW_TEMPLATE_ID;
	}
}

interface IToolsSetRowTemplateData {
	readonly container: HTMLElement;
	readonly checkbox: TriStateCheckbox;
	readonly label: HighlightedLabel;
	readonly subtext: HTMLElement;
	readonly count: HTMLElement;
	readonly alwaysAvailable: HTMLElement;
	readonly moreButton: HTMLButtonElement;
	readonly chevron: HTMLElement;
	readonly templateDisposables: DisposableStore;
	readonly elementDisposables: DisposableStore;
	currentIndex: number;
}

/** Renders a tool-set header row: checkbox/tri-state, name + detail, enabled count, more actions, chevron. */
class ToolsSetRowRenderer implements IListRenderer<IToolsSetRowEntry, IToolsSetRowTemplateData> {
	readonly templateId = TOOLS_SET_ROW_TEMPLATE_ID;
	private readonly _templates = new Set<IToolsSetRowTemplateData>();
	private _focusedIndex = -1;

	constructor(
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

		const checkbox = templateDisposables.add(new TriStateCheckbox('', false, defaultCheckboxStyles));
		checkbox.domNode.tabIndex = -1;
		container.appendChild(checkbox.domNode);
		templateDisposables.add(DOM.addDisposableGenericMouseDownListener(checkbox.domNode, event => DOM.EventHelper.stop(event, true)));

		const main = DOM.append(container, $('.tools-list-row-main'));
		const text = DOM.append(main, $('.tools-list-row-text'));
		const labelEl = DOM.append(text, $('span.tools-list-row-label'));
		const label = templateDisposables.add(new HighlightedLabel(labelEl));
		const subtext = DOM.append(text, $('span.tools-list-row-subtext'));

		const count = DOM.append(container, $('span.tools-list-row-count'));
		const alwaysAvailable = DOM.append(container, $('span.tools-list-always-available'));
		alwaysAvailable.textContent = localize('toolsAlwaysAvailable', "Always Available");

		const moreButton = DOM.append(container, $('button.tools-list-more-action')) as HTMLButtonElement;
		moreButton.type = 'button';
		moreButton.tabIndex = -1;
		moreButton.classList.add(...ThemeIcon.asClassNameArray(Codicon.ellipsis));
		templateDisposables.add(DOM.addDisposableGenericMouseDownListener(moreButton, event => DOM.EventHelper.stop(event, true)));

		const chevron = DOM.append(container, $('a.tools-list-chevron.codicon')) as HTMLAnchorElement;
		chevron.setAttribute('aria-hidden', 'true');

		const template = { container, checkbox, label, subtext, count, alwaysAvailable, moreButton, chevron, templateDisposables, elementDisposables: templateDisposables.add(new DisposableStore()), currentIndex: -1 };
		this._templates.add(template);
		return template;
	}

	renderElement(entry: IToolsSetRowEntry, index: number, data: IToolsSetRowTemplateData): void {
		data.elementDisposables.clear();
		data.currentIndex = index;
		data.container.removeAttribute('aria-selected');
		const vm = entry.vm;
		const ts = vm.toolSet;
		const setName = ts.description ?? ts.referenceName;

		data.label.set(setName, vm.nameMatches);
		data.subtext.style.display = vm.detail ? '' : 'none';
		data.subtext.textContent = vm.detail ?? '';
		data.alwaysAvailable.style.display = vm.readOnly ? '' : 'none';
		data.checkbox.domNode.style.display = vm.readOnly ? 'none' : '';

		if (!vm.readOnly) {
			data.checkbox.setTitle(localize('toolsSetCheckbox', "Enable {0}", setName));
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
		data.moreButton.tabIndex = extension && index === this._focusedIndex ? 0 : -1;
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

	setFocusedIndex(index: number): void {
		this._focusedIndex = index;
		for (const template of this._templates) {
			template.moreButton.tabIndex = template.moreButton.style.display !== 'none' && template.currentIndex === index ? 0 : -1;
		}
	}

	disposeTemplate(data: IToolsSetRowTemplateData): void {
		this._templates.delete(data);
		data.templateDisposables.dispose();
	}
}

interface IToolsToolRowTemplateData {
	readonly container: HTMLElement;
	readonly checkbox: Checkbox;
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
		private readonly _sessionType: string,
		private readonly _enablementService: IAgentHostToolSetEnablementService,
	) { }

	renderTemplate(container: HTMLElement): IToolsToolRowTemplateData {
		container.classList.add('tools-list-toolrow');
		const templateDisposables = new DisposableStore();

		const checkbox = templateDisposables.add(new Checkbox('', false, defaultCheckboxStyles));
		checkbox.domNode.tabIndex = -1;
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
			data.checkbox.setTitle(localize('toolsToolCheckbox', "Enable {0}", toolName));
			data.elementDisposables.add(data.checkbox.onChange(() => {
				this._enablementService.setToolEnabled(this._sessionType, setVm.toolSet.id, tool.id, data.checkbox.checked);
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
 * Marketplace search used when browsing for tool-contributing extensions. The marketplace cannot
 * be filtered server-side by contributed feature, so this is a text query.
 */
const TOOLS_MARKETPLACE_QUERY = 'language model tools';

const TOOLS_GALLERY_ITEM_HEIGHT = 62;

const TOOLS_GALLERY_ITEM_TEMPLATE_ID = 'toolsGalleryItem';

class ToolsGalleryItemDelegate implements IListVirtualDelegate<IExtension> {
	getHeight(): number { return TOOLS_GALLERY_ITEM_HEIGHT; }
	getTemplateId(): string { return TOOLS_GALLERY_ITEM_TEMPLATE_ID; }
}

/** Adapts an extension from the gallery to the shared gallery row renderer. */
class ToolsGalleryItemProvider implements IGalleryItemProvider<IExtension> {

	constructor(private readonly _extensionsWorkbenchService: IExtensionsWorkbenchService) { }

	getLabel(extension: IExtension): string {
		return extension.displayName;
	}

	getPublisherDisplayName(extension: IExtension): string | undefined {
		return extension.publisherDisplayName;
	}

	getDescription(extension: IExtension): string | undefined {
		return extension.description;
	}

	getInstallState(extension: IExtension): GalleryItemInstallState {
		switch (extension.state) {
			case ExtensionState.Installed: return GalleryItemInstallState.Installed;
			case ExtensionState.Installing: return GalleryItemInstallState.Installing;
			default: return GalleryItemInstallState.Uninstalled;
		}
	}

	async install(extension: IExtension): Promise<void> {
		await this._extensionsWorkbenchService.install(extension);
	}

	onDidChangeInstallState(extension: IExtension, listener: () => void) {
		return this._extensionsWorkbenchService.onChange(changed => {
			if (!changed || changed.identifier.id === extension.identifier.id) {
				listener();
			}
		});
	}
}

/**
 * Chat Customizations → Tools: a searchable, collapsible tree of tool sets and their member
 * tools. Enablement is read/written via {@link IAgentHostToolSetEnablementService}, scoped to
 * `sessionType` (the agent host is the only target for Tools customizations).
 */
export class ToolsListWidget extends Disposable {

	readonly element: HTMLElement;

	private readonly _onDidChangeItemCount = this._register(new Emitter<number>());
	readonly onDidChangeItemCount = this._onDidChangeItemCount.event;

	private readonly _onDidSelectExtension = this._register(new Emitter<IExtension>());
	readonly onDidSelectExtension = this._onDidSelectExtension.event;

	private readonly _rowStore = this._register(new DisposableStore());
	private readonly _pendingSectionLayout = this._register(new MutableDisposable());
	private readonly _searchQuery = observableValue<string>('toolsSearchQuery', '');
	private readonly _expanded = observableValue<ReadonlySet<string>>('toolsExpanded', new Set());
	private readonly _delayedSearch = this._register(new Delayer<void>(200));

	private _searchInput!: InputBox;
	private _header!: HTMLElement;
	private _searchRow!: HTMLElement;
	private _treeContainer!: HTMLElement;
	private _treeScrollable!: DomScrollableElement;
	private _backButtonContainer!: HTMLElement;
	private _galleryContainer!: HTMLElement;
	private _galleryEmpty!: HTMLElement;
	private _galleryListContainer!: HTMLElement;
	private _galleryList!: WorkbenchList<IExtension>;

	private _lastCount = -1;
	private _browseMode = false;
	private _galleryCts: CancellationTokenSource | undefined;
	private _lastHeight = 0;
	private _lastWidth = 0;

	private _sectionLists: IToolsSectionList[] = [];
	private _collapsedSections: Set<string> | undefined = new Set<string>();
	private readonly _sectionScrollPositions = new Map<string, number>();

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
		@IExtensionManifestPropertiesService private readonly _extensionManifestPropertiesService: IExtensionManifestPropertiesService,
		@IWorkbenchEnvironmentService private readonly _environmentService: IWorkbenchEnvironmentService,
	) {
		super();

		this._staticReadOnlySets = this._createStaticReadOnlySets();

		this.element = $('.tools-list-widget');
		this._createHeader();
		this._createSearchRow();

		// Wrap the tree in a DomScrollableElement for an overlay scrollbar (not the native one).
		this._treeContainer = $('.tools-list-tree');
		this._treeContainer.classList.add('distributed-section-layout');
		this._treeScrollable = this._register(new DomScrollableElement(this._treeContainer, {
			horizontal: ScrollbarVisibility.Hidden,
			vertical: ScrollbarVisibility.Auto,
			useShadows: false,
		}));
		const treeScrollableNode = this._treeScrollable.getDomNode();
		treeScrollableNode.classList.add('tools-list-tree-scrollable');
		this.element.appendChild(treeScrollableNode);

		this._createGallery();
		this._register(toDisposable(() => this._galleryCts?.dispose(true)));

		const viewModel = this._createViewModel();
		this._register(autorun(reader => {
			this._render(viewModel.read(reader));
		}));

		// Expand/collapse never rebuilds the DOM; it only re-splices the affected section's rows in place.
		this._register(autorun(reader => {
			this._expanded.read(reader);
			this._refreshAllSectionEntries();
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
				if (this._browseMode) {
					void this._queryGallery();
				} else {
					this._searchQuery.set(this._searchInput.value, undefined);
				}
			}).catch(() => { /* delayer disposed */ });
		}));

		const backLabel = localize('toolsBrowseBack', "Back");
		this._backButtonContainer = DOM.append(this._searchRow, $('.tools-list-browse-button-container'));
		this._backButtonContainer.style.display = 'none';
		const backButton = this._register(new Button(this._backButtonContainer, { ...defaultButtonStyles, secondary: true, supportIcons: true, title: backLabel, ariaLabel: backLabel }));
		backButton.label = `$(${Codicon.arrowLeft.id}) ${backLabel}`;
		this._register(backButton.onDidClick(() => this._setBrowseMode(false)));
	}

	private _createGallery(): void {
		this._galleryContainer = DOM.append(this.element, $('.tools-gallery-container'));
		this._galleryContainer.style.display = 'none';
		const header = DOM.append(this._galleryContainer, $('.tools-marketplace-header'));
		DOM.append(header, $('h3.tools-marketplace-title')).textContent = localize('toolsMarketplaceTitle', "Marketplace Tools");
		DOM.append(header, $('p.tools-marketplace-description')).textContent = localize('toolsMarketplaceDescription', "Install extensions that contribute additional tools.");
		this._galleryEmpty = DOM.append(this._galleryContainer, $('.list-empty-state'));
		this._galleryEmpty.style.display = 'none';
		this._galleryListContainer = DOM.append(this._galleryContainer, $('.tools-gallery-list'));
		this._galleryList = this._register(this._instantiationService.createInstance(
			WorkbenchList<IExtension>,
			'ToolsMarketplaceList',
			this._galleryListContainer,
			new ToolsGalleryItemDelegate(),
			[new GalleryItemRenderer<IExtension>(TOOLS_GALLERY_ITEM_TEMPLATE_ID, new ToolsGalleryItemProvider(this._extensionsWorkbenchService))],
			{
				multipleSelectionSupport: false,
				horizontalScrolling: false,
				accessibilityProvider: {
					getAriaLabel: (extension: IExtension) => extension.displayName,
					getWidgetAriaLabel: () => localize('toolsMarketplaceAria', "Tool extensions"),
				},
				identityProvider: { getId: (extension: IExtension) => extension.identifier.id },
			},
		)) as WorkbenchList<IExtension>;

		this._register(this._galleryList.onDidOpen(e => {
			if (e.element) {
				this._onDidSelectExtension.fire(e.element);
			}
		}));

		this._register(this._galleryList.onContextMenu(e => this._onGalleryContextMenu(e)));
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
		this.element.classList.toggle('narrow-layout', width < 500);
		this._searchInput.layout();
		this._scheduleSectionListLayout();

		const galleryOffset = this._galleryContainer.getBoundingClientRect().top - this.element.getBoundingClientRect().top;
		this._galleryList.layout(Math.max(0, height - galleryOffset), width);
	}

	/** Enters/leaves marketplace browse mode, swapping the tree for the gallery list. */
	private _setBrowseMode(browse: boolean): void {
		if (browse && this._environmentService.isSessionsWindow) {
			return;
		}
		if (this._browseMode === browse) {
			return;
		}
		this._browseMode = browse;

		this._treeScrollable.getDomNode().style.display = browse ? 'none' : '';
		this._galleryContainer.style.display = browse ? '' : 'none';
		this._backButtonContainer.style.display = browse ? '' : 'none';

		this._searchInput.setPlaceHolder(browse
			? localize('toolsBrowsePlaceholder', "Search the Marketplace...")
			: localize('searchPlaceholder', "Type to search..."));
		this._searchInput.value = '';

		if (browse) {
			void this._queryGallery();
		} else {
			this._galleryCts?.dispose(true);
			this._galleryCts = undefined;
			this._galleryList.splice(0, this._galleryList.length, []);
			this._searchQuery.set('', undefined);
		}

		this._searchInput.focus();
		if (this._lastHeight > 0) {
			this.layout(this._lastHeight, this._lastWidth);
		}
	}

	/** Queries the Extensions gallery for tool-contributing extensions. */
	private async _queryGallery(): Promise<void> {
		this._galleryCts?.dispose(true);
		const cts = this._galleryCts = new CancellationTokenSource();

		const userText = this._searchInput.value.trim();
		const text = userText ? `${TOOLS_MARKETPLACE_QUERY} ${userText}` : TOOLS_MARKETPLACE_QUERY;

		this._setGalleryMessage(localize('toolsBrowseLoading', "Loading marketplace..."));
		try {
			const pager = await this._extensionsWorkbenchService.queryGallery({ text }, cts.token);
			if (cts.token.isCancellationRequested) {
				return;
			}
			const items = pager.firstPage;
			const filteredItems = await this._filterGalleryResults(items, cts.token);
			if (cts.token.isCancellationRequested) {
				return;
			}
			if (filteredItems.length === 0) {
				this._setGalleryMessage(
					localize('toolsBrowseNoResults', "No tool extensions match '{0}'", userText || TOOLS_MARKETPLACE_QUERY),
					localize('tryDifferentSearch', "Try a different search term"));
				return;
			}
			this._galleryEmpty.style.display = 'none';
			this._galleryListContainer.style.display = '';
			this._galleryList.splice(0, this._galleryList.length, filteredItems);
		} catch {
			if (!cts.token.isCancellationRequested) {
				this._setGalleryMessage(
					localize('toolsBrowseError', "Unable to load marketplace"),
					localize('toolsBrowseTryAgain', "Check your connection and try again"));
			}
		}
	}

	/**
	 * Keeps only extensions that contribute language model tools and, in the Agents window, can run there
	 * ({@link IExtensionManifestPropertiesService.canExecuteOnSessionsWindow}); the `executesCode` hint skips
	 * manifest fetches for extensions that can never run.
	 */
	private async _filterGalleryResults(extensions: readonly IExtension[], token: CancellationToken): Promise<IExtension[]> {
		const requireAgentsWindowSupport = this._environmentService.isSessionsWindow;
		const results = await Promise.all(extensions.map(async extension => {
			// In the Agents window, code-executing extensions can never run: reject before fetching the manifest.
			if (requireAgentsWindowSupport && extension.gallery?.properties.executesCode) {
				return undefined;
			}
			try {
				const manifest = await extension.getManifest(token);
				if (!manifest?.contributes?.languageModelTools?.length) {
					return undefined;
				}
				if (requireAgentsWindowSupport && !this._extensionManifestPropertiesService.canExecuteOnSessionsWindow(manifest)) {
					return undefined;
				}
				return extension;
			} catch {
				// Ignore extensions whose manifest cannot be resolved.
				return undefined;
			}
		}));
		return results.filter((extension): extension is IExtension => !!extension);
	}

	private _setGalleryMessage(text: string, subtext?: string): void {
		// Drop any stale rows so only the message shows.
		this._galleryList.splice(0, this._galleryList.length, []);
		this._galleryListContainer.style.display = 'none';
		DOM.clearNode(this._galleryEmpty);
		this._galleryEmpty.style.display = 'flex';
		const header = DOM.append(this._galleryEmpty, $('.empty-state-header'));
		DOM.append(header, $('.empty-state-text')).textContent = text;
		if (subtext) {
			DOM.append(this._galleryEmpty, $('.empty-state-subtext')).textContent = subtext;
		}
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
		// A live update (search/tool-set change) rebuilds sections; keep keyboard focus if it was in the tree.
		const focusedSection = this._sectionLists.find(s => DOM.isAncestor(this._treeContainer.ownerDocument.activeElement, s.container));
		const focusedRowId = focusedSection ? this._currentFocusedRowId(focusedSection) : undefined;
		for (const section of this._sectionLists) {
			this._sectionScrollPositions.set(section.label, section.list.scrollTop);
		}

		this._rowStore.clear();
		this._sectionLists = [];
		DOM.clearNode(this._treeContainer);

		const query = this._searchQuery.get().trim();
		if (model.length === 0 && query) {
			const emptyState = DOM.append(this._treeContainer, $('.list-empty-state'));
			const header = DOM.append(emptyState, $('.empty-state-header'));
			const text = DOM.append(header, $('.empty-state-text'));
			const subtext = DOM.append(emptyState, $('.empty-state-subtext'));
			text.textContent = localize('noMatchingTools', "No tools match '{0}'", query);
			subtext.textContent = localize('tryDifferentSearch', "Try a different search term");
			this._treeScrollable.scanDomNode();
			return;
		}

		const builtIn = model.filter(vm => vm.toolSet.source.type === 'internal' || vm.toolSet.source.type === 'external');
		const connected = model.filter(vm => vm.toolSet.source.type === 'mcp' || vm.toolSet.source.type === 'user');
		const installed = model.filter(vm => vm.toolSet.source.type === 'extension');
		this._renderToolSection(
			localize('builtInToolsSection', "Built-in Tools"),
			localize('builtInToolsSectionDescription', "Tools provided by the active agent and VS Code."),
			localize('builtInToolsSectionEmpty', "No built-in tool sets are available."),
			builtIn,
			query,
		);
		this._renderToolSection(
			localize('connectedToolsSection', "Connected Sources"),
			localize('connectedToolsSectionDescription', "Tool sets provided by MCP servers and user configuration."),
			localize('connectedToolsSectionEmpty', "No connected tool sources are available."),
			connected,
			query,
			undefined,
			false,
		);
		this._renderToolSection(
			localize('installedToolExtensionsSection', "Extension Tools"),
			localize('installedToolExtensionsSectionDescription', "Tool sets contributed by installed extensions."),
			localize('extensionToolsSectionEmpty', "No extension tools are installed."),
			installed,
			query,
			!this._environmentService.isSessionsWindow ? sectionHeader => {
				const actions = DOM.append(sectionHeader, $('.tools-inventory-section-actions'));
				const browseLabel = localize('toolsBrowseMarketplace', "Browse Marketplace");
				const browseButton = this._rowStore.add(new Button(actions, { ...defaultButtonStyles, secondary: true, supportIcons: true, title: browseLabel, ariaLabel: browseLabel }));
				browseButton.label = `$(${Codicon.library.id}) ${browseLabel}`;
				this._rowStore.add(browseButton.onDidClick(() => this._setBrowseMode(true)));
			} : undefined,
		);

		this._scheduleSectionListLayout();
		if (focusedRowId) {
			this._restoreFocus(focusedRowId);
		}
	}

	private _renderToolSection(
		title: string,
		description: string,
		emptyMessage: string,
		model: readonly IToolSetViewModel[],
		query: string,
		renderActions?: (header: HTMLElement) => void,
		showWhenEmpty = true,
	): void {
		if (model.length === 0 && (query || !showWhenEmpty)) {
			return;
		}
		const section = DOM.append(this._treeContainer, $('.tools-inventory-section'));
		const header = DOM.append(section, $('.tools-inventory-section-header'));
		const text = DOM.append(header, $('.tools-inventory-section-text'));
		const headingRow = DOM.append(text, $('.tools-inventory-section-heading-row'));
		DOM.append(headingRow, $('h3.tools-inventory-section-title')).textContent = title;
		DOM.append(headingRow, $('span.tools-inventory-section-count')).textContent = String(model.length);
		DOM.append(text, $('p.tools-inventory-section-description')).textContent = description;
		renderActions?.(header);

		let inventory: HTMLElement;
		if (model.length === 0) {
			inventory = DOM.append(section, $('.tools-inventory-list'));
			DOM.append(inventory, $('.plugin-inventory-empty')).textContent = emptyMessage;
		} else {
			inventory = this._createToolsSectionList(section, title, model).container;
		}
		const collapsedSections = this._collapsedSections ??= new Set<string>();
		setupCollapsibleSection(
			headingRow,
			inventory,
			title,
			this._rowStore,
			collapsedSections.has(title),
			collapsed => {
				if (collapsed) {
					collapsedSections.add(title);
				} else {
					collapsedSections.delete(title);
				}
				this._scheduleSectionListLayout();
			},
		);
	}

	/** Creates one virtualized `WorkbenchList` for a section, flattening its sets/tools into rows. */
	private _createToolsSectionList(sectionEl: HTMLElement, label: string, setVms: readonly IToolSetViewModel[]): IToolsSectionList {
		const listContainer = DOM.append(sectionEl, $('.tools-inventory-list'));

		const setRenderer = new ToolsSetRowRenderer(
			this._sessionType,
			this._enablementService,
			(vm, reader) => vm.forceExpanded || this._expanded.read(reader).has(vm.toolSet.id),
			setId => this._toggleCollapsed(setId),
			ts => this._resolveExtensionForToolSet(ts),
			(anchor, extension) => this._showExtensionContextMenu(anchor, extension),
		);
		const list = this._rowStore.add(this._instantiationService.createInstance(
			WorkbenchList<IToolsRowEntry>,
			'ToolsSectionList',
			listContainer,
			new ToolsRowDelegate(),
			[
				setRenderer,
				new ToolsToolRowRenderer(this._sessionType, this._enablementService),
			],
			{
				multipleSelectionSupport: false,
				horizontalScrolling: false,
				accessibilityProvider: {
					getWidgetAriaLabel: () => label,
					getWidgetRole: () => 'tree',
					getRole: () => 'treeitem',
					getAriaLevel: (entry: IToolsRowEntry) => entry.kind === 'set' ? 1 : 2,
					// Rows carry no explicit aria-label, same as the original DOM tree: assistive tech
					// derives the accessible name from each row's own label/subtext/count text content.
					getAriaLabel: () => null,
				},
				identityProvider: { getId: (entry: IToolsRowEntry) => this._entryRowId(entry) },
			},
		)) as WorkbenchList<IToolsRowEntry>;

		const section: IToolsSectionList = {
			list,
			entries: this._computeSectionEntries(setVms),
			setVms,
			container: listContainer,
			label,
		};
		if (section.entries.length > 0) {
			listContainer.style.height = `${computeToolsRowHeight(section.entries[0])}px`;
		}
		list.splice(0, list.length, section.entries as IToolsRowEntry[]);
		list.scrollTop = this._sectionScrollPositions.get(label) ?? 0;
		this._rowStore.add(list.onDidChangeSelection(event => {
			if (event.indexes.length > 0) {
				list.setSelection([]);
			}
		}));
		this._rowStore.add(list.onDidChangeFocus(event => setRenderer.setFocusedIndex(event.indexes[0] ?? -1)));

		// Captured (via a capture-phase listener on an ancestor of the list, so it runs strictly before
		// the list's own bubble-phase key handler) so Up/Down at a section's edge can be told apart from
		// a normal in-section move that merely lands on the edge.
		let focusBeforeKeyDown: number | undefined;
		this._rowStore.add(DOM.addStandardDisposableListener(listContainer, DOM.EventType.KEY_DOWN, () => {
			focusBeforeKeyDown = list.getFocus()[0];
		}, true));
		// Registered after `createInstance` above, so on the list's own DOM node this listener runs
		// after the list's internal keyboard controller (same-node listeners fire in registration order).
		// This lets Up/Down/Enter/PageUp/PageDown/Escape/Ctrl+A keep working exactly as List implements
		// them; only the keys List does not handle (Space/Left/Right/Home/End) are handled here.
		this._rowStore.add(DOM.addStandardDisposableListener(list.getHTMLElement(), DOM.EventType.KEY_DOWN, e => {
			this._onSectionKeyDown(section, e, () => focusBeforeKeyDown);
		}));

		this._sectionLists.push(section);
		return section;
	}

	/** Flattens a section's tool sets into rows, expanding each set's tools when the set is expanded. */
	private _computeSectionEntries(setVms: readonly IToolSetViewModel[]): IToolsRowEntry[] {
		const entries: IToolsRowEntry[] = [];
		for (const vm of setVms) {
			entries.push({ kind: 'set', vm });
			if (this._isRowExpanded(vm)) {
				for (const toolVm of vm.visibleTools) {
					entries.push({ kind: 'tool', setVm: vm, toolVm });
				}
			}
		}
		return entries;
	}

	private _isRowExpanded(vm: IToolSetViewModel): boolean {
		return vm.forceExpanded || this._expanded.get().has(vm.toolSet.id);
	}

	private _entryRowId(entry: IToolsRowEntry): string {
		return entry.kind === 'set' ? `set:${entry.vm.toolSet.id}` : `tool:${entry.setVm.toolSet.id}:${entry.toolVm.tool.id}`;
	}

	private _currentFocusedRowId(section: IToolsSectionList): string | undefined {
		const index = section.list.getFocus()[0];
		const entry = index !== undefined ? section.entries[index] : undefined;
		return entry ? this._entryRowId(entry) : undefined;
	}

	/** Re-splices every section's rows in place (no DOM teardown) after an `_expanded` state change. */
	private _refreshAllSectionEntries(): void {
		for (const section of this._sectionLists) {
			this._refreshSectionEntries(section);
		}
	}

	private _refreshSectionEntries(section: IToolsSectionList): void {
		const focusedRowId = this._currentFocusedRowId(section);
		const nextEntries = this._computeSectionEntries(section.setVms);
		section.entries = nextEntries;
		section.list.splice(0, section.list.length, nextEntries as IToolsRowEntry[]);
		if (focusedRowId) {
			const index = nextEntries.findIndex(e => this._entryRowId(e) === focusedRowId);
			if (index !== -1) {
				section.list.setFocus([index]);
				section.list.domFocus();
			}
		}
		this._scheduleSectionListLayout();
	}

	/** Restore keyboard focus to a row by its stable id after a full re-render, falling back to the first row. */
	private _restoreFocus(rowId: string): void {
		for (const section of this._sectionLists) {
			if (section.container.hidden) {
				continue;
			}
			const index = section.entries.findIndex(e => this._entryRowId(e) === rowId);
			if (index !== -1) {
				section.list.setFocus([index]);
				section.list.reveal(index);
				section.list.domFocus();
				return;
			}
		}
		this._focusFirstOverall();
	}

	private _layoutSectionLists(): void {
		const heights = layoutVirtualizedSections(this._treeContainer, this._sectionLists.map(section => ({
			container: section.container,
			contentHeight: section.entries.reduce((sum, entry) => sum + computeToolsRowHeight(entry), 0),
			minimumHeight: section.entries.length > 0 ? computeToolsRowHeight(section.entries[0]) : 0,
		})));
		for (let index = 0; index < this._sectionLists.length; index++) {
			this._layoutSection(this._sectionLists[index], heights[index]);
		}
	}

	private _scheduleSectionListLayout(): void {
		this._pendingSectionLayout.value = DOM.scheduleAtNextAnimationFrame(DOM.getWindow(this.element), () => {
			this._layoutSectionLists();
			this._treeScrollable.scanDomNode();
		});
	}

	private _layoutSection(section: IToolsSectionList, allocatedHeight?: number): void {
		const contentHeight = section.entries.reduce((sum, e) => sum + computeToolsRowHeight(e), 0);
		const height = allocatedHeight ?? Math.min(contentHeight, TOOLS_SECTION_MAX_HEIGHT);
		layoutVirtualizedSectionList(section.list, section.container, height, section.container.clientWidth || this._lastWidth || undefined);
	}

	// --- Tree keyboard navigation (supplemental to WorkbenchList's own Up/Down/Enter/PageUp/PageDown/Escape) ---

	private _onSectionKeyDown(section: IToolsSectionList, e: IKeyboardEvent, getFocusBeforeKeyDown: () => number | undefined): void {
		const entries = section.entries;
		if (entries.length === 0) {
			return;
		}
		const focusIndex = section.list.getFocus()[0];
		const entry = entries[focusIndex ?? 0];
		let handled = true;
		switch (e.keyCode) {
			case KeyCode.DownArrow: {
				const before = getFocusBeforeKeyDown();
				handled = before !== undefined && before === entries.length - 1;
				if (handled) {
					this._focusAdjacentSection(section, 1);
				}
				break;
			}
			case KeyCode.UpArrow: {
				const before = getFocusBeforeKeyDown();
				handled = before !== undefined && before === 0;
				if (handled) {
					this._focusAdjacentSection(section, -1);
				}
				break;
			}
			case KeyCode.RightArrow:
				handled = this._onExpandKey(section, entry);
				break;
			case KeyCode.LeftArrow:
				handled = this._onCollapseKey(section, entry);
				break;
			case KeyCode.Home:
				this._focusFirstOverall();
				break;
			case KeyCode.End:
				this._focusLastOverall();
				break;
			case KeyCode.Space:
				this._onActivateKey(entry, false);
				break;
			case KeyCode.Enter:
				this._onActivateKey(entry, true);
				break;
			default:
				handled = false;
		}
		if (handled) {
			e.preventDefault();
			e.stopPropagation();
		}
	}

	/**
	 * Space always toggles enablement (no-op for read-only rows). Enter toggles enablement too, except
	 * on a read-only *set* row, where it expands/collapses instead (a read-only tool row does nothing).
	 * This mirrors the original mouse-vs-keyboard asymmetry, where clicking the row body (not its
	 * checkbox) toggles expand/collapse but Space/Enter on a focused row toggle its checkbox.
	 */
	private _onActivateKey(entry: IToolsRowEntry, viaEnter: boolean): void {
		const readOnly = entry.kind === 'set' ? entry.vm.readOnly : entry.setVm.readOnly;
		if (readOnly) {
			if (viaEnter && entry.kind === 'set') {
				this._toggleCollapsed(entry.vm.toolSet.id);
			}
			return;
		}
		if (entry.kind === 'set') {
			const vm = entry.vm;
			const current = getToolSetTriState(this._currentState(), vm.toolSet.id, vm.allToolIds);
			this._enablementService.setToolSetEnabled(this._sessionType, vm.toolSet.id, vm.allToolIds, current !== true);
		} else {
			const { setVm, toolVm } = entry;
			const current = isToolEnabledInSet(this._currentState(), setVm.toolSet.id, toolVm.tool.id);
			this._enablementService.setToolEnabled(this._sessionType, setVm.toolSet.id, toolVm.tool.id, !current);
		}
	}

	/** Right arrow: expand a collapsed set, or move into its first tool row when already expanded. */
	private _onExpandKey(section: IToolsSectionList, entry: IToolsRowEntry): boolean {
		if (entry.kind !== 'set') {
			return false;
		}
		const vm = entry.vm;
		if (!this._isRowExpanded(vm)) {
			this._setExpanded(vm.toolSet.id, true);
		} else if (vm.visibleTools.length) {
			this._focusEntryInSection(section, `tool:${vm.toolSet.id}:${vm.visibleTools[0].tool.id}`);
		}
		return true;
	}

	/** Left arrow: collapse an expanded set, or move a tool row up to its parent set. */
	private _onCollapseKey(section: IToolsSectionList, entry: IToolsRowEntry): boolean {
		if (entry.kind === 'set') {
			if (this._isRowExpanded(entry.vm)) {
				this._setExpanded(entry.vm.toolSet.id, false);
				return true;
			}
			return false;
		}
		this._focusEntryInSection(section, `set:${entry.setVm.toolSet.id}`);
		return true;
	}

	private _focusEntryInSection(section: IToolsSectionList, rowId: string): void {
		const index = section.entries.findIndex(e => this._entryRowId(e) === rowId);
		if (index === -1) {
			return;
		}
		section.list.setFocus([index]);
		section.list.reveal(index);
		section.list.domFocus();
	}

	/** Crosses into the adjacent section's first/last row when Up/Down hits the current section's edge. */
	private _focusAdjacentSection(from: IToolsSectionList, delta: 1 | -1): void {
		let targetIndex = this._sectionLists.indexOf(from) + delta;
		while (this._sectionLists[targetIndex]?.container.hidden) {
			targetIndex += delta;
		}
		const target = this._sectionLists[targetIndex];
		if (!target) {
			return;
		}
		if (target.entries.length === 0) {
			this._focusAdjacentSection(target, delta);
			return;
		}
		const index = delta === 1 ? 0 : target.entries.length - 1;
		target.list.setFocus([index]);
		target.list.reveal(index);
		target.list.domFocus();
	}

	private _focusFirstOverall(): void {
		const section = this._sectionLists.find(s => !s.container.hidden && s.entries.length > 0);
		if (section) {
			section.list.setFocus([0]);
			section.list.reveal(0);
			section.list.domFocus();
		}
	}

	private _focusLastOverall(): void {
		for (let i = this._sectionLists.length - 1; i >= 0; i--) {
			const section = this._sectionLists[i];
			if (!section.container.hidden && section.entries.length > 0) {
				const index = section.entries.length - 1;
				section.list.setFocus([index]);
				section.list.reveal(index);
				section.list.domFocus();
				return;
			}
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

	private _setExpanded(toolSetId: string, expanded: boolean): void {
		const next = new Set(this._expanded.get());
		if (expanded === next.has(toolSetId)) {
			return;
		}
		if (expanded) {
			next.add(toolSetId);
		} else {
			next.delete(toolSetId);
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

	private _onGalleryContextMenu(e: IListContextMenuEvent<IExtension>): void {
		const extension = e.element;
		if (!extension || extension.state !== ExtensionState.Installed || extension.local?.isBuiltin) {
			return;
		}
		this._showExtensionContextMenu(e.anchor, extension);
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
