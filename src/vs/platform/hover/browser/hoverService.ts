/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { InstantiationType, registerSingleton } from '../../instantiation/common/extensions.js';
import { registerThemingParticipant } from '../../theme/common/themeService.js';
import { editorHoverBorder } from '../../theme/common/colorRegistry.js';
import { IHoverService } from './hover.js';
import { IContextMenuService } from '../../contextview/browser/contextView.js';
import { IInstantiationService } from '../../instantiation/common/instantiation.js';
import { HoverWidget } from './hoverWidget.js';
import { ContextView, ContextViewDOMPosition, IDelegate } from '../../../base/browser/ui/contextview/contextview.js';
import { Disposable, DisposableStore, IDisposable, toDisposable } from '../../../base/common/lifecycle.js';
import { addDisposableListener, EventType, getActiveElement, isAncestorOfActiveElement, isAncestor, getWindow, isHTMLElement, isEditableElement } from '../../../base/browser/dom.js';
import { IKeybindingService } from '../../keybinding/common/keybinding.js';
import { StandardKeyboardEvent } from '../../../base/browser/keyboardEvent.js';
import { ResultKind } from '../../keybinding/common/keybindingResolver.js';
import { IAccessibilityService } from '../../accessibility/common/accessibility.js';
import { ILayoutService } from '../../layout/browser/layoutService.js';
import { mainWindow } from '../../../base/browser/window.js';
import { HoverStyle, isManagedHoverTooltipMarkdownString, type IHoverLifecycleOptions, type IHoverOptions, type IHoverTarget, type IHoverWidget, type IManagedHover, type IManagedHoverContentOrFactory, type IManagedHoverOptions } from '../../../base/browser/ui/hover/hover.js';
import type { IHoverDelegate, IHoverDelegateTarget } from '../../../base/browser/ui/hover/hoverDelegate.js';
import { ManagedHoverWidget } from './updatableHoverWidget.js';
import { timeout, TimeoutTimer } from '../../../base/common/async.js';
import { IConfigurationService } from '../../configuration/common/configuration.js';
import { isNumber, isString } from '../../../base/common/types.js';
import { KeyChord, KeyCode, KeyMod } from '../../../base/common/keyCodes.js';
import { KeybindingsRegistry, KeybindingWeight } from '../../keybinding/common/keybindingsRegistry.js';
import { IMarkdownString } from '../../../base/common/htmlContent.js';
import { stripIcons } from '../../../base/common/iconLabels.js';

/**
 * Maximum nesting depth for hovers. This prevents runaway nesting.
 */
const MAX_HOVER_NESTING_DEPTH = 3;

/**
 * An entry in the hover stack, representing a single hover and its associated state.
 */
interface IHoverStackEntry {
	readonly hover: HoverWidget;
	readonly options: IHoverOptions;
	readonly contextView: ContextView;
	readonly lastFocusedElementBeforeOpen: HTMLElement | undefined;
}

/**
 * Result of creating a hover, containing the hover widget and associated state.
 */
interface ICreateHoverResult {
	readonly hover: HoverWidget;
	readonly store: DisposableStore;
	readonly lastFocusedElementBeforeOpen: HTMLElement | undefined;
}

export class HoverService extends Disposable implements IHoverService {
	declare readonly _serviceBrand: undefined;

	/**
	 * Stack of currently visible hovers. The last entry is the topmost hover.
	 * This enables nested hovers where hovering inside a hover can show another hover.
	 */
	private readonly _hoverStack: IHoverStackEntry[] = [];

	private _currentDelayedHover: HoverWidget | undefined;
	private _currentDelayedHoverWasShown: boolean = false;
	private _currentDelayedHoverGroupId: number | string | undefined;
	private _lastHoverOptions: IHoverOptions | undefined;
	private readonly _delayedHovers = new Map<HTMLElement, { show: (focus: boolean) => void }>();
	private readonly _managedHovers = new Map<HTMLElement, IManagedHover>();

	/**
	 * Gets the current (topmost) hover from the stack, if any.
	 */
	private get _currentHover(): HoverWidget | undefined {
		return this._hoverStack.at(-1)?.hover;
	}

