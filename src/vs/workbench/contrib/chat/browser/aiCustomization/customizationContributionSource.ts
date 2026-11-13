/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../../nls.js';

export type CustomizationContributionSourceKind = 'plugin' | 'extension' | 'organization';

export function getCustomizationContributionSourceLabel(kind: CustomizationContributionSourceKind, name: string): string {
	switch (kind) {
		case 'plugin': return localize('customizationPluginSource', "Plugin: {0}", name);
		case 'extension': return localize('customizationExtensionSource', "Extension: {0}", name);
		case 'organization': return localize('customizationOrganizationSource', "Organization: {0}", name);
	}
}
