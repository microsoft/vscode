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
import EditorCommon = require('vs/editor/common/editorCommon');
import Modes = require('vs/editor/common/modes');
import strings = require('vs/base/common/strings');
import {Position} from 'vs/editor/common/core/position';
import {IWorkspaceContextService} from 'vs/platform/workspace/common/workspace';
import {IMarkerService} from 'vs/platform/markers/common/markers';
import {IResourceService} from 'vs/editor/common/services/resourceService';
import {getScanner, IHTMLScanner} from 'vs/languages/html/common/htmlScanner';
import {isTag, DELIM_END, DELIM_START, DELIM_ASSIGN, ATTRIB_NAME, ATTRIB_VALUE} from 'vs/languages/html/common/htmlTokenTypes';
import {isEmptyElement} from 'vs/languages/html/common/htmlEmptyTagsShared';
import {filterSuggestions} from 'vs/editor/common/modes/supports/suggestSupport';
import paths = require('vs/base/common/paths');

enum LinkDetectionState {
	LOOKING_FOR_HREF_OR_SRC = 1,
	AFTER_HREF_OR_SRC = 2
}

interface IColorRange {
	range:EditorCommon.IRange;
	value:string;
}

export class HTMLWorker {

	private _contextService: IWorkspaceContextService;
	private resourceService:IResourceService;
	private markerService: IMarkerService;
	private _modeId: string;
	private _tagProviders: htmlTags.IHTMLTagProvider[];
	private formatSettings: any;

	constructor(
		modeId: string,
		participants: Modes.IWorkerParticipant[],
		@IResourceService resourceService: IResourceService,
		@IMarkerService markerService: IMarkerService,
		@IWorkspaceContextService contextService:IWorkspaceContextService
	) {

		this._modeId = modeId;
		this.resourceService = resourceService;
		this.markerService = markerService;
		this._contextService = contextService;

		this._tagProviders = [];
		this._tagProviders.push(htmlTags.getHTML5TagProvider());

		this.addCustomTagProviders(this._tagProviders);
	}

	protected addCustomTagProviders(providers: htmlTags.IHTMLTagProvider[]): void {
		providers.push(htmlTags.getAngularTagProvider());
		providers.push(htmlTags.getIonicTagProvider());
	}

	public format(resource: URI, range: EditorCommon.IRange, options: Modes.IFormattingOptions): winjs.TPromise<EditorCommon.ISingleEditOperation[]> {
		return this._delegateToModeAtPosition(resource, Position.startPosition(range), (isEmbeddedMode, model) => {
			if (isEmbeddedMode && model.getMode().formattingSupport) {
				return model.getMode().formattingSupport.formatRange(model.getAssociatedResource(), range, options);
			}

			return this.formatHTML(resource, range, options);
		});
	}

	private formatHTML(resource: URI, range: EditorCommon.IRange, options: Modes.IFormattingOptions): winjs.TPromise<EditorCommon.ISingleEditOperation[]> {
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
		if (this.formatSettings && this.formatSettings.hasOwnProperty(key)) {
			let value = this.formatSettings[key];
			if (value !== null) {
				return value;
			}
		}
		return dflt;
	}

	private getTagsFormatOption(key: string, dflt: string[]): string[] {
		let list = <string> this.getFormatOption(key, null);
		if (list) {
			return list.split(',').map(t => t.trim().toLowerCase());
		}
		return dflt;
	}

	_doConfigure(options: any): winjs.TPromise<void> {
		this.formatSettings = options && options.format;
		return winjs.TPromise.as(null);
	}

	_delegateToModeAtPosition<T>(resource:URI, position:EditorCommon.IPosition, callback:(isEmbeddedMode:boolean, model:EditorCommon.IMirrorModel) => T): T {
		let model = this.resourceService.get(resource);

		if (!model) {
			return null;
		}

		let modelAtPosition = model.getEmbeddedAtPosition(position);

		if (!modelAtPosition) {
			return callback(false, model);
		}

		let modeAtPosition = modelAtPosition.getMode();

		return callback(modeAtPosition.getId() !== this._modeId, modelAtPosition);
	}

	_delegateToAllModes<T>(resource:URI, callback:(models:EditorCommon.IMirrorModel[]) => T): T {
		let model = this.resourceService.get(resource);

		if (!model) {
			return null;
		}

		return callback(model.getAllEmbedded());
	}

	public computeInfo(resource:URI, position:EditorCommon.IPosition): winjs.TPromise<Modes.IComputeExtraInfoResult> {
		return this._delegateToModeAtPosition(resource, position, (isEmbeddedMode, model) => {
			if (isEmbeddedMode && model.getMode().extraInfoSupport) {
				return model.getMode().extraInfoSupport.computeInfo(model.getAssociatedResource(), position);
			}
		});
	}

