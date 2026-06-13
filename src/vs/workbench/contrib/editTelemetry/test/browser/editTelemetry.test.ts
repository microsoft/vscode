/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Disposable, DisposableStore } from '../../../../../base/common/lifecycle.js';
import { constObservable, IObservable, observableValue } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { StringReplacement } from '../../../../../editor/common/core/edits/stringEdit.js';
import { ServiceCollection } from '../../../../../platform/instantiation/common/serviceCollection.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { AnnotatedDocument, AnnotatedDocuments, IAnnotatedDocuments, UriVisibilityProvider } from '../../browser/helpers/annotatedDocuments.js';
import { StringEditWithReason } from '../../browser/helpers/observableWorkspace.js';
import { EditSourceTrackingImpl } from '../../browser/telemetry/editSourceTrackingImpl.js';
import { ScmAdapter } from '../../browser/telemetry/scmAdapter.js';
import { EditSources } from '../../../../../editor/common/textModelEditSource.js';
import { DiffService } from '../../browser/helpers/documentWithAnnotatedEdits.js';
import { computeStringDiff } from '../../../../../editor/common/services/editorWebWorker.js';
import { runWithFakedTimers } from '../../../../../base/test/common/timeTravelScheduler.js';
import { timeout } from '../../../../../base/common/async.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import { IAiEditTelemetryService } from '../../browser/telemetry/aiEditTelemetry/aiEditTelemetryService.js';
import { Random } from '../../../../../editor/test/common/core/random.js';
import { AiEditTelemetryServiceImpl } from '../../browser/telemetry/aiEditTelemetry/aiEditTelemetryServiceImpl.js';
import { IRandomService, RandomService } from '../../browser/randomService.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { SyncDescriptor } from '../../../../../platform/instantiation/common/descriptors.js';
import { UserAttentionService, UserAttentionServiceEnv } from '../../../../services/userAttention/browser/userAttentionBrowser.js';
import { IUserAttentionService } from '../../../../services/userAttention/common/userAttentionService.js';
import { ILogService, NullLogService } from '../../../../../platform/log/common/log.js';
import { MutableObservableWorkspace } from './editTelemetryTestUtils.js';

