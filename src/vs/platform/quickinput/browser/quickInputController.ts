/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../base/browser/dom.js';
import { ActionBar } from '../../../base/browser/ui/actionbar/actionbar.js';
import { ActionViewItem } from '../../../base/browser/ui/actionbar/actionViewItems.js';
import { Button } from '../../../base/browser/ui/button/button.js';
import { CountBadge } from '../../../base/browser/ui/countBadge/countBadge.js';
import { ProgressBar } from '../../../base/browser/ui/progressbar/progressbar.js';
import { CancellationToken } from '../../../base/common/cancellation.js';
import { Emitter, Event } from '../../../base/common/event.js';
import { KeyCode } from '../../../base/common/keyCodes.js';
import { Disposable, DisposableStore, dispose } from '../../../base/common/lifecycle.js';
import Severity from '../../../base/common/severity.js';
import { isString } from '../../../base/common/types.js';
import { localize } from '../../../nls.js';
import { IInputBox, IInputOptions, IKeyMods, IPickOptions, IQuickInput, IQuickInputButton, IQuickNavigateConfiguration, IQuickPick, IQuickPickItem, IQuickWidget, QuickInputHideReason, QuickPickInput, QuickPickFocus } from '../common/quickInput.js';
import { QuickInputBox } from './quickInputBox.js';
import { QuickInputUI, Writeable, IQuickInputStyles, IQuickInputOptions, QuickPick, backButton, InputBox, Visibilities, QuickWidget, InQuickInputContextKey, QuickInputTypeContextKey, EndOfQuickInputBoxContextKey } from './quickInput.js';
import { ILayoutService } from '../../layout/browser/layoutService.js';
import { mainWindow } from '../../../base/browser/window.js';
import { IInstantiationService } from '../../instantiation/common/instantiation.js';
import { QuickInputTree } from './quickInputTree.js';
import { IContextKeyService } from '../../contextkey/common/contextkey.js';
import './quickInputActions.js';

const $ = dom.$;

export class QuickInputController extends Disposable {
	private static readonly MAX_WIDTH = 600; // Max total width of quick input widget

	private idPrefix: string;
	private ui: QuickInputUI | undefined;
	private dimension?: dom.IDimension;
	private titleBarOffset?: number;
	private enabled = true;
	private readonly onDidAcceptEmitter = this._register(new Emitter<void>());
	private readonly onDidCustomEmitter = this._register(new Emitter<void>());
	private readonly onDidTriggerButtonEmitter = this._register(new Emitter<IQuickInputButton>());
	private keyMods: Writeable<IKeyMods> = { ctrlCmd: false, alt: false };

	private controller: IQuickInput | null = null;
	get currentQuickInput() { return this.controller ?? undefined; }

	private _container: HTMLElement;
	get container() { return this._container; }

	private styles: IQuickInputStyles;

	private onShowEmitter = this._register(new Emitter<void>());
	readonly onShow = this.onShowEmitter.event;

	private onHideEmitter = this._register(new Emitter<void>());
	readonly onHide = this.onHideEmitter.event;

	private previousFocusElement?: HTMLElement;

	private readonly inQuickInputContext = InQuickInputContextKey.bindTo(this.contextKeyService);
	private readonly quickInputTypeContext = QuickInputTypeContextKey.bindTo(this.contextKeyService);
	private readonly endOfQuickInputBoxContext = EndOfQuickInputBoxContextKey.bindTo(this.contextKeyService);

	constructor(
		private options: IQuickInputOptions,
		@ILayoutService private readonly layoutService: ILayoutService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService
	) {
		super();
		this.idPrefix = options.idPrefix;
		this._container = options.container;
		this.styles = options.styles;
		this._register(Event.runAndSubscribe(dom.onDidRegisterWindow, ({ window, disposables }) => this.registerKeyModsListeners(window, disposables), { window: mainWindow, disposables: this._store }));
		this._register(dom.onWillUnregisterWindow(window => {
			if (this.ui && dom.getWindow(this.ui.container) === window) {
				// The window this quick input is contained in is about to
				// close, so we have to make sure to reparent it back to an
				// existing parent to not loose functionality.
				// (https://github.com/microsoft/vscode/issues/195870)
				this.reparentUI(this.layoutService.mainContainer);
				this.layout(this.layoutService.mainContainerDimension, this.layoutService.mainContainerOffset.quickPickTop);
			}
		}));
	}

