/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { UriComponents, URI } from 'vs/base/common/uri';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { ExtHostTimelineShape, MainThreadTimelineShape, IMainContext, MainContext } from 'vs/workbench/api/common/extHost.protocol';
import { TimelineItem, TimelineItemWithSource, TimelineProvider } from 'vs/workbench/contrib/timeline/common/timeline';
import { IDisposable, toDisposable, DisposableStore } from 'vs/base/common/lifecycle';
import { CancellationToken } from 'vs/base/common/cancellation';
import { CommandsConverter } from 'vs/workbench/api/common/extHostCommands';
import { ThemeIcon } from 'vs/workbench/api/common/extHostTypes';

export interface IExtHostTimeline extends ExtHostTimelineShape {
	readonly _serviceBrand: undefined;
	$getTimeline(source: string, uri: UriComponents, token: vscode.CancellationToken): Promise<TimelineItem[]>;
}

export const IExtHostTimeline = createDecorator<IExtHostTimeline>('IExtHostTimeline');

export class ExtHostTimeline implements IExtHostTimeline {
	_serviceBrand: undefined;

	private _proxy: MainThreadTimelineShape;

	private _providers = new Map<string, TimelineProvider>();

	constructor(
		mainContext: IMainContext,
	) {
		this._proxy = mainContext.getProxy(MainContext.MainThreadTimeline);
	}

	async $getTimeline(source: string, uri: UriComponents, token: vscode.CancellationToken): Promise<TimelineItem[]> {
		const provider = this._providers.get(source);
		return provider?.provideTimeline(URI.revive(uri), token) ?? [];
	}

	registerTimelineProvider(provider: vscode.TimelineProvider, commandConverter: CommandsConverter): IDisposable {
		const timelineDisposables = new DisposableStore();

		const convertTimelineItem = this.convertTimelineItem(provider.source, commandConverter, timelineDisposables);

		let disposable: IDisposable | undefined;
		if (provider.onDidChange) {
			disposable = provider.onDidChange(this.emitTimelineChangeEvent(provider.source), this);
		}

		return this.registerTimelineProviderCore({
			...provider,
			async provideTimeline(uri: URI, token: CancellationToken) {
				timelineDisposables.clear();

				const results = await provider.provideTimeline(uri, token);
				// Intentional == we don't know how a provider will respond
				// eslint-disable-next-line eqeqeq
				return results != null
					? results.map(item => convertTimelineItem(item))
					: [];
			},
			dispose() {
				disposable?.dispose();
				timelineDisposables.dispose();
			}
		});
	}

	private convertTimelineItem(source: string, commandConverter: CommandsConverter, disposables: DisposableStore): (item: vscode.TimelineItem) => TimelineItemWithSource {
		return (item: vscode.TimelineItem) => {
			const { iconPath, ...props } = item;

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
				source: source,
				command: item.command ? commandConverter.toInternal(item.command, disposables) : undefined,
				icon: icon,
				iconDark: iconDark,
				themeIcon: themeIcon
			};
		};
	}

	private emitTimelineChangeEvent(source: string) {
		return (uri: vscode.Uri | undefined) => {
			this._proxy.$emitTimelineChangeEvent(source, uri);
		};
	}

	private registerTimelineProviderCore(provider: TimelineProvider): IDisposable {
		// console.log(`ExtHostTimeline#registerTimelineProvider: source=${provider.source}`);

		const existing = this._providers.get(provider.source);
		if (existing && !existing.replaceable) {
			throw new Error(`Timeline Provider ${provider.source} already exists.`);
		}

		this._proxy.$registerTimelineProvider({
			source: provider.source,
			sourceDescription: provider.sourceDescription,
			replaceable: provider.replaceable
		});
		this._providers.set(provider.source, provider);

		return toDisposable(() => {
			this._providers.delete(provider.source);
			this._proxy.$unregisterTimelineProvider(provider.source);
			provider.dispose();
		});
	}
}
