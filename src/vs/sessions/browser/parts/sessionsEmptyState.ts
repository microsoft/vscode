/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/sessionsEmptyState.css';
import * as dom from '../../../base/browser/dom.js';

/**
 * Appends the shared title and description treatment for Agents Window empty states.
 */
export function renderSessionsEmptyState(parent: HTMLElement, title: string, description: string): HTMLElement {
	const container = dom.append(parent, dom.$('.sessions-empty-state'));

	const titleElement = dom.append(container, dom.$('h2.sessions-empty-state-title'));
	titleElement.textContent = title;

	const descriptionElement = dom.append(container, dom.$('.sessions-empty-state-description'));
	descriptionElement.textContent = description;

	return container;
}
