/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { addDisposableListener, getClientArea, getDomNodePagePosition, getTotalHeight, getTotalWidth } from 'vs/base/browser/dom';
import * as aria from 'vs/base/browser/ui/aria/aria';
import { renderIcon } from 'vs/base/browser/ui/iconLabel/iconLabels';
import { IListRenderer, IListVirtualDelegate } from 'vs/base/browser/ui/list/list';
import { List } from 'vs/base/browser/ui/list/listWidget';
import * as arrays from 'vs/base/common/arrays';
import { raceCancellation } from 'vs/base/common/async';
import { CancellationToken, CancellationTokenSource } from 'vs/base/common/cancellation';
import { Codicon } from 'vs/base/common/codicons';
import { DisposableStore, toDisposable } from 'vs/base/common/lifecycle';
import { assertType, isDefined } from 'vs/base/common/types';
import 'vs/css!./renameInputField';
import { ContentWidgetPositionPreference, ICodeEditor, IContentWidget, IContentWidgetPosition } from 'vs/editor/browser/editorBrowser';
import { EditorOption } from 'vs/editor/common/config/editorOptions';
import { FontInfo } from 'vs/editor/common/config/fontInfo';
import { IDimension } from 'vs/editor/common/core/dimension';
import { Position } from 'vs/editor/common/core/position';
import { IRange } from 'vs/editor/common/core/range';
import { ScrollType } from 'vs/editor/common/editorCommon';
import { NewSymbolName, NewSymbolNameTag, ProviderResult } from 'vs/editor/common/languages';
import { localize } from 'vs/nls';
import { IContextKey, IContextKeyService, RawContextKey } from 'vs/platform/contextkey/common/contextkey';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { ILogService } from 'vs/platform/log/common/log';
import { defaultListStyles } from 'vs/platform/theme/browser/defaultStyles';
import {
	editorWidgetBackground,
	inputBackground,
	inputBorder,
	inputForeground,
	widgetBorder,
	widgetShadow
} from 'vs/platform/theme/common/colorRegistry';
import { IColorTheme, IThemeService } from 'vs/platform/theme/common/themeService';

/** for debugging */
const _sticky = false
	// || Boolean("true") // done "weirdly" so that a lint warning prevents you from pushing this
	;


export const CONTEXT_RENAME_INPUT_VISIBLE = new RawContextKey<boolean>('renameInputVisible', false, localize('renameInputVisible', "Whether the rename input widget is visible"));
export const CONTEXT_RENAME_INPUT_FOCUSED = new RawContextKey<boolean>('renameInputFocused', false, localize('renameInputFocused', "Whether the rename input widget is focused"));

export interface RenameInputFieldResult {
	newName: string;
	wantsPreview?: boolean;
	source: 'inputField' | 'renameSuggestion';
	nRenameSuggestions: number;
}

export class RenameInputField implements IContentWidget {

	private _position?: Position;
	private _domNode?: HTMLElement;
	private _input?: HTMLInputElement;
	private _candidatesView?: CandidatesView;
	private _label?: HTMLDivElement;
	private _visible?: boolean;
	private _nPxAvailableAbove?: number;
	private _nPxAvailableBelow?: number;
	private readonly _visibleContextKey: IContextKey<boolean>;
	private readonly _focusedContextKey: IContextKey<boolean>;
	private readonly _disposables = new DisposableStore();

	readonly allowEditorOverflow: boolean = true;

	constructor(
		private readonly _editor: ICodeEditor,
		private readonly _acceptKeybindings: [string, string],
		@IThemeService private readonly _themeService: IThemeService,
		@IKeybindingService private readonly _keybindingService: IKeybindingService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@ILogService private readonly _logService: ILogService,
	) {
		this._visibleContextKey = CONTEXT_RENAME_INPUT_VISIBLE.bindTo(contextKeyService);
		this._focusedContextKey = CONTEXT_RENAME_INPUT_FOCUSED.bindTo(contextKeyService);

		this._editor.addContentWidget(this);

		this._disposables.add(this._editor.onDidChangeConfiguration(e => {
			if (e.hasChanged(EditorOption.fontInfo)) {
				this._updateFont();
			}
		}));

		this._disposables.add(_themeService.onDidColorThemeChange(this._updateStyles, this));
	}