	public findReferences(resource:URI, position:EditorCommon.IPosition, includeDeclaration:boolean): winjs.TPromise<Modes.IReference[]> {
		return this._delegateToModeAtPosition(resource, position, (isEmbeddedMode, model) => {
			if (isEmbeddedMode && model.getMode().referenceSupport) {
				return model.getMode().referenceSupport.findReferences(model.getAssociatedResource(), position, includeDeclaration);
			}
		});
	}

	public getRangesToPosition(resource:URI, position:EditorCommon.IPosition):winjs.TPromise<Modes.ILogicalSelectionEntry[]> {
		return this._delegateToModeAtPosition(resource, position, (isEmbeddedMode, model) => {
			if (isEmbeddedMode && model.getMode().logicalSelectionSupport) {
				return model.getMode().logicalSelectionSupport.getRangesToPosition(model.getAssociatedResource(), position);
			}
		});
	}

	public findDeclaration(resource:URI, position:EditorCommon.IPosition):winjs.TPromise<Modes.IReference> {
		return this._delegateToModeAtPosition(resource, position, (isEmbeddedMode, model) => {
			if (isEmbeddedMode && model.getMode().declarationSupport) {
				return model.getMode().declarationSupport.findDeclaration(model.getAssociatedResource(), position);
			}
		});
	}

	public findColorDeclarations(resource:URI):winjs.TPromise<{range:EditorCommon.IRange; value:string; }[]> {
		return this._delegateToAllModes(resource, (models) => {
			let allPromises: winjs.TPromise<IColorRange[]>[] = [];

			allPromises = models
				.filter((model) => (typeof model.getMode()['findColorDeclarations'] === 'function'))
				.map((model) => model.getMode()['findColorDeclarations'](model.getAssociatedResource()));

			return winjs.TPromise.join(allPromises).then((results:IColorRange[][]) => {
				let result:IColorRange[] = [];

				results.forEach((oneResult) => result = result.concat(oneResult));

				return result;
			});
		});
	}

	public getParameterHints(resource:URI, position:EditorCommon.IPosition):winjs.TPromise<Modes.IParameterHints> {
		return this._delegateToModeAtPosition(resource, position, (isEmbeddedMode, model) => {
			if (isEmbeddedMode && model.getMode().parameterHintsSupport) {
				return model.getMode().parameterHintsSupport.getParameterHints(model.getAssociatedResource(), position);
			}
		});
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

	private collectTagSuggestions(scanner: IHTMLScanner, position: EditorCommon.IPosition, suggestions: Modes.ISuggestResult): void {
		let model = scanner.getModel();
		let contentAfter = model.getLineContent(position.lineNumber).substr(position.column - 1);
		let closeTag = isWhiteSpace(contentAfter) || strings.startsWith(contentAfter, '<') ? '>' : '';

		let collectClosingTagSuggestion = (overwriteBefore: number) => {
			let endPosition = scanner.getTokenPosition();
			let matchingTag = this.findMatchingOpenTag(scanner);
			if (matchingTag) {
				let suggestion : Modes.ISuggestion = {
					label: '/' + matchingTag,
					codeSnippet: '/' + matchingTag + closeTag,
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
						suggestion.codeSnippet = startIndent + '</' + matchingTag + closeTag;
					}
				}
				return true;
			}
			return false;
		};


		if (scanner.getTokenType() === DELIM_END) {
			let hasClose = collectClosingTagSuggestion(suggestions.currentWord.length + 1);
			if (!hasClose) {
				this._tagProviders.forEach((provider) => {
					provider.collectTags((tag, label) => {
						suggestions.suggestions.push({
							label: '/' + tag,
							overwriteBefore: suggestions.currentWord.length + 1,
							codeSnippet: '/' + tag + closeTag,
							type: 'property',
							documentationLabel: label
						});
					});
				});
			}
		} else {
			collectClosingTagSuggestion(suggestions.currentWord.length);

			this._tagProviders.forEach((provider) => {
				provider.collectTags((tag, label) => {
					suggestions.suggestions.push({
						label: tag,
						codeSnippet: tag,
						type: 'property',
						documentationLabel: label
					});
				});
			});
		}

	}

	private collectContentSuggestions(suggestions: Modes.ISuggestResult): void {
		// disable the simple snippets in favor of the emmet templates
	}

	private collectAttributeSuggestions(scanner: IHTMLScanner, suggestions: Modes.ISuggestResult): void {
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

		this._tagProviders.forEach((provider) => {
			provider.collectAttributes(parentTag,(attribute, type) => {
				let codeSnippet = attribute;
				if (type !== 'v') {
					codeSnippet = codeSnippet + '="{{}}"';
				}
				suggestions.suggestions.push({
					label: attribute,
					codeSnippet: codeSnippet,
					type: type === 'handler' ? 'function' : 'value'
				});
			});
		});
	}

