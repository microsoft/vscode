/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {TokenType, createScanner} from '../parser/htmlScanner';
import {TextDocument, Range} from 'vscode-languageserver-types';
import * as paths from '../utils/paths';
import * as strings from '../utils/strings';
import Uri from 'vscode-uri';

import {DocumentLink} from '../htmlLanguageService';

function stripQuotes(url: string): string {
	return url
		.replace(/^'([^']+)'$/,(substr, match1) => match1)
		.replace(/^"([^"]+)"$/,(substr, match1) => match1);
}

function getWorkspaceUrl(modelAbsoluteUri: Uri, rootAbsoluteUrl: Uri, tokenContent: string): string {
	if (/^\s*javascript\:/i.test(tokenContent) || /^\s*\#/i.test(tokenContent)) {
		return null;
	}

	if (/^\s*https?:\/\//i.test(tokenContent) || /^\s*file:\/\//i.test(tokenContent)) {
		// Absolute link that needs no treatment
		return tokenContent.replace(/^\s*/g, '');
	}

	if (/^\s*\/\//i.test(tokenContent)) {
		// Absolute link (that does not name the protocol)
		let pickedScheme = 'http';
		if (modelAbsoluteUri.scheme === 'https') {
			pickedScheme = 'https';
		}
		return pickedScheme + ':' + tokenContent.replace(/^\s*/g, '');
	}

	let modelPath = paths.dirname(modelAbsoluteUri.path);
	let alternativeResultPath: string = null;
	if (tokenContent.length > 0 && tokenContent.charAt(0) === '/') {
		alternativeResultPath = tokenContent;
	} else {
		alternativeResultPath = paths.join(modelPath, tokenContent);
		alternativeResultPath = alternativeResultPath.replace(/^(\/\.\.)+/, '');
	}
	let potentialResult = modelAbsoluteUri.with({ path: alternativeResultPath }).toString(true);

	let rootAbsoluteUrlStr = rootAbsoluteUrl && rootAbsoluteUrl.toString(true);
	if (rootAbsoluteUrlStr && strings.startsWith(modelAbsoluteUri.toString(true), rootAbsoluteUrlStr)) {
		// The `rootAbsoluteUrl` is set and matches our current model
		// We need to ensure that this `potentialResult` does not escape `rootAbsoluteUrl`

		let commonPrefixLength = strings.commonPrefixLength(rootAbsoluteUrlStr, potentialResult);
		if (strings.endsWith(rootAbsoluteUrlStr, '/')) {
			commonPrefixLength = potentialResult.lastIndexOf('/', commonPrefixLength) + 1;
		}
		return rootAbsoluteUrlStr + potentialResult.substr(commonPrefixLength);
	}

	return potentialResult;
}

function createLink(document: TextDocument, rootAbsoluteUrl: Uri, attributeValue: string, startOffset: number, endOffset: number): DocumentLink {
	let documentUri = Uri.parse(document.uri);
	let tokenContent = stripQuotes(attributeValue);
	if (tokenContent.length < attributeValue.length) {
		startOffset++;
		endOffset--;
	}
	let workspaceUrl = getWorkspaceUrl(documentUri, rootAbsoluteUrl, tokenContent);
	if (!workspaceUrl) {
		return null;
	}
	return {
		range: Range.create(document.positionAt(startOffset), document.positionAt(endOffset)),
		target: workspaceUrl
	};
}

export function findDocumentLinks(document: TextDocument, workspacePath:string): DocumentLink[] {
	let newLinks: DocumentLink[] = [];

	let rootAbsoluteUrl: Uri = null;
	if (workspacePath) {
		// The workspace can be null in the no folder opened case
		if (workspacePath.charAt(workspacePath.length - 1) !== '/') {
			workspacePath = workspacePath + '/';
		}
		rootAbsoluteUrl = Uri.parse(workspacePath);
	}

	let scanner = createScanner(document.getText(), 0);
	let token = scanner.scan();
	let afterHrefOrSrc = false;
	while (token !== TokenType.EOS) {
		switch (token) {
			case TokenType.AttributeName:
				let attributeName = scanner.getTokenText();
				afterHrefOrSrc = attributeName === 'src' || attributeName === 'href';
				break;
			case TokenType.AttributeValue:
				if (afterHrefOrSrc) {
					let attributeValue = scanner.getTokenText();
					let link = createLink(document, rootAbsoluteUrl, attributeValue, scanner.getTokenOffset(), scanner.getTokenEnd());
					if (link) {
						newLinks.push(link);
					}
					afterHrefOrSrc = false;
				}
				break;
		}
		token =  scanner.scan();
	}
	return newLinks;
}