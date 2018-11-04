/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from 'vs/base/browser/dom';
import { GlobalMouseMoveMonitor, IStandardMouseMoveEventData, standardMouseMoveMerger } from 'vs/base/browser/globalMouseMoveMonitor';
import { CancellationTokenSource } from 'vs/base/common/cancellation';
import { Emitter, Event } from 'vs/base/common/event';
import { dispose, IDisposable } from 'vs/base/common/lifecycle';
import 'vs/css!./lightBulbWidget';
import { ContentWidgetPositionPreference, ICodeEditor, IContentWidget, IContentWidgetPosition } from 'vs/editor/browser/editorBrowser';
import { TextModel } from 'vs/editor/common/model/textModel';
import { CodeActionKind } from 'vs/editor/contrib/codeAction/codeActionTrigger';
import { CodeActionsComputeEvent } from './codeActionModel';

export class LightBulbWidget implements IDisposable, IContentWidget {

	private static readonly _posPref = [ContentWidgetPositionPreference.EXACT];

	private readonly _domNode: HTMLDivElement;
	private readonly _editor: ICodeEditor;
	private readonly _disposables: IDisposable[] = [];
	private readonly _onClick = new Emitter<{ x: number, y: number }>();

	readonly onClick: Event<{ x: number, y: number }> = this._onClick.event;

	private _position: IContentWidgetPosition | null;
	private _model: CodeActionsComputeEvent | null;
	private _futureFixes = new CancellationTokenSource();

	constructor(editor: ICodeEditor) {
		this._domNode = document.createElement('div');
		this._domNode.className = 'lightbulb-glyph';

		this._editor = editor;
		this._editor.addContentWidget(this);

		this._disposables.push(this._editor.onDidChangeModel(_ => this._futureFixes.cancel()));
		this._disposables.push(this._editor.onDidChangeModelLanguage(_ => this._futureFixes.cancel()));
		this._disposables.push(this._editor.onDidChangeModelContent(_ => {
			// cancel when the line in question has been removed
			const editorModel = this._editor.getModel();
			if (!this.model || !this.model.position || !editorModel || this.model.position.lineNumber >= editorModel.getLineCount()) {
				this._futureFixes.cancel();
			}
		}));
		this._disposables.push(dom.addStandardDisposableListener(this._domNode, 'click', e => {
			// Make sure that focus / cursor location is not lost when clicking widget icon
			this._editor.focus();
			// a bit of extra work to make sure the menu
			// doesn't cover the line-text
			const { top, height } = dom.getDomNodePagePosition(this._domNode);
			const { lineHeight } = this._editor.getConfiguration();

			let pad = Math.floor(lineHeight / 3);
			if (this._position && this._model && this._model.position && this._position.position !== null && this._position.position.lineNumber < this._model.position.lineNumber) {
				pad += lineHeight;
			}

			this._onClick.fire({
				x: e.posx,
				y: top + height + pad
			});
		}));
		this._disposables.push(dom.addDisposableListener(this._domNode, 'mouseenter', (e: MouseEvent) => {
			if ((e.buttons & 1) !== 1) {
				return;
			}
			// mouse enters lightbulb while the primary/left button
			// is being pressed -> hide the lightbulb and block future
			// showings until mouse is released
			this.hide();
			const monitor = new GlobalMouseMoveMonitor<IStandardMouseMoveEventData>();
			monitor.startMonitoring(standardMouseMoveMerger, () => { }, () => {
				monitor.dispose();
			});
		}));
		this._disposables.push(this._editor.onDidChangeConfiguration(e => {
			// hide when told to do so
			if (e.contribInfo && !this._editor.getConfiguration().contribInfo.lightbulbEnabled) {
				this.hide();
			}
		}));
	}

	dispose(): void {
		dispose(this._disposables);
		this._editor.removeContentWidget(this);
	}

	getId(): string {
		return 'LightBulbWidget';
	}

	getDomNode(): HTMLElement {
		return this._domNode;
	}

	getPosition(): IContentWidgetPosition | null {
		return this._position;
	}

	set model(value: CodeActionsComputeEvent | null) {

		if (!value || this._position && (!value.position || this._position.position && this._position.position.lineNumber !== value.position.lineNumber)) {
			// hide when getting a 'hide'-request or when currently
			// showing on another line
			this.hide();
		} else if (this._futureFixes) {
			// cancel pending show request in any case
			this._futureFixes.cancel();
		}

		this._futureFixes = new CancellationTokenSource();
		const { token } = this._futureFixes;
		this._model = value;

		if (!this._model || !this._model.actions) {
			return;
		}

		const selection = this._model.rangeOrSelection;
		this._model.actions.then(fixes => {
			if (!token.isCancellationRequested && fixes && fixes.length > 0) {
				if (!selection || selection.isEmpty() && fixes.every(fix => !!(fix.kind && CodeActionKind.Refactor.contains(fix.kind)))) {
					this.hide();
				} else {
					this._show();
				}
			} else {
				this.hide();
			}
		}).catch(() => {
			this.hide();
		});
	}

	get model(): CodeActionsComputeEvent | null {
		return this._model;
	}

	set title(value: string) {
		this._domNode.title = value;
	}

	get title(): string {
		return this._domNode.title;
	}

	private _show(): void {
		const config = this._editor.getConfiguration();
		if (!config.contribInfo.lightbulbEnabled) {
			return;
		}
		if (!this._model || !this._model.position) {
			return;
		}
		const { lineNumber, column } = this._model.position;
		const model = this._editor.getModel();
		if (!model) {
			return;
		}

		const tabSize = model.getOptions().tabSize;
		const lineContent = model.getLineContent(lineNumber);
		const indent = TextModel.computeIndentLevel(lineContent, tabSize);
		const lineHasSpace = config.fontInfo.spaceWidth * indent > 22;
		const isFolded = (lineNumber) => {
			return lineNumber > 2 && this._editor.getTopForLineNumber(lineNumber) === this._editor.getTopForLineNumber(lineNumber - 1);
		};

		let effectiveLineNumber = lineNumber;
		if (!lineHasSpace) {
			if (lineNumber > 1 && !isFolded(lineNumber - 1)) {
				effectiveLineNumber -= 1;
			} else if (!isFolded(lineNumber + 1)) {
				effectiveLineNumber += 1;
			} else if (column * config.fontInfo.spaceWidth < 22) {
				// cannot show lightbulb above/below and showing
				// it inline would overlay the cursor...
				this.hide();
				return;
			}
		}

		this._position = {
			position: { lineNumber: effectiveLineNumber, column: 1 },
			preference: LightBulbWidget._posPref
		};
		this._editor.layoutContentWidget(this);
	}

	hide(): void {
		this._position = null;
		this._model = null;
		this._futureFixes.cancel();
		this._editor.layoutContentWidget(this);
	}
}
