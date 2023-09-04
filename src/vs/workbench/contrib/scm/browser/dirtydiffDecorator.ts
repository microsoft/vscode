/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vs/nls';

import 'vs/css!./media/dirtydiffDecorator';
import { ThrottledDelayer } from 'vs/base/common/async';
import { IDisposable, dispose, toDisposable, Disposable, DisposableStore } from 'vs/base/common/lifecycle';
import { Event, Emitter } from 'vs/base/common/event';
import * as ext from 'vs/workbench/common/contributions';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IResolvedTextEditorModel, ITextModelService } from 'vs/editor/common/services/resolverService';
import { IEditorWorkerService } from 'vs/editor/common/services/editorWorker';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { URI } from 'vs/base/common/uri';
import { ISCMService, ISCMRepository } from 'vs/workbench/contrib/scm/common/scm';
import { ModelDecorationOptions } from 'vs/editor/common/model/textModel';
import { IColorTheme, themeColorFromId, IThemeService } from 'vs/platform/theme/common/themeService';
import { editorErrorForeground, registerColor, transparent } from 'vs/platform/theme/common/colorRegistry';
import { ICodeEditor, IEditorMouseEvent, isCodeEditor, MouseTargetType } from 'vs/editor/browser/editorBrowser';
import { registerEditorAction, registerEditorContribution, ServicesAccessor, EditorAction, EditorContributionInstantiation } from 'vs/editor/browser/editorExtensions';
import { PeekViewWidget, getOuterEditor, peekViewBorder, peekViewTitleBackground, peekViewTitleForeground, peekViewTitleInfoForeground } from 'vs/editor/contrib/peekView/browser/peekView';
import { IContextKeyService, IContextKey, ContextKeyExpr, RawContextKey } from 'vs/platform/contextkey/common/contextkey';
import { EditorContextKeys } from 'vs/editor/common/editorContextKeys';
import { KeyCode, KeyMod } from 'vs/base/common/keyCodes';
import { Position } from 'vs/editor/common/core/position';
import { Range } from 'vs/editor/common/core/range';
import { rot } from 'vs/base/common/numbers';
import { KeybindingsRegistry, KeybindingWeight } from 'vs/platform/keybinding/common/keybindingsRegistry';
import { EmbeddedDiffEditorWidget } from 'vs/editor/browser/widget/embeddedCodeEditorWidget';
import { IDiffEditorOptions, EditorOption } from 'vs/editor/common/config/editorOptions';
import { Action, IAction, ActionRunner } from 'vs/base/common/actions';
import { IActionBarOptions } from 'vs/base/browser/ui/actionbar/actionbar';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { basename } from 'vs/base/common/resources';
import { MenuId, IMenuService, IMenu, MenuItemAction, MenuRegistry } from 'vs/platform/actions/common/actions';
import { createAndFillInActionBarActions } from 'vs/platform/actions/browser/menuEntryActionViewItem';
import { IEditorModel, ScrollType, IEditorContribution, IDiffEditorModel } from 'vs/editor/common/editorCommon';
import { OverviewRulerLane, ITextModel, IModelDecorationOptions, MinimapPosition, shouldSynchronizeModel } from 'vs/editor/common/model';
import { equals, sortedDiff } from 'vs/base/common/arrays';
import { ICodeEditorService } from 'vs/editor/browser/services/codeEditorService';
import { ISplice } from 'vs/base/common/sequence';
import * as dom from 'vs/base/browser/dom';
import { EncodingMode, ITextFileEditorModel, IResolvedTextFileEditorModel, ITextFileService, isTextFileEditorModel } from 'vs/workbench/services/textfile/common/textfiles';
import { gotoNextLocation, gotoPreviousLocation } from 'vs/platform/theme/common/iconRegistry';
import { Codicon } from 'vs/base/common/codicons';
import { ThemeIcon } from 'vs/base/common/themables';
import { onUnexpectedError } from 'vs/base/common/errors';
import { TextCompareEditorActiveContext } from 'vs/workbench/common/contextkeys';
import { IProgressService, ProgressLocation } from 'vs/platform/progress/common/progress';
import { IChange } from 'vs/editor/common/diff/legacyLinesDiffComputer';
import { Color } from 'vs/base/common/color';
import { ResourceMap } from 'vs/base/common/map';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { DEFAULT_EDITOR_ASSOCIATION } from 'vs/workbench/common/editor';
import { FILE_EDITOR_INPUT_ID } from 'vs/workbench/contrib/files/common/files';
import { AudioCue, IAudioCueService } from 'vs/platform/audioCues/browser/audioCueService';
import { IAccessibilityService } from 'vs/platform/accessibility/common/accessibility';
import { IQuickDiffService, QuickDiff } from 'vs/workbench/contrib/scm/common/quickDiff';
import { IQuickDiffSelectItem, SwitchQuickDiffBaseAction, SwitchQuickDiffViewItem } from 'vs/workbench/contrib/scm/browser/dirtyDiffSwitcher';

class DiffActionRunner extends ActionRunner {

	protected override runAction(action: IAction, context: any): Promise<any> {
		if (action instanceof MenuItemAction) {
			return action.run(...context);
		}

		return super.runAction(action, context);
	}
}

export interface IModelRegistry {
	getModel(editorModel: IEditorModel): DirtyDiffModel | undefined;
}

export interface DirtyDiffContribution extends IEditorContribution {
	getChanges(): IChange[];
}

export const isDirtyDiffVisible = new RawContextKey<boolean>('dirtyDiffVisible', false);

function getChangeHeight(change: IChange): number {
	const modified = change.modifiedEndLineNumber - change.modifiedStartLineNumber + 1;
	const original = change.originalEndLineNumber - change.originalStartLineNumber + 1;

	if (change.originalEndLineNumber === 0) {
		return modified;
	} else if (change.modifiedEndLineNumber === 0) {
		return original;
	} else {
		return modified + original;
	}
}

function getModifiedEndLineNumber(change: IChange): number {
	if (change.modifiedEndLineNumber === 0) {
		return change.modifiedStartLineNumber === 0 ? 1 : change.modifiedStartLineNumber;
	} else {
		return change.modifiedEndLineNumber;
	}
}

function lineIntersectsChange(lineNumber: number, change: IChange): boolean {
	// deletion at the beginning of the file
	if (lineNumber === 1 && change.modifiedStartLineNumber === 0 && change.modifiedEndLineNumber === 0) {
		return true;
	}

	return lineNumber >= change.modifiedStartLineNumber && lineNumber <= (change.modifiedEndLineNumber || change.modifiedStartLineNumber);
}

class UIEditorAction extends Action {

	private editor: ICodeEditor;
	private action: EditorAction;
	private instantiationService: IInstantiationService;

	constructor(
		editor: ICodeEditor,
		action: EditorAction,
		cssClass: string,
		@IKeybindingService keybindingService: IKeybindingService,
		@IInstantiationService instantiationService: IInstantiationService
	) {
		const keybinding = keybindingService.lookupKeybinding(action.id);
		const label = action.label + (keybinding ? ` (${keybinding.getLabel()})` : '');

		super(action.id, label, cssClass);

		this.instantiationService = instantiationService;
		this.action = action;
		this.editor = editor;
	}

	override run(): Promise<any> {
		return Promise.resolve(this.instantiationService.invokeFunction(accessor => this.action.run(accessor, this.editor, null)));
	}
}

enum ChangeType {
	Modify,
	Add,
	Delete
}

function getChangeType(change: IChange): ChangeType {
	if (change.originalEndLineNumber === 0) {
		return ChangeType.Add;
	} else if (change.modifiedEndLineNumber === 0) {
		return ChangeType.Delete;
	} else {
		return ChangeType.Modify;
	}
}

