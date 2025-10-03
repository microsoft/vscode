/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Delayer } from '../../../../base/common/async.js';
import { KeyCode, KeyMod } from '../../../../base/common/keyCodes.js';
import { Disposable, DisposableStore } from '../../../../base/common/lifecycle.js';
import * as strings from '../../../../base/common/strings.js';
import { ICodeEditor } from '../../../browser/editorBrowser.js';
import { EditorAction, EditorCommand, EditorContributionInstantiation, MultiEditorAction, registerEditorAction, registerEditorCommand, registerEditorContribution, registerMultiEditorAction, ServicesAccessor } from '../../../browser/editorExtensions.js';
import { EditorOption } from '../../../common/config/editorOptions.js';
import { overviewRulerRangeHighlight } from '../../../common/core/editorColorRegistry.js';
import { IRange } from '../../../common/core/range.js';
import { IEditorContribution } from '../../../common/editorCommon.js';
import { EditorContextKeys } from '../../../common/editorContextKeys.js';
import { OverviewRulerLane } from '../../../common/model.js';
import { CONTEXT_FIND_INPUT_FOCUSED, CONTEXT_FIND_WIDGET_VISIBLE, CONTEXT_REPLACE_INPUT_FOCUSED, FindModelBoundToEditorModel, FIND_IDS, ToggleCaseSensitiveKeybinding, TogglePreserveCaseKeybinding, ToggleRegexKeybinding, ToggleSearchScopeKeybinding, ToggleWholeWordKeybinding } from './findModel.js';
import { FindOptionsWidget } from './findOptionsWidget.js';
import { FindReplaceState, FindReplaceStateChangedEvent, INewFindReplaceState } from './findState.js';
import { FindWidget, IFindController } from './findWidget.js';
import * as nls from '../../../../nls.js';
import { MenuId } from '../../../../platform/actions/common/actions.js';
import { IClipboardService } from '../../../../platform/clipboard/common/clipboardService.js';
import { ContextKeyExpr, IContextKey, IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IContextViewService } from '../../../../platform/contextview/browser/contextView.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { KeybindingWeight } from '../../../../platform/keybinding/common/keybindingsRegistry.js';
import { INotificationService, Severity } from '../../../../platform/notification/common/notification.js';
import { IQuickInputService } from '../../../../platform/quickinput/common/quickInput.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { themeColorFromId } from '../../../../platform/theme/common/themeService.js';
import { Selection } from '../../../common/core/selection.js';
import { IHoverService } from '../../../../platform/hover/browser/hover.js';
import { FindWidgetSearchHistory } from './findWidgetSearchHistory.js';
import { ReplaceWidgetHistory } from './replaceWidgetHistory.js';

const SEARCH_STRING_MAX_LENGTH = 524288;

export function getSelectionSearchString(editor: ICodeEditor, seedSearchStringFromSelection: 'single' | 'multiple' = 'single', seedSearchStringFromNonEmptySelection: boolean = false): string | null {
	if (!editor.hasModel()) {
		return null;
	}

	const selection = editor.getSelection();
	// if selection spans multiple lines, default search string to empty

	if ((seedSearchStringFromSelection === 'single' && selection.startLineNumber === selection.endLineNumber)
		|| seedSearchStringFromSelection === 'multiple') {
		if (selection.isEmpty()) {
			const wordAtPosition = editor.getConfiguredWordAtPosition(selection.getStartPosition());
			if (wordAtPosition && (false === seedSearchStringFromNonEmptySelection)) {
				return wordAtPosition.word;
			}
		} else {
			if (editor.getModel().getValueLengthInRange(selection) < SEARCH_STRING_MAX_LENGTH) {
				return editor.getModel().getValueInRange(selection);
			}
		}
	}

	return null;
}

export const enum FindStartFocusAction {
	NoFocusChange,
	FocusFindInput,
	FocusReplaceInput
}

export interface IFindStartOptions {
	forceRevealReplace: boolean;
	seedSearchStringFromSelection: 'none' | 'single' | 'multiple';
	seedSearchStringFromNonEmptySelection: boolean;
	seedSearchStringFromGlobalClipboard: boolean;
	shouldFocus: FindStartFocusAction;
	shouldAnimate: boolean;
	updateSearchScope: boolean;
	loop: boolean;
}

export interface IFindStartArguments {
	searchString?: string;
	replaceString?: string;
	isRegex?: boolean;
	matchWholeWord?: boolean;
	isCaseSensitive?: boolean;
	preserveCase?: boolean;
	findInSelection?: boolean;
}

export class CommonFindController extends Disposable implements IEditorContribution {

	public static readonly ID = 'editor.contrib.findController';

	protected _editor: ICodeEditor;
	private readonly _findWidgetVisible: IContextKey<boolean>;
	protected _state: FindReplaceState;
	protected _updateHistoryDelayer: Delayer<void>;
	private _model: FindModelBoundToEditorModel | null;
	protected readonly _storageService: IStorageService;
	private readonly _clipboardService: IClipboardService;
	protected readonly _contextKeyService: IContextKeyService;
	protected readonly _notificationService: INotificationService;
	protected readonly _hoverService: IHoverService;

