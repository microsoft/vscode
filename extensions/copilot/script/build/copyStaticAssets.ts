/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as path from 'path';
import * as fs from 'fs';

const REPO_ROOT = path.join(__dirname, '..', '..');

export async function copyStaticAssets(srcpaths: string[], dst: string): Promise<void> {
	await Promise.all(srcpaths.map(async srcpath => {
		const src = path.join(REPO_ROOT, srcpath);
		const dest = path.join(REPO_ROOT, dst, path.basename(srcpath));
		await fs.promises.mkdir(path.dirname(dest), { recursive: true });
		await fs.promises.copyFile(src, dest);
	}));
}
