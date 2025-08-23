/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2025 Lotas Inc. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

// CSS.
import './erdosConsoleView.css';

// Other dependencies.
import * as DOM from '../../../../base/browser/dom.js';
import { IHoverService } from '../../../../platform/hover/browser/hover.js';
import { IOpenerService } from '../../../../platform/opener/common/opener.js';
import { IViewDescriptorService } from '../../../common/views.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { ErdosConsoleFocused } from '../../../common/contextkeys.js';
import { IViewPaneOptions, ViewPane } from '../../../browser/parts/views/viewPane.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { IContextMenuService } from '../../../../platform/contextview/browser/contextView.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IContextKey, IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IErdosConsoleService } from '../../../services/erdosConsole/browser/interfaces/erdosConsoleService.js';

/**
 * ErdosConsoleViewPane class.
 */
export class ErdosConsoleViewPane extends ViewPane {

	/**
	 * Gets or sets the Erdos console container - contains the entire Erdos console UI.
	 */
	private _erdosConsoleContainer!: HTMLElement;

	/**
	 * Gets or sets the ErdosConsoleFocused context key.
	 */
	private _erdosConsoleFocusedContextKey: IContextKey<boolean>;

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
		@IErdosConsoleService erdosConsoleService: IErdosConsoleService,
	) {
		// Call the base class constructor.
		super(options, keybindingService, contextMenuService, configurationService, contextKeyService, viewDescriptorService, instantiationService, openerService, themeService, hoverService);

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

		// Add placeholder content for now
		const placeholder = DOM.append(this._erdosConsoleContainer, DOM.$('.erdos-console-placeholder'));
		const title = DOM.append(placeholder, DOM.$('h3'));
		title.textContent = 'Erdos Console';
		const description = DOM.append(placeholder, DOM.$('p'));
		description.textContent = 'Console UI implementation in progress...';
		const details = DOM.append(placeholder, DOM.$('p'));
		details.textContent = 'This is a basic placeholder that will be enhanced with React components.';
	}

	/**
	 * focus override method.
	 */
	public override focus(): void {
		// Call the base class method.
		super.focus();

		// Set the context key
		this._erdosConsoleFocusedContextKey.set(true);

		// Set focus to the Erdos console container.
		this._erdosConsoleContainer?.focus();
	}
}