/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { parseTreeSitter } from '../parse';
import { DocumentInfoWithOffset } from '../prompt';
import { CursorContextInfo, getCursorContext } from './cursorContext';
import { WindowedMatcher } from './selectRelevance';
import { getBasicWindowDelineations } from './windowDelineations';
import Parser from 'web-tree-sitter';

/**
 * Implements an evolution of the FixedWindowSizeJaccardMatcher that is different in two ways.
 * 1. The source tokens window is the enclosing class member, as determined by Tree-Sitter.
 * 2. The scoring algorithm is a unidirectional set membership check (count of items from A that exist in B)
 *    rather than a set difference.
 */
export class BlockTokenSubsetMatcher extends WindowedMatcher {
	private windowLength: number;

	private constructor(referenceDoc: DocumentInfoWithOffset, windowLength: number) {
		super(referenceDoc);
		this.windowLength = windowLength;
	}

	static FACTORY = (windowLength: number) => {
		return {
			to: (referenceDoc: DocumentInfoWithOffset) => new BlockTokenSubsetMatcher(referenceDoc, windowLength),
		};
	};

	protected id(): string {
		return 'fixed:' + this.windowLength;
	}

	protected getWindowsDelineations(lines: string[]): [number, number][] {
		return getBasicWindowDelineations(this.windowLength, lines);
	}

	protected _getCursorContextInfo(referenceDoc: DocumentInfoWithOffset): CursorContextInfo {
		return getCursorContext(referenceDoc, {
			maxLineCount: this.windowLength,
		});
	}

	override get referenceTokens(): Promise<Set<string>> {
		return this.createReferenceTokensForLanguage();
	}

	private async createReferenceTokensForLanguage(): Promise<Set<string>> {
		if (this.referenceTokensCache) {
			return this.referenceTokensCache;
		}

		// Syntax aware reference tokens uses tree-sitter based parsing to identify the bounds of the current
		// method and extracts tokens from just that span for use as the reference set.
		this.referenceTokensCache = BlockTokenSubsetMatcher.syntaxAwareSupportsLanguage(this.referenceDoc.languageId)
			? await this.syntaxAwareReferenceTokens()
			: await super.referenceTokens;

		return this.referenceTokensCache;
	}

	private async syntaxAwareReferenceTokens(): Promise<Set<string>> {
		// See if there is an enclosing class or type member.
		const start = (await this.getEnclosingMemberStart(this.referenceDoc.source, this.referenceDoc.offset))
			?.startIndex;
		const end = this.referenceDoc.offset;

		// If not, fallback to the 60-line chunk behavior.
		const text = start
			? this.referenceDoc.source.slice(start, end)
			: getCursorContext(this.referenceDoc, {
				maxLineCount: this.windowLength,
			}).context;

		// Extract the tokens.
		return this.tokenizer.tokenize(text);
	}

	private static syntaxAwareSupportsLanguage(languageId: string): boolean {
		switch (languageId) {
			case 'csharp':
				return true;
			default:
				return false;
		}
	}

	protected similarityScore(a: Set<string>, b: Set<string>): number {
		return computeScore(a, b);
	}

	async getEnclosingMemberStart(text: string, offset: number): Promise<Parser.SyntaxNode | undefined> {
		let tree: Parser.Tree | undefined;

		try {
			tree = await parseTreeSitter(this.referenceDoc.languageId, text);

			let nodeAtPos: Parser.SyntaxNode | undefined = tree.rootNode.namedDescendantForIndex(offset);

			while (nodeAtPos) {
				// For now, hard code for C#.
				if (BlockTokenSubsetMatcher.isMember(nodeAtPos) || BlockTokenSubsetMatcher.isBlock(nodeAtPos)) {
					break;
				}

				nodeAtPos = nodeAtPos.parent ?? undefined;
			}

			return nodeAtPos;
		} finally {
			tree?.delete();
		}
	}

	static isMember(node: Parser.SyntaxNode | undefined): boolean {
		// For now, hard code for C#.
		switch (node?.type) {
			case 'method_declaration':
			case 'property_declaration':
			case 'field_declaration':
			case 'constructor_declaration':
				return true;
			default:
				return false;
		}
	}

	static isBlock(node: Parser.SyntaxNode | undefined): boolean {
		// For now, hard code for C#.
		switch (node?.type) {
			case 'class_declaration':
			case 'struct_declaration':
			case 'record_declaration':
			case 'enum_declaration':
			case 'interface_declaration':
				return true;
			default:
				return false;
		}
	}
}

/**
 * Count the number of unique tokens from B that are also in A.
 */
function computeScore(a: Set<string>, b: Set<string>) {
	const subsetOverlap = new Set();

	b.forEach(x => {
		if (a.has(x)) {
			subsetOverlap.add(x);
		}
	});

	return subsetOverlap.size;
}
