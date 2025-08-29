/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IDefaultAccount } from './defaultAccount.js';

export type PolicyName = string;

export interface IPolicy {

	/**
	 * The policy name.
	 */
	readonly name: PolicyName;

	/**
	 * The Code version in which this policy was introduced.
	*/
	readonly minimumVersion: `${number}.${number}`;

	/**
	 * The policy description (optional).
	 */
	readonly description?: string;

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
