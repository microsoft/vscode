/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from 'vs/base/browser/dom';
import { GlobalMouseMoveMonitor, IStandardMouseMoveEventData, standardMouseMoveMerger } from 'vs/base/browser/globalMouseMoveMonitor';
import { Emitter } from 'vs/base/common/event';
import { Disposable } from 'vs/base/common/lifecycle';
import 'vs/css!./lightBulbWidget';
import { ContentWidgetPositionPreference, ICodeEditor, IContentWidget, IContentWidgetPosition } from 'vs/editor/browser/editorBrowser';
import { IPosition } from 'vs/editor/common/core/position';
import { TextModel } from 'vs/editor/common/model/textModel';
import { CodeActionSet } from 'vs/editor/contrib/codeAction/codeAction';
import * as nls from 'vs/nls';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';

namespace LightBulbState {

	export const enum Type {
		Hidden,
		Showing,
	}

	export const Hidden = new class { readonly type = Type.Hidden; };

	export class Showing {
		readonly type = Type.Showing;

		constructor(
			public readonly actions: CodeActionSet,
			public readonly editorPosition: IPosition,
			public readonly widgetPosition: IContentWidgetPosition,
		) { }
	}

	export type State = typeof Hidden | Showing;
}


export class LightBulbWidget extends Disposable implements IContentWidget {

	private static readonly _posPref = [ContentWidgetPositionPreference.EXACT];

	private readonly _domNode: HTMLDivElement;

	private readonly _onClick = this._register(new Emitter<{ x: number; y: number; actions: CodeActionSet }>());
	public readonly onClick = this._onClick.event;

	private _state: LightBulbState.State = LightBulbState.Hidden;

	constructor(
		private readonly _editor: ICodeEditor,
		private readonly _quickFixActionId: string,
		@IKeybindingService private readonly _keybindingService: IKeybindingService
	) {
		super();
		this._domNode = document.createElement('div');
		this._domNode.className = 'lightbulb-glyph';

		this._editor.addContentWidget(this);

		this._register(this._editor.onDidChangeModelContent(_ => {
			// cancel when the line in question has been removed
			const editorModel = this._editor.getModel();
			if (this._state.type !== LightBulbState.Type.Showing || !editorModel || this._state.editorPosition.lineNumber >= editorModel.getLineCount()) {
				this.hide();
			}
		}));
		this._register(dom.addStandardDisposableListener(this._domNode, 'mousedown', e => {
			if (this._state.type !== LightBulbState.Type.Showing) {
				return;
			}

			// Make sure that focus / cursor location is not lost when clicking widget icon
			this._editor.focus();
			e.preventDefault();
			// a bit of extra work to make sure the menu
			// doesn't cover the line-text
			const { top, height } = dom.getDomNodePagePosition(this._domNode);
			const { lineHeight } = this._editor.getConfiguration();

			let pad = Math.floor(lineHeight / 3);
			if (this._state.widgetPosition.position !== null && this._state.widgetPosition.position.lineNumber < this._state.editorPosition.lineNumber) {
				pad += lineHeight;
			}

			this._onClick.fire({
				x: e.posx,
				y: top + height + pad,
				actions: this._state.actions
			});
		}));
		this._register(dom.addDisposableListener(this._domNode, 'mouseenter', (e: MouseEvent) => {
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
		this._register(this._editor.onDidChangeConfiguration(e => {
			// hide when told to do so
			if (e.contribInfo && !this._editor.getConfiguration().contribInfo.lightbulbEnabled) {
				this.hide();
			}
		}));

		this._updateLightBulbTitle();
		this._register(this._keybindingService.onDidUpdateKeybindings(this._updateLightBulbTitle, this));
	}

	dispose(): void {
		super.dispose();
		this._editor.removeContentWidget(this);
	}

	getId(): string {
		return 'LightBulbWidget';
	}

	getDomNode(): HTMLElement {
		return this._domNode;
	}

	getPosition(): IContentWidgetPosition | null {
		return this._state.type === LightBulbState.Type.Showing ? this._state.widgetPosition : null;
	}

	public update(actions: CodeActionSet, atPosition: IPosition) {
		if (actions.actions.length <= 0) {
			return this.hide();
		}

		const config = this._editor.getConfiguration();
		if (!config.contribInfo.lightbulbEnabled) {
			return this.hide();
		}

		const { lineNumber, column } = atPosition;
		const model = this._editor.getModel();
		if (!model) {
			return this.hide();
		}

		const tabSize = model.getOptions().tabSize;
		const lineContent = model.getLineContent(lineNumber);
		const indent = TextModel.computeIndentLevel(lineContent, tabSize);
		const lineHasSpace = config.fontInfo.spaceWidth * indent > 22;
		const isFolded = (lineNumber: number) => {
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
				return this.hide();
			}
		}

		this._state = new LightBulbState.Showing(actions, atPosition, {
			position: { lineNumber: effectiveLineNumber, column: 1 },
			preference: LightBulbWidget._posPref
		});
		dom.toggleClass(this._domNode, 'autofixable', actions.hasAutoFix);
		this._editor.layoutContentWidget(this);
	}

	private set title(value: string) {
		this._domNode.title = value;
	}

	public hide(): void {
		this._state = LightBulbState.Hidden;
		this._editor.layoutContentWidget(this);
	}

	private _updateLightBulbTitle(): void {
		const kb = this._keybindingService.lookupKeybinding(this._quickFixActionId);
		let title: string;
		if (kb) {
			title = nls.localize('quickFixWithKb', "Show Fixes ({0})", kb.getLabel());
		} else {
			title = nls.localize('quickFix', "Show Fixes");
		}
		this.title = title;
	}
}
