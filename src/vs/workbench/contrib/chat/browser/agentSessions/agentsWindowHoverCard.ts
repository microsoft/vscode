/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/agentsWindowHoverCard.css';
import { $ } from '../../../../../base/browser/dom.js';
import { Button } from '../../../../../base/browser/ui/button/button.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { localize } from '../../../../../nls.js';
import { defaultButtonStyles } from '../../../../../platform/theme/browser/defaultStyles.js';
import { AgentsWindowGraphicDesign, renderAgentsWindowGraphic } from './agentsWindowGraphic.js';

export interface IAgentsWindowHoverCardOptions {
	readonly design: AgentsWindowGraphicDesign;
	/** Opens the Agents window from the card's button. */
	readonly onOpen: () => void;
}

let hoverCardCount = 0;

/**
 * A hover card that explains what the Agents window is for: a compact graphic above
 * a title, a description and a button that opens the Agents window.
 */
export class AgentsWindowHoverCard extends Disposable {

	readonly element: HTMLElement;
	readonly design: AgentsWindowGraphicDesign;

	constructor(options: IAgentsWindowHoverCardOptions) {
		super();
		this.design = options.design;
		const id = `agents-window-hover-card-${++hoverCardCount}`;
		const title = $('.agents-window-hover-card-title', { id: `${id}-title` }, localize('agentsWindowHoverCard.title', "All your agents, across all your projects, in one window"));
		const description = $('.agents-window-hover-card-description', { id: `${id}-description` }, localize('agentsWindowHoverCard.description', "Run several agents at the same time, each on its own task, and review their changes when they're done."));
		const actions = $('.agents-window-hover-card-actions');

		this.element = $('.agents-window-hover-card', {
			role: 'group',
			'aria-labelledby': title.id,
			'aria-describedby': description.id,
		},
			renderAgentsWindowGraphic(options.design, { compact: true }),
			$('.agents-window-hover-card-text', {}, title, description),
			actions,
		);

		const button = this._register(new Button(actions, defaultButtonStyles));
		button.label = localize('agentsWindowHoverCard.open', "Open Agents Window");
		this._register(button.onDidClick(() => options.onOpen()));
	}
}
