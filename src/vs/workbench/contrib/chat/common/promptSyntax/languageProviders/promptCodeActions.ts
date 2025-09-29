/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../../../base/common/cancellation.js';
import { Range } from '../../../../../../editor/common/core/range.js';
import { CodeAction, CodeActionContext, CodeActionList, CodeActionProvider, IWorkspaceTextEdit, ProviderResult, TextEdit } from '../../../../../../editor/common/languages.js';
import { ITextModel } from '../../../../../../editor/common/model.js';
import { localize } from '../../../../../../nls.js';
import { ILanguageModelToolsService } from '../../languageModelToolsService.js';
import { getPromptsTypeForLanguageId } from '../promptTypes.js';
import { IPromptsService } from '../service/promptsService.js';
import { IValue } from '../service/newPromptsParser.js';
import { Selection } from '../../../../../../editor/common/core/selection.js';
import { Lazy } from '../../../../../../base/common/lazy.js';

export class PromptCodeActionProvider implements CodeActionProvider {
	/**
	 * Debug display name for this provider.
	 */
	public readonly _debugDisplayName: string = 'PromptCodeActionProvider';

	constructor(
		@IPromptsService private readonly promptsService: IPromptsService,
		@ILanguageModelToolsService private readonly languageModelToolsService: ILanguageModelToolsService
	) {
	}

	provideCodeActions(model: ITextModel, range: Range | Selection, context: CodeActionContext, token: CancellationToken): ProviderResult<CodeActionList> {
		const promptType = getPromptsTypeForLanguageId(model.getLanguageId());
		if (!promptType) {
			// if the model is not a prompt, we don't provide any code actions
			return undefined;
		}

		const parser = this.promptsService.getParsedPromptFile(model);
		const toolsAttr = parser.header?.getAttribute('tools');
		if (!toolsAttr || toolsAttr.value.type !== 'array' || !toolsAttr.value.range.containsRange(range)) {
			return undefined;
		}
		return this.getUpdateToolsCodeActions(toolsAttr.value.items, model, range);

	}

	private getUpdateToolsCodeActions(values: readonly IValue[], model: ITextModel, range: Range): CodeActionList | undefined {

		const deprecatedNames = new Lazy(() => this.languageModelToolsService.getDeprecatedQualifiedToolNames());
		const actions: CodeAction[] = [];
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
					actions.push({
						title: localize('updateToolName', "Update to '{0}'", newName),
						edit: {
							edits: [asWorkspaceTextEdit(model, edit)]
						}
					});
				}
			}
		}

		if (edits.length && actions.length === 0 || edits.length > 1) {
			actions.push({
				title: localize('updateAllToolNames', "Update all tool names"),
				edit: {
					edits: edits.map(edit => asWorkspaceTextEdit(model, edit))
				}
			});
		}
		if (actions.length) {
			return { actions, dispose: () => { } };
		}
		return undefined;
	}
}
function asWorkspaceTextEdit(model: ITextModel, textEdit: TextEdit): IWorkspaceTextEdit {
	return {
		versionId: model.getVersionId(),
		resource: model.uri,
		textEdit
	};
}
