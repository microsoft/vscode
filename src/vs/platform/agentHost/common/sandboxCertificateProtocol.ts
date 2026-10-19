/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { vObj, vString } from '../../../base/common/validation.js';

export const InstallSandboxCertificateExtensionMethod = 'vscode/installSandboxCertificate';
export const RotateSandboxCertificateExtensionMethod = 'vscode/rotateSandboxCertificate';
export const RemoveSandboxCertificateExtensionMethod = 'vscode/removeSandboxCertificate';
export const sandboxCertificateParamsValidator = vObj({ chat: vString(), scopeId: vString() });
