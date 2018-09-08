/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import 'vs/css!vs/editor/contrib/documentSymbols/media/symbol-icons';
import { TPromise } from 'vs/base/common/winjs.base';
import * as nls from 'vs/nls';
import * as types from 'vs/base/common/types';
import * as strings from 'vs/base/common/strings';
import { IEntryRunContext, Mode, IAutoFocus } from 'vs/base/parts/quickopen/common/quickOpen';
import { QuickOpenModel, IHighlight } from 'vs/base/parts/quickopen/browser/quickOpenModel';
import { QuickOpenHandler, EditorQuickOpenEntryGroup, QuickOpenAction } from 'vs/workbench/browser/quickopen';
import * as filters from 'vs/base/common/filters';
import { IEditor, IDiffEditorModel, IEditorViewState, ScrollType } from 'vs/editor/common/editorCommon';
import { IModelDecorationsChangeAccessor, OverviewRulerLane, IModelDeltaDecoration, ITextModel } from 'vs/editor/common/model';
import { IQuickOpenService } from 'vs/platform/quickOpen/common/quickOpen';
import { ITextEditorOptions } from 'vs/platform/editor/common/editor';
import { getDocumentSymbols } from 'vs/editor/contrib/quickOpen/quickOpen';
import { DocumentSymbolProviderRegistry, DocumentSymbol, symbolKindToCssClass } from 'vs/editor/common/modes';
import { IRange } from 'vs/editor/common/core/range';
import { themeColorFromId } from 'vs/platform/theme/common/themeService';
import { overviewRulerRangeHighlight } from 'vs/editor/common/view/editorColorRegistry';
import { GroupIdentifier, IEditorInput } from 'vs/workbench/common/editor';
import { IEditorService, SIDE_GROUP } from 'vs/workbench/services/editor/common/editorService';
import { IEditorGroup } from 'vs/workbench/services/group/common/editorGroupsService';
import { asThenable } from 'vs/base/common/async';
import { CancellationToken } from 'vs/base/common/cancellation';

export const GOTO_SYMBOL_PREFIX = '@';
export const SCOPE_PREFIX = ':';

export class GotoSymbolAction extends QuickOpenAction {

	static readonly ID = 'workbench.action.gotoSymbol';
	static readonly LABEL = nls.localize('gotoSymbol', "Go to Symbol in File...");

	constructor(actionId: string, actionLabel: string, @IQuickOpenService quickOpenService: IQuickOpenService) {
		super(actionId, actionLabel, GOTO_SYMBOL_PREFIX, quickOpenService);
	}
}

class OutlineModel extends QuickOpenModel {

	applyFilter(searchValue: string): void {

		// Normalize search
		let normalizedSearchValue = searchValue;
		if (searchValue.indexOf(SCOPE_PREFIX) === 0) {
			normalizedSearchValue = normalizedSearchValue.substr(SCOPE_PREFIX.length);
		}

		// Check for match and update visibility and group label
		this.entries.forEach((entry: SymbolEntry) => {

			// Clear all state first
			entry.setGroupLabel(null);
			entry.setShowBorder(false);
			entry.setHighlights(null);
			entry.setHidden(false);

			// Filter by search
			if (normalizedSearchValue) {
				const highlights = filters.matchesFuzzy(normalizedSearchValue, entry.getLabel());
				if (highlights) {
					entry.setHighlights(highlights);
					entry.setHidden(false);
				} else if (!entry.isHidden()) {
					entry.setHidden(true);
				}
			}
		});

		// Sort properly if actually searching
		if (searchValue) {
			if (searchValue.indexOf(SCOPE_PREFIX) === 0) {
				this.entries.sort(this.sortScoped.bind(this, searchValue.toLowerCase()));
			} else {
				this.entries.sort(this.sortNormal.bind(this, searchValue.toLowerCase()));
			}
		}

		// Otherwise restore order as appearing in outline
		else {
			this.entries.sort((a: SymbolEntry, b: SymbolEntry) => a.getIndex() - b.getIndex());
		}

		// Mark all type groups
		const visibleResults = <SymbolEntry[]>this.getEntries(true);
		if (visibleResults.length > 0 && searchValue.indexOf(SCOPE_PREFIX) === 0) {
			let currentType: string = null;
			let currentResult: SymbolEntry = null;
			let typeCounter = 0;

			for (let i = 0; i < visibleResults.length; i++) {
				const result = visibleResults[i];

				// Found new type
				if (currentType !== result.getType()) {

					// Update previous result with count
					if (currentResult) {
						currentResult.setGroupLabel(this.renderGroupLabel(currentType, typeCounter));
					}

					currentType = result.getType();
					currentResult = result;
					typeCounter = 1;

					result.setShowBorder(i > 0);
				}

				// Existing type, keep counting
				else {
					typeCounter++;
				}
			}

			// Update previous result with count
			if (currentResult) {
				currentResult.setGroupLabel(this.renderGroupLabel(currentType, typeCounter));
			}
		}

		// Mark first entry as outline
		else if (visibleResults.length > 0) {
			visibleResults[0].setGroupLabel(nls.localize('symbols', "symbols ({0})", visibleResults.length));
		}
	}

