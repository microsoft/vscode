/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export type LocalizedValue = {
	key: string;
	value: string;
};

export interface CategoryDto {
	key: string;
	name: LocalizedValue;
}

export interface PolicyDto {
	name: string;
	category: string;
	minimumVersion: `${number}.${number}`;
	localization: {
		description: LocalizedValue;
		enumDescriptions?: LocalizedValue[];
	};
	key: string;
	type: string;
	defaultValue?: any;
	enumValue?: string[];
};

export interface ExportedPolicyData {
	categories: CategoryDto[];
	policies: PolicyDto[];
}
