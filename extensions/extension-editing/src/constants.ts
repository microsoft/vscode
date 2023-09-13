/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { l10n } from 'vscode';

export const implicitActivationEvent = l10n.t("This activation event cannot be explicitly listed by your extension.");
export const redundantImplicitActivationEvent = l10n.t("This activation event can be removed as VS Code generates these automatically from your package.json contribution declarations.");
