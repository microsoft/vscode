/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'gulp-gunzip' {
	import type { Transform } from 'stream';

	/**
	 * Gunzip plugin for gulp
	 */
	function gunzip(): Transform;

	export = gunzip;
}
