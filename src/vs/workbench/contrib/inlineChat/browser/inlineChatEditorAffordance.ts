/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/inlineChatEditorAffordance.css';
import { IDimension } from '../../../../base/browser/dom.js';
import * as dom from '../../../../base/browser/dom.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { ContentWidgetPositionPreference, ICodeEditor, IContentWidget, IContentWidgetPosition } from '../../../../editor/browser/editorBrowser.js';
import { EditorOption } from '../../../../editor/common/config/editorOptions.js';
import { Selection, SelectionDirection } from '../../../../editor/common/core/selection.js';
import { autorun, IObservable, ISettableObservable } from '../../../../base/common/observable.js';
import { assertType } from '../../../../base/common/types.js';

/**
 * Content widget that shows a small sparkle icon at the cursor position.
 * When clicked, it shows the overlay widget for inline chat.
 */
export class InlineChatEditorAffordance extends Disposable implements IContentWidget {

	private static _idPool = 0;

	private readonly _id = `inline-chat-content-widget-${InlineChatEditorAffordance._idPool++}`;
	private readonly _domNode: HTMLElement;
	private _position: IContentWidgetPosition | null = null;
	private _isVisible = false;

	readonly allowEditorOverflow = true;
	readonly suppressMouseDown = false;

	constructor(
		private readonly _editor: ICodeEditor,
		selection: IObservable<Selection | undefined>,
		suppressAffordance: ISettableObservable<boolean>,
		private readonly _hover: ISettableObservable<{ rect: DOMRect; above: boolean; lineNumber: number } | undefined>
	) {
		super();

		// Create the widget DOM
		this._domNode = dom.$('.inline-chat-content-widget');

		// Add sparkle icon
		const icon = dom.append(this._domNode, dom.$('.icon'));
		icon.classList.add(...ThemeIcon.asClassNameArray(Codicon.sparkleFilled));

		// Handle click to show overlay widget
		this._store.add(dom.addDisposableListener(this._domNode, dom.EventType.CLICK, (e) => {
			e.preventDefault();
			e.stopPropagation();
			this._showOverlayWidget();
		}));

		this._store.add(autorun(r => {
			const sel = selection.read(r);
			const suppressed = suppressAffordance.read(r);
			if (sel && !suppressed) {
				this._show(sel);
			} else {
				this._hide();
			}
		}));
	}

	private _show(selection: Selection): void {

		// Position at the cursor (active end of selection)
		const cursorPosition = selection.getPosition();
		const direction = selection.getDirection();

		// Show above for RTL (selection going up), below for LTR (selection going down)
		const preference = direction === SelectionDirection.RTL
			? ContentWidgetPositionPreference.ABOVE
			: ContentWidgetPositionPreference.BELOW;

		this._position = {
			position: cursorPosition,
			preference: [preference],
		};

		if (this._isVisible) {
			this._editor.layoutContentWidget(this);
		} else {
			this._editor.addContentWidget(this);
			this._isVisible = true;
		}
	}

	private _hide(): void {
		if (this._isVisible) {
			this._isVisible = false;
			this._editor.removeContentWidget(this);
		}
	}

	private _showOverlayWidget(): void {
		assertType(this._editor.hasModel());

		if (!this._position || !this._position.position) {
			return;
		}

		const position = this._position.position;
		const editorDomNode = this._editor.getDomNode();
		const scrolledPosition = this._editor.getScrolledVisiblePosition(position);
		const editorRect = editorDomNode.getBoundingClientRect();
		const x = editorRect.left + scrolledPosition.left;
		const y = editorRect.top + scrolledPosition.top;

		this._hide();
		this._hover.set({
			rect: new DOMRect(x, y, 0, scrolledPosition.height),
			above: this._position.preference[0] === ContentWidgetPositionPreference.ABOVE,
			lineNumber: position.lineNumber
		}, undefined);
	}

	getId(): string {
		return this._id;
	}

	getDomNode(): HTMLElement {
		return this._domNode;
	}

	getPosition(): IContentWidgetPosition | null {
		return this._position;
	}

	beforeRender(): IDimension | null {
		const position = this._editor.getPosition();
		const lineHeight = position ? this._editor.getLineHeightForPosition(position) : this._editor.getOption(EditorOption.lineHeight);

		this._domNode.style.setProperty('--vscode-inline-chat-affordance-height', `${lineHeight}px`);

		return null;
	}

	override dispose(): void {
		if (this._isVisible) {
			this._editor.removeContentWidget(this);
		}
		super.dispose();
	}
}
