/* eslint-disable local/code-no-unexternalized-strings */
/* eslint-disable header/header */

import { Part } from "../../../../../workbench/browser/part.js";
import {
	IWorkbenchLayoutService,
	Parts,
} from "../../../../../workbench/services/layout/browser/layoutService.js";
import { IThemeService } from "../../../../../platform/theme/common/themeService.js";
import { IStorageService } from "../../../../../platform/storage/common/storage.js";
import { $, getActiveWindow } from "../../../../../base/browser/dom.js";
import { CancellationTokenSource } from "../../../../../base/common/cancellation.js";
import { IInstantiationService } from "../../../../../platform/instantiation/common/instantiation.js";
import { WebviewExtensionDescription } from "../../../../../workbench/contrib/webview/browser/webview.js";

import {
	IWebviewViewService,
	WebviewView,
} from "../../../../../workbench/contrib/webviewView/browser/webviewViewService.js";
import { WebviewService } from "../../../../../workbench/contrib/webview/browser/webviewService.js";
import { URI } from "../../../../../base/common/uri.js";
import { ExtensionIdentifier } from "../../../../../platform/extensions/common/extensions.js";
import { IEditorGroupsService } from "../../../../../workbench/services/editor/common/editorGroupsService.js";

const CREATOR_VIEW_ID = "pearai.roo.creatorOverlayView";
const CREATOR_OVERLAY_TITLE = "pearai.creatorOverlayView";

export class CreatorOverlayPart extends Part {
	static readonly ID = "workbench.parts.pearcreatoroverlay";

	readonly minimumWidth: number = 300;
	readonly maximumWidth: number = 800;
	readonly minimumHeight: number = 200;
	readonly maximumHeight: number = 600;

	private overlayContainer: HTMLElement | undefined;
	private webviewView: WebviewView | undefined;
	private _webviewService: WebviewService | undefined;
	private closeHandler: ((event: MouseEvent) => void) | undefined;
	private loadingText: HTMLElement | undefined;

	private state: "loading" | "open" | "closed" = "loading";
	private _isLocked: boolean = false;
	private isExtensionReady: boolean = false;
	private initializedWebview: boolean = false;

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

	private initializingPromise: Promise<void> | null = null;

