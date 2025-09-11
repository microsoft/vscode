/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { registerThemingParticipant } from '../../../../platform/theme/common/themeService.js';
import { editorHoverBorder } from '../../../../platform/theme/common/colorRegistry.js';
import { IHoverService } from '../../../../platform/hover/browser/hover.js';
import { IContextMenuService } from '../../../../platform/contextview/browser/contextView.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { HoverWidget } from './hoverWidget.js';
import { IContextViewProvider, IDelegate } from '../../../../base/browser/ui/contextview/contextview.js';
import { Disposable, DisposableStore, IDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { addDisposableListener, EventType, getActiveElement, isAncestorOfActiveElement, isAncestor, getWindow, isHTMLElement, isEditableElement } from '../../../../base/browser/dom.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { StandardKeyboardEvent } from '../../../../base/browser/keyboardEvent.js';
import { ResultKind } from '../../../../platform/keybinding/common/keybindingResolver.js';
import { IAccessibilityService } from '../../../../platform/accessibility/common/accessibility.js';
import { ILayoutService } from '../../../../platform/layout/browser/layoutService.js';
import { mainWindow } from '../../../../base/browser/window.js';
import { ContextViewHandler } from '../../../../platform/contextview/browser/contextViewService.js';
import { isManagedHoverTooltipMarkdownString, type IHoverLifecycleOptions, type IHoverOptions, type IHoverWidget, type IManagedHover, type IManagedHoverContentOrFactory, type IManagedHoverOptions } from '../../../../base/browser/ui/hover/hover.js';
import type { IHoverDelegate, IHoverDelegateTarget } from '../../../../base/browser/ui/hover/hoverDelegate.js';
import { ManagedHoverWidget } from './updatableHoverWidget.js';
import { timeout, TimeoutTimer } from '../../../../base/common/async.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { isNumber, isString } from '../../../../base/common/types.js';
import { KeyChord, KeyCode, KeyMod } from '../../../../base/common/keyCodes.js';
import { KeybindingsRegistry, KeybindingWeight } from '../../../../platform/keybinding/common/keybindingsRegistry.js';
import { EditorContextKeys } from '../../../common/editorContextKeys.js';
import { IMarkdownString } from '../../../../base/common/htmlContent.js';
import { stripIcons } from '../../../../base/common/iconLabels.js';

export class HoverService extends Disposable implements IHoverService {
	declare readonly _serviceBrand: undefined;

	private _contextViewHandler: IContextViewProvider;
	private _currentHoverOptions: IHoverOptions | undefined;
	private _currentHover: HoverWidget | undefined;
	private _currentDelayedHover: HoverWidget | undefined;
	private _currentDelayedHoverWasShown: boolean = false;
	private _currentDelayedHoverGroupId: number | string | undefined;
	private _lastHoverOptions: IHoverOptions | undefined;

	private _lastFocusedElementBeforeOpen: HTMLElement | undefined;

	private readonly _delayedHovers = new Map<HTMLElement, { show: (focus: boolean) => void }>();
	private readonly _managedHovers = new Map<HTMLElement, IManagedHover>();

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
		this._contextViewHandler = this._register(new ContextViewHandler(this._layoutService));

		this._register(KeybindingsRegistry.registerCommandAndKeybindingRule({
			id: 'workbench.action.showHover',
			weight: KeybindingWeight.WorkbenchContrib - 1,
			when: EditorContextKeys.editorTextFocus.negate(),
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
		return hover;
	}

	showDelayedHover(
		options: IHoverOptions,
		lifecycleOptions: Pick<IHoverLifecycleOptions, 'groupId'>,
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

		this._currentDelayedHover = hover;
		this._currentDelayedHoverWasShown = false;
		this._currentDelayedHoverGroupId = lifecycleOptions?.groupId;

		timeout(this._configurationService.getValue<number>('workbench.hover.delay')).then(() => {
			if (hover && !hover.isDisposed) {
				this._currentDelayedHoverWasShown = true;
				this._showHover(hover, options);
			}
		});

		return hover;
	}

	setupDelayedHover(
		target: HTMLElement,
		options: (() => Omit<IHoverOptions, 'target'>) | Omit<IHoverOptions, 'target'>,
		lifecycleOptions?: IHoverLifecycleOptions,
	): IDisposable {
		const resolveHoverOptions = () => ({
			...typeof options === 'function' ? options() : options,
			target
		} satisfies IHoverOptions);
		return this._setupDelayedHover(target, resolveHoverOptions, lifecycleOptions);
	}

	setupDelayedHoverAtMouse(
		target: HTMLElement,
		options: (() => Omit<IHoverOptions, 'target' | 'position'>) | Omit<IHoverOptions, 'target' | 'position'>,
		lifecycleOptions?: IHoverLifecycleOptions,
	): IDisposable {
		const resolveHoverOptions = (e?: MouseEvent) => ({
			...typeof options === 'function' ? options() : options,
			target: {
				targetElements: [target],
				x: e !== undefined ? e.x + 10 : undefined,
			}
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
				groupId: lifecycleOptions?.groupId
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

	private _createHover(options: IHoverOptions, skipLastFocusedUpdate?: boolean): HoverWidget | undefined {
		this._currentDelayedHover = undefined;

		if (this._currentHover?.isLocked) {
			return undefined;
		}

		// Set `id` to default if it's undefined
		if (options.id === undefined) {
			options.id = getHoverIdFromContent(options.content);
		}

		if (getHoverOptionsIdentity(this._currentHoverOptions) === getHoverOptionsIdentity(options)) {
			return undefined;
		}
		this._currentHoverOptions = options;
		this._lastHoverOptions = options;
		const trapFocus = options.trapFocus || this._accessibilityService.isScreenReaderOptimized();
		const activeElement = getActiveElement();
		// HACK, remove this check when #189076 is fixed
		if (!skipLastFocusedUpdate) {
			if (trapFocus && activeElement) {
				if (!activeElement.classList.contains('monaco-hover')) {
					this._lastFocusedElementBeforeOpen = activeElement as HTMLElement;
				}
			} else {
				this._lastFocusedElementBeforeOpen = undefined;
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
			const hoverWasFocused = this._currentHover?.domNode && isAncestorOfActiveElement(this._currentHover.domNode);
			if (hoverWasFocused) {
				// Required to handle cases such as closing the hover with the escape key
				this._lastFocusedElementBeforeOpen?.focus();
			}

			// Only clear the current options if it's the current hover, the current options help
			// reduce flickering when the same hover is shown multiple times
			if (getHoverOptionsIdentity(this._currentHoverOptions) === getHoverOptionsIdentity(options)) {
				this.doHideHover();
			}
			hoverDisposables.dispose();
		}, undefined, hoverDisposables);
		// Set the container explicitly to enable aux window support
		if (!options.container) {
			const targetElement = isHTMLElement(options.target) ? options.target : options.target.targetElements[0];
			options.container = this._layoutService.getContainer(getWindow(targetElement));
		}

		hover.onRequestLayout(() => this._contextViewHandler.layout(), undefined, hoverDisposables);
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

	private _showHover(hover: HoverWidget, options: IHoverOptions, focus?: boolean) {
		this._contextViewHandler.showContextView(
			new HoverContextViewDelegate(hover, focus),
			options.container
		);
	}

	hideHover(force?: boolean): void {
		if ((!force && this._currentHover?.isLocked) || !this._currentHoverOptions) {
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
			hideHover(false, (<any>e).fromElement === targetElement);
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
					if ((isHTMLElement(e.target)) && getHoverTargetElement(e.target, targetElement) !== targetElement) {
						hideHover(true, true);
					}
				};
				mouseOverStore.add(addDisposableListener(targetElement, EventType.MOUSE_MOVE, onMouseMove, true));
			}

			hoverPreparation = mouseOverStore;

			if ((isHTMLElement(e.target)) && getHoverTargetElement(e.target as HTMLElement, targetElement) !== targetElement) {
				return; // Do not show hover when the mouse is over another hover target
			}

			mouseOverStore.add(triggerShowHover(typeof hoverDelegate.delay === 'function' ? hoverDelegate.delay(content) : hoverDelegate.delay, false, target));
		}, true));

		const onFocus = () => {
			if (isMouseDown || hoverPreparation) {
				return;
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

function getHoverTargetElement(element: HTMLElement, stopElement?: HTMLElement): HTMLElement {
	stopElement = stopElement ?? getWindow(element).document.body;
	while (!element.hasAttribute('custom-hover') && element !== stopElement) {
		element = element.parentElement!;
	}
	return element;
}

registerSingleton(IHoverService, HoverService, InstantiationType.Delayed);

registerThemingParticipant((theme, collector) => {
	const hoverBorder = theme.getColor(editorHoverBorder);
	if (hoverBorder) {
		collector.addRule(`.monaco-workbench .workbench-hover .hover-row:not(:first-child):not(:empty) { border-top: 1px solid ${hoverBorder.transparent(0.5)}; }`);
		collector.addRule(`.monaco-workbench .workbench-hover hr { border-top: 1px solid ${hoverBorder.transparent(0.5)}; }`);
	}
});
