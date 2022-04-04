/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DocumentSelector } from 'vscode-languageclient';
import { isDeepStrictEqual } from 'util';
import { commands, Disposable, env, extensions, window } from 'vscode';

const RELOAD_WINDOW = 'workbench.action.reloadWindow';

let existingExtensions: HtmlLanguageContribution[];

/**
 * Html language contribution.
 */
export interface HtmlLanguageContribution {
	/**
	 * The language Id which contributes to the Html language server.
	 */
	languageId: string;
	/**
	 * true if the language activates the auto insertion and false otherwise.
	 */
	autoInsert: false;
}

/**
 * Returns all Html language contributions declared with 'contributes/htmlLanguages' from package.json:
 *
 *"contributes": {
 *  "languages": [
 *    {
 *      "id": "handlebars",
 *      ...
 *    }
 *  ],
 *  "htmlLanguages": [
 *    {
 *      "languageId": "handlebars",
 *      "autoInsert": true
 *    }
 *  ]
 *}
 *
 * @param toDispose
 *
 * @returns all Html language contributions declared with 'contributes/htmlLanguages' from package.json.
 */
export function getHtmlLanguageContributions(toDispose?: Disposable[]): HtmlLanguageContribution[] {
	const result: HtmlLanguageContribution[] = [];
	for (const extension of extensions.all) {
		const htmlLanguages = extension.packageJSON?.contributes?.htmlLanguages;
		if (Array.isArray(htmlLanguages)) {
			htmlLanguages.forEach(htmlLanguage => {
				const htmlLanguageContribution = createHtmlLanguageContribution(htmlLanguage);
				if (htmlLanguageContribution) {
					result.push(htmlLanguageContribution);
				}
			});
		}
	}
	// Make a copy of extensions:
	existingExtensions = result.slice();

	if (toDispose) {
		toDispose.push(extensions.onDidChange(_ => {
			handleExtensionChange();
		}));
	}
	return result;
}

function handleExtensionChange(): void {
	if (!existingExtensions) {
		return;
	}
	const oldExtensions = new Set(existingExtensions.slice());
	const newExtensions = getHtmlLanguageContributions();
	let hasChanged = (oldExtensions.size !== newExtensions.length);
	if (!hasChanged) {
		for (const newExtension of newExtensions) {
			let found = false;
			for (const oldExtension of oldExtensions) {
				if (isDeepStrictEqual(oldExtension, newExtension)) {
					found = true;
					break;
				}
			}
			if (found) {
				continue;
			} else {
				hasChanged = true;
				break;
			}
		}
	}

	if (hasChanged) {
		const msg = `Extensions to the Html Language Server changed, reloading ${env.appName} is required for the changes to take effect.`;
		const action = 'Reload';
		window.showWarningMessage(msg, action).then((selection) => {
			if (action === selection) {
				commands.executeCommand(RELOAD_WINDOW);
			}
		});
	}
}

/**
 * Returns the document selector of the Html language client.
 *
 * The returned document selector contains the html languageId and and all languageId contained in `contributes/htmlLanguages` package.json.
 *
 * @param htmlContributions all Html language contributions from other VS Code extensions.
 *
 * @returns the document selector of the Html language client.
 */
export function getDocumentSelector(htmlContributions: HtmlLanguageContribution[]): DocumentSelector {
	let documentSelector: DocumentSelector = ['html'];
	htmlContributions.forEach((contribution: HtmlLanguageContribution) => {
		documentSelector = documentSelector.concat(contribution.languageId);
	});
	return documentSelector;
}

/**
 * Returns the auto insert support for each Html languages.
 *
 * @param htmlContributions  all Html language contributions from other VS Code extensions.
 *
 * @returns the auto insert support for each Html languages.
 */
export function getSupportedLanguagesAutoInsert(htmlContributions: HtmlLanguageContribution[]): { [id: string]: boolean } {
	const supportedLanguages: { [id: string]: boolean } = { html: true };
	htmlContributions.forEach((contribution: HtmlLanguageContribution) => {
		supportedLanguages[contribution.languageId] = contribution.autoInsert;
	});
	return supportedLanguages;
}

function createHtmlLanguageContribution(section: any): HtmlLanguageContribution | undefined {
	const languageId: string | undefined = section.languageId;
	if (!languageId) {
		return;
	}
	const autoInsert = section.autoInsert === true ? true : false;
	return { languageId, autoInsert } as HtmlLanguageContribution;
}
