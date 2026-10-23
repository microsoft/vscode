/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ISpotlightStep } from '../../../../../workbench/contrib/onboarding/browser/spotlight/spotlightTypes.js';
import { GetStartedItemId } from '../../common/getStartedChecklist.js';
import { createGetStartedTourSteps, IGetStartedTourContext, IGetStartedTourNavigation } from '../../browser/getStartedTours.js';

suite('GetStartedTours', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	function createContext(context: Partial<IGetStartedTourContext> = {}, calls: string[] = []): IGetStartedTourContext {
		const record = (name: keyof IGetStartedTourNavigation) => async () => { calls.push(name); };
		return {
			onNewSessionView: false,
			suggestedProjects: [],
			navigation: {
				showSessionsList: record('showSessionsList'),
				showNewSession: record('showNewSession'),
				showSessionWithChanges: record('showSessionWithChanges'),
				showChanges: record('showChanges'),
				showAutomations: record('showAutomations'),
			},
			...context,
		};
	}

	function describeSteps(steps: readonly ISpotlightStep[]): string[] {
		return steps.map(step => `${step.id}: ${step.targetId}`);
	}

	function descriptions(steps: readonly ISpotlightStep[]): string[] {
		return steps.map(step => typeof step.description === 'string' ? step.description : step.description.value);
	}

	const currentProject = { label: 'vscode', targetId: 'sessions.section.workspace:vscode' };

	test('each tour shows the controls of its item, adapted to where the user is', () => {
		const steps = (item: GetStartedItemId, context?: Partial<IGetStartedTourContext>) => describeSteps(createGetStartedTourSteps(item, createContext(context)));
		assert.deepStrictEqual({
			startSession: steps(GetStartedItemId.StartSession),
			startSessionFromNewSession: steps(GetStartedItemId.StartSession, { onNewSessionView: true }),
			runInParallel: steps(GetStartedItemId.RunInParallel),
			runInParallelFromNewSession: steps(GetStartedItemId.RunInParallel, { onNewSessionView: true }),
			secondProject: steps(GetStartedItemId.SecondProject, { currentProject }),
			secondProjectWithoutSessions: steps(GetStartedItemId.SecondProject),
			keepChanges: steps(GetStartedItemId.KeepChanges, { sessionWithChanges: { fileCount: 3 } }),
			keepChangesWithoutChanges: steps(GetStartedItemId.KeepChanges),
			automation: steps(GetStartedItemId.Automation),
		}, {
			startSession: ['prompt: sessions.newSession.input', 'workspacePicker: sessions.newSession.workspacePicker'],
			startSessionFromNewSession: ['prompt: sessions.newSession.input', 'workspacePicker: sessions.newSession.workspacePicker'],
			runInParallel: ['newSession: sessions.newSession.button', 'isolation: sessions.newSession.isolation', 'prompt: sessions.newSession.input'],
			runInParallelFromNewSession: ['isolation: sessions.newSession.isolation', 'prompt: sessions.newSession.input'],
			secondProject: ['currentProject: sessions.section.workspace:vscode', 'workspacePicker: sessions.newSession.workspacePicker'],
			secondProjectWithoutSessions: ['workspacePicker: sessions.newSession.workspacePicker'],
			keepChanges: ['changesPill: chat.changesPill', 'changesEditor: sessions.getStarted.changesEditor', 'keepChanges: sessions.changes.actions'],
			keepChangesWithoutChanges: ['newSession: sessions.newSession.button', 'prompt: sessions.newSession.input'],
			automation: ['automations: sessions.automations.entry', 'templates: sessions.automations.templates', 'createAutomation: sessions.automations.create'],
		});
	});

	test('the second-project tour names the current project and up to two other recent projects', () => {
		const secondProject = (context: Partial<IGetStartedTourContext>) => descriptions(createGetStartedTourSteps(GetStartedItemId.SecondProject, createContext(context)));
		assert.deepStrictEqual({
			twoProjects: secondProject({ currentProject: { label: 'my_app', targetId: 'row' }, suggestedProjects: ['api', '*docs*'] }),
			oneProject: secondProject({ suggestedProjects: ['api'] }),
			noProjects: secondProject({}),
		}, {
			twoProjects: [
				'You\'ve worked in **my\\_app** from this window. The sessions of every project you work on show up in this list.',
				'You can work on **api** or **\\*docs\\*** from here too, without opening another window.',
			],
			oneProject: ['You can work on **api** from here too, without opening another window.'],
			noProjects: ['Pick any folder or repository for your next session, without opening another window.'],
		});
	});

	test('the keep-changes tour counts the changed files', () => {
		const keepChanges = (fileCount: number) => descriptions(createGetStartedTourSteps(GetStartedItemId.KeepChanges, createContext({ sessionWithChanges: { fileCount } })))[0];
		assert.deepStrictEqual([keepChanges(1), keepChanges(4)], [
			'This session changed 1 file. Select the changes to review them.',
			'This session changed 4 files. Select the changes to review them.',
		]);
	});

	test('each step moves the window to its control, and steps the user acts on advance when used', async () => {
		async function walk(item: GetStartedItemId, context: Partial<IGetStartedTourContext> = {}) {
			const calls: string[] = [];
			const result: string[] = [];
			for (const step of createGetStartedTourSteps(item, createContext(context, calls))) {
				calls.length = 0;
				await step.onBeforeShow?.();
				const behavior = [
					step.openTarget ? 'opens' : undefined,
					step.advanceOnTargetClick ? 'advancesOnClick' : undefined,
					step.advanceOnTargetSelection ? 'advancesOnSelection' : undefined,
					step.allowTargetInteraction ? 'interactive' : undefined,
				].filter(value => !!value);
				result.push(`${step.id}: ${[...calls, ...behavior].join(', ')}`);
			}
			return result;
		}
		assert.deepStrictEqual({
			startSession: await walk(GetStartedItemId.StartSession),
			runInParallel: await walk(GetStartedItemId.RunInParallel),
			secondProject: await walk(GetStartedItemId.SecondProject, { currentProject }),
			keepChanges: await walk(GetStartedItemId.KeepChanges, { sessionWithChanges: { fileCount: 2 } }),
			automation: await walk(GetStartedItemId.Automation),
		}, {
			startSession: [
				'prompt: showNewSession, interactive',
				'workspacePicker: showNewSession, advancesOnSelection, interactive',
			],
			runInParallel: [
				'newSession: showSessionsList, advancesOnClick, interactive',
				'isolation: showNewSession, interactive',
				'prompt: showNewSession, advancesOnClick, interactive',
			],
			secondProject: [
				'currentProject: showSessionsList',
				'workspacePicker: showNewSession, opens, advancesOnSelection, interactive',
			],
			keepChanges: [
				'changesPill: showSessionWithChanges, advancesOnClick, interactive',
				'changesEditor: showChanges, interactive',
				'keepChanges: advancesOnClick, interactive',
			],
			automation: [
				'automations: showSessionsList, advancesOnClick, interactive',
				'templates: showAutomations, opens',
				'createAutomation: showAutomations, advancesOnClick, interactive',
			],
		});
	});
});
