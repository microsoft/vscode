/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { toDisposable } from '../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../base/common/uri.js';
import { upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IConfigurationChangeEvent, IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ILogService, NullLogService } from '../../../../../platform/log/common/log.js';
import { ColorScheme } from '../../../../../platform/theme/common/theme.js';
import { IThemeService } from '../../../../../platform/theme/common/themeService.js';
import { TestColorTheme, TestThemeService } from '../../../../../platform/theme/test/common/testThemeService.js';
import { IUserDataProfile, IUserDataProfilesService } from '../../../../../platform/userDataProfile/common/userDataProfile.js';
import { ILanguageModelToolsService, IToolData, IToolImpl } from '../../../../../workbench/contrib/chat/common/tools/languageModelToolsService.js';
import { IUserDataProfileService } from '../../../../../workbench/services/userDataProfile/common/userDataProfile.js';
import { ISessionsChatBackgroundService } from '../../../../services/chatBackground/browser/chatBackgroundService.js';
import { ISessionsManagementService } from '../../../../services/sessions/common/sessionsManagement.js';
import { SetChatBackgroundToolContribution } from '../../electron-browser/chatBackgroundTool.contribution.js';
import { AGENT_SESSIONS_APPEARANCE_TOOLS_ENABLED_SETTING } from '../../common/constants.js';

suite('Sessions - Chat background tool contribution', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('gates registration without recreating the tool and preserves it across theme changes', async () => {
		const instantiationService = disposables.add(new TestInstantiationService());
		const themeService = new TestThemeService(new TestColorTheme({ 'agents.background': '#121314' }));
		instantiationService.stub(IThemeService, themeService);
		const configuration = new TestConfigurationService({ [AGENT_SESSIONS_APPEARANCE_TOOLS_ENABLED_SETTING]: false });
		disposables.add(configuration.onDidChangeConfigurationEmitter);
		instantiationService.stub(IConfigurationService, configuration);
		instantiationService.stub(ISessionsChatBackgroundService, {});
		instantiationService.stub(ISessionsManagementService, {});
		instantiationService.stub(IFileService, {});
		instantiationService.stub(ILogService, new NullLogService());
		const profile = upcastPartial<IUserDataProfile>({ id: 'test', globalStorageHome: URI.file('/storage') });
		instantiationService.stub(IUserDataProfilesService, { defaultProfile: profile });
		instantiationService.stub(IUserDataProfileService, { currentProfile: profile });

		const registrations: { data: IToolData; tool: IToolImpl }[] = [];
		let registered = false;
		let disposed = 0;
		instantiationService.stub(ILanguageModelToolsService, {
			registerTool: (data, tool) => {
				assert.strictEqual(registered, false, 'The previous registration must be removed first.');
				registrations.push({ data, tool });
				registered = true;
				return toDisposable(() => {
					registered = false;
					disposed++;
				});
			},
		});
		const contribution = disposables.add(instantiationService.createInstance(SetChatBackgroundToolContribution));
		const initiallyRegistered = registered;
		const setEnabled = async (value: boolean) => {
			await configuration.setUserConfiguration(AGENT_SESSIONS_APPEARANCE_TOOLS_ENABLED_SETTING, value);
			configuration.onDidChangeConfigurationEmitter.fire(upcastPartial<IConfigurationChangeEvent>({
				affectsConfiguration: key => key === AGENT_SESSIONS_APPEARANCE_TOOLS_ENABLED_SETTING,
			}));
		};
		await setEnabled(true);

		themeService.setTheme(new TestColorTheme({ 'agents.background': '#121314', 'editor.background': '#ff0000' }));
		themeService.setTheme(new TestColorTheme({ 'agents.background': '#223344' }));
		themeService.setTheme(new TestColorTheme({ 'agents.background': '#eeeeee' }, ColorScheme.LIGHT));
		themeService.setTheme(new TestColorTheme({ 'agents.background': '#000000' }, ColorScheme.HIGH_CONTRAST_DARK));
		const registrationsAfterThemeChange = registrations.length;
		await setEnabled(false);
		const registeredWhileDisabled = registered;
		await setEnabled(true);
		contribution.dispose();
		await setEnabled(false);
		await setEnabled(true);
		themeService.setTheme(new TestColorTheme({ 'agents.background': '#ffffff' }, ColorScheme.LIGHT));

		assert.deepStrictEqual({
			initiallyRegistered,
			registrationsAfterThemeChange,
			registeredWhileDisabled,
			registrations: registrations.length,
			sameTool: registrations[0].tool === registrations[1].tool,
			registered,
			disposed,
		}, {
			initiallyRegistered: false,
			registrationsAfterThemeChange: 1,
			registeredWhileDisabled: false,
			registrations: 2,
			sameTool: true,
			registered: false,
			disposed: 2,
		});
	});
});
