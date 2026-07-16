/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../base/common/cancellation.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { autorun } from '../../../../base/common/observable.js';
import { isEqual } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { CodeEditorWidget } from '../../../../editor/browser/widget/codeEditor/codeEditorWidget.js';
import { CompletionContext, CompletionItem, CompletionItemKind } from '../../../../editor/common/languages.js';
import { IModelDeltaDecoration, InjectedTextCursorStops, ITextModel } from '../../../../editor/common/model.js';
import { IEditorDecorationsCollection } from '../../../../editor/common/editorCommon.js';
import { Position } from '../../../../editor/common/core/position.js';
import { Range } from '../../../../editor/common/core/range.js';
import { getWordAtText } from '../../../../editor/common/core/wordHelper.js';
import { ILanguageFeaturesService } from '../../../../editor/common/services/languageFeatures.js';
import { CommandsRegistry, ICommandService } from '../../../../platform/commands/common/commands.js';
import { localize } from '../../../../nls.js';
import { AICustomizationManagementCommands, AICustomizationManagementSection } from '../../../../workbench/contrib/chat/browser/aiCustomization/aiCustomizationManagement.js';
import { IChatPromptSlashCommand } from '../../../../workbench/contrib/chat/common/promptSyntax/service/promptsService.js';
import { INewChatModelPickerService } from './newChatModelPicker.js';
import { isAgentHostTarget } from '../../../../workbench/contrib/chat/common/chatSessionsService.js';
import { getChatSessionType } from '../../../../workbench/contrib/chat/common/model/chatUri.js';
import { ISessionContext } from '../../../services/sessions/browser/sessionContext.js';
import { ICustomizationHarnessService } from '../../../../workbench/contrib/chat/common/customizationHarnessService.js';
/**
 * Static command ID used by completion items to trigger immediate slash command execution,
 * mirroring the pattern of core's `ChatSubmitAction` for `executeImmediately` commands.
 */
export const SESSIONS_EXECUTE_SLASH_COMMAND_ID = 'sessions.chat.executeSlashCommand';

