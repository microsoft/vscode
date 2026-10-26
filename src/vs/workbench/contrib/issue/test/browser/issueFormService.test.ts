/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { restore, stub } from 'sinon';
import { CodeWindow, mainWindow } from '../../../../../base/browser/window.js';
import { DeferredPromise } from '../../../../../base/common/async.js';
import { decodeBase64, VSBuffer } from '../../../../../base/common/buffer.js';
import { CancellationError, isCancellationError } from '../../../../../base/common/errors.js';
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
import { IIssueReporterAttachmentUpload, IIssueReporterFileAttachment, IIssueReporterScreenshot, IIssueSubmissionHost, IssueReporterAttachment, IssueReporterData, IssueSource } from '../../common/issue.js';
import { internalIssueReporterUrl, parseGitHubRepository } from '../../common/issueReporterTarget.js';
import { issueReporterAvifFixture, issueReporterGifFixture, issueReporterImageFixture, issueReporterVideoFixtures, issueReporterWebpFixture } from '../common/issueReporterMediaFixtures.js';

suite('IssueFormService', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	teardown(() => restore());

	function capturedScreenshot(screenshot: IIssueReporterScreenshot, id = 'screenshot'): IssueReporterAttachment {
		return { id, kind: 'screenshot', screenshot };
	}

	function attachedFile(file: IIssueReporterFileAttachment): IssueReporterAttachment {
		return { id: file.filePath, kind: 'file', file };
	}

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
		attachments: readonly IssueReporterAttachment[];
		contents?: Uint8Array;
	}) {
		const instantiationService = createInstantiationService();
		const opened: string[] = [];
		const repositories: string[] = [];
		const uploads: { repository: string; names: string[] }[] = [];
		const uploadTokens: string[] = [];
		const mediaUploads: { repository: string; name: string; contentType: string }[] = [];
		const fileReads: URI[] = [];
		const payloads: { name: string; contentType: string; bytes: number[] }[] = [];
		const uploadErrors: (string | undefined)[] = [];
		const uploadErrorDetails: (string | undefined)[] = [];
		const progress: { id: string; state: string }[] = [];
		const uploading: boolean[] = [];
		const failures = { remaining: failUploads ? Infinity : 0, message: 'Upload rejected' };
		const loggedFailures: Error[] = [];
		const errors = { logged: [] as string[], shown: [] as string[] };
		const controls: {
			read?: () => Promise<void>;
			repository?: () => Promise<void>;
			upload?: () => Promise<void>;
			clipboard?: () => Promise<void>;
			progress?: (state: string) => void;
		} = {};
		const clipboardWrites: string[] = [];
		instantiationService.stub(IClipboardService, {
			writeText: async value => {
				clipboardWrites.push(value);
				await controls.clipboard?.();
			},
		});
		instantiationService.stub(ILogService, new class extends NullLogService {
			override error(message: string | Error, error?: Error): void {
				errors.logged.push(String(message));
				if (error) {
					loggedFailures.push(error);
				}
			}
		}());
		instantiationService.stub(IDialogService, { error: async message => { errors.shown.push(message); } });
		instantiationService.stub(IOpenerService, { open: async resource => { opened.push(resource.toString()); return true; } });
		instantiationService.stub(IFileService, {
			readFile: async resource => {
				fileReads.push(resource);
				await controls.read?.();
				const value = media?.contents ? VSBuffer.wrap(media.contents) : decodeBase64(resource.path.endsWith('.webm') ? issueReporterVideoFixtures.webm : resource.path.endsWith('.mov') ? issueReporterVideoFixtures.mov : issueReporterVideoFixtures.mp4);
				return new class extends mock<IFileContent>() { override readonly value = value; }();
			},
		});
		instantiationService.stub(IGitHubUploadService, {
			resolveRepositoryId: async (owner, repository) => {
				const id = `${owner}/${repository}`;
				repositories.push(id);
				await controls.repository?.();
				return id;
			},
			uploadViaMobileApi: async (token, repository, files) => {
				uploadTokens.push(token);
				uploads.push({ repository, names: files.map(file => file.name) });
				mediaUploads.push(...files.map(file => ({ repository, name: file.name, contentType: file.contentType })));
				payloads.push(...files.map(file => ({ name: file.name, contentType: file.contentType, bytes: [...file.bytes] })));
				await controls.upload?.();
				if (failures.remaining > 0) {
					failures.remaining--;
					throw new Error(failures.message);
				}
				return files.map(file => ({ fileName: file.name, contentType: file.contentType, assetUrl: `https://github.com/attachments/${repository}/${file.name}` }));
			},
		});
		const attachments = media?.attachments ?? (withScreenshot ? [capturedScreenshot({ dataUrl: 'data:image/png;base64,aGVsbG8=' })] : []);
		const host = new class extends mock<IIssueSubmissionHost>() {
			override getAttachments() { return attachments; }
			override setUploading(value: boolean) { uploading.push(value); }
			override setAttachmentUploadState(attachment: IssueReporterAttachment, upload: IIssueReporterAttachmentUpload) {
				progress.push({ id: attachment.id, state: upload.state });
				controls.progress?.(upload.state);
			}
			override setAttachmentUploadError(message: string | undefined, details?: string) { uploadErrors.push(message); uploadErrorDetails.push(details); }
		}();
		const data: IssueReporterData = {
			styles: {}, zoomLevel: 0, enabledExtensions: [], restrictedMode: false,
			isInstallationPure: true, isSessionsWindow: false, githubAccessToken: 'test-token',
			issueSource: IssueSource.VSCode,
			privateUri: URI.parse(internalIssueReporterUrl),
		};
		return { service: store.add(instantiationService.createInstance(IssueFormService)), host, data, opened, repositories, uploads, uploadTokens, errors, mediaUploads, fileReads, payloads, uploadErrors, uploadErrorDetails, loggedFailures, progress, uploading, failures, controls, clipboardWrites };
	}

	for (const hasAttachments of [false, true]) {
		for (const lookupFails of [false, true]) {
			test(`cancels a ${hasAttachments ? 'media' : 'text-only'} submission during ${lookupFails ? 'rejected' : 'successful'} session lookup without logging or opening`, async () => {
				const { service, host, data, opened, uploads, errors, uploadErrors, uploading } = createSubmissionService(hasAttachments);
				const token = new DeferredPromise<string>();
				data.getGitHubAccessToken = () => token.p;
				const cancellation = new AbortController();
				const submission = service.submitIssue(host, data, 'Cancelled', 'Description', cancellation.signal);
				const rejected = assert.rejects(submission, isCancellationError);
				cancellation.abort(new CancellationError());
				if (lookupFails) {
					await token.error(new Error('Late authentication failure'));
				} else {
					await token.complete('late-token');
				}
				await rejected;
				assert.deepStrictEqual({ opened, uploads, errors, uploadErrors, uploading, token: data.githubAccessToken }, {
					opened: [], uploads: [], errors: { logged: [], shown: [] }, uploadErrors: [undefined], uploading: [true, false], token: 'test-token',
				});
			});
		}
	}

	for (const phase of ['read', 'repository', 'upload'] as const) {
		test(`does not resume attachment submission after cancellation during ${phase}`, async () => {
			const { service, host, data, controls, opened, uploads, errors, uploadErrors, progress } = createSubmissionService(false, false, {
				attachments: [attachedFile({ filePath: '/owned/report.json', name: 'report.json', mimeType: 'application/json' })],
			});
			const started = new DeferredPromise<void>();
			const gate = new DeferredPromise<void>();
			controls[phase] = () => {
				void started.complete();
				return gate.p;
			};
			const cancellation = new AbortController();
			const submission = service.submitIssue(host, data, 'Cancelled', 'Description', cancellation.signal);
			const rejected = assert.rejects(submission, isCancellationError);
			await started.p;
			cancellation.abort(new CancellationError());
			await gate.complete();
			await rejected;
			assert.deepStrictEqual({
				opened, uploads: uploads.length, errors, uploadErrors, completed: progress.filter(item => item.state === 'done'),
			}, { opened: [], uploads: phase === 'upload' ? 1 : 0, errors: { logged: [], shown: [] }, uploadErrors: [undefined], completed: [] });
		});
	}

	test('checks cancellation immediately before starting a media upload', async () => {
		const { service, host, data, controls, uploads, opened, errors } = createSubmissionService(true);
		const cancellation = new AbortController();
		controls.progress = state => {
			if (state === 'uploading') {
				cancellation.abort(new CancellationError());
			}
		};
		await assert.rejects(service.submitIssue(host, data, 'Cancelled', 'Description', cancellation.signal), isCancellationError);
		assert.deepStrictEqual({ uploads, opened, errors }, { uploads: [], opened: [], errors: { logged: [], shown: [] } });
	});

	test('checks cancellation on cached media results before opening the preview', async () => {
		const { service, host, data, controls, uploads, opened, errors } = createSubmissionService(true);
		await service.submitIssue(host, data, 'First preview', 'Description');
		const cancellation = new AbortController();
		controls.progress = state => {
			if (state === 'done') {
				cancellation.abort(new CancellationError());
			}
		};
		await assert.rejects(service.submitIssue(host, data, 'Cancelled retry', 'Description', cancellation.signal), isCancellationError);
		assert.deepStrictEqual({ uploads: uploads.length, previews: opened.map(url => new URL(url).searchParams.get('title')), errors }, {
			uploads: 1, previews: ['First preview'], errors: { logged: [], shown: [] },
		});
	});

	for (const cached of [false, true]) {
		test(`cancellation of ${cached ? 'cached' : 'new'} issue-data uploads does not fall through to confirmation or opening`, async () => {
			const { service, host, data, controls, uploads, opened, errors, clipboardWrites } = createSubmissionService();
			const body = `Description\n\n<details><summary>Diagnostics</summary>${'x'.repeat(8000)}</details>`;
			if (cached) {
				await service.submitIssue(host, data, 'First preview', body);
			}
			const started = new DeferredPromise<void>();
			const gate = new DeferredPromise<void>();
			controls[cached ? 'repository' : 'upload'] = () => {
				void started.complete();
				return gate.p;
			};
			const confirmation = stub(service, 'showClipboardDialog').resolves(true);
			const cancellation = new AbortController();
			const submission = service.submitIssue(host, data, 'Cancelled', body, cancellation.signal);
			const rejected = assert.rejects(submission, isCancellationError);
			await started.p;
			cancellation.abort(new CancellationError());
			await gate.complete();
			await rejected;
			assert.deepStrictEqual({ uploads: uploads.length, opened: opened.length, errors, clipboardWrites, confirmations: confirmation.callCount }, {
				uploads: 1, opened: cached ? 1 : 0, errors: { logged: [], shown: [] }, clipboardWrites: [], confirmations: 0,
			});
		});
	}

	for (const phase of ['confirmation', 'clipboard'] as const) {
		test(`cancellation during ${phase} never opens a clipboard-fallback preview`, async () => {
			const { service, host, data, controls, opened, errors, clipboardWrites } = createSubmissionService();
			const started = new DeferredPromise<void>();
			const gate = new DeferredPromise<void>();
			const wait = () => {
				void started.complete();
				return gate.p;
			};
			stub(service, 'showClipboardDialog').callsFake(async () => {
				if (phase === 'confirmation') {
					await wait();
				}
				return true;
			});
			if (phase === 'clipboard') {
				controls.clipboard = wait;
			}
			const cancellation = new AbortController();
			const submission = service.submitIssue(host, data, 'Cancelled', 'x'.repeat(8000), cancellation.signal);
			const rejected = assert.rejects(submission, isCancellationError);
			await started.p;
			cancellation.abort(new CancellationError());
			await gate.complete();
			await rejected;
			assert.deepStrictEqual({ opened, errors, clipboardWrites: clipboardWrites.length }, {
				opened: [], errors: { logged: [], shown: [] }, clipboardWrites: phase === 'clipboard' ? 1 : 0,
			});
		});
	}

	test('service disposal cancels a pending submission without discarding authentication failures as success', async () => {
		const { service, host, data, opened, errors } = createSubmissionService();
		const token = new DeferredPromise<string>();
		data.getGitHubAccessToken = () => token.p;
		const submission = service.submitIssue(host, data, 'Cancelled', 'Description');
		const rejected = assert.rejects(submission, isCancellationError);
		service.dispose();
		await token.complete('late-token');
		await rejected;
		assert.deepStrictEqual({ opened, errors }, { opened: [], errors: { logged: [], shown: [] } });
	});

	test('uploads all supported imported image formats with matching MIME types and extensions', async () => {
		const canvas = mainWindow.document.createElement('canvas');
		canvas.width = 48;
		canvas.height = 32;
		const sources = [issueReporterImageFixture, canvas.toDataURL('image/jpeg'), issueReporterGifFixture, issueReporterWebpFixture, issueReporterAvifFixture];
		const { service, host, data, mediaUploads } = createSubmissionService(false, false, { attachments: sources.map((dataUrl, index) => capturedScreenshot({ dataUrl }, String(index))) });
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
		const { service, host, data, mediaUploads } = createSubmissionService(false, false, { attachments: [capturedScreenshot(screenshot)] });
		const productRepository = getProductIssueRepository();
		await service.submitIssue(host, data, 'Before annotation', 'Description');
		screenshot.annotatedDataUrl = issueReporterImageFixture;
		await service.submitIssue(host, data, 'After annotation', 'Description');
		assert.deepStrictEqual(mediaUploads, [
			{ repository: productRepository, name: 'screenshot-1.gif', contentType: 'image/gif' },
			{ repository: productRepository, name: 'screenshot-1.png', contentType: 'image/png' },
		]);
	});

	test('keeps distinct capture filenames when their image bytes match', async () => {
		const { service, host, data, mediaUploads } = createSubmissionService(false, false, {
			attachments: [capturedScreenshot({ dataUrl: issueReporterImageFixture }, 'first'), capturedScreenshot({ dataUrl: issueReporterImageFixture }, 'second')],
		});
		await service.submitIssue(host, data, 'Matching captures', 'Description');
		assert.deepStrictEqual(mediaUploads.map(file => file.name), ['screenshot-1.png', 'screenshot-2.png']);
	});

	test('does not reuse a differently named capture upload after an earlier capture is removed', async () => {
		const attachments = [capturedScreenshot({ dataUrl: issueReporterGifFixture }, 'first'), capturedScreenshot({ dataUrl: issueReporterImageFixture }, 'second')];
		const { service, host, data, mediaUploads, opened } = createSubmissionService(false, false, { attachments });
		await service.submitIssue(host, data, 'Before removal', 'Description');
		attachments.shift();
		await service.submitIssue(host, data, 'After removal', 'Description');
		assert.deepStrictEqual({
			uploads: mediaUploads.map(file => file.name),
			lastPreview: new URL(opened.at(-1)!).searchParams.get('body')?.includes('![screenshot-1.png]('),
		}, { uploads: ['screenshot-1.gif', 'screenshot-2.png', 'screenshot-1.png'], lastPreview: true });
	});

	test('keeps imported videos and their cached uploads isolated by repository and preserves query overrides', async () => {
		const { service, host, data, opened, mediaUploads } = createSubmissionService(false, false, {
			attachments: ['mp4', 'webm', 'mov'].map(extension => attachedFile({ filePath: `/owned/import.${extension}`, name: `original.${extension}`, mimeType: extension === 'mov' ? 'video/quicktime' : `video/${extension}` })),
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
				{ repository, name: 'original.mp4', contentType: 'video/mp4' },
				{ repository, name: 'original.webm', contentType: 'video/webm' },
				{ repository, name: 'original.mov', contentType: 'video/quicktime' },
			]),
			previews: [
				{ path: '/owner/private-reports/issues/new', labels: 'internal', assignees: 'maintainer', template: null, privateLinks: true },
				{ path: `/${productRepository}/issues/new`, labels: null, assignees: null, template: 'bug_report.md', privateLinks: false },
				{ path: '/owner/private-reports/issues/new', labels: 'internal', assignees: 'maintainer', template: null, privateLinks: true },
			],
		});
	});

	test('does not read or upload imported videos for a fail-closed private destination', async () => {
		const { service, host, data, fileReads, mediaUploads, opened } = createSubmissionService(false, false, { attachments: [attachedFile({ filePath: '/owned/import.mp4', name: 'original.mp4', mimeType: 'video/mp4' })] });
		const openedPreview = await service.submitIssue(host, { ...data, issueRepository: 'owner/missing', privateUri: undefined }, 'Private report', 'Private diagnostics');
		assert.deepStrictEqual({ openedPreview, fileReads, mediaUploads, opened }, { openedPreview: false, fileReads: [], mediaUploads: [], opened: [] });
	});

	for (const [name, mimeType, contentType] of [
		['vscode-recording.mp4', 'video/mp4;codecs=avc1', 'video/mp4'],
		['vscode-recording.webm', 'video/webm;codecs=vp9', 'video/webm'],
		['imported.mp4', ' VIDEO/MP4 ; codecs="avc1.42E01E,mp4a.40.2"', 'video/mp4'],
		['notes.txt', 'text/plain; charset=utf-8', 'text/plain'],
	]) {
		test(`uploads ${mimeType} with a bare MIME type for the upload policy`, async () => {
			const file = { filePath: `/owned/${name}`, name, mimeType };
			const contents = new Uint8Array([0, 255, 42, 10]);
			const { service, host, data, controls, payloads, uploadErrors } = createSubmissionService(false, false, {
				attachments: [attachedFile(file)],
				contents,
			});
			controls.upload = async () => {
				if (payloads.at(-1)?.contentType !== contentType) {
					throw new Error('Policy request failed 422: {"message":"Validation Failed","errors":[{"resource":"RepositoryFile","code":"custom","field":"content_type","message":"content_type is not included in the list"}]}');
				}
			};

			const result = await service.submitIssue(host, data, 'Captured recording', 'Description');

			assert.deepStrictEqual({
				result,
				payloads,
				storedMimeType: file.mimeType,
				error: uploadErrors.at(-1),
			}, {
				result: true,
				payloads: [{ name, contentType, bytes: [...contents] }],
				storedMimeType: mimeType,
				error: undefined,
			});
		});
	}

	test('uploads original generic bytes, MIME and filename with an escaped Markdown link', async () => {
		const name = 'bundle [a](b)\\&<x>.zip';
		const { service, host, data, payloads, opened } = createSubmissionService(false, false, {
			attachments: [attachedFile({ filePath: '/owned/unique.bin', name, mimeType: 'application/x-original' })],
			contents: new Uint8Array([0, 255, 42, 10]),
		});
		await service.submitIssue(host, data, 'File report', 'Description');
		const body = new URL(opened[0]).searchParams.get('body')!;
		const link = body.slice(body.lastIndexOf('](') + 2, body.lastIndexOf(')'));
		assert.deepStrictEqual({
			payloads,
			linkLabel: body.includes('[bundle \\[a\\]\\(b\\)\\\\&amp;&lt;x&gt;.zip]('),
			imageSyntax: body.includes('!['),
			originalLinkName: decodeURIComponent(link).endsWith(name),
			unsafeLinkCharacters: /[()<>\\\s]/.test(link),
		}, {
			payloads: [{ name, contentType: 'application/x-original', bytes: [0, 255, 42, 10] }],
			linkLabel: true, imageSyntax: false, originalLinkName: true, unsafeLinkCharacters: false,
		});
	});

	test('matches upload progress identities to the ordered attachments', async () => {
		const { service, host, data, progress } = createSubmissionService(false, false, {
			attachments: [attachedFile({ filePath: '/owned/report.zip', name: 'report.zip', mimeType: 'application/zip' }), capturedScreenshot({ dataUrl: issueReporterImageFixture })],
		});
		await service.submitIssue(host, data, 'Progress', 'Description');
		assert.deepStrictEqual(progress, [
			{ id: '/owned/report.zip', state: 'pending' }, { id: 'screenshot', state: 'pending' },
			{ id: '/owned/report.zip', state: 'uploading' }, { id: '/owned/report.zip', state: 'done' },
			{ id: 'screenshot', state: 'uploading' }, { id: 'screenshot', state: 'done' },
		]);
	});

	test('uploads pasted A and B before capture C and preserves that order in Markdown and feedback', async () => {
		const attachments = [
			attachedFile({ filePath: '/owned/A.png', name: 'A.png', mimeType: 'image/png' }),
			attachedFile({ filePath: '/owned/B.png', name: 'B.png', mimeType: 'image/png' }),
			capturedScreenshot({ dataUrl: issueReporterImageFixture }, 'C'),
		];
		const { service, host, data, mediaUploads, opened, progress } = createSubmissionService(false, false, { attachments });
		await service.submitIssue(host, data, 'Chronological attachments', 'Description');
		const body = new URL(opened[0]).searchParams.get('body')!;
		assert.deepStrictEqual({
			uploads: mediaUploads.map(upload => upload.name),
			markdown: [...body.matchAll(/!\[(?<name>[^\]]+)\]\(/g)].map(match => match.groups?.name),
			feedback: progress.filter(item => item.state === 'done').map(item => item.id),
		}, {
			uploads: ['A.png', 'B.png', 'screenshot-1.png'],
			markdown: ['A.png', 'B.png', 'screenshot-1.png'],
			feedback: ['/owned/A.png', '/owned/B.png', 'C'],
		});
	});

	test('keeps mixed file, capture and recording order through cached retries', async () => {
		const attachments = [
			attachedFile({ filePath: '/owned/report.zip', name: 'report.zip', mimeType: 'application/zip' }),
			capturedScreenshot({ dataUrl: issueReporterImageFixture }, 'capture'),
			attachedFile({ filePath: '/owned/recording.mp4', name: 'recording.mp4', mimeType: 'video/mp4' }),
			attachedFile({ filePath: '/owned/final.png', name: 'final.png', mimeType: 'image/png' }),
		];
		const { service, host, data, uploads, opened, progress } = createSubmissionService(false, false, { attachments });
		await service.submitIssue(host, data, 'Mixed attachments', 'Description');
		await service.submitIssue(host, data, 'Mixed attachments', 'Description');
		assert.deepStrictEqual({
			uploads: uploads.flatMap(upload => upload.names),
			bodyOrder: opened.map(url => [...new URL(url).searchParams.get('body')!.matchAll(/https:\/\/github\.com\/attachments\/[^/]+\/[^/]+\/(?<name>[^)\s]+)/g)].map(match => match.groups?.name)),
			retry: progress.slice(-8).filter(item => item.state === 'done').map(item => item.id),
		}, {
			uploads: ['report.zip', 'screenshot-1.png', 'recording.mp4', 'final.png'],
			bodyOrder: [['report.zip', 'screenshot-1.png', 'recording.mp4', 'final.png'], ['report.zip', 'screenshot-1.png', 'recording.mp4', 'final.png']],
			retry: ['/owned/report.zip', 'capture', '/owned/recording.mp4', '/owned/final.png'],
		});
	});

	test('reports a rejected ZIP concisely while preserving the original 422 in logs and details', async () => {
		const attachment = attachedFile({ filePath: '/owned/test.zip', name: 'test.zip', mimeType: 'application/zip' });
		const { service, host, data, failures, uploadErrors, uploadErrorDetails, loggedFailures, progress, opened, payloads } = createSubmissionService(false, true, { attachments: [attachment], contents: new Uint8Array([80, 75]) });
		failures.message = 'Policy request failed 422:\n{\n"message":"Invalid content type",\n"documentation_url":"https://docs.github.com/rest",\n"status":"422"\n}';
		const result = await service.submitIssue(host, data, 'ZIP report', 'Description');
		assert.deepStrictEqual({
			result, opened, primary: uploadErrors.at(-1), details: uploadErrorDetails.at(-1), logged: loggedFailures.map(error => error.message),
			done: progress.filter(item => item.state === 'done'), attachments: host.getAttachments(), payloads,
		}, {
			result: false, opened: [], primary: 'Could not upload test.zip. Try again, or remove this file and attach it on GitHub.',
			details: failures.message, logged: [failures.message], done: [], attachments: [attachment],
			payloads: [{ name: 'test.zip', contentType: 'application/zip', bytes: [80, 75] }],
		});
	});

	test('reports a failed upload without opening preview and permits retry with the same attachment', async () => {
		const attachment = { filePath: '/owned/report.zip', name: 'report.zip', mimeType: 'application/zip' };
		const { service, host, data, failures, uploadErrors, opened, uploading } = createSubmissionService(false, false, { attachments: [attachedFile(attachment)] });
		failures.remaining = 1;
		const failed = await service.submitIssue(host, data, 'Retry', 'Description');
		const first = { result: failed, opened: opened.length, error: uploadErrors.at(-1) };
		const retried = await service.submitIssue(host, data, 'Retry', 'Description');
		assert.deepStrictEqual({ first, retried, opened: opened.length, error: uploadErrors.at(-1), uploading, remaining: host.getAttachments() }, {
			first: { result: false, opened: 0, error: 'Could not upload report.zip. Try again, or remove this file and attach it on GitHub.' }, retried: true, opened: 1, error: undefined, uploading: [true, false, true, false], remaining: [attachedFile(attachment)],
		});
	});

	test('uploads changed file bytes instead of reusing a path-only cached asset', async () => {
		const media = {
			attachments: [attachedFile({ filePath: '/owned/notes.txt', name: 'notes.txt', mimeType: 'text/plain' })],
			contents: new Uint8Array([65, 66, 67]),
		};
		const { service, host, data, payloads } = createSubmissionService(false, false, media);
		await service.submitIssue(host, data, 'Original', 'Description');
		media.contents = new Uint8Array([88, 89, 90]);
		await service.submitIssue(host, data, 'Updated', 'Description');
		await service.submitIssue(host, data, 'Updated again', 'Description');
		assert.deepStrictEqual(payloads, [
			{ name: 'notes.txt', contentType: 'text/plain', bytes: [65, 66, 67] },
			{ name: 'notes.txt', contentType: 'text/plain', bytes: [88, 89, 90] },
		]);
	});

	test('refreshes a GitHub session on retry without losing attachments or changing private destination', async () => {
		const attachment = { filePath: '/owned/report.zip', name: 'report.zip', mimeType: 'application/zip' };
		const { service, host, data, opened, uploadTokens, repositories, fileReads } = createSubmissionService(false, false, { attachments: [attachedFile(attachment)] });
		let token = '';
		data.githubAccessToken = '';
		data.issueRepository = 'microsoft/vscode-internalbacklog';
		data.getGitHubAccessToken = async () => token;
		const signedOut = await service.submitIssue(host, data, 'Private report', 'Private description');
		const readsBeforeSignIn = fileReads.length;
		token = 'new-session-token';
		const signedIn = await service.submitIssue(host, data, 'Private report', 'Private description');
		assert.deepStrictEqual({
			signedOut, signedIn, readsBeforeSignIn, uploadTokens, repositories,
			destinations: opened.map(url => new URL(url).pathname), retained: host.getAttachments(),
		}, {
			signedOut: false, signedIn: true, readsBeforeSignIn: 0, uploadTokens: ['new-session-token'],
			repositories: ['microsoft/vscode-internalbacklog'], destinations: ['/microsoft/vscode-internalbacklog/issues/new'], retained: [attachedFile(attachment)],
		});
	});

	test('reports session lookup failure without reusing stale credentials or losing attachments', async () => {
		const attachment = { filePath: '/owned/report.zip', name: 'report.zip', mimeType: 'application/zip' };
		const { service, host, data, opened, uploadTokens, uploadErrors, uploading } = createSubmissionService(false, false, { attachments: [attachedFile(attachment)] });
		data.getGitHubAccessToken = async () => { throw new Error('Authentication provider unavailable'); };
		const result = await service.submitIssue(host, data, 'Report', 'Description');
		assert.deepStrictEqual({
			result, opened, uploadTokens, token: data.githubAccessToken, error: uploadErrors.at(-1),
			uploading, retained: host.getAttachments(),
		}, {
			result: false, opened: [], uploadTokens: [], token: '',
			error: 'Could not access your GitHub session. Try signing in again, or remove the attachments and add them on GitHub.',
			uploading: [true, false], retained: [attachedFile(attachment)],
		});
	});

	test('does not silently skip an unreadable screenshot or mark later attachments as uploaded', async () => {
		const { service, host, data, opened, uploads, uploadErrors, uploadErrorDetails, progress } = createSubmissionService(false, false, {
			attachments: [capturedScreenshot({ dataUrl: 'not-a-data-url' }), attachedFile({ filePath: '/owned/report.zip', name: 'report.zip', mimeType: 'application/zip' })],
		});
		const result = await service.submitIssue(host, data, 'Invalid screenshot', 'Description');
		assert.deepStrictEqual({ result, opened, uploads, progress, error: uploadErrors.at(-1), details: uploadErrorDetails.at(-1) }, {
			result: false, opened: [], uploads: [], progress: [{ id: 'screenshot', state: 'pending' }, { id: '/owned/report.zip', state: 'pending' }],
			error: 'Could not upload Screenshot 1. Try again, or remove this file and attach it on GitHub.', details: 'The screenshot could not be read.',
		});
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
			const { service, host, data, opened, repositories, uploadErrors } = createSubmissionService(true, true);
			const result = await service.submitIssue(host, {
				...data, uri: URI.parse(internalIssueReporterUrl), githubAccessToken: useToken ? 'test-token' : '',
			}, 'Private title', 'Private diagnostics');
			assert.deepStrictEqual({ result, opened, error: !!uploadErrors.at(-1), repositories }, {
				result: false, opened: [], error: true,
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
		let sessionLookups = 0;
		data.getGitHubAccessToken = async () => { sessionLookups++; return 'unused'; };
		await service.submitIssue(host, {
			...data, issueRepository: 'owner/second', issueSource: IssueSource.Extension, extensionId: 'publisher.extension',
			enabledExtensions: [{
				id: 'publisher.extension', name: 'extension', displayName: 'Extension', publisher: 'publisher',
				version: '1', isTheme: false, isBuiltin: false, bugsUrl: 'https://example.com/feedback', repositoryUrl: undefined,
			}],
		}, 'Title', 'Body');
		assert.deepStrictEqual({ opened, repositories, sessionLookups }, { opened: ['https://example.com/feedback'], repositories: [], sessionLookups: 0 });
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