	private registerKeyModsListeners(window: Window, disposables: DisposableStore): void {
		const listener = (e: KeyboardEvent | MouseEvent) => {
			this.keyMods.ctrlCmd = e.ctrlKey || e.metaKey;
			this.keyMods.alt = e.altKey;
		};

		for (const event of [dom.EventType.KEY_DOWN, dom.EventType.KEY_UP, dom.EventType.MOUSE_DOWN]) {
			disposables.add(dom.addDisposableListener(window, event, listener, true));
		}
	}

	private getUI(showInActiveContainer?: boolean) {
		if (this.ui) {
			// In order to support aux windows, re-parent the controller
			// if the original event is from a different document
			if (showInActiveContainer) {
				if (dom.getWindow(this._container) !== dom.getWindow(this.layoutService.activeContainer)) {
					this.reparentUI(this.layoutService.activeContainer);
					this.layout(this.layoutService.activeContainerDimension, this.layoutService.activeContainerOffset.quickPickTop);
				}
			}

			return this.ui;
		}

		const container = dom.append(this._container, $('.quick-input-widget.show-file-icons'));
		container.tabIndex = -1;
		container.style.display = 'none';

		const styleSheet = dom.createStyleSheet(container);

		const titleBar = dom.append(container, $('.quick-input-titlebar'));

		const leftActionBar = this._register(new ActionBar(titleBar, { hoverDelegate: this.options.hoverDelegate }));
		leftActionBar.domNode.classList.add('quick-input-left-action-bar');

		const title = dom.append(titleBar, $('.quick-input-title'));

		const rightActionBar = this._register(new ActionBar(titleBar, { hoverDelegate: this.options.hoverDelegate }));
		rightActionBar.domNode.classList.add('quick-input-right-action-bar');

		const headerContainer = dom.append(container, $('.quick-input-header'));

		const checkAll = <HTMLInputElement>dom.append(headerContainer, $('input.quick-input-check-all'));
		checkAll.type = 'checkbox';
		checkAll.setAttribute('aria-label', localize('quickInput.checkAll', "Toggle all checkboxes"));
		this._register(dom.addStandardDisposableListener(checkAll, dom.EventType.CHANGE, e => {
			const checked = checkAll.checked;
			list.setAllVisibleChecked(checked);
		}));
		this._register(dom.addDisposableListener(checkAll, dom.EventType.CLICK, e => {
			if (e.x || e.y) { // Avoid 'click' triggered by 'space'...
				inputBox.setFocus();
			}
		}));

		const description2 = dom.append(headerContainer, $('.quick-input-description'));
		const inputContainer = dom.append(headerContainer, $('.quick-input-and-message'));
		const filterContainer = dom.append(inputContainer, $('.quick-input-filter'));

		const inputBox = this._register(new QuickInputBox(filterContainer, this.styles.inputBox, this.styles.toggle));
		inputBox.setAttribute('aria-describedby', `${this.idPrefix}message`);

		const visibleCountContainer = dom.append(filterContainer, $('.quick-input-visible-count'));
		visibleCountContainer.setAttribute('aria-live', 'polite');
		visibleCountContainer.setAttribute('aria-atomic', 'true');
		const visibleCount = new CountBadge(visibleCountContainer, { countFormat: localize({ key: 'quickInput.visibleCount', comment: ['This tells the user how many items are shown in a list of items to select from. The items can be anything. Currently not visible, but read by screen readers.'] }, "{0} Results") }, this.styles.countBadge);

		const countContainer = dom.append(filterContainer, $('.quick-input-count'));
		countContainer.setAttribute('aria-live', 'polite');
		const count = new CountBadge(countContainer, { countFormat: localize({ key: 'quickInput.countSelected', comment: ['This tells the user how many items are selected in a list of items to select from. The items can be anything.'] }, "{0} Selected") }, this.styles.countBadge);

		const inlineActionBar = this._register(new ActionBar(headerContainer, { hoverDelegate: this.options.hoverDelegate }));
		inlineActionBar.domNode.classList.add('quick-input-inline-action-bar');

		const okContainer = dom.append(headerContainer, $('.quick-input-action'));
		const ok = this._register(new Button(okContainer, this.styles.button));
		ok.label = localize('ok', "OK");
		this._register(ok.onDidClick(e => {
			this.onDidAcceptEmitter.fire();
		}));

		const customButtonContainer = dom.append(headerContainer, $('.quick-input-action'));
		const customButton = this._register(new Button(customButtonContainer, { ...this.styles.button, supportIcons: true }));
		customButton.label = localize('custom', "Custom");
		this._register(customButton.onDidClick(e => {
			this.onDidCustomEmitter.fire();
		}));

		const message = dom.append(inputContainer, $(`#${this.idPrefix}message.quick-input-message`));

		const progressBar = this._register(new ProgressBar(container, this.styles.progressBar));
		progressBar.getContainer().classList.add('quick-input-progress');

		const widget = dom.append(container, $('.quick-input-html-widget'));
		widget.tabIndex = -1;

		const description1 = dom.append(container, $('.quick-input-description'));

		const listId = this.idPrefix + 'list';
		const list = this._register(this.instantiationService.createInstance(QuickInputTree, container, this.options.hoverDelegate, this.options.linkOpenerDelegate, listId));
		inputBox.setAttribute('aria-controls', listId);
		this._register(list.onDidChangeFocus(() => {
			inputBox.setAttribute('aria-activedescendant', list.getActiveDescendant() ?? '');
		}));
		this._register(list.onChangedAllVisibleChecked(checked => {
			checkAll.checked = checked;
		}));
		this._register(list.onChangedVisibleCount(c => {
			visibleCount.setCount(c);
		}));
		this._register(list.onChangedCheckedCount(c => {
			count.setCount(c);
		}));
		this._register(list.onLeave(() => {
			// Defer to avoid the input field reacting to the triggering key.
			// TODO@TylerLeonhardt https://github.com/microsoft/vscode/issues/203675
			setTimeout(() => {
				if (!this.controller) {
					return;
				}
				inputBox.setFocus();
				if (this.controller instanceof QuickPick && this.controller.canSelectMany) {
					list.clearFocus();
				}
			}, 0);
		}));

		const focusTracker = dom.trackFocus(container);
		this._register(focusTracker);
		this._register(dom.addDisposableListener(container, dom.EventType.FOCUS, e => {
			const ui = this.getUI();
			if (dom.isAncestor(e.relatedTarget as HTMLElement, ui.inputContainer)) {
				const value = ui.inputBox.isSelectionAtEnd();
				if (this.endOfQuickInputBoxContext.get() !== value) {
					this.endOfQuickInputBoxContext.set(value);
				}
			}
			// Ignore focus events within container
			if (dom.isAncestor(e.relatedTarget as HTMLElement, ui.container)) {
				return;
			}
			this.inQuickInputContext.set(true);
			this.previousFocusElement = dom.isHTMLElement(e.relatedTarget) ? e.relatedTarget : undefined;
		}, true));
		this._register(focusTracker.onDidBlur(() => {
			if (!this.getUI().ignoreFocusOut && !this.options.ignoreFocusOut()) {
				this.hide(QuickInputHideReason.Blur);
			}
			this.inQuickInputContext.set(false);
			this.endOfQuickInputBoxContext.set(false);
			this.previousFocusElement = undefined;
		}));
		this._register(inputBox.onKeyDown(_ => {
			const value = this.getUI().inputBox.isSelectionAtEnd();
			if (this.endOfQuickInputBoxContext.get() !== value) {
				this.endOfQuickInputBoxContext.set(value);
			}
		}));
		this._register(dom.addDisposableListener(container, dom.EventType.FOCUS, (e: FocusEvent) => {
			inputBox.setFocus();
		}));
		// TODO: Turn into commands instead of handling KEY_DOWN
		// Keybindings for the quickinput widget as a whole
		this._register(dom.addStandardDisposableListener(container, dom.EventType.KEY_DOWN, (event) => {
			if (dom.isAncestor(event.target, widget)) {
				return; // Ignore event if target is inside widget to allow the widget to handle the event.
			}
			switch (event.keyCode) {
				case KeyCode.Enter:
					dom.EventHelper.stop(event, true);
					if (this.enabled) {
						this.onDidAcceptEmitter.fire();
					}
					break;
				case KeyCode.Escape:
					dom.EventHelper.stop(event, true);
					this.hide(QuickInputHideReason.Gesture);
					break;
				case KeyCode.Tab:
					if (!event.altKey && !event.ctrlKey && !event.metaKey) {
						// detect only visible actions
						const selectors = [
							'.quick-input-list .monaco-action-bar .always-visible',
							'.quick-input-list-entry:hover .monaco-action-bar',
							'.monaco-list-row.focused .monaco-action-bar'
						];

						if (container.classList.contains('show-checkboxes')) {
							selectors.push('input');
						} else {
							selectors.push('input[type=text]');
						}
						if (this.getUI().list.displayed) {
							selectors.push('.monaco-list');
						}
						// focus links if there are any
						if (this.getUI().message) {
							selectors.push('.quick-input-message a');
						}

						if (this.getUI().widget) {
							if (dom.isAncestor(event.target, this.getUI().widget)) {
								// let the widget control tab
								break;
							}
							selectors.push('.quick-input-html-widget');
						}
						const stops = container.querySelectorAll<HTMLElement>(selectors.join(', '));
						if (event.shiftKey && event.target === stops[0]) {
							// Clear the focus from the list in order to allow
							// screen readers to read operations in the input box.
							dom.EventHelper.stop(event, true);
							list.clearFocus();
						} else if (!event.shiftKey && dom.isAncestor(event.target, stops[stops.length - 1])) {
							dom.EventHelper.stop(event, true);
							stops[0].focus();
						}
					}
					break;
				case KeyCode.Space:
					if (event.ctrlKey) {
						dom.EventHelper.stop(event, true);
						this.getUI().list.toggleHover();
					}
					break;
			}
		}));

		this.ui = {
			container,
			styleSheet,
			leftActionBar,
			titleBar,
			title,
			description1,
			description2,
			widget,
			rightActionBar,
			inlineActionBar,
			checkAll,
			inputContainer,
			filterContainer,
			inputBox,
			visibleCountContainer,
			visibleCount,
			countContainer,
			count,
			okContainer,
			ok,
			message,
			customButtonContainer,
			customButton,
			list,
			progressBar,
			onDidAccept: this.onDidAcceptEmitter.event,
			onDidCustom: this.onDidCustomEmitter.event,
			onDidTriggerButton: this.onDidTriggerButtonEmitter.event,
			ignoreFocusOut: false,
			keyMods: this.keyMods,
			show: controller => this.show(controller),
			hide: () => this.hide(),
			setVisibilities: visibilities => this.setVisibilities(visibilities),
			setEnabled: enabled => this.setEnabled(enabled),
			setContextKey: contextKey => this.options.setContextKey(contextKey),
			linkOpenerDelegate: content => this.options.linkOpenerDelegate(content)
		};
		this.updateStyles();
		return this.ui;
	}

