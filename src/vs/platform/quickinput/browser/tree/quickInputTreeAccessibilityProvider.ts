/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AriaRole } from '../../../../base/browser/ui/aria/aria.js';
import { CheckBoxAccessibleState } from '../../../../base/browser/ui/list/listView.js';
import { IListAccessibilityProvider } from '../../../../base/browser/ui/list/listWidget.js';
import { Event, IValueWithChangeEvent } from '../../../../base/common/event.js';
import { getCodiconAriaLabel } from '../../../../base/common/iconLabels.js';
import { localize } from '../../../../nls.js';
import { IQuickTreeCheckboxEvent, IQuickTreeItem } from '../../common/quickInput.js';
/**
 * Accessibility provider for QuickTree.
 */
export class QuickTreeAccessibilityProvider<T extends IQuickTreeItem> implements IListAccessibilityProvider<T> {
	constructor(private readonly onCheckedEvent: Event<IQuickTreeCheckboxEvent<T>>) { }

	getWidgetAriaLabel(): string {
		return localize('quickTree', "Quick Tree");
	}

	getAriaLabel(element: T): string {
		return element.ariaLabel || [element.label, element.description]
			.map(s => getCodiconAriaLabel(s))
			.filter(s => !!s)
			.join(', ');
	}

	getWidgetRole(): AriaRole {
		return 'tree';
	}

	getRole(_element: T): AriaRole {
		return 'checkbox';
	}

	isChecked(element: T): IValueWithChangeEvent<CheckBoxAccessibleState> | undefined {
		return {
			get value() { return element.checked === 'mixed' ? 'mixed' : !!element.checked; },
			onDidChange: e => Event.filter(this.onCheckedEvent, e => e.item === element)(_ => e()),
		};
	}
}
