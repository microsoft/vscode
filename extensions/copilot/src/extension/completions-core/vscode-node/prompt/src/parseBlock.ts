/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as Parser from 'web-tree-sitter';
import {
	WASMLanguage,
	isSupportedLanguageId,
	languageIdToWasmLanguage,
	parseTreeSitter,
	parseTreeSitterIncludingVersion,
	queryPythonIsDocstring,
} from './parse';

interface BlockParser {
	isEmptyBlockStart: (text: string, offset: number) => Promise<boolean>;

	/**
	 * Given a document prefix, offset, and a proposed completion, determines how much of the
	 * completion to keep in order to "finish" the following block when the completion is appended
	 * to the document prefix.
	 *
	 * If there is no such block, or the completion doesn't close the block, returns undefined.
	 */
	isBlockBodyFinished: (prefix: string, completion: string, offset: number) => Promise<number | undefined>;

	/**
	 * Given a document text and offset, determines the beginning of current matching node.
	 *
	 * If there is no such block, returns undefined.
	 */
	getNodeStart: (text: string, offset: number) => Promise<number | undefined>;
}

abstract class BaseBlockParser implements BlockParser {
	abstract isEmptyBlockStart(text: string, offset: number): Promise<boolean>;

	constructor(
		protected readonly languageId: string,
		protected readonly nodeMatch: { [parent: string]: string },
		/**
		 * A map from node types that have a block or an statement as a child
		 * to the field label of the child node that is a block or statement.
		 * For example, an if statement in a braced language.
		 */
		protected readonly nodeTypesWithBlockOrStmtChild: Map<string, string>
	) { }

	protected async getNodeMatchAtPosition<T>(
		text: string,
		offset: number,
		cb: (nd: Parser.SyntaxNode) => T
	): Promise<T | undefined> {
		const tree = await parseTreeSitter(this.languageId, text);
		try {
			// TODO:(hponde) It seems that we have an issue if it's at the end of the block:
			// https://github.com/tree-sitter/tree-sitter/issues/407
			const nodeAtPos = tree.rootNode.descendantForIndex(offset);

			let nodeToComplete: Parser.SyntaxNode | null = nodeAtPos;

			// find target element by looking at parent of cursor node
			// don't stop at node types that may have a block child, but don't actually in this
			// parse tree
			while (nodeToComplete) {
				const blockNodeType = this.nodeMatch[nodeToComplete.type];
				if (blockNodeType) {
					if (!this.nodeTypesWithBlockOrStmtChild.has(nodeToComplete.type)) {
						break;
					}

					const fieldLabel = this.nodeTypesWithBlockOrStmtChild.get(nodeToComplete.type)!;
					const childToCheck =
						fieldLabel === ''
							? nodeToComplete.namedChildren[0]
							: nodeToComplete.childForFieldName(fieldLabel);
					if (childToCheck?.type === blockNodeType) {
						break;
					}
				}

				nodeToComplete = nodeToComplete.parent;
			}
			if (!nodeToComplete) {
				// No nodes we're interested in
				return;
			}
			return cb(nodeToComplete);
		} finally {
			tree.delete();
		}
	}

