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
import { PromptHeaderAttributes } from '../../common/promptSyntax/promptFileParser.js';
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

		const promptAST = this._promptsService.getParsedPromptFile(model);
		if (!promptAST.header) {
			return undefined;
		}

		const toolsAttr = promptAST.header.getAttribute(PromptHeaderAttributes.tools);
		if (!toolsAttr) {
			return undefined;
		}

		editor.setSelection(toolsAttr.range);
		if (newTools === undefined) {
			this.rewriteAttribute(model, '', toolsAttr.range);
			return;
		} else {
			this.rewriteTools(model, newTools, toolsAttr.value.range);
		}
	}

	public rewriteTools(model: ITextModel, newTools: IToolAndToolSetEnablementMap, range: Range): void {
		const newToolNames = this._languageModelToolsService.toQualifiedToolNames(newTools);
		const newValue = `[${newToolNames.map(s => `'${s}'`).join(', ')}]`;
		this.rewriteAttribute(model, newValue, range);
	}

	private rewriteAttribute(model: ITextModel, newValue: string, range: Range): void {
		model.pushStackElement();
		model.pushEditOperations(null, [EditOperation.replaceMove(range, newValue)], () => null);
		model.pushStackElement();
	}

	public async openAndRewriteName(uri: URI, newName: string, token: CancellationToken): Promise<void> {
		const editor = await this._codeEditorService.openCodeEditor({ resource: uri }, this._codeEditorService.getFocusedCodeEditor());
		if (!editor || !editor.hasModel()) {
			return;
		}
		const model = editor.getModel();

		const promptAST = this._promptsService.getParsedPromptFile(model);
		if (!promptAST.header) {
			return;
		}

		const nameAttr = promptAST.header.getAttribute(PromptHeaderAttributes.name);
		if (!nameAttr) {
			return;
		}
		if (nameAttr.value.type === 'string' && nameAttr.value.value === newName) {
			return;
		}

		editor.setSelection(nameAttr.range);
		this.rewriteAttribute(model, newName, nameAttr.value.range);
	}
}


