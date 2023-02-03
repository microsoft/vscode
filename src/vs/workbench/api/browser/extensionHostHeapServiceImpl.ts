/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IExtensionHostHeapService, Ident } from 'vs/workbench/api/browser/extensionHostHeapService';
import { Event, Emitter } from 'vs/base/common/event';


export class ExtensionHostHeapService implements IExtensionHostHeapService {

	declare readonly _serviceBrand: undefined;

	private readonly _registry: FinalizationRegistry<number>;

	private readonly _onDidFinalize = new Emitter<number>();
	onDidFinalize: Event<number> = this._onDidFinalize.event;

	constructor() {
		this._registry = new FinalizationRegistry(id => {
			this._onDidFinalize.fire(id);
		});
	}

	dispose(): void {
		this._onDidFinalize.dispose();
	}

	registerRecursive(obj: any): number {

		let res = 0;

		const stack = [obj];
		while (stack.length > 0) {

			// remove first element
			const obj = stack.shift();

			if (!obj || typeof obj !== 'object') {
				continue;
			}

			for (const key in obj) {
				if (!Object.prototype.hasOwnProperty.call(obj, key)) {
					continue;
				}

				const value = obj[key];
				// recurse -> object/array
				if (typeof value === 'object') {
					stack.push(value);

				} else if (key === Ident) {
					// track new $ident-objects
					res += this.registerObject(obj) ? 1 : 0;
				}
			}
		}

		return res;
	}

	registerObject<T extends { [Ident]: number }>(obj: T): boolean {
		const value = obj[Ident];
		if (typeof value === 'number') {
			this._registry.register(obj, value);
			return true;
		}
		return false;
	}
}