	dispose(): void {
		this._disposables.dispose();
		this._editor.removeContentWidget(this);
	}

	getId(): string {
		return '__renameInputWidget';
	}

	getDomNode(): HTMLElement {
		if (!this._domNode) {
			this._domNode = document.createElement('div');
			this._domNode.className = 'monaco-editor rename-box';

			this._input = document.createElement('input');
			this._input.className = 'rename-input';
			this._input.type = 'text';
			this._input.setAttribute('aria-label', localize('renameAriaLabel', "Rename input. Type new name and press Enter to commit."));
			this._disposables.add(addDisposableListener(this._input, 'focus', () => { this._focusedContextKey.set(true); }));
			this._disposables.add(addDisposableListener(this._input, 'blur', () => { this._focusedContextKey.reset(); }));
			this._domNode.appendChild(this._input);

			this._candidatesView = this._disposables.add(
				new CandidatesView(this._domNode, {
					fontInfo: this._editor.getOption(EditorOption.fontInfo),
					onSelectionChange: () => this.acceptInput(false) // we don't allow preview with mouse click for now
				}));

			this._label = document.createElement('div');
			this._label.className = 'rename-label';
			this._domNode.appendChild(this._label);

			this._updateFont();
			this._updateStyles(this._themeService.getColorTheme());
		}
		return this._domNode;
	}

	private _updateStyles(theme: IColorTheme): void {
		if (!this._input || !this._domNode) {
			return;
		}

		const widgetShadowColor = theme.getColor(widgetShadow);
		const widgetBorderColor = theme.getColor(widgetBorder);
		this._domNode.style.backgroundColor = String(theme.getColor(editorWidgetBackground) ?? '');
		this._domNode.style.boxShadow = widgetShadowColor ? ` 0 0 8px 2px ${widgetShadowColor}` : '';
		this._domNode.style.border = widgetBorderColor ? `1px solid ${widgetBorderColor}` : '';
		this._domNode.style.color = String(theme.getColor(inputForeground) ?? '');

		this._input.style.backgroundColor = String(theme.getColor(inputBackground) ?? '');
		// this._input.style.color = String(theme.getColor(inputForeground) ?? '');
		const border = theme.getColor(inputBorder);
		this._input.style.borderWidth = border ? '1px' : '0px';
		this._input.style.borderStyle = border ? 'solid' : 'none';
		this._input.style.borderColor = border?.toString() ?? 'none';
	}

	private _updateFont(): void {
		if (!this._input || !this._label || !this._candidatesView) {
			return;
		}

		const fontInfo = this._editor.getOption(EditorOption.fontInfo);
		this._input.style.fontFamily = fontInfo.fontFamily;
		this._input.style.fontWeight = fontInfo.fontWeight;
		this._input.style.fontSize = `${fontInfo.fontSize}px`;

		this._candidatesView.updateFont(fontInfo);

		this._label.style.fontSize = `${this._computeLabelFontSize(fontInfo.fontSize)}px`;
	}

	private _computeLabelFontSize(editorFontSize: number) {
		return editorFontSize * 0.8;
	}

	getPosition(): IContentWidgetPosition | null {
		if (!this._visible) {
			return null;
		}

		if (!this._editor.hasModel() || // @ulugbekna: shouldn't happen
			!this._editor.getDomNode() // @ulugbekna: can happen during tests based on suggestWidget's similar predicate check
		) {
			return null;
		}

		const bodyBox = getClientArea(this.getDomNode().ownerDocument.body);
		const editorBox = getDomNodePagePosition(this._editor.getDomNode());

		const cursorBoxTop = this._getTopForPosition();

		this._nPxAvailableAbove = cursorBoxTop + editorBox.top;
		this._nPxAvailableBelow = bodyBox.height - this._nPxAvailableAbove;

		const lineHeight = this._editor.getOption(EditorOption.lineHeight);
		const { totalHeight: candidateViewHeight } = CandidateView.getLayoutInfo({ lineHeight });

		const positionPreference = this._nPxAvailableBelow > candidateViewHeight * 6 /* approximate # of candidates to fit in (inclusive of rename input box & rename label) */
			? [ContentWidgetPositionPreference.BELOW, ContentWidgetPositionPreference.ABOVE]
			: [ContentWidgetPositionPreference.ABOVE, ContentWidgetPositionPreference.BELOW];

		return {
			position: this._position!,
			preference: positionPreference,
		};
	}

