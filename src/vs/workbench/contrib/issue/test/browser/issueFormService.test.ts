/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { CodeWindow, mainWindow } from '../../../../../base/browser/window.js';
import { decodeBase64 } from '../../../../../base/common/buffer.js';
import { isCancellationError } from '../../../../../base/common/errors.js';
import { toDisposable } from '../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock, upcastPartial } from '../../../../../base/test/common/mock.js';
import { runWithFakedTimers } from '../../../../../base/test/common/timeTravelScheduler.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IMenuService } from '../../../../../platform/actions/common/actions.js';
import { IClipboardService } from '../../../../../platform/clipboard/common/clipboardService.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { IDialogService } from '../../../../../platform/dialogs/common/dialogs.js';
import { IFileContent, IFileService } from '../../../../../platform/files/common/files.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ILogService, NullLogService } from '../../../../../platform/log/common/log.js';
import { IGitHubAnonymousClient } from '../../../../../platform/github/common/anonymous/anonymous.js';
import { ApiRequestOptions } from '../../../../../platform/github/common/client/request.js';
import { GitHubRequestError } from '../../../../../platform/github/common/githubTypes.js';
import { SchemaError } from '../../../../../platform/github/common/client/schema.js';
import { IOpenerService } from '../../../../../platform/opener/common/opener.js';
import product from '../../../../../platform/product/common/product.js';
import { IAuxiliaryWindow, IAuxiliaryWindowService } from '../../../../services/auxiliaryWindow/browser/auxiliaryWindowService.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';
import { IHostService } from '../../../../services/host/browser/host.js';
import { IWorkbenchGitHubService } from '../../../../services/github/common/githubService.js';
import { IGitHubUploadService } from '../../browser/githubUploadService.js';
import { IssueFormService } from '../../browser/issueFormService.js';
import { IssueWebReporter } from '../../browser/issueReporterService.js';
import { IIssueSubmissionHost, IssueReporterData, IssueSource } from '../../common/issue.js';
import { internalIssueReporterUrl, parseGitHubRepository } from '../../common/issueReporterTarget.js';
import { issueReporterAvifFixture, issueReporterGifFixture, issueReporterImageFixture, issueReporterVideoFixtures, issueReporterWebpFixture } from '../common/issueReporterMediaFixtures.js';

