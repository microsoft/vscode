/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IDisposable } from 'vs/base/common/lifecycle';
import { URI } from 'vs/base/common/uri';
import { Registry } from 'vs/platform/registry/common/platform';

export interface IEditSessionContribution {
	getStateToStore(): unknown;
	resumeState(state: unknown, uriResolver: (uri: URI) => URI | undefined): void;
}

class EditSessionStateRegistryImpl {
	private _registeredEditSessionContributions: Map<string, IEditSessionContribution> = new Map();

	public registerEditSessionsContribution(contributionPoint: string, editSessionsContribution: IEditSessionContribution): IDisposable {
		if (this._registeredEditSessionContributions.has(contributionPoint)) {
			console.warn(`Edit session contribution point with identifier ${contributionPoint} already exists`);
			return { dispose: () => { } };
		}

		this._registeredEditSessionContributions.set(contributionPoint, editSessionsContribution);
		return {
			dispose: () => {
				this._registeredEditSessionContributions.delete(contributionPoint);
			}
		};
	}

	public getEditSessionContributions(): [string, IEditSessionContribution][] {
		return Array.from(this._registeredEditSessionContributions.entries());
	}
}

Registry.add('editSessionStateRegistry', new EditSessionStateRegistryImpl());
export const EditSessionRegistry: EditSessionStateRegistryImpl = Registry.as('editSessionStateRegistry');
