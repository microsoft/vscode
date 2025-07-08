/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

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
	 * Is preview feature
	 */
	readonly previewFeature?: boolean;

	/**
	 * The value that a preview feature will use when its corresponding policy is active.
	 *
	 * Only applicable when `previewFeature: true`. When a preview feature's policy is enabled,
	 * this value determines what value the feature receives.
	 *
	 * For example:
	 * - If `defaultValue: true`,  the feature's setting is locked to `true` WHEN the policy is in effect.
	 * - If `defaultValue: 'foo'`, the feature's setting is locked to 'foo' WHEN the policy is in effect.
	 *
	 * If omitted, 'false' is the assumed value.
	 *
	 * Note: This is unrelated to VS Code settings and their default values. This specifically controls
	 * the value of a preview feature's setting when policy is overriding it.
	*/
	readonly defaultValue?: string | number | boolean;
}