	private reparentUI(container: HTMLElement): void {
		if (this.ui) {
			this._container = container;
			dom.append(this._container, this.ui.container);
		}
	}

	pick<T extends IQuickPickItem, O extends IPickOptions<T>>(picks: Promise<QuickPickInput<T>[]> | QuickPickInput<T>[], options: IPickOptions<T> = {}, token: CancellationToken = CancellationToken.None): Promise<(O extends { canPickMany: true } ? T[] : T) | undefined> {
		type R = (O extends { canPickMany: true } ? T[] : T) | undefined;
		return new Promise<R>((doResolve, reject) => {
			let resolve = (result: R) => {
				resolve = doResolve;
				options.onKeyMods?.(input.keyMods);
				doResolve(result);
			};
			if (token.isCancellationRequested) {
				resolve(undefined);
				return;
			}
			const input = this.createQuickPick<T>({ useSeparators: true });
			let activeItem: T | undefined;
			const disposables = [
				input,
				input.onDidAccept(() => {
					if (input.canSelectMany) {
						resolve(<R>input.selectedItems.slice());
						input.hide();
					} else {
						const result = input.activeItems[0];
						if (result) {
							resolve(<R>result);
							input.hide();
						}
					}
				}),
				input.onDidChangeActive(items => {
					const focused = items[0];
					if (focused && options.onDidFocus) {
						options.onDidFocus(focused);
					}
				}),
				input.onDidChangeSelection(items => {
					if (!input.canSelectMany) {
						const result = items[0];
						if (result) {
							resolve(<R>result);
							input.hide();
						}
					}
				}),
				input.onDidTriggerItemButton(event => options.onDidTriggerItemButton && options.onDidTriggerItemButton({
					...event,
					removeItem: () => {
						const index = input.items.indexOf(event.item);
						if (index !== -1) {
							const items = input.items.slice();
							const removed = items.splice(index, 1);
							const activeItems = input.activeItems.filter(activeItem => activeItem !== removed[0]);
							const keepScrollPositionBefore = input.keepScrollPosition;
							input.keepScrollPosition = true;
							input.items = items;
							if (activeItems) {
								input.activeItems = activeItems;
							}
							input.keepScrollPosition = keepScrollPositionBefore;
						}
					}
				})),
				input.onDidTriggerSeparatorButton(event => options.onDidTriggerSeparatorButton?.(event)),
				input.onDidChangeValue(value => {
					if (activeItem && !value && (input.activeItems.length !== 1 || input.activeItems[0] !== activeItem)) {
						input.activeItems = [activeItem];
					}
				}),
				token.onCancellationRequested(() => {
					input.hide();
				}),
				input.onDidHide(() => {
					dispose(disposables);
					resolve(undefined);
				}),
			];
			input.title = options.title;
			if (options.value) {
				input.value = options.value;
			}
			input.canSelectMany = !!options.canPickMany;
			input.placeholder = options.placeHolder;
			input.ignoreFocusOut = !!options.ignoreFocusLost;
			input.matchOnDescription = !!options.matchOnDescription;
			input.matchOnDetail = !!options.matchOnDetail;
			input.matchOnLabel = (options.matchOnLabel === undefined) || options.matchOnLabel; // default to true
			input.quickNavigate = options.quickNavigate;
			input.hideInput = !!options.hideInput;
			input.contextKey = options.contextKey;
			input.busy = true;
			Promise.all([picks, options.activeItem])
				.then(([items, _activeItem]) => {
					activeItem = _activeItem;
					input.busy = false;
					input.items = items;
					if (input.canSelectMany) {
						input.selectedItems = items.filter(item => item.type !== 'separator' && item.picked) as T[];
					}
					if (activeItem) {
						input.activeItems = [activeItem];
					}
				});
			input.show();
			Promise.resolve(picks).then(undefined, err => {
				reject(err);
				input.hide();
			});
		});
	}

