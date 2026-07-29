/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as crypto from 'crypto';

export function computeSHA256(str: string): string {
	const hash = crypto.createHash('sha256');
	hash.update(str);
	return hash.digest('hex');
}
