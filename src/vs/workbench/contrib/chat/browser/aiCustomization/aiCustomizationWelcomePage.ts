/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as DOM from '../../../../../base/browser/dom.js';
import { Disposable, IDisposable, MutableDisposable } from '../../../../../base/common/lifecycle.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { AICustomizationManagementSection, AI_CUSTOMIZATION_WELCOME_PAGE_VARIANT_SETTING, AICustomizationWelcomePageVariant } from './aiCustomizationManagement.js';
import { IAICustomizationWorkspaceService, IWelcomePageFeatures } from '../../common/aiCustomizationWorkspaceService.js';
import { ClassicAICustomizationWelcomePage } from './aiCustomizationWelcomePageClassic.js';
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
 * Selects and renders one of the welcome page implementations based on configuration.
 */
export class AICustomizationWelcomePage extends Disposable {

	private readonly implementation = this._register(new MutableDisposable<IAICustomizationWelcomePageImplementation>());
	private visibleSectionIds = new Set<AICustomizationManagementSection>();

	readonly container: HTMLElement;

	constructor(
		parent: HTMLElement,
		private readonly welcomePageFeatures: IWelcomePageFeatures | undefined,
		private readonly callbacks: IWelcomePageCallbacks,
		private readonly commandService: ICommandService,
		private readonly workspaceService: IAICustomizationWorkspaceService,
		private readonly configurationService: IConfigurationService,
		private readonly hoverService: IHoverService,
	) {
		super();

		this.container = DOM.append(parent, $('.welcome-page-host'));
		this.container.style.height = '100%';
		this.container.style.overflow = 'hidden';
		this.renderImplementation();

		this._register(this.configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(AI_CUSTOMIZATION_WELCOME_PAGE_VARIANT_SETTING)) {
				this.renderImplementation();
			}
		}));
	}

	rebuildCards(visibleSectionIds: ReadonlySet<AICustomizationManagementSection>): void {
		this.visibleSectionIds = new Set(visibleSectionIds);
		this.implementation.value?.rebuildCards(this.visibleSectionIds);
	}

	focus(): void {
		this.implementation.value?.focus();
	}

	reset(): void {
		this.implementation.value?.reset?.();
	}

	private renderImplementation(): void {
		DOM.clearNode(this.container);
		this.implementation.value = this.createImplementation();
		this.implementation.value.rebuildCards(this.visibleSectionIds);
	}

	private createImplementation(): IAICustomizationWelcomePageImplementation {
		switch (this.getVariant()) {
			case 'promptLaunchers':
				return new PromptLaunchersAICustomizationWelcomePage(this.container, this.welcomePageFeatures, this.callbacks, this.commandService, this.workspaceService, this.hoverService);
			case 'classic':
			default:
				return new ClassicAICustomizationWelcomePage(this.container, this.welcomePageFeatures, this.callbacks, this.commandService, this.workspaceService);
		}
	}

	private getVariant(): AICustomizationWelcomePageVariant {
		const configured = this.configurationService.getValue<string>(AI_CUSTOMIZATION_WELCOME_PAGE_VARIANT_SETTING);
		return configured === 'classic' ? configured : 'promptLaunchers';
	}
}
