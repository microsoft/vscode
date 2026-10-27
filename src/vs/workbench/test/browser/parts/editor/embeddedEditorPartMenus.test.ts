/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Schemas } from '../../../../../base/common/network.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { isIMenuItem, MenuId, MenuRegistry } from '../../../../../platform/actions/common/actions.js';
import { IContext } from '../../../../../platform/contextkey/common/contextkey.js';
import { setupTerminalMenus } from '../../../../contrib/terminal/browser/terminalMenus.js';
import { TerminalCommandId } from '../../../../contrib/terminal/common/terminal.js';

// The terminal's menus, as its contribution registers them once.
setupTerminalMenus();

suite('Embedded editor part menus', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('a terminal in an embedded part is not offered to move into the panel; elsewhere it is, as before', () => {
		const shows = (embedded: boolean) => MenuRegistry.getMenuItems(MenuId.EditorTitleContext).some(item => isIMenuItem(item) && item.command.id === TerminalCommandId.MoveToTerminalPanel && !!item.when?.evaluate({
			getValue: <T>(key: string) => ({ resourceScheme: Schemas.vscodeTerminal, editorPartEmbedded: embedded } as Record<string, unknown>)[key] as T,
		} satisfies IContext));
		assert.deepStrictEqual({ embedded: shows(true), elsewhere: shows(false) }, { embedded: false, elsewhere: true });
	});
});
