/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { suite, test } from 'vitest';
import { getGitHubCopilotRequestTe, getRequestId, gitHubCopilotRequestTeProperty } from '../../common/fetch';
import { HeadersImpl } from '../../common/fetcherService';
import { TelemetryData } from '../../../telemetry/common/telemetryData';

suite('getRequestId', () => {

	test('only X-Copilot-Experiment header', () => {
		const headers = new HeadersImpl({ 'X-Copilot-Experiment': 'exp1' });
		const result = getRequestId(headers);
		assert.strictEqual(result.serverExperiments, 'exp1');
	});

	test('only x-copilot-api-exp-assignment-context header', () => {
		const headers = new HeadersImpl({ 'x-copilot-api-exp-assignment-context': 'ctx1' });
		const result = getRequestId(headers);
		assert.strictEqual(result.serverExperiments, 'ctx1');
	});

	test('both headers combined with semicolon', () => {
		const headers = new HeadersImpl({
			'X-Copilot-Experiment': 'exp1',
			'x-copilot-api-exp-assignment-context': 'ctx1',
		});
		const result = getRequestId(headers);
		assert.strictEqual(result.serverExperiments, 'exp1;ctx1');
	});

	test('neither header returns empty string', () => {
		const headers = new HeadersImpl({});
		const result = getRequestId(headers);
		assert.strictEqual(result.serverExperiments, '');
	});

	test('parses standard request headers', () => {
		const headers = new HeadersImpl({
			'x-request-id': 'req-123',
			'x-github-request-id': 'gh-456',
			'x-copilot-service-request-id': 'svc-abc',
			'azureml-model-deployment': 'deploy-789',
		});
		const result = getRequestId(headers, { id: 'comp-1', created: 1000 });
		assert.deepStrictEqual(result, {
			headerRequestId: 'req-123',
			gitHubRequestId: 'gh-456',
			copilotServiceRequestId: 'svc-abc',
			completionId: 'comp-1',
			created: 1000,
			serverExperiments: '',
			deploymentId: 'deploy-789',
		});
	});

	test('reads X-Copilot-Service-Request-Id regardless of header casing', () => {
		const headers = new HeadersImpl({ 'X-Copilot-Service-Request-Id': 'svc-abc' });
		assert.strictEqual(getRequestId(headers).copilotServiceRequestId, 'svc-abc');
	});

	test('missing X-Copilot-Service-Request-Id returns empty string', () => {
		assert.strictEqual(getRequestId(new HeadersImpl({})).copilotServiceRequestId, '');
	});

	test('carries X-GitHub-Copilot-Request-Te unchanged and omits it when absent', () => {
		assert.deepStrictEqual([
			getRequestId(new HeadersImpl({ 'X-GitHub-Copilot-Request-Te': ' TRUE ' })).gitHubCopilotRequestTe,
			'gitHubCopilotRequestTe' in getRequestId(new HeadersImpl({})),
		], [' TRUE ', false]);
	});
});

suite('getGitHubCopilotRequestTe', () => {

	test('reads the header case-insensitively from Headers and plain objects, returning the raw value', () => {
		const lookups = ['true', 'false', ' TRUE ', 'yes'].flatMap(value => [
			getGitHubCopilotRequestTe(new HeadersImpl({ 'X-GitHub-Copilot-Request-Te': value })),
			getGitHubCopilotRequestTe(new HeadersImpl({ 'x-github-copilot-request-te': value })),
			getGitHubCopilotRequestTe({ 'X-GitHub-Copilot-Request-Te': value }),
			getGitHubCopilotRequestTe({ 'x-github-copilot-request-te': value }),
		]);
		assert.deepStrictEqual(lookups, [
			'true', 'true', 'true', 'true',
			'false', 'false', 'false', 'false',
			' TRUE ', ' TRUE ', ' TRUE ', ' TRUE ',
			'yes', 'yes', 'yes', 'yes',
		]);
	});

	test('returns undefined when the header or header map is absent', () => {
		assert.deepStrictEqual([
			getGitHubCopilotRequestTe(new HeadersImpl({ 'x-request-id': 'req-1' })),
			getGitHubCopilotRequestTe({}),
			getGitHubCopilotRequestTe(undefined),
		], [undefined, undefined, undefined]);
	});

	test('TelemetryData.extendWithRequestId never keeps a value from an earlier request', () => {
		const telemetryData = TelemetryData.createAndMarkAsIssued();
		telemetryData.extendWithRequestId(getRequestId(new HeadersImpl({ 'x-github-copilot-request-te': 'true' })));
		const afterFirst = telemetryData.properties.gitHubCopilotRequestTe;
		telemetryData.extendWithRequestId(getRequestId(new HeadersImpl({})));
		assert.deepStrictEqual([afterFirst, 'gitHubCopilotRequestTe' in telemetryData.properties], ['true', false]);
	});

	test('telemetry property is omitted when absent and verbatim otherwise', () => {
		assert.deepStrictEqual([
			gitHubCopilotRequestTeProperty(undefined),
			gitHubCopilotRequestTeProperty(' TRUE '),
		], [{}, { gitHubCopilotRequestTe: ' TRUE ' }]);
	});
});
