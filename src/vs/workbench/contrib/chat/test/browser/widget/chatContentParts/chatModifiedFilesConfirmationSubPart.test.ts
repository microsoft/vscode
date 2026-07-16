/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from '../../../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../../base/test/common/utils.js';
import { createModifiedFilePreviewEditorInput, findModifiedFileConfirmationEntry, getModifiedFilesSummaryLabel } from '../../../../browser/widget/chatContentParts/toolInvocationParts/chatModifiedFilesConfirmationSubPart.js';

suite('ChatModifiedFilesConfirmationSubPart', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('creates editor inputs for pending file changes', () => {
		const resource = URI.file('/workspace/package.json');
		const originalUri = URI.parse('vscode-agent-host://local/package.json?original');
		const modifiedContentUri = URI.parse('vscode-agent-host://local/package.json?proposed');
		const options = { pinned: true };

		assert.deepStrictEqual({
			create: createModifiedFilePreviewEditorInput(resource, undefined, modifiedContentUri, undefined, options),
			edit: createModifiedFilePreviewEditorInput(resource, originalUri, modifiedContentUri, 'package.json', options),
			fallback: createModifiedFilePreviewEditorInput(resource, undefined, undefined, 'package.json', options),
		}, {
			create: {
				label: 'package.json',
				original: { resource: undefined, contents: '' },
				modified: { resource: modifiedContentUri },
				options,
			},
			edit: {
				original: { resource: originalUri },
				modified: { resource: modifiedContentUri },
				options,
			},
			fallback: { resource, options },
		});
	});

	test('distinguishes created files in the confirmation summary', () => {
		const created = { uri: URI.file('/workspace/new.ts'), editKind: 'create' as const };
		const edited = { uri: URI.file('/workspace/existing.ts'), editKind: 'edit' as const };

		assert.deepStrictEqual({
			oneCreated: getModifiedFilesSummaryLabel([created]),
			manyCreated: getModifiedFilesSummaryLabel([created, { ...created, uri: URI.file('/workspace/other.ts') }]),
			mixed: getModifiedFilesSummaryLabel([created, edited]),
		}, {
			oneCreated: '1 file created',
			manyCreated: '2 files created',
			mixed: '2 files changed',
		});
	});

	test('finds the proposed edit referenced by the confirmation message pill', () => {
		const resource = URI.file('/workspace/package.json');
		const originalContentUri = URI.parse('vscode-agent-host://local/package.json?original');
		const modifiedContentUri = URI.parse('vscode-agent-host://local/package.json?proposed');
		const file = {
			uri: resource,
			editKind: 'edit' as const,
			originalContentUri,
			modifiedContentUri,
			title: 'package.json',
		};

		assert.deepStrictEqual(
			findModifiedFileConfirmationEntry([file], URI.file('/workspace/package.json')),
			file,
		);
	});
});