	protected getNextBlockAtPosition<T>(
		text: string,
		offset: number,
		cb: (nd: Parser.SyntaxNode) => T
	): Promise<T | undefined> {
		return this.getNodeMatchAtPosition(text, offset, nodeToComplete => {
			// FIXME: childForFieldName always returns null
			//   const block = nodeToComplete.childForFieldName(fieldToComplete);
			// Instead, find child nodes of the langauge's nodeMatch type for
			// nodeToComplete.
			// Look in reverse order, in case of nodes with multiple blocks defined,
			// such as try/catch/finally.
			let block = nodeToComplete.children.reverse().find(x => x.type === this.nodeMatch[nodeToComplete.type]);
			if (!block) {
				// child of matching type isn't defined yet
				return;
			}

			if (this.languageId === 'python' && block.parent) {
				// handle empty block's parent being the colon (!)
				const parent = block.parent.type === ':' ? block.parent.parent : block.parent;

				// tree-sitter handles comments in a weird way, so we need to
				// consume them.
				let nextComment = parent?.nextSibling;

				while (nextComment && nextComment.type === 'comment') {
					// next comment is inline at the end of the block
					// see issue: https://github.com/tree-sitter/tree-sitter-python/issues/113
					const commentInline =
						nextComment.startPosition.row === block.endPosition.row &&
						nextComment.startPosition.column >= block.endPosition.column;

					// next comment is on subsequent line and indented > parent's indentation
					// see issue: https://github.com/tree-sitter/tree-sitter-python/issues/112
					const commentAtEnd =
						nextComment.startPosition.row > parent!.endPosition.row &&
						nextComment.startPosition.column > parent!.startPosition.column;

					if (commentInline || commentAtEnd) {
						block = nextComment;
						nextComment = nextComment.nextSibling;
					} else {
						break;
					}
				}
			}

			if (block.endIndex >= block.tree.rootNode.endIndex - 1 && (block.hasError || block.parent!.hasError)) {
				// TODO:(hponde) improve this logic
				// block is the whole document, and has errors, most likely doc has
				// preceding errors.
				return;
			}

			// Return first block if not empty
			return cb(block);
		});
	}

	async isBlockBodyFinished(prefix: string, completion: string, offset: number): Promise<number | undefined> {
		const solution = (prefix + completion).trimEnd();
		const endIndex = await this.getNextBlockAtPosition(solution, offset, block => block.endIndex);
		if (endIndex === undefined) {
			// no block, not finished yet
			return;
		}
		if (endIndex < solution.length) {
			// descendant block is finished, stop at end of block
			const lengthOfBlock = endIndex - prefix.length;
			return lengthOfBlock > 0 ? lengthOfBlock : undefined;
		}
	}

	getNodeStart(text: string, offset: number): Promise<number | undefined> {
		const solution = text.trimEnd();
		return this.getNodeMatchAtPosition(solution, offset, block => block.startIndex);
	}
}

class RegexBasedBlockParser extends BaseBlockParser {
	constructor(
		languageId: string,
		protected readonly blockEmptyMatch: string,
		private readonly lineMatch: RegExp,
		nodeMatch: { [parent: string]: string },
		nodeTypesWithBlockOrStmtChild: Map<string, string>
	) {
		super(languageId, nodeMatch, nodeTypesWithBlockOrStmtChild);
	}

	private isBlockStart(line: string): boolean {
		return this.lineMatch.test(line.trimStart());
	}

	private async isBlockBodyEmpty(text: string, offset: number): Promise<boolean> {
		const res = await this.getNextBlockAtPosition(text, offset, block => {
			// strip whitespace and compare with language-defined empty block
			// Note that for Ruby, `block` is the closing `end` token, while for other
			// languages it is the whole block, so we consider the text from the earlier of
			// block.startIndex and offset, all the way up to block.endIndex.
			if (block.startIndex < offset) { offset = block.startIndex; }
			const blockText = text.substring(offset, block.endIndex).trim();
			if (blockText === '' || blockText.replace(/\s/g, '') === this.blockEmptyMatch) {
				// block is empty
				return true;
			}
			return false;
		});
		return res === undefined || res;
	}

	async isEmptyBlockStart(text: string, offset: number): Promise<boolean> {
		offset = rewindToNearestNonWs(text, offset);
		return this.isBlockStart(getLineAtOffset(text, offset)) && this.isBlockBodyEmpty(text, offset);
	}
}

function getLineAtOffset(text: string, offset: number): string {
	const prevNewline = text.lastIndexOf('\n', offset - 1);
	let nextNewline = text.indexOf('\n', offset);
	if (nextNewline < 0) {
		nextNewline = text.length;
	}
	return text.slice(prevNewline + 1, nextNewline);
}

/**
 * Returns the cursor position immediately after the nearest non-whitespace
 * character.  If every character before offset is whitespace, returns 0.
 */
function rewindToNearestNonWs(text: string, offset: number): number {
	let result = offset;
	while (result > 0 && /\s/.test(text.charAt(result - 1))) {
		result--;
	}
	return result;
}

