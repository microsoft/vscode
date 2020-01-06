/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { ITypeScriptServiceClient } from '../typescriptService';
import * as typeConverters from '../utils/typeConverters';
import API from '../utils/api';
import { VersionDependentRegistration } from '../utils/dependentRegistration';

class TypeScriptCallHierarchySupport implements vscode.CallHierarchyProvider {
	public static readonly minVersion = API.v380;
	public constructor(
		private readonly client: ITypeScriptServiceClient) { }

	public async prepareCallHierarchy(
		document: vscode.TextDocument,
		position: vscode.Position,
		token: vscode.CancellationToken
	): Promise<vscode.CallHierarchyItem | vscode.CallHierarchyItem[] | undefined> {
		const filepath = this.client.toOpenedFilePath(document);
		if (!filepath) {
			return undefined;
		}

		const args = typeConverters.Position.toFileLocationRequestArgs(filepath, position);
		const response = await this.client.execute('prepareCallHierarchy', args, token);
		if (response.type !== 'response' || !response.body) {
			return undefined;
		}

		return Array.isArray(response.body)
			? response.body.map(typeConverters.CallHierarchyItem.fromProtocolCallHierarchyItem)
			: typeConverters.CallHierarchyItem.fromProtocolCallHierarchyItem(response.body);
	}

	public async provideCallHierarchyIncomingCalls(item: vscode.CallHierarchyItem, token: vscode.CancellationToken): Promise<vscode.CallHierarchyIncomingCall[] | undefined> {
		const filepath = this.client.toPath(item.uri);
		if (!filepath) {
			return undefined;
		}

		const args = typeConverters.Position.toFileLocationRequestArgs(filepath, item.selectionRange.start);
		const response = await this.client.execute('provideCallHierarchyIncomingCalls', args, token);
		if (response.type !== 'response' || !response.body) {
			return undefined;
		}

		return response.body.map(typeConverters.CallHierarchyIncomingCall.fromProtocolCallHierchyIncomingCall);
	}

	public async provideCallHierarchyOutgoingCalls(item: vscode.CallHierarchyItem, token: vscode.CancellationToken): Promise<vscode.CallHierarchyOutgoingCall[] | undefined> {
		const filepath = this.client.toPath(item.uri);
		if (!filepath) {
			return undefined;
		}

		const args = typeConverters.Position.toFileLocationRequestArgs(filepath, item.selectionRange.start);
		const response = await this.client.execute('provideCallHierarchyOutgoingCalls', args, token);
		if (response.type !== 'response' || !response.body) {
			return undefined;
		}

		return response.body.map(typeConverters.CallHierarchyOutgoingCall.fromProtocolCallHierchyOutgoingCall);
	}
}

export function register(
	selector: vscode.DocumentSelector,
	client: ITypeScriptServiceClient
) {
	return new VersionDependentRegistration(client, TypeScriptCallHierarchySupport.minVersion,
		() => vscode.languages.registerCallHierarchyProvider(selector,
			new TypeScriptCallHierarchySupport(client)));
}
