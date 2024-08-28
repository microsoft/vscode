/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from 'vs/base/browser/dom';
import { StandardKeyboardEvent } from 'vs/base/browser/keyboardEvent';
import * as aria from 'vs/base/browser/ui/aria/aria';
import { IManagedHover } from 'vs/base/browser/ui/hover/hover';
import { getBaseLayerHoverDelegate } from 'vs/base/browser/ui/hover/hoverDelegate2';
import { getDefaultHoverDelegate } from 'vs/base/browser/ui/hover/hoverDelegateFactory';
import { renderIcon } from 'vs/base/browser/ui/iconLabel/iconLabels';
import { IListRenderer, IListVirtualDelegate } from 'vs/base/browser/ui/list/list';
import { List } from 'vs/base/browser/ui/list/listWidget';
import * as arrays from 'vs/base/common/arrays';
import { DeferredPromise, raceCancellation } from 'vs/base/common/async';
import { CancellationToken, CancellationTokenSource } from 'vs/base/common/cancellation';
import { Codicon } from 'vs/base/common/codicons';
import { Emitter } from 'vs/base/common/event';
import { KeyCode } from 'vs/base/common/keyCodes';
import { DisposableStore, IDisposable, toDisposable } from 'vs/base/common/lifecycle';
import { StopWatch } from 'vs/base/common/stopwatch';
import { assertType, isDefined } from 'vs/base/common/types';
import 'vs/css!./renameWidget';
import * as domFontInfo from 'vs/editor/browser/config/domFontInfo';
import { ContentWidgetPositionPreference, ICodeEditor, IContentWidget, IContentWidgetPosition } from 'vs/editor/browser/editorBrowser';
import { EditorOption } from 'vs/editor/common/config/editorOptions';
import { FontInfo } from 'vs/editor/common/config/fontInfo';
import { IDimension } from 'vs/editor/common/core/dimension';
import { Position } from 'vs/editor/common/core/position';
import { IRange, Range } from 'vs/editor/common/core/range';
import { ScrollType } from 'vs/editor/common/editorCommon';
import { NewSymbolName, NewSymbolNameTag, NewSymbolNameTriggerKind, ProviderResult } from 'vs/editor/common/languages';
import * as nls from 'vs/nls';
import { IContextKey, IContextKeyService, RawContextKey } from 'vs/platform/contextkey/common/contextkey';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { ILogService } from 'vs/platform/log/common/log';
import { getListStyles } from 'vs/platform/theme/browser/defaultStyles';
import {
	editorWidgetBackground,
	inputBackground,
	inputBorder,
	inputForeground,
	quickInputListFocusBackground,
	quickInputListFocusForeground,
	widgetBorder,
	widgetShadow
} from 'vs/platform/theme/common/colorRegistry';
import { IColorTheme, IThemeService } from 'vs/platform/theme/common/themeService';

/** for debugging */
const _sticky = false
	// || Boolean("true") // done "weirdly" so that a lint warning prevents you from pushing this
	;


export const CONTEXT_RENAME_INPUT_VISIBLE = new RawContextKey<boolean>('renameInputVisible', false, nls.localize('renameInputVisible', "Whether the rename input widget is visible"));
export const CONTEXT_RENAME_INPUT_FOCUSED = new RawContextKey<boolean>('renameInputFocused', false, nls.localize('renameInputFocused', "Whether the rename input widget is focused"));

/**
 * "Source" of the new name:
 * - 'inputField' - user entered the new name
 * - 'renameSuggestion' - user picked from rename suggestions
 * - 'userEditedRenameSuggestion' - user _likely_ edited a rename suggestion ("likely" because when input started being edited, a rename suggestion had focus)
 */
export type NewNameSource =
	| { k: 'inputField' }
	| { k: 'renameSuggestion' }
	| { k: 'userEditedRenameSuggestion' };

/**
 * Various statistics regarding rename input field
 */
export type RenameWidgetStats = {
	nRenameSuggestions: number;
	source: NewNameSource;
	timeBeforeFirstInputFieldEdit: number | undefined;
	nRenameSuggestionsInvocations: number;
	hadAutomaticRenameSuggestionsInvocation: boolean;
};

export type RenameWidgetResult = {
	/**
	 * The new name to be used
	 */
	newName: string;
	wantsPreview?: boolean;
	stats: RenameWidgetStats;
};