/**
 * If `nd` is only preceded by whitespace on the line where it starts, return that whitespace;
 * otherwise, return undefined. The parameter `source` is the source text from which `nd` was
 * parsed.
 */
function indent(nd: Parser.SyntaxNode, source: string): string | undefined {
	const startIndex = nd.startIndex;
	const lineStart = nd.startIndex - nd.startPosition.column;
	const prefix = source.substring(lineStart, startIndex);
	if (/^\s*$/.test(prefix)) {
		return prefix;
	}
	return undefined;
}

/**
 * Check if `snd` is "outdented" with respect to `fst`, that is, it starts on a later line, and
 * its indentation is no greater than that of `fst`.
 */
function outdented(fst: Parser.SyntaxNode, snd: Parser.SyntaxNode, source: string): boolean {
	if (snd.startPosition.row <= fst.startPosition.row) {
		return false;
	}
	const fstIndent = indent(fst, source);
	const sndIndent = indent(snd, source);
	return fstIndent !== undefined && sndIndent !== undefined && fstIndent.startsWith(sndIndent);
}

class TreeSitterBasedBlockParser extends BaseBlockParser {
	constructor(
		languageId: string,
		nodeMatch: { [parent: string]: string },
		nodeTypesWithBlockOrStmtChild: Map<string, string>,
		private readonly startKeywords: string[],
		private readonly blockNodeType: string,
		/**
		 * The langauge-specific node type of an empty statement, that is,
		 * a statement with no text except possibly the statement terminator.
		 * For example, `;` is an empty statement in a braced language, but
		 * `pass` is not in Python.
		 */
		private readonly emptyStatementType: string | null,
		private readonly curlyBraceLanguage: boolean
	) {
		super(languageId, nodeMatch, nodeTypesWithBlockOrStmtChild);
	}

	private isBlockEmpty(block: Parser.SyntaxNode, offset: number): boolean {
		let trimmed = block.text.trim();

		if (this.curlyBraceLanguage) {
			if (trimmed.startsWith('{')) {
				trimmed = trimmed.slice(1);
			}
			if (trimmed.endsWith('}')) {
				trimmed = trimmed.slice(0, -1);
			}
			trimmed = trimmed.trim();
		}

		if (trimmed.length === 0) {
			return true;
		}

		// Python: Consider a block that contains only a docstring empty.
		if (
			this.languageId === 'python' &&
			(block.parent?.type === 'class_definition' || block.parent?.type === 'function_definition') &&
			block.children.length === 1 &&
			queryPythonIsDocstring(block.parent)
		) {
			return true;
		}

		return false;
	}

