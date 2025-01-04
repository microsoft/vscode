/* eslint-disable header/header */

import { Part } from "vs/workbench/browser/part";
import {
	IWorkbenchLayoutService,
	Parts,
} from "vs/workbench/services/layout/browser/layoutService";
import { IThemeService } from "vs/platform/theme/common/themeService";
import { IStorageService } from "vs/platform/storage/common/storage";
import { $, getActiveWindow } from "vs/base/browser/dom";
import { CancellationTokenSource } from "vs/base/common/cancellation";
import { IInstantiationService } from "vs/platform/instantiation/common/instantiation";
import { WebviewExtensionDescription } from "vs/workbench/contrib/webview/browser/webview";

import {
	IWebviewViewService,
	WebviewView,
} from "vs/workbench/contrib/webviewView/browser/webviewViewService";
import { WebviewService } from "vs/workbench/contrib/webview/browser/webviewService";
import { URI } from "vs/base/common/uri";
import { ExtensionIdentifier } from "vs/platform/extensions/common/extensions";

const PEAROVERLAY_ID = "pearai.pearAIChatView";
const PEAR_OVERLAY_TITLE = "pearai.pearOverlay";

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

	constructor(
		@IThemeService themeService: IThemeService,
		@IStorageService storageService: IStorageService,
		@IWorkbenchLayoutService layoutService: IWorkbenchLayoutService,
		@IWebviewViewService
		private readonly _webviewViewService: IWebviewViewService,
		@IInstantiationService
		private readonly _instantiationService: IInstantiationService,
	) {
		super(
			PearOverlayPart.ID,
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
		const extensionDescription: WebviewExtensionDescription = {
			id: new ExtensionIdentifier(PEAROVERLAY_ID),
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
			PEAROVERLAY_ID,
			this.webviewView!,
			source.token,
		);

		// if both content and webview are ready, end loading state and open
		if (this.popupAreaOverlay && this.webviewView) {
			this.webviewView?.webview.layoutWebviewOverElement(this.popupAreaOverlay);
			// Don't open on every startup
			//this.open();
		} else {
			// hide stuff while we load
			this.webviewView!.webview.container.style.display = "none";
		}
	}

	protected override createContentArea(element: HTMLElement): HTMLElement {
		// create the full screen overlay. this serves as a click target for closing pearai
		this.element = element;
		this.fullScreenOverlay = element; // use the pearOverlayPart root element as the fullScreenOverlay
		this.fullScreenOverlay.style.zIndex = "-10";
		this.fullScreenOverlay.style.position = "absolute";
		this.fullScreenOverlay.style.top = "0";
		this.fullScreenOverlay.style.left = "0";
		this.fullScreenOverlay.style.right = "0";
		this.fullScreenOverlay.style.bottom = "0";
		this.fullScreenOverlay.style.backgroundColor = "rgba(0, 0, 0, 0.2)";
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

		// if both content and webview are ready, end loading state and open
		if (this.popupAreaOverlay && this.webviewView) {
			//this.webviewView?.webview.layoutWebviewOverElement(this.popupAreaOverlay);
			// createContentArea is called within the workbench and layout when instantiating the overlay.
			// If we don't close it here, it will open up by default when editor starts, or appear for half a second.
			// If we remove this completely, it gets stuck in the loading stage, so we must close it.
			this.close();
		} else {
			// hide stuff while we load
			this.fullScreenOverlay!.style.display = "none";
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

	toJSON(): object {
		return {
			type: Parts.PEAROVERLAY_PART,
		};
	}
}
