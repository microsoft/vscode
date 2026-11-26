/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IEnvironmentService } from '../../../../../platform/environment/common/environment.js';
import { Registry } from '../../../../../platform/registry/common/platform.js';
import { editorInfoForeground, editorWarningForeground } from '../../../../../platform/theme/common/colorRegistry.js';
import { ColorScheme } from '../../../../../platform/theme/common/theme.js';
import { Extensions, IThemingRegistry } from '../../../../../platform/theme/common/themeService.js';
import { ColorThemeData } from '../../../../services/themes/common/colorThemeData.js';
import { registerColors } from '../../browser/debugColors.js';

const themingRegistry = Registry.as<IThemingRegistry>(Extensions.ThemingContribution);
const participantIndex = themingRegistry.getThemingParticipants().length;
registerColors();
const debugThemingParticipant = themingRegistry.getThemingParticipants()[participantIndex];

suite('Debug Colors', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('debug console info and warning colors do not inherit transparent editor diagnostic customizations', () => {
		const themes = [
			{ type: ColorScheme.DARK, info: '#59a4f9', warning: '#cca700' },
			{ type: ColorScheme.LIGHT, info: '#0063d3', warning: '#bf8803' },
			{ type: ColorScheme.HIGH_CONTRAST_DARK, info: '#ffffff', warning: '#008000' },
			{ type: ColorScheme.HIGH_CONTRAST_LIGHT, info: '#292929', warning: '#895503' },
		];

		assert.deepStrictEqual(themes.map(({ type }) => {
			const theme = ColorThemeData.createUnloadedThemeForThemeType(type);
			theme.setCustomColors({ [editorInfoForeground]: '#00000000', [editorWarningForeground]: '#00000000' });
			return [
				theme.getColor('debugConsole.infoForeground')?.toString(),
				theme.getColor('debugConsole.warningForeground')?.toString()
			];
		}), themes.map(({ info, warning }) => [info, warning]));
	});

	test('preserves theme-defined diagnostic colors despite editor customizations', () => {
		const themes = [
			{ type: ColorScheme.DARK, info: '#17ff12', warning: '#ff1212' },
			{ type: ColorScheme.LIGHT, info: '#17ff12', warning: '#ff1212' },
			{ type: ColorScheme.HIGH_CONTRAST_DARK, info: '#ffffff', warning: '#008000' },
			{ type: ColorScheme.HIGH_CONTRAST_LIGHT, info: '#292929', warning: '#ff1212' },
		];

		assert.deepStrictEqual(themes.map(({ type }) => {
			const theme = ColorThemeData.createUnloadedThemeForThemeType(type, {
				[editorInfoForeground]: '#17ff12',
				[editorWarningForeground]: '#ff1212',
			});
			theme.setCustomColors({ [editorInfoForeground]: '#00000000', [editorWarningForeground]: '#00000000' });
			return [
				theme.getColor('debugConsole.infoForeground')?.toString(),
				theme.getColor('debugConsole.warningForeground')?.toString()
			];
		}), themes.map(({ info, warning }) => [info, warning]));
	});

	test('explicit console colors override theme colors and appear in the generated styles', () => {
		const theme = ColorThemeData.createUnloadedThemeForThemeType(ColorScheme.DARK, {
			[editorInfoForeground]: '#17ff12',
			[editorWarningForeground]: '#ff1212',
			'debugConsole.infoForeground': '#112233',
			'debugConsole.warningForeground': '#445566',
		});
		const themeColors = [
			theme.getColor('debugConsole.infoForeground')?.toString(),
			theme.getColor('debugConsole.warningForeground')?.toString()
		];
		theme.setCustomColors({
			[editorInfoForeground]: '#00000000',
			[editorWarningForeground]: '#00000000',
			'debugConsole.infoForeground': '#123456',
			'debugConsole.warningForeground': '#abcdef',
		});
		const rules: string[] = [];
		const environment = new class extends mock<IEnvironmentService>() { };
		debugThemingParticipant(theme, { addRule: rule => rules.push(rule) }, environment);
		const css = rules.join('\n');

		assert.deepStrictEqual([
			...themeColors,
			theme.getColor('debugConsole.infoForeground')?.toString(),
			theme.getColor('debugConsole.warningForeground')?.toString(),
			...['info', 'warn'].map(severity => css.match(new RegExp(`\\.value\\.${severity} \\{\\s*color: (?<color>[^;]+);`))?.groups?.color)
		], ['#112233', '#445566', '#123456', '#abcdef', '#123456', '#abcdef']);
	});
});
