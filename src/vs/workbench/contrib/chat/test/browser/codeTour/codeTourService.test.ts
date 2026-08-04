/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { DisposableStore } from '../../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { Range } from '../../../../../../editor/common/core/range.js';
import { DocumentSymbolProvider, SymbolKind } from '../../../../../../editor/common/languages.js';
import { ILanguageFeaturesService } from '../../../../../../editor/common/services/languageFeatures.js';
import { LanguageFeaturesService } from '../../../../../../editor/common/services/languageFeaturesService.js';
import { ITextModelService } from '../../../../../../editor/common/services/resolverService.js';
import { createTextModel } from '../../../../../../editor/test/common/testTextModel.js';
import { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ITelemetryService } from '../../../../../../platform/telemetry/common/telemetry.js';
import { NullTelemetryService } from '../../../../../../platform/telemetry/common/telemetryUtils.js';
import { IEditorService } from '../../../../../services/editor/common/editorService.js';
import { IAgentNetworkFilterService } from '../../../../../../platform/networkFilter/common/networkFilterService.js';
import { IBrowserViewWorkbenchService } from '../../../../browserView/common/browserView.js';
import { CodeTourService } from '../../../browser/codeTour/codeTourService.js';
import { IChatService } from '../../../common/chatService/chatService.js';
import { IChatChangeEvent } from '../../../common/model/chatModel.js';

