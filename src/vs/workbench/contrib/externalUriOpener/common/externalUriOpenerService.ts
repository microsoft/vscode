/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { firstOrDefault } from 'vs/base/common/arrays';
import { CancellationToken } from 'vs/base/common/cancellation';
import { Iterable } from 'vs/base/common/iterator';
import { Disposable, IDisposable } from 'vs/base/common/lifecycle';
import { LinkedList } from 'vs/base/common/linkedList';
import { URI } from 'vs/base/common/uri';
import * as modes from 'vs/editor/common/modes';
import * as nls from 'vs/nls';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { IExternalOpener, IOpenerService } from 'vs/platform/opener/common/opener';
import { IQuickInputService, IQuickPickItem, IQuickPickSeparator } from 'vs/platform/quickinput/common/quickInput';
import { ExternalUriOpenerConfiguration, externalUriOpenersSettingId } from 'vs/workbench/contrib/externalUriOpener/common/configuration';
import { testUrlMatchesGlob } from 'vs/workbench/contrib/url/common/urlGlob';
import { IPreferencesService } from 'vs/workbench/services/preferences/common/preferences';

export const IExternalUriOpenerService = createDecorator<IExternalUriOpenerService>('externalUriOpenerService');


export interface IExternalOpenerProvider {
	getOpeners(targetUri: URI): AsyncIterable<IExternalUriOpener>;
}

export interface IExternalUriOpener {
	readonly id: string;
	readonly label: string;

	canOpen(uri: URI, token: CancellationToken): Promise<modes.ExternalUriOpenerEnablement>;
	openExternalUri(uri: URI, ctx: { sourceUri: URI }, token: CancellationToken): Promise<boolean>;
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

	private readonly _providers = new LinkedList<IExternalOpenerProvider>();

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
		const remove = this._providers.push(provider);
		return { dispose: remove };
	}

	async openExternal(href: string, ctx: { sourceUri: URI }, token: CancellationToken): Promise<boolean> {

		const targetUri = typeof href === 'string' ? URI.parse(href) : href;

		const allOpeners = new Map<string, IExternalUriOpener>();
		await Promise.all(Iterable.map(this._providers, async (provider) => {
			for await (const opener of provider.getOpeners(targetUri)) {
				allOpeners.set(opener.id, opener);
			}
		}));

		if (allOpeners.size === 0) {
			return false;
		}

		// First check to see if we have a configured opener
		const configuredOpener = this.getConfiguredOpenerForUri(allOpeners, targetUri);
		if (configuredOpener) {
			return configuredOpener.openExternalUri(targetUri, ctx, token);
		}

		// Then check to see if there is a valid opener
		const validOpeners: Array<{ opener: IExternalUriOpener, preferred: boolean }> = [];
		await Promise.all(Array.from(allOpeners.values()).map(async opener => {
			switch (await opener.canOpen(targetUri, token)) {
				case modes.ExternalUriOpenerEnablement.Enabled:
					validOpeners.push({ opener, preferred: false });
					break;

				case modes.ExternalUriOpenerEnablement.Preferred:
					validOpeners.push({ opener, preferred: true });
					break;
			}
		}));
		if (validOpeners.length === 0) {
			return false;
		}

		// See if we have a preferred opener first
		const preferred = firstOrDefault(validOpeners.filter(x => x.preferred));
		if (preferred) {
			return preferred.opener.openExternalUri(targetUri, ctx, token);
		}

		// Otherwise prompt
		return this.showOpenerPrompt(validOpeners, targetUri, ctx, token);
	}

	private getConfiguredOpenerForUri(openers: Map<string, IExternalUriOpener>, targetUri: URI): IExternalUriOpener | undefined {
		const config = this.configurationService.getValue<readonly ExternalUriOpenerConfiguration[]>(externalUriOpenersSettingId) || [];
		for (const { id, uri } of config) {
			const entry = openers.get(id);
			if (entry) {
				if (testUrlMatchesGlob(targetUri.toString(), uri)) {
					// Skip the `canOpen` check here since the opener was specifically requested.
					return entry;
				}
			}
		}
		return undefined;
	}

	private async showOpenerPrompt(
		openers: ReadonlyArray<{ opener: IExternalUriOpener, preferred: boolean }>,
		targetUri: URI,
		ctx: { sourceUri: URI },
		token: CancellationToken
	): Promise<boolean> {
		type PickItem = IQuickPickItem & { opener?: IExternalUriOpener | 'configureDefault' };

		const items: Array<PickItem | IQuickPickSeparator> = openers.map((entry): PickItem => {
			return {
				label: entry.opener.label,
				opener: entry.opener
			};
		});
		items.push(
			{
				label: nls.localize('selectOpenerDefaultLabel', 'Default external uri opener'),
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
			return picked.opener.openExternalUri(targetUri, ctx, token);
		}
	}
}
