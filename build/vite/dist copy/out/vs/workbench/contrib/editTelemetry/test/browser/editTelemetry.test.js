/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { Disposable, DisposableStore, toDisposable } from '../../../../../base/common/lifecycle.js';
import { constObservable, observableValue, subtransaction } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { StringReplacement } from '../../../../../editor/common/core/edits/stringEdit.js';
import { OffsetRange } from '../../../../../editor/common/core/ranges/offsetRange.js';
import { StringText } from '../../../../../editor/common/core/text/abstractText.js';
import { ServiceCollection } from '../../../../../platform/instantiation/common/serviceCollection.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { AnnotatedDocuments, UriVisibilityProvider } from '../../browser/helpers/annotatedDocuments.js';
import { ObservableWorkspace, StringEditWithReason } from '../../browser/helpers/observableWorkspace.js';
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
suite('Edit Telemetry', () => {
    ensureNoDisposablesAreLeakedInTestSuite();
    test('1', async () => runWithFakedTimers({}, async () => {
        const disposables = new DisposableStore();
        const instantiationService = disposables.add(new TestInstantiationService(new ServiceCollection([IAiEditTelemetryService, new SyncDescriptor(AiEditTelemetryServiceImpl)], [IUserAttentionService, new SyncDescriptor(UserAttentionService)]), false, undefined, true));
        const sentTelemetry = [];
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
        const docs = disposables.add(new AnnotatedDocuments(w, instantiationService));
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
function formatTime(timeMs) {
    const totalMs = Math.floor(timeMs);
    const minutes = Math.floor(totalMs / 60000);
    const seconds = Math.floor((totalMs % 60000) / 1000);
    const ms = totalMs % 1000;
    const str = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}:${ms.toString().padStart(3, '0')}`;
    return str;
}
class DeterministicRandomService extends RandomService {
    constructor() {
        super(...arguments);
        this._rand = Random.create(0);
    }
    generateUuid() {
        return this._rand.nextUuid();
    }
}
export class FakeAnnotatedDocuments extends Disposable {
    constructor() {
        super();
        this.documents = constObservable([]);
    }
}
function findOffsetRange(str, search) {
    const startContextIndex = search.indexOf('≪');
    const endContextIndex = search.indexOf('≫');
    let searchStr;
    let beforeContext = '';
    let afterContext = '';
    if (startContextIndex !== -1 && endContextIndex !== -1 && endContextIndex > startContextIndex) {
        beforeContext = search.substring(0, startContextIndex);
        afterContext = search.substring(endContextIndex + 1);
        searchStr = search.substring(startContextIndex + 1, endContextIndex);
    }
    else {
        searchStr = search;
    }
    const startIndex = str.indexOf(beforeContext + searchStr + afterContext);
    if (startIndex === -1) {
        throw new Error(`Could not find context "${beforeContext}" + "${searchStr}" + "${afterContext}" in string "${str}"`);
    }
    const matchStart = startIndex + beforeContext.length;
    return new OffsetRange(matchStart, matchStart + searchStr.length);
}
export class MutableObservableWorkspace extends ObservableWorkspace {
    constructor() {
        super();
        this._openDocuments = observableValue(this, []);
        this.documents = this._openDocuments;
        this._documents = new Map();
    }
    /**
     * Dispose to remove.
    */
    createDocument(options, tx = undefined) {
        assert(!this._documents.has(options.uri.toString()));
        const document = new MutableObservableDocument(options.uri, new StringText(options.initialValue ?? ''), [], options.languageId ?? 'plaintext', () => {
            this._documents.delete(options.uri.toString());
            const docs = this._openDocuments.get();
            const filteredDocs = docs.filter(d => d.uri.toString() !== document.uri.toString());
            if (filteredDocs.length !== docs.length) {
                this._openDocuments.set(filteredDocs, tx, { added: [], removed: [document] });
            }
        }, options.initialVersionId ?? 0, options.workspaceRoot);
        this._documents.set(options.uri.toString(), document);
        this._openDocuments.set([...this._openDocuments.get(), document], tx, { added: [document], removed: [] });
        return document;
    }
    getDocument(id) {
        return this._documents.get(id.toString());
    }
    clear() {
        this._openDocuments.set([], undefined, { added: [], removed: this._openDocuments.get() });
        for (const doc of this._documents.values()) {
            doc.dispose();
        }
        this._documents.clear();
    }
}
export class MutableObservableDocument extends Disposable {
    get value() { return this._value; }
    get selection() { return this._selection; }
    get visibleRanges() { return this._visibleRanges; }
    get languageId() { return this._languageId; }
    get version() { return this._version; }
    constructor(uri, value, selection, languageId, onDispose, versionId, workspaceRoot) {
        super();
        this.uri = uri;
        this.workspaceRoot = workspaceRoot;
        this._value = observableValue(this, value);
        this._selection = observableValue(this, selection);
        this._visibleRanges = observableValue(this, []);
        this._languageId = observableValue(this, languageId);
        this._version = observableValue(this, versionId);
        this._register(toDisposable(onDispose));
    }
    setSelection(selection, tx = undefined) {
        this._selection.set(selection, tx);
    }
    setVisibleRange(visibleRanges, tx = undefined) {
        this._visibleRanges.set(visibleRanges, tx);
    }
    applyEdit(edit, tx = undefined, newVersion = undefined) {
        const newValue = edit.applyOnText(this.value.get());
        const e = edit instanceof StringEditWithReason ? edit : new StringEditWithReason(edit.replacements, EditSources.unknown({}));
        subtransaction(tx, tx => {
            this._value.set(newValue, tx, e);
            this._version.set(newVersion ?? this._version.get() + 1, tx);
        });
    }
    updateSelection(selection, tx = undefined) {
        this._selection.set(selection, tx);
    }
    setValue(value, tx = undefined, newVersion = undefined) {
        const reason = EditSources.unknown({});
        const e = new StringEditWithReason([StringReplacement.replace(new OffsetRange(0, this.value.get().value.length), value.value)], reason);
        subtransaction(tx, tx => {
            this._value.set(value, tx, e);
            this._version.set(newVersion ?? this._version.get() + 1, tx);
        });
    }
    findRange(search) {
        return findOffsetRange(this.value.get().value, search);
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZWRpdFRlbGVtZXRyeS50ZXN0LmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvZWRpdFRlbGVtZXRyeS90ZXN0L2Jyb3dzZXIvZWRpdFRlbGVtZXRyeS50ZXN0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sTUFBTSxNQUFNLFFBQVEsQ0FBQztBQUM1QixPQUFPLEVBQUUsVUFBVSxFQUFFLGVBQWUsRUFBRSxZQUFZLEVBQUUsTUFBTSx5Q0FBeUMsQ0FBQztBQUNwRyxPQUFPLEVBQUUsZUFBZSxFQUF5RSxlQUFlLEVBQUUsY0FBYyxFQUFFLE1BQU0sMENBQTBDLENBQUM7QUFDbkwsT0FBTyxFQUFFLEdBQUcsRUFBRSxNQUFNLG1DQUFtQyxDQUFDO0FBQ3hELE9BQU8sRUFBYyxpQkFBaUIsRUFBRSxNQUFNLHVEQUF1RCxDQUFDO0FBQ3RHLE9BQU8sRUFBRSxXQUFXLEVBQUUsTUFBTSx5REFBeUQsQ0FBQztBQUN0RixPQUFPLEVBQUUsVUFBVSxFQUFFLE1BQU0sd0RBQXdELENBQUM7QUFDcEYsT0FBTyxFQUFFLGlCQUFpQixFQUFFLE1BQU0sbUVBQW1FLENBQUM7QUFDdEcsT0FBTyxFQUFFLHdCQUF3QixFQUFFLE1BQU0sK0VBQStFLENBQUM7QUFDekgsT0FBTyxFQUFxQixrQkFBa0IsRUFBdUIscUJBQXFCLEVBQUUsTUFBTSw2Q0FBNkMsQ0FBQztBQUNoSixPQUFPLEVBQXVCLG1CQUFtQixFQUFFLG9CQUFvQixFQUFFLE1BQU0sOENBQThDLENBQUM7QUFDOUgsT0FBTyxFQUFFLHNCQUFzQixFQUFFLE1BQU0sbURBQW1ELENBQUM7QUFDM0YsT0FBTyxFQUFFLFVBQVUsRUFBRSxNQUFNLHVDQUF1QyxDQUFDO0FBQ25FLE9BQU8sRUFBRSxXQUFXLEVBQUUsTUFBTSxxREFBcUQsQ0FBQztBQUNsRixPQUFP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