	private setValidationOnInput(input: IInputBox, validationResult: string | {
		content: string;
		severity: Severity;
	} | null | undefined) {
		if (validationResult && isString(validationResult)) {
			input.severity = Severity.Error;
			input.validationMessage = validationResult;
		} else if (validationResult && !isString(validationResult)) {
			input.severity = validationResult.severity;
			input.validationMessage = validationResult.content;
		} else {
			input.severity = Severity.Ignore;
			input.validationMessage = undefined;
		}
	}

	input(options: IInputOptions = {}, token: CancellationToken = CancellationToken.None): Promise<string | undefined> {
		return new Promise<string | undefined>((resolve) => {
			if (token.isCancellationRequested) {
				resolve(undefined);
				return;
			}
			const input = this.createInputBox();
			const validateInput = options.validateInput || (() => <Promise<undefined>>Promise.resolve(undefined));
			const onDidValueChange = Event.debounce(input.onDidChangeValue, (last, cur) => cur, 100);
			let validationValue = options.value || '';
			let validation = Promise.resolve(validateInput(validationValue));
			const disposables = [
				input,
				onDidValueChange(value => {
					if (value !== validationValue) {
						validation = Promise.resolve(validateInput(value));
						validationValue = value;
					}
					validation.then(result => {
						if (value === validationValue) {
							this.setValidationOnInput(input, result);
						}
					});
				}),
				input.onDidAccept(() => {
					const value = input.value;
					if (value !== validationValue) {
						validation = Promise.resolve(validateInput(value));
						validationValue = value;
					}
					validation.then(result => {
						if (!result || (!isString(result) && result.severity !== Severity.Error)) {
							resolve(value);
							input.hide();
						} else if (value === validationValue) {
							this.setValidationOnInput(input, result);
						}
					});
				}),
				token.onCancellationRequested(() => {
					input.hide();
				}),
				input.onDidHide(() => {
					dispose(disposables);
					resolve(undefined);
				}),
			];

			input.title = options.title;
			input.value = options.value || '';
			input.valueSelection = options.valueSelection;
			input.prompt = options.prompt;
			input.placeholder = options.placeHolder;
			input.password = !!options.password;
			input.ignoreFocusOut = !!options.ignoreFocusLost;
			input.show();
		});
	}

