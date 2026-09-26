/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IKeybindingService } from '../../../../../platform/keybinding/common/keybinding.js';
import { getDictationContextMenuActions, getVoiceModeContextMenuActions } from '../../browser/speechToText/micButtonMenuActions.js';

suite('Mic button menu actions', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	const commandService = upcastPartial<ICommandService>({});
	const keybindingService = upcastPartial<IKeybindingService>({});

	test('groups and shortens Voice Mode actions', () => {
		const configurationService = upcastPartial<IConfigurationService>({ getValue: () => true, updateValue: async () => { } });
		const actions = getVoiceModeContextMenuActions(commandService, configurationService, keybindingService, 'voice.start');

		assert.deepStrictEqual(actions.map(action => action.label), [
			'Configure Keybinding',
			'Voice Mode Button',
			'Show Transcript',
			'Disable',
			'',
			'Open Settings',
			'Configure Instructions',
			'Show Introduction',
			'Select Microphone',
		]);
	});

	test('Voice Mode "Show Transcript" toggle reflects and flips the transcript setting', async () => {
		const updated: [string, unknown][] = [];
		const configurationService = upcastPartial<IConfigurationService>({
			getValue: () => false,
			updateValue: async (key: string, value: unknown) => { updated.push([key, value]); },
		});
		const actions = getVoiceModeContextMenuActions(commandService, configurationService, keybindingService, 'voice.start');
		const toggle = actions.find(action => action.label === 'Show Transcript')!;

		assert.deepStrictEqual({ checked: toggle.checked, updatedBeforeRun: updated }, { checked: false, updatedBeforeRun: [] });
		await toggle.run();
		assert.deepStrictEqual(updated, [['agents.voice.showTranscript', true]]);
	});

	test('Voice Mode button toggle reflects and flips the visibility setting', async () => {
		const updated: [string, unknown][] = [];
		const configurationService = upcastPartial<IConfigurationService>({
			getValue: () => false,
			updateValue: async (key: string, value: unknown) => { updated.push([key, value]); },
		});
		const actions = getVoiceModeContextMenuActions(commandService, configurationService, keybindingService, 'voice.start');
		const toggle = actions.find(action => action.label === 'Voice Mode Button')!;

		assert.deepStrictEqual({ checked: toggle.checked, updatedBeforeRun: updated }, { checked: false, updatedBeforeRun: [] });
		await toggle.run();
		assert.deepStrictEqual(updated, [['agents.voice.showButton', true]]);
	});

	test('groups and shortens dictation actions', () => {
		const configurationService = upcastPartial<IConfigurationService>({ getValue: () => true, updateValue: async () => { } });
		const actions = getDictationContextMenuActions(commandService, configurationService, keybindingService, 'dictation.start');

		assert.deepStrictEqual(actions.map(action => action.label), [
			'Configure Keybinding',
			'Microphone Button',
			'Disable',
			'',
			'Open Settings',
			'Configure Instructions',
			'Show Introduction',
			'Select Microphone',
		]);
	});

	test('dictation "Microphone Button" toggle reflects and flips the visibility setting', async () => {
		const updated: [string, unknown][] = [];
		const configurationService = upcastPartial<IConfigurationService>({
			getValue: () => false,
			updateValue: async (key: string, value: unknown) => { updated.push([key, value]); },
		});
		const actions = getDictationContextMenuActions(commandService, configurationService, keybindingService, 'dictation.start');
		const toggle = actions.find(action => action.label === 'Microphone Button')!;

		assert.strictEqual(toggle.checked, false);
		await toggle.run();
		assert.deepStrictEqual(updated, [['dictation.showButton', true]]);
	});
});
