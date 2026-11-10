/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { $, addDisposableListener, EventType, getActiveWindow, getWindow, isHTMLElement } from '../../../../base/browser/dom.js';
import { StandardKeyboardEvent } from '../../../../base/browser/keyboardEvent.js';
import { CodeWindow } from '../../../../base/browser/window.js';
import { DeferredPromise, timeout } from '../../../../base/common/async.js';
import { encodeBase64, VSBuffer } from '../../../../base/common/buffer.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { Emitter } from '../../../../base/common/event.js';
import { Disposable, DisposableStore, IDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { LRUCache } from '../../../../base/common/map.js';
import { isNative } from '../../../../base/common/platform.js';
import { StopWatch } from '../../../../base/common/stopwatch.js';
import { localize } from '../../../../nls.js';
import { IAccessibilityService } from '../../../../platform/accessibility/common/accessibility.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IContextKey, IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { ResultKind } from '../../../../platform/keybinding/common/keybindingResolver.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { logSettingExperimentTrigger } from '../../../../platform/telemetry/common/experimentTrigger.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { IHostService } from '../../../services/host/browser/host.js';
import { IWorkbenchLayoutService } from '../../../services/layout/browser/layoutService.js';
import { AccessibilityVerbositySettingId } from '../../accessibility/browser/accessibilityConfiguration.js';
import { AccessibilityCommandId } from '../../accessibility/common/accessibilityCommands.js';
import { ScreenshotAnnotationEditor, ScreenshotAnnotationEditorMode } from './screenshotAnnotation.js';
import { getScreenshotSelectionHint, IScreenshotRect, ScreenshotSelection, ScreenshotSelectionOverlay } from './screenshotSelection.js';
import { createScreenshotToolImage, IScreenshotToolCaptureEvent, IScreenshotToolEdit, IScreenshotToolEditable, IScreenshotToolImage, IScreenshotToolLayer, IScreenshotToolService, ScreenshotToolActiveContext, SCREENSHOT_TOOL_ENABLED_SETTING_ID, ScreenshotToolMode, ScreenshotToolResult, ScreenshotToolSurface } from './screenshotTool.js';

/** How long the window gets to repaint, without the overlay or UI that just closed, before it is captured. */
const REPAINT_DELAY = 100;

/** How many screenshots attached to chat stay editable, which bounds the memory their originals take. */
const MAX_EDITABLE_ATTACHMENTS = 10;

interface ICapture {
	readonly mode: ScreenshotToolMode;
	readonly image: IScreenshotToolImage;
	readonly includesLayerContent: boolean;
}

interface ILayerBounds {
	readonly layer: IScreenshotToolLayer;
	readonly rect: IScreenshotRect;
}

interface ISession extends IDisposable {
	surface: { focus(): void } | undefined;
}

type ScreenshotToolCaptureClassification = {
	owner: 'Giuspepe';
	comment: 'Reports how a screenshot entry point ended, in every arm of the screenshot tool experiment.';
	entryPoint: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The entry point that started the screenshot: chat Add Context, the issue reporter, or an Integrated Browser screenshot action.' };
	outcome: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Whether the screenshot was attached, cancelled, or failed.' };
	mode: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'What was captured: the window, an area, a browser page, or a full browser page, or none when nothing was captured.' };
	durationMs: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Milliseconds from running the entry point to its outcome, including the time the user spent selecting.' };
	usedTool: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Whether the entry point used the screenshot tool instead of its previous behavior.' };
};

type ScreenshotToolEditEvent = {
	surface: ScreenshotToolSurface;
	changed: boolean;
	annotated: boolean;
	durationMs: number;
};

type ScreenshotToolEditClassification = {
	owner: 'Giuspepe';
	comment: 'Reports how editing an attached screenshot in the screenshot tool ended.';
	surface: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Where the edited screenshot was attached: chat or the issue reporter.' };
	changed: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Whether the screenshot changed while the edit dialog was open.' };
	annotated: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Whether the screenshot has annotations or a crop when the edit dialog closes.' };
	durationMs: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Milliseconds the edit dialog was open.' };
};