	get editor() {
		return this._editor;
	}

	public static get(editor: ICodeEditor): CommonFindController | null {
		return editor.getContribution<CommonFindController>(CommonFindController.ID);
	}

	constructor(
		editor: ICodeEditor,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IStorageService storageService: IStorageService,
		@IClipboardService clipboardService: IClipboardService,
		@INotificationService notificationService: INotificationService,
		@IHoverService hoverService: IHoverService
	) {
		super();
		this._editor = editor;
		this._findWidgetVisible = CONTEXT_FIND_WIDGET_VISIBLE.bindTo(contextKeyService);
		this._contextKeyService = contextKeyService;
		this._storageService = storageService;
		this._clipboardService = clipboardService;
		this._notificationService = notificationService;
		this._hoverService = hoverService;

		this._updateHistoryDelayer = new Delayer<void>(500);
		this._state = this._register(new FindReplaceState());
		this.loadQueryState();
		this._register(this._state.onFindReplaceStateChange((e) => this._onStateChanged(e)));

		this._model = null;

		this._register(this._editor.onDidChangeModel(() => {
			const shouldRestartFind = (this._editor.getModel() && this._state.isRevealed);

			this.disposeModel();

			this._state.change({
				searchScope: null,
				matchCase: this._storageService.getBoolean('editor.matchCase', StorageScope.WORKSPACE, false),
				wholeWord: this._storageService.getBoolean('editor.wholeWord', StorageScope.WORKSPACE, false),
				isRegex: this._storageService.getBoolean('editor.isRegex', StorageScope.WORKSPACE, false),
				preserveCase: this._storageService.getBoolean('editor.preserveCase', StorageScope.WORKSPACE, false)
			}, false);

			if (shouldRestartFind) {
				this._start({
					forceRevealReplace: false,
					seedSearchStringFromSelection: 'none',
					seedSearchStringFromNonEmptySelection: false,
					seedSearchStringFromGlobalClipboard: false,
					shouldFocus: FindStartFocusAction.NoFocusChange,
					shouldAnimate: false,
					updateSearchScope: false,
					loop: this._editor.getOption(EditorOption.find).loop
				});
			}
		}));
	}

	public override dispose(): void {
		this.disposeModel();
		super.dispose();
	}

	private disposeModel(): void {
		if (this._model) {
			this._model.dispose();
			this._model = null;
		}
	}

	private _onStateChanged(e: FindReplaceStateChangedEvent): void {
		this.saveQueryState(e);

		if (e.isRevealed) {
			if (this._state.isRevealed) {
				this._findWidgetVisible.set(true);
			} else {
				this._findWidgetVisible.reset();
				this.disposeModel();
			}
		}
		if (e.searchString) {
			this.setGlobalBufferTerm(this._state.searchString);
		}
	}

	private saveQueryState(e: FindReplaceStateChangedEvent) {
		if (e.isRegex) {
			this._storageService.store('editor.isRegex', this._state.actualIsRegex, StorageScope.WORKSPACE, StorageTarget.MACHINE);
		}
		if (e.wholeWord) {
			this._storageService.store('editor.wholeWord', this._state.actualWholeWord, StorageScope.WORKSPACE, StorageTarget.MACHINE);
		}
		if (e.matchCase) {
			this._storageService.store('editor.matchCase', this._state.actualMatchCase, StorageScope.WORKSPACE, StorageTarget.MACHINE);
		}
		if (e.preserveCase) {
			this._storageService.store('editor.preserveCase', this._state.actualPreserveCase, StorageScope.WORKSPACE, StorageTarget.MACHINE);
		}
	}

	private loadQueryState() {
		this._state.change({
			matchCase: this._storageService.getBoolean('editor.matchCase', StorageScope.WORKSPACE, this._state.matchCase),
			wholeWord: this._storageService.getBoolean('editor.wholeWord', StorageScope.WORKSPACE, this._state.wholeWord),
			isRegex: this._storageService.getBoolean('editor.isRegex', StorageScope.WORKSPACE, this._state.isRegex),
			preserveCase: this._storageService.getBoolean('editor.preserveCase', StorageScope.WORKSPACE, this._state.preserveCase)
		}, false);
	}

	public isFindInputFocused(): boolean {
		return !!CONTEXT_FIND_INPUT_FOCUSED.getValue(this._contextKeyService);
	}

	public getState(): FindReplaceState {
		return this._state;
	}

	public closeFindWidget(): void {
		this._state.change({
			isRevealed: false,
			searchScope: null
		}, false);
		this._editor.focus();
	}

	public toggleCaseSensitive(): void {
		this._state.change({ matchCase: !this._state.matchCase }, false);
		if (!this._state.isRevealed) {
			this.highlightFindOptions();
		}
	}

	public toggleWholeWords(): void {
		this._state.change({ wholeWord: !this._state.wholeWord }, false);
		if (!this._state.isRevealed) {
			this.highlightFindOptions();
		}
	}

	public toggleRegex(): void {
		this._state.change({ isRegex: !this._state.isRegex }, false);
		if (!this._state.isRevealed) {
			this.highlightFindOptions();
		}
	}

