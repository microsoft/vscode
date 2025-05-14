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
import { CommandEmitter } from "../../../../../platform/commands/browser/commandEmitter.js";

const CREATOR_VIEW_ID = "pearai.creatorView";
const CREATOR_OVERLAY_TITLE = "pearai.creatorOverlayView";

const ENTER_CREATOR_MODE_BTN_IDENTIFIER = ".creator-mode-button";

type OverlayState = {
	[key: string]: {
		[key: string]: Partial<CSSStyleDeclaration>;
	};
};

const overlayStates = {
	closed: {
		overlayContainer: {
			display: "none",
			zIndex: "-10",
		},
		topOfBody: {
			height: "0vh",
			display: "block",
		},
		blurElement: {
			opacity: "0",
			display: "none",
		},
		exitButton: {
			width: "110px",
			opacity: "1",
		},
		exitButtonIcon: {
			opacity: "0",
			left: "6px",
			transform: "none",
		},
		exitButtonText: {
			opacity: "1",
		},
		webview: {
			transform: "translateY(-100%)",
			transition: "transform 500ms cubic-bezier(0.4, 0, 0.2, 1)",
		},
	},
	open: {
		overlayContainer: {
			display: "block",
			zIndex: "998",
		},
		topOfBody: {
			height: "90vh",
			display: "block",
		},
		blurElement: {
			opacity: "1",
			display: "block",
		},
		exitButton: {
			width: "30px",
		},
		exitButtonIcon: {
			opacity: "1",
			left: "50%",
			transform: "translateX(-50%)",
		},
		exitButtonText: {
			opacity: "0",
		},
		webview: {
			transform: "translateY(0%)",
			transition: "transform 500ms cubic-bezier(0.4, 0, 0.2, 1)",
		},
	},
	overlay_closed_creator_active: {
		overlayContainer: {
			display: "none",
			zIndex: "-10",
		},
		topOfBody: {
			height: "0vh",
			display: "block",
		},
		blurElement: {
			opacity: "0",
			display: "none",
		},
		exitButton: {
			width: "30px",
		},
		exitButtonIcon: {
			opacity: "1",
			left: "50%",
			transform: "translateX(-50%)",
		},
		exitButtonText: {
			opacity: "0",
		},
		webview: {
			transform: "translateY(-100%)",
			transition: "transform 500ms cubic-bezier(0.4, 0, 0.2, 1)",
		},
	},
	loading: {
		overlayContainer: {
			display: "none",
			zIndex: "-10",
		},
		topOfBody: {
			height: "0",
			display: "none",
		},
		blurElement: {
			opacity: "0",
			display: "none",
		},
		exitButton: {
			width: "110px",
		},
		exitButtonIcon: {
			opacity: "0",
			left: "6px",
			transform: "none",
		},
		exitButtonText: {
			opacity: "1",
		},
		webview: {
			transform: "translateY(-100%)",
			transition: "transform 500ms cubic-bezier(0.4, 0, 0.2, 1)",
		},
	},
} as const satisfies OverlayState;

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

	private state: keyof typeof overlayStates = "closed";
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

		this.setupInitialState();
	}

	/**
	 * Sets up the initial state and services for the overlay part
	 */
	private setupInitialState(): void {
		// Reset all state variables to their initial values
		this.resetState();

		// Setup webview service
		if (this._webviewViewService === undefined) {
			console.log("WebviewViewService is undefined");
		}

		this._webviewService =
			this._instantiationService.createInstance(WebviewService);

		// Listen for theme changes - this should remain even after resets
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

		// Initialize the component
		this.initialize();
	}

	/**
	 * Resets the overlay part to its initial state
	 * This can be called to get a clean slate
	 */
	private resetState(): void {
		// Reset all state variables
		this.state = "loading";
		this._isLocked = false;
		this.initializedWebview = false;
		this.needsReinit = false;
		this._webviewEnabled = true;
		this.openInProgress = false;
		this.initializingPromise = null;

		// Clear elements
		this.webviewElement = undefined;
		this.webviewView = undefined;

		// Remove event listeners
		if (this.closeHandler && this.overlayContainer) {
			this.overlayContainer.removeEventListener("click", this.closeHandler);
			this.closeHandler = undefined;
		}

		// Reset overlay container if it exists
		if (this.overlayContainer) {
			const loadingState = overlayStates.loading;
			Object.assign(this.overlayContainer.style, loadingState.overlayContainer);
		}
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

		// setting the styling to whatever the current state is
		const currentState = overlayStates[this.state];
		Object.assign(this.overlayContainer.style, currentState.overlayContainer);

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

			if (this.state === "open" || !this.overlayContainer) {
				this.openInProgress = false;
				return;
			}

			// First, make the overlay container visible but without content
			console.log("Making overlay container visible");
			if (this.overlayContainer) {
				this.overlayContainer.style.display = "block";
				this.overlayContainer.style.zIndex = "998";
			}

			this.webviewElement.mountTo(this.overlayContainer, getActiveWindow());

			// Set up for messages
			let messageReceived = false;

			this.webviewElement.onMessage((e) => {
				// console.log("Received message from webview:", e.message);
				if (
					e.message.messageType === "loaded" ||
					e.message.messageType === "pong"
				) {
					messageReceived = true;
				}
			});

			this.webviewElement.postMessage({ messageType: "ping" });

			// Wait briefly for a response + send another ping if it was lost
			for (let i = 0; i < 100; i++) {
				if (messageReceived) break;
				this.webviewElement.postMessage({ messageType: "ping" });
				await new Promise((resolve) => setTimeout(resolve, 5));
			}

			console.log(
				"Webview readiness check completed, messageReceived:",
				messageReceived,
			);

			console.log("Sending theme colors to webview");
			this.sendThemeColorsToWebview();
			this.sendStateToWebview("open");

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

			// Add a delay before starting the transition animation
			await new Promise((resolve) => setTimeout(resolve, 50));

			// Now start the state transition
			console.log("Starting state transition to 'open'");
			await this.handleStateTransition("open");
		} finally {
			this.openInProgress = false;
		}
	}
	/**
	 * This handles the vscode command to enter creator mode
	 * This relies on the submodule sending the plan to roo code, then the submodule is to call this to hide the overlay
	 * but keeping top right hand corner exit creator mode button active
	 */
	progressToNextStage() {
		this.handleStateTransition("overlay_closed_creator_active").then(() => {
			this.state = "overlay_closed_creator_active";

			// Apply creator active state styles
			const activeState = overlayStates.overlay_closed_creator_active;

			// Apply container styles
			if (this.overlayContainer) {
				Object.assign(
					this.overlayContainer.style,
					activeState.overlayContainer,
				);
			}

			// Apply top body styles
			const topOfBodyElement = this.getTopOfBodyElement();
			Object.assign(topOfBodyElement.style, activeState.topOfBody);

			// Apply blur element styles
			const blurryElement = this.getBlurOverlayElement();
			Object.assign(blurryElement.style, activeState.blurElement);

			CommandEmitter.emit("workbench.action.enterCreatorMode");
		});
	}

	/**
	 * Close exits the creator mode in it's entirety
	 */
	private close() {
		if (this.state === "overlay_closed_creator_active") {
			CommandEmitter.emit("workbench.action.exitCreatorMode");
		}

		return new Promise<void>((resolve) => {
			if (this.isLocked || this.state === "closed" || !this.overlayContainer) {
				console.dir({
					path: "early_return",
					isLocked: this.isLocked,
					state: this.state,
					hasOverlayContainer: !!this.overlayContainer,
				});
				return;
			}

			// Add a slide-up animation when closing
			this.handleStateTransition("closed").then(() => {
				// Apply closed state styles
				const closedState = overlayStates.closed;

				// Apply top body styles
				const topOfBodyElement = this.getTopOfBodyElement();
				Object.assign(topOfBodyElement.style, closedState.topOfBody);

				// Apply blur element styles
				const blurryElement = this.getBlurOverlayElement();
				Object.assign(blurryElement.style, closedState.blurElement);

				// Focus the active editor
				this._editorGroupsService.activeGroup.focus();

				// Reset the state to get a clean slate
				this.resetState();

				// Set the state back to closed after reset
				this.state = "closed";

				resolve();
			});
		});
	}

	private updateEnterCreatorButton() {
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

		// Use the predefined states based on direction
		const buttonState = overlayStates[this.state];

		// Apply the state
		enterCreatorButton.style.width = buttonState.exitButton.width;

		// Apply icon styles
		Object.assign(iconElement.style, buttonState.exitButtonIcon);

		// Apply text styles
		Object.assign(textElement.style, buttonState.exitButtonText);
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
		switch (this.state) {
			case "overlay_closed_creator_active":
			case "open":
				this.close();
				break;
			case "closed":
				this.open();
				break;
			case "loading":
				break;
			default:
				throw new Error("Unhandled state in toggle: " + this.state);
		}
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

	private getTopOfBodyElement(): HTMLElement {
		let topOfBodyElement = document.getElementById(
			"top-of-body-injected-container",
		) as HTMLElement;

		// Create the element if it doesn't exist yet
		if (!topOfBodyElement) {
			topOfBodyElement = document.createElement("div");
			topOfBodyElement.style.position = "sticky";
			topOfBodyElement.style.top = "0";
			topOfBodyElement.style.left = "0";
			topOfBodyElement.style.height = "0vh";
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
			blurGradient.style.position = "fixed";
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
			blurOverlayElement.style.height = "100vh";
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

	private async handleStateTransition(
		targetState: keyof typeof overlayStates,
	): Promise<void> {
		// Get the target state configuration
		const stateConfig = overlayStates[targetState];

		// Update the state first
		this.state = targetState;
		this.updateEnterCreatorButton();

		// Send both the target state and overlay states to the webview
		this.sendStateToWebview(targetState);

		// Create the container element for slide animation
		const topOfBodyElement = this.getTopOfBodyElement();
		const blurryElement = this.getBlurOverlayElement();

		// Set initial height based on current state
		const currentHeight = topOfBodyElement.style.height;
		topOfBodyElement.style.height = currentHeight || "0";

		// Force layout reflow before starting animation
		void topOfBodyElement.offsetWidth;

		// Apply the state styles
		Object.assign(topOfBodyElement.style, stateConfig.topOfBody);
		Object.assign(blurryElement.style, stateConfig.blurElement);

		// Update the enter creator button if it exists
		const enterCreatorButton = document.querySelector(
			ENTER_CREATOR_MODE_BTN_IDENTIFIER,
		) as HTMLElement;

		if (enterCreatorButton) {
			// Find the text and icon elements within the button
			const textElement = enterCreatorButton.querySelector(
				'span:not([style*="position: absolute"])',
			) as HTMLElement;
			const iconElement = enterCreatorButton.querySelector(
				'span[style*="position: absolute"]',
			) as HTMLElement;

			if (textElement && iconElement && stateConfig.exitButton) {
				// Apply the button styles
				Object.assign(enterCreatorButton.style, {
					width: stateConfig.exitButton.width,
				});

				// Apply icon styles if they exist
				if (stateConfig.exitButtonIcon) {
					Object.assign(iconElement.style, stateConfig.exitButtonIcon);
				}

				// Apply text styles if they exist
				if (stateConfig.exitButtonText) {
					Object.assign(textElement.style, stateConfig.exitButtonText);
				}
			}
		}

		console.log(
			"Animation started - transitioning to state:",
			targetState,
			"height:",
			stateConfig.topOfBody.height,
		);

		await new Promise<void>((resolve) => {
			// Set a single timeout for animation completion
			setTimeout(() => {
				resolve();
			}, 500); // Match the transition duration
		});

		// Hiding the overlay container after we've done all the animations
		if (this.overlayContainer) {
			// Apply all container styles from the state config
			Object.assign(this.overlayContainer.style, stateConfig.overlayContainer);
		}
	}

	private sendStateToWebview(targetState?: keyof typeof overlayStates) {
		if (this.webviewElement) {
			this.webviewElement.postMessage({
				messageType: "stateUpdate",
				data: {
					targetState: targetState ?? this.state,
					overlayStates,
				},
			});
		} else {
			throw new Error("Webview element not initialized");
		}
	}

	toJSON(): object {
		return {
			type: Parts.PEARCREATOROVERLAY_PART,
		};
	}
}
