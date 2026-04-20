/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IExtensionContributionFactory } from '../../common/contributions';
import vscodeContributions from '../vscode/contributions';

// ###################################################################################################
// ###                                                                                             ###
// ###                  Web contributions run ONLY in web worker extension host.                   ###
// ###                                                                                             ###
// ### !!! Prefer to list contributions in ../vscode/contributions.ts to support them anywhere !!! ###
// ###                                                                                             ###
// ###################################################################################################

export const vscodeWebContributions: IExtensionContributionFactory[] = [
	...vscodeContributions,
];
