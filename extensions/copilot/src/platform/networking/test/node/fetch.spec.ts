/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { suite, test } from 'vitest';
import { getRequestId } from '../../common/fetch';
import { HeadersImpl } from '../../common/fetcherService';

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
			'azureml-model-deployment': 'deploy-789',
		});
		const result = getRequestId(headers, { id: 'comp-1', created: 1000 });
		assert.deepStrictEqual(result, {
			headerRequestId: 'req-123',
			gitHubRequestId: 'gh-456',
			completionId: 'comp-1',
			created: 1000,
			serverExperiments: '',
			deploymentId: 'deploy-789',
		});
	});
});
