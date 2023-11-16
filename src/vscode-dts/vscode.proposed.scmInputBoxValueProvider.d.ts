/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {
	// https://github.com/microsoft/vscode/issues/195474

	export namespace scm {
		export function registerSourceControlInputBoxValueProvider(provider: SourceControlInputBoxValueProvider): Disposable;
	}

	export interface SourceControlInputBoxValueProviderContext {
		readonly resourceGroupId: string;
		readonly resources: readonly Uri[];
	}

	export interface SourceControlInputBoxValueProvider {
		readonly label: string;
		readonly icon?: Uri | { light: Uri; dark: Uri } | ThemeIcon;

		provideValue(sourceControlId: string, context: SourceControlInputBoxValueProviderContext[], token: CancellationToken): ProviderResult<string | undefined>;
	}

}
