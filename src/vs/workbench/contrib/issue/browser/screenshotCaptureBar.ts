/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { $, addDisposableListener, append, disposableWindowInterval, EventType, getWindow } from '../../../../base/browser/dom.js';
import { IContextMenuProvider } from '../../../../base/browser/contextmenu.js';
import { Button } from '../../../../base/browser/ui/button/button.js';
import { renderIcon } from '../../../../base/browser/ui/iconLabel/iconLabels.js';
import { Action, Separator } from '../../../../base/common/actions.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable, DisposableStore, MutableDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { localize } from '../../../../nls.js';
import { defaultButtonStyles } from '../../../../platform/theme/browser/defaultStyles.js';
import './media/issueReporterOverlay.css';

/**
 * Shared floating screenshot control used by Issue Reporter and Issue Wizard.
 */
export class ScreenshotCaptureBar extends Disposable {
	private static readonly barsByWindow = new WeakMap<Window, ScreenshotCaptureBar[]>();

	private readonly _onDidRequestScreenshot = this._register(new Emitter<void>());
	readonly onDidRequestScreenshot: Event<void> = this._onDidRequestScreenshot.event;

	private readonly _onDidChangeCaptureState = this._register(new Emitter<void>());
	readonly onDidChangeCaptureState: Event<void> = this._onDidChangeCaptureState.event;
	private readonly _onDidChangeActive = this._register(new Emitter<boolean>());
	readonly onDidChangeActive: Event<boolean> = this._onDidChangeActive.event;
	private readonly _onWillDispose = this._register(new Emitter<void>());
	private readonly dragListeners = this._register(new MutableDisposable<DisposableStore>());
	private readonly targetWindowListeners = this._register(new MutableDisposable<DisposableStore>());
	private readonly captureCountdown = this._register(new MutableDisposable());

	readonly element: HTMLElement;
	private readonly captureButton: Button;
	private readonly delayButton: Button;
	private screenshotDelay = 0;
	private _capturePending = false;
	private _hideForCapture: boolean;
	private targetWindow: Window;
	private requestedVisible = true;
	private _active = false;
	private disposed = false;

	constructor(
		private readonly container: HTMLElement,
		private readonly contextMenuProvider?: IContextMenuProvider,
		initialHideForCapture = true,
	) {
		super();
		this._hideForCapture = initialHideForCapture;

		this.targetWindow = getWindow(container);
		this.element = $('div.issue-reporter-floating-bar');
		this.element.setAttribute('role', 'toolbar');
		this.element.setAttribute('aria-label', localize('screenshotCaptureToolbar', "Screenshot capture"));

		const dragArea = append(this.element, $('div.wizard-floating-drag'));
		dragArea.appendChild(renderIcon(Codicon.gripper));

		const segmented = append(this.element, $('div.wizard-segmented-btn'));
		this.captureButton = this._register(new Button(segmented, { ...defaultButtonStyles, supportIcons: true }));
		this.captureButton.element.classList.add('wizard-segmented-main');
		this.captureButton.label = `$(device-camera) ${localize('screenshot', "Screenshot")}`;

		this.delayButton = this._register(new Button(segmented, { ...defaultButtonStyles, supportIcons: true }));
		this.delayButton.element.classList.add('wizard-segmented-dropdown');
		this.delayButton.element.title = localize('captureOptions', "Capture options");
		this.delayButton.element.setAttribute('aria-label', localize('captureOptions', "Capture options"));
		this.delayButton.label = '$(chevron-down)';

		this.registerCaptureOptions(dragArea);
		this._register(this.captureButton.onDidClick(() => this.requestScreenshot()));
		this.registerDragging(dragArea);
		this.registerTargetWindowListeners();
		this.mount();
		this._register(toDisposable(() => this.element.remove()));
		this.activate();
	}

	override dispose(): void {
		if (this.disposed) {
			return;
		}
		this.disposed = true;
		this._onWillDispose.fire();
		this.releaseOwnership();
		super.dispose();
	}

	get capturePending(): boolean {
		return this._capturePending;
	}

	get shouldHideForCapture(): boolean {
		return this._hideForCapture;
	}

	get active(): boolean {
		return this._active;
	}

	setCaptureEnabled(enabled: boolean, disabledTitle?: string): void {
		const effectiveEnabled = enabled && !this._capturePending;
		this.captureButton.enabled = effectiveEnabled;
		this.delayButton.enabled = effectiveEnabled;
		this.captureButton.element.title = effectiveEnabled ? localize('screenshot', "Screenshot") : (disabledTitle ?? localize('screenshotUnavailable', "Screenshot unavailable"));
		this.delayButton.element.title = effectiveEnabled ? localize('captureOptions', "Capture options") : (disabledTitle ?? localize('screenshotUnavailable', "Screenshot unavailable"));
	}

