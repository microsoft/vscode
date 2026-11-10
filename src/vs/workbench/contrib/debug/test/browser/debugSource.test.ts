/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise } from '../../../../../base/common/async.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { toDisposable } from '../../../../../base/common/lifecycle.js';
import { isWindows } from '../../../../../base/common/platform.js';
import { URI as uri } from '../../../../../base/common/uri.js';
import { upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { EndOfLinePreference } from '../../../../../editor/common/model.js';
import { IEditorWorkerService } from '../../../../../editor/common/services/editorWorker.js';
import { ITextModelService } from '../../../../../editor/common/services/resolverService.js';
import { IHoverService } from '../../../../../platform/hover/browser/hover.js';
import { NullHoverService } from '../../../../../platform/hover/test/browser/nullHoverService.js';
import { NullLogService } from '../../../../../platform/log/common/log.js';
import { IViewContainerModel, IViewDescriptorService, ViewContainer, ViewContainerLocation } from '../../../../common/views.js';
import { workbenchInstantiationService } from '../../../../test/browser/workbenchTestServices.js';
import { DebugSession } from '../../browser/debugSession.js';
import { LoadedScriptsView } from '../../browser/loadedScriptsView.js';
import { RawDebugSession } from '../../browser/rawDebugSession.js';
import { IDebugService, IViewModel, LOADED_SCRIPTS_VIEW_ID } from '../../common/debug.js';
import { DebugContentProvider } from '../../common/debugContentProvider.js';
import { Source } from '../../common/debugSource.js';
import { MockDebugAdapter } from '../common/mockDebug.js';
import { createTestSession } from './callStack.test.js';
import { createMockDebugModel, mockUriIdentityService } from './mockDebugModel.js';

suite('Debug - Source', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('from raw source', () => {
		const source = new Source({
			name: 'zz',
			path: '/xx/yy/zz',
			sourceReference: 0,
			presentationHint: 'emphasize'
		}, 'aDebugSessionId', mockUriIdentityService, new NullLogService());

		assert.strictEqual(source.presentationHint, 'emphasize');
		assert.strictEqual(source.name, 'zz');
		assert.strictEqual(source.inMemory, false);
		assert.strictEqual(source.reference, 0);
		assert.strictEqual(source.uri.toString(), uri.file('/xx/yy/zz').toString());
	});

	test('from raw internal source', () => {
		const source = new Source({
			name: 'internalModule.js',
			sourceReference: 11,
			presentationHint: 'deemphasize'
		}, 'aDebugSessionId', mockUriIdentityService, new NullLogService());

		assert.strictEqual(source.presentationHint, 'deemphasize');
		assert.strictEqual(source.name, 'internalModule.js');
		assert.strictEqual(source.inMemory, true);
		assert.strictEqual(source.reference, 11);
		assert.strictEqual(source.uri.toString(), 'debug:internalModule.js?session%3DaDebugSessionId%26ref%3D11');
	});

	test('get encoded debug data', () => {
		const checkData = (uri: uri, expectedName: string, expectedPath: string, expectedSourceReference: number | undefined, expectedSessionId?: string) => {
			const { name, path, sourceReference, sessionId } = Source.getEncodedDebugData(uri);
			assert.strictEqual(name, expectedName);
			assert.strictEqual(path, expectedPath);
			assert.strictEqual(sourceReference, expectedSourceReference);
			assert.strictEqual(sessionId, expectedSessionId);
		};

		checkData(uri.file('a/b/c/d'), 'd', isWindows ? '\\a\\b\\c\\d' : '/a/b/c/d', undefined, undefined);
		checkData(uri.from({ scheme: 'file', path: '/my/path/test.js', query: 'ref=1&session=2' }), 'test.js', isWindows ? '\\my\\path\\test.js' : '/my/path/test.js', undefined, undefined);

		checkData(uri.from({ scheme: 'http', authority: 'www.example.com', path: '/my/path' }), 'path', 'http://www.example.com/my/path', undefined, undefined);
		checkData(uri.from({ scheme: 'debug', authority: 'www.example.com', path: '/my/path', query: 'ref=100' }), 'path', '/my/path', 100, undefined);
		checkData(uri.from({ scheme: 'debug', path: 'a/b/c/d.js', query: 'session=100' }), 'd.js', 'a/b/c/d.js', undefined, '100');
		checkData(uri.from({ scheme: 'debug', path: 'a/b/c/d/foo.txt', query: 'session=100&ref=10' }), 'foo.txt', 'a/b/c/d/foo.txt', 10, '100');
	});
});

