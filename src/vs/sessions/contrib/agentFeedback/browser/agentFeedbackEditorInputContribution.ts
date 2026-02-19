/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/agentFeedbackEditorInput.css';
import { Disposable, DisposableStore } from '../../../../base/common/lifecycle.js';
import { ICodeEditor, IOverlayWidget, IOverlayWidgetPosition } from '../../../../editor/browser/editorBrowser.js';
import { IEditorContribution } from '../../../../editor/common/editorCommon.js';
import { EditorContributionInstantiation, registerEditorContribution } from '../../../../editor/browser/editorExtensions.js';
import { EditorOption } from '../../../../editor/common/config/editorOptions.js';
import { SelectionDirection } from '../../../../editor/common/core/selection.js';
import { URI } from '../../../../base/common/uri.js';
import { addStandardDisposableListener, getWindow } from '../../../../base/browser/dom.js';
import { KeyCode } from '../../../../base/common/keyCodes.js';
import { IAgentFeedbackService } from './agentFeedbackService.js';
import { IChatEditingService } from '../../../../workbench/contrib/chat/common/editing/chatEditingService.js';
import { IAgentSessionsService } from '../../../../workbench/contrib/chat/browser/agentSessions/agentSessionsService.js';
import { getSessionForResource } from './agentFeedbackEditorUtils.js';
import { localize } from '../../../../nls.js';

class AgentFeedbackInputWidget implements IOverlayWidget {

	private static readonly _ID = 'agentFeedback.inputWidget';

	readonly allowEditorOverflow = false;

	private readonly _domNode: HTMLElement;
	private readonly _inputElement: HTMLInputElement;
	private _position: IOverlayWidgetPosition | null = null;

	constructor(
		private readonly _editor: ICodeEditor,
	) {
		this._domNode = document.createElement('div');
		this._domNode.classList.add('agent-feedback-input-widget');
		this._domNode.style.display = 'none';

		this._inputElement = document.createElement('input');
		this._inputElement.type = 'text';
		this._inputElement.placeholder = localize('agentFeedback.addFeedback', "Add Feedback");
		this._domNode.appendChild(this._inputElement);

		this._editor.applyFontInfo(this._inputElement);
	}

	getId(): string {
		return AgentFeedbackInputWidget._ID;
	}

	getDomNode(): HTMLElement {
		return this._domNode;
	}

	getPosition(): IOverlayWidgetPosition | null {
		return this._position;
	}

	get inputElement(): HTMLInputElement {
		return this._inputElement;
	}

	setPosition(position: IOverlayWidgetPosition | null): void {
		this._position = position;
		this._editor.layoutOverlayWidget(this);
	}

	show(): void {
		this._domNode.style.display = '';
	}

	hide(): void {
		this._domNode.style.display = 'none';
	}

	clearInput(): void {
		this._inputElement.value = '';
	}
}

export class AgentFeedbackEditorInputContribution extends Disposable implements IEditorContribution {

	static readonly ID = 'agentFeedback.editorInputContribution';

	private _widget: AgentFeedbackInputWidget | undefined;
	private _visible = false;
	private _mouseDown = false;
	private _sessionResource: URI | undefined;
	private readonly _widgetListeners = this._store.add(new DisposableStore());

	constructor(
		private readonly _editor: ICodeEditor,
		@IAgentFeedbackService private readonly _agentFeedbackService: IAgentFeedbackService,
		@IChatEditingService private readonly _chatEditingService: IChatEditingService,
		@IAgentSessionsService private readonly _agentSessionsService: IAgentSessionsService,
	) {
		super();

		this._store.add(this._editor.onDidChangeCursorSelection(() => this._onSelectionChanged()));
		this._store.add(this._editor.onDidChangeModel(() => this._onModelChanged()));
		this._store.add(this._editor.onDidScrollChange(() => {
			if (this._visible) {
				this._updatePosition();
			}
		}));
		this._store.add(this._editor.onMouseDown(() => {
			this._mouseDown = true;
			this._hide();
		}));
		this._store.add(this._editor.onMouseUp(() => {
			this._mouseDown = false;
			this._onSelectionChanged();
		}));
		this._store.add(this._editor.onDidBlurEditorWidget(() => this._hide()));
		this._store.add(this._editor.onDidFocusEditorWidget(() => this._onSelectionChanged()));
	}

