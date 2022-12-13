/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ILanguageConfigurationService } from 'vs/editor/common/languages/languageConfigurationRegistry';
import { AstNode, AstNodeKind } from 'vs/editor/common/model/bracketPairsTextModelPart/bracketPairsTree/ast';
import { LanguageAgnosticBracketTokens } from 'vs/editor/common/model/bracketPairsTextModelPart/bracketPairsTree/brackets';
import { Length, lengthAdd, lengthGetColumnCountIfZeroLineCount, lengthZero } from 'vs/editor/common/model/bracketPairsTextModelPart/bracketPairsTree/length';
import { parseDocument } from 'vs/editor/common/model/bracketPairsTextModelPart/bracketPairsTree/parser';
import { DenseKeyProvider } from 'vs/editor/common/model/bracketPairsTextModelPart/bracketPairsTree/smallImmutableSet';
import { ITokenizerSource, TextBufferTokenizer } from 'vs/editor/common/model/bracketPairsTextModelPart/bracketPairsTree/tokenizer';
import { IViewLineTokens } from 'vs/editor/common/tokens/lineTokens';

export function fixBracketsInLine(tokens: IViewLineTokens, languageConfigurationService: ILanguageConfigurationService): string {
	const denseKeyProvider = new DenseKeyProvider<string>();
	const bracketTokens = new LanguageAgnosticBracketTokens(denseKeyProvider, (languageId) =>
		languageConfigurationService.getLanguageConfiguration(languageId)
	);
	const tokenizer = new TextBufferTokenizer(
		new StaticTokenizerSource([tokens]),
		bracketTokens
	);
	const node = parseDocument(tokenizer, [], undefined, true);

	let str = '';
	const line = tokens.getLineContent();

	function processNode(node: AstNode, offset: Length) {
		if (node.kind === AstNodeKind.Pair) {
			processNode(node.openingBracket, offset);
			offset = lengthAdd(offset, node.openingBracket.length);

			if (node.child) {
				processNode(node.child, offset);
				offset = lengthAdd(offset, node.child.length);
			}
			if (node.closingBracket) {
				processNode(node.closingBracket, offset);
				offset = lengthAdd(offset, node.closingBracket.length);
			} else {
				const singleLangBracketTokens = bracketTokens.getSingleLanguageBracketTokens(node.openingBracket.languageId);

				const closingTokenText = singleLangBracketTokens.findClosingTokenText(node.openingBracket.bracketIds);
				str += closingTokenText;
			}
		} else if (node.kind === AstNodeKind.UnexpectedClosingBracket) {
			// remove the bracket
		} else if (node.kind === AstNodeKind.Text || node.kind === AstNodeKind.Bracket) {
			str += line.substring(
				lengthGetColumnCountIfZeroLineCount(offset),
				lengthGetColumnCountIfZeroLineCount(lengthAdd(offset, node.length))
			);
		} else if (node.kind === AstNodeKind.List) {
			for (const child of node.children) {
				processNode(child, offset);
				offset = lengthAdd(offset, child.length);
			}
		}
	}

	processNode(node, lengthZero);

	return str;
}

class StaticTokenizerSource implements ITokenizerSource {
	constructor(private readonly lines: IViewLineTokens[]) { }

	getValue(): string {
		return this.lines.map(l => l.getLineContent()).join('\n');
	}
	getLineCount(): number {
		return this.lines.length;
	}
	getLineLength(lineNumber: number): number {
		return this.lines[lineNumber - 1].getLineContent().length;
	}

	tokenization = {
		getLineTokens: (lineNumber: number): IViewLineTokens => {
			return this.lines[lineNumber - 1];
		}
	};
}
