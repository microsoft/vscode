/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IDisposable } from 'vs/base/common/lifecycle';
import { Registry } from 'vs/platform/registry/common/platform';
import { IWorkspaceFolder } from 'vs/platform/workspace/common/workspace';

export interface IEditSessionContribution {
	store(workspaceFolder: IWorkspaceFolder, result: { push(value: unknown): void }): void;
	resume(workspaceFolder: IWorkspaceFolder, value: unknown): void;
}

class EditSessionPayloadRegistryImpl {
	private _registeredEditSessionContributions: Map<string, IEditSessionContribution> = new Map();

	public registerEditSessionsContribution(contributionPoint: string, editSessionsContribution: IEditSessionContribution): IDisposable {
		if (this._registeredEditSessionContributions.has(contributionPoint)) {
			throw new Error(`Edit session contribution point with identifier ${contributionPoint} already exists`);
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

Registry.add('editSessionPayloadRegistry', new EditSessionPayloadRegistryImpl());
export const EditSessionRegistry: EditSessionPayloadRegistryImpl = Registry.as('editSessionPayloadRegistry');
