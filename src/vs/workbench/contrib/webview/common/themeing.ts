/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { EDITOR_FONT_DEFAULTS, IEditorOptions } from 'vs/editor/common/config/editorOptions';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import * as colorRegistry from 'vs/platform/theme/common/colorRegistry';
import { ITheme, LIGHT, DARK } from 'vs/platform/theme/common/themeService';

interface WebviewThemeData {
	readonly activeTheme: string;
	readonly styles: { readonly [key: string]: string | number };
}

export function getWebviewThemeData(
	theme: ITheme,
	configurationService: IConfigurationService
): WebviewThemeData {
	const configuration = configurationService.getValue<IEditorOptions>('editor');
	const editorFontFamily = configuration.fontFamily || EDITOR_FONT_DEFAULTS.fontFamily;
	const editorFontWeight = configuration.fontWeight || EDITOR_FONT_DEFAULTS.fontWeight;
	const editorFontSize = configuration.fontSize || EDITOR_FONT_DEFAULTS.fontSize;

	const exportedColors = colorRegistry.getColorRegistry().getColors().reduce((colors, entry) => {
		const color = theme.getColor(entry.id);
		if (color) {
			colors['vscode-' + entry.id.replace('.', '-')] = color.toString();
		}
		return colors;
	}, {} as { [key: string]: string });

	const styles = {
		'vscode-font-family': '-apple-system, BlinkMacSystemFont, "Segoe WPC", "Segoe UI", "Ubuntu", "Droid Sans", sans-serif',
		'vscode-font-weight': 'normal',
		'vscode-font-size': '13px',
		'vscode-editor-font-family': editorFontFamily,
		'vscode-editor-font-weight': editorFontWeight,
		'vscode-editor-font-size': editorFontSize,
		...exportedColors
	};

	const activeTheme = ApiThemeClassName.fromTheme(theme);
	return { styles, activeTheme };
}

enum ApiThemeClassName {
	light = 'vscode-light',
	dark = 'vscode-dark',
	highContrast = 'vscode-high-contrast'
}

namespace ApiThemeClassName {
	export function fromTheme(theme: ITheme): ApiThemeClassName {
		if (theme.type === LIGHT) {
			return ApiThemeClassName.light;
		} else if (theme.type === DARK) {
			return ApiThemeClassName.dark;
		} else {
			return ApiThemeClassName.highContrast;
		}
	}
}
