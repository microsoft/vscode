/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../base/common/cancellation.js';
import { Iterable } from '../../../../base/common/iterator.js';
import { Disposable, IDisposable } from '../../../../base/common/lifecycle.js';
import { LinkedList } from '../../../../base/common/linkedList.js';
import { isWeb } from '../../../../base/common/platform.js';
import { URI } from '../../../../base/common/uri.js';
import * as languages from '../../../../editor/common/languages.js';
import * as nls from '../../../../nls.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { ViewColumn } from '../../../../platform/editor/common/editor.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IExternalOpener, IOpenerService, OpenInternalOptions } from '../../../../platform/opener/common/opener.js';
import { IQuickInputService, IQuickPickItem, IQuickPickSeparator } from '../../../../platform/quickinput/common/quickInput.js';
import { defaultExternalUriOpenerId, ExternalUriOpenersConfiguration, externalUriOpenersSettingId } from './configuration.js';
import { testUrlMatchesGlob } from '../../../../platform/url/common/urlGlob.js';
import { IPreferencesService } from '../../../services/preferences/common/preferences.js';


export const IExternalUriOpenerService = createDecorator<IExternalUriOpenerService>('externalUriOpenerService');


export interface IExternalOpenerProvider {
	getOpeners(targetUri: URI): AsyncIterable<IExternalUriOpener>;
}

export interface IExternalUriOpener {
	readonly id: string;
	readonly label: string;

	canOpen(uri: URI, token: CancellationToken): Promise<languages.ExternalUriOpenerPriority>;
	openExternalUri(uri: URI, ctx: { sourceUri: URI; viewColumn?: ViewColumn }, token: CancellationToken): Promise<boolean>;
}

export interface IExternalUriOpenerService {
	readonly _serviceBrand: undefined;

	/**
	 * Registers a provider for external resources openers.
	 */
	registerExternalOpenerProvider(provider: IExternalOpenerProvider): IDisposable;

	/**
	 * Get the configured IExternalUriOpener for the uri.
	 * If there is no opener configured, then returns the best opener that can handle the uri.
	 */
	getOpener(uri: URI, ctx: { sourceUri: URI }, token: CancellationToken): Promise<IExternalUriOpener | undefined>;

	/**
	 * Returns the ways to open a link, so that the user can choose one: the openers that can open
	 * it and the editor's default opener. The one that opening the link without choosing uses comes
	 * first; there is none if opening it prompts. Returns no handlers for links that no opener supports.
	 *
	 * @param href The link as written.
	 */
	getLinkHandlers(href: string, token: CancellationToken): Promise<readonly ILinkHandler[]>;
}

/**
 * A way to open a link, such as an external URI opener.
 */
export interface ILinkHandler {
	readonly id: string;
	readonly label: string;

	/**
	 * Whether opening the link without choosing a handler uses this handler.
	 */
	readonly isDefault: boolean;

	open(options?: OpenInternalOptions): Promise<boolean>;
}

interface IValidOpener {
	readonly opener: IExternalUriOpener;
	readonly priority: languages.ExternalUriOpenerPriority;
}

/**
 * What opening a uri without choosing an opener uses: an opener, the editor's default opener, or a
 * prompt to choose between the openers.
 *
 * The first preferred opener wins. If all openers are optional, the default opener wins.
 * Otherwise a single opener wins, and several prompt.
 */
function chooseOpener(validOpeners: readonly IValidOpener[]): IExternalUriOpener | typeof defaultExternalUriOpenerId | 'prompt' {
	const best = validOpeners.at(0);
	if (!best || best.priority === languages.ExternalUriOpenerPriority.Option) {
		return defaultExternalUriOpenerId;
	}
	if (best.priority === languages.ExternalUriOpenerPriority.Preferred || validOpeners.length === 1) {
		return best.opener;
	}
	return 'prompt';
}

function getDefaultOpenerLabel(): string {
	return isWeb
		? nls.localize('selectOpenerDefaultLabel.web', "Open in New Browser Window")
		: nls.localize('selectOpenerDefaultLabel', "Open in Default Browser");
}

export class ExternalUriOpenerService extends Disposable implements IExternalUriOpenerService, IExternalOpener {

	public readonly _serviceBrand: undefined;

	private readonly _providers = new LinkedList<IExternalOpenerProvider>();

