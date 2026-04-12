/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export const ttPolicy = (typeof window !== 'undefined') ?
	(window as Window & { trustedTypes?: any }).trustedTypes?.createPolicy('notebookRenderer', {
		createHTML: (value: string) => value,
		createScript: (value: string) => value,
	}) : undefined;
