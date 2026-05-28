/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CopilotToken, FetchOptions, IDomainChangeResponse, RequestMetadata } from '@vscode/copilot-api';
import assert from 'assert';
import { ICopilotTokenStore } from '../../authentication/common/copilotTokenStore';
import { IConfigurationService } from '../../configuration/common/configurationService';
import { ICAPIClientService } from '../../endpoint/common/capiClient';
import { IEnvService } from '../../env/common/envService';
import { IFetcherService } from '../../networking/common/fetcherService';
import { GHTelemetryService } from '../../telemetry/common/ghTelemetryService';
import { ITelemetryUserConfig } from '../../telemetry/common/telemetry';
import { APP_INSIGHTS_KEY_ENHANCED, APP_INSIGHTS_KEY_STANDARD, setupGHTelemetry } from '../../telemetry/node/azureInsights';
import { ITestingServicesAccessor, TestingServiceCollection } from './services';
import { startFakeTelemetryServerIfNecessary } from './telemetryFake';

export type EventData = {
	baseType: 'EventData';
	baseData: {
		ver: number;
		name: string;
		properties: {
			copilot_build: string;
			common_os: string;
			[key: string]: string;
		};
		measurements: {
			timeSinceIssuedMs: number;
			[key: string]: number;
		};
	};
};

export type ExceptionData = {
	baseType: 'ExceptionData';
	baseData: {
		ver: number;
		exceptions: [
			{
				hasFullStack: boolean;
				parsedStack: [
					{
						sizeInBytes: number;
						level: number;
						method: string;
						assembly: string;
						fileName: string;
						line: number;
					}?
				];
				message: string;
				typeName: string;
			}
		];
		properties: {
			copilot_build: string;
			common_os: string;
			[key: string]: string;
		};
		measurements: {
			timeSinceIssuedMs: number;
			[key: string]: number;
		};
		severityLevel: number;
	};
};

export type CapturedTelemetry<Event> = {
	ver: number;
	sampleRate: number;
	tags: { [key: string]: string };
	data: Event;
	iKey: string;
	name: string;
	time: string;
};

export async function collectCapturedTelemetry(capiClientService: ICAPIClientService, fetcherService: IFetcherService): Promise<CapturedTelemetry<EventData | ExceptionData>[]> {
	const url = capiClientService.copilotTelemetryURL;
	const response = await fetcherService.fetch(url, { callSite: 'test-telemetry-capture' });
	const messages = ((await response.json()).messages as CapturedTelemetry<EventData | ExceptionData>[]) ?? [];

	for (const message of messages) {
		assert.strictEqual(message.tags['ai.cloud.roleInstance'], 'REDACTED');
	}
	return messages;
}

export function isStandardTelemetryMessage(message: CapturedTelemetry<any>): boolean {
	return message.iKey === APP_INSIGHTS_KEY_STANDARD;
}

export function isEnhancedTelemetryMessage(message: CapturedTelemetry<any>): boolean {
	return message.iKey === APP_INSIGHTS_KEY_ENHANCED;
}

export function isEvent(message: CapturedTelemetry<any>): message is CapturedTelemetry<EventData> {
	return message.data.baseType === 'EventData';
}

export function isException(message: CapturedTelemetry<any>): message is CapturedTelemetry<ExceptionData> {
	return message.data.baseType === 'ExceptionData';
}

export function allEvents(messages: CapturedTelemetry<any>[]): messages is CapturedTelemetry<EventData>[] {
	for (const message of messages) {
		if (!isEvent(message)) {
			return false;
		}
	}
	return true;
}

export async function withTelemetryCapture<T>(
	testingServiceCollection: TestingServiceCollection,
	work: (accessor: ITestingServicesAccessor) => Promise<T>
): Promise<[CapturedTelemetry<EventData | ExceptionData>[], T]> {
	return _withTelemetryCapture(testingServiceCollection, true, work);
}

async function _withTelemetryCapture<T>(
	_testingServiceCollection: TestingServiceCollection,
	forceTelemetry: boolean,
	work: (accessor: ITestingServicesAccessor) => Promise<T>
): Promise<[CapturedTelemetry<EventData | ExceptionData>[], T]> {
	const fakeTelemetryServer = await startFakeTelemetryServerIfNecessary();

	const extensionId = 'copilot-test';
	// Using a random endpoint URL avoids collisions with other tests.
	// At present the tests run serially and _should_ flush the captured messages after each call,
	// so this shouldn't be strictly necessary, but it makes things more robust.
	const endpoint = Math.floor(Math.random() * 100000).toString();
	// ensure we don't have a proxy setup in place from other tests
	delete process.env.http_proxy;
	delete process.env.https_proxy;

	const telemetryUrl = `http://localhost:${fakeTelemetryServer.port}/${endpoint}`;

	const testingServiceCollection = _testingServiceCollection.clone();
	testingServiceCollection.define(ICAPIClientService, {
		copilotTelemetryURL: telemetryUrl,
		_serviceBrand: undefined,
		_domainService: undefined,
		_fetcherService: undefined,
		updateDomains: function (copilotToken: CopilotToken | undefined, enterpriseUrlConfig: string | undefined): IDomainChangeResponse {
			throw new Error('Function not implemented.');
		},
		makeRequest: function <T>(request: FetchOptions, requestMetadata: RequestMetadata): Promise<T> {
			throw new Error('Function not implemented.');
		}
	} as unknown as ICAPIClientService);
	const accessor = testingServiceCollection.createTestingAccessor();

	const ghTelemetry = new GHTelemetryService(true, accessor.get(IConfigurationService), accessor.get(IEnvService), accessor.get(ITelemetryUserConfig));
	await ghTelemetry.enablePromiseTracking(true);

	await setupGHTelemetry(ghTelemetry, accessor.get(ICAPIClientService), accessor.get(IEnvService), accessor.get(ICopilotTokenStore), extensionId, forceTelemetry);

	try {
		const result = await work(accessor);
		await ghTelemetry.deactivate(); // awaits all open promises and flushes the events
		const messages = await collectMessagesWithRetry(accessor.get(ICAPIClientService), accessor.get(IFetcherService));
		return [messages, result];
	} finally {
		fakeTelemetryServer.stop();
	}
}

async function collectMessagesWithRetry(capiClientService: ICAPIClientService, fetcherService: IFetcherService) {
	for (let waitTimeMultiplier = 0; waitTimeMultiplier < 3; waitTimeMultiplier++) {
		// race condition between test and telemetry server, wait a bit and try again
		await new Promise(resolve => setTimeout(resolve, waitTimeMultiplier * 1000));
		const messages = await collectCapturedTelemetry(capiClientService, fetcherService);
		if (messages.length > 0) {
			return messages;
		}
		console.warn('Retrying to collect telemetry messages #' + waitTimeMultiplier + 1);
	}
	return [];
}

export function assertHasProperty(
	messages: CapturedTelemetry<EventData>[],
	assertion: (m: { [key: string]: string }) => boolean
) {
	assert.ok(
		messages
			.filter(message => message.data.baseData.name.split('/')[1] !== 'ghostText.produced')
			.every(message => {
				const props = message.data.baseData.properties;
				return assertion.call(props, props);
			})
	);
}