	private _ensureWidget(): AgentFeedbackInputWidget {
		if (!this._widget) {
			this._widget = new AgentFeedbackInputWidget(this._editor);
			this._editor.addOverlayWidget(this._widget);
		}
		return this._widget;
	}

	private _onModelChanged(): void {
		this._hide();
		this._sessionResource = undefined;
	}

	private _onSelectionChanged(): void {
		if (this._mouseDown || !this._editor.hasWidgetFocus()) {
			return;
		}

		const selection = this._editor.getSelection();
		if (!selection || selection.isEmpty()) {
			this._hide();
			return;
		}

		const model = this._editor.getModel();
		if (!model) {
			this._hide();
			return;
		}

		const match = getSessionForResource(model.uri, this._chatEditingService, this._agentSessionsService);
		if (!match) {
			this._hide();
			return;
		}

		this._sessionResource = match.sessionResource;
		this._show();
	}

	private _show(): void {
		const widget = this._ensureWidget();

		if (!this._visible) {
			this._visible = true;
			this._registerWidgetListeners(widget);
		}

		widget.clearInput();
		widget.show();
		this._updatePosition();
	}

	private _hide(): void {
		if (!this._visible) {
			return;
		}

		this._visible = false;
		this._widgetListeners.clear();

		if (this._widget) {
			this._widget.hide();
			this._widget.setPosition(null);
			this._widget.clearInput();
		}
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

				// Don't focus if a modifier key is pressed alone
				if (e.keyCode === KeyCode.Ctrl || e.keyCode === KeyCode.Shift || e.keyCode === KeyCode.Alt || e.keyCode === KeyCode.Meta) {
					return;
				}

				// Don't focus if any modifier is held (keyboard shortcuts)
				if (e.ctrlKey || e.altKey || e.metaKey) {
					return;
				}

				// Don't capture Escape at this level - let it fall through to the input handler if focused
				if (e.keyCode === KeyCode.Escape) {
					this._hide();
					this._editor.focus();
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

			if (e.keyCode === KeyCode.Enter) {
				e.preventDefault();
				e.stopPropagation();
				this._submit(widget);
				return;
			}
		}));

		// Stop propagation of input events so the editor doesn't handle them
		this._widgetListeners.add(addStandardDisposableListener(widget.inputElement, 'keypress', e => {
			e.stopPropagation();
		}));
	}

	private _submit(widget: AgentFeedbackInputWidget): void {
		const text = widget.inputElement.value.trim();
		if (!text) {
			return;
		}

		const selection = this._editor.getSelection();
		const model = this._editor.getModel();
		if (!selection || !model || !this._sessionResource) {
			return;
		}

		this._agentFeedbackService.addFeedback(this._sessionResource, model.uri, selection, text);
		this._hide();
		this._editor.focus();
	}

	private _updatePosition(): void {
		if (!this._widget || !this._visible) {
			return;
		}

		const selection = this._editor.getSelection();
		if (!selection || selection.isEmpty()) {
			this._hide();
			return;
		}

		const cursorPosition = selection.getDirection() === SelectionDirection.LTR
			? selection.getEndPosition()
			: selection.getStartPosition();

		const scrolledPosition = this._editor.getScrolledVisiblePosition(cursorPosition);
		if (!scrolledPosition) {
			this._widget.setPosition(null);
			return;
		}

		const lineHeight = this._editor.getOption(EditorOption.lineHeight);
		const left = scrolledPosition.left;

		let top: number;
		if (selection.getDirection() === SelectionDirection.LTR) {
			// Cursor at end (bottom) of selection → place widget below the cursor line
			top = scrolledPosition.top + lineHeight;
		} else {
			// Cursor at start (top) of selection → place widget above the cursor line
			const widgetHeight = this._widget.getDomNode().offsetHeight || 30;
			top = scrolledPosition.top - widgetHeight;
		}

		this._widget.setPosition({ preference: { top, left } });
	}

	override dispose(): void {
		if (this._widget) {
			this._editor.removeOverlayWidget(this._widget);
			this._widget = undefined;
		}
		super.dispose();
	}
}

registerEditorContribution(AgentFeedbackEditorInputContribution.ID, AgentFeedbackEditorInputContribution, EditorContributionInstantiation.Eventually);
