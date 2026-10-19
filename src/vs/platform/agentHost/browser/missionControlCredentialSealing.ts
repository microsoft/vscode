/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { FileAccess } from '../../../base/common/network.js';
import type { IMissionControlCredentialSealingRequest } from '../common/agentService.js';
import { IMissionControlCredentialSealingCrypto, sealMissionControlCredential as sealCredential } from '../common/missionControlCredentialSealing.js';

let cryptoLibraries: Promise<IMissionControlCredentialSealingCrypto> | undefined;

function loadCrypto(): Promise<IMissionControlCredentialSealingCrypto> {
	cryptoLibraries ??= (async () => {
		const url = FileAccess.asBrowserUri('vs/platform/agentHost/browser/missionControlCryptoModule.js').toString(true);
		return import(/* webpackIgnore: true */ /* @vite-ignore */ `${url}`);
	})();
	return cryptoLibraries;
}

/** Seal locally using the same implementation as the host, without requiring a Node process. */
export function sealMissionControlCredential(request: IMissionControlCredentialSealingRequest): Promise<string> {
	return sealCredential(request, loadCrypto);
}
