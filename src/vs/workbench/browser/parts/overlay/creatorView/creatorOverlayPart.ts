/* eslint-disable local/code-no-unexternalized-strings */
/* eslint-disable header/header */

import { Part } from "../../../../../workbench/browser/part.js";
import {
	IWorkbenchLayoutService,
	Parts,
} from "../../../../../workbench/services/layout/browser/layoutService.js";
import { IThemeService } from "../../../../../platform/theme/common/themeService.js";
import { IStorageService } from "../../../../../platform/storage/common/storage.js";
import { getActiveWindow } from "../../../../../base/browser/dom.js";
import { CancellationTokenSource } from "../../../../../base/common/cancellation.js";
import { IInstantiationService } from "../../../../../platform/instantiation/common/instantiation.js";
import { IWebviewElement, WebviewExtensionDescription } from "../../../../../workbench/contrib/webview/browser/webview.js";
import {
	IWebviewViewService,
	WebviewView,
} from "../../../../../workbench/contrib/webviewView/browser/webviewViewService.js";
import { WebviewService } from "../../../../../workbench/contrib/webview/browser/webviewService.js";
import { URI } from "../../../../../base/common/uri.js";
import { ExtensionIdentifier } from "../../../../../platform/extensions/common/extensions.js";
import { IEditorGroupsService } from "../../../../../workbench/services/editor/common/editorGroupsService.js";
import { Emitter } from "../../../../../base/common/event.js";

const CREATOR_VIEW_ID = "pearai.creatorView";
const CREATOR_OVERLAY_TITLE = "pearai.creatorOverlayView";

const MAX_OVERLAY_HEIGHT = "90vh";

export class CreatorOverlayPart extends Part {
	static readonly ID = "workbench.parts.pearcreatoroverlay";

	readonly minimumWidth: number = 300;
	readonly maximumWidth: number = 800;
	readonly minimumHeight: number = 200;
	readonly maximumHeight: number = 600;

	private overlayContainer: HTMLElement | undefined;
	private webviewElement: IWebviewElement | undefined;
	private webviewView: WebviewView | undefined;
	private _webviewService: WebviewService | undefined;
	private closeHandler: ((event: MouseEvent) => void) | undefined;

	private state: "loading" | "open" | "closed" = "loading";
	private _isLocked: boolean = false;
	private initializedWebview: boolean = false;

