/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { generateUuid } from '../../../../base/common/uuid.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';

export const IRandomService = createDecorator<IRandomService>('randomService');

export interface IRandomService {
	readonly _serviceBrand: undefined;

	generateUuid(): string;
	generatePrefixedUuid(prefix: string): string;
}

export class RandomService implements IRandomService {
	readonly _serviceBrand: undefined;

	generateUuid(): string {
		return generateUuid();
	}

	/** Namespace should be 3 letter. */
	generatePrefixedUuid(namespace: string): string {
		return `${namespace}-${this.generateUuid()}`;
	}
}