function getChangeTypeColor(theme: IColorTheme, changeType: ChangeType): Color | undefined {
	switch (changeType) {
		case ChangeType.Modify: return theme.getColor(editorGutterModifiedBackground);
		case ChangeType.Add: return theme.getColor(editorGutterAddedBackground);
		case ChangeType.Delete: return theme.getColor(editorGutterDeletedBackground);
	}
}

function getOuterEditorFromDiffEditor(accessor: ServicesAccessor): ICodeEditor | null {
	const diffEditors = accessor.get(ICodeEditorService).listDiffEditors();

	for (const diffEditor of diffEditors) {
		if (diffEditor.hasTextFocus() && diffEditor instanceof EmbeddedDiffEditorWidget) {
			return diffEditor.getParentEditor();
		}
	}

	return getOuterEditor(accessor);
}

class DirtyDiffWidget extends PeekViewWidget {

	private diffEditor!: EmbeddedDiffEditorWidget;
	private title: string;
	private menu: IMenu | undefined;
	private _index: number = 0;
	private _provider: string = '';
	private change: IChange | undefined;
	private height: number | undefined = undefined;
	private dropdown: SwitchQuickDiffViewItem | undefined;
	private dropdownContainer: HTMLElement | undefined;

	constructor(
		editor: ICodeEditor,
		private model: DirtyDiffModel,
		@IThemeService private readonly themeService: IThemeService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IMenuService private readonly menuService: IMenuService,
		@IContextKeyService private contextKeyService: IContextKeyService
	) {
		super(editor, { isResizeable: true, frameWidth: 1, keepEditorSelection: true, className: 'dirty-diff' }, instantiationService);

		this._disposables.add(themeService.onDidColorThemeChange(this._applyTheme, this));
		this._applyTheme(themeService.getColorTheme());

		if (this.model.original.length > 0) {
			contextKeyService = contextKeyService.createOverlay([['originalResourceScheme', this.model.original[0].uri.scheme], ['originalResourceSchemes', this.model.original.map(original => original.uri.scheme)]]);
		}

		this.create();
		if (editor.hasModel()) {
			this.title = basename(editor.getModel().uri);
		} else {
			this.title = '';
		}
		this.setTitle(this.title);
	}

	get provider(): string {
		return this._provider;
	}

	get index(): number {
		return this._index;
	}

	get visibleRange(): Range | undefined {
		const visibleRanges = this.diffEditor.getModifiedEditor().getVisibleRanges();
		return visibleRanges.length >= 0 ? visibleRanges[0] : undefined;
	}

	showChange(index: number, usePosition: boolean = true): void {
		const labeledChange = this.model.changes[index];
		const change = labeledChange.change;
		this._index = index;
		this.contextKeyService.createKey('originalResourceScheme', this.model.changes[index].uri.scheme);
		this.updateActions();

		this._provider = labeledChange.label;
		this.change = change;

		const originalModel = this.model.original;

		if (!originalModel) {
			return;
		}

		const onFirstDiffUpdate = Event.once(this.diffEditor.onDidUpdateDiff);

		// TODO@joao TODO@alex need this setTimeout probably because the
		// non-side-by-side diff still hasn't created the view zones
		onFirstDiffUpdate(() => setTimeout(() => this.revealChange(change), 0));

		const diffEditorModel = this.model.getDiffEditorModel(labeledChange.uri.toString());
		if (!diffEditorModel) {
			return;
		}
		this.diffEditor.setModel(diffEditorModel);
		this.dropdown?.setSelection(labeledChange.label);

		const position = new Position(getModifiedEndLineNumber(change), 1);

		const lineHeight = this.editor.getOption(EditorOption.lineHeight);
		const editorHeight = this.editor.getLayoutInfo().height;
		const editorHeightInLines = Math.floor(editorHeight / lineHeight);
		const height = Math.min(getChangeHeight(change) + /* padding */ 8, Math.floor(editorHeightInLines / 3));

		this.renderTitle(labeledChange.label);

		const changeType = getChangeType(change);
		const changeTypeColor = getChangeTypeColor(this.themeService.getColorTheme(), changeType);
		this.style({ frameColor: changeTypeColor, arrowColor: changeTypeColor });

		const providerSpecificChanges: IChange[] = [];
		let contextIndex = index;
		for (const change of this.model.changes) {
			if (change.label === this.model.changes[this._index].label) {
				providerSpecificChanges.push(change.change);
				if (labeledChange === change) {
					contextIndex = providerSpecificChanges.length - 1;
				}
			}
		}
		this._actionbarWidget!.context = [diffEditorModel.modified.uri, providerSpecificChanges, contextIndex];
		if (usePosition) {
			this.show(position, height);
		}
		this.editor.focus();
	}

	private renderTitle(label: string): void {
		const providerChanges = this.model.mapChanges.get(label)!;
		const providerIndex = providerChanges.indexOf(this._index);

		let detail: string;
		if (!this.shouldUseDropdown()) {
			detail = this.model.changes.length > 1
				? nls.localize('changes', "{0} - {1} of {2} changes", label, providerIndex + 1, providerChanges.length)
				: nls.localize('change', "{0} - {1} of {2} change", label, providerIndex + 1, providerChanges.length);
			this.dropdownContainer!.style.display = 'none';
		} else {
			detail = this.model.changes.length > 1
				? nls.localize('multiChanges', "{0} of {1} changes", providerIndex + 1, providerChanges.length)
				: nls.localize('multiChange', "{0} of {1} change", providerIndex + 1, providerChanges.length);
			this.dropdownContainer!.style.display = 'inherit';
		}

		this.setTitle(this.title, detail);
	}

	private switchQuickDiff(event?: IQuickDiffSelectItem) {
		const newProvider = event?.provider;
		if (newProvider === this.model.changes[this._index].label) {
			return;
		}
		let closestGreaterIndex = this._index < this.model.changes.length - 1 ? this._index + 1 : 0;
		for (let i = closestGreaterIndex; i !== this._index; i < this.model.changes.length - 1 ? i++ : i = 0) {
			if (this.model.changes[i].label === newProvider) {
				closestGreaterIndex = i;
				break;
			}
		}
		let closestLesserIndex = this._index > 0 ? this._index - 1 : this.model.changes.length - 1;
		for (let i = closestLesserIndex; i !== this._index; i >= 0 ? i-- : i = this.model.changes.length - 1) {
			if (this.model.changes[i].label === newProvider) {
				closestLesserIndex = i;
				break;
			}
		}
		const closestIndex = Math.abs(this.model.changes[closestGreaterIndex].change.modifiedEndLineNumber - this.model.changes[this._index].change.modifiedEndLineNumber)
			< Math.abs(this.model.changes[closestLesserIndex].change.modifiedEndLineNumber - this.model.changes[this._index].change.modifiedEndLineNumber)
			? closestGreaterIndex : closestLesserIndex;
		this.showChange(closestIndex, false);
	}

	private shouldUseDropdown(): boolean {
		let providersWithChangesCount = 0;
		if (this.model.mapChanges.size > 1) {
			const keys = Array.from(this.model.mapChanges.keys());
			for (let i = 0; (i < keys.length) && (providersWithChangesCount <= 1); i++) {
				if (this.model.mapChanges.get(keys[i])!.length > 0) {
					providersWithChangesCount++;
				}
			}
		}
		return providersWithChangesCount >= 2;
	}

