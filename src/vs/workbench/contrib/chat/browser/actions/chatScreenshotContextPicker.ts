/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { getWindow } from '../../../../../base/browser/dom.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { isMacintosh } from '../../../../../base/common/platform.js';
import { StopWatch } from '../../../../../base/common/stopwatch.js';
import { generateUuid } from '../../../../../base/common/uuid.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { IHostService } from '../../../../services/host/browser/host.js';
import { getScreenshotToolImageData, IScreenshotToolService, ScreenshotToolEntryPoint, ScreenshotToolMode, ScreenshotToolOutcome } from '../../../screenshotTool/browser/screenshotTool.js';
import { IChatRequestVariableEntry } from '../../common/attachments/chatVariableEntries.js';
import { ChatConfiguration } from '../../common/constants.js';
import { IChatContextPickService } from '../attachments/chatContextPickService.js';
import { convertBufferToScreenshotVariable } from '../attachments/chatScreenshotContext.js';
import { IChatWidget } from '../chat.js';
import { ScreenshotContextValuePick } from './chatContext.js';

export class DesktopScreenshotContextValuePick extends ScreenshotContextValuePick {
	constructor(
		@IHostService hostService: IHostService,
		@IScreenshotToolService private readonly _screenshotToolService: IScreenshotToolService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
	) {
		super(hostService);
	}

	override async isEnabled(widget: IChatWidget): Promise<boolean> {
		// On macOS, the Screenshot... item of app window screenshots takes its place, as it captures the windows of VS Code too.
		if (this._screenshotToolService.isSupported && isMacintosh && this._configurationService.getValue<boolean>(ChatConfiguration.AppWindowScreenshotsEnabled)) {
			return false;
		}
		return super.isEnabled(widget);
	}

	override async asAttachment(widget: IChatWidget): Promise<IChatRequestVariableEntry | undefined> {
		if (!this._screenshotToolService.isSupported) {
			return super.asAttachment(widget);
		}
		const stopWatch = StopWatch.create(false);
		const result = await this._screenshotToolService.capture(getWindow(widget.domNode));
		widget.focusInput();
		if (result.kind !== 'captured') {
			this._logCapture(result.kind, result.mode, stopWatch);
			return undefined;
		}
		const { data, mimeType } = getScreenshotToolImageData(result.image);
		this._logCapture('attached', result.mode, stopWatch);
		const entry = { ...convertBufferToScreenshotVariable(data, mimeType), id: generateUuid() };
		this._screenshotToolService.registerEditableAttachment(entry, { original: result.image, annotationState: undefined });
		return entry;
	}

	private _logCapture(outcome: ScreenshotToolOutcome, mode: ScreenshotToolMode, stopWatch: StopWatch): void {
		this._screenshotToolService.logCapture({ entryPoint: ScreenshotToolEntryPoint.ChatAddContext, outcome, mode, durationMs: stopWatch.elapsed() });
	}
}

export class ScreenshotContextContribution extends Disposable {
	constructor(
		@IInstantiationService instantiationService: IInstantiationService,
		@IChatContextPickService contextPickService: IChatContextPickService,
	) {
		super();
		this._register(contextPickService.registerChatContextItem(instantiationService.createInstance(DesktopScreenshotContextValuePick)));
	}
}
