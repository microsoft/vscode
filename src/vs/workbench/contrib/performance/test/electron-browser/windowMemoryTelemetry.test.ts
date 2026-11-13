/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { timeout } from '../../../../../base/common/async.js';
import { constObservable } from '../../../../../base/common/observable.js';
import { HeapStatistics } from '../../../../../base/parts/sandbox/electron-browser/electronTypes.js';
import { upcastPartial } from '../../../../../base/test/common/mock.js';
import { runWithFakedTimers } from '../../../../../base/test/common/timeTravelScheduler.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { INativeHostService } from '../../../../../platform/native/common/native.js';
import { MEMORY_SAMPLING_PROBABILITY_SETTING_ID } from '../../../../../platform/process/common/processMemory.js';
import { ITelemetryService, TelemetryLevel } from '../../../../../platform/telemetry/common/telemetry.js';
import { IEditorGroupsService } from '../../../../services/editor/common/editorGroupsService.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';
import { ActivationTimes, IExtensionService, IExtensionsStatus } from '../../../../services/extensions/common/extensions.js';
import { IChatService } from '../../../chat/common/chatService/chatService.js';
import { IChatModel } from '../../../chat/common/model/chatModel.js';
import { ITerminalInstance, ITerminalService } from '../../../terminal/browser/terminal.js';
import { WindowMemoryTelemetry } from '../../electron-browser/windowMemoryTelemetry.js';

suite('WindowMemoryTelemetry', () => {

	const store = ensureNoDisposablesAreLeakedInTestSuite();

	const MINUTE = 60 * 1000;
	const MB = 1024;

	test('reports the memory of the window and what is open in it when it has been open for a milestone', () => runWithFakedTimers({ useFakeTimers: true, maxTaskCount: 1000 }, async () => {
		const events: { eventName: string; data: unknown }[] = [];
		const instantiationService = store.add(new TestInstantiationService());
		instantiationService.stub(IConfigurationService, new TestConfigurationService({ [MEMORY_SAMPLING_PROBABILITY_SETTING_ID]: 1 }));
		instantiationService.stub(ITelemetryService, upcastPartial<ITelemetryService>({ telemetryLevel: TelemetryLevel.USAGE, publicLog2: (eventName: string, data?: unknown) => { events.push({ eventName, data }); } }));
		instantiationService.stub(INativeHostService, upcastPartial<INativeHostService>({ getProcessMemory: async () => ({ workingSetSize: 700 * MB, peakWorkingSetSize: 800 * MB }) }));
		instantiationService.stub(IEditorService, upcastPartial<IEditorService>({ count: 5 }));
		instantiationService.stub(IEditorGroupsService, upcastPartial<IEditorGroupsService>({ count: 2 }));
		instantiationService.stub(ITerminalService, upcastPartial<ITerminalService>({ instances: [upcastPartial<ITerminalInstance>({})] }));
		instantiationService.stub(IChatService, upcastPartial<IChatService>({ chatModels: constObservable([upcastPartial<IChatModel>({}), upcastPartial<IChatModel>({})]) }));
		instantiationService.stub(IExtensionService, upcastPartial<IExtensionService>({
			getExtensionsStatus: () => ({
				activated: upcastPartial<IExtensionsStatus>({ activationTimes: upcastPartial<ActivationTimes>({}) }),
				inactive: upcastPartial<IExtensionsStatus>({ activationTimes: undefined }),
			})
		}));

		const telemetry = store.add(instantiationService.createInstance(WindowMemoryTelemetry, {
			getHeapStatistics: () => upcastPartial<HeapStatistics>({ usedHeapSize: 300 * MB, totalHeapSize: 400 * MB, heapSizeLimit: 4096 * MB }),
			getBlinkMemoryInfo: () => ({ allocated: 20 * MB, total: 30 * MB })
		}));

		await timeout(15.5 * MINUTE);
		telemetry.dispose();

		assert.deepStrictEqual(events, [{
			eventName: 'memory.windowSample',
			data: {
				milestoneMinutes: 15,
				workingSetMb: 700,
				peakWorkingSetMb: 800,
				privateMb: undefined,
				jsHeapUsedMb: 300,
				jsHeapTotalMb: 400,
				jsHeapLimitMb: 4096,
				domAllocatedMb: 20,
				domTotalMb: 30,
				editorCount: 5,
				editorGroupCount: 2,
				terminalCount: 1,
				chatSessionCount: 2,
				activatedExtensionCount: 1,
				auxiliaryWindowCount: 0
			}
		}]);
	}));
});
