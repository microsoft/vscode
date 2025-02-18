/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { exec } from 'child_process';
import { promisify } from 'util';
import { writeFile } from 'fs/promises';

const execAsync = promisify(exec);

const main = async () => {
	try {
		const { stdout } = await execAsync('man zshbuiltins');
		const data = { output: stdout };
		await writeFile('zshbuiltins.json', JSON.stringify(data, null, 2), 'utf8');
		console.log('zshbuiltins.json saved.');
	} catch (error) {
		console.error('Error:', error);
	}
};

main();