	constructor(
		@IOpenerService private readonly openerService: IOpenerService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@ILogService private readonly logService: ILogService,
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

	async openExternal(href: string, ctx: { sourceUri: URI; preferredOpenerId?: string; viewColumn?: ViewColumn }, token: CancellationToken): Promise<boolean> {
		const targetUri = URI.parse(href);
		const allOpeners = await this.getAllOpenersForUri(targetUri);
		if (allOpeners.size === 0) {
			return false;
		}

		const requestedOpener = this.getRequestedOpener(allOpeners, targetUri, ctx.preferredOpenerId);
		if (requestedOpener) {
			return requestedOpener !== defaultExternalUriOpenerId && requestedOpener.openExternalUri(targetUri, ctx, token);
		}

		const validOpeners = await this.getValidOpeners(allOpeners, ctx.sourceUri, token);
		const choice = chooseOpener(validOpeners);
		if (choice === 'prompt') {
			return this.showOpenerPrompt(validOpeners.map(value => value.opener), targetUri, ctx, token);
		}
		return choice !== defaultExternalUriOpenerId && choice.openExternalUri(targetUri, ctx, token);
	}

	async getOpener(targetUri: URI, ctx: { sourceUri: URI }, token: CancellationToken): Promise<IExternalUriOpener | undefined> {
		const allOpeners = await this.getAllOpenersForUri(targetUri);
		const requestedOpener = this.getRequestedOpener(allOpeners, targetUri, undefined);
		if (requestedOpener) {
			return requestedOpener === defaultExternalUriOpenerId ? undefined : requestedOpener;
		}
		return (await this.getValidOpeners(allOpeners, ctx.sourceUri, token)).at(0)?.opener;
	}

	async getLinkHandlers(href: string, token: CancellationToken): Promise<readonly ILinkHandler[]> {
		const targetUri = URI.parse(href);
		const allOpeners = await this.getAllOpenersForUri(targetUri);
		if (allOpeners.size === 0) {
			return [];
		}

		const validOpeners = await this.getValidOpeners(allOpeners, targetUri, token);
		const requestedOpener = this.getRequestedOpener(allOpeners, targetUri, undefined);
		const choice = requestedOpener ?? chooseOpener(validOpeners);
		const defaultHandlerId = choice === 'prompt' ? undefined : choice === defaultExternalUriOpenerId ? choice : choice.id;
		const openers = validOpeners.map(value => value.opener);
		if (requestedOpener && requestedOpener !== defaultExternalUriOpenerId && !openers.includes(requestedOpener)) {
			openers.unshift(requestedOpener);
		}

		const handlers = [
			...openers.map(opener => ({ id: opener.id, label: opener.label })),
			{ id: defaultExternalUriOpenerId, label: getDefaultOpenerLabel() },
		].map(({ id, label }): ILinkHandler => ({
			id,
			label,
			isDefault: id === defaultHandlerId,
			open: options => this.openerService.open(href, { ...options, allowContributedOpeners: id }),
		}));
		return [...handlers.filter(handler => handler.isDefault), ...handlers.filter(handler => !handler.isDefault)];
	}

	/**
	 * The opener that the caller or the user's settings ask for. It is used without checking `canOpen`.
	 */
	private getRequestedOpener(allOpeners: ReadonlyMap<string, IExternalUriOpener>, targetUri: URI, preferredOpenerId: string | undefined): IExternalUriOpener | typeof defaultExternalUriOpenerId | undefined {
		if (preferredOpenerId === defaultExternalUriOpenerId) {
			return defaultExternalUriOpenerId;
		}
		return (preferredOpenerId ? allOpeners.get(preferredOpenerId) : undefined) ?? this.getConfiguredOpenerForUri(allOpeners, targetUri);
	}

	/**
	 * The openers that can open the uri, best first; openers of equal priority keep their order.
	 */
	private async getValidOpeners(allOpeners: ReadonlyMap<string, IExternalUriOpener>, sourceUri: URI, token: CancellationToken): Promise<IValidOpener[]> {
		const openers = await Promise.all(Array.from(allOpeners.values(), async (opener): Promise<IValidOpener | undefined> => {
			try {
				return { opener, priority: await opener.canOpen(sourceUri, token) };
			} catch (e) {
				this.logService.error(e);
				return undefined;
			}
		}));
		return openers
			.filter((value): value is IValidOpener => !!value && value.priority !== languages.ExternalUriOpenerPriority.None)
			.sort((a, b) => b.priority - a.priority);
	}

	/**
	 * All openers for the uri, in the order of their providers.
	 */
	private async getAllOpenersForUri(targetUri: URI): Promise<Map<string, IExternalUriOpener>> {
		const openersByProvider = await Promise.all(Array.from(this._providers, provider => Iterable.asyncToArray(provider.getOpeners(targetUri))));
		return new Map(openersByProvider.flat().map(opener => [opener.id, opener]));
	}

	private getConfiguredOpenerForUri(openers: ReadonlyMap<string, IExternalUriOpener>, targetUri: URI): IExternalUriOpener | typeof defaultExternalUriOpenerId | undefined {
		const config = this.configurationService.getValue<ExternalUriOpenersConfiguration>(externalUriOpenersSettingId) || {};
		for (const [uriGlob, id] of Object.entries(config)) {
			if (testUrlMatchesGlob(targetUri, uriGlob)) {
				if (id === defaultExternalUriOpenerId) {
					return defaultExternalUriOpenerId;
				}

				const entry = openers.get(id);
				if (entry) {
					return entry;
				}
			}
		}
		return undefined;
	}

	private async showOpenerPrompt(
		openers: ReadonlyArray<IExternalUriOpener>,
		targetUri: URI,
		ctx: { sourceUri: URI; viewColumn?: ViewColumn },
		token: CancellationToken
	): Promise<boolean> {
		type PickItem = IQuickPickItem & { opener?: IExternalUriOpener | 'configureDefault' };

		const items: Array<PickItem | IQuickPickSeparator> = openers.map((opener): PickItem => {
			return {
				label: opener.label,
				opener: opener
			};
		});
		items.push(
			{
				label: getDefaultOpenerLabel(),
				opener: undefined
			},
			{ type: 'separator' },
			{
				label: nls.localize('selectOpenerConfigureTitle', "Configure default opener..."),
				opener: 'configureDefault'
			});

		const picked = await this.quickInputService.pick(items, {
			placeHolder: nls.localize('selectOpenerPlaceHolder', "How would you like to open: {0}", targetUri.toString())
		});

		if (!picked) {
			// Still cancel the default opener here since we prompted the user
			return true;
		}

		if (typeof picked.opener === 'undefined') {
			return false; // Fallback to default opener
		} else if (picked.opener === 'configureDefault') {
			await this.preferencesService.openUserSettings({
				jsonEditor: true,
				revealSetting: { key: externalUriOpenersSettingId, edit: true }
			});
			return true;
		} else {
			return picked.opener.openExternalUri(targetUri, ctx, token);
		}
	}
}
