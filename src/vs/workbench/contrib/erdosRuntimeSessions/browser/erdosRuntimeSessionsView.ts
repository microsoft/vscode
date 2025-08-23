/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2025 Lotas Inc. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

// CSS.
import './erdosRuntimeSessionsView.css';

// Other dependencies.
import * as DOM from '../../../../base/browser/dom.js';
import { IHoverService } from '../../../../platform/hover/browser/hover.js';
import { IOpenerService } from '../../../../platform/opener/common/opener.js';
import { IViewDescriptorService } from '../../../common/views.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { IViewPaneOptions, ViewPane } from '../../../browser/parts/views/viewPane.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { IContextMenuService } from '../../../../platform/contextview/browser/contextView.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
// Note: IRuntimeSessionService will be used in future implementation

/**
 * ErdosRuntimeSessionsViewPane class.
 */
export class ErdosRuntimeSessionsViewPane extends ViewPane {

	/**
	 * Gets or sets the Erdos runtime sessions container - contains the entire Erdos runtime sessions UI.
	 */
	private _erdosRuntimeSessionsContainer!: HTMLElement;

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
	 * @param runtimeSessionService The runtime session service.
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
		// @IRuntimeSessionService runtimeSessionService: IRuntimeSessionService, // Will be added in future implementation
	) {
		// Call the base class constructor.
		super(options, keybindingService, contextMenuService, configurationService, contextKeyService, viewDescriptorService, instantiationService, openerService, themeService, hoverService);
	}

	/**
	 * renderBody override method.
	 * @param container The container HTMLElement.
	 */
	protected override renderBody(container: HTMLElement): void {
		// Call the base class method.
		super.renderBody(container);

		// Create and append the Erdos runtime sessions container.
		this._erdosRuntimeSessionsContainer = DOM.append(container, DOM.$('.erdos-runtime-sessions-container'));

		// Add placeholder content for now using DOM manipulation (not innerHTML for security)
		const placeholder = DOM.append(this._erdosRuntimeSessionsContainer, DOM.$('.erdos-runtime-sessions-placeholder'));
		
		// Create header
		const header = DOM.append(placeholder, DOM.$('h3'));
		header.textContent = 'Erdos Runtime Sessions';
		
		// Create description paragraphs
		const desc1 = DOM.append(placeholder, DOM.$('p'));
		desc1.textContent = 'Runtime Sessions UI implementation in progress...';
		
		const desc2 = DOM.append(placeholder, DOM.$('p'));
		desc2.textContent = 'This will show active interpreter sessions and allow session management.';
		
		// Create sessions list
		const sessionsList = DOM.append(placeholder, DOM.$('.sessions-list'));
		
		// Create Python session item
		const pythonSession = DOM.append(sessionsList, DOM.$('.session-item'));
		const pythonLang = DOM.append(pythonSession, DOM.$('span.session-language'));
		pythonLang.textContent = 'Python 3.12';
		const pythonStatus = DOM.append(pythonSession, DOM.$('span.session-status'));
		pythonStatus.textContent = 'Active';
		
		// Create R session item
		const rSession = DOM.append(sessionsList, DOM.$('.session-item'));
		const rLang = DOM.append(rSession, DOM.$('span.session-language'));
		rLang.textContent = 'R 4.3.0';
		const rStatus = DOM.append(rSession, DOM.$('span.session-status'));
		rStatus.textContent = 'Idle';
	}

	/**
	 * focus override method.
	 */
	public override focus(): void {
		// Call the base class method.
		super.focus();

		// Set focus to the Erdos runtime sessions container.
		this._erdosRuntimeSessionsContainer?.focus();
	}
}
