/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'gulp-untar' {
	import type { Transform } from 'stream';

	function untar(): Transform;

	export = untar;
}
