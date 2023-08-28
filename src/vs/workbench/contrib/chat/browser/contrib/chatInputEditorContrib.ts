/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from 'vs/base/common/cancellation';
import { Disposable } from 'vs/base/common/lifecycle';
import { ICodeEditorService } from 'vs/editor/browser/services/codeEditorService';
import { Position } from 'vs/editor/common/core/position';
import { Range } from 'vs/editor/common/core/range';
import { getWordAtText } from 'vs/editor/common/core/wordHelper';
import { IDecorationOptions } from 'vs/editor/common/editorCommon';
import { CompletionContext, CompletionItem, CompletionItemKind, CompletionList } from 'vs/editor/common/languages';
import { ITextModel } from 'vs/editor/common/model';
import { ILanguageFeaturesService } from 'vs/editor/common/services/languageFeatures';
import { localize } from 'vs/nls';
import { Registry } from 'vs/platform/registry/common/platform';
import { inputPlaceholderForeground } from 'vs/platform/theme/common/colorRegistry';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { IWorkbenchContributionsRegistry, Extensions as WorkbenchExtensions } from 'vs/workbench/common/contributions';
import { SubmitAction } from 'vs/workbench/contrib/chat/browser/actions/chatExecuteActions';
import { IChatWidget, IChatWidgetService } from 'vs/workbench/contrib/chat/browser/chat';
import { ChatInputPart } from 'vs/workbench/contrib/chat/browser/chatInputPart';
import { SlashCommandContentWidget } from 'vs/workbench/contrib/chat/browser/chatSlashCommandContentWidget';
import { ChatWidget } from 'vs/workbench/contrib/chat/browser/chatWidget';
import { chatSlashCommandBackground, chatSlashCommandForeground } from 'vs/workbench/contrib/chat/common/chatColors';
import { IChatService } from 'vs/workbench/contrib/chat/common/chatService';
import { IChatVariablesService } from 'vs/workbench/contrib/chat/common/chatVariables';
import { isResponseVM } from 'vs/workbench/contrib/chat/common/chatViewModel';
import { LifecyclePhase } from 'vs/workbench/services/lifecycle/common/lifecycle';

const decorationDescription = 'chat';
const slashCommandPlaceholderDecorationType = 'chat-session-detail';
const slashCommandTextDecorationType = 'chat-session-text';
const variableTextDecorationType = 'chat-variable-text';

class InputEditorDecorations extends Disposable {

	private _slashCommandContentWidget: SlashCommandContentWidget | undefined;
	private _previouslyUsedSlashCommands = new Set<string>();

	constructor(
		private readonly widget: IChatWidget,
		@ICodeEditorService private readonly codeEditorService: ICodeEditorService,
		@IThemeService private readonly themeService: IThemeService,
		@IChatService private readonly chatService: IChatService,
	) {
		super();

		this.codeEditorService.registerDecorationType(decorationDescription, slashCommandPlaceholderDecorationType, {});

		this._register(this.themeService.onDidColorThemeChange(() => this.updateRegisteredDecorationTypes()));
		this.updateRegisteredDecorationTypes();

		this.updateInputEditorDecorations();
		this._register(this.widget.inputEditor.onDidChangeModelContent(() => this.updateInputEditorDecorations()));
		this._register(this.widget.onDidChangeViewModel(() => {
			this._previouslyUsedSlashCommands.clear();
			this.updateInputEditorDecorations();
		}));
		this._register(this.chatService.onDidSubmitSlashCommand((e) => {
			if (e.sessionId === this.widget.viewModel?.sessionId && !this._previouslyUsedSlashCommands.has(e.slashCommand)) {
				this._previouslyUsedSlashCommands.add(e.slashCommand);
			}
		}));
	}

