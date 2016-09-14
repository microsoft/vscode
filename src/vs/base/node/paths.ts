/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import uri from 'vs/base/common/uri';

interface IPaths {
	getAppDataPath(platform: string): string;
	getDefaultUserDataPath(platform: string): string;
}

const pathsPath = uri.parse(require.toUrl('paths')).fsPath;
const paths = require.__$__nodeRequire<IPaths>(pathsPath);
export const getAppDataPath = paths.getAppDataPath;
export const getDefaultUserDataPath = paths.getDefaultUserDataPath;