/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!./media/stickyScroll';
import { localize, localize2 } from 'vs/nls';
import { MenuId } from 'vs/platform/actions/common/actions';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { ContextKeyExpr } from 'vs/platform/contextkey/common/contextkey';
import { registerTerminalAction } from 'vs/workbench/contrib/terminal/browser/terminalActions';
import { registerTerminalContribution } from 'vs/workbench/contrib/terminal/browser/terminalExtensions';
import { TerminalStickyScrollContribution } from 'vs/workbench/contrib/terminalContrib/stickyScroll/browser/terminalStickyScrollContribution';
import { TerminalStickyScrollSettingId } from 'vs/workbench/contrib/terminalContrib/stickyScroll/common/terminalStickyScrollConfiguration';

// #region Terminal Contributions

registerTerminalContribution(TerminalStickyScrollContribution.ID, TerminalStickyScrollContribution, true);

// #endregion

// #region Actions

const enum TerminalStickyScrollCommandId {
	ToggleStickyScroll = 'workbench.action.terminal.toggleStickyScroll',
}

registerTerminalAction({
	id: TerminalStickyScrollCommandId.ToggleStickyScroll,
	title: localize2('workbench.action.terminal.toggleStickyScroll', 'Toggle Sticky Scroll'),
	toggled: {
		condition: ContextKeyExpr.equals(`config.${TerminalStickyScrollSettingId.Enabled}`, true),
		title: localize('stickyScroll', "Sticky Scroll"),
		mnemonicTitle: localize({ key: 'miStickyScroll', comment: ['&& denotes a mnemonic'] }, "&&Sticky Scroll"),
	},
	run: (c, accessor) => {
		const configurationService = accessor.get(IConfigurationService);
		const newValue = !configurationService.getValue(TerminalStickyScrollSettingId.Enabled);
		return configurationService.updateValue(TerminalStickyScrollSettingId.Enabled, newValue);
	},
	menu: [
		{ id: MenuId.TerminalStickyScrollContext }
	]
});

// #endregion

// #region Colors

import './terminalStickyScrollColorRegistry';

// #endregion
