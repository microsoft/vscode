/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancelablePromise, createCancelablePromise, Delayer, RunOnceScheduler } from '../../../../base/common/async.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { illegalArgument, onUnexpectedError } from '../../../../base/common/errors.js';
import { KeyChord, KeyCode, KeyMod } from '../../../../base/common/keyCodes.js';
import { Disposable, DisposableStore, IDisposable } from '../../../../base/common/lifecycle.js';
import { escapeRegExpCharacters } from '../../../../base/common/strings.js';
import * as types from '../../../../base/common/types.js';
import './folding.css';
import { StableEditorScrollState } from '../../../browser/stableEditorScroll.js';
import { ICodeEditor, IEditorMouseEvent, MouseTargetType } from '../../../browser/editorBrowser.js';
import { EditorAction, EditorContributionInstantiation, registerEditorAction, registerEditorContribution, registerInstantiatedEditorAction, ServicesAccessor } from '../../../browser/editorExtensions.js';
import { ConfigurationChangedEvent, EditorOption } from '../../../common/config/editorOptions.js';
import { IPosition } from '../../../common/core/position.js';
import { IRange } from '../../../common/core/range.js';
import { Selection } from '../../../common/core/selection.js';
import { IEditorContribution, ScrollType } from '../../../common/editorCommon.js';
import { EditorContextKeys } from '../../../common/editorContextKeys.js';
import { ITextModel } from '../../../common/model.js';
import { IModelContentChangedEvent } from '../../../common/textModelEvents.js';
import { FoldingRange, FoldingRangeKind, FoldingRangeProvider } from '../../../common/languages.js';
import { ILanguageConfigurationService } from '../../../common/languages/languageConfigurationRegistry.js';
import { CollapseMemento, FoldingModel, getNextFoldLine, getParentFoldLine as getParentFoldLine, getPreviousFoldLine, setCollapseStateAtLevel, setCollapseStateForMatchingLines, setCollapseStateForRest, setCollapseStateForType, setCollapseStateLevelsDown, setCollapseStateLevelsUp, setCollapseStateUp, toggleCollapseState } from './foldingModel.js';
import { HiddenRangeModel } from './hiddenRangeModel.js';
import { IndentRangeProvider } from './indentRangeProvider.js';
import * as nls from '../../../../nls.js';
import { IContextKey, IContextKeyService, RawContextKey } from '../../../../platform/contextkey/common/contextkey.js';
import { KeybindingWeight } from '../../../../platform/keybinding/common/keybindingsRegistry.js';
import { FoldingDecorationProvider } from './foldingDecorations.js';
import { FoldingRegion, FoldingRegions, FoldRange, FoldSource, ILineRange } from './foldingRanges.js';
import { SyntaxRangeProvider } from './syntaxRangeProvider.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
import { IFeatureDebounceInformation, ILanguageFeatureDebounceService } from '../../../common/services/languageFeatureDebounce.js';
import { StopWatch } from '../../../../base/common/stopwatch.js';
import { ILanguageFeaturesService } from '../../../common/services/languageFeatures.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { CommandsRegistry } from '../../../../platform/commands/common/commands.js';
import { URI } from '../../../../base/common/uri.js';
import { IModelService } from '../../../common/services/model.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';

const CONTEXT_FOLDING_ENABLED = new RawContextKey<boolean>('foldingEnabled', false);

export interface RangeProvider {
	readonly id: string;
	compute(cancelationToken: CancellationToken): Promise<FoldingRegions | null>;
	dispose(): void;
}

interface FoldingStateMemento {
	collapsedRegions?: CollapseMemento;
	lineCount?: number;
	provider?: string;
	foldedImports?: boolean;
}

export interface FoldingLimitReporter {
	readonly limit: number;
	update(computed: number, limited: number | false): void;
}

export type FoldingRangeProviderSelector = (provider: FoldingRangeProvider[], document: ITextModel) => FoldingRangeProvider[] | undefined;

export class FoldingController extends Disposable implements IEditorContribution {

	public static readonly ID = 'editor.contrib.folding';

	public static get(editor: ICodeEditor): FoldingController | null {
		return editor.getContribution<FoldingController>(FoldingController.ID);
	}

	private static _foldingRangeSelector: FoldingRangeProviderSelector | undefined;

	public static getFoldingRangeProviders(languageFeaturesService: ILanguageFeaturesService, model: ITextModel): FoldingRangeProvider[] {
		const foldingRangeProviders = languageFeaturesService.foldingRangeProvider.ordered(model);
		return (FoldingController._foldingRangeSelector?.(foldingRangeProviders, model)) ?? foldingRangeProviders;
	}

	public static setFoldingRangeProviderSelector(foldingRangeSelector: FoldingRangeProviderSelector): IDisposable {
		FoldingController._foldingRangeSelector = foldingRangeSelector;
		return { dispose: () => { FoldingController._foldingRangeSelector = undefined; } };
	}

	private readonly editor: ICodeEditor;
	private _isEnabled: boolean;
	private _useFoldingProviders: boolean;
	private _unfoldOnClickAfterEndOfLine: boolean;
	private _restoringViewState: boolean;
	private _foldingImportsByDefault: boolean;
	private _currentModelHasFoldedImports: boolean;

	private readonly foldingDecorationProvider: FoldingDecorationProvider;

	private foldingModel: FoldingModel | null;
	private hiddenRangeModel: HiddenRangeModel | null;

	private rangeProvider: RangeProvider | null;
	private foldingRegionPromise: CancelablePromise<FoldingRegions | null> | null;

	private foldingModelPromise: Promise<FoldingModel | null> | null;
	private updateScheduler: Delayer<FoldingModel | null> | null;
	private readonly updateDebounceInfo: IFeatureDebounceInformation;

	private foldingEnabled: IContextKey<boolean>;
	private cursorChangedScheduler: RunOnceScheduler | null;

	private readonly localToDispose = this._register(new DisposableStore());
	private mouseDownInfo: { lineNumber: number; iconClicked: boolean } | null;

	public readonly _foldingLimitReporter: RangesLimitReporter;

