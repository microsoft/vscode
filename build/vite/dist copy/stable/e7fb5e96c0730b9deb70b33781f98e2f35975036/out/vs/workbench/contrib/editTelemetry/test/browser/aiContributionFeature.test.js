/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../base/common/uri.js';
import { ServiceCollection } from '../../../../../platform/instantiation/common/serviceCollection.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { AnnotatedDocuments, UriVisibilityProvider } from '../../browser/helpers/annotatedDocuments.js';
import { StringEditWithReason } from '../../browser/helpers/observableWorkspace.js';
import { AiContributionFeature } from '../../browser/aiContributionFeature.js';
import { EditSources } from '../../../../../editor/common/textModelEditSource.js';
import { DiffService } from '../../browser/helpers/documentWithAnnotatedEdits.js';
import { computeStringDiff } from '../../../../../editor/common/services/editorWebWorker.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ILogService, NullLogService } from '../../../../../platform/log/common/log.js';
import { MutableObservableWorkspace } from './editTelemetry.test.js';
import { CommandsRegistry } from '../../../../../platform/commands/common/commands.js';
import { timeout } from '../../../../../base/common/async.js';
import { runWithFakedTimers } from '../../../../../base/test/common/timeTravelScheduler.js';
suite('AiContributionFeature', () => {
    ensureNoDisposablesAreLeakedInTestSuite();
    let disposables;
    let workspace;
    const fileA = URI.parse('file:///a.ts');
    const fileB = URI.parse('file:///b.ts');
    const chatEdit = EditSources.chatApplyEdits({
        languageId: 'plaintext',
        modelId: undefined,
        codeBlockSuggestionId: undefined,
        extensionId: undefined,
        mode: undefined,
        requestId: undefined,
        sessionId: undefined,
    });
    const userEdit = EditSources.cursor({ kind: 'type' });
    const inlineCompletionEdit = EditSources.inlineCompletionAccept({
        nes: false,
        requestUuid: 'test-uuid',
        languageId: 'plaintext',
        correlationId: undefined,
    });
    function setup() {
        disposables = new DisposableStore();
        const instantiationService = disposables.add(new TestInstantiationService(new ServiceCollection(), false, undefined, true));
        instantiationService.stubInstance(DiffService, { computeDiff: async (original, modified) => computeStringDiff(original, modified, { maxComputationTimeMs: 500 }, 'advanced') });
        instantiationService.stubInstance(UriVisibilityProvider, { isVisible: () => true });
        instantiationService.stub(ILogService, new NullLogService());
        workspace = new MutableObservableWorkspace();
        const annotatedDocuments = disposables.add(new AnnotatedDocuments(workspace, instantiationService));
        disposables.add(instantiationService.createInstance(AiContributionFeature, annotatedDocuments));
    }
    function hasAiContributions(uris, level) {
        return CommandsRegistry.getCommand('_aiEdits.hasAiContributions').handler(undefined, uris, level);
    }
    function clearAiContributions(uris) {
        CommandsRegistry.getCommand('_aiEdits.clearAiContributions').handler(undefined, uris);
    }
    function clearAllAiContributions() {
        CommandsRegistry.getCommand('_aiEdits.clearAllAiContributions').handler(undefined);
    }
    test('no contributions initially', () => runWithFakedTimers({}, async () => {
        setup();
        const d = disposables.add(workspace.createDocument({ uri: fileA, initialValue: 'hello' }, undefined));
        await timeout(1500);
        assert.strictEqual(hasAiContributions([d.uri], 'all'), false);
        assert.strictEqual(hasAiContributions([d.uri], 'chatAndAgent'), false);
        disposables.dispose();
    }));
    test('detects chat AI edits', () => runWithFakedTimers({}, async () => {
        setup();
        const d = disposables.add(workspace.createDocument({ uri: fileA, initialValue: 'hello' }, undefined));
        await timeout(1500);
        d.applyEdit(StringEditWithReason.replace(d.findRange('hello'), 'world', chatEdit));
        await timeout(1500);
        assert.strictEqual(hasAiContributions([d.uri], 'all'), true);
        assert.strictEqual(hasAiContributions([d.uri], 'chatAndAgent'), true);
        disposables.dispose();
    }));
    test('detects inline completion AI edits at all level only', () => runWithFakedTimers({}, async () => {
        setup();
        const d = disposables.add(workspace.createDocument({ uri: fileA, initialValue: 'hello' }, undefined));
        await timeout(1500);
        d.applyEdit(StringEditWithReason.replace(d.findRange('hello'), 'world', inlineCompletionEdit));
        await timeout(1500);
        assert.strictEqual(hasAiContributions([d.uri], 'all'), true);
        assert.strictEqual(hasAiContributions([d.uri], 'chatAndAgent'), false);
        disposables.dispose();
    }));
    test('does not detect user edits as AI', () => runWithFakedTimers({}, async () => {
        setup();
        const d = disposables.add(workspace.createDocument({ uri: fileA, initialValue: 'hello' }, undefined));
        await timeout(1500);
        d.applyEdit(StringEditWithReason.replace(d.findRange('hello'), 'world', userEdit));
        await timeout(1500);
        assert.strictEqual(hasAiContributions([d.uri], 'all'), false);
        assert.strictEqual(hasAiContributions([d.uri], 'chatAndAgent'), false);
        disposables.dispose();
    }));
    test('clear resets contributions for specific resources', () => runWithFakedTimers({}, async () => {
        setup();
        const dA = disposables.add(workspace.createDocument({ uri: fileA, initialValue: 'hello' }, undefined));
        const dB = disposables.add(workspace.createDocument({ uri: fileB, initialValue: 'world' }, undefined));
        await timeout(1500);
        dA.applyEdit(StringEditWithReason.replace(dA.findRange('hello'), 'foo', chatEdit));
        dB.applyEdit(StringEditWithReason.replace(dB.findRange('world'), 'bar', chatEdit));
        await timeout(1500);
        assert.strictEqual(hasAiContributions([dA.uri], 'all'), true);
        assert.strictEqual(hasAiContributions([dB.uri], 'all'), true);
        clearAiContributions([dA.uri]);
        assert.strictEqual(hasAiContributions([dA.uri], 'all'), false);
        assert.strictEqual(hasAiContributions([dB.uri], 'all'), true);
        disposables.dispose();
    }));
    test('clearAll resets all contributions', () => runWithFakedTimers({}, async () => {
        setup();
        const dA = disposables.add(workspace.createDocument({ uri: fileA, initialValue: 'hello' }, undefined));
        const dB = disposables.add(workspace.createDocument({ uri: fileB, initialValue: 'world' }, undefined));
        await timeout(1500);
        dA.applyEdit(StringEditWithReason.replace(dA.findRange('hello'), 'foo', chatEdit));
        dB.applyEdit(StringEditWithReason.replace(dB.findRange('world'), 'bar', chatEdit));
        await timeout(1500);
        clearAllAiContributions();
        assert.strictEqual(hasAiContributions([dA.uri], 'all'), false);
        assert.strictEqual(hasAiContributions([dB.uri], 'all'), false);
        disposables.dispose();
    }));
    test('tracks new edits after clear', () => runWithFakedTimers({}, async () => {
        setup();
        const d = disposables.add(workspace.createDocument({ uri: fileA, initialValue: 'hello' }, undefined));
        await timeout(1500);
        d.applyEdit(StringEditWithReason.replace(d.findRange('hello'), 'world', chatEdit));
        await timeout(1500);
        clearAiContributions([d.uri]);
        assert.strictEqual(hasAiContributions([d.uri], 'all'), false);
        d.applyEdit(StringEditWithReason.replace(d.findRange('world'), 'again', chatEdit));
        await timeout(1500);
        assert.strictEqual(hasAiContributions([d.uri], 'all'), true);
        disposables.dispose();
    }));
    test('cleans up tracker when document is closed', () => runWithFakedTimers({}, async () => {
        setup();
        const d = disposables.add(workspace.createDocument({ uri: fileA, initialValue: 'hello' }, undefined));
        await timeout(1500);
        d.applyEdit(StringEditWithReason.replace(d.findRange('hello'), 'world', chatEdit));
        await timeout(1500);
        assert.strictEqual(hasAiContributions([d.uri], 'all'), true);
        d.dispose();
        await timeout(1500);
        assert.strictEqual(hasAiContributions([fileA], 'all'), false);
        disposables.dispose();
    }));
    test('returns false for unknown URIs', () => runWithFakedTimers({}, async () => {
        setup();
        assert.strictEqual(hasAiContributions([URI.parse('file:///unknown.ts')], 'all'), false);
        disposables.dispose();
    }));
    test('checks multiple resources', () => runWithFakedTimers({}, async () => {
        setup();
        const dA = disposables.add(workspace.createDocument({ uri: fileA, initialValue: 'hello' }, undefined));
        disposables.add(workspace.createDocument({ uri: fileB, initialValue: 'world' }, undefined));
        await timeout(1500);
        dA.applyEdit(StringEditWithReason.replace(dA.findRange('hello'), 'foo', chatEdit));
        await timeout(1500);
        // Returns true if any of the resources has AI contributions
        assert.strictEqual(hasAiContributions([fileA, fileB], 'all'), true);
        assert.strictEqual(hasAiContributions([fileB, fileA], 'all'), true);
        assert.strictEqual(hasAiContributions([fileB], 'all'), false);
        disposables.dispose();
    }));
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYWlDb250cmlidXRpb25GZWF0dXJlLnRlc3QuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi9lZGl0VGVsZW1ldHJ5L3Rlc3QvYnJvd3Nlci9haUNvbnRyaWJ1dGlvbkZlYXR1cmUudGVzdC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLE1BQU0sTUFBTSxRQUFRLENBQUM7QUFDNUIsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLHlDQUF5QyxDQUFDO0FBQzFFLE9BQU8sRUFBRSxHQUFHLEVBQUUsTUFBTSxtQ0FBbUMsQ0FBQztBQUN4RCxPQUFPLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSxtRUFBbUUsQ0FBQztBQUN0RyxPQUFPLEVBQUUsd0JBQXdCLEVBQUUsTUFBTSwrRUFBK0UsQ0FBQztBQUN6SCxPQUFPLEVBQUUsa0JBQWtCLEVBQUUscUJBQXFCLEVBQUUsTUFBTSw2Q0FBNkMsQ0FBQztBQUN4RyxPQUFPLEVBQUUsb0JBQW9CLEVBQUUsTUFBTSw4Q0FBOEMsQ0FBQztBQUNwRixPQUFPLEVBQUUscUJBQXFCLEVBQUUsTUFBTSx3Q0FBd0MsQ0FBQztBQUMvRSxPQUFPLEVBQUUsV0FBVyxFQUFFLE1BQU0scURBQXFELENBQUM7QUFDbEYsT0FBTyxFQUFFLFdBQVcsRUFBRSxNQUFNLHFEQUFxRCxDQUFDO0FBQ2xGLE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxNQUFNLDBEQUEwRCxDQUFDO0FBQzdGLE9BQU8sRUFBRSx1Q0FBdUMsRUFBRSxNQUFNLDBDQUEwQyxDQUFDO0FBQ25HLE9BQU8sRUFBRSxXQUFXLEVBQUUsY0FBYyxFQUFFLE1BQU0sMkNBQTJDLENBQUM7QUFDeEYsT0FBTyxFQUFFLDBCQUEwQixFQUFFLE1BQU0seUJBQXlCLENBQUM7QUFDckUsT0FBTyxFQUFFLGdCQUFnQixFQUFFLE1BQU0scURB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