/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as DOM from 'vs/base/browser/dom';
import { StandardKeyboardEvent } from 'vs/base/browser/keyboardEvent';
import { SimpleIconLabel } from 'vs/base/browser/ui/iconLabel/simpleIconLabel';
import { WorkbenchActionExecutedClassification, WorkbenchActionExecutedEvent } from 'vs/base/common/actions';
import { toErrorMessage } from 'vs/base/common/errorMessage';
import { Emitter, Event } from 'vs/base/common/event';
import { stripIcons } from 'vs/base/common/iconLabels';
import { KeyCode } from 'vs/base/common/keyCodes';
import { Disposable, DisposableStore, dispose } from 'vs/base/common/lifecycle';
import { MarshalledId } from 'vs/base/common/marshallingIds';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { isThemeColor } from 'vs/editor/common/editorCommon';
import { ICommandService } from 'vs/platform/commands/common/commands';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { INotificationService } from 'vs/platform/notification/common/notification';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IThemeService, ThemeColor } from 'vs/platform/theme/common/themeService';
import { INotebookCellActionContext } from 'vs/workbench/contrib/notebook/browser/controller/coreActions';
import { CellFocusMode, ICellViewModel, INotebookEditorDelegate } from 'vs/workbench/contrib/notebook/browser/notebookBrowser';
import { CellPart } from 'vs/workbench/contrib/notebook/browser/view/cellPart';
import { ClickTargetType, IClickTarget } from 'vs/workbench/contrib/notebook/browser/view/cellParts/cellWidgets';
import { CodeCellViewModel } from 'vs/workbench/contrib/notebook/browser/viewModel/codeCellViewModel';
import { CellStatusbarAlignment, INotebookCellStatusBarItem } from 'vs/workbench/contrib/notebook/common/notebookCommon';

const $ = DOM.$;


export class CellEditorStatusBar extends CellPart {
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

	constructor(
		private readonly _notebookEditor: INotebookEditorDelegate,
		private readonly _cellContainer: HTMLElement,
		editorPart: HTMLElement,
		private readonly _editor: ICodeEditor | undefined,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
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

		this._register(this._themeService.onDidColorThemeChange(() => this.currentContext && this.updateContext(this.currentContext)));

		this._register(DOM.addDisposableListener(this.statusBarContainer, DOM.EventType.CLICK, e => {
			if (e.target === leftItemsContainer || e.target === rightItemsContainer || e.target === this.statusBarContainer) {
				// hit on empty space
				this._onDidClick.fire({
					type: ClickTargetType.Container,
					event: e
				});
			} else {
				if ((e.target as HTMLElement).classList.contains('cell-status-item-has-command')) {
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
		this.updateContext(<INotebookCellActionContext>{
			ui: true,
			cell: element,
			notebookEditor: this._notebookEditor,
			$mid: MarshalledId.NotebookCellActionContext
		});

		if (this._editor) {
			// Focus Mode
			const updateFocusModeForEditorEvent = () => {
				element.focusMode =
					this._editor && (this._editor.hasWidgetFocus() || (document.activeElement && this.statusBarContainer.contains(document.activeElement)))
						? CellFocusMode.Editor
						: CellFocusMode.Container;
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
					!(document.activeElement && this.statusBarContainer.contains(document.activeElement))) {
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
					container.removeChild(deletedItem.container);
					deletedItem.dispose();
				}
			}

			newItems.forEach((newLeftItem, i) => {
				const existingItem = renderedItems[i];
				if (existingItem) {
					existingItem.updateItem(newLeftItem, maxItemWidth);
				} else {
					const item = this._instantiationService.createInstance(CellStatusBarItem, this.currentContext!, newLeftItem, maxItemWidth);
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
	private _itemDisposables = this._register(new DisposableStore());

	constructor(
		private readonly _context: INotebookCellActionContext,
		itemModel: INotebookCellStatusBarItem,
		maxWidth: number | undefined,
		@ITelemetryService private readonly _telemetryService: ITelemetryService,
		@ICommandService private readonly _commandService: ICommandService,
		@INotificationService private readonly _notificationService: INotificationService,
		@IThemeService private readonly _themeService: IThemeService,
	) {
		super();

		this.updateItem(itemModel, maxWidth);
	}

	updateItem(item: INotebookCellStatusBarItem, maxWidth: number | undefined) {
		this._itemDisposables.clear();

		if (!this._currentItem || this._currentItem.text !== item.text) {
			new SimpleIconLabel(this.container).text = item.text.replace(/\n/g, ' ');
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
		this.container.title = item.tooltip ?? '';

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

		args.unshift(this._context);

		this._telemetryService.publicLog2<WorkbenchActionExecutedEvent, WorkbenchActionExecutedClassification>('workbenchActionExecuted', { id, from: 'cell status bar' });
		try {
			await this._commandService.executeCommand(id, ...args);
		} catch (error) {
			this._notificationService.error(toErrorMessage(error));
		}
	}
}