	private updateActions(): void {
		if (!this._actionbarWidget) {
			return;
		}
		const previous = this.instantiationService.createInstance(UIEditorAction, this.editor, new ShowPreviousChangeAction(this.editor), ThemeIcon.asClassName(gotoPreviousLocation));
		const next = this.instantiationService.createInstance(UIEditorAction, this.editor, new ShowNextChangeAction(this.editor), ThemeIcon.asClassName(gotoNextLocation));

		this._disposables.add(previous);
		this._disposables.add(next);

		const actions: IAction[] = [];
		if (this.menu) {
			this.menu.dispose();
		}
		this.menu = this.menuService.createMenu(MenuId.SCMChangeContext, this.contextKeyService);
		createAndFillInActionBarActions(this.menu, { shouldForwardArgs: true }, actions);
		this._actionbarWidget.clear();
		this._actionbarWidget.push(actions.reverse(), { label: false, icon: true });
		this._actionbarWidget.push([next, previous], { label: false, icon: true });
		this._actionbarWidget.push(new Action('peekview.close', nls.localize('label.close', "Close"), ThemeIcon.asClassName(Codicon.close), true, () => this.dispose()), { label: false, icon: true });
	}

	protected override _fillHead(container: HTMLElement): void {
		super._fillHead(container, true);

		this.dropdownContainer = dom.prepend(this._titleElement!, dom.$('.dropdown'));
		this.dropdown = this.instantiationService.createInstance(SwitchQuickDiffViewItem, new SwitchQuickDiffBaseAction((event?: IQuickDiffSelectItem) => this.switchQuickDiff(event)),
			this.model.quickDiffs.map(quickDiffer => quickDiffer.label), this.model.changes[this._index].label);
		this.dropdown.render(this.dropdownContainer);
		this.updateActions();
	}

	protected override _getActionBarOptions(): IActionBarOptions {
		const actionRunner = new DiffActionRunner();

		// close widget on successful action
		actionRunner.onDidRun(e => {
			if (!(e.action instanceof UIEditorAction) && !e.error) {
				this.dispose();
			}
		});

		return {
			...super._getActionBarOptions(),
			actionRunner
		};
	}

	protected _fillBody(container: HTMLElement): void {
		const options: IDiffEditorOptions = {
			scrollBeyondLastLine: true,
			scrollbar: {
				verticalScrollbarSize: 14,
				horizontal: 'auto',
				useShadows: true,
				verticalHasArrows: false,
				horizontalHasArrows: false
			},
			overviewRulerLanes: 2,
			fixedOverflowWidgets: true,
			minimap: { enabled: false },
			renderSideBySide: false,
			readOnly: false,
			renderIndicators: false,
			diffAlgorithm: 'advanced',
			stickyScroll: { enabled: false }
		};

		this.diffEditor = this.instantiationService.createInstance(EmbeddedDiffEditorWidget, container, options, {}, this.editor);
		this._disposables.add(this.diffEditor);
	}

	protected override _onWidth(width: number): void {
		if (typeof this.height === 'undefined') {
			return;
		}

		this.diffEditor.layout({ height: this.height, width });
	}

	protected override _doLayoutBody(height: number, width: number): void {
		super._doLayoutBody(height, width);
		this.diffEditor.layout({ height, width });

		if (typeof this.height === 'undefined' && this.change) {
			this.revealChange(this.change);
		}

		this.height = height;
	}

	private revealChange(change: IChange): void {
		let start: number, end: number;

		if (change.modifiedEndLineNumber === 0) { // deletion
			start = change.modifiedStartLineNumber;
			end = change.modifiedStartLineNumber + 1;
		} else if (change.originalEndLineNumber > 0) { // modification
			start = change.modifiedStartLineNumber - 1;
			end = change.modifiedEndLineNumber + 1;
		} else { // insertion
			start = change.modifiedStartLineNumber;
			end = change.modifiedEndLineNumber;
		}

		this.diffEditor.revealLinesInCenter(start, end, ScrollType.Immediate);
	}

	private _applyTheme(theme: IColorTheme) {
		const borderColor = theme.getColor(peekViewBorder) || Color.transparent;
		this.style({
			arrowColor: borderColor,
			frameColor: borderColor,
			headerBackgroundColor: theme.getColor(peekViewTitleBackground) || Color.transparent,
			primaryHeadingColor: theme.getColor(peekViewTitleForeground),
			secondaryHeadingColor: theme.getColor(peekViewTitleInfoForeground)
		});
	}

	protected override revealRange(range: Range) {
		this.editor.revealLineInCenterIfOutsideViewport(range.endLineNumber, ScrollType.Smooth);
	}

	override hasFocus(): boolean {
		return this.diffEditor.hasTextFocus();
	}

	override dispose() {
		super.dispose();
		this.menu?.dispose();
	}
}

export class ShowPreviousChangeAction extends EditorAction {

	constructor(private readonly outerEditor?: ICodeEditor) {
		super({
			id: 'editor.action.dirtydiff.previous',
			label: nls.localize('show previous change', "Show Previous Change"),
			alias: 'Show Previous Change',
			precondition: TextCompareEditorActiveContext.toNegated(),
			kbOpts: { kbExpr: EditorContextKeys.editorTextFocus, primary: KeyMod.Shift | KeyMod.Alt | KeyCode.F3, weight: KeybindingWeight.EditorContrib }
		});
	}

	run(accessor: ServicesAccessor): void {
		const outerEditor = this.outerEditor ?? getOuterEditorFromDiffEditor(accessor);

		if (!outerEditor) {
			return;
		}

		const controller = DirtyDiffController.get(outerEditor);

		if (!controller) {
			return;
		}

		if (!controller.canNavigate()) {
			return;
		}

		controller.previous();
	}
}
registerEditorAction(ShowPreviousChangeAction);

export class ShowNextChangeAction extends EditorAction {

	constructor(private readonly outerEditor?: ICodeEditor) {
		super({
			id: 'editor.action.dirtydiff.next',
			label: nls.localize('show next change', "Show Next Change"),
			alias: 'Show Next Change',
			precondition: TextCompareEditorActiveContext.toNegated(),
			kbOpts: { kbExpr: EditorContextKeys.editorTextFocus, primary: KeyMod.Alt | KeyCode.F3, weight: KeybindingWeight.EditorContrib }
		});
	}

	run(accessor: ServicesAccessor): void {
		const outerEditor = this.outerEditor ?? getOuterEditorFromDiffEditor(accessor);

		if (!outerEditor) {
			return;
		}

		const controller = DirtyDiffController.get(outerEditor);

		if (!controller) {
			return;
		}

		if (!controller.canNavigate()) {
			return;
		}

		controller.next();
	}
}
registerEditorAction(ShowNextChangeAction);

// Go to menu
MenuRegistry.appendMenuItem(MenuId.MenubarGoMenu, {
	group: '7_change_nav',
	command: {
		id: 'editor.action.dirtydiff.next',
		title: nls.localize({ key: 'miGotoNextChange', comment: ['&& denotes a mnemonic'] }, "Next &&Change")
	},
	order: 1
});

MenuRegistry.appendMenuItem(MenuId.MenubarGoMenu, {
	group: '7_change_nav',
	command: {
		id: 'editor.action.dirtydiff.previous',
		title: nls.localize({ key: 'miGotoPreviousChange', comment: ['&& denotes a mnemonic'] }, "Previous &&Change")
	},
	order: 2
});

export class GotoPreviousChangeAction extends EditorAction {

