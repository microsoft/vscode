/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise, timeout } from '../../../../../base/common/async.js';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { mainWindow } from '../../../../../base/browser/window.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { Event } from '../../../../../base/common/event.js';
import { toDisposable } from '../../../../../base/common/lifecycle.js';
import { autorun, constObservable, derived, observableValue, type IReader } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock, upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IClipboardService } from '../../../../../platform/clipboard/common/clipboardService.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { ILabelService } from '../../../../../platform/label/common/label.js';
import { IOpenerService } from '../../../../../platform/opener/common/opener.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import { NullLogService } from '../../../../../platform/log/common/log.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import { GitHubCommit } from '../../../../../platform/github/common/githubQueryService.js';
import { IWorkspaceContextService } from '../../../../../platform/workspace/common/workspace.js';
import type { IChatPillEntry } from '../../../../../workbench/browser/chatPills.js';
import { ChatPillHoverCache } from '../../../../../workbench/browser/chatPillHover.js';
import { IChatImageCarouselOptions, IChatImageCarouselService } from '../../../../../workbench/contrib/chat/browser/chatImageCarouselService.js';
import { IChatService } from '../../../../../workbench/contrib/chat/common/chatService/chatService.js';
import { ChatResponseResource, IChatModel, IChatProgressResponseContent, IChatRequestModel, IChatResponseModel, IResponse } from '../../../../../workbench/contrib/chat/common/model/chatModel.js';
import { ChatToolInvocation } from '../../../../../workbench/contrib/chat/common/model/chatProgressTypes/chatToolInvocation.js';
import { ToolDataSource } from '../../../../../workbench/contrib/chat/common/tools/languageModelToolsService.js';
import { ChatConfiguration } from '../../../../../workbench/contrib/chat/common/constants.js';
import { IWorkbenchGitHubService } from '../../../../../workbench/services/github/common/githubService.js';
import { buildSessionArtifactSections, sessionArtifactLocationText, SessionArtifacts, type ISessionArtifactActions } from '../../browser/sessionArtifacts.js';
import { type IChat, type IGitHubInfo, type ISessionArtifact, type ISessionWorkspace, SessionArtifactKind } from '../../../../services/sessions/common/session.js';
import { IActiveSession, ISessionsManagementService } from '../../../../services/sessions/common/sessionsManagement.js';
import { hashSessionIdForTelemetry } from '../../../../common/sessionsTelemetry.js';
import { IGitHubService as ISessionsGitHubService } from '../../../github/browser/githubService.js';
import { getSessionGitHubReferences } from '../../../github/common/sessionGitHubReferences.js';

