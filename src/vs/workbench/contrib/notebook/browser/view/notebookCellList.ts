/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as DOM from 'vs/base/browser/dom';
import { IListRenderer, IListVirtualDelegate, ListError } from 'vs/base/browser/ui/list/list';
import { Event } from 'vs/base/common/event';
import { ScrollEvent } from 'vs/base/common/scrollable';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { IListService, IWorkbenchListOptions, WorkbenchList } from 'vs/platform/list/browser/listService';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { IMouseWheelEvent } from 'vs/base/browser/mouseEvent';
import { isMacintosh } from 'vs/base/common/platform';
import { isNumber } from 'vs/base/common/types';
import { CellViewModel } from 'vs/workbench/contrib/notebook/browser/viewModel/notebookCellViewModel';

export class NotebookCellList extends WorkbenchList<CellViewModel> {
	get onWillScroll(): Event<ScrollEvent> { return this.view.onWillScroll; }

	get rowsContainer(): HTMLElement {
		return this.view.containerDomNode;
	}

	constructor(
		private listUser: string,
		container: HTMLElement,
		delegate: IListVirtualDelegate<CellViewModel>,
		renderers: IListRenderer<CellViewModel, any>[],
		options: IWorkbenchListOptions<CellViewModel>,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IListService listService: IListService,
		@IThemeService themeService: IThemeService,
		@IConfigurationService configurationService: IConfigurationService,
		@IKeybindingService keybindingService: IKeybindingService

	) {
		super(listUser, container, delegate, renderers, options, contextKeyService, listService, themeService, configurationService, keybindingService);
	}

	domElementAtIndex(index: number): HTMLElement | null {
		return this.view.domElement(index);
	}

	focusView() {
		this.view.domNode.focus();
	}

	getAbsoluteTop(index: number): number {
		if (index < 0 || index >= this.length) {
			throw new ListError(this.listUser, `Invalid index ${index}`);
		}

		return this.view.elementTop(index);
	}

	triggerScrollFromMouseWheelEvent(browserEvent: IMouseWheelEvent) {
		this.view.triggerScrollFromMouseWheelEvent(browserEvent);
	}

	updateElementHeight(index: number, size: number): void {
		this.view.updateElementHeight(index, size);
	}

	// override
	domFocus() {
		// @TODO, custom menu doesn't work
		if (document.activeElement && this.view.domNode.contains(document.activeElement)) {
			// for example, when focus goes into monaco editor, if we refocus the list view, the editor will lose focus.
			return;
		}

		if (!isMacintosh && document.activeElement && isContextMenuFocused()) {
			return;
		}

		super.domFocus();
	}

	revealLineInViewCenter(index: number, line: number) {
		const elementTop = this.view.elementTop(index);
		const viewItemOffset = elementTop;
		// TODO@rebornix scroll the bottom to the center if the view is not visible before and it's scrolling upwards
		this.view.setScrollTop(viewItemOffset - this.view.renderHeight / 2);

		const element = this.view.element(index);

		const revealLine = () => {
			let lineOffset = element.getLineScrollTopOffset(line);
			let lineOffsetInView = this.view.elementTop(index) + lineOffset;
			this.view.setScrollTop(lineOffsetInView - this.view.renderHeight / 2);
		};

		const editorAttached = element.editorAttached;
		if (!editorAttached) {
			const editorAttachedPromise = new Promise((resolve, reject) => {
				element.onDidChangeEditorAttachState(state => {
					if (state) {
						resolve();
					} else {
						reject();
					}
				});
			});

			editorAttachedPromise.then(() => {
				revealLine();
			});
		} else {
			revealLine();
		}
	}

	revealLineInCenterIfOutsideViewport(index: number, line: number) {
		const scrollTop = this.view.getScrollTop();
		const wrapperBottom = scrollTop + this.view.renderHeight;
		const elementTop = this.view.elementTop(index);
		const viewItemOffset = elementTop;

		if (viewItemOffset < scrollTop || viewItemOffset > wrapperBottom) {
			this.view.setScrollTop(viewItemOffset - this.view.renderHeight / 2);

			const element = this.view.element(index);
			const revealLine = () => {
				let lineOffset = element.getLineScrollTopOffset(line);
				let lineOffsetInView = this.view.elementTop(index) + lineOffset;
				this.view.setScrollTop(lineOffsetInView - this.view.renderHeight / 2);
			};

			const editorAttached = element.editorAttached;
			if (!editorAttached) {
				const editorAttachedPromise = new Promise((resolve, reject) => {
					element.onDidChangeEditorAttachState(state => {
						if (state) {
							resolve();
						} else {
							reject();
						}
					});
				});

				editorAttachedPromise.then(() => {
					revealLine();
				});
			} else {
				// should not happen
			}
		} else {
			const element = this.view.element(index);
			let lineOffset = element.getLineScrollTopOffset(line);
			let lineOffsetInView = this.view.elementTop(index) + lineOffset;
			if (lineOffsetInView > wrapperBottom) {
				this.view.setScrollTop(lineOffsetInView - this.view.renderHeight / 2);
			}
		}
	}

	revealInView(index: number, offset?: number) {
		const scrollTop = this.view.getScrollTop();
		const wrapperBottom = scrollTop + this.view.renderHeight;
		const elementTop = this.view.elementTop(index);

		const viewItemOffset = elementTop + (isNumber(offset) ? offset : 0);

		if (viewItemOffset < scrollTop || viewItemOffset > wrapperBottom) {
			this.view.setScrollTop(viewItemOffset);
		}
	}

	revealInCenterIfOutsideViewport(index: number, offset?: number) {
		const scrollTop = this.view.getScrollTop();
		const wrapperBottom = scrollTop + this.view.renderHeight;
		const elementTop = this.view.elementTop(index);
		const viewItemOffset = elementTop + (isNumber(offset) ? offset : 0);

		if (viewItemOffset < scrollTop || viewItemOffset > wrapperBottom) {
			this.view.setScrollTop(viewItemOffset - this.view.renderHeight / 2);
		}
	}

	revealInCenter(index: number, offset?: number) {
		const elementTop = this.view.elementTop(index);
		const viewItemOffset = elementTop + (isNumber(offset) ? offset : 0);

		this.view.setScrollTop(viewItemOffset - this.view.renderHeight / 2);
	}
}

function isContextMenuFocused() {
	return !!DOM.findParentWithClass(<HTMLElement>document.activeElement, 'context-view');
}