	constructor() {
		super({
			id: 'workbench.action.editor.previousChange',
			label: nls.localize('move to previous change', "Go to Previous Change"),
			alias: 'Go to Previous Change',
			precondition: TextCompareEditorActiveContext.toNegated(),
			kbOpts: { kbExpr: EditorContextKeys.editorTextFocus, primary: KeyMod.Shift | KeyMod.Alt | KeyCode.F5, weight: KeybindingWeight.EditorContrib }
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const outerEditor = getOuterEditorFromDiffEditor(accessor);
		const audioCueService = accessor.get(IAudioCueService);
		const accessibilityService = accessor.get(IAccessibilityService);
		const codeEditorService = accessor.get(ICodeEditorService);

		if (!outerEditor || !outerEditor.hasModel()) {
			return;
		}

		const controller = DirtyDiffController.get(outerEditor);

		if (!controller || !controller.modelRegistry) {
			return;
		}

		const lineNumber = outerEditor.getPosition().lineNumber;
		const model = controller.modelRegistry.getModel(outerEditor.getModel());
		if (!model || model.changes.length === 0) {
			return;
		}

		const index = model.findPreviousClosestChange(lineNumber, false);
		const change = model.changes[index];
		await playAudioCueForChange(change.change, audioCueService);
		setPositionAndSelection(change.change, outerEditor, accessibilityService, codeEditorService);
	}
}
registerEditorAction(GotoPreviousChangeAction);

export class GotoNextChangeAction extends EditorAction {

	constructor() {
		super({
			id: 'workbench.action.editor.nextChange',
			label: nls.localize('move to next change', "Go to Next Change"),
			alias: 'Go to Next Change',
			precondition: TextCompareEditorActiveContext.toNegated(),
			kbOpts: { kbExpr: EditorContextKeys.editorTextFocus, primary: KeyMod.Alt | KeyCode.F5, weight: KeybindingWeight.EditorContrib }
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const audioCueService = accessor.get(IAudioCueService);
		const outerEditor = getOuterEditorFromDiffEditor(accessor);
		const accessibilityService = accessor.get(IAccessibilityService);
		const codeEditorService = accessor.get(ICodeEditorService);

		if (!outerEditor || !outerEditor.hasModel()) {
			return;
		}

		const controller = DirtyDiffController.get(outerEditor);

		if (!controller || !controller.modelRegistry) {
			return;
		}

		const lineNumber = outerEditor.getPosition().lineNumber;
		const model = controller.modelRegistry.getModel(outerEditor.getModel());

		if (!model || model.changes.length === 0) {
			return;
		}

		const index = model.findNextClosestChange(lineNumber, false);
		const change = model.changes[index].change;
		await playAudioCueForChange(change, audioCueService);
		setPositionAndSelection(change, outerEditor, accessibilityService, codeEditorService);
	}
}

function setPositionAndSelection(change: IChange, editor: ICodeEditor, accessibilityService: IAccessibilityService, codeEditorService: ICodeEditorService) {
	const position = new Position(change.modifiedStartLineNumber, 1);
	editor.setPosition(position);
	editor.revealPositionInCenter(position);
	if (accessibilityService.isScreenReaderOptimized()) {
		editor.setSelection({ startLineNumber: change.modifiedStartLineNumber, startColumn: 0, endLineNumber: change.modifiedStartLineNumber, endColumn: Number.MAX_VALUE });
		codeEditorService.getActiveCodeEditor()?.writeScreenReaderContent('diff-navigation');
	}
}

async function playAudioCueForChange(change: IChange, audioCueService: IAudioCueService) {
	const changeType = getChangeType(change);
	switch (changeType) {
		case ChangeType.Add:
			audioCueService.playAudioCue(AudioCue.diffLineInserted, { allowManyInParallel: true, source: 'dirtyDiffDecoration' });
			break;
		case ChangeType.Delete:
			audioCueService.playAudioCue(AudioCue.diffLineDeleted, { allowManyInParallel: true, source: 'dirtyDiffDecoration' });
			break;
		case ChangeType.Modify:
			audioCueService.playAudioCue(AudioCue.diffLineModified, { allowManyInParallel: true, source: 'dirtyDiffDecoration' });
			break;
	}
}

registerEditorAction(GotoNextChangeAction);

KeybindingsRegistry.registerCommandAndKeybindingRule({
	id: 'closeDirtyDiff',
	weight: KeybindingWeight.EditorContrib + 50,
	primary: KeyCode.Escape,
	secondary: [KeyMod.Shift | KeyCode.Escape],
	when: ContextKeyExpr.and(isDirtyDiffVisible),
	handler: (accessor: ServicesAccessor) => {
		const outerEditor = getOuterEditorFromDiffEditor(accessor);

		if (!outerEditor) {
			return;
		}

		const controller = DirtyDiffController.get(outerEditor);

		if (!controller) {
			return;
		}

		controller.close();
	}
});

export class DirtyDiffController extends Disposable implements DirtyDiffContribution {

	public static readonly ID = 'editor.contrib.dirtydiff';

	static get(editor: ICodeEditor): DirtyDiffController | null {
		return editor.getContribution<DirtyDiffController>(DirtyDiffController.ID);
	}

	modelRegistry: IModelRegistry | null = null;

	private model: DirtyDiffModel | null = null;
	private widget: DirtyDiffWidget | null = null;
	private readonly isDirtyDiffVisible!: IContextKey<boolean>;
	private session: IDisposable = Disposable.None;
	private mouseDownInfo: { lineNumber: number } | null = null;
	private enabled = false;
	private gutterActionDisposables = new DisposableStore();
	private stylesheet: HTMLStyleElement;

	constructor(
		private editor: ICodeEditor,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IInstantiationService private readonly instantiationService: IInstantiationService
	) {
		super();
		this.enabled = !contextKeyService.getContextKeyValue('isInDiffEditor');
		this.stylesheet = dom.createStyleSheet();
		this._register(toDisposable(() => this.stylesheet.remove()));

		if (this.enabled) {
			this.isDirtyDiffVisible = isDirtyDiffVisible.bindTo(contextKeyService);
			this._register(editor.onDidChangeModel(() => this.close()));

			const onDidChangeGutterAction = Event.filter(configurationService.onDidChangeConfiguration, e => e.affectsConfiguration('scm.diffDecorationsGutterAction'));
			this._register(onDidChangeGutterAction(this.onDidChangeGutterAction, this));
			this.onDidChangeGutterAction();
		}
	}

	private onDidChangeGutterAction(): void {
		const gutterAction = this.configurationService.getValue<'diff' | 'none'>('scm.diffDecorationsGutterAction');

		this.gutterActionDisposables.dispose();
		this.gutterActionDisposables = new DisposableStore();

		if (gutterAction === 'diff') {
			this.gutterActionDisposables.add(this.editor.onMouseDown(e => this.onEditorMouseDown(e)));
			this.gutterActionDisposables.add(this.editor.onMouseUp(e => this.onEditorMouseUp(e)));
			this.stylesheet.textContent = `
				.monaco-editor .dirty-diff-glyph {
					cursor: pointer;
				}

				.monaco-editor .margin-view-overlays .dirty-diff-glyph:hover::before {
					height: 100%;
					width: 6px;
					left: -6px;
				}

				.monaco-editor .margin-view-overlays .dirty-diff-deleted:hover::after {
					bottom: 0;
					border-top-width: 0;
					border-bottom-width: 0;
				}
			`;
		} else {
			this.stylesheet.textContent = ``;
		}
	}

	canNavigate(): boolean {
		return !this.widget || (this.widget?.index === -1) || (!!this.model && this.model.changes.length > 1);
	}

	refresh(): void {
		this.widget?.showChange(this.widget.index, false);
	}

	next(lineNumber?: number): void {
		if (!this.assertWidget()) {
			return;
		}
		if (!this.widget || !this.model) {
			return;
		}

		let index: number;
		if (this.editor.hasModel() && (typeof lineNumber === 'number' || !this.widget.provider)) {
			index = this.model.findNextClosestChange(typeof lineNumber === 'number' ? lineNumber : this.editor.getPosition().lineNumber, true, this.widget.provider);
		} else {
			const providerChanges: number[] = this.model.mapChanges.get(this.widget.provider) ?? this.model.mapChanges.values().next().value;
			const mapIndex = providerChanges.findIndex(value => value === this.widget!.index);
			index = providerChanges[rot(mapIndex + 1, providerChanges.length)];
		}

		this.widget.showChange(index);
	}

	previous(lineNumber?: number): void {
		if (!this.assertWidget()) {
			return;
		}
		if (!this.widget || !this.model) {
			return;
		}

		let index: number;
		if (this.editor.hasModel() && (typeof lineNumber === 'number')) {
			index = this.model.findPreviousClosestChange(typeof lineNumber === 'number' ? lineNumber : this.editor.getPosition().lineNumber, true, this.widget.provider);
		} else {
			const providerChanges: number[] = this.model.mapChanges.get(this.widget.provider) ?? this.model.mapChanges.values().next().value;
			const mapIndex = providerChanges.findIndex(value => value === this.widget!.index);
			index = providerChanges[rot(mapIndex - 1, providerChanges.length)];
		}

		this.widget.showChange(index);
	}

	close(): void {
		this.session.dispose();
		this.session = Disposable.None;
	}

	private assertWidget(): boolean {
		if (!this.enabled) {
			return false;
		}

		if (this.widget) {
			if (!this.model || this.model.changes.length === 0) {
				this.close();
				return false;
			}

			return true;
		}

		if (!this.modelRegistry) {
			return false;
		}

		const editorModel = this.editor.getModel();

		if (!editorModel) {
			return false;
		}

		const model = this.modelRegistry.getModel(editorModel);

		if (!model) {
			return false;
		}

		if (model.changes.length === 0) {
			return false;
		}

		this.model = model;
		this.widget = this.instantiationService.createInstance(DirtyDiffWidget, this.editor, model);
		this.isDirtyDiffVisible.set(true);

		const disposables = new DisposableStore();
		disposables.add(Event.once(this.widget.onDidClose)(this.close, this));
		Event.chain(model.onDidChange)
			.filter(e => e.diff.length > 0)
			.map(e => e.diff)
			.event(this.onDidModelChange, this, disposables);

		disposables.add(this.widget);
		disposables.add(toDisposable(() => {
			this.model = null;
			this.widget = null;
			this.isDirtyDiffVisible.set(false);
			this.editor.focus();
		}));

		this.session = disposables;
		return true;
	}

	private onDidModelChange(splices: ISplice<LabeledChange>[]): void {
		if (!this.model || !this.widget || this.widget.hasFocus()) {
			return;
		}

		for (const splice of splices) {
			if (splice.start <= this.widget.index) {
				this.next();
				return;
			}
		}

		this.refresh();
	}

	private onEditorMouseDown(e: IEditorMouseEvent): void {
		this.mouseDownInfo = null;

		const range = e.target.range;

		if (!range) {
			return;
		}

		if (!e.event.leftButton) {
			return;
		}

		if (e.target.type !== MouseTargetType.GUTTER_LINE_DECORATIONS) {
			return;
		}
		if (!e.target.element) {
			return;
		}
		if (e.target.element.className.indexOf('dirty-diff-glyph') < 0) {
			return;
		}

		const data = e.target.detail;
		const offsetLeftInGutter = e.target.element.offsetLeft;
		const gutterOffsetX = data.offsetX - offsetLeftInGutter;

		// TODO@joao TODO@alex TODO@martin this is such that we don't collide with folding
		if (gutterOffsetX < -3 || gutterOffsetX > 3) { // dirty diff decoration on hover is 6px wide
			return;
		}

		this.mouseDownInfo = { lineNumber: range.startLineNumber };
	}

	private onEditorMouseUp(e: IEditorMouseEvent): void {
		if (!this.mouseDownInfo) {
			return;
		}

		const { lineNumber } = this.mouseDownInfo;
		this.mouseDownInfo = null;

		const range = e.target.range;

		if (!range || range.startLineNumber !== lineNumber) {
			return;
		}

		if (e.target.type !== MouseTargetType.GUTTER_LINE_DECORATIONS) {
			return;
		}

		if (!this.modelRegistry) {
			return;
		}

		const editorModel = this.editor.getModel();

		if (!editorModel) {
			return;
		}

		const model = this.modelRegistry.getModel(editorModel);

		if (!model) {
			return;
		}

		const index = model.changes.findIndex(change => lineIntersectsChange(lineNumber, change.change));

		if (index < 0) {
			return;
		}

		if (index === this.widget?.index) {
			this.close();
		} else {
			this.next(lineNumber);
		}
	}

	getChanges(): IChange[] {
		if (!this.modelRegistry) {
			return [];
		}
		if (!this.editor.hasModel()) {
			return [];
		}

		const model = this.modelRegistry.getModel(this.editor.getModel());

		if (!model) {
			return [];
		}

		return model.changes.map(change => change.change);
	}

	override dispose(): void {
		this.gutterActionDisposables.dispose();
		super.dispose();
	}
}

const editorGutterModifiedBackground = registerColor('editorGutter.modifiedBackground', {
	dark: '#1B81A8',
	light: '#2090D3',
	hcDark: '#1B81A8',
	hcLight: '#2090D3'
}, nls.localize('editorGutterModifiedBackground', "Editor gutter background color for lines that are modified."));

const editorGutterAddedBackground = registerColor('editorGutter.addedBackground', {
	dark: '#487E02',
	light: '#48985D',
	hcDark: '#487E02',
	hcLight: '#48985D'
}, nls.localize('editorGutterAddedBackground', "Editor gutter background color for lines that are added."));

const editorGutterDeletedBackground = registerColor('editorGutter.deletedBackground', {
	dark: editorErrorForeground,
	light: editorErrorForeground,
	hcDark: editorErrorForeground,
	hcLight: editorErrorForeground
}, nls.localize('editorGutterDeletedBackground', "Editor gutter background color for lines that are deleted."));

const minimapGutterModifiedBackground = registerColor('minimapGutter.modifiedBackground', {
	dark: editorGutterModifiedBackground,
	light: editorGutterModifiedBackground,
	hcDark: editorGutterModifiedBackground,
	hcLight: editorGutterModifiedBackground
}, nls.localize('minimapGutterModifiedBackground', "Minimap gutter background color for lines that are modified."));

const minimapGutterAddedBackground = registerColor('minimapGutter.addedBackground', {
	dark: editorGutterAddedBackground,
	light: editorGutterAddedBackground,
	hcDark: editorGutterAddedBackground,
	hcLight: editorGutterAddedBackground
}, nls.localize('minimapGutterAddedBackground', "Minimap gutter background color for lines that are added."));

const minimapGutterDeletedBackground = registerColor('minimapGutter.deletedBackground', {
	dark: editorGutterDeletedBackground,
	light: editorGutterDeletedBackground,
	hcDark: editorGutterDeletedBackground,
	hcLight: editorGutterDeletedBackground
}, nls.localize('minimapGutterDeletedBackground', "Minimap gutter background color for lines that are deleted."));

const overviewRulerModifiedForeground = registerColor('editorOverviewRuler.modifiedForeground', { dark: transparent(editorGutterModifiedBackground, 0.6), light: transparent(editorGutterModifiedBackground, 0.6), hcDark: transparent(editorGutterModifiedBackground, 0.6), hcLight: transparent(editorGutterModifiedBackground, 0.6) }, nls.localize('overviewRulerModifiedForeground', 'Overview ruler marker color for modified content.'));
const overviewRulerAddedForeground = registerColor('editorOverviewRuler.addedForeground', { dark: transparent(editorGutterAddedBackground, 0.6), light: transparent(editorGutterAddedBackground, 0.6), hcDark: transparent(editorGutterAddedBackground, 0.6), hcLight: transparent(editorGutterAddedBackground, 0.6) }, nls.localize('overviewRulerAddedForeground', 'Overview ruler marker color for added content.'));
const overviewRulerDeletedForeground = registerColor('editorOverviewRuler.deletedForeground', { dark: transparent(editorGutterDeletedBackground, 0.6), light: transparent(editorGutterDeletedBackground, 0.6), hcDark: transparent(editorGutterDeletedBackground, 0.6), hcLight: transparent(editorGutterDeletedBackground, 0.6) }, nls.localize('overviewRulerDeletedForeground', 'Overview ruler marker color for deleted content.'));

class DirtyDiffDecorator extends Disposable {

	static createDecoration(className: string, options: { gutter: boolean; overview: { active: boolean; color: string }; minimap: { active: boolean; color: string }; isWholeLine: boolean }): ModelDecorationOptions {
		const decorationOptions: IModelDecorationOptions = {
			description: 'dirty-diff-decoration',
			isWholeLine: options.isWholeLine,
		};

		if (options.gutter) {
			decorationOptions.linesDecorationsClassName = `dirty-diff-glyph ${className}`;
		}

		if (options.overview.active) {
			decorationOptions.overviewRuler = {
				color: themeColorFromId(options.overview.color),
				position: OverviewRulerLane.Left
			};
		}

		if (options.minimap.active) {
			decorationOptions.minimap = {
				color: themeColorFromId(options.minimap.color),
				position: MinimapPosition.Gutter
			};
		}

		return ModelDecorationOptions.createDynamic(decorationOptions);
	}

	private addedOptions: ModelDecorationOptions;
	private addedPatternOptions: ModelDecorationOptions;
	private modifiedOptions: ModelDecorationOptions;
	private modifiedPatternOptions: ModelDecorationOptions;
	private deletedOptions: ModelDecorationOptions;
	private decorations: string[] = [];
	private editorModel: ITextModel | null;

	constructor(
		editorModel: ITextModel,
		private model: DirtyDiffModel,
		@IConfigurationService private readonly configurationService: IConfigurationService
	) {
		super();
		this.editorModel = editorModel;

		const decorations = configurationService.getValue<string>('scm.diffDecorations');
		const gutter = decorations === 'all' || decorations === 'gutter';
		const overview = decorations === 'all' || decorations === 'overview';
		const minimap = decorations === 'all' || decorations === 'minimap';

		this.addedOptions = DirtyDiffDecorator.createDecoration('dirty-diff-added', {
			gutter,
			overview: { active: overview, color: overviewRulerAddedForeground },
			minimap: { active: minimap, color: minimapGutterAddedBackground },
			isWholeLine: true
		});
		this.addedPatternOptions = DirtyDiffDecorator.createDecoration('dirty-diff-added-pattern', {
			gutter,
			overview: { active: overview, color: overviewRulerAddedForeground },
			minimap: { active: minimap, color: minimapGutterAddedBackground },
			isWholeLine: true
		});
		this.modifiedOptions = DirtyDiffDecorator.createDecoration('dirty-diff-modified', {
			gutter,
			overview: { active: overview, color: overviewRulerModifiedForeground },
			minimap: { active: minimap, color: minimapGutterModifiedBackground },
			isWholeLine: true
		});
		this.modifiedPatternOptions = DirtyDiffDecorator.createDecoration('dirty-diff-modified-pattern', {
			gutter,
			overview: { active: overview, color: overviewRulerModifiedForeground },
			minimap: { active: minimap, color: minimapGutterModifiedBackground },
			isWholeLine: true
		});
		this.deletedOptions = DirtyDiffDecorator.createDecoration('dirty-diff-deleted', {
			gutter,
			overview: { active: overview, color: overviewRulerDeletedForeground },
			minimap: { active: minimap, color: minimapGutterDeletedBackground },
			isWholeLine: false
		});

		this._register(configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration('scm.diffDecorationsGutterPattern')) {
				this.onDidChange();
			}
		}));

		this._register(model.onDidChange(this.onDidChange, this));
	}

	private onDidChange(): void {
		if (!this.editorModel) {
			return;
		}

		const pattern = this.configurationService.getValue<{ added: boolean; modified: boolean }>('scm.diffDecorationsGutterPattern');
		const decorations = this.model.changes.map((labeledChange) => {
			const change = labeledChange.change;
			const changeType = getChangeType(change);
			const startLineNumber = change.modifiedStartLineNumber;
			const endLineNumber = change.modifiedEndLineNumber || startLineNumber;

			switch (changeType) {
				case ChangeType.Add:
					return {
						range: {
							startLineNumber: startLineNumber, startColumn: 1,
							endLineNumber: endLineNumber, endColumn: 1
						},
						options: pattern.added ? this.addedPatternOptions : this.addedOptions
					};
				case ChangeType.Delete:
					return {
						range: {
							startLineNumber: startLineNumber, startColumn: Number.MAX_VALUE,
							endLineNumber: startLineNumber, endColumn: Number.MAX_VALUE
						},
						options: this.deletedOptions
					};
				case ChangeType.Modify:
					return {
						range: {
							startLineNumber: startLineNumber, startColumn: 1,
							endLineNumber: endLineNumber, endColumn: 1
						},
						options: pattern.modified ? this.modifiedPatternOptions : this.modifiedOptions
					};
			}
		});

		this.decorations = this.editorModel.deltaDecorations(this.decorations, decorations);
	}

	override dispose(): void {
		super.dispose();

		if (this.editorModel && !this.editorModel.isDisposed()) {
			this.editorModel.deltaDecorations(this.decorations, []);
		}

		this.editorModel = null;
		this.decorations = [];
	}
}

function compareChanges(a: IChange, b: IChange): number {
	let result = a.modifiedStartLineNumber - b.modifiedStartLineNumber;

	if (result !== 0) {
		return result;
	}

	result = a.modifiedEndLineNumber - b.modifiedEndLineNumber;

	if (result !== 0) {
		return result;
	}

	result = a.originalStartLineNumber - b.originalStartLineNumber;

	if (result !== 0) {
		return result;
	}

	return a.originalEndLineNumber - b.originalEndLineNumber;
}


export async function getOriginalResource(quickDiffService: IQuickDiffService, uri: URI, language: string | undefined, isSynchronized: boolean | undefined): Promise<URI | null> {
	const quickDiffs = await quickDiffService.getQuickDiffs(uri, language, isSynchronized);
	return quickDiffs.length > 0 ? quickDiffs[0].originalResource : null;
}

type LabeledChange = { change: IChange; label: string; uri: URI };

export class DirtyDiffModel extends Disposable {

