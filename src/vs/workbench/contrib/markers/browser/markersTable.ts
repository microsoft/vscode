/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../nls.js';
import * as DOM from '../../../../base/browser/dom.js';
import { Event } from '../../../../base/common/event.js';
import { ITableContextMenuEvent, ITableEvent, ITableRenderer, ITableVirtualDelegate } from '../../../../base/browser/ui/table/table.js';
import { Disposable, DisposableStore } from '../../../../base/common/lifecycle.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IOpenEvent, IWorkbenchTableOptions, WorkbenchTable } from '../../../../platform/list/browser/listService.js';
import { HighlightedLabel } from '../../../../base/browser/ui/highlightedlabel/highlightedLabel.js';
import { compareMarkersByUri, Marker, MarkerTableItem, ResourceMarkers } from './markersModel.js';
import { MarkerSeverity } from '../../../../platform/markers/common/markers.js';
import { SeverityIcon } from '../../../../base/browser/ui/severityIcon/severityIcon.js';
import { ActionBar } from '../../../../base/browser/ui/actionbar/actionbar.js';
import { ILabelService } from '../../../../platform/label/common/label.js';
import { FilterOptions } from './markersFilterOptions.js';
import { Link } from '../../../../platform/opener/browser/link.js';
import { IOpenerService } from '../../../../platform/opener/common/opener.js';
import { MarkersViewModel } from './markersTreeViewer.js';
import { IAction } from '../../../../base/common/actions.js';
import { QuickFixAction, QuickFixActionViewItem } from './markersViewActions.js';
import { DomEmitter } from '../../../../base/browser/event.js';
import Messages from './messages.js';
import { isUndefinedOrNull } from '../../../../base/common/types.js';
import { IProblemsWidget } from './markersView.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { Range } from '../../../../editor/common/core/range.js';
import { unsupportedSchemas } from '../../../../platform/markers/common/markerService.js';
import Severity from '../../../../base/common/severity.js';
import { IHoverService } from '../../../../platform/hover/browser/hover.js';

const $ = DOM.$;

interface IMarkerIconColumnTemplateData {
	readonly icon: HTMLElement;
	readonly actionBar: ActionBar;
}

interface IMarkerCodeColumnTemplateData {
	readonly codeColumn: HTMLElement;
	readonly sourceLabel: HighlightedLabel;
	readonly codeLabel: HighlightedLabel;
	readonly codeLink: Link;
	readonly templateDisposable: DisposableStore;
}

interface IMarkerFileColumnTemplateData {
	readonly columnElement: HTMLElement;
	readonly fileLabel: HighlightedLabel;
	readonly positionLabel: HighlightedLabel;
}


interface IMarkerHighlightedLabelColumnTemplateData {
	readonly columnElement: HTMLElement;
	readonly highlightedLabel: HighlightedLabel;
}

class MarkerSeverityColumnRenderer implements ITableRenderer<MarkerTableItem, IMarkerIconColumnTemplateData> {

	static readonly TEMPLATE_ID = 'severity';

	readonly templateId: string = MarkerSeverityColumnRenderer.TEMPLATE_ID;

	constructor(
		private readonly markersViewModel: MarkersViewModel,
		@IInstantiationService private readonly instantiationService: IInstantiationService
	) { }

	renderTemplate(container: HTMLElement): IMarkerIconColumnTemplateData {
		const severityColumn = DOM.append(container, $('.severity'));
		const icon = DOM.append(severityColumn, $(''));

		const actionBarColumn = DOM.append(container, $('.actions'));
		const actionBar = new ActionBar(actionBarColumn, {
			actionViewItemProvider: (action: IAction, options) => action.id === QuickFixAction.ID ? this.instantiationService.createInstance(QuickFixActionViewItem, <QuickFixAction>action, options) : undefined
		});

		return { actionBar, icon };
	}

	renderElement(element: MarkerTableItem, index: number, templateData: IMarkerIconColumnTemplateData): void {
		const toggleQuickFix = (enabled?: boolean) => {
			if (!isUndefinedOrNull(enabled)) {
				const container = DOM.findParentWithClass(templateData.icon, 'monaco-table-td')!;
				container.classList.toggle('quickFix', enabled);
			}
		};

		templateData.icon.title = MarkerSeverity.toString(element.marker.severity);
		templateData.icon.className = `marker-icon ${Severity.toString(MarkerSeverity.toSeverity(element.marker.severity))} codicon ${SeverityIcon.className(MarkerSeverity.toSeverity(element.marker.severity))}`;

		templateData.actionBar.clear();
		const viewModel = this.markersViewModel.getViewModel(element);
		if (viewModel) {
			const quickFixAction = viewModel.quickFixAction;
			templateData.actionBar.push([quickFixAction], { icon: true, label: false });
			toggleQuickFix(viewModel.quickFixAction.enabled);

			quickFixAction.onDidChange(({ enabled }) => toggleQuickFix(enabled));
			quickFixAction.onShowQuickFixes(() => {
				const quickFixActionViewItem = <QuickFixActionViewItem>templateData.actionBar.viewItems[0];
				if (quickFixActionViewItem) {
					quickFixActionViewItem.showQuickFixes();
				}
			});
		}
	}