export class ScreenshotToolService extends Disposable implements IScreenshotToolService {

	declare readonly _serviceBrand: undefined;

	private readonly layers = new Set<IScreenshotToolLayer>();
	private readonly sessions = new Map<CodeWindow, ISession>();
	private readonly editableAttachments = new LRUCache<string, IScreenshotToolEditable>(MAX_EDITABLE_ATTACHMENTS);
	private readonly activeContext: IContextKey<boolean>;

	private readonly _onDidChangeActive = this._register(new Emitter<{ readonly targetWindow: CodeWindow; readonly active: boolean }>());
	readonly onDidChangeActive = this._onDidChangeActive.event;

	constructor(
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@ITelemetryService private readonly telemetryService: ITelemetryService,
		@IHostService private readonly hostService: IHostService,
		@IWorkbenchLayoutService private readonly layoutService: IWorkbenchLayoutService,
		@IAccessibilityService private readonly accessibilityService: IAccessibilityService,
		@IKeybindingService private readonly keybindingService: IKeybindingService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@ILogService private readonly logService: ILogService,
	) {
		super();
		this.activeContext = ScreenshotToolActiveContext.bindTo(contextKeyService);
	}

	/** Desktop windows can capture themselves, while the web would ask the user to pick a screen. */
	protected get isSupported(): boolean {
		return isNative;
	}

	shouldUseTool(): boolean {
		if (!this.isSupported) {
			return false;
		}
		logSettingExperimentTrigger(this.telemetryService, SCREENSHOT_TOOL_ENABLED_SETTING_ID);
		return this.configurationService.getValue<boolean>(SCREENSHOT_TOOL_ENABLED_SETTING_ID) === true;
	}

	registerLayer(layer: IScreenshotToolLayer): IDisposable {
		this.layers.add(layer);
		return toDisposable(() => this.layers.delete(layer));
	}

	logCapture(event: IScreenshotToolCaptureEvent): void {
		if (!this.isSupported) {
			return;
		}
		this.telemetryService.publicLog2<IScreenshotToolCaptureEvent, ScreenshotToolCaptureClassification>('screenshotTool.capture', {
			entryPoint: event.entryPoint,
			outcome: event.outcome,
			mode: event.mode,
			durationMs: Math.round(event.durationMs),
			usedTool: event.usedTool,
		});
	}

	registerEditableAttachment(attachmentId: string, screenshot: IScreenshotToolEditable): void {
		this.editableAttachments.set(attachmentId, screenshot);
	}

	getEditableAttachment(attachmentId: string): IScreenshotToolEditable | undefined {
		return this.editableAttachments.get(attachmentId);
	}

	focus(): void {
		const sessions = [...this.sessions];
		const [, session] = sessions.find(([targetWindow]) => targetWindow.document.hasFocus()) ?? sessions.at(-1) ?? [];
		session?.surface?.focus();
	}

	async capture(targetWindow: CodeWindow, token = CancellationToken.None): Promise<ScreenshotToolResult> {
		const session = this.startSession(targetWindow);
		if (!session) {
			return { kind: 'cancelled', mode: 'none' };
		}
		let mode: ScreenshotToolMode = 'none';
		try {
			const selection = await this.select(targetWindow, session, token);
			if (!selection || token.isCancellationRequested) {
				this.accessibilityService.status(localize('screenshotCancelled', "Screenshot cancelled."));
				return { kind: 'cancelled', mode };
			}
			const page = selection.kind === 'click' ? this.getClickLayer(targetWindow, selection.x, selection.y) : undefined;
			let capture = page && await this.capturePage(page.layer);
			if (capture) {
				mode = 'page';
			} else {
				mode = selection.kind === 'area' ? 'area' : 'window';
				capture = await this.captureWindowArea(targetWindow, selection.kind === 'area' ? selection.rect : undefined, true);
			}
			if (!capture) {
				this.accessibilityService.alert(localize('screenshotFailed', "The screenshot could not be captured."));
				return { kind: 'failed', mode };
			}
			if (token.isCancellationRequested) {
				return { kind: 'cancelled', mode };
			}
			this.accessibilityService.status(localize('screenshotCaptured', "Screenshot captured."));
			return { kind: 'captured', mode, ...capture };
		} catch (error) {
			this.logService.error('[ScreenshotTool] Capturing a screenshot failed:', error);
			this.accessibilityService.alert(localize('screenshotFailed', "The screenshot could not be captured."));
			return { kind: 'failed', mode };
		} finally {
			session.dispose();
		}
	}

