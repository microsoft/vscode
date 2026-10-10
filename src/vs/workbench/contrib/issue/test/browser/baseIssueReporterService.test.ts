/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { $ } from '../../../../../base/browser/dom.js';
import { DeferredPromise, timeout } from '../../../../../base/common/async.js';
import { Event as VSCodeEvent } from '../../../../../base/common/event.js';
import { toDisposable } from '../../../../../base/common/lifecycle.js';
import { IProductConfiguration } from '../../../../../base/common/product.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { runWithFakedTimers } from '../../../../../base/test/common/timeTravelScheduler.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IContextMenuService } from '../../../../../platform/contextview/browser/contextView.js';
import { IFileDialogService } from '../../../../../platform/dialogs/common/dialogs.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { IOpenerService } from '../../../../../platform/opener/common/opener.js';
import { IThemeService } from '../../../../../platform/theme/common/themeService.js';
import { IAuthenticationService } from '../../../../services/authentication/common/authentication.js';
import { BaseIssueReporterService } from '../../browser/baseIssueReporterService.js';
import { IIssueFormService, ISimilarIssue } from '../../common/issue.js';

suite('BaseIssueReporterService', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const currentIssue: ISimilarIssue = { html_url: 'https://github.com/owner/repo/issues/1', title: 'Current issue' };
	const staleIssue: ISimilarIssue = { html_url: 'https://github.com/owner/repo/issues/2', title: 'Stale issue' };

	function createDuplicateResponse(candidates: readonly ISimilarIssue[]): Response {
		return new class extends Response {
			override async json(): Promise<{ candidates: readonly ISimilarIssue[] }> { return { candidates }; }
		}();
	}

	function createReporter(
		searchGitHubIssues: IIssueFormService['searchGitHubIssues'] = async () => [currentIssue],
		fetcher: typeof fetch = async () => { throw new Error('Unexpected duplicate search'); },
	) {
		const iframe = document.createElement('iframe');
		document.body.appendChild(iframe);
		store.add(toDisposable(() => iframe.remove()));
		const targetWindow = iframe.contentWindow;
		assert.ok(targetWindow);
		const title = $<HTMLInputElement>('input#issue-title');
		const description = $<HTMLTextAreaElement>('textarea#description');
		const results = $('div#similar-issues');
		targetWindow.document.body.append(
			title, description, results,
			$('select#issue-type'), $('select#issue-source'), $('button#disableExtensions'),
		);
		const styles = new Set(document.head.querySelectorAll('#codiconStyles'));
		store.add(toDisposable(() => {
			for (const style of document.head.querySelectorAll('#codiconStyles')) {
				if (!styles.has(style)) {
					style.remove();
				}
			}
		}));
		const instantiationService = store.add(new TestInstantiationService());
		instantiationService.stub(IIssueFormService, { searchGitHubIssues });
		instantiationService.stub(IThemeService, {
			onDidProductIconThemeChange: VSCodeEvent.None,
			getProductIconTheme: () => ({ getIcon: () => undefined }),
		});
		instantiationService.stub(IFileService, {});
		instantiationService.stub(IFileDialogService, {});
		instantiationService.stub(IContextMenuService, {});
		instantiationService.stub(IAuthenticationService, { onDidChangeSessions: VSCodeEvent.None });
		instantiationService.stub(IOpenerService, {});
		const warnings: string[] = [];
		instantiationService.stub(ILogService, { warn: message => { warnings.push(message); } });
		const reporter = store.add(instantiationService.createInstance(BaseIssueReporterService, false, {
			styles: {}, zoomLevel: 0, enabledExtensions: [], restrictedMode: false,
			isInstallationPure: true, isSessionsWindow: false, githubAccessToken: '',
		}, { type: 'test', arch: 'test', release: 'test' }, new class extends mock<IProductConfiguration>() {
			override readonly nameShort = 'Test';
			override readonly version = '1.0.0';
			override readonly reportMarketplaceIssueUrl = 'https://github.com/owner/marketplace/issues';
		}(), targetWindow, true, fetcher));
		reporter.issueReporterModel.update({
			selectedExtension: {
				id: 'publisher.extension', name: 'extension', displayName: 'Extension', version: '1.0.0',
				publisher: 'publisher', isBuiltin: false, isTheme: false,
				repositoryUrl: 'https://github.com/owner/extension', bugsUrl: undefined,
			},
		});
		return { reporter, title, description, results, warnings };
	}

	for (const source of ['marketplace', 'extension'] as const) {
		for (const timing of ['debounce', 'active'] as const) {
			test(`stale duplicate results do not cancel a ${source} search during ${timing}`, () => runWithFakedTimers({}, async () => {
				const duplicates = new DeferredPromise<Response>();
				const search = new DeferredPromise<readonly ISimilarIssue[]>();
				const calls: { repo: string; title: string; signal: AbortSignal }[] = [];
				const { reporter, results } = createReporter((repo, title, signal) => {
					calls.push({ repo, title, signal });
					return search.p;
				}, () => duplicates.p);
				reporter.searchVSCodeIssues('Previous title', 'Previous description');
				await timeout(301);
				reporter.searchIssues('Current title', source === 'extension', source === 'marketplace');
				if (timing === 'active') {
					await timeout(301);
				}
				await duplicates.complete(createDuplicateResponse([staleIssue]));
				await timeout(0);
				if (timing === 'debounce') {
					assert.strictEqual(calls.length, 0);
				}
				await timeout(301);
				await search.complete([currentIssue]);
				await timeout(0);
				assert.deepStrictEqual({
					calls: calls.map(call => ({ repo: call.repo, title: call.title, aborted: call.signal.aborted })),
					titles: Array.from(results.querySelectorAll('a'), link => link.textContent),
				}, {
					calls: [{ repo: `owner/${source}`, title: 'Current title', aborted: false }],
					titles: [currentIssue.title],
				});
			}));
		}
	}

	test('renders current product duplicate results without cancelling their request', () => runWithFakedTimers({}, async () => {
		let request: RequestInit | undefined;
		const { reporter, results } = createReporter(undefined, async (_url, init) => {
			request = init;
			return createDuplicateResponse([currentIssue]);
		});
		reporter.searchVSCodeIssues('Current title', 'Current description');
		await timeout(301);
		assert.deepStrictEqual({
			method: request?.method,
			body: request?.body,
			aborted: request?.signal?.aborted,
			titles: Array.from(results.querySelectorAll('a'), link => link.textContent),
		}, {
			method: 'POST',
			body: JSON.stringify({ title: 'Current title', body: 'Current description' }),
			aborted: false,
			titles: [currentIssue.title],
		});
	}));

	test('editing a Marketplace description does not start a product duplicate search', () => runWithFakedTimers({}, async () => {
		let duplicateCalls = 0;
		const { reporter, title, description, results } = createReporter(undefined, async () => {
			duplicateCalls++;
			return createDuplicateResponse([staleIssue]);
		});
		reporter.issueReporterModel.update({ fileOnExtension: false, fileOnMarketplace: true });
		reporter.setEventHandlers();
		title.value = 'Current title';
		reporter.searchIssues(title.value, false, true);
		description.value = 'Updated description';
		description.dispatchEvent(new Event('input'));
		await timeout(301);
		assert.deepStrictEqual({
			duplicateCalls,
			titles: Array.from(results.querySelectorAll('a'), link => link.textContent),
		}, { duplicateCalls: 0, titles: [currentIssue.title] });
	}));

	test('failed GitHub searches do not keep results for the previous title', () => runWithFakedTimers({}, async () => {
		const failure = new DeferredPromise<readonly ISimilarIssue[]>();
		const { reporter, results, warnings } = createReporter(async (_repo, title) => title === 'First title' ? [staleIssue] : failure.p);
		reporter.searchIssues('First title', false, true);
		await timeout(301);
		assert.strictEqual(results.querySelector('a')?.textContent, staleIssue.title);
		reporter.searchIssues('Second title', false, true);
		await timeout(301);
		await failure.error(new Error('Search quota exhausted'));
		await timeout(0);
		assert.deepStrictEqual({
			titles: Array.from(results.querySelectorAll('a'), link => link.textContent),
			count: reporter.numberOfSearchResultsDisplayed,
			warnings,
		}, { titles: [], count: 0, warnings: ['[IssueReporter] Error fetching GitHub issues'] });
	}));

	for (const backend of ['github', 'duplicates'] as const) {
		for (const action of ['clear', 'dispose'] as const) {
			test(`${action} cancels a debounced ${backend} search`, () => runWithFakedTimers({}, async () => {
				let calls = 0;
				const { reporter } = createReporter(async () => { calls++; return []; }, async () => {
					calls++;
					return createDuplicateResponse([]);
				});
				reporter.searchIssues('Title', false, backend === 'github');
				if (action === 'clear') {
					reporter.clearSearchResults();
				} else {
					reporter.dispose();
				}
				await timeout(301);
				assert.strictEqual(calls, 0);
			}));

			test(`${action} aborts an active ${backend} search and suppresses late results`, () => runWithFakedTimers({}, async () => {
				const pending = new DeferredPromise<void>();
				let signal: AbortSignal | null | undefined;
				const { reporter, results } = createReporter(async (_repo, _title, requestSignal) => {
					signal = requestSignal;
					await pending.p;
					return [staleIssue];
				}, async (_url, init) => {
					signal = init?.signal;
					await pending.p;
					return createDuplicateResponse([staleIssue]);
				});
				reporter.searchIssues('Title', false, backend === 'github');
				await timeout(301);
				if (action === 'clear') {
					reporter.clearSearchResults();
				} else {
					reporter.dispose();
				}
				await pending.complete();
				await timeout(0);
				assert.deepStrictEqual({ aborted: signal?.aborted, text: results.textContent }, { aborted: true, text: '' });
			}));
		}
	}
});
