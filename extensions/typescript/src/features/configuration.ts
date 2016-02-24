/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { workspace } from 'vscode';

export interface IConfiguration {
	useCodeSnippetsOnMethodSuggest?: boolean;
}

export var defaultConfiguration: IConfiguration = {
	useCodeSnippetsOnMethodSuggest: false
};

export function load(myPluginId: string): IConfiguration {
	let configuration = workspace.getConfiguration(myPluginId);

	let useCodeSnippetsOnMethodSuggest = configuration.get('useCodeSnippetsOnMethodSuggest', defaultConfiguration.useCodeSnippetsOnMethodSuggest);

	return {
		useCodeSnippetsOnMethodSuggest
	};
}