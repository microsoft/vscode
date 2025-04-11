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
import {
	IWebviewElement,
	WebviewExtensionDescription,
} from "../../../../../workbench/contrib/webview/browser/webview.js";
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

const ENTER_CREATOR_MODE_BTN_IDENTIFIER = ".creator-mode-button";

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

	// Track if webview needs re-initialization after close
	private needsReinit: boolean = false;

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

		// Listen for theme changes
		this._register(
			this.themeService.onDidColorThemeChange(
				(() => {
					if (this.webviewElement && this.state !== "closed") {
						this.sendThemeColorsToWebview();
						// Refreshing the colours here to keep the webview in sync
						this.getTopOfBodyElement();
						this.getBlurOverlayElement();
					}
				}).bind(this),
			),
		);

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
	private async initialize(forceReinit = false) {
		// If already initialized and we don't need webview or reinit, don't do anything
		if (this.initializedWebview && this._webviewEnabled && !forceReinit) {
			console.log("Webview already initialized, skipping initialization");
			return;
		}

		// If we're already in the process of initializing, return the existing promise
		if (this.initializingPromise && !forceReinit) {
			console.log(
				"Initialization already in progress, waiting for it to complete",
			);
			return this.initializingPromise;
		}

		// Reset initialization flag if we're forcing reinit
		if (forceReinit) {
			this.initializedWebview = false;
			this.needsReinit = false;
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
				this.needsReinit = false;
			}
		} catch (error) {
			console.error("Error initializing webview:", error);
			throw error;
		}
	}

	private sendThemeColorsToWebview() {
		const theme = this.themeService.getColorTheme();
		const colors = {
			background: theme.getColor("editor.background")?.toString(),
			foreground: theme.getColor("editor.foreground")?.toString(),
			buttonBackground: theme.getColor("button.background")?.toString(),
			buttonForeground: theme.getColor("button.foreground")?.toString(),
			buttonHoverBackground: theme
				.getColor("button.hoverBackground")
				?.toString(),
			linkForeground: theme.getColor("textLink.foreground")?.toString(),
			linkActiveForeground: theme
				.getColor("textLink.activeForeground")
				?.toString(),
			errorForeground: theme.getColor("errorForeground")?.toString(),
			focusBorder: theme.getColor("focusBorder")?.toString(),
			widgetBackground: theme.getColor("editorWidget.background")?.toString(),
			widgetForeground: theme.getColor("editorWidget.foreground")?.toString(),
		};

		this.webviewElement?.postMessage({
			messageType: "themeColors",
			data: colors,
		});
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
		this.overlayContainer.style.zIndex = "-10";
		this.overlayContainer.style.display = "none"; // Hidden by default
		this.overlayContainer.classList.add("pearcreatoroverlay-part-container");
		this.overlayContainer.style.backgroundColor = "transparent";

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
			// Removing any other iframes from the overlay container
			// This is a workaround for the issue where multiple iframes are created - works for now
			[...(this.overlayContainer?.children || [])].forEach((child) => {
				child.remove();
			});
			// If webview needs reinitialization, do that first
			if (this.needsReinit) {
				console.log("Reinitializing webview before opening");
				await this.initialize(true);
			} else {
				// Otherwise just make sure initialization is complete
				await this.initialize();
				await this.initializeWebview();
			}

			if (!this.webviewElement) {
				throw new Error("webviewElement is not initialized");
			}

			// Create animation elements if they don't exist
			const topOfBodyElement = this.getTopOfBodyElement();
			const blurryElement = this.getBlurOverlayElement();

			// Before animation, ensure the elements are visible but at starting position
			topOfBodyElement.style.display = "block";
			topOfBodyElement.style.height = "0";
			blurryElement.style.display = "block";
			blurryElement.style.opacity = "0";

			if (this.state === "open" || !this.overlayContainer) {
				this.openInProgress = false;
				return;
			}

			console.log("Opening overlay view");
			this.state = "open";

			// Show our overlay container
			this.overlayContainer.style.display = "block";
			this.overlayContainer.style.zIndex = "998"; // Match existing CSS

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

			await new Promise<void>((resolve) => {
				let resolved = false;
				setTimeout(() => {
					if (!resolved) {
						console.error("Timeout on webview, didn't load in time");
						this.sendThemeColorsToWebview();
						resolve();
					}
				}, 1500);
				this.webviewElement!.postMessage({ messageType: "ping" });
				this.webviewElement!.onMessage(async (e) => {
					if (
						e.message.messageType === "loaded" ||
						e.message.messageType === "pong"
					) {
						this.sendThemeColorsToWebview();
						resolved = true;
						resolve();
					}
				});
			});
			await this.handleSlideAnimation("down");
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
			this.overlayContainer!.style.zIndex = "-10"; // Reset to original value

			// Hide animation elements
			const topOfBodyElement = this.getTopOfBodyElement();
			topOfBodyElement.style.height = "0";

			// Focus the active editor
			this._editorGroupsService.activeGroup.focus();

			// Mark webview as needing reinitialization before next open
			this.needsReinit = true;
		});
	}

	private updateEnterCreatorButton(direction: "up" | "down") {
		const enterCreatorButton = document.querySelector(
			ENTER_CREATOR_MODE_BTN_IDENTIFIER,
		) as HTMLElement;
		if (!enterCreatorButton) {
			console.warn(
				`Enter Creator button not found (${ENTER_CREATOR_MODE_BTN_IDENTIFIER})`,
			);
			return;
		}

		// Find the text and icon elements within the button
		const textElement = enterCreatorButton.querySelector(
			'span:not([style*="position: absolute"])',
		) as HTMLElement;
		const iconElement = enterCreatorButton.querySelector(
			'span[style*="position: absolute"]',
		) as HTMLElement;

		if (!textElement || !iconElement) {
			console.warn("Button structure missing expected elements");
			return;
		}

		if (direction === "up") {
			// Fade out the icon and reset its position
			iconElement.style.opacity = "0";
			iconElement.style.left = "6px";
			iconElement.style.transform = "none";

			// Expand the button width and show text
			enterCreatorButton.style.width = "110px"; // Changed from auto to fixed width
			textElement.style.opacity = "1";
		} else {
			// Fade out the text first (faster transition set in createCreatorModeButton)
			textElement.style.opacity = "0";

			// Collapse the button width
			enterCreatorButton.style.width = "30px"; // Changed from 20px to 30px

			// Move the icon to center position and fade it in
			iconElement.style.left = "50%";
			iconElement.style.transform = "translateX(-50%)";
			iconElement.style.opacity = "1";
		}
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
		this.state === "open" ? this.close() : this.open();
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
		let topOfBodyElement = document.getElementById(
			"top-of-body-injected-container",
		) as HTMLElement;

		// Create the element if it doesn't exist yet
		if (!topOfBodyElement) {
			topOfBodyElement = document.createElement("div");
			topOfBodyElement.style.position = "relative";
			topOfBodyElement.style.top = "0";
			topOfBodyElement.style.left = "0";
			topOfBodyElement.style.width = "100%";
			topOfBodyElement.style.display = "block";
			topOfBodyElement.style.overflow = "hidden";
			topOfBodyElement.style.transition =
				"height 500ms cubic-bezier(0.4, 0, 0.2, 1)";
			topOfBodyElement.style.zIndex = "20";
			topOfBodyElement.setAttribute("id", "top-of-body-injected-container");

			// Add to body as direct child
			document.body.insertBefore(topOfBodyElement, document.body.firstChild);
		}

		// Always update the background color to ensure it matches current theme
		const backgroundColor = this.themeService
			.getColorTheme()
			.getColor("editor.background");
		topOfBodyElement.style.backgroundColor =
			backgroundColor?.toString() || "#1E1E1E";

		return topOfBodyElement;
	}

	private getBlurGradientElement(parentElement?: HTMLElement): HTMLElement {
		// Try to find existing gradient element if parent is provided
		let blurGradient: HTMLElement | null = null;
		if (parentElement) {
			blurGradient = parentElement.querySelector(
				"#blur-gradient",
			) as HTMLElement;
		}

		// Create it if it doesn't exist
		if (!blurGradient) {
			blurGradient = document.createElement("div");
			blurGradient.id = "blur-gradient";
			blurGradient.style.width = "100%";
			blurGradient.style.height = "10vh";
			blurGradient.style.zIndex = "30";
			blurGradient.style.position = "absolute";
			blurGradient.style.top = "0";
			blurGradient.style.left = "0";

			// Append to parent if provided
			if (parentElement) {
				parentElement.appendChild(blurGradient);
			}
		}

		// Always update the gradient colors to match current theme
		const bgColor = this.themeService
			.getColorTheme()
			.getColor("editor.background");
		const bgColorStr = bgColor?.toString() || "#1E1E1E";
		blurGradient.style.background = `linear-gradient(to bottom,
			${bgColorStr} 0%,
			${bgColor?.transparent(0.9).toString() || "rgba(30, 30, 30, 0.5)"} 20%,
			${bgColor?.transparent(0.7).toString() || "rgba(30, 30, 30, 0.8)"} 30%,
			${bgColor?.transparent(0.3).toString() || "rgba(30, 30, 30, 0.9)"} 80%,
			${bgColor?.transparent(0).toString() || "rgba(30, 30, 30, 1)"} 100%)`;

		return blurGradient;
	}

	private getBlurOverlayElement(): HTMLElement {
		let blurOverlayElement = document.getElementById(
			"blurred-container",
		) as HTMLElement;

		// Create the element if it doesn't exist yet
		if (!blurOverlayElement) {
			// Create the blurred container element
			blurOverlayElement = document.createElement("div");
			blurOverlayElement.id = "blurred-container";
			blurOverlayElement.style.width = "100%";
			blurOverlayElement.style.height = "90vh";
			blurOverlayElement.style.display = "none";
			blurOverlayElement.style.overflow = "hidden";
			blurOverlayElement.style.zIndex = "20";
			blurOverlayElement.style.transition =
				"opacity 500ms cubic-bezier(0.4, 0, 0.2, 1)";
			blurOverlayElement.style.backdropFilter = "blur(8px)";
			blurOverlayElement.style.pointerEvents = "none";
			blurOverlayElement.style.position = "absolute";
			blurOverlayElement.style.opacity = "0";

			const topOfBodyElement = this.getTopOfBodyElement();
			topOfBodyElement.after(blurOverlayElement);
		}

		// Get or create and update the blur gradient
		this.getBlurGradientElement(blurOverlayElement);

		return blurOverlayElement;
	}
	private handleSlideAnimation(direction: "up" | "down"): Promise<void> {
		return new Promise((resolve) => {
			// Post message to webview for animation
			if (this.webviewElement) {
				try {
					this.webviewElement.postMessage({
						messageType: "overlayAnimation",
						data: { direction },
					});
				} catch (e) {
					console.warn("Failed to post animation message to webview:", e);
				}
			}

			// Setting the button in the top right corner
			this.updateEnterCreatorButton(direction);

			// Create the container element for slide-down animation
			const topOfBodyElement = this.getTopOfBodyElement();
			const blurryElement = this.getBlurOverlayElement();

			topOfBodyElement.style.height =
				direction === "up" ? MAX_OVERLAY_HEIGHT : "0";

			// Force layout reflow before starting animation
			void topOfBodyElement.offsetWidth;

			// Start animation - expand to full height

			if (!topOfBodyElement || !topOfBodyElement.parentNode) {
				console.warn("topOfBodyElement not found in request animation frame");
				return resolve();
			}

			topOfBodyElement.style.height =
				direction === "up" ? "0" : MAX_OVERLAY_HEIGHT;
			blurryElement.style.opacity = direction === "up" ? "0" : "1"; // Fade in/out

			console.log(
				"Animation started - height change to:",
				direction === "up" ? "0" : MAX_OVERLAY_HEIGHT,
			);

			// Set a single timeout for animation completion
			setTimeout(() => resolve(), 500); // Match the transition duration
		});
	}

	toJSON(): object {
		return {
			type: Parts.PEARCREATOROVERLAY_PART,
		};
	}
}