	/**
	 * Gets the current (topmost) hover options from the stack, if any.
	 */
	private get _currentHoverOptions(): IHoverOptions | undefined {
		return this._hoverStack.at(-1)?.options;
	}

	/**
	 * Returns whether the target element is inside any of the hovers in the stack.
	 * If it is, returns the index of the containing hover, otherwise returns -1.
	 */
	private _getContainingHoverIndex(target: HTMLElement | IHoverTarget): number {
		const targetElements = isHTMLElement(target) ? [target] : target.targetElements;
		// Search from top of stack to bottom (most recent hover first)
		for (let i = this._hoverStack.length - 1; i >= 0; i--) {
			for (const targetElement of targetElements) {
				if (isAncestor(targetElement, this._hoverStack[i].hover.domNode)) {
					return i;
				}
			}
		}
		return -1;
	}

	constructor(
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@IContextMenuService contextMenuService: IContextMenuService,
		@IKeybindingService private readonly _keybindingService: IKeybindingService,
		@ILayoutService private readonly _layoutService: ILayoutService,
		@IAccessibilityService private readonly _accessibilityService: IAccessibilityService
	) {
		super();

		this._register(contextMenuService.onDidShowContextMenu(() => this.hideHover()));

		this._register(KeybindingsRegistry.registerCommandAndKeybindingRule({
			id: 'workbench.action.showHover',
			weight: KeybindingWeight.EditorCore,
			primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KeyK, KeyMod.CtrlCmd | KeyCode.KeyI),
			handler: () => { this._showAndFocusHoverForActiveElement(); },
		}));
	}

	showInstantHover(options: IHoverOptions, focus?: boolean, skipLastFocusedUpdate?: boolean, dontShow?: boolean): IHoverWidget | undefined {
		const hover = this._createHover(options, skipLastFocusedUpdate);
		if (!hover) {
			return undefined;
		}
		this._showHover(hover, options, focus);
		return hover.hover;
	}

	showDelayedHover(
		options: IHoverOptions,
		lifecycleOptions: Pick<IHoverLifecycleOptions, 'groupId' | 'reducedDelay'>,
	): IHoverWidget | undefined {
		// Set `id` to default if it's undefined
		if (options.id === undefined) {
			options.id = getHoverIdFromContent(options.content);
		}

		if (!this._currentDelayedHover || this._currentDelayedHoverWasShown) {
			// Current hover is locked, reject
			if (this._currentHover?.isLocked) {
				return undefined;
			}

			// Identity is the same, return current hover
			if (getHoverOptionsIdentity(this._currentHoverOptions) === getHoverOptionsIdentity(options)) {
				return this._currentHover;
			}

			// Check group identity, if it's the same skip the delay and show the hover immediately
			if (this._currentHover && !this._currentHover.isDisposed && this._currentDelayedHoverGroupId !== undefined && this._currentDelayedHoverGroupId === lifecycleOptions?.groupId) {
				return this.showInstantHover({
					...options,
					appearance: {
						...options.appearance,
						skipFadeInAnimation: true
					}
				});
			}
		} else if (this._currentDelayedHover && getHoverOptionsIdentity(this._currentHoverOptions) === getHoverOptionsIdentity(options)) {
			// If the hover is the same but timeout is not finished yet, return the current hover
			return this._currentDelayedHover;
		}

		const hover = this._createHover(options, undefined);
		if (!hover) {
			this._currentDelayedHover = undefined;
			this._currentDelayedHoverWasShown = false;
			this._currentDelayedHoverGroupId = undefined;
			return undefined;
		}

		this._currentDelayedHover = hover.hover;
		this._currentDelayedHoverWasShown = false;
		this._currentDelayedHoverGroupId = lifecycleOptions?.groupId;

		const delay = lifecycleOptions?.reducedDelay
			? this._configurationService.getValue<number>('workbench.hover.reducedDelay')
			: this._configurationService.getValue<number>('workbench.hover.delay');
		timeout(delay).then(() => {
			if (hover.hover && !hover.hover.isDisposed) {
				this._currentDelayedHoverWasShown = true;
				this._showHover(hover, options);
			}
		});

		return hover.hover;
	}

	setupDelayedHover(
		target: HTMLElement,
		options: (() => Omit<IHoverOptions, 'target'>) | Omit<IHoverOptions, 'target'>,
		lifecycleOptions?: IHoverLifecycleOptions,
	): IDisposable {
		const resolveHoverOptions = (e?: MouseEvent) => {
			const resolved: IHoverOptions = {
				...typeof options === 'function' ? options() : options,
				target
			};
			if (resolved.style === HoverStyle.Mouse && e) {
				resolved.target = resolveMouseStyleHoverTarget(target, e);
			}
			return resolved;
		};
		return this._setupDelayedHover(target, resolveHoverOptions, lifecycleOptions);
	}

	setupDelayedHoverAtMouse(
		target: HTMLElement,
		options: (() => Omit<IHoverOptions, 'target' | 'position'>) | Omit<IHoverOptions, 'target' | 'position'>,
		lifecycleOptions?: IHoverLifecycleOptions,
	): IDisposable {
		const resolveHoverOptions = (e?: MouseEvent) => ({
			...typeof options === 'function' ? options() : options,
			target: e ? resolveMouseStyleHoverTarget(target, e) : target
		} satisfies IHoverOptions);
		return this._setupDelayedHover(target, resolveHoverOptions, lifecycleOptions);
	}

	private _setupDelayedHover(
		target: HTMLElement,
		resolveHoverOptions: ((e?: MouseEvent) => IHoverOptions),
		lifecycleOptions?: IHoverLifecycleOptions,
	) {
		const store = new DisposableStore();
		store.add(addDisposableListener(target, EventType.MOUSE_OVER, e => {
			this.showDelayedHover(resolveHoverOptions(e), {
				groupId: lifecycleOptions?.groupId,
				reducedDelay: lifecycleOptions?.reducedDelay,
			});
		}));
		if (lifecycleOptions?.setupKeyboardEvents) {
			store.add(addDisposableListener(target, EventType.KEY_DOWN, e => {
				const evt = new StandardKeyboardEvent(e);
				if (evt.equals(KeyCode.Space) || evt.equals(KeyCode.Enter)) {
					this.showInstantHover(resolveHoverOptions(), true);
				}
			}));
		}

		this._delayedHovers.set(target, { show: (focus: boolean) => { this.showInstantHover(resolveHoverOptions(), focus); } });
		store.add(toDisposable(() => this._delayedHovers.delete(target)));

		return store;
	}

	private _createHover(options: IHoverOptions, skipLastFocusedUpdate?: boolean): ICreateHoverResult | undefined {
		this._currentDelayedHover = undefined;

		if (options.content === '') {
			return undefined;
		}

		// Set `id` to default if it's undefined
		if (options.id === undefined) {
			options.id = getHoverIdFromContent(options.content);
		}

		// Check if the target is inside an existing hover (nesting scenario)
		const containingHoverIndex = this._getContainingHoverIndex(options.target);
		const isNesting = containingHoverIndex >= 0;

		if (isNesting) {
			// Check max nesting depth
			if (this._hoverStack.length >= MAX_HOVER_NESTING_DEPTH) {
				return undefined;
			}
			// When nesting, don't check if the parent is locked - we allow nested hovers inside locked parents
		} else {
			// Not nesting: check if current top-level hover is locked
			if (this._currentHover?.isLocked) {
				return undefined;
			}

			// Check if identity is the same as current hover
			if (getHoverOptionsIdentity(this._currentHoverOptions) === getHoverOptionsIdentity(options)) {
				return undefined;
			}
		}

		this._lastHoverOptions = options;
		const trapFocus = options.trapFocus || this._accessibilityService.isScreenReaderOptimized();
		const activeElement = getActiveElement();
		let lastFocusedElementBeforeOpen: HTMLElement | undefined;
		// HACK, remove this check when #189076 is fixed
		if (!skipLastFocusedUpdate) {
			if (trapFocus && activeElement) {
				if (!activeElement.classList.contains('monaco-hover')) {
					lastFocusedElementBeforeOpen = activeElement as HTMLElement;
				}
			}
		}

		const hoverDisposables = new DisposableStore();
		const hover = this._instantiationService.createInstance(HoverWidget, options);
		if (options.persistence?.sticky) {
			hover.isLocked = true;
		}

		// Adjust target position when a mouse event is provided as the hover position
		if (options.position?.hoverPosition && !isNumber(options.position.hoverPosition)) {
			options.target = {
				targetElements: isHTMLElement(options.target) ? [options.target] : options.target.targetElements,
				x: options.position.hoverPosition.x + 10
			};
		}

		hover.onDispose(() => {
			// Pop this hover from the stack if it's still there
			const stackIndex = this._hoverStack.findIndex(entry => entry.hover === hover);
			if (stackIndex >= 0) {
				const entry = this._hoverStack[stackIndex];
				// Restore focus if this hover was focused
				const hoverWasFocused = isAncestorOfActiveElement(hover.domNode);
				if (hoverWasFocused && entry.lastFocusedElementBeforeOpen) {
					entry.lastFocusedElementBeforeOpen.focus();
				}
				// Also dispose all nested hovers (hovers at higher indices in the stack)
				// Dispose from end to avoid index shifting issues
				while (this._hoverStack.length > stackIndex + 1) {
					const nestedEntry = this._hoverStack.pop()!;
					nestedEntry.contextView.dispose();
					nestedEntry.hover.dispose();
				}
				// Remove this hover from stack and dispose its context view
				this._hoverStack.splice(stackIndex, 1);
				entry.contextView.dispose();
			}
			hoverDisposables.dispose();
		}, undefined, hoverDisposables);

		// Set the container explicitly to enable aux window support
		if (!options.container) {
			const targetElement = isHTMLElement(options.target) ? options.target : options.target.targetElements[0];
			options.container = this._layoutService.getContainer(getWindow(targetElement));
		}

		if (options.persistence?.sticky) {
			hoverDisposables.add(addDisposableListener(getWindow(options.container).document, EventType.MOUSE_DOWN, e => {
				if (!isAncestor(e.target as HTMLElement, hover.domNode)) {
					this._hideHoverAndDescendants(hover);
				}
			}));
		} else {
			if ('targetElements' in options.target) {
				for (const element of options.target.targetElements) {
					hoverDisposables.add(addDisposableListener(element, EventType.CLICK, () => this._hideHoverAndDescendants(hover)));
				}
			} else {
				hoverDisposables.add(addDisposableListener(options.target, EventType.CLICK, () => this._hideHoverAndDescendants(hover)));
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

		return { hover, lastFocusedElementBeforeOpen, store: hoverDisposables };
	}

	private _showHover(result: ICreateHoverResult, options: IHoverOptions, focus?: boolean) {
		const { hover, lastFocusedElementBeforeOpen, store } = result;

		// Check if the target is inside an existing hover (nesting scenario)
		const containingHoverIndex = this._getContainingHoverIndex(options.target);
		const isNesting = containingHoverIndex >= 0;

		// If not nesting, close all existing hovers first
		if (!isNesting) {
			this._hideAllHovers();
		} else {
			// When nesting, close any sibling hovers (hovers at the same level or deeper
			// than the containing hover). This ensures hovers within the same container
			// are exclusive.
			for (let i = this._hoverStack.length - 1; i > containingHoverIndex; i--) {
				this._hoverStack[i].hover.dispose();
			}
			this._hoverStack.length = containingHoverIndex + 1;
		}

		// When nesting, add the new hover's container to all parent hovers' mouse trackers.
		// This makes the parent hovers treat the nested hover as part of themselves,
		// so they won't close when the mouse moves into the nested hover.
		if (isNesting) {
			for (let i = 0; i <= containingHoverIndex; i++) {
				store.add(this._hoverStack[i].hover.addMouseTrackingElement(hover.domNode));
			}
		}

		// Create a new ContextView for this hover with higher z-index for nested hovers
		const container = options.container ?? this._layoutService.getContainer(getWindow(isHTMLElement(options.target) ? options.target : options.target.targetElements[0]));
		const contextView = new ContextView(container, ContextViewDOMPosition.ABSOLUTE);

		// Push to stack
		const stackEntry: IHoverStackEntry = {
			hover,
			options,
			contextView,
			lastFocusedElementBeforeOpen
		};
		this._hoverStack.push(stackEntry);

		// Show the hover in its context view
		const delegate = new HoverContextViewDelegate(hover, focus, this._hoverStack.length);
		contextView.show(delegate);

		// Set up layout handling
		store.add(hover.onRequestLayout(() => contextView.layout()));

		options.onDidShow?.();
	}

	/**
	 * Hides a specific hover and all hovers nested inside it.
	 */
	private _hideHoverAndDescendants(hover: HoverWidget): void {
		const stackIndex = this._hoverStack.findIndex(entry => entry.hover === hover);
		if (stackIndex < 0) {
			return;
		}

		// Dispose all hovers from this index onwards (including nested ones)
		for (let i = this._hoverStack.length - 1; i >= stackIndex; i--) {
			this._hoverStack[i].hover.dispose();
		}
		this._hoverStack.length = stackIndex;
	}

	/**
	 * Hides all hovers in the stack.
	 */
	private _hideAllHovers(): void {
		for (let i = this._hoverStack.length - 1; i >= 0; i--) {
			this._hoverStack[i].hover.dispose();
		}
		this._hoverStack.length = 0;
	}

	hideHover(force?: boolean): void {
		if (this._hoverStack.length === 0) {
			return;
		}

		// If not forcing and the topmost hover is locked, don't hide
		if (!force && this._currentHover?.isLocked) {
			return;
		}

		// Hide only the topmost hover (pop from stack)
		this.doHideHover();
	}

	private doHideHover(): void {
		// Pop and dispose the topmost hover
		const length = this._hoverStack.length;
		this._hoverStack[length - 1]?.hover.dispose();
		this._hoverStack.length = length - 1;

		// After popping a nested hover, unlock the parent if it was locked due to nesting
		// (Note: the parent may have been explicitly locked via sticky, so we only unlock
		// if there are remaining hovers and they're not sticky)
		// For simplicity, we don't auto-unlock here - the parent remains in its current lock state
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
		this.showInstantHover(this._lastHoverOptions, true, true);
	}

	private _showAndFocusHoverForActiveElement(): void {
		// TODO: if hover is visible, focus it to avoid flickering

		let activeElement = getActiveElement() as HTMLElement | null;
		while (activeElement) {
			const hover = this._delayedHovers.get(activeElement) ?? this._managedHovers.get(activeElement);
			if (hover) {
				hover.show(true);
				return;
			}

			activeElement = activeElement.parentElement;
		}
	}

	private _keyDown(e: KeyboardEvent, hover: HoverWidget, hideOnKeyDown: boolean) {
		if (e.key === 'Alt') {
			// Lock all hovers in the stack when Alt is pressed
			for (const entry of this._hoverStack) {
				entry.hover.isLocked = true;
			}
			return;
		}
		const event = new StandardKeyboardEvent(e);
		const keybinding = this._keybindingService.resolveKeyboardEvent(event);
		if (keybinding.getSingleModifierDispatchChords().some(value => !!value) || this._keybindingService.softDispatch(event, event.target).kind !== ResultKind.NoMatchingKb) {
			return;
		}
		if (hideOnKeyDown && (!this._currentHoverOptions?.trapFocus || e.key !== 'Tab')) {
			// Find the entry for this hover to get its lastFocusedElementBeforeOpen
			const stackEntry = this._hoverStack.find(entry => entry.hover === hover);
			this._hideHoverAndDescendants(hover);
			stackEntry?.lastFocusedElementBeforeOpen?.focus();
		}
	}

	private _keyUp(e: KeyboardEvent, hover: HoverWidget) {
		if (e.key === 'Alt') {
			// Unlock all hovers in the stack when Alt is released
			for (const entry of this._hoverStack) {
				// Only unlock if not sticky
				if (!entry.options.persistence?.sticky) {
					entry.hover.isLocked = false;
				}
			}
			// Hide all hovers if the mouse is not over any of them
			const anyMouseIn = this._hoverStack.some(entry => entry.hover.isMouseIn);
			if (!anyMouseIn) {
				const topEntry = this._hoverStack[this._hoverStack.length - 1];
				this._hideAllHovers();
				topEntry?.lastFocusedElementBeforeOpen?.focus();
			}
		}
	}

	// TODO: Investigate performance of this function. There seems to be a lot of content created
	//       and thrown away on start up
	setupManagedHover(hoverDelegate: IHoverDelegate, targetElement: HTMLElement, content: IManagedHoverContentOrFactory, options?: IManagedHoverOptions | undefined): IManagedHover {
		if (hoverDelegate.showNativeHover) {
			return setupNativeHover(targetElement, content);
		}

		targetElement.setAttribute('custom-hover', 'true');

		if (targetElement.title !== '') {
			console.warn('HTML element already has a title attribute, which will conflict with the custom hover. Please remove the title attribute.');
			console.trace('Stack trace:', targetElement.title);
			targetElement.title = '';
		}

		let hoverPreparation: IDisposable | undefined;
		let hoverWidget: ManagedHoverWidget | undefined;

		const hideHover = (disposeWidget: boolean, disposePreparation: boolean) => {
			const hadHover = hoverWidget !== undefined;
			if (disposeWidget) {
				hoverWidget?.dispose();
				hoverWidget = undefined;
			}
			if (disposePreparation) {
				hoverPreparation?.dispose();
				hoverPreparation = undefined;
			}
			if (hadHover) {
				hoverDelegate.onDidHideHover?.();
				hoverWidget = undefined;
			}
		};

		const triggerShowHover = (delay: number, focus?: boolean, target?: IHoverDelegateTarget, trapFocus?: boolean) => {
			return new TimeoutTimer(async () => {
				if (!hoverWidget || hoverWidget.isDisposed) {
					hoverWidget = new ManagedHoverWidget(hoverDelegate, target || targetElement, delay > 0);
					await hoverWidget.update(typeof content === 'function' ? content() : content, focus, { ...options, trapFocus });
				}
			}, delay);
		};

		const store = new DisposableStore();
		let isMouseDown = false;
		store.add(addDisposableListener(targetElement, EventType.MOUSE_DOWN, () => {
			isMouseDown = true;
			hideHover(true, true);
		}, true));
		store.add(addDisposableListener(targetElement, EventType.MOUSE_UP, () => {
			isMouseDown = false;
		}, true));
		store.add(addDisposableListener(targetElement, EventType.MOUSE_LEAVE, (e: MouseEvent) => {
			isMouseDown = false;
			// HACK: `fromElement` is a non-standard property. Not sure what to replace it with,
			// `relatedTarget` is NOT equivalent.
			interface MouseEventWithFrom extends MouseEvent {
				fromElement: Element | null;
			}
			hideHover(false, (e as MouseEventWithFrom).fromElement === targetElement);
		}, true));
		store.add(addDisposableListener(targetElement, EventType.MOUSE_OVER, (e: MouseEvent) => {
			if (hoverPreparation) {
				return;
			}

			const mouseOverStore: DisposableStore = new DisposableStore();

			const target: IHoverDelegateTarget = {
				targetElements: [targetElement],
				dispose: () => { }
			};
			if (hoverDelegate.placement === undefined || hoverDelegate.placement === 'mouse') {
				// track the mouse position
				const onMouseMove = (e: MouseEvent) => {
					target.x = e.x + 10;
					if (!eventIsRelatedToTarget(e, targetElement)) {
						hideHover(true, true);
					}
				};
				mouseOverStore.add(addDisposableListener(targetElement, EventType.MOUSE_MOVE, onMouseMove, true));
			}

			hoverPreparation = mouseOverStore;

			if (!eventIsRelatedToTarget(e, targetElement)) {
				return; // Do not show hover when the mouse is over another hover target
			}

			mouseOverStore.add(triggerShowHover(typeof hoverDelegate.delay === 'function' ? hoverDelegate.delay(content) : hoverDelegate.delay, false, target));
		}, true));

		const onFocus = (e: FocusEvent) => {
			if (isMouseDown || hoverPreparation) {
				return;
			}
			if (!eventIsRelatedToTarget(e, targetElement)) {
				return; // Do not show hover when the focus is on another hover target
			}

			const target: IHoverDelegateTarget = {
				targetElements: [targetElement],
				dispose: () => { }
			};
			const toDispose: DisposableStore = new DisposableStore();
			const onBlur = () => hideHover(true, true);
			toDispose.add(addDisposableListener(targetElement, EventType.BLUR, onBlur, true));
			toDispose.add(triggerShowHover(typeof hoverDelegate.delay === 'function' ? hoverDelegate.delay(content) : hoverDelegate.delay, false, target));
			hoverPreparation = toDispose;
		};

		// Do not show hover when focusing an input or textarea
		if (!isEditableElement(targetElement)) {
			store.add(addDisposableListener(targetElement, EventType.FOCUS, onFocus, true));
		}

		const hover: IManagedHover = {
			show: focus => {
				hideHover(false, true); // terminate a ongoing mouse over preparation
				triggerShowHover(0, focus, undefined, focus); // show hover immediately
			},
			hide: () => {
				hideHover(true, true);
			},
			update: async (newContent, hoverOptions) => {
				content = newContent;
				await hoverWidget?.update(content, undefined, hoverOptions);
			},
			dispose: () => {
				this._managedHovers.delete(targetElement);
				store.dispose();
				hideHover(true, true);
			}
		};
		this._managedHovers.set(targetElement, hover);
		return hover;
	}

	showManagedHover(target: HTMLElement): void {
		const hover = this._managedHovers.get(target);
		if (hover) {
			hover.show(true);
		}
	}

	public override dispose(): void {
		this._managedHovers.forEach(hover => hover.dispose());
		super.dispose();
	}
}

function getHoverOptionsIdentity(options: IHoverOptions | undefined): IHoverOptions | number | string | undefined {
	if (options === undefined) {
		return undefined;
	}
	return options?.id ?? options;
}

function getHoverIdFromContent(content: string | HTMLElement | IMarkdownString): string | undefined {
	if (isHTMLElement(content)) {
		return undefined;
	}
	if (typeof content === 'string') {
		return content.toString();
	}
	return content.value;
}

function getStringContent(contentOrFactory: IManagedHoverContentOrFactory): string | undefined {
	const content = typeof contentOrFactory === 'function' ? contentOrFactory() : contentOrFactory;
	if (isString(content)) {
		// Icons don't render in the native hover so we strip them out
		return stripIcons(content);
	}
	if (isManagedHoverTooltipMarkdownString(content)) {
		return content.markdownNotSupportedFallback;
	}
	return undefined;
}

function setupNativeHover(targetElement: HTMLElement, content: IManagedHoverContentOrFactory): IManagedHover {
	function updateTitle(title: string | undefined) {
		if (title) {
			targetElement.setAttribute('title', title);
		} else {
			targetElement.removeAttribute('title');
		}
	}

	updateTitle(getStringContent(content));
	return {
		update: (content) => updateTitle(getStringContent(content)),
		show: () => { },
		hide: () => { },
		dispose: () => updateTitle(undefined),
	};
}

class HoverContextViewDelegate implements IDelegate {

	// Render over all other context views, with higher layers for nested hovers
	public readonly layer: number;

	get anchorPosition() {
		return this._hover.anchor;
	}

	constructor(
		private readonly _hover: HoverWidget,
		private readonly _focus: boolean = false,
		stackDepth: number = 1
	) {
		// Base layer is 1, nested hovers get higher layers
		this.layer = stackDepth;
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

function eventIsRelatedToTarget(event: UIEvent, target: HTMLElement): boolean {
	return isHTMLElement(event.target) && getHoverTargetElement(event.target, target) === target;
}

function getHoverTargetElement(element: HTMLElement, stopElement?: HTMLElement): HTMLElement {
	stopElement = stopElement ?? getWindow(element).document.body;
	while (!element.hasAttribute('custom-hover') && element !== stopElement) {
		element = element.parentElement!;
	}
	return element;
}

function resolveMouseStyleHoverTarget(target: HTMLElement, e: MouseEvent): IHoverTarget {
	return {
		targetElements: [target],
		x: e.x + 10
	};
}

registerSingleton(IHoverService, HoverService, InstantiationType.Delayed);

registerThemingParticipant((theme, collector) => {
	const hoverBorder = theme.getColor(editorHoverBorder);
	if (hoverBorder) {
		collector.addRule(`.monaco-hover.workbench-hover .hover-row:not(:first-child):not(:empty) { border-top: 1px solid ${hoverBorder.transparent(0.5)}; }`);
		collector.addRule(`.monaco-hover.workbench-hover hr { border-top: 1px solid ${hoverBorder.transparent(0.5)}; }`);
	}
});
