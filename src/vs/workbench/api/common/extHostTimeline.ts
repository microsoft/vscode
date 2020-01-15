/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { UriComponents, URI } from 'vs/base/common/uri';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { ExtHostTimelineShape, MainThreadTimelineShape, IMainContext, MainContext } from 'vs/workbench/api/common/extHost.protocol';
import { TimelineItem, TimelineProvider, toKey } from 'vs/workbench/contrib/timeline/common/timeline';
import { IDisposable, toDisposable } from 'vs/base/common/lifecycle';
import { ExtensionIdentifier } from 'vs/platform/extensions/common/extensions';

export interface IExtHostTimeline extends ExtHostTimelineShape {
	readonly _serviceBrand: undefined;
	$getTimeline(key: string, uri: UriComponents, since: number, token: vscode.CancellationToken): Promise<TimelineItem[]>;
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

		this.registerTimelineProvider('bar', {
			id: 'baz',
			async provideTimeline(uri: URI, since: number, token: vscode.CancellationToken) {
				return [
					{
						id: '1',
						label: 'Bar Timeline1',
						description: uri.toString(true),
						detail: new Date().toString(),
						date: Date.now(),
						source: 'log'
					},
					{
						id: '2',
						label: 'Bar Timeline2',
						description: uri.toString(true),
						detail: new Date(Date.now() - 100).toString(),
						date: Date.now() - 100,
						source: 'log'
					}
				];
			}
		});
	}

	async $getTimeline(key: string, uri: UriComponents, since: number, token: vscode.CancellationToken): Promise<TimelineItem[]> {
		const provider = this._providers.get(key);
		return provider?.provideTimeline(URI.revive(uri), since, token) ?? [];
	}

	registerTimelineProvider(extension: ExtensionIdentifier | string, provider: TimelineProvider): IDisposable {
		console.log(`ExtHostTimeline#registerTimelineProvider: extension=${extension.toString()}, provider=${provider.id}`);

		const key = toKey(extension, provider.id);
		if (this._providers.has(key)) {
			throw new Error(`Timeline Provider ${key} already exists.`);
		}

		this._proxy.$registerTimelineProvider(key, provider.id);
		this._providers.set(key, provider);

		return toDisposable(() => {
			this._providers.delete(key);
			this._proxy.$unregisterTimelineProvider(key);
		});
	}
}
