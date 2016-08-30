/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import URI from 'vs/base/common/uri';
import winjs = require('vs/base/common/winjs.base');
import beautifyHTML = require('vs/languages/lib/common/beautify-html');
import htmlTags = require('vs/languages/html/common/htmlTags');
import network = require('vs/base/common/network');
import editorCommon = require('vs/editor/common/editorCommon');
import modes = require('vs/editor/common/modes');
import strings = require('vs/base/common/strings');
import {IResourceService} from 'vs/editor/common/services/resourceService';
import {getScanner, IHTMLScanner} from 'vs/languages/html/common/htmlScanner';
import {isTag, DELIM_END, DELIM_START, DELIM_ASSIGN, ATTRIB_NAME, ATTRIB_VALUE} from 'vs/languages/html/common/htmlTokenTypes';
import {isEmptyElement} from 'vs/languages/html/common/htmlEmptyTagsShared';
import {filterSuggestions} from 'vs/editor/common/modes/supports/suggestSupport';
import paths = require('vs/base/common/paths');
import {IHTMLConfiguration, IHTMLFormatConfiguration} from 'vs/languages/html/common/html.contribution';

enum LinkDetectionState {
	LOOKING_FOR_HREF_OR_SRC = 1,
	AFTER_HREF_OR_SRC = 2
}

interface IColorRange {
	range:editorCommon.IRange;
	value:string;
}

export class HTMLWorker {

	private resourceService:IResourceService;
	private _modeId: string;
	private _tagProviders: htmlTags.IHTMLTagProvider[];
	private _formatSettings: IHTMLFormatConfiguration;
	private _providerConfiguration: {[providerId:string]:boolean};

	constructor(
		modeId: string,
		@IResourceService resourceService: IResourceService
	) {

		this._modeId = modeId;
		this.resourceService = resourceService;

		this._tagProviders = [];
		this._tagProviders.push(htmlTags.getHTML5TagProvider());

		this.addCustomTagProviders(this._tagProviders);

		this._providerConfiguration = null;
	}

	protected addCustomTagProviders(providers: htmlTags.IHTMLTagProvider[]): void {
		providers.push(htmlTags.getAngularTagProvider());
		providers.push(htmlTags.getIonicTagProvider());
	}

	private getTagProviders(): htmlTags.IHTMLTagProvider[] {
		if (this._modeId !== 'html' || !this._providerConfiguration) {
			return this._tagProviders;
		}
		return this._tagProviders.filter(p => !!this._providerConfiguration[p.getId()]);
	}

	public provideDocumentRangeFormattingEdits(resource: URI, range: editorCommon.IRange, options: modes.FormattingOptions): winjs.TPromise<editorCommon.ISingleEditOperation[]> {
		return this.formatHTML(resource, range, options);
	}

	private formatHTML(resource: URI, range: editorCommon.IRange, options: modes.FormattingOptions): winjs.TPromise<editorCommon.ISingleEditOperation[]> {
		let model = this.resourceService.get(resource);
		let value = range ? model.getValueInRange(range) : model.getValue();

		let htmlOptions : beautifyHTML.IBeautifyHTMLOptions = {
			indent_size: options.insertSpaces ? options.tabSize : 1,
			indent_char: options.insertSpaces ? ' ' : '\t',
			wrap_line_length: this.getFormatOption('wrapLineLength', 120),
			unformatted: this.getTagsFormatOption('unformatted', void 0),
			indent_inner_html: this.getFormatOption('indentInnerHtml', false),
			preserve_newlines: this.getFormatOption('preserveNewLines', false),
			max_preserve_newlines: this.getFormatOption('maxPreserveNewLines', void 0),
			indent_handlebars: this.getFormatOption('indentHandlebars', false),
			end_with_newline: this.getFormatOption('endWithNewline', false),
			extra_liners: this.getTagsFormatOption('extraLiners', void 0),
		};

		let result = beautifyHTML.html_beautify(value, htmlOptions);

		return winjs.TPromise.as([{
			range: range,
			text: result
		}]);
	}

	private getFormatOption(key: string, dflt: any): any {
		if (this._formatSettings && this._formatSettings.hasOwnProperty(key)) {
			let value = this._formatSettings[key];
			if (value !== null) {
				return value;
			}
		}
		return dflt;
	}

