/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { $, addDisposableListener, EventType, getActiveWindow, getWindow, isHTMLElement } from '../../../../base/browser/dom.js';
import { StandardKeyboardEvent } from '../../../../base/browser/keyboardEvent.js';
import { CodeWindow, mainWindow } from '../../../../base/browser/window.js';
import { DeferredPromise, isThenable, timeout } from '../../../../base/common/async.js';
import { encodeBase64, VSBuffer } from '../../../../base/common/buffer.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable, DisposableStore, IDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { LRUCache } from '../../../../base/common/map.js';
import { isNative } from '../../../../base/common/platform.js';
import { StopWatch } from '../../../../base/common/stopwatch.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { localize } from '../../../../nls.js';
import { IAccessibilityService } from '../../../../platform/accessibility/common/accessibility.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IContextKey, IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { ResultKind } from '../../../../platform/keybinding/common/keybindingResolver.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { IHostService } from '../../../services/host/browser/host.js';
import { IWorkbenchLayoutService } from '../../../services/layout/browser/layoutService.js';
import { AccessibilityVerbositySettingId } from '../../accessibility/browser/accessibilityConfiguration.js';
import { AccessibilityCommandId } from '../../accessibility/common/accessibilityCommands.js';
import { ImageCarouselEditorInput } from '../../imageCarousel/browser/imageCarouselEditorInput.js';
import { ScreenshotAnnotationEditor } from './screenshotAnnotation.js';
import { getScreenshotSelectionHint, IScreenshotRect, ScreenshotSelection, ScreenshotSelectionOverlay } from './screenshotSelection.js';
import { createScreenshotToolImage, getScreenshotToolImageData, IScreenshotToolCaptureEvent, IScreenshotToolEdit, IScreenshotToolEditable, IScreenshotToolImage, IScreenshotToolLayer, IScreenshotToolMarkUp, IScreenshotToolService, ScreenshotToolActiveContext, ScreenshotToolMode, ScreenshotToolResult, ScreenshotToolSurface, toImageCarouselMarkUp } from './screenshotTool.js';

/** How long the window gets to repaint without the overlay before it is captured. */
const OVERLAY_REMOVAL_DELAY = 100;

/** How many screenshots attached to chat stay editable, which bounds the memory their originals take. */
const MAX_EDITABLE_ATTACHMENTS = 10;

interface ICapture {
	readonly mode: ScreenshotToolMode;
	readonly image: IScreenshotToolImage;
	readonly layerUrls: readonly (string | undefined)[];
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
	comment: 'Reports how a screenshot entry point ended.';
	entryPoint: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The entry point that started the screenshot: chat Add Context, the issue reporter, or an Integrated Browser screenshot action.' };
	outcome: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Whether the screenshot was attached, cancelled, or failed.' };
	mode: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'What was captured: the window, an area, a browser page, or a full browser page, or none when nothing was captured.' };
	durationMs: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Milliseconds from running the entry point to its outcome, including the time the user spent selecting.' };
};

type ScreenshotToolEditEvent = {
	surface: ScreenshotToolSurface;
	changed: boolean;
	annotated: boolean;
	durationMs: number;
};

type ScreenshotToolEditClassification = {
	owner: 'Giuspepe';
	comment: 'Reports how marking up an attached image with the screenshot tool ended.';
	surface: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Where the marked up image was attached: chat or the issue reporter.' };
	changed: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Whether the image changed during the markup.' };
	annotated: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Whether the image has annotations or a crop when the markup ends.' };
	durationMs: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Milliseconds the markup was shown.' };
};

export class ScreenshotToolService extends Disposable implements IScreenshotToolService {

	declare readonly _serviceBrand: undefined;