CommandsRegistry.registerCommand(SESSIONS_EXECUTE_SLASH_COMMAND_ID, (_, handler: SlashCommandHandler, slashCommandStr: string) => {
	handler.tryExecuteSlashCommand(slashCommandStr);
	handler.clearInput();
});

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

	private static readonly _commandClassName = 'sessions-slash-command';
	private static readonly _placeholderClassName = 'sessions-slash-placeholder';

	private readonly _slashCommands: ISessionsSlashCommandData[] = [];
	private _cachedPromptCommands: readonly IChatPromptSlashCommand[] = [];
	private _promptCommandsRefreshGeneration = 0;

	private readonly _commandDecorations: IEditorDecorationsCollection;
	private readonly _placeholderDecorations: IEditorDecorationsCollection;

	constructor(
		private readonly _editor: CodeEditorWidget,
		@ICommandService private readonly commandService: ICommandService,
		@ILanguageFeaturesService private readonly languageFeaturesService: ILanguageFeaturesService,
		@ICustomizationHarnessService private readonly harnessService: ICustomizationHarnessService,
		@INewChatModelPickerService private readonly newChatModelPickerService: INewChatModelPickerService,
		@ISessionContext private readonly sessionContext: ISessionContext,
	) {
		super();
		this._commandDecorations = this._editor.createDecorationsCollection();
		this._placeholderDecorations = this._editor.createDecorationsCollection();
		this._registerSlashCommands();
		this._registerCompletions();
		this._registerDecorations();

		this._register(autorun(reader => {
			this._refreshPromptCommands(this.sessionContext.session.read(reader)?.resource);
		}));

		this._register(this.harnessService.onDidChangeSlashCommands((e) => {
			const sessionResource = this.sessionContext.session.get()?.resource;
			if (sessionResource && e.sessionType === getChatSessionType(sessionResource)) {
				this._refreshPromptCommands(sessionResource);
			}
		}));
	}

	clearInput(): void {
		this._editor.getModel()?.setValue('');
	}

	private _refreshPromptCommands(sessionResource: URI | undefined): void {
		const refreshGeneration = ++this._promptCommandsRefreshGeneration;
		if (!sessionResource) {
			this._cachedPromptCommands = [];
			this._updateDecorations();
			return;
		}
		this.harnessService.getSlashCommands(sessionResource, CancellationToken.None).then(commands => {
			const currentSessionResource = this.sessionContext.session.get()?.resource;
			if (refreshGeneration !== this._promptCommandsRefreshGeneration || !currentSessionResource || !isEqual(currentSessionResource, sessionResource)) {
				return;
			}
			this._cachedPromptCommands = commands;
			this._updateDecorations();
		}, () => {
			const currentSessionResource = this.sessionContext.session.get()?.resource;
			if (refreshGeneration !== this._promptCommandsRefreshGeneration || !currentSessionResource || !isEqual(currentSessionResource, sessionResource)) {
				return;
			}
			this._cachedPromptCommands = [];
			this._updateDecorations();
		});
	}

	/**
	 * Attempts to parse and execute a slash command from the input.
	 * Returns `true` if a command was handled.
	 */
	tryExecuteSlashCommand(query: string): boolean {
		const match = query.match(/^\/([\w\p{L}\d_\-\.:]+)\s*(.*)/su);
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
			command: 'hooks',
			detail: localize('slashCommand.hooks', "View and manage hooks"),
			sortText: 'z3_hooks',
			executeImmediately: true,
			execute: openSection(AICustomizationManagementSection.Hooks),
		});
		this._slashCommands.push({
			command: 'models',
			detail: localize('slashCommand.models', "Open the model picker"),
			sortText: 'z3_models',
			executeImmediately: true,
			execute: () => this.newChatModelPickerService.openModelPicker(),
		});
	}

	private _registerDecorations(): void {
		this._register(this._editor.onDidChangeModelContent(() => this._updateDecorations()));
		this._register(autorun(reader => {
			this.sessionContext.session.read(reader);
			this._updateDecorations();
		}));
		this._updateDecorations();
	}

	private _updateDecorations(): void {
		const model = this._editor.getModel();
		const value = model?.getValue() ?? '';
		const match = value.match(/^\/([\w\p{L}\d_\-\.:]+)\s?/u);
		const activeSession = this.sessionContext.session.get();

		// Agent-host sessions should not get decorations as this class is only for use with Local Agent Harness and Copilot Chat Extension.
		if (!match || (activeSession && isAgentHostTarget(getChatSessionType(activeSession.resource)))) {
			this._commandDecorations.clear();
			this._placeholderDecorations.clear();
			return;
		}

		const commandName = match[1];
		const slashCommand = this._slashCommands.find(c => c.command === commandName);
		const promptCommand = this._cachedPromptCommands.find(c => c.name === commandName);
		if (!slashCommand && !promptCommand) {
			this._commandDecorations.clear();
			this._placeholderDecorations.clear();
			return;
		}

		// Highlight the slash command text
		const commandEnd = match[0].trimEnd().length;
		this._commandDecorations.set([{
			range: new Range(1, 1, 1, commandEnd + 1),
			options: { description: 'sessions-slash-command', inlineClassName: SlashCommandHandler._commandClassName },
		}]);

		// Show the command description as a placeholder after the command
		const restOfInput = value.slice(match[0].length).trim();
		const detail = slashCommand?.detail ?? promptCommand?.argumentHint;
		if (!restOfInput && detail) {
			const placeholderCol = match[0].length + 1;
			this._placeholderDecorations.set([{
				range: new Range(1, placeholderCol, 1, model!.getLineMaxColumn(1)),
				options: {
					description: 'sessions-slash-placeholder',
					// The range is collapsed (nothing follows the command), so injected
					// text only renders with `showIfCollapsed`.
					showIfCollapsed: true,
					after: { content: detail, inlineClassName: SlashCommandHandler._placeholderClassName, cursorStops: InjectedTextCursorStops.None },
				},
			} satisfies IModelDeltaDecoration]);
		} else {
			this._placeholderDecorations.clear();
		}
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
							insertText: c.executeImmediately ? '' : `${withSlash} `,
							detail: c.detail,
							range,
							sortText: c.sortText ?? 'a'.repeat(i + 1),
							kind: CompletionItemKind.Text,
							command: c.executeImmediately ? { id: SESSIONS_EXECUTE_SLASH_COMMAND_ID, title: withSlash, arguments: [this, withSlash] } : undefined,
						};
					})
				};
			}
		}));

		// Dynamic completions for individual prompt/skill files (filtered to match
		// what the sessions customizations view shows).
		this._register(this.languageFeaturesService.completionProvider.register({ scheme: uri.scheme, hasAccessToAllModels: true }, {
			_debugDisplayName: 'sessionsPromptSlashCommands',
			triggerCharacters: ['/'],
			provideCompletionItems: async (model: ITextModel, position: Position, _context: CompletionContext, token: CancellationToken) => {
				const activeSession = this.sessionContext.session.get();
				if (!activeSession) {
					return null;
				}
				if (isAgentHostTarget(getChatSessionType(activeSession.resource))) {
					// Agent-host sessions delegate completions to the host
					// process via `AgentHostInputCompletions`.
					return null;
				}


				const range = this._computeCompletionRanges(model, position, /\/[\p{L}0-9_.:-]*/gu);
				if (!range) {
					return null;
				}

				const textBefore = model.getValueInRange(new Range(1, 1, range.replace.startLineNumber, range.replace.startColumn));
				if (textBefore.trim() !== '') {
					return null;
				}

				const promptCommands = await this.harnessService.getSlashCommands(activeSession?.resource, token);
				const userInvocable = promptCommands.filter(c => c.userInvocable);
				if (userInvocable.length === 0) {
					return null;
				}

				return {
					suggestions: userInvocable.map((c, i): CompletionItem => {
						const label = `/${c.name}`;
						return {
							label: { label, description: c.description },
							insertText: `${label} `,
							documentation: c.description,
							range,
							sortText: 'b'.repeat(i + 1),
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
