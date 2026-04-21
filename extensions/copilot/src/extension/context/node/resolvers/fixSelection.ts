/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type * as vscode from 'vscode';
import { ILanguageDiagnosticsService } from '../../../../platform/languages/common/languageDiagnosticsService';
import { IChatEndpoint } from '../../../../platform/networking/common/networking';
import { TreeSitterAST, treeSitterToVSCodeRange, vscodeToTreeSitterRange } from '../../../../platform/parser/node/parserService';
import { ILanguage } from '../../../../util/common/languages';
import { Range } from '../../../../vscodeTypes';
import { CodeContextRegion, CodeContextTracker } from '../../../inlineChat/node/codeContextRegion';
import { IDocumentContext } from '../../../prompt/node/documentContext';
import { processCodeAroundSelection } from './inlineChatSelection';

interface IFixCodeContextInfo {
	language: ILanguage;
	above: CodeContextRegion;
	range: CodeContextRegion;
	below: CodeContextRegion;
}


export function generateFixContext(
	endpoint: IChatEndpoint,
	documentContext: IDocumentContext,
	range: Range,
	rangeOfInterest: Range
): { contextInfo: IFixCodeContextInfo; tracker: CodeContextTracker } {

	// Number of tokens the endpoint can handle, 4 chars per token, we consume one 3rd
	const charLimit = (endpoint.modelMaxPromptTokens * 4) / 3;
	const tracker = new CodeContextTracker(charLimit);
	const document = documentContext.document;
	const language = documentContext.language;

	const rangeInfo = new CodeContextRegion(tracker, document, language);
	const aboveInfo = new CodeContextRegion(tracker, document, language);
	const belowInfo = new CodeContextRegion(tracker, document, language);

	const finish = () => {
		aboveInfo.trim();
		rangeInfo.trim();
		belowInfo.trim();
		return { contextInfo: { language, above: aboveInfo, range: rangeInfo, below: belowInfo }, tracker };
	};

	const continueExecution = processFixSelection(rangeInfo, range, rangeOfInterest);

	if (!continueExecution) {
		return finish();
	}

	const constraints = {
		aboveLineIndex: rangeOfInterest.start.line - 1,
		belowLineIndex: rangeOfInterest.end.line + 1,
		minimumLineIndex: 0,
		maximumLineIndex: document.lineCount - 1
	};

	processCodeAroundSelection(constraints, aboveInfo, belowInfo);

	return finish();
}

/**
 * Returns the range of the selection to use in the user context when running /fix
 * @param range the code context region to process, where to store the selection information
 * @param diagnosticsRange the range spanning the diagnostics
 * @diagnosticsRangeOfInterest range around this spanning range which is permitted for editing
 * @returns a boolean indicating whether to continue code execution
 */
function processFixSelection(range: CodeContextRegion, diagnosticsRange: Range, diagnosticsRangeOfInterest: Range): boolean {
	const diagnosticsRangeMidLine = Math.floor((diagnosticsRange.start.line + diagnosticsRange.end.line) / 2);
	const maximumRadius = Math.max(diagnosticsRangeMidLine - diagnosticsRangeOfInterest.start.line, diagnosticsRangeOfInterest.end.line - diagnosticsRangeMidLine);

	range.appendLine(diagnosticsRangeMidLine);
	for (let radius = 1; radius <= maximumRadius; radius++) {
		const beforeMidLine = diagnosticsRangeMidLine - radius;
		const afterMidLine = diagnosticsRangeMidLine + radius;
		if (beforeMidLine >= diagnosticsRangeOfInterest.start.line) {
			if (!range.prependLine(beforeMidLine)) {
				return false;
			}
		}
		if (afterMidLine <= diagnosticsRangeOfInterest.end.line) {
			if (!range.appendLine(afterMidLine)) {
				return false;
			}
		}
	}
	return true;
}


/**
 * This function finds the diagnostics at the given selection and filtered by the actual prompt
 */
export function findDiagnosticForSelectionAndPrompt(diagnosticService: ILanguageDiagnosticsService, resource: vscode.Uri, selection: vscode.Selection | vscode.Range, prompt: string | undefined): vscode.Diagnostic[] {
	const diagnostics = diagnosticService.getDiagnostics(resource).filter(d => !!d.range.intersection(selection));
	if (prompt) {
		const diagnosticsForPrompt = diagnostics.filter(d => prompt.includes(d.message));
		if (diagnosticsForPrompt.length > 0) {
			return diagnosticsForPrompt;
		}
	}
	return diagnostics;
}

/**
 * This function finds the range of interest for the input range for the /fix command
 * @param maximumNumberOfLines the maximum number of lines in the range of interest
 */
export async function findFixRangeOfInterest(treeSitterAST: TreeSitterAST, range: Range, maximumNumberOfLines: number): Promise<Range> {
	const treeSitterRange = vscodeToTreeSitterRange(range);
	const maxNumberOfAdditionalLinesInRangeOfInterest = Math.max(maximumNumberOfLines, range.end.line - range.start.line + maximumNumberOfLines);
	const treeSitterRangeOfInterest = await treeSitterAST.getFixSelectionOfInterest(treeSitterRange, maxNumberOfAdditionalLinesInRangeOfInterest);
	return treeSitterToVSCodeRange(treeSitterRangeOfInterest);
}
