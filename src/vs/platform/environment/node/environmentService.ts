/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import * as paths from 'vs/base/node/paths';
import product from 'vs/platform/product';
import pkg from 'vs/platform/package';
import * as os from 'os';
import * as path from 'path';
import { parseArgs } from 'vs/code/node/argv';

export class EnvironmentService implements IEnvironmentService {

	serviceId = IEnvironmentService;

	private _userDataPath: string;
	get userDataPath(): string { return this._userDataPath; }

	private _extensionsPath: string;
	get extensionsPath(): string { return this._extensionsPath; }

	constructor() {
		const argv = parseArgs(process.argv);

		this._userDataPath = paths.getUserDataPath(process.platform, pkg.name, process.argv);

		const userHome = path.join(os.homedir(), product.dataFolderName);
		this._extensionsPath = argv.extensionHomePath || path.join(userHome, 'extensions');
		this._extensionsPath = path.normalize(this._extensionsPath);
	}
}