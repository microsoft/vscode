/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Extensions as WorkbenchExtensions, IWorkbenchContributionsRegistry } from 'vs/workbench/common/contributions';
import { CancellationToken } from 'vs/base/common/cancellation';
import { Disposable } from 'vs/base/common/lifecycle';
import { ICodeEditorService } from 'vs/editor/browser/services/codeEditorService';
import { Position } from 'vs/editor/common/core/position';
import { Range } from 'vs/editor/common/core/range';
import { IDecorationOptions } from 'vs/editor/common/editorCommon';
import { CompletionContext, CompletionItem, CompletionItemKind, CompletionList } from 'vs/editor/common/languages';
import { ITextModel } from 'vs/editor/common/model';
import { ILanguageFeaturesService } from 'vs/editor/common/services/languageFeatures';
import { localize } from 'vs/nls';
import { Registry } from 'vs/platform/registry/common/platform';
import { editorForeground, textCodeBlockBackground, textLinkForeground } from 'vs/platform/theme/common/colorRegistry';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { IChatWidget, IChatWidgetService } from 'vs/workbench/contrib/chat/browser/chat';
import { ChatWidget } from 'vs/workbench/contrib/chat/browser/chatWidget';
import { LifecyclePhase } from 'vs/workbench/services/lifecycle/common/lifecycle';
import { ChatInputPart } from 'vs/workbench/contrib/chat/browser/chatInputPart';
import { ContentWidgetPositionPreference, IContentWidget } from 'vs/editor/browser/editorBrowser';

const decorationDescription = 'chat';
const slashCommandPlaceholderDecorationType = 'chat-session-detail';
const slashCommandTextDecorationType = 'chat-session-text';
const slashCommandContentWidgetId = 'chat-session-content-widget';

class InputEditorDecorations extends Disposable {

	private _slashCommandDomNode = document.createElement('div');
	private _slashCommandContentWidget: IContentWidget | undefined;

	constructor(
		private readonly widget: IChatWidget,
		@ICodeEditorService private readonly codeEditorService: ICodeEditorService,
		@IThemeService private readonly themeService: IThemeService,
	) {
		super();

		this.codeEditorService.registerDecorationType(decorationDescription, slashCommandPlaceholderDecorationType, {});

		this._register(this.themeService.onDidColorThemeChange(() => this.updateRegisteredDecorationTypes()));
		this.updateRegisteredDecorationTypes();

		this.updateInputEditorDecorations();
		this._register(this.widget.inputEditor.onDidChangeModelContent(() => this.updateInputEditorDecorations()));
		this._register(this.widget.onDidChangeViewModel(() => this.updateInputEditorDecorations()));
	}

	private updateRegisteredDecorationTypes() {
		this.codeEditorService.removeDecorationType(slashCommandTextDecorationType);
		this.updateInputEditorContentWidgets({ hide: true });
		this.codeEditorService.registerDecorationType(decorationDescription, slashCommandTextDecorationType, {
			opacity: '0'
		});
		this.updateInputEditorDecorations();
	}

	private getPlaceholderColor(): string | undefined {
		const theme = this.themeService.getColorTheme();
		const transparentForeground = theme.getColor(editorForeground)?.transparent(0.4);
		return transparentForeground?.toString();
	}

