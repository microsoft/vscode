/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../nls.js';
import { AccessibleContentProvider, AccessibleViewProviderId, AccessibleViewType } from '../../../../platform/accessibility/browser/accessibleView.js';
import { AccessibleViewRegistry, IAccessibleViewImplementation } from '../../../../platform/accessibility/browser/accessibleViewRegistry.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { AccessibilityVerbositySettingId } from '../../accessibility/browser/accessibilityConfiguration.js';
import { IScreenshotToolService, ScreenshotToolActiveContext } from './screenshotTool.js';
import { ScreenshotToolService } from './screenshotToolService.js';

registerSingleton(IScreenshotToolService, ScreenshotToolService, InstantiationType.Delayed);

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
				localize('screenshotTool.accessibilityHelp.capture', "Press Enter to capture the whole window, or Escape to cancel. With a pointer, click to capture the window, or drag to capture an area."),
				localize('screenshotTool.accessibilityHelp.attach', "The screenshot is attached right away. To mark up an attached screenshot, focus it and press Enter. In chat, this opens the Images Preview, where Mark Up starts the markup of an image in the input."),
				localize('screenshotTool.accessibilityHelp.markUp', "While marking up, use Tab and Shift+Tab to move between the drawing tools, Undo, Redo, and Done. Select Done or press Escape to apply your changes."),
			].join('\n'),
			() => screenshotToolService.focus(),
			AccessibilityVerbositySettingId.ScreenshotTool,
		);
	}
}

AccessibleViewRegistry.register(new ScreenshotToolAccessibilityHelp());
