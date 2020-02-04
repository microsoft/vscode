/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ISCMResource, ISCMRepository, ISCMResourceGroup } from 'vs/workbench/contrib/scm/common/scm';
import { IMenu } from 'vs/platform/actions/common/actions';
import { ActionBar } from 'vs/base/browser/ui/actionbar/actionbar';
import { IDisposable, Disposable, combinedDisposable, toDisposable } from 'vs/base/common/lifecycle';
import { IAction } from 'vs/base/common/actions';
import { createAndFillInActionBarActions } from 'vs/platform/actions/browser/menuEntryActionViewItem';
import { equals } from 'vs/base/common/arrays';

export function isSCMRepository(element: any): element is ISCMRepository {
	return !!(element as ISCMRepository).provider && typeof (element as ISCMRepository).setSelected === 'function';
}

export function isSCMResourceGroup(element: any): element is ISCMResourceGroup {
	return !!(element as ISCMResourceGroup).provider && !!(element as ISCMResourceGroup).elements;
}

export function isSCMResource(element: any): element is ISCMResource {
	return !!(element as ISCMResource).sourceUri && isSCMResourceGroup((element as ISCMResource).resourceGroup);
}

export function connectPrimaryMenuToInlineActionBar(menu: IMenu, actionBar: ActionBar): IDisposable {
	let cachedDisposable: IDisposable = Disposable.None;
	let cachedPrimary: IAction[] = [];

	const updateActions = () => {
		const primary: IAction[] = [];
		const secondary: IAction[] = [];

		const disposable = createAndFillInActionBarActions(menu, { shouldForwardArgs: true }, { primary, secondary }, g => /^inline/.test(g));

		if (equals(cachedPrimary, primary, (a, b) => a.id === b.id)) {
			disposable.dispose();
			return;
		}

		cachedDisposable = disposable;
		cachedPrimary = primary;

		actionBar.clear();
		actionBar.push(primary, { icon: true, label: false });
	};

	updateActions();

	return combinedDisposable(menu.onDidChange(updateActions), toDisposable(() => {
		cachedDisposable.dispose();
	}));
}
