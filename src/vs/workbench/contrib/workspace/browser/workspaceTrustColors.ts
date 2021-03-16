/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from 'vs/nls';
import { editorErrorForeground, registerColor } from 'vs/platform/theme/common/colorRegistry';
import { debugIconStartForeground } from 'vs/workbench/contrib/debug/browser/debugColors';

export const trustedForegroundColor = registerColor('workspaceTrust.trustedForergound', { dark: debugIconStartForeground, light: debugIconStartForeground, hc: debugIconStartForeground }, localize('workspaceTrustTrustedColor', 'Color used when indicating a workspace is trusted.'));
export const untrustedForegroundColor = registerColor('workspaceTrust.untrustedForeground', { dark: editorErrorForeground, light: editorErrorForeground, hc: editorErrorForeground }, localize('workspaceTrustUntrustedColor', 'Color used when indicating a workspace is not trusted.'));
