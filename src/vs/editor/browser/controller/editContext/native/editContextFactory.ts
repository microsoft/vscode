/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/


export namespace EditContext {

	/**
	 * Create an edit context.
	 */
	export function create(window: Window, options?: EditContextInit): EditContext {
		// eslint-disable-next-line local/code-no-any-casts
		return new (window as any).EditContext(options);
	}
}
