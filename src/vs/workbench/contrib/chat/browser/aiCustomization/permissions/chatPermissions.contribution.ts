/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ChatPermissionDomainId } from '../../../common/permissions/chatPermissions.js';
import { AICustomizationManagementSection } from '../../../common/aiCustomizationWorkspaceService.js';
import { aiCustomizationManagementSectionRegistry } from '../aiCustomizationManagementSectionRegistry.js';
import { chatPermissionDomainRegistry } from './chatPermissionDomainRegistry.js';
import { ChatPermissionsSectionWidget } from './chatPermissionsSectionWidget.js';
import './chatPermissionDomains.js';

/** Maps each sidebar section onto the permission domain it renders. */
const PERMISSION_SECTION_DOMAINS: readonly (readonly [AICustomizationManagementSection, ChatPermissionDomainId])[] = [
	[AICustomizationManagementSection.PermissionsTerminal, ChatPermissionDomainId.Terminal],
	[AICustomizationManagementSection.PermissionsFiles, ChatPermissionDomainId.Files],
	[AICustomizationManagementSection.PermissionsNetwork, ChatPermissionDomainId.Network],
];

for (const [section, domainId] of PERMISSION_SECTION_DOMAINS) {
	const domain = chatPermissionDomainRegistry.get(domainId);
	if (!domain) {
		continue;
	}
	aiCustomizationManagementSectionRegistry.register({
		id: section,
		label: domain.label,
		icon: domain.icon,
		description: domain.description,
		// Permission state comes from the runtime rather than from a harness's own customization
		// store, so every harness shows the same sections.
		supportsHarness: () => true,
		create: (instantiationService, container) => instantiationService.createInstance(ChatPermissionsSectionWidget, container, domain, undefined),
	});
}
