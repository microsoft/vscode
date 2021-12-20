/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from 'vs/base/browser/dom';
import { IKeyboardEvent } from 'vs/base/browser/keyboardEvent';
import { KeyCode } from 'vs/base/common/keyCodes';
import { dispose, IDisposable } from 'vs/base/common/lifecycle';
import { ContentWidgetPositionPreference, ICodeEditor, IContentWidget, IContentWidgetPosition } from 'vs/editor/browser/editorBrowser';
import { localize } from 'vs/nls';
import { registerThemingParticipant } from 'vs/platform/theme/common/themeService';
import { inputPlaceholderForeground, textLinkForeground } from 'vs/platform/theme/common/colorRegistry';
import { ChangeModeAction } from 'vs/workbench/browser/parts/editor/editorStatus';
import { ICommandService } from 'vs/platform/commands/common/commands';
import { PLAINTEXT_MODE_ID } from 'vs/editor/common/modes/modesRegistry';
import { IEditorContribution } from 'vs/editor/common/editorCommon';
import { Schemas } from 'vs/base/common/network';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { ConfigurationChangedEvent, EditorOption } from 'vs/editor/common/config/editorOptions';
import { registerEditorContribution } from 'vs/editor/browser/editorExtensions';
import { EventType as GestureEventType, Gesture } from 'vs/base/browser/touch';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';

const $ = dom.$;

const untitledTextEditorHintSetting = 'workbench.editor.untitled.hint';
export class UntitledTextEditorHintContribution implements IEditorContribution {

	public static readonly ID = 'editor.contrib.untitledTextEditorHint';

	private toDispose: IDisposable[];
	private untitledTextHintContentWidget: UntitledTextEditorHintContentWidget | undefined;

	constructor(
		private editor: ICodeEditor,
		@ICommandService private readonly commandService: ICommandService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IKeybindingService private readonly keybindingService: IKeybindingService,

	) {
		this.toDispose = [];
		this.toDispose.push(this.editor.onDidChangeModel(() => this.update()));
		this.toDispose.push(this.editor.onDidChangeModelLanguage(() => this.update()));
		this.toDispose.push(this.configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(untitledTextEditorHintSetting)) {
				this.update();
			}
		}));
	}

	private update(): void {
		this.untitledTextHintContentWidget?.dispose();
		const configValue = this.configurationService.getValue(untitledTextEditorHintSetting);
		const model = this.editor.getModel();

		if (model && model.uri.scheme === Schemas.untitled && model.getLanguageId() === PLAINTEXT_MODE_ID && configValue === 'text') {
			this.untitledTextHintContentWidget = new UntitledTextEditorHintContentWidget(this.editor, this.commandService, this.configurationService, this.keybindingService);
		}
	}

	dispose(): void {
		dispose(this.toDispose);
		this.untitledTextHintContentWidget?.dispose();
	}
}

class UntitledTextEditorHintContentWidget implements IContentWidget {

	private static readonly ID = 'editor.widget.untitledHint';

	private domNode: HTMLElement | undefined;
	private languageMode: HTMLElement | undefined;
	private toDispose: IDisposable[];
	private editorKeyDownEvent: IDisposable | undefined;

	constructor(
		private readonly editor: ICodeEditor,
		private readonly commandService: ICommandService,
		private readonly configurationService: IConfigurationService,
		private readonly keybindingService: IKeybindingService,
	) {
		this.toDispose = [];
		this.toDispose.push(editor.onDidChangeModelContent(() => this.onDidChangeModelContent()));
		this.toDispose.push(this.editor.onDidChangeConfiguration((e: ConfigurationChangedEvent) => {
			if (this.domNode && e.hasChanged(EditorOption.fontInfo)) {
				this.editor.applyFontInfo(this.domNode);
			}
		}));
		this.onDidChangeModelContent();
	}

	private addContentWidgetToEditor(): void {
		if (this.editor.getValue() !== '') {
			return;
		}

		this.editorKeyDownEvent = this.editor.onKeyDown((e: IKeyboardEvent) => {
			if (e.keyCode === KeyCode.Tab && !e.shiftKey) {
				this.languageMode?.focus();
				e.preventDefault();
				e.stopPropagation();
			}
		});

		this.editor.addContentWidget(this);
	}

	private removeContentWidgetFromEditor(): void {
		this.editorKeyDownEvent?.dispose();
		this.editor.removeContentWidget(this);
	}

	private onDidChangeModelContent(): void {
		if (this.editor.getValue() === '') {
			this.addContentWidgetToEditor();
		} else {
			this.removeContentWidgetFromEditor();
		}
	}

