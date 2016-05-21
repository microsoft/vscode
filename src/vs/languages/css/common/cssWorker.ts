/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import nls = require('vs/nls');
import URI from 'vs/base/common/uri';
import _severity from 'vs/base/common/severity';
import strings = require('vs/base/common/strings');
import winjs = require('vs/base/common/winjs.base');
import languageService = require('vs/languages/css/common/services/cssLanguageService');
import languageFacts = require('vs/languages/css/common/services/languageFacts');
import occurrences = require('./services/occurrences');
import cssIntellisense = require('vs/languages/css/common/services/intelliSense');
import editorCommon = require('vs/editor/common/editorCommon');
import modes = require('vs/editor/common/modes');
import nodes = require('vs/languages/css/common/parser/cssNodes');
import _level = require('vs/languages/css/common/level');
import parser = require('vs/languages/css/common/parser/cssParser');
import selectorPrinting = require('vs/languages/css/common/services/selectorPrinting');
import lint = require('vs/languages/css/common/services/lint');
import lintRules = require('vs/languages/css/common/services/lintRules');
import {IMarker, IMarkerData} from 'vs/platform/markers/common/markers';
import {IMarkerService} from 'vs/platform/markers/common/markers';
import {Range} from 'vs/editor/common/core/range';
import {IResourceService} from 'vs/editor/common/services/resourceService';
import {filterSuggestions} from 'vs/editor/common/modes/supports/suggestSupport';
import {ValidationHelper} from 'vs/editor/common/worker/validationHelper';

export class CSSWorker {

	public languageService: languageService.ILanguageService;
	private resourceService:IResourceService;
	private markerService: IMarkerService;
	private _modeId: string;
	private validationEnabled : boolean;
	private lintSettings : lintRules.IConfigurationSettings;
	private _validationHelper: ValidationHelper;

	constructor(
		modeId: string,
		@IResourceService resourceService: IResourceService,
		@IMarkerService markerService: IMarkerService
	) {

		this._modeId = modeId;
		this.resourceService = resourceService;
		this.markerService = markerService;

		this._validationHelper = new ValidationHelper(
			this.resourceService,
			this._modeId,
			(toValidate) => this.doValidate(toValidate)
		);

		this.languageService = this.createLanguageService(resourceService, modeId);
		this.lintSettings = {};
		this.validationEnabled = true;
	}

	public navigateValueSet(resource:URI, range:editorCommon.IRange, up:boolean):winjs.TPromise<modes.IInplaceReplaceSupportResult> {
		return this.languageService.join().then(() => {

			let model = this.resourceService.get(resource);
			let offset = model.getOffsetFromPosition({ lineNumber: range.startLineNumber, column: range.startColumn });
			let styleSheet = this.languageService.getStylesheet(resource);

			let node = nodes.getNodeAtOffset(styleSheet, offset);
			if (!node) {
				return;
			}
			let declaration = nodes.getParentDeclaration(node);
			if (!declaration) {
				return;
			}

			let entry: languageFacts.IEntry = languageFacts.getProperties()[declaration.getFullPropertyName()];
			if (!entry || !entry.values) {
				return;
			}

			let values = entry.values.filter(value => languageFacts.isCommonValue(value)).map(v => v.name);

			let isColor = (entry.restrictions.indexOf('color') >= 0);
			if (isColor) {
				values = values.concat(Object.getOwnPropertyNames(languageFacts.colors), Object.getOwnPropertyNames(languageFacts.colorKeywords));
			}

			let text = node.getText();
			for (let i = 0, len = values.length; i < len; i++) {
				if (strings.equalsIgnoreCase(values[i], text)) {
					let nextIdx = i;
					if(up) {
						nextIdx = (i + 1) % len;
					} else {
						nextIdx =  i - 1;
						if(nextIdx < 0) {
							nextIdx = len - 1;
						}
					}
					let result:modes.IInplaceReplaceSupportResult = {
						value: values[nextIdx],
						range: this._range(node, model)
					};
					return result;
				}
			}
			// if none matches, take the first one
			if (values.length > 0) {
				let result:modes.IInplaceReplaceSupportResult = {
					value: values[0],
					range: this._range(node, model)
				};
				return result;
			}

			return null;
		});
	}

	public createLanguageService(resourceService:IResourceService, modeId:string): languageService.CSSLanguageService {
		return new languageService.CSSLanguageService(resourceService, this.createParser.bind(this), modeId);
	}

	public createParser() : parser.Parser {
		return new parser.Parser();
	}

	_doConfigure(raw:any): winjs.TPromise<void> {
		if (raw) {
			this.validationEnabled = raw.validate;
			if (raw.lint) {
				this.lintSettings = lintRules.sanitize(raw.lint);
			} else {
				this.lintSettings = {};
			}
			this._validationHelper.triggerDueToConfigurationChange();
		}

		return winjs.TPromise.as(void 0);
	}

