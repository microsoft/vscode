/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from '../../../../../base/common/uri.js';
import { upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ConfigurationTarget, IConfigurationChangeEvent, IConfigurationOverrides, IConfigurationUpdateOptions, IConfigurationUpdateOverrides } from '../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { MockContextKeyService } from '../../../../../platform/keybinding/test/common/mockKeybindingService.js';
import { ColorScheme } from '../../../../../platform/theme/common/theme.js';
import { TestColorTheme, TestThemeService } from '../../../../../platform/theme/test/common/testThemeService.js';
import { SessionsChatBackgroundAvailableContext } from '../../../../common/contextkeys.js';
import { AGENT_SESSIONS_CHAT_BACKGROUND_IMAGE_LAYOUT_SETTING, AGENT_SESSIONS_PREFERRED_DARK_CHAT_BACKGROUND_IMAGE_SETTING, AGENT_SESSIONS_PREFERRED_LIGHT_CHAT_BACKGROUND_IMAGE_SETTING, chatBackgroundImageLayoutValues, ChatBackgroundImageLayout, ISessionsChatBackground, SessionsChatBackgroundService } from '../../browser/chatBackgroundService.js';

class CapturingConfigurationService extends TestConfigurationService {
	readonly updates: { key: string; value: unknown; target: ConfigurationTarget | undefined }[] = [];

	override updateValue(key: string, value: unknown): Promise<void>;
	override updateValue(key: string, value: unknown, target: ConfigurationTarget): Promise<void>;
	override updateValue(key: string, value: unknown, overrides: IConfigurationOverrides | IConfigurationUpdateOverrides): Promise<void>;
	override updateValue(key: string, value: unknown, overrides: IConfigurationOverrides | IConfigurationUpdateOverrides, target: ConfigurationTarget, options?: IConfigurationUpdateOptions): Promise<void>;
	override updateValue(key: string, value: unknown, arg3?: ConfigurationTarget | IConfigurationOverrides | IConfigurationUpdateOverrides, target?: ConfigurationTarget): Promise<void> {
		this.updates.push({ key, value, target: typeof arg3 === 'number' ? arg3 : target });
		return Promise.resolve();
	}
}

function fireConfigurationChange(configurationService: TestConfigurationService, setting: string): void {
	configurationService.onDidChangeConfigurationEmitter.fire(upcastPartial<IConfigurationChangeEvent>({
		affectsConfiguration: key => key === setting,
	}));
}

