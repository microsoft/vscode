/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IDisposable } from 'vs/base/common/lifecycle';
import { URI } from 'vs/base/common/uri';
import { Registry } from 'vs/platform/registry/common/platform';

export interface IEditSessionContribution {
	/**
	 * Called as part of storing an edit session.
	 * @returns An opaque object representing state that this contribution
	 * knows how to restore. Stored state will be passed back to this
	 * contribution when an edit session is resumed via {@link resumeState}.
	 */
	getStateToStore(): unknown;

	/**
	 *
	 * Called as part of resuming an edit session.
	 * @param state State that this contribution has previously provided in
	 * {@link getStateToStore}.
	 * @param uriResolver A handler capable of converting URIs which may have
	 * originated on another filesystem to URIs which exist in the current
	 * workspace. If no conversion is possible, e.g. because the specified
	 * URI bears no relation to the current workspace, this returns the original
	 * URI that was passed in.
	 */
	resumeState(state: unknown, uriResolver: (uri: URI) => URI): void;
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
