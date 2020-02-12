/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { UriComponents, URI } from 'vs/base/common/uri';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { ExtHostTimelineShape, MainThreadTimelineShape, IMainContext, MainContext } from 'vs/workbench/api/common/extHost.protocol';
import { TimelineItemWithSource, TimelineProvider } from 'vs/workbench/contrib/timeline/common/timeline';
import { IDisposable, toDisposable, DisposableStore } from 'vs/base/common/lifecycle';
import { CancellationToken } from 'vs/base/common/cancellation';
import { CommandsConverter } from 'vs/workbench/api/common/extHostCommands';
import { ThemeIcon } from 'vs/workbench/api/common/extHostTypes';
import { ExtensionIdentifier } from 'vs/platform/extensions/common/extensions';

export interface IExtHostTimeline extends ExtHostTimelineShape {
	readonly _serviceBrand: undefined;
	$getTimeline(id: string, uri: UriComponents, token: vscode.CancellationToken): Promise<TimelineItemWithSource[]>;
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

	async $getTimeline(id: string, uri: UriComponents, token: vscode.CancellationToken): Promise<TimelineItemWithSource[]> {
		const provider = this._providers.get(id);
		return provider?.provideTimeline(URI.revive(uri), token) ?? [];
	}

	registerTimelineProvider(scheme: string | string[], provider: vscode.TimelineProvider, extensionId: ExtensionIdentifier, commandConverter: CommandsConverter): IDisposable {
		const timelineDisposables = new DisposableStore();

		const convertTimelineItem = this.convertTimelineItem(provider.id, commandConverter, timelineDisposables);

		let disposable: IDisposable | undefined;
		if (provider.onDidChange) {
			disposable = provider.onDidChange(this.emitTimelineChangeEvent(provider.id), this);
		}

		return this.registerTimelineProviderCore({
			...provider,
			scheme: scheme,
			onDidChange: undefined,
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

	private emitTimelineChangeEvent(id: string) {
		return (e: vscode.TimelineChangeEvent) => {
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
			this._providers.delete(provider.id);
			this._proxy.$unregisterTimelineProvider(provider.id);
			provider.dispose();
		});
	}
}
