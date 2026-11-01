/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './selectionShareChip.css';
import * as dom from '../../../../base/browser/dom.js';
import { RunOnceScheduler } from '../../../../base/common/async.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { ContentWidgetPositionPreference, ICodeEditor, IContentWidget, IContentWidgetPosition } from '../../../../editor/browser/editorBrowser.js';
import { EditorContributionInstantiation, registerEditorContribution } from '../../../../editor/browser/editorExtensions.js';
import { IEditorContribution } from '../../../../editor/common/editorCommon.js';
import { localize } from '../../../../nls.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';

export const SELECTION_SHARE_CHIP_COMMAND_ID = 'workbench.action.shareSelectionAsPrivateGist';
const CHIP_ID = 'editor.contrib.selectionShareChip';

class SelectionShareChipWidget extends Disposable implements IContentWidget {

	readonly allowEditorOverflow = true;
	readonly suppressMouseDown = false;

	private readonly _domNode: HTMLElement;
	private _position: IContentWidgetPosition | null = null;
	private _visible = false;

	constructor(
		private readonly _editor: ICodeEditor,
		private readonly _onShare: () => void,
	) {
		super();

		this._domNode = dom.$('div.selection-share-chip');
		this._domNode.setAttribute('role', 'button');
		this._domNode.setAttribute('tabindex', '0');
		this._domNode.setAttribute('aria-label', localize('selectionShareChip.aria', "Share selection as private gist"));

		const icon = dom.$('span.selection-share-chip-icon');
		icon.classList.add(...ThemeIcon.asClassNameArray(Codicon.gistSecret));
		const label = dom.$('span.selection-share-chip-label');
		label.textContent = localize('selectionShareChip.label', "Share");
		this._domNode.appendChild(icon);
		this._domNode.appendChild(label);

		const trigger = (e: Event) => {
			e.preventDefault();
			e.stopPropagation();
			this._onShare();
		};

		// Fire on mouse/pointer down so the editor selection is still intact.
		this._register(dom.addDisposableListener(this._domNode, dom.EventType.MOUSE_DOWN, trigger));
		this._register(dom.addDisposableListener(this._domNode, dom.EventType.POINTER_DOWN, trigger));
		this._register(dom.addDisposableListener(this._domNode, dom.EventType.KEY_DOWN, e => {
			if (e.key === 'Enter' || e.key === ' ') {
				trigger(e);
			}
		}));
	}

	getId(): string { return CHIP_ID + '.widget'; }
	getDomNode(): HTMLElement { return this._domNode; }
	getPosition(): IContentWidgetPosition | null { return this._position; }

	showAtEndOfSelection(): void {
		const selection = this._editor.getSelection();
		if (!selection) {
			return;
		}
		this._position = {
			position: selection.getEndPosition(),
			preference: [ContentWidgetPositionPreference.BELOW, ContentWidgetPositionPreference.ABOVE]
		};
		const lineCount = Math.max(1, selection.endLineNumber - selection.startLineNumber + 1);
		this._domNode.title = localize('selectionShareChip.title', "Share {0} selected line(s) as a private gist", lineCount);

		if (!this._visible) {
			this._editor.addContentWidget(this);
			this._visible = true;
		} else {
			this._editor.layoutContentWidget(this);
		}
		this._domNode.classList.add('visible');
	}

	hide(): void {
		if (!this._visible) {
			return;
		}
		this._domNode.classList.remove('visible');
		this._editor.removeContentWidget(this);
		this._visible = false;
		this._position = null;
	}

	override dispose(): void {
		this.hide();
		super.dispose();
	}
}

export class SelectionShareChipController extends Disposable implements IEditorContribution {

	static readonly ID = CHIP_ID;

	private readonly _widget: SelectionShareChipWidget;
	private readonly _update: RunOnceScheduler;

	constructor(
		private readonly _editor: ICodeEditor,
		@ICommandService private readonly _commandService: ICommandService,
	) {
		super();

		this._widget = this._register(new SelectionShareChipWidget(this._editor, () => {
			void this._commandService.executeCommand(SELECTION_SHARE_CHIP_COMMAND_ID);
		}));
		this._update = this._register(new RunOnceScheduler(() => this._render(), 120));

		this._register(this._editor.onDidChangeCursorSelection(() => this._update.schedule()));
		this._register(this._editor.onDidChangeModel(() => this._update.schedule()));
		this._register(this._editor.onDidScrollChange(() => this._update.schedule()));
		this._update.schedule();
	}

	private _shouldShow(): boolean {
		if (!this._editor.hasModel()) {
			return false;
		}
		const selection = this._editor.getSelection();
		if (!selection || selection.isEmpty()) {
			return false;
		}
		const text = this._editor.getModel()!.getValueInRange(selection);
		return !!text && text.trim().length >= 2;
	}

	private _render(): void {
		if (this._shouldShow()) {
			this._widget.showAtEndOfSelection();
		} else {
			this._widget.hide();
		}
	}
}

registerEditorContribution(SelectionShareChipController.ID, SelectionShareChipController, EditorContributionInstantiation.AfterFirstRender);