	private sortNormal(searchValue: string, elementA: SymbolEntry, elementB: SymbolEntry): number {

		// Handle hidden elements
		if (elementA.isHidden() && elementB.isHidden()) {
			return 0;
		} else if (elementA.isHidden()) {
			return 1;
		} else if (elementB.isHidden()) {
			return -1;
		}

		const elementAName = elementA.getLabel().toLowerCase();
		const elementBName = elementB.getLabel().toLowerCase();

		// Compare by name
		const r = elementAName.localeCompare(elementBName);
		if (r !== 0) {
			return r;
		}

		// If name identical sort by range instead
		const elementARange = elementA.getRange();
		const elementBRange = elementB.getRange();

		return elementARange.startLineNumber - elementBRange.startLineNumber;
	}

	private sortScoped(searchValue: string, elementA: SymbolEntry, elementB: SymbolEntry): number {

		// Handle hidden elements
		if (elementA.isHidden() && elementB.isHidden()) {
			return 0;
		} else if (elementA.isHidden()) {
			return 1;
		} else if (elementB.isHidden()) {
			return -1;
		}

		// Remove scope char
		searchValue = searchValue.substr(SCOPE_PREFIX.length);

		// Sort by type first if scoped search
		const elementAType = elementA.getType();
		const elementBType = elementB.getType();
		let r = elementAType.localeCompare(elementBType);
		if (r !== 0) {
			return r;
		}

		// Special sort when searching in scoped mode
		if (searchValue) {
			const elementAName = elementA.getLabel().toLowerCase();
			const elementBName = elementB.getLabel().toLowerCase();

			// Compare by name
			r = elementAName.localeCompare(elementBName);
			if (r !== 0) {
				return r;
			}
		}

		// Default to sort by range
		const elementARange = elementA.getRange();
		const elementBRange = elementB.getRange();

		return elementARange.startLineNumber - elementBRange.startLineNumber;
	}

	private renderGroupLabel(type: string, count: number): string {

		const pattern = OutlineModel.getDefaultGroupLabelPatterns()[type];
		if (pattern) {
			return strings.format(pattern, count);
		}

		return type;
	}

	private static getDefaultGroupLabelPatterns(): { [type: string]: string } {
		const result: { [type: string]: string } = Object.create(null);
		result['method'] = nls.localize('method', "methods ({0})");
		result['function'] = nls.localize('function', "functions ({0})");
		result['constructor'] = <any>nls.localize('_constructor', "constructors ({0})");
		result['variable'] = nls.localize('variable', "variables ({0})");
		result['class'] = nls.localize('class', "classes ({0})");
		result['interface'] = nls.localize('interface', "interfaces ({0})");
		result['namespace'] = nls.localize('namespace', "namespaces ({0})");
		result['package'] = nls.localize('package', "packages ({0})");
		result['module'] = nls.localize('modules', "modules ({0})");
		result['property'] = nls.localize('property', "properties ({0})");
		result['enum'] = nls.localize('enum', "enumerations ({0})");
		result['string'] = nls.localize('string', "strings ({0})");
		result['rule'] = nls.localize('rule', "rules ({0})");
		result['file'] = nls.localize('file', "files ({0})");
		result['array'] = nls.localize('array', "arrays ({0})");
		result['number'] = nls.localize('number', "numbers ({0})");
		result['boolean'] = nls.localize('boolean', "booleans ({0})");
		result['object'] = nls.localize('object', "objects ({0})");
		result['key'] = nls.localize('key', "keys ({0})");
		return result;
	}
}

class SymbolEntry extends EditorQuickOpenEntryGroup {
	private editorService: IEditorService;
	private index: number;
	private name: string;
	private type: string;
	private icon: string;
	private description: string;
	private range: IRange;
	private revealRange: IRange;
	private handler: GotoSymbolHandler;

	constructor(index: number, name: string, type: string, description: string, icon: string, range: IRange, revealRange: IRange, highlights: IHighlight[], editorService: IEditorService, handler: GotoSymbolHandler) {
		super();

		this.index = index;
		this.name = name;
		this.type = type;
		this.icon = icon;
		this.description = description;
		this.range = range;
		this.revealRange = revealRange || range;
		this.setHighlights(highlights);
		this.editorService = editorService;
		this.handler = handler;
	}

	getIndex(): number {
		return this.index;
	}

	getLabel(): string {
		return this.name;
	}

	getAriaLabel(): string {
		return nls.localize('entryAriaLabel', "{0}, symbols", this.getLabel());
	}

