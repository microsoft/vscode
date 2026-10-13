/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as fs from 'fs';
import path from 'path';
import type { ChatParticipantDetectionResult, ChatParticipantMetadata } from 'vscode';
import '../../src/extension/intents/node/allIntents';
import { IIntentService } from '../../src/extension/intents/node/intentService';
import { ChatVariablesCollection } from '../../src/extension/prompt/common/chatVariablesCollection';
import { IntentDetector } from '../../src/extension/prompt/node/intentDetector';
import { createTelemetryWithId } from '../../src/extension/prompt/node/telemetry';
import { editingSessionAgentEditorName, editsAgentName } from '../../src/platform/chat/common/chatAgents';
import { ChatLocation } from '../../src/platform/chat/common/commonTypes';
import { ITabsAndEditorsService } from '../../src/platform/tabs/common/tabsAndEditorsService';
import { TestingServiceCollection } from '../../src/platform/test/node/services';
import { TestingTabsAndEditorsService } from '../../src/platform/test/node/simulationWorkspaceServices';
import { CancellationToken } from '../../src/util/vs/base/common/cancellation';
import { IInstantiationService } from '../../src/util/vs/platform/instantiation/common/instantiation';
import { stest } from '../base/stest';

export interface IIntentScenario {
	name: string;
	location: ChatLocation;
	query: string;
	expectedIntent: string | string[];
}

export function generateIntentTest(scenario: IIntentScenario) {
	stest({ description: scenario.name }, async (testingServiceCollection) => {
		await executeIntentTest(testingServiceCollection, scenario);
	});
}

export async function executeIntentTest(testingServiceCollection: TestingServiceCollection, scenario: IIntentScenario) {
	testingServiceCollection.define(ITabsAndEditorsService, new TestingTabsAndEditorsService({
		getActiveTextEditor: () => undefined,
		getVisibleTextEditors: () => [],
		getActiveNotebookEditor: () => undefined
	}));
	const accessor = testingServiceCollection.createTestingAccessor();
	const intentService = accessor.get(IIntentService);
	const instaService = accessor.get(IInstantiationService);
	const intentDetector = instaService.createInstance(IntentDetector);
	const query = scenario.query;
	const builtinIntents = readBuiltinIntents(scenario.location);
	const detectedIntent = await intentDetector.detectIntent(scenario.location, undefined, query, CancellationToken.None, createTelemetryWithId(), new ChatVariablesCollection([]), builtinIntents);
	const intent = detectedIntent ?? intentService.unknownIntent;

	const expectedIntents = Array.isArray(scenario.expectedIntent) ? scenario.expectedIntent : [scenario.expectedIntent];
	assert.ok(intent && expectedIntents.includes('participant' in intent ? detectedParticipantToIntentId(intent) : intent.id), `Expected intent [${expectedIntents.join(',')}] but got ${'participant' in intent ? intent.participant : intent.id}`);
}

function detectedParticipantToIntentId(detected: ChatParticipantDetectionResult) {
	switch (detected.participant) {
		case 'github.copilot.default':
			return 'unknown';
		case `github.copilot.${editingSessionAgentEditorName}`:
			if (detected.command) {
				return detected.command;
			}
			return 'unknown';
		case 'github.copilot.terminalPanel':
			return 'terminalExplain';
		case `github.copilot.${editsAgentName}`:
			switch (detected.command) {
				case 'new':
					return 'new';
				case 'newNotebook':
					return 'newNotebook';
				case 'tests':
					return 'tests';
				case 'setupTests':
					return 'setupTests';
				default:
					return 'workspace';
			}
		case 'github.copilot.vscode':
			return 'vscode';
		case 'github.copilot-dynamic.platform':
			return 'github.copilot-dynamic.platform';
	}
	throw new Error(`Unknown participant ${detected.participant} with command ${detected.command}`);
}

export function readBuiltinIntents(location: ChatLocation) {
	const packageJson = JSON.parse(fs.readFileSync(path.resolve(path.join(__dirname, '..', 'package.json'))).toString(), undefined);
	const participantMetadata: ChatParticipantMetadata[] = [];
	for (const participant of packageJson['contributes']['chatParticipants']) {
		const locationName = location === ChatLocation.Panel ? 'panel' : location === ChatLocation.Editor ? 'editor' : undefined;
		if (!locationName || !participant.locations || !participant.locations.includes(locationName)) {
			continue;
		}
		if (participant.disambiguation?.length) {
			participantMetadata.push({
				participant: participant.id, disambiguation: participant.disambiguation
			});
		}
		if (participant.commands) {
			for (const command of participant.commands) {
				if (command.disambiguation?.length) {
					participantMetadata.push({
						participant: participant.id, command: command.name, disambiguation: command.disambiguation
					});
				}
			}
		}
	}
	return participantMetadata;
}
