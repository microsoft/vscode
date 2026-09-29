/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { Terminal as RawXtermTerminal } from '@xterm/xterm';
import * as dom from '../../../../../base/browser/dom.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import { ITerminalLogService } from '../../../../../platform/terminal/common/terminal.js';
import type { ITerminalContribution, ITerminalInstance, IXtermTerminal } from '../../../terminal/browser/terminal.js';
import { registerTerminalContribution, type ITerminalContributionContext } from '../../../terminal/browser/terminalExtensions.js';
import { TerminalOscNotificationsSettingId } from '../common/terminalNotificationConfiguration.js';
import { TerminalNotificationHandler } from './terminalNotificationHandler.js';


class TerminalOscNotificationsContribution extends Disposable implements ITerminalContribution {
	static readonly ID = 'terminal.oscNotifications';

	private readonly _handler: TerminalNotificationHandler;

	constructor(
		private readonly _ctx: ITerminalContributionContext,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@INotificationService private readonly _notificationService: INotificationService,
		@ITerminalLogService private readonly _logService: ITerminalLogService,
	) {
		super();
		this._handler = this._register(new TerminalNotificationHandler({
			isEnabled: () => this._configurationService.getValue<boolean>(TerminalOscNotificationsSettingId.EnableNotifications) === true,
			isWindowFocused: () => dom.getActiveWindow().document.hasFocus(),
			isTerminalVisible: () => this._ctx.instance.isVisible,
			focusTerminal: () => this._ctx.instance.focus(true),
			notify: notification => this._notificationService.notify(notification),
			updateEnableNotifications: value => this._configurationService.updateValue(TerminalOscNotificationsSettingId.EnableNotifications, value),
			logWarn: message => this._logService.warn(message),
			writeToProcess: data => { void this._ctx.instance.sendText(data, false); }
		}));
	}

	xtermReady(xterm: IXtermTerminal & { raw: RawXtermTerminal }): void {
		this._register(xterm.raw.parser.registerOscHandler(99, data => this._handler.handleSequence(data)));
	}
}

registerTerminalContribution(TerminalOscNotificationsContribution.ID, TerminalOscNotificationsContribution);

export function getTerminalOscNotifications(instance: ITerminalInstance): TerminalOscNotificationsContribution | null {
	return instance.getContribution<TerminalOscNotificationsContribution>(TerminalOscNotificationsContribution.ID);
}
