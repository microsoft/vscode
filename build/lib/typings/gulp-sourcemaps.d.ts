/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type File from 'vinyl';
import 'gulp-sourcemaps';

declare module 'gulp-sourcemaps' {
	interface WriteOptions {
		sourceMappingURL?: (file: File) => string;
	}
}
