/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var SlashCommandHandler_1;
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { themeColorFromId } from '../../../../base/common/themables.js';
import { ICodeEditorService } from '../../../../editor/browser/services/codeEditorService.js';
import { Range } from '../../../../editor/common/core/range.js';
import { getWordAtText } from '../../../../editor/common/core/wordHelper.js';
import { ILanguageFeaturesService } from '../../../../editor/common/services/languageFeatures.js';
import { CommandsRegistry, ICommandService } from '../../../../platform/commands/common/commands.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { inputPlaceholderForeground } from '../../../../platform/theme/common/colorRegistry.js';
import { localize } from '../../../../nls.js';
import { chatSlashCommandBackground, chatSlashCommandForeground } from '../../../../workbench/contrib/chat/common/widget/chatColors.js';
import { AICustomizationManagementCommands, AICustomizationManagementSection } from '../../../../workbench/contrib/chat/browser/aiCustomization/aiCustomizationManagement.js';
import { IAICustomizationWorkspaceService } from '../../../../workbench/contrib/chat/common/aiCustomizationWorkspaceService.js';
import { IPromptsService } from '../../../../workbench/contrib/chat/common/promptSyntax/service/promptsService.js';
import { PromptsType } from '../../../../workbench/contrib/chat/common/promptSyntax/promptTypes.js';
/**
 * Static command ID used by completion items to trigger immediate slash command execution,
 * mirroring the pattern of core's `ChatSubmitAction` for `executeImmediately` commands.
 */
export const SESSIONS_EXECUTE_SLASH_COMMAND_ID = 'sessions.chat.executeSlashCommand';
CommandsRegistry.registerCommand(SESSIONS_EXECUTE_SLASH_COMMAND_ID, (_, handler, slashCommandStr) => {
    handler.tryExecuteSlashCommand(slashCommandStr);
    handler.clearInput();
});
/**
 * Manages slash commands for the sessions new-chat input widget — registration,
 * autocompletion, decorations (syntax highlighting + placeholder text), and execution.
 */