	public enableValidator(): winjs.TPromise<void> {
		this._validationHelper.enable();
		return winjs.TPromise.as(null);
	}

	public doValidate(resources: URI[]):void {
		for (var i = 0; i < resources.length; i++) {
			this.doValidate1(resources[i]);
		}
	}

	private doValidate1(resource: URI):void {
		if (!this.validationEnabled) {
			this.markerService.changeOne(this._modeId, resource, []);
			return;
		}

		this.languageService.join().then(() => {

			let modelMirror = this.resourceService.get(resource),
				node = this.languageService.getStylesheet(resource),
				entries: nodes.IMarker[] = [];

			entries.push.apply(entries, nodes.ParseErrorCollector.entries(node));
			entries.push.apply(entries, this.collectLintEntries(node));

			let markerData = entries
				.filter(entry => entry.getLevel() !== _level.Level.Ignore)
				.map(entry => this._createMarkerData(modelMirror, entry));

			this.markerService.changeOne(this._modeId, resource, markerData);
		});
	}

	private _createMarkerData(model: editorCommon.IMirrorModel, marker: nodes.IMarker): IMarkerData {
		let range = model.getRangeFromOffsetAndLength(marker.getOffset(), marker.getLength());
		return <IMarkerData> {
			code: marker.getRule().id,
			message: marker.getMessage(),
			severity: marker.getLevel() === _level.Level.Warning ? _severity.Warning : _severity.Error,
			startLineNumber: range.startLineNumber,
			startColumn: range.startColumn,
			endLineNumber: range.endLineNumber,
			endColumn: range.endColumn
		};
	}

	public collectLintEntries(stylesheet:nodes.Stylesheet):nodes.IMarker[] {
		return lint.LintVisitor.entries(stylesheet, this.lintSettings);
	}

	public createIntellisense(): cssIntellisense.CSSIntellisense {
		return new cssIntellisense.CSSIntellisense();
	}

	public provideCompletionItems(resource:URI, position:editorCommon.IPosition):winjs.TPromise<modes.ISuggestResult[]> {
		return this.doSuggest(resource, position).then(value => filterSuggestions(value));
	}

	private doSuggest(resource:URI, position:editorCommon.IPosition):winjs.TPromise<modes.ISuggestResult> {

		return this.languageService.join().then(() => {

			let model = this.resourceService.get(resource);
			let result = this.createIntellisense().getCompletionsAtPosition(this.languageService, model, resource, position);
			return result;
		});

	}

	public provideDocumentSymbols(resource:URI):winjs.TPromise<modes.SymbolInformation[]> {

		return this.languageService.join().then(() => {

			let model = this.resourceService.get(resource),
				stylesheet = this.languageService.getStylesheet(resource),
				result:modes.SymbolInformation[] = [];

			stylesheet.accept((node) => {

				let entry:modes.SymbolInformation = {
					name: null,
					kind: modes.SymbolKind.Class, // TODO@Martin: find a good SymbolKind
					location: null
				};

				if(node instanceof nodes.Selector) {
					entry.name = node.getText();
				} else if(node instanceof nodes.VariableDeclaration) {
					entry.name = (<nodes.VariableDeclaration> node).getName();
					entry.kind = modes.SymbolKind.Variable;
				} else if(node instanceof nodes.MixinDeclaration) {
					entry.name = (<nodes.MixinDeclaration> node).getName();
					entry.kind = modes.SymbolKind.Method;
				} else if(node instanceof nodes.FunctionDeclaration) {
					entry.name = (<nodes.FunctionDeclaration> node).getName();
					entry.kind = modes.SymbolKind.Function;
				} else if(node instanceof nodes.Keyframe) {
					entry.name = nls.localize('literal.keyframes', "@keyframes {0}", (<nodes.Keyframe> node).getName());
				} else if(node instanceof nodes.FontFace) {
					entry.name = nls.localize('literal.fontface', "@font-face");
				}

				if(entry.name) {
					entry.location = {
						uri: resource,
						range: this._range(node, model, true)
					};
					result.push(entry);
				}

				return true;
			});

			return result;
		});
	}

	public provideHover(resource:URI, position:editorCommon.IPosition): winjs.TPromise<modes.Hover> {

		return this.languageService.join().then(() => {

			let model = this.resourceService.get(resource),
				offset = model.getOffsetFromPosition(position),
				stylesheet = this.languageService.getStylesheet(resource),
				nodepath = nodes.getNodePath(stylesheet, offset);

			for (let i = 0; i < nodepath.length; i++) {
				let node = nodepath[i];
				if (node instanceof nodes.Selector) {
					return {
						htmlContent: [selectorPrinting.selectorToHtml(<nodes.Selector> node)],
						range: this._range(node, model)
					};
				}
				if (node instanceof nodes.SimpleSelector) {
					return {
						htmlContent: [selectorPrinting.simpleSelectorToHtml(<nodes.SimpleSelector> node)],
						range: this._range(node, model)
					};
				}
				if (node instanceof nodes.Declaration) {
					let propertyName = node.getFullPropertyName();
					let entry = languageFacts.getProperties()[propertyName];
					if (entry) {
						return {
							htmlContent: [{ text: entry.description }],
							range: this._range(node, model)
						};
					}
				}
			}

			return null;
		});
	}

