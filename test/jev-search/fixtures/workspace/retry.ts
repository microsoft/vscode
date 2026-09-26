/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export async function retryRequest<T>(request: () => Promise<T>, attempts: number): Promise<T> {
	if (!Number.isInteger(attempts) || attempts < 1) {
		throw new Error('At least one attempt is required.');
	}
	for (let attempt = 0; ; attempt++) {
		try {
			return await request();
		} catch (error) {
			if (attempt + 1 === attempts) {
				throw error;
			}
		}
	}
}
