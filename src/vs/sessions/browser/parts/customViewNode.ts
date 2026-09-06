/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/customViewGridPart.css';
import { $, isAncestorOfActiveElement } from '../../../base/browser/dom.js';
import { DomScrollableElement } from '../../../base/browser/ui/scrollbar/scrollableElement.js';
import { Disposable, toDisposable } from '../../../base/common/lifecycle.js';
import { autorun } from '../../../base/common/observable.js';
import { ScrollbarVisibility } from '../../../base/common/scrollable.js';
import { HiddenItemStrategy, MenuWorkbenchToolBar } from '../../../platform/actions/browser/toolbar.js';
import { MenuItemAction } from '../../../platform/actions/common/actions.js';
import { IInstantiationService } from '../../../platform/instantiation/common/instantiation.js';
import { asCssVariable } from '../../../platform/theme/common/colorUtils.js';
import { AGENTS_CENTERED_CONTENT_MAX_WIDTH } from '../../common/layoutConstants.js';
import { activeSessionViewBackground, activeSessionViewForeground } from '../../common/theme.js';
import { AbstractCustomView, ICustomViewDescriptor } from '../../services/customView/browser/customView.js';
import { ChatPillActionViewItem } from '../../../workbench/browser/chatPills.js';

/**
 * A leaf of the custom view grid. Owns the shared chrome — a header with the
 * title, an optional description and the contributed actions, above a scroll
 * container — and hosts one {@link AbstractCustomView} inside it.
 */
export class CustomViewNode extends Disposable {

	readonly element: HTMLElement = $('.custom-view-node');

	private readonly _headerEl: HTMLElement;
	private readonly _headerBandEl: HTMLElement;
	private readonly _titleEl: HTMLElement;
	private readonly _descriptionEl: HTMLElement;
	private readonly _contentEl: HTMLElement;
	private readonly _scrollable: DomScrollableElement;
	private readonly _view: AbstractCustomView;
	private readonly _maxWidth: number;

	private _lastLayout: { readonly width: number; readonly height: number } | undefined;

	constructor(
		descriptor: ICustomViewDescriptor,
		@IInstantiationService instantiationService: IInstantiationService,
	) {
		super();

		this._view = this._register(instantiationService.createInstance(descriptor.ctor));
		this._maxWidth = this._view.maxWidth ?? AGENTS_CENTERED_CONTENT_MAX_WIDTH;

		// Mirror the active session view's surface colors so a custom view is
		// visually indistinguishable from a session view.
		this.element.style.setProperty('--session-view-background', asCssVariable(activeSessionViewBackground));
		this.element.style.setProperty('--session-view-foreground', asCssVariable(activeSessionViewForeground));
		this.element.setAttribute('role', 'region');
		this.element.setAttribute('data-view-id', descriptor.id);

		this._headerEl = $('.custom-view-header');
		this.element.appendChild(this._headerEl);

		this._headerBandEl = $('.custom-view-header-band');
		this._headerEl.appendChild(this._headerBandEl);

		const titleRow = $('.custom-view-header-title-row');
		this._headerBandEl.appendChild(titleRow);

		this._titleEl = $('.custom-view-header-title');
		titleRow.appendChild(this._titleEl);

		this._descriptionEl = $('.custom-view-header-description');
		this._headerBandEl.appendChild(this._descriptionEl);

		if (descriptor.actions) {
			const buttonBar = descriptor.actions.style === 'buttonBar';
			const actionsContainer = $('.custom-view-header-actions');
			actionsContainer.classList.toggle('custom-view-header-actions-buttons', buttonBar);
			titleRow.appendChild(actionsContainer);

			const toolbar = this._register(instantiationService.createInstance(MenuWorkbenchToolBar, actionsContainer, descriptor.actions.menuId, {
				hiddenItemStrategy: HiddenItemStrategy.Ignore,
				menuOptions: { shouldForwardArgs: true },
				toolbarOptions: { primaryGroup: () => true },
				actionViewItemProvider: buttonBar
					? (action, options) => action instanceof MenuItemAction
						? instantiationService.createInstance(ChatPillActionViewItem, undefined, action, options)
						: undefined
					: undefined,
			}));
			this._register(toolbar.onDidChangeMenuItems(() => this._layoutChildren()));
		}

		const scrollContent = $('.custom-view-scroll-content');
		this._contentEl = $('.custom-view-content');
		this._contentEl.tabIndex = -1;
		scrollContent.appendChild(this._contentEl);

		this._scrollable = this._register(new DomScrollableElement(scrollContent, {
			horizontal: ScrollbarVisibility.Hidden,
			vertical: ScrollbarVisibility.Auto,
			useShadows: false,
		}));
		this._scrollable.getDomNode().classList.add('custom-view-body');
		this.element.appendChild(this._scrollable.getDomNode());

		this._view.render(this._contentEl);

		// The content grows and shrinks as the view loads, so keep the scrollbar in sync with it.
		const resizeObserver = new ResizeObserver(() => this._scrollable.scanDomNode());
		resizeObserver.observe(this._contentEl);
		this._register(toDisposable(() => resizeObserver.disconnect()));

		this._register(autorun(reader => {
			const title = this._view.title.read(reader);
			this._titleEl.textContent = title;
			this.element.setAttribute('aria-label', title);
			this._layoutChildren();
		}));

		this._register(autorun(reader => {
			const description = this._view.description.read(reader);
			this._descriptionEl.textContent = description ?? '';
			this._descriptionEl.classList.toggle('hidden', !description);
			this._layoutChildren();
		}));

		this._register(toDisposable(() => this.element.remove()));
	}

	layout(width: number, height: number): void {
		this._lastLayout = { width, height };
		this._layoutChildren();
	}

	focus(): void {
		this._view.focus();
		if (!isAncestorOfActiveElement(this.element)) {
			this._contentEl.focus();
		}
	}

	private _layoutChildren(): void {
		if (!this._lastLayout) {
			return;
		}

		const { width, height } = this._lastLayout;
		const bandWidth = Math.min(width, this._maxWidth);
		this._headerBandEl.style.width = `${bandWidth}px`;
		this._contentEl.style.width = `${bandWidth}px`;

		// The scroll container is sized by flex, so only the view needs to be told
		// how much room is left below the header.
		this._view.layout(bandWidth, Math.max(0, height - this._headerEl.offsetHeight));
		this._scrollable.scanDomNode();
	}
}
