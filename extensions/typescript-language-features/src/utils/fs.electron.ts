/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fs from 'fs';
import { getTempFile } from './temp.electron';

export const onCaseInsensitiveFileSystem = (() => {
	let value: boolean | undefined;
	return (): boolean => {
		if (typeof value === 'undefined') {
			if (process.platform === 'win32') {
				value = true;
			} else if (process.platform !== 'darwin') {
				value = false;
			} else {
				const temp = getTempFile('typescript-case-check');
				// eslint-disable-next-line local/code-no-sync-fs -- The cached boolean controls path comparisons; returning before the probe file exists would cache an incorrect filesystem case-sensitivity result.
				fs.writeFileSync(temp, '');
				// eslint-disable-next-line local/code-no-sync-fs -- The cached boolean controls path comparisons; async probing requires delaying consumers rather than returning an unverified default.
				value = fs.existsSync(temp.toUpperCase());
			}
		}
		return value;
	};
})();
