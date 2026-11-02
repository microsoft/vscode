/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { observableValue } from '../../../../../base/common/observable.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ContextKeyService } from '../../../../../platform/contextkey/browser/contextKeyService.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { LayoutModeContext, SplitLayoutContext } from '../../../../common/contextkeys.js';
import { bindWindowLayoutContext } from '../../browser/chatWindowContextKeys.js';
import { ChatWindowLayoutMode, ChatWindowSplitLayout } from '../../common/chatWindowLayout.js';

suite('Chat window context keys', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('each window\'s layout keys follow its own state, without leaking to another window or to the main window, and are unset once unbound', () => {
		const contextKeyService = disposables.add(new ContextKeyService(new TestConfigurationService()));
		const createWindow = (layoutMode: ChatWindowLayoutMode, splitLayout: ChatWindowSplitLayout) => {
			const scoped = disposables.add(contextKeyService.createScoped(document.createElement('div')));
			const state = { layoutMode: observableValue('layoutMode', layoutMode), splitLayout: observableValue<ChatWindowSplitLayout>('splitLayout', splitLayout) };
			const binding = bindWindowLayoutContext(scoped, state);
			return { scoped, state, binding };
		};
		const read = (service: { getContextKeyValue<T>(key: string): T | undefined }) => [service.getContextKeyValue(LayoutModeContext.key), service.getContextKeyValue(SplitLayoutContext.key)];

		const first = createWindow(ChatWindowLayoutMode.SideBySide, ChatWindowLayoutMode.SideBySide);
		const second = createWindow(ChatWindowLayoutMode.ChatOnly, ChatWindowLayoutMode.Stacked);
		const initial = [read(first.scoped), read(second.scoped), read(contextKeyService)];
		first.state.layoutMode.set(ChatWindowLayoutMode.EditorOnly, undefined);
		second.state.splitLayout.set(ChatWindowLayoutMode.SideBySide, undefined);
		const changed = [read(first.scoped), read(second.scoped), read(contextKeyService)];
		first.binding.dispose();
		second.binding.dispose();

		assert.deepStrictEqual({ initial, changed, unbound: read(first.scoped) }, {
			initial: [['sideBySide', 'sideBySide'], ['chatOnly', 'stacked'], [undefined, undefined]],
			changed: [['editorOnly', 'sideBySide'], ['chatOnly', 'sideBySide'], [undefined, undefined]],
			unbound: [undefined, undefined],
		});
	});
});