	backButton = backButton;

	createQuickPick<T extends IQuickPickItem>(options: { useSeparators: true }): IQuickPick<T, { useSeparators: true }>;
	createQuickPick<T extends IQuickPickItem>(options?: { useSeparators: boolean }): IQuickPick<T, { useSeparators: false }>;
	createQuickPick<T extends IQuickPickItem>(options: { useSeparators: boolean } = { useSeparators: false }): IQuickPick<T, { useSeparators: boolean }> {
		const ui = this.getUI(true);
		return new QuickPick<T, typeof options>(ui);
	}

	createInputBox(): IInputBox {
		const ui = this.getUI(true);
		return new InputBox(ui);
	}

	createQuickWidget(): IQuickWidget {
		const ui = this.getUI(true);
		return new QuickWidget(ui);
	}

	private show(controller: IQuickInput) {
		const ui = this.getUI(true);
		this.onShowEmitter.fire();
		const oldController = this.controller;
		this.controller = controller;
		oldController?.didHide();

		this.setEnabled(true);
		ui.leftActionBar.clear();
		ui.title.textContent = '';
		ui.description1.textContent = '';
		ui.description2.textContent = '';
		dom.reset(ui.widget);
		ui.rightActionBar.clear();
		ui.inlineActionBar.clear();
		ui.checkAll.checked = false;
		// ui.inputBox.value = ''; Avoid triggering an event.
		ui.inputBox.placeholder = '';
		ui.inputBox.password = false;
		ui.inputBox.showDecoration(Severity.Ignore);
		ui.visibleCount.setCount(0);
		ui.count.setCount(0);
		dom.reset(ui.message);
		ui.progressBar.stop();
		ui.list.setElements([]);
		ui.list.matchOnDescription = false;
		ui.list.matchOnDetail = false;
		ui.list.matchOnLabel = true;
		ui.list.sortByLabel = true;
		ui.ignoreFocusOut = false;
		ui.inputBox.toggles = undefined;

		const backKeybindingLabel = this.options.backKeybindingLabel();
		backButton.tooltip = backKeybindingLabel ? localize('quickInput.backWithKeybinding', "Back ({0})", backKeybindingLabel) : localize('quickInput.back', "Back");

		ui.container.style.display = '';
		this.updateLayout();
		ui.inputBox.setFocus();
		this.quickInputTypeContext.set(controller.type);
	}

