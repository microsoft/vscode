/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as DOM from '../../../../../base/browser/dom.js';
import { IManagedHover } from '../../../../../base/browser/ui/hover/hover.js';
import { getDefaultHoverDelegate } from '../../../../../base/browser/ui/hover/hoverDelegateFactory.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { Disposable, IDisposable, MutableDisposable } from '../../../../../base/common/lifecycle.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { localize } from '../../../../../nls.js';
import { IConfigurationChangeEvent, IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IHoverService } from '../../../../../platform/hover/browser/hover.js';
import { mcpAllowedServersConfig } from '../../../../../platform/mcp/common/mcpManagement.js';
import { IOpenerService } from '../../../../../platform/opener/common/opener.js';
import { COPILOT_ALLOW_MANAGED_HOOKS_ONLY_CONFIG, COPILOT_ALLOW_MANAGED_MCP_SERVERS_ONLY_CONFIG, COPILOT_STRICT_PLUGIN_ONLY_CUSTOMIZATION_CONFIG, getManagedSupportUrl, IManagedSettingsService } from '../../../../../platform/policy/common/copilotManagedSettings.js';
import { appendContactAdministratorLink } from '../../../../services/policies/browser/organizationSupportLink.js';
import { AICustomizationManagementSection } from '../../common/aiCustomizationWorkspaceService.js';
import { ICustomizationOrganizationControl } from '../../common/customizationHarnessService.js';

const $ = DOM.$;

/**
 * How an organization restricts the customizations of one section.
 * - `pluginOnly`: only customizations supplied by plugins load.
 * - `organizationOnly`: only customizations the organization supplies or approves load.
 * - `allowlist`: only customizations the organization approved by name load.
 */
export type CustomizationOrganizationRestriction = 'pluginOnly' | 'organizationOnly' | 'allowlist';

const organizationRestrictionSettings = [
	COPILOT_STRICT_PLUGIN_ONLY_CUSTOMIZATION_CONFIG,
	COPILOT_ALLOW_MANAGED_HOOKS_ONLY_CONFIG,
	COPILOT_ALLOW_MANAGED_MCP_SERVERS_ONLY_CONFIG,
	mcpAllowedServersConfig,
];

function affectsOrganizationRestriction(event: IConfigurationChangeEvent): boolean {
	return organizationRestrictionSettings.some(setting => event.affectsConfiguration(setting));
}

/**
 * The restriction an organization's managed policy places on `section`.
 * Reads only policy values, so a user's own settings never claim to come from their organization.
 * Customizations excluded by these settings are not listed, so the section explains their absence.
 */
export function getCustomizationOrganizationRestriction(configurationService: Pick<IConfigurationService, 'inspect'>, section: string): CustomizationOrganizationRestriction | undefined {
	const policy = <T>(key: string) => configurationService.inspect<T>(key).policyValue;
	const strictPluginOnly = policy<boolean>(COPILOT_STRICT_PLUGIN_ONLY_CUSTOMIZATION_CONFIG) === true;
	switch (section) {
		case AICustomizationManagementSection.Skills:
		case AICustomizationManagementSection.Agents:
		case AICustomizationManagementSection.Instructions:
			return strictPluginOnly ? 'pluginOnly' : undefined;
		case AICustomizationManagementSection.Hooks:
			if (policy<boolean>(COPILOT_ALLOW_MANAGED_HOOKS_ONLY_CONFIG) === true) {
				return 'organizationOnly';
			}
			return strictPluginOnly ? 'pluginOnly' : undefined;
		case AICustomizationManagementSection.McpServers:
			if (strictPluginOnly) {
				return 'pluginOnly';
			}
			if (policy<boolean>(COPILOT_ALLOW_MANAGED_MCP_SERVERS_ONLY_CONFIG) === true) {
				return 'organizationOnly';
			}
			return Array.isArray(policy<unknown>(mcpAllowedServersConfig)) ? 'allowlist' : undefined;
	}
	return undefined;
}

/** Explains an organization-managed customization, including any enablement it requires. */
export function getOrganizationManagedTooltip(control: ICustomizationOrganizationControl): string {
	switch (control.requiredEnabled) {
		case true:
			return localize('organizationManagedEnabled', "Managed by your organization. It is always enabled and can't be disabled.");
		case false:
			return localize('organizationManagedDisabled', "Managed by your organization. It is disabled and can't be enabled.");
		default:
			return localize('organizationManaged', "Managed by your organization.");
	}
}

/** Appends the organization-managed explanation to a row's accessible label, so screen readers hear what the tag shows. */
export function withOrganizationManagedAriaLabel(label: string, control: ICustomizationOrganizationControl | undefined): string {
	return control ? localize('organizationManagedAriaLabel', "{0}. {1}", label, getOrganizationManagedTooltip(control)) : label;
}

