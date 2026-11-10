/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { isNative } from '../../../../base/common/platform.js';
import { localize } from '../../../../nls.js';
import { AccessibleContentProvider, AccessibleViewProviderId, AccessibleViewType } from '../../../../platform/accessibility/browser/accessibleView.js';
import { AccessibleViewRegistry, IAccessibleViewImplementation } from '../../../../platform/accessibility/browser/accessibleViewRegistry.js';
import { Extensions as ConfigurationExtensions, IConfigurationRegistry } from '../../../../platform/configuration/common/configurationRegistry.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { workbenchConfigurationNodeBase } from '../../../common/configuration.js';
import { AccessibilityVerbositySettingId } from '../../accessibility/browser/accessibilityConfiguration.js';
import { IScreenshotToolService, ScreenshotToolActiveContext, SCREENSHOT_TOOL_ENABLED_SETTING_ID } from './screenshotTool.js';
import { ScreenshotToolService } from './screenshotToolService.js';

registerSingleton(IScreenshotToolService, ScreenshotToolService, InstantiationType.Delayed);

Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration).registerConfiguration({
	...workbenchConfigurationNodeBase,
	properties: {
		[SCREENSHOT_TOOL_ENABLED_SETTING_ID]: {
			type: 'boolean',
			default: false,
			included: isNative,
			tags: ['experimental'],
			experiment: { mode: 'auto' },
			markdownDescription: localize('workbench.screenshotTool.enabled', "Controls whether taking a screenshot from chat's Add Context, the issue reporter, or the Integrated Browser opens a screenshot tool. Click to capture the window or a browser page, or drag to capture an area. The screenshot is attached right away, and clicking it opens it for editing."),
		},
	},
});

class ScreenshotToolAccessibilityHelp implements IAccessibleViewImplementation {
	readonly type = AccessibleViewType.Help;
	readonly priority = 110;
	readonly name = 'screenshotTool';
	readonly when = ScreenshotToolActiveContext;

	getProvider(accessor: ServicesAccessor): AccessibleContentProvider {
		const screenshotToolService = accessor.get(IScreenshotToolService);
		return new AccessibleContentProvider(
			AccessibleViewProviderId.ScreenshotTool,
			{ type: AccessibleViewType.Help },
			() => [
				localize('screenshotTool.accessibilityHelp.overview', "You are in the screenshot tool."),
				localize('screenshotTool.accessibilityHelp.capture', "Press Enter to capture the whole window, or Escape to cancel. With a pointer, click to capture the window or a browser page, or drag to capture an area."),
				localize('screenshotTool.accessibilityHelp.attach', "The screenshot is attached right away. To edit an attached screenshot, focus it and press Enter."),
				localize('screenshotTool.accessibilityHelp.edit', "The edit dialog keeps your changes as you make them. Use Tab and Shift+Tab to move between the drawing tools, Undo, Redo, and Close. Press Escape to close it."),
			].join('\n'),
			() => screenshotToolService.focus(),
			AccessibilityVerbositySettingId.ScreenshotTool,
		);
	}
}

AccessibleViewRegistry.register(new ScreenshotToolAccessibilityHelp());
