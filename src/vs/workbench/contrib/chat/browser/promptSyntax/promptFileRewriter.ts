/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { URI } from '../../../../../base/common/uri.js';
import { ICodeEditorService } from '../../../../../editor/browser/services/codeEditorService.js';
import { EditOperation } from '../../../../../editor/common/core/editOperation.js';
import { Range } from '../../../../../editor/common/core/range.js';
import { ITextModel } from '../../../../../editor/common/model.js';
import { ILanguageModelToolsService, IToolAndToolSetEnablementMap } from '../../common/languageModelToolsService.js';
import { IPromptsService } from '../../common/promptSyntax/service/promptsService.js';

export class PromptFileRewriter {
	constructor(
		@ICodeEditorService private readonly _codeEditorService: ICodeEditorService,
		@IPromptsService private readonly _promptsService: IPromptsService,
		@ILanguageModelToolsService private readonly _languageModelToolsService: ILanguageModelToolsService
	) {
	}

	public async openAndRewriteTools(uri: URI, newTools: IToolAndToolSetEnablementMap | undefined, token: CancellationToken): Promise<void> {
		const editor = await this._codeEditorService.openCodeEditor({ resource: uri }, this._codeEditorService.getFocusedCodeEditor());
		if (!editor || !editor.hasModel()) {
			return;
		}
		const model = editor.getModel();

		const parser = this._promptsService.getParsedPromptFile(model);
		if (!parser.header) {
			return undefined;
		}

		const toolsAttr = parser.header.getAttribute('tools');
		if (!toolsAttr) {
			return undefined;
		}

		editor.setSelection(toolsAttr.range);
		this.rewriteTools(model, newTools, toolsAttr.range);
	}

	public rewriteTools(model: ITextModel, newTools: IToolAndToolSetEnablementMap | undefined, range: Range): void {
		const newString = newTools === undefined ? '' : `tools: ${this.getNewValueString(newTools)}`;
		model.pushStackElement();
		model.pushEditOperations(null, [EditOperation.replaceMove(range, newString)], () => null);
		model.pushStackElement();
	}

	public getNewValueString(tools: IToolAndToolSetEnablementMap): string {
		const newToolNames = this._languageModelToolsService.toQualifiedToolNames(tools);
		return `[${newToolNames.map(s => `'${s}'`).join(', ')}]`;
	}
}


