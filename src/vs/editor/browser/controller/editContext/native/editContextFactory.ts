/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/


export namespace EditContext {

	/**
	 * Checks if the EditContext is supported in the given window.
	 */
	export function supported(obj: any & Window): boolean {
		return typeof obj?.EditContext === 'function';
	}

	/**
	 * Create an edit context. Check that the EditContext is supported using the method {@link EditContext.supported}
	 */
	export function create(window: Window, options?: EditContextInit): EditContext {
		return new (window as any).EditContext(options);
	}
}