	public togglePreserveCase(): void {
		this._state.change({ preserveCase: !this._state.preserveCase }, false);
		if (!this._state.isRevealed) {
			this.highlightFindOptions();
		}
	}

	public toggleSearchScope(): void {
		if (this._state.searchScope) {
			this._state.change({ searchScope: null }, true);
		} else {
			if (this._editor.hasModel()) {
				let selections = this._editor.getSelections();
				selections = selections.map(selection => {
					if (selection.endColumn === 1 && selection.endLineNumber > selection.startLineNumber) {
						selection = selection.setEndPosition(
							selection.endLineNumber - 1,
							this._editor.getModel()!.getLineMaxColumn(selection.endLineNumber - 1)
						);
					}
					if (!selection.isEmpty()) {
						return selection;
					}
					return null;
				}).filter((element): element is Selection => !!element);

				if (selections.length) {
					this._state.change({ searchScope: selections }, true);
				}
			}
		}
	}

	public setSearchString(searchString: string): void {
		if (this._state.isRegex) {
			searchString = strings.escapeRegExpCharacters(searchString);
		}
		this._state.change({ searchString: searchString }, false);
	}

	public highlightFindOptions(ignoreWhenVisible: boolean = false): void {
		// overwritten in subclass
	}

	protected async _start(opts: IFindStartOptions, newState?: INewFindReplaceState): Promise<void> {
		this.disposeModel();

		if (!this._editor.hasModel()) {
			// cannot do anything with an editor that doesn't have a model...
			return;
		}

		const stateChanges: INewFindReplaceState = {
			...newState,
			isRevealed: true
		};

		if (opts.seedSearchStringFromSelection === 'single') {
			const selectionSearchString = getSelectionSearchString(this._editor, opts.seedSearchStringFromSelection, opts.seedSearchStringFromNonEmptySelection);
			if (selectionSearchString) {
				if (this._state.isRegex) {
					stateChanges.searchString = strings.escapeRegExpCharacters(selectionSearchString);
				} else {
					stateChanges.searchString = selectionSearchString;
				}
			}
		} else if (opts.seedSearchStringFromSelection === 'multiple' && !opts.updateSearchScope) {
			const selectionSearchString = getSelectionSearchString(this._editor, opts.seedSearchStringFromSelection);
			if (selectionSearchString) {
				stateChanges.searchString = selectionSearchString;
			}
		}

		if (!stateChanges.searchString && opts.seedSearchStringFromGlobalClipboard) {
			const selectionSearchString = await this.getGlobalBufferTerm();

			if (!this._editor.hasModel()) {
				// the editor has lost its model in the meantime
				return;
			}

			if (selectionSearchString) {
				stateChanges.searchString = selectionSearchString;
			}
		}

		// Overwrite isReplaceRevealed
		if (opts.forceRevealReplace || stateChanges.isReplaceRevealed) {
			stateChanges.isReplaceRevealed = true;
		} else if (!this._findWidgetVisible.get()) {
			stateChanges.isReplaceRevealed = false;
		}

		if (opts.updateSearchScope) {
			const currentSelections = this._editor.getSelections();
			if (currentSelections.some(selection => !selection.isEmpty())) {
				stateChanges.searchScope = currentSelections;
			}
		}

		stateChanges.loop = opts.loop;

		this._state.change(stateChanges, false);

		if (!this._model) {
			this._model = new FindModelBoundToEditorModel(this._editor, this._state);
		}
	}

	public start(opts: IFindStartOptions, newState?: INewFindReplaceState): Promise<void> {
		return this._start(opts, newState);
	}

	public moveToNextMatch(): boolean {
		if (this._model) {
			this._model.moveToNextMatch();
			return true;
		}
		return false;
	}

	public moveToPrevMatch(): boolean {
		if (this._model) {
			this._model.moveToPrevMatch();
			return true;
		}
		return false;
	}

	public goToMatch(index: number): boolean {
		if (this._model) {
			this._model.moveToMatch(index);
			return true;
		}
		return false;
	}

	public replace(): boolean {
		if (this._model) {
			this._model.replace();
			return true;
		}
		return false;
	}

	public replaceAll(): boolean {
		if (this._model) {
			if (this._editor.getModel()?.isTooLargeForHeapOperation()) {
				this._notificationService.warn(nls.localize('too.large.for.replaceall', "The file is too large to perform a replace all operation."));
				return false;
			}
			this._model.replaceAll();
			return true;
		}
		return false;
	}

	public selectAllMatches(): boolean {
		if (this._model) {
			this._model.selectAllMatches();
			this._editor.focus();
			return true;
		}
		return false;
	}

	public async getGlobalBufferTerm(): Promise<string> {
		if (this._editor.getOption(EditorOption.find).globalFindClipboard
			&& this._editor.hasModel()
			&& !this._editor.getModel().isTooLargeForSyncing()
		) {
			return this._clipboardService.readFindText();
		}
		return '';
	}

	public setGlobalBufferTerm(text: string): void {
		if (this._editor.getOption(EditorOption.find).globalFindClipboard
			&& this._editor.hasModel()
			&& !this._editor.getModel().isTooLargeForSyncing()
		) {
			// intentionally not awaited
			this._clipboardService.writeFindText(text);
		}
	}
}