	private getTagsFormatOption(key: string, dflt: string[]): string[] {
		let list = <string> this.getFormatOption(key, null);
		if (typeof list === 'string') {
			if (list.length > 0) {
				return list.split(',').map(t => t.trim().toLowerCase());
			}
			return [];
		}
		return dflt;
	}

	_doConfigure(options: IHTMLConfiguration): winjs.TPromise<void> {
		this._formatSettings = options && options.format;
		if (options && options.suggest) {
			this._providerConfiguration = options.suggest;
		}
		return winjs.TPromise.as(null);
	}

	private findMatchingOpenTag(scanner: IHTMLScanner) : string {
		let closedTags : { [name:string]: number } = {};
		let tagClosed = false;
		while (scanner.scanBack()) {
			if (isTag(scanner.getTokenType()) && !tagClosed) {
				let tag = scanner.getTokenContent();
				scanner.scanBack();
				if (scanner.getTokenType() === DELIM_END) {
					closedTags[tag] = (closedTags[tag] || 0) + 1;
				} else if (!isEmptyElement(tag)) {
					if (closedTags[tag]) {
						closedTags[tag]--;
					} else {
						return tag;
					}
				}
			} else if (scanner.getTokenType() === DELIM_START) {
				tagClosed = scanner.getTokenContent() === '/>';
			}
		}
		return null;
	}

	private collectTagSuggestions(scanner: IHTMLScanner, position: editorCommon.IPosition, suggestions: modes.ISuggestResult): void {
		let model = scanner.getModel();
		let currentLine = model.getLineContent(position.lineNumber);
		let contentAfter = currentLine.substr(position.column - 1);
		let closeTag = isWhiteSpace(contentAfter) || strings.startsWith(contentAfter, '<') ? '>' : '';

		let collectClosingTagSuggestion = (overwriteBefore: number) => {
			let endPosition = scanner.getTokenPosition();
			let matchingTag = this.findMatchingOpenTag(scanner);
			if (matchingTag) {
				let suggestion : modes.ISuggestion = {
					label: '/' + matchingTag,
					insertText: '/' + matchingTag + closeTag,
					overwriteBefore: overwriteBefore,
					type: 'property'
				};
				suggestions.suggestions.push(suggestion);

				// use indent from start tag
				let startPosition = scanner.getTokenPosition();
				if (endPosition.lineNumber !== startPosition.lineNumber) {
					let startIndent = model.getLineContent(startPosition.lineNumber).substring(0, startPosition.column - 1);
					let endIndent = model.getLineContent(endPosition.lineNumber).substring(0, endPosition.column - 1);
					if (isWhiteSpace(startIndent) && isWhiteSpace(endIndent)) {
						suggestion.overwriteBefore = position.column - 1; // replace from start of line
						suggestion.insertText = startIndent + '</' + matchingTag + closeTag;
						suggestion.filterText = endIndent + '</' + matchingTag + closeTag;
					}
				}
				return true;
			}
			return false;
		};


		if (scanner.getTokenType() === DELIM_END && scanner.getTokenRange().endColumn === position.column) {
			let hasClose = collectClosingTagSuggestion(suggestions.currentWord.length + 1);
			if (!hasClose) {
				this.getTagProviders().forEach((provider) => {
					provider.collectTags((tag, label) => {
						suggestions.suggestions.push({
							label: '/' + tag,
							overwriteBefore: suggestions.currentWord.length + 1,
							insertText: '/' + tag + closeTag,
							type: 'property',
							documentation: label,
							filterText: '</' + tag + closeTag
						});
					});
				});
			}
		} else {
			collectClosingTagSuggestion(suggestions.currentWord.length);

			this.getTagProviders().forEach((provider) => {
				provider.collectTags((tag, label) => {
					suggestions.suggestions.push({
						label: tag,
						insertText: tag,
						type: 'property',
						documentation: label,
						overwriteBefore: suggestions.currentWord.length
					});
				});
			});
		}

	}

	private collectContentSuggestions(suggestions: modes.ISuggestResult): void {
		// disable the simple snippets in favor of the emmet templates
	}

