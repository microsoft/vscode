/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { deepStrictEqual, ok } from 'assert';
import { importAMDNodeModule } from '../../../../../amdX.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { Disposable, DisposableStore } from '../../../../../base/common/lifecycle.js';
import { upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IModelService } from '../../../../../editor/common/services/model.js';
import { AccessibilitySignal, IAccessibilitySignalService } from '../../../../../platform/accessibilitySignal/browser/accessibilitySignalService.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { MarkerService } from '../../../../../platform/markers/common/markerService.js';
import { BufferMarkCapability } from '../../../../../platform/terminal/common/capabilities/bufferMarkCapability.js';
import { TestXtermLogger } from '../../../../../platform/terminal/test/common/terminalTestHelpers.js';
import { ACTIVE_TASK_STATUS, FAILED_TASK_STATUS, SUCCEEDED_TASK_STATUS, TaskTerminalStatus } from '../../browser/taskTerminalStatus.js';
import { AbstractProblemCollector, WatchingProblemCollector } from '../../common/problemCollectors.js';
import { ApplyToKind, FileLocationKind } from '../../common/problemMatcher.js';
import { CommonTask, ITaskEvent, TaskEventKind, TaskRunType } from '../../common/tasks.js';
import { ITaskService, Task } from '../../common/taskService.js';
import { ITerminalInstance } from '../../../terminal/browser/terminal.js';
import { ITerminalStatusList, TerminalStatusList } from '../../../terminal/browser/terminalStatusList.js';
import { writeP } from '../../../terminal/browser/terminalTestHelpers.js';
import { LineDataEventAddon } from '../../../terminal/browser/xterm/lineDataEventAddon.js';
import { ITerminalStatus } from '../../../terminal/common/terminal.js';
import { IMarker } from '../../../../../platform/markers/common/markers.js';

class TestTaskService implements Partial<ITaskService> {
	private readonly _onDidStateChange: Emitter<ITaskEvent> = new Emitter();
	public get onDidStateChange(): Event<ITaskEvent> {
		return this._onDidStateChange.event;
	}
	public triggerStateChange(event: Partial<ITaskEvent>): void {
		this._onDidStateChange.fire(event as ITaskEvent);
	}
}

class TestaccessibilitySignalService implements Partial<IAccessibilitySignalService> {
	async playSignal(cue: AccessibilitySignal): Promise<void> {
		return;
	}
}

class TestTerminal extends Disposable implements Partial<ITerminalInstance> {
	statusList: TerminalStatusList = this._register(new TerminalStatusList(new TestConfigurationService()));
	constructor() {
		super();
	}
	override dispose(): void {
		super.dispose();
	}

	private readonly _onDisposed = this._register(new Emitter<ITerminalInstance>());
	readonly onDisposed = this._onDisposed.event;

}

class TestTask extends CommonTask {

	constructor() {
		super('test', undefined, undefined, {}, {}, { kind: '', label: '' });
	}

	protected getFolderId(): string | undefined {
		throw new Error('Method not implemented.');
	}
	protected fromObject(object: any): Task {
		throw new Error('Method not implemented.');
	}
}

class TestProblemCollector extends Disposable implements Partial<AbstractProblemCollector> {
	protected readonly _onDidFindFirstMatch = new Emitter<void>();
	readonly onDidFindFirstMatch = this._onDidFindFirstMatch.event;
	protected readonly _onDidFindErrors = new Emitter<IMarker[]>();
	readonly onDidFindErrors = this._onDidFindErrors.event;
	protected readonly _onDidRequestInvalidateLastMarker = new Emitter<void>();
	readonly onDidRequestInvalidateLastMarker = this._onDidRequestInvalidateLastMarker.event;
}