	private async updateInputEditorDecorations() {
		const value = this.widget.inputEditor.getValue();
		const slashCommands = await this.widget.getSlashCommands(); // TODO this async call can lead to a flicker of the placeholder text when switching editor tabs

		if (!value) {
			const extensionPlaceholder = this.widget.viewModel?.inputPlaceholder;
			const defaultPlaceholder = slashCommands?.length ?
				localize('interactive.input.placeholderWithCommands', "Ask a question or type '/' for topics") :
				localize('interactive.input.placeholderNoCommands', "Ask a question");
			const placeholder = extensionPlaceholder ?? defaultPlaceholder;
			const decoration: IDecorationOptions[] = [
				{
					range: {
						startLineNumber: 1,
						endLineNumber: 1,
						startColumn: 1,
						endColumn: 1000
					},
					renderOptions: {
						after: {
							contentText: placeholder,
							color: this.getPlaceholderColor()
						}
					}
				}
			];
			this.widget.inputEditor.setDecorationsByType(decorationDescription, slashCommandPlaceholderDecorationType, decoration);
			this.updateInputEditorContentWidgets({ hide: true });
			return;
		}

		const command = value && slashCommands?.find(c => value.startsWith(`/${c.command} `));
		if (command && command.detail && value === `/${command.command} `) {
			const decoration: IDecorationOptions[] = [
				{
					range: {
						startLineNumber: 1,
						endLineNumber: 1,
						startColumn: command.command.length + 2,
						endColumn: 1000
					},
					renderOptions: {
						after: {
							contentText: command.detail,
							color: this.getPlaceholderColor()
						}
					}
				}
			];
			this.widget.inputEditor.setDecorationsByType(decorationDescription, slashCommandPlaceholderDecorationType, decoration);
		} else {
			this.widget.inputEditor.setDecorationsByType(decorationDescription, slashCommandPlaceholderDecorationType, []);
		}

		if (command && value.startsWith(`/${command.command} `)) {
			this.updateInputEditorContentWidgets({ command: command.command });
		} else {
			this.updateInputEditorContentWidgets({ hide: true });
		}

		if (command && command.detail) {
			const textDecoration: IDecorationOptions[] = [
				{
					range: {
						startLineNumber: 1,
						endLineNumber: 1,
						startColumn: 1,
						endColumn: command.command.length + 2
					}
				}
			];
			this.widget.inputEditor.setDecorationsByType(decorationDescription, slashCommandTextDecorationType, textDecoration);
		} else {
			this.widget.inputEditor.setDecorationsByType(decorationDescription, slashCommandTextDecorationType, []);
		}
	}

	private async updateInputEditorContentWidgets(arg: { command: string } | { hide: true }) {
		const domNode = this._slashCommandDomNode;

		if (this._slashCommandContentWidget && 'hide' in arg) {
			domNode.toggleAttribute('hidden', true);
			this.widget.inputEditor.removeContentWidget(this._slashCommandContentWidget);
			return;
		} else if ('command' in arg) {
			const theme = this.themeService.getColorTheme();
			domNode.style.padding = '0 0.4em';
			domNode.style.borderRadius = '3px';
			domNode.style.backgroundColor = theme.getColor(textCodeBlockBackground)?.toString() ?? '';
			domNode.style.color = theme.getColor(textLinkForeground)?.toString() ?? '';
			domNode.innerText = `${arg.command} `;
			domNode.toggleAttribute('hidden', false);

			this._slashCommandContentWidget = {
				getId() { return slashCommandContentWidgetId; },
				getDomNode() { return domNode; },
				getPosition() {
					return {
						position: {
							lineNumber: 1,
							column: 1
						},
						preference: [ContentWidgetPositionPreference.EXACT]
					};
				},
			};

			this.widget.inputEditor.addContentWidget(this._slashCommandContentWidget);
		}
	}
}

ChatWidget.CONTRIBS.push(InputEditorDecorations);

class SlashCommandCompletions extends Disposable {
	constructor(
		@ILanguageFeaturesService private readonly languageFeaturesService: ILanguageFeaturesService,
		@IChatWidgetService private readonly chatWidgetService: IChatWidgetService,
	) {
		super();

		this._register(this.languageFeaturesService.completionProvider.register({ scheme: ChatInputPart.INPUT_SCHEME, hasAccessToAllModels: true }, {
			_debugDisplayName: 'chatSlashCommand',
			triggerCharacters: ['/'],
			provideCompletionItems: async (model: ITextModel, _position: Position, _context: CompletionContext, _token: CancellationToken) => {
				const widget = this.chatWidgetService.getWidgetByInputUri(model.uri);
				if (!widget) {
					return null;
				}

				if (model.getValueInRange(new Range(1, 1, 1, 2)) !== '/' && model.getValueLength() > 0) {
					return null;
				}

				const slashCommands = await widget.getSlashCommands();
				if (!slashCommands) {
					return null;
				}

				return <CompletionList>{
					suggestions: slashCommands.map(c => {
						const withSlash = `/${c.command}`;
						return <CompletionItem>{
							label: withSlash,
							insertText: `${withSlash} `,
							detail: c.detail,
							range: new Range(1, 1, 1, 1),
							sortText: c.sortText ?? c.command,
							kind: CompletionItemKind.Text // The icons are disabled here anyway
						};
					})
				};
			}
		}));
	}
}

Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench).registerWorkbenchContribution(SlashCommandCompletions, LifecyclePhase.Eventually);
