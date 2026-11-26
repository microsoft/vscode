/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import '../media/openInVSCode.css';
import { $, addDisposableListener, append, EventHelper, EventLike, EventType } from '../../../base/browser/dom.js';
import { getDefaultHoverDelegate } from '../../../base/browser/ui/hover/hoverDelegateFactory.js';
import { BaseActionViewItem, IBaseActionViewItemOptions } from '../../../base/browser/ui/actionbar/actionViewItems.js';
import { IAction } from '../../../base/common/actions.js';
import { Codicon } from '../../../base/common/codicons.js';
import { ThemeIcon } from '../../../base/common/themables.js';
import { localize } from '../../../nls.js';
import { IConfigurationService } from '../../../platform/configuration/common/configuration.js';
import { AGENTS_WINDOW_SWITCHER_EXPAND_ON_HOVER_TREATMENT, AGENTS_WINDOW_TITLE_BAR_ICONS_SETTING } from '../../../platform/chat/common/chatSettings.js';
import { observeAgentsWindowTitleBarIconExposure } from '../../../platform/chat/browser/agentsWindowTitleBarIcons.js';
import { IHoverService } from '../../../platform/hover/browser/hover.js';
import { IKeybindingService } from '../../../platform/keybinding/common/keybinding.js';
import { IProductService } from '../../../platform/product/common/productService.js';
import { ITelemetryService } from '../../../platform/telemetry/common/telemetry.js';
import { logExperimentTrigger } from '../../../platform/telemetry/common/experimentTrigger.js';
import { registerIcon } from '../../../platform/theme/common/iconRegistry.js';
import { ILogService } from '../../../platform/log/common/log.js';
import { IWorkbenchAssignmentService } from '../../../workbench/services/assignment/common/assignmentService.js';
import { registerExperimentTreatments } from '../../../workbench/services/assignment/common/experimentTreatments.js';

const openInVSCodeIcon = registerIcon('open-in-vscode', Codicon.vscode, localize('openInVSCodeIcon', "Icon for the Open in VS Code button in the title bar."));
const openInVSCodeInsidersIcon = registerIcon('open-in-vscode-insiders', Codicon.vscodeInsiders, localize('openInVSCodeInsidersIcon', "Icon for the Open in VS Code Insiders button in the title bar."));

/**
 * Renders the "Open in VS Code" titlebar entry as an icon-only button that may
 * expand to reveal a label on hover, and always does so on keyboard focus.
 */
export class OpenInVSCodeTitleBarWidget extends BaseActionViewItem {

	private expansionTreatmentResolved = false;
	private isHovered = false;

	constructor(
		action: IAction,
		options: IBaseActionViewItemOptions | undefined,
		private readonly keybindingCommandId: string,
		@IProductService private readonly productService: IProductService,
		@IHoverService private readonly hoverService: IHoverService,
		@IKeybindingService private readonly keybindingService: IKeybindingService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@ITelemetryService private readonly telemetryService: ITelemetryService,
		@IWorkbenchAssignmentService private readonly assignmentService: IWorkbenchAssignmentService,
		@ILogService private readonly logService: ILogService,
	) {
		super(undefined, action, options);
		this._register(this.configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(AGENTS_WINDOW_TITLE_BAR_ICONS_SETTING)) {
				this.updateIcon();
			}
		}));
	}

	override render(container: HTMLElement): void {
		super.render(container);

		container.classList.add('open-in-vscode-titlebar-widget', 'agent-sessions-interactive', 'expand-on-hover');
		container.setAttribute('role', 'button');
		if (this.productService.quality) {
			container.setAttribute('data-product-quality', this.productService.quality);
		}
		this._register(addDisposableListener(container, EventType.MOUSE_ENTER, () => {
			this.isHovered = true;
			this.logExpansionExperimentTrigger();
		}));
		this._register(addDisposableListener(container, EventType.MOUSE_LEAVE, () => {
			this.isHovered = false;
		}));
		this._register(registerExperimentTreatments<boolean>(
			[AGENTS_WINDOW_SWITCHER_EXPAND_ON_HOVER_TREATMENT],
			'OpenInVSCodeTitleBarWidget',
			([expandOnHover]) => {
				this.expansionTreatmentResolved = true;
				this.logExpansionExperimentTrigger();
				container.classList.toggle('expand-on-hover', expandOnHover ?? true);
			},
			this.assignmentService,
			this.logService,
			value => typeof value === 'boolean',
		));

		const label = this.action.label;
		const hoverText = this.keybindingService.appendKeybinding(localize('openInVSCodeHover', "Open in VS Code Editor Window"), this.keybindingCommandId);
		container.setAttribute('aria-label', hoverText);
		this._register(this.hoverService.setupManagedHover(this.options.hoverDelegate ?? getDefaultHoverDelegate('element'), container, hoverText));

		this.iconElement = append(container, $('span.open-in-vscode-titlebar-widget-icon'));
		this.updateIcon();
		this._register(observeAgentsWindowTitleBarIconExposure(this.iconElement, this.configurationService, this.telemetryService));
		this.iconElement.setAttribute('aria-hidden', 'true');

		const labelEl = append(container, $('span.open-in-vscode-titlebar-widget-label'));
		labelEl.textContent = label;
	}

	private logExpansionExperimentTrigger(): void {
		if (this.isHovered && this.expansionTreatmentResolved) {
			logExperimentTrigger(this.telemetryService, AGENTS_WINDOW_SWITCHER_EXPAND_ON_HOVER_TREATMENT);
		}
	}

	private iconElement: HTMLElement | undefined;

	private updateIcon(): void {
		if (!this.iconElement) {
			return;
		}
		const useCodicons = this.configurationService.getValue<boolean>(AGENTS_WINDOW_TITLE_BAR_ICONS_SETTING) === true;
		this.element?.classList.toggle('codicon-icons', useCodicons);
		const icon = this.productService.quality === 'insider' ? openInVSCodeInsidersIcon : openInVSCodeIcon;
		const classNames = ThemeIcon.asClassNameArray(icon);
		if (useCodicons) {
			this.iconElement.classList.add(...classNames);
		} else {
			this.iconElement.classList.remove(...classNames);
		}
	}

	override onClick(event: EventLike): void {
		EventHelper.stop(event, true);
		this.action.run();
	}
}