export class FindController extends CommonFindController implements IFindController {

	private _widget: FindWidget | null;
	private _findOptionsWidget: FindOptionsWidget | null;
	private _findWidgetSearchHistory: FindWidgetSearchHistory;
	private _replaceWidgetHistory: ReplaceWidgetHistory;

	constructor(
		editor: ICodeEditor,
		@IContextViewService private readonly _contextViewService: IContextViewService,
		@IContextKeyService _contextKeyService: IContextKeyService,
		@IKeybindingService private readonly _keybindingService: IKeybindingService,
		@INotificationService notificationService: INotificationService,
		@IStorageService _storageService: IStorageService,
		@IClipboardService clipboardService: IClipboardService,
		@IHoverService hoverService: IHoverService,
	) {
		super(editor, _contextKeyService, _storageService, clipboardService, notificationService, hoverService);
		this._widget = null;
		this._findOptionsWidget = null;
		this._findWidgetSearchHistory = FindWidgetSearchHistory.getOrCreate(_storageService);
		this._replaceWidgetHistory = ReplaceWidgetHistory.getOrCreate(_storageService);
	}

	protected override async _start(opts: IFindStartOptions, newState?: INewFindReplaceState): Promise<void> {
		if (!this._widget) {
			this._createFindWidget();
		}

		const selection = this._editor.getSelection();
		let updateSearchScope = false;

		switch (this._editor.getOption(EditorOption.find).autoFindInSelection) {
			case 'always':
				updateSearchScope = true;
				break;
			case 'never':
				updateSearchScope = false;
				break;
			case 'multiline': {
				const isSelectionMultipleLine = !!selection && selection.startLineNumber !== selection.endLineNumber;
				updateSearchScope = isSelectionMultipleLine;
				break;
			}
			default:
				break;
		}

		opts.updateSearchScope = opts.updateSearchScope || updateSearchScope;

		await super._start(opts, newState);

		if (this._widget) {
			if (opts.shouldFocus === FindStartFocusAction.FocusReplaceInput) {
				this._widget.focusReplaceInput();
			} else if (opts.shouldFocus === FindStartFocusAction.FocusFindInput) {
				this._widget.focusFindInput();
			}
		}
	}

	public override highlightFindOptions(ignoreWhenVisible: boolean = false): void {
		if (!this._widget) {
			this._createFindWidget();
		}
		if (this._state.isRevealed && !ignoreWhenVisible) {
			this._widget!.highlightFindOptions();
		} else {
			this._findOptionsWidget!.highlightFindOptions();
		}
	}

	private _createFindWidget() {
		this._widget = this._register(new FindWidget(this._editor, this, this._state, this._contextViewService, this._keybindingService, this._contextKeyService, this._hoverService, this._findWidgetSearchHistory, this._replaceWidgetHistory));
		this._findOptionsWidget = this._register(new FindOptionsWidget(this._editor, this._state, this._keybindingService));
	}

	saveViewState(): any {
		return this._widget?.getViewState();
	}

	restoreViewState(state: any): void {
		this._widget?.setViewState(state);
	}
}

export const StartFindAction = registerMultiEditorAction(new MultiEditorAction({
	id: FIND_IDS.StartFindAction,
	label: nls.localize2('startFindAction', "Find"),
	precondition: ContextKeyExpr.or(EditorContextKeys.focus, ContextKeyExpr.has('editorIsOpen')),
	kbOpts: {
		kbExpr: null,
		primary: KeyMod.CtrlCmd | KeyCode.KeyF,
		weight: KeybindingWeight.EditorContrib
	},
	menuOpts: {
		menuId: MenuId.MenubarEditMenu,
		group: '3_find',
		title: nls.localize({ key: 'miFind', comment: ['&& denotes a mnemonic'] }, "&&Find"),
		order: 1
	}
}));

StartFindAction.addImplementation(0, (accessor: ServicesAccessor, editor: ICodeEditor, args: any): boolean | Promise<void> => {
	const controller = CommonFindController.get(editor);
	if (!controller) {
		return false;
	}
	return controller.start({
		forceRevealReplace: false,
		seedSearchStringFromSelection: editor.getOption(EditorOption.find).seedSearchStringFromSelection !== 'never' ? 'single' : 'none',
		seedSearchStringFromNonEmptySelection: editor.getOption(EditorOption.find).seedSearchStringFromSelection === 'selection',
		seedSearchStringFromGlobalClipboard: editor.getOption(EditorOption.find).globalFindClipboard,
		shouldFocus: FindStartFocusAction.FocusFindInput,
		shouldAnimate: true,
		updateSearchScope: false,
		loop: editor.getOption(EditorOption.find).loop
	});
});

const findArgDescription = {
	description: 'Open a new In-Editor Find Widget.',
	args: [{
		name: 'Open a new In-Editor Find Widget args',
		schema: {
			properties: {
				searchString: { type: 'string' },
				replaceString: { type: 'string' },
				isRegex: { type: 'boolean' },
				matchWholeWord: { type: 'boolean' },
				isCaseSensitive: { type: 'boolean' },
				preserveCase: { type: 'boolean' },
				findInSelection: { type: 'boolean' },
			}
		}
	}]
} as const;

