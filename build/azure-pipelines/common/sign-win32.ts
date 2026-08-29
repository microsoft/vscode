/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { main } from './sign.ts';
import path from 'path';

main([
	process.env['EsrpCliDllPath']!,
	'sign-windows',
	path.dirname(process.argv[2]),
	path.basename(process.argv[2])
]);
