/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as DOM from '../../../../../base/browser/dom.js';
import { Button } from '../../../../../base/browser/ui/button/button.js';
import { HighlightedLabel } from '../../../../../base/browser/ui/highlightedlabel/highlightedLabel.js';
import { InputBox } from '../../../../../base/browser/ui/inputbox/inputBox.js';
import { IListVirtualDelegate } from '../../../../../base/browser/ui/list/list.js';
import { DomScrollableElement } from '../../../../../base/browser/ui/scrollbar/scrollableElement.js';
import { Checkbox, TriStateCheckbox } from '../../../../../base/browser/ui/toggle/toggle.js';
import { Delayer } from '../../../../../base/common/async.js';
import { CancellationTokenSource } from '../../../../../base/common/cancellation.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { Emitter } from '../../../../../base/common/event.js';
import { IMatch, matchesContiguousSubString } from '../../../../../base/common/filters.js';
import { Disposable, DisposableStore, toDisposable } from '../../../../../base/common/lifecycle.js';
import { autorun, derived, IObservable, IReader, observableValue } from '../../../../../base/common/observable.js';
import { ScrollbarVisibility } from '../../../../../base/common/scrollable.js';
import { URI } from '../../../../../base/common/uri.js';
import { localize } from '../../../../../nls.js';
import { ExtensionIdentifier } from '../../../../../platform/extensions/common/extensions.js';
import { IContextViewService } from '../../../../../platform/contextview/browser/contextView.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { WorkbenchList } from '../../../../../platform/list/browser/listService.js';
import { IOpenerService } from '../../../../../platform/opener/common/opener.js';
import { defaultButtonStyles, defaultCheckboxStyles, defaultInputBoxStyles } from '../../../../../platform/theme/browser/defaultStyles.js';
import { ExtensionState, IExtension, IExtensionsWorkbenchService } from '../../../extensions/common/extensions.js';
import { GalleryItemInstallState, GalleryItemRenderer, IGalleryItemProvider } from './galleryItemRenderer.js';
import { ILanguageModelToolsService, IToolData, IToolSet, ToolDataSource } from '../../common/tools/languageModelToolsService.js';
import { countEnabledCustomizationTools, getToolSetTriState, IAgentHostToolSetEnablementService, isToolEnabledInSet, IToolEnablementState } from '../agentSessions/agentHost/agentHostToolSetEnablementService.js';
import './media/aiCustomizationManagement.css';