export class StartFindWithArgsAction extends EditorAction {

	constructor() {
		super({
			id: FIND_IDS.StartFindWithArgs,
			label: nls.localize2('startFindWithArgsAction', "Find with Arguments"),
			precondition: undefined,
			kbOpts: {
				kbExpr: null,
				primary: 0,
				weight: KeybindingWeight.EditorContrib
			},
			metadata: findArgDescription
		});
	}

	public async run(accessor: ServicesAccessor, editor: ICodeEditor, args?: IFindStartArguments): Promise<void> {
		const controller = CommonFindController.get(editor);
		if (controller) {
			const newState: INewFindReplaceState = args ? {
				searchString: args.searchString,
				replaceString: args.replaceString,
				isReplaceRevealed: args.replaceString !== undefined,
				isRegex: args.isRegex,
				// isRegexOverride: args.regexOverride,
				wholeWord: args.matchWholeWord,
				// wholeWordOverride: args.wholeWordOverride,
				matchCase: args.isCaseSensitive,
				// matchCaseOverride: args.matchCaseOverride,
				preserveCase: args.preserveCase,
				// preserveCaseOverride: args.preserveCaseOverride,
			} : {};

			await controller.start({
				forceRevealReplace: false,
				seedSearchStringFromSelection: (controller.getState().searchString.length === 0) && editor.getOption(EditorOption.find).seedSearchStringFromSelection !== 'never' ? 'single' : 'none',
				seedSearchStringFromNonEmptySelection: editor.getOption(EditorOption.find).seedSearchStringFromSelection === 'selection',
				seedSearchStringFromGlobalClipboard: true,
				shouldFocus: FindStartFocusAction.FocusFindInput,
				shouldAnimate: true,
				updateSearchScope: args?.findInSelection || false,
				loop: editor.getOption(EditorOption.find).loop
			}, newState);

			controller.setGlobalBufferTerm(controller.getState().searchString);
		}
	}
}

export class StartFindWithSelectionAction extends EditorAction {

	constructor() {
		super({
			id: FIND_IDS.StartFindWithSelection,
			label: nls.localize2('startFindWithSelectionAction', "Find with Selection"),
			precondition: undefined,
			kbOpts: {
				kbExpr: null,
				primary: 0,
				mac: {
					primary: KeyMod.CtrlCmd | KeyCode.KeyE,
				},
				weight: KeybindingWeight.EditorContrib
			}
		});
	}

	public async run(accessor: ServicesAccessor, editor: ICodeEditor): Promise<void> {
		const controller = CommonFindController.get(editor);
		if (controller) {
			await controller.start({
				forceRevealReplace: false,
				seedSearchStringFromSelection: 'multiple',
				seedSearchStringFromNonEmptySelection: false,
				seedSearchStringFromGlobalClipboard: false,
				shouldFocus: FindStartFocusAction.NoFocusChange,
				shouldAnimate: true,
				updateSearchScope: false,
				loop: editor.getOption(EditorOption.find).loop
			});

			controller.setGlobalBufferTerm(controller.getState().searchString);
		}
	}
}
export abstract class MatchFindAction extends EditorAction {
	public async run(accessor: ServicesAccessor, editor: ICodeEditor): Promise<void> {
		const controller = CommonFindController.get(editor);
		if (controller && !this._run(controller)) {
			await controller.start({
				forceRevealReplace: false,
				seedSearchStringFromSelection: (controller.getState().searchString.length === 0) && editor.getOption(EditorOption.find).seedSearchStringFromSelection !== 'never' ? 'single' : 'none',
				seedSearchStringFromNonEmptySelection: editor.getOption(EditorOption.find).seedSearchStringFromSelection === 'selection',
				seedSearchStringFromGlobalClipboard: true,
				shouldFocus: FindStartFocusAction.NoFocusChange,
				shouldAnimate: true,
				updateSearchScope: false,
				loop: editor.getOption(EditorOption.find).loop
			});
			this._run(controller);
		}
	}

	protected abstract _run(controller: CommonFindController): boolean;
}

export class NextMatchFindAction extends MatchFindAction {

	constructor() {
		super({
			id: FIND_IDS.NextMatchFindAction,
			label: nls.localize2('findNextMatchAction', "Find Next"),
			precondition: undefined,
			kbOpts: [{
				kbExpr: EditorContextKeys.focus,
				primary: KeyCode.F3,
				mac: { primary: KeyMod.CtrlCmd | KeyCode.KeyG, secondary: [KeyCode.F3] },
				weight: KeybindingWeight.EditorContrib
			}, {
				kbExpr: ContextKeyExpr.and(EditorContextKeys.focus, CONTEXT_FIND_INPUT_FOCUSED),
				primary: KeyCode.Enter,
				weight: KeybindingWeight.EditorContrib
			}]
		});
	}

	protected _run(controller: CommonFindController): boolean {
		const result = controller.moveToNextMatch();
		if (result) {
			controller.editor.pushUndoStop();
			return true;
		}

		return false;
	}
}


export class PreviousMatchFindAction extends MatchFindAction {

