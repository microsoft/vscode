/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../../../base/common/cancellation.js';
import { Range } from '../../../../../../editor/common/core/range.js';
import { CodeAction, CodeActionContext, CodeActionList, CodeActionProvider, IWorkspaceFileEdit, IWorkspaceTextEdit, TextEdit } from '../../../../../../editor/common/languages.js';
import { ITextModel } from '../../../../../../editor/common/model.js';
import { localize } from '../../../../../../nls.js';
import { ILanguageModelToolsService } from '../../tools/languageModelToolsService.js';
import { getPromptsTypeForLanguageId, PromptsType } from '../promptTypes.js';
import { IPromptsService } from '../service/promptsService.js';
import { ParsedPromptFile, PromptHeaderAttributes } from '../promptFileParser.js';
import { Selection } from '../../../../../../editor/common/core/selection.js';
import { Lazy } from '../../../../../../base/common/lazy.js';
import { LEGACY_MODE_FILE_EXTENSION } from '../config/promptFileLocations.js';
import { IFileService } from '../../../../../../platform/files/common/files.js';
import { isGithubTarget, MARKERS_OWNER_ID } from './promptValidator.js';
import { IMarkerData, IMarkerService } from '../../../../../../platform/markers/common/markers.js';
import { CodeActionKind } from '../../../../../../editor/contrib/codeAction/common/types.js';

export class PromptCodeActionProvider implements CodeActionProvider {
	/**
	 * Debug display name for this provider.
	 */
	public readonly _debugDisplayName: string = 'PromptCodeActionProvider';

	constructor(
		@IPromptsService private readonly promptsService: IPromptsService,
		@ILanguageModelToolsService private readonly languageModelToolsService: ILanguageModelToolsService,
		@IFileService private readonly fileService: IFileService,
		@IMarkerService private readonly markerService: IMarkerService,
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
				await this.getMigrateModeFileCodeActions(model, result);
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

	private getMarkers(model: ITextModel, range: Range): IMarkerData[] {
		const markers = this.markerService.read({ resource: model.uri, owner: MARKERS_OWNER_ID });
		return markers.filter(marker => range.containsRange(marker));
	}

	private createCodeAction(model: ITextModel, range: Range, title: string, edits: Array<IWorkspaceTextEdit | IWorkspaceFileEdit>): CodeAction {
		return {
			title,
			edit: { edits },
			ranges: [range],
			diagnostics: this.getMarkers(model, range),
			kind: CodeActionKind.QuickFix.value
		};
	}

	private getUpdateModeCodeActions(promptFile: ParsedPromptFile, model: ITextModel, range: Range, result: CodeAction[]): void {
		const modeAttr = promptFile.header?.getAttribute(PromptHeaderAttributes.mode);
		if (!modeAttr?.range.containsRange(range)) {
			return;
		}
		const keyRange = new Range(modeAttr.range.startLineNumber, modeAttr.range.startColumn, modeAttr.range.startLineNumber, modeAttr.range.startColumn + modeAttr.key.length);
		result.push(this.createCodeAction(model, keyRange,
			localize('renameToAgent', "Rename to 'agent'"),
			[asWorkspaceTextEdit(model, { range: keyRange, text: 'agent' })]
		));
	}

	private async getMigrateModeFileCodeActions(model: ITextModel, result: CodeAction[]): Promise<void> {
		if (model.uri.path.endsWith(LEGACY_MODE_FILE_EXTENSION)) {
			const location = this.promptsService.getAgentFileURIFromModeFile(model.uri);
			if (location && await this.fileService.canMove(model.uri, location)) {
				const edit: IWorkspaceFileEdit = { oldResource: model.uri, newResource: location, options: { overwrite: false, copy: false } };
				result.push(this.createCodeAction(model, new Range(1, 1, 1, 4),
					localize('migrateToAgent', "Migrate to custom agent file"),
					[edit]
				));
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
		const deprecatedNames = new Lazy(() => this.languageModelToolsService.getDeprecatedFullReferenceNames());
		const edits: TextEdit[] = [];
		for (const item of values) {
			if (item.type !== 'string') {
				continue;
			}
			const newNames = deprecatedNames.value.get(item.value);
			if (newNames && newNames.size > 0) {
				const quote = model.getValueInRange(new Range(item.range.startLineNumber, item.range.startColumn, item.range.endLineNumber, item.range.startColumn + 1));

				if (newNames.size === 1) {
					const newName = Array.from(newNames)[0];
					const text = (quote === `'` || quote === '"') ? (quote + newName + quote) : newName;
					const edit = { range: item.range, text };
					edits.push(edit);

					if (item.range.containsRange(range)) {
						result.push(this.createCodeAction(model, item.range,
							localize('updateToolName', "Update to '{0}'", newName),
							[asWorkspaceTextEdit(model, edit)]
						));
					}
				} else {
					// Multiple new names - expand to include all of them
					const newNamesArray = Array.from(newNames).sort((a, b) => a.localeCompare(b));
					const separator = model.getValueInRange(new Range(item.range.startLineNumber, item.range.endColumn, item.range.endLineNumber, item.range.endColumn + 2));
					const useCommaSpace = separator.includes(',');
					const delimiterText = useCommaSpace ? ', ' : ',';

					const newNamesText = newNamesArray.map(name =>
						(quote === `'` || quote === '"') ? (quote + name + quote) : name
					).join(delimiterText);

					const edit = { range: item.range, text: newNamesText };
					edits.push(edit);

					if (item.range.containsRange(range)) {
						result.push(this.createCodeAction(model, item.range,
							localize('expandToolNames', "Expand to {0} tools", newNames.size),
							[asWorkspaceTextEdit(model, edit)]
						));
					}
				}
			}
		}

		if (edits.length && result.length === 0 || edits.length > 1) {
			result.push(
				this.createCodeAction(model, toolsAttr.value.range,
					localize('updateAllToolNames', "Update all tool names"),
					edits.map(edit => asWorkspaceTextEdit(model, edit))
				)
			);
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
