/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { describe, expect, it, vi } from 'vitest';
import { mock } from '../../../../util/common/test/simpleMock';
import { FetchOptions, HeadersImpl, IFetcherService, Response } from '../../../networking/common/fetcherService';
import { NullTelemetryService } from '../../../telemetry/common/nullTelemetryService';
import { TestLogService } from '../../../testing/common/testLogService';
import { getPullRequestFromGlobalId, makeSearchGraphQLRequest } from '../githubAPI';

describe('cloud pull request issue relationships', () => {
	it.each(['global ID', 'search'])('fetches closing issues through the %s lookup', async lookup => {
		const linkedIssues = [{
			url: 'https://github.com/microsoft/vscode/issues/335868',
			title: 'Info spotlight not screen reader accessible',
		}];
		const pullRequest = { number: 336399, closingIssuesReferences: { nodes: linkedIssues } };
		const fetcher = new class extends mock<IFetcherService>() {
			override fetch = vi.fn(async (_url: string, _options: FetchOptions) => Response.fromText(
				200,
				'OK',
				new HeadersImpl({ 'x-ratelimit-remaining': '5000' }),
				JSON.stringify({ data: { node: pullRequest, search: { nodes: [pullRequest] } } }),
				'test-stub',
			));
		}();
		const logService = new TestLogService();
		const telemetry = new NullTelemetryService();
		const result = lookup === 'global ID'
			? await getPullRequestFromGlobalId(fetcher, logService, telemetry, 'https://api.github.com', undefined, 'PR_example')
			: (await makeSearchGraphQLRequest(fetcher, logService, telemetry, 'https://api.github.com', undefined, 'repo:microsoft/vscode is:pr'))[0];
		const request: { query: string } = JSON.parse(String(fetcher.fetch.mock.calls[0][1].body));

		expect({
			issues: result?.closingIssuesReferences?.nodes,
			selectsIssueUrlsAndTitles: request.query.replace(/\s+/g, ' ').includes('closingIssuesReferences(first: 100) { nodes { url title } }'),
		}).toEqual({
			issues: linkedIssues,
			selectsIssueUrlsAndTitles: true,
		});
	});
});
