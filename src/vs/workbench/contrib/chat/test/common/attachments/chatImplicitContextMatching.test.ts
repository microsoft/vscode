/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from '../../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { Range } from '../../../../../../editor/common/core/range.js';
import { IChatRequestStringVariableEntry, IChatRequestVariableEntry } from '../../../common/attachments/chatVariableEntries.js';
import { isImplicitContextAlreadyAttached } from '../../../common/attachments/chatImplicitContextMatching.js';

suite('isImplicitContextAlreadyAttached', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	const editorUri = URI.parse('webview-panel://pr/123');
	const resourceUri = URI.parse('https://github.com/microsoft/vscode/pull/320371');

	function stringAttachment(overrides?: Partial<IChatRequestStringVariableEntry>): IChatRequestStringVariableEntry {
		return {
			kind: 'string',
			id: 'vscode.implicit.string',
			name: 'Fix bug #320371',
			value: '# PR body',
			uri: editorUri,
			resourceUri,
			handle: 1,
			...overrides,
		};
	}

	test('hides string/PR suggestion when already attached even if handle changed (#320371)', () => {
		const attachments: IChatRequestVariableEntry[] = [stringAttachment({ handle: 1 })];

		assert.strictEqual(isImplicitContextAlreadyAttached(attachments, {
			uri: editorUri,
			handle: 2, // refreshed provider handle
			resourceUri,
		}), true);
	});

	test('hides string/PR suggestion when matching by resourceUri alone', () => {
		const attachments: IChatRequestVariableEntry[] = [stringAttachment({ handle: 1 })];

		assert.strictEqual(isImplicitContextAlreadyAttached(attachments, {
			uri: URI.parse('webview-panel://pr/other'),
			handle: 99,
			resourceUri,
		}), true);
	});

	test('does not hide file suggestion just because a string attachment reused the editor uri', () => {
		const attachments: IChatRequestVariableEntry[] = [stringAttachment({ handle: 1 })];
		const file = editorUri;

		assert.strictEqual(isImplicitContextAlreadyAttached(attachments, { uri: file }), false);
	});

	test('matches string attachment by handle', () => {
		const attachments: IChatRequestVariableEntry[] = [stringAttachment({ handle: 7 })];

		assert.strictEqual(isImplicitContextAlreadyAttached(attachments, {
			uri: URI.parse('webview-panel://unrelated'),
			handle: 7,
		}), true);
	});

	test('does not hide unrelated string context', () => {
		const attachments: IChatRequestVariableEntry[] = [stringAttachment({ handle: 1 })];

		assert.strictEqual(isImplicitContextAlreadyAttached(attachments, {
			uri: URI.parse('webview-panel://pr/other'),
			handle: 2,
			resourceUri: URI.parse('https://github.com/microsoft/vscode/pull/999'),
		}), false);
	});

	test('does not treat editor uri as string attachment identity when handle and resourceUri differ', () => {
		const attachments: IChatRequestVariableEntry[] = [stringAttachment({ handle: 1, resourceUri: undefined })];

		assert.strictEqual(isImplicitContextAlreadyAttached(attachments, {
			uri: editorUri,
			handle: 2,
			resourceUri: undefined,
		}), false);
	});

	test('does not hide string suggestion when a file with the same editor uri is attached', () => {
		const attachments: IChatRequestVariableEntry[] = [
			{ kind: 'file', id: 'file', name: 'pr', value: editorUri },
		];

		assert.strictEqual(isImplicitContextAlreadyAttached(attachments, {
			uri: editorUri,
			handle: 1,
			resourceUri,
		}), false);
	});

	test('still matches file attachments by uri', () => {
		const file = URI.file('/repo/src/foo.ts');
		const attachments: IChatRequestVariableEntry[] = [
			{ kind: 'file', id: 'file', name: 'foo.ts', value: file },
		];

		assert.strictEqual(isImplicitContextAlreadyAttached(attachments, { uri: file }), true);
		assert.strictEqual(isImplicitContextAlreadyAttached(attachments, { uri: URI.file('/repo/src/bar.ts') }), false);
	});

	test('matches file location attachments by uri and range', () => {
		const file = URI.file('/repo/src/foo.ts');
		const range = new Range(2, 1, 4, 1);
		const attachments: IChatRequestVariableEntry[] = [
			{ kind: 'file', id: 'file', name: 'foo.ts', value: { uri: file, range } },
		];

		assert.strictEqual(isImplicitContextAlreadyAttached(attachments, { uri: file, range }), true);
		assert.strictEqual(isImplicitContextAlreadyAttached(attachments, { uri: file, range: new Range(10, 1, 12, 1) }), false);
		assert.strictEqual(isImplicitContextAlreadyAttached(attachments, { uri: file }), false);
	});
});