	async captureWindow(targetWindow: CodeWindow, options?: { readonly afterRepaint?: boolean }): Promise<IScreenshotToolImage | undefined> {
		try {
			return (await this.captureWindowArea(targetWindow, undefined, !!options?.afterRepaint))?.image;
		} catch (error) {
			this.logService.error('[ScreenshotTool] Capturing the window failed:', error);
			return undefined;
		}
	}

	async edit(targetWindow: CodeWindow, screenshot: IScreenshotToolEditable, surface: ScreenshotToolSurface, token = CancellationToken.None): Promise<IScreenshotToolEdit | undefined> {
		const session = this.startSession(targetWindow);
		if (!session) {
			return undefined;
		}
		const stopWatch = StopWatch.create(false);
		let edit: IScreenshotToolEdit | undefined;
		try {
			edit = await this.openEditDialog(targetWindow, session, screenshot, token);
			return edit;
		} catch (error) {
			this.logService.error('[ScreenshotTool] Editing a screenshot failed:', error);
			return undefined;
		} finally {
			session.dispose();
			this.telemetryService.publicLog2<ScreenshotToolEditEvent, ScreenshotToolEditClassification>('screenshotTool.edit', {
				surface,
				changed: !!edit,
				annotated: edit ? edit.annotated : !!screenshot.annotationState?.actions.length || !!screenshot.annotationState?.crop,
				durationMs: Math.round(stopWatch.elapsed()),
			});
		}
	}

	private startSession(targetWindow: CodeWindow): ISession | undefined {
		if (this.sessions.has(targetWindow)) {
			return undefined;
		}
		// Keyboard input, such as Escape to cancel, only reaches the focused window.
		const previousWindow = getActiveWindow();
		const previousFocus = new Set([targetWindow.document.activeElement, previousWindow.document.activeElement]);
		if (previousWindow !== targetWindow) {
			void this.hostService.focus(targetWindow);
		}
		const session: ISession = {
			surface: undefined,
			dispose: () => {
				if (this.sessions.get(targetWindow) !== session) {
					return;
				}
				this.sessions.delete(targetWindow);
				this.activeContext.set(this.sessions.size > 0);
				this._onDidChangeActive.fire({ targetWindow, active: false });
				if (previousWindow !== targetWindow && !previousWindow.closed) {
					void this.hostService.focus(previousWindow);
				}
				for (const element of previousFocus) {
					if (isHTMLElement(element) && element.isConnected) {
						element.focus();
					}
				}
			}
		};
		this.sessions.set(targetWindow, session);
		this.activeContext.set(true);
		this._onDidChangeActive.fire({ targetWindow, active: true });
		return session;
	}

	private async select(targetWindow: CodeWindow, session: ISession, token: CancellationToken): Promise<ScreenshotSelection | undefined> {
		const store = new DisposableStore();
		try {
			const overlay = store.add(new ScreenshotSelectionOverlay(this.layoutService.getContainer(targetWindow), {
				getClickTarget: (x, y) => this.getClickLayer(targetWindow, x, y)?.rect,
				shouldForwardKey: event => this.isAccessibilityHelpKey(event),
			}));
			store.add(token.onCancellationRequested(() => overlay.cancel()));
			session.surface = overlay;
			store.add(toDisposable(() => session.surface = undefined));
			overlay.focus();
			this.accessibilityService.status(this.getSelectionAnnouncement());
			return await overlay.selection;
		} finally {
			store.dispose();
		}
	}

