/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { PromptElement } from '@vscode/prompt-tsx';
import { extractCodeBlocks } from '../../../../util/common/markdown';
import { splitLines } from '../../../../util/vs/base/common/strings';
import { TextEdit } from '../../../../vscodeTypes';
import { OutcomeAnnotation } from '../../../inlineChat/node/promptCraftingTypes';
import { createEditsFromPseudoDiff } from '../../../prompt/node/editFromDiffGeneration';
import { LineRange, Lines, LinesEdit } from '../../../prompt/node/editGeneration';

export class EditGenerationRules extends PromptElement {
	render() {
		return (
			<>
				For the response always follow these instructions:<br />
				Describe in a single sentence how you would solve the problem. After that sentence, add an empty line. Then add a code block with the fix.<br />
				When proposing a change in the code, use a single code block that starts with ```diff and that describes the changes in the diff format. In the diff, always use tab to indent, never spaces. Make sure that the diff format is valid and contains all changes: Removed and unchanged lines must match exactly the original code line. Keep the changes minimal and the diff short.<br />
				When proposing to fix the problem by running a terminal command, provide the terminal script in a code block that starts with ```bash.<br />
			</>
		);
	}
}

export class EditGenerationExampleSetup extends PromptElement {
	render() {
		return (
			<>
				```csharp<br />
				// This is my class<br />
				class C &#123; &#125;<br />
				<br />
				new C().Field = 9;<br />
				```
			</>
		);
	}
}

export class EditGenerationExampleSolution extends PromptElement {
	render() {
		return (
			<>
				The problem is that the class 'C' does not have a field or property named 'Field'. To fix this, you need to add a 'Field' property to the 'C' class.<br />
				<br />
				```diff<br />
				// This is my class<br />
				-class C &#123; &#125;<br />
				+class C &#123;<br />
				+   public int Field &#123; get; set; &#125;<br />
				+&#125;<br />
				<br />
				new C().Field = 9;<br />
				```<br />
			</>
		);
	}
}

export interface ReplyProcessor {
	getFirstSentence(text: string): string;
	process(replyText: string, documentText: string, lineRange: LineRange): ReplyProcessorResult;
}

export type ReplyProcessorResult = { edits?: TextEdit[]; content?: string; annotations: OutcomeAnnotation[] };

export function getReplyProcessor(): ReplyProcessor {
	return {
		getFirstSentence(text: string): string {
			return text.split('```', 1)[0].match(/^.+/)?.[0] ?? '';
		},
		process(replyText: string, documentText: string, lineRange: LineRange): ReplyProcessorResult {
			const annotations: OutcomeAnnotation[] = [];
			const extractResult = extractAndParseFirstCodeBlock(replyText);
			if (!extractResult || extractResult.language === 'bash' || extractResult.language === 'ps1') {
				return { content: replyText, annotations };
			}
			let lineEdits: LinesEdit[] = [];
			if (extractResult.language === 'diff') {
				const diff = Lines.fromString(extractResult.code);
				const code = Lines.fromString(documentText);
				const reporter = {
					recovery: () => { },
					warning(message: string) {
						if (annotations.length === 0) {
							annotations.push({ message: message, label: 'invalid diff', severity: 'error' });
						}
					}
				};
				lineEdits = createEditsFromPseudoDiff(code, diff, reporter);
			} else {
				lineEdits = [new LinesEdit(lineRange.firstLineIndex, lineRange.endLineIndex, Lines.fromString(extractResult.code))];
			}
			const edits = lineEdits.map(e => e.toTextEdit());
			return { edits, annotations };
		}

	};
}

function extractAndParseFirstCodeBlock(text: string): { code: string; contentBeforeCode: string; language: string } | undefined {
	const blocks = extractCodeBlocks(text);
	const firstBlock = blocks.at(0);
	if (firstBlock) {
		const lines = splitLines(text);
		return { code: firstBlock.code, contentBeforeCode: lines.slice(0, firstBlock.startLine).join('\n').trimEnd(), language: firstBlock.language };
	}
	return undefined;
}
