/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import 'mocha';
import * as vscode from 'vscode';
import { CURSOR, withRandomFileEditor, joinLines } from '../testUtils';

function onDocumentChange(doc: vscode.TextDocument): Promise<vscode.TextDocument> {
	return new Promise<vscode.TextDocument>(resolve => {
		const sub = vscode.workspace.onDidChangeTextDocument(e => {
			if (e.document !== doc) {
				return;
			}
			sub.dispose();
			resolve(e.document);
		});
	});
}

// Some events don't trigger when it's all sent as one string (which would simulate pasting a chunk of text), so it's split up.
async function type(document: vscode.TextDocument, text: string): Promise<vscode.TextDocument> {
	const onChange = onDocumentChange(document);
	const keyList = text.split('');
	for (const key of keyList) {
		await vscode.commands.executeCommand('type', { text: key });
	}
	await onChange;
	return document;
}

function resolveIndentUnit(options: vscode.TextEditorOptions): string {
	if (options.insertSpaces) {
		return ' '.repeat(options.tabSize as number);
	} else {
		return '\t';
	}
}

function assertTypeInstructionsEqual(startingLine: string, instructions: string, endingLines: string[]) {
	return withRandomFileEditor(startingLine + CURSOR, 'js', async (editor, document) => {
		const indentUnit = resolveIndentUnit(editor.options);
		await type(document, instructions.replace(/\t/g, indentUnit));
		assert.strictEqual(document.getText(), joinLines(...endingLines).replace(/\t/g, indentUnit));
	});
}

suite('Indentation Rules', () => {
	setup(async () => {
		await vscode.extensions.getExtension('vscode.typescript-language-features')!.activate();
	});

	teardown(() => {
		return vscode.commands.executeCommand('workbench.action.closeAllEditors');
	});

	suite('Single Line Control Statements', () => {
		test('if', () => {
			return assertTypeInstructionsEqual('if (true)', '\nx\ny', [
				'if (true)',
				'\tx',
				'y'
			]);
		});

		test('else if', () => {
			return assertTypeInstructionsEqual('else if (true)', '\nx\ny', [
				'else if (true)',
				'\tx',
				'y'
			]);
		});

		test('else', () => {
			return assertTypeInstructionsEqual('else', '\nx\ny', [
				'else',
				'\tx',
				'y'
			]);
		});

		test('for', () => {
			return assertTypeInstructionsEqual('for (true)', '\nx\ny', [
				'for (true)',
				'\tx',
				'y'
			]);
		});

		test('while', () => {
			return assertTypeInstructionsEqual('while (true)', '\nx\ny', [
				'while (true)',
				'\tx',
				'y'
			]);
		});
	});

	suite('Auto-closing and unindented bracket...', () => {
		test('on the same line as control statement works', () => {
			return assertTypeInstructionsEqual('if (true) ', '{\nx', [
				'if (true) {',
				'\tx',
				'}'
			]);
		});

		test('on the same line as control statement works when skipped', () => {
			return assertTypeInstructionsEqual('if (true) ', '{}\nx', [
				'if (true) {}',
				'x'
			]);
		});

		test('on the line after a control statement works', () => {
			return assertTypeInstructionsEqual('if (true)', '\n{\nx', [
				'if (true)',
				'{',
				'\tx',
				'}'
			]);
		});

		test('on the line after a control statement works when skipped', () => {
			return assertTypeInstructionsEqual('if (true)', '\n{}\nx', [
				'if (true)',
				'{}',
				'x'
			]);
		});

		test('after case/default works', () => {
			return assertTypeInstructionsEqual('case 5:', '\n{\nx', [
				'case 5:',
				'{',
				'\tx',
				'}'
			]);
		});

		test('after case/default works when skipped', () => {
			return assertTypeInstructionsEqual('default:', '\n{}\nx', [
				'default:',
				'{}',
				'x'
			]);
		});
	});

	test('switch case doesn\'t indent after a normal statement and does indent after a break statement', () => {
		return assertTypeInstructionsEqual('case 5:', '\nx\nbreak;\ny', [
			'case 5:',
			'\tx',
			'\tbreak;',
			'y'
		]);
	});

	test('switch default doesn\'t indent after a normal statement and does indent after a break statement', () => {
		return assertTypeInstructionsEqual('default:', '\nx\nbreak;\ny', [
			'default:',
			'\tx',
			'\tbreak;',
			'y'
		]);
	});

	// https://github.com/microsoft/vscode/pull/115454#issuecomment-782607610
	test('decreaseIndentWithPreviousLinePattern doesn\'t affect a control statement where the previous line is just whitespace', () => {
		return assertTypeInstructionsEqual('', '\n\tif (true) {', [
			'',
			'\tif (true) {}'
		]);
	});

	test('free-floating bracket doesn\'t unindent', () => {
		return assertTypeInstructionsEqual('', '{\n{\nx', [
			'{',
			'\t{',
			'\t\tx',
			'\t}',
			'}'
		]);
	});
});
