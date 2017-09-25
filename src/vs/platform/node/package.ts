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

const rootPath = path.dirname(uri.parse(require.toUrl('')).fsPath);
const packageJsonPath = path.join(rootPath, 'package.json');
export default require.__$__nodeRequire(packageJsonPath) as IPackageConfiguration;