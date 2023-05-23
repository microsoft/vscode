/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as path from 'path';
import { TabInputText, commands, window } from 'vscode';
import { Status } from './api/git';
import { Resource } from './repository';

export default async function restoreTitle(resources: Resource[]) {
	const deletedResources = resources.filter(it => it.type === Status.DELETED);
	const { tabs } = window.tabGroups.activeTabGroup;

	if (deletedResources.length > 0 && tabs.length > 0) {
		const uris = tabs.map(it => (it.input as TabInputText).uri.toString());
		const activeTab = tabs.filter(it => it.isActive)[0];
		const ress = deletedResources.filter(it => uris.includes(it.rightUri?.toString() || ''));

		if (activeTab) {
			const idx = ress.findIndex(it => (
				it.rightUri?.toString() === (activeTab.input as TabInputText).uri.toString()
			));

			if (idx !== -1) {
				const tail = ress.length - 1;
				[ress[tail], ress[idx]] = [ress[idx], ress[tail]];
			}
		}

		// As there is no easy way to change editor title, we use `vscode.open` command.
		for (const resource of ress) {
			await commands.executeCommand(
				'vscode.open',
				resource.rightUri,
				{},
				path.basename(resource.resourceUri.fsPath)
			);
		}
	}
}
