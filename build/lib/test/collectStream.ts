/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export function collectStream<T>(stream: NodeJS.ReadableStream): Promise<T[]> {
	return new Promise((resolve, reject) => {
		const items: T[] = [];
		stream.on('error', reject);
		stream.on('data', item => items.push(item));
		stream.on('end', () => resolve(items));
	});
}
