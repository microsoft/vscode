/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as path from 'path';
import { main, USAGE } from './lib/copilotDev.ts';

try {
	main(process.argv.slice(2), path.join(import.meta.dirname, '..'));
} catch (err) {
	console.error(err instanceof Error ? err.message : String(err));
	console.error(`\n${USAGE}`);
	process.exit(1);
}
