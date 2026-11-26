/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../../../base/browser/dom.js';
import { getBaseLayerHoverDelegate } from '../../../../../../../base/browser/ui/hover/hoverDelegate2.js';
import { getDefaultHoverDelegate } from '../../../../../../../base/browser/ui/hover/hoverDelegateFactory.js';
import { onUnexpectedError } from '../../../../../../../base/common/errors.js';
import { Disposable } from '../../../../../../../base/common/lifecycle.js';
import { formatTokenCount } from '../../../../../../../base/common/numbers.js';
import { basename } from '../../../../../../../base/common/resources.js';
import { isDefined } from '../../../../../../../base/common/types.js';
import { URI } from '../../../../../../../base/common/uri.js';
import { localize } from '../../../../../../../nls.js';
import { IAgentModelRouterRoute } from '../../../../../../../platform/agentHost/common/meta/agentModelMeta.js';
import { ModelRouterSwitching } from '../../../../../../../platform/agentHost/common/modelRouter.js';
import { getReasoningEffortLabel } from '../../../../../../../platform/agentHost/common/reasoningEffort.js';
import { IInstantiationService } from '../../../../../../../platform/instantiation/common/instantiation.js';
import { ILabelService } from '../../../../../../../platform/label/common/label.js';
import { Link } from '../../../../../../../platform/opener/browser/link.js';
import { IEditorService } from '../../../../../../services/editor/common/editorService.js';
import { renderModelCardSection } from './modelPickerCard.js';

export interface IModelRouterDetailsOptions {
	/** The router's routes, in its file's order. Empty while the router has errors. */
	readonly routes: readonly IAgentModelRouterRoute[];
	/** Whether a chat can move to another route after its first message. Absent when there is nothing to switch between. */
	readonly switching?: ModelRouterSwitching;
	readonly definitionFile: URI;
	/** Called before the file opens, so the picker can close. */
	readonly onWillOpenDefinitionFile: () => void;
}

/**
 * What a model router adds to its details in the model picker, after what every model shows:
 * the routes it picks between, whether it switches between them, and a link to the file that
 * defines it.
 */
export class ModelRouterDetails extends Disposable {

	constructor(
		card: HTMLElement,
		{ routes, switching, definitionFile, onWillOpenDefinitionFile }: IModelRouterDetailsOptions,
		@IInstantiationService instantiationService: IInstantiationService,
		@ILabelService labelService: ILabelService,
		@IEditorService editorService: IEditorService,
	) {
		super();
		if (routes.length) {
			this._renderRoutes(card, routes);
		}
		if (switching) {
			this._renderSwitching(card, switching);
		}
		this._register(instantiationService.createInstance(Link, dom.append(card, dom.$('.chat-model-card-definition-file')), {
			label: basename(definitionFile),
			title: labelService.getUriLabel(definitionFile),
			href: definitionFile.toString(),
		}, {
			opener: () => {
				onWillOpenDefinitionFile();
				editorService.openEditor({ resource: definitionFile }).catch(onUnexpectedError);
			},
		}));
	}

	/**
	 * A row for each route, laid out as the card's pricing is: what the route is known by, then
	 * what it runs on. A chat starts on the first route when none clearly fits, so it is marked
	 * as the default when there is more than one.
	 */
	private _renderRoutes(card: HTMLElement, routes: readonly IAgentModelRouterRoute[]): void {
		const list = dom.append(renderModelCardSection(card, localize('chat.modelPicker.routes', "Routes")), dom.$('.chat-model-card-routes', { role: 'list' }));
		routes.forEach((route, index) => {
			const row = dom.append(list, dom.$('.chat-model-card-route', { role: 'listitem' }));
			const settings = getRouteSettingsLabel(route);
			let label: HTMLElement;
			if (route.name) {
				label = dom.append(row, dom.$('span.chat-model-card-route-name', undefined, route.name));
				const value = dom.append(row, dom.$('span.chat-model-card-route-value'));
				dom.append(value, dom.$('span.chat-model-card-route-model', undefined, route.model));
				if (settings) {
					dom.append(value, dom.$('span.chat-model-card-route-settings', undefined, settings));
				}
			} else {
				// A route without a name is known by its model.
				label = dom.append(row, dom.$('span.chat-model-card-route-model', undefined, route.model));
				if (settings) {
					dom.append(row, dom.$('span.chat-model-card-route-settings', undefined, settings));
				}
			}
			if (index === 0 && routes.length > 1) {
				label.textContent = localize({ key: 'chat.modelPicker.routeDefault', comment: ['{0} is the name of a route or of a model'] }, "{0} (default)", label.textContent);
				this._explain(label, localize('chat.modelPicker.routeDefaultHover', "Used when no route clearly fits."));
			}
		});
	}

	/**
	 * Whether a chat can move to another route, written as the card writes a model's context
	 * size: what it is, then one word for how it is set.
	 */
	private _renderSwitching(card: HTMLElement, switching: ModelRouterSwitching): void {
		const automatic = switching === 'auto';
		const section = renderModelCardSection(card, localize('chat.modelPicker.routeSwitching', "Route switching"), automatic
			? localize('chat.modelPicker.routeSwitchingAutomatic', "Automatic")
			: localize('chat.modelPicker.routeSwitchingOff', "Off"));
		this._explain(section, automatic
			? localize('chat.modelPicker.routeSwitchingAutomaticHover', "A chat moves to another route when the work clearly changes.")
			: localize('chat.modelPicker.routeSwitchingOffHover', "A chat keeps the route picked for its first message."));
	}

	/** Explains a piece of the card's text on hover, and to assistive technology, which has no hover. */
	private _explain(element: HTMLElement, explanation: string): void {
		element.setAttribute('aria-description', explanation);
		this._register(getBaseLayerHoverDelegate().setupManagedHover(getDefaultHoverDelegate('mouse'), element, explanation));
	}
}

/** The settings a router gives a route, such as "High · 1M", written as the picker's list writes a model's. */
export function getRouteSettingsLabel(route: IAgentModelRouterRoute): string | undefined {
	const effort = route.effort === 'auto'
		? localize('chat.modelPicker.routeEffortAuto', "Auto")
		: route.effort ? getReasoningEffortLabel(route.effort) : undefined;
	const parts = [effort, route.contextTokens ? formatTokenCount(route.contextTokens) : undefined].filter(isDefined);
	return parts.length ? parts.join(' \u00b7 ') : undefined;
}
