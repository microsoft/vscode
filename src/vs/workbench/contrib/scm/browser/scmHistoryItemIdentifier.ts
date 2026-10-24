/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { $, append, addDisposableListener, EventType } from '../../../../base/browser/dom.js';
import { IDisposable } from '../../../../base/common/lifecycle.js';
import { asCssVariableWithDefault } from '../../../../platform/theme/common/colorUtils.js';
import { ISCMHistoryItem } from '../common/history.js';

export const SCMHistoryItemIdentifierSetting = 'scm.graph.experimental.showIdentifiers';

export function renderSCMHistoryItemIdentifier(historyItem: ISCMHistoryItem, enabled: boolean): HTMLElement | undefined {
	if (!enabled || !historyItem.identifier?.some(part => part.text.length > 0)) {
		return undefined;
	}

	const element = $('span.history-item-identifier');
	for (const part of historyItem.identifier) {
		const span = append(element, $('span'));
		span.textContent = part.text;
		if (part.color) {
			span.style.color = asCssVariableWithDefault(part.color.id, 'inherit');
		}
	}
	return element;
}

/** Keep the row hover from replacing the identifier hover on bubbling mouse events. */
export function isolateSCMHistoryItemIdentifierHover(element: HTMLElement): IDisposable {
	return addDisposableListener(element, EventType.MOUSE_OVER, event => event.stopPropagation());
}
