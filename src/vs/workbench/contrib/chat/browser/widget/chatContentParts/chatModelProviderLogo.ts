/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { $ } from '../../../../../../base/browser/dom.js';
import { Disposable, IDisposable, toDisposable } from '../../../../../../base/common/lifecycle.js';
import { IObservable } from '../../../../../../base/common/observable.js';
import { ThemeIcon } from '../../../../../../base/common/themables.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { observableConfigValue } from '../../../../../../platform/observable/common/platformObservableUtils.js';
import { ChatConfiguration } from '../../../common/constants.js';
import './media/chatModelProviderLogo.css';

const logoClassName = 'chat-model-provider-logo';
const settings = new WeakMap<IConfigurationService, IObservable<boolean>>();

/** Whether chat shows the logo of a model's provider where it names the model. Shared, so many rows cost one listener. */
export function observeModelLogosEnabled(configurationService: IConfigurationService): IObservable<boolean> {
	let setting = settings.get(configurationService);
	if (!setting) {
		setting = observableConfigValue(ChatConfiguration.ModelLogos, false, configurationService);
		settings.set(configurationService, setting);
	}
	return setting;
}

/**
 * The logo of a model's provider, to put beside the model's name.
 * It is decorative: the name beside it already says which model it is.
 */
export function createModelProviderLogo(logo?: ThemeIcon): HTMLElement {
	const element = $(`span.${logoClassName}`);
	element.setAttribute('aria-hidden', 'true');
	setModelProviderLogo(element, logo);
	return element;
}

/** Changes the provider a logo element shows. Without a provider, the element takes no space. */
export function setModelProviderLogo(element: HTMLElement, logo: ThemeIcon | undefined): void {
	element.className = logoClassName;
	element.classList.add(...(logo ? ThemeIcon.asClassNameArray(logo) : ['hidden']));
}

/**
 * Leads the model's name with the logo of its provider where rendered text names the model.
 * The name stays on one line with its logo. Disposing restores the text.
 */
export function insertModelProviderLogoBeforeName(container: HTMLElement, modelName: string, logo: ThemeIcon): IDisposable {
	const texts = container.ownerDocument.createTreeWalker(container, NodeFilter.SHOW_TEXT);
	let match: { readonly node: Text; readonly offset: number } | undefined;
	for (let node = texts.nextNode(); node; node = texts.nextNode()) {
		// Rendered markdown may hold its spaces as non-breaking spaces.
		const offset = node.textContent?.replace(/\u00a0/g, ' ').lastIndexOf(modelName) ?? -1;
		if (offset >= 0) {
			match = { node: node as Text, offset };
		}
	}
	if (!match) {
		return Disposable.None;
	}
	const name = match.node.splitText(match.offset);
	name.splitText(modelName.length);
	const named = $('span.chat-model-provider-name');
	name.replaceWith(named);
	named.append(createModelProviderLogo(logo), name);
	return toDisposable(() => {
		named.replaceWith(name);
		name.parentNode?.normalize();
	});
}
