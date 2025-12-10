/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { Node, Macro, Environment, InlineMath, DisplayMath, Group, Verb } from '@unified-latex/unified-latex-types';

/**
 * Convert argument content to string
 * Ported from latex-workshop parser utils
 */
export function argContentToStr(argContent: Node[], preserveCurlyBrace = false): string {
	return argContent.map(node => {
		switch (node.type) {
			case 'string':
				return node.content;
			case 'whitespace':
			case 'parbreak':
			case 'comment':
				return ' ';
			case 'macro':
				return macroToStr(node as Macro);
			case 'environment':
			case 'verbatim':
			case 'mathenv':
				return envToStr(node as Environment);
			case 'inlinemath':
				return `$${argContentToStr((node as InlineMath).content)}$`;
			case 'displaymath':
				return `\\[${argContentToStr((node as DisplayMath).content)}\\]`;
			case 'group':
				return preserveCurlyBrace
					? `{${argContentToStr((node as Group).content)}}`
					: argContentToStr((node as Group).content);
			case 'verb':
				return (node as Verb).content;
			default:
				return '';
		}
	}).join('');
}

function macroToStr(macro: Macro): string {
	if (macro.content === 'texorpdfstring') {
		const args = macro.args || [];
		const arg1 = args[1];
		if (arg1 && 'content' in arg1 && Array.isArray(arg1.content) && arg1.content[0] && 'content' in arg1.content[0]) {
			return (arg1.content[0] as any).content || '';
		}
		return '';
	}
	const argsStr = macro.args?.map((arg: { openMark: string; content: Node[]; closeMark: string }) =>
		`${arg.openMark}${argContentToStr(arg.content)}${arg.closeMark}`
	).join('') ?? '';
	return `\\${macro.content}${argsStr}`;
}

function envToStr(env: Environment): string {
	return `\\begin{${env.env}}`;
}