	private isAccessibilityHelpKey(event: StandardKeyboardEvent): boolean {
		const result = this.keybindingService.softDispatch(event, event.target);
		return result.kind === ResultKind.KbFound && result.commandId === AccessibilityCommandId.OpenAccessibilityHelp;
	}

	private getSelectionAnnouncement(): string {
		const message = localize('screenshotModeAnnouncement', "Screenshot mode. {0}", getScreenshotSelectionHint());
		if (!this.configurationService.getValue<boolean>(AccessibilityVerbositySettingId.ScreenshotTool)) {
			return message;
		}
		const keybinding = this.keybindingService.lookupKeybinding(AccessibilityCommandId.OpenAccessibilityHelp)?.getAriaLabel();
		return keybinding
			? localize('screenshotModeAnnouncementWithHelp', "{0} Use {1} for accessibility help.", message, keybinding)
			: message;
	}

	private async openEditDialog(targetWindow: CodeWindow, session: ISession, screenshot: IScreenshotToolEditable, token: CancellationToken): Promise<IScreenshotToolEdit | undefined> {
		const store = new DisposableStore();
		const result = new DeferredPromise<IScreenshotToolEdit | undefined>();
		const editor = new ScreenshotAnnotationEditor(screenshot.original, this.layoutService.getContainer(targetWindow), screenshot.annotationState, ScreenshotAnnotationEditorMode.Dialog);
		store.add(toDisposable(() => editor.dispose()));
		for (const type of [EventType.KEY_DOWN, EventType.KEY_UP]) {
			// Workbench shortcuts would open UI underneath the dialog and take focus from it.
			store.add(addDisposableListener(editor.element, type, (e: KeyboardEvent) => {
				if (!this.isAccessibilityHelpKey(new StandardKeyboardEvent(e))) {
					e.stopPropagation();
				}
			}));
		}
		store.add(editor.onDidSave(saved => void result.complete({
			original: screenshot.original,
			annotationState: saved.state,
			image: saved.annotated ? { dataUrl: saved.dataUrl, width: saved.width, height: saved.height } : screenshot.original,
			annotated: saved.annotated,
		})));
		store.add(editor.onDidCancel(() => void result.complete(undefined)));
		store.add(token.onCancellationRequested(() => void result.complete(undefined)));
		session.surface = editor;
		try {
			editor.focus();
			return await result.p;
		} finally {
			session.surface = undefined;
			store.dispose();
		}
	}

	private async capturePage(layer: IScreenshotToolLayer): Promise<Omit<ICapture, 'mode'> | undefined> {
		try {
			const content = await layer.capture();
			if (content?.data.byteLength) {
				return { image: await createScreenshotToolImage(content.data, content.mimeType), includesLayerContent: true };
			}
		} catch (error) {
			this.logService.warn('[ScreenshotTool] Capturing a page failed, capturing the window instead:', error);
		}
		return undefined;
	}