	private updateRegisteredDecorationTypes() {
		this.codeEditorService.removeDecorationType(variableTextDecorationType);
		this.codeEditorService.removeDecorationType(slashCommandTextDecorationType);
		this._slashCommandContentWidget?.hide();
		this.codeEditorService.registerDecorationType(decorationDescription, slashCommandTextDecorationType, {
			opacity: '0',
			after: {
				contentText: ' ',
			}
		});
		const theme = this.themeService.getColorTheme();
		this.codeEditorService.registerDecorationType(decorationDescription, variableTextDecorationType, {
			color: theme.getColor(chatSlashCommandForeground)?.toString(),
			backgroundColor: theme.getColor(chatSlashCommandBackground)?.toString(),
			borderRadius: '3px'
		});
		this.updateInputEditorDecorations();
	}

	private getPlaceholderColor(): string | undefined {
		const theme = this.themeService.getColorTheme();
		const transparentForeground = theme.getColor(inputPlaceholderForeground);
		return transparentForeground?.toString();
	}

	private async updateInputEditorDecorations() {
		const inputValue = this.widget.inputEditor.getValue();
		const slashCommands = await this.widget.getSlashCommands(); // TODO this async call can lead to a flicker of the placeholder text when switching editor tabs

		if (!inputValue) {
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
			this._slashCommandContentWidget?.hide();
			return;
		}

		let slashCommandPlaceholderDecoration: IDecorationOptions[] | undefined;
		const command = inputValue && slashCommands?.find(c => inputValue.startsWith(`/${c.command} `));
		if (command && inputValue === `/${command.command} `) {
			const isFollowupSlashCommand = this._previouslyUsedSlashCommands.has(command.command);
			const shouldRenderFollowupPlaceholder = command.followupPlaceholder && isFollowupSlashCommand;
			if (shouldRenderFollowupPlaceholder || command.detail) {
				slashCommandPlaceholderDecoration = [{
					range: {
						startLineNumber: 1,
						endLineNumber: 1,
						startColumn: command ? command.command.length : 1,
						endColumn: 1000
					},
					renderOptions: {
						after: {
							contentText: shouldRenderFollowupPlaceholder ? command.followupPlaceholder : command.detail,
							color: this.getPlaceholderColor(),
						}
					}
				}];
				this.widget.inputEditor.setDecorationsByType(decorationDescription, slashCommandPlaceholderDecorationType, slashCommandPlaceholderDecoration);
			}
		}
		if (!slashCommandPlaceholderDecoration) {
			this.widget.inputEditor.setDecorationsByType(decorationDescription, slashCommandPlaceholderDecorationType, []);
		}

		if (command && inputValue.startsWith(`/${command.command} `)) {
			if (!this._slashCommandContentWidget) {
				this._slashCommandContentWidget = new SlashCommandContentWidget(this.widget.inputEditor);
				this._store.add(this._slashCommandContentWidget);
			}
			this._slashCommandContentWidget.setCommandText(command.command);
			this._slashCommandContentWidget.show();
		} else {
			this._slashCommandContentWidget?.hide();
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

		// const variables = this.chatVariablesService.getVariables();
		const variableReg = /(^|\s)@(\w+)(:\d+)?(?=(\s|$))/ig;
		let match: RegExpMatchArray | null;
		const varDecorations: IDecorationOptions[] = [];
		while (match = variableReg.exec(inputValue)) {
			// const candidate = match[2];
			// if (Iterable.find(variables, v => v.name === candidate))
			varDecorations.push({
				range: {
					startLineNumber: 1,
					endLineNumber: 1,
					startColumn: match.index! + match[1].length + 1,
					endColumn: match.index! + match[0].length + 1
				}
			});
		}

		this.widget.inputEditor.setDecorationsByType(decorationDescription, variableTextDecorationType, varDecorations);
	}
}

class InputEditorSlashCommandMode extends Disposable {
	constructor(
		private readonly widget: IChatWidget,
		@IChatService private readonly chatService: IChatService
	) {
		super();
		this._register(this.chatService.onDidSubmitSlashCommand(({ slashCommand, sessionId }) => this.repopulateSlashCommand(slashCommand, sessionId)));
	}

