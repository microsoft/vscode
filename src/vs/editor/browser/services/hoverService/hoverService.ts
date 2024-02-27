/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { InstantiationType, registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { registerThemingParticipant } from 'vs/platform/theme/common/themeService';
import { editorHoverBorder } from 'vs/platform/theme/common/colorRegistry';
import { IHoverService, IHoverOptions } from 'vs/platform/hover/browser/hover';
import { IContextMenuService } from 'vs/platform/contextview/browser/contextView';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { HoverWidget } from 'vs/editor/browser/services/hoverService/hoverWidget';
import { IContextViewProvider, IDelegate } from 'vs/base/browser/ui/contextview/contextview';
import { Disposable, DisposableStore, IDisposable, toDisposable } from 'vs/base/common/lifecycle';
import { addDisposableListener, EventType, getActiveElement, isAncestorOfActiveElement, isAncestor, getWindow } from 'vs/base/browser/dom';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { StandardKeyboardEvent } from 'vs/base/browser/keyboardEvent';
import { ResultKind } from 'vs/platform/keybinding/common/keybindingResolver';
import { IAccessibilityService } from 'vs/platform/accessibility/common/accessibility';
import { ILayoutService } from 'vs/platform/layout/browser/layoutService';
import { mainWindow } from 'vs/base/browser/window';
import { IHoverWidget } from 'vs/base/browser/ui/hover/updatableHoverWidget';
import { ContextViewHandler } from 'vs/platform/contextview/browser/contextViewService';

export class HoverService extends Disposable implements IHoverService {
	declare readonly _serviceBrand: undefined;

	private _contextViewHandler: IContextViewProvider;
	private _currentHoverOptions: IHoverOptions | undefined;
	private _currentHover: HoverWidget | undefined;
	private _lastHoverOptions: IHoverOptions | undefined;

	private _lastFocusedElementBeforeOpen: HTMLElement | undefined;

	constructor(
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@IContextMenuService contextMenuService: IContextMenuService,
		@IKeybindingService private readonly _keybindingService: IKeybindingService,
		@ILayoutService private readonly _layoutService: ILayoutService,
		@IAccessibilityService private readonly _accessibilityService: IAccessibilityService
	) {
		super();

		contextMenuService.onDidShowContextMenu(() => this.hideHover());
		this._contextViewHandler = this._register(new ContextViewHandler(this._layoutService));
	}

	showHover(options: IHoverOptions, focus?: boolean, skipLastFocusedUpdate?: boolean): IHoverWidget | undefined {
		if (getHoverOptionsIdentity(this._currentHoverOptions) === getHoverOptionsIdentity(options)) {
			return undefined;
		}
		if (this._currentHover && this._currentHoverOptions?.persistence?.sticky) {
			return undefined;
		}
		this._currentHoverOptions = options;
		this._lastHoverOptions = options;
		const trapFocus = options.trapFocus || this._accessibilityService.isScreenReaderOptimized();
		const activeElement = getActiveElement();
		// HACK, remove this check when #189076 is fixed
		if (!skipLastFocusedUpdate) {
			if (trapFocus && activeElement) {
				this._lastFocusedElementBeforeOpen = activeElement as HTMLElement;
			} else {
				this._lastFocusedElementBeforeOpen = undefined;
			}
		}
		const hoverDisposables = new DisposableStore();
		const hover = this._instantiationService.createInstance(HoverWidget, options);
		if (options.persistence?.sticky) {
			hover.isLocked = true;
		}
		hover.onDispose(() => {
			const hoverWasFocused = this._currentHover?.domNode && isAncestorOfActiveElement(this._currentHover.domNode);
			if (hoverWasFocused) {
				// Required to handle cases such as closing the hover with the escape key
				this._lastFocusedElementBeforeOpen?.focus();
			}

			// Only clear the current options if it's the current hover, the current options help
			// reduce flickering when the same hover is shown multiple times
			if (this._currentHoverOptions === options) {
				this._currentHoverOptions = undefined;
			}
			hoverDisposables.dispose();
		});
		// Set the container explicitly to enable aux window support
		if (!options.container) {
			const targetElement = options.target instanceof HTMLElement ? options.target : options.target.targetElements[0];
			options.container = this._layoutService.getContainer(getWindow(targetElement));
		}

		this._contextViewHandler.showContextView(
			new HoverContextViewDelegate(hover, focus),
			options.container
		);
		hover.onRequestLayout(() => this._contextViewHandler.layout());
		if (options.persistence?.sticky) {
			hoverDisposables.add(addDisposableListener(getWindow(options.container).document, EventType.MOUSE_DOWN, e => {
				if (!isAncestor(e.target as HTMLElement, hover.domNode)) {
					this.doHideHover();
				}
			}));
		} else {
			if ('targetElements' in options.target) {
				for (const element of options.target.targetElements) {
					hoverDisposables.add(addDisposableListener(element, EventType.CLICK, () => this.hideHover()));
				}
			} else {
				hoverDisposables.add(addDisposableListener(options.target, EventType.CLICK, () => this.hideHover()));
			}
			const focusedElement = getActiveElement();
			if (focusedElement) {
				const focusedElementDocument = getWindow(focusedElement).document;
				hoverDisposables.add(addDisposableListener(focusedElement, EventType.KEY_DOWN, e => this._keyDown(e, hover, !!options.persistence?.hideOnKeyDown)));
				hoverDisposables.add(addDisposableListener(focusedElementDocument, EventType.KEY_DOWN, e => this._keyDown(e, hover, !!options.persistence?.hideOnKeyDown)));
				hoverDisposables.add(addDisposableListener(focusedElement, EventType.KEY_UP, e => this._keyUp(e, hover)));
				hoverDisposables.add(addDisposableListener(focusedElementDocument, EventType.KEY_UP, e => this._keyUp(e, hover)));
			}
		}

		if ('IntersectionObserver' in mainWindow) {
			const observer = new IntersectionObserver(e => this._intersectionChange(e, hover), { threshold: 0 });
			const firstTargetElement = 'targetElements' in options.target ? options.target.targetElements[0] : options.target;
			observer.observe(firstTargetElement);
			hoverDisposables.add(toDisposable(() => observer.disconnect()));
		}

		this._currentHover = hover;

		return hover;
	}

	hideHover(): void {
		if (this._currentHover?.isLocked || !this._currentHoverOptions) {
			return;
		}
		this.doHideHover();
	}

	private doHideHover(): void {
		this._currentHover = undefined;
		this._currentHoverOptions = undefined;
		this._contextViewHandler.hideContextView();
	}

	private _intersectionChange(entries: IntersectionObserverEntry[], hover: IDisposable): void {
		const entry = entries[entries.length - 1];
		if (!entry.isIntersecting) {
			hover.dispose();
		}
	}

	showAndFocusLastHover(): void {
		if (!this._lastHoverOptions) {
			return;
		}
		this.showHover(this._lastHoverOptions, true, true);
	}

	private _keyDown(e: KeyboardEvent, hover: HoverWidget, hideOnKeyDown: boolean) {
		if (e.key === 'Alt') {
			hover.isLocked = true;
			return;
		}
		const event = new StandardKeyboardEvent(e);
		const keybinding = this._keybindingService.resolveKeyboardEvent(event);
		if (keybinding.getSingleModifierDispatchChords().some(value => !!value) || this._keybindingService.softDispatch(event, event.target).kind !== ResultKind.NoMatchingKb) {
			return;
		}
		if (hideOnKeyDown && (!this._currentHoverOptions?.trapFocus || e.key !== 'Tab')) {
			this.hideHover();
			this._lastFocusedElementBeforeOpen?.focus();
		}
	}

	private _keyUp(e: KeyboardEvent, hover: HoverWidget) {
		if (e.key === 'Alt') {
			hover.isLocked = false;
			// Hide if alt is released while the mouse is not over hover/target
			if (!hover.isMouseIn) {
				this.hideHover();
				this._lastFocusedElementBeforeOpen?.focus();
			}
		}
	}
}

function getHoverOptionsIdentity(options: IHoverOptions | undefined): IHoverOptions | number | string | undefined {
	if (options === undefined) {
		return undefined;
	}
	return options?.id ?? options;
}

class HoverContextViewDelegate implements IDelegate {

	// Render over all other context views
	public readonly layer = 1;

	get anchorPosition() {
		return this._hover.anchor;
	}

	constructor(
		private readonly _hover: HoverWidget,
		private readonly _focus: boolean = false
	) {
	}

	render(container: HTMLElement) {
		this._hover.render(container);
		if (this._focus) {
			this._hover.focus();
		}
		return this._hover;
	}

	getAnchor() {
		return {
			x: this._hover.x,
			y: this._hover.y
		};
	}

	layout() {
		this._hover.layout();
	}
}

registerSingleton(IHoverService, HoverService, InstantiationType.Delayed);

registerThemingParticipant((theme, collector) => {
	const hoverBorder = theme.getColor(editorHoverBorder);
	if (hoverBorder) {
		collector.addRule(`.monaco-workbench .workbench-hover .hover-row:not(:first-child):not(:empty) { border-top: 1px solid ${hoverBorder.transparent(0.5)}; }`);
		collector.addRule(`.monaco-workbench .workbench-hover hr { border-top: 1px solid ${hoverBorder.transparent(0.5)}; }`);
	}
});
