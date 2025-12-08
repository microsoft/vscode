/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

let selectedCategory: 'user' | 'orgs' | 'all' | undefined;

export function getSelectedCategory(): 'user' | 'orgs' | 'all' | undefined {
	return selectedCategory;
}

export function setSelectedCategory(category: 'user' | 'orgs' | 'all'): void {
	selectedCategory = category;
}

