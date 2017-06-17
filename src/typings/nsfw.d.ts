/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'nsfw' {
	interface NsfwFunction {
		(dir: string, ...args: any[]): any;
		actions: {
			CREATED: number;
			DELETED: number;
			MODIFIED: number;
			RENAMED: number;
		}
	}

	var nsfw: NsfwFunction;
	export = nsfw;
}
