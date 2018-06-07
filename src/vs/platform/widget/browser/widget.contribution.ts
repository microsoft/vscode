/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { KeybindingsRegistry } from 'vs/platform/keybinding/common/keybindingsRegistry';
import { KeyCode } from 'vs/base/common/keyCodes';
import { ContextKeyDefinedExpr, IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { HistoryInputBoxContext } from 'vs/platform/widget/browser/input';
import { HistoryInputBox } from 'vs/base/browser/ui/inputbox/inputBox';

KeybindingsRegistry.registerCommandAndKeybindingRule({
	id: 'input.action.historyPrevious',
	weight: KeybindingsRegistry.WEIGHT.workbenchContrib(),
	when: new ContextKeyDefinedExpr(HistoryInputBoxContext),
	primary: KeyCode.UpArrow,
	handler: (accessor, arg2) => {
		const historyInputBox: HistoryInputBox = accessor.get(IContextKeyService).getContext(document.activeElement).getValue(HistoryInputBoxContext);
		historyInputBox.showPreviousValue();
	}
});

KeybindingsRegistry.registerCommandAndKeybindingRule({
	id: 'input.action.historyNext',
	weight: KeybindingsRegistry.WEIGHT.workbenchContrib(),
	when: new ContextKeyDefinedExpr(HistoryInputBoxContext),
	primary: KeyCode.DownArrow,
	handler: (accessor, arg2) => {
		const historyInputBox: HistoryInputBox = accessor.get(IContextKeyService).getContext(document.activeElement).getValue(HistoryInputBoxContext);
		historyInputBox.showNextValue();
	}
});