suite('Sessions Chat Background Service', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('does not return a background without a configured image', () => {
		const service = disposables.add(new SessionsChatBackgroundService(new TestConfigurationService(), new TestThemeService(), disposables.add(new MockContextKeyService())));

		assert.deepStrictEqual({
			background: service.getBackground(),
			image: service.getConfiguredBackgroundImage(),
		}, {
			background: undefined,
			image: undefined,
		});
	});

	test('resolves the background for the active color theme and emits changes', async () => {
		const configurationService = new TestConfigurationService({
			[AGENT_SESSIONS_PREFERRED_DARK_CHAT_BACKGROUND_IMAGE_SETTING]: URI.file('/textures/dark.png').fsPath,
			[AGENT_SESSIONS_PREFERRED_LIGHT_CHAT_BACKGROUND_IMAGE_SETTING]: URI.file('/textures/light.png').fsPath,
			[AGENT_SESSIONS_CHAT_BACKGROUND_IMAGE_LAYOUT_SETTING]: 'center',
		});
		const themeService = new TestThemeService();
		const contextKeyService = disposables.add(new MockContextKeyService());
		const service = disposables.add(new SessionsChatBackgroundService(configurationService, themeService, contextKeyService));
		let changes = 0;
		disposables.add(service.onDidChangeBackground(() => changes++));

		const darkBackground = service.getBackground();
		const dark = {
			image: service.getConfiguredBackgroundImage()?.path.endsWith('dark.png'),
			cssImage: !!darkBackground?.backgroundImage,
			repeat: darkBackground?.backgroundRepeat,
			size: darkBackground?.backgroundSize,
			position: darkBackground?.backgroundPosition,
			available: contextKeyService.getContextKeyValue(SessionsChatBackgroundAvailableContext.key),
		};
		themeService.setTheme(new TestColorTheme({}, ColorScheme.LIGHT));
		const lightBackground = service.getBackground();
		const light = {
			image: service.getConfiguredBackgroundImage()?.path.endsWith('light.png'),
			cssImage: !!lightBackground?.backgroundImage,
			repeat: lightBackground?.backgroundRepeat,
			size: lightBackground?.backgroundSize,
			position: lightBackground?.backgroundPosition,
			available: contextKeyService.getContextKeyValue(SessionsChatBackgroundAvailableContext.key),
		};
		themeService.setTheme(new TestColorTheme({}, ColorScheme.HIGH_CONTRAST_DARK));
		const highContrast = {
			background: service.getBackground(),
			available: contextKeyService.getContextKeyValue(SessionsChatBackgroundAvailableContext.key),
		};
		themeService.setTheme(new TestColorTheme({}, ColorScheme.DARK));
		const restoredAvailability = contextKeyService.getContextKeyValue(SessionsChatBackgroundAvailableContext.key);
		await configurationService.setUserConfiguration(AGENT_SESSIONS_PREFERRED_DARK_CHAT_BACKGROUND_IMAGE_SETTING, 'https://example.com/texture.png');
		fireConfigurationChange(configurationService, AGENT_SESSIONS_PREFERRED_DARK_CHAT_BACKGROUND_IMAGE_SETTING);

		assert.deepStrictEqual({
			dark,
			light,
			highContrast,
			unsupportedUri: service.getBackground(),
			restoredAvailability,
			changes,
		}, {
			dark: { image: true, cssImage: true, repeat: 'no-repeat', size: 'auto', position: 'center center', available: true },
			light: { image: true, cssImage: true, repeat: 'no-repeat', size: 'auto', position: 'center center', available: true },
			highContrast: { background: undefined, available: false },
			unsupportedUri: undefined,
			restoredAvailability: true,
			changes: 4,
		});
	});

	test('returns every configured image layout', async () => {
		const configurationService = new TestConfigurationService({
			[AGENT_SESSIONS_PREFERRED_DARK_CHAT_BACKGROUND_IMAGE_SETTING]: URI.file('/textures/kirby.png').fsPath,
			[AGENT_SESSIONS_CHAT_BACKGROUND_IMAGE_LAYOUT_SETTING]: 'repeat',
		});
		const service = disposables.add(new SessionsChatBackgroundService(configurationService, new TestThemeService(), disposables.add(new MockContextKeyService())));
		const actual: Partial<Record<ChatBackgroundImageLayout, Omit<ISessionsChatBackground, 'backgroundImage'> | undefined>> = {};

		for (const layout of chatBackgroundImageLayoutValues) {
			await configurationService.setUserConfiguration(AGENT_SESSIONS_CHAT_BACKGROUND_IMAGE_LAYOUT_SETTING, layout);
			fireConfigurationChange(configurationService, AGENT_SESSIONS_CHAT_BACKGROUND_IMAGE_LAYOUT_SETTING);
			const background = service.getBackground();
			if (background) {
				actual[layout] = {
					backgroundRepeat: background.backgroundRepeat,
					backgroundSize: background.backgroundSize,
					backgroundPosition: background.backgroundPosition,
				};
			}
		}

		assert.deepStrictEqual(actual, {
			repeat: { backgroundRepeat: 'repeat', backgroundSize: 'auto', backgroundPosition: 'left top' },
			stretch: { backgroundRepeat: 'no-repeat', backgroundSize: '100% 100%', backgroundPosition: 'center center' },
			center: { backgroundRepeat: 'no-repeat', backgroundSize: 'auto', backgroundPosition: 'center center' },
			top: { backgroundRepeat: 'no-repeat', backgroundSize: 'auto', backgroundPosition: 'center top' },
			'top-right': { backgroundRepeat: 'no-repeat', backgroundSize: 'auto', backgroundPosition: 'right top' },
			'top-left': { backgroundRepeat: 'no-repeat', backgroundSize: 'auto', backgroundPosition: 'left top' },
			bottom: { backgroundRepeat: 'no-repeat', backgroundSize: 'auto', backgroundPosition: 'center bottom' },
			'bottom-right': { backgroundRepeat: 'no-repeat', backgroundSize: 'auto', backgroundPosition: 'right bottom' },
			'bottom-left': { backgroundRepeat: 'no-repeat', backgroundSize: 'auto', backgroundPosition: 'left bottom' },
			left: { backgroundRepeat: 'no-repeat', backgroundSize: 'auto', backgroundPosition: 'left center' },
			right: { backgroundRepeat: 'no-repeat', backgroundSize: 'auto', backgroundPosition: 'right center' },
		});
	});

	test('stores an image for the active color theme', async () => {
		const image = URI.file('/textures/kirby.png');
		const configurationService = new CapturingConfigurationService();
		const themeService = new TestThemeService();
		const service = disposables.add(new SessionsChatBackgroundService(configurationService, themeService, disposables.add(new MockContextKeyService())));

		await service.setBackgroundImage(image);
		themeService.setTheme(new TestColorTheme({}, ColorScheme.LIGHT));
		await service.setBackgroundImage(image);

		assert.deepStrictEqual(configurationService.updates, [{
			key: AGENT_SESSIONS_PREFERRED_DARK_CHAT_BACKGROUND_IMAGE_SETTING,
			value: image.toString(),
			target: ConfigurationTarget.USER,
		}, {
			key: AGENT_SESSIONS_PREFERRED_LIGHT_CHAT_BACKGROUND_IMAGE_SETTING,
			value: image.toString(),
			target: ConfigurationTarget.USER,
		}]);
	});
});
