/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { TPromise } from 'vs/base/common/winjs.base';
import URI from 'vs/base/common/uri';
import product from 'vs/platform/node/product';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';

export function addGAParameters(telemetryService: ITelemetryService, environmentService: IEnvironmentService, uri: URI, origin: string, experiment = '1'): TPromise<URI> {
	if (environmentService.isBuilt && !environmentService.isExtensionDevelopment && !environmentService.args['disable-telemetry'] && !!product.enableTelemetry) {
		if (uri.scheme === 'https' && uri.authority === 'code.visualstudio.com') {
			return telemetryService.getTelemetryInfo()
				.then(info => {
					return uri.with({ query: `${uri.query ? uri.query + '&' : ''}utm_source=VsCode&utm_medium=${encodeURIComponent(origin)}&utm_campaign=${encodeURIComponent(info.instanceId)}&utm_content=${encodeURIComponent(experiment)}` });
				});
		}
	}
	return TPromise.as(uri);
}
