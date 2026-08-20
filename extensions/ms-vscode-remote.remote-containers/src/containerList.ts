/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';

/**
 * The versioned path used to retrieve the list of available dev containers from
 * the Remote Containers service.  The previous path (`/v1/containers`) was
 * removed in a recent service update and now returns HTTP 404; this constant
 * reflects the current routing.
 */
const CONTAINER_LIST_API_PATH = '/v2/containers';

export interface IDevContainer {
	id: string;
	name: string;
	state: string;
	imageName: string;
}

/**
 * Fetches the list of dev containers from the Remote Containers service.
 *
 * Returns an empty array when the service responds with HTTP 404 so that the
 * Remote Explorer sidebar shows an empty list rather than a hard error
 * notification.  All other non-2xx responses still propagate as errors so
 * that genuine connectivity problems are not silently swallowed.
 *
 * @param baseUrl  Base URL of the Remote Containers service (e.g. `http://localhost:2375`).
 */
export async function fetchDevContainers(baseUrl: string): Promise<IDevContainer[]> {
	const url = `${baseUrl.replace(/\/$/, '')}${CONTAINER_LIST_API_PATH}`;

	let response: Response;
	try {
		response = await fetch(url);
	} catch (err) {
		throw new Error(`Remote Containers: failed to reach service at ${url}: ${(err as Error).message}`);
	}

	// The endpoint may not exist on older service versions or during a transition
	// period.  Treat 404 as "no containers available" so the UI degrades
	// gracefully instead of surfacing an error notification to the user.
	if (response.status === 404) {
		return [];
	}

	if (!response.ok) {
		throw new Error(`Remote Containers: unexpected response ${response.status} from ${url}`);
	}

	try {
		const json = await response.json() as IDevContainer[];
		return Array.isArray(json) ? json : [];
	} catch {
		// Malformed JSON from the service should not crash the explorer.
		return [];
	}
}

/**
 * VS Code TreeDataProvider that populates the "Dev Containers" section of
 * the Remote Explorer sidebar.
 */
export class DevContainerTreeDataProvider implements vscode.TreeDataProvider<IDevContainer> {
	private readonly _onDidChangeTreeData = new vscode.EventEmitter<IDevContainer | undefined | void>();
	readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

	private containers: IDevContainer[] = [];
	private readonly baseUrl: string;

	constructor(baseUrl: string) {
		this.baseUrl = baseUrl;
	}

	async refresh(): Promise<void> {
		this.containers = await fetchDevContainers(this.baseUrl);
		this._onDidChangeTreeData.fire();
	}

	getTreeItem(element: IDevContainer): vscode.TreeItem {
		const item = new vscode.TreeItem(element.name, vscode.TreeItemCollapsibleState.None);
		item.id = element.id;
		item.description = element.state;
		item.tooltip = element.imageName;
		item.contextValue = 'devContainer';
		return item;
	}

	getChildren(): IDevContainer[] {
		return this.containers;
	}
}
