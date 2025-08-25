/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2025 Lotas Inc. All rights reserved.
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