suite('Edit Telemetry', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('1', async () => runWithFakedTimers({}, async () => {
		const disposables = new DisposableStore();
		const instantiationService = disposables.add(new TestInstantiationService(new ServiceCollection(
			[IAiEditTelemetryService, new SyncDescriptor(AiEditTelemetryServiceImpl)],
			[IUserAttentionService, new SyncDescriptor(UserAttentionService)]
		), false, undefined, true));

		const sentTelemetry: unknown[] = [];
		const userActive = observableValue('userActive', true);
		instantiationService.stubInstance(UserAttentionServiceEnv, {
			isUserActive: userActive,
			isVsCodeFocused: constObservable(true),
			dispose: () => { }
		});
		instantiationService.stub(ITelemetryService, {
			publicLog2(eventName, data) {
				sentTelemetry.push(`${formatTime(Date.now())} ${eventName}: ${JSON.stringify(data)}`);
			},
		});
		instantiationService.stubInstance(DiffService, { computeDiff: async (original, modified) => computeStringDiff(original, modified, { maxComputationTimeMs: 500 }, 'advanced') });
		instantiationService.stubInstance(ScmAdapter, { getRepo: (uri, reader) => undefined, });
		instantiationService.stubInstance(UriVisibilityProvider, { isVisible: (uri, reader) => true, });
		instantiationService.stub(IRandomService, new DeterministicRandomService());
		instantiationService.stub(ILogService, new NullLogService());

		const w = new MutableObservableWorkspace();
		const docs = disposables.add(new AnnotatedDocuments(w, undefined, instantiationService));
		disposables.add(new EditSourceTrackingImpl(constObservable(true), docs, instantiationService));

		const d1 = disposables.add(w.createDocument({
			uri: URI.parse('file:///a'), initialValue: `
function fib(n) {
	if (n <= 1) return n;
	return fib(n - 1) + fib(n - 2);
}
`
		}, undefined));

		await timeout(10);

		const chatEdit = EditSources.chatApplyEdits({
			languageId: 'plaintext',
			modelId: undefined,
			codeBlockSuggestionId: undefined,
			extensionId: undefined,
			mode: undefined,
			requestId: undefined,
			sessionId: undefined,
		});

		d1.applyEdit(StringEditWithReason.replace(d1.findRange('≪≫function fib(n) {'), '// Computes the nth fibonacci number\n', chatEdit));

		await timeout(5000);

		d1.applyEdit(new StringEditWithReason([
			StringReplacement.replace(d1.findRange('≪//≫ Computes'), '/*'),
			StringReplacement.replace(d1.findRange('fibonacci number≪≫'), ' */'),
		], EditSources.cursor({ kind: 'type' })));

		await timeout(5000);

		d1.applyEdit(StringEditWithReason.replace(d1.findRange('Computes the nth fibonacci number'), 'Berechnet die nte Fibonacci Zahl', chatEdit));

		await timeout(3 * 60 * 1000);
		userActive.set(false, undefined);
		await timeout(3 * 60 * 1000);
		userActive.set(true, undefined);
		await timeout(18 * 60 * 1000);

		assert.deepStrictEqual(sentTelemetry, ([
			'00:01:010 editTelemetry.reportEditArc: {\"sourceKeyCleaned\":\"source:Chat.applyEdits\",\"languageId\":\"plaintext\",\"uniqueEditId\":\"8c97b7d8-9adb-4bd8-ac9f-a562704ce40e\",\"didBranchChange\":0,\"timeDelayMs\":0,\"originalCharCount\":37,\"originalLineCount\":1,\"originalDeletedLineCount\":0,\"arc\":37,\"currentLineCount\":1,\"currentDeletedLineCount\":0}',
			'00:01:010 editTelemetry.codeSuggested: {\"eventId\":\"evt-055ed5f5-c723-4ede-ba79-cccd7685c7ad\",\"suggestionId\":\"sgt-f645627a-cacf-477a-9164-ecd6125616a5\",\"presentation\":\"highlightedEdit\",\"feature\":\"sideBarChat\",\"languageId\":\"plaintext\",\"editCharsInserted\":37,\"editCharsDeleted\":0,\"editLinesInserted\":1,\"editLinesDeleted\":0}',
			'00:11:010 editTelemetry.reportEditArc: {\"sourceKeyCleaned\":\"source:Chat.applyEdits\",\"languageId\":\"plaintext\",\"uniqueEditId\":\"1eb8a394-2489-41c2-851b-6a79432fc6bc\",\"didBranchChange\":0,\"timeDelayMs\":0,\"originalCharCount\":19,\"originalLineCount\":1,\"originalDeletedLineCount\":1,\"arc\":19,\"currentLineCount\":1,\"currentDeletedLineCount\":1}',
			'00:11:010 editTelemetry.codeSuggested: {\"eventId\":\"evt-5c9c6fe7-b219-4ff8-aaa7-ab2b355b21c0\",\"suggestionId\":\"sgt-74379122-0452-4e26-9c38-9d62f1e7ae73\",\"presentation\":\"highlightedEdit\",\"feature\":\"sideBarChat\",\"languageId\":\"plaintext\",\"editCharsInserted\":19,\"editCharsDeleted\":20,\"editLinesInserted\":1,\"editLinesDeleted\":1}',
			'01:01:010 editTelemetry.reportEditArc: {\"sourceKeyCleaned\":\"source:Chat.applyEdits\",\"languageId\":\"plaintext\",\"uniqueEditId\":\"8c97b7d8-9adb-4bd8-ac9f-a562704ce40e\",\"didBranchChange\":0,\"timeDelayMs\":60000,\"originalCharCount\":37,\"originalLineCount\":1,\"originalDeletedLineCount\":0,\"arc\":16,\"currentLineCount\":1,\"currentDeletedLineCount\":0}',
			'01:11:010 editTelemetry.reportEditArc: {\"sourceKeyCleaned\":\"source:Chat.applyEdits\",\"languageId\":\"plaintext\",\"uniqueEditId\":\"1eb8a394-2489-41c2-851b-6a79432fc6bc\",\"didBranchChange\":0,\"timeDelayMs\":60000,\"originalCharCount\":19,\"originalLineCount\":1,\"originalDeletedLineCount\":1,\"arc\":19,\"currentLineCount\":1,\"currentDeletedLineCount\":1}',
			'05:01:010 editTelemetry.reportEditArc: {\"sourceKeyCleaned\":\"source:Chat.applyEdits\",\"languageId\":\"plaintext\",\"uniqueEditId\":\"8c97b7d8-9adb-4bd8-ac9f-a562704ce40e\",\"didBranchChange\":0,\"timeDelayMs\":300000,\"originalCharCount\":37,\"originalLineCount\":1,\"originalDeletedLineCount\":0,\"arc\":16,\"currentLineCount\":1,\"currentDeletedLineCount\":0}',
			'05:11:010 editTelemetry.reportEditArc: {\"sourceKeyCleaned\":\"source:Chat.applyEdits\",\"languageId\":\"plaintext\",\"uniqueEditId\":\"1eb8a394-2489-41c2-851b-6a79432fc6bc\",\"didBranchChange\":0,\"timeDelayMs\":300000,\"originalCharCount\":19,\"originalLineCount\":1,\"originalDeletedLineCount\":1,\"arc\":19,\"currentLineCount\":1,\"currentDeletedLineCount\":1}',
			'12:00:000 editTelemetry.editSources.details: {\"mode\":\"10minFocusWindow\",\"sourceKey\":\"source:Chat.applyEdits\",\"sourceKeyCleaned\":\"source:Chat.applyEdits\",\"trigger\":\"time\",\"languageId\":\"plaintext\",\"statsUuid\":\"509b5d53-9109-40a2-bdf5-1aa735a229fe\",\"modifiedCount\":35,\"deltaModifiedCount\":56,\"totalModifiedCount\":39}',
			'12:00:000 editTelemetry.editSources.details: {\"mode\":\"10minFocusWindow\",\"sourceKey\":\"source:cursor-kind:type\",\"sourceKeyCleaned\":\"source:cursor-kind:type\",\"trigger\":\"time\",\"languageId\":\"plaintext\",\"statsUuid\":\"509b5d53-9109-40a2-bdf5-1aa735a229fe\",\"modifiedCount\":4,\"deltaModifiedCount\":4,\"totalModifiedCount\":39}',
			'12:00:000 editTelemetry.editSources.stats: {\"mode\":\"10minFocusWindow\",\"languageId\":\"plaintext\",\"statsUuid\":\"509b5d53-9109-40a2-bdf5-1aa735a229fe\",\"nesModifiedCount\":0,\"inlineCompletionsCopilotModifiedCount\":0,\"inlineCompletionsNESModifiedCount\":0,\"otherAIModifiedCount\":35,\"unknownModifiedCount\":0,\"userModifiedCount\":4,\"ideModifiedCount\":0,\"totalModifiedCharacters\":39,\"externalModifiedCount\":0,\"isTrackedByGit\":0,\"focusTime\":600000,\"actualTime\":720000,\"trigger\":\"time\"}',
			'22:00:000 editTelemetry.editSources.details: {\"mode\":\"20minFocusWindow\",\"sourceKey\":\"source:Chat.applyEdits\",\"sourceKeyCleaned\":\"source:Chat.applyEdits\",\"trigger\":\"time\",\"languageId\":\"plaintext\",\"statsUuid\":\"a794406a-7779-4e9f-a856-1caca85123c7\",\"modifiedCount\":35,\"deltaModifiedCount\":56,\"totalModifiedCount\":39}',
			'22:00:000 editTelemetry.editSources.details: {\"mode\":\"20minFocusWindow\",\"sourceKey\":\"source:cursor-kind:type\",\"sourceKeyCleaned\":\"source:cursor-kind:type\",\"trigger\":\"time\",\"languageId\":\"plaintext\",\"statsUuid\":\"a794406a-7779-4e9f-a856-1caca85123c7\",\"modifiedCount\":4,\"deltaModifiedCount\":4,\"totalModifiedCount\":39}',
			'22:00:000 editTelemetry.editSources.stats: {\"mode\":\"20minFocusWindow\",\"languageId\":\"plaintext\",\"statsUuid\":\"a794406a-7779-4e9f-a856-1caca85123c7\",\"nesModifiedCount\":0,\"inlineCompletionsCopilotModifiedCount\":0,\"inlineCompletionsNESModifiedCount\":0,\"otherAIModifiedCount\":35,\"unknownModifiedCount\":0,\"userModifiedCount\":4,\"ideModifiedCount\":0,\"totalModifiedCharacters\":39,\"externalModifiedCount\":0,\"isTrackedByGit\":0,\"focusTime\":1200000,\"actualTime\":1320000,\"trigger\":\"time\"}'
		]));

		disposables.dispose();
	}));
});

function formatTime(timeMs: number): string {
	const totalMs = Math.floor(timeMs);
	const minutes = Math.floor(totalMs / 60000);
	const seconds = Math.floor((totalMs % 60000) / 1000);
	const ms = totalMs % 1000;
	const str = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}:${ms.toString().padStart(3, '0')}`;
	return str;
}

class DeterministicRandomService extends RandomService {
	private readonly _rand = Random.create(0);

	override generateUuid(): string {
		return this._rand.nextUuid();
	}
}

export class FakeAnnotatedDocuments extends Disposable implements IAnnotatedDocuments {
	public readonly documents: IObservable<readonly AnnotatedDocument[]>;

	constructor() {
		super();

		this.documents = constObservable<readonly AnnotatedDocument[]>([]);
	}
}

