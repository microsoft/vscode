/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { importAmdModule, root } from './amdx.js'

const module = await importAmdModule(
	`${root}/node_modules/@vscode/iconv-lite-umd/lib/iconv-lite-umd.js`,
)

export default module