	private _quickDiffs: QuickDiff[] = [];
	private _originalModels: Map<string, IResolvedTextEditorModel> = new Map(); // key is uri.toString()
	private _originalTextModels: ITextModel[] = [];
	private _model: ITextFileEditorModel;
	get original(): ITextModel[] { return this._originalTextModels; }

	private diffDelayer = new ThrottledDelayer<{ changes: LabeledChange[]; mapChanges: Map<string, number[]> } | null>(200);
	private _quickDiffsPromise?: Promise<QuickDiff[]>;
	private repositoryDisposables = new Set<IDisposable>();
	private readonly originalModelDisposables = this._register(new DisposableStore());
	private _disposed = false;

	private readonly _onDidChange = new Emitter<{ changes: LabeledChange[]; diff: ISplice<LabeledChange>[] }>();
	readonly onDidChange: Event<{ changes: LabeledChange[]; diff: ISplice<LabeledChange>[] }> = this._onDidChange.event;

	private _changes: LabeledChange[] = [];
	get changes(): LabeledChange[] { return this._changes; }
	private _mapChanges: Map<string, number[]> = new Map(); // key is the quick diff name, value is the index of the change in this._changes
	get mapChanges(): Map<string, number[]> { return this._mapChanges; }

	constructor(
		textFileModel: IResolvedTextFileEditorModel,
		@ISCMService private readonly scmService: ISCMService,
		@IQuickDiffService private readonly quickDiffService: IQuickDiffService,
		@IEditorWorkerService private readonly editorWorkerService: IEditorWorkerService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@ITextModelService private readonly textModelResolverService: ITextModelService,
		@IProgressService private readonly progressService: IProgressService,
	) {
		super();
		this._model = textFileModel;

		this._register(textFileModel.textEditorModel.onDidChangeContent(() => this.triggerDiff()));
		this._register(
			Event.filter(configurationService.onDidChangeConfiguration,
				e => e.affectsConfiguration('scm.diffDecorationsIgnoreTrimWhitespace') || e.affectsConfiguration('diffEditor.ignoreTrimWhitespace')
			)(this.triggerDiff, this)
		);
		this._register(scmService.onDidAddRepository(this.onDidAddRepository, this));
		for (const r of scmService.repositories) {
			this.onDidAddRepository(r);
		}

		this._register(this._model.onDidChangeEncoding(() => {
			this.diffDelayer.cancel();
			this._quickDiffs = [];
			this._originalModels.clear();
			this._originalTextModels = [];
			this._quickDiffsPromise = undefined;
			this.setChanges([], new Map());
			this.triggerDiff();
		}));

		this._register(this.quickDiffService.onDidChangeQuickDiffProviders(() => this.triggerDiff()));
		this.triggerDiff();
	}

