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

const CREATOR_CHAT_ID = "pearai.creatorView";
const CREATOR_OVERLAY_TITLE = "pearai.creatorOverlayView";

export class CreatorOverlayPart extends Part {
	static readonly ID = "workbench.parts.creatoroverlay";

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
			id: new ExtensionIdentifier(CREATOR_CHAT_ID),
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

		// Set initial visibility
		webview.container.style.display = "none";
		webview.container.style.opacity = "0";
		webview.container.style.zIndex = "-1";
		webview.container.style.transition = "opacity 0.3s ease-in";
		webview.container.style.position = "absolute";

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
		await this._webviewViewService.resolve(
			CREATOR_CHAT_ID,
			this.webviewView!,
			source.token,
		);

		// Set up layout if everything is ready
		if (this.popupAreaOverlay && this.webviewView) {
			this.webviewView.webview.layoutWebviewOverElement(this.popupAreaOverlay);
		}
	}

	protected override createContentArea(element: HTMLElement): HTMLElement {
		// create the full screen overlay that serves as a click target for closing
		this.element = element;
		this.fullScreenOverlay = element; // use the part root element as the fullScreenOverlay
		this.fullScreenOverlay.style.zIndex = "-10";
		this.fullScreenOverlay.style.position = "absolute";
		this.fullScreenOverlay.style.top = "0";
		this.fullScreenOverlay.style.left = "0";
		this.fullScreenOverlay.style.right = "0";
		this.fullScreenOverlay.style.bottom = "0";
		this.fullScreenOverlay.style.backgroundColor = "rgba(0, 0, 0, 0.5)";

		// create the popup area overlay that's just a target for webview to layout over
		this.popupAreaOverlay = $("div.creator-popup-area-overlay");
		this.popupAreaOverlay.style.position = "absolute";
		this.popupAreaOverlay.style.margin = "0";
		this.popupAreaOverlay.style.top = "0";
		this.popupAreaOverlay.style.left = "0";
		this.popupAreaOverlay.style.right = "0";
		this.popupAreaOverlay.style.bottom = "0";
		this.element.appendChild(this.popupAreaOverlay);

		// Set up webview layout if both are ready
		if (this.popupAreaOverlay && this.webviewView) {
			this.webviewView.webview.layoutWebviewOverElement(this.popupAreaOverlay);
			this.close(); // Ensure it starts closed
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
		container.style.opacity = "1";

		this.fullScreenOverlay?.addEventListener("click", () => {
			if (!this.isLocked) {
				this.close();
			}
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
		container.style.animation = "creatorFadeOut 0.2s ease-out";

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
			console.warn("Can't open Creator view while loading");
			return;
		}

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

	toJSON(): object {
		return {
			type: Parts.PEAROVERLAY_PART,
		};
	}
}