	disposeTemplate(templateData: IMarkerIconColumnTemplateData): void { }
}

class MarkerCodeColumnRenderer implements ITableRenderer<MarkerTableItem, IMarkerCodeColumnTemplateData> {
	static readonly TEMPLATE_ID = 'code';

	readonly templateId: string = MarkerCodeColumnRenderer.TEMPLATE_ID;

	constructor(
		@IHoverService private readonly hoverService: IHoverService,
		@IOpenerService private readonly openerService: IOpenerService
	) { }

	renderTemplate(container: HTMLElement): IMarkerCodeColumnTemplateData {
		const templateDisposable = new DisposableStore();
		const codeColumn = DOM.append(container, $('.code'));

		const sourceLabel = templateDisposable.add(new HighlightedLabel(codeColumn));
		sourceLabel.element.classList.add('source-label');

		const codeLabel = templateDisposable.add(new HighlightedLabel(codeColumn));
		codeLabel.element.classList.add('code-label');

		const codeLink = templateDisposable.add(new Link(codeColumn, { href: '', label: '' }, {}, this.hoverService, this.openerService));

		return { codeColumn, sourceLabel, codeLabel, codeLink, templateDisposable };
	}

	renderElement(element: MarkerTableItem, index: number, templateData: IMarkerCodeColumnTemplateData): void {
		templateData.codeColumn.classList.remove('code-label');
		templateData.codeColumn.classList.remove('code-link');

		if (element.marker.source && element.marker.code) {
			if (typeof element.marker.code === 'string') {
				templateData.codeColumn.classList.add('code-label');
				templateData.codeColumn.title = `${element.marker.source} (${element.marker.code})`;
				templateData.sourceLabel.set(element.marker.source, element.sourceMatches);
				templateData.codeLabel.set(element.marker.code, element.codeMatches);
			} else {
				templateData.codeColumn.classList.add('code-link');
				templateData.codeColumn.title = `${element.marker.source} (${element.marker.code.value})`;
				templateData.sourceLabel.set(element.marker.source, element.sourceMatches);

				const codeLinkLabel = templateData.templateDisposable.add(new HighlightedLabel($('.code-link-label')));
				codeLinkLabel.set(element.marker.code.value, element.codeMatches);

				templateData.codeLink.link = {
					href: element.marker.code.target.toString(true),
					title: element.marker.code.target.toString(true),
					label: codeLinkLabel.element,
				};
			}
		} else {
			templateData.codeColumn.title = '';
			templateData.sourceLabel.set('-');
		}
	}

	disposeTemplate(templateData: IMarkerCodeColumnTemplateData): void {
		templateData.templateDisposable.dispose();
	}
}

class MarkerMessageColumnRenderer implements ITableRenderer<MarkerTableItem, IMarkerHighlightedLabelColumnTemplateData> {

	static readonly TEMPLATE_ID = 'message';

	readonly templateId: string = MarkerMessageColumnRenderer.TEMPLATE_ID;

	renderTemplate(container: HTMLElement): IMarkerHighlightedLabelColumnTemplateData {
		const columnElement = DOM.append(container, $('.message'));
		const highlightedLabel = new HighlightedLabel(columnElement);

		return { columnElement, highlightedLabel };
	}

	renderElement(element: MarkerTableItem, index: number, templateData: IMarkerHighlightedLabelColumnTemplateData): void {
		templateData.columnElement.title = element.marker.message;
		templateData.highlightedLabel.set(element.marker.message, element.messageMatches);
	}

	disposeTemplate(templateData: IMarkerHighlightedLabelColumnTemplateData): void {
		templateData.highlightedLabel.dispose();
	}
}

class MarkerFileColumnRenderer implements ITableRenderer<MarkerTableItem, IMarkerFileColumnTemplateData> {

	static readonly TEMPLATE_ID = 'file';

