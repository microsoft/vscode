/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import * as Proto from '../protocol';

export function snippetForFunctionCall(
	item: { insertText?: string | vscode.SnippetString; label: string; },
	displayParts: ReadonlyArray<Proto.SymbolDisplayPart>
): vscode.SnippetString {
	if (item.insertText && typeof item.insertText !== 'string') {
		return item.insertText;
	}
	const snippet = new vscode.SnippetString(`${item.insertText || item.label}(`);
	const parameterListParts = getParameterListParts(displayParts, item.label);
	appendJoinedPlaceholders(snippet, parameterListParts.parts, ', ');
	if (parameterListParts.hasOptionalParameters) {
		snippet.appendTabstop();
	}
	snippet.appendText(')');
	snippet.appendTabstop(0);
	return snippet;
}

function appendJoinedPlaceholders(snippet: vscode.SnippetString, parts: ReadonlyArray<ParamterPart>, joiner: string) {
	for (let i = 0; i < parts.length; ++i) {
		const paramterPart = parts[i];
		snippet.appendPlaceholder(paramterPart.text);
		if (i !== parts.length - 1) {
			snippet.appendText(joiner);
		}
	}
}

interface ParamterPart {
	readonly text: string;
	readonly optional?: boolean;
}

function getParameterListParts(displayParts: ReadonlyArray<Proto.SymbolDisplayPart>, label: string): {
	parts: ReadonlyArray<ParamterPart>;
	hasOptionalParameters: boolean;
} {
	let parts: ParamterPart[] = [];
	let isInMethod = false;
	let hasOptionalParameters = false;
	let parenCount = 0;
	let i = 0;
	for (; i < displayParts.length; ++i) {
		const part = displayParts[i];
		if ((part.kind === 'methodName' || part.kind === 'functionName' || part.kind === 'text') && part.text === label) {
			if (parenCount === 0) {
				isInMethod = true;
			}
		}
		if (part.kind === 'parameterName' && parenCount === 1 && isInMethod) {
			// Only take top level paren names
			const next = displayParts[i + 1];
			// Skip optional parameters
			const nameIsFollowedByOptionalIndicator = next && next.text === '?';
			if (!nameIsFollowedByOptionalIndicator) {
				parts.push(part);
			}
			hasOptionalParameters = hasOptionalParameters || nameIsFollowedByOptionalIndicator;
		}
		else if (part.kind === 'punctuation') {
			if (part.text === '(') {
				++parenCount;
			} else if (part.text === ')') {
				--parenCount;
				if (parenCount <= 0 && isInMethod) {
					break;
				}
			} else if (part.text === '...' && parenCount === 1) {
				// Found rest parmeter. Do not fill in any further arguments
				hasOptionalParameters = true;
				break;
			}
		}
	}
	return { hasOptionalParameters, parts };
}