	/** Captures the window or an area of it, painting layers that the window capture misses over it. */
	private async captureWindowArea(targetWindow: CodeWindow, area: IScreenshotRect | undefined, afterRepaint: boolean): Promise<Omit<ICapture, 'mode'> | undefined> {
		if (afterRepaint) {
			await timeout(REPAINT_DELAY);
		}
		const bounds: IScreenshotRect = { x: 0, y: 0, width: targetWindow.innerWidth, height: targetWindow.innerHeight };
		const target = area ?? bounds;
		const layers = this.getVisibleLayers(targetWindow).filter(({ rect }) => intersect(rect, target));
		const [screenshot, ...layerContents] = await Promise.all([
			this.hostService.getScreenshot(undefined, targetWindow),
			...layers.map(({ layer }) => layer.capture().catch(error => {
				this.logService.warn('[ScreenshotTool] Capturing a layer failed:', error);
				return undefined;
			})),
		]);
		if (!screenshot?.byteLength) {
			return undefined;
		}
		const windowDataUrl = toDataUrl(screenshot, 'image/jpeg');
		const windowImage = await decodeImage(windowDataUrl);
		if (!area && layerContents.every(content => !content?.data.byteLength)) {
			return { image: { dataUrl: windowDataUrl, width: windowImage.naturalWidth, height: windowImage.naturalHeight }, includesLayerContent: false };
		}

		// The capture has device pixels, which can differ from CSS pixels by the zoom level and display scale.
		const scaleX = windowImage.naturalWidth / bounds.width;
		const scaleY = windowImage.naturalHeight / bounds.height;
		const canvas = $<HTMLCanvasElement>('canvas');
		canvas.width = Math.max(1, Math.round(target.width * scaleX));
		canvas.height = Math.max(1, Math.round(target.height * scaleY));
		const context = canvas.getContext('2d');
		if (!context) {
			return undefined;
		}
		context.drawImage(windowImage, target.x * scaleX, target.y * scaleY, target.width * scaleX, target.height * scaleY, 0, 0, canvas.width, canvas.height);
		let includesLayerContent = false;
		for (let i = 0; i < layers.length; i++) {
			const content = layerContents[i];
			const { rect } = layers[i];
			const overlap = intersect(rect, target);
			if (!content?.data.byteLength || !overlap) {
				continue;
			}
			const layerImage = await decodeImage(toDataUrl(content.data, content.mimeType));
			const layerScaleX = layerImage.naturalWidth / rect.width;
			const layerScaleY = layerImage.naturalHeight / rect.height;
			context.drawImage(
				layerImage,
				(overlap.x - rect.x) * layerScaleX, (overlap.y - rect.y) * layerScaleY, overlap.width * layerScaleX, overlap.height * layerScaleY,
				(overlap.x - target.x) * scaleX, (overlap.y - target.y) * scaleY, overlap.width * scaleX, overlap.height * scaleY,
			);
			includesLayerContent = true;
		}
		return { image: { dataUrl: canvas.toDataURL('image/png'), width: canvas.width, height: canvas.height }, includesLayerContent };
	}

	private getClickLayer(targetWindow: CodeWindow, x: number, y: number): ILayerBounds | undefined {
		return this.getVisibleLayers(targetWindow).find(({ layer, rect }) => layer.capturesOnClick && contains(rect, x, y));
	}

	private getVisibleLayers(targetWindow: CodeWindow): ILayerBounds[] {
		const result: ILayerBounds[] = [];
		for (const layer of this.layers) {
			const element = layer.element;
			if (!element?.isConnected || getWindow(element) !== targetWindow) {
				continue;
			}
			const { left, top, width, height } = element.getBoundingClientRect();
			if (width > 0 && height > 0) {
				result.push({ layer, rect: { x: left, y: top, width, height } });
			}
		}
		return result;
	}
}

function contains(rect: IScreenshotRect, x: number, y: number): boolean {
	return x >= rect.x && x < rect.x + rect.width && y >= rect.y && y < rect.y + rect.height;
}

function intersect(a: IScreenshotRect, b: IScreenshotRect): IScreenshotRect | undefined {
	const x = Math.max(a.x, b.x);
	const y = Math.max(a.y, b.y);
	const width = Math.min(a.x + a.width, b.x + b.width) - x;
	const height = Math.min(a.y + a.height, b.y + b.height) - y;
	return width > 0 && height > 0 ? { x, y, width, height } : undefined;
}

function toDataUrl(data: VSBuffer, mimeType: string): string {
	return `data:${mimeType};base64,${encodeBase64(data)}`;
}

async function decodeImage(dataUrl: string): Promise<HTMLImageElement> {
	const image = $<HTMLImageElement>('img');
	image.src = dataUrl;
	await image.decode();
	return image;
}
