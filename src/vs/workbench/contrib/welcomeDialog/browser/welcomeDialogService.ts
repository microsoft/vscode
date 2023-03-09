/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!./media/welcomeDialog';
import { IInstantiationService, createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { ThemeIcon } from 'vs/base/common/themables';
import { InstantiationType, registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { ILayoutService } from 'vs/platform/layout/browser/layoutService';
import { DisposableStore } from 'vs/base/common/lifecycle';
import { Dialog } from 'vs/base/browser/ui/dialog/dialog';
import { defaultButtonStyles, defaultCheckboxStyles, defaultDialogStyles, defaultInputBoxStyles } from 'vs/platform/theme/browser/defaultStyles';
import { $ } from 'vs/base/browser/dom';
import { renderLabelWithIcons } from 'vs/base/browser/ui/iconLabel/iconLabels';
import { ILinkDescriptor, Link } from 'vs/platform/opener/browser/link';

interface IWelcomeDialogItem {
	readonly title: string;
	readonly messages: { message: string; icon: string }[];
	readonly buttonText: string;
	readonly action?: ILinkDescriptor;
	readonly onClose?: () => void;
}

export const IWelcomeDialogService = createDecorator<IWelcomeDialogService>('welcomeDialogService');

export interface IWelcomeDialogService {
	readonly _serviceBrand: undefined;

	show(item: IWelcomeDialogItem): void;
}

export class WelcomeDialogService implements IWelcomeDialogService {
	declare readonly _serviceBrand: undefined;

	private dialog: Dialog | undefined;
	private disposableStore: DisposableStore = new DisposableStore();

	constructor(
		@ILayoutService private readonly layoutService: ILayoutService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,) {
	}

	private static iconWidgetFor(icon: string) {
		const themeIcon = ThemeIcon.fromId(icon);
		if (themeIcon) {
			const widget = $(ThemeIcon.asCSSSelector(themeIcon));
			widget.classList.add('icon-widget');
			return widget;
		}
		return '';
	}

	async show(welcomeDialogItem: IWelcomeDialogItem): Promise<void> {

		this.disposableStore.clear();

		const renderBody = (parent: HTMLElement) => {

			parent.classList.add(...('dialog-items'));
			parent.appendChild(document.createElement('hr'));

			for (const message of welcomeDialogItem.messages) {
				const descriptorComponent =
					$('.dialog-message',
						{},
						WelcomeDialogService.iconWidgetFor(message.icon),
						$('.description-container', {},
							$('.description.description.max-lines-3', { 'x-description-for': 'description' }, ...renderLabelWithIcons(message.message))));
				parent.appendChild(descriptorComponent);
			}

			const actionsContainer = $('div.dialog-action-container');
			parent.appendChild(actionsContainer);
			if (welcomeDialogItem.action) {
				this.disposableStore.add(this.instantiationService.createInstance(Link, actionsContainer, welcomeDialogItem.action, {}));
			}
		};

		this.dialog = new Dialog(
			this.layoutService.container,
			welcomeDialogItem.title,
			[welcomeDialogItem.buttonText],
			{
				detail: '',
				type: 'none',
				renderBody: renderBody,
				disableCloseAction: true,
				buttonStyles: defaultButtonStyles,
				checkboxStyles: defaultCheckboxStyles,
				inputBoxStyles: defaultInputBoxStyles,
				dialogStyles: defaultDialogStyles
			});

		this.disposableStore.add(this.dialog);
		await this.dialog.show();
		this.disposableStore.dispose();
	}
}

registerSingleton(IWelcomeDialogService, WelcomeDialogService, InstantiationType.Eager);