	getId(): string {
		return UntitledTextEditorHintContentWidget.ID;
	}

	// Select a language to get started. Start typing to dismiss, or don't show this again.
	getDomNode(): HTMLElement {
		if (!this.domNode) {
			this.domNode = $('.untitled-hint');
			this.domNode.style.width = 'max-content';
			const language = $('a.language-mode');
			language.tabIndex = 1;
			language.setAttribute('href', '#');
			this.languageMode = language;
			language.style.cursor = 'pointer';
			language.innerText = localize('selectAlanguage2', "Select a language");
			const languageKeyBinding = this.keybindingService.lookupKeybinding(ChangeModeAction.ID);
			const languageKeybindingLabel = languageKeyBinding?.getLabel();
			if (languageKeybindingLabel) {
				language.title = localize('keyboardBindingTooltip', "{0}", languageKeybindingLabel);
			}
			this.domNode.appendChild(language);
			const toGetStarted = $('span');
			toGetStarted.innerText = localize('toGetStarted', " to get started. Start typing to dismiss, or ",);
			this.domNode.appendChild(toGetStarted);

			const dontShow = $('a');
			dontShow.tabIndex = 2;
			dontShow.setAttribute('href', '#');
			dontShow.style.cursor = 'pointer';
			dontShow.innerText = localize('dontshow', "don't show");
			this.domNode.appendChild(dontShow);

			const thisAgain = $('span');
			thisAgain.innerText = localize('thisAgain', " this again.");
			this.domNode.appendChild(thisAgain);
			this.toDispose.push(Gesture.addTarget(this.domNode));
			const languageOnClickOrTap = async (e: MouseEvent) => {
				e.stopPropagation();
				// Need to focus editor before so current editor becomes active and the command is properly executed
				this.editor.focus();
				await this.commandService.executeCommand(ChangeModeAction.ID, { from: 'hint' });
				this.editor.focus();
			};
			this.toDispose.push(dom.addStandardDisposableListener(this.domNode, dom.EventType.KEY_DOWN, (e: IKeyboardEvent) => {
				// These listed keys alone won't lead to stop tab navigation
				const ignoredKeys = [
					KeyCode.Tab,
					KeyCode.Enter,
					KeyCode.Shift,
					KeyCode.Ctrl,
					KeyCode.Alt,
					KeyCode.Meta
				];

				if (!ignoredKeys.includes(e.keyCode)) {
					this.editor.focus();
				}
			}));
			this.toDispose.push(dom.addDisposableListener(language, 'click', languageOnClickOrTap));
			this.toDispose.push(dom.addDisposableListener(language, GestureEventType.Tap, languageOnClickOrTap));
			this.toDispose.push(Gesture.addTarget(language));

			const dontShowOnClickOrTap = () => {
				this.configurationService.updateValue(untitledTextEditorHintSetting, 'hidden');
				this.dispose();
				this.editor.focus();
			};
			this.toDispose.push(dom.addDisposableListener(dontShow, 'click', dontShowOnClickOrTap));
			this.toDispose.push(dom.addDisposableListener(dontShow, GestureEventType.Tap, dontShowOnClickOrTap));
			this.toDispose.push(Gesture.addTarget(dontShow));

			this.toDispose.push(dom.addDisposableListener(this.domNode, 'click', () => {
				this.editor.focus();
			}));

			this.domNode.style.fontStyle = 'italic';
			this.domNode.style.paddingLeft = '4px';
			this.editor.applyFontInfo(this.domNode);
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
		this.editorKeyDownEvent?.dispose();
		dispose(this.toDispose);
	}
}

registerThemingParticipant((theme, collector) => {
	const inputPlaceholderForegroundColor = theme.getColor(inputPlaceholderForeground);
	if (inputPlaceholderForegroundColor) {
		collector.addRule(`.monaco-editor .contentWidgets .untitled-hint { color: ${inputPlaceholderForegroundColor}; }`);
	}
	const textLinkForegroundColor = theme.getColor(textLinkForeground);
	if (textLinkForegroundColor) {
		collector.addRule(`.monaco-editor .contentWidgets .untitled-hint a { color: ${textLinkForegroundColor}; outline-offset: 0px; margin-top: 0px; padding: 0px 2px 1px 1px;}`);
		collector.addRule(`.monaco-editor .contentWidgets .untitled-hint a:focus { outline: 1px solid ${textLinkForegroundColor}; }`);
	}
});

registerEditorContribution(UntitledTextEditorHintContribution.ID, UntitledTextEditorHintContribution);
