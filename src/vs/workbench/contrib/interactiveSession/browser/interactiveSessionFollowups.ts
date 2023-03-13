/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from 'vs/base/common/lifecycle';
import * as dom from 'vs/base/browser/dom';
import { IInteractiveSessionFollowup } from 'vs/workbench/contrib/interactiveSession/common/interactiveSessionService';
import { Button } from 'vs/base/browser/ui/button/button';

const $ = dom.$;

export class InteractiveSessionFollowups<T extends IInteractiveSessionFollowup> extends Disposable {
	constructor(
		container: HTMLElement,
		followups: T[],
		private readonly clickHandler: (followup: T) => void,
	) {
		super();

		const followupsContainer = dom.append(container, $('.interactive-session-followups'));
		followups.forEach(followup => this.renderFollowup(followupsContainer, followup));
	}

	private renderFollowup(container: HTMLElement, followup: T): void {
		const button = this._register(new Button(container, { supportIcons: typeof followup !== 'string' }));
		const label = followup.kind === 'reply' ?
			'$(wand) ' + (followup.title || followup.message) :
			followup.title;
		button.label = label;

		this._register(button.onDidClick(() => this.clickHandler(followup)));
	}
}
