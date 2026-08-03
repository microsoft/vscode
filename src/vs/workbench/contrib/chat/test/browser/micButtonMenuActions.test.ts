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
	const configurationService = upcastPartial<IConfigurationService>({});
	const keybindingService = upcastPartial<IKeybindingService>({});

	test('groups and shortens Voice Mode actions', () => {
		const actions = getVoiceModeContextMenuActions(commandService, configurationService, keybindingService, 'voice.start');

		assert.deepStrictEqual(actions.map(action => action.label), [
			'Configure Keybinding',
			'Disable',
			'',
			'Open Settings',
			'Configure Instructions',
			'Show Introduction',
			'Select Microphone',
		]);
	});

	test('groups and shortens dictation actions', () => {
		const actions = getDictationContextMenuActions(commandService, configurationService, keybindingService, 'dictation.start');

		assert.deepStrictEqual(actions.map(action => action.label), [
			'Configure Keybinding',
			'Disable',
			'',
			'Open Settings',
			'Configure Instructions',
			'Show Introduction',
			'Select Microphone',
		]);
	});
});
