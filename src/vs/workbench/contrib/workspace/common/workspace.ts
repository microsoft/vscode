/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../nls.js';
import { RawContextKey } from '../../../../platform/contextkey/common/contextkey.js';

/**
 * Trust Context Keys
 */

export const WorkspaceTrustContext = {
	IsEnabled: new RawContextKey<boolean>('isWorkspaceTrustEnabled', false, localize('workspaceTrustEnabledCtx', "Whether the workspace trust feature is enabled.")),
	IsTrusted: new RawContextKey<boolean>('isWorkspaceTrusted', false, localize('workspaceTrustedCtx', "Whether the current workspace has been trusted by the user."))
};

export const MANAGE_TRUST_COMMAND_ID = 'workbench.trust.manage';