	readonly templateId: string = MarkerFileColumnRenderer.TEMPLATE_ID;

	constructor(
		@ILabelService private readonly labelService: ILabelService
	) { }

	renderTemplate(container: HTMLElement): IMarkerFileColumnTemplateData {
		const columnElement = DOM.append(container, $('.file'));
		const fileLabel = new HighlightedLabel(columnElement);
		fileLabel.element.classList.add('file-label');
		const positionLabel = new HighlightedLabel(columnElement);
		positionLabel.element.classList.add('file-position');

		return { columnElement, fileLabel, positionLabel };
	}

	renderElement(element: MarkerTableItem, index: number, templateData: IMarkerFileColumnTemplateData): void {
		const positionLabel = Messages.MARKERS_PANEL_AT_LINE_COL_NUMBER(element.marker.startLineNumber, element.marker.startColumn);

		templateData.columnElement.title = `${this.labelService.getUriLabel(element.marker.resource, { relative: false })} ${positionLabel}`;
		templateData.fileLabel.set(this.labelService.getUriLabel(element.marker.resource, { relative: true }), element.fileMatches);
		templateData.positionLabel.set(positionLabel, undefined);
	}

	disposeTemplate(templateData: IMarkerFileColumnTemplateData): void {
		templateData.fileLabel.dispose();
		templateData.positionLabel.dispose();
	}
}

class MarkerSourceColumnRenderer implements ITableRenderer<MarkerTableItem, IMarkerHighlightedLabelColumnTemplateData> {

	static readonly TEMPLATE_ID = 'source';

	readonly templateId: string = MarkerSourceColumnRenderer.TEMPLATE_ID;

	renderTemplate(container: HTMLElement): IMarkerHighlightedLabelColumnTemplateData {
		const columnElement = DOM.append(container, $('.source'));
		const highlightedLabel = new HighlightedLabel(columnElement);
		return { columnElement, highlightedLabel };
	}

	renderElement(element: MarkerTableItem, index: number, templateData: IMarkerHighlightedLabelColumnTemplateData): void {
		templateData.columnElement.title = element.marker.source ?? '';
		templateData.highlightedLabel.set(element.marker.source ?? '', element.sourceMatches);
	}

	disposeTemplate(templateData: IMarkerHighlightedLabelColumnTemplateData): void {
		templateData.highlightedLabel.dispose();
	}
}

class MarkersTableVirtualDelegate implements ITableVirtualDelegate<any> {
	static readonly HEADER_ROW_HEIGHT = 24;
	static readonly ROW_HEIGHT = 24;
	readonly headerRowHeight = MarkersTableVirtualDelegate.HEADER_ROW_HEIGHT;

	getHeight(item: any) {
		return MarkersTableVirtualDelegate.ROW_HEIGHT;
	}
}

export class MarkersTable extends Disposable implements IProblemsWidget {

	private _itemCount: number = 0;
	private readonly table: WorkbenchTable<MarkerTableItem>;

