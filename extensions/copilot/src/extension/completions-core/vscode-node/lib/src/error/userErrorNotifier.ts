/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IEnvService } from '../../../../../../platform/env/common/envService';
import { createServiceIdentifier } from '../../../../../../util/common/services';
import { URI } from '../../../../../../util/vs/base/common/uri';
import { ICompletionsLogTargetService, Logger } from '../logger';
import { ICompletionsNotificationSender } from '../notificationSender';

const CERTIFICATE_ERRORS = ['UNABLE_TO_VERIFY_LEAF_SIGNATURE', 'CERT_SIGNATURE_FAILURE'];
const errorMsg =
	'Your proxy connection requires a trusted certificate. Please make sure the proxy certificate and any issuers are configured correctly and trusted by your operating system.';
const learnMoreLink = 'https://gh.io/copilot-network-errors';

export const ICompletionsUserErrorNotifierService = createServiceIdentifier<ICompletionsUserErrorNotifierService>('ICompletionsUserErrorNotifierService');
export interface ICompletionsUserErrorNotifierService {
	readonly _serviceBrand: undefined;
	notifyUser(e: unknown): void;
}

export class UserErrorNotifier implements ICompletionsUserErrorNotifierService {
	declare _serviceBrand: undefined;
	private readonly notifiedErrorCodes: string[] = [];

	constructor(
		@ICompletionsLogTargetService private readonly _logTarget: ICompletionsLogTargetService,
		@ICompletionsNotificationSender private readonly _notificationSender: ICompletionsNotificationSender,
		@IEnvService private readonly _env: IEnvService
	) { }

	notifyUser(e: unknown) {
		if (!(e instanceof Error)) { return; }
		const error: NodeJS.ErrnoException = e;
		if (error.code && CERTIFICATE_ERRORS.includes(error.code) && !this.didNotifyBefore(error.code)) {
			this.notifiedErrorCodes.push(error.code);
			void this.displayCertificateErrorNotification(error);
		}
	}

	private async displayCertificateErrorNotification(err: NodeJS.ErrnoException) {
		new Logger('certificates').error(
			this._logTarget,
			`${errorMsg} Please visit ${learnMoreLink} to learn more. Original cause:`,
			err
		);
		const learnMoreAction = { title: 'Learn more' };
		return this._notificationSender
			.showWarningMessage(errorMsg, learnMoreAction)
			.then(userResponse => {
				if (userResponse?.title === learnMoreAction.title) {
					return this._env.openExternal(URI.parse(learnMoreLink));
				}
			});
	}

	private didNotifyBefore(code: string) {
		return this.notifiedErrorCodes.indexOf(code) !== -1;
	}
}
