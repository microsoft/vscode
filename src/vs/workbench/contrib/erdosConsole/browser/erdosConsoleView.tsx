/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2025 Lotas Inc. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

// CSS.
import './erdosConsoleView.css';

// React.
import React from 'react';

// Other dependencies.
import * as DOM from '../../../../base/browser/dom.js';
import { Event, Emitter } from '../../../../base/common/event.js';
import { IHoverService } from '../../../../platform/hover/browser/hover.js';
import { IOpenerService } from '../../../../platform/opener/common/opener.js';
import { IViewDescriptorService } from '../../../common/views.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { ErdosConsoleFocused, ErdosConsoleInstancesExistContext } from '../../../common/contextkeys.js';
import { IViewPaneOptions, ViewPane } from '../../../browser/parts/views/viewPane.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { IContextMenuService } from '../../../../platform/contextview/browser/contextView.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IContextKey, IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { ErdosConsole } from './erdosConsole.js';
import { IReactComponentContainer, ISize, PositronReactRenderer } from '../../../../base/browser/positronReactRenderer.js';
import { IErdosConsoleService } from '../../../services/erdosConsole/browser/interfaces/erdosConsoleService.js';
import { IAccessibilityService } from '../../../../platform/accessibility/common/accessibility.js';

/**
 * ErdosConsoleViewPane class.
 */
export class ErdosConsoleViewPane extends ViewPane implements IReactComponentContainer {
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
	 * Gets or sets the width. This value is set in layoutBody and is used to implement the
	 * IReactComponentContainer interface.
	 */
	private _width = 0;

	/**
	 * Gets or sets the height. This value is set in layoutBody and is used to implement the
	 * IReactComponentContainer interface.
	 */
	private _height = 0;

	/**
	 * Gets or sets the Erdos console container - contains the entire Erdos console UI.
	 */
	private _erdosConsoleContainer!: HTMLElement;

	/**
	 * Gets or sets the PositronReactRenderer for the ErdosConsole component.
	 */
	private _positronReactRenderer: PositronReactRenderer | undefined;

	/**
	 * Gets or sets the ErdosConsoleFocused context key.
	 */
	private _erdosConsoleFocusedContextKey: IContextKey<boolean>;

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

	focusChanged(focused: boolean) {
		this._erdosConsoleFocusedContextKey.set(focused);

		if (focused) {
			this._onFocusedEmitter.fire();
		}
	}

	/**
	 * onSizeChanged event.
	 */
	public readonly onSizeChanged: Event<ISize> = this._onSizeChangedEmitter.event;

	/**
	 * onVisibilityChanged event.
	 */
	public readonly onVisibilityChanged: Event<boolean> = this._onVisibilityChangedEmitter.event;

	/**
	 * onSaveScrollPosition event.
	 */
	public readonly onSaveScrollPosition: Event<void> = this._onSaveScrollPositionEmitter.event;

	/**
	 * onRestoreScrollPosition event.
	 */
	public readonly onRestoreScrollPosition: Event<void> = this._onRestoreScrollPositionEmitter.event;

	/**
	 * onFocused event.
	 */
	public readonly onFocused: Event<void> = this._onFocusedEmitter.event;

	//#endregion IReactComponentContainer

	/**
	 * Constructor.
	 * @param options A ViewPaneOptions that contains the view pane options.
	 * @param keybindingService The keybinding service.
	 * @param contextMenuService The context menu service.
	 * @param configurationService The configuration service.
	 * @param contextKeyService The context key service.
	 * @param viewDescriptorService The view descriptor service.
	 * @param instantiationService The instantiation service.
	 * @param openerService The opener service.
	 * @param themeService The theme service.
	 * @param hoverService The hover service.
	 * @param accessibilityService The accessibility service.
	 * @param commandService The command service.
	 * @param notificationService The notification service.
	 * @param erdosConsoleService The Erdos console service.
	 */
	constructor(
		options: IViewPaneOptions,
		@IKeybindingService keybindingService: IKeybindingService,
		@IContextMenuService contextMenuService: IContextMenuService,
		@IConfigurationService configurationService: IConfigurationService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IViewDescriptorService viewDescriptorService: IViewDescriptorService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IOpenerService openerService: IOpenerService,
		@IThemeService themeService: IThemeService,
		@IHoverService hoverService: IHoverService,
		@IAccessibilityService accessibilityService: IAccessibilityService,
		@ICommandService private readonly _commandService: ICommandService,
		@INotificationService private readonly _notificationService: INotificationService,
		@IErdosConsoleService private readonly _erdosConsoleService: IErdosConsoleService,
	) {
		// Call the base class constructor.
		super(options, keybindingService, contextMenuService, configurationService, contextKeyService, viewDescriptorService, instantiationService, openerService, themeService, hoverService, accessibilityService);

		// Set the Erdos console focused context key.
		this._erdosConsoleFocusedContextKey = ErdosConsoleFocused.bindTo(contextKeyService);
	}

	/**
	 * renderBody override method.
	 * @param container The container HTMLElement.
	 */
	protected override renderBody(container: HTMLElement): void {
		// Call the base class method.
		super.renderBody(container);

		// Create and append the Erdos console container.
		this._erdosConsoleContainer = DOM.append(container, DOM.$('.erdos-console-container'));

		// Create the PositronReactRenderer for the ErdosConsole component and render it.
		this._positronReactRenderer = new PositronReactRenderer(this._erdosConsoleContainer);
		this._register(this._positronReactRenderer);
		this._positronReactRenderer.render(
			<ErdosConsole
				reactComponentContainer={this}
			/>
		);
	}

	/**
	 * layoutBody override method.
	 * @param height The height of the body.
	 * @param width The width of the body.
	 */
	protected override layoutBody(height: number, width: number): void {
		// Call the base class method.
		super.layoutBody(height, width);

		// Set the width and height.
		this._width = width;
		this._height = height;

		// Fire the onSizeChanged event.
		this._onSizeChangedEmitter.fire({ width, height });
	}

	/**
	 * setVisible override method.
	 * @param visible A value which indicates whether the view pane is visible.
	 */
	protected override setVisible(visible: boolean): void {
		// Call the base class method.
		super.setVisible(visible);

		// Fire the onVisibilityChanged event.
		this._onVisibilityChangedEmitter.fire(visible);
	}

	/**
	 * saveState override method.
	 */
	public override saveState(): void {
		// Fire the onSaveScrollPosition event.
		this._onSaveScrollPositionEmitter.fire();

		// Call the base class method.
		super.saveState();
	}

	/**
	 * focus override method.
	 */
	public override focus(): void {
		// Call the base class method.
		super.focus();

		// Set focus to the Erdos console container.
		this._erdosConsoleContainer?.focus();
	}
}
