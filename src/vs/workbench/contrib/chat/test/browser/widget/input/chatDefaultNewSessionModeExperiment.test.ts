/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Event } from '../../../../../../../base/common/event.js';
import { constObservable } from '../../../../../../../base/common/observable.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../../base/test/common/utils.js';
import { IAssignmentService } from '../../../../../../../platform/assignment/common/assignment.js';
import { IConfigurationValue } from '../../../../../../../platform/configuration/common/configuration.js';
import { ensureDefaultNewSessionModeExperiment, isEligibleForDefaultNewSessionModeExperiment } from '../../../../browser/widget/input/chatDefaultNewSessionModeExperiment.js';
import { IChatMode, IChatModes } from '../../../../common/chatModes.js';
import { localChatSessionType } from '../../../../common/chatSessionsService.js';
import { ChatModeKind } from '../../../../common/constants.js';
import { Target } from '../../../../common/promptSyntax/promptTypes.js';

suite('chatDefaultNewSessionModeExperiment', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('requires empty local signed-in session with Plan and no explicit setting', () => {
		assert.deepStrictEqual({
			eligible: isEligibleForDefaultNewSessionModeExperiment(eligible()),
			notEmpty: isEligibleForDefaultNewSessionModeExperiment(eligible({ chatSessionIsEmpty: false })),
			notLocal: isEligibleForDefaultNewSessionModeExperiment(eligible({ sessionType: 'copilotcli' })),
			anonymous: isEligibleForDefaultNewSessionModeExperiment(eligible({ anonymous: true })),
			userValue: isEligibleForDefaultNewSessionModeExperiment(eligible({ setting: inspect({ userValue: 'agent' }) })),
			userLocalValue: isEligibleForDefaultNewSessionModeExperiment(eligible({ setting: inspect({ userLocalValue: '' }) })),
			userRemoteValue: isEligibleForDefaultNewSessionModeExperiment(eligible({ setting: inspect({ userRemoteValue: 'plan' }) })),
			workspaceValue: isEligibleForDefaultNewSessionModeExperiment(eligible({ setting: inspect({ workspaceValue: 'ask' }) })),
			workspaceFolderValue: isEligibleForDefaultNewSessionModeExperiment(eligible({ setting: inspect({ workspaceFolderValue: 'edit' }) })),
			policyValue: isEligibleForDefaultNewSessionModeExperiment(eligible({ setting: inspect({ policyValue: 'agent' }) })),
			schemaDefaultOnly: isEligibleForDefaultNewSessionModeExperiment(eligible({ setting: inspect({ defaultValue: '' }) })),
			noPlan: isEligibleForDefaultNewSessionModeExperiment(eligible({ modes: modesWithPlan(false) })),
			planByCustomName: isEligibleForDefaultNewSessionModeExperiment(eligible({ modes: modesWithCustomName('Plan') })),
		}, {
			eligible: true,
			notEmpty: false,
			notLocal: false,
			anonymous: false,
			userValue: false,
			userLocalValue: false,
			userRemoteValue: false,
			workspaceValue: false,
			workspaceFolderValue: false,
			policyValue: false,
			schemaDefaultOnly: true,
			noPlan: false,
			planByCustomName: true,
		});
	});

	test('reads TAS only once for an eligible session', async () => {
		const calls: string[] = [];
		const experimentService = fakeExperiment(calls, undefined);
		assert.deepStrictEqual({
			ineligible: await ensureDefaultNewSessionModeExperiment(experimentService, eligible({ anonymous: true })),
			eligible: await ensureDefaultNewSessionModeExperiment(experimentService, eligible()),
			again: await ensureDefaultNewSessionModeExperiment(experimentService, eligible()),
			calls,
		}, {
			ineligible: false,
			eligible: false,
			again: false,
			calls: ['chatDefaultNewSessionMode'],
		});
	});
});

function eligible(overrides: Partial<Parameters<typeof isEligibleForDefaultNewSessionModeExperiment>[0]> = {}) {
	return {
		chatSessionIsEmpty: true,
		sessionType: localChatSessionType,
		anonymous: false,
		setting: inspect(),
		modes: modesWithPlan(true),
		...overrides,
	};
}

function inspect(overrides: Partial<IConfigurationValue<string>> = {}): IConfigurationValue<string> {
	return {
		defaultValue: '',
		...overrides,
	};
}

function modesWithPlan(hasPlan: boolean): IChatModes {
	const plan = hasPlan ? fakeMode('plan', 'Plan') : undefined;
	return createModes(plan ? [plan] : []);
}

function modesWithCustomName(name: string): IChatModes {
	return createModes([fakeMode('custom.plan', name)], false);
}

function createModes(custom: IChatMode[], matchFinders = true): IChatModes {
	const find = (idOrName: string) => {
		if (!matchFinders) {
			return undefined;
		}
		const needle = idOrName.toLowerCase();
		return custom.find(mode => mode.id.toLowerCase() === needle || mode.name.get().toLowerCase() === needle);
	};
	return {
		onDidChange: Event.None,
		builtin: [],
		custom,
		findModeById: id => find(id),
		findModeByName: name => find(name),
		waitForPendingUpdates: async () => { },
	};
}

function fakeExperiment(calls: string[], value: string | undefined): IAssignmentService {
	return {
		_serviceBrand: undefined,
		onDidRefetchAssignments: Event.None,
		getTreatment: async <T extends string | number | boolean>(name: string) => {
			calls.push(name);
			return value as T | undefined;
		},
	};
}

function fakeMode(id: string, name: string): IChatMode {
	return {
		id,
		name: constObservable(name),
		label: constObservable(name),
		icon: constObservable(undefined),
		description: constObservable(undefined),
		isBuiltin: false,
		kind: ChatModeKind.Agent,
		target: constObservable(Target.Undefined),
	};
}
