/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { promises as fs } from 'fs';
import { FileAccess } from '../../../base/common/network.js';
import { join } from '../../../base/common/path.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../base/test/common/utils.js';

suite('Sessions - Entry point service registrations', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('sessions.common.main.ts imports the services that chat windows depend on', async () => {
		const sourcePath = join(FileAccess.asFileUri('').fsPath, '..', 'src', 'vs', 'sessions');
		const entryPoint = await fs.readFile(join(sourcePath, 'sessions.common.main.ts'), 'utf8');
		const registrations: { readonly file: string; readonly service: string }[] = [
			{ file: './services/layoutMode/browser/sessionLayoutModeService.js', service: 'ISessionLayoutModeService' },
		];
		for (const { file, service } of registrations) {
			const source = await fs.readFile(join(sourcePath, file.replace(/\.js$/, '.ts')), 'utf8');
			assert.ok(source.includes(`registerSingleton(${service},`), `${file} must register ${service}`);
			assert.ok(entryPoint.includes(`import '${file}';`), `sessions.common.main.ts must import ${file} to register ${service}`);
		}
	});
});
