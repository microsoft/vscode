/* eslint-disable header/header */

// @Himanshu: This Overlay layout is messed up.
// its not maintainable and iterable.
// Simplyfy this.
// why open and show are two different functions?
// extract out the styles into css files.
// fullscreen? container? webview? popupAreaOverlay? should be just one thing.
// display, opacity, z-index, transition, etc.
// this should be just skeleton, full control should be inside submodule for layout.

import { Part } from "../../../../workbench/browser/part.js";
import {
	IWorkbenchLayoutService,
	Parts,
} from "../../../../workbench/services/layout/browser/layoutService.js";
import { IThemeService } from "../../../../platform/theme/common/themeService.js";
import { IStorageService } from "../../../../platform/storage/common/storage.js";
import { $, getActiveWindow } from "../../../../base/browser/dom.js";
import { CancellationTokenSource } from "../../../../base/common/cancellation.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { WebviewExtensionDescription } from "../../../../workbench/contrib/webview/browser/webview.js";

import {
	IWebviewViewService,
	WebviewView,
} from "../../../../workbench/contrib/webviewView/browser/webviewViewService.js";
import { WebviewService } from "../../../../workbench/contrib/webview/browser/webviewService.js";
import { URI } from "../../../../base/common/uri.js";
import { ExtensionIdentifier } from "../../../../platform/extensions/common/extensions.js";
import { IEditorGroupsService } from "../../../../workbench/services/editor/common/editorGroupsService.js";
import { PEARAI_FIRST_LAUNCH_KEY } from "./common.js";

// const PEARAI_FIRST_LAUNCH_KEY = "pearai.firstLaunch";

const PEARAI_CHAT_ID = "pearai.chatView";
const PEAR_OVERLAY_TITLE = "pearai.overlayView";

export class PearOverlayPart extends Part {
	static readonly ID = "workbench.parts.pearoverlay";

	readonly minimumWidth: number = 300;
	readonly maximumWidth: number = 800;
	readonly minimumHeight: number = 200;
	readonly maximumHeight: number = 600;

	private fullScreenOverlay: HTMLElement | undefined;
	private popupAreaOverlay: HTMLElement | undefined;
	private webviewView: WebviewView | undefined;
	private _webviewService: WebviewService | undefined;

	private state: "loading" | "open" | "closed" = "loading";
	private _isLocked: boolean = false;
	private loadingOverlay: HTMLElement | undefined;
	private isExtensionReady: boolean = false;
	// private _storageService: IStorageService;
	private isFirstLaunch: boolean;

	constructor(
		@IThemeService themeService: IThemeService,
		@IStorageService storageService: IStorageService,
		@IWorkbenchLayoutService layoutService: IWorkbenchLayoutService,
		@IWebviewViewService
		private readonly _webviewViewService: IWebviewViewService,
		@IInstantiationService
		private readonly _instantiationService: IInstantiationService,
		@IEditorGroupsService
		private readonly _editorGroupsService: IEditorGroupsService,
	) {
		super(
			PearOverlayPart.ID,
			{ hasTitle: false },
			themeService,
			storageService,
			layoutService,
		);
		this.isFirstLaunch = !storageService.getBoolean(PEARAI_FIRST_LAUNCH_KEY, 0);

		// this._storageService = storageService;
		this._webviewService =
			this._instantiationService.createInstance(WebviewService);

		this.initialize();
	}

	isVisible(): boolean {
		return this.state === "open";
	}