	get quickDiffs(): readonly QuickDiff[] {
		return this._quickDiffs;
	}

	public getDiffEditorModel(originalUri: string): IDiffEditorModel | undefined {
		if (!this._originalModels.has(originalUri)) {
			return;
		}
		const original = this._originalModels.get(originalUri)!;

		return {
			modified: this._model.textEditorModel!,
			original: original.textEditorModel
		};
	}

	private onDidAddRepository(repository: ISCMRepository): void {
		const disposables = new DisposableStore();

		this.repositoryDisposables.add(disposables);
		disposables.add(toDisposable(() => this.repositoryDisposables.delete(disposables)));

		const onDidChange = Event.any(repository.provider.onDidChange, repository.provider.onDidChangeResources);
		disposables.add(onDidChange(this.triggerDiff, this));

		const onDidRemoveThis = Event.filter(this.scmService.onDidRemoveRepository, r => r === repository);
		disposables.add(onDidRemoveThis(() => dispose(disposables), null));

		this.triggerDiff();
	}

	private triggerDiff(): Promise<any> {
		if (!this.diffDelayer) {
			return Promise.resolve(null);
		}

		return this.diffDelayer
			.trigger(() => this.diff())
			.then((result: { changes: LabeledChange[]; mapChanges: Map<string, number[]> } | null) => {
				const originalModels = Array.from(this._originalModels.values());
				if (!result || this._disposed || this._model.isDisposed() || originalModels.some(originalModel => originalModel.isDisposed())) {
					return; // disposed
				}

				if (originalModels.every(originalModel => originalModel.textEditorModel.getValueLength() === 0)) {
					result.changes = [];
				}

				if (!result.changes) {
					result.changes = [];
				}

				this.setChanges(result.changes, result.mapChanges);
			}, (err) => onUnexpectedError(err));
	}