	constructor() {
		super({
			id: FIND_IDS.PreviousMatchFindAction,
			label: nls.localize2('findPreviousMatchAction', "Find Previous"),
			precondition: undefined,
			kbOpts: [{
				kbExpr: EditorContextKeys.focus,
				primary: KeyMod.Shift | KeyCode.F3,
				mac: { primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyG, secondary: [KeyMod.Shift | KeyCode.F3] },
				weight: KeybindingWeight.EditorContrib
			}, {
				kbExpr: ContextKeyExpr.and(EditorContextKeys.focus, CONTEXT_FIND_INPUT_FOCUSED),
				primary: KeyMod.Shift | KeyCode.Enter,
				weight: KeybindingWeight.EditorContrib
			}
			]
		});
	}

	protected _run(controller: CommonFindController): boolean {
		return controller.moveToPrevMatch();
	}
}

export class MoveToMatchFindAction extends EditorAction {

	private _highlightDecorations: string[] = [];
	constructor() {
		super({
			id: FIND_IDS.GoToMatchFindAction,
			label: nls.localize2('findMatchAction.goToMatch', "Go to Match..."),
			precondition: CONTEXT_FIND_WIDGET_VISIBLE
		});
	}

	public run(accessor: ServicesAccessor, editor: ICodeEditor, args: any): void | Promise<void> {
		const controller = CommonFindController.get(editor);
		if (!controller) {
			return;
		}

		const matchesCount = controller.getState().matchesCount;
		if (matchesCount < 1) {
			const notificationService = accessor.get(INotificationService);
			notificationService.notify({
				severity: Severity.Warning,
				message: nls.localize('findMatchAction.noResults', "No matches. Try searching for something else.")
			});
			return;
		}

		const quickInputService = accessor.get(IQuickInputService);
		const disposables = new DisposableStore();
		const inputBox = disposables.add(quickInputService.createInputBox());
		inputBox.placeholder = nls.localize('findMatchAction.inputPlaceHolder', "Type a number to go to a specific match (between 1 and {0})", matchesCount);

		const toFindMatchIndex = (value: string): number | undefined => {
			const index = parseInt(value);
			if (isNaN(index)) {
				return undefined;
			}

			const matchCount = controller.getState().matchesCount;
			if (index > 0 && index <= matchCount) {
				return index - 1; // zero based
			} else if (index < 0 && index >= -matchCount) {
				return matchCount + index;
			}

			return undefined;
		};

		const updatePickerAndEditor = (value: string) => {
			const index = toFindMatchIndex(value);
			if (typeof index === 'number') {
				// valid
				inputBox.validationMessage = undefined;
				controller.goToMatch(index);
				const currentMatch = controller.getState().currentMatch;
				if (currentMatch) {
					this.addDecorations(editor, currentMatch);
				}
			} else {
				inputBox.validationMessage = nls.localize('findMatchAction.inputValidationMessage', "Please type a number between 1 and {0}", controller.getState().matchesCount);
				this.clearDecorations(editor);
			}
		};
		disposables.add(inputBox.onDidChangeValue(value => {
			updatePickerAndEditor(value);
		}));

		disposables.add(inputBox.onDidAccept(() => {
			const index = toFindMatchIndex(inputBox.value);
			if (typeof index === 'number') {
				controller.goToMatch(index);
				inputBox.hide();
			} else {
				inputBox.validationMessage = nls.localize('findMatchAction.inputValidationMessage', "Please type a number between 1 and {0}", controller.getState().matchesCount);
			}
		}));

		disposables.add(inputBox.onDidHide(() => {
			this.clearDecorations(editor);
			disposables.dispose();
		}));

		inputBox.show();
	}

	private clearDecorations(editor: ICodeEditor): void {
		editor.changeDecorations(changeAccessor => {
			this._highlightDecorations = changeAccessor.deltaDecorations(this._highlightDecorations, []);
		});
	}

	private addDecorations(editor: ICodeEditor, range: IRange): void {
		editor.changeDecorations(changeAccessor => {
			this._highlightDecorations = changeAccessor.deltaDecorations(this._highlightDecorations, [
				{
					range,
					options: {
						description: 'find-match-quick-access-range-highlight',
						className: 'rangeHighlight',
						isWholeLine: true
					}
				},
				{
					range,
					options: {
						description: 'find-match-quick-access-range-highlight-overview',
						overviewRuler: {
							color: themeColorFromId(overviewRulerRangeHighlight),
							position: OverviewRulerLane.Full
						}
					}
				}
			]);
		});
	}
}

export abstract class SelectionMatchFindAction extends EditorAction {
	public async run(accessor: ServicesAccessor, editor: ICodeEditor): Promise<void> {
		const controller = CommonFindController.get(editor);
		if (!controller) {
			return;
		}

		const selectionSearchString = getSelectionSearchString(editor, 'single', false);
		if (selectionSearchString) {
			controller.setSearchString(selectionSearchString);
		}
		if (!this._run(controller)) {
			await controller.start({
				forceRevealReplace: false,
				seedSearchStringFromSelection: 'none',
				seedSearchStringFromNonEmptySelection: false,
				seedSearchStringFromGlobalClipboard: false,
				shouldFocus: FindStartFocusAction.NoFocusChange,
				shouldAnimate: true,
				updateSearchScope: false,
				loop: editor.getOption(EditorOption.find).loop
			});
			this._run(controller);
		}
	}