	getIcon(): string {
		return this.icon;
	}

	getDescription(): string {
		return this.description;
	}

	getType(): string {
		return this.type;
	}

	getRange(): IRange {
		return this.range;
	}

	getInput(): IEditorInput {
		return this.editorService.activeEditor;
	}

	getOptions(pinned?: boolean): ITextEditorOptions {
		return {
			selection: this.toSelection(),
			pinned
		};
	}

	run(mode: Mode, context: IEntryRunContext): boolean {
		if (mode === Mode.OPEN) {
			return this.runOpen(context);
		}

		return this.runPreview();
	}

	private runOpen(context: IEntryRunContext): boolean {

		// Check for sideBySide use
		const sideBySide = context.keymods.ctrlCmd;
		if (sideBySide) {
			this.editorService.openEditor(this.getInput(), this.getOptions(context.keymods.alt), SIDE_GROUP);
		}

		// Apply selection and focus
		else {
			const range = this.toSelection();
			const activeTextEditorWidget = this.editorService.activeTextEditorWidget;
			if (activeTextEditorWidget) {
				activeTextEditorWidget.setSelection(range);
				activeTextEditorWidget.revealRangeInCenter(range, ScrollType.Smooth);
			}
		}

		return true;
	}

	private runPreview(): boolean {

		// Select Outline Position
		const range = this.toSelection();
		const activeTextEditorWidget = this.editorService.activeTextEditorWidget;
		if (activeTextEditorWidget) {
			activeTextEditorWidget.revealRangeInCenter(range, ScrollType.Smooth);

			// Decorate if possible
			if (types.isFunction(activeTextEditorWidget.changeDecorations)) {
				this.handler.decorateOutline(this.range, range, activeTextEditorWidget, this.editorService.activeControl.group);
			}
		}

		return false;
	}

	private toSelection(): IRange {
		return {
			startLineNumber: this.revealRange.startLineNumber,
			startColumn: this.revealRange.startColumn || 1,
			endLineNumber: this.revealRange.startLineNumber,
			endColumn: this.revealRange.startColumn || 1
		};
	}
}

interface IEditorLineDecoration {
	groupId: GroupIdentifier;
	rangeHighlightId: string;
	lineDecorationId: string;
}

export class GotoSymbolHandler extends QuickOpenHandler {

	static readonly ID = 'workbench.picker.filesymbols';

	private outlineToModelCache: { [modelId: string]: OutlineModel; };
	private rangeHighlightDecorationId: IEditorLineDecoration;
	private lastKnownEditorViewState: IEditorViewState;
	private activeOutlineRequest: TPromise<OutlineModel>;

	constructor(
		@IEditorService private editorService: IEditorService
	) {
		super();

		this.outlineToModelCache = {};
	}

	getResults(searchValue: string): TPromise<QuickOpenModel> {
		searchValue = searchValue.trim();

		// Remember view state to be able to restore on cancel
		if (!this.lastKnownEditorViewState) {
			const activeTextEditorWidget = this.editorService.activeTextEditorWidget;
			this.lastKnownEditorViewState = activeTextEditorWidget.saveViewState();
		}

		// Resolve Outline Model
		return this.getActiveOutline().then(outline => {

			// Filter by search
			outline.applyFilter(searchValue);

			return outline;
		});
	}

	getEmptyLabel(searchString: string): string {
		if (searchString.length > 0) {
			return nls.localize('noSymbolsMatching', "No symbols matching");
		}

		return nls.localize('noSymbolsFound', "No symbols found");
	}

	getAriaLabel(): string {
		return nls.localize('gotoSymbolHandlerAriaLabel', "Type to narrow down symbols of the currently active editor.");
	}

	canRun(): boolean | string {
		let canRun = false;

		const activeTextEditorWidget = this.editorService.activeTextEditorWidget;
		if (activeTextEditorWidget) {
			let model = activeTextEditorWidget.getModel();
			if (model && (<IDiffEditorModel>model).modified && (<IDiffEditorModel>model).original) {
				model = (<IDiffEditorModel>model).modified; // Support for diff editor models
			}

			if (model && types.isFunction((<ITextModel>model).getLanguageIdentifier)) {
				canRun = DocumentSymbolProviderRegistry.has(<ITextModel>model);
			}
		}

		return canRun ? true : activeTextEditorWidget !== null ? nls.localize('cannotRunGotoSymbolInFile', "No symbol information for the file") : nls.localize('cannotRunGotoSymbol', "Open a text file first to go to a symbol");
	}

	getAutoFocus(searchValue: string): IAutoFocus {
		searchValue = searchValue.trim();

		// Remove any type pattern (:) from search value as needed
		if (searchValue.indexOf(SCOPE_PREFIX) === 0) {
			searchValue = searchValue.substr(SCOPE_PREFIX.length);
		}

		return {
			autoFocusPrefixMatch: searchValue,
			autoFocusFirstEntry: !!searchValue
		};
	}

