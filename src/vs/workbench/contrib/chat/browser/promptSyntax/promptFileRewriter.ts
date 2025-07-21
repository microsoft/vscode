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
import { IToolAndToolSetEnablementMap, IToolData, ToolSet } from '../../common/languageModelToolsService.js';
import { IPromptsService } from '../../common/promptSyntax/service/promptsService.js';

export class PromptFileRewriter {
	constructor(
		@ICodeEditorService private readonly _codeEditorService: ICodeEditorService,
		@IPromptsService private readonly _promptsService: IPromptsService
	) {
	}

	public async openAndRewriteTools(uri: URI, newTools: IToolAndToolSetEnablementMap | undefined, token: CancellationToken): Promise<void> {
		const editor = await this._codeEditorService.openCodeEditor({ resource: uri }, this._codeEditorService.getFocusedCodeEditor());
		if (!editor || !editor.hasModel()) {
			return;
		}
		const model = editor.getModel();

		const parser = this._promptsService.getSyntaxParserFor(model);
		await parser.start(token).settled();
		const { header } = parser;
		if (header === undefined) {
			return undefined;
		}

		const completed = await header.settled;
		if (!completed || token.isCancellationRequested) {
			return;
		}

		if (('tools' in header.metadataUtility) === false) {
			return undefined;
		}
		const { tools } = header.metadataUtility;
		if (tools === undefined) {
			return undefined;
		}
		editor.setSelection(tools.range);
		this.rewriteTools(model, newTools, tools.range);
	}


	public rewriteTools(model: ITextModel, newTools: IToolAndToolSetEnablementMap | undefined, range: Range): void {
		const newString = newTools === undefined ? '' : `tools: ${this.getNewValueString(newTools)}`;
		model.pushStackElement();
		model.pushEditOperations(null, [EditOperation.replaceMove(range, newString)], () => null);
		model.pushStackElement();
	}

	public getNewValueString(tools: IToolAndToolSetEnablementMap): string {
		const newToolNames: string[] = [];
		const toolsCoveredBySets = new Set<IToolData>();
		for (const [item, picked] of tools) {
			if (picked && item instanceof ToolSet) {
				for (const tool of item.getTools()) {
					toolsCoveredBySets.add(tool);
				}
			}
		}
		for (const [item, picked] of tools) {
			if (picked) {
				if (item instanceof ToolSet) {
					newToolNames.push(item.referenceName);
				} else if (!toolsCoveredBySets.has(item)) {
					newToolNames.push(item.toolReferenceName ?? item.displayName);
				}
			}
		}
		return `[${newToolNames.map(s => `'${s}'`).join(', ')}]`;
	}
}


