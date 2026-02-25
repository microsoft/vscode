/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../base/common/cancellation.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { themeColorFromId } from '../../../../base/common/themables.js';
import { CodeEditorWidget } from '../../../../editor/browser/widget/codeEditor/codeEditorWidget.js';
import { ICodeEditorService } from '../../../../editor/browser/services/codeEditorService.js';
import { CompletionContext, CompletionItem, CompletionItemKind } from '../../../../editor/common/languages.js';
import { ITextModel } from '../../../../editor/common/model.js';
import { IDecorationOptions } from '../../../../editor/common/editorCommon.js';
import { Position } from '../../../../editor/common/core/position.js';
import { Range } from '../../../../editor/common/core/range.js';
import { getWordAtText } from '../../../../editor/common/core/wordHelper.js';
import { ILanguageFeaturesService } from '../../../../editor/common/services/languageFeatures.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { inputPlaceholderForeground } from '../../../../platform/theme/common/colorRegistry.js';
import { localize } from '../../../../nls.js';
import { chatSlashCommandBackground, chatSlashCommandForeground } from '../../../../workbench/contrib/chat/common/widget/chatColors.js';
import { AICustomizationManagementCommands, AICustomizationManagementSection } from '../../../../workbench/contrib/chat/browser/aiCustomization/aiCustomizationManagement.js';

/**
 * Minimal slash command descriptor for the sessions new-chat widget.
 * Self-contained copy of the essential fields from core's `IChatSlashData`
 * to avoid a direct dependency on the workbench chat slash command service.
 */
interface ISessionsSlashCommandData {
	readonly command: string;
	readonly detail: string;
	readonly sortText?: string;
	readonly executeImmediately?: boolean;
	readonly execute: (args: string) => void;
}

/**
 * Manages slash commands for the sessions new-chat input widget — registration,
 * autocompletion, decorations (syntax highlighting + placeholder text), and execution.
 */
export class SlashCommandHandler extends Disposable {

	private static readonly _slashDecoType = 'sessions-slash-command';
	private static readonly _slashPlaceholderDecoType = 'sessions-slash-placeholder';
	private static _slashDecosRegistered = false;

	private readonly _slashCommands: ISessionsSlashCommandData[] = [];

	constructor(
		private readonly _editor: CodeEditorWidget,
		@ICommandService private readonly commandService: ICommandService,
		@ICodeEditorService private readonly codeEditorService: ICodeEditorService,
		@ILanguageFeaturesService private readonly languageFeaturesService: ILanguageFeaturesService,
		@IThemeService private readonly themeService: IThemeService,
	) {
		super();
		this._registerSlashCommands();
		this._registerCompletions();
		this._registerDecorations();
	}

	/**
	 * Attempts to parse and execute a slash command from the input.
	 * Returns `true` if a command was handled.
	 */
	tryExecuteSlashCommand(query: string): boolean {
		const match = query.match(/^\/(\w+)\s*(.*)/s);
		if (!match) {
			return false;
		}

		const commandName = match[1];
		const slashCommand = this._slashCommands.find(c => c.command === commandName);
		if (!slashCommand) {
			return false;
		}

		slashCommand.execute(match[2]?.trim() ?? '');
		return true;
	}

	private _registerSlashCommands(): void {
		const openSection = (section: AICustomizationManagementSection) =>
			() => this.commandService.executeCommand(AICustomizationManagementCommands.OpenEditor, section);

		this._slashCommands.push({
			command: 'agents',
			detail: localize('slashCommand.agents', "View and manage custom agents"),
			sortText: 'z3_agents',
			executeImmediately: true,
			execute: openSection(AICustomizationManagementSection.Agents),
		});
		this._slashCommands.push({
			command: 'skills',
			detail: localize('slashCommand.skills', "View and manage skills"),
			sortText: 'z3_skills',
			executeImmediately: true,
			execute: openSection(AICustomizationManagementSection.Skills),
		});
		this._slashCommands.push({
			command: 'instructions',
			detail: localize('slashCommand.instructions', "View and manage instructions"),
			sortText: 'z3_instructions',
			executeImmediately: true,
			execute: openSection(AICustomizationManagementSection.Instructions),
		});
		this._slashCommands.push({
			command: 'prompts',
			detail: localize('slashCommand.prompts', "View and manage prompt files"),
			sortText: 'z3_prompts',
			executeImmediately: true,
			execute: openSection(AICustomizationManagementSection.Prompts),
		});
		this._slashCommands.push({
			command: 'hooks',
			detail: localize('slashCommand.hooks', "View and manage hooks"),
			sortText: 'z3_hooks',
			executeImmediately: true,
			execute: openSection(AICustomizationManagementSection.Hooks),
		});
		this._slashCommands.push({
			command: 'mcp',
			detail: localize('slashCommand.mcp', "View and manage MCP servers"),
			sortText: 'z3_mcp',
			executeImmediately: true,
			execute: openSection(AICustomizationManagementSection.McpServers),
		});
	}

