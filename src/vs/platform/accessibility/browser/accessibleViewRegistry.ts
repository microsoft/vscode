/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IDisposable } from 'vs/base/common/lifecycle';
import { AccessibleViewType, AdvancedContentProvider, ExtensionContentProvider } from 'vs/platform/accessibility/browser/accessibleView';
import { ContextKeyExpression } from 'vs/platform/contextkey/common/contextkey';
import { ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { alert } from 'vs/base/browser/ui/aria/aria';

export interface IAccessibleViewImplentation extends IDisposable {
	type: AccessibleViewType;
	priority: number;
	name: string;
	/**
	 * @returns the provider or undefined if the view should not be shown
	 */
	getProvider: (accessor: ServicesAccessor) => AdvancedContentProvider | ExtensionContentProvider | undefined;
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
				implementation.dispose();
			}
		};
	}

	getImplementations(): IAccessibleViewImplentation[] {
		return this._implementations;
	}
};

export function alertAccessibleViewFocusChange(index: number | undefined, length: number | undefined, type: 'next' | 'previous'): void {
	if (index === undefined || length === undefined) {
		return;
	}
	const number = index + 1;

	if (type === 'next' && number + 1 <= length) {
		alert(`Focused ${number + 1} of ${length}`);
	} else if (type === 'previous' && number - 1 > 0) {
		alert(`Focused ${number - 1} of ${length}`);
	}
	return;
}