interface IRenameWidget {
	/**
	 * @returns a `boolean` standing for `shouldFocusEditor`, if user didn't pick a new name, or a {@link RenameWidgetResult}
	 */
	getInput(
		where: IRange,
		currentName: string,
		supportPreview: boolean,
		requestRenameSuggestions: (triggerKind: NewSymbolNameTriggerKind, cts: CancellationToken) => ProviderResult<NewSymbolName[]>[],
		cts: CancellationTokenSource
	): Promise<RenameWidgetResult | boolean>;

	acceptInput(wantsPreview: boolean): void;
	cancelInput(focusEditor: boolean, caller: string): void;

	focusNextRenameSuggestion(): void;
	focusPreviousRenameSuggestion(): void;
}

export class RenameWidget implements IRenameWidget, IContentWidget, IDisposable {

	// implement IContentWidget
	readonly allowEditorOverflow: boolean = true;

	// UI state

	private _domNode?: HTMLElement;
	private _inputWithButton: InputWithButton;
	private _renameCandidateListView?: RenameCandidateListView;
	private _label?: HTMLDivElement;

	private _nPxAvailableAbove?: number;
	private _nPxAvailableBelow?: number;

	// Model state

	private _position?: Position;
	private _currentName?: string;
	/** Is true if input field got changes when a rename candidate was focused; otherwise, false */
	private _isEditingRenameCandidate: boolean;

	private readonly _candidates: Set<string>;

	private _visible?: boolean;

	/** must be reset at session start */
	private _beforeFirstInputFieldEditSW: StopWatch;

	/**
	 * Milliseconds before user edits the input field for the first time
	 * @remarks must be set once per session
	 */
	private _timeBeforeFirstInputFieldEdit: number | undefined;

	private _nRenameSuggestionsInvocations: number;

	private _hadAutomaticRenameSuggestionsInvocation: boolean;

	private _renameCandidateProvidersCts: CancellationTokenSource | undefined;
	private _renameCts: CancellationTokenSource | undefined;

	private readonly _visibleContextKey: IContextKey<boolean>;
	private readonly _disposables = new DisposableStore();

