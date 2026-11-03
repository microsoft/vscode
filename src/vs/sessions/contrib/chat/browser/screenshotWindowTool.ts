/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { mainWindow } from '../../../../base/browser/window.js';
import { VSBuffer } from '../../../../base/common/buffer.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { CancellationError } from '../../../../base/common/errors.js';
import { readImageDimensions } from '../../../../base/common/image.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { autorun } from '../../../../base/common/observable.js';
import { localize } from '../../../../nls.js';
import { BrowserChatToolReferenceName } from '../../../../platform/browserView/common/browserChatToolReferenceNames.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { ContextKeyExpr } from '../../../../platform/contextkey/common/contextkey.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { observableConfigValue } from '../../../../platform/observable/common/platformObservableUtils.js';
import { IWorkbenchContribution } from '../../../../workbench/common/contributions.js';
import { IsSessionsWindowContext } from '../../../../workbench/common/contextkeys.js';
import { resizeImage } from '../../../../workbench/contrib/chat/browser/chatImageUtils.js';
import { ChatContextKeys } from '../../../../workbench/contrib/chat/common/actions/chatContextKeys.js';
import { CountTokensCallback, ILanguageModelToolsService, IPreparedToolInvocation, IToolData, IToolImpl, IToolInvocation, IToolInvocationPreparationContext, IToolResult, ToolDataSource, ToolProgress } from '../../../../workbench/contrib/chat/common/tools/languageModelToolsService.js';
import { IHostService } from '../../../../workbench/services/host/browser/host.js';
import { AGENT_SESSIONS_APPEARANCE_TOOLS_ENABLED_SETTING } from '../common/constants.js';

export const ScreenshotWindowToolId = 'vscode_screenshotWindow';

const screenshotMimeType = 'image/jpeg';

export class ScreenshotWindowTool implements IToolImpl {

	constructor(
		@IHostService private readonly hostService: IHostService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@ILogService private readonly logService: ILogService,
	) { }

	getToolData(): IToolData {
		return {
			id: ScreenshotWindowToolId,
			toolReferenceName: 'screenshotWindow',
			displayName: localize('screenshotWindow.displayName', "Screenshot Window"),
			userDescription: localize('screenshotWindow.userDescription', "Capture a screenshot of the Agents window"),
			modelDescription: `Capture a screenshot of the Agents window that hosts this chat. Use it to see the interface as the user currently sees it, for example to check how a chat background or theme change looks. For integrated browser pages, use ${BrowserChatToolReferenceName.ScreenshotPage} instead. Captures only what this window displays right now, which may be a different chat. The image is downscaled; the result reports the window size in CSS pixels.`,
			source: ToolDataSource.Internal,
			icon: Codicon.deviceCamera,
			when: ContextKeyExpr.and(IsSessionsWindowContext, ChatContextKeys.enabled, ContextKeyExpr.equals(`config.${AGENT_SESSIONS_APPEARANCE_TOOLS_ENABLED_SETTING}`, true)),
			runsInWorkspace: false,
			canBeReferencedInPrompt: false,
			agentHostPreferences: { defer: 'auto' },
			inputSchema: {
				type: 'object',
				properties: {},
				additionalProperties: false,
			},
		};
	}

	async prepareToolInvocation(_context: IToolInvocationPreparationContext, _token: CancellationToken): Promise<IPreparedToolInvocation> {
		return {
			invocationMessage: localize('screenshotWindow.invocation', "Capturing a screenshot of the window"),
			pastTenseMessage: localize('screenshotWindow.past', "Captured a screenshot of the window"),
		};
	}

	async invoke(_invocation: IToolInvocation, _countTokens: CountTokensCallback, _progress: ToolProgress, token: CancellationToken): Promise<IToolResult> {
		if (token.isCancellationRequested) {
			throw new CancellationError();
		}
		if (this.configurationService.getValue<boolean>(AGENT_SESSIONS_APPEARANCE_TOOLS_ENABLED_SETTING) !== true) {
			throw new Error(localize('screenshotWindow.disabled', "Appearance tools are disabled by {0}.", AGENT_SESSIONS_APPEARANCE_TOOLS_ENABLED_SETTING));
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
			toolResultMessage: localize('screenshotWindow.result', "Captured a screenshot of the window"),
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

/**
 * Registers the tool while the appearance tools are enabled. Register this contribution only on desktop,
 * where the window can be captured without asking the user to pick a screen.
 */
export class ScreenshotWindowToolContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'sessions.contrib.screenshotWindowTool';

	constructor(
		@IInstantiationService instantiationService: IInstantiationService,
		@ILanguageModelToolsService toolsService: ILanguageModelToolsService,
		@IConfigurationService configurationService: IConfigurationService,
	) {
		super();
		const tool = instantiationService.createInstance(ScreenshotWindowTool);
		const enabled = observableConfigValue(AGENT_SESSIONS_APPEARANCE_TOOLS_ENABLED_SETTING, false, configurationService);
		this._register(autorun(reader => {
			if (enabled.read(reader)) {
				reader.store.add(toolsService.registerTool(tool.getToolData(), tool));
			}
		}));
	}
}
