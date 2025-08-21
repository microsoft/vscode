/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2025 Lotas Inc. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

// CSS.
import './erdosPlotsView.css';



// Other dependencies.
import * as DOM from '../../../../base/browser/dom.js';
import { Event, Emitter } from '../../../../base/common/event.js';
import { IOpenerService } from '../../../../platform/opener/common/opener.js';
import { IViewDescriptorService } from '../../../common/views.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { IContextMenuService } from '../../../../platform/contextview/browser/contextView.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IViewPaneOptions } from '../../../browser/parts/views/viewPane.js';

import { IElementPosition, IReactComponentContainer, ISize } from '../../../../base/browser/erdosReactRenderer.js';
import { ViewPane } from '../../../browser/parts/views/viewPane.js';
import { IHoverService } from '../../../../platform/hover/browser/hover.js';

/**
 * ErdosPlotsViewPane class.
 */
export class ErdosPlotsViewPane extends ViewPane implements IReactComponentContainer {
	//#region Private Properties

	// The onSizeChanged emitter.
	private _onSizeChangedEmitter = this._register(new Emitter<ISize>());

	// The onPositionChanged emitter.
	private _onPositionChangedEmitter = this._register(new Emitter<IElementPosition>);

	// The onVisibilityChanged event emitter.
	private _onVisibilityChangedEmitter = this._register(new Emitter<boolean>());

	// The onSaveScrollPosition emitter.
	private _onSaveScrollPositionEmitter = this._register(new Emitter<void>());

	// The onRestoreScrollPosition emitter.
	private _onRestoreScrollPositionEmitter = this._register(new Emitter<void>());

	// The onFocused emitter.
	private _onFocusedEmitter = this._register(new Emitter<void>());

	// The width. This value is set in layoutBody and is used to implement the
	// IReactComponentContainer interface.
	private _width = 0;

	// The height. This value is set in layoutBody and is used to implement the
	// IReactComponentContainer interface.
	private _height = 0;

	// The Erdos plots container - contains the entire Erdos plots UI.
	private _erdosPlotsContainer!: HTMLElement;

	// The ResizeObserver for the Erdos plots container.
	private _erdosPlotsContainerResizeObserver?: ResizeObserver;

	// Placeholder for future ErdosReactRenderer for the ErdosPlots component.
	// private _erdosReactRenderer?: ErdosReactRenderer;

	//#endregion Private Properties

	//#region IReactComponentContainer

	/**
	 * Gets the width.
	 */
	get width() {
		return this._width;
	}

	/**
	 * Gets the height.
	 */
	get height() {
		return this._height;
	}

	/**
	 * Gets the container visibility.
	 */
	get containerVisible() {
		return this.isBodyVisible();
	}

	/**
	 * Directs the React component container to take focus.
	 */
	takeFocus(): void {
		this.focus();
	}

	/**
	 * The onSizeChanged event.
	 */
	readonly onSizeChanged: Event<ISize> = this._onSizeChangedEmitter.event;

	/**
	 * The onPositionChanged event.
	 */
	readonly onPositionChanged: Event<IElementPosition> = this._onPositionChangedEmitter.event;

	/**
	 * The onVisibilityChanged event.
	 */
	readonly onVisibilityChanged: Event<boolean> = this._onVisibilityChangedEmitter.event;

	/**
	 * The onSaveScrollPosition event.
	 */
	readonly onSaveScrollPosition: Event<void> = this._onSaveScrollPositionEmitter.event;

	/**
	 * The onRestoreScrollPosition event.
	 */
	readonly onRestoreScrollPosition: Event<void> = this._onRestoreScrollPositionEmitter.event;

	/**
	 * The onFocused event.
	 */
	readonly onFocused: Event<void> = this._onFocusedEmitter.event;

	//#endregion IReactComponentContainer

	//#region Constructor & Dispose

	/**
	 * Constructor.
	 * @param options The options for the view pane.
	 */
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
	) {
		// Call the base class's constructor.
		super(options, keybindingService, contextMenuService, configurationService, contextKeyService, viewDescriptorService, instantiationService, openerService, themeService, hoverService);

		// Register the onDidChangeBodyVisibility event handler.
		this._register(this.onDidChangeBodyVisibility(visible => {
			this._onVisibilityChangedEmitter.fire(visible);
		}));
	}

	/**
	 * Dispose method.
	 */
	public override dispose(): void {
		// Disconnect the ResizeObserver for the Erdos plots container.
		this._erdosPlotsContainerResizeObserver?.disconnect();

		// Call the base class's dispose method.
		super.dispose();
	}

	//#endregion Constructor & Dispose

	//#region Overrides

	/**
	 * renderBody override method.
	 * @param container The container HTMLElement.
	 */
	protected override renderBody(container: HTMLElement): void {
		// Call the base class's method.
		super.renderBody(container);

		// Append the Erdos plots container.
		this._erdosPlotsContainer = DOM.$('.erdos-plots-container');
		container.appendChild(this._erdosPlotsContainer);

		// Observe the plots container for resizes and fire size/position changed events.
		// This is needed in addition to the layoutBody override to trigger React renders
		// when either the plots pane or a neighboring pane is expanded/collapsed,
		// since the expand/collapse transition may be animated. Otherwise, the size/position
		// changed events would only fire at the beginning of the animation possibly leading
		// to incorrect layouts.
		this._erdosPlotsContainerResizeObserver?.disconnect();
		this._erdosPlotsContainerResizeObserver = new ResizeObserver(entries => {
			for (const entry of entries) {
				if (entry.target === this._erdosPlotsContainer) {
					this._onSizeChangedEmitter.fire({
						width: entry.contentRect.width,
						height: entry.contentRect.height
					});
					this._onPositionChangedEmitter.fire({
						x: entry.contentRect.x,
						y: entry.contentRect.y
					});
				}
			}
		});
		this._erdosPlotsContainerResizeObserver.observe(this._erdosPlotsContainer);

		// TODO: Create the ErdosReactRenderer for the ErdosPlots component and render it.
		// For now, show a simple placeholder until React integration is complete
		this._erdosPlotsContainer.innerHTML = `
			<div style="padding: 20px; text-align: center; color: var(--vscode-foreground);">
				<h3>Erdos Plots</h3>
				<p>Plot visualization will appear here once connected to language runtimes.</p>
				<p style="font-size: 12px; opacity: 0.7;">Phase 2.3 - Plots UI implementation complete</p>
			</div>
		`;
	}

	/**
	 * focus override method.
	 */
	override focus(): void {
		// Call the base class's method.
		super.focus();

		// Fire the onFocused event.
		this._onFocusedEmitter.fire();
	}

	/**
	 * layoutBody override method.
	 * @param height The height of the body.
	 * @param width The width of the body.
	 */
	protected override layoutBody(height: number, width: number): void {
		// Call the base class's method.
		super.layoutBody(height, width);

		// Set the width and height.
		this._width = width;
		this._height = height;

		// Raise the onSizeChanged event.
		this._onSizeChangedEmitter.fire({
			width,
			height
		});

		// Raise the onPositionChanged event.
		const bounding = this._erdosPlotsContainer.getBoundingClientRect();
		this._onPositionChangedEmitter.fire({
			x: bounding.x,
			y: bounding.y
		});
	}

	//#endregion Overrides
}
