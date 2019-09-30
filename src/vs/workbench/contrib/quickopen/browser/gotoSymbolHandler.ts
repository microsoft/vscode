/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!vs/editor/contrib/documentSymbols/media/symbol-icons';
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
import { DocumentSymbolProviderRegistry, DocumentSymbol, symbolKindToCssClass, SymbolKind, SymbolTag } from 'vs/editor/common/modes';
import { IRange, Range } from 'vs/editor/common/core/range';
import { themeColorFromId } from 'vs/platform/theme/common/themeService';
import { overviewRulerRangeHighlight } from 'vs/editor/common/view/editorColorRegistry';
import { GroupIdentifier, IEditorInput } from 'vs/workbench/common/editor';
import { IEditorService, SIDE_GROUP } from 'vs/workbench/services/editor/common/editorService';
import { IEditorGroup } from 'vs/workbench/services/editor/common/editorGroupsService';
import { CancellationToken, CancellationTokenSource } from 'vs/base/common/cancellation';
import { IIconLabelValueOptions } from 'vs/base/browser/ui/iconLabel/iconLabel';

export const GOTO_SYMBOL_PREFIX = '@';
export const SCOPE_PREFIX = ':';

const FALLBACK_NLS_SYMBOL_KIND = nls.localize('property', "properties ({0})");
const NLS_SYMBOL_KIND_CACHE: { [type: number]: string } = {
	[SymbolKind.Method]: nls.localize('method', "methods ({0})"),
	[SymbolKind.Function]: nls.localize('function', "functions ({0})"),
	[SymbolKind.Constructor]: nls.localize('_constructor', "constructors ({0})"),
	[SymbolKind.Variable]: nls.localize('variable', "variables ({0})"),
	[SymbolKind.Class]: nls.localize('class', "classes ({0})"),
	[SymbolKind.Struct]: nls.localize('struct', "structs ({0})"),
	[SymbolKind.Event]: nls.localize('event', "events ({0})"),
	[SymbolKind.Operator]: nls.localize('operator', "operators ({0})"),
	[SymbolKind.Interface]: nls.localize('interface', "interfaces ({0})"),
	[SymbolKind.Namespace]: nls.localize('namespace', "namespaces ({0})"),
	[SymbolKind.Package]: nls.localize('package', "packages ({0})"),
	[SymbolKind.TypeParameter]: nls.localize('typeParameter', "type parameters ({0})"),
	[SymbolKind.Module]: nls.localize('modules', "modules ({0})"),
	[SymbolKind.Property]: nls.localize('property', "properties ({0})"),
	[SymbolKind.Enum]: nls.localize('enum', "enumerations ({0})"),
	[SymbolKind.EnumMember]: nls.localize('enumMember', "enumeration members ({0})"),
	[SymbolKind.String]: nls.localize('string', "strings ({0})"),
	[SymbolKind.File]: nls.localize('file', "files ({0})"),
	[SymbolKind.Array]: nls.localize('array', "arrays ({0})"),
	[SymbolKind.Number]: nls.localize('number', "numbers ({0})"),
	[SymbolKind.Boolean]: nls.localize('boolean', "booleans ({0})"),
	[SymbolKind.Object]: nls.localize('object', "objects ({0})"),
	[SymbolKind.Key]: nls.localize('key', "keys ({0})"),
	[SymbolKind.Field]: nls.localize('field', "fields ({0})"),
	[SymbolKind.Constant]: nls.localize('constant', "constants ({0})")
};

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
		const searchValueLow = searchValue.toLowerCase();
		const searchValuePos = searchValue.indexOf(SCOPE_PREFIX) === 0 ? 1 : 0;

		// Check for match and update visibility and group label
		this.entries.forEach((entry: SymbolEntry) => {

			// Clear all state first
			entry.setGroupLabel(undefined);
			entry.setShowBorder(false);
			entry.setScore(undefined);
			entry.setHidden(false);

			// Filter by search
			if (searchValue.length > searchValuePos) {
				const score = filters.fuzzyScore(
					searchValue, searchValueLow, searchValuePos,
					entry.getLabel(), entry.getLabel().toLowerCase(), 0,
					true
				);
				entry.setScore(score);
				entry.setHidden(!score);
			}
		});

		// select comparator based on the presence of the colon-prefix
		this.entries.sort(searchValuePos === 0
			? SymbolEntry.compareByRank
			: SymbolEntry.compareByKindAndRank
		);

		// Mark all type groups
		const visibleResults = <SymbolEntry[]>this.getEntries(true);
		if (visibleResults.length > 0 && searchValue.indexOf(SCOPE_PREFIX) === 0) {
			let currentType: SymbolKind | null = null;
			let currentResult: SymbolEntry | null = null;
			let typeCounter = 0;

			for (let i = 0; i < visibleResults.length; i++) {
				const result = visibleResults[i];

				// Found new type
				if (currentType !== result.getKind()) {

					// Update previous result with count
					if (currentResult) {
						currentResult.setGroupLabel(typeof currentType === 'number' ? this.renderGroupLabel(currentType, typeCounter) : undefined);
					}

					currentType = result.getKind();
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
				currentResult.setGroupLabel(typeof currentType === 'number' ? this.renderGroupLabel(currentType, typeCounter) : undefined);
			}
		}

		// Mark first entry as outline
		else if (visibleResults.length > 0) {
			visibleResults[0].setGroupLabel(nls.localize('symbols', "symbols ({0})", visibleResults.length));
		}
	}

	private renderGroupLabel(type: SymbolKind, count: number): string {
		let pattern = NLS_SYMBOL_KIND_CACHE[type];
		if (!pattern) {
			pattern = FALLBACK_NLS_SYMBOL_KIND;
		}

		return strings.format(pattern, count);
	}
}

