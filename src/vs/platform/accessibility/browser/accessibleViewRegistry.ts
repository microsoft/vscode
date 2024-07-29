/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IDisposable } from 'vs/base/common/lifecycle';
import { AccessibleViewType, AccessibleContentProvider, ExtensionContentProvider } from 'vs/platform/accessibility/browser/accessibleView';
import { ContextKeyExpression } from 'vs/platform/contextkey/common/contextkey';
import { ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';

export interface IAccessibleViewImplentation {
	type: AccessibleViewType;
	priority: number;
	name: string;
	/**
	 * @returns the provider or undefined if the view should not be shown
	 */
	getProvider: (accessor: ServicesAccessor) => AccessibleContentProvider | ExtensionContentProvider | undefined;
	when?: ContextKeyExpression | undefined;
}

export const AccessibleViewRegistry = new class AccessibleViewRegistry {
	_implementations: IAccessibleViewImplentation[] = [];

	register(implementation: IAccessibleViewImplentation): IDisposable {
		this._implementations.push(implementation);
		return {
			dispose: () => {
				const idx = this._implementations.indexOf(implementation);
				if (idx !== -1) {
					this._implementations.splice(idx, 1);
				}
			}
		};
	}

	getImplementations(): IAccessibleViewImplentation[] {
		return this._implementations;
	}
};

