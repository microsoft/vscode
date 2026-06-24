/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ExtensionContext } from 'vscode';
import { baseActivate } from '../vscode/extension';
import { vscodeWebContributions } from './contributions';
import { registerServices } from './services';

// ###############################################################################################
// ###                                                                                         ###
// ###                 Web extension that runs ONLY in web worker extension host.              ###
// ###                                                                                         ###
// ### !!! Prefer to add code in ../vscode/extension.ts to support all extension runtimes !!!  ###
// ###                                                                                         ###
// ###############################################################################################

export function activate(context: ExtensionContext, forceActivation?: boolean) {
	return baseActivate({
		context,
		registerServices,
		contributions: vscodeWebContributions,
		forceActivation
	});
}