	async isEmptyBlockStart(text: string, offset: number): Promise<boolean> {
		if (offset > text.length) {
			throw new RangeError('Invalid offset');
		}

		// Ensure that the cursor is at the end of a line, ignoring trailing whitespace.
		for (let i = offset; i < text.length; i++) {
			if (text.charAt(i) === '\n') {
				break;
			} else if (/\S/.test(text.charAt(i))) {
				return false;
			}
		}

		// This lets e.g. "def foo():\nâ–ˆ" give a multiline suggestion.
		offset = rewindToNearestNonWs(text, offset);

		const [tree, version] = await parseTreeSitterIncludingVersion(this.languageId, text);
		try {
			// offset here is the cursor position immediately after a whitespace
			// character, but tree-sitter expects the index of the node to search for.
			// Therefore we adjust the offset when we call into tree-sitter.
			const nodeAtPos = tree.rootNode.descendantForIndex(offset - 1);
			if (nodeAtPos === null) {
				return false;
			}

			// Because of rewinding to the previous non-whitespace character, nodeAtPos may be
			// "}".  That's not a good place to show multline ghost text.
			if (this.curlyBraceLanguage && nodeAtPos.type === '}') {
				return false;
			}

			// JS/TS: half open, empty blocks are sometimes parsed as objects
			if (
				(this.languageId === 'javascript' || this.languageId === 'typescript') &&
				nodeAtPos.parent &&
				nodeAtPos.parent.type === 'object' &&
				nodeAtPos.parent.text.trim() === '{'
			) {
				return true;
			}

			// TS: a function_signature/method_signature is a prefix of a
			// function_declaration/method_declaration, so if nodeAtPos is a descendant of one of
			// those node types and the signature looks incomplete, return true
			if (this.languageId === 'typescript') {
				let currNode = nodeAtPos;
				while (currNode.parent) {
					if (currNode.type === 'function_signature' || currNode.type === 'method_signature') {
						// if the next node is outdented, the signature is probably incomplete and
						// TreeSitter may just have done some fanciful error correction, so we'll
						// assume that this is really meant to be an incomplete function
						const next = nodeAtPos.nextSibling;
						if (next && currNode.hasError && outdented(currNode, next, text)) {
							return true;
						}

						// if, on the other hand, there is a semicolon, then the signature is
						// probably complete, and we should not show a multiline suggestion
						const semicolon = currNode.children.find(c => c.type === ';');
						return !semicolon && currNode.endIndex <= offset;
					}
					currNode = currNode.parent;
				}
			}

			// Ignoring special cases, there are three situations when we want to return true:
			//
			// 1. nodeAtPos is in a block or a descendant of a block, the parent of the block is one of the node types
			//    in this.nodeMatch, and the block is empty.
			// 2. nodeAtPos is somewhere below an ERROR node, and that ERROR node has an anonymous child
			//    matching one of the keywords we care about.  If that ERROR node also has a block child, the
			//    block must be empty.
			// 3. nodeAtPos is somewhere below a node type that we know can contain a block, and the block is either
			//    not present or empty.

			let errorNode = null;
			let blockNode = null;
			let blockParentNode = null;
			let currNode: Parser.SyntaxNode | null = nodeAtPos;
			while (currNode !== null) {
				if (currNode.type === this.blockNodeType) {
					blockNode = currNode;
					break;
				}
				if (this.nodeMatch[currNode.type]) {
					blockParentNode = currNode;
					break;
				}
				if (currNode.type === 'ERROR') {
					errorNode = currNode;
					break;
				}
				currNode = currNode.parent;
			}
			if (blockNode !== null) {
				if (!blockNode.parent || !this.nodeMatch[blockNode.parent.type]) {
					return false;
				}

				// Python: hack for unclosed docstrings.  There's no rhyme or reason to how the actual
				// docstring comments are parsed, but overall the parse tree looks like:
				// function_definition
				//   - def
				//   - identifier
				//   - parameters
				//   - :
				//   - ERROR with text that starts with """ or '''
				//   - block
				//     - junk
				//
				// We do best effort here to detect that we're in an unclosed docstring and return true.
				// Note that this won't work (we won't give a multline suggestion) if the docstring uses single
				// quotes, which is allowed by the language standard but not idiomatic (see PEP 257,
				// Docstring Conventions).
				if (this.languageId === 'python') {
					const prevSibling = blockNode.previousSibling;
					if (
						prevSibling !== null &&
						prevSibling.hasError &&
						(prevSibling.text.startsWith('"""') || prevSibling.text.startsWith(`'''`))
					) {
						return true;
					}
				}

				return this.isBlockEmpty(blockNode, offset);
			}
			if (errorNode !== null) {
				// TS: In a module such as "module 'foo' {" or internal_module such as "namespace 'foo' {"
				// the open brace is parsed as an error node, like so:
				// - expression_statement
				//   - [internal_]module
				//     - string
				//   - ERROR
				if (
					errorNode.previousSibling?.type === 'module' ||
					errorNode.previousSibling?.type === 'internal_module' ||
					errorNode.previousSibling?.type === 'def'
				) {
					return true;
				}

				// @dbaeumer The way how unfinished docstrings are handled changed in version 14 for Python.
				if (this.languageId === 'python' && version >= 14) {
					// In version 14 and later, we need to account for the possibility of
					// an unfinished docstring being represented as an ERROR node.
					if (errorNode.hasError && (errorNode.text.startsWith('"') || errorNode.text.startsWith(`'`))) {
						const parentType = errorNode.parent?.type;
						if (
							parentType === 'function_definition' ||
							parentType === 'class_definition' ||
							parentType === 'module'
						) {
							return true;
						}
					}
				}

				// Search in reverse order so we get the latest block or keyword node.
				const children = [...errorNode.children].reverse();
				const keyword = children.find(child => this.startKeywords.includes(child.type));
				let block = children.find(child => child.type === this.blockNodeType);

				if (keyword) {
					switch (this.languageId) {
						case 'python': {
							// Python: try-except-finally
							// If the cursor is in either "except" or "finally," but the try-except-finally isn't finished,
							// nodeAtPos will be parsed as an identifier.  If > 4 characters of "except" or "finally" have been
							// typed, it will be parsed as:
							// ERROR
							//   - try
							//   - :
							//   - ERROR
							//     - block
							//   - expression_statement
							//     - identifier
							//
							// In this case, we have to special-case finding the right block to check whether it's empty.
							if (keyword.type === 'try' && nodeAtPos.type === 'identifier' && nodeAtPos.text.length > 4) {
								block = children
									.find(child => child.hasError)
									?.children.find(child => child.type === 'block');
							}

							// Python: sometimes nodes that are morally part of a block are parsed as statements
							// that are all children of an ERROR node.  Detect this by looking for ":" and inspecting
							// its nextSibling.  Skip over ":" inside parentheses because those could be part of a
							// typed parameter.
							let colonNode;
							let parenCount = 0;
							for (const child of errorNode.children) {
								if (child.type === ':' && parenCount === 0) {
									colonNode = child;
									break;
								}
								if (child.type === '(') {
									parenCount += 1;
								}
								if (child.type === ')') {
									parenCount -= 1;
								}
							}
							if (colonNode && keyword.endIndex <= colonNode.startIndex && colonNode.nextSibling) {
								// horrible hack to handle unfinished docstrings :(
								if (keyword.type === 'def') {
									const sibling = colonNode.nextSibling;
									if (sibling.type === '"' || sibling.type === `'`) {
										return true;
									}
									if (sibling.type === 'ERROR' && (sibling.text === '"""' || sibling.text === `'''`)) {
										return true;
									}
								}
								return false;
							}

							break;
						}
						case 'javascript': {
							// JS: method definition within a class, e.g. "class C { foo()"
							if (keyword.type === 'class') {
								if (version <= 13) {
									const formalParameters = children.find(child => child.type === 'formal_parameters');
									if (formalParameters) {
										return true;
									}
								} else {
									const children = errorNode.children;
									for (let i = 0; i < children.length; i++) {
										const child = children[i];
										if (child.type === 'formal_parameters') {
											return (
												i + 1 === children.length ||
												(children[i + 1]?.type === '{' && i + 2 === children.length)
											);
										}
									}
								}
							}

							// JS: Don't mistake a half-open curly brace after a keyword under an error node for an empty
							// block.  If it has a nextSibling, then it's not empty. e.g. in "do {\n\t;â–ˆ", the ";" is an
							// empty_statement and the nextSibling of the "{".
							const leftCurlyBrace = children.find(child => child.type === '{');
							if (
								leftCurlyBrace &&
								leftCurlyBrace.startIndex > keyword.endIndex &&
								leftCurlyBrace.nextSibling !== null
							) {
								return false;
							}

							// JS: do-while: don't give a multline suggestion after the "while" keyword
							const doNode = children.find(child => child.type === 'do');
							if (doNode && keyword.type === 'while') {
								return false;
							}

							// JS: In an arrow function, if there is a next sibling of the arrow and it's not an open brace, we're not in a
							// block context and we should return false.
							if (keyword.type === '=>' && keyword.nextSibling && keyword.nextSibling.type !== '{') {
								return false;
							}

							break;
						}
						case 'typescript': {
							// TS: Don't mistake a half-open curly brace after a keyword under an error node for an empty
							// block.  If it has a nextSibling, then it's not empty. e.g. in "do {\n\t;â–ˆ", the ";" is an
							// empty_statement and the nextSibling of the "{".
							const leftCurlyBrace = children.find(child => child.type === '{');
							if (
								leftCurlyBrace &&
								leftCurlyBrace.startIndex > keyword.endIndex &&
								leftCurlyBrace.nextSibling !== null
							) {
								return false;
							}

							// TS: do-while: don't give a multline suggestion after the "while" keyword
							const doNode = children.find(child => child.type === 'do');
							if (doNode && keyword.type === 'while') {
								return false;
							}

							// TS: In an arrow function, if there is a next sibling of the arrow and it's not an open brace, we're not in a
							// block context and we should return false.
							if (keyword.type === '=>' && keyword.nextSibling && keyword.nextSibling.type !== '{') {
								return false;
							}

							break;
						}
					}

					if (block && block.startIndex > keyword.endIndex) {
						return this.isBlockEmpty(block, offset);
					}
					return true;
				}
			}
			if (blockParentNode !== null) {
				const expectedType = this.nodeMatch[blockParentNode.type];
				const block = blockParentNode.children
					.slice()
					.reverse()
					.find(x => x.type === expectedType);
				if (!block) {
					// Some node types have a child that is either a block or a statement, e.g. "if (foo)".
					// If the user has started typing a non-block statement, then this is not the start of an
					// empty block.
					if (this.nodeTypesWithBlockOrStmtChild.has(blockParentNode.type)) {
						const fieldLabel = this.nodeTypesWithBlockOrStmtChild.get(blockParentNode.type)!;
						const child =
							fieldLabel === ''
								? blockParentNode.children[0]
								: blockParentNode.childForFieldName(fieldLabel);
						if (child && child.type !== this.blockNodeType && child.type !== this.emptyStatementType) {
							return false;
						}
					}

					return true;
				} else {
					return this.isBlockEmpty(block, offset);
				}
			}

			return false;
		} finally {
			tree.delete();
		}
	}
}

