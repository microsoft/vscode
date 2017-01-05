/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import 'vs/css!./media/gotoSymbolHandler';
import { TPromise } from 'vs/base/common/winjs.base';
import nls = require('vs/nls');
import errors = require('vs/base/common/errors');
import types = require('vs/base/common/types');
import strings = require('vs/base/common/strings');
import { IEntryRunContext, Mode, IAutoFocus } from 'vs/base/parts/quickopen/common/quickOpen';
import { QuickOpenModel, IHighlight } from 'vs/base/parts/quickopen/browser/quickOpenModel';
import { QuickOpenHandler, EditorQuickOpenEntryGroup, QuickOpenAction } from 'vs/workbench/browser/quickopen';
import filters = require('vs/base/common/filters');
import { KeyMod } from 'vs/base/common/keyCodes';
import { IEditor, IModelDecorationsChangeAccessor, OverviewRulerLane, IModelDeltaDecoration, IRange, IModel, ITokenizedModel, IDiffEditorModel, IEditorViewState } from 'vs/editor/common/editorCommon';
import { IWorkbenchEditorService } from 'vs/workbench/services/editor/common/editorService';
import { IQuickOpenService } from 'vs/platform/quickOpen/common/quickOpen';
import { Position, IEditorInput, ITextEditorOptions } from 'vs/platform/editor/common/editor';
import { getDocumentSymbols } from 'vs/editor/contrib/quickOpen/common/quickOpen';
import { DocumentSymbolProviderRegistry, SymbolInformation, SymbolKind } from 'vs/editor/common/modes';
import { getCodeEditor } from 'vs/editor/common/services/codeEditorService';

export const GOTO_SYMBOL_PREFIX = '@';
export const SCOPE_PREFIX = ':';

export class GotoSymbolAction extends QuickOpenAction {

	public static ID = 'workbench.action.gotoSymbol';
	public static LABEL = nls.localize('gotoSymbol', "Go to Symbol in File...");

	constructor(actionId: string, actionLabel: string, @IQuickOpenService quickOpenService: IQuickOpenService) {
		super(actionId, actionLabel, GOTO_SYMBOL_PREFIX, quickOpenService);
	}
}

class OutlineModel extends QuickOpenModel {
	private outline: Outline;

	constructor(outline: Outline, entries: SymbolEntry[]) {
		super(entries);

		this.outline = outline;
	}