	constructor(
		editor: ICodeEditor,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
		@ILanguageConfigurationService private readonly languageConfigurationService: ILanguageConfigurationService,
		@INotificationService notificationService: INotificationService,
		@ILanguageFeatureDebounceService languageFeatureDebounceService: ILanguageFeatureDebounceService,
		@ILanguageFeaturesService private readonly languageFeaturesService: ILanguageFeaturesService,
	) {
		super();
		this.editor = editor;

		this._foldingLimitReporter = this._register(new RangesLimitReporter(editor));

		const options = this.editor.getOptions();
		this._isEnabled = options.get(EditorOption.folding);
		this._useFoldingProviders = options.get(EditorOption.foldingStrategy) !== 'indentation';
		this._unfoldOnClickAfterEndOfLine = options.get(EditorOption.unfoldOnClickAfterEndOfLine);
		this._restoringViewState = false;
		this._currentModelHasFoldedImports = false;
		this._foldingImportsByDefault = options.get(EditorOption.foldingImportsByDefault);
		this.updateDebounceInfo = languageFeatureDebounceService.for(languageFeaturesService.foldingRangeProvider, 'Folding', { min: 200 });

		this.foldingModel = null;
		this.hiddenRangeModel = null;
		this.rangeProvider = null;
		this.foldingRegionPromise = null;
		this.foldingModelPromise = null;
		this.updateScheduler = null;
		this.cursorChangedScheduler = null;
		this.mouseDownInfo = null;

		this.foldingDecorationProvider = new FoldingDecorationProvider(editor);
		this.foldingDecorationProvider.showFoldingControls = options.get(EditorOption.showFoldingControls);
		this.foldingDecorationProvider.showFoldingHighlights = options.get(EditorOption.foldingHighlight);
		this.foldingEnabled = CONTEXT_FOLDING_ENABLED.bindTo(this.contextKeyService);
		this.foldingEnabled.set(this._isEnabled);

		this._register(this.editor.onDidChangeModel(() => this.onModelChanged()));

		this._register(this.editor.onDidChangeConfiguration((e: ConfigurationChangedEvent) => {
			if (e.hasChanged(EditorOption.folding)) {
				this._isEnabled = this.editor.getOptions().get(EditorOption.folding);
				this.foldingEnabled.set(this._isEnabled);
				this.onModelChanged();
			}
			if (e.hasChanged(EditorOption.foldingMaximumRegions)) {
				this.onModelChanged();
			}
			if (e.hasChanged(EditorOption.showFoldingControls) || e.hasChanged(EditorOption.foldingHighlight)) {
				const options = this.editor.getOptions();
				this.foldingDecorationProvider.showFoldingControls = options.get(EditorOption.showFoldingControls);
				this.foldingDecorationProvider.showFoldingHighlights = options.get(EditorOption.foldingHighlight);
				this.triggerFoldingModelChanged();
			}
			if (e.hasChanged(EditorOption.foldingStrategy)) {
				this._useFoldingProviders = this.editor.getOptions().get(EditorOption.foldingStrategy) !== 'indentation';
				this.onFoldingStrategyChanged();
			}
			if (e.hasChanged(EditorOption.unfoldOnClickAfterEndOfLine)) {
				this._unfoldOnClickAfterEndOfLine = this.editor.getOptions().get(EditorOption.unfoldOnClickAfterEndOfLine);
			}
			if (e.hasChanged(EditorOption.foldingImportsByDefault)) {
				this._foldingImportsByDefault = this.editor.getOptions().get(EditorOption.foldingImportsByDefault);
			}
		}));
		this.onModelChanged();
	}

	public get limitReporter() {
		return this._foldingLimitReporter;
	}

	/**
	 * Store view state.
	 */
	public saveViewState(): FoldingStateMemento | undefined {
		const model = this.editor.getModel();
		if (!model || !this._isEnabled || model.isTooLargeForTokenization()) {
			return {};
		}
		if (this.foldingModel) { // disposed ?
			const collapsedRegions = this.foldingModel.getMemento();
			const provider = this.rangeProvider ? this.rangeProvider.id : undefined;
			return { collapsedRegions, lineCount: model.getLineCount(), provider, foldedImports: this._currentModelHasFoldedImports };
		}
		return undefined;
	}

	/**
	 * Restore view state.
	 */
	public restoreViewState(state: FoldingStateMemento): void {
		const model = this.editor.getModel();
		if (!model || !this._isEnabled || model.isTooLargeForTokenization() || !this.hiddenRangeModel) {
			return;
		}
		if (!state) {
			return;
		}

		this._currentModelHasFoldedImports = !!state.foldedImports;
		if (state.collapsedRegions && state.collapsedRegions.length > 0 && this.foldingModel) {
			this._restoringViewState = true;
			try {
				this.foldingModel.applyMemento(state.collapsedRegions);
			} finally {
				this._restoringViewState = false;
			}
		}
	}

	private onModelChanged(): void {
		this.localToDispose.clear();

		const model = this.editor.getModel();
		if (!this._isEnabled || !model || model.isTooLargeForTokenization()) {
			// huge files get no view model, so they cannot support hidden areas
			return;
		}

		this._currentModelHasFoldedImports = false;
		this.foldingModel = new FoldingModel(model, this.foldingDecorationProvider);
		this.localToDispose.add(this.foldingModel);

		this.hiddenRangeModel = new HiddenRangeModel(this.foldingModel);
		this.localToDispose.add(this.hiddenRangeModel);
		this.localToDispose.add(this.hiddenRangeModel.onDidChange(hr => this.onHiddenRangesChanges(hr)));

		this.updateScheduler = new Delayer<FoldingModel>(this.updateDebounceInfo.get(model));
		this.localToDispose.add(this.updateScheduler);

		this.cursorChangedScheduler = new RunOnceScheduler(() => this.revealCursor(), 200);
		this.localToDispose.add(this.cursorChangedScheduler);
		this.localToDispose.add(this.languageFeaturesService.foldingRangeProvider.onDidChange(() => this.onFoldingStrategyChanged()));
		this.localToDispose.add(this.editor.onDidChangeModelLanguageConfiguration(() => this.onFoldingStrategyChanged())); // covers model language changes as well
		this.localToDispose.add(this.editor.onDidChangeModelContent(e => this.onDidChangeModelContent(e)));
		this.localToDispose.add(this.editor.onDidChangeCursorPosition(() => this.onCursorPositionChanged()));
		this.localToDispose.add(this.editor.onMouseDown(e => this.onEditorMouseDown(e)));
		this.localToDispose.add(this.editor.onMouseUp(e => this.onEditorMouseUp(e)));
		this.localToDispose.add({
			dispose: () => {
				if (this.foldingRegionPromise) {
					this.foldingRegionPromise.cancel();
					this.foldingRegionPromise = null;
				}
				this.updateScheduler?.cancel();
				this.updateScheduler = null;
				this.foldingModel = null;
				this.foldingModelPromise = null;
				this.hiddenRangeModel = null;
				this.cursorChangedScheduler = null;
				this.rangeProvider?.dispose();
				this.rangeProvider = null;
			}
		});
		this.triggerFoldingModelChanged();
	}

