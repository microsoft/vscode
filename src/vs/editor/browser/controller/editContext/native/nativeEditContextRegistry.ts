/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IDisposable } from '../../../../../base/common/lifecycle.js';
import { NativeEditContext } from './nativeEditContext.js';

class NativeEditContextRegistryImpl {

	private _nativeEditContextMapping: Map<number, NativeEditContext> = new Map();

	register(owner: number, nativeEditContext: NativeEditContext): IDisposable {
		this._nativeEditContextMapping.set(owner, nativeEditContext);
		return {
			dispose: () => {
				this._nativeEditContextMapping.delete(owner);
			}
		};
	}

	get(owner: number): NativeEditContext | undefined {
		return this._nativeEditContextMapping.get(owner);
	}
}

export const NativeEditContextRegistry = new NativeEditContextRegistryImpl();
