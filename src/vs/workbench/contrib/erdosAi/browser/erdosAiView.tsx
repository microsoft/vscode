/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2025 by Lotas Inc.
 *  Licensed under the AGPL-3.0 License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// CSS.
import './erdosAiView.css';

// React.
import React from 'react';

// Other dependencies.
import { Event, Emitter } from '../../../../base/common/event.js';
import { IOpenerService } from '../../../../platform/opener/common/opener.js';
import { IViewDescriptorService } from '../../../common/views.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { IContextMenuService } from '../../../../platform/contextview/browser/contextView.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IViewPaneOptions } from '../../../browser/parts/views/viewPane.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { ErdosAi } from './components/erdosAi.js';
import { IReactComponentContainer, ISize, ErdosReactRenderer } from '../../../../base/browser/erdosReactRenderer.js';
import { IErdosAiService } from '../common/erdosAiService.js';
import { ErdosViewPane } from '../../../browser/erdosViewPane/erdosViewPane.js';
import { IHoverService } from '../../../../platform/hover/browser/hover.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { IFileDialogService } from '../../../../platform/dialogs/common/dialogs.js';
import { ITextFileService } from '../../../services/textfile/common/textfiles.js';
import { ITextModelService } from '../../../../editor/common/services/resolverService.js';
// import { IAutoAcceptService } from './services/autoAcceptService.js';


/**
 * ErdosAiViewPane class.
 */
export class ErdosAiViewPane extends ErdosViewPane implements IReactComponentContainer {
	//#region Private Properties

	/**
	 * The onSizeChanged event emitter.
	 */
	private _onSizeChangedEmitter = this._register(new Emitter<ISize>());

	/**
	 * The onVisibilityChanged event emitter.
	 */
	private _onVisibilityChangedEmitter = this._register(new Emitter<boolean>());

	/**
	 * The onSaveScrollPosition event emitter.
	 */
	private _onSaveScrollPositionEmitter = this._register(new Emitter<void>());

	/**
	 * The onRestoreScrollPosition event emitter.
	 */
	private _onRestoreScrollPositionEmitter = this._register(new Emitter<void>());

	/**
	 * The onFocused event emitter.
	 */
	private _onFocusedEmitter = this._register(new Emitter<void>());

	/**
	 * The ErdosReactRenderer.
	 */
	private _erdosReactRenderer?: ErdosReactRenderer;

	//#endregion Private Properties

	//#region IReactComponentContainer

	/**
	 * Gets the onSizeChanged event.
	 */
	readonly onSizeChanged: Event<ISize> = this._onSizeChangedEmitter.event;

	/**
	 * Gets the onVisibilityChanged event.
	 */
	readonly onVisibilityChanged: Event<boolean> = this._onVisibilityChangedEmitter.event;

	/**
	 * Gets the onSaveScrollPosition event.
	 */
	readonly onSaveScrollPosition: Event<void> = this._onSaveScrollPositionEmitter.event;

	/**
	 * Gets the onRestoreScrollPosition event.
	 */
	readonly onRestoreScrollPosition: Event<void> = this._onRestoreScrollPositionEmitter.event;

	/**
	 * Gets the onFocused event.
	 */
	readonly onFocused: Event<void> = this._onFocusedEmitter.event;

	/**
	 * Gets the width.
	 */
	get width() {
		return this.element.clientWidth;
	}

	/**
	 * Gets the height.
	 */
	get height() {
		return this.element.clientHeight;
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
	takeFocus() {
		this.focus();
	}

	//#endregion IReactComponentContainer

	//#region Constructor & Dispose

	/**
	 * Constructor.
	 * @param options The IViewPaneOptions for the view pane.
	 * @param configurationService The IConfigurationService.
	 * @param contextKeyService The IContextKeyService.
	 * @param contextMenuService The IContextMenuService.
	 * @param hoverService The IHoverService.
	 * @param instantiationService The IInstantiationService.
	 * @param keybindingService The IKeybindingService.
	 * @param openerService The IOpenerService.
	 * @param erdosAiService The IErdosAiService.
	 * @param themeService The IThemeService.
	 * @param viewDescriptorService The IViewDescriptorService.
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
		@IErdosAiService private readonly erdosAiService: IErdosAiService,
		@IThemeService themeService: IThemeService,
		@IViewDescriptorService viewDescriptorService: IViewDescriptorService,
		@IFileService private readonly fileService: IFileService,
		@IFileDialogService private readonly fileDialogService: IFileDialogService,
		@ITextFileService private readonly textFileService: ITextFileService,
		@ITextModelService private readonly textModelService: ITextModelService,
		// @IAutoAcceptService private readonly autoAcceptService: IAutoAcceptService,

	) {
		// Call the base class's constructor.
		super({
			...options,
			openFromCollapsedSize: 200,
		}, keybindingService, contextMenuService, configurationService, contextKeyService, viewDescriptorService, instantiationService, openerService, themeService, hoverService);
	}

	//#endregion Constructor & Dispose

	//#region Overrides

	/**
	 * Renders the body.
	 */
	protected override renderBody(container: HTMLElement): void {
		// Call the base class's method.
		super.renderBody(container);

		// Create the ErdosReactRenderer.
		this._erdosReactRenderer = new ErdosReactRenderer(container);
		this._register(this._erdosReactRenderer);

		// Render the ErdosAi component.
		this._erdosReactRenderer.render(
			<ErdosAi
				reactComponentContainer={this}
				erdosAiService={this.erdosAiService}
				fileService={this.fileService}
				fileDialogService={this.fileDialogService}
				textFileService={this.textFileService}
				textModelService={this.textModelService}
				// autoAcceptService={this.autoAcceptService}

			/>
		);
	}

	/**
	 * Layout implementation.
	 */
	protected override layoutBody(height: number, width: number): void {
		// Call the base class's method.
		super.layoutBody(height, width);

		// Fire the onSizeChanged event.
		this._onSizeChangedEmitter.fire({
			width,
			height: height
		});
	}

	/**
	 * Sets the expanded state.
	 * @param expanded The expanded state.
	 */
	override setExpanded(expanded: boolean): boolean {
		// Set the expanded state.
		const result = super.setExpanded(expanded);

		// Fire the onVisibilityChanged event.
		this._onVisibilityChangedEmitter.fire(expanded && this.isBodyVisible());

		// Return the result.
		return result;
	}

	/**
	 * Update visibility changed event when body visibility changes.
	 * @param visible The body visibility.
	 */
	protected updateVisibility(visible: boolean): void {
		// Fire the onVisibilityChanged event.
		this._onVisibilityChangedEmitter.fire(visible && this.isExpanded());
	}

	/**
	 * Focus implementation.
	 */
	override focus(): void {
		// Call the base class's method.
		super.focus();

		// Fire the onFocused event.
		this._onFocusedEmitter.fire();
	}

	/**
	 * Save view state implementation.
	 */
	override saveState(): void {
		// Fire the onSaveScrollPosition event.
		this._onSaveScrollPositionEmitter.fire();

		// Call the base class's method.
		super.saveState();
	}

	//#endregion Overrides
}