	async triggerCapture(): Promise<boolean> {
		if (!this.captureButton.enabled) {
			return false;
		}
		return new Promise<boolean>(resolve => {
			const listeners = new DisposableStore();
			const finish = (requested: boolean) => {
				listeners.dispose();
				resolve(requested);
			};
			listeners.add(Event.once(this.onDidRequestScreenshot)(() => finish(true)));
			listeners.add(Event.once(this._onWillDispose.event)(() => finish(false)));
			this.captureButton.element.click();
		});
	}

	hide(): void {
		this.requestedVisible = false;
		ScreenshotCaptureBar.updateVisibility(this.targetWindow);
	}

	show(): void {
		this.requestedVisible = true;
		ScreenshotCaptureBar.updateVisibility(this.targetWindow);
	}

	activate(): void {
		this.registerInWindow(true);
	}

	reparent(): void {
		const targetWindow = getWindow(this.container);
		const targetWindowChanged = targetWindow !== this.targetWindow;
		if (targetWindowChanged) {
			this.releaseOwnership();
			this.dragListeners.clear();
			this.targetWindow = targetWindow;
			this.registerTargetWindowListeners();
		}
		const mountTarget = this.getMountTarget();
		if (this.element.parentElement !== mountTarget) {
			this.element.remove();
			mountTarget.appendChild(this.element);
			this.element.style.left = '';
			this.element.style.top = '';
			this.element.style.right = '30%';
		}
		if (targetWindowChanged) {
			this.registerInWindow(false);
		}
	}

	private mount(): void {
		this.getMountTarget().appendChild(this.element);
	}

	private getMountTarget(): HTMLElement {
		// eslint-disable-next-line no-restricted-syntax
		return this.targetWindow.document.querySelector('.monaco-workbench') as HTMLElement | null ?? this.targetWindow.document.body;
	}

	private registerInWindow(active: boolean): void {
		let bars = ScreenshotCaptureBar.barsByWindow.get(this.targetWindow);
		if (!bars) {
			bars = [];
			ScreenshotCaptureBar.barsByWindow.set(this.targetWindow, bars);
		}
		const existingIndex = bars.indexOf(this);
		if (existingIndex >= 0) {
			bars.splice(existingIndex, 1);
		}
		if (active) {
			bars.push(this);
		} else {
			bars.unshift(this);
		}
		ScreenshotCaptureBar.updateVisibility(this.targetWindow);
	}

	private releaseOwnership(): void {
		const bars = ScreenshotCaptureBar.barsByWindow.get(this.targetWindow);
		if (!bars) {
			return;
		}
		const index = bars.indexOf(this);
		if (index >= 0) {
			bars.splice(index, 1);
		}
		if (this._active) {
			this._active = false;
			this._onDidChangeActive.fire(false);
		}
		if (bars.length === 0) {
			ScreenshotCaptureBar.barsByWindow.delete(this.targetWindow);
		} else {
			ScreenshotCaptureBar.updateVisibility(this.targetWindow);
		}
	}

	private static updateVisibility(targetWindow: Window): void {
		const bars = ScreenshotCaptureBar.barsByWindow.get(targetWindow);
		const activeBar = bars?.at(-1);
		for (const bar of bars ?? []) {
			const active = bar === activeBar;
			if (bar._active !== active) {
				bar._active = active;
				bar._onDidChangeActive.fire(active);
			}
			bar.element.style.display = active && bar.requestedVisible ? '' : 'none';
		}
	}

	private registerCaptureOptions(dragArea: HTMLElement): void {
		const contextMenuProvider = this.contextMenuProvider;
		if (!contextMenuProvider) {
			return;
		}
		const menuActions = this._register(new MutableDisposable<DisposableStore>());
		let menuOpen = false;
		this._register(this.delayButton.onDidClick(() => {
			if (!this.delayButton.enabled || menuOpen) {
				return;
			}
			const actionsStore = new DisposableStore();
			menuActions.value = actionsStore;
			const hideAction = actionsStore.add(new Action(
				'hide-toolbar',
				localize('hideToolbarInScreenshots', "Hide Toolbar in Screenshots"),
				undefined,
				true,
				async () => { this._hideForCapture = !this._hideForCapture; },
			));
			hideAction.checked = this._hideForCapture;

			const actions = this.getDelayOptions().map(option => {
				const action = actionsStore.add(new Action(
					`delay-${option.value}`,
					option.label,
					undefined,
					true,
					async () => { this.screenshotDelay = option.value; },
				));
				action.checked = option.value === this.screenshotDelay;
				return action;
			});

			menuOpen = true;
			contextMenuProvider.showContextMenu({
				getAnchor: () => this.element,
				getActions: () => [hideAction, new Separator(), ...actions],
				skipTelemetry: true,
				onHide: () => {
					menuOpen = false;
					menuActions.clear();
				},
			});
		}));
		this._register(addDisposableListener(dragArea, EventType.POINTER_DOWN, () => {
			dragArea.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
		}));
	}

