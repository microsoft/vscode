/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CustomFetcher, TelemetryReporter } from '@vscode/extension-telemetry';
import { ICopilotTokenStore } from '../../authentication/common/copilotTokenStore';
import { BaseMsftTelemetrySender } from '../common/msftTelemetrySender';

export class MicrosoftTelemetrySender extends BaseMsftTelemetrySender {
	constructor(
		internalAIKey: string,
		externalAIKey: string,
		tokenStore: ICopilotTokenStore,
		customFetcher: CustomFetcher
	) {
		const telemetryReporterFactory = (internal: boolean) => {
			if (internal) {
				return new TelemetryReporter(internalAIKey, undefined, undefined, customFetcher);
			} else {
				return new TelemetryReporter(externalAIKey, undefined, undefined, customFetcher);
			}
		};
		super(tokenStore, telemetryReporterFactory);
	}
}
