/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import './iconSelectBox.css';
import * as dom from '../../dom.js';
import { alert } from '../aria/aria.js';
import { InputBox } from '../inputbox/inputBox.js';
import { DomScrollableElement } from '../scrollbar/scrollableElement.js';
import { Emitter } from '../../../common/event.js';
import { DisposableStore, Disposable, MutableDisposable } from '../../../common/lifecycle.js';
import { ThemeIcon } from '../../../common/themables.js';
import { localize } from '../../../../nls.js';
import { HighlightedLabel } from '../highlightedlabel/highlightedLabel.js';
export class IconSelectBox extends Disposable {
    static { this.InstanceCount = 0; }
    constructor(options) {
        super();
        this.options = options;
        this.domId = `icon_select_box_id_${++IconSelectBox.InstanceCount}`;
        this._onDidSelect = this._register(new Emitter());
        this.onDidSelect = this._onDidSelect.event;
        this.renderedIcons = [];
        this.focusedItemIndex = 0;
        this.numberOfElementsPerRow = 1;
        this.iconContainerWidth = 36;
        this.iconContainerHeight = 36;
        this.domNode = dom.$('.icon-select-box');
        this._register(this.create());
    }
    create() {
        const disposables = new DisposableStore();
        const iconSelectBoxContainer = dom.append(this.domNode, dom.$('.icon-select-box-container'));
        iconSelectBoxContainer.style.margin = '10px 15px';
        const iconSelectInputContainer = dom.append(iconSelectBoxContainer, dom.$('.icon-select-input-container'));
        iconSelectInputContainer.style.paddingBottom = '10px';
        this.inputBox = disposables.add(new InputBox(iconSelectInputContainer, undefined, {
            placeholder: localize('iconSelect.placeholder', "Search icons"),
            inputBoxStyles: this.options.inputBoxStyles,
        }));
        const iconsContainer = this.iconsContainer = dom.$('.icon-select-icons-container', { id: `${this.domId}_icons` });
        iconsContainer.role = 'listbox';
        iconsContainer.tabIndex = 0;
        this.scrollableElement = disposables.add(new DomScrollableElement(iconsContainer, {
            useShadows: false,
            horizontal: 2 /* ScrollbarVisibility.Hidden */,
        }));
        dom.append(iconSelectBoxContainer, this.scrollableElement.getDomNode());
        if (this.options.showIconInfo) {
            this.iconIdElement = this._register(new HighlightedLabel(dom.append(dom.append(iconSelectBoxContainer, dom.$('.icon-select-id-container')), dom.$('.icon-select-id-label'))));
        }
        const iconsDisposables = disposables.add(new MutableDisposable());
        iconsDisposables.value = this.renderIcons(this.options.icons, [], iconsContainer);
        this.scrollableElement.scanDomNode();
        disposables.add(this.inputBox.onDidChange(value => {
            const icons = [], matches = [];
            for (const icon of this.options.icons) {
                const match = this.matchesContiguous(value, icon.id);
                if (match) {
                    icons.push(icon);
                    matches.push(match);
                }
            }
            if (icons.length) {
                iconsDisposables.value = this.renderIcons(icons, matches, iconsContainer);
                this.scrollableElement?.scanDomNode();
            }
        }));
        this.inputBox.inputElement.role = 'combobox';
        this.inputBox.inputElement.ariaHasPopup = 'menu';
        this.inputBox.inputElement.ariaAutoComplete = 'list';
        this.inputBox.inputElement.ariaExpanded = 'true';
        this.inputBox.inputElement.setAttribute('aria-controls', iconsContainer.id);
        return disposables;
    }
    renderIcons(icons, matches, container) {
        const disposables = new DisposableStore();
        dom.clearNode(container);
        const focusedIcon = this.renderedIcons[this.focusedItemIndex]?.icon;
        let focusedIconIndex = 0;
        const renderedIcons = [];
        if (icons.length) {
            for (let index = 0; index < icons.length; index++) {
                const icon = icons[index];
                const iconContainer = dom.append(container, dom.$('.icon-container', { id: `${this.domId}_icons_${index}` }));
                iconContainer.style.width = `${this.iconContainerWidth}px`;
                iconContainer.style.height = `${this.iconContainerHeight}px`;
                iconContainer.title = icon.id;
                iconContainer.role = 'button';
                iconContainer.setAttribute('aria-setsize', `${icons.length}`);
                iconContainer.setAttribute('aria-posinset', `${index + 1}`);
                dom.append(iconContainer, dom.$(ThemeIcon.asCSSSelector(icon)));
                renderedIcons.push({ icon, element: iconContainer, highlightMatches: matches[index] });
                disposables.add(dom.addDisposableListener(iconContainer, dom.EventType.CLICK, (e) => {
                    e.stopPropagation();
                    this.setSelection(index);
                }));
                if (icon === focusedIcon) {
                    focusedIconIndex = index;
                }
            }
        }
        else {
            const noResults = localize('iconSelect.noResults', "No results");
            dom.append(container, dom.$('.icon-no-results', undefined, noResults));
            alert(noResults);
        }
        this.renderedIcons.splice(0, this.renderedIcons.length, ...renderedIcons);
        this.focusIcon(focusedIconIndex);
        return disposables;
    }
    focusIcon(index) {
        const existing = this.renderedIcons[this.focusedItemIndex];
        if (existing) {
            existing.element.classList.remove('focused');
        }
        this.focusedItemIndex = index;
        const renderedItem = this.renderedIcons[index];
        if (renderedItem) {
            renderedItem.element.classList.add('focused');
        }
        if (this.inputBox) {
            if (renderedItem) {
                this.inputBox.inputElement.setAttribute('aria-activedescendant', renderedItem.element.id);
            }
            else {
                this.inputBox.inputElement.removeAttribute('aria-activedescendant');
            }
        }
        if (this.iconIdElement) {
            if (renderedItem) {
                this.iconIdElement.set(renderedItem.icon.id, renderedItem.highlightMatches);
            }
            else {
                this.iconIdElement.set('');
            }
        }
        this.reveal(index);
    }
    reveal(index) {
        if (!this.scrollableElement) {
            return;
        }
        if (index < 0 || index >= this.renderedIcons.length) {
            return;
        }
        const element = this.renderedIcons[index].element;
        if (!element) {
            return;
        }
        const { height } = this.scrollableElement.getScrollDimensions();
        const { scrollTop } = this.scrollableElement.getScrollPosition();
        if (element.offsetTop + this.iconContainerHeight > scrollTop + height) {
            this.scrollableElement.setScrollPosition({ scrollTop: element.offsetTop + this.iconContainerHeight - height });
        }
        else if (element.offsetTop < scrollTop) {
            this.scrollableElement.setScrollPosition({ scrollTop: element.offsetTop });
        }
    }
    matchesContiguous(word, wordToMatchAgainst) {
        const matchIndex = wordToMatchAgainst.toLowerCase().indexOf(word.toLowerCase());
        if (matchIndex !== -1) {
            return [{ start: matchIndex, end: matchIndex + word.length }];
        }
        return null;
    }
    layout(dimension) {
        this.domNode.style.width = `${dimension.width}px`;
        this.domNode.style.height = `${dimension.height}px`;
        const iconsContainerWidth = dimension.width - 30;
        this.numberOfElementsPerRow = Math.floor(iconsContainerWidth / this.iconContainerWidth);
        if (this.numberOfElementsPerRow === 0) {
            throw new Error('Insufficient width');
        }
        const extraSpace = iconsContainerWidth % this.iconContainerWidth;
        const iconElementMargin = Math.floor(extraSpace / this.numberOfElementsPerRow);
        for (const { element } of this.renderedIcons) {
            element.style.marginRight = `${iconElementMargin}px`;
        }
        const containerPadding = extraSpace % this.numberOfElementsPerRow;
        if (this.iconsContainer) {
            this.iconsContainer.style.paddingLeft = `${Math.floor(containerPadding / 2)}px`;
            this.iconsContainer.style.paddingRight = `${Math.ceil(containerPadding / 2)}px`;
        }
        if (this.scrollableElement) {
            this.scrollableElement.getDomNode().style.height = `${this.iconIdElement ? dimension.height - 80 : dimension.height - 40}px`;
            this.scrollableElement.scanDomNode();
        }
    }
    getFocus() {
        return [this.focusedItemIndex];
    }
    setSelection(index) {
        if (index < 0 || index >= this.renderedIcons.length) {
            throw new Error(`Invalid index ${index}`);
        }
        this.focusIcon(index);
        this._onDidSelect.fire(this.renderedIcons[index].icon);
    }
    clearInput() {
        if (this.inputBox) {
            this.inputBox.value = '';
        }
    }
    focus() {
        this.inputBox?.focus();
        this.focusIcon(0);
    }
    focusNext() {
        this.focusIcon((this.focusedItemIndex + 1) % this.renderedIcons.length);
    }
    focusPrevious() {
        this.focusIcon((this.focusedItemIndex - 1 + this.renderedIcons.length) % this.renderedIcons.length);
    }
    focusNextRow() {
        let nextRowIndex = this.focusedItemIndex + this.numberOfElementsPerRow;
        if (nextRowIndex >= this.renderedIcons.length) {
            nextRowIndex = (nextRowIndex + 1) % this.numberOfElementsPerRow;
            nextRowIndex = nextRowIndex >= this.renderedIcons.length ? 0 : nextRowIndex;
        }
        this.focusIcon(nextRowIndex);
    }
    focusPreviousRow() {
        let previousRowIndex = this.focusedItemIndex - this.numberOfElementsPerRow;
        if (previousRowIndex < 0) {
            const numberOfRows = Math.floor(this.renderedIcons.length / this.numberOfElementsPerRow);
            previousRowIndex = this.focusedItemIndex + (this.numberOfElementsPerRow * numberOfRows) - 1;
            previousRowIndex = previousRowIndex < 0
                ? this.renderedIcons.length - 1
                : previousRowIndex >= this.renderedIcons.length
                    ? previousRowIndex - this.numberOfElementsPerRow
                    : previousRowIndex;
        }
        this.focusIcon(previousRowIndex);
    }
    getFocusedIcon() {
        return this.renderedIcons[this.focusedItemIndex].icon;
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaWNvblNlbGVjdEJveC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL2Jhc2UvYnJvd3Nlci91aS9pY29ucy9pY29uU2VsZWN0Qm94LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8scUJBQXFCLENBQUM7QUFDN0IsT0FBTyxLQUFLLEdBQUcsTUFBTSxjQUFjLENBQUM7QUFDcEMsT0FBTyxFQUFFLEtBQUssRUFBRSxNQUFNLGlCQUFpQixDQUFDO0FBQ3hDLE9BQU8sRUFBbUIsUUFBUSxFQUFFLE1BQU0seUJBQXlCLENBQUM7QUFDcEUsT0FBTyxFQUFFLG9CQUFvQixFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUFDekUsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLDBCQUEwQixDQUFDO0FBQ25ELE9BQU8sRUFBZSxlQUFlLEVBQUUsVUFBVSxFQUFFLGlCQUFpQixFQUFFLE1BQU0sOEJBQThCLENBQUM7QUFDM0csT0FBTyxFQUFFLFNBQVMsRUFBRSxNQUFNLDhCQUE4QixDQUFDO0FBQ3pELE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSxvQkFBb0IsQ0FBQztBQUc5QyxPQUFPLEVBQUUsZ0JBQWdCLEVBQUUsTUFBTSx5Q0FBeUMsQ0FBQztBQWMzRSxNQUFNLE9BQU8sYUFBYyxTQUFRLFVBQVU7YUFFN0Isa0JBQWEsR0FBRyxDQUFDLEFBQUosQ0FBSztJQW9CakMsWUFDa0IsT0FBOEI7UUFFL0MsS0FBSyxFQUFFLENBQUM7UUFGUyxZQUFPLEdBQVAsT0FBTyxDQUF1QjtRQXBCdkMsVUFBSyxHQUFHLHNCQUFzQixFQUFFLGFBQWEsQ0FBQyxhQUFhLEVBQUUsQ0FBQztRQUkvRCxpQkFBWSxHQUFHLElBQUksQ0FBQyxTQUFTLENBQUMsSUFBSSxPQUFPLEVBQWEsQ0FBQyxDQUFDO1FBQ3ZELGdCQUFXLEdBQUcsSUFBSSxDQUFDLFlBQVksQ0FBQyxL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