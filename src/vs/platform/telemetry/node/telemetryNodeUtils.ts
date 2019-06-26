/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from 'vs/base/common/uri';
import product from 'vs/platform/product/node/product';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';

export async function addGAParameters(telemetryService: ITelemetryService, environmentService: IEnvironmentService, uri: URI, origin: string, experiment = '1'): Promise<URI> {
	if (environmentService.isBuilt && !environmentService.isExtensionDevelopment && !environmentService.args['disable-telemetry'] && !!product.enableTelemetry) {
		if (uri.scheme === 'https' && uri.authority === 'code.visualstudio.com') {
			const info = await telemetryService.getTelemetryInfo();

			return uri.with({ query: `${uri.query ? uri.query + '&' : ''}utm_source=VsCode&utm_medium=${encodeURIComponent(origin)}&utm_campaign=${encodeURIComponent(info.instanceId)}&utm_content=${encodeURIComponent(experiment)}` });
		}
	}
	return uri;
}