suite('Task Terminal Status', () => {
	let instantiationService: TestInstantiationService;
	let taskService: TestTaskService;
	let taskTerminalStatus: TaskTerminalStatus;
	let testTerminal: ITerminalInstance;
	let testTask: Task;
	let problemCollector: AbstractProblemCollector;
	let accessibilitySignalService: TestaccessibilitySignalService;
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	setup(() => {
		instantiationService = store.add(new TestInstantiationService());
		taskService = new TestTaskService();
		accessibilitySignalService = new TestaccessibilitySignalService();
		// eslint-disable-next-line local/code-no-any-casts
		taskTerminalStatus = store.add(new TaskTerminalStatus(taskService as any, accessibilitySignalService as any));
		// eslint-disable-next-line local/code-no-any-casts
		testTerminal = store.add(instantiationService.createInstance(TestTerminal) as any);
		testTask = instantiationService.createInstance(TestTask) as unknown as Task;
		// eslint-disable-next-line local/code-no-any-casts
		problemCollector = store.add(instantiationService.createInstance(TestProblemCollector) as any);
	});
	test('Should add failed status when there is an exit code on task end', () => {
		taskTerminalStatus.addTerminal(testTask, testTerminal, problemCollector);
		taskService.triggerStateChange({ kind: TaskEventKind.ProcessStarted });
		assertStatus(testTerminal.statusList, ACTIVE_TASK_STATUS);
		taskService.triggerStateChange({ kind: TaskEventKind.Inactive });
		assertStatus(testTerminal.statusList, SUCCEEDED_TASK_STATUS);
		taskService.triggerStateChange({ kind: TaskEventKind.End });
		ok(testTerminal.statusList.primary?.id === FAILED_TASK_STATUS.id, 'terminal status should be updated');
	});
	test('Should add active status when a non-background task is run for a second time in the same terminal', () => {
		taskTerminalStatus.addTerminal(testTask, testTerminal, problemCollector);
		taskService.triggerStateChange({ kind: TaskEventKind.ProcessStarted });
		assertStatus(testTerminal.statusList, ACTIVE_TASK_STATUS);
		taskService.triggerStateChange({ kind: TaskEventKind.Inactive });
		assertStatus(testTerminal.statusList, SUCCEEDED_TASK_STATUS);
		taskService.triggerStateChange({ kind: TaskEventKind.ProcessStarted, runType: TaskRunType.SingleRun });
		assertStatus(testTerminal.statusList, ACTIVE_TASK_STATUS);
		taskService.triggerStateChange({ kind: TaskEventKind.Inactive });
		assertStatus(testTerminal.statusList, SUCCEEDED_TASK_STATUS);
	});
	test('Should drop status when a background task exits', () => {
		taskTerminalStatus.addTerminal(testTask, testTerminal, problemCollector);
		taskService.triggerStateChange({ kind: TaskEventKind.ProcessStarted, runType: TaskRunType.Background });
		assertStatus(testTerminal.statusList, ACTIVE_TASK_STATUS);
		taskService.triggerStateChange({ kind: TaskEventKind.Inactive });
		assertStatus(testTerminal.statusList, SUCCEEDED_TASK_STATUS);
		taskService.triggerStateChange({ kind: TaskEventKind.ProcessEnded, exitCode: 0 });
		ok(!testTerminal.statusList.statuses.includes(SUCCEEDED_TASK_STATUS), 'terminal should have dropped status');
	});
	test('Should add succeeded status when a non-background task exits', () => {
		taskTerminalStatus.addTerminal(testTask, testTerminal, problemCollector);
		taskService.triggerStateChange({ kind: TaskEventKind.ProcessStarted, runType: TaskRunType.SingleRun });
		assertStatus(testTerminal.statusList, ACTIVE_TASK_STATUS);
		taskService.triggerStateChange({ kind: TaskEventKind.Inactive });
		assertStatus(testTerminal.statusList, SUCCEEDED_TASK_STATUS);
		taskService.triggerStateChange({ kind: TaskEventKind.ProcessEnded, exitCode: 0 });
		assertStatus(testTerminal.statusList, SUCCEEDED_TASK_STATUS);
	});

	suite('background task markers', () => {
		async function createBackgroundTerminal(instanceId: number) {
			const disposables = store.add(new DisposableStore());
			const TerminalCtor = (await importAMDNodeModule<typeof import('@xterm/xterm')>('@xterm/xterm', 'lib/xterm.js')).Terminal;
			const xterm = store.add(new TerminalCtor({ allowProposedApi: true, logger: TestXtermLogger }));
			const marks = store.add(new BufferMarkCapability(xterm));
			const collector = store.add(new WatchingProblemCollector([{
				owner: `task${instanceId}`,
				applyTo: ApplyToKind.allDocuments,
				fileLocation: FileLocationKind.Relative,
				filePrefix: '/workspace',
				pattern: { regexp: /^(.*):(\d+): (.*)$/, file: 1, line: 2, message: 3 },
				watching: { activeOnStart: false, beginsPattern: { regexp: /^begin$/ }, endsPattern: { regexp: /^end$/ } }
			}], store.add(new MarkerService()), upcastPartial<IModelService>({
				onModelAdded: Event.None,
				onModelRemoved: Event.None,
				getModels: () => []
			})));
			taskTerminalStatus.addTerminal(testTask, upcastPartial<ITerminalInstance>({
				instanceId,
				statusList: store.add(new TerminalStatusList(new TestConfigurationService())),
				onDisposed: Event.None,
				registerMarker: offset => xterm.registerMarker(offset),
				addBufferMarker: properties => marks.addMark(properties)
			}), collector);
			const lineData = store.add(new LineDataEventAddon());
			xterm.loadAddon(lineData);
			store.add(lineData.onLineData(line => collector.processLine(line)));
			return {
				xterm,
				marks,
				async write(data: string) {
					const stateChanged = Event.toPromise(collector.onDidStateChange, disposables);
					await writeP(xterm, data);
					await stateChanged;
				}
			};
		}

		test('keeps error markers in their own terminal when background tasks overlap', async () => {
			const first = await createBackgroundTerminal(1);
			const second = await createBackgroundTerminal(2);

			await first.write('first prelude\r\nbegin\r\n');
			await second.write('second prelude\r\nmore output\r\nmore output\r\nbegin\r\n');
			await first.write('a.ts:1: first error\r\nend\r\n');
			await second.write('b.ts:1: second error\r\nend\r\n');

			deepStrictEqual([
				Array.from(first.marks.markers(), marker => marker.line),
				Array.from(second.marks.markers(), marker => marker.line)
			], [[2], [4]]);
		});

		test('a clean background task does not invalidate another terminal marker', async () => {
			const first = await createBackgroundTerminal(1);
			const second = await createBackgroundTerminal(2);

			await first.write('begin\r\n');
			await second.write('second prelude\r\nmore output\r\nbegin\r\n');
			await first.write('end\r\n');
			await second.write('b.ts:1: second error\r\nend\r\n');

			deepStrictEqual({
				firstMarkers: first.xterm.markers.map(marker => marker.line),
				secondMarks: Array.from(second.marks.markers(), marker => marker.line)
			}, { firstMarkers: [], secondMarks: [3] });
		});
	});
});

function assertStatus(actual: ITerminalStatusList, expected: ITerminalStatus): void {
	ok(actual.statuses.length === 1, '# of statuses');
	ok(actual.primary?.id === expected.id, 'ID');
	ok(actual.primary?.severity === expected.severity, 'Severity');
}
