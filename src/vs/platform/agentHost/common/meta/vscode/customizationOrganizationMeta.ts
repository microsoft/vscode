/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { isObject } from '../../../../../base/common/types.js';

const key = 'vscode.customizationOrganization';

/** Organization managed-settings control over a customization, published by the host. */
export interface ICustomizationOrganizationMeta {
	/** Enabled state the organization requires. Absent when the organization supplies the customization without locking it. */
	readonly requiredEnabled?: boolean;
}

/** Reads organization control from `_meta`, or `undefined` when absent or malformed. */
export function readCustomizationOrganizationMeta(customization: { readonly _meta?: Record<string, unknown> }): ICustomizationOrganizationMeta | undefined {
	const value = customization._meta?.[key];
	if (!isObject(value)) {
		return undefined;
	}
	const requiredEnabled = (value as Record<string, unknown>).requiredEnabled;
	return typeof requiredEnabled === 'boolean' ? { requiredEnabled } : {};
}

/** Returns `meta` with organization control set, or removed when `organization` is undefined. */
export function withCustomizationOrganizationMeta(meta: Record<string, unknown> | undefined, organization: ICustomizationOrganizationMeta | undefined): Record<string, unknown> {
	const result = { ...meta };
	if (organization === undefined) {
		delete result[key];
	} else {
		result[key] = organization.requiredEnabled === undefined ? {} : { requiredEnabled: organization.requiredEnabled };
	}
	return result;
}