	private _registerDecorations(): void {
		if (!SlashCommandHandler._slashDecosRegistered) {
			SlashCommandHandler._slashDecosRegistered = true;
			this.codeEditorService.registerDecorationType('sessions-chat', SlashCommandHandler._slashDecoType, {
				color: themeColorFromId(chatSlashCommandForeground),
				backgroundColor: themeColorFromId(chatSlashCommandBackground),
				borderRadius: '3px',
			});
			this.codeEditorService.registerDecorationType('sessions-chat', SlashCommandHandler._slashPlaceholderDecoType, {});
		}

		this._register(this._editor.onDidChangeModelContent(() => this._updateDecorations()));
		this._updateDecorations();
	}

	private _updateDecorations(): void {
		const model = this._editor.getModel();
		const value = model?.getValue() ?? '';
		const match = value.match(/^\/(\w+)\s?/);

		if (!match) {
			this._editor.setDecorationsByType('sessions-chat', SlashCommandHandler._slashDecoType, []);
			this._editor.setDecorationsByType('sessions-chat', SlashCommandHandler._slashPlaceholderDecoType, []);
			return;
		}

		const commandName = match[1];
		const slashCommand = this._slashCommands.find(c => c.command === commandName);
		if (!slashCommand) {
			this._editor.setDecorationsByType('sessions-chat', SlashCommandHandler._slashDecoType, []);
			this._editor.setDecorationsByType('sessions-chat', SlashCommandHandler._slashPlaceholderDecoType, []);
			return;
		}

		// Highlight the slash command text
		const commandEnd = match[0].trimEnd().length;
		const commandDeco: IDecorationOptions[] = [{
			range: { startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: commandEnd + 1 },
		}];
		this._editor.setDecorationsByType('sessions-chat', SlashCommandHandler._slashDecoType, commandDeco);

		// Show the command description as a placeholder after the command
		const restOfInput = value.slice(match[0].length).trim();
		if (!restOfInput && slashCommand.detail) {
			const placeholderCol = match[0].length + 1;
			const placeholderDeco: IDecorationOptions[] = [{
				range: { startLineNumber: 1, startColumn: placeholderCol, endLineNumber: 1, endColumn: model!.getLineMaxColumn(1) },
				renderOptions: {
					after: {
						contentText: slashCommand.detail,
						color: this._getPlaceholderColor(),
					}
				}
			}];
			this._editor.setDecorationsByType('sessions-chat', SlashCommandHandler._slashPlaceholderDecoType, placeholderDeco);
		} else {
			this._editor.setDecorationsByType('sessions-chat', SlashCommandHandler._slashPlaceholderDecoType, []);
		}
	}

	private _getPlaceholderColor(): string | undefined {
		const theme = this.themeService.getColorTheme();
		return theme.getColor(inputPlaceholderForeground)?.toString();
	}

	private _registerCompletions(): void {
		const uri = this._editor.getModel()?.uri;
		if (!uri) {
			return;
		}

		this._register(this.languageFeaturesService.completionProvider.register({ scheme: uri.scheme, hasAccessToAllModels: true }, {
			_debugDisplayName: 'sessionsSlashCommands',
			triggerCharacters: ['/'],
			provideCompletionItems: (model: ITextModel, position: Position, _context: CompletionContext, _token: CancellationToken) => {
				const range = this._computeCompletionRanges(model, position, /\/\w*/g);
				if (!range) {
					return null;
				}

				// Only allow slash commands at the start of input
				const textBefore = model.getValueInRange(new Range(1, 1, range.replace.startLineNumber, range.replace.startColumn));
				if (textBefore.trim() !== '') {
					return null;
				}

				return {
					suggestions: this._slashCommands.map((c, i): CompletionItem => {
						const withSlash = `/${c.command}`;
						return {
							label: withSlash,
							insertText: `${withSlash} `,
							detail: c.detail,
							range,
							sortText: c.sortText ?? 'a'.repeat(i + 1),
							kind: CompletionItemKind.Text,
						};
					})
				};
			}
		}));
	}

	private _computeCompletionRanges(model: ITextModel, position: Position, reg: RegExp): { insert: Range; replace: Range } | undefined {
		const varWord = getWordAtText(position.column, reg, model.getLineContent(position.lineNumber), 0);
		if (!varWord && model.getWordUntilPosition(position).word) {
			return;
		}

		if (!varWord && position.column > 1) {
			const textBefore = model.getValueInRange(new Range(position.lineNumber, position.column - 1, position.lineNumber, position.column));
			if (textBefore !== ' ') {
				return;
			}
		}

		let insert: Range;
		let replace: Range;
		if (!varWord) {
			insert = replace = Range.fromPositions(position);
		} else {
			insert = new Range(position.lineNumber, varWord.startColumn, position.lineNumber, position.column);
			replace = new Range(position.lineNumber, varWord.startColumn, position.lineNumber, varWord.endColumn);
		}

		return { insert, replace };
	}
}
