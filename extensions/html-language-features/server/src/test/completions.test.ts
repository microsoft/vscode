/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import 'mocha';
import * as assert from 'assert';
import * as path from 'path';
import { URI } from 'vscode-uri';
import { TextDocument, CompletionList, CompletionItemKind } from 'vscode-languageserver-types';
import { getLanguageModes } from '../modes/languageModes';
import { WorkspaceFolder } from 'vscode-languageserver';
import { ClientCapabilities } from 'vscode-html-languageservice';

export interface ItemDescription {
	label: string;
	documentation?: string;
	kind?: CompletionItemKind;
	resultText?: string;
	command?: { title: string, command: string };
	notAvailable?: boolean;
}

export function assertCompletion(completions: CompletionList, expected: ItemDescription, document: TextDocument) {
	let matches = completions.items.filter(completion => {
		return completion.label === expected.label;
	});
	if (expected.notAvailable) {
		assert.equal(matches.length, 0, `${expected.label} should not existing is results`);
		return;
	}

	assert.equal(matches.length, 1, `${expected.label} should only existing once: Actual: ${completions.items.map(c => c.label).join(', ')}`);
	let match = matches[0];
	if (expected.documentation) {
		assert.equal(match.documentation, expected.documentation);
	}
	if (expected.kind) {
		assert.equal(match.kind, expected.kind);
	}
	if (expected.resultText && match.textEdit) {
		assert.equal(TextDocument.applyEdits(document, [match.textEdit]), expected.resultText);
	}
	if (expected.command) {
		assert.deepEqual(match.command, expected.command);
	}
}

const testUri = 'test://test/test.html';

export function testCompletionFor(value: string, expected: { count?: number, items?: ItemDescription[] }, uri = testUri, workspaceFolders?: WorkspaceFolder[]): void {
	let offset = value.indexOf('|');
	value = value.substr(0, offset) + value.substr(offset + 1);

	let workspace = {
		settings: {},
		folders: workspaceFolders || [{ name: 'x', uri: uri.substr(0, uri.lastIndexOf('/')) }]
	};

	let document = TextDocument.create(uri, 'html', 0, value);
	let position = document.positionAt(offset);

	const languageModes = getLanguageModes({ css: true, javascript: true }, workspace, ClientCapabilities.LATEST);
	const mode = languageModes.getModeAtPosition(document, position)!;

	let list = mode.doComplete!(document, position);

	if (expected.count) {
		assert.equal(list.items.length, expected.count);
	}
	if (expected.items) {
		for (let item of expected.items) {
			assertCompletion(list, item, document);
		}
	}
}

suite('HTML Completion', () => {
	test('HTML JavaScript Completions', function (): any {
		testCompletionFor('<html><script>window.|</script></html>', {
			items: [
				{ label: 'location', resultText: '<html><script>window.location</script></html>' },
			]
		});
		testCompletionFor('<html><script>$.|</script></html>', {
			items: [
				{ label: 'getJSON', resultText: '<html><script>$.getJSON</script></html>' },
			]
		});
	});
});

