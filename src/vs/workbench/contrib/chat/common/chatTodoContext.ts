/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../../base/common/uri.js';
import { ITextModel } from '../../../../editor/common/model.js';
import { ITextModelService } from '../../../../editor/common/services/resolverService.js';
import { ITodoItem } from '../../../services/todoDetection/common/todoDetectionService.js';

/**
 * Generate a context-rich prompt for delegating a TODO comment to an agent
 */
export async function generateTodoPrompt(
	uri: URI,
	todo: ITodoItem,
	textModelService: ITextModelService
): Promise<string> {
	const reference = await textModelService.createModelReference(uri);
	try {
		const model = reference.object.textEditorModel;
		if (!model) {
			return generateBasicTodoPrompt(uri, todo);
		}

		return generateDetailedTodoPrompt(uri, todo, model);
	} finally {
		reference.dispose();
	}
}

function generateBasicTodoPrompt(uri: URI, todo: ITodoItem): string {
	const fileName = uri.path.split('/').pop() || uri.toString();
	return `Please help with this TODO comment from ${fileName} (line ${todo.lineNumber}):\n\n${todo.text}`;
}

function generateDetailedTodoPrompt(uri: URI, todo: ITodoItem, model: ITextModel): string {
	const fileName = uri.path.split('/').pop() || uri.toString();
	const lineNumber = todo.lineNumber;

	// Get surrounding context (5 lines before and after)
	const contextBefore = Math.max(1, lineNumber - 5);
	const contextAfter = Math.min(model.getLineCount(), lineNumber + 5);

	const contextLines: string[] = [];
	for (let i = contextBefore; i <= contextAfter; i++) {
		const lineContent = model.getLineContent(i);
		const marker = i === lineNumber ? '→ ' : '  ';
		contextLines.push(`${marker}${i}: ${lineContent}`);
	}

	const context = contextLines.join('\n');

	return `Please help with this TODO comment from ${fileName} (line ${lineNumber}):

TODO: ${todo.text}

File: ${uri.fsPath || uri.toString()}

Context:
\`\`\`
${context}
\`\`\`

Please provide a solution or guidance for addressing this TODO.`;
}
