/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { LanguageService, TokenType } from 'vscode-html-languageservice';

export interface HTMLDocumentRegions {
	getEmbeddedRegions(): EmbeddedRegion[];
	getImportedScripts(): string[];
}

export const CSS_STYLE_RULE = '__';

interface EmbeddedRegion {
	languageId: string | undefined;
	content: string;
	start: number;
	generatedStart: number;
	length: number;
	attributeValue?: boolean;
}


export function getDocumentRegions(languageService: LanguageService, text: string): HTMLDocumentRegions {
	const regions: EmbeddedRegion[] = [];
	const scanner = languageService.createScanner(text);
	let lastTagName: string = '';
	let lastAttributeName: string | null = null;
	let languageIdFromType: string | undefined = undefined;
	const importedScripts: string[] = [];

	let token = scanner.scan();
	while (token !== TokenType.EOS) {
		switch (token) {
			case TokenType.StartTag:
				lastTagName = scanner.getTokenText();
				lastAttributeName = null;
				languageIdFromType = 'javascript';
				break;
			case TokenType.Styles:
				regions.push(createEmbeddedRegion('css', scanner.getTokenOffset(), scanner.getTokenEnd()));
				break;
			case TokenType.Script:
				regions.push(createEmbeddedRegion(languageIdFromType, scanner.getTokenOffset(), scanner.getTokenEnd()));
				break;
			case TokenType.AttributeName:
				lastAttributeName = scanner.getTokenText();
				break;
			case TokenType.AttributeValue:
				if (lastAttributeName === 'src' && lastTagName.toLowerCase() === 'script') {
					let value = scanner.getTokenText();
					if (value[0] === '\'' || value[0] === '"') {
						value = value.substr(1, value.length - 1);
					}
					importedScripts.push(value);
				} else if (lastAttributeName === 'type' && lastTagName.toLowerCase() === 'script') {
					if (/["'](module|(text|application)\/(java|ecma)script|text\/babel)["']/.test(scanner.getTokenText())) {
						languageIdFromType = 'javascript';
					} else if (/["']text\/typescript["']/.test(scanner.getTokenText())) {
						languageIdFromType = 'typescript';
					} else {
						languageIdFromType = undefined;
					}
				} else {
					const attributeLanguageId = getAttributeLanguage(lastAttributeName!);
					if (attributeLanguageId) {
						let start = scanner.getTokenOffset();
						let end = scanner.getTokenEnd();
						const firstChar = text[start];
						if (firstChar === '\'' || firstChar === '"') {
							start++;
							end--;
						}
						regions.push(createEmbeddedRegion(attributeLanguageId, start, end, true));
					}
				}
				lastAttributeName = null;
				break;
		}
		token = scanner.scan();
	}
	return {
		getEmbeddedRegions: () => regions,
		getImportedScripts: () => importedScripts
	};

	function createEmbeddedRegion(languageId: string | undefined, start: number, end: number, attributeValue?: boolean) {
		const c: EmbeddedRegion = {
			languageId,
			start,
			generatedStart: 0,
			length: end - start,
			attributeValue,
			content: '',
		};
		c.content += getPrefix(c);
		c.generatedStart += c.content.length;
		c.content += updateContent(c, text.substring(start, end));
		c.content += getSuffix(c);
		return c;
	}
}

function getPrefix(c: EmbeddedRegion) {
	if (c.attributeValue) {
		switch (c.languageId) {
			case 'css': return CSS_STYLE_RULE + '{';
		}
	}
	return '';
}
function getSuffix(c: EmbeddedRegion) {
	if (c.attributeValue) {
		switch (c.languageId) {
			case 'css': return '}';
			case 'javascript': return ';';
		}
	}
	return '';
}
function updateContent(c: EmbeddedRegion, content: string): string {
	if (!c.attributeValue && c.languageId === 'javascript') {
		return content.replace(`<!--`, `/* `).replace(`-->`, ` */`);
	}
	return content;
}

function getAttributeLanguage(attributeName: string): string | null {
	const match = attributeName.match(/^(style)$|^(on\w+)$/i);
	if (!match) {
		return null;
	}
	return match[1] ? 'css' : 'javascript';
}
