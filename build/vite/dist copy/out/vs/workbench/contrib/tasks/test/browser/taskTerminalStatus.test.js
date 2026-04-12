/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { ok } from 'assert';
import { Emitter } from '../../../../../base/common/event.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ACTIVE_TASK_STATUS, FAILED_TASK_STATUS, SUCCEEDED_TASK_STATUS, TaskTerminalStatus } from '../../browser/taskTerminalStatus.js';
import { CommonTask, TaskEventKind } from '../../common/tasks.js';
import { TerminalStatusList } from '../../../terminal/browser/terminalStatusList.js';
class TestTaskService {
    constructor() {
        this._onDidStateChange = new Emitter();
    }
    get onDidStateChange() {
        return this._onDidStateChange.event;
    }
    triggerStateChange(event) {
        this._onDidStateChange.fire(event);
    }
}
class TestaccessibilitySignalService {
    async playSignal(cue) {
        return;
    }
}
class TestTerminal extends Disposable {
    constructor() {
        super();
        this.statusList = this._register(new TerminalStatusList(new TestConfigurationService()));
        this._onDisposed = this._register(new Emitter());
        this.onDisposed = this._onDisposed.event;
    }
    dispose() {
        super.dispose();
    }
}
class TestTask extends CommonTask {
    constructor() {
        super('test', undefined, undefined, {}, {}, { kind: '', label: '' });
    }
    getFolderId() {
        throw new Error('Method not implemented.');
    }
    fromObject(object) {
        throw new Error('Method not implemented.');
    }
}
class TestProblemCollector extends Disposable {
    constructor() {
        super(...arguments);
        this._onDidFindFirstMatch = new Emitter();
        this.onDidFindFirstMatch = this._onDidFindFirstMatch.event;
        this._onDidFindErrors = new Emitter();
        this.onDidFindErrors = this._onDidFindErrors.event;
        this._onDidRequestInvalidateLastMarker = new Emitter();
        this.onDidRequestInvalidateLastMarker = this._onDidRequestInvalidateLastMarker.event;
    }
}
suite('Task Terminal Status', () => {
    let instantiationService;
    let taskService;
    let taskTerminalStatus;
    let testTerminal;
    let testTask;
    let problemCollector;
    let accessibilitySignalService;
    const store = ensureNoDisposablesAreLeakedInTestSuite();
    setup(() => {
        instantiationService = store.add(new TestInstantiationService());
        taskService = new TestTaskService();
        accessibilitySignalService = new TestaccessibilitySignalService();
        // eslint-disable-next-line local/code-no-any-casts
        taskTerminalStatus = store.add(new TaskTerminalStatus(taskService, accessibilitySignalService));
        // eslint-disable-next-line local/code-no-any-casts
        testTerminal = store.add(instantiationService.createInstance(TestTerminal));
        testTask = instantiationService.createInstance(TestTask);
        // eslint-disable-next-line local/code-no-any-casts
        problemCollector = store.add(instantiationService.createInstance(TestProblemCollector));
    });
    test('Should add failed status when there is an exit code on task end', async () => {
        taskTerminalStatus.addTerminal(testTask, testTerminal, problemCollector);
        taskService.triggerStateChange({ kind: TaskEventKind.ProcessStarted });
        assertStatus(testTerminal.statusList, ACTIVE_TASK_STATUS);
        taskService.triggerStateChange({ kind: TaskEventKind.Inactive });
        assertStatus(testTerminal.statusList, SUCCEEDED_TASK_STATUS);
        taskService.triggerStateChange({ kind: TaskEventKind.End });
        await poll(async () => Promise.resolve(), () => testTerminal?.statusList.primary?.id === FAILED_TASK_STATUS.id, 'terminal status should be updated');
    });
    test('Should add active status when a non-background task is run for a second time in the same terminal', () => {
        taskTerminalStatus.addTerminal(testTask, testTerminal, problemCollector);
        taskService.triggerStateChange({ kind: TaskEventKind.ProcessStarted });
        assertStatus(testTerminal.statusList, ACTIVE_TASK_STATUS);
        taskService.triggerStateChange({ kind: TaskEventKind.Inactive });
        assertStatus(testTerminal.statusList, SUCCEEDED_TASK_STATUS);
        taskService.triggerStateChange({ kind: TaskEventKind.ProcessStarted, runType: "singleRun" /* TaskRunType.SingleRun */ });
        assertStatus(testTerminal.statusList, ACTIVE_TASK_STATUS);
        taskService.triggerStateChange({ kind: TaskEventKind.Inactive });
        assertStatus(testTerminal.statusList, SUCCEEDED_TASK_STATUS);
    });
    test('Should drop status when a background task exits', async () => {
        taskTerminalStatus.addTerminal(testTask, testTerminal, problemCollector);
        taskService.triggerStateChange({ kind: TaskEventKind.ProcessStarted, runType: "background" /* TaskRunType.Background */ });
        assertStatus(testTerminal.statusList, ACTIVE_TASK_STATUS);
        taskService.triggerStateChange({ kind: TaskEventKind.Inactive });
        assertStatus(testTerminal.statusList, SUCCEEDED_TASK_STATUS);
        taskService.triggerStateChange({ kind: TaskEventKind.ProcessEnded, exitCode: 0 });
        await poll(async () => Promise.resolve(), () => testTerminal?.statusList.statuses?.includes(SUCCEEDED_TASK_STATUS) === false, 'terminal should have dropped status');
    });
    test('Should add succeeded status when a non-background task exits', () => {
        taskTerminalStatus.addTerminal(testTask, testTerminal, problemCollector);
        taskService.triggerStateChange({ kind: TaskEventKind.ProcessStarted, runType: "singleRun" /* TaskRunType.SingleRun */ });
        assertStatus(testTerminal.statusList, ACTIVE_TASK_STATUS);
        taskService.triggerStateChange({ kind: TaskEventKind.Inactive });
        assertStatus(testTerminal.statusList, SUCCEEDED_TASK_STATUS);
        taskService.triggerStateChange({ kind: TaskEventKind.ProcessEnded, exitCode: 0 });
        assertStatus(testTerminal.statusList, SUCCEEDED_TASK_STATUS);
    });
});
function assertStatus(actual, expected) {
    ok(actual.statuses.length === 1, '# of statuses');
    ok(actual.primary?.id === expected.id, 'ID');
    ok(actual.primary?.severity === expected.severity, 'Severity');
}
async function poll(fn, acceptFn, timeoutMessage, retryCount = 200, retryInterval = 10 // millis
) {
    let trial = 1;
    let lastError = '';
    while (true) {
        if (trial > retryCount) {
            throw new Error(`Timeout: ${timeoutMessage} after ${(retryCount * retryInterval) / 1000} seconds.\r${lastError}`);
        }
        let result;
        try {
            result = await fn();
            if (acceptFn(result)) {
                return result;
            }
            else {
                lastError = 'Did not pass accept function';
            }
        }
        catch (e) {
            lastError = Array.isArray(e.stack) ? e.stack.join('\n') : e.stack;
        }
        await new Promise(resolve => setTimeout(resolve, retryInterval));
        trial++;
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidGFza1Rlcm1pbmFsU3RhdHVzLnRlc3QuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi90YXNrcy90ZXN0L2Jyb3dzZXIvdGFza1Rlcm1pbmFsU3RhdHVzLnRlc3QudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxFQUFFLEVBQUUsRUFBRSxNQUFNLFFBQVEsQ0FBQztBQUM1QixPQUFPLEVBQUUsT0FBTyxFQUFTLE1BQU0scUNBQXFDLENBQUM7QUFDckUsT0FBTyxFQUFFLFVBQVUsRUFBRSxNQUFNLHlDQUF5QyxDQUFDO0FBQ3JFLE9BQU8sRUFBRSx1Q0FBdUMsRUFBRSxNQUFNLDBDQUEwQyxDQUFDO0FBRW5HLE9BQU8sRUFBRSx3QkFBd0IsRUFBRSxNQUFNLCtFQUErRSxDQUFDO0FBQ3pILE9BQU8sRUFBRSx3QkFBd0IsRUFBRSxNQUFNLCtFQUErRSxDQUFDO0FBQ3pILE9BQU8sRUFBRSxrQkFBa0IsRUFBRSxrQkFBa0IsRUFBRSxxQkFBcUIsRUFBRSxrQkFBa0IsRUFBRSxNQUFNLHFDQUFxQyxDQUFDO0FBRXhJLE9BQU8sRUFBRSxVQUFVLEVBQWMsYUFBYSxFQUFlLE1BQU0sdUJBQXVCLENBQUM7QUFHM0YsT0FBTyxFQUF1QixrQkFBa0IsRUFBRSxNQUFNLGlEQUFpRCxDQUFDO0FBSTFHLE1BQU0sZUFBZTtJQUFyQjtRQUNrQixzQkFBaUIsR0FBd0IsSUFBSSxPQUFPLEVBQUUsQ0FBQztJQU96RSxDQUFDO0lBTkEsSUFBVyxnQkFBZ0I7UUFDMUIsT0FBTyxJQUFJLENBQUMsaUJBQWlCLENBQUMsS0FBSyxDQUFDO0lBQ3JDLENBQUM7SUFDTSxrQkFBa0IsQ0FBQyxLQUEwQjtRQUNuRCxJQUFJLENBQUMsaUJBQWlCLENBQUMsSUFBSSxDQUFDLEtBQW1CLENBQUMsQ0FBQztJQUNsRCxDQUFDO0NBQ0Q7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