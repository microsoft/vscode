/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// test-workbench_change - new file

import { Registry } from '../../../../platform/registry/common/platform.js';
import { IConfigurationRegistry, Extensions as ConfigurationExtensions } from '../../../../platform/configuration/common/configurationRegistry.js';
import { workbenchConfigurationNodeBase } from '../../../common/configuration.js';
import { localize } from '../../../../nls.js';
import product from '../../../../platform/product/common/product.js';

// test-workbench_change start
/**
 * Validates a theme ID for basic format correctness
 * @param themeId - The theme ID to validate
 * @returns true if the theme ID is valid, false otherwise
 */
function isValidThemeId(themeId: string | undefined): boolean {
	// Check for null/undefined/empty
	if (!themeId || themeId.length === 0) {
		return false;
	}

	// Check length limit (1-255 characters)
	if (themeId.length > 255) {
		return false;
	}

	// Check for control characters (0x00-0x1F, 0x7F)
	if (/[\x00-\x1F\x7F]/.test(themeId)) {
		return false;
	}

	return true;
}

/**
 * Registers the default theme configuration from product.json
 * This function reads the defaultColorTheme from product configuration and
 * registers it as a default configuration override in the configuration registry.
 */
function registerDefaultTheme(): void {
	try {
		// Read default theme from product configuration
		const defaultTheme = product.defaultColorTheme;

		// Validate and determine theme to use
		let themeToUse: string;
		if (isValidThemeId(defaultTheme)) {
			themeToUse = defaultTheme!; // Non-null assertion since isValidThemeId checks for undefined
			console.info(`[TSCode] Registering default color theme: ${themeToUse}`);
		} else {
			// Fallback to system default if invalid or not configured
			themeToUse = 'Dark 2026'; // Default fallback theme
			if (defaultTheme) {
				console.warn(`[TSCode] Invalid default theme '${defaultTheme}' specified in product.json. Using fallback theme: ${themeToUse}`);
			}
		}

		// Register default configuration override
		Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration)
			.registerDefaultConfigurations([{
				overrides: {
					'workbench.colorTheme': themeToUse
				}
			}]);

	} catch (error) {
		// Ensure application continues to start even if registration fails
		console.error('[TSCode] Failed to register default theme configuration:', error);
	}
}
// test-workbench_change end

// Register TSCode specific configuration
Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration).registerConfiguration({
	...workbenchConfigurationNodeBase,
	properties: {
		'tscode.useIntegratedBrowserByDefault': {
			type: 'boolean',
			default: true,
			markdownDescription: localize(
				'tscode.useIntegratedBrowserByDefault',
				'When enabled, all HTTP/HTTPS links will open in the Integrated Browser by default instead of the external browser.'
			)
		}
	}
});

// Register TSCode default configuration
Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration).registerDefaultConfigurations([{
	overrides: {
		// Hide browser button in title bar (integrated browser still works via link interception)
		'workbench.browser.showInTitleBar': false,

		// Open localhost links in integrated browser by default
		'workbench.browser.openLocalhostLinks': true,

		// Open all links in integrated browser by default
		'tscode.useIntegratedBrowserByDefault': true
	}
}]);

// test-workbench_change start
// Register default theme configuration on module load
registerDefaultTheme();
// test-workbench_change end
