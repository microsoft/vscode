/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../base/common/uri.js';
import { createDecorator } from '../../../platform/instantiation/common/instantiation.js';

export const IExtHostUriHandlerCsrfSecret = createDecorator<IExtHostUriHandlerCsrfSecret>('IExtHostUriHandlerCsrfSecret');

export interface IExtHostUriHandlerCsrfSecret {
	readonly _serviceBrand: undefined;

	/**
	 * Return the secret bytes for the given file. When `create` is true (default), the file is created
	 * atomically with owner-only (`0600`) permissions and high-entropy random contents if absent. When
	 * `create` is false, an absent file yields `undefined` (used by the pre-activation check so a host
	 * that does not own the extension never creates a spurious secret).
	 *
	 * Returns `undefined` when the secret cannot be safely obtained — absent (with `create: false`),
	 * group/other-writable, or no local filesystem (web). Callers fail closed on `undefined`.
	 */
	getSecret(secretFile: URI, create?: boolean): Promise<Uint8Array | undefined>;
}

/**
 * Fail-closed implementation for environments with no trustworthy local filesystem (web worker
 * extension host). There is no local secret a remote page cannot also reach, so a CSRF-protected
 * handler can never be satisfied here — every link is rejected.
 */
export class NullExtHostUriHandlerCsrfSecret implements IExtHostUriHandlerCsrfSecret {
	declare readonly _serviceBrand: undefined;

	async getSecret(_secretFile: URI, _create?: boolean): Promise<Uint8Array | undefined> {
		return undefined;
	}
}