suite('Session Artifacts', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	const actions: ISessionArtifactActions = {
		recordOpen() { },
		openExternal() { },
		openResource() { },
		openImages() { },
		copy() { },
	};

	/** Stands in for the label service: a path without its scheme, tildified and relative to the mounted `~/repo` folder. */
	const labelService = {
		getUriLabel: (uri: URI, options?: { relative?: boolean }) => {
			const path = uri.path.replace('/home/alice', '~');
			return options?.relative ? path.replace(/^~\/repo\/?/, '') : path;
		},
	};

	function createPresentation(entries: readonly ISessionArtifact[], info?: IGitHubInfo, commit?: GitHubCommit, getCommit?: ISessionsGitHubService['getCommit'], fromChat = false, workbenchGitHubService?: IWorkbenchGitHubService) {
		const artifacts = observableValue('artifacts', entries);
		const loading = observableValue('loading', false);
		const removed: string[] = [];
		const errors: string[] = [];
		const chatResource = URI.parse('chat-session://test/images');
		const chat = observableValue<IChat | undefined>('chat', upcastPartial<IChat>({ resource: chatResource }));
		const chatModels = observableValue<Iterable<IChatModel>>('chatModels', []);
		const openedImages: { resource: URI; options: IChatImageCarouselOptions | undefined }[] = [];
		const openedResources: URI[] = [];
		const telemetryEvents: { readonly name: string | undefined; readonly data: unknown }[] = [];
		let removalError: Error | undefined;
		const gitHubInfo = observableValue<IGitHubInfo | undefined>('gitHubInfo', info);
		const root = URI.file('/repo');
		const workspace = observableValue<ISessionWorkspace | undefined>('workspace', {
			uri: root,
			label: 'repo',
			icon: Codicon.folder,
			requiresWorkspaceTrust: false,
			isVirtualWorkspace: false,
			folders: [{
				root,
				workingDirectory: root,
				name: 'repo',
				description: undefined,
				gitRepository: { uri: root, workTreeUri: undefined, baseBranchName: undefined, gitHubInfo },
			}],
		});
		const session = observableValue<IActiveSession | undefined>('session', new class extends mock<IActiveSession>() {
			override readonly sessionId = 'provider:session';
			override readonly resource = chatResource;
			override readonly artifacts = artifacts;
			override readonly loading = loading;
			override readonly capabilities = constObservable({ supportsMultipleChats: false, supportsRemoveArtifacts: true });
			override readonly workspace = workspace;
		}());
		const configurationService = new TestConfigurationService();
		disposables.add(configurationService.onDidChangeConfigurationEmitter);
		const presentation = disposables.add(new SessionArtifacts(
			session,
			chat,
			constObservable(new Set<string>()),
			derived(reader => getSessionGitHubReferences(session.read(reader), reader, fromChat ? upcastPartial<IChat>({ resource: URI.parse('ahp-chat://peer/session'), workspace }) : undefined)),
			new class extends mock<IClipboardService>() { }(),
			configurationService,
			new class extends mock<ILabelService>() {
				override readonly onDidChangeFormatters = Event.None;
				override readonly getUriLabel = labelService.getUriLabel;
			}(),
			new class extends mock<INotificationService>() {
				override error(error: string): void { errors.push(error); }
			}(),
			new class extends mock<IOpenerService>() {
				override async open(resource: URI): Promise<boolean> { openedResources.push(resource); return true; }
			}(),
			new class extends mock<ISessionsManagementService>() {
				override async removeSessionArtifact(_session: IActiveSession, artifactId: string): Promise<void> {
					removed.push(artifactId);
					if (removalError) {
						throw removalError;
					}
					artifacts.set(artifacts.get().filter(artifact => artifact.id !== artifactId), undefined);
				}
			}(),
			new class extends mock<IWorkspaceContextService>() {
				override readonly onDidChangeWorkspaceFolders = Event.None;
			}(),
			upcastPartial<ISessionsGitHubService>({ getCommit: getCommit ?? (() => commit ? Promise.resolve(commit) : new Promise(() => { })) }),
			workbenchGitHubService ?? upcastPartial<IWorkbenchGitHubService>({ onDidChangeDefaultClient: Event.None, acquireDefaultAccountClient: () => new Promise(() => { }) }),
			new NullLogService(),
			new class extends mock<ITelemetryService>() {
				override publicLog2(eventName?: string, data?: unknown): void {
					telemetryEvents.push({ name: eventName, data });
				}
			}(),
			upcastPartial<IChatService>({ chatModels }),
			upcastPartial<IChatImageCarouselService>({
				openCarouselAtResource: async (resource, _data, options) => { openedImages.push({ resource, options }); },
			}),
		));
		return { presentation, session, chat, chatModels, openedImages, openedResources, configurationService, artifacts, loading, workspace, gitHubInfo, removed, errors, telemetryEvents, setRemovalError: (error: Error | undefined) => { removalError = error; } };
	}

	function createImageModel(resource: URI, toolCallId = 'image-call') {
		const invocation = new ChatToolInvocation({
			invocationMessage: 'Generating images',
			toolSpecificData: { kind: 'input', rawInput: 'Draw two images', imageGeneration: {} },
		}, { id: 'image_generation', displayName: 'Generate Image', modelDescription: 'Generate Image', source: ToolDataSource.Internal }, toolCallId, undefined, {});
		const content: IChatProgressResponseContent[] = [invocation];
		const response = upcastPartial<IChatResponseModel>({
			response: upcastPartial<IResponse>({ value: content }),
			onDidChange: Event.None,
		});
		const requests = [upcastPartial<IChatRequestModel>({ response })];
		const model = upcastPartial<IChatModel>({
			sessionResource: resource,
			onDidChange: Event.None,
			getRequests: () => requests,
		});
		return { model, content, invocation, requests };
	}

	function visibleEntries(presentation: SessionArtifacts, reader?: IReader) {
		return {
			artifacts: presentation.sections.read(reader).flatMap(section => section.entries.map(entry => entry.id)),
			references: presentation.referenceSections.read(reader).flatMap(section => section.entries.map(entry => entry.id)),
		};
	}

	test('adds generated images to the artifacts pill as the tool completes and opens the originating conversation', async () => {
		const { presentation, chat, chatModels, openedImages } = createPresentation([]);
		const resource = chat.get()!.resource;
		const { model, invocation } = createImageModel(resource);
		chatModels.set([model], undefined);
		let entries: readonly IChatPillEntry[] = [];
		disposables.add(autorun(reader => { entries = presentation.sections.read(reader).flatMap(section => section.entries); }));
		const before = entries.length;
		const imageUri = URI.parse('vscode-agent-host://remote/generated-images/result?version=1');
		await invocation.didExecuteTool({
			content: [],
			toolSpecificData: { kind: 'generatedImage' },
			toolResultDetails: {
				input: 'Draw an image',
				output: [{ type: 'ref', uri: imageUri, mimeType: 'image/png' }],
			},
		});
		entries[0].open();

		assert.deepStrictEqual({
			before,
			images: entries.map(entry => ({ resource: entry.resource, removable: !!entry.promotedAction })),
			references: presentation.referenceSections.get(),
			opened: openedImages.map(opened => ({
				resource: opened.resource,
				sessionResource: opened.options?.sessionResource,
				additionalImages: opened.options?.additionalImages?.map(image => ({ uri: image.uri, mimeType: image.mimeType })),
			})),
		}, {
			before: 0,
			images: [{ resource: imageUri, removable: false }],
			references: [],
			opened: [{ resource: imageUri, sessionResource: resource, additionalImages: [{ uri: imageUri, mimeType: 'image/png' }] }],
		});
	});

	test('restores embedded images, deduplicates recorded artifacts, and follows the displayed chat', async () => {
		const { presentation, chat, chatModels, artifacts } = createPresentation([]);
		const resource = chat.get()!.resource;
		const { model, content, invocation } = createImageModel(resource);
		await invocation.didExecuteTool({
			content: [],
			toolSpecificData: { kind: 'generatedImage' },
			toolResultDetails: { input: '', output: [{ type: 'embed', value: 'AQID', mimeType: 'image/png' }] },
		});
		content.splice(0, 1, invocation.toJSON());
		chatModels.set([model], undefined);
		const restored = presentation.sections.get().flatMap(section => section.entries);
		const recordedUri = ChatResponseResource.createUri(resource, 'image-call', 0, 'saved-name.png');
		artifacts.set([{ id: 'recorded', kind: SessionArtifactKind.File, label: 'Recorded Image', uri: recordedUri, isArtifact: true }], undefined);
		const deduplicated = presentation.sections.get().flatMap(section => section.entries);
		artifacts.set([], undefined);
		chat.set(upcastPartial<IChat>({ resource: URI.parse('chat-session://test/another-chat') }), undefined);
		const otherChat = presentation.sections.get();
		chat.set(upcastPartial<IChat>({ resource }), undefined);

		assert.deepStrictEqual({
			restored: restored.map(entry => entry.resource?.path),
			deduplicated: deduplicated.map(entry => ({ id: entry.id, removable: !!entry.promotedAction })),
			otherChat,
			returned: presentation.sections.get().flatMap(section => section.entries.map(entry => entry.id)),
		}, {
			restored: ['/tool/image-call/0/generated-image-9ece88a621bd.png'],
			deduplicated: [{ id: 'recorded', removable: true }],
			otherChat: [],
			returned: restored.map(entry => entry.id),
		});
	});

	for (const restored of [false, true]) {
		test(`shows newest response groups first without reversing generated image outputs (${restored ? 'restored' : 'live'})`, async () => {
			const { presentation, chat, chatModels, openedImages } = createPresentation([]);
			const resource = chat.get()!.resource;
			const older = createImageModel(resource, 'older');
			const newer = createImageModel(resource, 'newer');
			for (const generation of [older, newer]) {
				await generation.invocation.didExecuteTool({
					content: [],
					toolSpecificData: { kind: 'generatedImage' },
					toolResultDetails: {
						input: 'Draw two images',
						output: [
							{ type: 'embed', value: 'AQID', mimeType: 'image/png' },
							{ type: 'embed', value: 'BAUG', mimeType: 'image/png' },
						],
					},
				});
				if (restored) {
					generation.content.splice(0, 1, generation.invocation.toJSON());
				}
			}
			older.requests.push(...newer.requests);
			const chronologicalRequests = older.requests.slice();
			chatModels.set([older.model], undefined);
			const entries = presentation.sections.get()[0].entries;
			entries[0].open();

			assert.deepStrictEqual({
				images: entries.map(entry => entry.resource?.path),
				requestOrderPreserved: older.requests.every((request, index) => request === chronologicalRequests[index]),
				opened: openedImages.map(image => ({
					path: image.resource.path,
					collection: image.options?.additionalImages?.map(image => image.uri.path),
				})),
			}, {
				images: [
					'/tool/newer/0/generated-image-c82ff7ca77f5.png',
					'/tool/newer/1/generated-image-9db2dff89263.png',
					'/tool/older/0/generated-image-d61868c3de35.png',
					'/tool/older/1/generated-image-6840071a8bab.png',
				],
				requestOrderPreserved: true,
				opened: [{
					path: '/tool/newer/0/generated-image-c82ff7ca77f5.png',
					collection: [
						'/tool/newer/0/generated-image-c82ff7ca77f5.png',
						'/tool/newer/1/generated-image-9db2dff89263.png',
						'/tool/older/0/generated-image-d61868c3de35.png',
						'/tool/older/1/generated-image-6840071a8bab.png',
					],
				}],
			});
		});
	}

	test('opens generated images normally when the chat carousel is disabled', async () => {
		const { presentation, chat, chatModels, configurationService, openedImages, openedResources } = createPresentation([]);
		await configurationService.setUserConfiguration(ChatConfiguration.ImageCarouselEnabled, false);
		const { model, invocation } = createImageModel(chat.get()!.resource);
		const uri = URI.file('/generated/image.png');
		await invocation.didExecuteTool({
			content: [],
			toolSpecificData: { kind: 'generatedImage' },
			toolResultDetails: { input: '', output: [{ type: 'ref', uri, mimeType: 'image/png' }] },
		});
		chatModels.set([model], undefined);
		presentation.sections.get()[0].entries[0].open();

		assert.deepStrictEqual({ openedImages, openedResources }, { openedImages: [], openedResources: [uri] });
	});

	test('groups multiple generated images separately while preserving recorded duplicates and carousel navigation', async () => {
		const photo = URI.file('/images/inspiration.jpg');
		const video = URI.file('/images/demo.mp4');
		const generated = URI.parse('generated-images:/session/result');
		const { presentation, chat, chatModels, openedImages } = createPresentation([
			{ id: 'photo', kind: SessionArtifactKind.File, label: 'Inspiration', uri: photo, isArtifact: true },
			{ id: 'video', kind: SessionArtifactKind.File, label: 'Demo', uri: video, isArtifact: true },
			{ id: 'recorded-image', kind: SessionArtifactKind.File, label: 'Generated Image', uri: generated, isArtifact: true },
		]);
		const resource = chat.get()!.resource;
		const { model, invocation } = createImageModel(resource);
		await invocation.didExecuteTool({
			content: [],
			toolSpecificData: { kind: 'generatedImage' },
			toolResultDetails: {
				input: '',
				output: [
					{ type: 'ref', uri: generated, mimeType: 'image/jpeg' },
					{ type: 'embed', value: 'AQID', mimeType: 'image/jpeg' },
				],
			},
		});
		chatModels.set([model], undefined);
		const embedded = ChatResponseResource.createUri(resource, 'image-call', 1, 'generated-image-35078300129c.jpg');
		const sections = presentation.sections.get();
		sections[0].entries[1].open();
		sections[1].entries[0].open();

		assert.deepStrictEqual({
			sections: sections.map(section => ({
				title: section.title,
				entries: section.entries.map(entry => ({ uri: entry.resource, removable: !!entry.promotedAction })),
			})),
			opened: openedImages.map(image => ({
				uri: image.resource,
				collection: image.options?.additionalImages?.map(image => image.uri),
			})),
		}, {
			sections: [
				{ title: 'Generated Images', entries: [{ uri: generated, removable: true }, { uri: embedded, removable: false }] },
				{ title: 'Images', entries: [{ uri: photo, removable: true }] },
				{ title: 'Files', entries: [{ uri: video, removable: true }] },
			],
			opened: [
				{ uri: embedded, collection: [photo, generated, embedded] },
				{ uri: photo, collection: [photo, generated, embedded] },
			],
		});
	});

	test('reads files as paths and leaves every other location whole', () => {
		const locations = [
			URI.file('/home/alice/repo/src/app.ts'),
			URI.file('/home/alice/notes.md'),
			URI.file('/home/alice/repo'),
			URI.parse('https://example.com/dashboard'),
			URI.parse('myapp://team/board?id=42'),
		];

		assert.deepStrictEqual(locations.map(uri => sessionArtifactLocationText(uri, labelService)), [
			'src/app.ts',
			'~/notes.md',
			'~/repo', // the mounted folder itself has no relative path
			'https://example.com/dashboard',
			'myapp://team/board?id=42',
		]);
	});

	test('shows each artifact path or link beside its dropdown entry', () => {
		const fileUri = URI.file('/home/alice/artifacts/report.md');
		const resourceUri = URI.parse('https://example.com/dashboard');
		const pullRequestLink = URI.parse('https://github.com/microsoft/vscode/pull/12');
		const artifacts: readonly ISessionArtifact[] = [
			{ id: 'pr', kind: SessionArtifactKind.PullRequest, label: 'PR #12', isArtifact: true, link: pullRequestLink },
			{ id: 'file', kind: SessionArtifactKind.File, label: 'Report', isArtifact: true, uri: fileUri },
			{ id: 'resource', kind: SessionArtifactKind.Resource, label: 'Resource', isArtifact: true, uri: resourceUri },
		];

		const entries = buildSessionArtifactSections(artifacts, actions, labelService, true, new Set()).flatMap(section => section.entries);
		assert.deepStrictEqual(entries.map(entry => {
			const content = entry.hover?.content;
			return {
				label: entry.label,
				ariaLabel: entry.ariaLabel,
				ariaDescription: entry.ariaDescription,
				hover: content instanceof HTMLElement ? content.textContent : undefined,
				hoverClassName: content instanceof HTMLElement ? content.className : undefined,
				panelClassName: entry.hover?.panelClassName,
				tooltip: entry.tooltip,
			};
		}), [
			{ label: 'PR #12', ariaLabel: 'Open PR #12', ariaDescription: pullRequestLink.toString(true), hover: pullRequestLink.toString(true), hoverClassName: 'chat-pill-hover-content chat-pill-location-hover compact', panelClassName: 'chat-pill-hover-panel', tooltip: pullRequestLink.toString(true) },
			{ label: 'report.md', ariaLabel: 'Open report.md', ariaDescription: '~/artifacts/report.md', hover: '~/artifacts/report.md', hoverClassName: 'chat-pill-hover-content chat-pill-location-hover compact', panelClassName: 'chat-pill-hover-panel', tooltip: '~/artifacts/report.md' },
			{ label: 'Resource', ariaLabel: 'Open Resource', ariaDescription: resourceUri.toString(true), hover: resourceUri.toString(true), hoverClassName: 'chat-pill-hover-content chat-pill-location-hover compact', panelClassName: 'chat-pill-hover-panel', tooltip: resourceUri.toString(true) },
		]);
	});

	test('logs artifact and reference entry opens', () => {
		const { presentation, telemetryEvents } = createPresentation([
			{ id: 'file', kind: SessionArtifactKind.File, label: 'Report', isArtifact: true, uri: URI.file('/repo/report.md') },
			{ id: 'website', kind: SessionArtifactKind.Website, label: 'Docs', isArtifact: false, link: URI.parse('https://example.com/docs') },
		]);

		for (const section of [...presentation.sections.get(), ...presentation.referenceSections.get()]) {
			for (const entry of section.entries) {
				entry.open();
			}
		}

		assert.deepStrictEqual(telemetryEvents, [
			{
				name: 'agents/sessionArtifactOpen',
				data: {
					agentSessionId: hashSessionIdForTelemetry('provider:session'),
					itemCategory: 'artifact',
					itemKind: 'file',
				},
			},
			{
				name: 'agents/sessionArtifactOpen',
				data: {
					agentSessionId: hashSessionIdForTelemetry('provider:session'),
					itemCategory: 'reference',
					itemKind: 'website',
				},
			},
		]);
	});

	test('adds image previews to references without changing image artifacts', () => {
		const referenceUri = URI.file('/home/alice/references/design.png');
		const artifactUri = URI.file('/home/alice/artifacts/result.jpg');
		const sections = buildSessionArtifactSections([
			{ id: 'reference', kind: SessionArtifactKind.File, label: 'Design', isArtifact: false, uri: referenceUri },
			{ id: 'artifact', kind: SessionArtifactKind.File, label: 'Result', isArtifact: true, uri: artifactUri },
		], actions, labelService, true, new Set());

		assert.deepStrictEqual(sections.map(section => ({
			title: section.title,
			entries: section.entries.map(entry => ({
				id: entry.id,
				imagePreview: entry.imagePreview && {
					resource: entry.imagePreview.resource.toString(),
					mimeType: entry.imagePreview.mimeType,
				},
				ariaDescription: entry.ariaDescription,
			})),
		})), [{
			title: 'Images',
			entries: [{
				id: 'reference',
				imagePreview: {
					resource: referenceUri.toString(),
					mimeType: 'image/png',
				},
				ariaDescription: '~/references/design.png',
			}, {
				id: 'artifact',
				imagePreview: undefined,
				ariaDescription: '~/artifacts/result.jpg',
			}],
		}]);
	});

	test('leaves out websites the browsers pill already lists', () => {
		const pullRequestLink = URI.parse('https://github.com/microsoft/vscode/pull/12');
		const artifacts: readonly ISessionArtifact[] = [
			{ id: 'docs', kind: SessionArtifactKind.Website, label: 'Docs', isArtifact: true, link: URI.parse('https://example.com/docs') },
			{ id: 'docs-slash', kind: SessionArtifactKind.Website, label: 'Docs Index', isArtifact: true, link: URI.parse('https://Example.com/docs/') },
			{ id: 'deep', kind: SessionArtifactKind.Website, label: 'Deep Link', isArtifact: true, link: URI.parse('https://example.com/docs/api') },
			{ id: 'blog', kind: SessionArtifactKind.Website, label: 'Blog', isArtifact: true, link: URI.parse('https://other.test/blog') },
			{ id: 'pr', kind: SessionArtifactKind.PullRequest, label: 'PR #12', isArtifact: true, link: pullRequestLink },
		];
		const labels = (browserUrls: readonly string[]) => buildSessionArtifactSections(artifacts, actions, labelService, true, new Set(browserUrls))
			.flatMap(section => section.entries)
			.map(entry => entry.label);

		assert.deepStrictEqual({
			withBrowsers: labels(['https://example.com/docs', pullRequestLink.toString()]),
			withoutBrowsers: labels([]),
		}, {
			withBrowsers: ['PR #12', 'Deep Link', 'Blog'],
			withoutBrowsers: ['PR #12', 'Docs', 'Docs Index', 'Deep Link', 'Blog'],
		});
	});

	test('omits GitHub artifacts surfaced in pull request and issue pills while listing every reference', () => {
		const { presentation } = createPresentation([
			{ id: 'created-pr', kind: SessionArtifactKind.PullRequest, label: 'Created', isArtifact: true, isGitHub: true, link: URI.parse('https://github.com/OWNER/REPO/pull/50/') },
			{ id: 'referenced-pr', kind: SessionArtifactKind.PullRequest, label: 'Referenced', isArtifact: false, isGitHub: true, link: URI.parse('https://github.com/owner/repo/pull/60') },
			{ id: 'referenced-promoted-pr', kind: SessionArtifactKind.PullRequest, label: 'Promoted', isArtifact: false, isGitHub: true, link: URI.parse('https://github.com/owner/repo/pull/50') },
			{ id: 'referenced-discovered-pr', kind: SessionArtifactKind.PullRequest, label: 'Discovered', isArtifact: false, isGitHub: true, link: URI.parse('https://github.com/owner/repo/pull/41') },
			{ id: 'created-issue', kind: SessionArtifactKind.Issue, label: 'Issue', isArtifact: true, isGitHub: true, link: URI.parse('https://github.com/owner/repo/issues/7') },
			{ id: 'referenced-issue', kind: SessionArtifactKind.Issue, label: 'Referenced issue', isArtifact: false, isGitHub: true, link: URI.parse('https://github.com/owner/repo/issues/8') },
			{ id: 'referenced-promoted-issue', kind: SessionArtifactKind.Issue, label: 'Promoted issue', isArtifact: false, isGitHub: true, link: URI.parse('https://github.com/OWNER/REPO/issues/7/') },
			{ id: 'foreign-pr', kind: SessionArtifactKind.PullRequest, label: 'Other repo', isArtifact: true, isGitHub: true, link: URI.parse('https://github.com/other/project/pull/9') },
			{ id: 'foreign-pr-reference', kind: SessionArtifactKind.PullRequest, label: 'Other repo reference', isArtifact: false, isGitHub: true, link: URI.parse('https://github.com/other/project/pull/10') },
			{ id: 'foreign-issue', kind: SessionArtifactKind.Issue, label: 'Other issue', isArtifact: true, isGitHub: true, link: URI.parse('https://github.com/other/project/issues/9') },
			{ id: 'gitlab-pr', kind: SessionArtifactKind.PullRequest, label: 'GitLab', isArtifact: true, isGitHub: false, link: URI.parse('https://gitlab.com/owner/repo/-/merge_requests/3') },
			{ id: 'file', kind: SessionArtifactKind.File, label: 'Plan', isArtifact: true, uri: URI.file('/repo/plan.md') },
		], {
			owner: 'owner',
			repo: 'repo',
			pullRequests: [50, 41].map(number => ({ owner: 'owner', repo: 'repo', number, uri: URI.parse(`https://github.com/owner/repo/pull/${number}`) })),
			issues: [{ owner: 'owner', repo: 'repo', number: 7, uri: URI.parse('https://github.com/owner/repo/issues/7') }],
		});

		assert.deepStrictEqual(visibleEntries(presentation), {
			artifacts: ['gitlab-pr', 'file'],
			references: ['referenced-pr', 'referenced-promoted-pr', 'referenced-discovered-pr', 'foreign-pr-reference', 'referenced-issue', 'referenced-promoted-issue'],
		});
	});

	test('attaches rich GitHub metadata lazily to references without promoting them', () => {
		let acquisitions = 0;
		const { presentation } = createPresentation([{
			id: 'reference',
			kind: SessionArtifactKind.PullRequest,
			label: 'Related pull request',
			isArtifact: false,
			isGitHub: true,
			link: URI.parse('https://github.com/microsoft/vscode/pull/1'),
		}], undefined, undefined, undefined, false, upcastPartial<IWorkbenchGitHubService>({
			onDidChangeDefaultClient: Event.None,
			acquireDefaultAccountClient: () => {
				acquisitions++;
				return new Promise(() => { });
			},
		}));

		const sections = presentation.referenceSections.get();
		const entry = sections[0].entries[0];
		assert.deepStrictEqual({
			acquisitions,
			sectionTitle: sections[0].title,
			entryId: entry.id,
			entryLabel: entry.label,
			hasDropdownHover: typeof entry.hover?.content === 'function',
			hasPillHover: typeof entry.pillHover === 'object',
			hasPrefetch: typeof entry.prefetch === 'function',
		}, {
			acquisitions: 0,
			sectionTitle: 'Pull Requests',
			entryId: 'reference',
			entryLabel: 'Related pull request',
			hasDropdownHover: true,
			hasPillHover: true,
			hasPrefetch: true,
		});
	});

	test('keeps recorded reference labels and leading IDs when GitHub metadata fails', async () => {
		const links = [
			URI.parse('https://github.com/microsoft/vscode/pull/1'),
			URI.parse('https://github.com/microsoft/vscode/issues/2'),
		];
		const { presentation } = createPresentation(links.map((link, index) => ({
			id: `reference-${index}`, kind: index === 0 ? SessionArtifactKind.PullRequest : SessionArtifactKind.Issue,
			label: 'Related item', isArtifact: false, isGitHub: true, link,
		})), undefined, undefined, undefined, false, upcastPartial<IWorkbenchGitHubService>({
			onDidChangeDefaultClient: Event.None,
			acquireDefaultAccountClient: async () => { throw new Error('offline'); },
		}));
		for (const entry of presentation.referenceSections.get().flatMap(section => section.entries)) {
			entry.prefetch?.();
		}
		await timeout(0);
		assert.deepStrictEqual(presentation.referenceSections.get().flatMap(section => section.entries.map(entry => ({
			label: entry.label, badge: entry.badge, badgeBeforeLabel: entry.badgeBeforeLabel,
		}))), links.map((_, index) => ({ label: 'Related item', badge: `#${index + 1}`, badgeBeforeLabel: true })));
	});

	test('warms newly recorded references without fetching initial or loading history', async () => {
		let acquisitions = 0;
		const reference = (id: string): ISessionArtifact => ({
			id, kind: SessionArtifactKind.Issue, label: id, isArtifact: false, isGitHub: true,
			link: URI.parse(`https://github.com/microsoft/vscode/issues/${id}`),
		});
		const { artifacts, loading } = createPresentation([reference('1')], undefined, undefined, undefined, false, upcastPartial<IWorkbenchGitHubService>({
			onDidChangeDefaultClient: Event.None,
			acquireDefaultAccountClient: async () => { acquisitions++; throw new Error('offline'); },
		}));
		await timeout(0);
		const initial = acquisitions;
		loading.set(true, undefined);
		artifacts.set([reference('1'), reference('2')], undefined);
		loading.set(false, undefined);
		await timeout(0);
		const restored = acquisitions;
		artifacts.set([reference('1'), reference('2'), reference('3')], undefined);
		await timeout(0);
		assert.deepStrictEqual({ initial, restored, newReference: acquisitions }, { initial: 0, restored: 0, newReference: 1 });
	});

	test('promotes recorded pull requests from other repositories when resolving for a chat', () => {
		const { presentation } = createPresentation([
			{ id: 'own-repo-pr', kind: SessionArtifactKind.PullRequest, label: 'Own repo', isArtifact: true, isGitHub: true, link: URI.parse('https://github.com/owner/repo/pull/1') },
			{ id: 'other-repo-pr', kind: SessionArtifactKind.PullRequest, label: 'Other repo', isArtifact: true, isGitHub: true, link: URI.parse('https://github.com/other/project/pull/9') },
		], { owner: 'owner', repo: 'repo' }, undefined, undefined, true);

		assert.deepStrictEqual(visibleEntries(presentation), {
			artifacts: [],
			references: [],
		});
	});

	test('does not re-list a pull request recorded by multiple chats as a generic artifact', () => {
		const pullRequest = URI.parse('https://github.com/owner/repo/pull/1');
		const { presentation } = createPresentation([
			{ id: 'peer-artifact', chat: URI.parse('ahp-chat://peer/session'), kind: SessionArtifactKind.PullRequest, label: 'Peer label', isArtifact: true, isGitHub: true, link: pullRequest },
			{ id: 'main-artifact', chat: URI.parse('ahp-chat://default/session'), kind: SessionArtifactKind.PullRequest, label: 'Main label', isArtifact: true, isGitHub: true, link: pullRequest },
		], {
			owner: 'owner',
			repo: 'repo',
			pullRequests: [{ owner: 'owner', repo: 'repo', number: 1, uri: pullRequest, recordedReferenceId: 'main-artifact' }],
		});

		assert.deepStrictEqual(visibleEntries(presentation), {
			artifacts: [],
			references: [],
		});
	});

	test('retains non-GitHub and noncanonical entries even when their URLs are surfaced', () => {
		const pullRequest: ISessionArtifact = {
			id: 'pr', kind: SessionArtifactKind.PullRequest, label: 'PR', isArtifact: true, isGitHub: true,
			link: URI.parse('https://github.com/owner/repo/pull/12'),
		};
		const entries: readonly ISessionArtifact[] = [
			{ ...pullRequest, id: 'not-github', isGitHub: false },
			{ ...pullRequest, id: 'unclassified', isGitHub: undefined },
			{ ...pullRequest, id: 'website', kind: SessionArtifactKind.Website },
			{ ...pullRequest, id: 'enterprise-pr', link: URI.parse('https://github.example.com/owner/repo/pull/12') },
			{ ...pullRequest, id: 'www-pr', link: URI.parse('https://www.github.com/owner/repo/pull/12') },
			{ ...pullRequest, id: 'http-pr', link: URI.parse('http://github.com/owner/repo/pull/12') },
			{ ...pullRequest, id: 'uppercase-host-pr', link: URI.parse('https://GitHub.com/owner/repo/pull/12') },
			{ ...pullRequest, id: 'query-pr', link: URI.parse('https://github.com/owner/repo/pull/12?tab=files') },
			{ ...pullRequest, id: 'fragment-pr', link: URI.parse('https://github.com/owner/repo/pull/12#discussion') },
			{ ...pullRequest, id: 'invalid-pr', link: URI.parse('https://github.com/owner/repo/pull/not-a-number') },
			{ ...pullRequest, id: 'not-github-issue', kind: SessionArtifactKind.Issue, isGitHub: false, link: URI.parse('https://github.com/owner/repo/issues/12') },
			{ ...pullRequest, id: 'enterprise-issue', kind: SessionArtifactKind.Issue, link: URI.parse('https://github.example.com/owner/repo/issues/12') },
			{ ...pullRequest, id: 'invalid-issue', kind: SessionArtifactKind.Issue, link: URI.parse('https://github.com/owner/repo/issues/0') },
		];

		assert.deepStrictEqual(entries.map(artifact => {
			const { presentation } = createPresentation([artifact], {
				owner: 'owner',
				repo: 'repo',
				pullRequest: { number: 12, uri: artifact.link! },
				issues: [{ owner: 'owner', repo: 'repo', number: 12, uri: artifact.link! }],
			});
			return [artifact.id, visibleEntries(presentation).artifacts];
		}), entries.map(artifact => [artifact.id, [artifact.id]]));
	});

	test('keeps GitHub artifacts out of generic pills and lists references before, during and after workspace hydration', () => {
		const pullRequest = URI.parse('https://github.com/owner/repo/pull/50');
		const reference = URI.parse('https://github.com/owner/repo/pull/60');
		const issue = URI.parse('https://github.com/owner/repo/issues/7');
		const entries: readonly ISessionArtifact[] = [
			{ id: 'pr', kind: SessionArtifactKind.PullRequest, label: 'Created', isArtifact: true, isGitHub: true, link: pullRequest },
			{ id: 'duplicate-reference', kind: SessionArtifactKind.PullRequest, label: 'Duplicate', isArtifact: false, isGitHub: true, link: pullRequest },
			{ id: 'reference', kind: SessionArtifactKind.PullRequest, label: 'Reference', isArtifact: false, isGitHub: true, link: reference },
			{ id: 'issue', kind: SessionArtifactKind.Issue, label: 'Issue', isArtifact: true, isGitHub: true, link: issue },
		];
		const { presentation, session, artifacts, workspace, gitHubInfo } = createPresentation(entries);
		const mountedWorkspace = workspace.get();
		workspace.set(undefined, undefined);
		let visible = visibleEntries(presentation);
		disposables.add(autorun(reader => {
			visible = visibleEntries(presentation, reader);
		}));
		const withoutWorkspace = visible;

		workspace.set(mountedWorkspace, undefined);
		const withoutGitHubInfo = visible;
		const legacyInfo: IGitHubInfo = {
			owner: 'owner', repo: 'repo',
			pullRequest: { number: 50, uri: pullRequest },
			issues: [{ owner: 'owner', repo: 'repo', number: 7, uri: issue }],
		};
		gitHubInfo.set(legacyInfo, undefined);
		const hydrated = visible;

		gitHubInfo.set({
			...legacyInfo,
			pullRequests: [{ owner: 'owner', repo: 'repo', number: 60, uri: reference }],
			issues: undefined,
		}, undefined);
		const changedGitHubInfo = visible;

		artifacts.set([...entries, { id: 'file', kind: SessionArtifactKind.File, label: 'Plan', isArtifact: true, uri: URI.file('/repo/plan.md') }], undefined);
		const recordedFile = visible;
		workspace.set(undefined, undefined);
		const unmounted = visible;
		session.set(undefined, undefined);
		const noSession = visible;

		const references = ['duplicate-reference', 'reference'];
		assert.deepStrictEqual({ withoutWorkspace, withoutGitHubInfo, hydrated, changedGitHubInfo, recordedFile, unmounted, noSession }, {
			withoutWorkspace: { artifacts: [], references },
			withoutGitHubInfo: { artifacts: [], references },
			hydrated: { artifacts: [], references },
			changedGitHubInfo: { artifacts: [], references },
			recordedFile: { artifacts: ['file'], references },
			unmounted: { artifacts: ['file'], references },
			noSession: { artifacts: [], references: [] },
		});
	});

	test('offers canonical row-level copy actions for every reference kind', () => {
		const copied: string[] = [];
		const pullRequestLink = URI.parse('https://github.com/microsoft/vscode/pull/12');
		const issueLink = URI.parse('https://github.com/microsoft/vscode/issues/34');
		const commitLink = URI.parse('https://github.com/microsoft/vscode/commit/abc123');
		const websiteLink = URI.parse('https://example.com/docs');
		const file = URI.file('/repo/src/index.ts');
		const resource = URI.parse('vscode://settings/chat');
		const artifacts: readonly ISessionArtifact[] = [
			{ id: 'pr', kind: SessionArtifactKind.PullRequest, label: 'PR #12', isArtifact: true, link: pullRequestLink },
			{ id: 'issue', kind: SessionArtifactKind.Issue, label: 'Issue #34', isArtifact: true, link: issueLink },
			{ id: 'commit', kind: SessionArtifactKind.Commit, label: 'Commit', isArtifact: true, link: commitLink, commitHash: 'abc123' },
			{ id: 'docs', kind: SessionArtifactKind.Website, label: 'Docs', isArtifact: true, link: websiteLink },
			{ id: 'file', kind: SessionArtifactKind.File, label: 'index.ts', isArtifact: true, uri: file },
			{ id: 'resource', kind: SessionArtifactKind.Resource, label: 'Chat settings', isArtifact: true, uri: resource },
		];

		const entries = buildSessionArtifactSections(artifacts, { ...actions, copy: text => copied.push(text) }, labelService, true, new Set()).flatMap(section => section.entries);
		for (const entry of entries) {
			entry.toolbarActions?.forEach(action => action.run());
		}

		assert.deepStrictEqual({
			entries: entries.map(entry => [entry.label, entry.toolbarActions?.map(action => action.label) ?? []]),
			copied,
		}, {
			entries: [
				['PR #12', ['Copy Pull Request Link']],
				['Issue #34', ['Copy Issue Link']],
				['Commit', ['Copy Commit URL']],
				['Docs', ['Copy Website URL']],
				['index.ts', ['Copy Path']],
				['Chat settings', ['Copy URI']],
			],
			copied: [
				pullRequestLink.toString(true),
				issueLink.toString(true),
				commitLink.toString(true),
				websiteLink.toString(true),
				'/repo/src/index.ts',
				resource.toString(true),
			],
		});
	});

	test('renders rich GitHub commit metadata with copy hash inside the hover', () => {
		const copied: string[] = [];
		const opened: string[] = [];
		const link = URI.parse('https://github.com/microsoft/vscode/commit/abc123');
		const artifact: ISessionArtifact = { id: 'commit', kind: SessionArtifactKind.Commit, label: 'Recorded commit', isArtifact: false, link, commitHash: 'abc123' };
		const sections = buildSessionArtifactSections(
			[artifact],
			{ ...actions, recordOpen: artifact => opened.push(artifact.id), copy: text => copied.push(text) },
			labelService,
			true,
			new Set(),
			new Map([['commit', {
				sha: 'abc123',
				message: 'Authoritative subject\n\nDetailed commit body',
				url: link.toString(true),
				author: { login: 'octocat' },
				committedAt: '2026-09-22T12:00:00Z',
			}]]),
		);
		const entry = sections[0].entries[0];
		const hover = typeof entry.hover?.content === 'function' ? entry.hover.content() : undefined;
		hover?.querySelector<HTMLElement>('.sessions-commit-hover-reference')?.click();
		void entry.hoverActions?.[0].run();
		void entry.toolbarActions?.[0].run();

		assert.deepStrictEqual({
			label: entry.label,
			actionLabels: entry.toolbarActions?.map(action => action.label),
			hoverActionLabels: entry.hoverActions?.map(action => action.label),
			hoverClassName: hover?.className,
			hoverText: hover?.textContent,
			opened,
			copied,
		}, {
			label: 'Authoritative subject',
			actionLabels: ['Copy Commit URL'],
			hoverActionLabels: ['Copy Commit Hash'],
			hoverClassName: 'chat-pill-hover-content sessions-commit-hover compact',
			hoverText: 'microsoft/vscodeon Sep 22Authoritative subject @abc123Detailed commit body@octocat committed this change',
			opened: ['commit'],
			copied: ['abc123', link.toString(true)],
		});
	});

	test('keeps commit hover controls stable through rebuilding and refreshes callbacks on reopening', () => {
		const cache = disposables.add(new ChatPillHoverCache());
		const opened: string[] = [];
		const link = URI.parse('https://github.com/microsoft/vscode/commit/abc123');
		const artifact: ISessionArtifact = { id: 'commit', kind: SessionArtifactKind.Commit, label: 'Commit', isArtifact: false, link, commitHash: 'abc123' };
		const commits = new Map<string, GitHubCommit>([['commit', {
			sha: 'abc123', message: 'Authoritative subject', url: link.toString(),
			author: { login: 'octocat' }, committedAt: '2026-09-22T12:00:00Z',
		}]]);
		const build = (scope: string) => buildSessionArtifactSections(
			[artifact], { ...actions, openExternal: () => opened.push(scope) },
			labelService, true, new Set(), commits, undefined, undefined, cache,
		)[0].entries[0].hover!;
		const render = (hover: NonNullable<IChatPillEntry['hover']>) => {
			const content = typeof hover.content === 'function' ? hover.content() : undefined;
			assert.ok(content instanceof HTMLElement);
			return content;
		};
		cache.retain(new Set(['commit']), 'session-1');
		const first = build('old');
		const content = render(first);
		mainWindow.document.body.appendChild(content);
		disposables.add(toDisposable(() => content.remove()));
		const control = first.getTabbableElements?.()[0]!;
		control.focus();
		const updated = build('new');
		const whileOpen = {
			sameContent: render(updated) === content,
			sameControl: updated.getTabbableElements?.()[0] === control,
			focusPreserved: mainWindow.document.activeElement === control,
			controls: updated.getTabbableElements?.().length,
		};
		content.remove();
		render(updated);
		updated.getTabbableElements?.()[0].click();
		cache.retain(new Set(['commit']), 'session-2');
		const otherSession = build('other session');
		render(otherSession);
		otherSession.getTabbableElements?.()[0].click();
		assert.deepStrictEqual({
			whileOpen, reopenedControls: updated.getTabbableElements?.().length,
			scopeEvicted: updated !== otherSession, opened,
		}, {
			whileOpen: { sameContent: true, sameControl: true, focusPreserved: true, controls: 2 },
			reopenedControls: 2, scopeEvicted: true, opened: ['new', 'other session'],
		});
	});

	test('hydrates GitHub commit metadata through the Agents window GitHub service', async () => {
		const link = URI.parse('https://github.com/microsoft/vscode/commit/abc123');
		const commit: GitHubCommit = {
			sha: 'abc123',
			message: 'Resolved commit subject\n\nResolved commit body',
			url: link.toString(true),
			author: { login: 'octocat' },
			committedAt: '2026-09-22T12:00:00Z',
		};
		const { presentation } = createPresentation([
			{ id: 'commit', kind: SessionArtifactKind.Commit, label: 'Recorded commit', isArtifact: false, link, commitHash: 'abc123' },
		], undefined, commit);

		presentation.referenceSections.get();
		await timeout(0);
		const entry = presentation.referenceSections.get().flatMap(section => section.entries)[0];
		const hover = typeof entry.hover?.content === 'function' ? entry.hover.content() : undefined;

		assert.deepStrictEqual({
			label: entry.label,
			rowActions: entry.toolbarActions?.map(action => action.label),
			hoverActions: entry.hoverActions?.map(action => action.label),
			hoverClassName: hover?.className,
			hoverText: hover?.textContent,
		}, {
			label: 'Resolved commit subject',
			rowActions: ['Copy Commit URL'],
			hoverActions: ['Copy Commit Hash'],
			hoverClassName: 'chat-pill-hover-content sessions-commit-hover compact',
			hoverText: 'microsoft/vscodeon Sep 22Resolved commit subject @abc123Resolved commit body@octocat committed this change',
		});
	});

	test('retries GitHub commit metadata after a transient lookup failure', async () => {
		const link = URI.parse('https://github.com/microsoft/vscode/commit/abc123');
		const artifact: ISessionArtifact = { id: 'commit', kind: SessionArtifactKind.Commit, label: 'Recorded commit', isArtifact: false, link, commitHash: 'abc123' };
		const commit: GitHubCommit = {
			sha: 'abc123',
			message: 'Resolved after retry',
			url: link.toString(true),
			author: { login: 'octocat' },
			committedAt: '2026-09-22T12:00:00Z',
		};
		let attempts = 0;
		const { presentation, artifacts } = createPresentation([artifact], undefined, undefined, async () => {
			attempts++;
			if (attempts === 1) {
				throw new Error('offline');
			}
			return commit;
		});
		let label: string | undefined;
		disposables.add(autorun(reader => {
			label = presentation.referenceSections.read(reader).flatMap(section => section.entries)[0]?.label;
		}));

		await timeout(0);
		artifacts.set([artifact], undefined);
		await timeout(0);

		assert.deepStrictEqual({ attempts, label }, { attempts: 2, label: 'Resolved after retry' });
	});

	for (const outcome of ['resolve', 'reject'] as const) {
		test(`cancels removed and disposed commit lookups when stale requests ${outcome}`, async () => {
			const link = URI.parse('https://github.com/microsoft/vscode/commit/abc123');
			const artifact: ISessionArtifact = {
				id: 'commit',
				kind: SessionArtifactKind.Commit,
				label: 'Recorded commit',
				isArtifact: false,
				link,
			};
			const requests: { token: CancellationToken; result: DeferredPromise<GitHubCommit> }[] = [];
			const { presentation, artifacts } = createPresentation([artifact], undefined, undefined, (_owner, _repo, _sha, token) => {
				const result = new DeferredPromise<GitHubCommit>();
				requests.push({ token, result });
				return result.p;
			});
			presentation.referenceSections.get();
			artifacts.set([], undefined);
			artifacts.set([artifact], undefined);
			presentation.referenceSections.get();
			if (outcome === 'resolve') {
				await requests[0].result.complete({
					sha: 'abc123',
					message: 'Stale commit',
					url: link.toString(true),
					author: { login: 'octocat' },
					committedAt: '2026-09-22T12:00:00Z',
				});
			} else {
				await requests[0].result.error(new Error('Cancelled request completed late'));
			}
			await timeout(0);
			const label = presentation.referenceSections.get().flatMap(section => section.entries)[0]?.label;
			const beforeDispose = requests.map(request => request.token.isCancellationRequested);
			presentation.dispose();

			assert.deepStrictEqual({
				label,
				beforeDispose,
				afterDispose: requests.map(request => request.token.isCancellationRequested),
			}, {
				label: 'Recorded commit',
				beforeDispose: [true, false],
				afterDispose: [true, true],
			});
			await requests[1].result.error(new Error('Disposed'));
		});
	}

	test('retries a failed commit lookup without orphaning existing observers', async () => {
		const link = URI.parse('https://github.com/microsoft/vscode/commit/abc123');
		const requests: DeferredPromise<GitHubCommit>[] = [];
		const { presentation } = createPresentation([
			{ id: 'reference', kind: SessionArtifactKind.Commit, label: 'Recorded reference', isArtifact: false, link },
			{ id: 'artifact', kind: SessionArtifactKind.Commit, label: 'Recorded artifact', isArtifact: true, link },
		], undefined, undefined, () => {
			const result = new DeferredPromise<GitHubCommit>();
			requests.push(result);
			return result.p;
		});
		let referenceLabel: string | undefined;
		disposables.add(autorun(reader => {
			referenceLabel = presentation.referenceSections.read(reader).flatMap(section => section.entries)[0]?.label;
		}));
		await requests[0].error(new Error('offline'));
		await timeout(0);

		presentation.sections.get();
		await requests[1].complete({
			sha: 'abc123',
			message: 'Resolved after retry',
			url: link.toString(true),
			author: { login: 'octocat' },
			committedAt: '2026-09-22T12:00:00Z',
		});
		await timeout(0);

		assert.deepStrictEqual({
			requestCount: requests.length,
			referenceLabel,
			artifactLabel: presentation.sections.get().flatMap(section => section.entries)[0]?.label,
		}, {
			requestCount: 2,
			referenceLabel: 'Resolved after retry',
			artifactLabel: 'Resolved after retry',
		});
	});

	test('removes references and durable artifacts by stable id, preserving duplicates', async () => {
		const duplicateLink = URI.parse('https://example.com/docs');
		const { presentation, artifacts, removed, errors, setRemovalError } = createPresentation([
			{ id: 'artifact', kind: SessionArtifactKind.Website, label: 'Durable', isArtifact: true, link: duplicateLink },
			{ id: 'reference-a', kind: SessionArtifactKind.Website, label: 'Docs', isArtifact: false, link: duplicateLink },
			{ id: 'reference-b', kind: SessionArtifactKind.Website, label: 'Docs', isArtifact: false, link: duplicateLink },
			{ id: 'issue', kind: SessionArtifactKind.Issue, label: 'Issue', isArtifact: false, link: URI.parse('https://github.com/microsoft/vscode/issues/1') },
		]);
		const read = () => ({
			sections: presentation.referenceSections.get().map(section => [section.title, section.entries.map(entry => entry.id)]),
			artifacts: presentation.sections.get().map(section => [section.title, section.entries.map(entry => entry.id)]),
		});
		const initial = read();
		const first = presentation.referenceSections.get().flatMap(section => section.entries).find(entry => entry.id === 'reference-a')!;
		await first.promotedAction?.run();
		const afterFirst = read();
		setRemovalError(new Error('offline'));
		await presentation.referenceSections.get().flatMap(section => section.entries).find(entry => entry.id === 'reference-b')?.promotedAction?.run();
		const afterFailure = read();
		setRemovalError(undefined);
		await presentation.referenceSections.get().flatMap(section => section.entries).find(entry => entry.id === 'issue')?.promotedAction?.run();
		const afterLastIssue = read();
		// Removing the durable artifact only deletes its session record; since it
		// was gated equally to references, this must succeed and empty its pill.
		await presentation.sections.get().flatMap(section => section.entries).find(entry => entry.id === 'artifact')?.promotedAction?.run();
		const afterArtifact = read();

		assert.deepStrictEqual({
			initial,
			afterFirst,
			afterFailure,
			afterLastIssue,
			afterArtifact,
			removed,
			errors,
			persisted: artifacts.get().map(artifact => artifact.id),
		}, {
			initial: { sections: [['Issues', ['issue']], ['Websites', ['reference-a', 'reference-b']]], artifacts: [['Websites', ['artifact']]] },
			afterFirst: { sections: [['Issues', ['issue']], ['Websites', ['reference-b']]], artifacts: [['Websites', ['artifact']]] },
			afterFailure: { sections: [['Issues', ['issue']], ['Websites', ['reference-b']]], artifacts: [['Websites', ['artifact']]] },
			afterLastIssue: { sections: [['Websites', ['reference-b']]], artifacts: [['Websites', ['artifact']]] },
			// The durable artifacts pill has nothing left to show once its only entry is removed.
			afterArtifact: { sections: [['Websites', ['reference-b']]], artifacts: [] },
			removed: ['reference-a', 'reference-b', 'issue', 'artifact'],
			errors: ['Could not remove Docs from this session: offline'],
			persisted: ['reference-b'],
		});
	});

	test('offers a remove action for every artifact and reference kind, gated purely on provider support', () => {
		const link = (path: string) => URI.parse(`https://example.com/${path}`);
		const entriesOf = (kind: SessionArtifactKind, isArtifact: boolean): ISessionArtifact => {
			switch (kind) {
				case SessionArtifactKind.PullRequest: return { id: `${kind}-${isArtifact}`, kind, label: 'PR', isArtifact, link: URI.parse('https://github.com/microsoft/vscode/pull/1') };
				case SessionArtifactKind.Issue: return { id: `${kind}-${isArtifact}`, kind, label: 'Issue', isArtifact, link: URI.parse('https://github.com/microsoft/vscode/issues/1') };
				case SessionArtifactKind.Commit: return { id: `${kind}-${isArtifact}`, kind, label: 'Commit', isArtifact, link: link('commit'), commitHash: 'abc123' };
				case SessionArtifactKind.Website: return { id: `${kind}-${isArtifact}`, kind, label: 'Site', isArtifact, link: link('site') };
				case SessionArtifactKind.File: return { id: `${kind}-${isArtifact}`, kind, label: 'File', isArtifact, uri: URI.file(`/repo/${isArtifact}.md`) };
				case SessionArtifactKind.Resource: return { id: `${kind}-${isArtifact}`, kind, label: 'Resource', isArtifact, uri: link('resource') };
			}
		};
		const kinds = [SessionArtifactKind.PullRequest, SessionArtifactKind.Issue, SessionArtifactKind.Commit, SessionArtifactKind.Website, SessionArtifactKind.File, SessionArtifactKind.Resource];
		const entries: ISessionArtifact[] = [];
		for (const kind of kinds) {
			entries.push(entriesOf(kind, true), entriesOf(kind, false));
		}
		// An image is a File artifact whose URI resolves to an image mime type.
		entries.push({ id: 'image-true', kind: SessionArtifactKind.File, label: 'Image', isArtifact: true, uri: URI.file('/repo/true.png') });
		entries.push({ id: 'image-false', kind: SessionArtifactKind.File, label: 'Image', isArtifact: false, uri: URI.file('/repo/false.png') });

		const withoutSupport = buildSessionArtifactSections(entries, actions, labelService, true, new Set()).flatMap(section => section.entries);
		const withSupport = buildSessionArtifactSections(entries, { ...actions, remove: async () => { } }, labelService, true, new Set()).flatMap(section => section.entries);

		const byId = (rendered: readonly IChatPillEntry[]) =>
			rendered.map(entry => [entry.id, entry.promotedAction?.hoverLabel]).sort((a, b) => String(a[0]).localeCompare(String(b[0])));
		// Expectations derive from the input entries, so a dropped or unrendered
		// kind fails instead of silently agreeing with whatever was produced.
		const expected = (removable: boolean) =>
			entries.map(entry => [entry.id, removable ? (entry.isArtifact ? 'Remove Artifact' : 'Remove Reference') : undefined]).sort((a, b) => String(a[0]).localeCompare(String(b[0])));

		assert.deepStrictEqual({
			withoutSupport: byId(withoutSupport),
			withSupport: byId(withSupport),
			websiteLabels: withSupport.filter(entry => entry.id.startsWith(`${SessionArtifactKind.Website}-`)).map(entry => entry.promotedAction?.label),
		}, {
			// No entry of any kind — artifact or reference — gets a remove action without provider support.
			withoutSupport: expected(false),
			// Every kind gets a remove action once the provider supports it, named for whether it removes an artifact or a reference.
			withSupport: expected(true),
			websiteLabels: ['Remove Artifact Site from Session', 'Remove Reference Site from Session'],
		});
	});

});