	private onFoldingStrategyChanged() {
		this.rangeProvider?.dispose();
		this.rangeProvider = null;
		this.triggerFoldingModelChanged();
	}

	private getRangeProvider(editorModel: ITextModel): RangeProvider {
		if (this.rangeProvider) {
			return this.rangeProvider;
		}
		const indentRangeProvider = new IndentRangeProvider(editorModel, this.languageConfigurationService, this._foldingLimitReporter);
		this.rangeProvider = indentRangeProvider; // fallback
		if (this._useFoldingProviders && this.foldingModel) {
			const selectedProviders = FoldingController.getFoldingRangeProviders(this.languageFeaturesService, editorModel);
			if (selectedProviders.length > 0) {
				this.rangeProvider = new SyntaxRangeProvider(editorModel, selectedProviders, () => this.triggerFoldingModelChanged(), this._foldingLimitReporter, indentRangeProvider);
			}
		}
		return this.rangeProvider;
	}

	public getFoldingModel(): Promise<FoldingModel | null> | null {
		return this.foldingModelPromise;
	}

	private onDidChangeModelContent(e: IModelContentChangedEvent) {
		this.hiddenRangeModel?.notifyChangeModelContent(e);
		this.triggerFoldingModelChanged();
	}


	public triggerFoldingModelChanged() {
		if (this.updateScheduler) {
			if (this.foldingRegionPromise) {
				this.foldingRegionPromise.cancel();
				this.foldingRegionPromise = null;
			}
			this.foldingModelPromise = this.updateScheduler.trigger(() => {
				const foldingModel = this.foldingModel;
				if (!foldingModel) { // null if editor has been disposed, or folding turned off
					return null;
				}
				const sw = new StopWatch();
				const provider = this.getRangeProvider(foldingModel.textModel);
				const foldingRegionPromise = this.foldingRegionPromise = createCancelablePromise(token => provider.compute(token));
				return foldingRegionPromise.then(foldingRanges => {
					if (foldingRanges && foldingRegionPromise === this.foldingRegionPromise) { // new request or cancelled in the meantime?
						let scrollState: StableEditorScrollState | undefined;

						if (this._foldingImportsByDefault && !this._currentModelHasFoldedImports) {
							const hasChanges = foldingRanges.setCollapsedAllOfType(FoldingRangeKind.Imports.value, true);
							if (hasChanges) {
								scrollState = StableEditorScrollState.capture(this.editor);
								this._currentModelHasFoldedImports = hasChanges;
							}
						}

						// some cursors might have moved into hidden regions, make sure they are in expanded regions
						const selections = this.editor.getSelections();
						foldingModel.update(foldingRanges, toSelectedLines(selections));

						scrollState?.restore(this.editor);

						// update debounce info
						const newValue = this.updateDebounceInfo.update(foldingModel.textModel, sw.elapsed());
						if (this.updateScheduler) {
							this.updateScheduler.defaultDelay = newValue;
						}
					}
					return foldingModel;
				});
			}).then(undefined, (err) => {
				onUnexpectedError(err);
				return null;
			});
		}
	}

	private onHiddenRangesChanges(hiddenRanges: IRange[]) {
		if (this.hiddenRangeModel && hiddenRanges.length && !this._restoringViewState) {
			const selections = this.editor.getSelections();
			if (selections) {
				if (this.hiddenRangeModel.adjustSelections(selections)) {
					this.editor.setSelections(selections);
				}
			}
		}
		this.editor.setHiddenAreas(hiddenRanges, this);
	}

	private onCursorPositionChanged() {
		if (this.hiddenRangeModel && this.hiddenRangeModel.hasRanges()) {
			this.cursorChangedScheduler!.schedule();
		}
	}

	private revealCursor() {
		const foldingModel = this.getFoldingModel();
		if (!foldingModel) {
			return;
		}
		foldingModel.then(foldingModel => { // null is returned if folding got disabled in the meantime
			if (foldingModel) {
				const selections = this.editor.getSelections();
				if (selections && selections.length > 0) {
					const toToggle: FoldingRegion[] = [];
					for (const selection of selections) {
						const lineNumber = selection.selectionStartLineNumber;
						if (this.hiddenRangeModel && this.hiddenRangeModel.isHidden(lineNumber)) {
							toToggle.push(...foldingModel.getAllRegionsAtLine(lineNumber, r => r.isCollapsed && lineNumber > r.startLineNumber));
						}
					}
					if (toToggle.length) {
						foldingModel.toggleCollapseState(toToggle);
						this.reveal(selections[0].getPosition());
					}
				}
			}
		}).then(undefined, onUnexpectedError);

	}

	private onEditorMouseDown(e: IEditorMouseEvent): void {
		this.mouseDownInfo = null;


		if (!this.hiddenRangeModel || !e.target || !e.target.range) {
			return;
		}
		if (!e.event.leftButton && !e.event.middleButton) {
			return;
		}
		const range = e.target.range;
		let iconClicked = false;
		switch (e.target.type) {
			case MouseTargetType.GUTTER_LINE_DECORATIONS: {
				const data = e.target.detail;
				const offsetLeftInGutter = e.target.element!.offsetLeft;
				const gutterOffsetX = data.offsetX - offsetLeftInGutter;

				// const gutterOffsetX = data.offsetX - data.glyphMarginWidth - data.lineNumbersWidth - data.glyphMarginLeft;

				// TODO@joao TODO@alex TODO@martin this is such that we don't collide with dirty diff
				if (gutterOffsetX < 4) { // the whitespace between the border and the real folding icon border is 4px
					return;
				}

				iconClicked = true;
				break;
			}
			case MouseTargetType.CONTENT_EMPTY: {
				if (this._unfoldOnClickAfterEndOfLine && this.hiddenRangeModel.hasRanges()) {
					const data = e.target.detail;
					if (!data.isAfterLines) {
						break;
					}
				}
				return;
			}
			case MouseTargetType.CONTENT_TEXT: {
				if (this.hiddenRangeModel.hasRanges()) {
					const model = this.editor.getModel();
					if (model && range.startColumn === model.getLineMaxColumn(range.startLineNumber)) {
						break;
					}
				}
				return;
			}
			default:
				return;
		}

		this.mouseDownInfo = { lineNumber: range.startLineNumber, iconClicked };
	}