suite('CodeTourService', () => {

	const disposables = new DisposableStore();

	const sessionResource = URI.parse('vscode-chat-session://test/1');
	const fileUri = URI.parse('file:///test/file.ts');
	const testContent = [
		'export function first() {',
		'\treturn 1;',
		'}',
		'',
		'export function second() {',
		'\treturn 2;',
		'}',
	].join('\n');

	/** Records what the service asked the workbench to open. */
	interface IOpenedEditor {
		readonly resource?: URI;
		readonly selection?: unknown;
		readonly preserveFocus?: boolean;
		readonly pinned?: boolean;
		readonly browserUrl?: string;
	}

	let opened: IOpenedEditor[];
	let langFeatures: LanguageFeaturesService;
	/** Stands in for the session model's `addRequest` notification. */
	let modelChange: Emitter<IChatChangeEvent>;

	function createService(sessionDisposeEvent = Event.None, submitRequestEvent = Event.None): CodeTourService {
		opened = [];
		langFeatures = new LanguageFeaturesService();
		modelChange = disposables.add(new Emitter<IChatChangeEvent>());

		const model = disposables.add(createTextModel(testContent, 'typescript', undefined, fileUri));

		const instantiationService = disposables.add(new TestInstantiationService());
		instantiationService.stub(IEditorService, {
			openEditor: async (editor: { resource?: URI; url?: string; options?: { selection?: unknown; preserveFocus?: boolean; pinned?: boolean } }) => {
				opened.push(editor.resource
					? { resource: editor.resource, selection: editor.options?.selection, preserveFocus: editor.options?.preserveFocus, pinned: editor.options?.pinned }
					: { browserUrl: editor.url });
				return undefined;
			},
		} as unknown as IEditorService);
		instantiationService.stub(ILanguageFeaturesService, langFeatures);
		instantiationService.stub(ITextModelService, {
			createModelReference: async () => ({ object: { textEditorModel: model }, dispose: () => { } }),
		} as unknown as ITextModelService);
		instantiationService.stub(IBrowserViewWorkbenchService, {
			getOrCreateLazy: (_id: string, state?: { url?: string }) => ({ url: state?.url }),
			getPreferredGroup: async () => undefined,
		} as unknown as IBrowserViewWorkbenchService);
		instantiationService.stub(IAgentNetworkFilterService, {
			isUriAllowed: (uri: URI) => uri.authority !== 'blocked.example.com',
			formatError: () => 'blocked',
		} as unknown as IAgentNetworkFilterService);
		instantiationService.stub(ITelemetryService, NullTelemetryService);
		instantiationService.stub(IChatService, {
			onDidDisposeSession: sessionDisposeEvent,
			onDidSubmitRequest: submitRequestEvent,
			getSession: () => ({ onDidChange: modelChange.event }),
		} as unknown as IChatService);

		return disposables.add(instantiationService.createInstance(CodeTourService));
	}

	teardown(() => disposables.clear());
	ensureNoDisposablesAreLeakedInTestSuite();

	test('startTour creates an empty tour that addStop appends to and reveals', async () => {
		const service = createService();
		const tour = service.startTour(sessionResource, 'How chat works');

		await service.addStop(sessionResource, { title: 'Entry point', narration: 'Where it starts.', uri: fileUri, range: new Range(1, 1, 3, 1) }, false);
		await service.addStop(sessionResource, { title: 'The docs', narration: 'Background.', url: 'https://example.com' }, false);

		assert.deepStrictEqual(
			{
				title: tour.title,
				stopTitles: tour.stops.map(s => s.title),
				isActive: service.getActiveTour(sessionResource) === tour,
				opened,
			},
			{
				title: 'How chat works',
				stopTitles: ['Entry point', 'The docs'],
				isActive: true,
				opened: [
					{ resource: fileUri, selection: new Range(1, 1, 3, 1), preserveFocus: true, pinned: false },
					{ browserUrl: 'https://example.com' },
				],
			});
	});

	test('stopTour ends the tour and blocks further stops', async () => {
		const service = createService();
		const tour = service.startTour(sessionResource, 'Tour');
		await service.addStop(sessionResource, { title: 'One', narration: 'First.', uri: fileUri }, false);

		service.stopTour(tour.tourId);
		await service.addStop(sessionResource, { title: 'Two', narration: 'Second.', uri: fileUri }, false);

		assert.deepStrictEqual(
			{
				isStopped: service.isStopped(sessionResource),
				stopTitles: tour.stops.map(s => s.title),
				finished: service.observeRuntime(tour.tourId).get()?.finished.get(),
			},
			{ isStopped: true, stopTitles: ['One'], finished: true });
	});

	test('a completed tour finishes without being reported as stopped by the user', async () => {
		const service = createService();
		const tour = service.startTour(sessionResource, 'Tour');
		const added = await service.addStop(sessionResource, { title: 'Only', narration: 'Done.', uri: fileUri }, true);
		const afterEnd = await service.addStop(sessionResource, { title: 'Encore', narration: 'Too late.', uri: fileUri }, false);

		assert.deepStrictEqual(
			{
				added,
				afterEnd,
				stopTitles: tour.stops.map(s => s.title),
				finished: service.observeRuntime(tour.tourId).get()?.finished.get(),
				isStopped: service.isStopped(sessionResource),
			},
			{ added: true, afterEnd: false, stopTitles: ['Only'], finished: true, isStopped: false });
	});

	test('revealStop navigates to a past stop and updates the current index', async () => {
		const service = createService();
		const tour = service.startTour(sessionResource, 'Tour');
		await service.addStop(sessionResource, { title: 'One', narration: 'First.', uri: fileUri, range: new Range(1, 1, 1, 1) }, false);
		await service.addStop(sessionResource, { title: 'Two', narration: 'Second.', uri: fileUri, range: new Range(5, 1, 5, 1) }, false);

		await service.revealStop(tour.tourId, 0, tour.stops[0]);

		assert.deepStrictEqual(
			{
				currentIndex: service.observeRuntime(tour.tourId).get()?.currentIndex.get(),
				lastOpenedSelection: opened.at(-1)?.selection,
			},
			{ currentIndex: 0, lastOpenedSelection: new Range(1, 1, 1, 1) });
	});

	test('starting a second tour in the same session replaces the first', async () => {
		const service = createService();
		const first = service.startTour(sessionResource, 'First');
		await service.addStop(sessionResource, { title: 'One', narration: 'First.', uri: fileUri }, false);

		const second = service.startTour(sessionResource, 'Second');

		assert.deepStrictEqual(
			{
				active: service.getActiveTour(sessionResource)?.title,
				firstRuntime: service.observeRuntime(first.tourId).get(),
				secondHasRuntime: !!service.observeRuntime(second.tourId).get(),
			},
			{ active: 'Second', firstRuntime: undefined, secondHasRuntime: true });
	});

	test('resolveRange handles line spans, symbols, and unresolvable input', async () => {
		const service = createService();
		disposables.add(langFeatures.documentSymbolProvider.register({ scheme: 'file' }, {
			provideDocumentSymbols: async () => ([{
				name: 'second',
				detail: '',
				kind: SymbolKind.Function,
				tags: [],
				range: new Range(5, 1, 7, 2),
				selectionRange: new Range(5, 17, 5, 23),
			}]),
		} satisfies DocumentSymbolProvider));

		assert.deepStrictEqual(
			{
				fromLines: await service.resolveRange(fileUri, 2, 4, undefined),
				fromSingleLine: await service.resolveRange(fileUri, 2, undefined, undefined),
				fromSymbol: await service.resolveRange(fileUri, undefined, undefined, 'second'),
				unknownSymbol: await service.resolveRange(fileUri, undefined, undefined, 'nope'),
				nothing: await service.resolveRange(fileUri, undefined, undefined, undefined),
			},
			{
				fromLines: new Range(2, 1, 4, Number.MAX_SAFE_INTEGER),
				fromSingleLine: new Range(2, 1, 2, Number.MAX_SAFE_INTEGER),
				fromSymbol: new Range(5, 1, 7, 2),
				unknownSymbol: undefined,
				nothing: undefined,
			});
	});

	test('a disposed session ends its tour', async () => {
		const onDidDisposeSession = disposables.add(new Emitter<{ sessionResources: URI[] }>());
		const service = createService(onDidDisposeSession.event as Event<never>);

		const tour = service.startTour(sessionResource, 'Tour');
		await service.addStop(sessionResource, { title: 'One', narration: 'First.' }, false);

		onDidDisposeSession.fire({ sessionResources: [sessionResource] });

		assert.deepStrictEqual(
			{
				active: service.getActiveTour(sessionResource),
				runtime: service.observeRuntime(tour.tourId).get(),
			},
			{ active: undefined, runtime: undefined });
	});

	test('the next user request clears a stopped tour so a later turn can start a fresh one', async () => {
		const onDidSubmitRequest = disposables.add(new Emitter<{ chatSessionResource: URI }>());
		const service = createService(Event.None, onDidSubmitRequest.event as Event<never>);

		const first = service.startTour(sessionResource, 'First');
		await service.addStop(sessionResource, { title: 'One', narration: 'First.' }, false);
		service.stopTour(first.tourId);

		const stoppedDuringTurn = service.isStopped(sessionResource);
		onDidSubmitRequest.fire({ chatSessionResource: sessionResource });

		const second = service.startTour(sessionResource, 'Second');
		const added = await service.addStop(sessionResource, { title: 'Fresh', narration: 'New tour.' }, false);

		assert.deepStrictEqual(
			{
				stoppedDuringTurn,
				stoppedAfterNextRequest: service.isStopped(sessionResource),
				added,
				secondStops: second.stops.map(s => s.title),
			},
			{ stoppedDuringTurn: true, stoppedAfterNextRequest: false, added: true, secondStops: ['Fresh'] });
	});

	test('a stop URL that the network filter blocks is not opened', async () => {
		const service = createService();
		service.startTour(sessionResource, 'Tour');

		await service.addStop(sessionResource, { title: 'Blocked', narration: 'Nope.', url: 'https://blocked.example.com/x' }, false);
		await service.addStop(sessionResource, { title: 'Allowed', narration: 'Fine.', url: 'https://ok.example.com/y' }, false);

		assert.deepStrictEqual(opened, [{ browserUrl: 'https://ok.example.com/y' }]);
	});

	test('a server-initiated turn also ends the previous tour', async () => {
		const service = createService();
		const first = service.startTour(sessionResource, 'First');
		await service.addStop(sessionResource, { title: 'One', narration: 'First.' }, true);

		// Agent hosts drain their own queue, so the next turn only shows up as a
		// request added to the session model.
		modelChange.fire({ kind: 'addRequest' } as IChatChangeEvent);

		assert.deepStrictEqual(
			{
				active: service.getActiveTour(sessionResource),
				runtime: service.observeRuntime(first.tourId).get(),
				isStopped: service.isStopped(sessionResource),
			},
			{ active: undefined, runtime: undefined, isStopped: false });
	});
});