	private async initialize() {
		// Only set initial state to open if it's first launch
		console.log("I AM HERE", this.isFirstLaunch);
		if (this.isFirstLaunch) {
			this.state = "open";
			this.lock();
		} else {
			this.state = "closed";
		}

		const extensionDescription: WebviewExtensionDescription = {
			id: new ExtensionIdentifier(PEARAI_CHAT_ID),
			location: URI.parse(""),
		};

		// 1. create an IOverlayWebview
		const webview = this._webviewService!.createWebviewOverlay({
			title: PEAR_OVERLAY_TITLE,
			options: {
				enableFindWidget: false,
			},
			contentOptions: {
				allowScripts: true,
				localResourceRoots: [],
			},
			extension: extensionDescription,
		});

		// Ensure the overlay is visible immediately
		webview.container.style.display = this.isFirstLaunch ? "flex" : "none";
		webview.container.style.opacity = this.isFirstLaunch ? "1" : "0";
		webview.container.style.zIndex = this.isFirstLaunch ? "1000" : "-1"; // Ensure proper z-index on first launch
		webview.container.style.transition = "opacity 0.3s ease-in";
		webview.container.style.position = "absolute"; // Ensure proper stacking

		webview.claim(this, getActiveWindow(), undefined);

		// 2. initialize this.webviewView by creating a WebviewView
		this.webviewView = {
			webview,
			onDidChangeVisibility: () => {
				return { dispose: () => {} };
			},
			onDispose: () => {
				return { dispose: () => {} };
			},

			get title(): string | undefined {
				return PEAR_OVERLAY_TITLE;
			},
			set title(value: string | undefined) {},

			get description(): string | undefined {
				return undefined;
			},
			set description(value: string | undefined) {},

			get badge() {
				return undefined;
			},
			set badge(badge) {},

			dispose: () => {},

			show: (preserveFocus) => {},
		};

		// 3. ask the webviewViewService to connect our webviewView to the webviewViewProvider, PearInventoryPanel
		const source = new CancellationTokenSource(); // todo add to disposables

		await this._webviewViewService.resolve(
			PEARAI_CHAT_ID,
			this.webviewView!,
			source.token,
		);

		// if both content and webview are ready, end loading state and open
		if (this.popupAreaOverlay && this.webviewView) {
			this.webviewView.webview.layoutWebviewOverElement(this.popupAreaOverlay);
			// Only open on first launch
			if (this.isFirstLaunch) {
				this.open();
			}
		} else {
			// Show loading overlay only if it's first launch
			if (this.isFirstLaunch && this.loadingOverlay) {
				this.loadingOverlay.style.display = "flex";
			}
		}

		// Set initial visibility of webview container based on first launch
		webview.container.style.display = this.isFirstLaunch ? "flex" : "none";
		webview.container.style.opacity = this.isFirstLaunch ? "1" : "0";
		webview.container.style.transition = "opacity 0.3s ease-in";
	}

	protected override createContentArea(element: HTMLElement): HTMLElement {
		// create the full screen overlay. this serves as a click target for closing pearai
		this.element = element;
		this.fullScreenOverlay = element; // use the pearOverlayPart root element as the fullScreenOverlay
		this.fullScreenOverlay.style.zIndex = this.isFirstLaunch ? "95" : "-10"; // Only show on first launch
		this.fullScreenOverlay.style.position = "absolute";
		this.fullScreenOverlay.style.top = "0";
		this.fullScreenOverlay.style.left = "0";
		this.fullScreenOverlay.style.right = "0";
		this.fullScreenOverlay.style.bottom = "0";
		this.fullScreenOverlay.style.backgroundColor = "rgba(0, 0, 0, 0.5)";
		// this.fullScreenOverlay.style.pointerEvents = "none"; // Ignore clicks on the full screen overlay
		this.fullScreenOverlay!.style.backgroundColor = "rgba(0, 0, 0, 0.5)"; // Darken the overlay

		// create the popup area overlay. this is just a target for webview to layout over
		this.popupAreaOverlay = $("div.pearai-popup-area-overlay");
		this.popupAreaOverlay.style.position = "absolute";
		this.popupAreaOverlay.style.margin = "0";
		this.popupAreaOverlay.style.top = "0";
		this.popupAreaOverlay.style.left = "0";
		this.popupAreaOverlay.style.right = "0";
		this.popupAreaOverlay.style.bottom = "0";
		this.element.appendChild(this.popupAreaOverlay);

		if (this.isFirstLaunch) {
			// Create loading overlay with higher z-index and pointer-events handling
			this.loadingOverlay = $('div.pearai-loading-overlay');
			this.loadingOverlay.style.position = 'fixed'; // Change to fixed positioning
			this.loadingOverlay.style.top = '0';
			this.loadingOverlay.style.left = '0';
			this.loadingOverlay.style.right = '0';
			this.loadingOverlay.style.bottom = '0';
			this.loadingOverlay.style.backgroundColor = 'var(--vscode-editor-background)';
			this.loadingOverlay.style.zIndex = '9999'; // Much higher z-index
			this.loadingOverlay.style.display = 'flex';
			this.loadingOverlay.style.alignItems = 'center';
			this.loadingOverlay.style.justifyContent = 'center';
			this.loadingOverlay.style.pointerEvents = 'all'; // Ensure it blocks interactions

			const loadingText = $('div.loading-text');
			loadingText.textContent = 'Getting ready to make something great...';
			loadingText.style.color = '#839497';
			loadingText.style.fontSize = '20px';
			// loadingText.addEventListener('click', () => {
			// 	this.hideOverlayLoadingMessage();
			// });

			this.loadingOverlay.appendChild(loadingText);
			this.element.appendChild(this.loadingOverlay);
		}

		// // Add message listener to webview for extension ready event
		// this.webviewView?.webview.onMessage(message => {
		// 	if (message.type === 'extension-ready') {
		// 		this.hideLoadingOverlay();
		// 	}
		// });

		// if both content and webview are ready, end loading state and open
		if (this.popupAreaOverlay && this.webviewView) {
			this.webviewView.webview.layoutWebviewOverElement(this.popupAreaOverlay);
			// Only open on first launch
			if (this.isFirstLaunch) {
				this.open();
			}
			else {
				// createContentArea is called within the workbench and layout when instantiating the overlay.
				// If we don't close it here, it will open up by default when editor starts, or appear for half a second.
				// If we remove this completely, it gets stuck in the loading stage, so we must close it.
				this.close();
			}
		} else {
			// Show loading overlay only if it's first launch
			if (this.isFirstLaunch && this.loadingOverlay) {
				this.loadingOverlay.style.display = "flex";
			}
		}

		return this.fullScreenOverlay!;
	}

