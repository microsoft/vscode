/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

interface NotebookTrustedTypePolicyFactory {
	createPolicy(name: string, rules: {
		createHTML(value: string): string;
		createScript(value: string): string;
	}): {
		createHTML(value: string): string;
		createScript(value: string): string;
	};
}

const trustedTypesFactory: NotebookTrustedTypePolicyFactory | undefined =
	typeof window !== 'undefined'
		? (window as unknown as { trustedTypes?: NotebookTrustedTypePolicyFactory }).trustedTypes
		: undefined;

export const ttPolicy = trustedTypesFactory?.createPolicy('notebookRenderer', {
	createHTML: (value: string) => value,
	createScript: (value: string) => value,
});
