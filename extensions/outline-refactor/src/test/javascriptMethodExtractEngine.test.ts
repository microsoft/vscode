/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import * as fs from 'fs';
import Module = require('module');
import * as path from 'path';
import * as ts from 'typescript';

const extensionRoot = path.resolve(__dirname, '..', '..');

class Position {
	public constructor(
		public readonly line: number,
		public readonly character: number
	) { }
}

function comparePositions(a: Position, b: Position): number {
	if (a.line !== b.line) {
		return a.line - b.line;
	}

	return a.character - b.character;
}

class Range {
	public constructor(
		public readonly start: Position,
		public readonly end: Position
	) { }

	public contains(value: Position | Range): boolean {
		if (value instanceof Range) {
			return this.contains(value.start) && this.contains(value.end);
		}

		return comparePositions(this.start, value) <= 0 && comparePositions(value, this.end) <= 0;
	}
}

class WorkspaceEdit {
	public readonly replacements: Array<{ uri: unknown; range: Range; text: string }> = [];

	public replace(uri: unknown, range: Range, text: string): void {
		this.replacements.push({ uri, range, text });
	}
}

// The refactoring engine is tested outside the extension host, so the test provides the small subset of the VS Code API it uses.
const vscodeStub = {
	Position,
	Range,
	WorkspaceEdit,
	EndOfLine: {
		LF: 1,
		CRLF: 2
	},
	SymbolKind: {
		File: 0,
		Module: 1,
		Namespace: 2,
		Package: 3,
		Class: 4,
		Method: 5,
		Property: 6,
		Field: 7,
		Constructor: 8,
		Enum: 9,
		Interface: 10,
		Function: 11,
		Variable: 12
	}
};

const moduleLoader = Module as unknown as {
	_load: (request: string, parent: NodeModule | null | undefined, isMain: boolean) => unknown;
};
const originalLoad = moduleLoader._load;
moduleLoader._load = function patchedLoad(request: string, parent: NodeModule | null | undefined, isMain: boolean): unknown {
	if (request === 'vscode') {
		return vscodeStub;
	}

	return originalLoad.call(this, request, parent, isMain);
};

const { JavaScriptMethodExtractEngine } = require(path.join(extensionRoot, 'out', 'refactor', 'javascriptMethodExtractEngine.js')) as typeof import('../refactor/javascriptMethodExtractEngine');

class FakeTextDocument {
	public readonly uri: { fsPath: string };
	public readonly languageId = 'javascript';
	public readonly eol: number;
	public readonly lineCount: number;
	private readonly lineOffsets: number[];

	public constructor(
		public readonly fileName: string,
		private readonly text: string
	) {
		this.uri = { fsPath: fileName };
		this.eol = text.includes('\r\n') ? vscodeStub.EndOfLine.CRLF : vscodeStub.EndOfLine.LF;
		this.lineOffsets = this.computeLineOffsets(text);
		this.lineCount = this.lineOffsets.length;
	}

	public getText(range?: Range): string {
		if (!range) {
			return this.text;
		}

		return this.text.slice(this.offsetAt(range.start), this.offsetAt(range.end));
	}

	public positionAt(offset: number): Position {
		offset = Math.max(0, Math.min(offset, this.text.length));

		let low = 0;
		let high = this.lineOffsets.length;
		while (low < high) {
			const mid = Math.floor((low + high) / 2);
			if (this.lineOffsets[mid] > offset) {
				high = mid;
			} else {
				low = mid + 1;
			}
		}

		const line = Math.max(0, low - 1);
		return new Position(line, offset - this.lineOffsets[line]);
	}

	public offsetAt(position: Position): number {
		const line = Math.max(0, Math.min(position.line, this.lineOffsets.length - 1));
		const nextLineOffset = line + 1 < this.lineOffsets.length ? this.lineOffsets[line + 1] : this.text.length;
		return Math.max(this.lineOffsets[line], Math.min(this.lineOffsets[line] + position.character, nextLineOffset));
	}

	public lineAt(line: number): { text: string; rangeIncludingLineBreak: Range } {
		const start = this.lineOffsets[line];
		const endIncludingLineBreak = line + 1 < this.lineOffsets.length ? this.lineOffsets[line + 1] : this.text.length;
		let end = endIncludingLineBreak;
		while (end > start && (this.text[end - 1] === '\n' || this.text[end - 1] === '\r')) {
			end--;
		}

		return {
			text: this.text.slice(start, end),
			rangeIncludingLineBreak: new Range(this.positionAt(start), this.positionAt(endIncludingLineBreak))
		};
	}

	private computeLineOffsets(text: string): number[] {
		const result = [0];
		for (let i = 0; i < text.length; i++) {
			if (text.charCodeAt(i) === 13 /* \r */ || text.charCodeAt(i) === 10 /* \n */) {
				if (text.charCodeAt(i) === 13 && text.charCodeAt(i + 1) === 10) {
					i++;
				}
				result.push(i + 1);
			}
		}

		return result;
	}
}