const wasmLanguageToBlockParser: { [languageId in WASMLanguage]: BlockParser } = {
	python: new TreeSitterBasedBlockParser(
		/* languageId */ 'python',
		/* nodeMatch */ {
			// Generated with script/tree-sitter-super-types tree-sitter-python block
			class_definition: 'block',
			elif_clause: 'block',
			else_clause: 'block',
			except_clause: 'block',
			finally_clause: 'block',
			for_statement: 'block',
			function_definition: 'block',
			if_statement: 'block',
			try_statement: 'block',
			while_statement: 'block',
			with_statement: 'block',
		},
		/* nodeTypesWithBlockOrStmtChild */ new Map(),
		/* startKeywords */['def', 'class', 'if', 'elif', 'else', 'for', 'while', 'try', 'except', 'finally', 'with'],
		/* blockNodeType */ 'block',
		/* emptyStatementType */ null,
		/* curlyBraceLanguage */ false
	),
	javascript: new TreeSitterBasedBlockParser(
		/* languageId */ 'javascript',
		/* nodeMatch */ {
			// Generated with script/tree-sitter-super-types tree-sitter-javascript statement_block
			arrow_function: 'statement_block',
			catch_clause: 'statement_block',
			do_statement: 'statement_block',
			else_clause: 'statement_block',
			finally_clause: 'statement_block',
			for_in_statement: 'statement_block',
			for_statement: 'statement_block',
			function: 'statement_block',
			function_expression: 'statement_block',
			function_declaration: 'statement_block',
			generator_function: 'statement_block',
			generator_function_declaration: 'statement_block',
			if_statement: 'statement_block',
			method_definition: 'statement_block',
			try_statement: 'statement_block',
			while_statement: 'statement_block',
			with_statement: 'statement_block',
			// Generated with script/tree-sitter-super-types tree-sitter-javascript class_body
			class: 'class_body',
			class_declaration: 'class_body',
		},
		/* nodeTypesWithBlockOrStmtChild */ new Map([
			['arrow_function', 'body'],
			['do_statement', 'body'],
			['else_clause', ''],
			['for_in_statement', 'body'],
			['for_statement', 'body'],
			['if_statement', 'consequence'],
			['while_statement', 'body'],
			['with_statement', 'body'],
		]),
		/* startKeywords */[
			'=>',
			'try',
			'catch',
			'finally',
			'do',
			'for',
			'if',
			'else',
			'while',
			'with',
			'function',
			'function*',
			'class',
		],
		/* blockNodeType */ 'statement_block',
		/* emptyStatementType */ 'empty_statement',
		/* curlyBraceLanguage */ true
	),
	typescript: new TreeSitterBasedBlockParser(
		/* languageId */ 'typescript',
		/* nodeMatch */ {
			// Generated with script/tree-sitter-super-types tree-sitter-typescript/typescript statement_block
			ambient_declaration: 'statement_block',
			arrow_function: 'statement_block',
			catch_clause: 'statement_block',
			do_statement: 'statement_block',
			else_clause: 'statement_block',
			finally_clause: 'statement_block',
			for_in_statement: 'statement_block',
			for_statement: 'statement_block',
			function: 'statement_block',
			function_expression: 'statement_block',
			function_declaration: 'statement_block',
			generator_function: 'statement_block',
			generator_function_declaration: 'statement_block',
			if_statement: 'statement_block',
			internal_module: 'statement_block',
			method_definition: 'statement_block',
			module: 'statement_block',
			try_statement: 'statement_block',
			while_statement: 'statement_block',
			// Generated with script/tree-sitter-super-types tree-sitter-typescript/typescript class_body
			abstract_class_declaration: 'class_body',
			class: 'class_body',
			class_declaration: 'class_body',
		},
		/* nodeTypesWithBlockOrStmtChild */ new Map([
			['arrow_function', 'body'],
			['do_statement', 'body'],
			['else_clause', ''],
			['for_in_statement', 'body'],
			['for_statement', 'body'],
			['if_statement', 'consequence'],
			['while_statement', 'body'],
			['with_statement', 'body'],
		]),
		/* startKeywords */[
			'declare',
			'=>',
			'try',
			'catch',
			'finally',
			'do',
			'for',
			'if',
			'else',
			'while',
			'with',
			'function',
			'function*',
			'class',
		],
		/* blockNodeType */ 'statement_block',
		/* emptyStatementType */ 'empty_statement',
		/* curlyBraceLanguage */ true
	),
	tsx: new TreeSitterBasedBlockParser(
		/* languageId */ 'typescriptreact',
		/* nodeMatch */ {
			// Generated with script/tree-sitter-super-types tree-sitter-typescript/typescript statement_block
			ambient_declaration: 'statement_block',
			arrow_function: 'statement_block',
			catch_clause: 'statement_block',
			do_statement: 'statement_block',
			else_clause: 'statement_block',
			finally_clause: 'statement_block',
			for_in_statement: 'statement_block',
			for_statement: 'statement_block',
			function: 'statement_block',
			function_expression: 'statement_block',
			function_declaration: 'statement_block',
			generator_function: 'statement_block',
			generator_function_declaration: 'statement_block',
			if_statement: 'statement_block',
			internal_module: 'statement_block',
			method_definition: 'statement_block',
			module: 'statement_block',
			try_statement: 'statement_block',
			while_statement: 'statement_block',
			// Generated with script/tree-sitter-super-types tree-sitter-typescript/typescript class_body
			abstract_class_declaration: 'class_body',
			class: 'class_body',
			class_declaration: 'class_body',
		},
		/* nodeTypesWithBlockOrStmtChild */ new Map([
			['arrow_function', 'body'],
			['do_statement', 'body'],
			['else_clause', ''],
			['for_in_statement', 'body'],
			['for_statement', 'body'],
			['if_statement', 'consequence'],
			['while_statement', 'body'],
			['with_statement', 'body'],
		]),
		/* startKeywords */[
			'declare',
			'=>',
			'try',
			'catch',
			'finally',
			'do',
			'for',
			'if',
			'else',
			'while',
			'with',
			'function',
			'function*',
			'class',
		],
		/* blockNodeType */ 'statement_block',
		/* emptyStatementType */ 'empty_statement',
		/* curlyBraceLanguage */ true
	),
	go: new RegexBasedBlockParser(
		/* languageId */ 'go',
		/* blockEmptyMatch */ '{}',
		/* lineMatch */ /\b(func|if|else|for)\b/,
		/* nodeMatch */ {
			// Generated with script/tree-sitter-super-types tree-sitter-go block
			communication_case: 'block',
			default_case: 'block',
			expression_case: 'block',
			for_statement: 'block',
			func_literal: 'block',
			function_declaration: 'block',
			if_statement: 'block',
			labeled_statement: 'block',
			method_declaration: 'block',
			type_case: 'block',
		},
		/* nodeTypesWithBlockOrStmtChild */ new Map() // Go always requires braces
	),
	ruby: new RegexBasedBlockParser(
		/* languageId */ 'ruby',
		/* blockEmptyMatch */ 'end',
		// Regex \b matches word boundaries - `->{}` has no word boundary.
		/* lineMatch */ /\b(BEGIN|END|case|class|def|do|else|elsif|for|if|module|unless|until|while)\b|->/,
		/* nodeMatch */ {
			// Ruby works differently from other languages because there is no
			// block-level node, instead we use the literal 'end' node to
			// represent the end of a block.
			begin_block: '}',
			block: '}',
			end_block: '}',
			lambda: 'block',
			for: 'do',
			until: 'do',
			while: 'do',
			case: 'end',
			do: 'end',
			if: 'end',
			method: 'end',
			module: 'end',
			unless: 'end',
			do_block: 'end',
		},
		// TODO(eaftan): Scour Ruby grammar for these
		/* nodeTypesWithBlockOrStmtChild */ new Map()
	),
	'c-sharp': new TreeSitterBasedBlockParser(
		/* languageId */ 'csharp',
		/* nodeMatch */ {
			// TODO -- unused in the current usage.
		},
		/* nodeTypesWithBlockOrStmtChild */ new Map([
			// TODO -- unused in the current usage.
		]),
		/* startKeywords */[
			// TODO -- unused in the current usage.
		],
		/* blockNodeType */ 'block',
		/* emptyStatementType */ null,
		/* curlyBraceLanguage */ true
	),
	java: new TreeSitterBasedBlockParser(
		/* languageId */ 'java',
		/* nodeMatch */ {
			// TODO -- unused in the current usage.
		},
		/* nodeTypesWithBlockOrStmtChild */ new Map([
			// TODO -- unused in the current usage.
		]),
		/* startKeywords */[
			// TODO -- unused in the current usage.
		],
		/* blockNodeType */ 'block',
		/* emptyStatementType */ null,
		/* curlyBraceLanguage */ true
	),
	php: new TreeSitterBasedBlockParser(
		/* languageId */ 'php',
		/* nodeMatch */ {
			// TODO -- unused in the current usage.
		},
		/* nodeTypesWithBlockOrStmtChild */ new Map([
			// TODO -- unused in the current usage.
		]),
		/* startKeywords */[
			// TODO -- unused in the current usage.
		],
		/* blockNodeType */ 'block',
		/* emptyStatementType */ null,
		/* curlyBraceLanguage */ true
	),
	cpp: new TreeSitterBasedBlockParser(
		/* languageId */ 'cpp',
		/* nodeMatch */ {
			// TODO -- unused in the current usage.
		},
		/* nodeTypesWithBlockOrStmtChild */ new Map([
			// TODO -- unused in the current usage.
		]),
		/* startKeywords */[
			// TODO -- unused in the current usage.
		],
		/* blockNodeType */ 'block',
		/* emptyStatementType */ null,
		/* curlyBraceLanguage */ true
	),
};

export function getBlockParser(languageId: string): BlockParser {
	if (!isSupportedLanguageId(languageId)) {
		throw new Error(`Language ${languageId} is not supported`);
	}
	return wasmLanguageToBlockParser[languageIdToWasmLanguage(languageId)];
}

export async function isEmptyBlockStart(languageId: string, text: string, offset: number) {
	if (!isSupportedLanguageId(languageId)) {
		return false;
	}
	return getBlockParser(languageId).isEmptyBlockStart(text, offset);
}

export async function isBlockBodyFinished(languageId: string, prefix: string, completion: string, offset: number) {
	if (!isSupportedLanguageId(languageId)) {
		return undefined;
	}
	return getBlockParser(languageId).isBlockBodyFinished(prefix, completion, offset);
}

export async function getNodeStart(languageId: string, text: string, offset: number) {
	if (!isSupportedLanguageId(languageId)) {
		return;
	}
	return getBlockParser(languageId).getNodeStart(text, offset);
}