	public provideDefinition(resource:URI, position:editorCommon.IPosition):winjs.TPromise<modes.Location> {

		return this.languageService.join().then(() => {

			let model = this.resourceService.get(resource),
				offset = model.getOffsetFromPosition(position),
				node = occurrences.findDeclaration(this.languageService.getStylesheet(resource), offset);

			if (!node) {
				return null;
			}

			return {
				uri: resource,
				range: this._range(node, model, true)
			};
		});
	}

	public provideDocumentHighlights(resource:URI, position:editorCommon.IPosition):winjs.TPromise<modes.DocumentHighlight[]> {

		return this.languageService.join().then(() => {

			let model = this.resourceService.get(resource),
				offset = model.getOffsetFromPosition(position),
				nodes = occurrences.findOccurrences(this.languageService.getStylesheet(resource), offset);

			return nodes.map((occurrence) => {
				return {
					range: this._range(occurrence.node, model),
					kind: occurrence.kind
				};
			});
		});
	}

	public provideReferences(resource:URI, position:editorCommon.IPosition):winjs.TPromise<modes.Location[]> {

		return this.languageService.join().then(() => {
			let model = this.resourceService.get(resource),
				offset = model.getOffsetFromPosition(position),
				nodes = occurrences.findOccurrences(this.languageService.getStylesheet(resource), offset);

			return nodes.map((occurrence) => {
				return {
					uri: model.uri,
					range: this._range(occurrence.node, model)
				};
			});
		});
	}

	public findColorDeclarations(resource:URI):winjs.Promise {

		return this.languageService.join().then(() => {

			let model = this.resourceService.get(resource),
				styleSheet = this.languageService.getStylesheet(resource),
				result:{range:editorCommon.IRange; value:string; }[] = [];

			styleSheet.accept((node) => {
				if (languageFacts.isColorValue(node)) {
					result.push({
						range: this._range(node, model),
						value: node.getText()
					});
				}
				return true;
			});

			return result;
		});
	}

	_range(node:{offset:number; length:number;}, model:editorCommon.IMirrorModel, empty:boolean = false):editorCommon.IRange {
		if (empty) {
			let position = model.getPositionFromOffset(node.offset);
			return {
				startLineNumber: position.lineNumber,
				startColumn: position.column,
				endLineNumber: position.lineNumber,
				endColumn: position.column
			};
		} else {
			return model.getRangeFromOffsetAndLength(node.offset, node.length);
		}
	}

	private getFixesForUnknownProperty(property: nodes.Property, marker: IMarker) : modes.IQuickFix[] {

		let propertyName = property.getName();
		let result: modes.IQuickFix[] = [];
		for (let p in languageFacts.getProperties()) {
			let score = strings.difference(propertyName, p);
			if (score >= propertyName.length / 2 /*score_lim*/) {
				result.push({
					command: {
						id: '_css.replaceText',
						title: nls.localize('css.quickfix.rename', "Rename to '{0}'", p),
						arguments: [{ range: Range.lift(marker), newText: p }]
					},
					score
				});
			}
		}

		// Sort in descending order.
		result.sort((a, b) => {
			return b.score - a.score;
		});

		return result.slice(0, 3 /*max_result*/);
	}

	private appendFixesForMarker(bucket: modes.IQuickFix[], marker: IMarker): void {

		if ((<IMarker>marker).code !== lintRules.Rules.UnknownProperty.id) {
			return;
		}
		let model = this.resourceService.get(marker.resource),
			offset = model.getOffsetFromPosition({ column: marker.startColumn, lineNumber: marker.startLineNumber }),
			stylesheet = this.languageService.getStylesheet(marker.resource),
			nodepath = nodes.getNodePath(stylesheet, offset);

		for (let i = nodepath.length - 1; i >= 0; i--) {
			let node = nodepath[i];
			if (node instanceof nodes.Declaration) {
				let property = (<nodes.Declaration> node).getProperty();
				if (property && property.offset === offset && property.length === marker.endColumn - marker.startColumn) {
					bucket.push(...this.getFixesForUnknownProperty(property, marker));
					return;
				}
			}
		}
	}

	public provideCodeActions(resource: URI, range: editorCommon.IRange): winjs.TPromise<modes.IQuickFix[]> {

		return this.languageService.join().then(() => {
			const result: modes.IQuickFix[] = [];

			this.markerService.read({ resource })
				.filter(marker => Range.containsRange(range, marker))
				.forEach(marker => this.appendFixesForMarker(result, marker));

			return result;
		});
	}

}
