/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IDisposable } from '../../../util/vs/base/common/lifecycle';
import { ICopilotTokenStore } from '../../authentication/common/copilotTokenStore';
import { ICAPIClientService } from '../../endpoint/common/capiClient';
import { IEnvService } from '../../env/common/envService';
import { IGHTelemetryService } from '../common/telemetry';
import { AzureInsightReporter } from './azureInsightsReporter';

// the application insights key (also known as instrumentation key)
export const APP_INSIGHTS_KEY_STANDARD = '7d7048df-6dd0-4048-bb23-b716c1461f8f';
export const APP_INSIGHTS_KEY_ENHANCED = '3fdd7f28-937a-48c8-9a21-ba337db23bd1';

export async function setupGHTelemetry(
	telemetryService: IGHTelemetryService,
	capiClientService: ICAPIClientService,
	envService: IEnvService,
	tokenStore: ICopilotTokenStore,
	telemetryNamespace: string,
	telemetryEnabled: boolean
): Promise<IDisposable | undefined> {
	const container = telemetryService;
	await container.deactivate();
	if (!telemetryEnabled) {
		return;
	}

	const reporter = new AzureInsightReporter(capiClientService, envService, tokenStore, telemetryNamespace, APP_INSIGHTS_KEY_STANDARD);
	const reporterSecure = new AzureInsightReporter(capiClientService, envService, tokenStore, telemetryNamespace, APP_INSIGHTS_KEY_ENHANCED);

	container.setReporter(reporter);
	container.setSecureReporter(reporterSecure);

	return {
		dispose() {
			container.setReporter(undefined);
			container.setSecureReporter(undefined);
			reporter.flush();
			reporterSecure.flush();
		}
	};
}