	private collectAttributeSuggestions(scanner: IHTMLScanner, suggestions: modes.ISuggestResult): void {
		let parentTag: string = null;
		do {
			if (isTag(scanner.getTokenType())) {
				parentTag = scanner.getTokenContent();
				break;
			}
			if (scanner.getTokenType() === DELIM_START) {
				break;
			}
		} while (scanner.scanBack());

		this.getTagProviders().forEach((provider) => {
			provider.collectAttributes(parentTag,(attribute, type) => {
				let codeSnippet = attribute;
				if (type !== 'v') {
					codeSnippet = codeSnippet + '="{{}}"';
				}
				suggestions.suggestions.push({
					label: attribute,
					insertText: codeSnippet,
					type: type === 'handler' ? 'function' : 'value',
					overwriteBefore: suggestions.currentWord.length
				});
			});
		});
	}

	private collectAttributeValueSuggestions(scanner: IHTMLScanner, suggestions: modes.ISuggestResult): void {
		let needsQuotes = scanner.getTokenType() === DELIM_ASSIGN;

		let attribute: string = null;
		let parentTag: string = null;
		while (scanner.scanBack()) {
			if (scanner.getTokenType() === ATTRIB_NAME) {
				attribute = scanner.getTokenContent();
				break;
			}
		}
		while (scanner.scanBack()) {
			if (isTag(scanner.getTokenType())) {
				parentTag = scanner.getTokenContent();
				break;
			}
			if (scanner.getTokenType() === DELIM_START) {
				return;
			}
		}

		this.getTagProviders().forEach((provider) => {
			provider.collectValues(parentTag, attribute,(value) => {
				suggestions.suggestions.push({
					label: value,
					insertText: needsQuotes ? '"' + value + '"' : value,
					type: 'unit',
					overwriteBefore: suggestions.currentWord.length
				});
			});
		});
	}

	public provideCompletionItems(resource:URI, position:editorCommon.IPosition):winjs.TPromise<modes.ISuggestResult> {
		let model = this.resourceService.get(resource);
		let modeIdAtPosition = model.getModeIdAtPosition(position.lineNumber, position.column);
		if (modeIdAtPosition === this._modeId) {
			return this.suggestHTML(resource, position);
		}
	}

	private suggestHTML(resource:URI, position:editorCommon.IPosition):winjs.TPromise<modes.ISuggestResult> {
		return this.doSuggest(resource, position).then(value => filterSuggestions(value));
	}

	private doSuggest(resource: URI, position: editorCommon.IPosition): winjs.TPromise<modes.ISuggestResult> {

		let model = this.resourceService.get(resource),
			currentWord = model.getWordUntilPosition(position).word;

		let suggestions: modes.ISuggestResult = {
			currentWord: currentWord,
			suggestions: [],
		};

		let scanner = getScanner(model, position);
		switch (scanner.getTokenType()) {
			case DELIM_START:
			case DELIM_END:
				if (scanner.isOpenBrace()) {
					this.collectTagSuggestions(scanner, position, suggestions);
				} else {
					this.collectContentSuggestions(suggestions);
				}
				break;
			case ATTRIB_NAME:
				this.collectAttributeSuggestions(scanner, suggestions);
				break;
			case ATTRIB_VALUE:
				this.collectAttributeValueSuggestions(scanner, suggestions);
				break;
			case DELIM_ASSIGN:
				if (scanner.isAtTokenEnd()) {
					this.collectAttributeValueSuggestions(scanner, suggestions);
				}
				break;
			case '':
				if (isWhiteSpace(scanner.getTokenContent()) && scanner.scanBack()) { // go one back
					switch (scanner.getTokenType()) {
						case ATTRIB_VALUE:
						case ATTRIB_NAME:
							this.collectAttributeSuggestions(scanner, suggestions);
							break;
						case DELIM_ASSIGN:
							this.collectAttributeValueSuggestions(scanner, suggestions);
							break;
						case DELIM_START:
						case DELIM_END:
							if (scanner.isOpenBrace()) {
								this.collectTagSuggestions(scanner, position, suggestions);
							} else {
								this.collectContentSuggestions(suggestions);
							}
							break;
						default:
							if (isTag(scanner.getTokenType())) {
								this.collectAttributeSuggestions(scanner, suggestions);
							}
					}
				} else {
					this.collectContentSuggestions(suggestions);
				}
				break;
			default:
				if (isTag(scanner.getTokenType())) {
					scanner.scanBack(); // one back to the end/start bracket
					this.collectTagSuggestions(scanner, position, suggestions);
				}
		}
		return winjs.TPromise.as(suggestions);
	}

