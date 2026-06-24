/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export interface Disposable {
	/**
	 * Dispose this object.
	 */
	dispose(): void;
}

export namespace Disposable {
	export function create(func: () => void): Disposable {
		return {
			dispose: func
		};
	}
}
