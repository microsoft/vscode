/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!./chatSlashCommandContentWidget';
import { IKeyboardEvent } from 'vs/base/browser/keyboardEvent';
import { Range } from 'vs/editor/common/core/range';
import { Disposable } from 'vs/base/common/lifecycle';
import { ContentWidgetPositionPreference, ICodeEditor, IContentWidget } from 'vs/editor/browser/editorBrowser';
import { KeyCode } from 'vs/base/common/keyCodes';
import { localize } from 'vs/nls';
import * as aria from 'vs/base/browser/ui/aria/aria';

export class SlashCommandContentWidget extends Disposable implements IContentWidget {
	private _domNode = document.createElement('div');
	private _lastSlashCommandText: string | undefined;

	constructor(private _editor: ICodeEditor) {
		super();

		this._domNode.toggleAttribute('hidden', true);
		this._domNode.classList.add('chat-slash-command-content-widget');

		// If backspace at a slash command boundary, remove the slash command
		this._register(this._editor.onKeyDown((e) => this._handleKeyDown(e)));
	}

	override dispose() {
		this._editor.removeContentWidget(this);
		super.dispose();
	}

	show() {
		this._domNode.toggleAttribute('hidden', false);
		this._editor.addContentWidget(this);
	}

	hide() {
		this._domNode.toggleAttribute('hidden', true);
		this._editor.removeContentWidget(this);
	}

	setCommandText(slashCommand: string) {
		this._domNode.innerText = `${slashCommand} `;
		this._lastSlashCommandText = slashCommand;
	}

	getId() { return 'chat-slash-command-content-widget'; }
	getDomNode() { return this._domNode; }
	getPosition() { return { position: { lineNumber: 1, column: 1 }, preference: [ContentWidgetPositionPreference.EXACT] }; }

	private _handleKeyDown(e: IKeyboardEvent) {
		if (e.keyCode !== KeyCode.Backspace) {
			return;
		}

		const firstLine = this._editor.getModel()?.getLineContent(1);
		const selection = this._editor.getSelection();
		const withSlash = `/${this._lastSlashCommandText} `;
		if (!firstLine?.startsWith(withSlash) || !selection?.isEmpty() || selection?.startLineNumber !== 1 || selection?.startColumn !== withSlash.length + 1) {
			return;
		}

		// Allow to undo the backspace
		this._editor.executeEdits('chat-slash-command', [{
			range: new Range(1, 1, 1, selection.startColumn),
			text: null
		}]);

		// Announce the deletion
		aria.alert(localize('exited slash command mode', 'Exited {0} mode', this._lastSlashCommandText));
	}
}
