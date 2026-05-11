/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as DOM from '../../../../../base/browser/dom.js';
import { Disposable, IDisposable } from '../../../../../base/common/lifecycle.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { AICustomizationManagementSection } from './aiCustomizationManagement.js';
import { IAICustomizationWorkspaceService, IWelcomePageFeatures } from '../../common/aiCustomizationWorkspaceService.js';
import { PromptLaunchersAICustomizationWelcomePage } from './aiCustomizationWelcomePagePromptLaunchers.js';
import { IHoverService } from '../../../../../platform/hover/browser/hover.js';

const $ = DOM.$;

export interface IWelcomePageCallbacks {
	selectSection(section: AICustomizationManagementSection): void;
	selectSectionWithMarketplace(section: AICustomizationManagementSection): void;
	closeEditor(): void;
	/**
	 * Prefill the chat input with a query. In the sessions window this
	 * uses the sessions chat widget; in core VS Code it opens the chat view.
	 *
	 * @param options.newChat When true, always opens a new chat instead of
	 * reusing the active one.
	 */
	prefillChat(query: string, options?: { isPartialQuery?: boolean; newChat?: boolean }): void;
}

export interface IAICustomizationWelcomePageImplementation extends IDisposable {
	readonly container: HTMLElement;
	rebuildCards(visibleSectionIds: ReadonlySet<AICustomizationManagementSection>): void;
	focus(): void;
	/** Called when the welcome page becomes visible after navigation — clears any transient state. */
	reset?(): void;
}

/**
 * Renders the welcome page for the AI Customization Management Editor.
 */
export class AICustomizationWelcomePage extends Disposable {

	private readonly implementation: IAICustomizationWelcomePageImplementation;

	readonly container: HTMLElement;

	constructor(
		parent: HTMLElement,
		welcomePageFeatures: IWelcomePageFeatures | undefined,
		callbacks: IWelcomePageCallbacks,
		commandService: ICommandService,
		workspaceService: IAICustomizationWorkspaceService,
		hoverService: IHoverService,
	) {
		super();

		this.container = DOM.append(parent, $('.welcome-page-host'));
		this.container.style.height = '100%';
		this.container.style.overflow = 'hidden';
		this.implementation = this._register(new PromptLaunchersAICustomizationWelcomePage(this.container, welcomePageFeatures, callbacks, commandService, workspaceService, hoverService));
	}

	rebuildCards(visibleSectionIds: ReadonlySet<AICustomizationManagementSection>): void {
		this.implementation.rebuildCards(visibleSectionIds);
	}

	focus(): void {
		this.implementation.focus();
	}

	reset(): void {
		this.implementation.reset?.();
	}
}
