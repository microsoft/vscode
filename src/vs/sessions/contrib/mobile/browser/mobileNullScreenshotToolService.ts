/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CodeWindow } from '../../../../base/browser/window.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { Event } from '../../../../base/common/event.js';
// eslint-disable-next-line local/code-translation-remind -- The mobile entry has its own localization bundle.
import { localize } from '../../../../nls.js';
import { IScreenshotToolCaptureEvent, IScreenshotToolEdit, IScreenshotToolEditable, IScreenshotToolImage, IScreenshotToolMarkUp, IScreenshotToolService, ScreenshotToolResult, ScreenshotToolSurface } from '../../../../workbench/contrib/screenshotTool/browser/screenshotTool.js';

const unavailableMessage = localize('mobile.screenshotToolUnavailable', "This screenshot tool is not available on this device.");

/** Shared chat requires this service, but the phone does not ship desktop screenshot capture or markup. */
export class MobileNullScreenshotToolService implements IScreenshotToolService {
	declare readonly _serviceBrand: undefined;

	readonly isSupported = false;
	readonly onDidChangeActive = Event.None;

	async capture(_targetWindow: CodeWindow, _token?: CancellationToken): Promise<ScreenshotToolResult> {
		throw new Error(unavailableMessage);
	}

	async captureWindow(_targetWindow: CodeWindow, _options?: { readonly afterRepaint?: boolean }): Promise<IScreenshotToolImage | undefined> {
		throw new Error(unavailableMessage);
	}

	async edit(_screenshot: IScreenshotToolEditable, _surface: ScreenshotToolSurface, _name?: string): Promise<IScreenshotToolEdit | undefined> {
		throw new Error(unavailableMessage);
	}

	markUp(_container: HTMLElement, _screenshot: IScreenshotToolEditable | Promise<IScreenshotToolEditable>, _surface: ScreenshotToolSurface): IScreenshotToolMarkUp {
		throw new Error(unavailableMessage);
	}

	registerEditableAttachment(_attachment: object, _screenshot: IScreenshotToolEditable): void {
		throw new Error(unavailableMessage);
	}

	getEditableAttachment(_attachment: object): IScreenshotToolEditable | undefined {
		return undefined;
	}

	focus(): void { }

	logCapture(_event: IScreenshotToolCaptureEvent): void { }
}
