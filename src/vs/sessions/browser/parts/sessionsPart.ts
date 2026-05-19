/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/sessionsPart.css';
import { IContextKeyService } from '../../../platform/contextkey/common/contextkey.js';
import { IInstantiationService } from '../../../platform/instantiation/common/instantiation.js';
import { IStorageService } from '../../../platform/storage/common/storage.js';
import { IThemeService } from '../../../platform/theme/common/themeService.js';
import { agentsPanelBackground, agentsPanelBorder, agentsPanelForeground } from '../../common/theme.js';
import { IWorkbenchLayoutService, Parts } from '../../../workbench/services/layout/browser/layoutService.js';
import { assertReturnsDefined } from '../../../base/common/types.js';
import { LayoutPriority } from '../../../base/browser/ui/splitview/splitview.js';
import { Part } from '../../../workbench/browser/part.js';
import { ActiveSessionsContext, SessionsFocusContext } from '../../common/contextkeys.js';
import { ChatCompositeBar } from './chatCompositeBar.js';
import { $, prepend } from '../../../base/browser/dom.js';
import { ISerializableView, IViewSize, SerializableGrid } from '../../../base/browser/ui/grid/grid.js';
import { Emitter, Event } from '../../../base/common/event.js';

/**
 * Placeholder leaf view used as the initial occupant of the {@link SessionsPart}
 * internal grid. Future commits will replace this with real session views.
 */
class SessionsPlaceholderView implements ISerializableView {

	readonly element: HTMLElement = $('.sessionspart-placeholder');

	readonly minimumWidth = 0;
	readonly maximumWidth = Number.POSITIVE_INFINITY;
	readonly minimumHeight = 0;
	readonly maximumHeight = Number.POSITIVE_INFINITY;

	private readonly _onDidChange = new Emitter<IViewSize | undefined>();
	readonly onDidChange: Event<IViewSize | undefined> = this._onDidChange.event;

	layout(_width: number, _height: number, _top: number, _left: number): void {
		// no-op
	}

	toJSON(): object {
		return { type: 'sessions.placeholder' };
	}

	dispose(): void {
		this._onDidChange.dispose();
	}
}

export class SessionsPart extends Part {

	override readonly minimumWidth: number = 300;
	override readonly maximumWidth: number = Number.POSITIVE_INFINITY;
	override readonly minimumHeight: number = 0;
	override readonly maximumHeight: number = Number.POSITIVE_INFINITY;
	get snap(): boolean { return false; }

	/** Visual margin values for the card-like appearance */
	static readonly MARGIN_TOP = 0;
	static readonly MARGIN_LEFT = 10;
	static readonly MARGIN_RIGHT = 5;
	static readonly MARGIN_BOTTOM = 5;

	/** Border width on the card (1px each side) */
	static readonly BORDER_WIDTH = 1;

	/** Height of the session composite bar when visible */
	private static readonly SESSION_BAR_HEIGHT = 35;

	private _sessionCompositeBar: ChatCompositeBar | undefined;

	/** Internal grid that hosts the part's leaf views. */
	private _gridWidget: SerializableGrid<SessionsPlaceholderView> | undefined;

	protected _lastLayout: { readonly width: number; readonly height: number; readonly top: number; readonly left: number } | undefined;

	get preferredHeight(): number | undefined {
		return this.layoutService.mainContainerDimension.height * 0.4;
	}

	readonly priority = LayoutPriority.Normal;

	constructor(
		@IThemeService themeService: IThemeService,
		@IStorageService storageService: IStorageService,
		@IWorkbenchLayoutService layoutService: IWorkbenchLayoutService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IInstantiationService private readonly instantiationService: IInstantiationService
	) {
		super(
			Parts.SESSIONS_PART,
			{ hasTitle: false, borderWidth: () => 0 },
			themeService,
			storageService,
			layoutService
		);

		// Bind context keys for compatibility with existing when-clauses
		ActiveSessionsContext.bindTo(contextKeyService);
		SessionsFocusContext.bindTo(contextKeyService);
	}

	override create(parent: HTMLElement): void {
		this.element = parent;
		parent.classList.add('sessionspart');

		super.create(parent);

		// Create the session composite bar and prepend it before the content area
		this._sessionCompositeBar = this._register(this.instantiationService.createInstance(ChatCompositeBar));
		prepend(parent, this._sessionCompositeBar.element);

		// Relayout when session bar visibility changes
		this._register(this._sessionCompositeBar.onDidChangeVisibility(() => {
			if (this._lastLayout) {
				this.layout(this._lastLayout.width, this._lastLayout.height, this._lastLayout.top, this._lastLayout.left);
			}
		}));
	}

	protected override createContentArea(parent: HTMLElement): HTMLElement {
		const contentArea = $('.content');
		parent.appendChild(contentArea);

		// Internal grid that hosts session views. Starts with a single empty
		// placeholder leaf so that {@link SerializableGrid.layout} has
		// something to size; real session views will replace it later.
		const placeholder = new SessionsPlaceholderView();
		this._gridWidget = this._register(new SerializableGrid(placeholder));
		contentArea.appendChild(this._gridWidget.element);

		return contentArea;
	}

	override updateStyles(): void {
		super.updateStyles();

		const container = assertReturnsDefined(this.getContainer());

		// Store background and border as CSS variables for the card styling on .part
		container.style.setProperty('--part-background', this.getColor(agentsPanelBackground) || '');
		container.style.setProperty('--part-border-color', this.getColor(agentsPanelBorder) || 'transparent');
		container.style.setProperty('--part-foreground', this.getColor(agentsPanelForeground) || '');
		container.style.backgroundColor = this.getColor(agentsPanelBackground) || '';
	}

	override layout(width: number, height: number, top: number, left: number): void {
		if (!this.layoutService.isVisible(Parts.SESSIONS_PART)) {
			return;
		}

		this._lastLayout = { width, height, top, left };

		// Account for the session composite bar height when visible
		const sessionBarHeight = this._sessionCompositeBar?.visible ? SessionsPart.SESSION_BAR_HEIGHT : 0;

		// Compute content dimensions accounting for visual margins and border.
		// MARGIN_BOTTOM applies only when the panel is visible (paired with the panel's
		// 5px top margin to center the sash). When the panel is hidden the card fills its
		// cell; the workbench grid's 10px bottom gutter provides the visible gap.
		const borderTotal = SessionsPart.BORDER_WIDTH * 2;
		const marginLeft = this.layoutService.isVisible(Parts.SIDEBAR_PART) ? 0 : SessionsPart.MARGIN_LEFT;
		const marginBottom = this.layoutService.isVisible(Parts.PANEL_PART) ? SessionsPart.MARGIN_BOTTOM : 0;
		const marginRight = this.layoutService.isVisible(Parts.AUXILIARYBAR_PART) ? SessionsPart.MARGIN_RIGHT : 0;

		// Size the content area with the reduced dimensions.
		const { contentSize } = this.layoutContents(
			width - marginLeft - marginRight - borderTotal,
			height - SessionsPart.MARGIN_TOP - marginBottom - borderTotal - sessionBarHeight
		);

		// Layout the internal grid widget within the content area.
		this._gridWidget?.layout(contentSize.width, contentSize.height, top, left);

		// Store the full grid-allocated dimensions so that Part.relayout() works correctly.
		super.layout(width, height, top, left);
	}

	toJSON(): object {
		return {
			type: Parts.SESSIONS_PART
		};
	}
}
