/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { CodeWindow } from '../../../../../base/browser/window.js';
import { isCancellationError } from '../../../../../base/common/errors.js';
import { toDisposable } from '../../../../../base/common/lifecycle.js';
import { mock, upcastPartial } from '../../../../../base/test/common/mock.js';
import { runWithFakedTimers } from '../../../../../base/test/common/timeTravelScheduler.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IMenuService } from '../../../../../platform/actions/common/actions.js';
import { IClipboardService } from '../../../../../platform/clipboard/common/clipboardService.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { IDialogService } from '../../../../../platform/dialogs/common/dialogs.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ILogService, NullLogService } from '../../../../../platform/log/common/log.js';
import { IGitHubAnonymousClient } from '../../../../../platform/github/common/anonymous/anonymous.js';
import { ApiRequestOptions } from '../../../../../platform/github/common/client/request.js';
import { GitHubRequestError } from '../../../../../platform/github/common/githubTypes.js';
import { SchemaError } from '../../../../../platform/github/common/client/schema.js';
import { IOpenerService } from '../../../../../platform/opener/common/opener.js';
import { IAuxiliaryWindow, IAuxiliaryWindowService } from '../../../../services/auxiliaryWindow/browser/auxiliaryWindowService.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';
import { IHostService } from '../../../../services/host/browser/host.js';
import { IWorkbenchGitHubService } from '../../../../services/github/common/githubService.js';
import { IGitHubUploadService } from '../../browser/githubUploadService.js';
import { IssueFormService } from '../../browser/issueFormService.js';
import { IssueWebReporter } from '../../browser/issueReporterService.js';

suite('IssueFormService', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function createInstantiationService() {
		const instantiationService = store.add(new TestInstantiationService());
		instantiationService.stub(IMenuService, {});
		instantiationService.stub(IClipboardService, {});
		instantiationService.stub(IContextKeyService, {});
		instantiationService.stub(IDialogService, {});
		instantiationService.stub(IFileService, {});
		instantiationService.stub(ILogService, {});
		instantiationService.stub(IOpenerService, {});
		instantiationService.stub(IEditorService, {});
		instantiationService.stub(IHostService, {});
		instantiationService.stub(IGitHubUploadService, {});
		instantiationService.stub(IWorkbenchGitHubService, {});
		return instantiationService;
	}

	function createSearchService(search: IGitHubAnonymousClient['search']['issues']) {
		const instantiationService = createInstantiationService();
		const leases = { acquired: 0, released: 0 };
		instantiationService.stub(IWorkbenchGitHubService, new class extends mock<IWorkbenchGitHubService>() {
			override async acquireAnonymousApiClient() {
				leases.acquired++;
				return upcastPartial<IGitHubAnonymousClient>({
					search: { issues: search },
					dispose: () => { leases.released++; },
				});
			}
		}());
		instantiationService.stub(ILogService, new NullLogService());
		return {
			service: store.add(instantiationService.createInstance(IssueFormService)),
			leases,
		};
	}

	test('search uses the anonymous client with a ten-second deadline and returns its items', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const requests: { query: string; options: ApiRequestOptions | undefined }[] = [];
		const deadline = Date.now() + 10_000;
		const items = [{
			id: 1, node_id: 'I_1', number: 1, html_url: 'https://github.com/owner/repo/issues/1',
			repository_url: 'https://api.github.com/repos/owner/repo', title: 'Issue title', state: 'open', user: null, score: 1,
			updated_at: '2026-10-14T01:00:00Z',
		}];
		const { service, leases } = createSearchService(async (query, _signal, options) => {
			requests.push({ query, options });
			return { total_count: 1, incomplete_results: false, items };
		});
		const query = 'title & labels #1';
		const results = await Promise.all([
			service.searchGitHubIssues('owner/repo', query, new AbortController().signal),
			service.searchGitHubIssues('owner/repo', query, new AbortController().signal),
		]);
		assert.deepStrictEqual({ requests, returnedItems: results.map(result => result === items), leases }, {
			requests: [0, 1].map(() => ({ query: `repo:owner/repo ${query}`, options: { caller: 'github.query', deadline } })),
			returnedItems: [true, true],
			leases: { acquired: 2, released: 2 },
		});
	}));

	test('malformed and failed searches remain failures rather than empty successful results', async () => {
		const errors = [new GitHubRequestError('Not Found', 'notFound', 404), new SchemaError('Malformed search response')];
		let calls = 0;
		const { service, leases } = createSearchService(async () => { throw errors[calls++]; });
		for (const [index, expected] of errors.entries()) {
			await assert.rejects(service.searchGitHubIssues('owner/repo', String(index), new AbortController().signal), error => error === expected);
		}
		assert.deepStrictEqual(leases, { acquired: 2, released: 2 });
	});

	test('cancelled and disposed reporters do not issue search requests', async () => {
		const { service, leases } = createSearchService(async () => assert.fail('Cancelled reporters must not search'));
		const controller = new AbortController();
		const reason = new Error('cancelled');
		controller.abort(reason);
		await assert.rejects(service.searchGitHubIssues('owner/repo', 'query', controller.signal), error => error === reason);
		service.dispose();
		await assert.rejects(service.searchGitHubIssues('owner/repo', 'query', new AbortController().signal), isCancellationError);
		assert.deepStrictEqual(leases, { acquired: 0, released: 0 });
	});

	test('disposes the legacy web reporter when its auxiliary window closes', async () => {
		const instantiationService = createInstantiationService();
		const iframe = document.createElement('iframe');
		document.body.appendChild(iframe);
		store.add(toDisposable(() => iframe.remove()));
		const targetWindow = iframe.contentWindow as CodeWindow;
		const events: string[] = [];
		instantiationService.stub(IAuxiliaryWindowService, {
			open: async () => new class extends mock<IAuxiliaryWindow>() {
				override readonly window = targetWindow;
				override readonly container = document.createElement('div');
				override readonly whenStylesHaveLoaded = Promise.resolve();
				override dispose(): void { events.push('window disposed'); }
			}()
		});
		instantiationService.stubInstance(IssueWebReporter, {
			render: () => { events.push('reporter rendered'); },
			dispose: () => { events.push('reporter disposed'); }
		});
		const service = store.add(instantiationService.createInstance(IssueFormService));
		await service.openAuxIssueReporterLegacy({
			styles: {}, zoomLevel: 0, enabledExtensions: [], restrictedMode: false,
			isInstallationPure: true, isSessionsWindow: false, githubAccessToken: '',
		});
		targetWindow.dispatchEvent(new Event('beforeunload'));
		assert.deepStrictEqual(events, ['reporter rendered', 'window disposed', 'reporter disposed']);
	});
});
