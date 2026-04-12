/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { timeout } from '../../../../../base/common/async.js';
import { VSBuffer } from '../../../../../base/common/buffer.js';
import { CancellationTokenSource } from '../../../../../base/common/cancellation.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { MockContextKeyService } from '../../../../../platform/keybinding/test/common/mockKeybindingService.js';
import { NullLogService } from '../../../../../platform/log/common/log.js';
import { NullTelemetryService } from '../../../../../platform/telemetry/common/telemetryUtils.js';
import { TestId } from '../../common/testId.js';
import { TestProfileService } from '../../common/testProfileService.js';
import { HydratedTestResult, LiveTestResult, TaskRawOutput, resultItemParents } from '../../common/testResult.js';
import { TestResultService } from '../../common/testResultService.js';
import { InMemoryResultStorage } from '../../common/testResultStorage.js';
import { makeEmptyCounts } from '../../common/testingStates.js';
import { getInitializedMainTestCollection, testStubs } from './testStubs.js';
import { TestStorageService } from '../../../../test/common/workbenchTestServices.js';
import { upcastPartial } from '../../../../../base/test/common/mock.js';
suite('Workbench - Test Results Service', () => {
    const getLabelsIn = (it) => [...it].map(t => t.item.label).sort();
    const getChangeSummary = () => [...changed]
        .map(c => ({ reason: c.reason, label: c.item.item.label }));
    let r;
    let changed = new Set();
    let tests;
    const defaultOpts = (testIds) => ({
        group: 2 /* TestRunProfileBitset.Run */,
        targets: [{
                profileId: 0,
                controllerId: 'ctrlId',
                testIds,
            }]
    });
    let insertCounter = 0;
    class TestLiveTestResult extends LiveTestResult {
        constructor(id, persist, request) {
            super(id, persist, request, insertCounter++, NullTelemetryService);
            ds.add(this);
        }
        setAllToStatePublic(state, taskId, when) {
            this.setAllToState(state, taskId, when);
        }
    }
    const ds = ensureNoDisposablesAreLeakedInTestSuite();
    setup(async () => {
        changed = new Set();
        r = ds.add(new TestLiveTestResult('foo', true, defaultOpts(['id-a'])));
        ds.add(r.onChange(e => changed.add(e)));
        r.addTask({ id: 't', name: 'n', running: true, ctrlId: 'ctrl' });
        tests = ds.add(testStubs.nested());
        const cts = ds.add(new CancellationTokenSource());
        const ok = await Promise.race([
            Promise.resolve(tests.expand(tests.root.id, Infinity)).then(() => true),
            timeout(1000, cts.token).then(() => false),
        ]);
        cts.cancel();
        // todo@connor4312: debug for tests #137853:
        if (!ok) {
            throw new Error('timed out while expanding, diff: ' + JSON.stringify(tests.collectDiff()));
        }
        r.addTestChainToRun('ctrlId', [
            tests.root.toTestItem(),
            tests.root.children.get('id-a').toTestItem(),
            tests.root.children.get('id-a').children.get('id-aa').toTestItem(),
        ]);
        r.addTestChainToRun('ctrlId', [
            tests.root.children.get('id-a').toTestItem(),
            tests.root.children.get('id-a').children.get('id-ab').toTestItem(),
        ]);
    });
    // ensureNoDisposablesAreLeakedInTestSuite(); todo@connor4312
    suite('LiveTestResult', () => {
        test('is empty if no tests are yet present', async () => {
            assert.deepStrictEqual(getLabelsIn(new TestLiveTestResult('foo', false, defaultOpts(['id-a'])).tests), []);
        });
        test('initially queues nothing', () => {
            assert.deepStrictEqual(getChangeSummary(), []);
        });
        test('initializes with the subtree of requested tests', () => {
            assert.deepStrictEqual(getLabelsIn(r.tests), ['a', 'aa', 'ab', 'root']);
        });
        test('initializes with valid counts', () => {
            const c = makeEmptyCounts();
            c[0 /* TestResultState.Unset */] = 4;
            assert.deepStrictEqual(r.counts, c);
        });
        test('setAllToState', () => {
            changed.clear();
            r.setAllToStatePublic(1 /* TestResultState.Queued */, 't', (_, t) => t.item.label !== 'root');
            const c = makeEmptyCounts();
            c[0 /* TestResultState.Unset */] = 1;
            c[1 /* TestResultState.Queued */] = 3;
            assert.deepStrictEqual(r.counts, c);
            r.setAllToStatePublic(4 /* TestResultState.Failed */, 't', (_, t) => t.item.label !== 'root');
            const c2 = makeEmptyCounts();
            c2[0 /* TestResultState.Unset */] = 1;
            c2[4 /* TestResultState.Failed */] = 3;
            assert.deepStrictEqual(r.counts, c2);
            assert.deepStrictEqual(r.getStateById(new TestId(['ctrlId', 'id-a']).toString())?.ownComputedState, 4 /* TestResultState.Failed */);
            assert.deepStrictEqual(r.getStateById(new TestId(['ctrlId', 'id-a']).toString())?.tasks[0].state, 4 /* TestResultState.Failed */);
            assert.deepStrictEqual(getChangeSummary(), [
                { label: 'a', reason: 1 /* TestResultItemChangeReason.OwnStateChange */ },
                { label: 'root', reason: 0 /* TestResultItemChangeReason.ComputedStateChange */ },
                { label: 'aa', reason: 1 /* TestResultItemChangeReason.OwnStateChange */ },
                { label: 'ab', reason: 1 /* TestResultItemChangeReason.OwnStateChange */ },
                { label: 'a', reason: 1 /* TestResultItemChangeReason.OwnStateChange */ },
                { label: 'root', reason: 0 /* TestResultItemChangeReason.ComputedStateChange */ },
                { label: 'aa', reason: 1 /* TestResultItemChangeReason.OwnStateChange */ },
                { label: 'ab', reason: 1 /* TestResultItemChangeReason.OwnStateChange */ },
            ]);
        });
        test('updateState', () => {
            changed.clear();
            const testId = new TestId(['ctrlId', 'id-a', 'id-aa']).toString();
            r.updateState(testId, 't', 2 /* TestResultState.Running */);
            const c = makeEmptyCounts();
            c[2 /* TestResultState.Running */] = 1;
            c[0 /* TestResultState.Unset */] = 3;
            assert.deepStrictEqual(r.counts, c);
            assert.deepStrictEqual(r.getStateById(testId)?.ownComputedState, 2 /* TestResultState.Running */);
            // update computed state:
            assert.deepStrictEqual(r.getStateById(tests.root.id)?.computedState, 2 /* TestResultState.Running */);
            assert.deepStrictEqual(getChangeSummary(), [
                { label: 'aa', reason: 1 /* TestResultItemChangeReason.OwnStateChange */ },
                { label: 'a', reason: 0 /* TestResultItemChangeReason.ComputedStateChange */ },
                { label: 'root', reason: 0 /* TestResultItemChangeReason.ComputedStateChange */ },
            ]);
            r.updateState(testId, 't', 3 /* TestResultState.Passed */);
            assert.deepStrictEqual(r.getStateById(testId)?.ownComputedState, 3 /* TestResultState.Passed */);
            r.updateState(testId, 't', 6 /* TestResultState.Errored */);
            assert.deepStrictEqual(r.getStateById(testId)?.ownComputedState, 6 /* TestResultState.Errored */);
            r.updateState(testId, 't', 3 /* TestResultState.Passed */);
            assert.deepStrictEqual(r.getStateById(testId)?.ownComputedState, 6 /* TestResultState.Errored */);
        });
        test('ignores outside run', () => {
            changed.clear();
            r.updateState(new TestId(['ctrlId', 'id-b']).toString(), 't', 2 /* TestResultState.Running */);
            const c = makeEmptyCounts();
            c[0 /* TestResultState.Unset */] = 4;
            assert.deepStrictEqual(r.counts, c);
            assert.deepStrictEqual(r.getStateById(new TestId(['ctrlId', 'id-b']).toString()), undefined);
        });
        test('markComplete', () => {
            r.setAllToStatePublic(1 /* TestResultState.Queued */, 't', () => true);
            r.updateState(new TestId(['ctrlId', 'id-a', 'id-aa']).toString(), 't', 3 /* TestResultState.Passed */);
            changed.clear();
            r.markComplete();
            const c = makeEmptyCounts();
            c[5 /* TestResultState.Skipped */] = 3;
            c[3 /* TestResultState.Passed */] = 1;
            assert.deepStrictEqual(r.counts, c);
            assert.deepStrictEqual(r.getStateById(tests.root.id)?.ownComputedState, 5 /* TestResultState.Skipped */);
            assert.deepStrictEqual(r.getStateById(new TestId(['ctrlId', 'id-a', 'id-aa']).toString())?.ownComputedState, 3 /* TestResultState.Passed */);
        });
    });
    suite('service', () => {
        let storage;
        let results;
        class TestTestResultService extends TestResultService {
            constructor() {
                super(...arguments);
                this.persistScheduler = upcastPartial({ schedule: () => this.persistImmediately() });
            }
        }
        setup(() => {
            storage = ds.add(new InMemoryResultStorage({
                asCanonicalUri(uri) {
                    return uri;
                },
            }, ds.add(new TestStorageService()), new NullLogService()));
            results = ds.add(new TestTestResultService(new MockContextKeyService(), storage, ds.add(new TestProfileService(new MockContextKeyService(), ds.add(new TestStorageService()))), NullTelemetryService));
        });
        test('pushes new result', () => {
            results.push(r);
            assert.deepStrictEqual(results.results, [r]);
        });
        test('serializes and re-hydrates', async () => {
            results.push(r);
            r.updateState(new TestId(['ctrlId', 'id-a', 'id-aa']).toString(), 't', 3 /* TestResultState.Passed */, 42);
            r.markComplete();
            await timeout(10); // allow persistImmediately async to happen
            results = ds.add(new TestResultService(new MockContextKeyService(), storage, ds.add(new TestProfileService(new MockContextKeyService(), ds.add(new TestStorageService()))), NullTelemetryService));
            assert.strictEqual(0, results.results.length);
            await timeout(10); // allow load promise to resolve
            assert.strictEqual(1, results.results.length);
            const [rehydrated, actual] = results.getStateById(tests.root.id);
            const expected = { ...r.getStateById(tests.root.id) };
            expected.item.uri = actual.item.uri;
            expected.item.children = undefined;
            expected.retired = true;
            delete expected.children;
            assert.deepStrictEqual(actual, { ...expected });
            assert.deepStrictEqual(rehydrated.counts, r.counts);
            assert.strictEqual(typeof rehydrated.completedAt, 'number');
        });
        test('clears results but keeps ongoing tests', async () => {
            results.push(r);
            r.markComplete();
            const r2 = results.push(new LiveTestResult('', false, defaultOpts([]), insertCounter++, NullTelemetryService));
            results.clear();
            assert.deepStrictEqual(results.results, [r2]);
        });
        test('keeps ongoing tests on top, restored order when done', async () => {
            results.push(r);
            const r2 = results.push(new LiveTestResult('', false, defaultOpts([]), insertCounter++, NullTelemetryService));
            assert.deepStrictEqual(results.results, [r2, r]);
            r2.markComplete();
            assert.deepStrictEqual(results.results, [r, r2]);
            r.markComplete();
            assert.deepStrictEqual(results.results, [r2, r]);
        });
        const makeHydrated = async (completedAt = 42, state = 3 /* TestResultState.Passed */) => new HydratedTestResult({
            asCanonicalUri(uri) {
                return uri;
            },
        }, {
            completedAt,
            id: 'some-id',
            tasks: [{ id: 't', name: undefined, ctrlId: 'ctrl', hasCoverage: false }],
            name: 'hello world',
            request: defaultOpts([]),
            items: [{
                    ...(await getInitializedMainTestCollection()).getNodeById(new TestId(['ctrlId', 'id-a']).toString()),
                    tasks: [{ state, duration: 0, messages: [] }],
                    computedState: state,
                    ownComputedState: state,
                }]
        });
        test('pushes hydrated results', async () => {
            results.push(r);
            const hydrated = await makeHydrated();
            results.push(hydrated);
            assert.deepStrictEqual(results.results, [r, hydrated]);
        });
        test('inserts in correct order', async () => {
            results.push(r);
            const hydrated1 = await makeHydrated();
            results.push(hydrated1);
            assert.deepStrictEqual(results.results, [r, hydrated1]);
        });
        test('inserts in correct order 2', async () => {
            results.push(r);
            const hydrated1 = await makeHydrated();
            results.push(hydrated1);
            const hydrated2 = await makeHydrated(30);
            results.push(hydrated2);
            assert.deepStrictEqual(results.results, [r, hydrated1, hydrated2]);
        });
    });
    test('resultItemParents', function () {
        assert.deepStrictEqual([...resultItemParents(r, r.getStateById(new TestId(['ctrlId', 'id-a', 'id-aa']).toString()))], [
            r.getStateById(new TestId(['ctrlId', 'id-a', 'id-aa']).toString()),
            r.getStateById(new TestId(['ctrlId', 'id-a']).toString()),
            r.getStateById(new TestId(['ctrlId']).toString()),
        ]);
        assert.deepStrictEqual([...resultItemParents(r, r.getStateById(tests.root.id))], [
            r.getStateById(tests.root.id),
        ]);
    });
    suite('output controller', () => {
        test('reads live output ranges', async () => {
            const ctrl = new TaskRawOutput();
            ctrl.append(VSBuffer.fromString('12345'));
            ctrl.append(VSBuffer.fromString('67890'));
            ctrl.append(VSBuffer.fromString('12345'));
            ctrl.append(VSBuffer.fromString('67890'));
            assert.deepStrictEqual(ctrl.getRange(0, 5), VSBuffer.fromString('12345'));
            assert.deepStrictEqual(ctrl.getRange(5, 5), VSBuffer.fromString('67890'));
            assert.deepStrictEqual(ctrl.getRange(7, 6), VSBuffer.fromString('890123'));
            assert.deepStrictEqual(ctrl.getRange(15, 5), VSBuffer.fromString('67890'));
            assert.deepStrictEqual(ctrl.getRange(15, 10), VSBuffer.fromString('67890'));
        });
        test('corrects offsets for marked ranges', async () => {
            const ctrl = new TaskRawOutput();
            const a1 = ctrl.append(VSBuffer.fromString('12345'), 1);
            const a2 = ctrl.append(VSBuffer.fromString('67890'), 1234);
            const a3 = ctrl.append(VSBuffer.fromString('with new line\r\n'), 4);
            assert.deepStrictEqual(ctrl.getRange(a1.offset, a1.length), VSBuffer.fromString('\x1b]633;SetMark;Id=s1;Hidden\x0712345\x1b]633;SetMark;Id=e1;Hidden\x07'));
            assert.deepStrictEqual(ctrl.getRange(a2.offset, a2.length), VSBuffer.fromString('\x1b]633;SetMark;Id=s1234;Hidden\x0767890\x1b]633;SetMark;Id=e1234;Hidden\x07'));
            assert.deepStrictEqual(ctrl.getRange(a3.offset, a3.length), VSBuffer.fromString('\x1b]633;SetMark;Id=s4;Hidden\x07with new line\x1b]633;SetMark;Id=e4;Hidden\x07\r\n'));
        });
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidGVzdFJlc3VsdFNlcnZpY2UudGVzdC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL3Rlc3RpbmcvdGVzdC9jb21tb24vdGVzdFJlc3VsdFNlcnZpY2UudGVzdC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLE1BQU0sTUFBTSxRQUFRLENBQUM7QUFDNUIsT0FBTyxFQUFvQixPQUFPLEVBQUUsTUFBTSxxQ0FBcUMsQ0FBQztBQUNoRixPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFDaEUsT0FBTyxFQUFFLHVCQUF1QixFQUFFLE1BQU0sNENBQTRDLENBQUM7QUFDckYsT0FBTyxFQUFFLHVDQUF1QyxFQUFFLE1BQU0sMENBQTBDLENBQUM7QUFDbkcsT0FBTyxFQUFFLHFCQUFxQixFQUFFLE1BQU0seUVBQXlFLENBQUM7QUFDaEgsT0FBTyxFQUFFLGNBQWMsRUFBRSxNQUFNLDJDQUEyQyxDQUFDO0FBQzNFLE9BQU8sRUFBRSxvQkFBb0IsRUFBRSxNQUFNLDREQUE0RCxDQUFDO0FBRWxHLE9BQU8sRUFBRSxNQUFNLEVBQUUsTUFBTSx3QkFBd0IsQ0FBQztBQUNoRCxPQUFPLEVBQUUsa0JBQWtCLEVBQUUsTUFBTSxvQ0FBb0MsQ0FBQztBQUN4RSxPQUFPLEVBQUUsa0JBQWtCLEVBQUUsY0FBYyxFQUFFLGFBQWEsRUFBb0QsaUJBQWlCLEVBQUUsTUFBTSw0QkFBNEIsQ0FBQztBQUNwSyxPQUFPLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSxtQ0FBbUMsQ0FBQztBQUN0RSxPQUFPLEVBQXNCLHFCQUFxQixFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUFFOUYsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLCtCQUErQixDQUFDO0FBQ2hFLE9BQU8sRUFBc0IsZ0NBQWdDLEVBQUUsU0FBUyxFQUFF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QUFLLElBQUksRUFBRTtZQUMzQyxNQUFNLElBQUksR0FBRyxJQUFJLGFBQWEsRUFBRSxDQUFDO1lBRWpDLElBQUksQ0FBQyxNQUFNLENBQUMsUUFBUSxDQUFDLFVBQVUsQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDO1lBQzFDLElBQUksQ0FBQyxNQUFNLENBQUMsUUFBUSxDQUFDLFVBQVUsQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDO1lBQzFDLElBQUksQ0FBQyxNQUFNLENBQUMsUUFBUSxDQUFDLFVBQVUsQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDO1lBQzFDLElBQUksQ0FBQyxNQUFNLENBQUMsUUFBUSxDQUFDLFVBQVUsQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDO1lBRTFDLE1BQU0sQ0FBQyxlQUFlLENBQUMsSUFBSSxDQUFDLFFBQVEsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLEVBQUUsUUFBUSxDQUFDLFVBQVUsQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDO1lBQzFFLE1BQU0sQ0FBQyxlQUFlLENBQUMsSUFBSSxDQUFDLFFBQVEsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLEVBQUUsUUFBUSxDQUFDLFVBQVUsQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDO1lBQzFFLE1BQU0sQ0FBQyxlQUFlLENBQUMsSUFBSSxDQUFDLFFBQVEsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLEVBQUUsUUFBUSxDQUFDLFVBQVUsQ0FBQyxRQUFRLENBQUMsQ0FBQyxDQUFDO1lBQzNFLE1BQU0sQ0FBQyxlQUFlLENBQUMsSUFBSSxDQUFDLFFBQVEsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxDQUFDLEVBQUUsUUFBUSxDQUFDLFVBQVUsQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDO1lBQzNFLE1BQU0sQ0FBQyxlQUFlLENBQUMsSUFBSSxDQUFDLFFBQVEsQ0FBQyxFQUFFLEVBQUUsRUFBRSxDQUFDLEVBQUUsUUFBUSxDQUFDLFVBQVUsQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDO1FBQzdFLENBQUMsQ0FBQyxDQUFDO1FBRUgsSUFBSSxDQUFDLG9DQUFvQyxFQUFFLEtBQUssSUFBSSxFQUFFO1lBQ3JELE1BQU0sSUFBSSxHQUFHLElBQUksYUFBYSxFQUFFLENBQUM7WUFFakMsTUFBTSxFQUFFLEdBQUcsSUFBSSxDQUFDLE1BQU0sQ0FBQyxRQUFRLENBQUMsVUFBVSxDQUFDLE9BQU8sQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDO1lBQ3hELE1BQU0sRUFBRSxHQUFHLElBQUksQ0FBQyxNQUFNLENBQUMsUUFBUSxDQUFDLFVBQVUsQ0FBQyxPQUFPLENBQUMsRUFBRSxJQUFJLENBQUMsQ0FBQztZQUMzRCxNQUFNLEVBQUUsR0FBRyxJQUFJLENBQUMsTUFBTSxDQUFDLFFBQVEsQ0FBQyxVQUFVLENBQUMsbUJBQW1CLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQztZQUVwRSxNQUFNLENBQUMsZUFBZSxDQUFDLElBQUksQ0FBQyxRQUFRLENBQUMsRUFBRSxDQUFDLE1BQU0sRUFBRSxFQUFFLENBQUMsTUFBTSxDQUFDLEVBQUUsUUFBUSxDQUFDLFVBQVUsQ0FBQyx5RUFBeUUsQ0FBQyxDQUFDLENBQUM7WUFDNUosTUFBTSxDQUFDLGVBQWUsQ0FBQyxJQUFJLENBQUMsUUFBUSxDQUFDLEVBQUUsQ0FBQyxNQUFNLEVBQUUsRUFBRSxDQUFDLE1BQU0sQ0FBQyxFQUFFLFFBQVEsQ0FBQyxVQUFVLENBQUMsK0VBQStFLENBQUMsQ0FBQyxDQUFDO1lBQ2xLLE1BQU0sQ0FBQyxlQUFlLENBQUMsSUFBSSxDQUFDLFFBQVEsQ0FBQyxFQUFFLENBQUMsTUFBTSxFQUFFLEVBQUUsQ0FBQyxNQUFNLENBQUMsRUFBRSxRQUFRLENBQUMsVUFBVSxDQUFDLHFGQUFxRixDQUFDLENBQUMsQ0FBQztRQUN6SyxDQUFDLENBQUMsQ0FBQztJQUNKLENBQUMsQ0FBQyxDQUFDO0FBQ0osQ0FBQyxDQUFDLENBQUMifQ==