	private async initialize() {
		// If already initialized, don't do anything
		if (this.initializedWebview) {
			console.log("Webview already initialized, skipping initialization");
			return;
		}

		// If we're already in the process of initializing, return the existing promise
		if (this.initializingPromise) {
			console.log("Initialization already in progress, waiting for it to complete");
			return this.initializingPromise;
		}

		// Create a new initialization promise
		this.initializingPromise = new Promise<void>(async (resolve) => {
			try {
				this.state = "loading";

				const extensionDescription: WebviewExtensionDescription = {
					id: new ExtensionIdentifier(CREATOR_VIEW_ID),
					location: URI.parse(""),
				};

				// Create the webview overlay
				const webview = this._webviewService!.createWebviewOverlay({
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

				// Set initial visibility - important for initial state
				webview.container.style.display = "none";
				webview.container.style.opacity = "0";
				webview.container.style.transition = "opacity 0.3s ease-in";
				webview.container.style.position = "absolute";
				webview.container.style.zIndex = "-1"; // Using -1 instead of -9999 to maintain proper stacking
				webview.container.setAttribute("id", "creator-overlay-webview");

				// Claim the webview
				webview.claim(this, getActiveWindow(), undefined);

				// Initialize webviewView
				this.webviewView = {
					webview,
					onDidChangeVisibility: () => {
						return { dispose: () => {} };
					},
					onDispose: () => {
						return { dispose: () => {} };
					},

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

					dispose: () => {},

					show: (preserveFocus) => {},
				};

				// Connect webviewView to the provider - only try once
				const source = new CancellationTokenSource();
				try {
					console.log("RESOLVING CreatorOverlayPart WEBVIEW SERVICE....");

					await this._webviewViewService.resolve(
						CREATOR_VIEW_ID,
						this.webviewView!,
						source.token,
					);

					console.log("WEBVIEW CreatorOverlayPart SERVICE RESOLVED!");
				} catch (error) {
					console.error("Failed to resolve creator view:", error);
					// Continue despite error - we'll still mark as initialized
				} finally {
					// Always mark as initialized and closed when we're done trying
					this.initializedWebview = true;
					this.state = "closed";

					// Set up layout if everything is ready
					if (this.overlayContainer && this.webviewView) {
						this.webviewView.webview.layoutWebviewOverElement(
							this.overlayContainer,
						);
					}

					resolve();
				}
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

	protected override createContentArea(element: HTMLElement): HTMLElement {
		this.element = element;
		this.overlayContainer = $("div.pearcreatoroverlay-part-container");

		if (!this.overlayContainer) {
			console.warn("Overlay container not found");
			return element;
		}

		// Set up overlay container styles
		this.overlayContainer.style.position = "fixed";
		this.overlayContainer.style.top = "0";
		this.overlayContainer.style.left = "0";
		this.overlayContainer.style.right = "0";
		this.overlayContainer.style.bottom = "0";
		this.overlayContainer.style.zIndex = "-1"; // Using -1 instead of -9999
		this.overlayContainer.style.display = "none";
		this.overlayContainer.style.alignItems = "center";
		this.overlayContainer.style.justifyContent = "center";
		this.overlayContainer.style.backgroundColor = "#FFFFFF";
		this.overlayContainer.style.opacity = "0";
		this.overlayContainer.style.transition = "opacity 0.3s ease-in-out";
		this.overlayContainer.style.width = "100%";
		this.overlayContainer.style.height = "100%";

		// Create container div for the gradient effect
		const container = document.createElement("div");
		container.style.position = "relative";

		// Create the gradient background element
		const gradientBg = document.createElement("div");
		gradientBg.style.position = "absolute";
		gradientBg.style.top = "-20px";
		gradientBg.style.left = "-20px";
		gradientBg.style.right = "-20px";
		gradientBg.style.bottom = "-20px";
		gradientBg.style.background =
			"linear-gradient(45deg, #ff00cc, #3333ff, #00ccff, #33cc33)";
		gradientBg.style.borderRadius = "40px";
		gradientBg.style.zIndex = "-1";
		gradientBg.style.filter = "blur(20px)";
		gradientBg.style.opacity = "0.7";

		// Create loading text
		this.loadingText = $("div.loading-text");
		this.loadingText.textContent = "Loading...";
		this.loadingText.style.fontSize = "20px";
		this.loadingText.style.backgroundColor = "var(--vscode-editor-foreground, #fff)";
		this.loadingText.style.color = "var(--vscode-editorGhostText-foreground, #333)";
		this.loadingText.style.width = "300px";
		this.loadingText.style.textAlign = "center";
		this.loadingText.style.padding = "12px 20px";
		this.loadingText.style.borderRadius = "30px";
		this.loadingText.style.position = "relative";
		this.loadingText.style.zIndex = "2";

		// First add the gradient background to the container
		container.appendChild(gradientBg);
		// Then add the loading text to the container
		container.appendChild(this.loadingText);

		// Add the container to the overlay container
		this.overlayContainer.appendChild(container);

		// Add the overlay container to the main element
		this.element.appendChild(this.overlayContainer);

		// Set up webview layout if both are ready
		if (this.overlayContainer && this.webviewView) {
			this.webviewView.webview.layoutWebviewOverElement(this.overlayContainer);
		}

		return element;
	}

	override layout(
		width: number,
		height: number,
		top: number,
		left: number,
	): void {
		super.layout(width, height, top, left);

		if (this.overlayContainer) {
			this.overlayContainer.style.width = `${width}px`;
			this.overlayContainer.style.height = `${height}px`;
		}

		if (this.webviewView && this.overlayContainer) {
			// Always layout the webview over the element
			this.webviewView.webview.layoutWebviewOverElement(this.overlayContainer);
		}
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
			// Make sure webview is initialized before opening
			if (!this.initializedWebview) {
				console.log("Webview not initialized yet, initializing...");
				await this.initialize();
				// If we're already open after initialization somehow, don't continue
				if (this.state === "open") {
					this.openInProgress = false;
					return;
				}
			}

			await this.handleSlideAnimation("down");

			if (this.state === "open" || !this.overlayContainer || !this.webviewView) {
				this.openInProgress = false;
				return;
			}

			console.log("Opening overlay view");
			this.state = "open";

			// Show the overlay container
			this.overlayContainer.style.display = "flex";
			this.overlayContainer.style.zIndex = "20";

			// Force a layout reflow before setting opacity
			void this.overlayContainer.offsetHeight;
			this.overlayContainer.style.opacity = "1";

			// Show loading text if extension is not ready
			if (!this.isExtensionReady && this.loadingText) {
				this.loadingText.style.display = "block";
			} else if (this.loadingText) {
				this.loadingText.style.display = "none";
			}

			// Show the webview container
			const container = this.webviewView.webview.container;
			if (container) {
				container.style.display = "flex";
				container.style.zIndex = "1000";
				// Force a layout reflow before setting opacity
				void container.offsetHeight;
				container.style.opacity = "1";
			}

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

			// Always update layout when opening
			if (this.webviewView && this.overlayContainer) {
				this.webviewView.webview.layoutWebviewOverElement(this.overlayContainer);
			}

			this.focus();
		} finally {
			this.openInProgress = false;
		}
	}

	private close() {
		if (this.isLocked || this.state === "closed" || !this.overlayContainer || !this.webviewView) {
			return;
		}

		console.log("Closing overlay view");

		// Start the transition by setting opacity to 0
		this.overlayContainer.style.opacity = "0";

		const container = this.webviewView.webview.container;
		if (container) {
			container.style.opacity = "0";
		}

		// Wait for the transition to complete before hiding elements
		setTimeout(() => {
			this.state = "closed";

			if (this.overlayContainer) {
				this.overlayContainer.style.zIndex = "-1";
				this.overlayContainer.style.display = "none";
			}

			if (container) {
				container.style.zIndex = "-1";
				container.style.display = "none";
			}

			// Focus the active editor
			this._editorGroupsService.activeGroup.focus();
		}, 300); // 300ms matches the transition duration
	}

	private toggleOpenClose() {
		this.state === "open" ? this.close() : this.open();
	}

	focus(): void {
		if (this.webviewView) {
			this.webviewView.webview.focus();
		}
	}

	hideLoadingOverlay(): void {
		if (this.loadingText) {
			// Immediately hide the loading text
			this.loadingText.style.display = "none";
			this.loadingText.style.opacity = "0";
		}

		// Set the extension as ready so future opens won't show loading
		this.isExtensionReady = true;

		// If we're in open state, ensure the webview is visible
		if (this.state === "open" && this.webviewView) {
			const container = this.webviewView.webview.container;
			if (container) {
				container.style.zIndex = "1000";
				container.style.display = "flex";
				container.style.opacity = "1";
			}
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

	public hideOverlayLoadingMessage(): void {
		if (this.loadingText) {
			// Hide the loading text
			this.loadingText.style.transition = "opacity 0.3s ease-out";
			this.loadingText.style.opacity = "0";

			// Only show webview if we're in the "open" state
			const container = this.webviewView?.webview.container;
			if (this.state === "open" && container) {
				// Ensure proper z-index stacking
				container.style.zIndex = "1000";
				container.style.display = "flex";
				container.style.transition = "opacity 0.3s ease-in";
				container.style.opacity = "1";
			} else if (container) {
				container.style.display = "none";
			}

			// Clean up after animations complete
			setTimeout(() => {
				if (this.loadingText) {
					this.loadingText.style.display = "none";
					this.isExtensionReady = true;
				}
			}, 300);
		}
	}

	private handleSlideAnimation(direction: "up" | "down"): Promise<void> {
		return new Promise((resolve) => {
			const {body} = document;
			const existingElement = document.getElementById("top-of-body-injected-container");
			if (existingElement) {
				existingElement.parentNode?.removeChild(existingElement);
			}

			// Create the container element for slide-down animation
			const topOfBodyElement = document.createElement("div");
			topOfBodyElement.style.position = "relative"; // Changed back to relative as requested
			topOfBodyElement.style.top = "0";
			topOfBodyElement.style.left = "0";
			topOfBodyElement.style.width = "100%";
			topOfBodyElement.style.height = direction === "up" ? "100vh" : "0";
			topOfBodyElement.style.backgroundColor = "#FFFFFF";
			topOfBodyElement.style.display = "block";
			topOfBodyElement.style.overflow = "hidden";
			topOfBodyElement.style.transition = "height 500ms ease-in-out";
			topOfBodyElement.style.zIndex = "20";
			topOfBodyElement.setAttribute("id", "top-of-body-injected-container");

			// Add to body
			body.insertBefore(topOfBodyElement, body.firstChild);

			// Force layout reflow before starting animation
			void topOfBodyElement.offsetWidth;

			// Start animation - expand to full height
			requestAnimationFrame(() => {
				if (!topOfBodyElement || !topOfBodyElement.parentNode) {
					console.warn("topOfBodyElement not found in request animation frame");
					return resolve();
				}

				topOfBodyElement.style.height = direction === "up" ? "0" : "100vh";
				console.log("Animation started - height change to:", direction === "up" ? "0" : "100vh");

				// Set a single timeout for animation completion
				setTimeout(() => {
					if (!topOfBodyElement || !topOfBodyElement.parentNode) {
						console.warn("Animation element removed before animation completed");
						return resolve();
					}

					// Remove the element after animation completes
					topOfBodyElement.parentNode.removeChild(topOfBodyElement);
					resolve();
				}, 500); // Match the transition duration
			});
		});
	}

	toJSON(): object {
		return {
			type: Parts.PEARCREATOROVERLAY_PART,
		};
	}
}
