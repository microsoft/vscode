/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export type LocalizedValueDto = {
	key: string;
	value: string;
};

export interface CategoryDto {
	key: string;
	name: LocalizedValueDto;
}

export interface PolicyDto {
	key: string;
	name: string;
	category: string;
	minimumVersion: `${number}.${number}`;
	localization: {
		description: LocalizedValueDto;
		enumDescriptions?: LocalizedValueDto[];
	};
	type?: string | string[];
	default?: unknown;
	enum?: string[];

	/**
	 * When `false`, the setting is not user-configurable and can only be
	 * managed via policy. Downstream consumers (e.g. docs website) can use
	 * this to hide the setting from their UI. Defaults to `true`.
	 */
	included?: boolean;
}

export interface ExportedPolicyDataDto {
	categories: CategoryDto[];
	policies: PolicyDto[];
}
