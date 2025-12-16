/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../base/browser/dom.js';
import * as domStylesheetsJs from '../../../base/browser/domStylesheets.js';
import { ActionBar } from '../../../base/browser/ui/actionbar/actionbar.js';
import { ActionViewItem } from '../../../base/browser/ui/actionbar/actionViewItems.js';
import { Button } from '../../../base/browser/ui/button/button.js';
import { CountBadge } from '../../../base/browser/ui/countBadge/countBadge.js';
import { ProgressBar } from '../../../base/browser/ui/progressbar/progressbar.js';
import { CancellationToken } from '../../../base/common/cancellation.js';
import { Emitter, Event } from '../../../base/common/event.js';
import { Disposable, DisposableStore, dispose } from '../../../base/common/lifecycle.js';
import Severity from '../../../base/common/severity.js';
import { isString } from '../../../base/common/types.js';
import { isModifierKey } from '../../../base/common/keyCodes.js';
import { localize } from '../../../nls.js';
import { IInputBox, IInputOptions, IKeyMods, IPickOptions, IQuickInput, IQuickInputButton, IQuickNavigateConfiguration, IQuickPick, IQuickPickItem, IQuickWidget, QuickInputHideReason, QuickPickInput, QuickPickFocus, QuickInputType, IQuickTree, IQuickTreeItem } from '../common/quickInput.js';
import { QuickInputBox } from './quickInputBox.js';
import { QuickInputUI, Writeable, IQuickInputStyles, IQuickInputOptions, QuickPick, backButton, InputBox, Visibilities, QuickWidget, InQuickInputContextKey, QuickInputTypeContextKey, EndOfQuickInputBoxContextKey, QuickInputAlignmentContextKey } from './quickInput.js';
import { ILayoutService } from '../../layout/browser/layoutService.js';
import { mainWindow } from '../../../base/browser/window.js';
import { IInstantiationService } from '../../instantiation/common/instantiation.js';
import { QuickInputList } from './quickInputList.js';
import { IContextKey, IContextKeyService } from '../../contextkey/common/contextkey.js';
import './quickInputActions.js';
import { autorun, observableValue } from '../../../base/common/observable.js';
import { StandardMouseEvent } from '../../../base/browser/mouseEvent.js';
import { IStorageService, StorageScope, StorageTarget } from '../../storage/common/storage.js';
import { IConfigurationService } from '../../configuration/common/configuration.js';
import { Platform, platform, setTimeout0 } from '../../../base/common/platform.js';
import { getWindowControlsStyle, WindowControlsStyle } from '../../window/common/window.js';
import { getZoomFactor } from '../../../base/browser/browser.js';
import { TriStateCheckbox } from '../../../base/browser/ui/toggle/toggle.js';
import { defaultCheckboxStyles } from '../../theme/browser/defaultStyles.js';
import { QuickInputTreeController } from './tree/quickInputTreeController.js';
import { QuickTree } from './tree/quickTree.js';

const $ = dom.$;

const VIEWSTATE_STORAGE_KEY = 'workbench.quickInput.viewState';