	beforeRender(): IDimension | null {
		const [accept, preview] = this._acceptKeybindings;
		this._label!.innerText = localize({ key: 'label', comment: ['placeholders are keybindings, e.g "F2 to Rename, Shift+F2 to Preview"'] }, "{0} to Rename, {1} to Preview", this._keybindingService.lookupKeybinding(accept)?.getLabel(), this._keybindingService.lookupKeybinding(preview)?.getLabel());

		this._domNode!.style.minWidth = `200px`; // to prevent from widening when candidates come in

		return null;
	}

	afterRender(position: ContentWidgetPositionPreference | null): void {
		this._trace('invoking afterRender, position: ', position ? 'not null' : 'null');
		if (position === null) {
			// cancel rename when input widget isn't rendered anymore
			this.cancelInput(true, 'afterRender (because position is null)');
			return;
		}

		if (!this._editor.hasModel() || // shouldn't happen
			!this._editor.getDomNode() // can happen during tests based on suggestWidget's similar predicate check
		) {
			return;
		}

		assertType(this._candidatesView);
		assertType(this._nPxAvailableAbove !== undefined);
		assertType(this._nPxAvailableBelow !== undefined);

		const inputBoxHeight = getTotalHeight(this._input!);

		const labelHeight = getTotalHeight(this._label!);

		let totalHeightAvailable: number;
		if (position === ContentWidgetPositionPreference.BELOW) {
			totalHeightAvailable = this._nPxAvailableBelow;
		} else {
			totalHeightAvailable = this._nPxAvailableAbove;
		}

		this._candidatesView!.layout({
			height: totalHeightAvailable - labelHeight - inputBoxHeight,
			width: getTotalWidth(this._input!),
		});
	}


	private _currentAcceptInput?: (wantsPreview: boolean) => void;
	private _currentCancelInput?: (focusEditor: boolean) => void;

	acceptInput(wantsPreview: boolean): void {
		this._trace(`invoking acceptInput`);
		this._currentAcceptInput?.(wantsPreview);
	}

	cancelInput(focusEditor: boolean, caller: string): void {
		this._trace(`invoking cancelInput, caller: ${caller}, _currentCancelInput: ${this._currentAcceptInput ? 'not undefined' : 'undefined'}`);
		this._currentCancelInput?.(focusEditor);
	}

	focusNextRenameSuggestion() {
		this._candidatesView?.focusNext();
	}

	focusPreviousRenameSuggestion() {
		if (!this._candidatesView?.focusPrevious()) {
			this._input!.focus();
		}
	}

	/**
	 * @returns a `boolean` standing for `shouldFocusEditor`, if user didn't pick a new name, or a {@link RenameInputFieldResult}
	 */
	getInput(where: IRange, value: string, selectionStart: number, selectionEnd: number, supportPreview: boolean, candidates: ProviderResult<NewSymbolName[]>[], cts: CancellationTokenSource): Promise<RenameInputFieldResult | boolean> {

		this._domNode!.classList.toggle('preview', supportPreview);

		this._position = new Position(where.startLineNumber, where.startColumn);
		this._input!.value = value;
		this._input!.setAttribute('selectionStart', selectionStart.toString());
		this._input!.setAttribute('selectionEnd', selectionEnd.toString());
		this._input!.size = Math.max((where.endColumn - where.startColumn) * 1.1, 20); // determines width

		const disposeOnDone = new DisposableStore();

		disposeOnDone.add(toDisposable(() => cts.dispose(true))); // @ulugbekna: this may result in `this.cancelInput` being called twice, but it should be safe since we set it to undefined after 1st call

		this._updateRenameCandidates(candidates, value, cts.token);

		return new Promise<RenameInputFieldResult | boolean>(resolve => {

			this._currentCancelInput = (focusEditor) => {
				this._trace('invoking _currentCancelInput');
				this._currentAcceptInput = undefined;
				this._currentCancelInput = undefined;
				this._candidatesView?.clearCandidates();
				resolve(focusEditor);
				return true;
			};

			this._currentAcceptInput = (wantsPreview) => {
				this._trace('invoking _currentAcceptInput');
				assertType(this._input !== undefined);
				assertType(this._candidatesView !== undefined);

				const nRenameSuggestions = this._candidatesView.nCandidates;

				let newName: string;
				let source: 'inputField' | 'renameSuggestion';
				const focusedCandidate = this._candidatesView.focusedCandidate;
				if (focusedCandidate !== undefined) {
					this._trace('using new name from renameSuggestion');
					newName = focusedCandidate;
					source = 'renameSuggestion';
				} else {
					this._trace('using new name from inputField');
					newName = this._input.value;
					source = 'inputField';
				}

				if (newName === value || newName.trim().length === 0 /* is just whitespace */) {
					this.cancelInput(true, '_currentAcceptInput (because newName === value || newName.trim().length === 0)');
					return;
				}

				this._currentAcceptInput = undefined;
				this._currentCancelInput = undefined;
				this._candidatesView.clearCandidates();

				resolve({
					newName,
					wantsPreview: supportPreview && wantsPreview,
					source,
					nRenameSuggestions,
				});
			};

			disposeOnDone.add(cts.token.onCancellationRequested(() => this.cancelInput(true, 'cts.token.onCancellationRequested')));
			if (!_sticky) {
				disposeOnDone.add(this._editor.onDidBlurEditorWidget(() => this.cancelInput(!this._domNode?.ownerDocument.hasFocus(), 'editor.onDidBlurEditorWidget')));
			}

			this._show();

		}).finally(() => {
			disposeOnDone.dispose();
			this._hide();
		});
	}

