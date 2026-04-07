/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../util/vs/base/common/uri';
import { IEnvService } from '../../env/common/envService';
import { IVSCodeExtensionContext } from '../../extContext/common/extensionContext';
import { ILogService } from '../../log/common/logService';
import { INotificationService } from '../../notification/common/notificationService';


export class SnippyNotifier {

	private static readonly matchCodeMessage = 'We found a reference to public code in a recent suggestion. To learn more about public code references, review the [documentation](https://aka.ms/github-copilot-match-public-code).';
	private static readonly MatchAction = 'View Reference';
	private static readonly SettingAction = 'Change Setting';
	public static readonly CodeReferenceKey = 'copilot.chat.codeReference.notified';

	constructor(
		@INotificationService private readonly notificationService: INotificationService,
		@IVSCodeExtensionContext private readonly context: IVSCodeExtensionContext,
		@ILogService private readonly logService: ILogService,
		@IEnvService private readonly envService: IEnvService,
	) { }


	public notify() {
		const didNotify = this.context.globalState.get<boolean>(SnippyNotifier.CodeReferenceKey);

		if (didNotify) {
			return;
		}

		const messageItems = [SnippyNotifier.MatchAction, SnippyNotifier.SettingAction];

		void this.notificationService.showInformationMessage(SnippyNotifier.matchCodeMessage, ...messageItems).then(action => {
			switch (action) {
				case SnippyNotifier.MatchAction: {
					this.logService.show(true);
					break;
				}
				case SnippyNotifier.SettingAction: {
					this.envService.openExternal(URI.parse('https://aka.ms/github-copilot-settings'));
					break;
				}
				case undefined: {
					break;
				}
			}
		});

		this.context.globalState.update(SnippyNotifier.CodeReferenceKey, true);
	}

}
