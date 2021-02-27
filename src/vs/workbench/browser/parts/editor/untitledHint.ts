/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from 'vs/base/browser/dom';
import { dispose, IDisposable } from 'vs/base/common/lifecycle';
import { ContentWidgetPositionPreference, ICodeEditor, IContentWidget, IContentWidgetPosition } from 'vs/editor/browser/editorBrowser';
import { localize } from 'vs/nls';
import { DEFAULT_FONT_FAMILY } from 'vs/workbench/browser/style';
import { IThemeService, registerThemingParticipant } from 'vs/platform/theme/common/themeService';
import { inputPlaceholderForeground } from 'vs/platform/theme/common/colorRegistry';
import { ChangeModeAction } from 'vs/workbench/browser/parts/editor/editorStatus';
import { ICommandService } from 'vs/platform/commands/common/commands';
import { PLAINTEXT_MODE_ID } from 'vs/editor/common/modes/modesRegistry';
import { IEditorContribution } from 'vs/editor/common/editorCommon';
import { Schemas } from 'vs/base/common/network';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { FloatingClickWidget } from 'vs/workbench/browser/codeeditor';
const $ = dom.$;

const untitledHintSetting = 'workbench.editor.untitled.hint';
export class UntitledHintContribution implements IEditorContribution {

	public static readonly ID = 'editor.contrib.untitledHint';

	private toDispose: IDisposable[];
	private untitledHintContentWidget: UntitledHintContentWidget | undefined;
	private button: FloatingClickWidget | undefined;

	constructor(
		private editor: ICodeEditor,
		@ICommandService private readonly commandService: ICommandService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IKeybindingService private readonly keybindingService: IKeybindingService,
		@IThemeService private readonly themeService: IThemeService
	) {
		this.toDispose = [];
		this.toDispose.push(this.editor.onDidChangeModel(() => this.update()));
		this.toDispose.push(this.editor.onDidChangeModelLanguage(() => this.update()));
		this.toDispose.push(this.configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(untitledHintSetting)) {
				this.update();
			}
		}));
		this.update();
	}

	private update(): void {
		this.untitledHintContentWidget?.dispose();
		this.button?.dispose();
		const untitledHintMode = this.configurationService.getValue(untitledHintSetting);
		const model = this.editor.getModel();

		if (model && model.uri.scheme === Schemas.untitled && model.getModeId() === PLAINTEXT_MODE_ID) {
			if (untitledHintMode === 'text') {
				this.untitledHintContentWidget = new UntitledHintContentWidget(this.editor, this.commandService, this.configurationService, this.keybindingService);
			}
			if (untitledHintMode === 'button') {
				this.button = new FloatingClickWidget(this.editor, localize('selectALanguage', "Select a Language"), ChangeModeAction.ID, this.keybindingService, this.themeService);
				this.toDispose.push(this.button.onClick(async () => {
					// Need to focus editor before so current editor becomes active and the command is properly executed
					this.editor.focus();
					await this.commandService.executeCommand(ChangeModeAction.ID, { from: 'button' });
					this.editor.focus();
				}));
				this.button.render();
			}
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
		private readonly configurationService: IConfigurationService,
		private readonly keybindingService: IKeybindingService
	) {
		this.toDispose = [];
		this.toDispose.push(editor.onDidChangeModelContent(() => this.onDidChangeModelContent()));
		this.onDidChangeModelContent();
	}

	private onDidChangeModelContent(): void {
		if (this.editor.getValue() === '') {
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
			const language = $('span.language-mode.detected-link-active');
			const keybinding = this.keybindingService.lookupKeybinding(ChangeModeAction.ID);
			const keybindingLabel = keybinding?.getLabel();
			const keybindingWithBrackets = keybindingLabel ? `(${keybindingLabel})` : '';
			language.innerText = localize('selectAlanguage', "Select a language {0}", keybindingWithBrackets);
			this.domNode.appendChild(language);
			const toGetStarted = $('span');
			toGetStarted.innerText = localize('toGetStarted', " to get started. Start typing to dismiss, or ",);
			this.domNode.appendChild(toGetStarted);

			const dontShow = $('span.detected-link-active');
			dontShow.innerText = localize('dontshow', "don't show");
			this.domNode.appendChild(dontShow);

			const thisAgain = $('span');
			thisAgain.innerText = localize('thisAgain', " this again.");
			this.domNode.appendChild(thisAgain);

			this.toDispose.push(dom.addDisposableListener(language, 'click', async e => {
				e.stopPropagation();
				// Need to focus editor before so current editor becomes active and the command is properly executed
				this.editor.focus();
				await this.commandService.executeCommand(ChangeModeAction.ID, { from: 'hint' });
				this.editor.focus();
			}));

			this.toDispose.push(dom.addDisposableListener(dontShow, 'click', () => {
				this.configurationService.updateValue(untitledHintSetting, 'hidden');
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