type QuickInputViewState = {
	readonly top?: number;
	readonly left?: number;
};

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

	private viewState: QuickInputViewState | undefined;
	private dndController: QuickInputDragAndDropController | undefined;

	private readonly inQuickInputContext: IContextKey<boolean>;
	private readonly quickInputTypeContext: IContextKey<QuickInputType>;
	private readonly endOfQuickInputBoxContext: IContextKey<boolean>;

	constructor(
		private options: IQuickInputOptions,
		@ILayoutService private readonly layoutService: ILayoutService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IStorageService private readonly storageService: IStorageService
	) {
		super();

		this.inQuickInputContext = InQuickInputContextKey.bindTo(contextKeyService);
		this.quickInputTypeContext = QuickInputTypeContextKey.bindTo(contextKeyService);
		this.endOfQuickInputBoxContext = EndOfQuickInputBoxContextKey.bindTo(contextKeyService);

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
		this.viewState = this.loadViewState();
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

	private getUI(showInActiveContainer?: boolean): QuickInputUI {
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

		const styleSheet = domStylesheetsJs.createStyleSheet(container);

		const titleBar = dom.append(container, $('.quick-input-titlebar'));

		const leftActionBar = this._register(new ActionBar(titleBar, { hoverDelegate: this.options.hoverDelegate }));
		leftActionBar.domNode.classList.add('quick-input-left-action-bar');

		const title = dom.append(titleBar, $('.quick-input-title'));

		const rightActionBar = this._register(new ActionBar(titleBar, { hoverDelegate: this.options.hoverDelegate }));
		rightActionBar.domNode.classList.add('quick-input-right-action-bar');

		const headerContainer = dom.append(container, $('.quick-input-header'));

		const checkAll = this._register(new TriStateCheckbox(localize('quickInput.checkAll', "Toggle all checkboxes"), false, { ...defaultCheckboxStyles, size: 15 }));
		dom.append(headerContainer, checkAll.domNode);
		this._register(checkAll.onChange(() => {
			const checked = checkAll.checked;
			list.setAllVisibleChecked(checked === true);
		}));
		this._register(dom.addDisposableListener(checkAll.domNode, dom.EventType.CLICK, e => {
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
		const visibleCount = this._register(new CountBadge(visibleCountContainer, { countFormat: localize({ key: 'quickInput.visibleCount', comment: ['This tells the user how many items are shown in a list of items to select from. The items can be anything. Currently not visible, but read by screen readers.'] }, "{0} Results") }, this.styles.countBadge));

		const countContainer = dom.append(filterContainer, $('.quick-input-count'));
		countContainer.setAttribute('aria-live', 'polite');
		const count = this._register(new CountBadge(countContainer, { countFormat: localize({ key: 'quickInput.countSelected', comment: ['This tells the user how many items are selected in a list of items to select from. The items can be anything.'] }, "{0} Selected") }, this.styles.countBadge));

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

		// List
		const listId = this.idPrefix + 'list';
		const list = this._register(this.instantiationService.createInstance(QuickInputList, container, this.options.hoverDelegate, this.options.linkOpenerDelegate, listId));
		inputBox.setAttribute('aria-controls', listId);
		this._register(list.onDidChangeFocus(() => {
			if (inputBox.hasFocus()) {
				const activeDescendant = list.getActiveDescendant();
				if (activeDescendant) {
					inputBox.setAttribute('aria-activedescendant', activeDescendant);
				} else {
					inputBox.removeAttribute('aria-activedescendant');
				}
			}
		}));
		this._register(list.onChangedAllVisibleChecked(checked => {
			// TODO: Support tri-state checkbox when we remove the .indent property that is faking tree structure.
			checkAll.checked = checked;
		}));
		this._register(list.onChangedVisibleCount(c => {
			visibleCount.setCount(c);
		}));
		this._register(list.onChangedCheckedCount(c => {
			// TODO@TylerLeonhardt: Without this setTimeout, the screen reader will not read out
			// the final count of checked items correctly. Investigate a better way
			// to do this. ref https://github.com/microsoft/vscode/issues/258617
			setTimeout0(() => count.setCount(c));
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

		// Tree
		const tree = this._register(this.instantiationService.createInstance(
			QuickInputTreeController,
			container,
			this.options.hoverDelegate
		));
		this._register(tree.tree.onDidChangeFocus(() => {
			if (inputBox.hasFocus()) {
				const activeDescendant = tree.getActiveDescendant();
				if (activeDescendant) {
					inputBox.setAttribute('aria-activedescendant', activeDescendant);
				} else {
					inputBox.removeAttribute('aria-activedescendant');
				}
			}
		}));
		this._register(tree.onLeave(() => {
			// Defer to avoid the input field reacting to the triggering key.
			// TODO@TylerLeonhardt https://github.com/microsoft/vscode/issues/203675
			setTimeout(() => {
				if (!this.controller) {
					return;
				}
				inputBox.setFocus();
				tree.tree.setFocus([]);
			}, 0);
		}));
		// Wire up tree's accept event to the UI's accept emitter for non-pickable items
		this._register(tree.onDidAccept(() => {
			this.onDidAcceptEmitter.fire();
		}));
		this._register(tree.tree.onDidChangeContentHeight(() => this.updateLayout()));

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
		this._register(inputBox.onKeyDown(e => {
			const value = this.getUI().inputBox.isSelectionAtEnd();
			if (this.endOfQuickInputBoxContext.get() !== value) {
				this.endOfQuickInputBoxContext.set(value);
			}
			// Allow screen readers to read what's in the input
			// Note: this works for arrow keys and selection changes,
			// but not for deletions since that often triggers a
			// change in the list.
			// Don't remove aria-activedescendant when only modifier keys are pressed
			// to prevent screen reader re-announcements when users press Ctrl to silence speech.
			// See: https://github.com/microsoft/vscode/issues/271032
			if (!isModifierKey(e.keyCode)) {
				inputBox.removeAttribute('aria-activedescendant');
			}
		}));
		this._register(dom.addDisposableListener(container, dom.EventType.FOCUS, (e: FocusEvent) => {
			inputBox.setFocus();
		}));

		// Drag and Drop support
		this.dndController = this._register(this.instantiationService.createInstance(
			QuickInputDragAndDropController,
			this._container,
			container,
			[
				{
					node: titleBar,
					includeChildren: true,
					excludeNodes: [leftActionBar.domNode, rightActionBar.domNode]
				},
				{
					node: headerContainer,
					includeChildren: false
				}
			],
			this.viewState
		));

		// DnD update layout
		this._register(autorun(reader => {
			const dndViewState = this.dndController?.dndViewState.read(reader);
			if (!dndViewState) {
				return;
			}

			if (dndViewState.top !== undefined && dndViewState.left !== undefined) {
				this.viewState = {
					...this.viewState,
					top: dndViewState.top,
					left: dndViewState.left
				};
			} else {
				// Reset position/size
				this.viewState = undefined;
			}

			this.updateLayout();

			// Save position
			if (dndViewState.done) {
				this.saveViewState(this.viewState);
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
			tree,
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
			this.dndController?.reparentUI(this._container);
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
			input.prompt = options.prompt;
			input.ignoreFocusOut = !!options.ignoreFocusLost;
			input.matchOnDescription = !!options.matchOnDescription;
			input.matchOnDetail = !!options.matchOnDetail;
			if (options.sortByLabel !== undefined) {
				input.sortByLabel = options.sortByLabel;
			}
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
			const validateInput = options.validateInput || (() => Promise.resolve(undefined));
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

	setAlignment(alignment: 'top' | 'center' | { top: number; left: number }): void {
		this.dndController?.setAlignment(alignment);
	}

	createQuickWidget(): IQuickWidget {
		const ui = this.getUI(true);
		return new QuickWidget(ui);
	}

	createQuickTree<T extends IQuickTreeItem>(): IQuickTree<T> {
		const ui = this.getUI(true);
		return new QuickTree<T>(ui);
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
		ui.progressBar.getContainer().setAttribute('aria-hidden', 'true');
		ui.list.setElements([]);
		ui.list.matchOnDescription = false;
		ui.list.matchOnDetail = false;
		ui.list.matchOnLabel = true;
		ui.list.sortByLabel = true;
		ui.tree.updateFilterOptions({
			matchOnDescription: false,
			matchOnLabel: true
		});
		ui.tree.sortByLabel = true;
		ui.ignoreFocusOut = false;
		ui.inputBox.toggles = undefined;

		const backKeybindingLabel = this.options.backKeybindingLabel();
		backButton.tooltip = backKeybindingLabel ? localize('quickInput.backWithKeybinding', "Back ({0})", backKeybindingLabel) : localize('quickInput.back', "Back");

		ui.container.style.display = '';
		this.updateLayout();
		this.dndController?.layoutContainer();
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
		ui.checkAll.domNode.style.display = visibilities.checkAll ? '' : 'none';
		ui.inputContainer.style.display = visibilities.inputBox ? '' : 'none';
		ui.filterContainer.style.display = visibilities.inputBox ? '' : 'none';
		ui.visibleCountContainer.style.display = visibilities.visibleCount ? '' : 'none';
		ui.countContainer.style.display = visibilities.count ? '' : 'none';
		ui.okContainer.style.display = visibilities.ok ? '' : 'none';
		ui.customButtonContainer.style.display = visibilities.customButton ? '' : 'none';
		ui.message.style.display = visibilities.message ? '' : 'none';
		ui.progressBar.getContainer().style.display = visibilities.progressBar ? '' : 'none';
		ui.list.displayed = !!visibilities.list;
		ui.tree.displayed = !!visibilities.tree;
		ui.container.classList.toggle('show-checkboxes', !!visibilities.checkBox);
		ui.container.classList.toggle('hidden-input', !visibilities.inputBox && !visibilities.description);
		this.updateLayout(); // TODO
	}

	private setEnabled(enabled: boolean) {
		if (enabled !== this.enabled) {
			this.enabled = enabled;
			const ui = this.getUI();
			for (const item of ui.leftActionBar.viewItems) {
				(item as ActionViewItem).action.enabled = enabled;
			}
			for (const item of ui.rightActionBar.viewItems) {
				(item as ActionViewItem).action.enabled = enabled;
			}
			if (enabled) {
				ui.checkAll.enable();
			} else {
				ui.checkAll.disable();
			}
			ui.inputBox.enabled = enabled;
			ui.ok.enabled = enabled;
			ui.list.enabled = enabled;
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

	toggleHover() {
		if (this.isVisible() && this.controller instanceof QuickPick) {
			this.getUI().list.toggleHover();
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

	async cancel(reason?: QuickInputHideReason) {
		this.hide(reason);
	}

	layout(dimension: dom.IDimension, titleBarOffset: number): void {
		this.dimension = dimension;
		this.titleBarOffset = titleBarOffset;
		this.updateLayout();
	}

	private updateLayout() {
		if (this.ui && this.isVisible()) {
			const style = this.ui.container.style;
			const width = Math.min(this.dimension!.width * 0.62 /* golden cut */, QuickInputController.MAX_WIDTH);
			style.width = width + 'px';

			// Position
			style.top = `${this.viewState?.top ? Math.round(this.dimension!.height * this.viewState.top) : this.titleBarOffset}px`;
			style.left = `${Math.round((this.dimension!.width * (this.viewState?.left ?? 0.5 /* center */)) - (width / 2))}px`;

			this.ui.inputBox.layout();
			this.ui.list.layout(this.dimension && this.dimension.height * 0.4);
			this.ui.tree.layout(this.dimension && this.dimension.height * 0.4);
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
			this.ui.tree.tree.style(this.styles.list);

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

	private loadViewState(): QuickInputViewState | undefined {
		try {
			const data = JSON.parse(this.storageService.get(VIEWSTATE_STORAGE_KEY, StorageScope.APPLICATION, '{}'));
			if (data.top !== undefined || data.left !== undefined) {
				return data;
			}
		} catch { }

		return undefined;
	}

	private saveViewState(viewState: QuickInputViewState | undefined): void {
		const isMainWindow = this.layoutService.activeContainer === this.layoutService.mainContainer;
		if (!isMainWindow) {
			return;
		}

		if (viewState !== undefined) {
			this.storageService.store(VIEWSTATE_STORAGE_KEY, JSON.stringify(viewState), StorageScope.APPLICATION, StorageTarget.MACHINE);
		} else {
			this.storageService.remove(VIEWSTATE_STORAGE_KEY, StorageScope.APPLICATION);
		}
	}
}

export interface IQuickInputControllerHost extends ILayoutService { }

class QuickInputDragAndDropController extends Disposable {
	readonly dndViewState = observableValue<{ top?: number; left?: number; done: boolean } | undefined>(this, undefined);

	private readonly _snapThreshold = 20;
	private readonly _snapLineHorizontalRatio = 0.25;

	private readonly _controlsOnLeft: boolean;
	private readonly _controlsOnRight: boolean;

	private _quickInputAlignmentContext: IContextKey<'center' | 'top' | undefined>;

	constructor(
		private _container: HTMLElement,
		private readonly _quickInputContainer: HTMLElement,
		private _quickInputDragAreas: { node: HTMLElement; includeChildren: boolean; excludeNodes?: HTMLElement[] }[],
		initialViewState: QuickInputViewState | undefined,
		@ILayoutService private readonly _layoutService: ILayoutService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IConfigurationService private readonly configurationService: IConfigurationService
	) {
		super();
		this._quickInputAlignmentContext = QuickInputAlignmentContextKey.bindTo(contextKeyService);
		const customWindowControls = getWindowControlsStyle(this.configurationService) === WindowControlsStyle.CUSTOM;

		// Do not allow the widget to overflow or underflow window controls.
		// Use CSS calculations to avoid having to force layout with `.clientWidth`
		this._controlsOnLeft = customWindowControls && platform === Platform.Mac;
		this._controlsOnRight = customWindowControls && (platform === Platform.Windows || platform === Platform.Linux);
		this._registerLayoutListener();
		this.registerMouseListeners();
		this.dndViewState.set({ ...initialViewState, done: true }, undefined);
	}

	reparentUI(container: HTMLElement): void {
		this._container = container;
	}

	layoutContainer(dimension = this._layoutService.activeContainerDimension): void {
		const state = this.dndViewState.get();
		const dragAreaRect = this._quickInputContainer.getBoundingClientRect();
		if (state?.top && state?.left) {
			const a = Math.round(state.left * 1e2) / 1e2;
			const b = dimension.width;
			const c = dragAreaRect.width;
			const d = a * b - c / 2;
			this._layout(state.top * dimension.height, d);
		}
	}

	setAlignment(alignment: 'top' | 'center' | { top: number; left: number }, done = true): void {
		if (alignment === 'top') {
			this.dndViewState.set({
				top: this._getTopSnapValue() / this._container.clientHeight,
				left: (this._getCenterXSnapValue() + (this._quickInputContainer.clientWidth / 2)) / this._container.clientWidth,
				done
			}, undefined);
			this._quickInputAlignmentContext.set('top');
		} else if (alignment === 'center') {
			this.dndViewState.set({
				top: this._getCenterYSnapValue() / this._container.clientHeight,
				left: (this._getCenterXSnapValue() + (this._quickInputContainer.clientWidth / 2)) / this._container.clientWidth,
				done
			}, undefined);
			this._quickInputAlignmentContext.set('center');
		} else {
			this.dndViewState.set({ top: alignment.top, left: alignment.left, done }, undefined);
			this._quickInputAlignmentContext.set(undefined);
		}
	}

	private _registerLayoutListener() {
		this._register(Event.filter(this._layoutService.onDidLayoutContainer, e => e.container === this._container)((e) => this.layoutContainer(e.dimension)));
	}

	private registerMouseListeners(): void {
		const dragArea = this._quickInputContainer;

		// Double click
		this._register(dom.addDisposableGenericMouseUpListener(dragArea, (event: MouseEvent) => {
			const originEvent = new StandardMouseEvent(dom.getWindow(dragArea), event);
			if (originEvent.detail !== 2) {
				return;
			}

			// Ignore event if the target is not the drag area
			const area = this._quickInputDragAreas.find(({ node, includeChildren }) => includeChildren ? dom.isAncestor(originEvent.target, node) : originEvent.target === node);
			if (!area || area.excludeNodes?.some(node => dom.isAncestor(originEvent.target, node))) {
				return;
			}

			this.dndViewState.set({ top: undefined, left: undefined, done: true }, undefined);
		}));

		// Mouse down
		this._register(dom.addDisposableGenericMouseDownListener(dragArea, (e: MouseEvent) => {
			const activeWindow = dom.getWindow(this._layoutService.activeContainer);
			const originEvent = new StandardMouseEvent(activeWindow, e);

			// Ignore event if the target is not the drag area
			const area = this._quickInputDragAreas.find(({ node, includeChildren }) => includeChildren ? dom.isAncestor(originEvent.target, node) : originEvent.target === node);
			if (!area || area.excludeNodes?.some(node => dom.isAncestor(originEvent.target, node))) {
				return;
			}

			// Mouse position offset relative to dragArea
			const dragAreaRect = this._quickInputContainer.getBoundingClientRect();
			const dragOffsetX = originEvent.browserEvent.clientX - dragAreaRect.left;
			const dragOffsetY = originEvent.browserEvent.clientY - dragAreaRect.top;

			let isMovingQuickInput = false;
			const mouseMoveListener = dom.addDisposableGenericMouseMoveListener(activeWindow, (e: MouseEvent) => {
				const mouseMoveEvent = new StandardMouseEvent(activeWindow, e);
				mouseMoveEvent.preventDefault();

				if (!isMovingQuickInput) {
					isMovingQuickInput = true;
				}

				this._layout(e.clientY - dragOffsetY, e.clientX - dragOffsetX);
			});
			const mouseUpListener = dom.addDisposableGenericMouseUpListener(activeWindow, (e: MouseEvent) => {
				if (isMovingQuickInput) {
					// Save position
					const state = this.dndViewState.get();
					this.dndViewState.set({ top: state?.top, left: state?.left, done: true }, undefined);
				}

				// Dispose listeners
				mouseMoveListener.dispose();
				mouseUpListener.dispose();
			});
		}));
	}

	private _layout(topCoordinate: number, leftCoordinate: number) {
		const snapCoordinateYTop = this._getTopSnapValue();
		const snapCoordinateY = this._getCenterYSnapValue();
		const snapCoordinateX = this._getCenterXSnapValue();
		// Make sure the quick input is not moved outside the container
		topCoordinate = Math.max(0, Math.min(topCoordinate, this._container.clientHeight - this._quickInputContainer.clientHeight));

		if (topCoordinate < this._layoutService.activeContainerOffset.top) {
			if (this._controlsOnLeft) {
				leftCoordinate = Math.max(leftCoordinate, 80 / getZoomFactor(dom.getActiveWindow()));
			} else if (this._controlsOnRight) {
				leftCoordinate = Math.min(leftCoordinate, this._container.clientWidth - this._quickInputContainer.clientWidth - (140 / getZoomFactor(dom.getActiveWindow())));
			}
		}

		const snappingToTop = Math.abs(topCoordinate - snapCoordinateYTop) < this._snapThreshold;
		topCoordinate = snappingToTop ? snapCoordinateYTop : topCoordinate;
		const snappingToCenter = Math.abs(topCoordinate - snapCoordinateY) < this._snapThreshold;
		topCoordinate = snappingToCenter ? snapCoordinateY : topCoordinate;
		const top = topCoordinate / this._container.clientHeight;

		// Make sure the quick input is not moved outside the container
		leftCoordinate = Math.max(0, Math.min(leftCoordinate, this._container.clientWidth - this._quickInputContainer.clientWidth));
		const snappingToCenterX = Math.abs(leftCoordinate - snapCoordinateX) < this._snapThreshold;
		leftCoordinate = snappingToCenterX ? snapCoordinateX : leftCoordinate;

		const b = this._container.clientWidth;
		const c = this._quickInputContainer.clientWidth;
		const d = leftCoordinate;
		const left = (d + c / 2) / b;

		this.dndViewState.set({ top, left, done: false }, undefined);
		if (snappingToCenterX) {
			if (snappingToTop) {
				this._quickInputAlignmentContext.set('top');
				return;
			} else if (snappingToCenter) {
				this._quickInputAlignmentContext.set('center');
				return;
			}
		}
		this._quickInputAlignmentContext.set(undefined);
	}

	private _getTopSnapValue() {
		return this._layoutService.activeContainerOffset.quickPickTop;
	}

	private _getCenterYSnapValue() {
		return Math.round(this._container.clientHeight * this._snapLineHorizontalRatio);
	}

	private _getCenterXSnapValue() {
		return Math.round(this._container.clientWidth / 2) - Math.round(this._quickInputContainer.clientWidth / 2);
	}
}
