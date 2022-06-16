/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as vscode from 'vscode';
import { Disposable } from '../util/dispose';
import { SkinnyTextDocument } from '../workspaceContents';
import { MdReferencesComputer } from './references';

export class MdDefinitionProvider extends Disposable implements vscode.DefinitionProvider {

	constructor(
		private readonly referencesComputer: MdReferencesComputer
	) {
		super();
	}

	async provideDefinition(document: SkinnyTextDocument, position: vscode.Position, token: vscode.CancellationToken): Promise<vscode.Definition | undefined> {
		const allRefs = await this.referencesComputer.getReferencesAtPosition(document, position, token);

		return allRefs.find(ref => ref.kind === 'link' && ref.isDefinition)?.location;
	}
}
