/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { $, addDisposableListener } from '../../../../../base/browser/dom.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { localize } from '../../../../../nls.js';
import { ICommandService, CommandsRegistry } from '../../../../../platform/commands/common/commands.js';
import { IProductService } from '../../../../../platform/product/common/productService.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import { IChatEntitlementService } from '../../../../services/chat/common/chatEntitlementService.js';

import { OPEN_WORKSPACE_IN_AGENTS_WINDOW_COMMAND_ID } from '../../common/constants.js';


type AgentsBannerClickedEvent = {
	source: string;
	action: string;
};

type AgentsBannerClickedClassification = {
	source: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Where the banner was clicked from.' };
	action: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The action taken on the banner.' };
	owner: 'benibenj';
	comment: 'Tracks clicks on the agents app banner across welcome pages.';
};

export interface IAgentsBannerResult {
	readonly element: HTMLElement;
	readonly disposables: DisposableStore;
}

/**
 * Returns whether the agents banner can be shown.
 * The banner requires the open agents window command
 * to be registered (desktop builds only) and is limited to Insiders quality.
 * It is also hidden when AI features are disabled.
 */
export function canShowAgentsBanner(productService: IProductService, chatEntitlementService: IChatEntitlementService): boolean {
	const sentiment = chatEntitlementService.sentiment;
	if (sentiment.hidden || sentiment.disabled) {
		return false;
	}
	return productService.quality !== 'stable'
		&& !!CommandsRegistry.getCommand(OPEN_WORKSPACE_IN_AGENTS_WINDOW_COMMAND_ID);
}

export interface IAgentsBannerOptions {
	/** Dot-separated CSS classes for the banner container (e.g. 'my-banner' or 'foo.bar'). */
	readonly cssClass: string;
	/** Identifies where the banner is displayed (e.g. 'welcomePage', 'agentSessionsWelcome'). */
	readonly source: string;
	/** Override the default button label. */
	readonly label?: string;
	/** Optional callback invoked when the banner button is clicked. */
	readonly onButtonClick?: () => void;
}

/**
 * Creates a banner that promotes the Agents app.
 * The banner contains a button that opens the Agents window.
 */
export function createAgentsBanner(
	options: IAgentsBannerOptions,
	commandService: ICommandService,
	telemetryService: ITelemetryService,
): IAgentsBannerResult {
	const disposables = new DisposableStore();
	const label = options.label ?? localize('agentsBanner.tryAgentsAppLabel', "Try out the new Agents");

	const button = $('button.agents-banner-button', {
		title: label,
	},
		$('.codicon.codicon-agent.icon-widget'),
		$('span.category-title', {}, label),
	);
	disposables.add(addDisposableListener(button, 'click', () => {
		options.onButtonClick?.();
		telemetryService.publicLog2<AgentsBannerClickedEvent, AgentsBannerClickedClassification>('agentsBanner.clicked', { source: options.source, action: 'openAgentsWindow' });
		commandService.executeCommand(OPEN_WORKSPACE_IN_AGENTS_WINDOW_COMMAND_ID, { forceNewWindow: true });
	}));

	const element = $(`.${options.cssClass}`, {}, button);

	return { element, disposables };
}