	protected abstract _run(controller: CommonFindController): boolean;
}

export class NextSelectionMatchFindAction extends SelectionMatchFindAction {

	constructor() {
		super({
			id: FIND_IDS.NextSelectionMatchFindAction,
			label: nls.localize2('nextSelectionMatchFindAction', "Find Next Selection"),
			precondition: undefined,
			kbOpts: {
				kbExpr: EditorContextKeys.focus,
				primary: KeyMod.CtrlCmd | KeyCode.F3,
				weight: KeybindingWeight.EditorContrib
			}
		});
	}

	protected _run(controller: CommonFindController): boolean {
		return controller.moveToNextMatch();
	}
}

export class PreviousSelectionMatchFindAction extends SelectionMatchFindAction {

	constructor() {
		super({
			id: FIND_IDS.PreviousSelectionMatchFindAction,
			label: nls.localize2('previousSelectionMatchFindAction', "Find Previous Selection"),
			precondition: undefined,
			kbOpts: {
				kbExpr: EditorContextKeys.focus,
				primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.F3,
				weight: KeybindingWeight.EditorContrib
			}
		});
	}

	protected _run(controller: CommonFindController): boolean {
		return controller.moveToPrevMatch();
	}
}

export const StartFindReplaceAction = registerMultiEditorAction(new MultiEditorAction({
	id: FIND_IDS.StartFindReplaceAction,
	label: nls.localize2('startReplace', "Replace"),
	precondition: ContextKeyExpr.or(EditorContextKeys.focus, ContextKeyExpr.has('editorIsOpen')),
	kbOpts: {
		kbExpr: null,
		primary: KeyMod.CtrlCmd | KeyCode.KeyH,
		mac: { primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.KeyF },
		weight: KeybindingWeight.EditorContrib
	},
	menuOpts: {
		menuId: MenuId.MenubarEditMenu,
		group: '3_find',
		title: nls.localize({ key: 'miReplace', comment: ['&& denotes a mnemonic'] }, "&&Replace"),
		order: 2
	}
}));

StartFindReplaceAction.addImplementation(0, (accessor: ServicesAccessor, editor: ICodeEditor, args: any): boolean | Promise<void> => {
	if (!editor.hasModel() || editor.getOption(EditorOption.readOnly)) {
		return false;
	}
	const controller = CommonFindController.get(editor);
	if (!controller) {
		return false;
	}

	const currentSelection = editor.getSelection();
	const findInputFocused = controller.isFindInputFocused();
	// we only seed search string from selection when the current selection is single line and not empty,
	// + the find input is not focused
	const seedSearchStringFromSelection = !currentSelection.isEmpty()
		&& currentSelection.startLineNumber === currentSelection.endLineNumber
		&& (editor.getOption(EditorOption.find).seedSearchStringFromSelection !== 'never')
		&& !findInputFocused;
	/*
	* if the existing search string in find widget is empty and we don't seed search string from selection, it means the Find Input is still empty, so we should focus the Find Input instead of Replace Input.

	* findInputFocused true -> seedSearchStringFromSelection false, FocusReplaceInput
	* findInputFocused false, seedSearchStringFromSelection true FocusReplaceInput
	* findInputFocused false seedSearchStringFromSelection false FocusFindInput
	*/
	const shouldFocus = (findInputFocused || seedSearchStringFromSelection) ?
		FindStartFocusAction.FocusReplaceInput : FindStartFocusAction.FocusFindInput;

	return controller.start({
		forceRevealReplace: true,
		seedSearchStringFromSelection: seedSearchStringFromSelection ? 'single' : 'none',
		seedSearchStringFromNonEmptySelection: editor.getOption(EditorOption.find).seedSearchStringFromSelection === 'selection',
		seedSearchStringFromGlobalClipboard: editor.getOption(EditorOption.find).seedSearchStringFromSelection !== 'never',
		shouldFocus: shouldFocus,
		shouldAnimate: true,
		updateSearchScope: false,
		loop: editor.getOption(EditorOption.find).loop
	});
});

registerEditorContribution(CommonFindController.ID, FindController, EditorContributionInstantiation.Eager); // eager because it uses `saveViewState`/`restoreViewState`

registerEditorAction(StartFindWithArgsAction);
registerEditorAction(StartFindWithSelectionAction);
registerEditorAction(NextMatchFindAction);
registerEditorAction(PreviousMatchFindAction);
registerEditorAction(MoveToMatchFindAction);
registerEditorAction(NextSelectionMatchFindAction);
registerEditorAction(PreviousSelectionMatchFindAction);

const FindCommand = EditorCommand.bindToContribution<CommonFindController>(CommonFindController.get);

registerEditorCommand(new FindCommand({
	id: FIND_IDS.CloseFindWidgetCommand,
	precondition: CONTEXT_FIND_WIDGET_VISIBLE,
	handler: x => x.closeFindWidget(),
	kbOpts: {
		weight: KeybindingWeight.EditorContrib + 5,
		kbExpr: ContextKeyExpr.and(EditorContextKeys.focus, ContextKeyExpr.not('isComposing')),
		primary: KeyCode.Escape,
		secondary: [KeyMod.Shift | KeyCode.Escape]
	}
}));

