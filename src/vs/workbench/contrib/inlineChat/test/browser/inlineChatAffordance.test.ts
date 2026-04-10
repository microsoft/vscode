/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { observableValue } from '../../../../../base/common/observable.js';
import { Selection } from '../../../../../editor/common/core/selection.js';
import { CursorChangeReason } from '../../../../../editor/common/cursorEvents.js';
import { CursorState } from '../../../../../editor/common/cursorCommon.js';
import { createTextModel } from '../../../../../editor/test/common/testTextModel.js';
import { instantiateTestCodeEditor, ITestCodeEditor } from '../../../../../editor/test/browser/testCodeEditor.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import { IInlineChatSessionService } from '../../browser/inlineChatSessionService.js';
import { Event } from '../../../../../base/common/event.js';
import { InlineChatAffordance } from '../../browser/inlineChatAffordance.js';
import { InlineChatInputWidget } from '../../browser/inlineChatOverlayWidget.js';
import { runWithFakedTimers } from '../../../../../base/test/common/timeTravelScheduler.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { timeout } from '../../../../../base/common/async.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ITextModel } from '../../../../../editor/common/model.js';
import { InlineChatConfigKeys } from '../../common/inlineChat.js';
import { workbenchInstantiationService } from '../../../../test/browser/workbenchTestServices.js';
import { IConfigurationChangeEvent, IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { mock } from '../../../../../base/test/common/mock.js';

function createMockInputWidget(): InlineChatInputWidget {
	return new class extends mock<InlineChatInputWidget>() {
		override readonly position = observableValue('test.position', null);
		override show() { }
		override hide() { }
		override dispose() { }
	};
}

suite('InlineChatAffordance - Telemetry', () => {

	const store = new DisposableStore();
	let editor: ITestCodeEditor;
	let model: ITextModel;
	let instantiationService: TestInstantiationService;
	let configurationService: TestConfigurationService;
	let telemetryEvents: { eventName: string; data: Record<string, unknown> }[];

	setup(() => {
		telemetryEvents = [];

		instantiationService = workbenchInstantiationService({
			configurationService: () => new TestConfigurationService({
				[InlineChatConfigKeys.Affordance]: 'editor',
			}),
		}, store);

		configurationService = instantiationService.get(IConfigurationService) as TestConfigurationService;

		instantiationService.stub(ITelemetryService, new class extends mock<ITelemetryService>() {
			override publicLog2(eventName: string, data?: Record<string, unknown>) {
				telemetryEvents.push({ eventName, data: data ?? {} });
			}
		});

		instantiationService.stub(IInlineChatSessionService, new class extends mock<IInlineChatSessionService>() {
			override readonly onWillStartSession = Event.None;
			override readonly onDidChangeSessions = Event.None;
			override getSessionByTextModel() { return undefined; }
			override getSessionBySessionUri() { return undefined; }
		});

		model = store.add(createTextModel('hello world\nfoo bar\nbaz qux'));
		editor = store.add(instantiateTestCodeEditor(instantiationService, model));
	});

	teardown(() => {
		store.clear();
	});

	ensureNoDisposablesAreLeakedInTestSuite();

	function setExplicitSelection(sel: Selection): void {
		editor.getViewModel()!.setCursorStates(
			'test',
			CursorChangeReason.Explicit,
			[CursorState.fromModelSelection(sel)]
		);
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
		configurationService.setUserConfiguration(InlineChatConfigKeys.Affordance, 'off');
		configurationService.onDidChangeConfigurationEmitter.fire(new class extends mock<IConfigurationChangeEvent>() {
			override affectsConfiguration(key: string) { return key === InlineChatConfigKeys.Affordance; }
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
