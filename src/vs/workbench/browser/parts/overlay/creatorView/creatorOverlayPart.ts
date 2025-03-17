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

	private async initialize() {
		this.state = "closed";

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
		webview.container.style.zIndex = "-9999";
		webview.container.style.transition = "opacity 0.3s ease-in";
		webview.container.style.position = "absolute";
		webview.container.setAttribute("id", "creator-overlay-webview");

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

		// Connect webviewView to the provider
		const source = new CancellationTokenSource();
		try {
			console.dir(`RESOLVING CreatorOverlayPart WEBVIEW SERVICE....`);
			await this._webviewViewService.resolve(
				CREATOR_VIEW_ID,
				this.webviewView!,
				source.token,
			);

			console.dir(`WEBVIEW CreatorOverlayPart SERVICE RESOLVED!`);
			console.dir(this.webviewView);

			// Set up layout if everything is ready
			if (this.overlayContainer && this.webviewView) {
				this.webviewView.webview.layoutWebviewOverElement(
					this.overlayContainer,
				);
			}
		} catch (error) {
			console.error("Failed to resolve creator view:", error);
		}
	}

	protected override createContentArea(element: HTMLElement): HTMLElement {
		// Use a single container for both the overlay and loading state
		this.element = element;
		this.overlayContainer = $("div.pearcreatoroverlay-part-container-inner");

		if (this.overlayContainer) {
			// Set up overlay container styles
			this.overlayContainer.style.position = "fixed";
			this.overlayContainer.style.top = "0";
			this.overlayContainer.style.left = "0";
			this.overlayContainer.style.right = "0";
			this.overlayContainer.style.bottom = "0";
			this.overlayContainer.style.zIndex = "-9999"; // Initially hidden
			this.overlayContainer.style.display = "none"; // Start with display none
			this.overlayContainer.style.alignItems = "center";
			this.overlayContainer.style.justifyContent = "center";
			this.overlayContainer.style.transition = "opacity 0.3s ease-in-out";
			this.overlayContainer.style.opacity = "0";
			this.overlayContainer.style.width = "100%";
			this.overlayContainer.style.height = "100%";
			this.overlayContainer.onclick = (event) => {
				// close the overlay if clicked outside the webview
				if (event.target === this.overlayContainer) {
					this.close();
				}
			};

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
			this.loadingText.style.backgroundColor =
				"var(--vscode-editor-foreground)";
			this.loadingText.style.color = "var(--vscode-editorGhostText-foreground)";
			this.loadingText.style.color = "#333";
			this.loadingText.style.width = "300px";
			this.loadingText.style.textAlign = "center";
			this.loadingText.style.padding = "12px 20px";
			this.loadingText.style.borderRadius = "30px";
			this.loadingText.style.position = "relative"; // Important for z-index to work
			this.loadingText.style.zIndex = "1";

			// First add the gradient background to the container
			container.appendChild(gradientBg);
			// Then add the loading text to the container
			container.appendChild(this.loadingText);

			// Add the container to the overlay container
			this.overlayContainer.appendChild(container);

			// Add the overlay container to the main element
			this.element.appendChild(this.overlayContainer);
		}

		// Set up webview layout if both are ready
		if (this.overlayContainer && this.webviewView) {
			this.webviewView.webview.layoutWebviewOverElement(this.overlayContainer);
			this.state = "closed"; // Ensure it starts closed
		}

		// Make sure the element has its initial z-index set properly
		this.element.style.zIndex = "-9999";

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

		if (this.state === "open" && this.webviewView && this.overlayContainer) {
			this.webviewView.webview.layoutWebviewOverElement(this.overlayContainer);
		}
	}

	private open() {
		if (this.state === "open" || !this.overlayContainer || !this.webviewView) {
			return;
		}

		this.state = "open";

		// Shows the parent element
		this.element.style.zIndex = "20";

		// Show the overlay container
		this.overlayContainer.style.display = "flex";
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

		if (this.webviewView && this.overlayContainer) {
			this.webviewView.webview.layoutWebviewOverElement(this.overlayContainer);
		}

		this.focus();
	}

	private close() {
		if (
			this.isLocked ||
			this.state === "closed" ||
			!this.overlayContainer ||
			!this.webviewView
		) {
			return;
		}

		this.state = "closed";

		// Hide the parent element completely
		this.element.style.zIndex = "-9999";

		// Fade out overlay container
		this.overlayContainer.style.opacity = "0";

		const container = this.webviewView.webview.container;
		if (container) {
			// Apply fade-out transition
			container.style.opacity = "0";
		}

		// Hide elements after transition completes
		setTimeout(() => {
			if (this.overlayContainer) {
				this.overlayContainer.style.zIndex = "-9999";
				this.overlayContainer.style.display = "none";
			}

			if (container) {
				container.style.zIndex = "-9999";
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

	show(): void {
		if (this.state === "loading") {
			console.warn("Can't open Creator view while loading");
			return;
		}

		// Add debug logging
		console.log("CREATOR OVERLAY: show() called");

		this.open();
	}

	hide(): void {
		if (this.state === "loading") {
			console.warn("Can't close Creator view while loading");
			return;
		}
		this.close();
	}

	toggle(): void {
		if (this.state === "loading") {
			console.warn("Can't toggle Creator view while loading");
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
		if (this.loadingText) {
			// Hide the loading text
			this.loadingText.style.transition = "opacity 0.3s ease-out";
			this.loadingText.style.opacity = "0";

			// Only show webview if we're in the "open" state
			const container = this.webviewView!.webview.container;
			if (this.state === "open" && container) {
				// Ensure proper z-index stacking
				container.style.zIndex = "1000";

				container.style.display = "flex";
				container.style.opacity = "0";
				container.style.transition = "opacity 0.3s ease-in";

				// Slight delay to ensure smooth transition
				setTimeout(() => {
					container.style.opacity = "1";
				}, 50);
			} else if (container) {
				container.style.display = "none";
				container.style.opacity = "0";
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

	toJSON(): object {
		return {
			type: Parts.PEARCREATOROVERLAY_PART,
		};
	}
}