suite('IssueFormService', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function getProductIssueRepository(): string {
		const repository = parseGitHubRepository(product.reportIssueUrl!);
		assert.ok(repository);
		return `${repository.owner}/${repository.repositoryName}`;
	}

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

	function createSubmissionService(withScreenshot = false, failUploads = false, media?: {
		screenshots: ReturnType<IIssueSubmissionHost['getScreenshots']>;
		recordings: ReturnType<IIssueSubmissionHost['getRecordings']>;
	}) {
		const instantiationService = createInstantiationService();
		const opened: string[] = [];
		const repositories: string[] = [];
		const uploads: { repository: string; names: string[] }[] = [];
		const mediaUploads: { repository: string; name: string; contentType: string }[] = [];
		const fileReads: URI[] = [];
		const errors = { logged: [] as string[], shown: [] as string[] };
		instantiationService.stub(ILogService, new class extends NullLogService {
			override error(message: string | Error): void { errors.logged.push(String(message)); }
		}());
		instantiationService.stub(IDialogService, { error: async message => { errors.shown.push(message); } });
		instantiationService.stub(IOpenerService, { open: async resource => { opened.push(resource.toString()); return true; } });
		instantiationService.stub(IFileService, {
			readFile: async resource => {
				fileReads.push(resource);
				const value = decodeBase64(resource.path.endsWith('.webm') ? issueReporterVideoFixtures.webm : resource.path.endsWith('.mov') ? issueReporterVideoFixtures.mov : issueReporterVideoFixtures.mp4);
				return new class extends mock<IFileContent>() { override readonly value = value; }();
			},
		});
		instantiationService.stub(IGitHubUploadService, {
			resolveRepositoryId: async (owner, repository) => {
				const id = `${owner}/${repository}`;
				repositories.push(id);
				return id;
			},
			uploadViaMobileApi: async (_token, repository, files) => {
				uploads.push({ repository, names: files.map(file => file.name) });
				mediaUploads.push(...files.map(file => ({ repository, name: file.name, contentType: file.contentType })));
				if (failUploads) {
					throw new Error('Upload rejected');
				}
				return files.map(file => ({ fileName: file.name, contentType: file.contentType, assetUrl: `https://github.com/attachments/${repository}/${file.name}` }));
			},
		});
		const host = new class extends mock<IIssueSubmissionHost>() {
			override getScreenshots() { return media?.screenshots ?? (withScreenshot ? [{ dataUrl: 'data:image/png;base64,aGVsbG8=' }] : []); }
			override getRecordings() { return media?.recordings ?? []; }
			override setUploading() { }
			override setAttachmentUploadState() { }
		}();
		const data: IssueReporterData = {
			styles: {}, zoomLevel: 0, enabledExtensions: [], restrictedMode: false,
			isInstallationPure: true, isSessionsWindow: false, githubAccessToken: 'test-token',
			issueSource: IssueSource.VSCode,
			privateUri: URI.parse(internalIssueReporterUrl),
		};
		return { service: store.add(instantiationService.createInstance(IssueFormService)), host, data, opened, repositories, uploads, errors, mediaUploads, fileReads };
	}

	test('uploads all supported imported image formats with matching MIME types and extensions', async () => {
		const canvas = mainWindow.document.createElement('canvas');
		canvas.width = 48;
		canvas.height = 32;
		const sources = [issueReporterImageFixture, canvas.toDataURL('image/jpeg'), issueReporterGifFixture, issueReporterWebpFixture, issueReporterAvifFixture];
		const { service, host, data, mediaUploads } = createSubmissionService(false, false, { screenshots: sources.map(dataUrl => ({ dataUrl })), recordings: [] });
		const productRepository = getProductIssueRepository();
		await service.submitIssue(host, data, 'Imported images', 'Description');
		assert.deepStrictEqual(mediaUploads, [
			{ repository: productRepository, name: 'screenshot-1.png', contentType: 'image/png' },
			{ repository: productRepository, name: 'screenshot-2.jpg', contentType: 'image/jpeg' },
			{ repository: productRepository, name: 'screenshot-3.gif', contentType: 'image/gif' },
			{ repository: productRepository, name: 'screenshot-4.webp', contentType: 'image/webp' },
			{ repository: productRepository, name: 'screenshot-5.avif', contentType: 'image/avif' },
		]);
	});

	test('uploads an annotated import as PNG without reusing the unannotated upload', async () => {
		const screenshot: { dataUrl: string; annotatedDataUrl?: string } = { dataUrl: issueReporterGifFixture };
		const { service, host, data, mediaUploads } = createSubmissionService(false, false, { screenshots: [screenshot], recordings: [] });
		const productRepository = getProductIssueRepository();
		await service.submitIssue(host, data, 'Before annotation', 'Description');
		screenshot.annotatedDataUrl = issueReporterImageFixture;
		await service.submitIssue(host, data, 'After annotation', 'Description');
		assert.deepStrictEqual(mediaUploads, [
			{ repository: productRepository, name: 'screenshot-1.gif', contentType: 'image/gif' },
			{ repository: productRepository, name: 'screenshot-1.png', contentType: 'image/png' },
		]);
	});

	test('keeps imported videos and their cached uploads isolated by repository and preserves query overrides', async () => {
		const { service, host, data, opened, mediaUploads } = createSubmissionService(false, false, {
			screenshots: [],
			recordings: ['mp4', 'webm', 'mov'].map(extension => ({ filePath: `/owned/import.${extension}` })),
		});
		const productRepository = getProductIssueRepository();
		const privateUri = URI.parse('https://github.com/owner/private-reports/issues/new?labels=internal&assignees=maintainer');
		for (const issueRepository of ['owner/private-reports', 'microsoft/vscode', 'owner/private-reports']) {
			await service.submitIssue(host, { ...data, privateUri, issueRepository }, 'Imported videos', 'Description');
		}
		assert.deepStrictEqual({
			mediaUploads,
			previews: opened.map(value => {
				const url = new URL(value);
				return { path: url.pathname, labels: url.searchParams.get('labels'), assignees: url.searchParams.get('assignees'), template: url.searchParams.get('template'), privateLinks: url.searchParams.get('body')?.includes('/attachments/owner/private-reports/') };
			}),
		}, {
			mediaUploads: ['owner/private-reports', productRepository].flatMap(repository => [
				{ repository, name: 'recording-1.mp4', contentType: 'video/mp4' },
				{ repository, name: 'recording-2.webm', contentType: 'video/webm' },
				{ repository, name: 'recording-3.mov', contentType: 'video/quicktime' },
			]),
			previews: [
				{ path: '/owner/private-reports/issues/new', labels: 'internal', assignees: 'maintainer', template: null, privateLinks: true },
				{ path: `/${productRepository}/issues/new`, labels: null, assignees: null, template: 'bug_report.md', privateLinks: false },
				{ path: '/owner/private-reports/issues/new', labels: 'internal', assignees: 'maintainer', template: null, privateLinks: true },
			],
		});
	});

	test('does not read or upload imported videos for a fail-closed private destination', async () => {
		const { service, host, data, fileReads, mediaUploads, opened } = createSubmissionService(false, false, { screenshots: [], recordings: [{ filePath: '/owned/import.mp4' }] });
		const openedPreview = await service.submitIssue(host, { ...data, issueRepository: 'owner/missing', privateUri: undefined }, 'Private report', 'Private diagnostics');
		assert.deepStrictEqual({ openedPreview, fileReads, mediaUploads, opened }, { openedPreview: false, fileReads: [], mediaUploads: [], opened: [] });
	});

	test('rejects an unavailable destination before upload or open and reports the failure', async () => {
		const { service, host, data, opened, repositories, uploads, errors } = createSubmissionService(true);
		const result = await service.submitIssue(host, {
			...data, issueRepository: 'owner/missing', privateUri: URI.parse('https://github.com/microsoft/vscode'),
		}, 'Private title', 'Private diagnostics');
		assert.deepStrictEqual({ result, opened, repositories, uploads, errors }, {
			result: false, opened: [], repositories: [], uploads: [],
			errors: {
				logged: ['[IssueFormService] Invalid issue reporting destination.'],
				shown: ['The selected issue destination is invalid. No issue data was sent.'],
			},
		});
	});

	test('public and internal previews upload screenshots to their own repository, including after a retry', async () => {
		const { service, host, data, opened, repositories, uploads } = createSubmissionService(true);
		const productRepository = getProductIssueRepository();
		for (const issueRepository of ['microsoft/vscode', 'microsoft/vscode-internalbacklog', 'microsoft/vscode']) {
			await service.submitIssue(host, { ...data, issueRepository }, 'Title #1', 'Description & details');
		}
		assert.deepStrictEqual({
			repositories,
			uploads,
			previews: opened.map(value => {
				const url = new URL(value);
				return {
					path: url.pathname,
					title: url.searchParams.get('title'),
					body: url.searchParams.get('body'),
					template: url.searchParams.get('template'),
				};
			}),
		}, {
			repositories: [productRepository, 'microsoft/vscode-internalbacklog'],
			uploads: [
				{ repository: productRepository, names: ['screenshot-1.png'] },
				{ repository: 'microsoft/vscode-internalbacklog', names: ['screenshot-1.png'] },
			],
			previews: [productRepository, 'microsoft/vscode-internalbacklog', productRepository].map(repository => ({
				path: `/${repository}/issues/new`,
				title: 'Title #1',
				body: `Description & details\n\n### Attachments\n\n![screenshot-1.png](https://github.com/attachments/${repository}/screenshot-1.png)\n\n`,
				template: 'bug_report.md',
			})),
		});
	});

	test('configured second and third repositories use matching preview and upload targets with repository-bound retry caches', async () => {
		const { service, host, data, opened, repositories, uploads } = createSubmissionService(true);
		const additionalRepositories = ['owner/second', 'team/third'];
		for (const issueRepository of ['owner/second', 'team/third', 'OWNER/SECOND']) {
			await service.submitIssue(host, { ...data, additionalRepositories, issueRepository }, 'Title #1', 'Description');
		}
		assert.deepStrictEqual({
			repositories, uploads,
			previews: opened.map(value => {
				const url = new URL(value);
				return { origin: url.origin, path: url.pathname, title: url.searchParams.get('title'), body: url.searchParams.get('body'), template: url.searchParams.get('template') };
			}),
		}, {
			repositories: additionalRepositories,
			uploads: additionalRepositories.map(repository => ({ repository, names: ['screenshot-1.png'] })),
			previews: ['owner/second', 'team/third', 'owner/second'].map(repository => ({
				origin: 'https://github.com', path: `/${repository}/issues/new`, title: 'Title #1', template: null,
				body: `Description\n\n### Attachments\n\n![screenshot-1.png](https://github.com/attachments/${repository}/screenshot-1.png)\n\n`,
			})),
		});
	});

	test('large issue-data attachments are also isolated by destination', async () => {
		const { service, host, data, opened, repositories, uploads } = createSubmissionService();
		const productRepository = getProductIssueRepository();
		const body = `Description\n\n<details><summary>Diagnostics</summary>${'x'.repeat(8000)}</details>\n\n<!-- generated by issue reporter -->`;
		for (const issueRepository of ['microsoft/vscode', 'microsoft/vscode-internalbacklog', 'microsoft/vscode-internalbacklog']) {
			await service.submitIssue(host, { ...data, issueRepository }, 'Large issue', body);
		}
		assert.deepStrictEqual({
			repositories,
			uploads,
			previews: opened.map(value => {
				const url = new URL(value);
				return { path: url.pathname, body: url.searchParams.get('body') };
			}),
		}, {
			repositories: [productRepository, 'microsoft/vscode-internalbacklog', 'microsoft/vscode-internalbacklog'],
			uploads: [
				{ repository: productRepository, names: ['issue-data.md'] },
				{ repository: 'microsoft/vscode-internalbacklog', names: ['issue-data.md'] },
			],
			previews: [productRepository, 'microsoft/vscode-internalbacklog', 'microsoft/vscode-internalbacklog'].map(repository => ({
				path: `/${repository}/issues/new`,
				body: `Description\n\n### Additional Issue Data\n\n[issue-data.md](https://github.com/attachments/${repository}/issue-data.md)\n\n<!-- generated by issue reporter -->`,
			})),
		});
	});

	for (const useToken of [false, true]) {
		test(`explicitly private diagnostics stay private ${useToken ? 'after upload failure' : 'without authentication'}`, async () => {
			const { service, host, data, opened, repositories } = createSubmissionService(true, true);
			const result = await service.submitIssue(host, {
				...data, uri: URI.parse(internalIssueReporterUrl), githubAccessToken: useToken ? 'test-token' : '',
			}, 'Private title', 'Private diagnostics');
			const url = new URL(opened[0]);
			assert.deepStrictEqual({ result, path: url.pathname, title: url.searchParams.get('title'), repositories }, {
				result: true, path: '/microsoft/vscode-internalbacklog/issues/new', title: 'Private title',
				repositories: useToken ? ['microsoft/vscode-internalbacklog'] : [],
			});
		});
	}

	test('missing selected private destination fails without opening or uploading anything', async () => {
		const { service, host, data, opened, repositories, uploads } = createSubmissionService(true);
		const result = await service.submitIssue(host, { ...data, privateUri: undefined, issueRepository: 'owner/missing' }, 'Private', 'Private data');
		assert.deepStrictEqual({ result, opened, repositories, uploads }, { result: false, opened: [], repositories: [], uploads: [] });
	});

	test('explicit URI overrides control preview and attachment target', async () => {
		const { service, host, data, opened, repositories } = createSubmissionService(true);
		await service.submitIssue(host, { ...data, uri: URI.parse('https://github.com/owner/custom?labels=bug') }, 'Title #1', 'Body');
		const url = new URL(opened[0]);
		assert.deepStrictEqual({
			path: url.pathname, labels: url.searchParams.get('labels'), title: url.searchParams.get('title'), repositories,
		}, { path: '/owner/custom/issues/new', labels: 'bug', title: 'Title #1', repositories: ['owner/custom'] });
	});

	test('preview preserves an explicit template and fragment while encoding title and body once', async () => {
		const { service, host, data, opened } = createSubmissionService();
		const result = await service.submitIssue(host, {
			...data, uri: URI.parse('https://github.com/microsoft/vscode/issues/new?labels=area%2Fissue+reporter&template=custom.yml#details'),
		}, 'Title #1 & 50%', '## Details\nA + B & café? #');
		assert.deepStrictEqual({ result, opened }, {
			result: true,
			opened: ['https://github.com/microsoft/vscode/issues/new?labels=area%2Fissue+reporter&template=custom.yml&title=Title+%231+%26+50%25&body=%23%23+Details%0AA+%2B+B+%26+caf%C3%A9%3F+%23#details'],
		});
	});

	test('explicit private diagnostics retain custom query parameters and fragment instead of using a configured public target', async () => {
		const { service, host, data, opened, repositories } = createSubmissionService(true);
		const uri = URI.parse('https://github.com/owner/private?labels=diagnostics&template=private.yml#context');
		await service.submitIssue(host, {
			...data, uri, privateUri: uri, additionalRepositories: ['microsoft/vscode'], issueRepository: 'microsoft/vscode',
		}, 'Private report', 'Private diagnostics');
		const url = new URL(opened[0]);
		assert.deepStrictEqual({
			path: url.pathname, query: Object.fromEntries(url.searchParams), fragment: url.hash, repositories,
		}, {
			path: '/owner/private/issues/new', fragment: '#context', repositories: ['owner/private'],
			query: {
				labels: 'diagnostics', template: 'private.yml', title: 'Private report',
				body: 'Private diagnostics\n\n### Attachments\n\n![screenshot-1.png](https://github.com/attachments/owner/private/screenshot-1.png)\n\n',
			},
		});
	});

	test('Marketplace and extension reports ignore the product repository choice', async () => {
		const { service, host, data, opened, repositories } = createSubmissionService(true);
		const privateData = { ...data, uri: URI.parse(internalIssueReporterUrl), additionalRepositories: ['owner/second'], issueRepository: 'owner/second' };
		await service.submitIssue(host, { ...privateData, issueSource: IssueSource.Marketplace }, 'Marketplace', 'Body');
		await service.submitIssue(host, {
			...privateData, issueSource: IssueSource.Extension, extensionId: 'publisher.extension',
			enabledExtensions: [{
				id: 'publisher.extension', name: 'extension', displayName: 'Extension', publisher: 'publisher',
				version: '1', isTheme: false, isBuiltin: false, bugsUrl: 'https://github.com/owner/extension/issues', repositoryUrl: undefined,
			}],
		}, 'Extension', 'Body');
		const marketplacePath = new URL(product.reportMarketplaceIssueUrl ?? product.reportIssueUrl!).pathname.replace(/\/issues(?:\/new)?\/?$/, '');
		assert.deepStrictEqual({ paths: opened.map(value => new URL(value).pathname), repositories }, {
			paths: [`${marketplacePath}/issues/new`, '/owner/extension/issues/new'],
			repositories: [marketplacePath.slice(1), 'owner/extension'],
		});
	});

	test('external extension handlers receive no issue body or attachment uploads', async () => {
		const { service, host, data, opened, repositories } = createSubmissionService(true);
		await service.submitIssue(host, {
			...data, issueRepository: 'owner/second', issueSource: IssueSource.Extension, extensionId: 'publisher.extension',
			enabledExtensions: [{
				id: 'publisher.extension', name: 'extension', displayName: 'Extension', publisher: 'publisher',
				version: '1', isTheme: false, isBuiltin: false, bugsUrl: 'https://example.com/feedback', repositoryUrl: undefined,
			}],
		}, 'Title', 'Body');
		assert.deepStrictEqual({ opened, repositories }, { opened: ['https://example.com/feedback'], repositories: [] });
	});

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
