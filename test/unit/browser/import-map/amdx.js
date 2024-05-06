/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export const root = new URL('../../../../', import.meta.url).toString()

export const importAmdModule = async (absolutePath) => {
	console.log({ absolutePath })
	await new Promise(() => { })
}
