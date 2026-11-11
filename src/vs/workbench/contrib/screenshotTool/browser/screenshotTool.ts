/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { $ } from '../../../../base/browser/dom.js';
import { CodeWindow } from '../../../../base/browser/window.js';
import { decodeBase64, encodeBase64, VSBuffer } from '../../../../base/common/buffer.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { Event } from '../../../../base/common/event.js';
import { IDisposable } from '../../../../base/common/lifecycle.js';
import { localize } from '../../../../nls.js';
import { RawContextKey } from '../../../../platform/contextkey/common/contextkey.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { IImageCarouselMarkUp } from '../../imageCarousel/browser/imageCarouselTypes.js';
import { IAnnotationEditorState } from './screenshotAnnotation.js';

/** True while the screenshot tool lets the user select a capture or mark up a screenshot. */
export const ScreenshotToolActiveContext = new RawContextKey<boolean>('screenshotToolActive', false, localize('screenshotToolActive', "Whether the screenshot tool is capturing or marking up a screenshot"));

export const IScreenshotToolService = createDecorator<IScreenshotToolService>('screenshotToolService');

/** A screenshot entry point, as reported in telemetry. */
export const enum ScreenshotToolEntryPoint {
	ChatAddContext = 'chatAddContext',
	IssueReporter = 'issueReporter',
	BrowserScreenshot = 'browserScreenshot',
	BrowserAreaScreenshot = 'browserAreaScreenshot',
	BrowserFullPageScreenshot = 'browserFullPageScreenshot',
}

/** What a screenshot shows; `none` when it was cancelled or failed before anything was captured. */
export type ScreenshotToolMode = 'window' | 'area' | 'page' | 'fullPage' | 'none';

export type ScreenshotToolOutcome = 'attached' | 'cancelled' | 'failed';

/** Where an attached screenshot was edited, as reported in telemetry. */
export const enum ScreenshotToolSurface {
	Chat = 'chat',
	IssueReporter = 'issueReporter',
}

export interface IScreenshotToolImage {
	/** A `data:` URL of an image, such as a PNG or JPEG. */
	readonly dataUrl: string;
	readonly width: number;
	readonly height: number;
}

/** A capture, which entry points attach right away. */
export interface IScreenshotToolCapture {
	readonly kind: 'captured';
	readonly mode: ScreenshotToolMode;
	readonly image: IScreenshotToolImage;
	/**
	 * The URLs of the layers, such as browser pages, whose content the capture shows, live or as the placeholder under UI
	 * that covers them, so that entry points can check where the content comes from. `undefined` stands for a layer
	 * without a URL.
	 */
	readonly layerUrls: readonly (string | undefined)[];
}

export type ScreenshotToolResult = IScreenshotToolCapture | { readonly kind: 'cancelled' | 'failed'; readonly mode: ScreenshotToolMode };

/** An attached screenshot that can be edited. */
export interface IScreenshotToolEditable {
	/** The capture without annotations. */
	readonly original: IScreenshotToolImage;
	/** The annotations of earlier edits, which the edit dialog restores with their undo history. */
	readonly annotationState: IAnnotationEditorState | undefined;
}

/** An attached screenshot after an edit. */
export interface IScreenshotToolEdit extends IScreenshotToolEditable {
	/** The screenshot to attach: the original with its annotations, or the original alone when it has none. */
	readonly image: IScreenshotToolImage;
	readonly annotated: boolean;
}

/** The markup of a screenshot, see {@link IScreenshotToolService.markUp}. */
export interface IScreenshotToolMarkUp extends IDisposable {
	/** Resolves once the markup ends, with the edited screenshot, or `undefined` when nothing changed. */
	readonly result: Promise<IScreenshotToolEdit | undefined>;
	focus(): void;
	/** Ends the markup and keeps its changes, like its Done button does. */
	finish(): void;
}

/** Native content, such as a browser page, that window captures do not include. */
export interface IScreenshotToolLayer {
	/** The element whose bounds the native content covers, or `undefined` while it shows no native content. */
	readonly element: HTMLElement | undefined;
	/**
	 * Whether UI other than the screenshot tool's, such as a dialog, covers the native content. Window captures then show
	 * that UI over the content's placeholder, as the user sees them, rather than the content, and a click there does not
	 * capture the content alone.
	 */
	readonly covered: boolean;
	/** The URL of the native content, such as a browser page's. */
	readonly url: string | undefined;
	/** Whether a click on the layer captures only its content. */
	readonly capturesOnClick: boolean;
	/** Captures what the layer shows, or resolves `undefined` when it shows nothing. */
	capture(): Promise<{ readonly data: VSBuffer; readonly mimeType: string } | undefined>;
}

