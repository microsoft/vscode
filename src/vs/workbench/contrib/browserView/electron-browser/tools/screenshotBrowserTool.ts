/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { CancellationToken } from '../../../../../base/common/cancellation.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import {
	escapeMarkdownSyntaxTokens,
	MarkdownString
} from '../../../../../base/common/htmlContent.js';
import { isAuxiliaryWindow, mainWindow, type CodeWindow } from '../../../../../base/browser/window.js';
import { getZoomFactor } from '../../../../../base/browser/browser.js';
import { localize } from '../../../../../nls.js';
import { IPlaywrightService } from '../../../../../platform/browserView/common/playwrightService.js';
import { readImageDimensions } from '../../../../../base/common/image.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';
import { BrowserEditor } from '../browserEditor.js';
import { ToolDataSource, type CountTokensCallback, type IPreparedToolInvocation, type IToolData, type IToolImpl, type IToolInvocation, type IToolInvocationPreparationContext, type IToolResult, type ToolProgress } from '../../../chat/common/tools/languageModelToolsService.js';
import { IBrowserViewModel, IBrowserViewWorkbenchService } from '../../common/browserView.js';
import { errorResult, getSessionId, playwrightInvokeRaw } from './browserToolHelpers.js';
import { BrowserChatToolReferenceName } from '../../common/browserChatToolReferenceNames.js';
import { OpenPageToolId } from './openBrowserTool.js';
import { ReadBrowserToolData } from './readBrowserTool.js';

export const ScreenshotBrowserToolData: IToolData = {
	id: 'screenshot_page',
	toolReferenceName: BrowserChatToolReferenceName.ScreenshotPage,
	displayName: localize('screenshotBrowserTool.displayName', 'Screenshot Page'),
	userDescription: localize('screenshotBrowserTool.userDescription', 'Capture a screenshot of a browser page'),
	modelDescription: `Capture a screenshot of the current browser page. You can't perform actions based on the screenshot; use ${ReadBrowserToolData.id} for actions.`,
	icon: Codicon.deviceCamera,
	source: ToolDataSource.Internal,
	inputSchema: {
		type: 'object',
		properties: {
			pageId: {
				type: 'string',
				description: `The browser page ID to capture, acquired from context or the open tool.`
			},
			ref: {
				type: 'string',
				description: 'Element reference to capture. If omitted, captures the whole viewport.'
			},
			selector: {
				type: 'string',
				description: 'Playwright selector of an element to capture when "ref" is not available. If omitted, captures the whole viewport.'
			},
			element: {
				type: 'string',
				description: 'Human-readable description of the element to capture (e.g., "chart diagram", "product image").'
			},
			scrollIntoViewIfNeeded: {
				type: 'boolean',
				description: 'Whether to scroll the element into view before capturing. Defaults to false.',
			}
		},
		required: ['pageId'],
	},
};

interface IScreenshotBrowserToolParams {
	pageId: string;
	ref?: string;
	selector?: string;
	element?: string;
	scrollIntoViewIfNeeded?: boolean;
}

type ScreenshotType =
	/** A specific element identified by an aria ref or Playwright selector. */
	| 'element'
	/** The current viewport (no element targeted, or the element bounds could not be resolved). */
	| 'viewport';

type ScreenshotSelectorSource =
	/** Caller passed an `aria-ref` reference. */
	| 'ref'
	/** Caller passed a Playwright selector string. */
	| 'selector'
	/** Caller did not target an element (viewport screenshot was requested). */
	| 'none';

type ScreenshotCapturedEvent = {
	// Screenshot tool options
	screenshotType: ScreenshotType;
	selectorSource: ScreenshotSelectorSource;
	scrollIntoViewIfNeeded: boolean;
	// Image metadata
	imageWidth: number | undefined;
	imageHeight: number | undefined;
	byteLength: number;
	// Conversion factors
	windowZoomFactor: number;
	windowDevicePixelRatio: number;
	browserZoomFactor: number;
	// Window metadata
	windowInnerWidth: number;
	windowInnerHeight: number;
	isInAuxiliaryWindow: boolean;
	isBrowserViewVisible: boolean;
	// Screen metadata
	screenWidth: number;
	screenHeight: number;
	screenAvailWidth: number;
	screenAvailHeight: number;
};

type ScreenshotCapturedClassification = {
	// Screenshot tool options
	screenshotType: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'What kind of screenshot was captured (element or viewport).' };
	selectorSource: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'How the screenshot tool received its target element (ref, selector, or none).' };
	scrollIntoViewIfNeeded: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Whether the tool was asked to scroll the target element into view before capturing.' };
	// Image metadata
	imageWidth: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Width of the captured screenshot image in pixels (undefined if it could not be determined).' };
	imageHeight: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Height of the captured screenshot image in pixels (undefined if it could not be determined).' };
	byteLength: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Encoded size of the screenshot buffer in bytes.' };
	// Conversion factors
	windowZoomFactor: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'VS Code per-window zoom factor for the hosting window.' };
	windowDevicePixelRatio: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'OS HiDPI scaling factor for the hosting window (window.devicePixelRatio). Includes windowZoomFactor.' };
	browserZoomFactor: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Content zoom factor of the integrated browser view.' };
	// Window metadata
	windowInnerWidth: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Inner width of the hosting VS Code window viewport, in workbench CSS pixels (window.innerWidth).' };
	windowInnerHeight: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Inner height of the hosting VS Code window viewport, in workbench CSS pixels (window.innerHeight).' };
	isInAuxiliaryWindow: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Whether the browser view was hosted in a VS Code auxiliary window at capture time.' };
	isBrowserViewVisible: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Whether the browser view was mounted and being painted in an editor pane at capture time (false if the model was not bound to a visible editor).' };
	// Screen metadata
	screenWidth: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Width of the screen the hosting VS Code window is on, in OS-level CSS pixels (window.screen.width, unaffected by windowZoomFactor).' };
	screenHeight: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Height of the screen the hosting VS Code window is on, in OS-level CSS pixels (window.screen.height, unaffected by windowZoomFactor).' };
	screenAvailWidth: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Width of the available screen area (excluding OS chrome such as the taskbar/dock), in OS-level CSS pixels (window.screen.availWidth, unaffected by windowZoomFactor).' };
	screenAvailHeight: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Height of the available screen area (excluding OS chrome such as the taskbar/dock), in OS-level CSS pixels (window.screen.availHeight, unaffected by windowZoomFactor).' };
	owner: 'jruales';
	comment: 'A screenshot was successfully captured by the Integrated Browser screenshot tool.';
};

