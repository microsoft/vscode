/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fs from 'fs';
import { isLinux } from 'vs/base/common/platform';
import { SymlinkSupport } from 'vs/base/node/pfs';
import { LinuxDistro } from 'vs/workbench/contrib/terminal/common/terminal';

let detectedDistro = LinuxDistro.Unknown;
if (isLinux) {
	const file = '/etc/os-release';
	SymlinkSupport.existsFile(file).then(async exists => {
		if (!exists) {
			return;
		}
		const buffer = await fs.promises.readFile(file);
		const contents = buffer.toString();
		if (/NAME="?Fedora"?/.test(contents)) {
			detectedDistro = LinuxDistro.Fedora;
		} else if (/NAME="?Ubuntu"?/.test(contents)) {
			detectedDistro = LinuxDistro.Ubuntu;
		}
	});
}

export const linuxDistro = detectedDistro;
