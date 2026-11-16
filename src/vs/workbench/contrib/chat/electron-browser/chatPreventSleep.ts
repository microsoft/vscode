/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { autorun, observableFromEvent } from '../../../../base/common/observable.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { PREVENT_SLEEP_ENABLED } from '../../../../platform/keepAwake/common/keepAwake.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { INativeHostService } from '../../../../platform/native/common/native.js';
import { IChatPreventSleepActivitySource } from '../common/chatPreventSleep.js';

export class ChatPreventSleepClaimContribution extends Disposable {
	static readonly ID = 'workbench.contrib.chatPreventSleep';

	constructor(
		@IConfigurationService configurationService: IConfigurationService,
		@IChatPreventSleepActivitySource activity: IChatPreventSleepActivitySource,
		@INativeHostService nativeHostService: INativeHostService,
		@ILogService logService: ILogService,
	) {
		super();
		const enabled = observableFromEvent(this, configurationService.onDidChangeConfiguration, () => configurationService.getValue(PREVENT_SLEEP_ENABLED) === true);
		let lastBusy: boolean | undefined;
		this._register(autorun(reader => {
			const isEnabled = enabled.read(reader);
			if (!isEnabled && lastBusy === undefined) {
				return;
			}
			const busy = isEnabled && activity.busy.read(reader);
			if (busy !== lastBusy) {
				lastBusy = busy;
				void nativeHostService.updateKeepAwakeClaim(busy).catch(error => logService.error('[KeepAwake] Failed to report activity', error));
			}
		}));
	}
}
