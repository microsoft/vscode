/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as DOM from '../../../../../../base/browser/dom.js';
import { StandardKeyboardEvent } from '../../../../../../base/browser/keyboardEvent.js';
import { SimpleIconLabel } from '../../../../../../base/browser/ui/iconLabel/simpleIconLabel.js';
import { WorkbenchActionExecutedClassification, WorkbenchActionExecutedEvent } from '../../../../../../base/common/actions.js';
import { toErrorMessage } from '../../../../../../base/common/errorMessage.js';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { stripIcons } from '../../../../../../base/common/iconLabels.js';
import { KeyCode } from '../../../../../../base/common/keyCodes.js';
import { Disposable, DisposableStore, dispose } from '../../../../../../base/common/lifecycle.js';
import { MarshalledId } from '../../../../../../base/common/marshallingIds.js';
import { ICodeEditor } from '../../../../../../editor/browser/editorBrowser.js';
import { isThemeColor } from '../../../../../../editor/common/editorCommon.js';
import { ICommandService } from '../../../../../../platform/commands/common/commands.js';
import { IInstantiationService } from '../../../../../../platform/instantiation/common/instantiation.js';
import { INotificationService } from '../../../../../../platform/notification/common/notification.js';
import { ITelemetryService } from '../../../../../../platform/telemetry/common/telemetry.js';
import { IThemeService } from '../../../../../../platform/theme/common/themeService.js';
import { ThemeColor } from '../../../../../../base/common/themables.js';
import { INotebookCellActionContext } from '../../controller/coreActions.js';
import { CellFocusMode, ICellViewModel, INotebookEditorDelegate } from '../../notebookBrowser.js';
import { CellContentPart } from '../cellPart.js';
import { ClickTargetType, IClickTarget } from './cellWidgets.js';
import { CodeCellViewModel } from '../../viewModel/codeCellViewModel.js';
import { CellStatusbarAlignment, INotebookCellStatusBarItem } from '../../../common/notebookCommon.js';
import { IHoverDelegate, IHoverDelegateOptions } from '../../../../../../base/browser/ui/hover/hoverDelegate.js';
import { IHoverService } from '../../../../../../platform/hover/browser/hover.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { HoverPosition } from '../../../../../../base/browser/ui/hover/hoverWidget.js';
import type { IManagedHoverTooltipMarkdownString } from '../../../../../../base/browser/ui/hover/hover.js';

const $ = DOM.$;


export class CellEditorStatusBar extends CellContentPart {
	readonly statusBarContainer: HTMLElement;

	private readonly leftItemsContainer: HTMLElement;
	private readonly rightItemsContainer: HTMLElement;
	private readonly itemsDisposable: DisposableStore;

	private leftItems: CellStatusBarItem[] = [];
	private rightItems: CellStatusBarItem[] = [];
	private width: number = 0;

	private currentContext: INotebookCellActionContext | undefined;
	protected readonly _onDidClick: Emitter<IClickTarget> = this._register(new Emitter<IClickTarget>());
	readonly onDidClick: Event<IClickTarget> = this._onDidClick.event;

	private readonly hoverDelegate: IHoverDelegate;