let SlashCommandHandler = class SlashCommandHandler extends Disposable {
    static { SlashCommandHandler_1 = this; }
    static { this._slashDecoType = 'sessions-slash-command'; }
    static { this._slashPlaceholderDecoType = 'sessions-slash-placeholder'; }
    static { this._slashDecosRegistered = false; }
    constructor(_editor, commandService, codeEditorService, languageFeaturesService, themeService, aiCustomizationWorkspaceService, promptsService) {
        super();
        this._editor = _editor;
        this.commandService = commandService;
        this.codeEditorService = codeEditorService;
        this.languageFeaturesService = languageFeaturesService;
        this.themeService = themeService;
        this.aiCustomizationWorkspaceService = aiCustomizationWorkspaceService;
        this.promptsService = promptsService;
        this._slashCommands = [];
        this._cachedPromptCommands = [];
        this._registerSlashCommands();
        this._registerCompletions();
        this._registerDecorations();
        this._refreshPromptCommands();
        this._register(this.promptsService.onDidChangeSlashCommands(() => this._refreshPromptCommands()));
    }
    clearInput() {
        this._editor.getModel()?.setValue('');
    }
    _refreshPromptCommands() {
        this.aiCustomizationWorkspaceService.getFilteredPromptSlashCommands(CancellationToken.None).then(commands => {
            this._cachedPromptCommands = commands;
            this._updateDecorations();
        }, () => { });
    }
    /**
     * Attempts to parse and execute a slash command from the input.
     * Returns `true` if a command was handled.
     */
    tryExecuteSlashCommand(query) {
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
    /**
     * If the query starts with a prompt/skill slash command (e.g. `/my-prompt args`),
     * expands it into a CLI-friendly markdown reference so the agent can locate the
     * file. Returns `undefined` when the query is not a prompt slash command.
     */
    tryExpandPromptSlashCommand(query) {
        const match = query.match(/^\/([\w\p{L}\d_\-\.:]+)\s*(.*)/su);
        if (!match) {
            return undefined;
        }
        const commandName = match[1];
        const promptCommand = this._cachedPromptCommands.find(c => c.name === commandName);
        if (!promptCommand) {
            return undefined;
        }
        const args = match[2]?.trim() ?? '';
        const uri = promptCommand.uri;
        const typeLabel = promptCommand.type === PromptsType.skill ? 'skill' : 'prompt file';
        const expanded = `Use the ${typeLabel} located at [${promptCommand.name}](${uri.toString()}).`;
        return args ? `${expanded} ${args}` : expanded;
    }
    _registerSlashCommands() {
        const openSection = (section) => () => this.commandService.executeCommand(AICustomizationManagementCommands.OpenEditor, section);
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
    }
    _registerDecorations() {
        if (!SlashCommandHandler_1._slashDecosRegistered) {
            SlashCommandHandler_1._slashDecosRegistered = true;
            this.codeEditorService.registerDecorationType('sessions-chat', SlashCommandHandler_1._slashDecoType, {
                color: themeColorFromId(chatSlashCommandForeground),
                backgroundColor: themeColorFromId(chatSlashCommandBackground),
                borderRadius: '3px',
            });
            this.codeEditorService.registerDecorationType('sessions-chat', SlashCommandHandler_1._slashPlaceholderDecoType, {});
        }
        this._register(this._editor.onDidChangeModelContent(() => this._updateDecorations()));
        this._updateDecorations();
    }
    _updateDecorations() {
        const model = this._editor.getModel();
        const value = model?.getValue() ?? '';
        const match = value.match(/^\/([\w\p{L}\d_\-\.:]+)\s?/u);
        if (!match) {
            this._editor.setDecorationsByType('sessions-chat', SlashCommandHandler_1._slashDecoType, []);
            this._editor.setDecorationsByType('sessions-chat', SlashCommandHandler_1._slashPlaceholderDecoType, []);
            return;
        }
        const commandName = match[1];
        const slashCommand = this._slashCommands.find(c => c.command === commandName);
        const promptCommand = this._cachedPromptCommands.find(c => c.name === commandName);
        if (!slashCommand && !promptCommand) {
            this._editor.setDecorationsByType('sessions-chat', SlashCommandHandler_1._slashDecoType, []);
            this._editor.setDecorationsByType('sessions-chat', SlashCommandHandler_1._slashPlaceholderDecoType, []);
            return;
        }
        // Highlight the slash command text
        const commandEnd = match[0].trimEnd().length;
        const commandDeco = [{
                range: { startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: commandEnd + 1 },
            }];
        this._editor.setDecorationsByType('sessions-chat', SlashCommandHandler_1._slashDecoType, commandDeco);
        // Show the command description as a placeholder after the command
        const restOfInput = value.slice(match[0].length).trim();
        const detail = slashCommand?.detail ?? promptCommand?.description;
        if (!restOfInput && detail) {
            const placeholderCol = match[0].length + 1;
            const placeholderDeco = [{
                    range: { startLineNumber: 1, startColumn: placeholderCol, endLineNumber: 1, endColumn: model.getLineMaxColumn(1) },
                    renderOptions: {
                        after: {
                            contentText: detail,
                            color: this._getPlaceholderColor(),
                        }
                    }
                }];
            this._editor.setDecorationsByType('sessions-chat', SlashCommandHandler_1._slashPlaceholderDecoType, placeholderDeco);
        }
        else {
            this._editor.setDecorationsByType('sessions-chat', SlashCommandHandler_1._slashPlaceholderDecoType, []);
        }
    }
    _getPlaceholderColor() {
        const theme = this.themeService.getColorTheme();
        return theme.getColor(inputPlaceholderForeground)?.toString();
    }
    _registerCompletions() {
        const uri = this._editor.getModel()?.uri;
        if (!uri) {
            return;
        }
        this._register(this.languageFeaturesService.completionProvider.register({ scheme: uri.scheme, hasAccessToAllModels: true }, {
            _debugDisplayName: 'sessionsSlashCommands',
            triggerCharacters: ['/'],
            provideCompletionItems: (model, position, _context, _token) => {
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
                    suggestions: this._slashCommands.map((c, i) => {
                        const withSlash = `/${c.command}`;
                        return {
                            label: withSlash,
                            insertText: c.executeImmediately ? '' : `${withSlash} `,
                            detail: c.detail,
                            range,
                            sortText: c.sortText ?? 'a'.repeat(i + 1),
                            kind: 18 /* CompletionItemKind.Text */,
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
            provideCompletionItems: async (model, position, _context, token) => {
                const range = this._computeCompletionRanges(model, position, /\/[\p{L}0-9_.:-]*/gu);
                if (!range) {
                    return null;
                }
                const textBefore = model.getValueInRange(new Range(1, 1, range.replace.startLineNumber, range.replace.startColumn));
                if (textBefore.trim() !== '') {
                    return null;
                }
                const promptCommands = await this.aiCustomizationWorkspaceService.getFilteredPromptSlashCommands(token);
                const userInvocable = promptCommands.filter(c => c.userInvocable);
                if (userInvocable.length === 0) {
                    return null;
                }
                return {
                    suggestions: userInvocable.map((c, i) => {
                        const label = `/${c.name}`;
                        return {
                            label: { label, description: c.description },
                            insertText: `${label} `,
                            documentation: c.description,
                            range,
                            sortText: 'b'.repeat(i + 1),
                            kind: 18 /* CompletionItemKind.Text */,
                        };
                    })
                };
            }
        }));
    }
    _computeCompletionRanges(model, position, reg) {
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
        let insert;
        let replace;
        if (!varWord) {
            insert = replace = Range.fromPositions(position);
        }
        else {
            insert = new Range(position.lineNumber, varWord.startColumn, position.lineNumber, position.column);
            replace = new Range(position.lineNumber, varWord.startColumn, position.lineNumber, varWord.endColumn);
        }
        return { insert, replace };
    }
};
SlashCommandHandler = SlashCommandHandler_1 = __decorate([
    __param(1, ICommandService),
    __param(2, ICodeEditorService),
    __param(3, ILanguageFeaturesService),
    __param(4, IThemeService),
    __param(5, IAICustomizationWorkspaceService),
    __param(6, IPromptsService)
], SlashCommandHandler);
export { SlashCommandHandler };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2xhc2hDb21tYW5kcy5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3Nlc3Npb25zL2NvbnRyaWIvY2hhdC9icm93c2VyL3NsYXNoQ29tbWFuZHMudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7O0FBRWhHLE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxNQUFNLHlDQUF5QyxDQUFDO0FBQzVFLE9BQU8sRUFBRSxVQUFVLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUNsRSxPQUFPLEVBQUUsZ0JBQWdCLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUV4RSxPQUFPLEVBQUUsa0JBQWtCLEVBQUUsTUFBTSwwREFBMEQsQ0FBQztBQUs5RixPQUFPLEVBQUUsS0FBSyxFQUFFLE1BQU0seUNBQXlDLENBQUM7QUFDaEUsT0FBTyxFQUFFLGFBQWEsRUFBRSxNQUFNLDhDQUE4QyxDQUFDO0FBQzdFLE9BQU8sRUFBRSx3QkFBd0IsRUFBRSxNQUFNLHdEQUF3RCxDQUFDO0FBQ2xHLE9BQU8sRUFBRSxnQkFBZ0IsRUFBRSxlQUFlLEVBQUUsTUFBTSxrREFBa0QsQ0FBQztBQUNyRyxPQUFPLEVBQUUsYUFBYSxFQUFFLE1BQU0sbURBQW1ELENBQUM7QUFDbEYsT0FBTyxFQUFFLDBCQUEwQixFQUFFLE1BQU0sb0RBQW9ELENBQUM7QUFDaEcsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLG9CQUFvQixDQUFDO0FBQzlDLE9BQU8sRUFBRSwwQkFBMEIsRUFBRSwwQkFBMEIsRUFBRSxNQUFNLGdFQUFnRSxDQUFDO0FBQ3hJLE9BQU8sRUFBRSxpQ0FBaUMsRUFBRSxnQ0FBZ0MsRUFBRSxNQUFNLHlGQUF5RixDQUFDO0FBQzlLLE9BQU8sRUFBRSxnQ0FBZ0MsRUFBRSxNQUFNLDhFQUE4RSxDQUFDO0FBQ2hJLE9BQU8sRUFBMkIsZUFBZSxFQUFFLE1BQU0sa0ZBQWtGLENB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