	private _show(): void {
		this._trace('invoking _show');
		this._editor.revealLineInCenterIfOutsideViewport(this._position!.lineNumber, ScrollType.Smooth);
		this._visible = true;
		this._visibleContextKey.set(true);
		this._editor.layoutContentWidget(this);

		setTimeout(() => {
			this._input!.focus();
			this._input!.setSelectionRange(
				parseInt(this._input!.getAttribute('selectionStart')!),
				parseInt(this._input!.getAttribute('selectionEnd')!));
		}, 100);
	}

	private async _updateRenameCandidates(candidates: ProviderResult<NewSymbolName[]>[], currentName: string, token: CancellationToken) {
		const trace = (...args: any[]) => this._trace('_updateRenameCandidates', ...args);

		trace('start');
		const namesListResults = await raceCancellation(Promise.allSettled(candidates), token);

		if (namesListResults === undefined) {
			trace('returning early - received updateRenameCandidates results - undefined');
			return;
		}

		const newNames = namesListResults.flatMap(namesListResult =>
			namesListResult.status === 'fulfilled' && isDefined(namesListResult.value)
				? namesListResult.value
				: []
		);
		trace(`received updateRenameCandidates results - total (unfiltered) ${newNames.length} candidates.`);

		// deduplicate and filter out the current value
		const distinctNames = arrays.distinct(newNames, v => v.newSymbolName);
		trace(`distinct candidates - ${distinctNames.length} candidates.`);

		const validDistinctNames = distinctNames.filter(({ newSymbolName }) => newSymbolName.trim().length > 0 && newSymbolName !== this._input?.value && newSymbolName !== currentName);
		trace(`valid distinct candidates - ${newNames.length} candidates.`);

		if (validDistinctNames.length < 1) {
			trace('returning early - no valid distinct candidates');
			return;
		}

		// show the candidates
		trace('setting candidates');
		this._candidatesView!.setCandidates(validDistinctNames);

		// ask editor to re-layout given that the widget is now of a different size after rendering rename candidates
		trace('asking editor to re-layout');
		this._editor.layoutContentWidget(this);
	}

	private _hide(): void {
		this._trace('invoked _hide');
		this._visible = false;
		this._visibleContextKey.reset();
		this._editor.layoutContentWidget(this);
	}

	private _getTopForPosition(): number {
		const visibleRanges = this._editor.getVisibleRanges();
		let firstLineInViewport: number;
		if (visibleRanges.length > 0) {
			firstLineInViewport = visibleRanges[0].startLineNumber;
		} else {
			this._logService.warn('RenameInputField#_getTopForPosition: this should not happen - visibleRanges is empty');
			firstLineInViewport = Math.max(1, this._position!.lineNumber - 5); // @ulugbekna: fallback to current line minus 5
		}
		return this._editor.getTopForLineNumber(this._position!.lineNumber) - this._editor.getTopForLineNumber(firstLineInViewport);
	}

