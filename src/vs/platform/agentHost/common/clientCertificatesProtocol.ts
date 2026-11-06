/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { vArray, vObj, vString } from '../../../base/common/validation.js';

export const LoadClientCertificatesExtensionMethod = 'vscode/loadCertificates';
export const loadClientCertificatesResultValidator = vObj({ certificates: vArray(vString()) });

export interface IAgentHostClientCertificatesProvider {
	isEnabled(): boolean;
	loadCertificates(): Promise<readonly string[]>;
}
