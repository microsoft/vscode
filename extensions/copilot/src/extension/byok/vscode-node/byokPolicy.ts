/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IAuthenticationService } from '../../../platform/authentication/common/authentication';
import { NotSignedUpError, SubscriptionExpiredError } from '../../../platform/authentication/vscode-node/copilotTokenManager';
import { isClientBYOKAllowed } from '../common/byokProvider';

export async function resolveClientBYOKAllowed(authService: IAuthenticationService): Promise<boolean> {
	if (!authService.hasCopilotTokenSource) {
		return true;
	}

	try {
		const copilotToken = await authService.getCopilotToken();
		return isClientBYOKAllowed(true, copilotToken);
	} catch (error) {
		return error instanceof NotSignedUpError || error instanceof SubscriptionExpiredError;
	}
}