export class ScreenshotBrowserTool implements IToolImpl {
	constructor(
		@IBrowserViewWorkbenchService private readonly browserViewWorkbenchService: IBrowserViewWorkbenchService,
		@IPlaywrightService private readonly playwrightService: IPlaywrightService,
		@ITelemetryService private readonly telemetryService: ITelemetryService,
		@IEditorService private readonly editorService: IEditorService,
	) { }

	async prepareToolInvocation(_context: IToolInvocationPreparationContext, _token: CancellationToken): Promise<IPreparedToolInvocation | undefined> {
		const params = _context.parameters as IScreenshotBrowserToolParams;
		if (params.element) {
			const element = escapeMarkdownSyntaxTokens(params.element);
			return {
				invocationMessage: new MarkdownString(localize('browser.screenshot.invocation.element', "Capturing screenshot of {0}", element)),
				pastTenseMessage: new MarkdownString(localize('browser.screenshot.past.element', "Captured screenshot of {0}", element)),
			};
		}
		return {
			invocationMessage: localize('browser.screenshot.invocation', "Capturing browser screenshot"),
			pastTenseMessage: localize('browser.screenshot.past', "Captured browser screenshot"),
		};
	}

	async invoke(invocation: IToolInvocation, _countTokens: CountTokensCallback, _progress: ToolProgress, _token: CancellationToken): Promise<IToolResult> {
		const params = invocation.parameters as IScreenshotBrowserToolParams;
		const sessionId = getSessionId(invocation);

		if (!params.pageId) {
			return errorResult(`No page ID provided. Use '${OpenPageToolId}' first.`);
		}

		let selector = params.selector;
		if (params.ref) {
			selector = `aria-ref=${params.ref}`;
		}

		// Note that we don't use Playwright's screenshot methods because they cause brief flashing on the page,
		// and also doesn't handle zooming well.
		const browserViewModel = await this.browserViewWorkbenchService.getKnownBrowserViews().get(params.pageId)?.resolve();
		if (!browserViewModel) {
			return errorResult(`No browser page found with ID ${params.pageId}`);
		}

		const bounds = selector && await playwrightInvokeRaw(this.playwrightService, sessionId, params.pageId, async (page, selector, scrollIntoViewIfNeeded) => {
			const locator = page.locator(selector);
			if (scrollIntoViewIfNeeded) {
				await locator.scrollIntoViewIfNeeded();
			}
			return locator.boundingBox();
		}, selector, params.scrollIntoViewIfNeeded) || undefined;
		const screenshot = await browserViewModel.captureScreenshot({ pageRect: bounds });

		const dimensions = readImageDimensions(screenshot);
		const hostWindow = this.findBrowserViewHostWindow(browserViewModel);
		this.telemetryService.publicLog2<ScreenshotCapturedEvent, ScreenshotCapturedClassification>('integratedBrowser.tools.screenshot.captured', {
			// Screenshot tool options
			screenshotType: bounds ? 'element' : 'viewport',
			selectorSource: params.ref ? 'ref' : params.selector ? 'selector' : 'none',
			scrollIntoViewIfNeeded: !!params.scrollIntoViewIfNeeded,
			// Image metadata
			imageWidth: dimensions?.width,
			imageHeight: dimensions?.height,
			byteLength: screenshot.byteLength,
			// Conversion factors
			windowZoomFactor: getZoomFactor(hostWindow),
			windowDevicePixelRatio: hostWindow.devicePixelRatio,
			browserZoomFactor: browserViewModel.zoomFactor,
			// Window metadata
			windowInnerWidth: hostWindow.innerWidth,
			windowInnerHeight: hostWindow.innerHeight,
			isInAuxiliaryWindow: isAuxiliaryWindow(hostWindow),
			isBrowserViewVisible: browserViewModel.visible,
			// Screen metadata
			screenWidth: hostWindow.screen.width,
			screenHeight: hostWindow.screen.height,
			screenAvailWidth: hostWindow.screen.availWidth,
			screenAvailHeight: hostWindow.screen.availHeight,
		});

		return {
			content: [
				{
					kind: 'data',
					value: {
						mimeType: 'image/jpeg',
						data: screenshot,
					},
				},
			],
		};
	}

	private findBrowserViewHostWindow(model: IBrowserViewModel): CodeWindow {
		for (const pane of this.editorService.visibleEditorPanes) {
			if (pane instanceof BrowserEditor && pane.model === model) {
				return pane.window;
			}
		}
		return mainWindow;
	}
}
