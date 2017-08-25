/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { SpectronApplication } from '../spectron/application';

var htmlparser = require('htmlparser2');

export class JavaScript {
	private appVarSelector: string;
	private expressVarSelector: string;

	private foldSelector: string;
	private foldLine: number;

	constructor(private spectron: SpectronApplication) {
		// noop
	}

	public openQuickOutline(): Promise<any> {
		return this.spectron.command('workbench.action.gotoSymbol');
	}

	public async findAppReferences(): Promise<any> {
		await this.setAppVarSelector();
		try {
			await this.spectron.client.click(this.appVarSelector, false);
		} catch (e) {
			return Promise.reject(`Failed to select 'app' variable.`);
		}

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
		await this.setAppVarSelector();

		try {
			await this.spectron.client.click(this.appVarSelector);
		} catch (e) {
			return Promise.reject(`Failed to select 'app' variable.`);
		}
		await this.spectron.command('editor.action.rename');
		await this.spectron.wait();
		return this.spectron.client.keys(newValue, false);
	}

	public async getNewAppName(): Promise<any> {
		return this.spectron.client.getText(this.appVarSelector);
	}

	public async toggleFirstCommentFold(): Promise<any> {
		this.foldLine = await this.getLineIndexOfFirstFoldableElement(`.margin-view-overlays`);
		this.foldSelector = `.margin-view-overlays>:nth-child(${this.foldLine})`;

		try {
			return this.spectron.client.click(`${this.foldSelector} .cldr.folding`);
		} catch (e) {
			return Promise.reject('Clicking on fold element failed ' + e);
		}
	}

	public async getFirstCommentFoldedIcon(): Promise<any> {
		if (!this.foldSelector) {
			return Promise.reject('No code folding happened to be able to check for a folded icon.');
		}

		return this.spectron.client.getHTML(`${this.foldSelector} .cldr.folding.collapsed`);
	}

	public async getNextLineNumberAfterFold(): Promise<any> {
		if (!this.foldLine) {
			return Promise.reject('Folded line was not set, most likely because fold was not toggled initially.');
		}

		return this.spectron.client.getText(`.margin-view-overlays>:nth-child(${this.foldLine + 1}) .line-numbers`);
	}

	public async goToExpressDefinition(): Promise<any> {
		await this.setExpressVarSelector();
		try {
			await this.spectron.client.click(this.expressVarSelector);
		} catch (e) {
			return Promise.reject(`Clicking on express variable failed: ` + e);
		}

		return this.spectron.command('editor.action.goToDeclaration');
	}

	public async peekExpressDefinition(): Promise<any> {
		await this.setExpressVarSelector();
		try {
			await this.spectron.client.click(this.expressVarSelector);
		} catch (e) {
			return Promise.reject('Clicking on express variable failed: ' + e);
		}

		return this.spectron.command('editor.action.previewDeclaration');
	}

	public async getPeekExpressResultName(): Promise<any> {
		return this.spectron.client.getText('.reference-zone-widget.results-loaded .filename');
	}

	private async setAppVarSelector(): Promise<any> {
		if (!this.appVarSelector) {
			const lineIndex = await this.getLineIndexOfFirst('app', '.view-lines');
			this.appVarSelector = `.view-lines>:nth-child(${lineIndex}) .mtk11`;
		}
	}

	private async setExpressVarSelector(): Promise<any> {
		if (!this.expressVarSelector) {
			const lineIndex = await this.getLineIndexOfFirst('express', '.view-lines');
			this.expressVarSelector = `.view-lines>:nth-child(${lineIndex}) .mtk10`;
		}
	}

	private getLineIndexOfFirst(string: string, selector: string): Promise<number> {
		return this.spectron.waitFor(this.spectron.client.getHTML, selector).then(html => {
			return new Promise<number>((res, rej) => {
				let lineIndex: number = 0;
				let stringFound: boolean;
				let parser = new htmlparser.Parser({
					onopentag: function (name: string, attribs: any) {
						if (name === 'div' && attribs.class === 'view-line') {
							lineIndex++;
						}
					},
					ontext: function (text) {
						if (!stringFound && text === string) {
							stringFound = true;
							parser.end();
						}
					},
					onend: function () {
						if (!stringFound) {
							return rej(`No ${string} in editor found.`);
						}
						return res(lineIndex);
					}
				});
				parser.write(html);
			});
		});
	}

	private getLineIndexOfFirstFoldableElement(selector: string): Promise<number> {
		return this.spectron.waitFor(this.spectron.client.getHTML, selector).then(html => {
			return new Promise<number>((res, rej) => {
				let lineIndex: number = 0;
				let foldFound: boolean;
				let parser = new htmlparser.Parser({
					onopentag: function (name: string, attribs: any) {
						if (name === 'div' && !attribs.class) {
							lineIndex++;
						} else if (name === 'div' && attribs.class.indexOf('cldr folding') !== -1) {
							foldFound = true;
							parser.end();
						}
					},
					onend: function () {
						if (!foldFound) {
							return rej(`No foldable elements found.`);
						}
						return res(lineIndex);
					}
				});
				parser.write(html);
			});
		});
	}
}