/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { mainWindow } from '../../../../../base/browser/window.js';
import { VSBuffer } from '../../../../../base/common/buffer.js';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { CancellationError } from '../../../../../base/common/errors.js';
import { readImageDimensions } from '../../../../../base/common/image.js';
import { localize } from '../../../../../nls.js';
import { BrowserChatToolReferenceName } from '../../../../../platform/browserView/common/browserChatToolReferenceNames.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { IHostService } from '../../../../services/host/browser/host.js';
import { ChatContextKeys } from '../../common/actions/chatContextKeys.js';
import { CountTokensCallback, IPreparedToolInvocation, IToolData, IToolImpl, IToolInvocation, IToolInvocationPreparationContext, IToolResult, ToolDataSource, ToolProgress } from '../../common/tools/languageModelToolsService.js';
import { resizeImage } from '../chatImageUtils.js';

export const ScreenshotWindowToolId = 'vscode_screenshotWindow';
export const ScreenshotWindowToolReferenceName = 'screenshotWindow';

const screenshotMimeType = 'image/jpeg';

/**
 * Describes a tool that captures the window hosting the chat. Register it only where the
 * window can be captured without user interaction: in browsers, capturing prompts the user to pick a screen.
 */
export const ScreenshotWindowToolData: IToolData = {
	id: ScreenshotWindowToolId,
	toolReferenceName: ScreenshotWindowToolReferenceName,
	displayName: localize('screenshotWindowTool.displayName', "Screenshot Window"),
	userDescription: localize('screenshotWindowTool.userDescription', "Capture a screenshot of the current VS Code window"),
	modelDescription: `Capture a screenshot of the VS Code window that hosts this chat. Use it to see the interface as the user currently sees it, for example to check how a theme, layout, or chat background change looks. For integrated browser pages, use ${BrowserChatToolReferenceName.ScreenshotPage} instead. Captures only what this window displays right now, which may be a different chat. The image is downscaled; the result reports the window size in CSS pixels.`,
	icon: Codicon.deviceCamera,
	source: ToolDataSource.Internal,
	when: ChatContextKeys.enabled,
	runsInWorkspace: false,
	agentHostPreferences: { defer: 'auto' },
	inputSchema: {
		type: 'object',
		properties: {},
		additionalProperties: false,
	},
};

export class ScreenshotWindowTool implements IToolImpl {

	constructor(
		@IHostService private readonly hostService: IHostService,
		@ILogService private readonly logService: ILogService,
	) { }

	async prepareToolInvocation(_context: IToolInvocationPreparationContext, _token: CancellationToken): Promise<IPreparedToolInvocation> {
		return {
			invocationMessage: localize('screenshotWindowTool.invocation', "Capturing a screenshot of the window"),
			pastTenseMessage: localize('screenshotWindowTool.past', "Captured a screenshot of the window"),
		};
	}

	async invoke(_invocation: IToolInvocation, _countTokens: CountTokensCallback, _progress: ToolProgress, token: CancellationToken): Promise<IToolResult> {
		if (token.isCancellationRequested) {
			throw new CancellationError();
		}
		let screenshot: VSBuffer | undefined;
		try {
			screenshot = await this.hostService.getScreenshot();
		} catch (error) {
			this.logService.warn('[ScreenshotWindowTool] Could not capture the window.', error);
		}
		if (token.isCancellationRequested) {
			throw new CancellationError();
		}
		if (!screenshot?.byteLength) {
			const message = 'The window could not be captured. It may be minimized or hidden.';
			return { content: [{ kind: 'text', value: `Error: ${message}` }], toolResultError: message };
		}

		const image = await this.downscale(screenshot);
		if (token.isCancellationRequested) {
			throw new CancellationError();
		}
		const dimensions = readImageDimensions(image);
		const imageSize = dimensions ? ` at ${dimensions.width}x${dimensions.height} pixels` : '';
		return {
			content: [
				{ kind: 'text', value: `Screenshot of the whole window${imageSize}. The window is ${mainWindow.innerWidth}x${mainWindow.innerHeight} CSS pixels.` },
				{ kind: 'data', value: { mimeType: screenshotMimeType, data: image } },
			],
			toolResultMessage: localize('screenshotWindowTool.result', "Captured a screenshot of the window"),
		};
	}

	/** Downscales the screenshot as for image attachments, which keeps detail models use while bounding its size. */
	private async downscale(screenshot: VSBuffer): Promise<VSBuffer> {
		try {
			return VSBuffer.wrap(await resizeImage(screenshot.buffer, screenshotMimeType));
		} catch (error) {
			this.logService.warn('[ScreenshotWindowTool] Could not downscale the screenshot.', error);
			return screenshot;
		}
	}
}
