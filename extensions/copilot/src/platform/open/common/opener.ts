/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createServiceIdentifier } from '../../../util/common/services';

export const IUrlOpener = createServiceIdentifier<IUrlOpener>('IUrlOpener');

/**
 * Encapsulates all the functionality related opening urls in a browser.
 */
export interface IUrlOpener {
	readonly _serviceBrand: undefined;
	open(target: string): void;
}

export class NullUrlOpener implements IUrlOpener {

	declare readonly _serviceBrand: undefined;

	public readonly openedUrls: string[] = [];

	open(target: string): void {
		this.openedUrls.push(target);
	}
}
