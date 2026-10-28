/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { mainWindow } from '../../../../../base/browser/window.js';
import { DeferredPromise, timeout } from '../../../../../base/common/async.js';
import { VSBuffer } from '../../../../../base/common/buffer.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { toDisposable } from '../../../../../base/common/lifecycle.js';
import { constObservable, observableValue } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IFileContent, IFileService } from '../../../../../platform/files/common/files.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ILogService, NullLogService } from '../../../../../platform/log/common/log.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import { IOpenerService } from '../../../../../platform/opener/common/opener.js';
import { IChatImageCarouselService } from '../../../../../workbench/contrib/chat/browser/chatImageCarouselService.js';
import { IChatService, IChatToolInvocationSerialized, ToolConfirmKind } from '../../../../../workbench/contrib/chat/common/chatService/chatService.js';
import { ChatToolInvocation } from '../../../../../workbench/contrib/chat/common/model/chatProgressTypes/chatToolInvocation.js';
import { ToolDataSource } from '../../../../../workbench/contrib/chat/common/tools/languageModelToolsService.js';
import { ChatResponseModelChangeReason, IChatModel, IChatRequestModel, IChatResponseModel } from '../../../../../workbench/contrib/chat/common/model/chatModel.js';
import { IChat, ISession, ISessionArtifact, ISessionFileChange, SessionArtifactKind } from '../../../../services/sessions/common/session.js';
import { collectInboxCommandEvidence, collectInboxEvidence } from '../../common/inboxEvidence.js';
import { InboxEvidenceWidget } from '../../browser/inboxEvidenceWidget.js';
import { IInboxNotificationItem } from '../../common/inboxNotificationsService.js';

