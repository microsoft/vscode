/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { $, addDisposableListener } from '../../../../base/browser/dom.js';
import { Checkbox } from '../../../../base/browser/ui/toggle/toggle.js';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { defaultCheckboxStyles } from '../../../../platform/theme/browser/defaultStyles.js';

export interface StronglyRecommendedExtensionEntry {
	readonly displayName: string;
	readonly publisherDisplayName: string;
}

export function renderStronglyRecommendedExtensionList<T extends StronglyRecommendedExtensionEntry>(
	container: HTMLElement,
	disposables: DisposableStore,
	extensions: readonly T[],
): Map<T, boolean> {
	const checkboxStates = new Map<T, boolean>();

	container.style.display = 'flex';
	container.style.flexDirection = 'column';
	container.style.gap = '8px';
	container.style.padding = '8px 0';

	for (const ext of extensions) {
		checkboxStates.set(ext, true);

		const row = container.appendChild($('.strongly-recommended-extension-row'));
		row.style.display = 'flex';
		row.style.alignItems = 'center';
		row.style.gap = '8px';

		const cb = disposables.add(new Checkbox(ext.displayName, true, defaultCheckboxStyles));
		disposables.add(cb.onChange(() => checkboxStates.set(ext, cb.checked)));
		row.appendChild(cb.domNode);

		const label = row.appendChild($('span'));
		label.textContent = `${ext.displayName} \u2014 ${ext.publisherDisplayName}`;
		label.style.cursor = 'pointer';
		disposables.add(addDisposableListener(label, 'click', () => { cb.checked = !cb.checked; }));
	}

	return checkboxStates;
}
