/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../../base/test/common/utils.js';
import { IAction2Options } from '../../../../../../../platform/actions/common/actions.js';
import { Context } from '../../../../../../../platform/contextkey/browser/contextKeyService.js';
import { ChatContextKeys } from '../../../../../chat/common/actions/chatContextKeys.js';
import { IsPhoneLayoutContext, SessionUsesCombinedConfigPickerContext } from '../../../../common/contextkeys.js';
import { MobileChatInputConfigPickerAction } from '../../browser/mobile/mobileChatInputConfigPicker.js';

suite('MobileChatInputConfigPickerAction', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('shows the combined Mode and Model picker on a phone only while AI features are enabled', () => {
		const menus = new MobileChatInputConfigPickerAction().desc.menu as Exclude<IAction2Options['menu'], undefined | { id: unknown }>;
		const shown = (enabled: boolean) => {
			const context = new Context(1, null);
			context.setValue(ChatContextKeys.enabled.key, enabled);
			context.setValue(ChatContextKeys.inAutomationsDialog.key, true);
			context.setValue(SessionUsesCombinedConfigPickerContext.key, true);
			context.setValue(IsPhoneLayoutContext.key, true);
			return menus.map(menu => !!menu.when?.evaluate(context));
		};

		assert.deepStrictEqual({ enabled: shown(true), disabled: shown(false) }, { enabled: [true, true], disabled: [false, false] });
	});
});