	private findMatchingBracket(tagname: string, scanner: IHTMLScanner) : editorCommon.IRange {
		if (isEmptyElement(tagname)) {
			return null;
		}
		let tagCount = 0;
		scanner.scanBack(); // one back to the end/start bracket
		if (scanner.getTokenType() === DELIM_END) {
			// find the opening tag
			let tagClosed = false;
			while (scanner.scanBack()) {
				if (isTag(scanner.getTokenType()) && scanner.getTokenContent() === tagname && !tagClosed) {
					let range = scanner.getTokenRange();
					scanner.scanBack(); // one back to the end/start bracket
					if (scanner.getTokenType() === DELIM_START) {
						if (tagCount === 0) {
							return range;
						} else {
							tagCount--;
						}
					} else {
						tagCount++;
					}
				} else if (scanner.getTokenType() === DELIM_START) {
					tagClosed = scanner.getTokenContent() === '/>';
				}
			}
		} else {
			let isTagEnd = false;
			while (scanner.scanForward()) {
				if (isTag(scanner.getTokenType()) && scanner.getTokenContent() === tagname) {
					if (!isTagEnd) {
						scanner.scanForward();
						if (scanner.getTokenType() === DELIM_START && scanner.getTokenContent() === '/>') {
							if (tagCount <= 0) {
								return null;
							}
						} else {
							tagCount++;
						}
					} else {
						tagCount--;
						if (tagCount <= 0) {
							return scanner.getTokenRange();
						}
					}
				} else if (scanner.getTokenType() === DELIM_START) {
					isTagEnd = false;
				} else if (scanner.getTokenType() === DELIM_END) {
					isTagEnd = true;
				}
			}
		}
		return null;

	}

	public provideDocumentHighlights(resource:URI, position:editorCommon.IPosition, strict:boolean = false): winjs.TPromise<modes.DocumentHighlight[]> {
		let model = this.resourceService.get(resource),
			wordAtPosition = model.getWordAtPosition(position),
			currentWord = (wordAtPosition ? wordAtPosition.word : ''),
			result:modes.DocumentHighlight[] = [];


		let scanner = getScanner(model, position);
		if (isTag(scanner.getTokenType())) {
			let tagname = scanner.getTokenContent();
			result.push({
				range: scanner.getTokenRange(),
				kind: modes.DocumentHighlightKind.Read
			});
			let range = this.findMatchingBracket(tagname, scanner);
			if (range) {
				result.push({
					range: range,
					kind: modes.DocumentHighlightKind.Read
				});
			}
		} else {
			let words = model.getAllWordsWithRange(),
				upperBound = Math.min(1000, words.length); // Limit find occurences to 1000 occurences

			for(let i = 0; i < upperBound; i++) {
				if(words[i].text === currentWord) {
					result.push({
						range: words[i].range,
					kind: modes.DocumentHighlightKind.Read
					});
				}
			}
		}
		return winjs.TPromise.as(result);
	}

