/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2023-2025 Posit Software, PBC. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

import { execSync } from 'child_process';
import * as path from 'path';

// Build the kernel-bridge TypeScript project
const kernelBridgePath = path.join(__dirname, '..', 'src', 'kernel-bridge');
console.log(`Building kernel-bridge at ${kernelBridgePath}`);

execSync('npm run build', {
	cwd: kernelBridgePath,
	stdio: 'inherit'
});
