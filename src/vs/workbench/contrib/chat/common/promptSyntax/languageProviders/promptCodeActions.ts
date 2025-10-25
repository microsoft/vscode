/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../../../base/common/cancellation.js';
import { Range } from '../../../../../../editor/common/core/range.js';
import { CodeAction, CodeActionContext, CodeActionList, CodeActionProvider, IWorkspaceFileEdit, IWorkspaceTextEdit, TextEdit } from '../../../../../../editor/common/languages.js';
import { ITextModel } from '../../../../../../editor/common/model.js';
import { localize } from '../../../../../../nls.js';
import { ILanguageModelToolsService } from '../../languageModelToolsService.js';
import { getPromptsTypeForLanguageId, PromptsType } from '../promptTypes.js';
import { IPromptsService } from '../service/promptsService.js';
import { ParsedPromptFile, PromptHeaderAttributes } from '../promptFileParser.js';
import { Selection } from '../../../../../../editor/common/core/selection.js';
import { Lazy } from '../../../../../../base/common/lazy.js';
import { LEGACY_MODE_FILE_EXTENSION } from '../config/promptFileLocations.js';
import { IFileService } from '../../../../../../platform/files/common/files.js';
import { URI } from '../../../../../../base/common/uri.js';
import { isGithubTarget } from './promptValidator.js';

export class PromptCodeActionProvider implements CodeActionProvider {
	/**
	 * Debug display name for this provider.
	 */
	public readonly _debugDisplayName: string = 'PromptCodeActionProvider';

	constructor(
		@IPromptsService private readonly promptsService: IPromptsService,
		@ILanguageModelToolsService private readonly languageModelToolsService: ILanguageModelToolsService,
		@IFileService private readonly fileService: IFileService,
	) {
	}

	async provideCodeActions(model: ITextModel, range: Range | Selection, context: CodeActionContext, token: CancellationToken): Promise<CodeActionList | undefined> {
		const promptType = getPromptsTypeForLanguageId(model.getLanguageId());
		if (!promptType || promptType === PromptsType.instructions) {
			// if the model is not a prompt, we don't provide any code actions
			return undefined;
		}

		const result: CodeAction[] = [];

		const promptAST = this.promptsService.getParsedPromptFile(model);
		switch (promptType) {
			case PromptsType.agent:
				this.getUpdateToolsCodeActions(promptAST, promptType, model, range, result);
				await this.getMigrateModeFileCodeActions(model.uri, result);
				break;
			case PromptsType.prompt:
				this.getUpdateModeCodeActions(promptAST, model, range, result);
				this.getUpdateToolsCodeActions(promptAST, promptType, model, range, result);
				break;
		}

		if (result.length === 0) {
			return undefined;
		}
		return {
			actions: result,
			dispose: () => { }
		};

	}

	private getUpdateModeCodeActions(promptFile: ParsedPromptFile, model: ITextModel, range: Range, result: CodeAction[]): void {
		const modeAttr = promptFile.header?.getAttribute(PromptHeaderAttributes.mode);
		if (!modeAttr?.range.containsRange(range)) {
			return;
		}
		const keyRange = new Range(modeAttr.range.startLineNumber, modeAttr.range.startColumn, modeAttr.range.startLineNumber, modeAttr.range.startColumn + modeAttr.key.length);
		result.push({
			title: localize('renameToAgent', "Rename to 'agent'"),
			edit: {
				edits: [asWorkspaceTextEdit(model, { range: keyRange, text: 'agent' })]
			}
		});
	}

	private async getMigrateModeFileCodeActions(uri: URI, result: CodeAction[]): Promise<void> {
		if (uri.path.endsWith(LEGACY_MODE_FILE_EXTENSION)) {
			const location = this.promptsService.getAgentFileURIFromModeFile(uri);
			if (location && await this.fileService.canMove(uri, location)) {
				const edit: IWorkspaceFileEdit = { oldResource: uri, newResource: location, options: { overwrite: false, copy: false } };
				result.push({
					title: localize('migrateToAgent', "Migrate to custom agent file"),
					edit: {
						edits: [edit]
					}
				});
			}
		}
	}

	private getUpdateToolsCodeActions(promptFile: ParsedPromptFile, promptType: PromptsType, model: ITextModel, range: Range, result: CodeAction[]): void {
		const toolsAttr = promptFile.header?.getAttribute(PromptHeaderAttributes.tools);
		if (toolsAttr?.value.type !== 'array' || !toolsAttr.value.range.containsRange(range)) {
			return;
		}
		if (isGithubTarget(promptType, promptFile.header?.target)) {
			// GitHub Copilot custom agents use a fixed set of tool names that are not deprecated
			return;
		}

		const values = toolsAttr.value.items;
		const deprecatedNames = new Lazy(() => this.languageModelToolsService.getDeprecatedQualifiedToolNames());
		const edits: TextEdit[] = [];
		for (const item of values) {
			if (item.type !== 'string') {
				continue;
			}
			const newName = deprecatedNames.value.get(item.value);
			if (newName) {
				const quote = model.getValueInRange(new Range(item.range.startLineNumber, item.range.startColumn, item.range.endLineNumber, item.range.startColumn + 1));
				const text = (quote === `'` || quote === '"') ? (quote + newName + quote) : newName;
				const edit = { range: item.range, text };
				edits.push(edit);

				if (item.range.containsRange(range)) {
					result.push({
						title: localize('updateToolName', "Update to '{0}'", newName),
						edit: {
							edits: [asWorkspaceTextEdit(model, edit)]
						}
					});
				}
			}
		}

		if (edits.length && result.length === 0 || edits.length > 1) {
			result.push({
				title: localize('updateAllToolNames', "Update all tool names"),
				edit: {
					edits: edits.map(edit => asWorkspaceTextEdit(model, edit))
				}
			});
		}
	}
}
function asWorkspaceTextEdit(model: ITextModel, textEdit: TextEdit): IWorkspaceTextEdit {
	return {
		versionId: model.getVersionId(),
		resource: model.uri,
		textEdit
	};
}
