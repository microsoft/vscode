/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { Color } from '../../../../../base/common/color.js';
import { isCancellationError } from '../../../../../base/common/errors.js';
import { toDisposable } from '../../../../../base/common/lifecycle.js';
import { upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IConfigurationChangeEvent, IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { ContextKeyService } from '../../../../../platform/contextkey/browser/contextKeyService.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ColorScheme } from '../../../../../platform/theme/common/theme.js';
import { IThemeService } from '../../../../../platform/theme/common/themeService.js';
import { TestColorTheme, TestThemeService } from '../../../../../platform/theme/test/common/testThemeService.js';
import { IsSessionsWindowContext } from '../../../../../workbench/common/contextkeys.js';
import { ChatContextKeys } from '../../../../../workbench/contrib/chat/common/actions/chatContextKeys.js';
import { ILanguageModelToolsService, IToolImpl } from '../../../../../workbench/contrib/chat/common/tools/languageModelToolsService.js';
import { ColorThemeData } from '../../../../../workbench/services/themes/common/colorThemeData.js';
import { GetThemeColorsTool, GetThemeColorsToolContribution, GetThemeColorsToolId } from '../../browser/getThemeColorsTool.js';
import { AGENT_SESSIONS_APPEARANCE_TOOLS_ENABLED_SETTING } from '../../common/constants.js';

interface IThemePalette {
	readonly theme: { readonly name: string; readonly colorScheme: ColorScheme; readonly isHighContrast: boolean };
	readonly colors: Record<string, { readonly id: string; readonly value: string | null }>;
}

const expectedColors = {
	windowBackground: { id: 'agents.background', value: '#121314' },
	windowForeground: { id: 'foreground', value: '#bfbfbf' },
	chatBackground: { id: 'activeSessionView.background', value: '#191a1b' },
	chatForeground: { id: 'activeSessionView.foreground', value: '#aabbcc' },
	sidebarBackground: { id: 'agents.background', value: '#121314' },
	sidebarForeground: { id: 'sideBar.foreground', value: '#ddeeff' },
	editorBackground: { id: 'editor.background', value: '#242526' },
	editorForeground: { id: 'editor.foreground', value: '#eeeeee' },
	inputBackground: { id: 'agentsChatInput.background', value: '#202122' },
	inputForeground: { id: 'agentsChatInput.foreground', value: '#ccddee' },
	secondaryForeground: { id: 'descriptionForeground', value: '#8c8c8c' },
	linkForeground: { id: 'textLink.foreground', value: '#48a0c7' },
	accent: { id: 'button.background', value: '#297aa0' },
	accentForeground: { id: 'button.foreground', value: '#ffffff' },
	border: { id: 'agentsPanel.border', value: '#303132' },
	focusBorder: { id: 'focusBorder', value: '#7abbee' },
	inputBorder: { id: 'agentsChatInput.border', value: '#414243' },
	inputFocusBorder: { id: 'agentsChatInput.focusBorder', value: '#72aabb' },
};

async function readPalette(tool: IToolImpl, token = CancellationToken.None): Promise<IThemePalette> {
	const result = await tool.invoke({ toolId: GetThemeColorsToolId, callId: 'palette', parameters: {}, context: undefined }, async () => 0, { report: () => { } }, token);
	const part = result.content[0];
	assert.ok(part?.kind === 'text' && !result.toolResultError);
	return JSON.parse(part.value);
}

suite('Sessions - Get Theme Colors tool', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	function createTool(themeService: IThemeService = new TestThemeService(), configuration = new TestConfigurationService({ [AGENT_SESSIONS_APPEARANCE_TOOLS_ENABLED_SETTING]: true })) {
		disposables.add(configuration.onDidChangeConfigurationEmitter);
		return new GetThemeColorsTool(themeService, configuration);
	}

	for (const [colorScheme, isHighContrast] of [
		[ColorScheme.DARK, false],
		[ColorScheme.LIGHT, false],
		[ColorScheme.HIGH_CONTRAST_DARK, true],
		[ColorScheme.HIGH_CONTRAST_LIGHT, true],
	] as const) {
		test(`reads prominent color roles and token IDs in ${colorScheme}`, async () => {
			const colors = {
				...Object.fromEntries(Object.values(expectedColors).map(({ id, value }) => [id, value])),
				'sideBar.background': '#ff00ff',
			};
			const tool = createTool(new TestThemeService(new TestColorTheme(colors, colorScheme)));

			assert.deepStrictEqual(await readPalette(tool), {
				theme: { name: 'test', colorScheme, isHighContrast },
				colors: expectedColors,
			});
		});
	}

	test('takes a fresh effective-theme snapshot including customizations and transient tinting', async () => {
		const theme = ColorThemeData.createUnloadedThemeForThemeType(ColorScheme.DARK, {
			'agents.background': '#101112',
			'activeSessionView.background': '#18191a',
		});
		theme.label = 'Custom Night';
		theme.setCustomColors({ 'agents.background': '#202122', 'activeSessionView.background': '#252627' });
		const themeService = new TestThemeService(theme);
		const tool = createTool(themeService);
		const toolData = tool.getToolData();
		const customized = await readPalette(tool);
		theme.setTransientColors({ 'agents.background': Color.fromHex('#303132'), 'activeSessionView.background': Color.fromHex('#353637') });
		const tinted = await readPalette(tool);
		theme.setTransientColors(undefined);
		const restored = await readPalette(tool);
		themeService.setTheme(new TestColorTheme({ 'agents.background': '#ffffff', 'activeSessionView.background': '#eeeeee' }, ColorScheme.LIGHT));
		const light = await readPalette(tool);

		assert.deepStrictEqual({
			snapshots: [customized, tinted, restored, light].map(snapshot => ({
				name: snapshot.theme.name,
				colorScheme: snapshot.theme.colorScheme,
				window: snapshot.colors.windowBackground.value,
				chat: snapshot.colors.chatBackground.value,
			})),
			staticDescription: tool.getToolData().modelDescription === toolData.modelDescription,
		}, {
			snapshots: [
				{ name: 'Custom Night', colorScheme: 'dark', window: '#202122', chat: '#252627' },
				{ name: 'Custom Night', colorScheme: 'dark', window: '#303132', chat: '#353637' },
				{ name: 'Custom Night', colorScheme: 'dark', window: '#202122', chat: '#252627' },
				{ name: 'test', colorScheme: 'light', window: '#ffffff', chat: '#eeeeee' },
			],
			staticDescription: true,
		});
	});

	test('preserves alpha and explicitly reports missing colors', async () => {
		const tool = createTool(new TestThemeService(new TestColorTheme({
			'agentsPanel.border': '#11223380',
			'agentsChatInput.border': '#00000000',
		})));
		const result = await readPalette(tool);

		assert.deepStrictEqual(result.colors, {
			...Object.fromEntries(Object.entries(expectedColors).map(([role, { id }]) => [role, { id, value: null }])),
			border: { id: 'agentsPanel.border', value: '#11223380' },
			inputBorder: { id: 'agentsChatInput.border', value: '#00000000' },
		});
	});

	test('does not read a palette for a cancelled invocation', async () => {
		await assert.rejects(readPalette(createTool(), CancellationToken.Cancelled), isCancellationError);
	});

	test('rejects a stale invocation before reading theme colors when disabled', async () => {
		const configuration = new TestConfigurationService({ [AGENT_SESSIONS_APPEARANCE_TOOLS_ENABLED_SETTING]: false });
		const tool = createTool(upcastPartial<IThemeService>({
			getColorTheme: () => { throw new Error('A disabled tool must not read the theme.'); },
		}), configuration);

		await assert.rejects(readPalette(tool), {
			message: `Appearance tools are disabled by ${AGENT_SESSIONS_APPEARANCE_TOOLS_ENABLED_SETTING}.`,
		});
	});

	test('is available only when the feature and AI are enabled in the Agents window', async () => {
		const configuration = new TestConfigurationService({ [AGENT_SESSIONS_APPEARANCE_TOOLS_ENABLED_SETTING]: true });
		disposables.add(configuration.onDidChangeConfigurationEmitter);
		const context = disposables.add(new ContextKeyService(configuration));
		const enabled = ChatContextKeys.enabled.bindTo(context);
		const sessionsWindow = IsSessionsWindowContext.bindTo(context);
		const data = createTool().getToolData();
		const available = [[false, false], [true, false], [false, true], [true, true]].map(([ai, sessions]) => {
			enabled.set(ai);
			sessionsWindow.set(sessions);
			return context.contextMatchesRules(data.when);
		});
		await configuration.setUserConfiguration(AGENT_SESSIONS_APPEARANCE_TOOLS_ENABLED_SETTING, false);
		configuration.onDidChangeConfigurationEmitter.fire(upcastPartial<IConfigurationChangeEvent>({
			affectsConfiguration: key => key === AGENT_SESSIONS_APPEARANCE_TOOLS_ENABLED_SETTING,
			affectedKeys: new Set([AGENT_SESSIONS_APPEARANCE_TOOLS_ENABLED_SETTING]),
		}));
		available.push(context.contextMatchesRules(data.when));

		assert.deepStrictEqual({ available, clientSide: data.runsInWorkspace === false, deferred: data.agentHostPreferences?.defer }, {
			available: [false, false, false, true, false],
			clientSide: true,
			deferred: 'auto',
		});
	});

	test('updates registration on setting changes and removes it on disposal', async () => {
		const instantiationService = disposables.add(new TestInstantiationService());
		instantiationService.stub(IThemeService, new TestThemeService());
		const configuration = new TestConfigurationService({ [AGENT_SESSIONS_APPEARANCE_TOOLS_ENABLED_SETTING]: false });
		disposables.add(configuration.onDidChangeConfigurationEmitter);
		instantiationService.stub(IConfigurationService, configuration);
		const tools = new Map<string, IToolImpl>();
		instantiationService.stub(ILanguageModelToolsService, {
			registerTool: (data, tool) => {
				tools.set(data.id, tool);
				return toDisposable(() => tools.delete(data.id));
			},
		});
		const contribution = disposables.add(instantiationService.createInstance(GetThemeColorsToolContribution));
		const registrationCounts = [tools.size];
		const setEnabled = async (value: boolean) => {
			await configuration.setUserConfiguration(AGENT_SESSIONS_APPEARANCE_TOOLS_ENABLED_SETTING, value);
			configuration.onDidChangeConfigurationEmitter.fire(upcastPartial<IConfigurationChangeEvent>({
				affectsConfiguration: key => key === AGENT_SESSIONS_APPEARANCE_TOOLS_ENABLED_SETTING,
			}));
			registrationCounts.push(tools.size);
		};
		await setEnabled(true);
		const tool = tools.get(GetThemeColorsToolId);
		assert.ok(tool);
		const palette = await readPalette(tool);
		await setEnabled(false);
		await setEnabled(true);
		const sameTool = tools.get(GetThemeColorsToolId) === tool;
		contribution.dispose();
		await setEnabled(false);
		await setEnabled(true);

		assert.deepStrictEqual({ theme: palette.theme, registrationCounts, sameTool }, {
			theme: { name: 'test', colorScheme: 'dark', isHighContrast: false },
			registrationCounts: [0, 1, 0, 1, 0, 0],
			sameTool: true,
		});
	});
});