	private collectAttributeValueSuggestions(scanner: IHTMLScanner, suggestions:  Modes.ISuggestResult): void {
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

		this._tagProviders.forEach((provider) => {
			provider.collectValues(parentTag, attribute,(value) => {
				suggestions.suggestions.push({
					label: value,
					codeSnippet: needsQuotes ? '"' + value + '"' : value,
					type: 'unit'
				});
			});
		});
	}

	public suggest(resource:URI, position:EditorCommon.IPosition, triggerCharacter?:string):winjs.TPromise<Modes.ISuggestResult[]> {
		return this._delegateToModeAtPosition(resource, position, (isEmbeddedMode, model) => {
			if (isEmbeddedMode && model.getMode().suggestSupport) {
				return model.getMode().suggestSupport.suggest(model.getAssociatedResource(), position, triggerCharacter);
			}

			return this.suggestHTML(resource, position);
		});
	}

	private suggestHTML(resource:URI, position:EditorCommon.IPosition):winjs.TPromise<Modes.ISuggestResult[]> {
		return this.doSuggest(resource, position).then(value => filterSuggestions(value));
	}

	private doSuggest(resource: URI, position: EditorCommon.IPosition): winjs.TPromise<Modes.ISuggestResult> {

		let model = this.resourceService.get(resource),
			currentWord = model.getWordUntilPosition(position).word;

		let suggestions: Modes.ISuggestResult = {
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

	private findMatchingBracket(tagname: string, scanner: IHTMLScanner) : EditorCommon.IRange {
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

	public findOccurrences(resource:URI, position:EditorCommon.IPosition, strict:boolean = false): winjs.TPromise<Modes.IOccurence[]> {
		return this._delegateToModeAtPosition(resource, position, (isEmbeddedMode, model) => {
			if (isEmbeddedMode && model.getMode().occurrencesSupport) {
				return model.getMode().occurrencesSupport.findOccurrences(model.getAssociatedResource(), position, strict);
			}

			return this.findOccurrencesHTML(resource, position, strict);
		});
	}

	public findOccurrencesHTML(resource:URI, position:EditorCommon.IPosition, strict?:boolean):winjs.TPromise<Modes.IOccurence[]> {

		let model = this.resourceService.get(resource),
			wordAtPosition = model.getWordAtPosition(position),
			currentWord = (wordAtPosition ? wordAtPosition.word : ''),
			result:Modes.IOccurence[] = [];


		let scanner = getScanner(model, position);
		if (isTag(scanner.getTokenType())) {
			let tagname = scanner.getTokenContent();
			result.push({
				range: scanner.getTokenRange()
			});
			let range = this.findMatchingBracket(tagname, scanner);
			if (range) {
				result.push({
					range: range
				});
			}
		} else {
			let words = model.getAllWordsWithRange(),
				upperBound = Math.min(1000, words.length); // Limit find occurences to 1000 occurences

			for(let i = 0; i < upperBound; i++) {
				if(words[i].text === currentWord) {
					result.push({
						range: words[i].range
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
		let potentialResult = modelAbsoluteUri.withPath(alternativeResultPath).toString();

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

	private createLink(modelAbsoluteUrl: URI, rootAbsoluteUrl: URI, tokenContent: string, lineNumber: number, startColumn: number, endColumn: number): Modes.ILink {
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

	private _computeHTMLLinks(model: EditorCommon.IMirrorModel): Modes.ILink[] {
		let lineCount = model.getLineCount(),
			newLinks: Modes.ILink[] = [],
			state: LinkDetectionState = LinkDetectionState.LOOKING_FOR_HREF_OR_SRC,
			modelAbsoluteUrl = model.getAssociatedResource(),
			lineNumber: number,
			lineContent: string,
			lineContentLength: number,
			tokens: EditorCommon.ILineTokens,
			tokenType: string,
			tokensLength: number,
			i: number,
			nextTokenEndIndex: number,
			tokenContent: string,
			link: Modes.ILink;

		let rootAbsoluteUrl: URI = null;
		let workspace = this._contextService.getWorkspace();
		if (workspace) {
			// The workspace can be null in the no folder opened case
			let strRootAbsoluteUrl = String(workspace.resource);
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

	public computeLinks(resource: URI): winjs.TPromise<Modes.ILink[]> {
		let model = this.resourceService.get(resource);
		return winjs.TPromise.as(this._computeHTMLLinks(model));
	}
}

function isWhiteSpace(s:string) : boolean {
	return /^\s*$/.test(s);
}