	isVisible(): boolean {
		return !!this.ui && this.ui.container.style.display !== 'none';
	}

	private setVisibilities(visibilities: Visibilities) {
		const ui = this.getUI();
		ui.title.style.display = visibilities.title ? '' : 'none';
		ui.description1.style.display = visibilities.description && (visibilities.inputBox || visibilities.checkAll) ? '' : 'none';
		ui.description2.style.display = visibilities.description && !(visibilities.inputBox || visibilities.checkAll) ? '' : 'none';
		ui.checkAll.style.display = visibilities.checkAll ? '' : 'none';
		ui.inputContainer.style.display = visibilities.inputBox ? '' : 'none';
		ui.filterContainer.style.display = visibilities.inputBox ? '' : 'none';
		ui.visibleCountContainer.style.display = visibilities.visibleCount ? '' : 'none';
		ui.countContainer.style.display = visibilities.count ? '' : 'none';
		ui.okContainer.style.display = visibilities.ok ? '' : 'none';
		ui.customButtonContainer.style.display = visibilities.customButton ? '' : 'none';
		ui.message.style.display = visibilities.message ? '' : 'none';
		ui.progressBar.getContainer().style.display = visibilities.progressBar ? '' : 'none';
		ui.list.displayed = !!visibilities.list;
		ui.container.classList.toggle('show-checkboxes', !!visibilities.checkBox);
		ui.container.classList.toggle('hidden-input', !visibilities.inputBox && !visibilities.description);
		this.updateLayout(); // TODO
	}