	private setChanges(changes: LabeledChange[], mapChanges: Map<string, number[]>): void {
		const diff = sortedDiff(this._changes, changes, (a, b) => compareChanges(a.change, b.change));
		this._changes = changes;
		this._mapChanges = mapChanges;
		this._onDidChange.fire({ changes, diff });
	}

	private diff(): Promise<{ changes: LabeledChange[]; mapChanges: Map<string, number[]> } | null> {
		return this.progressService.withProgress({ location: ProgressLocation.Scm, delay: 250 }, async () => {
			const originalURIs = await this.getQuickDiffsPromise();
			if (this._disposed || this._model.isDisposed() || (originalURIs.length === 0)) {
				return Promise.resolve({ changes: [], mapChanges: new Map() }); // disposed
			}

			const filteredToDiffable = originalURIs.filter(quickDiff => this.editorWorkerService.canComputeDirtyDiff(quickDiff.originalResource, this._model.resource));
			if (filteredToDiffable.length === 0) {
				return Promise.resolve({ changes: [], mapChanges: new Map() }); // All files are too large
			}

			const ignoreTrimWhitespaceSetting = this.configurationService.getValue<'true' | 'false' | 'inherit'>('scm.diffDecorationsIgnoreTrimWhitespace');
			const ignoreTrimWhitespace = ignoreTrimWhitespaceSetting === 'inherit'
				? this.configurationService.getValue<boolean>('diffEditor.ignoreTrimWhitespace')
				: ignoreTrimWhitespaceSetting !== 'false';

			const allDiffs: LabeledChange[] = [];
			for (const quickDiff of filteredToDiffable) {
				const dirtyDiff = await this.editorWorkerService.computeDirtyDiff(quickDiff.originalResource, this._model.resource, ignoreTrimWhitespace);
				if (dirtyDiff) {
					for (const diff of dirtyDiff) {
						if (diff) {
							allDiffs.push({ change: diff, label: quickDiff.label, uri: quickDiff.originalResource });
						}
					}
				}
			}
			const sorted = allDiffs.sort((a, b) => compareChanges(a.change, b.change));
			const map: Map<string, number[]> = new Map();
			for (let i = 0; i < sorted.length; i++) {
				const label = sorted[i].label;
				if (!map.has(label)) {
					map.set(label, []);
				}
				map.get(label)!.push(i);
			}
			return { changes: sorted, mapChanges: map };
		});
	}

	private getQuickDiffsPromise(): Promise<QuickDiff[]> {
		if (this._quickDiffsPromise) {
			return this._quickDiffsPromise;
		}

		this._quickDiffsPromise = this.getOriginalResource().then(async (quickDiffs) => {
			if (this._disposed) { // disposed
				return [];
			}

			if (quickDiffs.length === 0) {
				this._quickDiffs = [];
				this._originalModels.clear();
				this._originalTextModels = [];
				return [];
			}

			if (equals(this._quickDiffs, quickDiffs, (a, b) => a.originalResource.toString() === b.originalResource.toString() && a.label === b.label)) {
				return quickDiffs;
			}

			this.originalModelDisposables.clear();
			this._originalModels.clear();
			this._originalTextModels = [];
			this._quickDiffs = quickDiffs;
			return (await Promise.all(quickDiffs.map(async (quickDiff) => {
				try {
					const ref = await this.textModelResolverService.createModelReference(quickDiff.originalResource);
					if (this._disposed) { // disposed
						ref.dispose();
						return [];
					}

					this._originalModels.set(quickDiff.originalResource.toString(), ref.object);
					this._originalTextModels.push(ref.object.textEditorModel);

					if (isTextFileEditorModel(ref.object)) {
						const encoding = this._model.getEncoding();

						if (encoding) {
							ref.object.setEncoding(encoding, EncodingMode.Decode);
						}
					}

					this.originalModelDisposables.add(ref);
					this.originalModelDisposables.add(ref.object.textEditorModel.onDidChangeContent(() => this.triggerDiff()));

					return quickDiff;
				} catch (error) {
					return []; // possibly invalid reference
				}
			}))).flat();
		});

		return this._quickDiffsPromise.finally(() => {
			this._quickDiffsPromise = undefined;
		});
	}

	private async getOriginalResource(): Promise<QuickDiff[]> {
		if (this._disposed) {
			return Promise.resolve([]);
		}

		const uri = this._model.resource;
		return this.quickDiffService.getQuickDiffs(uri, this._model.getLanguageId(), this._model.textEditorModel ? shouldSynchronizeModel(this._model.textEditorModel) : undefined);
	}