	private onEditorMouseUp(e: IEditorMouseEvent): void {
		const foldingModel = this.foldingModel;
		if (!foldingModel || !this.mouseDownInfo || !e.target) {
			return;
		}
		const lineNumber = this.mouseDownInfo.lineNumber;
		const iconClicked = this.mouseDownInfo.iconClicked;

		const range = e.target.range;
		if (!range || range.startLineNumber !== lineNumber) {
			return;
		}

		if (iconClicked) {
			if (e.target.type !== MouseTargetType.GUTTER_LINE_DECORATIONS) {
				return;
			}
		} else {
			const model = this.editor.getModel();
			if (!model || range.startColumn !== model.getLineMaxColumn(lineNumber)) {
				return;
			}
		}

		const region = foldingModel.getRegionAtLine(lineNumber);
		if (region && region.startLineNumber === lineNumber) {
			const isCollapsed = region.isCollapsed;
			if (iconClicked || isCollapsed) {
				const surrounding = e.event.altKey;
				let toToggle = [];
				if (surrounding) {
					const filter = (otherRegion: FoldingRegion) => !otherRegion.containedBy(region) && !region.containedBy(otherRegion);
					const toMaybeToggle = foldingModel.getRegionsInside(null, filter);
					for (const r of toMaybeToggle) {
						if (r.isCollapsed) {
							toToggle.push(r);
						}
					}
					// if any surrounding regions are folded, unfold those. Otherwise, fold all surrounding
					if (toToggle.length === 0) {
						toToggle = toMaybeToggle;
					}
				}
				else {
					const recursive = e.event.middleButton || e.event.shiftKey;
					if (recursive) {
						for (const r of foldingModel.getRegionsInside(region)) {
							if (r.isCollapsed === isCollapsed) {
								toToggle.push(r);
							}
						}
					}
					// when recursive, first only collapse all children. If all are already folded or there are no children, also fold parent.
					if (isCollapsed || !recursive || toToggle.length === 0) {
						toToggle.push(region);
					}
				}
				foldingModel.toggleCollapseState(toToggle);
				this.reveal({ lineNumber, column: 1 });
			}
		}
	}

	public reveal(position: IPosition): void {
		this.editor.revealPositionInCenterIfOutsideViewport(position, ScrollType.Smooth);
	}
}

export class RangesLimitReporter extends Disposable implements FoldingLimitReporter {
	constructor(private readonly editor: ICodeEditor) {
		super();
	}

	public get limit() {
		return this.editor.getOptions().get(EditorOption.foldingMaximumRegions);
	}

	private _onDidChange = this._register(new Emitter<void>());
	public get onDidChange(): Event<void> { return this._onDidChange.event; }

	private _computed: number = 0;
	private _limited: number | false = false;
	public get computed(): number {
		return this._computed;
	}
	public get limited(): number | false {
		return this._limited;
	}
	public update(computed: number, limited: number | false) {
		if (computed !== this._computed || limited !== this._limited) {
			this._computed = computed;
			this._limited = limited;
			this._onDidChange.fire();
		}
	}
}

abstract class FoldingAction<T> extends EditorAction {

	abstract invoke(foldingController: FoldingController, foldingModel: FoldingModel, editor: ICodeEditor, args: T, languageConfigurationService: ILanguageConfigurationService): void;

	public override runEditorCommand(accessor: ServicesAccessor, editor: ICodeEditor, args: T): void | Promise<void> {
		const languageConfigurationService = accessor.get(ILanguageConfigurationService);
		const foldingController = FoldingController.get(editor);
		if (!foldingController) {
			return;
		}
		const foldingModelPromise = foldingController.getFoldingModel();
		if (foldingModelPromise) {
			this.reportTelemetry(accessor, editor);
			return foldingModelPromise.then(foldingModel => {
				if (foldingModel) {
					this.invoke(foldingController, foldingModel, editor, args, languageConfigurationService);
					const selection = editor.getSelection();
					if (selection) {
						foldingController.reveal(selection.getStartPosition());
					}
				}
			});
		}
	}

	protected getSelectedLines(editor: ICodeEditor) {
		const selections = editor.getSelections();
		return selections ? selections.map(s => s.startLineNumber) : [];
	}

	protected getLineNumbers(args: FoldingArguments, editor: ICodeEditor) {
		if (args && args.selectionLines) {
			return args.selectionLines.map(l => l + 1); // to 0-bases line numbers
		}
		return this.getSelectedLines(editor);
	}

	public run(_accessor: ServicesAccessor, _editor: ICodeEditor): void {
	}
}

export interface SelectedLines {
	startsInside(startLine: number, endLine: number): boolean;
}

export function toSelectedLines(selections: Selection[] | null): SelectedLines {
	if (!selections || selections.length === 0) {
		return {
			startsInside: () => false
		};
	}
	return {
		startsInside(startLine: number, endLine: number): boolean {
			for (const s of selections) {
				const line = s.startLineNumber;
				if (line >= startLine && line <= endLine) {
					return true;
				}
			}
			return false;
		}
	};
}

interface FoldingArguments {
	levels?: number;
	direction?: 'up' | 'down';
	selectionLines?: number[];
}

function foldingArgumentsConstraint(args: any) {
	if (!types.isUndefined(args)) {
		if (!types.isObject(args)) {
			return false;
		}
		const foldingArgs: FoldingArguments = args;
		if (!types.isUndefined(foldingArgs.levels) && !types.isNumber(foldingArgs.levels)) {
			return false;
		}
		if (!types.isUndefined(foldingArgs.direction) && !types.isString(foldingArgs.direction)) {
			return false;
		}
		if (!types.isUndefined(foldingArgs.selectionLines) && (!Array.isArray(foldingArgs.selectionLines) || !foldingArgs.selectionLines.every(types.isNumber))) {
			return false;
		}
	}
	return true;
}