suite('Debug - Source content', () => {
	let sessionToDisconnect: DebugSession | undefined;

	teardown(async () => {
		await sessionToDisconnect?.disconnect();
		sessionToDisconnect = undefined;
	});

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	async function createSourceView(computeMoreMinimalEdits: IEditorWorkerService['computeMoreMinimalEdits'] = async (_resource, edits) => edits ?? undefined) {
		const services = workbenchInstantiationService(undefined, disposables);
		const debugModel = createMockDebugModel(disposables);
		const session = disposables.add(createTestSession(debugModel));
		sessionToDisconnect = session;
		debugModel.addSession(session);
		const sourceRequests = disposables.add(new Emitter<DebugProtocol.Request>());
		let initialRequest = true;
		const adapter = disposables.add(new class extends MockDebugAdapter {
			override sendMessage(message: DebugProtocol.ProtocolMessage): void {
				if (message.type === 'request') {
					const request = message as DebugProtocol.Request;
					if (request.command === 'source') {
						if (initialRequest) {
							initialRequest = false;
							this.sendResponseBody(request, { content: 'initial' });
						} else {
							sourceRequests.fire(request);
						}
						return;
					}
				}
				super.sendMessage(message);
			}
		});
		const raw = disposables.add(new RawDebugSession(adapter, undefined!, '', '', undefined!, undefined!, undefined!, undefined!));
		session.initializeForTest(raw);
		const unavailableSources: uri[] = [];
		services.stub(IDebugService, {
			getModel: () => debugModel,
			getViewModel: () => upcastPartial<IViewModel>({ focusedSession: session }),
			onDidNewSession: Event.None,
			onDidEndSession: Event.None,
			sourceIsNotAvailable: resource => unavailableSources.push(resource)
		});
		services.stub(IEditorWorkerService, { computeMoreMinimalEdits });
		services.stub(IHoverService, NullHoverService);
		const provider = disposables.add(services.createInstance(DebugContentProvider));

		const source = session.getSource({ name: 'synthetic.js', path: 'synthetic.js', sourceReference: 1 });
		const reference = disposables.add(await services.get(ITextModelService).createModelReference(source.uri));
		disposables.add(reference.object);
		const model = reference.object.textEditorModel;
		const container = upcastPartial<ViewContainer>({ id: LOADED_SCRIPTS_VIEW_ID });
		services.stub(IViewDescriptorService, {
			onDidChangeLocation: Event.None,
			getViewLocationById: () => ViewContainerLocation.Sidebar,
			getViewDescriptorById: () => null,
			getViewContainerByViewId: () => container,
			getDefaultContainerById: () => container,
			getViewContainerModel: () => upcastPartial<IViewContainerModel>({ onDidChangeContainerInfo: Event.None })
		});
		const view = disposables.add(services.createInstance(LoadedScriptsView, { id: LOADED_SCRIPTS_VIEW_ID, title: 'Loaded Scripts' }));
		disposables.add(toDisposable(() => view.element.remove()));
		document.body.appendChild(view.element);
		view.render();

		const settle = async () => {
			const settled = Event.toPromise(session.onDidCustomEvent);
			// The adapter dispatches the event after the response's microtasks settle.
			adapter.sendEventBody('sourceRefreshComplete', {});
			await settled;
		};

		return {
			adapter,
			model,
			provider,
			settle,
			unavailableSources,
			requestSourceChange: async () => {
				const requested = Event.toPromise(sourceRequests.event);
				adapter.sendEventBody('loadedSource', { reason: 'changed', source: source.raw });
				return requested;
			},
			respond: async (request: DebugProtocol.Request, content: string) => {
				adapter.sendResponseBody(request, { content });
				await settle();
			}
		};
	}

	test('keeps the latest loaded source when an earlier source response arrives last', async () => {
		const { model, requestSourceChange, respond } = await createSourceView();
		const first = await requestSourceChange();
		const second = await requestSourceChange();

		await respond(second, 'newer source');
		await respond(first, 'older source');

		assert.strictEqual(model.getValue(), 'newer source');
	});

	test('does not let a cancelled edit clear a newer source update', async () => {
		const firstEdits = new DeferredPromise<void>();
		const secondEdits = new DeferredPromise<void>();
		const { model, requestSourceChange, respond, settle } = await createSourceView(async (_resource, edits) => {
			if (edits?.[0].text === 'first') {
				await firstEdits.p;
			} else if (edits?.[0].text === 'second') {
				await secondEdits.p;
			}
			return edits ?? undefined;
		});

		await respond(await requestSourceChange(), 'first');
		await respond(await requestSourceChange(), 'second');
		await firstEdits.complete();
		await settle();
		await respond(await requestSourceChange(), 'third');
		await secondEdits.complete();
		await settle();

		assert.strictEqual(model.getValue(), 'third');
	});

	test('ignores an earlier source error after a newer source has loaded', async () => {
		const { adapter, model, requestSourceChange, respond, settle, unavailableSources } = await createSourceView();
		const first = await requestSourceChange();
		const second = await requestSourceChange();
		await respond(second, 'newer source');

		const response: DebugProtocol.Response = {
			type: 'response',
			seq: 0,
			request_seq: first.seq,
			command: first.command,
			success: false,
			message: 'source replaced'
		};
		adapter.acceptMessage(response);
		await settle();

		assert.deepStrictEqual({ content: model.getValue(), unavailableSources }, { content: 'newer source', unavailableSources: [] });
	});

	test('ignores a source response after the source model is disposed', async () => {
		const { model, requestSourceChange, respond } = await createSourceView();
		const request = await requestSourceChange();
		model.dispose();

		await respond(request, 'late source');

		assert.strictEqual(model.isDisposed(), true);
	});

	test('ignores a source response after the provider is disposed', async () => {
		const { model, provider, requestSourceChange, respond } = await createSourceView();
		const request = await requestSourceChange();
		provider.dispose();

		await respond(request, 'late source');

		assert.strictEqual(model.getValue(), 'initial');
	});

	test('applies sequential loaded source changes including empty content', async () => {
		const { model, requestSourceChange, respond } = await createSourceView();
		const contents: string[] = [];
		for (const content of ['first\nline', '', '', 'last']) {
			await respond(await requestSourceChange(), content);
			contents.push(model.getValue(EndOfLinePreference.LF));
		}

		assert.deepStrictEqual(contents, ['first\nline', '', '', 'last']);
	});
});
