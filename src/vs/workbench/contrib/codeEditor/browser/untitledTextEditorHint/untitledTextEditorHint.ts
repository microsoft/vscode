/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!./untitledTextEditorHint';
import * as dom from 'vs/base/browser/dom';
import { DisposableStore, dispose, IDisposable } from 'vs/base/common/lifecycle';
import { ContentWidgetPositionPreference, ICodeEditor, IContentWidget, IContentWidgetPosition } from 'vs/editor/browser/editorBrowser';
import { localize } from 'vs/nls';
import { ChangeLanguageAction } from 'vs/workbench/browser/parts/editor/editorStatus';
import { ICommandService } from 'vs/platform/commands/common/commands';
import { PLAINTEXT_LANGUAGE_ID } from 'vs/editor/common/languages/modesRegistry';
import { IEditorContribution } from 'vs/editor/common/editorCommon';
import { Schemas } from 'vs/base/common/network';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { ConfigurationChangedEvent, EditorOption } from 'vs/editor/common/config/editorOptions';
import { EditorContributionInstantiation, registerEditorContribution } from 'vs/editor/browser/editorExtensions';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { IEditorGroupsService } from 'vs/workbench/services/editor/common/editorGroupsService';
import { IContentActionHandler, renderFormattedText } from 'vs/base/browser/formattedTextRenderer';
import { ApplyFileSnippetAction } from 'vs/workbench/contrib/snippets/browser/commands/fileTemplateSnippets';
import { IInlineChatSessionService } from 'vs/workbench/contrib/inlineChat/browser/inlineChatSession';

const $ = dom.$;

const untitledTextEditorHintSetting = 'workbench.editor.untitled.hint';
export class UntitledTextEditorHintContribution implements IEditorContribution {

	public static readonly ID = 'editor.contrib.untitledTextEditorHint';

	private toDispose: IDisposable[];
	private untitledTextHintContentWidget: UntitledTextEditorHintContentWidget | undefined;

	constructor(
		private readonly editor: ICodeEditor,
		@IEditorGroupsService private readonly editorGroupsService: IEditorGroupsService,
		@ICommandService private readonly commandService: ICommandService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IKeybindingService private readonly keybindingService: IKeybindingService,
		@IInlineChatSessionService inlineChatSessionService: IInlineChatSessionService,
	) {
		this.toDispose = [];
		this.toDispose.push(this.editor.onDidChangeModel(() => this.update()));
		this.toDispose.push(this.editor.onDidChangeModelLanguage(() => this.update()));
		this.toDispose.push(this.configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(untitledTextEditorHintSetting)) {
				this.update();
			}
		}));
		this.toDispose.push(inlineChatSessionService.onWillStartSession(editor => {
			if (this.editor === editor) {
				this.untitledTextHintContentWidget?.dispose();
			}
		}));
	}

	private update(): void {
		this.untitledTextHintContentWidget?.dispose();
		const configValue = this.configurationService.getValue(untitledTextEditorHintSetting);
		const model = this.editor.getModel();

		if (model && model.uri.scheme === Schemas.untitled && model.getLanguageId() === PLAINTEXT_LANGUAGE_ID && configValue === 'text') {
			this.untitledTextHintContentWidget = new UntitledTextEditorHintContentWidget(this.editor, this.editorGroupsService, this.commandService, this.configurationService, this.keybindingService);
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
	private toDispose: DisposableStore;

	constructor(
		private readonly editor: ICodeEditor,
		private readonly editorGroupsService: IEditorGroupsService,
		private readonly commandService: ICommandService,
		private readonly configurationService: IConfigurationService,
		private readonly keybindingService: IKeybindingService,
	) {
		this.toDispose = new DisposableStore();
		this.toDispose.add(editor.onDidChangeModelContent(() => this.onDidChangeModelContent()));
		this.toDispose.add(this.editor.onDidChangeConfiguration((e: ConfigurationChangedEvent) => {
			if (this.domNode && e.hasChanged(EditorOption.fontInfo)) {
				this.editor.applyFontInfo(this.domNode);
			}
		}));
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
		return UntitledTextEditorHintContentWidget.ID;
	}

	// Select a language to get started. Start typing to dismiss, or don't show this again.
	getDomNode(): HTMLElement {
		if (!this.domNode) {
			this.domNode = $('.untitled-hint');
			this.domNode.style.width = 'max-content';

			const hintMsg = localize({
				key: 'message',
				comment: [
					'Preserve double-square brackets and their order',
					'language refers to a programming language'
				]
			}, '[[Select a language]], or [[fill with template]], or [[open a different editor]] to get started.\nStart typing to dismiss or [[don\'t show]] this again.');
			const hintHandler: IContentActionHandler = {
				disposables: this.toDispose,
				callback: (index, event) => {
					switch (index) {
						case '0':
							languageOnClickOrTap(event.browserEvent);
							break;
						case '1':
							snippetOnClickOrTap(event.browserEvent);
							break;
						case '2':
							chooseEditorOnClickOrTap(event.browserEvent);
							break;
						case '3':
							dontShowOnClickOrTap();
							break;
					}
				}
			};

			const hintElement = renderFormattedText(hintMsg, {
				actionHandler: hintHandler,
				renderCodeSegments: false,
			});
			this.domNode.append(hintElement);

			// ugly way to associate keybindings...
			const keybindingsLookup = [ChangeLanguageAction.ID, ApplyFileSnippetAction.Id, 'welcome.showNewFileEntries'];
			for (const anchor of hintElement.querySelectorAll('a')) {
				anchor.style.cursor = 'pointer';
				const id = keybindingsLookup.shift();
				const title = id && this.keybindingService.lookupKeybinding(id)?.getLabel();
				anchor.title = title ?? '';
			}

			// the actual command handlers...
			const languageOnClickOrTap = async (e: UIEvent) => {
				e.stopPropagation();
				// Need to focus editor before so current editor becomes active and the command is properly executed
				this.editor.focus();
				await this.commandService.executeCommand(ChangeLanguageAction.ID, { from: 'hint' });
				this.editor.focus();
			};

			const snippetOnClickOrTap = async (e: UIEvent) => {
				e.stopPropagation();

				await this.commandService.executeCommand(ApplyFileSnippetAction.Id);
			};

			const chooseEditorOnClickOrTap = async (e: UIEvent) => {
				e.stopPropagation();

				const activeEditorInput = this.editorGroupsService.activeGroup.activeEditor;
				const newEditorSelected = await this.commandService.executeCommand('welcome.showNewFileEntries', { from: 'hint' });

				// Close the active editor as long as it is untitled (swap the editors out)
				if (newEditorSelected && activeEditorInput !== null && activeEditorInput.resource?.scheme === Schemas.untitled) {
					this.editorGroupsService.activeGroup.closeEditor(activeEditorInput, { preserveFocus: true });
				}
			};

			const dontShowOnClickOrTap = () => {
				this.configurationService.updateValue(untitledTextEditorHintSetting, 'hidden');
				this.dispose();
				this.editor.focus();
			};

			this.toDispose.add(dom.addDisposableListener(this.domNode, 'click', () => {
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
		dispose(this.toDispose);
	}
}

registerEditorContribution(UntitledTextEditorHintContribution.ID, UntitledTextEditorHintContribution, EditorContributionInstantiation.Eager); // eager because it needs to render a help message
