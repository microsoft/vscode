/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../nls.js';
import { IDefaultAccount } from './defaultAccount.js';

/**
 * System-wide policy file path for Linux systems.
 */
export const LINUX_SYSTEM_POLICY_FILE_PATH = '/etc/vscode/policy.json';

export type PolicyName = string;
export type LocalizedValue = {
	key: string;
	value: string;
};

export enum PolicyCategory {
	Extensions = 'Extensions',
	IntegratedTerminal = 'IntegratedTerminal',
	InteractiveSession = 'InteractiveSession',
	Telemetry = 'Telemetry',
	Update = 'Update',
}

export const PolicyCategoryData: {
	[key in PolicyCategory]: { name: LocalizedValue }
} = {
	[PolicyCategory.Extensions]: {
		name: {
			key: 'extensionsConfigurationTitle', value: localize('extensionsConfigurationTitle', "Extensions"),
		}
	},
	[PolicyCategory.IntegratedTerminal]: {
		name: {
			key: 'terminalIntegratedConfigurationTitle', value: localize('terminalIntegratedConfigurationTitle', "Integrated Terminal"),
		}
	},
	[PolicyCategory.InteractiveSession]: {
		name: {
			key: 'interactiveSessionConfigurationTitle', value: localize('interactiveSessionConfigurationTitle', "Chat"),
		}
	},
	[PolicyCategory.Telemetry]: {
		name: {
			key: 'telemetryConfigurationTitle', value: localize('telemetryConfigurationTitle', "Telemetry"),
		}
	},
	[PolicyCategory.Update]: {
		name: {
			key: 'updateConfigurationTitle', value: localize('updateConfigurationTitle', "Update"),
		}
	}
};

export interface IPolicy {

	/**
	 * The policy name.
	 */
	readonly name: PolicyName;

	/**
	 * The policy category.
	 */
	readonly category: PolicyCategory;

	/**
	 * The Code version in which this policy was introduced.
	*/
	readonly minimumVersion: `${number}.${number}`;

	/**
	 * Localization info for the policy.
	 *
	 * IMPORTANT: the key values for these must be unique to avoid collisions, as during the export time the module information is not available.
	 */
	readonly localization: {
		/** The localization key or key value pair. If only a key is provided, the default value will fallback to the parent configuration's description property. */
		description: LocalizedValue;
		/** List of localization key or key value pair. If only a key is provided, the default value will fallback to the parent configuration's enumDescriptions property. */
		enumDescriptions?: LocalizedValue[];
	};

	/**
	 * The value that an ACCOUNT-based feature will use when its corresponding policy is active.
	 *
	 * Only applicable when policy is tagged with ACCOUNT. When an account-based feature's policy is enabled,
	 * this value determines what value the feature receives.
	 *
	 * For example:
	 * - If evaluated value is `true`,  the feature's setting is locked to `true` WHEN the policy is in effect.
	 * - If evaluated value is `foo`, the feature's setting is locked to 'foo'  WHEN the policy is in effect.
	 *
	 * If `undefined`, the feature's setting is not locked and can be overridden by other means.
	 */
	readonly value?: (account: IDefaultAccount) => string | number | boolean | undefined;
}
