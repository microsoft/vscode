/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { $, append } from '../../../../base/browser/dom.js';
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