class UnfoldAction extends FoldingAction<FoldingArguments> {

	constructor() {
		super({
			id: 'editor.unfold',
			label: nls.localize2('unfoldAction.label', "Unfold"),
			precondition: CONTEXT_FOLDING_ENABLED,
			kbOpts: {
				kbExpr: EditorContextKeys.editorTextFocus,
				primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.BracketRight,
				mac: {
					primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.BracketRight
				},
				weight: KeybindingWeight.EditorContrib
			},
			metadata: {
				description: 'Unfold the content in the editor',
				args: [
					{
						name: 'Unfold editor argument',
						description: `Property-value pairs that can be passed through this argument:
						* 'levels': Number of levels to unfold. If not set, defaults to 1.
						* 'direction': If 'up', unfold given number of levels up otherwise unfolds down.
						* 'selectionLines': Array of the start lines (0-based) of the editor selections to apply the unfold action to. If not set, the active selection(s) will be used.
						`,
						constraint: foldingArgumentsConstraint,
						schema: {
							'type': 'object',
							'properties': {
								'levels': {
									'type': 'number',
									'default': 1
								},
								'direction': {
									'type': 'string',
									'enum': ['up', 'down'],
									'default': 'down'
								},
								'selectionLines': {
									'type': 'array',
									'items': {
										'type': 'number'
									}
								}
							}
						}
					}
				]
			}
		});
	}

	invoke(_foldingController: FoldingController, foldingModel: FoldingModel, editor: ICodeEditor, args: FoldingArguments): void {
		const levels = args && args.levels || 1;
		const lineNumbers = this.getLineNumbers(args, editor);
		if (args && args.direction === 'up') {
			setCollapseStateLevelsUp(foldingModel, false, levels, lineNumbers);
		} else {
			setCollapseStateLevelsDown(foldingModel, false, levels, lineNumbers);
		}
	}
}

class UnFoldRecursivelyAction extends FoldingAction<void> {

	constructor() {
		super({
			id: 'editor.unfoldRecursively',
			label: nls.localize2('unFoldRecursivelyAction.label', "Unfold Recursively"),
			precondition: CONTEXT_FOLDING_ENABLED,
			kbOpts: {
				kbExpr: EditorContextKeys.editorTextFocus,
				primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KeyK, KeyMod.CtrlCmd | KeyCode.BracketRight),
				weight: KeybindingWeight.EditorContrib
			}
		});
	}

	invoke(_foldingController: FoldingController, foldingModel: FoldingModel, editor: ICodeEditor, _args: any): void {
		setCollapseStateLevelsDown(foldingModel, false, Number.MAX_VALUE, this.getSelectedLines(editor));
	}
}

class FoldAction extends FoldingAction<FoldingArguments> {

	constructor() {
		super({
			id: 'editor.fold',
			label: nls.localize2('foldAction.label', "Fold"),
			precondition: CONTEXT_FOLDING_ENABLED,
			kbOpts: {
				kbExpr: EditorContextKeys.editorTextFocus,
				primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.BracketLeft,
				mac: {
					primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.BracketLeft
				},
				weight: KeybindingWeight.EditorContrib
			},
			metadata: {
				description: 'Fold the content in the editor',
				args: [
					{
						name: 'Fold editor argument',
						description: `Property-value pairs that can be passed through this argument:
							* 'levels': Number of levels to fold.
							* 'direction': If 'up', folds given number of levels up otherwise folds down.
							* 'selectionLines': Array of the start lines (0-based) of the editor selections to apply the fold action to. If not set, the active selection(s) will be used.
							If no levels or direction is set, folds the region at the locations or if already collapsed, the first uncollapsed parent instead.
						`,
						constraint: foldingArgumentsConstraint,
						schema: {
							'type': 'object',
							'properties': {
								'levels': {
									'type': 'number',
								},
								'direction': {
									'type': 'string',
									'enum': ['up', 'down'],
								},
								'selectionLines': {
									'type': 'array',
									'items': {
										'type': 'number'
									}
								}
							}
						}
					}
				]
			}
		});
	}

	invoke(_foldingController: FoldingController, foldingModel: FoldingModel, editor: ICodeEditor, args: FoldingArguments): void {
		const lineNumbers = this.getLineNumbers(args, editor);

		const levels = args && args.levels;
		const direction = args && args.direction;

		if (typeof levels !== 'number' && typeof direction !== 'string') {
			// fold the region at the location or if already collapsed, the first uncollapsed parent instead.
			setCollapseStateUp(foldingModel, true, lineNumbers);
		} else {
			if (direction === 'up') {
				setCollapseStateLevelsUp(foldingModel, true, levels || 1, lineNumbers);
			} else {
				setCollapseStateLevelsDown(foldingModel, true, levels || 1, lineNumbers);
			}
		}
	}
}


class ToggleFoldAction extends FoldingAction<void> {

	constructor() {
		super({
			id: 'editor.toggleFold',
			label: nls.localize2('toggleFoldAction.label', "Toggle Fold"),
			precondition: CONTEXT_FOLDING_ENABLED,
			kbOpts: {
				kbExpr: EditorContextKeys.editorTextFocus,
				primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KeyK, KeyMod.CtrlCmd | KeyCode.KeyL),
				weight: KeybindingWeight.EditorContrib
			}
		});
	}

	invoke(_foldingController: FoldingController, foldingModel: FoldingModel, editor: ICodeEditor): void {
		const selectedLines = this.getSelectedLines(editor);
		toggleCollapseState(foldingModel, 1, selectedLines);
	}
}


class FoldRecursivelyAction extends FoldingAction<void> {

	constructor() {
		super({
			id: 'editor.foldRecursively',
			label: nls.localize2('foldRecursivelyAction.label', "Fold Recursively"),
			precondition: CONTEXT_FOLDING_ENABLED,
			kbOpts: {
				kbExpr: EditorContextKeys.editorTextFocus,
				primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KeyK, KeyMod.CtrlCmd | KeyCode.BracketLeft),
				weight: KeybindingWeight.EditorContrib
			}
		});
	}

	invoke(_foldingController: FoldingController, foldingModel: FoldingModel, editor: ICodeEditor): void {
		const selectedLines = this.getSelectedLines(editor);
		setCollapseStateLevelsDown(foldingModel, true, Number.MAX_VALUE, selectedLines);
	}
}


