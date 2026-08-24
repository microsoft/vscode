/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/agentFeedbackEditorInput.css';
import { Disposable, DisposableStore } from '../../../../base/common/lifecycle.js';
import { MarkdownString } from '../../../../base/common/htmlContent.js';
import { ICodeEditor, IEditorMouseEvent, IOverlayWidget, IOverlayWidgetPosition } from '../../../../editor/browser/editorBrowser.js';
import { IEditorContribution, IEditorDecorationsCollection } from '../../../../editor/common/editorCommon.js';
import { EditorContributionInstantiation, registerEditorContribution } from '../../../../editor/browser/editorExtensions.js';
import { ICodeEditorService } from '../../../../editor/browser/services/codeEditorService.js';
import { EditorOption } from '../../../../editor/common/config/editorOptions.js';
import { Position } from '../../../../editor/common/core/position.js';
import { Range } from '../../../../editor/common/core/range.js';
import { Selection, SelectionDirection } from '../../../../editor/common/core/selection.js';
import { addStandardDisposableListener, getWindow, isHTMLElement } from '../../../../base/browser/dom.js';
import { URI } from '../../../../base/common/uri.js';
import { isEqual } from '../../../../base/common/resources.js';
import { KeyCode } from '../../../../base/common/keyCodes.js';
import { Keybinding, KeyCodeChord, ResolvedKeybinding } from '../../../../base/common/keybindings.js';
import { IAgentFeedbackService } from './agentFeedbackService.js';
import { createAgentFeedbackContext } from './agentFeedbackEditorUtils.js';
import { localize, localize2 } from '../../../../nls.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { Event } from '../../../../base/common/event.js';
import { Action2, MenuId, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { ContextKeyExpr, IContextKey, IContextKeyService, RawContextKey } from '../../../../platform/contextkey/common/contextkey.js';
import { IInstantiationService, ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { IContextMenuService } from '../../../../platform/contextview/browser/contextView.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { ChatContextKeys } from '../../../../workbench/contrib/chat/common/actions/chatContextKeys.js';
import { CHAT_CATEGORY } from '../../../../workbench/contrib/chat/browser/actions/chatActions.js';
import { FeedbackInputWidget } from './feedbackInputWidget.js';

const addFeedbackAtCurrentLineActionId = 'agentFeedbackEditor.action.addAtCurrentLine';
const agentFeedbackHoverGlyphClassName = 'agent-feedback-glyph';
const hasAgentFeedbackSessionForEditor = new RawContextKey<boolean>('agentFeedbackEditor.hasSession', false);

/**
 * The inline "Add Feedback" input shown in the editor when the user selects a
 * range to comment on. Exported so it can be rendered in a component fixture;
 * it only depends on {@link ICodeEditor} for its layout geometry. Wraps the
 * reusable {@link FeedbackInputWidget} core as an {@link IOverlayWidget}.
 */
export class AgentFeedbackInputWidget extends Disposable implements IOverlayWidget {

	private static readonly _ID = 'agentFeedback.inputWidget';

	readonly allowEditorOverflow = false;

	private readonly _core: FeedbackInputWidget;
	private _position: IOverlayWidgetPosition | null = null;

	readonly onDidTriggerAdd: Event<void>;
	readonly onDidTriggerAddAndSubmit: Event<void>;

	constructor(
		private readonly _editor: ICodeEditor,
		@IContextMenuService contextMenuService: IContextMenuService,
		@IKeybindingService keybindingService: IKeybindingService,
	) {
		super();
		const enterKeybinding = this._resolveKeybinding(keybindingService, false);
		const altEnterKeybinding = this._resolveKeybinding(keybindingService, true);
		this._core = this._register(new FeedbackInputWidget({
			placeholder: localize('agentFeedback.addFeedback', "Add Feedback"),
			getMaxContentWidth: () => this._computeContentWidth(),
			primaryAction: {
				label: localize('agentFeedback.addAction', "Add"),
				icon: Codicon.plus,
				keybindingLabel: localize('enter', "Enter"),
				menuKeybinding: enterKeybinding,
			},
			secondaryAction: {
				label: localize('agentFeedback.addAndSubmit', "Add and Submit"),
				icon: Codicon.send,
				keybindingLabel: localize('altEnter', "Alt+Enter"),
				menuKeybinding: altEnterKeybinding,
			},
			contextMenuProvider: contextMenuService,
		}));
		this.onDidTriggerAdd = this._core.onDidTriggerPrimary;
		this.onDidTriggerAddAndSubmit = this._core.onDidTriggerSecondary;
	}

	private _resolveKeybinding(keybindingService: IKeybindingService, altKey: boolean): ResolvedKeybinding {
		const [resolvedKeybinding] = keybindingService.resolveKeybinding(new Keybinding([
			new KeyCodeChord(false, false, altKey, false, KeyCode.Enter),
		]));
		if (!resolvedKeybinding) {
			throw new Error('Unable to resolve the feedback input keybinding');
		}
		return resolvedKeybinding;
	}

	getId(): string {
		return AgentFeedbackInputWidget._ID;
	}

	getDomNode(): HTMLElement {
		return this._core.domNode;
	}

	getPosition(): IOverlayWidgetPosition | null {
		return this._position;
	}

	get inputElement(): HTMLTextAreaElement {
		return this._core.inputElement;
	}

	setPosition(position: IOverlayWidgetPosition | null): void {
		this._position = position;
		this._editor.layoutOverlayWidget(this);
	}

	show(): void {
		this._core.show();
	}

	hide(): void {
		this._core.hide();
	}

	clearInput(): void {
		this._core.clearInput();
	}

	setPlaceholder(placeholder: string): void {
		this._core.setPlaceholder(placeholder);
	}

	autoSize(): void {
		this._core.autoSize();
	}

	updateActionEnabled(): void {
		this._core.updateActionEnabled();
	}

	private _computeContentWidth(): number {
		// The widget sticks to the editor's content left edge, so the space it
		// has available is the content area width (to the right of the line
		// numbers/glyph margin), not the full editor width.
		const layoutInfo = this._editor.getLayoutInfo();
		return Math.max(0, layoutInfo.width - layoutInfo.contentLeft);
	}
}

export class AgentFeedbackEditorInputContribution extends Disposable implements IEditorContribution {

	static readonly ID = 'agentFeedback.editorInputContribution';

	private _widget: AgentFeedbackInputWidget | undefined;
	private _visible = false;
	private _mouseDown = false;
	private _suppressSelectionChangeOnce = false;
	private _sessionResource: URI | undefined;
	private _pinnedRange: Range | undefined;
	private _anchorPosition: Position | undefined;
	private _preferBelow = true;
	private _hoverLineNumber: number | undefined;
	private readonly _hoverDecorations: IEditorDecorationsCollection;
	private readonly _hasAgentFeedbackSessionContext: IContextKey<boolean>;
	private readonly _widgetListeners = this._store.add(new DisposableStore());

	constructor(
		private readonly _editor: ICodeEditor,
		@IAgentFeedbackService private readonly _agentFeedbackService: IAgentFeedbackService,
		@ICodeEditorService private readonly _codeEditorService: ICodeEditorService,
		@IContextKeyService private readonly _contextKeyService: IContextKeyService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
	) {
		super();

		this._hoverDecorations = this._editor.createDecorationsCollection();
		this._store.add({ dispose: () => this._hoverDecorations.clear() });
		this._hasAgentFeedbackSessionContext = hasAgentFeedbackSessionForEditor.bindTo(this._contextKeyService);

		this._store.add(this._editor.onDidChangeCursorSelection(() => this._onSelectionChanged()));
		this._store.add(this._editor.onDidChangeModel(() => this._onModelChanged()));
		this._store.add(this._editor.onDidScrollChange(() => {
			if (this._visible) {
				this._updatePosition();
			}
		}));
		this._store.add(this._editor.onDidLayoutChange(() => {
			if (this._visible && this._widget) {
				// The editor resized: re-clamp the input width to the new editor
				// width and reposition it.
				this._widget.autoSize();
				this._updatePosition();
			}
		}));
		this._store.add(this._editor.onMouseMove(e => this._onEditorMouseMove(e)));
		this._store.add(this._editor.onMouseLeave(() => this._clearHoverGlyph()));
		this._store.add(this._editor.onMouseDown((e) => {
			if (this._isWidgetTarget(e.event.target)) {
				return;
			}
			if (this._isHoverGlyphTarget(e)) {
				e.event.preventDefault();
				e.event.stopPropagation();
				const lineNumber = e.target.position?.lineNumber;
				if (lineNumber !== undefined) {
					this._selectLine(lineNumber);
				}
				return;
			}
			this._mouseDown = true;
			this._autoHide();
		}));
		this._store.add(this._editor.onMouseUp((e) => {
			this._mouseDown = false;
			if (this._isWidgetTarget(e.event.target)) {
				return;
			}
			if (this._isHoverGlyphTarget(e)) {
				return;
			}
			this._onSelectionChanged();
		}));
		this._store.add(this._editor.onDidBlurEditorWidget(() => {
			if (!this._visible) {
				return;
			}
			// Defer so focus has settled to the new target
			getWindow(this._editor.getDomNode()!).setTimeout(() => {
				if (!this._visible) {
					return;
				}
				if (this._isWidgetTarget(getWindow(this._editor.getDomNode()!).document.activeElement)) {
					return;
				}
				this._autoHide();
			}, 0);
		}));
		this._store.add(this._editor.onDidFocusEditorText(() => this._onSelectionChanged()));
		this._store.add(this._agentFeedbackService.onDidChangeFeedbackScope(() => {
			this._clearHoverGlyph();
			this._sessionResource = this._getSessionForModel();
			if (this._visible && this._widget) {
				if (!this._sessionResource) {
					this._autoHide();
				} else {
					this._widget.setPlaceholder(this._getPlaceholder());
				}
			}
		}));
		this._getSessionForModel();
	}

	private _isWidgetTarget(target: EventTarget | Element | null): boolean {
		return !!this._widget && !!target && this._widget.getDomNode().contains(target as Node);
	}

	private _isHoverGlyphTarget(e: IEditorMouseEvent): boolean {
		return isHTMLElement(e.target.element) && e.target.element.classList.contains(agentFeedbackHoverGlyphClassName);
	}

	private _ensureWidget(): AgentFeedbackInputWidget {
		if (!this._widget) {
			this._widget = this._instantiationService.createInstance(AgentFeedbackInputWidget, this._editor);
			this._store.add(this._widget.onDidTriggerAdd(() => this._addFeedback()));
			this._store.add(this._widget.onDidTriggerAddAndSubmit(() => this._addFeedbackAndSubmit()));
			this._editor.addOverlayWidget(this._widget);
		}
		return this._widget;
	}

	private _onModelChanged(): void {
		this._hide();
		this._clearHoverGlyph();
		this._suppressSelectionChangeOnce = false;
		this._sessionResource = undefined;
		this._getSessionForModel();
	}

	private _onEditorMouseMove(e: IEditorMouseEvent): void {
		if (this._visible || this._hasInputText()) {
			this._clearHoverGlyph();
			return;
		}
		this._updateHoverGlyph(e.target.position?.lineNumber);
	}

	private _updateHoverGlyph(lineNumber: number | undefined): void {
		const model = this._editor.getModel();
		if (lineNumber === undefined || !model || lineNumber < 1 || lineNumber > model.getLineCount()) {
			this._clearHoverGlyph();
			return;
		}

		// Don't offer feedback on empty lines (nothing to comment on).
		if (model.getLineFirstNonWhitespaceColumn(lineNumber) === 0) {
			this._clearHoverGlyph();
			return;
		}

		if (this._hoverLineNumber === lineNumber) {
			return;
		}

		const sessionResource = this._getSessionForModel();
		if (!sessionResource) {
			this._clearHoverGlyph();
			return;
		}

		// Don't render the add glyph on lines that already have a feedback
		// comment, otherwise the add affordance overlaps the existing comment's
		// gutter decoration and both become clickable on the same spot.
		if (this._lineHasExistingFeedback(sessionResource, model.uri, lineNumber)) {
			this._clearHoverGlyph();
			return;
		}

		this._hoverLineNumber = lineNumber;
		this._hoverDecorations.set([{
			range: new Range(lineNumber, 1, lineNumber, 1),
			options: {
				description: 'agent-feedback-hover-glyph',
				lineNumberClassName: `${agentFeedbackHoverGlyphClassName} line-hover`,
				lineNumberHoverMessage: new MarkdownString(localize('agentFeedback.add', "Add Feedback")),
			},
		}]);
	}

	private _lineHasExistingFeedback(sessionResource: URI, resourceUri: URI, lineNumber: number): boolean {
		return this._agentFeedbackService.getFeedback(sessionResource).some(feedback =>
			isEqual(feedback.resourceUri, resourceUri)
			&& lineNumber >= feedback.range.startLineNumber
			&& lineNumber <= feedback.range.endLineNumber);
	}

	private _clearHoverGlyph(): void {
		if (this._hoverLineNumber === undefined) {
			return;
		}
		this._hoverLineNumber = undefined;
		this._hoverDecorations.clear();
	}

	private _onSelectionChanged(): void {
		if (this._suppressSelectionChangeOnce) {
			this._suppressSelectionChangeOnce = false;
			return;
		}

		if (this._mouseDown || !this._editor.hasTextFocus()) {
			return;
		}

		// If the widget is open and the user has typed text, freeze its state.
		// Auto-hide and auto-reposition are suppressed; the user must explicitly
		// close the widget via Esc.
		if (this._visible && this._hasInputText()) {
			return;
		}

		const selection = this._editor.getSelection();
		if (!selection || selection.isEmpty()) {
			this._autoHide();
			return;
		}

		const model = this._editor.getModel();
		if (!model) {
			this._autoHide();
			return;
		}

		const sessionResource = this._getSessionForModel();
		if (!sessionResource) {
			this._autoHide();
			return;
		}

		this._sessionResource = sessionResource;
		const preferBelow = selection.getDirection() === SelectionDirection.LTR;
		const anchorPosition = preferBelow ? selection.getEndPosition() : selection.getStartPosition();
		this._show(Range.lift(selection), anchorPosition, preferBelow);
	}

	private _show(range: Range, anchorPosition: Position, preferBelow: boolean, focusInput = false): void {
		const widget = this._ensureWidget();
		this._clearHoverGlyph();

		if (!this._visible) {
			this._visible = true;
			this._registerWidgetListeners(widget);
		}

		this._pinnedRange = range;
		this._anchorPosition = anchorPosition;
		this._preferBelow = preferBelow;
		widget.setPlaceholder(this._getPlaceholder());
		widget.clearInput();
		widget.show();
		this._updatePosition();
		if (focusInput) {
			widget.inputElement.focus();
		}
	}

	private _getPlaceholder(): string {
		const model = this._editor.getModel();
		const hasChanges = !!model && (this._agentFeedbackService.getSessionForFile(model.uri)?.changes.get().length ?? 0) > 0;
		return hasChanges
			? localize('agentFeedback.addFeedback', "Add Feedback")
			: localize('agentFeedback.addComment', "Add Comment");
	}

	private _hide(): void {
		if (!this._visible) {
			return;
		}

		this._visible = false;
		this._pinnedRange = undefined;
		this._anchorPosition = undefined;
		this._widgetListeners.clear();

		if (this._widget) {
			this._widget.hide();
			this._widget.setPosition(null);
			this._widget.clearInput();
		}
	}

	private _hasInputText(): boolean {
		return !!this._widget && this._widget.inputElement.value.trim().length > 0;
	}

	showAtCurrentLine(focusInput = true): void {
		const position = this._editor.getPosition();
		if (!position) {
			return;
		}
		this._showAtLine(position.lineNumber, focusInput);
	}

	private _showAtLine(lineNumber: number, focusInput: boolean): void {
		if (this._visible && this._hasInputText()) {
			this.focusInput();
			return;
		}

		const model = this._editor.getModel();
		if (!model || lineNumber < 1 || lineNumber > model.getLineCount()) {
			this._autoHide();
			return;
		}

		const sessionResource = this._getSessionForModel();
		if (!sessionResource) {
			this._autoHide();
			return;
		}

		this._sessionResource = sessionResource;
		this._show(new Range(lineNumber, 1, lineNumber, model.getLineMaxColumn(lineNumber)), new Position(lineNumber, 1), true, focusInput);
	}

	/**
	 * Select the whole line as a result of clicking the gutter glyph. Selecting
	 * the line triggers the selection-change handler which opens the feedback
	 * input automatically, so we don't open it directly here. Empty lines are
	 * ignored as there is nothing to give feedback on.
	 */
	private _selectLine(lineNumber: number): void {
		if (this._visible && this._hasInputText()) {
			this.focusInput();
			return;
		}

		const model = this._editor.getModel();
		if (!model || lineNumber < 1 || lineNumber > model.getLineCount()) {
			return;
		}

		if (model.getLineFirstNonWhitespaceColumn(lineNumber) === 0) {
			return;
		}

		// Set the selection before focusing: the selection change while the
		// editor is unfocused is ignored, then focusing re-evaluates the
		// selection and opens the input for the freshly selected line.
		this._editor.setSelection(new Selection(lineNumber, 1, lineNumber, model.getLineMaxColumn(lineNumber)));
		this._editor.focus();

		// Focusing the editor synchronously opens the input via the
		// selection-change handler, so move focus into it now that it is
		// visible. This lets the user type feedback immediately after clicking
		// the gutter glyph without having to click the input first.
		this.focusInput();
	}

	private _getSessionForModel(): URI | undefined {
		const model = this._editor.getModel();
		if (!model || !this._contextKeyService.contextMatchesRules(ChatContextKeys.enabled)) {
			this._hasAgentFeedbackSessionContext.set(false);
			this._sessionResource = undefined;
			return undefined;
		}
		const sessionResource = this._agentFeedbackService.getFeedbackSessionResource(model.uri);
		this._hasAgentFeedbackSessionContext.set(!!sessionResource);
		this._sessionResource = sessionResource;
		return sessionResource;
	}

	/**
	 * Hide the widget unless the user has typed text. When text is present the
	 * widget is preserved so the user does not lose their in-progress feedback;
	 * they can close it explicitly via Esc.
	 */
	private _autoHide(): void {
		if (this._hasInputText()) {
			return;
		}
		this._hide();
	}

	private _registerWidgetListeners(widget: AgentFeedbackInputWidget): void {
		this._widgetListeners.clear();

		// Listen for keydown on the editor dom node to detect when the user starts typing
		const editorDomNode = this._editor.getDomNode();
		if (editorDomNode) {
			this._widgetListeners.add(addStandardDisposableListener(editorDomNode, 'keydown', e => {
				if (!this._visible) {
					return;
				}

				// Only steal focus when the editor text area itself is focused,
				// not when an overlay widget (e.g. find widget) has focus
				if (!this._editor.hasTextFocus()) {
					return;
				}

				// Don't focus if a modifier key is pressed alone
				if (e.keyCode === KeyCode.Ctrl || e.keyCode === KeyCode.Shift || e.keyCode === KeyCode.Alt || e.keyCode === KeyCode.Meta) {
					return;
				}

				// Don't capture Escape at this level - let it fall through to the input handler if focused
				if (e.keyCode === KeyCode.Escape) {
					this._hide();
					this._editor.focus();
					return;
				}

				// Ctrl+I / Cmd+I explicitly focuses the feedback input
				if ((e.ctrlKey || e.metaKey) && e.keyCode === KeyCode.KeyI) {
					e.preventDefault();
					e.stopPropagation();
					widget.inputElement.focus();
					return;
				}

				// Don't focus if any modifier is held (keyboard shortcuts)
				if (e.ctrlKey || e.altKey || e.metaKey) {
					return;
				}

				// Keep caret/navigation keys in the editor. Only actual typing should move focus.
				if (
					e.keyCode === KeyCode.UpArrow
					|| e.keyCode === KeyCode.DownArrow
					|| e.keyCode === KeyCode.LeftArrow
					|| e.keyCode === KeyCode.RightArrow
				) {
					return;
				}

				// Only auto-focus the input on typing when the document is readonly;
				// when editable the user must click or use Ctrl+I to focus.
				if (!this._editor.getOption(EditorOption.readOnly)) {
					return;
				}

				// If the input is not focused, focus it and let the keystroke go through
				if (getWindow(widget.inputElement).document.activeElement !== widget.inputElement) {
					widget.inputElement.focus();
				}
			}));
		}

		// Listen for keydown on the input element
		this._widgetListeners.add(addStandardDisposableListener(widget.inputElement, 'keydown', e => {
			if (e.keyCode === KeyCode.Escape) {
				e.preventDefault();
				e.stopPropagation();
				this._hide();
				this._editor.focus();
				return;
			}

			if (e.keyCode === KeyCode.Enter && e.altKey) {
				e.preventDefault();
				e.stopPropagation();
				this._addFeedbackAndSubmit();
				return;
			}

			if (e.keyCode === KeyCode.Enter) {
				e.preventDefault();
				e.stopPropagation();
				this._addFeedback();
				return;
			}
		}));

		// Stop propagation of input events so the editor doesn't handle them
		this._widgetListeners.add(addStandardDisposableListener(widget.inputElement, 'keypress', e => {
			e.stopPropagation();
		}));

		// Auto-size the textarea as the user types
		this._widgetListeners.add(addStandardDisposableListener(widget.inputElement, 'input', () => {
			widget.autoSize();
			widget.updateActionEnabled();
			this._updatePosition();
		}));

		// Hide when input loses focus to something outside both editor and widget
		this._widgetListeners.add(addStandardDisposableListener(widget.inputElement, 'blur', () => {
			const win = getWindow(widget.inputElement);
			win.setTimeout(() => {
				if (!this._visible) {
					return;
				}
				if (this._editor.hasWidgetFocus()) {
					return;
				}
				this._autoHide();
			}, 0);
		}));
	}

	focusInput(): void {
		if (this._visible && this._widget) {
			this._widget.inputElement.focus();
		}
	}

	private _hideAndRefocusEditor(): void {
		this._suppressSelectionChangeOnce = true;
		this._hide();
		this._editor.focus();
	}

	private _addFeedback(): boolean {
		if (!this._widget) {
			return false;
		}

		const text = this._widget.inputElement.value.trim();
		if (!text) {
			return false;
		}

		const range = this._pinnedRange ?? this._editor.getSelection();
		const model = this._editor.getModel();
		if (!range || !model || !this._sessionResource) {
			return false;
		}

		this._agentFeedbackService.addFeedback(this._sessionResource, model.uri, range, text, undefined, createAgentFeedbackContext(this._editor, this._codeEditorService, model.uri, range));
		this._hideAndRefocusEditor();
		return true;
	}

	private _addFeedbackAndSubmit(): void {
		if (!this._widget) {
			return;
		}

		const text = this._widget.inputElement.value.trim();
		if (!text) {
			return;
		}

		const range = this._pinnedRange ?? this._editor.getSelection();
		const model = this._editor.getModel();
		if (!range || !model || !this._sessionResource) {
			return;
		}

		const sessionResource = this._sessionResource;
		this._hideAndRefocusEditor();
		this._agentFeedbackService.addFeedbackAndSubmit(sessionResource, model.uri, range, text, undefined, createAgentFeedbackContext(this._editor, this._codeEditorService, model.uri, range));
	}

	private _updatePosition(): void {
		if (!this._widget || !this._visible) {
			return;
		}

		const lineHeight = this._editor.getOption(EditorOption.lineHeight);
		const layoutInfo = this._editor.getLayoutInfo();
		const widgetDom = this._widget.getDomNode();
		const widgetHeight = widgetDom.offsetHeight || 30;
		const widgetWidth = widgetDom.offsetWidth || 150;

		const target = this._getPositioningTarget();
		if (!target) {
			this._autoHide();
			return;
		}

		const scrolledPosition = this._editor.getScrolledVisiblePosition(target.anchorPosition);
		if (!scrolledPosition) {
			this._widget.setPosition(null);
			return;
		}

		// Compute vertical position, flipping if out of bounds
		let top: number;
		if (target.preferBelow) {
			// Cursor at end (bottom) of selection → prefer below the cursor line
			top = scrolledPosition.top + lineHeight;
			if (top + widgetHeight > layoutInfo.height) {
				// Not enough space below → place above the cursor line
				top = scrolledPosition.top - widgetHeight;
			}
		} else {
			// Cursor at start (top) of selection → prefer above the cursor line
			top = scrolledPosition.top - widgetHeight;
			if (top < 0) {
				// Not enough space above → place below the cursor line
				top = scrolledPosition.top + lineHeight;
			}
		}

		// Clamp vertical position within editor bounds
		top = Math.max(0, Math.min(top, layoutInfo.height - widgetHeight));

		// Clamp horizontal position so the widget stays within the editor and
		// never renders on top of the line numbers/glyph margin (content left).
		// When the editor is scrolled horizontally the cursor position can fall
		// behind the content area, so stick the widget to the content left edge.
		// Guard that the left edge (content left) never exceeds the right-most
		// valid position, otherwise the widget would overflow the editor's right
		// edge on very narrow editors or with a wide widget.
		const minLeft = layoutInfo.contentLeft;
		const maxLeft = Math.max(minLeft, layoutInfo.width - widgetWidth);
		const left = Math.max(minLeft, Math.min(scrolledPosition.left, maxLeft));

		this._widget.setPosition({ preference: { top, left } });
	}

	private _getPositioningTarget(): { anchorPosition: Position; preferBelow: boolean } | undefined {
		if (this._pinnedRange && this._anchorPosition) {
			return { anchorPosition: this._anchorPosition, preferBelow: this._preferBelow };
		}

		const selection = this._editor.getSelection();
		if (!selection || selection.isEmpty()) {
			return undefined;
		}

		const preferBelow = selection.getDirection() === SelectionDirection.LTR;
		return {
			anchorPosition: preferBelow ? selection.getEndPosition() : selection.getStartPosition(),
			preferBelow,
		};
	}

	override dispose(): void {
		if (this._widget) {
			this._editor.removeOverlayWidget(this._widget);
			this._widget.dispose();
			this._widget = undefined;
		}
		super.dispose();
	}
}

class AddFeedbackAtCurrentLineAction extends Action2 {

	constructor() {
		super({
			id: addFeedbackAtCurrentLineActionId,
			title: localize2('agentFeedback.addAtCurrentLine', 'Add Feedback at Current Line'),
			category: CHAT_CATEGORY,
			precondition: ContextKeyExpr.and(ChatContextKeys.enabled, hasAgentFeedbackSessionForEditor),
			menu: {
				id: MenuId.CommandPalette,
				when: ContextKeyExpr.and(ChatContextKeys.enabled, hasAgentFeedbackSessionForEditor),
			},
		});
	}

	override run(accessor: ServicesAccessor): void {
		const codeEditorService = accessor.get(ICodeEditorService);
		const editor = codeEditorService.getFocusedCodeEditor() ?? codeEditorService.getActiveCodeEditor();
		const contribution = editor?.getContribution<AgentFeedbackEditorInputContribution>(AgentFeedbackEditorInputContribution.ID);
		contribution?.showAtCurrentLine(true);
	}
}

registerAction2(AddFeedbackAtCurrentLineAction);
registerEditorContribution(AgentFeedbackEditorInputContribution.ID, AgentFeedbackEditorInputContribution, EditorContributionInstantiation.Eventually);