	private setEnabled(enabled: boolean) {
		if (enabled !== this.enabled) {
			this.enabled = enabled;
			for (const item of this.getUI().leftActionBar.viewItems) {
				(item as ActionViewItem).action.enabled = enabled;
			}
			for (const item of this.getUI().rightActionBar.viewItems) {
				(item as ActionViewItem).action.enabled = enabled;
			}
			this.getUI().checkAll.disabled = !enabled;
			this.getUI().inputBox.enabled = enabled;
			this.getUI().ok.enabled = enabled;
			this.getUI().list.enabled = enabled;
		}
	}

	hide(reason?: QuickInputHideReason) {
		const controller = this.controller;
		if (!controller) {
			return;
		}
		controller.willHide(reason);

		const container = this.ui?.container;
		const focusChanged = container && !dom.isAncestorOfActiveElement(container);
		this.controller = null;
		this.onHideEmitter.fire();
		if (container) {
			container.style.display = 'none';
		}
		if (!focusChanged) {
			let currentElement = this.previousFocusElement;
			while (currentElement && !currentElement.offsetParent) {
				currentElement = currentElement.parentElement ?? undefined;
			}
			if (currentElement?.offsetParent) {
				currentElement.focus();
				this.previousFocusElement = undefined;
			} else {
				this.options.returnFocus();
			}
		}
		controller.didHide(reason);
	}

	focus() {
		if (this.isVisible()) {
			const ui = this.getUI();
			if (ui.inputBox.enabled) {
				ui.inputBox.setFocus();
			} else {
				ui.list.domFocus();
			}
		}
	}

	toggle() {
		if (this.isVisible() && this.controller instanceof QuickPick && this.controller.canSelectMany) {
			this.getUI().list.toggleCheckbox();
		}
	}

	navigate(next: boolean, quickNavigate?: IQuickNavigateConfiguration) {
		if (this.isVisible() && this.getUI().list.displayed) {
			this.getUI().list.focus(next ? QuickPickFocus.Next : QuickPickFocus.Previous);
			if (quickNavigate && this.controller instanceof QuickPick) {
				this.controller.quickNavigate = quickNavigate;
			}
		}
	}

	async accept(keyMods: IKeyMods = { alt: false, ctrlCmd: false }) {
		// When accepting the item programmatically, it is important that
		// we update `keyMods` either from the provided set or unset it
		// because the accept did not happen from mouse or keyboard
		// interaction on the list itself
		this.keyMods.alt = keyMods.alt;
		this.keyMods.ctrlCmd = keyMods.ctrlCmd;

		this.onDidAcceptEmitter.fire();
	}