registerEditorCommand(new FindCommand({
	id: FIND_IDS.ToggleCaseSensitiveCommand,
	precondition: undefined,
	handler: x => x.toggleCaseSensitive(),
	kbOpts: {
		weight: KeybindingWeight.EditorContrib + 5,
		kbExpr: EditorContextKeys.focus,
		primary: ToggleCaseSensitiveKeybinding.primary,
		mac: ToggleCaseSensitiveKeybinding.mac,
		win: ToggleCaseSensitiveKeybinding.win,
		linux: ToggleCaseSensitiveKeybinding.linux
	}
}));

registerEditorCommand(new FindCommand({
	id: FIND_IDS.ToggleWholeWordCommand,
	precondition: undefined,
	handler: x => x.toggleWholeWords(),
	kbOpts: {
		weight: KeybindingWeight.EditorContrib + 5,
		kbExpr: EditorContextKeys.focus,
		primary: ToggleWholeWordKeybinding.primary,
		mac: ToggleWholeWordKeybinding.mac,
		win: ToggleWholeWordKeybinding.win,
		linux: ToggleWholeWordKeybinding.linux
	}
}));

registerEditorCommand(new FindCommand({
	id: FIND_IDS.ToggleRegexCommand,
	precondition: undefined,
	handler: x => x.toggleRegex(),
	kbOpts: {
		weight: KeybindingWeight.EditorContrib + 5,
		kbExpr: EditorContextKeys.focus,
		primary: ToggleRegexKeybinding.primary,
		mac: ToggleRegexKeybinding.mac,
		win: ToggleRegexKeybinding.win,
		linux: ToggleRegexKeybinding.linux
	}
}));

registerEditorCommand(new FindCommand({
	id: FIND_IDS.ToggleSearchScopeCommand,
	precondition: undefined,
	handler: x => x.toggleSearchScope(),
	kbOpts: {
		weight: KeybindingWeight.EditorContrib + 5,
		kbExpr: EditorContextKeys.focus,
		primary: ToggleSearchScopeKeybinding.primary,
		mac: ToggleSearchScopeKeybinding.mac,
		win: ToggleSearchScopeKeybinding.win,
		linux: ToggleSearchScopeKeybinding.linux
	}
}));

registerEditorCommand(new FindCommand({
	id: FIND_IDS.TogglePreserveCaseCommand,
	precondition: undefined,
	handler: x => x.togglePreserveCase(),
	kbOpts: {
		weight: KeybindingWeight.EditorContrib + 5,
		kbExpr: EditorContextKeys.focus,
		primary: TogglePreserveCaseKeybinding.primary,
		mac: TogglePreserveCaseKeybinding.mac,
		win: TogglePreserveCaseKeybinding.win,
		linux: TogglePreserveCaseKeybinding.linux
	}
}));

registerEditorCommand(new FindCommand({
	id: FIND_IDS.ReplaceOneAction,
	precondition: CONTEXT_FIND_WIDGET_VISIBLE,
	handler: x => x.replace(),
	kbOpts: {
		weight: KeybindingWeight.EditorContrib + 5,
		kbExpr: EditorContextKeys.focus,
		primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.Digit1
	}
}));

registerEditorCommand(new FindCommand({
	id: FIND_IDS.ReplaceOneAction,
	precondition: CONTEXT_FIND_WIDGET_VISIBLE,
	handler: x => x.replace(),
	kbOpts: {
		weight: KeybindingWeight.EditorContrib + 5,
		kbExpr: ContextKeyExpr.and(EditorContextKeys.focus, CONTEXT_REPLACE_INPUT_FOCUSED),
		primary: KeyCode.Enter
	}
}));

registerEditorCommand(new FindCommand({
	id: FIND_IDS.ReplaceAllAction,
	precondition: CONTEXT_FIND_WIDGET_VISIBLE,
	handler: x => x.replaceAll(),
	kbOpts: {
		weight: KeybindingWeight.EditorContrib + 5,
		kbExpr: EditorContextKeys.focus,
		primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.Enter
	}
}));

registerEditorCommand(new FindCommand({
	id: FIND_IDS.ReplaceAllAction,
	precondition: CONTEXT_FIND_WIDGET_VISIBLE,
	handler: x => x.replaceAll(),
	kbOpts: {
		weight: KeybindingWeight.EditorContrib + 5,
		kbExpr: ContextKeyExpr.and(EditorContextKeys.focus, CONTEXT_REPLACE_INPUT_FOCUSED),
		primary: undefined,
		mac: {
			primary: KeyMod.CtrlCmd | KeyCode.Enter,
		}
	}
}));

registerEditorCommand(new FindCommand({
	id: FIND_IDS.SelectAllMatchesAction,
	precondition: CONTEXT_FIND_WIDGET_VISIBLE,
	handler: x => x.selectAllMatches(),
	kbOpts: {
		weight: KeybindingWeight.EditorContrib + 5,
		kbExpr: EditorContextKeys.focus,
		primary: KeyMod.Alt | KeyCode.Enter
	}
}));