	// Flag to enable/disable webview functionality
	private _webviewEnabled: boolean = true;

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
			CreatorOverlayPart.ID,
			{ hasTitle: false },
			themeService,
			storageService,
			layoutService,
		);

		this._webviewService =
			this._instantiationService.createInstance(WebviewService);

		this.initialize();
	}

	isVisible(): boolean {
		return this.state === "open";
	}

	/**
	 * Enable or disable webview functionality
	 * @param enabled Whether webview functionality should be enabled
	 */
	public setWebviewEnabled(enabled: boolean): void {
		this._webviewEnabled = enabled;
		console.log(`Webview functionality ${enabled ? "enabled" : "disabled"}`);
	}

	/**
	 * Check if webview functionality is enabled
	 */
	public get isWebviewEnabled(): boolean {
		return this._webviewEnabled;
	}

	private initializingPromise: Promise<void> | null = null;

	/**
	 * Initialize the overlay part - can be called with or without webview functionality
	 */
	private async initialize() {
		// If already initialized and we don't need webview, don't do anything
		if (this.initializedWebview && this._webviewEnabled) {
			console.log("Webview already initialized, skipping initialization");
			return;
		}

		// If we're already in the process of initializing, return the existing promise
		if (this.initializingPromise) {
			console.log(
				"Initialization already in progress, waiting for it to complete",
			);
			return this.initializingPromise;
		}

		// Create a new initialization promise
		this.initializingPromise = new Promise<void>(async (resolve) => {
			try {
				this.state = "loading";

				// Initialize webview only if enabled
				if (this._webviewEnabled) {
					await this.initializeWebview();
				} else {
					console.log(
						"Webview functionality disabled, skipping webview initialization",
					);
				}

				this.state = "closed";
				resolve();
			} catch (error) {
				console.error("Critical error during initialization:", error);
				this.state = "closed";
				resolve();
			} finally {
				// Clear the promise once we're done
				this.initializingPromise = null;
			}
		});

		return this.initializingPromise;
	}

	/**
	 * Initialize only the webview-related functionality
	 */
	private async initializeWebview(): Promise<void> {
		if (this.initializedWebview) {
			return;
		}

		try {
			const extensionDescription: WebviewExtensionDescription = {
				id: new ExtensionIdentifier(CREATOR_VIEW_ID),
				location: URI.parse(""),
			};

			// Create a regular webview element
			this.webviewElement = this._webviewService!.createWebviewElement({
				title: CREATOR_OVERLAY_TITLE,
				options: {
					enableFindWidget: false,
				},
				contentOptions: {
					allowScripts: true,
					localResourceRoots: [],
				},
				extension: extensionDescription,
			});

			console.log("Created webview element:", this.webviewElement);

			// Create visibility change emitter
			const onDidChangeVisibilityEmitter = new Emitter<boolean>();

			// Create dispose emitter
			const onDisposeEmitter = new Emitter<void>();

			// Create WebviewView wrapper
			this.webviewView = {
				// Use the webviewElement as if it were an overlay webview
				// This is a hack but it works since we're just passing it to resolve
				webview: this.webviewElement as any,
				onDidChangeVisibility: onDidChangeVisibilityEmitter.event,
				onDispose: onDisposeEmitter.event,

				get title(): string | undefined {
					return CREATOR_OVERLAY_TITLE;
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

				dispose: () => {
					onDisposeEmitter.fire();
				},

				show: (preserveFocus) => {
					onDidChangeVisibilityEmitter.fire(true);
				},
			};

			// Connect webviewView to the provider
			const source = new CancellationTokenSource();
			try {
				console.log("RESOLVING CreatorOverlayPart WEBVIEW SERVICE....");

				await this._webviewViewService.resolve(
					CREATOR_VIEW_ID,
					this.webviewView,
					source.token,
				);

				console.log("WEBVIEW CreatorOverlayPart SERVICE RESOLVED!");
			} catch (error) {
				console.error("Failed to resolve creator view:", error);
				// Continue despite error - we'll still mark as initialized
			} finally {
				// Always mark as initialized when we're done trying
				this.initializedWebview = true;
			}
		} catch (error) {
			console.error("Error initializing webview:", error);
			throw error;
		}
	}

	protected override createContentArea(element: HTMLElement): HTMLElement {
		this.element = element;

		// Create a container for the PearCreatorOverlayPart that covers the entire screen
		this.overlayContainer = document.createElement("div");
		this.overlayContainer.style.position = "fixed";
		this.overlayContainer.style.top = "0";
		this.overlayContainer.style.left = "0";
		this.overlayContainer.style.width = "100vw";
		this.overlayContainer.style.height = "100vh";
		this.overlayContainer.style.zIndex = "9999997"; // High z-index
		this.overlayContainer.style.display = "none"; // Hidden by default
		this.overlayContainer.classList.add("pearcreatoroverlay-part-container");
		this.overlayContainer.style.backgroundColor = 'transparent';

		// The container must be at the top level of the document
		document.body.appendChild(this.overlayContainer);

		return this.overlayContainer;
	}

	private openInProgress = false;

	private async open() {
		// Prevent multiple simultaneous open attempts
		if (this.openInProgress) {
			console.log("Open already in progress, skipping");
			return;
		}

		this.openInProgress = true;

		try {
			// Make sure initialization is complete before opening
			if (this.state === "loading") {
				console.log("Overlay not initialized yet, initializing...");
				await this.initialize();
				//@ts-expect-error t
				if (this.state === "open") {
					this.openInProgress = false;
					return;
				}
			}

			// If webview is enabled but not initialized, initialize it now
			if (this._webviewEnabled && !this.initializedWebview) {
				await this.initializeWebview();
			}

			if(!this.webviewElement) {
				throw new Error("webviewElement is not initialized");
			}

			await this.handleSlideAnimation("down");

			if (this.state === "open" || !this.overlayContainer) {
				this.openInProgress = false;
				return;
			}

			console.log("Opening overlay view");
			this.state = "open";

			// Show our overlay container
			this.overlayContainer.style.display = "block";

			// Mount the webview to our overlay container - this is the key
			console.log("Mounting webview to overlay container");
			this.webviewElement.mountTo(this.overlayContainer, getActiveWindow());

			// Remove previous click handler if exists
			if (this.closeHandler) {
				this.overlayContainer.removeEventListener("click", this.closeHandler);
			}

			// Create and store new click handler
			this.closeHandler = (event) => {
				// Only close if clicking directly on the overlay (not on the content)
				if (!this.isLocked && event.target === this.overlayContainer) {
					this.close();
				}
			};

			this.overlayContainer.addEventListener("click", this.closeHandler);

			// Notify that the view is now visible
			if (this.webviewView) {
				this.webviewView.show(false);
			}

			this.focus();
		} finally {
			this.openInProgress = false;
		}
	}

	private close() {
		if (this.isLocked || this.state === "closed" || !this.overlayContainer) {
			return;
		}

		console.log("Closing overlay view");

		// Add a slide-up animation when closing
		this.handleSlideAnimation("up").then(() => {
			this.state = "closed";

			// Hide our overlay container (which hides the webview)
			this.overlayContainer!.style.display = "none";

			// Focus the active editor
			this._editorGroupsService.activeGroup.focus();
		});
	}

	private toggleOpenClose() {
		this.state === "open" ? this.close() : this.open();
	}

	focus(): void {
		if (this._webviewEnabled && this.webviewElement) {
			this.webviewElement.focus();
		}
	}

	show(): void {
		console.log("CREATOR OVERLAY: show() called");

		// Prevent calling open() if we're already open to avoid duplicate animations
		if (this.state !== "open") {
			this.open();
		}
	}

	hide(): void {
		// Prevent calling close() if we're already closed
		if (this.state !== "closed") {
			this.close();
		}
	}

	toggle(): void {
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

	public hideOverlayLoadingMessage(): void {}

	private getTopOfBodyElement(): HTMLElement {
		const existingElement = document.getElementById(
			"top-of-body-injected-container",
		);
		if (existingElement) {
			return existingElement;
		}
		// Create the container element for slide-down animation
		const topOfBodyElement = document.createElement("div");
		topOfBodyElement.style.position = "relative"; // Use fixed positioning
		topOfBodyElement.style.top = "0";
		topOfBodyElement.style.left = "0";
		topOfBodyElement.style.width = "100%";
		topOfBodyElement.style.backgroundColor = "#FFFFFF";
		topOfBodyElement.style.display = "block";
		topOfBodyElement.style.overflow = "hidden";
		topOfBodyElement.style.transition =
			"height 500ms cubic-bezier(0.25, 0.1, 0.25, 1.5)";
		topOfBodyElement.style.zIndex = "20"; // Very high z-index
		topOfBodyElement.setAttribute("id", "top-of-body-injected-container");

		// Add to body as direct child
		document.body.insertBefore(topOfBodyElement, document.body.firstChild);

		return topOfBodyElement;
	}

	private getBlurOverlayElement(): HTMLElement {
		const existingElement = document.getElementById("blurred-container");
		if (existingElement) {
			return existingElement;
		}

		// Create the blurred container element
		const blurOverlayElement = document.createElement("div");
		blurOverlayElement.id = "blurred-container";
		blurOverlayElement.style.width = "100%";
		blurOverlayElement.style.height = "90vh";
		blurOverlayElement.style.display = "block";
		blurOverlayElement.style.overflow = "hidden";
		blurOverlayElement.style.zIndex = "20"; // Higher than top body
		blurOverlayElement.style.transition =
			"opacity 500ms cubic-bezier(0.25, 0.1, 0.25, 1.5)";
		blurOverlayElement.style.backdropFilter = "blur(8px)";
		blurOverlayElement.style.pointerEvents = "none";
		blurOverlayElement.style.position = "relative"; // Fixed position
		blurOverlayElement.style.top = "0";
		blurOverlayElement.style.left = "0";
		blurOverlayElement.style.opacity = "1";

		const blurGradient = document.createElement("div");

		blurGradient.style.width = "100%";
		blurGradient.style.height = "10vh";
		blurGradient.style.zIndex = "10000002"; // Higher than blur element
		blurGradient.style.background =
			"linear-gradient(to bottom, rgba(255, 255, 255, 1) 0%, rgba(255, 255, 255, 0.9) 20%, rgba(255, 255, 255, 0.7) 30%, rgba(255, 255, 255, 0.3) 80%, rgba(255, 255, 255, 0) 100%)";
		blurGradient.style.position = "absolute";
		blurGradient.style.top = "0";
		blurGradient.style.left = "0";

		blurOverlayElement.appendChild(blurGradient);

		const topOfBodyElement = this.getTopOfBodyElement();

		topOfBodyElement.after(blurOverlayElement);

		return blurOverlayElement;
	}

	private handleSlideAnimation(direction: "up" | "down"): Promise<void> {
		return new Promise((resolve) => {
			// Create the container element for slide-down animation
			const topOfBodyElement = this.getTopOfBodyElement();
			const blurryElement = this.getBlurOverlayElement();

			topOfBodyElement.style.height =
				direction === "up" ? MAX_OVERLAY_HEIGHT : "0";

			// Force layout reflow before starting animation
			void topOfBodyElement.offsetWidth;

			// Start animation - expand to full height
			requestAnimationFrame(() => {
				if (!topOfBodyElement || !topOfBodyElement.parentNode) {
					console.warn("topOfBodyElement not found in request animation frame");
					return resolve();
				}

				topOfBodyElement.style.height =
					direction === "up" ? "0" : MAX_OVERLAY_HEIGHT;
				blurryElement.style.opacity = direction === "up" ? "0" : "1"; // Fade in/out the blurry element

				console.log(
					"Animation started - height change to:",
					direction === "up" ? "0" : MAX_OVERLAY_HEIGHT,
				);

				// Set a single timeout for animation completion
				setTimeout(() => resolve(), 500); // Match the transition duration
			});
		});
	}

	toJSON(): object {
		return {
			type: Parts.PEARCREATOROVERLAY_PART,
		};
	}
}