	findNextClosestChange(lineNumber: number, inclusive = true, provider?: string): number {
		let preferredProvider: string | undefined;
		if (!provider && inclusive) {
			preferredProvider = this.quickDiffs.find(value => value.isSCM)?.label;
		}

		const possibleChanges: number[] = [];
		for (let i = 0; i < this.changes.length; i++) {
			if (provider && this.changes[i].label !== provider) {
				continue;
			}
			const change = this.changes[i];
			const possibleChangesLength = possibleChanges.length;

			if (inclusive) {
				if (getModifiedEndLineNumber(change.change) >= lineNumber) {
					if (preferredProvider && change.label !== preferredProvider) {
						possibleChanges.push(i);
					} else {
						return i;
					}
				}
			} else {
				if (change.change.modifiedStartLineNumber > lineNumber) {
					return i;
				}
			}
			if ((possibleChanges.length > 0) && (possibleChanges.length === possibleChangesLength)) {
				return possibleChanges[0];
			}
		}

		return possibleChanges.length > 0 ? possibleChanges[0] : 0;
	}

	findPreviousClosestChange(lineNumber: number, inclusive = true, provider?: string): number {
		for (let i = this.changes.length - 1; i >= 0; i--) {
			if (provider && this.changes[i].label !== provider) {
				continue;
			}
			const change = this.changes[i].change;

			if (inclusive) {
				if (change.modifiedStartLineNumber <= lineNumber) {
					return i;
				}
			} else {
				if (getModifiedEndLineNumber(change) < lineNumber) {
					return i;
				}
			}
		}

		return this.changes.length - 1;
	}

	override dispose(): void {
		super.dispose();

		this._disposed = true;
		this._quickDiffs = [];
		this._originalModels.clear();
		this._originalTextModels = [];
		this.diffDelayer.cancel();
		this.repositoryDisposables.forEach(d => dispose(d));
		this.repositoryDisposables.clear();
	}
}

class DirtyDiffItem {

	constructor(
		readonly model: DirtyDiffModel,
		readonly decorator: DirtyDiffDecorator
	) { }

	dispose(): void {
		this.decorator.dispose();
		this.model.dispose();
	}
}

interface IViewState {
	readonly width: number;
	readonly visibility: 'always' | 'hover';
}

export class DirtyDiffWorkbenchController extends Disposable implements ext.IWorkbenchContribution, IModelRegistry {

	private enabled = false;
	private viewState: IViewState = { width: 3, visibility: 'always' };
	private items = new ResourceMap<DirtyDiffItem>();
	private readonly transientDisposables = this._register(new DisposableStore());
	private stylesheet: HTMLStyleElement;

	constructor(
		@IEditorService private readonly editorService: IEditorService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@ITextFileService private readonly textFileService: ITextFileService
	) {
		super();
		this.stylesheet = dom.createStyleSheet();
		this._register(toDisposable(() => this.stylesheet.parentElement!.removeChild(this.stylesheet)));

		const onDidChangeConfiguration = Event.filter(configurationService.onDidChangeConfiguration, e => e.affectsConfiguration('scm.diffDecorations'));
		this._register(onDidChangeConfiguration(this.onDidChangeConfiguration, this));
		this.onDidChangeConfiguration();

		const onDidChangeDiffWidthConfiguration = Event.filter(configurationService.onDidChangeConfiguration, e => e.affectsConfiguration('scm.diffDecorationsGutterWidth'));
		onDidChangeDiffWidthConfiguration(this.onDidChangeDiffWidthConfiguration, this);
		this.onDidChangeDiffWidthConfiguration();

		const onDidChangeDiffVisibilityConfiguration = Event.filter(configurationService.onDidChangeConfiguration, e => e.affectsConfiguration('scm.diffDecorationsGutterVisibility'));
		onDidChangeDiffVisibilityConfiguration(this.onDidChangeDiffVisibiltiyConfiguration, this);
		this.onDidChangeDiffVisibiltiyConfiguration();
	}

	private onDidChangeConfiguration(): void {
		const enabled = this.configurationService.getValue<string>('scm.diffDecorations') !== 'none';

		if (enabled) {
			this.enable();
		} else {
			this.disable();
		}
	}

	private onDidChangeDiffWidthConfiguration(): void {
		let width = this.configurationService.getValue<number>('scm.diffDecorationsGutterWidth');

		if (isNaN(width) || width <= 0 || width > 5) {
			width = 3;
		}

		this.setViewState({ ...this.viewState, width });
	}

	private onDidChangeDiffVisibiltiyConfiguration(): void {
		const visibility = this.configurationService.getValue<'always' | 'hover'>('scm.diffDecorationsGutterVisibility');
		this.setViewState({ ...this.viewState, visibility });
	}

	private setViewState(state: IViewState): void {
		this.viewState = state;
		this.stylesheet.textContent = `
			.monaco-editor .dirty-diff-added,
			.monaco-editor .dirty-diff-modified {
				border-left-width:${state.width}px;
			}
			.monaco-editor .dirty-diff-added-pattern,
			.monaco-editor .dirty-diff-added-pattern:before,
			.monaco-editor .dirty-diff-modified-pattern,
			.monaco-editor .dirty-diff-modified-pattern:before {
				background-size: ${state.width}px ${state.width}px;
			}
			.monaco-editor .dirty-diff-added,
			.monaco-editor .dirty-diff-added-pattern,
			.monaco-editor .dirty-diff-modified,
			.monaco-editor .dirty-diff-modified-pattern,
			.monaco-editor .dirty-diff-deleted {
				opacity: ${state.visibility === 'always' ? 1 : 0};
			}
		`;
	}

	private enable(): void {
		if (this.enabled) {
			this.disable();
		}

		this.transientDisposables.add(Event.any(this.editorService.onDidCloseEditor, this.editorService.onDidVisibleEditorsChange)(() => this.onEditorsChanged()));
		this.onEditorsChanged();
		this.enabled = true;
	}

	private disable(): void {
		if (!this.enabled) {
			return;
		}

		this.transientDisposables.clear();

		for (const [, dirtyDiff] of this.items) {
			dirtyDiff.dispose();
		}

		this.items.clear();
		this.enabled = false;
	}

	private onEditorsChanged(): void {
		for (const editor of this.editorService.visibleTextEditorControls) {
			if (isCodeEditor(editor)) {
				const textModel = editor.getModel();
				const controller = DirtyDiffController.get(editor);

				if (controller) {
					controller.modelRegistry = this;
				}

				if (textModel && !this.items.has(textModel.uri)) {
					const textFileModel = this.textFileService.files.get(textModel.uri);

					if (textFileModel?.isResolved()) {
						const dirtyDiffModel = this.instantiationService.createInstance(DirtyDiffModel, textFileModel);
						const decorator = new DirtyDiffDecorator(textFileModel.textEditorModel, dirtyDiffModel, this.configurationService);
						this.items.set(textModel.uri, new DirtyDiffItem(dirtyDiffModel, decorator));
					}
				}
			}
		}

		for (const [uri, item] of this.items) {
			if (!this.editorService.isOpened({ resource: uri, typeId: FILE_EDITOR_INPUT_ID, editorId: DEFAULT_EDITOR_ASSOCIATION.id })) {
				item.dispose();
				this.items.delete(uri);
			}
		}
	}

	getModel(editorModel: ITextModel): DirtyDiffModel | undefined {
		return this.items.get(editorModel.uri)?.model;
	}

	override dispose(): void {
		this.disable();
		super.dispose();
	}
}

registerEditorContribution(DirtyDiffController.ID, DirtyDiffController, EditorContributionInstantiation.AfterFirstRender);
