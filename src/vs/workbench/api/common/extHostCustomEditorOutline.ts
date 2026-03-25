/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type * as vscode from 'vscode';
import { CancellationToken } from '../../../base/common/cancellation.js';
import { DisposableStore, toDisposable } from '../../../base/common/lifecycle.js';
import { ExtHostCustomEditorOutlineShape, ICustomEditorOutlineItemDto, MainContext, MainThreadCustomEditorOutlineShape } from './extHost.protocol.js';
import { IExtensionDescription } from '../../../platform/extensions/common/extensions.js';
import { checkProposedApiEnabled } from '../../services/extensions/common/extensions.js';
import { ThemeIcon } from '../../../base/common/themables.js';
import { IRPCProtocol } from '../../services/extensions/common/proxyIdentifier.js';

export class ExtHostCustomEditorOutline implements ExtHostCustomEditorOutlineShape {

	private readonly _proxy: MainThreadCustomEditorOutlineShape;
	private readonly _providers = new Map<string, { provider: vscode.CustomEditorOutlineProvider; disposables: DisposableStore }>();

	constructor(
		mainContext: IRPCProtocol,
	) {
		this._proxy = mainContext.getProxy(MainContext.MainThreadCustomEditorOutline);
	}

	registerCustomEditorOutlineProvider(
		extension: IExtensionDescription,
		viewType: string,
		provider: vscode.CustomEditorOutlineProvider,
	): vscode.Disposable {
		checkProposedApiEnabled(extension, 'customEditorOutline');

		if (this._providers.has(viewType)) {
			throw new Error(`An outline provider for custom editor view type '${viewType}' is already registered`);
		}

		const disposables = new DisposableStore();

		this._providers.set(viewType, { provider, disposables });
		this._proxy.$registerCustomEditorOutlineProvider(viewType);

		disposables.add(provider.onDidChangeOutline(() => {
			this._proxy.$onDidChangeOutline(viewType);
		}));

		disposables.add(provider.onDidChangeActiveItem(itemId => {
			this._proxy.$onDidChangeActiveItem(viewType, itemId);
		}));

		return toDisposable(() => {
			this._providers.delete(viewType);
			disposables.dispose();
			this._proxy.$unregisterCustomEditorOutlineProvider(viewType);
		});
	}

	async $provideOutline(viewType: string, token: CancellationToken): Promise<ICustomEditorOutlineItemDto[] | undefined> {
		const entry = this._providers.get(viewType);
		if (!entry) {
			return undefined;
		}
		const items = await entry.provider.provideOutline(token);
		if (!items) {
			return undefined;
		}
		return items.map(item => this._convertItem(item));
	}

	$revealItem(viewType: string, itemId: string): void {
		const entry = this._providers.get(viewType);
		if (entry) {
			entry.provider.revealItem(itemId);
		}
	}

	private _convertItem(item: vscode.CustomEditorOutlineItem): ICustomEditorOutlineItemDto {
		return {
			id: item.id,
			label: item.label,
			detail: item.detail,
			tooltip: item.tooltip,
			icon: ThemeIcon.isThemeIcon(item.icon) ? item.icon : undefined,
			contextValue: item.contextValue,
			children: item.children?.map(child => this._convertItem(child)),
		};
	}
}
