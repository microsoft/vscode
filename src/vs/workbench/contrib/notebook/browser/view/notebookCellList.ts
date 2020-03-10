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
import { CellViewModel } from 'vs/workbench/contrib/notebook/browser/viewModel/notebookCellViewModel';
import { EDITOR_TOP_PADDING } from 'vs/workbench/contrib/notebook/common/notebookCommon';

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
		if (document.activeElement && this.view.domNode.contains(document.activeElement)) {
			// for example, when focus goes into monaco editor, if we refocus the list view, the editor will lose focus.
			return;
		}

		if (!isMacintosh && document.activeElement && isContextMenuFocused()) {
			return;
		}

		super.domFocus();
	}

	// TODO@rebornix TEST & Fix potential bugs
	// List items have real dynamic heights, which means after we set `scrollTop` based on the `elementTop(index)`, the element at `index` might still be removed from the view once all relayouting tasks are done.
	// For example, we scroll item 10 into the view upwards, in the first round, items 7, 8, 9, 10 are all in the viewport. Then item 7 and 8 resize themselves to be larger and finally item 10 is removed from the view.
	// To ensure that item 10 is always there, we need to scroll item 10 to the top edge of the viewport.
	revealLineInView(index: number, line: number) {
		const revealLine = (scrolledIntoView: boolean, upwards: boolean) => {
			// reveal the line slightly into view
			const scrollTop = this.view.getScrollTop();
			const wrapperBottom = scrollTop + this.view.renderHeight;
			const lineOffset = element.getLineScrollTopOffset(line);
			const elementTop = this.view.elementTop(index);
			const lineTop = elementTop + lineOffset + EDITOR_TOP_PADDING;

			// TODO@rebornix 30 ---> line height * 1.5
			if (lineTop < scrollTop) {
				this.view.setScrollTop(lineTop - 30);
			} else if (lineTop > wrapperBottom) {
				this.view.setScrollTop(scrollTop + lineTop - wrapperBottom + 30);
			} else if (scrolledIntoView) {
				// newly scrolled into view
				if (upwards) {
					// align to the bottom
					this.view.setScrollTop(scrollTop + lineTop - wrapperBottom + 30);
				} else {
					// align to to top
					this.view.setScrollTop(lineTop - 30);
				}
			}
		};

		const scrollTop = this.view.getScrollTop();
		const wrapperBottom = scrollTop + this.view.renderHeight;
		const elementTop = this.view.elementTop(index);
		const element = this.view.element(index);

		if (element.editorAttached) {
			revealLine(false, false);
		} else {
			const elementHeight = this.view.elementHeight(index);
			let upwards = false;

			if (elementTop + elementHeight < scrollTop) {
				// scroll downwards
				this.view.setScrollTop(elementTop);
				upwards = false;
			} else if (elementTop > wrapperBottom) {
				// scroll upwards
				this.view.setScrollTop(elementTop - this.view.renderHeight / 2);
				upwards = true;
			}

			const editorAttachedPromise = new Promise((resolve, reject) => {
				element.onDidChangeEditorAttachState(state => state ? resolve() : reject());
			});

			editorAttachedPromise.then(() => {
				revealLine(true, upwards);
			});
		}
	}

	revealLineInViewCenter(index: number, line: number) {
		const elementTop = this.view.elementTop(index);
		const viewItemOffset = elementTop;
		this.view.setScrollTop(viewItemOffset - this.view.renderHeight / 2);

		const element = this.view.element(index);

		const revealLine = () => {
			let lineOffset = element.getLineScrollTopOffset(line);
			let lineOffsetInView = this.view.elementTop(index) + lineOffset;
			this.view.setScrollTop(lineOffsetInView - this.view.renderHeight / 2);
		};

		if (!element.editorAttached) {
			getEditorAttachedPromise(element).then(() => revealLine());
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

			if (!element.editorAttached) {
				getEditorAttachedPromise(element).then(() => revealLine());
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

	revealInView(index: number) {
		const scrollTop = this.view.getScrollTop();
		const wrapperBottom = scrollTop + this.view.renderHeight;
		const elementTop = this.view.elementTop(index);

		const viewItemOffset = elementTop;

		if (viewItemOffset < scrollTop || viewItemOffset > wrapperBottom) {
			this.view.setScrollTop(viewItemOffset);
		}
	}

	revealInCenterIfOutsideViewport(index: number) {
		const scrollTop = this.view.getScrollTop();
		const wrapperBottom = scrollTop + this.view.renderHeight;
		const elementTop = this.view.elementTop(index);
		const viewItemOffset = elementTop;

		if (viewItemOffset < scrollTop || viewItemOffset > wrapperBottom) {
			this.view.setScrollTop(viewItemOffset - this.view.renderHeight / 2);
		}
	}

	revealInCenter(index: number) {
		const elementTop = this.view.elementTop(index);
		const viewItemOffset = elementTop;

		this.view.setScrollTop(viewItemOffset - this.view.renderHeight / 2);
	}
}

function getEditorAttachedPromise(element: CellViewModel) {
	return new Promise((resolve, reject) => {
		element.onDidChangeEditorAttachState(state => state ? resolve() : reject());
	});
}

function isContextMenuFocused() {
	return !!DOM.findParentWithClass(<HTMLElement>document.activeElement, 'context-view');
}