	private requestScreenshot(): void {
		if (!this.captureButton.enabled) {
			return;
		}
		if (this.screenshotDelay === 0) {
			this._onDidRequestScreenshot.fire();
			return;
		}

		this.captureButton.element.style.minWidth = `${this.captureButton.element.offsetWidth}px`;
		this._capturePending = true;
		this.setCaptureEnabled(false);
		this._onDidChangeCaptureState.fire();
		let remaining = this.screenshotDelay;
		this.captureButton.label = `${remaining}...`;
		const targetWindow = getWindow(this.container);
		this.captureCountdown.value = disposableWindowInterval(targetWindow, () => {
			remaining--;
			if (remaining > 0) {
				this.captureButton.label = `${remaining}...`;
				return;
			}
			this.captureCountdown.clear();
			this.captureButton.label = `$(device-camera) ${localize('screenshot', "Screenshot")}`;
			this.captureButton.element.style.minWidth = '';
			this._capturePending = false;
			this.setCaptureEnabled(true);
			this._onDidChangeCaptureState.fire();
			this._onDidRequestScreenshot.fire();
		}, 1000);
	}

	private registerDragging(dragArea: HTMLElement): void {
		this._register(addDisposableListener(dragArea, EventType.POINTER_DOWN, (event: PointerEvent) => {
			event.preventDefault();
			dragArea.classList.add('dragged');
			const targetWindow = this.targetWindow;
			const dragStartX = event.clientX;
			const dragStartY = event.clientY;
			const rect = this.element.getBoundingClientRect();
			const barStartX = rect.left;
			const barStartY = rect.top;
			const listeners = new DisposableStore();
			this.dragListeners.value = listeners;
			listeners.add(toDisposable(() => dragArea.classList.remove('dragged')));
			listeners.add(addDisposableListener(targetWindow.document, EventType.POINTER_MOVE, (event: PointerEvent) => {
				const maxX = targetWindow.innerWidth - this.element.offsetWidth;
				const maxY = targetWindow.innerHeight - this.element.offsetHeight;
				this.element.style.left = `${Math.max(0, Math.min(barStartX + event.clientX - dragStartX, maxX))}px`;
				this.element.style.top = `${Math.max(0, Math.min(barStartY + event.clientY - dragStartY, maxY))}px`;
				this.element.style.right = 'auto';
			}));
			listeners.add(addDisposableListener(targetWindow.document, EventType.POINTER_UP, () => this.dragListeners.clear()));
		}));
	}

	private registerTargetWindowListeners(): void {
		const listeners = new DisposableStore();
		this.targetWindowListeners.value = listeners;
		const targetWindow = this.targetWindow;
		listeners.add(addDisposableListener(targetWindow, EventType.RESIZE, () => {
			const rect = this.element.getBoundingClientRect();
			const margin = 8;
			let nextLeft = rect.left;
			let nextTop = rect.top;
			let needsClamp = false;
			if (rect.right > targetWindow.innerWidth - margin) {
				nextLeft = Math.max(margin, targetWindow.innerWidth - margin - rect.width);
				needsClamp = true;
			}
			if (rect.left < margin) {
				nextLeft = margin;
				needsClamp = true;
			}
			if (rect.bottom > targetWindow.innerHeight - margin) {
				nextTop = Math.max(margin, targetWindow.innerHeight - margin - rect.height);
				needsClamp = true;
			}
			if (rect.top < margin) {
				nextTop = margin;
				needsClamp = true;
			}
			if (needsClamp) {
				this.element.style.left = `${nextLeft}px`;
				this.element.style.top = `${nextTop}px`;
				this.element.style.right = 'auto';
			}
		}));
	}

	private getDelayOptions(): { label: string; value: number }[] {
		return [
			{ label: localize('noDelay', "No delay"), value: 0 },
			{ label: localize('threeSeconds', "3 seconds"), value: 3 },
			{ label: localize('fiveSeconds', "5 seconds"), value: 5 },
			{ label: localize('tenSeconds', "10 seconds"), value: 10 },
		];
	}

}