const $ = DOM.$;

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
}

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
	private readonly _searchQuery = observableValue<string>('toolsSearchQuery', '');
	private readonly _expanded = observableValue<ReadonlySet<string>>('toolsExpanded', new Set());
	private readonly _delayedSearch = this._register(new Delayer<void>(200));

	private _searchInput!: InputBox;
	private _header!: HTMLElement;
	private _searchRow!: HTMLElement;
	private _treeContainer!: HTMLElement;
	private _treeScrollable!: DomScrollableElement;
	private _browseButtonContainer!: HTMLElement;
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

	/** Read-only tool sets injected for the current session type (e.g. the Copilot CLI built-ins). */
	private readonly _staticReadOnlySets: readonly IToolSet[];

	constructor(
		private readonly _sessionType: string,
		@ILanguageModelToolsService private readonly _toolsService: ILanguageModelToolsService,
		@IAgentHostToolSetEnablementService private readonly _enablementService: IAgentHostToolSetEnablementService,
		@IContextViewService private readonly _contextViewService: IContextViewService,
		@IOpenerService private readonly _openerService: IOpenerService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@IExtensionsWorkbenchService private readonly _extensionsWorkbenchService: IExtensionsWorkbenchService,
	) {
		super();

		this._staticReadOnlySets = this._createStaticReadOnlySets();

		this.element = $('.tools-list-widget');
		this._createHeader();
		this._createSearchRow();

		// Wrap the tree in a DomScrollableElement for an overlay scrollbar (not the native one).
		this._treeContainer = $('.tools-list-tree');
		this._treeContainer.setAttribute('role', 'group');
		this._treeContainer.setAttribute('aria-label', localize('toolsTreeAria', "Tool groups"));
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
		DOM.append(description, $('span.section-title-description-text')).textContent = localize('toolsListSubtitle', "Enable or disable the tools available to chat. Disabled tools are not advertised to the agent. Tools other than Copilot CLI run on the client and require it to be connected.");
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

		const browseLabel = localize('toolsBrowseMarketplace', "Browse Marketplace");
		this._browseButtonContainer = DOM.append(this._searchRow, $('.tools-list-browse-button-container'));
		const browseButton = this._register(new Button(this._browseButtonContainer, { ...defaultButtonStyles, secondary: true, supportIcons: true, title: browseLabel, ariaLabel: browseLabel }));
		browseButton.label = `$(${Codicon.library.id}) ${browseLabel}`;
		this._register(browseButton.onDidClick(() => this._setBrowseMode(true)));

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
			description: localize('clientToolSet.copilotCli.description', "Copilot CLI"),
			detail: localize('clientToolSet.copilotCli.detail', "Built-in tools the Copilot CLI agent runs inside its own runtime."),
			getTools: () => tools,
		};
		return [copilotCliSet];
	}

	private _createViewModel(): IObservable<readonly IToolSetViewModel[]> {
		return derived(reader => {
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
			readOnly: ts.id === 'copilot-cli'
		};
	}

	layout(height: number, width: number): void {
		this._lastHeight = height;
		this._lastWidth = width;
		this._searchInput.layout();
		this._treeScrollable.scanDomNode();

		const galleryOffset = this._galleryContainer.getBoundingClientRect().top - this.element.getBoundingClientRect().top;
		this._galleryList.layout(Math.max(0, height - galleryOffset), width);
	}

	/** Enters/leaves marketplace browse mode, swapping the tree for the gallery list. */
	private _setBrowseMode(browse: boolean): void {
		if (this._browseMode === browse) {
			return;
		}
		this._browseMode = browse;

		this._treeScrollable.getDomNode().style.display = browse ? 'none' : '';
		this._galleryContainer.style.display = browse ? '' : 'none';
		this._browseButtonContainer.style.display = browse ? 'none' : '';
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
			if (items.length === 0) {
				this._setGalleryMessage(
					localize('toolsBrowseNoResults', "No tool extensions match '{0}'", userText || TOOLS_MARKETPLACE_QUERY),
					localize('tryDifferentSearch', "Try a different search term"));
				return;
			}
			this._galleryEmpty.style.display = 'none';
			this._galleryListContainer.style.display = '';
			this._galleryList.splice(0, this._galleryList.length, items);
		} catch {
			if (!cts.token.isCancellationRequested) {
				this._setGalleryMessage(
					localize('toolsBrowseError', "Unable to load marketplace"),
					localize('toolsBrowseTryAgain', "Check your connection and try again"));
			}
		}
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
		this._rowStore.clear();
		DOM.clearNode(this._treeContainer);

		if (model.length === 0) {
			const emptyState = DOM.append(this._treeContainer, $('.list-empty-state'));
			const header = DOM.append(emptyState, $('.empty-state-header'));
			const text = DOM.append(header, $('.empty-state-text'));
			const subtext = DOM.append(emptyState, $('.empty-state-subtext'));
			const query = this._searchQuery.get().trim();
			if (query) {
				text.textContent = localize('noMatchingTools', "No tools match '{0}'", query);
				subtext.textContent = localize('tryDifferentSearch', "Try a different search term");
			} else {
				text.textContent = localize('toolsNoMatches', "No tools available.");
			}
			this._treeScrollable.scanDomNode();
			return;
		}

		for (const vm of model) {
			this._renderToolSet(vm);
		}
		this._treeScrollable.scanDomNode();
	}

	private _renderToolSet(vm: IToolSetViewModel): void {
		const ts = vm.toolSet;
		const row = DOM.append(this._treeContainer, $('.tools-list-setrow'));
		// Focusable on click (not in tab order) for a list-style focus outline; keyboard users reach the inner
		// checkbox/chevron, which light up the row via :focus-within.
		row.tabIndex = -1;

		const setName = ts.description ?? ts.referenceName;
		const toggleExpand = () => this._toggleCollapsed(ts.id);

		const checkbox = this._rowStore.add(new TriStateCheckbox(
			localize('toolsSetCheckbox', "Enable {0}", setName),
			getToolSetTriState(this._currentState(), ts.id, vm.allToolIds),
			defaultCheckboxStyles,
		));
		row.appendChild(checkbox.domNode);
		if (vm.readOnly) {
			checkbox.disable();
			checkbox.setTitle(localize('toolsSetReadOnly', "These are the agent's built-in tools and cannot be changed."));
		} else {
			this._rowStore.add(checkbox.onChange(() => {
				const enabled = checkbox.checked === true;
				this._enablementService.setToolSetEnabled(this._sessionType, ts.id, vm.allToolIds, enabled);
			}));
		}

		const main = DOM.append(row, $('.tools-list-row-main'));
		const text = DOM.append(main, $('.tools-list-row-text'));
		const label = DOM.append(text, $('span.tools-list-row-label'));
		const labelHighlight = this._rowStore.add(new HighlightedLabel(label));
		labelHighlight.set(setName, vm.nameMatches);
		const detail = this._resolveSetDetail(ts);
		if (detail) {
			DOM.append(text, $('span.tools-list-row-subtext')).textContent = detail;
		}

		const count = DOM.append(row, $('span.tools-list-row-count'));

		const chevron = DOM.append(row, $('a.tools-list-chevron.codicon')) as HTMLAnchorElement;
		chevron.setAttribute('role', 'button');
		chevron.setAttribute('tabindex', '0');
		this._rowStore.add(DOM.addDisposableListener(chevron, 'keydown', e => {
			if (e.key === 'Enter' || e.key === ' ') {
				e.preventDefault();
				toggleExpand();
			}
		}));

		this._rowStore.add(DOM.addDisposableListener(row, 'click', e => {
			if (checkbox.domNode.contains(e.target as Node)) {
				return;
			}
			row.focus();
			toggleExpand();
		}));

		const group = DOM.append(this._treeContainer, $('.tools-list-children'));
		group.setAttribute('role', 'group');
		group.setAttribute('aria-label', setName);
		for (const tool of vm.visibleTools) {
			this._renderTool(group, vm, tool);
		}

		// Tri-state and count reflect enablement; update in place so a toggle never rebuilds the row.
		this._rowStore.add(autorun(reader => {
			const state = this._readState(reader);
			checkbox.checked = getToolSetTriState(state, ts.id, vm.allToolIds);
			const enabledCount = vm.allToolIds.reduce((n, id) => n + (isToolEnabledInSet(state, ts.id, id) ? 1 : 0), 0);
			count.textContent = `${enabledCount}/${vm.allToolIds.length}`;
			count.setAttribute('aria-label', localize('toolsRowEnabledOfTotal', "{0} of {1} tools enabled", enabledCount, vm.allToolIds.length));
		}));

		// Expand/collapse toggles child visibility in place (no rebuild) so chevron focus is kept.
		this._rowStore.add(autorun(reader => {
			const expanded = vm.forceExpanded || this._expanded.read(reader).has(ts.id);
			group.style.display = expanded ? '' : 'none';
			chevron.classList.toggle('codicon-chevron-down', expanded);
			chevron.classList.toggle('codicon-chevron-right', !expanded);
			chevron.setAttribute('aria-expanded', String(expanded));
			chevron.setAttribute('aria-label', expanded
				? localize('toolsCollapseAria', "Collapse {0}", setName)
				: localize('toolsExpandAria', "Expand {0}", setName));
			this._treeScrollable.scanDomNode();
		}));
	}

	private _renderTool(group: HTMLElement, vm: IToolSetViewModel, toolVm: IToolViewModel): void {
		const tool = toolVm.tool;
		const enabled = isToolEnabledInSet(this._currentState(), vm.toolSet.id, tool.id);
		const toolName = tool.displayName ?? tool.id;

		const row = DOM.append(group, $('.tools-list-toolrow'));
		row.classList.toggle('readonly', vm.readOnly);
		if (!vm.readOnly) {
			row.tabIndex = -1;
		}

		const checkbox = this._rowStore.add(new Checkbox(
			localize('toolsToolCheckbox', "Enable {0}", toolName),
			enabled,
			defaultCheckboxStyles,
		));
		row.appendChild(checkbox.domNode);
		if (vm.readOnly) {
			checkbox.disable();
			checkbox.setTitle(localize('toolsSetReadOnly', "These are the agent's built-in tools and cannot be changed."));
		} else {
			this._rowStore.add(checkbox.onChange(() => {
				this._enablementService.setToolEnabled(this._sessionType, vm.toolSet.id, tool.id, checkbox.checked);
			}));

			this._rowStore.add(DOM.addDisposableListener(row, 'click', e => {
				if (checkbox.domNode.contains(e.target as Node)) {
					return;
				}
				row.focus();
				this._enablementService.setToolEnabled(this._sessionType, vm.toolSet.id, tool.id, !checkbox.checked);
			}));

			// Keep the checkbox in sync with state in place (e.g. when the parent set is toggled).
			this._rowStore.add(autorun(reader => {
				checkbox.checked = isToolEnabledInSet(this._readState(reader), vm.toolSet.id, tool.id);
			}));
		}

		const text = DOM.append(row, $('.tools-list-row-text'));
		const label = DOM.append(text, $('span.tools-list-row-label'));
		const labelHighlight = this._rowStore.add(new HighlightedLabel(label));
		labelHighlight.set(toolName, toolVm.nameMatches);
		const description = tool.userDescription ?? tool.modelDescription;
		if (description) {
			const subtext = DOM.append(text, $('span.tools-list-row-subtext'));
			subtext.textContent = description;
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
