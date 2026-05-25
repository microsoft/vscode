/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/agentHostToolbar.css';
import * as DOM from '../../../../base/browser/dom.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { HiddenItemStrategy, MenuWorkbenchToolBar } from '../../../../platform/actions/browser/toolbar.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { Menus } from '../../../browser/menus.js';

const $ = DOM.$;

export interface IAgentHostShortcutsWidgetOptions {
	readonly onDidChangeLayout?: () => void;
}

/**
 * Sidebar toolbar that hosts the agent host picker (with embedded
 * connect/disconnect indicator) on web desktop. Always expanded — there is
 * no collapse affordance, unlike `AICustomizationShortcutsWidget`.
 *
 * Mounted only when `isWeb && !isPhoneLayout` (electron desktop has no host
 * picker today, and phone layout uses the mobile titlebar pill instead).
 */
export class AgentHostShortcutsWidget extends Disposable {

	constructor(
		container: HTMLElement,
		options: IAgentHostShortcutsWidgetOptions | undefined,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
	) {
		super();

		this._render(container, options);
	}

	private _render(parent: HTMLElement, options: IAgentHostShortcutsWidgetOptions | undefined): void {
		const container = DOM.append(parent, $('.agent-host-toolbar'));

		const toolbarContainer = DOM.append(container, $('.agent-host-toolbar-content'));

		const toolbar = this._register(this.instantiationService.createInstance(MenuWorkbenchToolBar, toolbarContainer, Menus.SidebarAgentHost, {
			hiddenItemStrategy: HiddenItemStrategy.NoHide,
			toolbarOptions: { primaryGroup: () => true },
			telemetrySource: 'sidebarAgentHost',
		}));

		// Re-layout when toolbar items change (e.g. once host discovery
		// completes and the picker swaps from "Searching…" to a real host).
		this._register(toolbar.onDidChangeMenuItems(() => {
			options?.onDidChangeLayout?.();
		}));
	}
}
