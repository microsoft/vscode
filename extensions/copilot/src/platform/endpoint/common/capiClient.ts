/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CAPIClient, MakeRequestOptions, RequestMetadata, RequestType } from '@vscode/copilot-api';
import { createServiceIdentifier } from '../../../util/common/services';
import { IEnvService } from '../../env/common/envService';
import { IFetcherService, NO_FETCH_TELEMETRY } from '../../networking/common/fetcherService';
import { LICENSE_AGREEMENT } from './licenseAgreement';

/**
 * Interface for CAPI client service
 */
export interface ICAPIClientService extends CAPIClient {
	readonly _serviceBrand: undefined;
	abExpContext: string | undefined;
}

export abstract class BaseCAPIClientService extends CAPIClient implements ICAPIClientService {
	readonly _serviceBrand: undefined;
	public abExpContext: string | undefined;

	constructor(
		hmac: string | undefined,
		integrationId: string | undefined,
		fetcherService: IFetcherService,
		envService: IEnvService
	) {
		super({
			machineId: envService.machineId,
			deviceId: envService.devDeviceId,
			sessionId: envService.sessionId,
			vscodeVersion: envService.vscodeVersion,
			buildType: envService.getBuildType(),
			name: envService.getName(),
			version: envService.getVersion(),
		}, LICENSE_AGREEMENT, fetcherService, hmac, integrationId);
	}

	override makeRequest<T>(request: MakeRequestOptions, requestMetadata: RequestMetadata): Promise<T> {
		// Inject AB Exp Context headers (legacy VScode-ABExpContext and new standardized X-Copilot-Client-Exp-Assignment-Context) if available
		if (this.abExpContext) {
			if (!request.headers) {
				request.headers = {};
			}
			request.headers['VScode-ABExpContext'] = this.abExpContext;
			request.headers['X-Copilot-Client-Exp-Assignment-Context'] = this.abExpContext;
		}
		// Expected high request volume events that we don't need to collect fetch telemetry for
		if (
			requestMetadata.type === RequestType.Telemetry ||
			requestMetadata.type === RequestType.ChatCompletions ||
			requestMetadata.type === RequestType.ChatMessages ||
			requestMetadata.type === RequestType.ChatResponses
		) {
			request.callSite = NO_FETCH_TELEMETRY;
		}
		return super.makeRequest<T>(request, requestMetadata);
	}
}
export const ICAPIClientService = createServiceIdentifier<ICAPIClientService>('ICAPIClientService');