class ToggleFoldRecursivelyAction extends FoldingAction<void> {

	constructor() {
		super({
			id: 'editor.toggleFoldRecursively',
			label: nls.localize2('toggleFoldRecursivelyAction.label', "Toggle Fold Recursively"),
			precondition: CONTEXT_FOLDING_ENABLED,
			kbOpts: {
				kbExpr: EditorContextKeys.editorTextFocus,
				primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KeyK, KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyL),
				weight: KeybindingWeight.EditorContrib
			}
		});
	}

	invoke(_foldingController: FoldingController, foldingModel: FoldingModel, editor: ICodeEditor): void {
		const selectedLines = this.getSelectedLines(editor);
		toggleCollapseState(foldingModel, Number.MAX_VALUE, selectedLines);
	}
}


class FoldAllBlockCommentsAction extends FoldingAction<void> {

	constructor() {
		super({
			id: 'editor.foldAllBlockComments',
			label: nls.localize2('foldAllBlockComments.label', "Fold All Block Comments"),
			precondition: CONTEXT_FOLDING_ENABLED,
			kbOpts: {
				kbExpr: EditorContextKeys.editorTextFocus,
				primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KeyK, KeyMod.CtrlCmd | KeyCode.Slash),
				weight: KeybindingWeight.EditorContrib
			}
		});
	}

	invoke(_foldingController: FoldingController, foldingModel: FoldingModel, editor: ICodeEditor, args: void, languageConfigurationService: ILanguageConfigurationService): void {
		if (foldingModel.regions.hasTypes()) {
			setCollapseStateForType(foldingModel, FoldingRangeKind.Comment.value, true);
		} else {
			const editorModel = editor.getModel();
			if (!editorModel) {
				return;
			}
			const comments = languageConfigurationService.getLanguageConfiguration(editorModel.getLanguageId()).comments;
			if (comments && comments.blockCommentStartToken) {
				const regExp = new RegExp('^\\s*' + escapeRegExpCharacters(comments.blockCommentStartToken));
				setCollapseStateForMatchingLines(foldingModel, regExp, true);
			}
		}
	}
}

class FoldAllRegionsAction extends FoldingAction<void> {

	constructor() {
		super({
			id: 'editor.foldAllMarkerRegions',
			label: nls.localize2('foldAllMarkerRegions.label', "Fold All Regions"),
			precondition: CONTEXT_FOLDING_ENABLED,
			kbOpts: {
				kbExpr: EditorContextKeys.editorTextFocus,
				primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KeyK, KeyMod.CtrlCmd | KeyCode.Digit8),
				weight: KeybindingWeight.EditorContrib
			}
		});
	}

	invoke(_foldingController: FoldingController, foldingModel: FoldingModel, editor: ICodeEditor, args: void, languageConfigurationService: ILanguageConfigurationService): void {
		if (foldingModel.regions.hasTypes()) {
			setCollapseStateForType(foldingModel, FoldingRangeKind.Region.value, true);
		} else {
			const editorModel = editor.getModel();
			if (!editorModel) {
				return;
			}
			const foldingRules = languageConfigurationService.getLanguageConfiguration(editorModel.getLanguageId()).foldingRules;
			if (foldingRules && foldingRules.markers && foldingRules.markers.start) {
				const regExp = new RegExp(foldingRules.markers.start);
				setCollapseStateForMatchingLines(foldingModel, regExp, true);
			}
		}
	}
}

class UnfoldAllRegionsAction extends FoldingAction<void> {

	constructor() {
		super({
			id: 'editor.unfoldAllMarkerRegions',
			label: nls.localize2('unfoldAllMarkerRegions.label', "Unfold All Regions"),
			precondition: CONTEXT_FOLDING_ENABLED,
			kbOpts: {
				kbExpr: EditorContextKeys.editorTextFocus,
				primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KeyK, KeyMod.CtrlCmd | KeyCode.Digit9),
				weight: KeybindingWeight.EditorContrib
			}
		});
	}

	invoke(_foldingController: FoldingController, foldingModel: FoldingModel, editor: ICodeEditor, args: void, languageConfigurationService: ILanguageConfigurationService): void {
		if (foldingModel.regions.hasTypes()) {
			setCollapseStateForType(foldingModel, FoldingRangeKind.Region.value, false);
		} else {
			const editorModel = editor.getModel();
			if (!editorModel) {
				return;
			}
			const foldingRules = languageConfigurationService.getLanguageConfiguration(editorModel.getLanguageId()).foldingRules;
			if (foldingRules && foldingRules.markers && foldingRules.markers.start) {
				const regExp = new RegExp(foldingRules.markers.start);
				setCollapseStateForMatchingLines(foldingModel, regExp, false);
			}
		}
	}
}

class FoldAllExceptAction extends FoldingAction<void> {

	constructor() {
		super({
			id: 'editor.foldAllExcept',
			label: nls.localize2('foldAllExcept.label', "Fold All Except Selected"),
			precondition: CONTEXT_FOLDING_ENABLED,
			kbOpts: {
				kbExpr: EditorContextKeys.editorTextFocus,
				primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KeyK, KeyMod.CtrlCmd | KeyCode.Minus),
				weight: KeybindingWeight.EditorContrib
			}
		});
	}

	invoke(_foldingController: FoldingController, foldingModel: FoldingModel, editor: ICodeEditor): void {
		const selectedLines = this.getSelectedLines(editor);
		setCollapseStateForRest(foldingModel, true, selectedLines);
	}

}

class UnfoldAllExceptAction extends FoldingAction<void> {

	constructor() {
		super({
			id: 'editor.unfoldAllExcept',
			label: nls.localize2('unfoldAllExcept.label', "Unfold All Except Selected"),
			precondition: CONTEXT_FOLDING_ENABLED,
			kbOpts: {
				kbExpr: EditorContextKeys.editorTextFocus,
				primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KeyK, KeyMod.CtrlCmd | KeyCode.Equal),
				weight: KeybindingWeight.EditorContrib
			}
		});
	}

	invoke(_foldingController: FoldingController, foldingModel: FoldingModel, editor: ICodeEditor): void {
		const selectedLines = this.getSelectedLines(editor);
		setCollapseStateForRest(foldingModel, false, selectedLines);
	}
}

