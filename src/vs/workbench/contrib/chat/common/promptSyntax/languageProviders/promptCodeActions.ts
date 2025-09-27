/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../../../base/common/cancellation.js';
import { Disposable } from '../../../../../../base/common/lifecycle.js';
import { Range } from '../../../../../../editor/common/core/range.js';
import { CodeActionContext, CodeActionList, CodeActionProvider, ProviderResult, TextEdit, WorkspaceEdit } from '../../../../../../editor/common/languages.js';
import { ITextModel } from '../../../../../../editor/common/model.js';
import { ILanguageFeaturesService } from '../../../../../../editor/common/services/languageFeatures.js';
import { localize } from '../../../../../../nls.js';
import { ILanguageModelToolsService } from '../../languageModelToolsService.js';
import { ALL_PROMPTS_LANGUAGE_SELECTOR, getPromptsTypeForLanguageId } from '../promptTypes.js';
import { IPromptsService } from '../service/promptsService.js';
import { IValue } from '../service/newPromptsParser.js';
import { Selection } from '../../../../../../editor/common/core/selection.js';

export class PromptCodeActionProvider extends Disposable implements CodeActionProvider {
	/**
	 * Debug display name for this provider.
	 */
	public readonly _debugDisplayName: string = 'PromptHoverProvider';

	constructor(
		@IPromptsService private readonly promptsService: IPromptsService,
		@ILanguageFeaturesService private readonly languageService: ILanguageFeaturesService,
		@ILanguageModelToolsService private readonly languageModelToolsService: ILanguageModelToolsService
	) {
		super();

		this._register(this.languageService.codeActionProvider.register(ALL_PROMPTS_LANGUAGE_SELECTOR, this));
	}

	provideCodeActions(model: ITextModel, range: Range | Selection, context: CodeActionContext, token: CancellationToken): ProviderResult<CodeActionList> {
		const promptType = getPromptsTypeForLanguageId(model.getLanguageId());
		if (!promptType) {
			// if the model is not a prompt, we don't provide any hovers
			return undefined;
		}

		const parser = this.promptsService.getParsedPromptFile(model);
		const toolsAttr = parser.header?.getAttribute('tools');
		if (!toolsAttr || toolsAttr.value.type !== 'array' || !toolsAttr.value.range.containsRange(range)) {
			return undefined;
		}
		for (const item of toolsAttr.value.items) {
			if (item.range.containsRange(range)) {
				return this.getToolCodeActions(item, model);
			}
		}
		return undefined;
	}

	private getToolCodeActions(value: IValue, model: ITextModel): CodeActionList | undefined {
		if (value.type !== 'string') {
			return undefined;
		}
		const oldName = value.value;
		const deprecatedNames = this.languageModelToolsService.getDeprecatedQualifiedToolNames();
		const newName = deprecatedNames.get(oldName);
		if (newName) {
			const quote = model.getValueInRange(new Range(value.range.startLineNumber, value.range.startColumn, value.range.endLineNumber, value.range.startColumn + 1));
			const text = (quote === `'` || quote === '"') ? (quote + newName + quote) : newName;
			return {
				actions: [{
					title: localize('replaceWith', "Replace with '{0}'", newName),
					edit: asWorkspaceEdit(model, { range: value.range, text: text })
				}],
				dispose() { }
			};
		}
		return undefined;
	}

}
function asWorkspaceEdit(model: ITextModel, textEdit: TextEdit): WorkspaceEdit {
	return {
		edits: [{
			versionId: model.getVersionId(),
			resource: model.uri,
			textEdit
		}]
	};
}
