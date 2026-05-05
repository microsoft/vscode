/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IDisposable } from '../../../../base/common/lifecycle.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';

/** The VS Code configuration key for the active color theme. */
export const COLOR_THEME_SETTINGS_ID = 'workbench.colorTheme';

export const IThemeImporterService = createDecorator<IThemeImporterService>('IThemeImporterService');

/**
 * Result of previewing the parent VS Code's color theme.
 */
export interface IThemePreviewResult extends IDisposable {
	/**
	 * Permanently imports the previewed theme into the Agents app by
	 * copying the providing extension and installing it from there.
	 */
	apply(): Promise<void>;
}

/**
 * Service that reads the parent VS Code installation's active color theme
 * and can import it into the Agents app — using the providing extension
 * from the parent VS Code installation if necessary.
 */
export interface IThemeImporterService {

	readonly _serviceBrand: undefined;

	/**
	 * Resolves the parent VS Code's active color theme. Returns `undefined`
	 * when the parent settings cannot be read or the theme is already one of
	 * the onboarding themes displayed in the theme picker.
	 */
	getVSCodeTheme(): Promise<string | undefined>;

	/**
	 * Temporarily installs the providing extension from the host's extensions
	 * directory and applies the VS Code theme. Returns a cached
	 * {@link IThemePreviewResult} to apply or dispose the preview. Returns
	 * `undefined` if the theme is already available or cannot be resolved.
	 */
	previewVSCodeTheme(): Promise<IThemePreviewResult | undefined>;
}