class FoldAllAction extends FoldingAction<void> {

	constructor() {
		super({
			id: 'editor.foldAll',
			label: nls.localize2('foldAllAction.label', "Fold All"),
			precondition: CONTEXT_FOLDING_ENABLED,
			kbOpts: {
				kbExpr: EditorContextKeys.editorTextFocus,
				primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KeyK, KeyMod.CtrlCmd | KeyCode.Digit0),
				weight: KeybindingWeight.EditorContrib
			}
		});
	}

	invoke(_foldingController: FoldingController, foldingModel: FoldingModel, _editor: ICodeEditor): void {
		setCollapseStateLevelsDown(foldingModel, true);
	}
}

class UnfoldAllAction extends FoldingAction<void> {

	constructor() {
		super({
			id: 'editor.unfoldAll',
			label: nls.localize2('unfoldAllAction.label', "Unfold All"),
			precondition: CONTEXT_FOLDING_ENABLED,
			kbOpts: {
				kbExpr: EditorContextKeys.editorTextFocus,
				primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KeyK, KeyMod.CtrlCmd | KeyCode.KeyJ),
				weight: KeybindingWeight.EditorContrib
			}
		});
	}

	invoke(_foldingController: FoldingController, foldingModel: FoldingModel, _editor: ICodeEditor): void {
		setCollapseStateLevelsDown(foldingModel, false);
	}
}

class FoldLevelAction extends FoldingAction<void> {
	private static readonly ID_PREFIX = 'editor.foldLevel';
	public static readonly ID = (level: number) => FoldLevelAction.ID_PREFIX + level;

	private getFoldingLevel() {
		return parseInt(this.id.substr(FoldLevelAction.ID_PREFIX.length));
	}

	invoke(_foldingController: FoldingController, foldingModel: FoldingModel, editor: ICodeEditor): void {
		setCollapseStateAtLevel(foldingModel, this.getFoldingLevel(), true, this.getSelectedLines(editor));
	}
}

/** Action to go to the parent fold of current line */
class GotoParentFoldAction extends FoldingAction<void> {
	constructor() {
		super({
			id: 'editor.gotoParentFold',
			label: nls.localize2('gotoParentFold.label', "Go to Parent Fold"),
			precondition: CONTEXT_FOLDING_ENABLED,
			kbOpts: {
				kbExpr: EditorContextKeys.editorTextFocus,
				weight: KeybindingWeight.EditorContrib
			}
		});
	}

	invoke(_foldingController: FoldingController, foldingModel: FoldingModel, editor: ICodeEditor): void {
		const selectedLines = this.getSelectedLines(editor);
		if (selectedLines.length > 0) {
			const startLineNumber = getParentFoldLine(selectedLines[0], foldingModel);
			if (startLineNumber !== null) {
				editor.setSelection({
					startLineNumber: startLineNumber,
					startColumn: 1,
					endLineNumber: startLineNumber,
					endColumn: 1
				});
			}
		}
	}
}

/** Action to go to the previous fold of current line */
class GotoPreviousFoldAction extends FoldingAction<void> {
	constructor() {
		super({
			id: 'editor.gotoPreviousFold',
			label: nls.localize2('gotoPreviousFold.label', "Go to Previous Folding Range"),
			precondition: CONTEXT_FOLDING_ENABLED,
			kbOpts: {
				kbExpr: EditorContextKeys.editorTextFocus,
				weight: KeybindingWeight.EditorContrib
			}
		});
	}

	invoke(_foldingController: FoldingController, foldingModel: FoldingModel, editor: ICodeEditor): void {
		const selectedLines = this.getSelectedLines(editor);
		if (selectedLines.length > 0) {
			const startLineNumber = getPreviousFoldLine(selectedLines[0], foldingModel);
			if (startLineNumber !== null) {
				editor.setSelection({
					startLineNumber: startLineNumber,
					startColumn: 1,
					endLineNumber: startLineNumber,
					endColumn: 1
				});
			}
		}
	}
}

/** Action to go to the next fold of current line */
class GotoNextFoldAction extends FoldingAction<void> {
	constructor() {
		super({
			id: 'editor.gotoNextFold',
			label: nls.localize2('gotoNextFold.label', "Go to Next Folding Range"),
			precondition: CONTEXT_FOLDING_ENABLED,
			kbOpts: {
				kbExpr: EditorContextKeys.editorTextFocus,
				weight: KeybindingWeight.EditorContrib
			}
		});
	}

	invoke(_foldingController: FoldingController, foldingModel: FoldingModel, editor: ICodeEditor): void {
		const selectedLines = this.getSelectedLines(editor);
		if (selectedLines.length > 0) {
			const startLineNumber = getNextFoldLine(selectedLines[0], foldingModel);
			if (startLineNumber !== null) {
				editor.setSelection({
					startLineNumber: startLineNumber,
					startColumn: 1,
					endLineNumber: startLineNumber,
					endColumn: 1
				});
			}
		}
	}
}

class FoldRangeFromSelectionAction extends FoldingAction<void> {

	constructor() {
		super({
			id: 'editor.createFoldingRangeFromSelection',
			label: nls.localize2('createManualFoldRange.label', "Create Folding Range from Selection"),
			precondition: CONTEXT_FOLDING_ENABLED,
			kbOpts: {
				kbExpr: EditorContextKeys.editorTextFocus,
				primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KeyK, KeyMod.CtrlCmd | KeyCode.Comma),
				weight: KeybindingWeight.EditorContrib
			}
		});
	}

	invoke(_foldingController: FoldingController, foldingModel: FoldingModel, editor: ICodeEditor): void {
		const collapseRanges: FoldRange[] = [];
		const selections = editor.getSelections();
		if (selections) {
			for (const selection of selections) {
				let endLineNumber = selection.endLineNumber;
				if (selection.endColumn === 1) {
					--endLineNumber;
				}
				if (endLineNumber > selection.startLineNumber) {
					collapseRanges.push({
						startLineNumber: selection.startLineNumber,
						endLineNumber: endLineNumber,
						type: undefined,
						isCollapsed: true,
						source: FoldSource.userDefined
					});
					editor.setSelection({
						startLineNumber: selection.startLineNumber,
						startColumn: 1,
						endLineNumber: selection.startLineNumber,
						endColumn: 1
					});
				}
			}
			if (collapseRanges.length > 0) {
				collapseRanges.sort((a, b) => {
					return a.startLineNumber - b.startLineNumber;
				});
				const newRanges = FoldingRegions.sanitizeAndMerge(foldingModel.regions, collapseRanges, editor.getModel()?.getLineCount());
				foldingModel.updatePost(FoldingRegions.fromFoldRanges(newRanges));
			}
		}
	}
}