	constructor(
		private readonly _notebookEditor: INotebookEditorDelegate,
		private readonly _cellContainer: HTMLElement,
		editorPart: HTMLElement,
		private readonly _editor: ICodeEditor | undefined,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@IHoverService hoverService: IHoverService,
		@IConfigurationService configurationService: IConfigurationService,
		@IThemeService private readonly _themeService: IThemeService,
	) {
		super();
		this.statusBarContainer = DOM.append(editorPart, $('.cell-statusbar-container'));
		this.statusBarContainer.tabIndex = -1;
		const leftItemsContainer = DOM.append(this.statusBarContainer, $('.cell-status-left'));
		const rightItemsContainer = DOM.append(this.statusBarContainer, $('.cell-status-right'));
		this.leftItemsContainer = DOM.append(leftItemsContainer, $('.cell-contributed-items.cell-contributed-items-left'));
		this.rightItemsContainer = DOM.append(rightItemsContainer, $('.cell-contributed-items.cell-contributed-items-right'));

		this.itemsDisposable = this._register(new DisposableStore());

		this.hoverDelegate = new class implements IHoverDelegate {
			private _lastHoverHideTime: number = 0;

			readonly showHover = (options: IHoverDelegateOptions) => {
				options.position = options.position ?? {};
				options.position.hoverPosition = HoverPosition.ABOVE;
				return hoverService.showInstantHover(options);
			};

			readonly placement = 'element';

			get delay(): number {
				return Date.now() - this._lastHoverHideTime < 200
					? 0  // show instantly when a hover was recently shown
					: configurationService.getValue<number>('workbench.hover.delay');
			}

			onDidHideHover() {
				this._lastHoverHideTime = Date.now();
			}
		};

		this._register(this._themeService.onDidColorThemeChange(() => this.currentContext && this.updateContext(this.currentContext)));

		this._register(DOM.addDisposableListener(this.statusBarContainer, DOM.EventType.CLICK, e => {
			if (e.target === leftItemsContainer || e.target === rightItemsContainer || e.target === this.statusBarContainer) {
				// hit on empty space
				this._onDidClick.fire({
					type: ClickTargetType.Container,
					event: e
				});
			} else {
				const target = e.target;
				let itemHasCommand = false;
				if (target && DOM.isHTMLElement(target)) {
					const targetElement = <HTMLElement>target;
					if (targetElement.classList.contains('cell-status-item-has-command')) {
						itemHasCommand = true;
					} else if (targetElement.parentElement && targetElement.parentElement.classList.contains('cell-status-item-has-command')) {
						itemHasCommand = true;
					}
				}
				if (itemHasCommand) {
					this._onDidClick.fire({
						type: ClickTargetType.ContributedCommandItem,
						event: e
					});
				} else {
					// text
					this._onDidClick.fire({
						type: ClickTargetType.ContributedTextItem,
						event: e
					});
				}
			}
		}));
	}


	override didRenderCell(element: ICellViewModel): void {
		if (this._notebookEditor.hasModel()) {
			const context: (INotebookCellActionContext & { $mid: number }) = {
				ui: true,
				cell: element,
				notebookEditor: this._notebookEditor,
				$mid: MarshalledId.NotebookCellActionContext
			};
			this.updateContext(context);
		}

		if (this._editor) {
			// Focus Mode
			const updateFocusModeForEditorEvent = () => {
				if (this._editor && (this._editor.hasWidgetFocus() || (this.statusBarContainer.ownerDocument.activeElement && this.statusBarContainer.contains(this.statusBarContainer.ownerDocument.activeElement)))) {
					element.focusMode = CellFocusMode.Editor;
				} else {
					const currentMode = element.focusMode;
					if (currentMode === CellFocusMode.ChatInput) {
						element.focusMode = CellFocusMode.ChatInput;
					} else if (currentMode === CellFocusMode.Output && this._notebookEditor.hasWebviewFocus()) {
						element.focusMode = CellFocusMode.Output;
					} else {
						element.focusMode = CellFocusMode.Container;
					}
				}
			};

			this.cellDisposables.add(this._editor.onDidFocusEditorWidget(() => {
				updateFocusModeForEditorEvent();
			}));
			this.cellDisposables.add(this._editor.onDidBlurEditorWidget(() => {
				// this is for a special case:
				// users click the status bar empty space, which we will then focus the editor
				// so we don't want to update the focus state too eagerly, it will be updated with onDidFocusEditorWidget
				if (
					this._notebookEditor.hasEditorFocus() &&
					!(this.statusBarContainer.ownerDocument.activeElement && this.statusBarContainer.contains(this.statusBarContainer.ownerDocument.activeElement))) {
					updateFocusModeForEditorEvent();
				}
			}));

			// Mouse click handlers
			this.cellDisposables.add(this.onDidClick(e => {
				if (this.currentCell instanceof CodeCellViewModel && e.type !== ClickTargetType.ContributedCommandItem && this._editor) {
					const target = this._editor.getTargetAtClientPoint(e.event.clientX, e.event.clientY - this._notebookEditor.notebookOptions.computeEditorStatusbarHeight(this.currentCell.internalMetadata, this.currentCell.uri));
					if (target?.position) {
						this._editor.setPosition(target.position);
						this._editor.focus();
					}
				}
			}));
		}
	}

