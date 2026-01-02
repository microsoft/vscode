/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from '../../../../nls.js';
import * as dom from '../../../../base/browser/dom.js';
import * as domStylesheetsJs from '../../../../base/browser/domStylesheets.js';
import { Action, ActionRunner, IAction } from '../../../../base/common/actions.js';
import { Event } from '../../../../base/common/event.js';
import { IContextViewService } from '../../../../platform/contextview/browser/contextView.js';
import { ISelectOptionItem } from '../../../../base/browser/ui/selectBox/selectBox.js';
import { SelectActionViewItem } from '../../../../base/browser/ui/actionbar/actionViewItems.js';
import { defaultSelectBoxStyles } from '../../../../platform/theme/browser/defaultStyles.js';
import { IColorTheme, IThemeService } from '../../../../platform/theme/common/themeService.js';
import { peekViewBorder, peekViewTitleBackground, peekViewTitleForeground, peekViewTitleInfoForeground, PeekViewWidget } from '../../../../editor/contrib/peekView/browser/peekView.js';
import { editorBackground } from '../../../../platform/theme/common/colorRegistry.js';
import { IMenu, IMenuService, MenuId, MenuItemAction, MenuRegistry } from '../../../../platform/actions/common/actions.js';
import { ICodeEditor, IEditorMouseEvent, MouseTargetType } from '../../../../editor/browser/editorBrowser.js';
import { EditorAction, registerEditorAction } from '../../../../editor/browser/editorExtensions.js';
import { IInstantiationService, ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { EmbeddedDiffEditorWidget } from '../../../../editor/browser/widget/diffEditor/embeddedDiffEditorWidget.js';
import { IEditorContribution, ScrollType } from '../../../../editor/common/editorCommon.js';
import { IQuickDiffModelService, QuickDiffModel } from './quickDiffModel.js';
import { Disposable, DisposableStore, IDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { ContextKeyExpr, IContextKey, IContextKeyService, RawContextKey } from '../../../../platform/contextkey/common/contextkey.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { rot } from '../../../../base/common/numbers.js';
import { ISplice } from '../../../../base/common/sequence.js';
import { ChangeType, getChangeHeight, getChangeType, getChangeTypeColor, getModifiedEndLineNumber, IQuickDiffService, lineIntersectsChange, QuickDiff, QuickDiffChange } from '../common/quickDiff.js';
import { ICodeEditorService } from '../../../../editor/browser/services/codeEditorService.js';
import { TextCompareEditorActiveContext } from '../../../common/contextkeys.js';
import { EditorContextKeys } from '../../../../editor/common/editorContextKeys.js';
import { KeybindingsRegistry, KeybindingWeight } from '../../../../platform/keybinding/common/keybindingsRegistry.js';
import { IChange } from '../../../../editor/common/diff/legacyLinesDiffComputer.js';
import { AccessibilitySignal, IAccessibilitySignalService } from '../../../../platform/accessibilitySignal/browser/accessibilitySignalService.js';
import { IAccessibilityService } from '../../../../platform/accessibility/common/accessibility.js';
import { Iterable } from '../../../../base/common/iterator.js';
import { basename } from '../../../../base/common/resources.js';
import { EditorOption, IDiffEditorOptions } from '../../../../editor/common/config/editorOptions.js';
import { Position } from '../../../../editor/common/core/position.js';
import { Range } from '../../../../editor/common/core/range.js';
import { getFlatActionBarActions } from '../../../../platform/actions/browser/menuEntryActionViewItem.js';
import { IActionBarOptions } from '../../../../base/browser/ui/actionbar/actionbar.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { gotoNextLocation, gotoPreviousLocation } from '../../../../platform/theme/common/iconRegistry.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { Color } from '../../../../base/common/color.js';
import { KeyChord, KeyCode, KeyMod } from '../../../../base/common/keyCodes.js';
import { getOuterEditor } from '../../../../editor/browser/widget/codeEditor/embeddedCodeEditorWidget.js';
import { quickDiffDecorationCount } from './quickDiffDecorator.js';
import { hasNativeContextMenu } from '../../../../platform/window/common/window.js';

export const isQuickDiffVisible = new RawContextKey<boolean>('dirtyDiffVisible', false);

export interface IQuickDiffSelectItem extends ISelectOptionItem {
	providerId: string;
}

export class QuickDiffPickerViewItem extends SelectActionViewItem<IQuickDiffSelectItem> {
	private optionsItems: IQuickDiffSelectItem[] = [];

	constructor(
		action: IAction,
		@IContextViewService contextViewService: IContextViewService,
		@IThemeService themeService: IThemeService,
		@IConfigurationService configurationService: IConfigurationService,
	) {
		const styles = { ...defaultSelectBoxStyles };
		const theme = themeService.getColorTheme();
		const editorBackgroundColor = theme.getColor(editorBackground);
		const peekTitleColor = theme.getColor(peekViewTitleBackground);
		const opaqueTitleColor = peekTitleColor?.makeOpaque(editorBackgroundColor!) ?? editorBackgroundColor!;
		styles.selectBackground = opaqueTitleColor.lighten(.6).toString();
		super(null, action, [], 0, contextViewService, styles, { ariaLabel: nls.localize('remotes', 'Switch quick diff base'), useCustomDrawn: !hasNativeContextMenu(configurationService) });
	}

	public setSelection(quickDiffs: QuickDiff[], providerId: string) {
		this.optionsItems = quickDiffs.map(quickDiff => ({ providerId: quickDiff.id, text: quickDiff.label }));
		const index = this.optionsItems.findIndex(item => item.providerId === providerId);
		this.setOptions(this.optionsItems, index);
	}

	protected override getActionContext(_: string, index: number): IQuickDiffSelectItem {
		return this.optionsItems[index];
	}

	override render(container: HTMLElement): void {
		super.render(container);
		this.setFocusable(true);
	}
}

export class QuickDiffPickerBaseAction extends Action {

	public static readonly ID = 'quickDiff.base.switch';
	public static readonly LABEL = nls.localize('quickDiff.base.switch', "Switch Quick Diff Base");

	constructor(private readonly callback: (event?: IQuickDiffSelectItem) => void) {
		super(QuickDiffPickerBaseAction.ID, QuickDiffPickerBaseAction.LABEL, undefined, undefined);
	}

	override async run(event?: IQuickDiffSelectItem): Promise<void> {
		return this.callback(event);
	}
}

class QuickDiffWidgetActionRunner extends ActionRunner {

	protected override runAction(action: IAction, context: unknown[]): Promise<void> {
		if (action instanceof MenuItemAction) {
			return action.run(...context);
		}

		return super.runAction(action, context);
	}
}

class QuickDiffWidgetEditorAction extends Action {

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

	override run(): Promise<void> {
		return Promise.resolve(this.instantiationService.invokeFunction(accessor => this.action.run(accessor, this.editor, null)));
	}
}

class QuickDiffWidget extends PeekViewWidget {

	private diffEditor!: EmbeddedDiffEditorWidget;
	private title: string;
	private menu: IMenu | undefined;
	private _index: number = 0;
	private _providerId: string = '';
	private change: IChange | undefined;
	private height: number | undefined = undefined;
	private dropdown: QuickDiffPickerViewItem | undefined;
	private dropdownContainer: HTMLElement | undefined;

	constructor(
		editor: ICodeEditor,
		private model: QuickDiffModel,
		@IThemeService private readonly themeService: IThemeService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IMenuService private readonly menuService: IMenuService,
		@IContextKeyService private contextKeyService: IContextKeyService,
		@IQuickDiffService private readonly quickDiffService: IQuickDiffService
	) {
		super(editor, { isResizeable: true, frameWidth: 1, keepEditorSelection: true, className: 'dirty-diff' }, instantiationService);

		this._disposables.add(themeService.onDidColorThemeChange(this._applyTheme, this));
		this._applyTheme(themeService.getColorTheme());

		if (!Iterable.isEmpty(this.model.originalTextModels)) {
			contextKeyService = contextKeyService.createOverlay([
				['originalResourceScheme', Iterable.first(this.model.originalTextModels)?.uri.scheme],
				['originalResourceSchemes', Iterable.map(this.model.originalTextModels, textModel => textModel.uri.scheme)]]);
		}

		this.create();
		if (editor.hasModel()) {
			this.title = basename(editor.getModel().uri);
		} else {
			this.title = '';
		}
		this.setTitle(this.title);
	}

	get providerId(): string {
		return this._providerId;
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
		this.contextKeyService.createKey('originalResource', this.model.changes[index].original.toString());
		this.contextKeyService.createKey('originalResourceScheme', this.model.changes[index].original.scheme);
		this.updateActions();

		this.change = change;
		this._providerId = labeledChange.providerId;

		if (Iterable.isEmpty(this.model.originalTextModels)) {
			return;
		}

		const onFirstDiffUpdate = Event.once(this.diffEditor.onDidUpdateDiff);

		// TODO@joao TODO@alex need this setTimeout probably because the
		// non-side-by-side diff still hasn't created the view zones
		onFirstDiffUpdate(() => setTimeout(() => this.revealChange(change), 0));

		const diffEditorModel = this.model.getDiffEditorModel(labeledChange.original);
		if (!diffEditorModel) {
			return;
		}
		this.diffEditor.setModel(diffEditorModel);

		const position = new Position(getModifiedEndLineNumber(change), 1);

		const lineHeight = this.editor.getOption(EditorOption.lineHeight);
		const editorHeight = this.editor.getLayoutInfo().height;
		const editorHeightInLines = Math.floor(editorHeight / lineHeight);
		const height = Math.min(
			getChangeHeight(change) + 2 /* arrow, frame, header */ + 6 /* 3 lines above/below the change */,
			Math.floor(editorHeightInLines / 3));

		this.renderTitle();
		this.updateDropdown();

		const changeType = getChangeType(change);
		const changeTypeColor = getChangeTypeColor(this.themeService.getColorTheme(), changeType);
		this.style({ frameColor: changeTypeColor, arrowColor: changeTypeColor });

		const providerSpecificChanges: IChange[] = [];
		let contextIndex = index;
		for (const change of this.model.changes) {
			if (change.providerId === this.model.changes[this._index].providerId) {
				providerSpecificChanges.push(change.change);
				if (labeledChange === change) {
					contextIndex = providerSpecificChanges.length - 1;
				}
			}
		}
		this._actionbarWidget!.context = [diffEditorModel.modified.uri, providerSpecificChanges, contextIndex];
		if (usePosition) {
			// In order to account for the 1px border-top of the content element we
			// have to add 1px. The pixel value needs to be expressed as a fraction
			// of the line height.
			this.show(position, height + (1 / lineHeight));
			this.editor.setPosition(position);
			this.editor.focus();
		}
	}

	private renderTitle(): void {
		const providerChanges = this.model.quickDiffChanges.get(this._providerId)!;
		const providerIndex = providerChanges.indexOf(this._index);

		let detail: string;
		if (!this.shouldUseDropdown()) {
			const label = this.model.quickDiffs
				.find(quickDiff => quickDiff.id === this._providerId)?.label ?? '';

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
		const newProviderId = event?.providerId;
		if (newProviderId === this.model.changes[this._index].providerId) {
			return;
		}
		let closestGreaterIndex = this._index < this.model.changes.length - 1 ? this._index + 1 : 0;
		for (let i = closestGreaterIndex; i !== this._index; i < this.model.changes.length - 1 ? i++ : i = 0) {
			if (this.model.changes[i].providerId === newProviderId) {
				closestGreaterIndex = i;
				break;
			}
		}
		let closestLesserIndex = this._index > 0 ? this._index - 1 : this.model.changes.length - 1;
		for (let i = closestLesserIndex; i !== this._index; i > 0 ? i-- : i = this.model.changes.length - 1) {
			if (this.model.changes[i].providerId === newProviderId) {
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
		const quickDiffs = this.getQuickDiffsContainingChange();
		return quickDiffs.length > 1;
	}

	private updateActions(): void {
		if (!this._actionbarWidget) {
			return;
		}
		const previous = this.instantiationService.createInstance(QuickDiffWidgetEditorAction, this.editor, new ShowPreviousChangeAction(this.editor), ThemeIcon.asClassName(gotoPreviousLocation));
		const next = this.instantiationService.createInstance(QuickDiffWidgetEditorAction, this.editor, new ShowNextChangeAction(this.editor), ThemeIcon.asClassName(gotoNextLocation));

		this._disposables.add(previous);
		this._disposables.add(next);

		if (this.menu) {
			this.menu.dispose();
		}
		this.menu = this.menuService.createMenu(MenuId.SCMChangeContext, this.contextKeyService);
		const actions = getFlatActionBarActions(this.menu.getActions({ shouldForwardArgs: true }));
		this._actionbarWidget.clear();
		this._actionbarWidget.push(actions.reverse(), { label: false, icon: true });
		this._actionbarWidget.push([next, previous], { label: false, icon: true });
		this._actionbarWidget.push(this._disposables.add(new Action('peekview.close', nls.localize('label.close', "Close"), ThemeIcon.asClassName(Codicon.close), true, () => this.dispose())), { label: false, icon: true });
	}

	private updateDropdown(): void {
		const quickDiffs = this.getQuickDiffsContainingChange();
		this.dropdown?.setSelection(quickDiffs, this._providerId);
	}

	private getQuickDiffsContainingChange(): QuickDiff[] {
		const change = this.model.changes[this._index];

		const quickDiffsWithChange = this.model.changes
			.filter(c => change.change2.modified.intersectsOrTouches(c.change2.modified))
			.map(c => c.providerId);

		return this.model.quickDiffs
			.filter(quickDiff => quickDiffsWithChange.includes(quickDiff.id) &&
				this.quickDiffService.isQuickDiffProviderVisible(quickDiff.id));
	}

	protected override _fillHead(container: HTMLElement): void {
		super._fillHead(container, true);

		// Render an empty picker which will be populated later
		const action = new QuickDiffPickerBaseAction((event?: IQuickDiffSelectItem) => this.switchQuickDiff(event));
		this._disposables.add(action);

		this.dropdownContainer = dom.prepend(this._titleElement!, dom.$('.dropdown'));
		this.dropdown = this.instantiationService.createInstance(QuickDiffPickerViewItem, action);
		this.dropdown.render(this.dropdownContainer);
	}

	protected override _getActionBarOptions(): IActionBarOptions {
		const actionRunner = new QuickDiffWidgetActionRunner();
		this._disposables.add(actionRunner);

		// close widget on successful action
		this._disposables.add(actionRunner.onDidRun(e => {
			if (!(e.action instanceof QuickDiffWidgetEditorAction) && !e.error) {
				this.dispose();
			}
		}));

		return {
			...super._getActionBarOptions(),
			actionRunner
		};
	}

	protected _fillBody(container: HTMLElement): void {
		const options: IDiffEditorOptions = {
			diffAlgorithm: 'advanced',
			fixedOverflowWidgets: true,
			ignoreTrimWhitespace: false,
			minimap: { enabled: false },
			readOnly: false,
			renderGutterMenu: false,
			renderIndicators: false,
			renderOverviewRuler: false,
			renderSideBySide: false,
			scrollbar: {
				verticalScrollbarSize: 14,
				horizontal: 'auto',
				useShadows: true,
				verticalHasArrows: false,
				horizontalHasArrows: false
			},
			scrollBeyondLastLine: false,
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

	toggleFocus(): void {
		if (this.diffEditor.hasTextFocus()) {
			this.editor.focus();
		} else {
			this.diffEditor.focus();
		}
	}

	override dispose() {
		this.dropdown?.dispose();
		this.menu?.dispose();
		super.dispose();
	}
}

export class QuickDiffEditorController extends Disposable implements IEditorContribution {

	public static readonly ID = 'editor.contrib.quickdiff';

	static get(editor: ICodeEditor): QuickDiffEditorController | null {
		return editor.getContribution<QuickDiffEditorController>(QuickDiffEditorController.ID);
	}

	private model: QuickDiffModel | null = null;
	private widget: QuickDiffWidget | null = null;
	private readonly isQuickDiffVisible!: IContextKey<boolean>;
	private session: IDisposable = Disposable.None;
	private mouseDownInfo: { lineNumber: number } | null = null;
	private enabled = false;
	private readonly gutterActionDisposables = new DisposableStore();
	private stylesheet: HTMLStyleElement;

	constructor(
		private editor: ICodeEditor,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IQuickDiffModelService private readonly quickDiffModelService: IQuickDiffModelService,
		@IInstantiationService private readonly instantiationService: IInstantiationService
	) {
		super();
		this.enabled = !contextKeyService.getContextKeyValue('isInDiffEditor');
		this.stylesheet = domStylesheetsJs.createStyleSheet(undefined, undefined, this._store);

		if (this.enabled) {
			this.isQuickDiffVisible = isQuickDiffVisible.bindTo(contextKeyService);
			this._register(editor.onDidChangeModel(() => this.close()));

			const onDidChangeGutterAction = Event.filter(configurationService.onDidChangeConfiguration, e => e.affectsConfiguration('scm.diffDecorationsGutterAction'));
			this._register(onDidChangeGutterAction(this.onDidChangeGutterAction, this));
			this.onDidChangeGutterAction();
		}
	}

	private onDidChangeGutterAction(): void {
		const gutterAction = this.configurationService.getValue<'diff' | 'none'>('scm.diffDecorationsGutterAction');

		this.gutterActionDisposables.clear();

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

	toggleFocus(): void {
		if (this.widget) {
			this.widget.toggleFocus();
		}
	}

	next(lineNumber?: number): void {
		if (!this.assertWidget()) {
			return;
		}
		if (!this.widget || !this.model) {
			return;
		}

		let index: number;
		if (this.editor.hasModel() && (typeof lineNumber === 'number' || !this.widget.providerId)) {
			index = this.model.findNextClosestChange(typeof lineNumber === 'number' ? lineNumber : this.editor.getPosition().lineNumber, true, this.widget.providerId);
		} else {
			const providerChanges: number[] = this.model.quickDiffChanges.get(this.widget.providerId) ?? this.model.quickDiffChanges.values().next().value!;
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
		if (this.editor.hasModel() && (typeof lineNumber === 'number' || !this.widget.providerId)) {
			index = this.model.findPreviousClosestChange(typeof lineNumber === 'number' ? lineNumber : this.editor.getPosition().lineNumber, true, this.widget.providerId);
		} else {
			const providerChanges: number[] = this.model.quickDiffChanges.get(this.widget.providerId) ?? this.model.quickDiffChanges.values().next().value!;
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

		const editorModel = this.editor.getModel();

		if (!editorModel) {
			return false;
		}

		const modelRef = this.quickDiffModelService.createQuickDiffModelReference(editorModel.uri);

		if (!modelRef) {
			return false;
		}

		if (modelRef.object.changes.length === 0) {
			modelRef.dispose();
			return false;
		}

		this.model = modelRef.object;
		this.widget = this.instantiationService.createInstance(QuickDiffWidget, this.editor, this.model);
		this.isQuickDiffVisible.set(true);

		const disposables = new DisposableStore();
		disposables.add(Event.once(this.widget.onDidClose)(this.close, this));
		const onDidModelChange = Event.chain(this.model.onDidChange, $ =>
			$.filter(e => e.diff.length > 0)
				.map(e => e.diff)
		);

		onDidModelChange(this.onDidModelChange, this, disposables);

		disposables.add(modelRef);
		disposables.add(this.widget);
		disposables.add(toDisposable(() => {
			this.model = null;
			this.widget = null;
			this.isQuickDiffVisible.set(false);
			this.editor.focus();
		}));

		this.session = disposables;
		return true;
	}

	private onDidModelChange(splices: ISplice<QuickDiffChange>[]): void {
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

		const editorModel = this.editor.getModel();

		if (!editorModel) {
			return;
		}

		const modelRef = this.quickDiffModelService.createQuickDiffModelReference(editorModel.uri);

		if (!modelRef) {
			return;
		}

		try {
			const index = modelRef.object.changes
				.findIndex(change => lineIntersectsChange(lineNumber, change.change));

			if (index < 0) {
				return;
			}

			if (index === this.widget?.index) {
				this.close();
			} else {
				this.next(lineNumber);
			}
		} finally {
			modelRef.dispose();
		}
	}

	override dispose(): void {
		this.gutterActionDisposables.dispose();
		super.dispose();
	}
}

export class ShowPreviousChangeAction extends EditorAction {

	constructor(private readonly outerEditor?: ICodeEditor) {
		super({
			id: 'editor.action.dirtydiff.previous',
			label: nls.localize2('show previous change', "Show Previous Change"),
			precondition: TextCompareEditorActiveContext.toNegated(),
			kbOpts: { kbExpr: EditorContextKeys.editorTextFocus, primary: KeyMod.Shift | KeyMod.Alt | KeyCode.F3, weight: KeybindingWeight.EditorContrib }
		});
	}

	run(accessor: ServicesAccessor): void {
		const outerEditor = this.outerEditor ?? getOuterEditorFromDiffEditor(accessor);

		if (!outerEditor) {
			return;
		}

		const controller = QuickDiffEditorController.get(outerEditor);

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
			label: nls.localize2('show next change', "Show Next Change"),
			precondition: TextCompareEditorActiveContext.toNegated(),
			kbOpts: { kbExpr: EditorContextKeys.editorTextFocus, primary: KeyMod.Alt | KeyCode.F3, weight: KeybindingWeight.EditorContrib }
		});
	}

	run(accessor: ServicesAccessor): void {
		const outerEditor = this.outerEditor ?? getOuterEditorFromDiffEditor(accessor);

		if (!outerEditor) {
			return;
		}

		const controller = QuickDiffEditorController.get(outerEditor);

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

export class GotoPreviousChangeAction extends EditorAction {

	constructor() {
		super({
			id: 'workbench.action.editor.previousChange',
			label: nls.localize2('move to previous change', "Go to Previous Change"),
			precondition: ContextKeyExpr.and(TextCompareEditorActiveContext.toNegated(), quickDiffDecorationCount.notEqualsTo(0)),
			kbOpts: { kbExpr: EditorContextKeys.editorTextFocus, primary: KeyMod.Shift | KeyMod.Alt | KeyCode.F5, weight: KeybindingWeight.EditorContrib }
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const outerEditor = getOuterEditorFromDiffEditor(accessor);
		const accessibilitySignalService = accessor.get(IAccessibilitySignalService);
		const accessibilityService = accessor.get(IAccessibilityService);
		const codeEditorService = accessor.get(ICodeEditorService);
		const quickDiffModelService = accessor.get(IQuickDiffModelService);

		if (!outerEditor || !outerEditor.hasModel()) {
			return;
		}

		const modelRef = quickDiffModelService.createQuickDiffModelReference(outerEditor.getModel().uri);
		try {
			if (!modelRef || modelRef.object.changes.length === 0) {
				return;
			}

			const lineNumber = outerEditor.getPosition().lineNumber;
			const index = modelRef.object.findPreviousClosestChange(lineNumber, false);
			const change = modelRef.object.changes[index];
			await playAccessibilitySymbolForChange(change.change, accessibilitySignalService);
			setPositionAndSelection(change.change, outerEditor, accessibilityService, codeEditorService);
		} finally {
			modelRef?.dispose();
		}
	}
}
registerEditorAction(GotoPreviousChangeAction);

export class GotoNextChangeAction extends EditorAction {

	constructor() {
		super({
			id: 'workbench.action.editor.nextChange',
			label: nls.localize2('move to next change', "Go to Next Change"),
			precondition: ContextKeyExpr.and(TextCompareEditorActiveContext.toNegated(), quickDiffDecorationCount.notEqualsTo(0)),
			kbOpts: { kbExpr: EditorContextKeys.editorTextFocus, primary: KeyMod.Alt | KeyCode.F5, weight: KeybindingWeight.EditorContrib }
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const accessibilitySignalService = accessor.get(IAccessibilitySignalService);
		const outerEditor = getOuterEditorFromDiffEditor(accessor);
		const accessibilityService = accessor.get(IAccessibilityService);
		const codeEditorService = accessor.get(ICodeEditorService);
		const quickDiffModelService = accessor.get(IQuickDiffModelService);

		if (!outerEditor || !outerEditor.hasModel()) {
			return;
		}

		const modelRef = quickDiffModelService.createQuickDiffModelReference(outerEditor.getModel().uri);
		try {
			if (!modelRef || modelRef.object.changes.length === 0) {
				return;
			}

			const lineNumber = outerEditor.getPosition().lineNumber;
			const index = modelRef.object.findNextClosestChange(lineNumber, false);
			const change = modelRef.object.changes[index].change;
			await playAccessibilitySymbolForChange(change, accessibilitySignalService);
			setPositionAndSelection(change, outerEditor, accessibilityService, codeEditorService);
		} finally {
			modelRef?.dispose();
		}
	}
}
registerEditorAction(GotoNextChangeAction);

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

KeybindingsRegistry.registerCommandAndKeybindingRule({
	id: 'closeQuickDiff',
	weight: KeybindingWeight.EditorContrib + 50,
	primary: KeyCode.Escape,
	secondary: [KeyMod.Shift | KeyCode.Escape],
	when: ContextKeyExpr.and(isQuickDiffVisible),
	handler: (accessor: ServicesAccessor) => {
		const outerEditor = getOuterEditorFromDiffEditor(accessor);

		if (!outerEditor) {
			return;
		}

		const controller = QuickDiffEditorController.get(outerEditor);

		if (!controller) {
			return;
		}

		controller.close();
	}
});

KeybindingsRegistry.registerCommandAndKeybindingRule({
	id: 'togglePeekWidgetFocus',
	weight: KeybindingWeight.EditorContrib,
	primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KeyK, KeyCode.F2),
	when: isQuickDiffVisible,
	handler: (accessor: ServicesAccessor) => {
		const outerEditor = getOuterEditorFromDiffEditor(accessor);
		if (!outerEditor) {
			return;
		}

		const controller = QuickDiffEditorController.get(outerEditor);
		if (!controller) {
			return;
		}

		controller.toggleFocus();
	}
});

function setPositionAndSelection(change: IChange, editor: ICodeEditor, accessibilityService: IAccessibilityService, codeEditorService: ICodeEditorService) {
	const position = new Position(change.modifiedStartLineNumber, 1);
	editor.setPosition(position);
	editor.revealPositionInCenter(position);
	if (accessibilityService.isScreenReaderOptimized()) {
		editor.setSelection({ startLineNumber: change.modifiedStartLineNumber, startColumn: 0, endLineNumber: change.modifiedStartLineNumber, endColumn: Number.MAX_VALUE });
		codeEditorService.getActiveCodeEditor()?.writeScreenReaderContent('diff-navigation');
	}
}

async function playAccessibilitySymbolForChange(change: IChange, accessibilitySignalService: IAccessibilitySignalService) {
	const changeType = getChangeType(change);
	switch (changeType) {
		case ChangeType.Add:
			accessibilitySignalService.playSignal(AccessibilitySignal.diffLineInserted, { allowManyInParallel: true, source: 'quickDiffDecoration' });
			break;
		case ChangeType.Delete:
			accessibilitySignalService.playSignal(AccessibilitySignal.diffLineDeleted, { allowManyInParallel: true, source: 'quickDiffDecoration' });
			break;
		case ChangeType.Modify:
			accessibilitySignalService.playSignal(AccessibilitySignal.diffLineModified, { allowManyInParallel: true, source: 'quickDiffDecoration' });
			break;
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
