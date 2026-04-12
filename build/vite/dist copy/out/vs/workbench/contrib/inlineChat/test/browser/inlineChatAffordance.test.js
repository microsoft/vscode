/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { observableValue } from '../../../../../base/common/observable.js';
import { Selection } from '../../../../../editor/common/core/selection.js';
import { CursorState } from '../../../../../editor/common/cursorCommon.js';
import { createTextModel } from '../../../../../editor/test/common/testTextModel.js';
import { instantiateTestCodeEditor } from '../../../../../editor/test/browser/testCodeEditor.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import { IInlineChatSessionService } from '../../browser/inlineChatSessionService.js';
import { Event } from '../../../../../base/common/event.js';
import { InlineChatAffordance } from '../../browser/inlineChatAffordance.js';
import { runWithFakedTimers } from '../../../../../base/test/common/timeTravelScheduler.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { timeout } from '../../../../../base/common/async.js';
import { workbenchInstantiationService } from '../../../../test/browser/workbenchTestServices.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { mock } from '../../../../../base/test/common/mock.js';
function createMockInputWidget() {
    return new class extends mock() {
        constructor() {
            super(...arguments);
            this.position = observableValue('test.position', null);
        }
        show() { }
        hide() { }
        dispose() { }
    };
}
suite('InlineChatAffordance - Telemetry', () => {
    const store = new DisposableStore();
    let editor;
    let model;
    let instantiationService;
    let configurationService;
    let telemetryEvents;
    setup(() => {
        telemetryEvents = [];
        instantiationService = workbenchInstantiationService({
            configurationService: () => new TestConfigurationService({
                ["inlineChat.affordance" /* InlineChatConfigKeys.Affordance */]: 'editor',
            }),
        }, store);
        configurationService = instantiationService.get(IConfigurationService);
        instantiationService.stub(ITelemetryService, new class extends mock() {
            publicLog2(eventName, data) {
                telemetryEvents.push({ eventName, data: data ?? {} });
            }
        });
        instantiationService.stub(IInlineChatSessionService, new class extends mock() {
            constructor() {
                super(...arguments);
                this.onWillStartSession = Event.None;
                this.onDidChangeSessions = Event.None;
            }
            getSessionByTextModel() { return undefined; }
            getSessionBySessionUri() { return undefined; }
        });
        model = store.add(createTextModel('hello world\nfoo bar\nbaz qux'));
        editor = store.add(instantiateTestCodeEditor(instantiationService, model));
    });
    teardown(() => {
        store.clear();
    });
    ensureNoDisposablesAreLeakedInTestSuite();
    function setExplicitSelection(sel) {
        editor.getViewModel().setCursorStates('test', 3 /* CursorChangeReason.Explicit */, [CursorState.fromModelSelection(sel)]);
    }
    test('shown event includes mode "editor"', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
        store.add(instantiationService.createInstance(InlineChatAffordance, editor, createMockInputWidget()));
        setExplicitSelection(new Selection(1, 1, 1, 6));
        await timeout(600);
        const shown = telemetryEvents.filter(e => e.eventName === 'inlineChatAffordance/shown');
        assert.strictEqual(shown.length, 1);
        assert.strictEqual(shown[0].data.mode, 'editor');
        assert.ok(typeof shown[0].data.id === 'string');
        assert.strictEqual(shown[0].data.commandId, '');
    }));
    test('shown event does NOT fire when mode is off', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
        configurationService.setUserConfiguration("inlineChat.affordance" /* InlineChatConfigKeys.Affordance */, 'off');
        configurationService.onDidChangeConfigurationEmitter.fire(new class extends mock() {
            affectsConfiguration(key) { return key === "inlineChat.affordance" /* InlineChatConfigKeys.Affordance */; }
        });
        store.add(instantiationService.createInstance(InlineChatAffordance, editor, createMockInputWidget()));
        setExplicitSelection(new Selection(1, 1, 1, 6));
        await timeout(600);
        assert.strictEqual(telemetryEvents.filter(e => e.eventName === 'inlineChatAffordance/shown').length, 0);
    }));
    test('shown event does NOT fire for whitespace-only selection', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
        model.setValue('   \nhello');
        store.add(instantiationService.createInstance(InlineChatAffordance, editor, createMockInputWidget()));
        setExplicitSelection(new Selection(1, 1, 1, 4));
        await timeout(600);
        assert.strictEqual(telemetryEvents.filter(e => e.eventName === 'inlineChatAffordance/shown').length, 0);
    }));
    test('shown event does NOT fire for empty selection', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
        store.add(instantiationService.createInstance(InlineChatAffordance, editor, createMockInputWidget()));
        setExplicitSelection(new Selection(1, 1, 1, 1));
        await timeout(600);
        assert.strictEqual(telemetryEvents.filter(e => e.eventName === 'inlineChatAffordance/shown').length, 0);
    }));
    test('each selection gets a unique affordanceId', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
        store.add(instantiationService.createInstance(InlineChatAffordance, editor, createMockInputWidget()));
        setExplicitSelection(new Selection(1, 1, 1, 6));
        await timeout(600);
        // Clear selection, then make a new one
        setExplicitSelection(new Selection(2, 1, 2, 1));
        await timeout(100);
        setExplicitSelection(new Selection(2, 1, 2, 4));
        await timeout(600);
        const shown = telemetryEvents.filter(e => e.eventName === 'inlineChatAffordance/shown');
        assert.strictEqual(shown.length, 2);
        assert.notStrictEqual(shown[0].data.id, shown[1].data.id);
    }));
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5saW5lQ2hhdEFmZm9yZGFuY2UudGVzdC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL2lubGluZUNoYXQvdGVzdC9icm93c2VyL2lubGluZUNoYXRBZmZvcmRhbmNlLnRlc3QudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxNQUFNLE1BQU0sUUFBUSxDQUFDO0FBQzVCLE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSx5Q0FBeUMsQ0FBQztBQUMxRSxPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0sMENBQTBDLENBQUM7QUFDM0UsT0FBTyxFQUFFLFNBQVMsRUFBRSxNQUFNLGdEQUFnRCxDQUFDO0FBRTNFLE9BQU8sRUFBRSxXQUFXLEVBQUUsTUFBTSw4Q0FBOEMsQ0FBQztBQUMzRSxPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0sb0RBQW9ELENBQUM7QUFDckYsT0FBTyxFQUFFLHlCQUF5QixFQUFtQixNQUFNLHNEQUFzRCxDQUFDO0FBQ2xILE9BQU8sRUFBRSx3QkFBd0IsRUFBRSxNQUFNLCtFQUErRSxDQUFDO0FBQ3pILE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxNQUFNLHVEQUF1RCxDQUFDO0FBQzFGLE9BQU8sRUFBRSx5QkFBeUIsRUFBRSxNQUFNLDJDQUEyQyxDQUFDO0FBQ3RGLE9BQU8sRUFBRSxLQUFLLEVBQUUsTUFBTSxxQ0FBcUMsQ0FBQztBQUM1RCxPQUFPLEVBQUUsb0JBQW9CLEVBQUUsTUFBTSx1Q0FBdUMsQ0FBQztBQUU3RSxPQUFPLEVBQUUsa0JBQWtCLEVBQUUsTUFBTSx3REFBd0QsQ0FBQztBQUM1RixPQUFPLEVBQUUsdUNBQXVDLEVBQUUsTUFBTSwwQ0FBMEMsQ0FBQztBQUNuRyxPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0scUNBQXFDLENBQUM7QUFJOUQsT0FBTyxFQUFFLDZCQUE2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