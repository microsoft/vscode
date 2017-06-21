/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { SpectronApplication } from '../spectron/application';

export class JavaScript {
	private readonly appVarSelector = '.view-lines>:nth-child(7) .mtk11';
	private readonly firstCommentSelector = '.margin-view-overlays>:nth-child(3)';
	private readonly expressVarSelector = '.view-lines>:nth-child(11) .mtk10';

	constructor(private spectron: SpectronApplication) {
		// noop
	}

	public openQuickOutline(): Promise<any> {
		return this.spectron.command('workbench.action.gotoSymbol');
	}

	public async findAppReferences(): Promise<any> {
		await this.spectron.client.click(this.appVarSelector, false);
		return this.spectron.command('editor.action.referenceSearch.trigger');
	}

	public async getTitleReferencesCount(): Promise<any> {
		const meta = await this.spectron.client.getText('.reference-zone-widget.results-loaded .peekview-title .meta');

		return meta.match(/\d+/)[0];
	}

	public async getTreeReferencesCount(): Promise<any> {
		const treeElems = await this.spectron.client.elements('.reference-zone-widget.results-loaded .ref-tree.inline .show-twisties .monaco-tree-row');
		return treeElems.value.length;
	}

	public async renameApp(newValue: string): Promise<any> {
		await this.spectron.client.click(this.appVarSelector);
		await this.spectron.command('editor.action.rename');
		await this.spectron.wait();
		return this.spectron.client.keys(newValue, false);
	}

	public async getNewAppName(): Promise<any> {
		return this.spectron.client.getText(this.appVarSelector);
	}

	public async toggleFirstCommentFold(): Promise<any> {
		return this.spectron.client.click(`${this.firstCommentSelector} .cldr.folding`);
	}

	public async getFirstCommentFoldedIcon(): Promise<any> {
		return this.spectron.client.getHTML(`${this.firstCommentSelector} .cldr.folding.collapsed`);
	}

	public async getNextLineNumberAfterFold(): Promise<any> {
		return this.spectron.client.getText(`.margin-view-overlays>:nth-child(4) .line-numbers`);
	}

	public async goToExpressDefinition(): Promise<any> {
		await this.spectron.client.click(this.expressVarSelector);
		return this.spectron.command('editor.action.goToDeclaration');
	}

	public async peekExpressDefinition(): Promise<any> {
		await this.spectron.client.click(this.expressVarSelector);
		return this.spectron.command('editor.action.previewDeclaration');
	}

	public async getPeekExpressResultName(): Promise<any> {
		return this.spectron.client.getText('.reference-zone-widget.results-loaded .filename');
	}
}