/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as DOM from '../../../../../base/browser/dom.js';
import { Disposable, IDisposable } from '../../../../../base/common/lifecycle.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { AICustomizationManagementSection } from './aiCustomizationManagement.js';
import { IWelcomePageFeatures } from '../../common/aiCustomizationWorkspaceService.js';
import { URI } from '../../../../../base/common/uri.js';
import { AICustomizationDiscoveryPage } from './aiCustomizationDiscoveryPage.js';

const $ = DOM.$;

export interface IWelcomePageCallbacks {
	selectSection(section: AICustomizationManagementSection): void;
	showMarketplace(section: AICustomizationManagementSection): void;
	openInstalled?(section: AICustomizationManagementSection, uri: URI | undefined): void;
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
	setHarnessLabel(label: string): void;
	focus(): void;
	setVisible?(visible: boolean): void;
	layout?(dimension: DOM.Dimension | undefined): void;
	getAccessibilityContent?(): string;
	setSearchQuery?(value: string): void;
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
		harnessLabel: string,
		@IInstantiationService instantiationService: IInstantiationService,
	) {
		super();

		this.container = DOM.append(parent, $('.welcome-page-host'));
		this.container.style.height = '100%';
		this.container.style.overflow = 'hidden';
		this.implementation = this._register(instantiationService.createInstance(AICustomizationDiscoveryPage, this.container, welcomePageFeatures, callbacks, harnessLabel));
	}

	rebuildCards(visibleSectionIds: ReadonlySet<AICustomizationManagementSection>): void {
		this.implementation.rebuildCards(visibleSectionIds);
	}

	setHarnessLabel(label: string): void {
		this.implementation.setHarnessLabel(label);
	}

	focus(): void {
		this.implementation.focus();
	}

	reset(): void {
		this.implementation.reset?.();
	}

	setVisible(visible: boolean): void {
		this.implementation.setVisible?.(visible);
	}

	layout(dimension: DOM.Dimension | undefined): void {
		this.implementation.layout?.(dimension);
	}

	getAccessibilityContent(): string {
		return this.implementation.getAccessibilityContent?.() ?? '';
	}

	setSearchQuery(value: string): void {
		this.implementation.setSearchQuery?.(value);
	}
}
