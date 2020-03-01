/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { UriComponents, URI } from 'vs/base/common/uri';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { ExtHostTimelineShape, MainThreadTimelineShape, IMainContext, MainContext } from 'vs/workbench/api/common/extHost.protocol';
import { Timeline, TimelineItem, TimelineOptions, TimelineProvider } from 'vs/workbench/contrib/timeline/common/timeline';
import { IDisposable, toDisposable, DisposableStore } from 'vs/base/common/lifecycle';
import { CancellationToken } from 'vs/base/common/cancellation';
import { CommandsConverter, ExtHostCommands } from 'vs/workbench/api/common/extHostCommands';
import { ThemeIcon } from 'vs/workbench/api/common/extHostTypes';
import { ExtensionIdentifier } from 'vs/platform/extensions/common/extensions';

export interface IExtHostTimeline extends ExtHostTimelineShape {
	readonly _serviceBrand: undefined;
	$getTimeline(id: string, uri: UriComponents, options: vscode.TimelineOptions, token: vscode.CancellationToken, internalOptions?: { cacheResults?: boolean }): Promise<Timeline | undefined>;
}

export const IExtHostTimeline = createDecorator<IExtHostTimeline>('IExtHostTimeline');

export class ExtHostTimeline implements IExtHostTimeline {
	private static handlePool = 0;

	_serviceBrand: undefined;

	private _proxy: MainThreadTimelineShape;

	private _providers = new Map<string, TimelineProvider>();

	private _itemsBySourceByUriMap = new Map<string | undefined, Map<string, Map<string, vscode.TimelineItem>>>();

	constructor(
		mainContext: IMainContext,
		commands: ExtHostCommands,
	) {
		this._proxy = mainContext.getProxy(MainContext.MainThreadTimeline);

		commands.registerArgumentProcessor({
			processArgument: arg => {
				if (arg && arg.$mid === 11) {
					const uri = arg.uri === undefined ? undefined : URI.revive(arg.uri);
					return this._itemsBySourceByUriMap.get(getUriKey(uri))?.get(arg.source)?.get(arg.handle);
				}

				return arg;
			}
		});
	}

	async $getTimeline(id: string, uri: UriComponents, options: vscode.TimelineOptions, token: vscode.CancellationToken, internalOptions?: { cacheResults?: boolean }): Promise<Timeline | undefined> {
		const provider = this._providers.get(id);
		return provider?.provideTimeline(URI.revive(uri), options, token, internalOptions);
	}

	registerTimelineProvider(scheme: string | string[], provider: vscode.TimelineProvider, _extensionId: ExtensionIdentifier, commandConverter: CommandsConverter): IDisposable {
		const timelineDisposables = new DisposableStore();

		const convertTimelineItem = this.convertTimelineItem(provider.id, commandConverter, timelineDisposables).bind(this);

		let disposable: IDisposable | undefined;
		if (provider.onDidChange) {
			disposable = provider.onDidChange(this.emitTimelineChangeEvent(provider.id), this);
		}

		const itemsBySourceByUriMap = this._itemsBySourceByUriMap;
		return this.registerTimelineProviderCore({
			...provider,
			scheme: scheme,
			onDidChange: undefined,
			async provideTimeline(uri: URI, options: TimelineOptions, token: CancellationToken, internalOptions?: { cacheResults?: boolean }) {
				// For now, only allow the caching of a single Uri
				if (internalOptions?.cacheResults) {
					if (options.cursor === undefined) {
						timelineDisposables.clear();
					}

					if (!itemsBySourceByUriMap.has(getUriKey(uri))) {
						itemsBySourceByUriMap.clear();
					}
				} else {
					timelineDisposables.clear();
				}

				const result = await provider.provideTimeline(uri, options, token);
				// Intentional == we don't know how a provider will respond
				// eslint-disable-next-line eqeqeq
				if (result == null) {
					return undefined;
				}

				// TODO: Determine if we should cache dependent on who calls us (internal vs external)
				const convertItem = convertTimelineItem(uri, internalOptions?.cacheResults ?? false);
				return {
					...result,
					source: provider.id,
					items: result.items.map(convertItem)
				};
			},
			dispose() {
				disposable?.dispose();
				timelineDisposables.dispose();
			}
		});
	}

	private convertTimelineItem(source: string, commandConverter: CommandsConverter, disposables: DisposableStore) {
		return (uri: URI, cacheResults: boolean) => {
			let itemsMap: Map<string, vscode.TimelineItem> | undefined;
			if (cacheResults) {
				const uriKey = getUriKey(uri);

				let sourceMap = this._itemsBySourceByUriMap.get(uriKey);
				if (sourceMap === undefined) {
					sourceMap = new Map();
					this._itemsBySourceByUriMap.set(uriKey, sourceMap);
				}

				itemsMap = sourceMap.get(source);
				if (itemsMap === undefined) {
					itemsMap = new Map();
					sourceMap.set(source, itemsMap);
				}
			}

			return (item: vscode.TimelineItem): TimelineItem => {
				const { iconPath, ...props } = item;

				const handle = `${source}|${item.id ?? `${item.timestamp}-${ExtHostTimeline.handlePool++}`}`;
				itemsMap?.set(handle, item);

				let icon;
				let iconDark;
				let themeIcon;
				if (item.iconPath) {
					if (iconPath instanceof ThemeIcon) {
						themeIcon = { id: iconPath.id };
					}
					else if (URI.isUri(iconPath)) {
						icon = iconPath;
						iconDark = iconPath;
					}
					else {
						({ light: icon, dark: iconDark } = iconPath as { light: URI; dark: URI });
					}
				}

				return {
					...props,
					id: props.id ?? undefined,
					handle: handle,
					source: source,
					command: item.command ? commandConverter.toInternal(item.command, disposables) : undefined,
					icon: icon,
					iconDark: iconDark,
					themeIcon: themeIcon
				};
			};
		};
	}

	private emitTimelineChangeEvent(id: string) {
		return (e: vscode.TimelineChangeEvent) => {
			// Clear caches
			if (e?.uri === undefined) {
				for (const sourceMap of this._itemsBySourceByUriMap.values()) {
					sourceMap.get(id)?.clear();
				}
			}
			else {
				this._itemsBySourceByUriMap.get(getUriKey(e.uri))?.clear();
			}

			this._proxy.$emitTimelineChangeEvent({ ...e, id: id });
		};
	}

	private registerTimelineProviderCore(provider: TimelineProvider): IDisposable {
		// console.log(`ExtHostTimeline#registerTimelineProvider: id=${provider.id}`);

		const existing = this._providers.get(provider.id);
		if (existing) {
			throw new Error(`Timeline Provider ${provider.id} already exists.`);
		}

		this._proxy.$registerTimelineProvider({
			id: provider.id,
			label: provider.label,
			scheme: provider.scheme
		});
		this._providers.set(provider.id, provider);

		return toDisposable(() => {
			for (const sourceMap of this._itemsBySourceByUriMap.values()) {
				sourceMap.get(provider.id)?.clear();
			}

			this._providers.delete(provider.id);
			this._proxy.$unregisterTimelineProvider(provider.id);
			provider.dispose();
		});
	}
}

function getUriKey(uri: URI | undefined): string | undefined {
	return uri?.toString();
}

