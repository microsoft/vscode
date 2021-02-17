/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from 'vs/base/browser/dom';
import { IWorkbenchContribution } from 'vs/workbench/common/contributions';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { dispose, IDisposable } from 'vs/base/common/lifecycle';
import { ContentWidgetPositionPreference, ICodeEditor, IContentWidget, IContentWidgetPosition, isCodeEditor } from 'vs/editor/browser/editorBrowser';
import { localize } from 'vs/nls';
import { DEFAULT_FONT_FAMILY } from 'vs/workbench/browser/style';
import { registerThemingParticipant } from 'vs/platform/theme/common/themeService';
import { inputPlaceholderForeground } from 'vs/platform/theme/common/colorRegistry';
import { ChangeModeAction } from 'vs/workbench/browser/parts/editor/editorStatus';
import { ICommandService } from 'vs/platform/commands/common/commands';
import { PLAINTEXT_MODE_ID } from 'vs/editor/common/modes/modesRegistry';
import { IStorageService, StorageScope, StorageTarget } from 'vs/platform/storage/common/storage';
const $ = dom.$;

const UNTITLED_HINT_VISIBILITY_STORAGE_KEY = 'untitledHint.visible';
export class UntitledHintContribution implements IWorkbenchContribution {

	private toDispose: IDisposable[];
	private untitledHintContentWidget: UntitledHintContentWidget | undefined;

	constructor(
		@IEditorService private readonly editorService: IEditorService,
		@ICommandService private readonly commandService: ICommandService,
		@IStorageService private readonly storageService: IStorageService,
	) {
		this.toDispose = [];
		this.toDispose.push(this.editorService.onDidActiveEditorChange(() => this.onActiveEditorChange()));
		this.onActiveEditorChange();
	}

	private onActiveEditorChange(): void {
		const activeEditor = this.editorService.activeEditor;
		this.untitledHintContentWidget?.dispose();

		const activeCodeEditor = this.editorService.activeTextEditorControl;
		const untitledHintVisible = this.storageService.getBoolean(UNTITLED_HINT_VISIBILITY_STORAGE_KEY, StorageScope.GLOBAL, true);
		if (untitledHintVisible && activeEditor && activeEditor.isUntitled() && isCodeEditor(activeCodeEditor)) {
			this.untitledHintContentWidget = new UntitledHintContentWidget(activeCodeEditor, this.commandService, this.storageService);
		}
	}

	dispose(): void {
		dispose(this.toDispose);
		this.untitledHintContentWidget?.dispose();
	}
}

class UntitledHintContentWidget implements IContentWidget {

	private static readonly ID = 'editor.widget.untitledHint';

	private domNode: HTMLElement | undefined;
	private toDispose: IDisposable[];

	constructor(
		private readonly editor: ICodeEditor,
		private readonly commandService: ICommandService,
		private readonly storageService: IStorageService,
	) {
		this.toDispose = [];
		this.toDispose.push(editor.onDidChangeModelContent(() => this.onDidChangeModelContent()));
		this.toDispose.push(editor.onDidChangeModelLanguage(() => this.onDidChangeModelContent()));
		this.onDidChangeModelContent();
	}

	private onDidChangeModelContent(): void {
		if (this.editor.getValue() === '' && this.editor.getModel()?.getModeId() === PLAINTEXT_MODE_ID) {
			this.editor.addContentWidget(this);
		} else {
			this.editor.removeContentWidget(this);
		}
	}

	getId(): string {
		return UntitledHintContentWidget.ID;
	}


	// Select a language to get started. Start typing to dismiss, or don't show this again.
	getDomNode(): HTMLElement {
		if (!this.domNode) {
			this.domNode = $('.untitled-hint');
			this.domNode.style.width = 'max-content';
			const select = $('span');
			select.innerText = localize('select', "Select a  ");
			this.domNode.appendChild(select);
			const language = $('span.language-mode.detected-link-active');
			language.innerText = localize('language', "language");
			this.domNode.appendChild(language);
			const toGetStarted = $('span');
			toGetStarted.innerText = localize('toGetStarted', " to get started. Start typing to dismiss, or ");
			this.domNode.appendChild(toGetStarted);

			const dontShow = $('span.detected-link-active');
			dontShow.innerText = localize('dontshow', "don't show");
			this.domNode.appendChild(dontShow);

			const thisAgain = $('span');
			thisAgain.innerText = localize('thisAgain', " this again.");
			this.domNode.appendChild(thisAgain);

			this.toDispose.push(dom.addDisposableListener(language, 'click', async e => {
				e.stopPropagation();
				await this.commandService.executeCommand(ChangeModeAction.ID);
				this.editor.focus();
			}));

			this.toDispose.push(dom.addDisposableListener(dontShow, 'click', () => {
				this.storageService.store(UNTITLED_HINT_VISIBILITY_STORAGE_KEY, false, StorageScope.GLOBAL, StorageTarget.USER);
				this.dispose();
				this.editor.focus();
			}));

			this.toDispose.push(dom.addDisposableListener(this.domNode, 'click', () => {
				this.editor.focus();
			}));

			this.domNode.style.fontFamily = DEFAULT_FONT_FAMILY;
			this.domNode.style.fontStyle = 'italic';
			this.domNode.style.paddingLeft = '4px';
		}

		return this.domNode;
	}

	getPosition(): IContentWidgetPosition | null {
		return {
			position: { lineNumber: 1, column: 1 },
			preference: [ContentWidgetPositionPreference.EXACT]
		};
	}

	dispose(): void {
		this.editor.removeContentWidget(this);
		dispose(this.toDispose);
	}
}

registerThemingParticipant((theme, collector) => {
	const inputPlaceholderForegroundColor = theme.getColor(inputPlaceholderForeground);
	if (inputPlaceholderForegroundColor) {
		collector.addRule(`.monaco-editor .contentWidgets .untitled-hint { color: ${inputPlaceholderForegroundColor}; }`);
	}
});
