/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../../../base/browser/dom.js';
import { DomScrollableElement } from '../../../../../../../base/browser/ui/scrollbar/scrollableElement.js';
import { Emitter } from '../../../../../../../base/common/event.js';
import { KeyCode } from '../../../../../../../base/common/keyCodes.js';
import { AnchorPosition } from '../../../../../../../base/common/layout.js';
import { Disposable, DisposableStore, MutableDisposable } from '../../../../../../../base/common/lifecycle.js';
import { ScrollbarVisibility } from '../../../../../../../base/common/scrollable.js';
import { IContextViewService, IOpenContextView } from '../../../../../../../platform/contextview/browser/contextView.js';
import { ILayoutService } from '../../../../../../../platform/layout/browser/layoutService.js';
import { localize } from '../../../../../../../nls.js';
import { IModelPickerAdditionalContent, IModelPickerAdditionalContentContext } from './modelPickerActionItem.js';

const VIEWPORT_MARGIN = 8;

/** Hosts replacement content without creating a model list or its configuration controls. */
export class ModelPickerContentWidget extends Disposable {
	private readonly _onDidHide = this._register(new Emitter<void>());
	readonly onDidHide = this._onDidHide.event;
	private _popup: { view?: IOpenContextView; hidden?: boolean } | undefined;

	get isVisible(): boolean {
		return !!this._popup && !this._popup.hidden;
	}

	constructor(
		@IContextViewService private readonly _contextViewService: IContextViewService,
		@ILayoutService private readonly _layoutService: ILayoutService,
	) {
		super();
	}

	show(content: IModelPickerAdditionalContent, context: IModelPickerAdditionalContentContext): void {
		this.hide();
		const popup: { view?: IOpenContextView; hidden?: boolean } = {};
		this._popup = popup;
		let widget: HTMLElement | undefined;
		let anchorPosition = AnchorPosition.ABOVE;
		popup.view = this._contextViewService.showContextView({
			getAnchor: () => context.anchor,
			get anchorPosition() { return anchorPosition; },
			render: container => {
				const store = new DisposableStore();
				const targetWindow = dom.getWindow(context.anchor);
				let layoutContent: (() => void) | undefined;
				widget = dom.append(container, dom.$('.action-widget.chat-model-picker-custom-content'));
				widget.tabIndex = -1;
				widget.setAttribute('role', 'group');
				widget.ariaLabel = localize('chat.modelPicker.content', "Models");
				if (content.renderHeader) {
					store.add(content.renderHeader(dom.append(widget, dom.$('.action-list-custom-header')), context));
				}
				let body: HTMLElement | undefined;
				if (content.render) {
					const viewport = dom.$('.chat-model-picker-custom-body-viewport');
					body = dom.append(viewport, dom.$('.chat-model-picker-custom-body'));
					const scrollable = store.add(new DomScrollableElement(viewport, {
						horizontal: ScrollbarVisibility.Hidden,
						vertical: ScrollbarVisibility.Auto,
						consumeMouseWheelIfScrollbarIsNeeded: true,
					}));
					widget.appendChild(scrollable.getDomNode());
					store.add(content.render(body, context));
					store.add(dom.addDisposableListener(viewport, dom.EventType.SCROLL, () => scrollable.scanDomNode()));
					layoutContent = () => {
						if (!widget) {
							return;
						}
						const anchorBounds = context.anchor.getBoundingClientRect();
						const above = Math.max(0, Math.min(targetWindow.innerHeight, anchorBounds.top) - VIEWPORT_MARGIN);
						const below = Math.max(0, targetWindow.innerHeight - Math.max(0, anchorBounds.bottom) - VIEWPORT_MARGIN);
						const chromeHeight = widget.offsetHeight - viewport.offsetHeight;
						anchorPosition = viewport.scrollHeight + chromeHeight <= above || above >= below ? AnchorPosition.ABOVE : AnchorPosition.BELOW;
						const availableHeight = anchorPosition === AnchorPosition.ABOVE ? above : below;
						viewport.style.maxHeight = `${Math.max(0, availableHeight - chromeHeight)}px`;
						scrollable.scanDomNode();
					};
					layoutContent();
				}
				const block = dom.append(container, dom.$('.context-view-block'));
				store.add(dom.addDisposableGenericMouseDownListener(block, e => e.stopPropagation()));
				store.add(dom.addStandardDisposableListener(widget, 'keydown', e => {
					if (e.keyCode === KeyCode.Escape && !e.browserEvent.isComposing) {
						dom.EventHelper.stop(e, true);
						context.hide();
					}
				}));
				const focusTracker = store.add(dom.trackFocus(container));
				store.add(focusTracker.onDidBlur(() => {
					if (this._popup === popup) {
						context.hide();
					}
				}));
				const layoutRequest = store.add(new MutableDisposable());
				const requestLayout = () => {
					if (!layoutRequest.value) {
						layoutRequest.value = dom.scheduleAtNextAnimationFrame(targetWindow, () => {
							layoutRequest.clear();
							if (this._popup === popup && !popup.hidden) {
								layoutContent?.();
								this._contextViewService.layout();
							}
						});
					}
				};
				store.add(dom.addDisposableListener(targetWindow, dom.EventType.RESIZE, requestLayout));
				store.add(this._layoutService.onDidLayoutContainer(({ container }) => {
					if (dom.getWindow(container) === targetWindow) {
						requestLayout();
					}
				}));
				const observer = store.add(new dom.DisposableResizeObserver('ModelPickerContentWidget', requestLayout, targetWindow));
				store.add(observer.observe(widget, { box: 'border-box' }));
				if (body) {
					store.add(observer.observe(body, { box: 'border-box' }));
				}
				return store;
			},
			focus: () => {
				if (!widget) {
					return;
				}
				const walker = widget.ownerDocument.createTreeWalker(widget, NodeFilter.SHOW_ELEMENT, {
					acceptNode: node => dom.isHTMLElement(node) && node.tabIndex >= 0 && !node.hasAttribute('disabled') && node.getAttribute('aria-disabled') !== 'true' && node.getClientRects().length > 0
						? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP,
				});
				const control = walker.nextNode();
				(dom.isHTMLElement(control) ? control : widget).focus();
			},
			onHide: () => {
				if (this._popup === popup) {
					this._popup = undefined;
					this._onDidHide.fire();
				}
			},
		}, undefined, false);
		if (popup.hidden) {
			popup.view.close();
		}
	}

	hide(): void {
		if (this._popup) {
			this._popup.hidden = true;
			this._popup.view?.close();
		}
	}

	override dispose(): void {
		this.hide();
		super.dispose();
	}
}
