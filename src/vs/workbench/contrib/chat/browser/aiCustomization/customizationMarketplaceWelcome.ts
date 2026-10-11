/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/customizationMarketplaceWelcome.css';
import * as dom from '../../../../../base/browser/dom.js';
import { Button } from '../../../../../base/browser/ui/button/button.js';
import { MarkdownString } from '../../../../../base/common/htmlContent.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { IMarkdownRendererService } from '../../../../../platform/markdown/browser/markdownRenderer.js';
import { defaultButtonStyles } from '../../../../../platform/theme/browser/defaultStyles.js';
import { AICustomizationManagementCommands, AICustomizationManagementSection } from '../../common/aiCustomizationWorkspaceService.js';

export interface ICustomizationMarketplaceWelcomeOptions {
	readonly icon: ThemeIcon;
	readonly title: string;
	readonly description: MarkdownString;
	readonly buttonLabel: string;
	readonly section: AICustomizationManagementSection;
}

export class CustomizationMarketplaceWelcome extends Disposable {

	constructor(
		container: HTMLElement,
		options: ICustomizationMarketplaceWelcomeOptions,
		@IMarkdownRendererService markdownRendererService: IMarkdownRendererService,
		@ICommandService commandService: ICommandService,
	) {
		super();

		const content = dom.append(container, dom.$('.customizations-marketplace-welcome-content'));

		const iconContainer = dom.append(content, dom.$('.customizations-marketplace-welcome-icon'));
		const icon = dom.append(iconContainer, dom.$('span'));
		icon.className = ThemeIcon.asClassName(options.icon);
		icon.setAttribute('aria-hidden', 'true');

		const title = dom.append(content, dom.$('h2.customizations-marketplace-welcome-title'));
		title.textContent = options.title;

		const description = dom.append(content, dom.$('.customizations-marketplace-welcome-description'));
		const markdown = this._register(markdownRendererService.render(options.description));
		description.appendChild(markdown.element);

		const buttonContainer = dom.append(content, dom.$('.customizations-marketplace-welcome-button-container'));
		const button = this._register(new Button(buttonContainer, {
			title: options.buttonLabel,
			...defaultButtonStyles
		}));
		button.label = options.buttonLabel;
		this._register(button.onDidClick(() => commandService.executeCommand(
			AICustomizationManagementCommands.OpenMarketplace,
			options.section,
		)));
	}
}
