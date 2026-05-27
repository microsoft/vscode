/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createServiceIdentifier } from '../../../util/common/services';

export const IBlockedExtensionService = createServiceIdentifier<IBlockedExtensionService>('IBlockedExtensionService');

export interface IBlockedExtensionService {
	readonly _serviceBrand: undefined;

	reportBlockedExtension(extensionId: string, timeout: number): void;
	isExtensionBlocked(extensionId: string): boolean;
}

export class BlockedExtensionService implements IBlockedExtensionService {
	readonly _serviceBrand: undefined;
	private blockedExtensions: Map<string, any> = new Map();

	reportBlockedExtension(extensionId: string, timeout: number): void {
		if (this.blockedExtensions.has(extensionId)) {
			clearTimeout(this.blockedExtensions.get(extensionId)!);
		}

		const timer = setTimeout(() => {
			this.blockedExtensions.delete(extensionId);
		}, timeout * 1000);
		this.blockedExtensions.set(extensionId, timer);
	}

	isExtensionBlocked(extensionId: string): boolean {
		return this.blockedExtensions.has(extensionId);
	}
}
