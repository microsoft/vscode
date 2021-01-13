/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, IDisposable } from 'vs/base/common/lifecycle';
import { LinkedList } from 'vs/base/common/linkedList';
import { URI } from 'vs/base/common/uri';
import * as nls from 'vs/nls';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { IExternalOpener, IOpenerService } from 'vs/platform/opener/common/opener';
import { IQuickInputService, IQuickPickItem, IQuickPickSeparator } from 'vs/platform/quickinput/common/quickInput';
import { ExternalUriOpenerConfiguration, externalUriOpenersSettingId } from 'vs/workbench/contrib/externalUriOpener/common/configuration';
import { IPreferencesService } from 'vs/workbench/services/preferences/common/preferences';

export const IExternalUriOpenerService = createDecorator<IExternalUriOpenerService>('externalUriOpenerService');

export interface ExternalOpenerEntry extends IExternalOpener {
	readonly id: string;
	readonly label: string;
}



export interface IExternalOpenerProvider {
	provideExternalOpeners(resource: URI | string): Promise<readonly ExternalOpenerEntry[]>;
}

export interface IExternalUriOpenerService {
	readonly _serviceBrand: undefined

	/**
	 * Registers a provider for external resources openers.
	 */
	registerExternalOpenerProvider(provider: IExternalOpenerProvider): IDisposable;
}

export class ExternalUriOpenerService extends Disposable implements IExternalUriOpenerService, IExternalOpener {

	public readonly _serviceBrand: undefined;

	private readonly _externalOpenerProviders = new LinkedList<IExternalOpenerProvider>();

	constructor(
		@IOpenerService openerService: IOpenerService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IPreferencesService private readonly preferencesService: IPreferencesService,
		@IQuickInputService private readonly quickInputService: IQuickInputService,
	) {
		super();
		this._register(openerService.registerExternalOpener(this));
	}

	registerExternalOpenerProvider(provider: IExternalOpenerProvider): IDisposable {
		const remove = this._externalOpenerProviders.push(provider);
		return { dispose: remove };
	}

	async openExternal(href: string): Promise<boolean> {

		const targetUri = typeof href === 'string' ? URI.parse(href) : href;

		const openers: ExternalOpenerEntry[] = [];
		for (const provider of this._externalOpenerProviders) {
			openers.push(...(await provider.provideExternalOpeners(targetUri)));
		}

		if (openers.length === 0) {
			return false;
		}

		const authority = targetUri.authority;
		const config = this.configurationService.getValue<readonly ExternalUriOpenerConfiguration[]>(externalUriOpenersSettingId) || [];
		for (const entry of config) {
			if (entry.hostname === authority) {
				const opener = openers.find(opener => opener.id === entry.id);
				if (opener) {
					return opener.openExternal(href);
				}
			}
		}

		type PickItem = IQuickPickItem & { opener?: IExternalOpener | 'configureDefault' };
		const items: Array<PickItem | IQuickPickSeparator> = openers.map((opener, i): PickItem => {
			return {
				label: opener.label,
				opener: opener
			};
		});
		items.push(
			{
				label: 'Default',
				opener: undefined
			},
			{ type: 'separator' },
			{
				label: nls.localize('selectOpenerConfigureTitle', "Configure default opener..."),
				opener: 'configureDefault'
			});

		const picked = await this.quickInputService.pick(items, {
			placeHolder: nls.localize('selectOpenerPlaceHolder', "Select opener for {0}", targetUri.toString())
		});

		if (!picked) {
			// Still cancel the default opener here since we prompted the user
			return true;
		}

		if (typeof picked.opener === 'undefined') {
			return true;
		} else if (picked.opener === 'configureDefault') {
			await this.preferencesService.openGlobalSettings(true, {
				revealSetting: { key: externalUriOpenersSettingId, edit: true }
			});
			return true;
		} else {
			return picked.opener.openExternal(href);
		}
	}
}
