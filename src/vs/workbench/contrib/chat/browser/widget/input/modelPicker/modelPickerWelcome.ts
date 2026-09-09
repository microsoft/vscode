/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../../../base/browser/dom.js';
import { Button } from '../../../../../../../base/browser/ui/button/button.js';
import { DisposableStore } from '../../../../../../../base/common/lifecycle.js';
import { ThemeIcon } from '../../../../../../../base/common/themables.js';
import { defaultButtonStyles } from '../../../../../../../platform/theme/browser/defaultStyles.js';
import { getProviderIconForIdentity } from './modelProviderIcons.js';
import { IModelPickerDestination } from './modelPickerTabs.js';

/**
 * The body shown when a destination has no models: each waiting provider's icon
 * and name, why it is empty, and the action that fills it, e.g. signing in.
 */
export class ModelPickerWelcome extends DisposableStore {

	readonly element = dom.$('.chat-model-picker-welcome');

	constructor(destination: IModelPickerDestination) {
		super();
		for (const placeholder of destination.placeholders) {
			const icon = destination.placeholders.length === 1
				? destination.icon
				: getProviderIconForIdentity(`${placeholder.label} ${placeholder.vendor}`);
			const entry = dom.append(this.element, dom.$('.chat-model-picker-welcome-provider'));
			dom.append(entry, dom.$(`span.chat-model-picker-welcome-icon${ThemeIcon.asCSSSelector(icon)}`));
			dom.append(entry, dom.$('.chat-model-picker-welcome-title', undefined, placeholder.label));
			dom.append(entry, dom.$('.chat-model-picker-welcome-message', undefined, placeholder.message));
			if (placeholder.action) {
				const button = this.add(new Button(entry, { ...defaultButtonStyles, title: placeholder.action.label }));
				button.label = placeholder.action.label;
				this.add(button.onDidClick(() => placeholder.action?.run()));
			}
		}
	}
}
