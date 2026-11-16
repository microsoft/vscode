/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../nls.js';
import { IOpenerService } from '../../../../platform/opener/common/opener.js';

/**
 * Label for actions that open the organization's support page. The page may not be a contact form,
 * but it is where the organization tells users who administers Copilot and how to reach them.
 */
export function getOrganizationSupportActionLabel(): string {
	return localize('organizationSupport.contactAdmin', "Contact Admin");
}

/** Names the organization-controlled destination so it is not mistaken for VS Code or GitHub help. */
export function getOrganizationSupportActionTooltip(supportUrl: string): string {
	let host: string;
	try {
		host = new URL(supportUrl).host;
	} catch {
		host = supportUrl;
	}
	return localize('organizationSupport.tooltip', "Opens your organization's help page ({0})", host);
}

/**
 * Opens the organization's support page in the external browser, as the managed-settings contract
 * requires. VS Code's link protection still applies, so untrusted domains are confirmed first.
 */
export function openOrganizationSupport(openerService: IOpenerService, supportUrl: string): Promise<boolean> {
	return openerService.open(supportUrl, { openExternal: true });
}
