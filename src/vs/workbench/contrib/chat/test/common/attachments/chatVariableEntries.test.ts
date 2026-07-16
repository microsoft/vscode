/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Codicon } from '../../../../../../base/common/codicons.js';
import { URI } from '../../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { getExplicitFileOrImageAttachmentSummary, IChatRequestVariableEntry, isChatContextIconPath, isExplicitFileOrImageVariableEntry, resolveChatContextIcon } from '../../../common/attachments/chatVariableEntries.js';

suite('Chat variable entries', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('identifies explicit file and image entries', () => {
		const fileEntry: IChatRequestVariableEntry = { kind: 'file', id: 'file', name: 'README.md', value: URI.file('/test/README.md') };
		const imageEntry: IChatRequestVariableEntry = { kind: 'image', id: 'image', name: 'screenshot.png', value: new Uint8Array(), mimeType: 'image/png' };
		const workspaceEntry: IChatRequestVariableEntry = { kind: 'workspace', id: 'workspace', name: 'workspace', value: 'workspace' };

		assert.strictEqual(isExplicitFileOrImageVariableEntry(fileEntry), true);
		assert.strictEqual(isExplicitFileOrImageVariableEntry(imageEntry), true);
		assert.strictEqual(isExplicitFileOrImageVariableEntry(workspaceEntry), false);
	});

	test('summarizes explicit file and image entries', () => {
		const fileEntry: IChatRequestVariableEntry = { kind: 'file', id: 'file', name: 'README.md', value: URI.file('/test/README.md') };
		const imageEntry1: IChatRequestVariableEntry = { kind: 'image', id: 'image-1', name: 'screenshot-1.png', value: new Uint8Array(), mimeType: 'image/png' };
		const imageEntry2: IChatRequestVariableEntry = { kind: 'image', id: 'image-2', name: 'screenshot-2.png', value: new Uint8Array(), mimeType: 'image/png' };

		assert.strictEqual(getExplicitFileOrImageAttachmentSummary([imageEntry1]), 'Attached 1 image');
		assert.strictEqual(getExplicitFileOrImageAttachmentSummary([imageEntry1, imageEntry2]), 'Attached 2 images');
		assert.strictEqual(getExplicitFileOrImageAttachmentSummary([fileEntry]), 'Attached 1 file');
		assert.strictEqual(getExplicitFileOrImageAttachmentSummary([fileEntry, imageEntry1]), 'Attached 2 files');
	});

	test('does not summarize hidden or automatic context entries', () => {
		const workspaceEntry: IChatRequestVariableEntry = { kind: 'workspace', id: 'workspace', name: 'workspace', value: 'workspace' };
		const implicitEntry: IChatRequestVariableEntry = { kind: 'implicit', id: 'implicit', name: 'implicit', value: undefined, uri: undefined, isFile: true, isSelection: false, enabled: true };
		const promptEntry: IChatRequestVariableEntry = { kind: 'promptText', id: 'prompt', name: 'prompt', value: 'instructions', modelDescription: 'instructions', automaticallyAdded: true };

		assert.strictEqual(getExplicitFileOrImageAttachmentSummary([workspaceEntry, implicitEntry, promptEntry]), undefined);
	});

	suite('resolveChatContextIcon', () => {
		const light = URI.file('/icons/light.svg');
		const dark = URI.file('/icons/dark.svg');

		test('returns the theme icon unchanged', () => {
			assert.strictEqual(resolveChatContextIcon(Codicon.gitPullRequest, false), Codicon.gitPullRequest);
			assert.strictEqual(resolveChatContextIcon(Codicon.gitPullRequest, true), Codicon.gitPullRequest);
		});

		test('returns a single uri unchanged for both themes', () => {
			const uri = URI.file('/icons/icon.svg');
			assert.strictEqual(resolveChatContextIcon(uri, false), uri);
			assert.strictEqual(resolveChatContextIcon(uri, true), uri);
		});

		test('picks the light uri in a light theme', () => {
			assert.strictEqual(resolveChatContextIcon({ light, dark }, false), light);
		});

		test('picks the dark uri in a dark theme', () => {
			assert.strictEqual(resolveChatContextIcon({ light, dark }, true), dark);
		});
	});

	suite('isChatContextIconPath', () => {
		const light = URI.file('/icons/light.svg');
		const dark = URI.file('/icons/dark.svg');

		test('accepts theme icons, single uris and complete light/dark objects', () => {
			assert.strictEqual(isChatContextIconPath(Codicon.gitPullRequest), true);
			assert.strictEqual(isChatContextIconPath(URI.file('/icons/icon.svg')), true);
			assert.strictEqual(isChatContextIconPath({ light, dark }), true);
		});

		test('rejects null, undefined and partial light/dark objects', () => {
			assert.strictEqual(isChatContextIconPath(null), false);
			assert.strictEqual(isChatContextIconPath(undefined), false);
			assert.strictEqual(isChatContextIconPath({ dark }), false);
			assert.strictEqual(isChatContextIconPath({ light }), false);
			assert.strictEqual(isChatContextIconPath({}), false);
		});
	});
});