class RemoveFoldRangeFromSelectionAction extends FoldingAction<void> {

	constructor() {
		super({
			id: 'editor.removeManualFoldingRanges',
			label: nls.localize2('removeManualFoldingRanges.label', "Remove Manual Folding Ranges"),
			precondition: CONTEXT_FOLDING_ENABLED,
			kbOpts: {
				kbExpr: EditorContextKeys.editorTextFocus,
				primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KeyK, KeyMod.CtrlCmd | KeyCode.Period),
				weight: KeybindingWeight.EditorContrib
			}
		});
	}

	invoke(foldingController: FoldingController, foldingModel: FoldingModel, editor: ICodeEditor): void {
		const selections = editor.getSelections();
		if (selections) {
			const ranges: ILineRange[] = [];
			for (const selection of selections) {
				const { startLineNumber, endLineNumber } = selection;
				ranges.push(endLineNumber >= startLineNumber ? { startLineNumber, endLineNumber } : { endLineNumber, startLineNumber });
			}
			foldingModel.removeManualRanges(ranges);
			foldingController.triggerFoldingModelChanged();
		}
	}
}


class ToggleImportFoldAction extends FoldingAction<void> {

	constructor() {
		super({
			id: 'editor.toggleImportFold',
			label: nls.localize2('toggleImportFold.label', "Toggle Import Fold"),
			precondition: CONTEXT_FOLDING_ENABLED,
			kbOpts: {
				kbExpr: EditorContextKeys.editorTextFocus,
				weight: KeybindingWeight.EditorContrib
			}
		});
	}

	async invoke(foldingController: FoldingController, foldingModel: FoldingModel): Promise<void> {
		const regionsToToggle: FoldingRegion[] = [];
		const regions = foldingModel.regions;
		for (let i = regions.length - 1; i >= 0; i--) {
			if (regions.getType(i) === FoldingRangeKind.Imports.value) {
				regionsToToggle.push(regions.toRegion(i));
			}
		}
		foldingModel.toggleCollapseState(regionsToToggle);
		foldingController.triggerFoldingModelChanged();
	}
}


registerEditorContribution(FoldingController.ID, FoldingController, EditorContributionInstantiation.Eager); // eager because it uses `saveViewState`/`restoreViewState`
registerEditorAction(UnfoldAction);
registerEditorAction(UnFoldRecursivelyAction);
registerEditorAction(FoldAction);
registerEditorAction(FoldRecursivelyAction);
registerEditorAction(ToggleFoldRecursivelyAction);
registerEditorAction(FoldAllAction);
registerEditorAction(UnfoldAllAction);
registerEditorAction(FoldAllBlockCommentsAction);
registerEditorAction(FoldAllRegionsAction);
registerEditorAction(UnfoldAllRegionsAction);
registerEditorAction(FoldAllExceptAction);
registerEditorAction(UnfoldAllExceptAction);
registerEditorAction(ToggleFoldAction);
registerEditorAction(GotoParentFoldAction);
registerEditorAction(GotoPreviousFoldAction);
registerEditorAction(GotoNextFoldAction);
registerEditorAction(FoldRangeFromSelectionAction);
registerEditorAction(RemoveFoldRangeFromSelectionAction);
registerEditorAction(ToggleImportFoldAction);

for (let i = 1; i <= 7; i++) {
	registerInstantiatedEditorAction(
		new FoldLevelAction({
			id: FoldLevelAction.ID(i),
			label: nls.localize2('foldLevelAction.label', "Fold Level {0}", i),
			precondition: CONTEXT_FOLDING_ENABLED,
			kbOpts: {
				kbExpr: EditorContextKeys.editorTextFocus,
				primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KeyK, KeyMod.CtrlCmd | (KeyCode.Digit0 + i)),
				weight: KeybindingWeight.EditorContrib
			}
		})
	);
}

CommandsRegistry.registerCommand('_executeFoldingRangeProvider', async function (accessor, ...args) {
	const [resource] = args;
	if (!(resource instanceof URI)) {
		throw illegalArgument();
	}

	const languageFeaturesService = accessor.get(ILanguageFeaturesService);

	const model = accessor.get(IModelService).getModel(resource);
	if (!model) {
		throw illegalArgument();
	}

	const configurationService = accessor.get(IConfigurationService);
	if (!configurationService.getValue('editor.folding', { resource })) {
		return [];
	}

	const languageConfigurationService = accessor.get(ILanguageConfigurationService);

	const strategy = configurationService.getValue('editor.foldingStrategy', { resource });
	const foldingLimitReporter = {
		get limit() {
			return configurationService.getValue<number>('editor.foldingMaximumRegions', { resource });
		},
		update: (computed: number, limited: number | false) => { }
	};

	const indentRangeProvider = new IndentRangeProvider(model, languageConfigurationService, foldingLimitReporter);
	let rangeProvider: RangeProvider = indentRangeProvider;
	if (strategy !== 'indentation') {
		const providers = FoldingController.getFoldingRangeProviders(languageFeaturesService, model);
		if (providers.length) {
			rangeProvider = new SyntaxRangeProvider(model, providers, () => { }, foldingLimitReporter, indentRangeProvider);
		}
	}
	const ranges = await rangeProvider.compute(CancellationToken.None);
	const result: FoldingRange[] = [];
	try {
		if (ranges) {
			for (let i = 0; i < ranges.length; i++) {
				const type = ranges.getType(i);
				result.push({ start: ranges.getStartLineNumber(i), end: ranges.getEndLineNumber(i), kind: type ? FoldingRangeKind.fromValue(type) : undefined });
			}
		}
		return result;
	} finally {
		rangeProvider.dispose();
	}
});