function normalize(text: string): string {
	return text
		.replace(/\r\n/g, '\n')
		.split('\n')
		.map(line => line.replace(/[ \t]+$/g, ''))
		.join('\n')
		.replace(/\n{3,}/g, '\n\n')
		.replace(/\n[ \t]*\n(?=\})/g, '\n')
		.replace(/\{\n\n\}/g, '{\n}')
		.trim();
}

function nodeRange(document: FakeTextDocument, node: ts.Node, sourceFile: ts.SourceFile): Range {
	return new Range(
		document.positionAt(node.getStart(sourceFile)),
		document.positionAt(node.getEnd())
	);
}

function findClassAndMember(sourceFile: ts.SourceFile, methodName: string): { classNode: ts.ClassLikeDeclaration; member: ts.ClassElement } | undefined {
	let found: { classNode: ts.ClassLikeDeclaration; member: ts.ClassElement } | undefined;

	const visit = (node: ts.Node): void => {
		if (found) {
			return;
		}

		if (ts.isClassDeclaration(node) || ts.isClassExpression(node)) {
			for (const member of node.members) {
				const name = member.name;
				if (name && ts.isIdentifier(name) && name.text === methodName) {
					found = { classNode: node, member };
					return;
				}
			}
		}

		ts.forEachChild(node, visit);
	};

	visit(sourceFile);
	return found;
}

function createRequest(fileName: string, text: string, methodName: string): unknown {
	const document = new FakeTextDocument(fileName, text);
	const sourceFile = ts.createSourceFile(fileName, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
	const found = findClassAndMember(sourceFile, methodName);
	assert.ok(found, `Could not find method '${methodName}' in ${fileName}`);

	return {
		document,
		source: {
			name: methodName,
			kind: vscodeStub.SymbolKind.Method,
			range: nodeRange(document, found.member, sourceFile)
		},
		target: {
			name: found.classNode.name ? found.classNode.name.text : 'Class',
			kind: vscodeStub.SymbolKind.Class,
			range: nodeRange(document, found.classNode, sourceFile)
		},
		sourceParent: {
			name: found.classNode.name ? found.classNode.name.text : 'Class',
			kind: vscodeStub.SymbolKind.Class,
			range: nodeRange(document, found.classNode, sourceFile)
		},
		targetParent: undefined,
		dropPosition: 'after'
	};
}

function applyEdit(edit: unknown): string {
	assert.ok(edit, 'Expected a WorkspaceEdit');
	assert.ok(edit instanceof WorkspaceEdit, 'Expected a stubbed WorkspaceEdit');
	assert.strictEqual(edit.replacements.length, 1, 'Expected one full-document replacement');
	return edit.replacements[0].text;
}

const supportedCases = [
	{ name: 'simple-no-this', methodName: 'helper' },
	{ name: 'uses-this', methodName: 'helper' },
	{ name: 'multiple-args', methodName: 'format' }
];

const unsupportedCases = [
	{ name: 'static-method', methodName: 'helper' },
	{ name: 'getter', methodName: 'displayName' },
	{ name: 'super', methodName: 'helper' },
	{ name: 'private-field', methodName: 'helper' },
	{ name: 'dynamic-this', methodName: 'helper' },
	{ name: 'indirect-call', methodName: 'helper' }
];

describe('JavaScriptMethodExtractEngine', () => {
	for (const testCase of supportedCases) {
		it(`transforms supported fixture: ${testCase.name}`, () => {
			const inputPath = path.join(extensionRoot, 'test-fixtures', 'supported', `${testCase.name}.input.js`);
			const expectedPath = path.join(extensionRoot, 'test-fixtures', 'supported', `${testCase.name}.expected.js`);
			const input = fs.readFileSync(inputPath, 'utf8');
			const expected = fs.readFileSync(expectedPath, 'utf8');

			const request = createRequest(inputPath, input, testCase.methodName);
			const engine = new JavaScriptMethodExtractEngine();
			const validation = engine.canMove(request as never);

			assert.strictEqual(validation.allowed, true, validation.reason || 'Expected move to be allowed');

			const actual = applyEdit(engine.buildEdit(request as never));
			assert.strictEqual(normalize(actual), normalize(expected));
		});
	}

	for (const testCase of unsupportedCases) {
		it(`rejects unsupported fixture: ${testCase.name}`, () => {
			const inputPath = path.join(extensionRoot, 'test-fixtures', 'unsupported', `${testCase.name}.input.js`);
			const input = fs.readFileSync(inputPath, 'utf8');

			const request = createRequest(inputPath, input, testCase.methodName);
			const engine = new JavaScriptMethodExtractEngine();
			const validation = engine.canMove(request as never);

			assert.strictEqual(validation.allowed, false, 'Expected move to be rejected');
		});
	}
});