	constructor(
		private readonly _editor: ICodeEditor,
		private readonly _acceptKeybindings: [string, string],
		@IThemeService private readonly _themeService: IThemeService,
		@IKeybindingService private readonly _keybindingService: IKeybindingService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@ILogService private readonly _logService: ILogService,
	) {
		this._visibleContextKey = CONTEXT_RENAME_INPUT_VISIBLE.bindTo(contextKeyService);

		this._isEditingRenameCandidate = false;

		this._nRenameSuggestionsInvocations = 0;

		this._hadAutomaticRenameSuggestionsInvocation = false;

		this._candidates = new Set();

		this._beforeFirstInputFieldEditSW = new StopWatch();

		this._inputWithButton = new InputWithButton();
		this._disposables.add(this._inputWithButton);

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

			this._domNode.appendChild(this._inputWithButton.domNode);

			this._renameCandidateListView = this._disposables.add(
				new RenameCandidateListView(this._domNode, {
					fontInfo: this._editor.getOption(EditorOption.fontInfo),
					onFocusChange: (newSymbolName: string) => {
						this._inputWithButton.input.value = newSymbolName;
						this._isEditingRenameCandidate = false; // @ulugbekna: reset
					},
					onSelectionChange: () => {
						this._isEditingRenameCandidate = false; // @ulugbekna: because user picked a rename suggestion
						this.acceptInput(false); // we don't allow preview with mouse click for now
					}
				})
			);

			this._disposables.add(
				this._inputWithButton.onDidInputChange(() => {
					if (this._renameCandidateListView?.focusedCandidate !== undefined) {
						this._isEditingRenameCandidate = true;
					}
					this._timeBeforeFirstInputFieldEdit ??= this._beforeFirstInputFieldEditSW.elapsed();
					if (this._renameCandidateProvidersCts?.token.isCancellationRequested === false) {
						this._renameCandidateProvidersCts.cancel();
					}
					this._renameCandidateListView?.clearFocus();
				})
			);

			this._label = document.createElement('div');
			this._label.className = 'rename-label';
			this._domNode.appendChild(this._label);

			this._updateFont();
			this._updateStyles(this._themeService.getColorTheme());
		}
		return this._domNode;
	}

	private _updateStyles(theme: IColorTheme): void {
		if (!this._domNode) {
			return;
		}

		const widgetShadowColor = theme.getColor(widgetShadow);
		const widgetBorderColor = theme.getColor(widgetBorder);
		this._domNode.style.backgroundColor = String(theme.getColor(editorWidgetBackground) ?? '');
		this._domNode.style.boxShadow = widgetShadowColor ? ` 0 0 8px 2px ${widgetShadowColor}` : '';
		this._domNode.style.border = widgetBorderColor ? `1px solid ${widgetBorderColor}` : '';
		this._domNode.style.color = String(theme.getColor(inputForeground) ?? '');

		const border = theme.getColor(inputBorder);

		this._inputWithButton.domNode.style.backgroundColor = String(theme.getColor(inputBackground) ?? '');
		this._inputWithButton.input.style.backgroundColor = String(theme.getColor(inputBackground) ?? '');
		this._inputWithButton.domNode.style.borderWidth = border ? '1px' : '0px';
		this._inputWithButton.domNode.style.borderStyle = border ? 'solid' : 'none';
		this._inputWithButton.domNode.style.borderColor = border?.toString() ?? 'none';
	}

	private _updateFont(): void {
		if (this._domNode === undefined) {
			return;
		}
		assertType(this._label !== undefined, 'RenameWidget#_updateFont: _label must not be undefined given _domNode is defined');

		this._editor.applyFontInfo(this._inputWithButton.input);

		const fontInfo = this._editor.getOption(EditorOption.fontInfo);
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

		const bodyBox = dom.getClientArea(this.getDomNode().ownerDocument.body);
		const editorBox = dom.getDomNodePagePosition(this._editor.getDomNode());

		const cursorBoxTop = this._getTopForPosition();

		this._nPxAvailableAbove = cursorBoxTop + editorBox.top;
		this._nPxAvailableBelow = bodyBox.height - this._nPxAvailableAbove;

		const lineHeight = this._editor.getOption(EditorOption.lineHeight);
		const { totalHeight: candidateViewHeight } = RenameCandidateView.getLayoutInfo({ lineHeight });

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
		this._label!.innerText = nls.localize({ key: 'label', comment: ['placeholders are keybindings, e.g "F2 to Rename, Shift+F2 to Preview"'] }, "{0} to Rename, {1} to Preview", this._keybindingService.lookupKeybinding(accept)?.getLabel(), this._keybindingService.lookupKeybinding(preview)?.getLabel());

		this._domNode!.style.minWidth = `200px`; // to prevent from widening when candidates come in

		return null;
	}

	afterRender(position: ContentWidgetPositionPreference | null): void {
		// FIXME@ulugbekna: commenting trace log out until we start unmounting the widget from editor properly - https://github.com/microsoft/vscode/issues/226975
		// this._trace('invoking afterRender, position: ', position ? 'not null' : 'null');
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

		assertType(this._renameCandidateListView);
		assertType(this._nPxAvailableAbove !== undefined);
		assertType(this._nPxAvailableBelow !== undefined);

		const inputBoxHeight = dom.getTotalHeight(this._inputWithButton.domNode);

		const labelHeight = dom.getTotalHeight(this._label!);

		let totalHeightAvailable: number;
		if (position === ContentWidgetPositionPreference.BELOW) {
			totalHeightAvailable = this._nPxAvailableBelow;
		} else {
			totalHeightAvailable = this._nPxAvailableAbove;
		}

		this._renameCandidateListView!.layout({
			height: totalHeightAvailable - labelHeight - inputBoxHeight,
			width: dom.getTotalWidth(this._inputWithButton.domNode),
		});
	}


	private _currentAcceptInput?: (wantsPreview: boolean) => void;
	private _currentCancelInput?: (focusEditor: boolean) => void;
	private _requestRenameCandidatesOnce?: (triggerKind: NewSymbolNameTriggerKind, cts: CancellationToken) => ProviderResult<NewSymbolName[]>[];

	acceptInput(wantsPreview: boolean): void {
		this._trace(`invoking acceptInput`);
		this._currentAcceptInput?.(wantsPreview);
	}

	cancelInput(focusEditor: boolean, caller: string): void {
		// this._trace(`invoking cancelInput, caller: ${caller}, _currentCancelInput: ${this._currentAcceptInput ? 'not undefined' : 'undefined'}`);
		this._currentCancelInput?.(focusEditor);
	}

	focusNextRenameSuggestion() {
		if (!this._renameCandidateListView?.focusNext()) {
			this._inputWithButton.input.value = this._currentName!;
		}
	}

	focusPreviousRenameSuggestion() { // TODO@ulugbekna: this and focusNext should set the original name if no candidate is focused
		if (!this._renameCandidateListView?.focusPrevious()) {
			this._inputWithButton.input.value = this._currentName!;
		}
	}

	/**
	 * @param requestRenameCandidates is `undefined` when there are no rename suggestion providers
	 */
	getInput(
		where: IRange,
		currentName: string,
		supportPreview: boolean,
		requestRenameCandidates: undefined | ((triggerKind: NewSymbolNameTriggerKind, cts: CancellationToken) => ProviderResult<NewSymbolName[]>[]),
		cts: CancellationTokenSource
	): Promise<RenameWidgetResult | boolean> {

		const { start: selectionStart, end: selectionEnd } = this._getSelection(where, currentName);

		this._renameCts = cts;

		const disposeOnDone = new DisposableStore();

		this._nRenameSuggestionsInvocations = 0;

		this._hadAutomaticRenameSuggestionsInvocation = false;

		if (requestRenameCandidates === undefined) {
			this._inputWithButton.button.style.display = 'none';
		} else {
			this._inputWithButton.button.style.display = 'flex';

			this._requestRenameCandidatesOnce = requestRenameCandidates;

			this._requestRenameCandidates(currentName, false);

			disposeOnDone.add(dom.addDisposableListener(
				this._inputWithButton.button,
				'click',
				() => this._requestRenameCandidates(currentName, true)
			));
			disposeOnDone.add(dom.addDisposableListener(
				this._inputWithButton.button,
				dom.EventType.KEY_DOWN,
				(e) => {
					const keyEvent = new StandardKeyboardEvent(e);

					if (keyEvent.equals(KeyCode.Enter) || keyEvent.equals(KeyCode.Space)) {
						keyEvent.stopPropagation();
						keyEvent.preventDefault();
						this._requestRenameCandidates(currentName, true);
					}
				}
			));
		}

		this._isEditingRenameCandidate = false;

		this._domNode!.classList.toggle('preview', supportPreview);

		this._position = new Position(where.startLineNumber, where.startColumn);
		this._currentName = currentName;

		this._inputWithButton.input.value = currentName;
		this._inputWithButton.input.setAttribute('selectionStart', selectionStart.toString());
		this._inputWithButton.input.setAttribute('selectionEnd', selectionEnd.toString());
		this._inputWithButton.input.size = Math.max((where.endColumn - where.startColumn) * 1.1, 20); // determines width

		this._beforeFirstInputFieldEditSW.reset();


		disposeOnDone.add(toDisposable(() => {
			this._renameCts = undefined;
			cts.dispose(true);
		})); // @ulugbekna: this may result in `this.cancelInput` being called twice, but it should be safe since we set it to undefined after 1st call
		disposeOnDone.add(toDisposable(() => {
			if (this._renameCandidateProvidersCts !== undefined) {
				this._renameCandidateProvidersCts.dispose(true);
				this._renameCandidateProvidersCts = undefined;
			}
		}));

		disposeOnDone.add(toDisposable(() => this._candidates.clear()));

		const inputResult = new DeferredPromise<RenameWidgetResult | boolean>();

		inputResult.p.finally(() => {
			disposeOnDone.dispose();
			this._hide();
		});

		this._currentCancelInput = (focusEditor) => {
			this._trace('invoking _currentCancelInput');
			this._currentAcceptInput = undefined;
			this._currentCancelInput = undefined;
			// fixme session cleanup
			this._renameCandidateListView?.clearCandidates();
			inputResult.complete(focusEditor);
			return true;
		};

		this._currentAcceptInput = (wantsPreview) => {
			this._trace('invoking _currentAcceptInput');
			assertType(this._renameCandidateListView !== undefined);

			const nRenameSuggestions = this._renameCandidateListView.nCandidates;

			let newName: string;
			let source: NewNameSource;
			const focusedCandidate = this._renameCandidateListView.focusedCandidate;
			if (focusedCandidate !== undefined) {
				this._trace('using new name from renameSuggestion');
				newName = focusedCandidate;
				source = { k: 'renameSuggestion' };
			} else {
				this._trace('using new name from inputField');
				newName = this._inputWithButton.input.value;
				source = this._isEditingRenameCandidate ? { k: 'userEditedRenameSuggestion' } : { k: 'inputField' };
			}

			if (newName === currentName || newName.trim().length === 0 /* is just whitespace */) {
				this.cancelInput(true, '_currentAcceptInput (because newName === value || newName.trim().length === 0)');
				return;
			}

			this._currentAcceptInput = undefined;
			this._currentCancelInput = undefined;
			this._renameCandidateListView.clearCandidates();
			// fixme session cleanup

			inputResult.complete({
				newName,
				wantsPreview: supportPreview && wantsPreview,
				stats: {
					source,
					nRenameSuggestions,
					timeBeforeFirstInputFieldEdit: this._timeBeforeFirstInputFieldEdit,
					nRenameSuggestionsInvocations: this._nRenameSuggestionsInvocations,
					hadAutomaticRenameSuggestionsInvocation: this._hadAutomaticRenameSuggestionsInvocation,
				}
			});
		};

		disposeOnDone.add(cts.token.onCancellationRequested(() => this.cancelInput(true, 'cts.token.onCancellationRequested')));
		if (!_sticky) {
			disposeOnDone.add(this._editor.onDidBlurEditorWidget(() => this.cancelInput(!this._domNode?.ownerDocument.hasFocus(), 'editor.onDidBlurEditorWidget')));
		}

		this._show();

		return inputResult.p;
	}

	private _requestRenameCandidates(currentName: string, isManuallyTriggered: boolean) {
		if (this._requestRenameCandidatesOnce === undefined) {
			return;
		}
		if (this._renameCandidateProvidersCts !== undefined) {
			this._renameCandidateProvidersCts.dispose(true);
		}

		assertType(this._renameCts);

		if (this._inputWithButton.buttonState !== 'stop') {

			this._renameCandidateProvidersCts = new CancellationTokenSource();

			const triggerKind = isManuallyTriggered ? NewSymbolNameTriggerKind.Invoke : NewSymbolNameTriggerKind.Automatic;
			const candidates = this._requestRenameCandidatesOnce(triggerKind, this._renameCandidateProvidersCts.token);

			if (candidates.length === 0) {
				this._inputWithButton.setSparkleButton();
				return;
			}

			if (!isManuallyTriggered) {
				this._hadAutomaticRenameSuggestionsInvocation = true;
			}

			this._nRenameSuggestionsInvocations += 1;

			this._inputWithButton.setStopButton();

			this._updateRenameCandidates(candidates, currentName, this._renameCts.token);
		}
	}

	/**
	 * This allows selecting only part of the symbol name in the input field based on the selection in the editor
	 */
	private _getSelection(where: IRange, currentName: string): { start: number; end: number } {
		assertType(this._editor.hasModel());

		const selection = this._editor.getSelection();
		let start = 0;
		let end = currentName.length;

		if (!Range.isEmpty(selection) && !Range.spansMultipleLines(selection) && Range.containsRange(where, selection)) {
			start = Math.max(0, selection.startColumn - where.startColumn);
			end = Math.min(where.endColumn, selection.endColumn) - where.startColumn;
		}

		return { start, end };
	}

	private _show(): void {
		this._trace('invoking _show');
		this._editor.revealLineInCenterIfOutsideViewport(this._position!.lineNumber, ScrollType.Smooth);
		this._visible = true;
		this._visibleContextKey.set(true);
		this._editor.layoutContentWidget(this);

		// TODO@ulugbekna: could this be simply run in `afterRender`?
		setTimeout(() => {
			this._inputWithButton.input.focus();
			this._inputWithButton.input.setSelectionRange(
				parseInt(this._inputWithButton.input.getAttribute('selectionStart')!),
				parseInt(this._inputWithButton.input.getAttribute('selectionEnd')!)
			);
		}, 100);
	}

	private async _updateRenameCandidates(candidates: ProviderResult<NewSymbolName[]>[], currentName: string, token: CancellationToken) {
		const trace = (...args: any[]) => this._trace('_updateRenameCandidates', ...args);

		trace('start');
		const namesListResults = await raceCancellation(Promise.allSettled(candidates), token);

		this._inputWithButton.setSparkleButton();

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

		const validDistinctNames = distinctNames.filter(({ newSymbolName }) => newSymbolName.trim().length > 0 && newSymbolName !== this._inputWithButton.input.value && newSymbolName !== currentName && !this._candidates.has(newSymbolName));
		trace(`valid distinct candidates - ${newNames.length} candidates.`);

		validDistinctNames.forEach(n => this._candidates.add(n.newSymbolName));

		if (validDistinctNames.length < 1) {
			trace('returning early - no valid distinct candidates');
			return;
		}

		// show the candidates
		trace('setting candidates');
		this._renameCandidateListView!.setCandidates(validDistinctNames);

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
			this._logService.warn('RenameWidget#_getTopForPosition: this should not happen - visibleRanges is empty');
			firstLineInViewport = Math.max(1, this._position!.lineNumber - 5); // @ulugbekna: fallback to current line minus 5
		}
		return this._editor.getTopForLineNumber(this._position!.lineNumber) - this._editor.getTopForLineNumber(firstLineInViewport);
	}

	private _trace(...args: unknown[]) {
		this._logService.trace('RenameWidget', ...args);
	}
}

