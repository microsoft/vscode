/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2023-2025 Posit Software, PBC. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

import * as erdos from 'erdos';
import * as vscode from 'vscode';
import { rRuntimeDiscoverer, RRuntimeSource } from './provider';
import { RRuntimeManager } from './runtime-manager';

class RuntimeQuickPickItem implements vscode.QuickPickItem {

	label: string;
	description: string;
	runtime: erdos.LanguageRuntimeMetadata;

	constructor(
		public runtimeMetadata: erdos.LanguageRuntimeMetadata,
	) {
		this.label = runtimeMetadata.runtimeName;
		this.description = runtimeMetadata.runtimePath;
		this.runtime = runtimeMetadata;
	}
}

export async function quickPickRuntime(runtimeManager: RRuntimeManager) {

	const runtime = await new Promise<erdos.LanguageRuntimeMetadata | undefined>(
		async (resolve) => {
			const disposables: vscode.Disposable[] = [];

			const input = vscode.window.createQuickPick<RuntimeQuickPickItem | vscode.QuickPickItem>();
			input.title = vscode.l10n.t('Select Interpreter');
			input.canSelectMany = false;
			input.matchOnDescription = true;

			const runtimePicks: RuntimeQuickPickItem[] = [];
			const discoverer = rRuntimeDiscoverer();
			for await (const runtime of discoverer) {
				runtimePicks.push(new RuntimeQuickPickItem(runtime));
			}
			const runtimeSourceOrder: string[] = Object.values(RRuntimeSource);
			runtimePicks.sort((a, b) => {
				return runtimeSourceOrder.indexOf(a.runtime.runtimeSource) - runtimeSourceOrder.indexOf(b.runtime.runtimeSource);
			});
			const picks = new Array<vscode.QuickPickItem | RuntimeQuickPickItem>();
			for (const source of runtimeSourceOrder) {
				const separatorItem: vscode.QuickPickItem = { label: source, kind: vscode.QuickPickItemKind.Separator };
				picks.push(separatorItem);
				for (const item of runtimePicks) {
					if (item.runtime.runtimeSource === source) {
						picks.push(item);
					}
				}
			}

			input.items = picks;

			const preferredRuntime = await erdos.runtime.getPreferredRuntime('r');
			if (preferredRuntime) {
				input.placeholder = vscode.l10n.t('Selected Interpreter: {0}', preferredRuntime.runtimeName);
				const activeItem = runtimePicks.find(
					(item) => item.runtimeMetadata.runtimeId === preferredRuntime.runtimeId
				);
				if (activeItem) {
					input.activeItems = [activeItem];
				}
			}

			disposables.push(
				input.onDidAccept(() => {
					const activeItem = input.activeItems[0] as RuntimeQuickPickItem;
					resolve(activeItem.runtime);
					input.hide();
				}),
				input.onDidHide(() => {
					resolve(undefined);
					input.dispose();
				}),
			);
			input.show();
		});

	if (runtime) {
		runtimeManager.registerLanguageRuntime(runtime);
		erdos.runtime.selectLanguageRuntime(runtime.runtimeId);
	}
};
