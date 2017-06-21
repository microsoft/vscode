/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import Node from '@emmetio/node';
import * as extract from '@emmetio/extract-abbreviation';
import * as path from 'path';
import * as fs from 'fs';

let variablesFromFile = {};
let profilesFromFile = {};
let emmetExtensionsPath = '';

const field = (index, placeholder) => `\${${index}${placeholder ? ':' + placeholder : ''}}`;

export function isStyleSheet(syntax): boolean {
	let stylesheetSyntaxes = ['css', 'scss', 'sass', 'less', 'stylus'];
	return (stylesheetSyntaxes.indexOf(syntax) > -1);
}

/**
 * Maps and returns syntaxProfiles of previous format to ones compatible with new emmet modules
 * @param syntax 
 */
export function getProfile(syntax: string): any {
	let profilesFromSettings = vscode.workspace.getConfiguration('emmet')['syntaxProfiles'] || {};
	let profilesConfig = Object.assign({}, profilesFromFile, profilesFromSettings);

	let options = profilesConfig[syntax];
	if (!options || typeof options === 'string') {
		if (options === 'xhtml') {
			return {
				selfClosingStyle: 'xhtml'
			};
		}
		return {};
	}
	let newOptions = {};
	for (let key in options) {
		switch (key) {
			case 'tag_case':
				newOptions['tagCase'] = (options[key] === 'lower' || options[key] === 'upper') ? options[key] : '';
				break;
			case 'attr_case':
				newOptions['attributeCase'] = (options[key] === 'lower' || options[key] === 'upper') ? options[key] : '';
				break;
			case 'attr_quotes':
				newOptions['attributeQuotes'] = options[key];
				break;
			case 'tag_nl':
				newOptions['format'] = (options[key] === 'true' || options[key] === 'false') ? options[key] : 'true';
				break;
			case 'indent':
				newOptions['attrCase'] = (options[key] === 'true' || options[key] === 'false') ? '\t' : options[key];
				break;
			case 'inline_break':
				newOptions['inlineBreak'] = options[key];
				break;
			case 'self_closing_tag':
				if (options[key] === true) {
					newOptions['selfClosingStyle'] = 'xml'; break;
				}
				if (options[key] === false) {
					newOptions['selfClosingStyle'] = 'html'; break;
				}
				newOptions['selfClosingStyle'] = options[key];
				break;
			default:
				newOptions[key] = options[key];
				break;
		}
	}
	return newOptions;
}

/**
 * Returns variables to be used while expanding snippets
 */
export function getVariables(): any {
	let variablesFromSettings = vscode.workspace.getConfiguration('emmet')['variables'];
	return Object.assign({}, variablesFromFile, variablesFromSettings);
}

/**
 * Updates customizations from snippets.json and syntaxProfiles.json files in the directory configured in emmet.extensionsPath setting
 */
export function updateExtensionsPath() {
	let currentEmmetExtensionsPath = vscode.workspace.getConfiguration('emmet')['extensionsPath'];
	if (emmetExtensionsPath !== currentEmmetExtensionsPath) {
		emmetExtensionsPath = currentEmmetExtensionsPath;

		if (emmetExtensionsPath && emmetExtensionsPath.trim()) {
			let dirPath = path.isAbsolute(emmetExtensionsPath) ? emmetExtensionsPath : path.join(vscode.workspace.rootPath, emmetExtensionsPath);
			let snippetsPath = path.join(dirPath, 'snippets.json');
			let profilesPath = path.join(dirPath, 'syntaxProfiles.json');
			if (dirExists(dirPath)) {
				fs.readFile(snippetsPath, (err, snippetsData) => {
					if (err) {
						return;
					}
					try {
						let snippetsJson = JSON.parse(snippetsData.toString());
						variablesFromFile = snippetsJson['variables'];
					} catch (e) {

					}
				});
				fs.readFile(profilesPath, (err, profilesData) => {
					if (err) {
						return;
					}
					try {
						profilesFromFile = JSON.parse(profilesData.toString());
					} catch (e) {

					}
				});
			}
		}
	}
}

function dirExists(dirPath: string): boolean {
	try {

		return fs.statSync(dirPath).isDirectory();
	} catch (e) {
		return false;
	}
}

/**
 * Returns node corresponding to given position in the given root node
 * @param root 
 * @param position 
 * @param includeNodeBoundary 
 */
export function getNode(root: Node, position: vscode.Position, includeNodeBoundary: boolean = false) {
	let currentNode: Node = root.firstChild;
	let foundNode: Node = null;

	while (currentNode) {
		const nodeStart: vscode.Position = currentNode.start;
		const nodeEnd: vscode.Position = currentNode.end;
		if ((nodeStart.isBefore(position) && nodeEnd.isAfter(position))
			|| (includeNodeBoundary && (nodeStart.isBeforeOrEqual(position) && nodeEnd.isAfterOrEqual(position)))) {

			foundNode = currentNode;
			// Dig deeper
			currentNode = currentNode.firstChild;
		} else {
			currentNode = currentNode.nextSibling;
		}
	}

	return foundNode;
}

/**
 * Returns inner range of an html node.
 * @param currentNode 
 */
export function getInnerRange(currentNode: Node): vscode.Range {
	if (!currentNode.close) {
		return;
	}
	return new vscode.Range(currentNode.open.end, currentNode.close.start);
}

/**
 * Extracts abbreviation from the given position in the given document
 */
export function extractAbbreviation(document: vscode.TextDocument, position: vscode.Position): [vscode.Range, string] {
	let currentLine = document.lineAt(position.line).text;
	let result = extract(currentLine, position.character, true);
	if (!result) {
		return [null, ''];
	}

	let rangeToReplace = new vscode.Range(position.line, result.location, position.line, result.location + result.abbreviation.length);
	return [rangeToReplace, result.abbreviation];
}

/**
 * Returns options to be used by the expand module
 * @param syntax 
 * @param textToReplace 
 */
export function getExpandOptions(syntax: string, textToReplace?: string) {
	return {
		field: field,
		syntax: syntax,
		profile: getProfile(syntax),
		addons: syntax === 'jsx' ? { 'jsx': true } : null,
		variables: getVariables(),
		text: textToReplace ? textToReplace : ''
	};
}