class RenameCandidateListView {

	/** Parent node of the list widget; needed to control # of list elements visible */
	private readonly _listContainer: HTMLDivElement;
	private readonly _listWidget: List<NewSymbolName>;

	private _lineHeight: number;
	private _availableHeight: number;
	private _minimumWidth: number;
	private _typicalHalfwidthCharacterWidth: number;

	private readonly _disposables: DisposableStore;

	// FIXME@ulugbekna: rewrite using event emitters
	constructor(parent: HTMLElement, opts: { fontInfo: FontInfo; onFocusChange: (newSymbolName: string) => void; onSelectionChange: () => void }) {

		this._disposables = new DisposableStore();

		this._availableHeight = 0;
		this._minimumWidth = 0;

		this._lineHeight = opts.fontInfo.lineHeight;
		this._typicalHalfwidthCharacterWidth = opts.fontInfo.typicalHalfwidthCharacterWidth;

		this._listContainer = document.createElement('div');
		this._listContainer.className = 'rename-box rename-candidate-list-container';
		parent.appendChild(this._listContainer);

		this._listWidget = RenameCandidateListView._createListWidget(this._listContainer, this._candidateViewHeight, opts.fontInfo);

		this._listWidget.onDidChangeFocus(
			e => {
				if (e.elements.length === 1) {
					opts.onFocusChange(e.elements[0].newSymbolName);
				}
			},
			this._disposables
		);

		this._listWidget.onDidChangeSelection(
			e => {
				if (e.elements.length === 1) {
					opts.onSelectionChange();
				}
			},
			this._disposables
		);

		this._disposables.add(
			this._listWidget.onDidBlur(e => { // @ulugbekna: because list widget otherwise remembers last focused element and returns it as focused element
				this._listWidget.setFocus([]);
			})
		);

		this._listWidget.style(getListStyles({
			listInactiveFocusForeground: quickInputListFocusForeground,
			listInactiveFocusBackground: quickInputListFocusBackground,
		}));
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
		const height = this._pickListHeight(this._listWidget.length);
		const width = this._pickListWidth(candidates);

		this._listWidget.layout(height, width);

		// adjust list container layout
		this._listContainer.style.height = `${height}px`;
		this._listContainer.style.width = `${width}px`;

		aria.status(nls.localize('renameSuggestionsReceivedAria', "Received {0} rename suggestions", candidates.length));
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

	public focusNext(): boolean {
		if (this._listWidget.length === 0) {
			return false;
		}
		const focusedIxs = this._listWidget.getFocus();
		if (focusedIxs.length === 0) {
			this._listWidget.focusFirst();
			this._listWidget.reveal(0);
			return true;
		} else {
			if (focusedIxs[0] === this._listWidget.length - 1) {
				this._listWidget.setFocus([]);
				this._listWidget.reveal(0); // @ulugbekna: without this, it seems like focused element is obstructed
				return false;
			} else {
				this._listWidget.focusNext();
				const focused = this._listWidget.getFocus()[0];
				this._listWidget.reveal(focused);
				return true;
			}
		}
	}

	/**
	 * @returns true if focus is moved to previous element
	 */
	public focusPrevious(): boolean {
		if (this._listWidget.length === 0) {
			return false;
		}
		const focusedIxs = this._listWidget.getFocus();
		if (focusedIxs.length === 0) {
			this._listWidget.focusLast();
			const focused = this._listWidget.getFocus()[0];
			this._listWidget.reveal(focused);
			return true;
		} else {
			if (focusedIxs[0] === 0) {
				this._listWidget.setFocus([]);
				return false;
			} else {
				this._listWidget.focusPrevious();
				const focused = this._listWidget.getFocus()[0];
				this._listWidget.reveal(focused);
				return true;
			}
		}
	}

	public clearFocus(): void {
		this._listWidget.setFocus([]);
	}

	private get _candidateViewHeight(): number {
		const { totalHeight } = RenameCandidateView.getLayoutInfo({ lineHeight: this._lineHeight });
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

	private static _createListWidget(container: HTMLElement, candidateViewHeight: number, fontInfo: FontInfo) {
		const virtualDelegate = new class implements IListVirtualDelegate<NewSymbolName> {
			getTemplateId(element: NewSymbolName): string {
				return 'candidate';
			}

			getHeight(element: NewSymbolName): number {
				return candidateViewHeight;
			}
		};

		const renderer = new class implements IListRenderer<NewSymbolName, RenameCandidateView> {
			readonly templateId = 'candidate';

			renderTemplate(container: HTMLElement): RenameCandidateView {
				return new RenameCandidateView(container, fontInfo);
			}

			renderElement(candidate: NewSymbolName, index: number, templateData: RenameCandidateView): void {
				templateData.populate(candidate);
			}

			disposeTemplate(templateData: RenameCandidateView): void {
				templateData.dispose();
			}
		};

		return new List(
			'NewSymbolNameCandidates',
			container,
			virtualDelegate,
			[renderer],
			{
				keyboardSupport: false, // @ulugbekna: because we handle keyboard events through proper commands & keybinding service, see `rename.ts`
				mouseSupport: true,
				multipleSelectionSupport: false,
			}
		);
	}
}

class InputWithButton implements IDisposable {

	private _buttonState: 'sparkle' | 'stop' | undefined;

	private _domNode: HTMLDivElement | undefined;
	private _inputNode: HTMLInputElement | undefined;
	private _buttonNode: HTMLElement | undefined;
	private _buttonHover: IManagedHover | undefined;
	private _buttonGenHoverText: string | undefined;
	private _buttonCancelHoverText: string | undefined;
	private _sparkleIcon: HTMLElement | undefined;
	private _stopIcon: HTMLElement | undefined;

	private readonly _onDidInputChange = new Emitter<void>();
	public readonly onDidInputChange = this._onDidInputChange.event;

	private readonly _disposables = new DisposableStore();

	get domNode() {
		if (!this._domNode) {

			this._domNode = document.createElement('div');
			this._domNode.className = 'rename-input-with-button';
			this._domNode.style.display = 'flex';
			this._domNode.style.flexDirection = 'row';
			this._domNode.style.alignItems = 'center';

			this._inputNode = document.createElement('input');
			this._inputNode.className = 'rename-input';
			this._inputNode.type = 'text';
			this._inputNode.style.border = 'none';
			this._inputNode.setAttribute('aria-label', nls.localize('renameAriaLabel', "Rename input. Type new name and press Enter to commit."));

			this._domNode.appendChild(this._inputNode);

			this._buttonNode = document.createElement('div');
			this._buttonNode.className = 'rename-suggestions-button';
			this._buttonNode.setAttribute('tabindex', '0');

			this._buttonGenHoverText = nls.localize('generateRenameSuggestionsButton', "Generate new name suggestions");
			this._buttonCancelHoverText = nls.localize('cancelRenameSuggestionsButton', "Cancel");
			this._buttonHover = getBaseLayerHoverDelegate().setupManagedHover(getDefaultHoverDelegate('element'), this._buttonNode, this._buttonGenHoverText);
			this._disposables.add(this._buttonHover);

			this._domNode.appendChild(this._buttonNode);

			// notify if selection changes to cancel request to rename-suggestion providers

			this._disposables.add(dom.addDisposableListener(this.input, dom.EventType.INPUT, () => this._onDidInputChange.fire()));
			this._disposables.add(dom.addDisposableListener(this.input, dom.EventType.KEY_DOWN, (e) => {
				const keyEvent = new StandardKeyboardEvent(e);
				if (keyEvent.keyCode === KeyCode.LeftArrow || keyEvent.keyCode === KeyCode.RightArrow) {
					this._onDidInputChange.fire();
				}
			}));
			this._disposables.add(dom.addDisposableListener(this.input, dom.EventType.CLICK, () => this._onDidInputChange.fire()));

			// focus "container" border instead of input box

			this._disposables.add(dom.addDisposableListener(this.input, dom.EventType.FOCUS, () => {
				this.domNode.style.outlineWidth = '1px';
				this.domNode.style.outlineStyle = 'solid';
				this.domNode.style.outlineOffset = '-1px';
				this.domNode.style.outlineColor = 'var(--vscode-focusBorder)';
			}));
			this._disposables.add(dom.addDisposableListener(this.input, dom.EventType.BLUR, () => {
				this.domNode.style.outline = 'none';
			}));
		}
		return this._domNode;
	}

	get input() {
		assertType(this._inputNode);
		return this._inputNode;
	}

	get button() {
		assertType(this._buttonNode);
		return this._buttonNode;
	}

	get buttonState() {
		return this._buttonState;
	}

	setSparkleButton() {
		this._buttonState = 'sparkle';
		this._sparkleIcon ??= renderIcon(Codicon.sparkle);
		dom.clearNode(this.button);
		this.button.appendChild(this._sparkleIcon);
		this.button.setAttribute('aria-label', 'Generating new name suggestions');
		this._buttonHover?.update(this._buttonGenHoverText);
		this.input.focus();
	}

	setStopButton() {
		this._buttonState = 'stop';
		this._stopIcon ??= renderIcon(Codicon.primitiveSquare);
		dom.clearNode(this.button);
		this.button.appendChild(this._stopIcon);
		this.button.setAttribute('aria-label', 'Cancel generating new name suggestions');
		this._buttonHover?.update(this._buttonCancelHoverText);
		this.input.focus();
	}

	dispose(): void {
		this._disposables.dispose();
	}
}

class RenameCandidateView {

	private static _PADDING: number = 2;

	private readonly _domNode: HTMLElement;
	private readonly _icon: HTMLElement;
	private readonly _label: HTMLElement;

	constructor(parent: HTMLElement, fontInfo: FontInfo) {

		this._domNode = document.createElement('div');
		this._domNode.className = 'rename-box rename-candidate';
		this._domNode.style.display = `flex`;
		this._domNode.style.columnGap = `5px`;
		this._domNode.style.alignItems = `center`;
		this._domNode.style.height = `${fontInfo.lineHeight}px`;
		this._domNode.style.padding = `${RenameCandidateView._PADDING}px`;

		// @ulugbekna: needed to keep space when the `icon.style.display` is set to `none`
		const iconContainer = document.createElement('div');
		iconContainer.style.display = `flex`;
		iconContainer.style.alignItems = `center`;
		iconContainer.style.width = iconContainer.style.height = `${fontInfo.lineHeight * 0.8}px`;
		this._domNode.appendChild(iconContainer);

		this._icon = renderIcon(Codicon.sparkle);
		this._icon.style.display = `none`;
		iconContainer.appendChild(this._icon);

		this._label = document.createElement('div');
		domFontInfo.applyFontInfo(this._label, fontInfo);
		this._domNode.appendChild(this._label);

		parent.appendChild(this._domNode);
	}

	public populate(value: NewSymbolName) {
		this._updateIcon(value);
		this._updateLabel(value);
	}

	private _updateIcon(value: NewSymbolName) {
		const isAIGenerated = !!value.tags?.includes(NewSymbolNameTag.AIGenerated);
		this._icon.style.display = isAIGenerated ? 'inherit' : 'none';
	}

	private _updateLabel(value: NewSymbolName) {
		this._label.innerText = value.newSymbolName;
	}

	public static getLayoutInfo({ lineHeight }: { lineHeight: number }): { totalHeight: number } {
		const totalHeight = lineHeight + RenameCandidateView._PADDING * 2 /* top & bottom padding */;
		return { totalHeight };
	}

	public dispose() {
	}
}
