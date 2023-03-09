/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!./media/welcomeModalDialog';
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

interface IWelcomeModalDialogItem {
	readonly title: string;
	readonly messages: { message: string; icon: string }[];
	readonly buttonText: string;
	readonly action?: ILinkDescriptor;
	readonly onClose?: () => void;
}

export const IWelcomeModalDialogService = createDecorator<IWelcomeModalDialogService>('modalDialogService');

export interface IWelcomeModalDialogService {
	readonly _serviceBrand: undefined;

	show(item: IWelcomeModalDialogItem): void;
}

export class WelcomeModalDialogService implements IWelcomeModalDialogService {
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

	async show(modalDialogItem: IWelcomeModalDialogItem): Promise<void> {

		this.disposableStore.clear();

		const renderBody = (parent: HTMLElement) => {

			parent.classList.add(...('modal-dialog-items'));
			parent.appendChild(document.createElement('hr'));

			for (const message of modalDialogItem.messages) {
				const descriptorComponent =
					$('.modal-dialog-message',
						{},
						WelcomeModalDialogService.iconWidgetFor(message.icon),
						$('.description-container', {},
							$('.description.description.max-lines-3', { 'x-description-for': 'description' }, ...renderLabelWithIcons(message.message))));
				parent.appendChild(descriptorComponent);
			}

			const actionsContainer = $('div.modal-dialog-action-container');
			parent.appendChild(actionsContainer);
			if (modalDialogItem.action) {
				this.disposableStore.add(this.instantiationService.createInstance(Link, actionsContainer, modalDialogItem.action, {}));
			}
		};

		this.dialog = new Dialog(
			this.layoutService.container,
			modalDialogItem.title,
			[modalDialogItem.buttonText],
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

registerSingleton(IWelcomeModalDialogService, WelcomeModalDialogService, InstantiationType.Eager);

