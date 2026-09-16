/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { CommandsRegistry } from '../../../../../platform/commands/common/commands.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ColorScheme } from '../../../../../platform/theme/common/theme.js';
import { IThemeService } from '../../../../../platform/theme/common/themeService.js';
import { TestColorTheme, TestThemeService } from '../../../../../platform/theme/test/common/testThemeService.js';
import { APPLY_CODICONS_CHAT_BACKGROUND_TRYOUT_COMMAND_ID } from '../../../../../workbench/contrib/chat/common/onboarding/chatBackgroundTryout.js';
import { ISessionsChatBackgroundService, SessionsChatBackgroundPreset } from '../../../../services/chatBackground/browser/chatBackgroundService.js';
import '../../browser/chatBackgroundTryout.js';

suite('Codicons chat background tryout command', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('applies the Codicons preset', async () => {
		const instantiationService = disposables.add(new TestInstantiationService());
		const backgrounds: SessionsChatBackgroundPreset[] = [];
		instantiationService.stub(IThemeService, new TestThemeService());
		instantiationService.stub(ISessionsChatBackgroundService, {
			setBackground: async background => {
				if (typeof background === 'string') {
					backgrounds.push(background);
				}
			},
		});
		const command = CommandsRegistry.getCommand(APPLY_CODICONS_CHAT_BACKGROUND_TRYOUT_COMMAND_ID);
		assert.ok(command);

		await instantiationService.invokeFunction(accessor => command.handler(accessor));

		assert.deepStrictEqual(backgrounds, ['codicons']);
	});

	test('does not change the background in high contrast themes', async () => {
		const instantiationService = disposables.add(new TestInstantiationService());
		const backgrounds: SessionsChatBackgroundPreset[] = [];
		instantiationService.stub(IThemeService, new TestThemeService(new TestColorTheme({}, ColorScheme.HIGH_CONTRAST_DARK)));
		instantiationService.stub(ISessionsChatBackgroundService, {
			setBackground: async background => {
				if (typeof background === 'string') {
					backgrounds.push(background);
				}
			},
		});
		const command = CommandsRegistry.getCommand(APPLY_CODICONS_CHAT_BACKGROUND_TRYOUT_COMMAND_ID);
		assert.ok(command);

		let errorMessage: string | undefined;
		try {
			await instantiationService.invokeFunction(accessor => command.handler(accessor));
		} catch (error) {
			errorMessage = error instanceof Error ? error.message : String(error);
		}

		assert.deepStrictEqual({
			backgrounds,
			errorMessage,
		}, {
			backgrounds: [],
			errorMessage: 'Chat backgrounds are unavailable while a high contrast theme is active.',
		});
	});
});
