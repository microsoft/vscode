/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as path from 'path';
import uri from 'vs/base/common/uri';

export interface IPackageConfiguration {
	name: string;
	version: string;
}

let pkg: IPackageConfiguration;
try {
	const rootPath = path.dirname(uri.parse(require.toUrl('')).fsPath);
	const packageJsonPath = path.join(rootPath, 'package.json');
	pkg = require.__$__nodeRequire(packageJsonPath) as IPackageConfiguration;
} catch (error) {
	pkg = {
		name: 'code-oss-dev',
		version: '1.x.x'
	};
}

export default pkg;