	private _trace(...args: any[]) {
		this._logService.trace('RenameInputField', ...args);
	}
}

class CandidatesView {

	private readonly _listWidget: List<NewSymbolName>;
	private readonly _listContainer: HTMLDivElement;

	private _lineHeight: number;
	private _availableHeight: number;
	private _minimumWidth: number;
	private _typicalHalfwidthCharacterWidth: number;

	private _disposables: DisposableStore;

	constructor(parent: HTMLElement, opts: { fontInfo: FontInfo; onSelectionChange: () => void }) {

		this._disposables = new DisposableStore();

		this._availableHeight = 0;
		this._minimumWidth = 0;

		this._lineHeight = opts.fontInfo.lineHeight;
		this._typicalHalfwidthCharacterWidth = opts.fontInfo.typicalHalfwidthCharacterWidth;

		this._listContainer = document.createElement('div');
		this._listContainer.style.fontFamily = opts.fontInfo.fontFamily;
		this._listContainer.style.fontWeight = opts.fontInfo.fontWeight;
		this._listContainer.style.fontSize = `${opts.fontInfo.fontSize}px`;
		parent.appendChild(this._listContainer);

		const that = this;

		const virtualDelegate = new class implements IListVirtualDelegate<NewSymbolName> {
			getTemplateId(element: NewSymbolName): string {
				return 'candidate';
			}

			getHeight(element: NewSymbolName): number {
				return that._candidateViewHeight;
			}
		};

		const renderer = new class implements IListRenderer<NewSymbolName, CandidateView> {
			readonly templateId = 'candidate';

			renderTemplate(container: HTMLElement): CandidateView {
				return new CandidateView(container, { lineHeight: that._lineHeight });
			}

			renderElement(candidate: NewSymbolName, index: number, templateData: CandidateView): void {
				templateData.model = candidate;
			}

			disposeTemplate(templateData: CandidateView): void {
				templateData.dispose();
			}
		};

		this._listWidget = new List(
			'NewSymbolNameCandidates',
			this._listContainer,
			virtualDelegate,
			[renderer],
			{
				keyboardSupport: false, // @ulugbekna: because we handle keyboard events through proper commands & keybinding service, see `rename.ts`
				mouseSupport: true,
				multipleSelectionSupport: false,
			}
		);

		this._disposables.add(this._listWidget.onDidChangeSelection(e => {
			if (e.elements.length > 0) {
				opts.onSelectionChange();
			}
		}));

		this._disposables.add(this._listWidget.onDidBlur(e => {
			this._listWidget.setFocus([]);
		}));

		this._listWidget.style(defaultListStyles);
	}

	dispose() {
		this._listWidget.dispose();
		this._disposables.dispose();
	}

	// height - max height allowed by parent element
	public layout({ height, width }: { height: number; width: number }): void {
		this._availableHeight = height;
		this._minimumWidth = width;
	}

	public setCandidates(candidates: NewSymbolName[]): void {

		// insert candidates into list widget
		this._listWidget.splice(0, 0, candidates);

		// adjust list widget layout
		const height = this._pickListHeight(candidates.length);
		const width = this._pickListWidth(candidates);

		this._listWidget.layout(height, width);

		// adjust list container layout
		this._listContainer.style.height = `${height}px`;
		this._listContainer.style.width = `${width}px`;

		aria.status(localize('renameSuggestionsReceivedAria', "Received {0} rename suggestions", candidates.length));
	}

	public clearCandidates(): void {
		this._listContainer.style.height = '0px';
		this._listContainer.style.width = '0px';
		this._listWidget.splice(0, this._listWidget.length, []);
	}

	public get nCandidates() {
		return this._listWidget.length;
	}

	public get focusedCandidate(): string | undefined {
		if (this._listWidget.length === 0) {
			return;
		}
		const selectedElement = this._listWidget.getSelectedElements()[0];
		if (selectedElement !== undefined) {
			return selectedElement.newSymbolName;
		}
		const focusedElement = this._listWidget.getFocusedElements()[0];
		if (focusedElement !== undefined) {
			return focusedElement.newSymbolName;
		}
		return;
	}