	private readonly layers = new Set<IScreenshotToolLayer>();
	private readonly sessions = new Map<CodeWindow, ISession>();
	private readonly markUps = new Set<IScreenshotToolMarkUp>();
	/** How many captures and markups each window shows, which overlap when a markup's host lets the user capture. */
	private readonly activeSurfaces = new Map<CodeWindow, number>();
	private readonly editableAttachments = new LRUCache<object, IScreenshotToolEditable>(MAX_EDITABLE_ATTACHMENTS);
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
		@IEditorService private readonly editorService: IEditorService,
	) {
		super();
		this.activeContext = ScreenshotToolActiveContext.bindTo(contextKeyService);
	}

	/** Desktop windows can capture themselves, while the web would ask the user to pick a screen. */
	get isSupported(): boolean {
		return isNative;
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
		});
	}

	registerEditableAttachment(attachment: object, screenshot: IScreenshotToolEditable): void {
		this.editableAttachments.set(attachment, screenshot);
	}

	getEditableAttachment(attachment: object): IScreenshotToolEditable | undefined {
		return this.editableAttachments.get(attachment);
	}

	focus(): void {
		const sessions = [...this.sessions];
		const [, session] = sessions.find(([targetWindow]) => targetWindow.document.hasFocus()) ?? sessions.at(-1) ?? [];
		if (session?.surface) {
			session.surface.focus();
		} else {
			[...this.markUps].at(-1)?.focus();
		}
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

	async captureWindow(targetWindow: CodeWindow): Promise<IScreenshotToolImage | undefined> {
		try {
			return (await this.captureWindowArea(targetWindow, undefined, false))?.image;
		} catch (error) {
			this.logService.error('[ScreenshotTool] Capturing the window failed:', error);
			return undefined;
		}
	}

	async edit(screenshot: IScreenshotToolEditable, surface: ScreenshotToolSurface): Promise<IScreenshotToolEdit | undefined> {
		// The Images Preview opens as a modal editor in the main window, which comes to the front, and focus goes back to a reporter in its own window afterwards.
		const previousWindow = getActiveWindow();
		const previousFocus = previousWindow.document.activeElement;
		const outcome = new DeferredPromise<IScreenshotToolEdit | undefined>();
		const { data, mimeType } = getScreenshotToolImageData(screenshot.original);
		const input = new ImageCarouselEditorInput({
			id: generateUuid(),
			title: localize('editScreenshot', "Edit Screenshot"),
			sections: [{
				title: '',
				images: [{
					id: generateUuid(),
					name: localize('screenshot', "Screenshot"),
					mimeType,
					data,
					markUp: container => {
						const markUp = this.markUp(container, screenshot, surface);
						void markUp.result.then(edit => outcome.complete(edit));
						return toImageCarouselMarkUp(markUp);
					},
				}],
			}],
		}, 0, true);
		const closed = Event.toPromise(input.onWillDispose);
		try {
			if (previousWindow !== mainWindow) {
				await this.hostService.focus(mainWindow);
			}
			if (!await this.editorService.openEditor(input, { pinned: true })) {
				input.dispose();
				return undefined;
			}
			// The markup ends when the editor closes, unless the editor closed before it began.
			void closed.then(() => outcome.complete(undefined));
			const edit = await outcome.p;
			await closed;
			return edit;
		} catch (error) {
			this.logService.error('[ScreenshotTool] Editing a screenshot failed:', error);
			input.dispose();
			return undefined;
		} finally {
			if (previousWindow !== mainWindow && !previousWindow.closed) {
				await this.hostService.focus(previousWindow);
				if (isHTMLElement(previousFocus) && previousFocus.isConnected) {
					previousFocus.focus();
				}
			}
		}
	}

	markUp(container: HTMLElement, screenshot: IScreenshotToolEditable | Promise<IScreenshotToolEditable>, surface: ScreenshotToolSurface): IScreenshotToolMarkUp {
		const store = new DisposableStore();
		const result = new DeferredPromise<IScreenshotToolEdit | undefined>();
		const stopWatch = StopWatch.create(false);
		let editor: ScreenshotAnnotationEditor | undefined;
		let editable: IScreenshotToolEditable | undefined;
		let focusRequested = false;
		const markUp: IScreenshotToolMarkUp = {
			result: result.p,
			focus: () => {
				focusRequested = true;
				editor?.focus();
			},
			finish: () => {
				if (editor) {
					editor.finish();
				} else {
					void result.complete(undefined);
				}
			},
			dispose: () => {
				void result.complete(undefined);
				store.dispose();
			},
		};
		const targetWindow = getWindow(container);
		this.markUps.add(markUp);
		this.setActive(targetWindow, true);
		store.add(toDisposable(() => {
			this.markUps.delete(markUp);
			this.setActive(targetWindow, false);
		}));

		const show = (loaded: IScreenshotToolEditable) => {
			if (result.isSettled) {
				return;
			}
			editable = loaded;
			const annotationEditor = editor = new ScreenshotAnnotationEditor(loaded.original, container, loaded.annotationState);
			store.add(toDisposable(() => annotationEditor.dispose()));
			for (const type of [EventType.KEY_DOWN, EventType.KEY_UP]) {
				// Workbench shortcuts would act on what is underneath the markup and take focus from it.
				store.add(addDisposableListener(annotationEditor.element, type, (e: KeyboardEvent) => {
					if (!this.isAccessibilityHelpKey(new StandardKeyboardEvent(e))) {
						e.stopPropagation();
					}
				}));
			}
			store.add(annotationEditor.onDidSave(saved => void result.complete({
				original: loaded.original,
				annotationState: saved.state,
				image: saved.annotated ? { dataUrl: saved.dataUrl, width: saved.width, height: saved.height } : loaded.original,
				annotated: saved.annotated,
			})));
			store.add(annotationEditor.onDidCancel(() => void result.complete(undefined)));
			if (focusRequested) {
				annotationEditor.focus();
			}
		};
		if (isThenable(screenshot)) {
			screenshot.then(show, error => {
				this.logService.error('[ScreenshotTool] Loading a screenshot to mark up failed:', error);
				void result.complete(undefined);
			});
		} else {
			show(screenshot);
		}

		void result.p.then(edit => {
			store.dispose();
			this.telemetryService.publicLog2<ScreenshotToolEditEvent, ScreenshotToolEditClassification>('screenshotTool.edit', {
				surface,
				changed: !!edit,
				annotated: edit ? edit.annotated : !!editable?.annotationState?.actions.length || !!editable?.annotationState?.crop,
				durationMs: Math.round(stopWatch.elapsed()),
			});
		});
		return markUp;
	}

	private setActive(targetWindow: CodeWindow, active: boolean): void {
		const count = (this.activeSurfaces.get(targetWindow) ?? 0) + (active ? 1 : -1);
		if (count > 0) {
			this.activeSurfaces.set(targetWindow, count);
		} else {
			this.activeSurfaces.delete(targetWindow);
		}
		this.activeContext.set(this.activeSurfaces.size > 0);
		if (count === (active ? 1 : 0)) {
			this._onDidChangeActive.fire({ targetWindow, active });
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
				this.setActive(targetWindow, false);
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
		this.setActive(targetWindow, true);
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

	private async capturePage(layer: IScreenshotToolLayer): Promise<Omit<ICapture, 'mode'> | undefined> {
		const url = layer.url;
		try {
			const content = await layer.capture();
			if (content?.data.byteLength) {
				return { image: await createScreenshotToolImage(content.data, content.mimeType), layerUrls: [url] };
			}
		} catch (error) {
			this.logService.warn('[ScreenshotTool] Capturing a page failed, capturing the window instead:', error);
		}
		return undefined;
	}

	/**
	 * Captures the window or an area of it, painting layers that the window capture misses over it. Layers that other UI
	 * covers keep the placeholder under that UI, as the user sees them.
	 */
	private async captureWindowArea(targetWindow: CodeWindow, area: IScreenshotRect | undefined, afterOverlay: boolean): Promise<Omit<ICapture, 'mode'> | undefined> {
		if (afterOverlay) {
			await timeout(OVERLAY_REMOVAL_DELAY);
		}
		const bounds: IScreenshotRect = { x: 0, y: 0, width: targetWindow.innerWidth, height: targetWindow.innerHeight };
		const target = area ?? bounds;
		const shownLayers = this.getVisibleLayers(targetWindow).filter(({ rect }) => intersect(rect, target));
		const layerUrls = shownLayers.map(({ layer }) => layer.url);
		const layers = shownLayers.filter(({ layer }) => !layer.covered);
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
			return { image: { dataUrl: windowDataUrl, width: windowImage.naturalWidth, height: windowImage.naturalHeight }, layerUrls };
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
		}
		return { image: { dataUrl: canvas.toDataURL('image/png'), width: canvas.width, height: canvas.height }, layerUrls };
	}

	private getClickLayer(targetWindow: CodeWindow, x: number, y: number): ILayerBounds | undefined {
		return this.getVisibleLayers(targetWindow).find(({ layer, rect }) => layer.capturesOnClick && !layer.covered && contains(rect, x, y));
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
