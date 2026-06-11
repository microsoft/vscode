/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../nls.js';
import { IManagedSettingsData } from './copilotPolicy.js';
import { IPolicyData } from './defaultAccount.js';

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
	 * Evaluates policy data from any source — account-level (GitHub org policy)
	 * or managed-settings (MDM / file-based) — and returns the value this policy
	 * should take.  Each caller supplies only the source it owns:
	 *
	 * - `AccountPolicyService` passes `{ accountPolicy }`.
	 * - `ManagedSettingsFilePolicyService` passes `{ managedSettings }`.
	 *
	 * Return a concrete value to **override** the user's setting, or
	 * `undefined` to **not apply** any override for this source.
	 */
	readonly value?: (sources: IPolicyValueSources) => string | number | boolean | undefined;

	/**
	 * The most-restrictive value that should be applied when the user is subject to the
	 * "Require Approved Account" gate but the gate is not yet satisfied (i.e. no approved
	 * GitHub account is signed in or the account-side policy data has not yet resolved).
	 *
	 * If omitted, the gate falls back to a type-driven safe default
	 * (`false` for boolean, `0` for number, `''` for string).
	 *
	 * Only consulted while the gate is active and unsatisfied; ignored otherwise.
	 */
	readonly restrictedValue?: string | number | boolean;

	/**
	 * When set, this value is treated as a security-critical "deny" signal.
	 * If **any** policy source provides this value, it takes effect regardless
	 * of source priority — no lower-priority source can override it.
	 * Used for settings like `disableBypassPermissionsMode` where `"disable"`
	 * from any enterprise source must stick.
	 */
	readonly denyValue?: string | number | boolean;
}

/**
 * Data sources that can feed a policy's {@link IPolicy.value} callback.
 * Each policy service passes only the source it owns — the callback
 * inspects whichever fields are relevant.
 */
export interface IPolicyValueSources {
	/** Account-level policy data from the user's GitHub org. */
	readonly accountPolicy?: IPolicyData;
	/** GitHubCopilot managed-settings data from MDM plist/registry or file. */
	readonly managedSettings?: IManagedSettingsData;
}