	override updateInternalLayoutNow(element: ICellViewModel): void {
		// todo@rebornix layer breaker
		this._cellContainer.classList.toggle('cell-statusbar-hidden', this._notebookEditor.notebookOptions.computeEditorStatusbarHeight(element.internalMetadata, element.uri) === 0);

		const layoutInfo = element.layoutInfo;
		const width = layoutInfo.editorWidth;
		if (!width) {
			return;
		}

		this.width = width;
		this.statusBarContainer.style.width = `${width}px`;

		const maxItemWidth = this.getMaxItemWidth();
		this.leftItems.forEach(item => item.maxWidth = maxItemWidth);
		this.rightItems.forEach(item => item.maxWidth = maxItemWidth);
	}

	private getMaxItemWidth() {
		return this.width / 2;
	}

	updateContext(context: INotebookCellActionContext) {
		this.currentContext = context;
		this.itemsDisposable.clear();

		if (!this.currentContext) {
			return;
		}

		this.itemsDisposable.add(this.currentContext.cell.onDidChangeLayout(() => {
			if (this.currentContext) {
				this.updateInternalLayoutNow(this.currentContext.cell);
			}
		}));
		this.itemsDisposable.add(this.currentContext.cell.onDidChangeCellStatusBarItems(() => this.updateRenderedItems()));
		this.itemsDisposable.add(this.currentContext.notebookEditor.onDidChangeActiveCell(() => this.updateActiveCell()));
		this.updateInternalLayoutNow(this.currentContext.cell);
		this.updateActiveCell();
		this.updateRenderedItems();
	}

	private updateActiveCell(): void {
		const isActiveCell = this.currentContext!.notebookEditor.getActiveCell() === this.currentContext?.cell;
		this.statusBarContainer.classList.toggle('is-active-cell', isActiveCell);
	}

	private updateRenderedItems(): void {
		const items = this.currentContext!.cell.getCellStatusBarItems();
		items.sort((itemA, itemB) => {
			return (itemB.priority ?? 0) - (itemA.priority ?? 0);
		});

		const maxItemWidth = this.getMaxItemWidth();
		const newLeftItems = items.filter(item => item.alignment === CellStatusbarAlignment.Left);
		const newRightItems = items.filter(item => item.alignment === CellStatusbarAlignment.Right).reverse();

		const updateItems = (renderedItems: CellStatusBarItem[], newItems: INotebookCellStatusBarItem[], container: HTMLElement) => {
			if (renderedItems.length > newItems.length) {
				const deleted = renderedItems.splice(newItems.length, renderedItems.length - newItems.length);
				for (const deletedItem of deleted) {
					deletedItem.container.remove();
					deletedItem.dispose();
				}
			}

			newItems.forEach((newLeftItem, i) => {
				const existingItem = renderedItems[i];
				if (existingItem) {
					existingItem.updateItem(newLeftItem, maxItemWidth);
				} else {
					const item = this._instantiationService.createInstance(CellStatusBarItem, this.currentContext!, this.hoverDelegate, this._editor, newLeftItem, maxItemWidth);
					renderedItems.push(item);
					container.appendChild(item.container);
				}
			});
		};

		updateItems(this.leftItems, newLeftItems, this.leftItemsContainer);
		updateItems(this.rightItems, newRightItems, this.rightItemsContainer);
	}

	override dispose() {
		super.dispose();
		dispose(this.leftItems);
		dispose(this.rightItems);
	}
}

class CellStatusBarItem extends Disposable {

	readonly container = $('.cell-status-item');

	set maxWidth(v: number) {
		this.container.style.maxWidth = v + 'px';
	}

