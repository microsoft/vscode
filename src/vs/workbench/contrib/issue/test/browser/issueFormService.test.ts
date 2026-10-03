/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { CodeWindow } from '../../../../../base/browser/window.js';
import { Event as VSCodeEvent } from '../../../../../base/common/event.js';
import { toDisposable } from '../../../../../base/common/lifecycle.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IMenuService } from '../../../../../platform/actions/common/actions.js';
import { IClipboardService } from '../../../../../platform/clipboard/common/clipboardService.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { IDialogService } from '../../../../../platform/dialogs/common/dialogs.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ILogService, NullLogService } from '../../../../../platform/log/common/log.js';
import { GitHubService, IGitHubService } from '../../../../../platform/github/common/githubService.js';
import { RequestFetch } from '../../../../../platform/github/common/types.js';
import { NullTelemetryService } from '../../../../../platform/telemetry/common/telemetryUtils.js';
import { IOpenerService } from '../../../../../platform/opener/common/opener.js';
import { IAuxiliaryWindow, IAuxiliaryWindowService } from '../../../../services/auxiliaryWindow/browser/auxiliaryWindowService.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';
import { IHostService } from '../../../../services/host/browser/host.js';
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
		instantiationService.stub(IGitHubService, {});
		return instantiationService;
	}

	function createSearchService(fetch: RequestFetch) {
		const instantiationService = createInstantiationService();
		const logService = new NullLogService();
		const gitHubService = store.add(new GitHubService({
			fetch,
			credentialProvider: {
				onDidChange: VSCodeEvent.None,
				getToken: () => { throw new Error('Issue search must never select an authenticated session'); },
			},
		}, logService, NullTelemetryService));
		instantiationService.stub(IGitHubService, gitHubService);
		instantiationService.stub(ILogService, logService);
		return store.add(instantiationService.createInstance(IssueFormService));
	}

	test('search uses the governed anonymous client and safely encodes the public query', async () => {
		const requests: { query: string | null; authenticated: boolean; credentials: RequestCredentials | undefined }[] = [];
		const service = createSearchService(async (input, init) => {
			requests.push({
				query: new URL(String(input)).searchParams.get('q'),
				authenticated: new Headers(init?.headers).has('Authorization'),
				credentials: init?.credentials,
			});
			return new Response('{"items":[{"html_url":"https://github.com/owner/repo/issues/1","title":"Issue title","state":"open"}]}');
		});
		const query = 'title & labels #1';
		const results = await Promise.all([
			service.searchGitHubIssues('owner/repo', query, new AbortController().signal),
			service.searchGitHubIssues('owner/repo', query, new AbortController().signal),
		]);
		assert.deepStrictEqual({ requests, results }, {
			requests: [{ query: `is:issue repo:owner/repo ${query}`, authenticated: false, credentials: 'omit' }],
			results: Array.from({ length: 2 }, () => [{ html_url: 'https://github.com/owner/repo/issues/1', title: 'Issue title', state: 'open' }]),
		});
	});

	test('malformed and failed searches remain failures rather than empty successful results', async () => {
		let calls = 0;
		const service = createSearchService(async () => ++calls === 1
			? new Response('{"message":"Not Found"}', { status: 404 })
			: new Response('{"items":"not-an-array"}'));
		await assert.rejects(service.searchGitHubIssues('owner/repo', 'first', new AbortController().signal), { kind: 'notFound' });
		await assert.rejects(service.searchGitHubIssues('owner/repo', 'second', new AbortController().signal), { kind: 'malformedResponse' });
	});

	test('cancelled and disposed reporters do not issue search requests', async () => {
		let calls = 0;
		const service = createSearchService(async () => { calls++; return new Response('{"items":[]}'); });
		const controller = new AbortController();
		const reason = new Error('cancelled');
		controller.abort(reason);
		await assert.rejects(service.searchGitHubIssues('owner/repo', 'query', controller.signal), error => error === reason);
		service.dispose();
		await assert.rejects(service.searchGitHubIssues('owner/repo', 'query', new AbortController().signal), /disposed/);
		assert.strictEqual(calls, 0);
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
