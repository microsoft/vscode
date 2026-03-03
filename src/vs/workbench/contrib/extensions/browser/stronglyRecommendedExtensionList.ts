/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { $, addDisposableListener } from '../../../../base/browser/dom.js';
import { Checkbox } from '../../../../base/browser/ui/toggle/toggle.js';
import { Emitter } from '../../../../base/common/event.js';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { localize } from '../../../../nls.js';
import { ICustomDialogButtonControl } from '../../../../platform/dialogs/common/dialogs.js';
import { defaultCheckboxStyles } from '../../../../platform/theme/browser/defaultStyles.js';

export interface StronglyRecommendedExtensionEntry {
	readonly displayName: string;
	readonly publisherDisplayName: string;
	readonly version: string;
}

export interface StronglyRecommendedExtensionListResult<T> {
	readonly checkboxStates: ReadonlyMap<T, boolean>;
	readonly hasSelection: boolean;
	readonly doNotShowAgainUnlessMajorVersionChange: () => boolean;
	styleInstallButton(button: ICustomDialogButtonControl): void;
}

export function renderStronglyRecommendedExtensionList<T extends StronglyRecommendedExtensionEntry>(
	container: HTMLElement,
	disposables: DisposableStore,
	extensions: readonly T[],
): StronglyRecommendedExtensionListResult<T> {
	const checkboxStates = new Map<T, boolean>();
	const onSelectionChanged = disposables.add(new Emitter<void>());

	container.style.display = 'flex';
	container.style.flexDirection = 'column';
	container.style.gap = '8px';
	container.style.padding = '8px 0';

	const updateCheckbox = (ext: T, cb: Checkbox) => {
		checkboxStates.set(ext, cb.checked);
		onSelectionChanged.fire();
	};

	for (const ext of extensions) {
		checkboxStates.set(ext, true);

		const row = container.appendChild($('.strongly-recommended-extension-row'));
		row.style.display = 'flex';
		row.style.alignItems = 'center';
		row.style.gap = '8px';

		const cb = disposables.add(new Checkbox(ext.displayName, true, defaultCheckboxStyles));
		disposables.add(cb.onChange(() => updateCheckbox(ext, cb)));
		row.appendChild(cb.domNode);

		const label = row.appendChild($('span'));
		label.textContent = `${ext.displayName} v${ext.version} \u2014 ${ext.publisherDisplayName}`;
		label.style.cursor = 'pointer';
		disposables.add(addDisposableListener(label, 'click', () => {
			cb.checked = !cb.checked;
			updateCheckbox(ext, cb);
		}));
	}

	const separator = container.appendChild($('div'));
	separator.style.borderTop = '1px solid var(--vscode-widget-border)';
	separator.style.marginTop = '4px';
	separator.style.paddingTop = '4px';

	const doNotShowRow = container.appendChild($('.strongly-recommended-do-not-show-row'));
	doNotShowRow.style.display = 'flex';
	doNotShowRow.style.alignItems = 'center';
	doNotShowRow.style.gap = '8px';

	const doNotShowCb = disposables.add(new Checkbox(
		localize('doNotShowAgainUnlessMajorVersionChange', "Do not show again unless major version change"),
		false,
		defaultCheckboxStyles,
	));
	doNotShowRow.appendChild(doNotShowCb.domNode);

	const doNotShowLabel = doNotShowRow.appendChild($('span'));
	doNotShowLabel.textContent = localize('doNotShowAgainUnlessMajorVersionChange', "Do not show again unless major version change");
	doNotShowLabel.style.cursor = 'pointer';
	disposables.add(addDisposableListener(doNotShowLabel, 'click', () => { doNotShowCb.checked = !doNotShowCb.checked; }));

	const hasSelection = () => [...checkboxStates.values()].some(v => v);

	return {
		checkboxStates,
		get hasSelection() { return hasSelection(); },
		doNotShowAgainUnlessMajorVersionChange: () => doNotShowCb.checked,
		styleInstallButton(button: ICustomDialogButtonControl) {
			const updateEnabled = () => { button.enabled = hasSelection(); };
			disposables.add(onSelectionChanged.event(updateEnabled));
		},
	};
}