suite('HTML Path Completion', () => {
	const triggerSuggestCommand = {
		title: 'Suggest',
		command: 'editor.action.triggerSuggest'
	};

	const fixtureRoot = path.resolve(__dirname, '../../src/test/pathCompletionFixtures');
	const fixtureWorkspace = { name: 'fixture', uri: URI.file(fixtureRoot).toString() };
	const indexHtmlUri = URI.file(path.resolve(fixtureRoot, 'index.html')).toString();
	const aboutHtmlUri = URI.file(path.resolve(fixtureRoot, 'about/about.html')).toString();

	test('Basics - Correct label/kind/result/command', () => {
		testCompletionFor('<script src="./|">', {
			items: [
				{ label: 'about/', kind: CompletionItemKind.Folder, resultText: '<script src="./about/">', command: triggerSuggestCommand },
				{ label: 'index.html', kind: CompletionItemKind.File, resultText: '<script src="./index.html">' },
				{ label: 'src/', kind: CompletionItemKind.Folder, resultText: '<script src="./src/">', command: triggerSuggestCommand }
			]
		}, indexHtmlUri);
	});

	test('Basics - Single Quote', () => {
		testCompletionFor(`<script src='./|'>`, {
			items: [
				{ label: 'about/', kind: CompletionItemKind.Folder, resultText: `<script src='./about/'>`, command: triggerSuggestCommand },
				{ label: 'index.html', kind: CompletionItemKind.File, resultText: `<script src='./index.html'>` },
				{ label: 'src/', kind: CompletionItemKind.Folder, resultText: `<script src='./src/'>`, command: triggerSuggestCommand }
			]
		}, indexHtmlUri);
	});

	test('No completion for remote paths', () => {
		testCompletionFor('<script src="http:">', { items: [] });
		testCompletionFor('<script src="http:/|">', { items: [] });
		testCompletionFor('<script src="http://|">', { items: [] });
		testCompletionFor('<script src="https:|">', { items: [] });
		testCompletionFor('<script src="https:/|">', { items: [] });
		testCompletionFor('<script src="https://|">', { items: [] });
		testCompletionFor('<script src="//|">', { items: [] });
	});

	test('Relative Path', () => {
		testCompletionFor('<script src="../|">', {
			items: [
				{ label: 'about/', resultText: '<script src="../about/">' },
				{ label: 'index.html', resultText: '<script src="../index.html">' },
				{ label: 'src/', resultText: '<script src="../src/">' }
			]
		}, aboutHtmlUri);

		testCompletionFor('<script src="../src/|">', {
			items: [
				{ label: 'feature.js', resultText: '<script src="../src/feature.js">' },
				{ label: 'test.js', resultText: '<script src="../src/test.js">' },
			]
		}, aboutHtmlUri);
	});

	test('Absolute Path', () => {
		testCompletionFor('<script src="/|">', {
			items: [
				{ label: 'about/', resultText: '<script src="/about/">' },
				{ label: 'index.html', resultText: '<script src="/index.html">' },
				{ label: 'src/', resultText: '<script src="/src/">' },
			]
		}, indexHtmlUri);

		testCompletionFor('<script src="/src/|">', {
			items: [
				{ label: 'feature.js', resultText: '<script src="/src/feature.js">' },
				{ label: 'test.js', resultText: '<script src="/src/test.js">' },
			]
		}, aboutHtmlUri, [fixtureWorkspace]);
	});

	test('Empty Path Value', () => {
		// document: index.html
		testCompletionFor('<script src="|">', {
			items: [
				{ label: 'about/', resultText: '<script src="about/">' },
				{ label: 'index.html', resultText: '<script src="index.html">' },
				{ label: 'src/', resultText: '<script src="src/">' },
			]
		}, indexHtmlUri);
		// document: about.html
		testCompletionFor('<script src="|">', {
			items: [
				{ label: 'about.css', resultText: '<script src="about.css">' },
				{ label: 'about.html', resultText: '<script src="about.html">' },
				{ label: 'media/', resultText: '<script src="media/">' },
			]
		}, aboutHtmlUri);
	});
	test('Incomplete Path', () => {
		testCompletionFor('<script src="/src/f|">', {
			items: [
				{ label: 'feature.js', resultText: '<script src="/src/feature.js">' },
				{ label: 'test.js', resultText: '<script src="/src/test.js">' },
			]
		}, aboutHtmlUri, [fixtureWorkspace]);

		testCompletionFor('<script src="../src/f|">', {
			items: [
				{ label: 'feature.js', resultText: '<script src="../src/feature.js">' },
				{ label: 'test.js', resultText: '<script src="../src/test.js">' },
			]
		}, aboutHtmlUri, [fixtureWorkspace]);
	});

	test('No leading dot or slash', () => {
		// document: index.html
		testCompletionFor('<script src="s|">', {
			items: [
				{ label: 'about/', resultText: '<script src="about/">' },
				{ label: 'index.html', resultText: '<script src="index.html">' },
				{ label: 'src/', resultText: '<script src="src/">' },
			]
		}, indexHtmlUri, [fixtureWorkspace]);

		testCompletionFor('<script src="src/|">', {
			items: [
				{ label: 'feature.js', resultText: '<script src="src/feature.js">' },
				{ label: 'test.js', resultText: '<script src="src/test.js">' },
			]
		}, indexHtmlUri, [fixtureWorkspace]);

		testCompletionFor('<script src="src/f|">', {
			items: [
				{ label: 'feature.js', resultText: '<script src="src/feature.js">' },
				{ label: 'test.js', resultText: '<script src="src/test.js">' },
			]
		}, indexHtmlUri, [fixtureWorkspace]);

		// document: about.html
		testCompletionFor('<script src="s|">', {
			items: [
				{ label: 'about.css', resultText: '<script src="about.css">' },
				{ label: 'about.html', resultText: '<script src="about.html">' },
				{ label: 'media/', resultText: '<script src="media/">' },
			]
		}, aboutHtmlUri, [fixtureWorkspace]);

		testCompletionFor('<script src="media/|">', {
			items: [
				{ label: 'icon.pic', resultText: '<script src="media/icon.pic">' }
			]
		}, aboutHtmlUri, [fixtureWorkspace]);

		testCompletionFor('<script src="media/f|">', {
			items: [
				{ label: 'icon.pic', resultText: '<script src="media/icon.pic">' }
			]
		}, aboutHtmlUri, [fixtureWorkspace]);
	});

	test('Trigger completion in middle of path', () => {
		// document: index.html
		testCompletionFor('<script src="src/f|eature.js">', {
			items: [
				{ label: 'feature.js', resultText: '<script src="src/feature.js">' },
				{ label: 'test.js', resultText: '<script src="src/test.js">' },
			]
		}, indexHtmlUri, [fixtureWorkspace]);

		testCompletionFor('<script src="s|rc/feature.js">', {
			items: [
				{ label: 'about/', resultText: '<script src="about/">' },
				{ label: 'index.html', resultText: '<script src="index.html">' },
				{ label: 'src/', resultText: '<script src="src/">' },
			]
		}, indexHtmlUri, [fixtureWorkspace]);

		// document: about.html
		testCompletionFor('<script src="media/f|eature.js">', {
			items: [
				{ label: 'icon.pic', resultText: '<script src="media/icon.pic">' }
			]
		}, aboutHtmlUri, [fixtureWorkspace]);

		testCompletionFor('<script src="m|edia/feature.js">', {
			items: [
				{ label: 'about.css', resultText: '<script src="about.css">' },
				{ label: 'about.html', resultText: '<script src="about.html">' },
				{ label: 'media/', resultText: '<script src="media/">' },
			]
		}, aboutHtmlUri, [fixtureWorkspace]);
	});


	test('Trigger completion in middle of path and with whitespaces', () => {
		testCompletionFor('<script src="./| about/about.html>', {
			items: [
				{ label: 'about/', resultText: '<script src="./about/ about/about.html>' },
				{ label: 'index.html', resultText: '<script src="./index.html about/about.html>' },
				{ label: 'src/', resultText: '<script src="./src/ about/about.html>' },
			]
		}, indexHtmlUri, [fixtureWorkspace]);

		testCompletionFor('<script src="./a|bout /about.html>', {
			items: [
				{ label: 'about/', resultText: '<script src="./about/ /about.html>' },
				{ label: 'index.html', resultText: '<script src="./index.html /about.html>' },
				{ label: 'src/', resultText: '<script src="./src/ /about.html>' },
			]
		}, indexHtmlUri, [fixtureWorkspace]);
	});

	test('Completion should ignore files/folders starting with dot', () => {
		testCompletionFor('<script src="./|"', {
			count: 3
		}, indexHtmlUri, [fixtureWorkspace]);
	});

	test('Unquoted Path', () => {
		/* Unquoted value is not supported in html language service yet
		testCompletionFor(`<div><a href=about/|>`, {
			items: [
				{ label: 'about.html', resultText: `<div><a href=about/about.html>` }
			]
		}, testUri);
		*/
	});
});