	private async repopulateSlashCommand(slashCommand: string, sessionId: string) {
		if (this.widget.viewModel?.sessionId !== sessionId) {
			return;
		}

		const slashCommands = await this.widget.getSlashCommands();

		if (this.widget.inputEditor.getValue().trim().length !== 0) {
			return;
		}

		if (slashCommands?.find(c => c.command === slashCommand)?.shouldRepopulate) {
			const value = `/${slashCommand} `;
			this.widget.inputEditor.setValue(value);
			this.widget.inputEditor.setPosition({ lineNumber: 1, column: value.length + 1 });

		}
	}
}

ChatWidget.CONTRIBS.push(InputEditorDecorations, InputEditorSlashCommandMode);

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
							insertText: c.executeImmediately ? '' : `${withSlash} `,
							detail: c.detail,
							range: new Range(1, 1, 1, 1),
							sortText: c.sortText ?? c.command,
							kind: CompletionItemKind.Text, // The icons are disabled here anyway,
							command: c.executeImmediately ? { id: SubmitAction.ID, title: withSlash, arguments: [{ widget, inputValue: `${withSlash} ` }] } : undefined,
						};
					})
				};
			}
		}));
	}
}

Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench).registerWorkbenchContribution(SlashCommandCompletions, LifecyclePhase.Eventually);

class VariableCompletions extends Disposable {

	private static readonly VariableNameDef = /@\w*/g; // MUST be using `g`-flag

	constructor(
		@ILanguageFeaturesService private readonly languageFeaturesService: ILanguageFeaturesService,
		@IChatWidgetService private readonly chatWidgetService: IChatWidgetService,
		@IChatVariablesService private readonly chatVariablesService: IChatVariablesService,
	) {
		super();

		this._register(this.languageFeaturesService.completionProvider.register({ scheme: ChatInputPart.INPUT_SCHEME, hasAccessToAllModels: true }, {
			_debugDisplayName: 'chatVariables',
			triggerCharacters: ['@'],
			provideCompletionItems: async (model: ITextModel, position: Position, _context: CompletionContext, _token: CancellationToken) => {

				const widget = this.chatWidgetService.getWidgetByInputUri(model.uri);
				if (!widget) {
					return null;
				}

				const varWord = getWordAtText(position.column, VariableCompletions.VariableNameDef, model.getLineContent(position.lineNumber), 0);
				if (!varWord && model.getWordUntilPosition(position).word) {
					// inside a "normal" word
					return null;
				}

				let insert: Range;
				let replace: Range;
				if (!varWord) {
					insert = replace = Range.fromPositions(position);
				} else {
					insert = new Range(position.lineNumber, varWord.startColumn, position.lineNumber, position.column);
					replace = new Range(position.lineNumber, varWord.startColumn, position.lineNumber, varWord.endColumn);
				}

				const history = widget.viewModel!.getItems()
					.filter(isResponseVM);

				// TODO@roblourens work out a real API for this- maybe it can be part of the two-step flow that @file will probably use
				const historyItems = history.map((h, i): CompletionItem => ({
					label: `@response:${i + 1}`,
					detail: h.response.asString(),
					insertText: `@response:${String(i + 1).padStart(String(history.length).length, '0')} `,
					kind: CompletionItemKind.Text,
					range: { insert, replace },
				}));

				const variableItems = Array.from(this.chatVariablesService.getVariables()).map(v => {
					const withAt = `@${v.name}`;
					return <CompletionItem>{
						label: withAt,
						range: { insert, replace },
						insertText: withAt + ' ',
						detail: v.description,
						kind: CompletionItemKind.Text, // The icons are disabled here anyway,
					};
				});

				return <CompletionList>{
					suggestions: [...variableItems, ...historyItems]
				};
			}
		}));
	}
}

Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench).registerWorkbenchContribution(VariableCompletions, LifecyclePhase.Eventually);