export interface IScreenshotToolService {
	readonly _serviceBrand: undefined;

	/** Fires when the tool starts or stops letting the user capture in a window, or mark up a screenshot there. */
	readonly onDidChangeActive: Event<{ readonly targetWindow: CodeWindow; readonly active: boolean }>;

	/**
	 * Whether the tool can capture here: desktop windows can capture themselves, while the web would ask the user to pick
	 * a screen, so entry points there keep their own capture.
	 */
	readonly isSupported: boolean;

	/** Lets the user click to capture the window or a browser page, or drag to capture an area. */
	capture(targetWindow: CodeWindow, token?: CancellationToken): Promise<ScreenshotToolResult>;

	/** Captures the whole window, including its layers, without letting the user select. */
	captureWindow(targetWindow: CodeWindow): Promise<IScreenshotToolImage | undefined>;

	/**
	 * Opens an attached screenshot in the Images Preview to mark it up, where Done applies the changes and closes it.
	 * Resolves with the edited screenshot once it closes, or `undefined` when nothing changed.
	 */
	edit(screenshot: IScreenshotToolEditable, surface: ScreenshotToolSurface): Promise<IScreenshotToolEdit | undefined>;

	/**
	 * Shows the markup of a screenshot in `container`, such as the Images Preview's. Escape and Done end it, as does
	 * `finish`, which keeps its changes. A screenshot that is still loading shows once it has loaded.
	 */
	markUp(container: HTMLElement, screenshot: IScreenshotToolEditable | Promise<IScreenshotToolEditable>, surface: ScreenshotToolSurface): IScreenshotToolMarkUp;

	/**
	 * Remembers a screenshot attached to chat, so that it can be edited while it is attached. It is remembered for that
	 * attachment only, not for others with the same id, such as the same image attached elsewhere or attached again.
	 */
	registerEditableAttachment(attachment: object, screenshot: IScreenshotToolEditable): void;

	/** Returns a screenshot attached to chat that can be edited, see {@link registerEditableAttachment}. */
	getEditableAttachment(attachment: object): IScreenshotToolEditable | undefined;

	/** Moves focus back to the screenshot tool while it is active, or to the latest markup. */
	focus(): void;

	registerLayer(layer: IScreenshotToolLayer): IDisposable;

	/** Reports how an entry point ended, where the tool is supported. */
	logCapture(event: IScreenshotToolCaptureEvent): void;
}

/** Creates a captured image from its bytes. */
export async function createScreenshotToolImage(data: VSBuffer, mimeType: string): Promise<IScreenshotToolImage> {
	const dataUrl = `data:${mimeType};base64,${encodeBase64(data)}`;
	const image = $<HTMLImageElement>('img');
	image.src = dataUrl;
	await image.decode();
	return { dataUrl, width: image.naturalWidth, height: image.naturalHeight };
}

/** Returns the bytes and MIME type of a captured image. */
export function getScreenshotToolImageData(image: IScreenshotToolImage): { readonly data: VSBuffer; readonly mimeType: string } {
	const match = /^data:(?<mimeType>[^;,]+)[^,]*,(?<data>.*)$/.exec(image.dataUrl);
	return {
		data: decodeBase64(match?.groups?.data ?? ''),
		mimeType: match?.groups?.mimeType ?? 'image/png',
	};
}

/** Lets the Images Preview show a markup, and the image that it changed. */
export function toImageCarouselMarkUp(markUp: IScreenshotToolMarkUp): IImageCarouselMarkUp {
	return {
		result: markUp.result.then(edit => edit && getScreenshotToolImageData(edit.image)),
		focus: () => markUp.focus(),
		finish: () => markUp.finish(),
		dispose: () => markUp.dispose(),
	};
}

export interface IScreenshotToolCaptureEvent {
	readonly entryPoint: ScreenshotToolEntryPoint;
	readonly outcome: ScreenshotToolOutcome;
	readonly mode: ScreenshotToolMode;
	readonly durationMs: number;
}
