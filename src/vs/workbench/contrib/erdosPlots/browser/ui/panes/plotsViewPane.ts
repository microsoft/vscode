/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2025 Lotas Inc. All rights reserved.
 *  Licensed under the AGPL-3.0 License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import '../styles/plotsViewPane.css';

import React from 'react';
import * as DOM from '../../../../../../base/browser/dom.js';
import { Event, Emitter } from '../../../../../../base/common/event.js';
import { IOpenerService } from '../../../../../../platform/opener/common/opener.js';
import { IViewDescriptorService } from '../../../../../common/views.js';
import { IThemeService } from '../../../../../../platform/theme/common/themeService.js';
import { IContextKeyService, IContextKey } from '../../../../../../platform/contextkey/common/contextkey.js';
import { IKeybindingService } from '../../../../../../platform/keybinding/common/keybinding.js';
import { IContextMenuService } from '../../../../../../platform/contextview/browser/contextView.js';
import { IInstantiationService } from '../../../../../../platform/instantiation/common/instantiation.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { IViewPaneOptions, ViewPaneShowActions } from '../../../../../browser/parts/views/viewPane.js';
import { IElementPosition, IReactComponentContainer, ISize, ErdosReactRenderer } from '../../../../../../base/browser/erdosReactRenderer.js';
import { ViewPane } from '../../../../../browser/parts/views/viewPane.js';
import { IHoverService } from '../../../../../../platform/hover/browser/hover.js';
import { PlotsApp } from '../components/PlotsApp.js';
import { IErdosPlotsService } from '../../../common/erdosPlotsService.js';
import { IAction } from '../../../../../../base/common/actions.js';
import { IActionViewItem } from '../../../../../../base/browser/ui/actionbar/actionbar.js';
import { BaseActionViewItem } from '../../../../../../base/browser/ui/actionbar/actionViewItems.js';
import { IDropdownMenuActionViewItemOptions } from '../../../../../../base/browser/ui/dropdown/dropdownActionViewItem.js';
import { PlotSelector } from '../components/PlotSelector.js';
import { ErdosPlotsCountContext, ErdosPlotsSelectedPlotIdContext, ErdosPlotsCurrentIndexContext, ErdosPlotsIsLastPlotContext } from '../../../../../common/contextkeys.js';

const SELECTOR_ACTION_IDENTIFIER = 'workbench.action.erdosPlots.plotSelector';

/**
 * View pane hosting the plots React application.
 */
export class PlotsViewPane extends ViewPane implements IReactComponentContainer {

	private _sizeChangeBroadcaster = this._register(new Emitter<ISize>());
	private _positionChangeBroadcaster = this._register(new Emitter<IElementPosition>);
	private _visibilityChangeBroadcaster = this._register(new Emitter<boolean>());
	private _scrollSaveBroadcaster = this._register(new Emitter<void>());
	private _scrollRestoreBroadcaster = this._register(new Emitter<void>());
	private _focusGainedBroadcaster = this._register(new Emitter<void>());

	private _currentWidth = 0;
	private _currentHeight = 0;
	private _rootContainer!: HTMLElement;
	private _resizeMonitor?: ResizeObserver;
	private _reactRenderer?: ErdosReactRenderer;

	private _countContextBinding: IContextKey<number>;
	private _selectedIdContextBinding: IContextKey<string | undefined>;
	private _currentPositionContextBinding: IContextKey<number>;
	private _isTerminalContextBinding: IContextKey<boolean>;

	get width() {
		return this._currentWidth;
	}

	get height() {
		return this._currentHeight;
	}

	get containerVisible() {
		return this.isBodyVisible();
	}

	takeFocus(): void {
		this.focus();
	}

	readonly onSizeChanged: Event<ISize> = this._sizeChangeBroadcaster.event;
	readonly onPositionChanged: Event<IElementPosition> = this._positionChangeBroadcaster.event;
	readonly onVisibilityChanged: Event<boolean> = this._visibilityChangeBroadcaster.event;
	readonly onSaveScrollPosition: Event<void> = this._scrollSaveBroadcaster.event;
	readonly onRestoreScrollPosition: Event<void> = this._scrollRestoreBroadcaster.event;
	readonly onFocused: Event<void> = this._focusGainedBroadcaster.event;