	private toQuickOpenEntries(flattened: DocumentSymbol[]): SymbolEntry[] {
		const results: SymbolEntry[] = [];

		for (let i = 0; i < flattened.length; i++) {
			const element = flattened[i];
			const label = strings.trim(element.name);

			// Show parent scope as description
			const description: string = element.containerName;
			const icon = symbolKindToCssClass(element.kind);

			// Add
			results.push(new SymbolEntry(i,
				label, icon, description, `symbol-icon ${icon}`,
				element.range, element.selectionRange, null, this.editorService, this
			));
		}

		return results;
	}

	private getActiveOutline(): TPromise<OutlineModel> {
		if (!this.activeOutlineRequest) {
			this.activeOutlineRequest = this.doGetActiveOutline();
		}

		return this.activeOutlineRequest;
	}

	private doGetActiveOutline(): TPromise<OutlineModel> {
		const activeTextEditorWidget = this.editorService.activeTextEditorWidget;
		if (activeTextEditorWidget) {
			let model = activeTextEditorWidget.getModel();
			if (model && (<IDiffEditorModel>model).modified && (<IDiffEditorModel>model).original) {
				model = (<IDiffEditorModel>model).modified; // Support for diff editor models
			}

			if (model && types.isFunction((<ITextModel>model).getLanguageIdentifier)) {

				// Ask cache first
				const modelId = (<ITextModel>model).id;
				if (this.outlineToModelCache[modelId]) {
					return TPromise.as(this.outlineToModelCache[modelId]);
				}
				// TODO@Ben - QuickOpenHandler#getResult should support cancellation
				return TPromise.wrap(asThenable(() => getDocumentSymbols(<ITextModel>model, CancellationToken.None)).then(entries => {

					const model = new OutlineModel(this.toQuickOpenEntries(entries));

					this.outlineToModelCache = {}; // Clear cache, only keep 1 outline
					this.outlineToModelCache[modelId] = model;

					return model;
				}));
			}
		}

		return TPromise.wrap<OutlineModel>(null);
	}

	decorateOutline(fullRange: IRange, startRange: IRange, editor: IEditor, group: IEditorGroup): void {
		editor.changeDecorations((changeAccessor: IModelDecorationsChangeAccessor) => {
			const deleteDecorations: string[] = [];

			if (this.rangeHighlightDecorationId) {
				deleteDecorations.push(this.rangeHighlightDecorationId.lineDecorationId);
				deleteDecorations.push(this.rangeHighlightDecorationId.rangeHighlightId);
				this.rangeHighlightDecorationId = null;
			}

			const newDecorations: IModelDeltaDecoration[] = [

				// rangeHighlight at index 0
				{
					range: fullRange,
					options: {
						className: 'rangeHighlight',
						isWholeLine: true
					}
				},

				// lineDecoration at index 1
				{
					range: startRange,
					options: {
						overviewRuler: {
							color: themeColorFromId(overviewRulerRangeHighlight),
							darkColor: themeColorFromId(overviewRulerRangeHighlight),
							position: OverviewRulerLane.Full
						}
					}
				}

			];

			const decorations = changeAccessor.deltaDecorations(deleteDecorations, newDecorations);
			const rangeHighlightId = decorations[0];
			const lineDecorationId = decorations[1];

			this.rangeHighlightDecorationId = {
				groupId: group.id,
				rangeHighlightId: rangeHighlightId,
				lineDecorationId: lineDecorationId,
			};
		});
	}

	clearDecorations(): void {
		if (this.rangeHighlightDecorationId) {
			this.editorService.visibleControls.forEach(editor => {
				if (editor.group.id === this.rangeHighlightDecorationId.groupId) {
					const editorControl = <IEditor>editor.getControl();
					editorControl.changeDecorations((changeAccessor: IModelDecorationsChangeAccessor) => {
						changeAccessor.deltaDecorations([
							this.rangeHighlightDecorationId.lineDecorationId,
							this.rangeHighlightDecorationId.rangeHighlightId
						], []);
					});
				}
			});

			this.rangeHighlightDecorationId = null;
		}
	}

	onClose(canceled: boolean): void {

		// Clear Cache
		this.outlineToModelCache = {};

		// Clear Highlight Decorations if present
		this.clearDecorations();

		// Restore selection if canceled
		if (canceled && this.lastKnownEditorViewState) {
			const activeTextEditorWidget = this.editorService.activeTextEditorWidget;
			if (activeTextEditorWidget) {
				activeTextEditorWidget.restoreViewState(this.lastKnownEditorViewState);
			}
		}

		this.lastKnownEditorViewState = null;
		this.activeOutlineRequest = null;
	}
}
