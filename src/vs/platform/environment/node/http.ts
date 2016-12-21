/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { TPromise } from 'vs/base/common/winjs.base';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import pkg from 'vs/platform/node/package';

export function getCommonHttpHeaders(telemetryService: ITelemetryService): TPromise<{ [key: string]: string }> {
	return telemetryService.getTelemetryInfo().then(info => ({
		'X-Market-Client-Id': `VSCode ${pkg.version}`,
		'User-Agent': `VSCode ${pkg.version}`,
		'X-Market-User-Id': info.machineId
	}));
}