/** The "Managed by your organization" tag shown next to the name of an organization-managed customization. */
export class OrganizationManagedTag extends Disposable {

	private readonly element: HTMLElement;
	private readonly hover: IManagedHover;

	constructor(container: HTMLElement, hoverService: IHoverService) {
		super();
		this.element = DOM.append(container, $('.inline-badge.organization-managed-tag'));
		DOM.append(this.element, $(`span${ThemeIcon.asCSSSelector(Codicon.shield)}`, { 'aria-hidden': 'true' }));
		DOM.append(this.element, $('span')).textContent = localize('organizationManagedTag', "Managed by your organization");
		this.hover = this._register(hoverService.setupManagedHover(getDefaultHoverDelegate('mouse'), this.element, ''));
		this.update(undefined);
	}

	/** Shows the tag for `control`, or hides it when the customization isn't organization managed. */
	update(control: ICustomizationOrganizationControl | undefined): void {
		const tooltip = control ? getOrganizationManagedTooltip(control) : '';
		this.element.style.display = control ? '' : 'none';
		this.element.setAttribute('aria-label', tooltip);
		this.hover.update(tooltip);
	}
}

function getRestrictionMessage(section: string, restriction: CustomizationOrganizationRestriction): string | undefined {
	switch (section) {
		case AICustomizationManagementSection.Skills:
			return localize('organizationSkillsPluginOnly', "Your organization only allows skills from plugins. Other skills are hidden.");
		case AICustomizationManagementSection.Agents:
			return localize('organizationAgentsPluginOnly', "Your organization only allows agents from plugins. Other agents are hidden.");
		case AICustomizationManagementSection.Instructions:
			return localize('organizationInstructionsPluginOnly', "Your organization only allows instructions from plugins. Other instructions are hidden.");
		case AICustomizationManagementSection.Hooks:
			return restriction === 'organizationOnly'
				? localize('organizationHooksOrganizationOnly', "Your organization only allows hooks it provides. Other hooks are hidden.")
				: localize('organizationHooksPluginOnly', "Your organization only allows hooks from plugins. Other hooks are hidden.");
		case AICustomizationManagementSection.McpServers:
			switch (restriction) {
				case 'pluginOnly': return localize('organizationMcpPluginOnly', "Your organization only allows MCP servers from plugins to run.");
				case 'organizationOnly': return localize('organizationMcpOrganizationOnly', "Your organization only allows MCP servers it provides or approves to run.");
				case 'allowlist': return localize('organizationMcpAllowlist', "Your organization only allows approved MCP servers to run.");
			}
	}
	return undefined;
}

/** A notice explaining that the user's organization restricts which customizations of a section load. */
export class CustomizationOrganizationPolicyNotice extends Disposable {

	readonly element: HTMLElement;
	private readonly message: HTMLElement;
	private readonly supportLink = this._register(new MutableDisposable<IDisposable>());
	private section: string | undefined;

	constructor(
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IHoverService private readonly hoverService: IHoverService,
		@IOpenerService private readonly openerService: IOpenerService,
		@IManagedSettingsService private readonly managedSettingsService: IManagedSettingsService,
	) {
		super();
		this.element = $('.organization-policy-notice', { role: 'note' });
		DOM.append(this.element, $(`.organization-policy-notice-icon${ThemeIcon.asCSSSelector(Codicon.shield)}`, { 'aria-hidden': 'true' }));
		this.message = DOM.append(this.element, $('.organization-policy-notice-message'));
		this.element.style.display = 'none';
		this._register(this.configurationService.onDidChangeConfiguration(e => {
			if (affectsOrganizationRestriction(e)) {
				this.render();
			}
		}));
		this._register(this.managedSettingsService.onDidChangeManagedSettings(() => this.render()));
	}

	/** Shows the notice for `section`, or hides it when the organization doesn't restrict it. */
	setSection(section: string): void {
		this.section = section;
		this.render();
	}

	private render(): void {
		const restriction = this.section ? getCustomizationOrganizationRestriction(this.configurationService, this.section) : undefined;
		const text = this.section && restriction ? getRestrictionMessage(this.section, restriction) : undefined;
		this.supportLink.clear();
		DOM.clearNode(this.message);
		if (!text) {
			this.element.style.display = 'none';
			return;
		}
		this.element.style.display = '';
		this.message.appendChild(document.createTextNode(text));
		const supportUrl = getManagedSupportUrl(this.managedSettingsService);
		if (supportUrl) {
			this.message.appendChild(document.createTextNode(' '));
			this.supportLink.value = appendContactAdministratorLink(this.message, 'section-title-link', supportUrl, this.openerService, this.hoverService);
		}
	}
}
