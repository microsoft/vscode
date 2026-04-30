/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, MutableDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../../workbench/common/contributions.js';
import { IWorkbenchLayoutService } from '../../../../workbench/services/layout/browser/layoutService.js';
import { FishingScene } from './fishingScene.js';

/** Selector for the new-session chat input container. The scene is inserted as
 *  its first child so the boat sits visually above the input box. */
const INPUT_SELECTOR = '.new-chat-input-container';

/**
 * Sessions Fishing easter-egg contribution.
 *
 * Mounts a fishing scene directly above the new-session chat input box —
 * in the same DOM layer as the input itself, not as an overlay. The scene
 * appears automatically whenever the new-session view is rendered (the input
 * container's own `display: none` cascade hides it on other views).
 *
 * The scene mounts once per `.new-chat-input-container` instance. Subtree
 * mutations from the chat widget itself are ignored — we only re-mount when
 * the input container is actually replaced.
 */
class SessionsFishingContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.sessionsFishing';

	private readonly mountRef = this._register(new MutableDisposable());
	private currentInput: HTMLElement | null = null;

	constructor(
		@IWorkbenchLayoutService private readonly layoutService: IWorkbenchLayoutService,
	) {
		super();

		const observer = new MutationObserver(() => this.sync());
		// childList only on the root — we don't need to react to every keystroke
		// or focus change inside the chat input. The input container is added /
		// removed at the workbench level, not deep inside it.
		observer.observe(this.layoutService.mainContainer, { childList: true, subtree: true });
		this._register(toDisposable(() => observer.disconnect()));

		this.sync();
	}

	private sync(): void {
		// eslint-disable-next-line no-restricted-syntax
		const input = this.layoutService.mainContainer.querySelector(INPUT_SELECTOR) as HTMLElement | null;

		// Same input element — keep the existing scene; do not re-mount or
		// reset its state. This is critical: the chat widget mutates its own
		// subtree constantly (focus, suggest widget, etc.) and we'd otherwise
		// blow away the user's interaction state on every keystroke.
		if (input === this.currentInput) {
			return;
		}

		this.mountRef.clear();
		this.currentInput = input;

		if (!input) {
			return;
		}

		const host = document.createElement('div');
		host.className = 'fishing-scene-host';
		input.insertBefore(host, input.firstChild);

		const scene = new FishingScene(host);
		this.mountRef.value = toDisposable(() => {
			scene.dispose();
			host.remove();
		});
	}
}

registerWorkbenchContribution2(SessionsFishingContribution.ID, SessionsFishingContribution, WorkbenchPhase.Eventually);
