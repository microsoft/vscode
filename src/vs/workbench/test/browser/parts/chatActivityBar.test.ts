/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { ChatShortcutViewContainerId } from '../../../contrib/chat/browser/chat.js';

suite('Chat Activity Bar Shortcut', () => {

	test('ChatShortcutViewContainerId is defined and distinct from ChatViewContainerId', () => {
		assert.strictEqual(ChatShortcutViewContainerId, 'workbench.panel.chatShortcut');
		assert.notStrictEqual(ChatShortcutViewContainerId, 'workbench.panel.chat');
	});

	test('chat shortcut view container is registered in the sidebar', () => {
		const { Registry } = require('../../../../../platform/registry/common/platform.js');
		const { Extensions: ViewExtensions } = require('../../../../common/views.js');

		const registry = Registry.as(ViewExtensions.ViewContainersRegistry);
		const container = registry.get(ChatShortcutViewContainerId);
		assert.ok(container, 'chat shortcut view container should be registered');
	});

	ensureNoDisposablesAreLeakedInTestSuite();
});
