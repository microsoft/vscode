/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!./media/welcomeDialog';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { InstantiationType, registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { ILinkDescriptor } from 'vs/platform/opener/browser/link';
import { IDialogService } from 'vs/platform/dialogs/common/dialogs';
import { MarkdownString } from 'vs/base/common/htmlContent';
import { openLinkFromMarkdown } from 'vs/editor/contrib/markdownRenderer/browser/markdownRenderer';
import { IOpenerService } from 'vs/platform/opener/common/opener';

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

	constructor(
		@IDialogService private readonly dialogService: IDialogService,
		@IOpenerService private readonly openerService: IOpenerService) {
	}

	async show(welcomeDialogItem: IWelcomeDialogItem): Promise<void> {

		const renderBody = (icon: string, message: string): MarkdownString => {
			const mds = new MarkdownString(undefined, { supportThemeIcons: true, supportHtml: true });
			mds.appendMarkdown(`<a>$(${icon})</a>`);
			mds.appendMarkdown(message);
			return mds;
		};

		const hr = new MarkdownString(undefined, { supportThemeIcons: true, supportHtml: true });
		hr.appendMarkdown('<hr>');

		await this.dialogService.prompt({
			type: 'none',
			message: welcomeDialogItem.title,
			cancelButton: welcomeDialogItem.buttonText,
			buttons: welcomeDialogItem.action ? [{
				label: welcomeDialogItem.action.label as string,
				run: () => {
					openLinkFromMarkdown(this.openerService, welcomeDialogItem.action?.href!, true);
					welcomeDialogItem.onClose?.();
				}

			}] : undefined,
			custom: {
				disableCloseAction: true,
				markdownDetails: [
					{ markdown: hr, classes: ['hr'] },
					...welcomeDialogItem.messages.map(value => { return { markdown: renderBody(value.icon, value.message), classes: ['message-body'] }; })
				]
			}
		});

		welcomeDialogItem.onClose?.();
	}
}

registerSingleton(IWelcomeDialogService, WelcomeDialogService, InstantiationType.Eager);