	constructor(
		private readonly container: HTMLElement,
		private readonly markersViewModel: MarkersViewModel,
		private resourceMarkers: ResourceMarkers[],
		private filterOptions: FilterOptions,
		options: IWorkbenchTableOptions<MarkerTableItem>,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@ILabelService private readonly labelService: ILabelService,
	) {
		super();

		this.table = this.instantiationService.createInstance(WorkbenchTable,
			'Markers',
			this.container,
			new MarkersTableVirtualDelegate(),
			[
				{
					label: '',
					tooltip: '',
					weight: 0,
					minimumWidth: 36,
					maximumWidth: 36,
					templateId: MarkerSeverityColumnRenderer.TEMPLATE_ID,
					project(row: Marker): Marker { return row; }
				},
				{
					label: localize('codeColumnLabel', "Code"),
					tooltip: '',
					weight: 1,
					minimumWidth: 100,
					maximumWidth: 300,
					templateId: MarkerCodeColumnRenderer.TEMPLATE_ID,
					project(row: Marker): Marker { return row; }
				},
				{
					label: localize('messageColumnLabel', "Message"),
					tooltip: '',
					weight: 4,
					templateId: MarkerMessageColumnRenderer.TEMPLATE_ID,
					project(row: Marker): Marker { return row; }
				},
				{
					label: localize('fileColumnLabel', "File"),
					tooltip: '',
					weight: 2,
					templateId: MarkerFileColumnRenderer.TEMPLATE_ID,
					project(row: Marker): Marker { return row; }
				},
				{
					label: localize('sourceColumnLabel', "Source"),
					tooltip: '',
					weight: 1,
					minimumWidth: 100,
					maximumWidth: 300,
					templateId: MarkerSourceColumnRenderer.TEMPLATE_ID,
					project(row: Marker): Marker { return row; }
				}
			],
			[
				this.instantiationService.createInstance(MarkerSeverityColumnRenderer, this.markersViewModel),
				this.instantiationService.createInstance(MarkerCodeColumnRenderer),
				this.instantiationService.createInstance(MarkerMessageColumnRenderer),
				this.instantiationService.createInstance(MarkerFileColumnRenderer),
				this.instantiationService.createInstance(MarkerSourceColumnRenderer),
			],
			options
		) as WorkbenchTable<MarkerTableItem>;

		// eslint-disable-next-line no-restricted-syntax
		const list = this.table.domNode.querySelector('.monaco-list-rows')! as HTMLElement;

		// mouseover/mouseleave event handlers
		const onRowHover = Event.chain(this._register(new DomEmitter(list, 'mouseover')).event, $ =>
			$.map(e => DOM.findParentWithClass(e.target as HTMLElement, 'monaco-list-row', 'monaco-list-rows'))
				// eslint-disable-next-line local/code-no-any-casts
				.filter<HTMLElement>(((e: HTMLElement | null) => !!e) as any)
				.map(e => parseInt(e.getAttribute('data-index')!))
		);

		const onListLeave = Event.map(this._register(new DomEmitter(list, 'mouseleave')).event, () => -1);

		const onRowHoverOrLeave = Event.latch(Event.any(onRowHover, onListLeave));
		const onRowPermanentHover = Event.debounce(onRowHoverOrLeave, (_, e) => e, 500);

		this._register(onRowPermanentHover(e => {
			if (e !== -1 && this.table.row(e)) {
				this.markersViewModel.onMarkerMouseHover(this.table.row(e));
			}
		}));
	}

	get contextKeyService(): IContextKeyService {
		return this.table.contextKeyService;
	}

	get onContextMenu(): Event<ITableContextMenuEvent<MarkerTableItem>> {
		return this.table.onContextMenu;
	}

	get onDidOpen(): Event<IOpenEvent<MarkerTableItem | undefined>> {
		return this.table.onDidOpen;
	}

	get onDidChangeFocus(): Event<ITableEvent<MarkerTableItem>> {
		return this.table.onDidChangeFocus;
	}

	get onDidChangeSelection(): Event<ITableEvent<MarkerTableItem>> {
		return this.table.onDidChangeSelection;
	}

	collapseMarkers(): void { }

	domFocus(): void {
		this.table.domFocus();
	}

	filterMarkers(resourceMarkers: ResourceMarkers[], filterOptions: FilterOptions): void {
		this.filterOptions = filterOptions;
		this.reset(resourceMarkers);
	}

	getFocus(): (MarkerTableItem | null)[] {
		const focus = this.table.getFocus();
		return focus.length > 0 ? [...focus.map(f => this.table.row(f))] : [];
	}

	getHTMLElement(): HTMLElement {
		return this.table.getHTMLElement();
	}

	getRelativeTop(marker: MarkerTableItem | null): number | null {
		return marker ? this.table.getRelativeTop(this.table.indexOf(marker)) : null;
	}

	getSelection(): (MarkerTableItem | null)[] {
		const selection = this.table.getSelection();
		return selection.length > 0 ? [...selection.map(i => this.table.row(i))] : [];
	}

	getVisibleItemCount(): number {
		return this._itemCount;
	}

	isVisible(): boolean {
		return !this.container.classList.contains('hidden');
	}

	layout(height: number, width: number): void {
		this.container.style.height = `${height}px`;
		this.table.layout(height, width);
	}

