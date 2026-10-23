/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { vArray, vObj, vString } from '../../../base/common/validation.js';

export const SetClientCertificatesExtensionMethod = 'vscode/setClientCertificates';
export const setClientCertificatesParamsValidator = vObj({ certificates: vArray(vString()) });