	public updateFont(fontInfo: FontInfo): void {
		this._listContainer.style.fontFamily = fontInfo.fontFamily;
		this._listContainer.style.fontWeight = fontInfo.fontWeight;
		this._listContainer.style.fontSize = `${fontInfo.fontSize}px`;

		this._lineHeight = fontInfo.lineHeight;

		this._listWidget.rerender();
	}

	public focusNext(): void {
		if (this._listWidget.length === 0) {
			return;
		}
		if (this._listWidget.isDOMFocused()) {
			this._listWidget.focusNext();
		} else {
			this._listWidget.domFocus();
			this._listWidget.focusFirst();
		}
		this._listWidget.reveal(this._listWidget.getFocus()[0]);
	}

	/**
	 * @returns true if focus is moved to previous element
	 */
	public focusPrevious(): boolean {
		if (this._listWidget.length === 0) {
			return false;
		}
		this._listWidget.domFocus();
		const focusedIx = this._listWidget.getFocus()[0];
		if (focusedIx !== 0) {
			this._listWidget.focusPrevious();
			this._listWidget.reveal(this._listWidget.getFocus()[0]);
		}
		return focusedIx > 0;
	}

	private get _candidateViewHeight(): number {
		const { totalHeight } = CandidateView.getLayoutInfo({ lineHeight: this._lineHeight });
		return totalHeight;
	}

	private _pickListHeight(nCandidates: number) {
		const heightToFitAllCandidates = this._candidateViewHeight * nCandidates;
		const MAX_N_CANDIDATES = 7;  // @ulugbekna: max # of candidates we want to show at once
		const height = Math.min(heightToFitAllCandidates, this._availableHeight, this._candidateViewHeight * MAX_N_CANDIDATES);
		return height;
	}

	private _pickListWidth(candidates: NewSymbolName[]): number {
		const longestCandidateWidth = Math.ceil(Math.max(...candidates.map(c => c.newSymbolName.length)) * this._typicalHalfwidthCharacterWidth);
		const width = Math.max(
			this._minimumWidth,
			4 /* padding */ + 16 /* sparkle icon */ + 5 /* margin-left */ + longestCandidateWidth + 10 /* (possibly visible) scrollbar width */ // TODO@ulugbekna: approximate calc - clean this up
		);
		return width;
	}

}

class CandidateView {

	// TODO@ulugbekna: accessibility

	private static _PADDING: number = 2;

	public readonly domNode: HTMLElement;
	private readonly _icon: HTMLElement;
	private readonly _label: HTMLElement;

	constructor(parent: HTMLElement, { lineHeight }: { lineHeight: number }) {

		this.domNode = document.createElement('div');
		this.domNode.style.display = `flex`;
		this.domNode.style.alignItems = `center`;
		this.domNode.style.height = `${lineHeight}px`;
		this.domNode.style.padding = `${CandidateView._PADDING}px`;

		this._icon = document.createElement('div');
		this._icon.style.display = `flex`;
		this._icon.style.alignItems = `center`;
		this._icon.style.width = this._icon.style.height = `${lineHeight * 0.8}px`;
		this.domNode.appendChild(this._icon);

		this._label = document.createElement('div');
		this._icon.style.display = `flex`;
		this._icon.style.alignItems = `center`;
		this._label.style.marginLeft = '5px';
		this.domNode.appendChild(this._label);

		parent.appendChild(this.domNode);
	}

	public set model(value: NewSymbolName) {

		// @ulugbekna: a hack to always include sparkle for now
		const alwaysIncludeSparkle = true;

		// update icon
		if (alwaysIncludeSparkle || value.tags?.includes(NewSymbolNameTag.AIGenerated)) {
			if (this._icon.children.length === 0) {
				this._icon.appendChild(renderIcon(Codicon.sparkle));
			}
		} else {
			if (this._icon.children.length === 1) {
				this._icon.removeChild(this._icon.children[0]);
			}
		}

		this._label.innerText = value.newSymbolName;
	}

	public static getLayoutInfo({ lineHeight }: { lineHeight: number }): { totalHeight: number } {
		const totalHeight = lineHeight + CandidateView._PADDING * 2 /* top & bottom padding */;
		return { totalHeight };
	}

	public dispose() {
	}
}