	reset(resourceMarkers: ResourceMarkers[]): void {
		this.resourceMarkers = resourceMarkers;

		const items: MarkerTableItem[] = [];
		for (const resourceMarker of this.resourceMarkers) {
			for (const marker of resourceMarker.markers) {
				if (unsupportedSchemas.has(marker.resource.scheme)) {
					continue;
				}

				// Exclude pattern
				if (this.filterOptions.excludesMatcher.matches(marker.resource)) {
					continue;
				}

				// Include pattern
				if (this.filterOptions.includesMatcher.matches(marker.resource)) {
					items.push(new MarkerTableItem(marker));
					continue;
				}

				// Severity filter
				const matchesSeverity = this.filterOptions.showErrors && MarkerSeverity.Error === marker.marker.severity ||
					this.filterOptions.showWarnings && MarkerSeverity.Warning === marker.marker.severity ||
					this.filterOptions.showInfos && MarkerSeverity.Info === marker.marker.severity;

				if (!matchesSeverity) {
					continue;
				}

				// Text filter
				if (this.filterOptions.textFilter.text) {
					const sourceMatches = marker.marker.source ? FilterOptions._filter(this.filterOptions.textFilter.text, marker.marker.source) ?? undefined : undefined;
					const codeMatches = marker.marker.code ? FilterOptions._filter(this.filterOptions.textFilter.text, typeof marker.marker.code === 'string' ? marker.marker.code : marker.marker.code.value) ?? undefined : undefined;
					const messageMatches = FilterOptions._messageFilter(this.filterOptions.textFilter.text, marker.marker.message) ?? undefined;
					const fileMatches = FilterOptions._messageFilter(this.filterOptions.textFilter.text, this.labelService.getUriLabel(marker.resource, { relative: true })) ?? undefined;

					const matched = sourceMatches || codeMatches || messageMatches || fileMatches;
					if ((matched && !this.filterOptions.textFilter.negate) || (!matched && this.filterOptions.textFilter.negate)) {
						items.push(new MarkerTableItem(marker, sourceMatches, codeMatches, messageMatches, fileMatches));
					}

					continue;
				}

				items.push(new MarkerTableItem(marker));
			}
		}
		this._itemCount = items.length;
		this.table.splice(0, Number.POSITIVE_INFINITY, items.sort((a, b) => {
			let result = MarkerSeverity.compare(a.marker.severity, b.marker.severity);

			if (result === 0) {
				result = compareMarkersByUri(a.marker, b.marker);
			}

			if (result === 0) {
				result = Range.compareRangesUsingStarts(a.marker, b.marker);
			}

			return result;
		}));
	}

	revealMarkers(activeResource: ResourceMarkers | null, focus: boolean, lastSelectedRelativeTop: number): void {
		if (activeResource) {
			const activeResourceIndex = this.resourceMarkers.indexOf(activeResource);

			if (activeResourceIndex !== -1) {
				if (this.hasSelectedMarkerFor(activeResource)) {
					const tableSelection = this.table.getSelection();
					this.table.reveal(tableSelection[0], lastSelectedRelativeTop);

					if (focus) {
						this.table.setFocus(tableSelection);
					}
				} else {
					this.table.reveal(activeResourceIndex, 0);

					if (focus) {
						this.table.setFocus([activeResourceIndex]);
						this.table.setSelection([activeResourceIndex]);
					}
				}
			}
		} else if (focus) {
			this.table.setSelection([]);
			this.table.focusFirst();
		}
	}

	setAriaLabel(label: string): void {
		this.table.domNode.ariaLabel = label;
	}

	setMarkerSelection(selection?: Marker[], focus?: Marker[]): void {
		if (this.isVisible()) {
			if (selection && selection.length > 0) {
				this.table.setSelection(selection.map(m => this.findMarkerIndex(m)));

				if (focus && focus.length > 0) {
					this.table.setFocus(focus.map(f => this.findMarkerIndex(f)));
				} else {
					this.table.setFocus([this.findMarkerIndex(selection[0])]);
				}

				this.table.reveal(this.findMarkerIndex(selection[0]));
			} else if (this.getSelection().length === 0 && this.getVisibleItemCount() > 0) {
				this.table.setSelection([0]);
				this.table.setFocus([0]);
				this.table.reveal(0);
			}
		}
	}

	toggleVisibility(hide: boolean): void {
		this.container.classList.toggle('hidden', hide);
	}

	update(resourceMarkers: ResourceMarkers[]): void {
		for (const resourceMarker of resourceMarkers) {
			const index = this.resourceMarkers.indexOf(resourceMarker);
			this.resourceMarkers.splice(index, 1, resourceMarker);
		}
		this.reset(this.resourceMarkers);
	}

	updateMarker(marker: Marker): void {
		this.table.rerender();
	}

	private findMarkerIndex(marker: Marker): number {
		for (let index = 0; index < this.table.length; index++) {
			if (this.table.row(index).marker === marker.marker) {
				return index;
			}
		}

		return -1;
	}

	private hasSelectedMarkerFor(resource: ResourceMarkers): boolean {
		const selectedElement = this.getSelection();
		if (selectedElement && selectedElement.length > 0) {
			if (selectedElement[0] instanceof Marker) {
				if (resource.has((<Marker>selectedElement[0]).marker.resource)) {
					return true;
				}
			}
		}

		return false;
	}
}