	private _currentItem!: INotebookCellStatusBarItem;
	private readonly _itemDisposables = this._register(new DisposableStore());

	constructor(
		private readonly _context: INotebookCellActionContext,
		private readonly _hoverDelegate: IHoverDelegate,
		private readonly _editor: ICodeEditor | undefined,
		itemModel: INotebookCellStatusBarItem,
		maxWidth: number | undefined,
		@ITelemetryService private readonly _telemetryService: ITelemetryService,
		@ICommandService private readonly _commandService: ICommandService,
		@INotificationService private readonly _notificationService: INotificationService,
		@IThemeService private readonly _themeService: IThemeService,
		@IHoverService private readonly _hoverService: IHoverService,
	) {
		super();

		this.updateItem(itemModel, maxWidth);
	}

	updateItem(item: INotebookCellStatusBarItem, maxWidth: number | undefined) {
		this._itemDisposables.clear();

		if (!this._currentItem || this._currentItem.text !== item.text) {
			this._itemDisposables.add(new SimpleIconLabel(this.container)).text = item.text.replace(/\n/g, ' ');
		}

		const resolveColor = (color: ThemeColor | string) => {
			return isThemeColor(color) ?
				(this._themeService.getColorTheme().getColor(color.id)?.toString() || '') :
				color;
		};

		this.container.style.color = item.color ? resolveColor(item.color) : '';
		this.container.style.backgroundColor = item.backgroundColor ? resolveColor(item.backgroundColor) : '';
		this.container.style.opacity = item.opacity ? item.opacity : '';

		this.container.classList.toggle('cell-status-item-show-when-active', !!item.onlyShowWhenActive);

		if (typeof maxWidth === 'number') {
			this.maxWidth = maxWidth;
		}

		let ariaLabel: string;
		let role: string | undefined;
		if (item.accessibilityInformation) {
			ariaLabel = item.accessibilityInformation.label;
			role = item.accessibilityInformation.role;
		} else {
			ariaLabel = item.text ? stripIcons(item.text).trim() : '';
		}

		this.container.setAttribute('aria-label', ariaLabel);
		this.container.setAttribute('role', role || '');

		if (item.tooltip) {
			const hoverContent = typeof item.tooltip === 'string' ? item.tooltip : { markdown: item.tooltip, markdownNotSupportedFallback: undefined } satisfies IManagedHoverTooltipMarkdownString;
			this._itemDisposables.add(this._hoverService.setupManagedHover(this._hoverDelegate, this.container, hoverContent));
		}

		this.container.classList.toggle('cell-status-item-has-command', !!item.command);
		if (item.command) {
			this.container.tabIndex = 0;

			this._itemDisposables.add(DOM.addDisposableListener(this.container, DOM.EventType.CLICK, _e => {
				this.executeCommand();
			}));
			this._itemDisposables.add(DOM.addDisposableListener(this.container, DOM.EventType.KEY_DOWN, e => {
				const event = new StandardKeyboardEvent(e);
				if (event.equals(KeyCode.Space) || event.equals(KeyCode.Enter)) {
					this.executeCommand();
				}
			}));
		} else {
			this.container.removeAttribute('tabIndex');
		}

		this._currentItem = item;
	}

	private async executeCommand(): Promise<void> {
		const command = this._currentItem.command;
		if (!command) {
			return;
		}

		const id = typeof command === 'string' ? command : command.id;
		const args = typeof command === 'string' ? [] : command.arguments ?? [];

		if (typeof command === 'string' || !command.arguments || !Array.isArray(command.arguments) || command.arguments.length === 0) {
			args.unshift(this._context);
		}

		this._telemetryService.publicLog2<WorkbenchActionExecutedEvent, WorkbenchActionExecutedClassification>('workbenchActionExecuted', { id, from: 'cell status bar' });
		try {
			this._editor?.focus();
			await this._commandService.executeCommand(id, ...args);
		} catch (error) {
			this._notificationService.error(toErrorMessage(error));
		}
	}
}