	constructor(
		options: IViewPaneOptions,
		@IConfigurationService configurationService: IConfigurationService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IContextMenuService contextMenuService: IContextMenuService,
		@IHoverService hoverService: IHoverService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IKeybindingService keybindingService: IKeybindingService,
		@IOpenerService openerService: IOpenerService,
		@IThemeService themeService: IThemeService,
		@IViewDescriptorService viewDescriptorService: IViewDescriptorService,
		@IErdosPlotsService private readonly orchestrator: IErdosPlotsService,
	) {
		super(
			{ ...options, showActions: ViewPaneShowActions.Always },
			keybindingService,
			contextMenuService,
			configurationService,
			contextKeyService,
			viewDescriptorService,
			instantiationService,
			openerService,
			themeService,
			hoverService
		);

		this._countContextBinding = ErdosPlotsCountContext.bindTo(contextKeyService);
		this._selectedIdContextBinding = ErdosPlotsSelectedPlotIdContext.bindTo(contextKeyService);
		this._currentPositionContextBinding = ErdosPlotsCurrentIndexContext.bindTo(contextKeyService);
		this._isTerminalContextBinding = ErdosPlotsIsLastPlotContext.bindTo(contextKeyService);

		this._register(this.onDidChangeBodyVisibility(isVisible => {
			this._visibilityChangeBroadcaster.fire(isVisible);
		}));

		this._register(this.orchestrator.onPlotCreated(() => {
			this._refreshContextBindings();
		}));
		this._register(this.orchestrator.onPlotDeleted(() => {
			this._refreshContextBindings();
		}));
		this._register(this.orchestrator.onPlotsReplaced(() => {
			this._refreshContextBindings();
		}));
		this._register(this.orchestrator.onPlotActivated(() => {
			this._refreshContextBindings();
		}));

		this._refreshContextBindings();
	}

	public override dispose(): void {
		this._resizeMonitor?.disconnect();
		super.dispose();
	}

	protected override renderBody(container: HTMLElement): void {
		super.renderBody(container);

		this._rootContainer = DOM.$('.ep-view-container');
		container.appendChild(this._rootContainer);

		this._resizeMonitor?.disconnect();
		this._resizeMonitor = new ResizeObserver(observations => {
			for (const observation of observations) {
				if (observation.target === this._rootContainer) {
					this._sizeChangeBroadcaster.fire({
						width: observation.contentRect.width,
						height: observation.contentRect.height
					});
					this._positionChangeBroadcaster.fire({
						x: observation.contentRect.x,
						y: observation.contentRect.y
					});
				}
			}
		});
		this._resizeMonitor.observe(this._rootContainer);

		this._reactRenderer = new ErdosReactRenderer(this._rootContainer);
		this._register(this._reactRenderer);

		this._reactRenderer.render(
			React.createElement(PlotsApp, { reactComponentContainer: this })
		);
	}

	override focus(): void {
		super.focus();
		this._focusGainedBroadcaster.fire();
	}

	protected override layoutBody(height: number, width: number): void {
		super.layoutBody(height, width);

		this._currentWidth = width;
		this._currentHeight = height;

		this._sizeChangeBroadcaster.fire({
			width,
			height
		});

		const boundaries = this._rootContainer.getBoundingClientRect();
		this._positionChangeBroadcaster.fire({
			x: boundaries.x,
			y: boundaries.y
		});
	}

	override createActionViewItem(action: IAction, options?: IDropdownMenuActionViewItemOptions): IActionViewItem | undefined {
		if (action.id === SELECTOR_ACTION_IDENTIFIER) {
			return new class extends BaseActionViewItem {
				private renderer: ErdosReactRenderer | undefined;

				constructor() {
					super(null, action);
				}

				override setFocusable(): void {
					// Selector manages its own focus
				}

				override get trapsArrowNavigation(): boolean {
					return true;
				}

				override render(container: HTMLElement): void {
					container.classList.add('plot-selector-container');
					container.style.display = 'flex';
					container.style.alignItems = 'center';
					container.style.marginLeft = 'auto';

					try {
						this.renderer = new ErdosReactRenderer(container);
						this.renderer.render(React.createElement(PlotSelector));
					} catch (error) {
						console.error('[PlotsViewPane] Selector rendering failed:', error);
					}
				}

				override dispose(): void {
					this.renderer?.dispose();
					super.dispose();
				}
			};
		}

		return super.createActionViewItem(action, options);
	}

	private _refreshContextBindings(): void {
		const totalCount = this.orchestrator.allPlots.length;
		const activeIdentifier = this.orchestrator.activePlotId;

		let currentPosition = -1;
		let isAtEnd = false;
		if (activeIdentifier) {
			currentPosition = this.orchestrator.allPlots.findIndex(c => c.id === activeIdentifier);
			isAtEnd = currentPosition === totalCount - 1;
		}

		this._countContextBinding.set(totalCount);
		this._selectedIdContextBinding.set(activeIdentifier);
		this._currentPositionContextBinding.set(currentPosition);
		this._isTerminalContextBinding.set(isAtEnd);
	}
}

