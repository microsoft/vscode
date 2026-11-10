/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { IVSCodeExtensionContext } from '../../../../platform/extContext/common/extensionContext';
import { SurveyService } from '../../../../platform/survey/vscode/surveyServiceImpl';
import { NullExperimentationService } from '../../../../platform/telemetry/common/nullExperimentationService';
import { NullTelemetryService } from '../../../../platform/telemetry/common/nullTelemetryService';
import { MockExtensionContext } from '../../../../platform/test/node/extensionContext';
import { mock } from '../../../../util/common/test/simpleMock';
import { SURVEY_SIGNAL_USAGE_ID, SurveyCommandContribution } from '../surveyCommands';

const vscodeMock = vi.hoisted(() => {
	const commands = new Map<string, (source: string, languageId?: string) => Promise<void>>();
	return {
		commands,
		registerCommand: (id: string, handler: (source: string, languageId?: string) => Promise<void>) => {
			commands.set(id, handler);
			return { dispose: () => commands.delete(id) };
		},
		showInformationMessage: vi.fn().mockResolvedValue(undefined),
	};
});

vi.mock('vscode', async importOriginal => ({
	...await importOriginal<typeof import('vscode')>(),
	commands: { registerCommand: vscodeMock.registerCommand },
	window: { showInformationMessage: vscodeMock.showInformationMessage },
}));

class TestExtensionContext extends mock<IVSCodeExtensionContext>() {
	override readonly globalState = Object.assign(new MockExtensionContext().globalState, { setKeysForSync() { } });
}

describe('Copilot survey harness usage bridge', () => {
	const day = 24 * 60 * 60 * 1000;
	const now = new Date(2026, 9, 19, 12).getTime();
	const today = new Date(now).setHours(0, 0, 0, 0);
	let context: TestExtensionContext;
	let telemetry: NullTelemetryService;
	let service: SurveyService;
	let contribution: SurveyCommandContribution;

	async function signalHarnessUsage() {
		await vscodeMock.commands.get(SURVEY_SIGNAL_USAGE_ID)!('agent.copilot');
	}

	beforeEach(() => {
		vi.useFakeTimers();
		vi.setSystemTime(now);
		vi.spyOn(Math, 'random').mockReturnValue(0.5);
		vscodeMock.showInformationMessage.mockClear();
		context = new TestExtensionContext();
		telemetry = new NullTelemetryService();
		const experimentation = new NullExperimentationService();
		vi.spyOn(experimentation, 'getTreatmentVariable').mockReturnValue(100);
		service = new SurveyService(telemetry, context, experimentation);
		contribution = new SurveyCommandContribution(service);
	});

	afterEach(() => {
		contribution.dispose();
		service.dispose();
		vi.restoreAllMocks();
		vi.useRealTimers();
	});

	it('refreshes activity before the startup inactivity check and does not prompt a one-day Copilot harness user', async () => {
		await context.globalState.update('survey.usage', { firstActive: now - 30 * day, activeDays: [today - 20 * day] });
		await vi.advanceTimersByTimeAsync(4 * 60 * 1000);
		await signalHarnessUsage();
		await vi.advanceTimersByTimeAsync(4 * 60 * 1000);
		expect({
			usage: context.globalState.get('survey.usage'),
			inactive: await service.checkInactiveUserHeuristic(),
			prompts: vscodeMock.showInformationMessage.mock.calls,
		}).toEqual({
			usage: { firstActive: now - 30 * day, activeDays: [today] },
			inactive: false,
			prompts: [],
		});
	});

	it('schedules the normal debounced usage check with Copilot harness attribution and the existing cooldown', async () => {
		const shown = vi.spyOn(telemetry, 'sendMSFTTelemetryEvent');
		await context.globalState.update('survey.usage', { firstActive: now - 30 * day, activeDays: [today - day] });
		await signalHarnessUsage();
		await signalHarnessUsage();
		await vi.advanceTimersByTimeAsync(3 * 60 * 1000 - 1);
		expect(vscodeMock.showInformationMessage).not.toHaveBeenCalled();
		await vi.advanceTimersByTimeAsync(1);
		await vi.advanceTimersByTimeAsync(3 * 60 * 1000);
		expect({
			shown: shown.mock.calls.filter(([event]) => event === 'survey.show'),
			promptCount: vscodeMock.showInformationMessage.mock.calls.length,
			nextSurveyDate: context.globalState.get('survey.nextSurveyDate'),
		}).toEqual({
			shown: [['survey.show', { source: 'agent.copilot', language: '', surveyType: 'usage' }, { activeDays: 2, firstActive: 30 }]],
			promptCount: 1,
			nextSurveyDate: now + 3 * 60 * 1000 + 90 * day,
		});
	});

	it('returns signal completion and propagates persistence failures to the workbench caller', async () => {
		const error = new Error('Survey state could not be saved');
		vi.spyOn(context.globalState, 'update').mockRejectedValue(error);
		await expect(signalHarnessUsage()).rejects.toBe(error);
		expect(vscodeMock.showInformationMessage).not.toHaveBeenCalled();
	});
});