	private static _stripQuotes(url: string): string {
		return url
			.replace(/^'([^']+)'$/,(substr, match1) => match1)
			.replace(/^"([^"]+)"$/,(substr, match1) => match1);
	}

	public static _getWorkspaceUrl(modelAbsoluteUri: URI, rootAbsoluteUri: URI, tokenContent: string): string {
		tokenContent = HTMLWorker._stripQuotes(tokenContent);

		if (/^\s*javascript\:/i.test(tokenContent) || /^\s*\#/i.test(tokenContent)) {
			return null;
		}

		if (/^\s*https?:\/\//i.test(tokenContent) || /^\s*file:\/\//i.test(tokenContent)) {
			// Absolute link that needs no treatment
			return tokenContent.replace(/^\s*/g, '');
		}

		if (/^\s*\/\//i.test(tokenContent)) {
			// Absolute link (that does not name the protocol)
			let pickedScheme = network.Schemas.http;
			if (modelAbsoluteUri.scheme === network.Schemas.https) {
				pickedScheme = network.Schemas.https;
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
		let potentialResult = modelAbsoluteUri.with({ path: alternativeResultPath }).toString();

		let rootAbsoluteUrlStr = (rootAbsoluteUri ? rootAbsoluteUri.toString() : null);
		if (rootAbsoluteUrlStr && strings.startsWith(modelAbsoluteUri.toString(), rootAbsoluteUrlStr)) {
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

	private createLink(modelAbsoluteUrl: URI, rootAbsoluteUrl: URI, tokenContent: string, lineNumber: number, startColumn: number, endColumn: number): modes.ILink {
		let workspaceUrl = HTMLWorker._getWorkspaceUrl(modelAbsoluteUrl, rootAbsoluteUrl, tokenContent);
		if (!workspaceUrl) {
			return null;
		}
		//		console.info('workspaceUrl: ' + workspaceUrl);

		return {
			range: {
				startLineNumber: lineNumber,
				startColumn: startColumn,
				endLineNumber: lineNumber,
				endColumn: endColumn
			},
			url: workspaceUrl
		};
	}

	private _computeHTMLLinks(model: editorCommon.IMirrorModel, workspaceResource:URI): modes.ILink[] {
		let lineCount = model.getLineCount(),
			newLinks: modes.ILink[] = [],
			state: LinkDetectionState = LinkDetectionState.LOOKING_FOR_HREF_OR_SRC,
			modelAbsoluteUrl = model.uri,
			lineNumber: number,
			lineContent: string,
			lineContentLength: number,
			tokens: editorCommon.ILineTokens,
			tokenType: string,
			tokensLength: number,
			i: number,
			nextTokenEndIndex: number,
			tokenContent: string,
			link: modes.ILink;

		let rootAbsoluteUrl: URI = null;
		if (workspaceResource) {
			// The workspace can be null in the no folder opened case
			let strRootAbsoluteUrl = String(workspaceResource);
			if (strRootAbsoluteUrl.charAt(strRootAbsoluteUrl.length - 1) === '/') {
				rootAbsoluteUrl = URI.parse(strRootAbsoluteUrl);
			} else {
				rootAbsoluteUrl = URI.parse(strRootAbsoluteUrl + '/');
			}
		}

		for (lineNumber = 1; lineNumber <= lineCount; lineNumber++) {
			lineContent = model.getLineContent(lineNumber);
			lineContentLength = lineContent.length;
			tokens = model.getLineTokens(lineNumber);

			for (i = 0, tokensLength = tokens.getTokenCount(); i < tokensLength; i++) {

				tokenType = tokens.getTokenType(i);

				switch (tokenType) {
					case DELIM_ASSIGN:
					case '':
						break;

					case ATTRIB_NAME:
						nextTokenEndIndex = tokens.getTokenEndIndex(i, lineContentLength);
						tokenContent = lineContent.substring(tokens.getTokenStartIndex(i), nextTokenEndIndex).toLowerCase();

						if (tokenContent === 'src' || tokenContent === 'href') {
							state = LinkDetectionState.AFTER_HREF_OR_SRC;
						} else {
							state = LinkDetectionState.LOOKING_FOR_HREF_OR_SRC;
						}
						break;

					case ATTRIB_VALUE:
						if (state === LinkDetectionState.AFTER_HREF_OR_SRC) {
							nextTokenEndIndex = tokens.getTokenEndIndex(i, lineContentLength);
							tokenContent = lineContent.substring(tokens.getTokenStartIndex(i), nextTokenEndIndex);

							link = this.createLink(modelAbsoluteUrl, rootAbsoluteUrl, tokenContent, lineNumber, tokens.getTokenStartIndex(i) + 2, nextTokenEndIndex);
							if (link) {
								newLinks.push(link);
							}

							state = LinkDetectionState.LOOKING_FOR_HREF_OR_SRC;
						}

					default:
						if (isTag(tokenType)) {
							state = LinkDetectionState.LOOKING_FOR_HREF_OR_SRC;
						} else if (state === LinkDetectionState.AFTER_HREF_OR_SRC) {
							state = LinkDetectionState.LOOKING_FOR_HREF_OR_SRC;
						}
				}
			}
		}

		return newLinks;
	}

	public provideLinks(resource: URI, workspaceResource:URI): winjs.TPromise<modes.ILink[]> {
		let model = this.resourceService.get(resource);
		return winjs.TPromise.as(this._computeHTMLLinks(model, workspaceResource));
	}
}

function isWhiteSpace(s:string) : boolean {
	return /^\s*$/.test(s);
}