	async back() {
		this.onDidTriggerButtonEmitter.fire(this.backButton);
	}

	async cancel() {
		this.hide();
	}

	layout(dimension: dom.IDimension, titleBarOffset: number): void {
		this.dimension = dimension;
		this.titleBarOffset = titleBarOffset;
		this.updateLayout();
	}

	private updateLayout() {
		if (this.ui && this.isVisible()) {
			this.ui.container.style.top = `${this.titleBarOffset}px`;

			const style = this.ui.container.style;
			const width = Math.min(this.dimension!.width * 0.62 /* golden cut */, QuickInputController.MAX_WIDTH);
			style.width = width + 'px';
			style.marginLeft = '-' + (width / 2) + 'px';

			this.ui.inputBox.layout();
			this.ui.list.layout(this.dimension && this.dimension.height * 0.4);
		}
	}

	applyStyles(styles: IQuickInputStyles) {
		this.styles = styles;
		this.updateStyles();
	}

	private updateStyles() {
		if (this.ui) {
			const {
				quickInputTitleBackground, quickInputBackground, quickInputForeground, widgetBorder, widgetShadow,
			} = this.styles.widget;
			this.ui.titleBar.style.backgroundColor = quickInputTitleBackground ?? '';
			this.ui.container.style.backgroundColor = quickInputBackground ?? '';
			this.ui.container.style.color = quickInputForeground ?? '';
			this.ui.container.style.border = widgetBorder ? `1px solid ${widgetBorder}` : '';
			this.ui.container.style.boxShadow = widgetShadow ? `0 0 8px 2px ${widgetShadow}` : '';
			this.ui.list.style(this.styles.list);

			const content: string[] = [];
			if (this.styles.pickerGroup.pickerGroupBorder) {
				content.push(`.quick-input-list .quick-input-list-entry { border-top-color:  ${this.styles.pickerGroup.pickerGroupBorder}; }`);
			}
			if (this.styles.pickerGroup.pickerGroupForeground) {
				content.push(`.quick-input-list .quick-input-list-separator { color:  ${this.styles.pickerGroup.pickerGroupForeground}; }`);
			}
			if (this.styles.pickerGroup.pickerGroupForeground) {
				content.push(`.quick-input-list .quick-input-list-separator-as-item { color: var(--vscode-descriptionForeground); }`);
			}

			if (this.styles.keybindingLabel.keybindingLabelBackground ||
				this.styles.keybindingLabel.keybindingLabelBorder ||
				this.styles.keybindingLabel.keybindingLabelBottomBorder ||
				this.styles.keybindingLabel.keybindingLabelShadow ||
				this.styles.keybindingLabel.keybindingLabelForeground) {
				content.push('.quick-input-list .monaco-keybinding > .monaco-keybinding-key {');
				if (this.styles.keybindingLabel.keybindingLabelBackground) {
					content.push(`background-color: ${this.styles.keybindingLabel.keybindingLabelBackground};`);
				}
				if (this.styles.keybindingLabel.keybindingLabelBorder) {
					// Order matters here. `border-color` must come before `border-bottom-color`.
					content.push(`border-color: ${this.styles.keybindingLabel.keybindingLabelBorder};`);
				}
				if (this.styles.keybindingLabel.keybindingLabelBottomBorder) {
					content.push(`border-bottom-color: ${this.styles.keybindingLabel.keybindingLabelBottomBorder};`);
				}
				if (this.styles.keybindingLabel.keybindingLabelShadow) {
					content.push(`box-shadow: inset 0 -1px 0 ${this.styles.keybindingLabel.keybindingLabelShadow};`);
				}
				if (this.styles.keybindingLabel.keybindingLabelForeground) {
					content.push(`color: ${this.styles.keybindingLabel.keybindingLabelForeground};`);
				}
				content.push('}');
			}

			const newStyles = content.join('\n');
			if (newStyles !== this.ui.styleSheet.textContent) {
				this.ui.styleSheet.textContent = newStyles;
			}
		}
	}
}
export interface IQuickInputControllerHost extends ILayoutService { }