	public applyFilter(searchValue: string): void {

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
						currentResult.setGroupLabel(this.renderGroupLabel(currentType, typeCounter, this.outline));
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
				currentResult.setGroupLabel(this.renderGroupLabel(currentType, typeCounter, this.outline));
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

	private renderGroupLabel(type: string, count: number, outline: Outline): string {

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
	private editorService: IWorkbenchEditorService;
	private index: number;
	private name: string;
	private type: string;
	private icon: string;
	private description: string;
	private range: IRange;
	private handler: GotoSymbolHandler;

	constructor(index: number, name: string, type: string, description: string, icon: string, range: IRange, highlights: IHighlight[], editorService: IWorkbenchEditorService, handler: GotoSymbolHandler) {
		super();

		this.index = index;
		this.name = name;
		this.type = type;
		this.icon = icon;
		this.description = description;
		this.range = range;
		this.setHighlights(highlights);
		this.editorService = editorService;
		this.handler = handler;
	}

	public getIndex(): number {
		return this.index;
	}

	public getLabel(): string {
		return this.name;
	}

	public getAriaLabel(): string {
		return nls.localize('entryAriaLabel', "{0}, symbols", this.getLabel());
	}

	public getIcon(): string {
		return this.icon;
	}

	public getDescription(): string {
		return this.description;
	}

	public getType(): string {
		return this.type;
	}

	public getRange(): IRange {
		return this.range;
	}

	public getInput(): IEditorInput {
		return this.editorService.getActiveEditorInput();
	}

	public getOptions(): ITextEditorOptions {
		return {
			selection: this.toSelection()
		};
	}

	public run(mode: Mode, context: IEntryRunContext): boolean {
		if (mode === Mode.OPEN) {
			return this.runOpen(context);
		}

		return this.runPreview();
	}

	private runOpen(context: IEntryRunContext): boolean {

		// Check for sideBySide use
		const sideBySide = context.keymods.indexOf(KeyMod.CtrlCmd) >= 0;
		if (sideBySide) {
			this.editorService.openEditor(this.getInput(), this.getOptions(), true).done(null, errors.onUnexpectedError);
		}

		// Apply selection and focus
		else {
			const range = this.toSelection();
			const activeEditor = this.editorService.getActiveEditor();
			if (activeEditor) {
				const editor = <IEditor>activeEditor.getControl();
				editor.setSelection(range);
				editor.revealRangeInCenter(range);
			}
		}

		return true;
	}

	private runPreview(): boolean {

		// Select Outline Position
		const range = this.toSelection();
		const activeEditor = this.editorService.getActiveEditor();
		if (activeEditor) {
			const editorControl = <IEditor>activeEditor.getControl();
			editorControl.revealRangeInCenter(range);

			// Decorate if possible
			if (types.isFunction(editorControl.changeDecorations)) {
				this.handler.decorateOutline(this.range, range, editorControl, activeEditor.position);
			}
		}

		return false;
	}

	private toSelection(): IRange {
		return {
			startLineNumber: this.range.startLineNumber,
			startColumn: this.range.startColumn || 1,
			endLineNumber: this.range.startLineNumber,
			endColumn: this.range.startColumn || 1
		};
	}
}

interface Outline {
	entries: SymbolInformation[];
}

interface IEditorLineDecoration {
	rangeHighlightId: string;
	lineDecorationId: string;
	position: Position;
}

export class GotoSymbolHandler extends QuickOpenHandler {
	private outlineToModelCache: { [modelId: string]: OutlineModel; };
	private rangeHighlightDecorationId: IEditorLineDecoration;
	private lastKnownEditorViewState: IEditorViewState;
	private activeOutlineRequest: TPromise<OutlineModel>;

	constructor(
		@IWorkbenchEditorService private editorService: IWorkbenchEditorService
	) {
		super();

		this.outlineToModelCache = {};
	}

	public getResults(searchValue: string): TPromise<QuickOpenModel> {
		searchValue = searchValue.trim();

		// Remember view state to be able to restore on cancel
		if (!this.lastKnownEditorViewState) {
			const editor = this.editorService.getActiveEditor();
			this.lastKnownEditorViewState = (<IEditor>editor.getControl()).saveViewState();
		}

		// Resolve Outline Model
		return this.getActiveOutline().then(outline => {

			// Filter by search
			outline.applyFilter(searchValue);

			return outline;
		});
	}

	public getEmptyLabel(searchString: string): string {
		if (searchString.length > 0) {
			return nls.localize('noSymbolsMatching', "No symbols matching");
		}

		return nls.localize('noSymbolsFound', "No symbols found");
	}

	public getAriaLabel(): string {
		return nls.localize('gotoSymbolHandlerAriaLabel', "Type to narrow down symbols of the currently active editor.");
	}

	public canRun(): boolean | string {
		let canRun = false;

		const editorControl: IEditor = getCodeEditor(this.editorService.getActiveEditor());
		if (editorControl) {
			let model = editorControl.getModel();
			if (model && (<IDiffEditorModel>model).modified && (<IDiffEditorModel>model).original) {
				model = (<IDiffEditorModel>model).modified; // Support for diff editor models
			}

			if (model && types.isFunction((<ITokenizedModel>model).getLanguageIdentifier)) {
				canRun = DocumentSymbolProviderRegistry.has(<IModel>model);
			}
		}

		return canRun ? true : editorControl !== null ? nls.localize('cannotRunGotoSymbolInFile', "No symbol information for the file") : nls.localize('cannotRunGotoSymbol', "Open a text file first to go to a symbol");
	}

	public getAutoFocus(searchValue: string): IAutoFocus {
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

	private toQuickOpenEntries(flattened: SymbolInformation[]): SymbolEntry[] {
		const results: SymbolEntry[] = [];

		for (let i = 0; i < flattened.length; i++) {
			const element = flattened[i];
			const label = strings.trim(element.name);

			// Show parent scope as description
			const description: string = element.containerName;

			// Add
			const icon = SymbolKind.from(element.kind);
			results.push(new SymbolEntry(i, label, SymbolKind.from(element.kind), description, icon, element.location.range, null, this.editorService, this));
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
		const editorControl: IEditor = getCodeEditor(this.editorService.getActiveEditor());
		if (editorControl) {
			let model = editorControl.getModel();
			if (model && (<IDiffEditorModel>model).modified && (<IDiffEditorModel>model).original) {
				model = (<IDiffEditorModel>model).modified; // Support for diff editor models
			}

			if (model && types.isFunction((<ITokenizedModel>model).getLanguageIdentifier)) {

				// Ask cache first
				const modelId = (<IModel>model).id;
				if (this.outlineToModelCache[modelId]) {
					return TPromise.as(this.outlineToModelCache[modelId]);
				}

				return getDocumentSymbols(<IModel>model).then(outline => {

					const model = new OutlineModel(outline, this.toQuickOpenEntries(outline.entries));

					this.outlineToModelCache = {}; // Clear cache, only keep 1 outline
					this.outlineToModelCache[modelId] = model;

					return model;
				});
			}
		}

		return TPromise.as<OutlineModel>(null);
	}

	public decorateOutline(fullRange: IRange, startRange: IRange, editor: IEditor, position: Position): void {
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
							color: 'rgba(0, 122, 204, 0.6)',
							darkColor: 'rgba(0, 122, 204, 0.6)',
							position: OverviewRulerLane.Full
						}
					}
				}

			];

			const decorations = changeAccessor.deltaDecorations(deleteDecorations, newDecorations);
			const rangeHighlightId = decorations[0];
			const lineDecorationId = decorations[1];

			this.rangeHighlightDecorationId = {
				rangeHighlightId: rangeHighlightId,
				lineDecorationId: lineDecorationId,
				position: position
			};
		});
	}

	public clearDecorations(): void {
		if (this.rangeHighlightDecorationId) {
			this.editorService.getVisibleEditors().forEach(editor => {
				if (editor.position === this.rangeHighlightDecorationId.position) {
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

	public onClose(canceled: boolean): void {

		// Clear Cache
		this.outlineToModelCache = {};

		// Clear Highlight Decorations if present
		this.clearDecorations();

		// Restore selection if canceled
		if (canceled && this.lastKnownEditorViewState) {
			const activeEditor = this.editorService.getActiveEditor();
			if (activeEditor) {
				const editor = <IEditor>activeEditor.getControl();
				editor.restoreViewState(this.lastKnownEditorViewState);
			}
		}

		this.lastKnownEditorViewState = null;
		this.activeOutlineRequest = null;
	}
}