	override layout(
		width: number,
		height: number,
		top: number,
		left: number,
	): void {
		super.layout(width, height, top, left);
		if (this.fullScreenOverlay) {
			this.fullScreenOverlay!.style.width = `${width}px`;
			this.fullScreenOverlay!.style.height = `${height}px`;
		}

		if (this.popupAreaOverlay) {
			this.popupAreaOverlay.style.width = `${width}px`;
			this.popupAreaOverlay.style.height = `${height}px`;
			this.popupAreaOverlay.style.backgroundColor = "transparent";
			this.popupAreaOverlay.style.borderRadius = "12px";
		}

		if (this.state === "open") {
			this.webviewView!.webview.layoutWebviewOverElement(
				this.popupAreaOverlay!,
			);
		}
	}

	private open() {
		if (this.state === "open") {
			return;
		}
		this.state = "open";
		this.fullScreenOverlay!.style.zIndex = "95";

		const container = this.webviewView!.webview.container;
		container.style.display = "flex";
		container.style.zIndex = "1000";
		container.style.display = 'flex';
		container.style.opacity = '1';

		// Show loading overlay if extension is not ready
		if (!this.isExtensionReady && this.loadingOverlay) {
			this.loadingOverlay.style.display = "flex";
		}

		this.fullScreenOverlay?.addEventListener("click", () => {
			// TODO: If we are in the tutorial, don't close
			this.close();
		});

		this.webviewView!.webview.layoutWebviewOverElement(this.popupAreaOverlay!);
		this.focus();
	}

	private close() {
		if (this.isLocked) {
			return; // Prevent closing when locked
		}

		if (this.state === "closed") {
			return;
		}
		this.state = "closed";
		const container = this.webviewView!.webview.container;

		// Apply fade-out animation
		container.style.animation = "pearaiFadeOut 0.2s ease-out";

		// Hide elements after animation completes
		setTimeout(() => {
			this.fullScreenOverlay!.style.zIndex = "-10";
			container.style.display = "none";

			// Focus the active editor
			this._editorGroupsService.activeGroup.focus();
		}, 20); // 20ms matches the animation duration
	}

	private toggleOpenClose() {
		this.state === "open" ? this.close() : this.open();
	}

	focus(): void {
		if (this.webviewView) {
			this.webviewView.webview.focus();
		}
	}

	show(): void {
		if (this.state === "loading") {
			console.warn("Can't open PearAI while loading");
			return;
		}

		this.open();
	}

	hide(): void {
		if (this.state === "loading") {
			console.warn("Can't close PearAI while loading");
			return;
		}
		this.close();
	}

	toggle(): void {
		if (this.state === "loading") {
			console.warn("Can't toggle PearAI while loading");
			return;
		}
		this.toggleOpenClose();
	}

	public lock(): void {
		this._isLocked = true;
	}

	public unlock(): void {
		this._isLocked = false;
	}

	public get isLocked(): boolean {
		return this._isLocked;
	}

	public hideOverlayLoadingMessage(): void {
		if (this.loadingOverlay) {
			// Start fade out of loading overlay
			this.loadingOverlay.style.transition = 'all 0.3s ease-out';
			this.loadingOverlay.style.opacity = '0';
			this.loadingOverlay.style.pointerEvents = 'none';

			// Only show webview if we're in the "open" state
			const container = this.webviewView!.webview.container;
			if (this.state === "open") {
				// Ensure proper z-index stacking
				container.style.zIndex = '1000';
				this.fullScreenOverlay!.style.zIndex = '95';

				container.style.display = 'flex';
				container.style.opacity = '0';
				container.style.transition = 'opacity 0.3s ease-in';

				// Slight delay to ensure smooth transition
				setTimeout(() => {
					container.style.opacity = '1';
				}, 50);
			} else {
				container.style.display = 'none';
				container.style.opacity = '0';
				this.fullScreenOverlay!.style.zIndex = '-10';
			}

			// Clean up after animations complete
			setTimeout(() => {
				if (this.loadingOverlay) {
					this.loadingOverlay.style.display = 'none';
					this.loadingOverlay.style.zIndex = '-1'; // Move it below everything
					this.isExtensionReady = true;
				}
			}, 300);
		}
	}

	toJSON(): object {
		return {
			type: Parts.PEAROVERLAY_PART,
		};
	}
}