suite('Inbox evidence collection', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const main = upcastPartial<IChat>({ resource: URI.parse('test:///main'), changes: constObservable([]) });
	const child = upcastPartial<IChat>({ resource: URI.parse('test:///child'), changes: constObservable([]) });
	const item = upcastPartial<IInboxNotificationItem>({ title: 'Task' });
	const session = (artifacts: readonly ISessionArtifact[] = []) => upcastPartial<ISession>({ mainChat: constObservable(main), artifacts: constObservable(artifacts) });
	const model = (parts: IChatResponseModel['response']['value'], id = 'request') => upcastPartial<IChatModel>({
		onDidChange: Event.None,
		getRequests: () => [upcastPartial<IChatRequestModel>({
			id,
			response: upcastPartial<IChatResponseModel>({
				onDidChange: Event.None,
				response: upcastPartial<IChatResponseModel['response']>({ value: parts }),
			}),
		})],
	});
	const tool = (id: string, extra: Partial<IChatToolInvocationSerialized> = {}): IChatToolInvocationSerialized => ({
		kind: 'toolInvocationSerialized', toolCallId: id, toolId: 'tool', invocationMessage: 'Run',
		originMessage: undefined, pastTenseMessage: undefined, presentation: undefined, source: undefined,
		isConfirmed: true, isComplete: true, ...extra,
	});

	async function waitForImages(widget: InboxEvidenceWidget): Promise<void> {
		if (widget.element.querySelector('.inbox-evidence-images')) {
			return;
		}
		const ready = new DeferredPromise<void>();
		const observer = new mainWindow.MutationObserver(() => {
			if (widget.element.querySelector('.inbox-evidence-images')) {
				void ready.complete();
			}
		});
		store.add(toDisposable(() => observer.disconnect()));
		observer.observe(widget.element, { childList: true, subtree: true });
		await ready.p;
		observer.disconnect();
	}

	test('scopes artifacts to the exact chat, separates references, and never previews remote URLs or SVG', () => {
		const artifact = (id: string, uri: URI, chat?: URI, isArtifact = true): ISessionArtifact => ({ id, label: id, uri, chat, isArtifact, kind: SessionArtifactKind.File });
		const owner = session([
			artifact('legacy', URI.file('/main.png')),
			artifact('child', URI.file('/child.png'), child.resource),
			artifact('reference', URI.file('/reference.png'), child.resource, false),
			artifact('remote', URI.parse('https://example.test/remote.png'), child.resource),
			artifact('svg', URI.file('/image.svg'), child.resource),
		]);
		const evidence = collectInboxEvidence(owner, child, undefined);
		assert.deepStrictEqual({
			images: evidence.images.map(image => image.name),
			artifacts: evidence.artifacts.map(artifact => [artifact.id, artifact.isArtifact]),
			mainImages: collectInboxEvidence(owner, main, undefined).images.map(image => image.name),
			conversationAvailable: evidence.conversationAvailable,
		}, {
			images: ['child'], artifacts: [['reference', false], ['remote', true], ['svg', true]],
			mainImages: ['legacy'], conversationAvailable: false,
		});
	});

	test('records terminal states without turning background startup, missing status, or prose into verification', () => {
		const command = (id: string, exitCode?: number, extra: Partial<IChatToolInvocationSerialized> = {}) => tool(id, {
			toolSpecificData: { kind: 'terminal', language: 'shell', commandLine: { original: id }, terminalCommandState: { exitCode }, terminalCommandOutput: { text: `${id} output` } },
			...extra,
		});
		const commands = collectInboxCommandEvidence(model([
			{ kind: 'markdownContent', content: { value: 'All 100 tests passed with 100% coverage.' } },
			command('test', 1),
			command('echo', 0),
			command('unknown'),
			command('denied', undefined, { isConfirmed: { type: ToolConfirmKind.Denied } }),
			command('server', 0, { toolSpecificData: { kind: 'terminal', language: 'shell', commandLine: { original: 'server' }, terminalCommandState: { exitCode: 0 }, isBackground: true } }),
		]));
		assert.deepStrictEqual(commands.map(command => [command.command, command.state, command.exitCode]), [
			['test', 'exited', 1], ['echo', 'exited', 0], ['unknown', 'unavailable', undefined],
			['denied', 'denied', undefined], ['server', 'background', 0],
		]);
	});

	test('only collects successful tool image outputs and never substitutes another request', () => {
		const image = (id: string, extra: Partial<IChatToolInvocationSerialized> = {}) => tool(id, {
			resultDetails: { input: '', output: [{ type: 'ref', uri: URI.file(`/${id}.png`), mimeType: 'image/png' }] },
			...extra,
		});
		const chatModel = model([
			image('screenshot'),
			image('denied', { isConfirmed: { type: ToolConfirmKind.Denied } }),
			image('error', { resultError: 'failed' }),
		]);
		assert.deepStrictEqual({
			images: collectInboxEvidence(session(), main, chatModel, 'request').images.map(image => image.name),
			missing: collectInboxEvidence(session(), main, chatModel, 'previous').images,
		}, { images: ['screenshot.png'], missing: [] });
	});

	test('omits changed files and terminal output from visual and accessible evidence, including live updates', async () => {
		const instantiation = store.add(new TestInstantiationService());
		const changed = store.add(new Emitter<ChatResponseModelChangeReason>());
		const changes = observableValue<readonly ISessionFileChange[]>('changes', [{
			uri: URI.file('/removed.ts'), originalUri: URI.parse('git:/removed.ts'), insertions: 0, deletions: 4,
		}]);
		const chat = { ...main, changes };
		let output = 'original failure';
		const response = upcastPartial<IChatResponseModel>({
			onDidChange: changed.event,
			get response() {
				return upcastPartial<IChatResponseModel['response']>({
					value: [tool('setup', {
						toolSpecificData: { kind: 'terminal', language: 'shell', commandLine: { original: 'ls' }, terminalCommandState: { exitCode: 0 } },
					}), tool('test', {
						toolSpecificData: { kind: 'terminal', language: 'shell', commandLine: { original: 'npm test' }, terminalCommandState: { exitCode: 1 }, terminalCommandOutput: { text: output, truncated: true } },
					})]
				});
			},
		});
		const chatModel = upcastPartial<IChatModel>({ onDidChange: Event.None, getRequests: () => [upcastPartial<IChatRequestModel>({ id: 'request', response })] });
		instantiation.stub(IChatService, { onDidCreateModel: Event.None, getSession: () => chatModel });
		instantiation.stub(IFileService, {});
		instantiation.stub(IChatImageCarouselService, {});
		instantiation.stub(IOpenerService, {});
		instantiation.stub(ILogService, new NullLogService());
		instantiation.stub(INotificationService, {});
		const widget = store.add(instantiation.createInstance(InboxEvidenceWidget, session(), chat, item, () => { }));
		document.body.appendChild(widget.element);
		store.add(toDisposable(() => widget.element.remove()));
		await timeout(0);
		output = 'additional failure context';
		changed.fire({ reason: 'other' });
		await timeout(0);
		assert.deepStrictEqual({
			text: widget.element.textContent,
			accessible: widget.getAccessibleContent(),
			display: widget.element.style.display,
		}, {
			text: '', accessible: '', display: 'none',
		});
	});

	for (const additionalDistinctImage of [false, true]) {
		test(`deduplicates image bytes across sources without hiding different images (additionalDistinctImage=${additionalDistinctImage})`, async () => {
			const instantiation = store.add(new TestInstantiationService());
			const mobile = URI.file('/mobile.png');
			const desktop = URI.file('/desktop.png');
			const distinct = URI.file('/different/mobile.png');
			const owner = session([
				{ id: 'mobile', kind: SessionArtifactKind.File, label: 'Mobile screenshot', isArtifact: true, uri: mobile },
				{ id: 'desktop', kind: SessionArtifactKind.File, label: 'Desktop screenshot', isArtifact: true, uri: desktop },
				{ id: 'report', kind: SessionArtifactKind.File, label: 'Report', isArtifact: true, uri: URI.file('/report.txt') },
			]);
			const resources = [URI.file('/tool/mobile.png'), URI.file('/tool/desktop.png'), ...(additionalDistinctImage ? [distinct] : [])];
			const chatModel = model([tool('images', { resultDetails: { input: '', output: resources.map(uri => ({ type: 'ref', uri, mimeType: 'image/png' })) } })]);
			const bytes = new Map([
				[mobile.path, 'mobile'], [desktop.path, 'desktop'],
				[resources[0].path, 'mobile'], [resources[1].path, 'desktop'], [distinct.path, 'different mobile'],
			]);
			const reads: object[] = [];
			const inspected: { uri: URI; options: Parameters<IChatImageCarouselService['openCarouselAtResource']>[2] }[] = [];
			instantiation.stub(IChatService, { onDidCreateModel: Event.None, getSession: () => chatModel });
			instantiation.stub(IFileService, {
				readFile: async (uri, options) => {
					reads.push({ path: uri.path, limits: options?.limits });
					return upcastPartial<IFileContent>({ value: VSBuffer.fromString(bytes.get(uri.path)!) });
				}
			});
			instantiation.stub(IChatImageCarouselService, { openCarouselAtResource: async (uri, _data, options) => { inspected.push({ uri, options }); } });
			instantiation.stub(IOpenerService, {});
			instantiation.stub(ILogService, new NullLogService());
			instantiation.stub(INotificationService, {});
			const widget = store.add(instantiation.createInstance(InboxEvidenceWidget, owner, main, item, () => { }));
			await waitForImages(widget);
			widget.element.querySelector<HTMLElement>('.inbox-evidence-image .monaco-button')!.click();
			assert.deepStrictEqual({
				captions: [...widget.element.querySelectorAll('figcaption')].map(element => element.textContent),
				artifactLinks: [...widget.element.querySelectorAll('.inbox-evidence-files .monaco-button')].map(element => element.textContent),
				moreImages: widget.element.textContent?.includes('Showing 2 of 3 images.'),
				accessible: widget.getAccessibleContent(),
				inspection: inspected.map(({ uri, options }) => ({
					uri: uri.path, session: options?.sessionResource, includeChatImages: options?.includeChatImages,
					images: options?.additionalImages?.map(image => image.uri.path),
				})),
				reads,
			}, {
				captions: ['Mobile screenshot', 'Desktop screenshot'], artifactLinks: ['Report'],
				moreImages: additionalDistinctImage,
				accessible: [
					`Mobile screenshot: ${mobile.toString(true)}`, `Desktop screenshot: ${desktop.toString(true)}`,
					...(additionalDistinctImage ? [`mobile.png: ${distinct.toString(true)}`] : []),
					`Report: ${URI.file('/report.txt').toString(true)}`,
				].join('\n\n'),
				inspection: [{ uri: mobile.path, session: main.resource, includeChatImages: false, images: [mobile.path, desktop.path, ...(additionalDistinctImage ? [distinct.path] : [])] }],
				reads: [mobile, desktop, ...resources].map(uri => ({ path: uri.path, limits: { size: 10 * 1024 * 1024 } })),
			});
		});
	}

	test('does not attach late image reads after disposal', async () => {
		const instantiation = store.add(new TestInstantiationService());
		const read = new DeferredPromise<IFileContent>();
		const calls: object[] = [];
		instantiation.stub(IChatService, { onDidCreateModel: Event.None, getSession: () => undefined });
		instantiation.stub(IFileService, { readFile: (_resource, options) => { calls.push(options!); return read.p; } });
		instantiation.stub(IChatImageCarouselService, { openCarouselAtResource: async (uri, _data, options) => { calls.push({ uri, options }); } });
		instantiation.stub(IOpenerService, {});
		instantiation.stub(ILogService, new NullLogService());
		instantiation.stub(INotificationService, {});
		const uri = URI.file('/recorded.png');
		const owner = session([{ id: 'image', kind: SessionArtifactKind.File, label: 'Recorded image', isArtifact: true, uri }]);
		const widget = store.add(instantiation.createInstance(InboxEvidenceWidget, owner, main, item, () => { }));
		widget.dispose();
		await read.error(new Error('Read canceled'));
		await timeout(0);
		assert.deepStrictEqual({
			images: widget.element.querySelectorAll('img').length,
			calls,
		}, {
			images: 0,
			calls: [
				{ limits: { size: 10 * 1024 * 1024 } },
			],
		});
	});

	test('ignores stale image reads while keeping unavailable replacement sources inspectable', async () => {
		const instantiation = store.add(new TestInstantiationService());
		const oldRead = new DeferredPromise<IFileContent>();
		const artifact = (id: string): ISessionArtifact => ({ id, kind: SessionArtifactKind.File, label: id, isArtifact: true, uri: URI.file(`/${id}.png`) });
		const artifacts = observableValue<readonly ISessionArtifact[]>('artifacts', [artifact('old')]);
		let oldReadCanceled = () => false;
		const warnings: string[] = [];
		const inspected: string[] = [];
		instantiation.stub(IChatService, { onDidCreateModel: Event.None, getSession: () => undefined });
		instantiation.stub(IFileService, {
			readFile: async (uri, _options, token) => {
				if (uri.path === '/old.png') {
					oldReadCanceled = () => token?.isCancellationRequested === true;
					return oldRead.p;
				}
				throw new Error('Image exceeds the preview limit');
			}
		});
		instantiation.stub(IChatImageCarouselService, { openCarouselAtResource: async uri => { inspected.push(uri.path); } });
		instantiation.stub(IOpenerService, {});
		instantiation.stub(ILogService, { warn: message => { warnings.push(message); } });
		instantiation.stub(INotificationService, {});
		const widget = store.add(instantiation.createInstance(InboxEvidenceWidget, { ...session(), artifacts }, main, item, () => { }));
		artifacts.set([artifact('replacement')], undefined);
		await waitForImages(widget);
		await oldRead.complete(upcastPartial<IFileContent>({ value: VSBuffer.fromString('stale image') }));
		await timeout(0);
		widget.element.querySelector<HTMLElement>('.inbox-evidence-image .monaco-button')!.click();
		assert.deepStrictEqual({
			canceled: oldReadCanceled(), warnings,
			captions: [...widget.element.querySelectorAll('figcaption')].map(element => element.textContent),
			unavailable: widget.element.textContent?.includes('Preview unavailable'),
			images: widget.element.querySelectorAll('img').length,
			inspected,
		}, {
			canceled: true, warnings: ['[InboxEvidence] Image preview unavailable'], captions: ['replacement'],
			unavailable: true, images: 0, inspected: ['/replacement.png'],
		});
	});

	test('command sources stay scoped to the requested turn without substituting another request', () => {
		const first = model([tool('first', { toolSpecificData: { kind: 'terminal', commandLine: { original: 'first' }, language: 'shell' } })], 'first').getRequests()[0];
		const last = model([tool('last', { toolSpecificData: { kind: 'terminal', commandLine: { original: 'last' }, language: 'shell' } })], 'last').getRequests()[0];
		const chatModel = upcastPartial<IChatModel>({ getRequests: () => [first, last] });
		assert.deepStrictEqual({
			first: collectInboxCommandEvidence(chatModel, 'first').map(command => command.id),
			latest: collectInboxCommandEvidence(chatModel).map(command => command.id),
			missing: collectInboxCommandEvidence(chatModel, 'missing'),
		}, { first: ['first'], latest: ['last'], missing: [] });
	});

	for (const pendingCommand of [false, true]) {
		test(`keeps empty evidence quiet without an interpretation service (pendingCommand=${pendingCommand})`, () => {
			const instantiation = store.add(new TestInstantiationService());
			const pending = new ChatToolInvocation(
				{
					invocationMessage: 'List files',
					confirmationMessages: { title: 'Allow listing?', message: 'List files?' },
					toolSpecificData: { kind: 'terminal', language: 'shell', commandLine: { original: 'ls' } },
				},
				{ id: 'terminal', displayName: 'Terminal', modelDescription: 'Terminal', source: ToolDataSource.Internal },
				'pending', undefined, {},
			);
			instantiation.stub(IChatService, { onDidCreateModel: Event.None, getSession: () => model(pendingCommand ? [pending] : []) });
			instantiation.stub(IFileService, {});
			instantiation.stub(IChatImageCarouselService, {});
			instantiation.stub(IOpenerService, {});
			instantiation.stub(ILogService, new NullLogService());
			instantiation.stub(INotificationService, {});
			const widget = store.add(instantiation.createInstance(InboxEvidenceWidget, session(), main, item, () => { }));
			assert.deepStrictEqual({
				text: widget.element.textContent,
				accessible: widget.getAccessibleContent(),
				display: widget.element.style.display,
			}, { text: '', accessible: '', display: 'none' });
		});
	}
});
