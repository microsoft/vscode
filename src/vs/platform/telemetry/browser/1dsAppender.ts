/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AbstractOneDataSystemAppender, IAppInsightsCore } from '../common/1dsAppender.js';
import { isMeteredConnection } from '../../../base/common/networkConnection.js';
import { IConfigurationService } from '../../configuration/common/configuration.js';


export class OneDataSystemWebAppender extends AbstractOneDataSystemAppender {
	constructor(
		isInternalTelemetry: boolean,
		eventPrefix: string,
		defaultData: { [key: string]: unknown } | null,
		iKeyOrClientFactory: string | (() => IAppInsightsCore), // allow factory function for testing
		private readonly configurationService: IConfigurationService
	) {
		super(isInternalTelemetry, eventPrefix, defaultData, iKeyOrClientFactory);

		// If we cannot fetch the endpoint it means it is down and we should not send any telemetry.
		// This is most likely due to ad blockers
		fetch(this.endPointHealthUrl, { method: 'GET' }).catch(err => {
			this._aiCoreOrKey = undefined;
		});
	}

	protected override async isConnectionMetered(): Promise<boolean> {
		const respectMetered = this.configurationService.getValue<boolean>('update.respectMeteredConnections');
		return respectMetered && isMeteredConnection();
	}
}
