/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from 'vs/base/common/lifecycle';
import { localize } from 'vs/nls';
import type { ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { AccessibilityVerbositySettingId, AccessibleViewProviderId } from 'vs/workbench/contrib/accessibility/browser/accessibilityConfiguration';
import { AccessibleViewType, IAccessibleViewService } from 'vs/workbench/contrib/accessibility/browser/accessibleView';
import { AccessibilityHelpAction } from 'vs/workbench/contrib/accessibility/browser/accessibleViewActions';
import { ITerminalService } from 'vs/workbench/contrib/terminal/browser/terminal';
import { TerminalChatContextKeys } from 'vs/workbench/contrib/terminalContrib/chat/browser/terminalChat';
import { TerminalChatController } from 'vs/workbench/contrib/terminalContrib/chat/browser/terminalChatController';

export class TerminalChatAccessibilityHelpContribution extends Disposable {
	static ID = 'terminalChatAccessiblityHelp';
	constructor() {
		super();
		this._register(AccessibilityHelpAction.addImplementation(110, 'terminalChat', runAccessibilityHelpAction, TerminalChatContextKeys.focused));
	}
}

export async function runAccessibilityHelpAction(accessor: ServicesAccessor): Promise<void> {
	const accessibleViewService = accessor.get(IAccessibleViewService);
	const terminalService = accessor.get(ITerminalService);

	const instance = terminalService.activeInstance;
	if (!instance) {
		return;
	}

	const helpText = getAccessibilityHelpText(accessor);
	accessibleViewService.show({
		id: AccessibleViewProviderId.TerminalChat,
		verbositySettingKey: AccessibilityVerbositySettingId.TerminalChat,
		provideContent: () => helpText,
		onClose: () => TerminalChatController.get(instance)?.focus(),
		options: { type: AccessibleViewType.Help }
	});
}

export function getAccessibilityHelpText(accessor: ServicesAccessor): string {
	const content = [];
	// TODO: Fill in more help text
	content.push(localize('chat.overview', 'The terminal chat view is comprised of an input box, an editor where suggested commands are provided (Shift+Tab) and buttons to action the suggestion.'));
	return content.join('\n\n');
}
