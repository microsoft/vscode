/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export type PolicyName = string;

export enum PolicyTag {
	Account = 'ACCOUNT',
	MCP = 'MCP',
	Preview = 'PREVIEW'
}

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
	 * - If `defaultValue: true`,  the feature's setting is locked to `true` WHEN the policy is in effect.
	 * - If `defaultValue: 'foo'`, the feature's setting is locked to 'foo'  WHEN the policy is in effect.
	 *
	 * If omitted, 'false' is the assumed value.
	 *
	 * Note: This is unrelated to the default value of the VS Code setting itself. This specifically controls
	 * the value of an account-based feature's setting WHEN the policy is overriding it.
	 */
	readonly defaultValue?: string | number | boolean;

	/**
	 * Tags for categorizing policies
	 */
	readonly tags?: PolicyTag[];
}