class SymbolEntry extends EditorQuickOpenEntryGroup {

	private score?: filters.FuzzyScore;

	constructor(
		private readonly index: number,
		private readonly name: string,
		private readonly kind: SymbolKind,
		private readonly description: string,
		private readonly icon: string,
		private readonly deprecated: boolean,
		private readonly range: IRange,
		private readonly revealRange: IRange,
		private readonly editorService: IEditorService,
		private readonly handler: GotoSymbolHandler
	) {
		super();
	}

	setScore(score: filters.FuzzyScore | undefined): void {
		this.score = score;
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

	getLabelOptions(): IIconLabelValueOptions | undefined {
		return this.deprecated ? { extraClasses: ['deprecated'] } : undefined;
	}

	getHighlights(): [IHighlight[], IHighlight[] | undefined, IHighlight[] | undefined] {
		return [
			this.deprecated ? [] : filters.createMatches(this.score),
			undefined,
			undefined
		];
	}

	getDescription(): string {
		return this.description;
	}

	getKind(): SymbolKind {
		return this.kind;
	}

	getRange(): IRange {
		return this.range;
	}

	getInput(): IEditorInput | undefined {
		return this.editorService.activeEditor;
	}

	getOptions(pinned?: boolean): ITextEditorOptions {
		return {
			selection: Range.collapseToStart(this.revealRange),
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
			this.editorService.openEditor(this.getInput()!, this.getOptions(context.keymods.alt), SIDE_GROUP);
		}

		// Apply selection and focus
		else {
			const range = Range.collapseToStart(this.revealRange);
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
		const range = Range.collapseToStart(this.revealRange);
		const activeTextEditorWidget = this.editorService.activeTextEditorWidget;
		if (activeTextEditorWidget) {
			activeTextEditorWidget.revealRangeInCenter(range, ScrollType.Smooth);

			// Decorate if possible
			if (this.editorService.activeControl && types.isFunction(activeTextEditorWidget.changeDecorations)) {
				this.handler.decorateOutline(this.range, range, activeTextEditorWidget, this.editorService.activeControl.group);
			}
		}

		return false;
	}

	static compareByRank(a: SymbolEntry, b: SymbolEntry): number {
		if (!a.score && b.score) {
			return 1;
		} else if (a.score && !b.score) {
			return -1;
		}
		if (a.score && b.score) {
			if (a.score[0] > b.score[0]) {
				return -1;
			} else if (a.score[0] < b.score[0]) {
				return 1;
			}
		}
		if (a.index < b.index) {
			return -1;
		} else if (a.index > b.index) {
			return 1;
		}
		return 0;
	}

	static compareByKindAndRank(a: SymbolEntry, b: SymbolEntry): number {
		// Sort by type first if scoped search
		const kindA = NLS_SYMBOL_KIND_CACHE[a.getKind()] || FALLBACK_NLS_SYMBOL_KIND;
		const kindB = NLS_SYMBOL_KIND_CACHE[b.getKind()] || FALLBACK_NLS_SYMBOL_KIND;
		let r = kindA.localeCompare(kindB);
		if (r === 0) {
			r = SymbolEntry.compareByRank(a, b);
		}
		return r;
	}
}

interface IEditorLineDecoration {
	groupId: GroupIdentifier;
	rangeHighlightId: string;
	lineDecorationId: string;
}

export class GotoSymbolHandler extends QuickOpenHandler {

	static readonly ID = 'workbench.picker.filesymbols';

	private rangeHighlightDecorationId?: IEditorLineDecoration;
	private lastKnownEditorViewState: IEditorViewState | null = null;

	private cachedOutlineRequest?: Promise<OutlineModel | null>;
	private pendingOutlineRequest?: CancellationTokenSource;

	constructor(
		@IEditorService private readonly editorService: IEditorService
	) {
		super();

		this.registerListeners();
	}

	private registerListeners(): void {
		this.editorService.onDidActiveEditorChange(() => this.onDidActiveEditorChange());
	}

	private onDidActiveEditorChange(): void {
		this.clearOutlineRequest();

		this.lastKnownEditorViewState = null;
		this.rangeHighlightDecorationId = undefined;
	}

	async getResults(searchValue: string, token: CancellationToken): Promise<QuickOpenModel | null> {
		searchValue = searchValue.trim();

		// Support to cancel pending outline requests
		if (!this.pendingOutlineRequest) {
			this.pendingOutlineRequest = new CancellationTokenSource();
		}

		// Remember view state to be able to restore on cancel
		if (!this.lastKnownEditorViewState) {
			const activeTextEditorWidget = this.editorService.activeTextEditorWidget;
			if (activeTextEditorWidget) {
				this.lastKnownEditorViewState = activeTextEditorWidget.saveViewState();
			}
		}

		// Resolve Outline Model
		const outline = await this.getOutline();
		if (!outline) {
			return outline;
		}

		if (token.isCancellationRequested) {
			return outline;
		}

		// Filter by search
		outline.applyFilter(searchValue);

		return outline;
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

	private toQuickOpenEntries(symbols: DocumentSymbol[]): SymbolEntry[] {
		const results: SymbolEntry[] = [];

		for (let i = 0; i < symbols.length; i++) {
			const element = symbols[i];
			const label = strings.trim(element.name);

			// Show parent scope as description
			const description = element.containerName || '';
			const icon = symbolKindToCssClass(element.kind);

			// Add
			results.push(new SymbolEntry(i,
				label, element.kind, description, `symbol-icon ${icon}`, element.tags && element.tags.indexOf(SymbolTag.Deprecated) >= 0,
				element.range, element.selectionRange, this.editorService, this
			));
		}

		return results;
	}

	private getOutline(): Promise<OutlineModel | null> {
		if (!this.cachedOutlineRequest) {
			this.cachedOutlineRequest = this.doGetActiveOutline();
		}

		return this.cachedOutlineRequest;
	}

	private async doGetActiveOutline(): Promise<OutlineModel | null> {
		const activeTextEditorWidget = this.editorService.activeTextEditorWidget;
		if (activeTextEditorWidget) {
			let model = activeTextEditorWidget.getModel();
			if (model && (<IDiffEditorModel>model).modified && (<IDiffEditorModel>model).original) {
				model = (<IDiffEditorModel>model).modified; // Support for diff editor models
			}

			if (model && types.isFunction((<ITextModel>model).getLanguageIdentifier)) {
				const entries = await getDocumentSymbols(<ITextModel>model, true, this.pendingOutlineRequest!.token);

				return new OutlineModel(this.toQuickOpenEntries(entries));
			}
		}

		return null;
	}

	decorateOutline(fullRange: IRange, startRange: IRange, editor: IEditor, group: IEditorGroup): void {
		editor.changeDecorations((changeAccessor: IModelDecorationsChangeAccessor) => {
			const deleteDecorations: string[] = [];

			if (this.rangeHighlightDecorationId) {
				deleteDecorations.push(this.rangeHighlightDecorationId.lineDecorationId);
				deleteDecorations.push(this.rangeHighlightDecorationId.rangeHighlightId);
				this.rangeHighlightDecorationId = undefined;
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

	private clearDecorations(): void {
		const rangeHighlightDecorationId = this.rangeHighlightDecorationId;
		if (rangeHighlightDecorationId) {
			this.editorService.visibleControls.forEach(editor => {
				if (editor.group && editor.group.id === rangeHighlightDecorationId.groupId) {
					const editorControl = <IEditor>editor.getControl();
					editorControl.changeDecorations((changeAccessor: IModelDecorationsChangeAccessor) => {
						changeAccessor.deltaDecorations([
							rangeHighlightDecorationId.lineDecorationId,
							rangeHighlightDecorationId.rangeHighlightId
						], []);
					});
				}
			});

			this.rangeHighlightDecorationId = undefined;
		}
	}

	onClose(canceled: boolean): void {

		// Cancel any pending/cached outline request now
		this.clearOutlineRequest();

		// Clear Highlight Decorations if present
		this.clearDecorations();

		// Restore selection if canceled
		if (canceled && this.lastKnownEditorViewState) {
			const activeTextEditorWidget = this.editorService.activeTextEditorWidget;
			if (activeTextEditorWidget) {
				activeTextEditorWidget.restoreViewState(this.lastKnownEditorViewState);
			}

			this.lastKnownEditorViewState = null;
		}
	}

	private clearOutlineRequest(): void {
		if (this.pendingOutlineRequest) {
			this.pendingOutlineRequest.cancel();
			this.pendingOutlineRequest.dispose();
			this.pendingOutlineRequest = undefined;
		}

		this.cachedOutlineRequest = undefined;
	}
}
