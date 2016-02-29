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
import EditorCommon = require('vs/editor/common/editorCommon');
import Modes = require('vs/editor/common/modes');
import nodes = require('vs/languages/css/common/parser/cssNodes');
import _level = require('vs/languages/css/common/level');
import parser = require('vs/languages/css/common/parser/cssParser');
import selectorPrinting = require('vs/languages/css/common/services/selectorPrinting');
import lint = require('vs/languages/css/common/services/lint');
import lintRules = require('vs/languages/css/common/services/lintRules');
import {IMarker, IMarkerData} from 'vs/platform/markers/common/markers';
import {IMarkerService} from 'vs/platform/markers/common/markers';
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
		participants: Modes.IWorkerParticipant[],
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

	public navigateValueSet(resource:URI, range:EditorCommon.IRange, up:boolean):winjs.TPromise<Modes.IInplaceReplaceSupportResult> {
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
					let result:Modes.IInplaceReplaceSupportResult = {
						value: values[nextIdx],
						range: this._range(node, model)
					};
					return result;
				}
			}
			// if none matches, take the first one
			if (values.length > 0) {
				let result:Modes.IInplaceReplaceSupportResult = {
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

	private _createMarkerData(model: EditorCommon.IMirrorModel, marker: nodes.IMarker): IMarkerData {
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

	public suggest(resource:URI, position:EditorCommon.IPosition):winjs.TPromise<Modes.ISuggestResult[]> {
		return this.doSuggest(resource, position).then(value => filterSuggestions(value));
	}

	private doSuggest(resource:URI, position:EditorCommon.IPosition):winjs.TPromise<Modes.ISuggestResult> {

		return this.languageService.join().then(() => {

			let model = this.resourceService.get(resource);
			let result = this.createIntellisense().getCompletionsAtPosition(this.languageService, model, resource, position);
			return result;
		});

	}

	public getRangesToPosition(resource:URI, position:EditorCommon.IPosition):winjs.TPromise<Modes.ILogicalSelectionEntry[]> {

		return this.languageService.join().then(() => {

			let model = this.resourceService.get(resource),
				offset = model.getOffsetFromPosition(position),
				styleSheet = this.languageService.getStylesheet(resource),
				path = nodes.getNodePath(styleSheet, offset),
				result: Modes.ILogicalSelectionEntry[] = [];

			for (let i = 0; i < path.length; i++) {
				let node = path[i];
				if(node.offset === -1 || node.length === -1) {
					continue;
				}
				if(node.parent && node.parent.offset === node.offset && node.parent.length === node.length) {
					continue;
				}
				result.push({
					type: 'node',
					range: this._range(node, model)
				});
			}

			return result;
		});
	}

	public getOutline(resource:URI):winjs.TPromise<Modes.IOutlineEntry[]> {

		return this.languageService.join().then(() => {

			let model = this.resourceService.get(resource),
				stylesheet = this.languageService.getStylesheet(resource),
				result:Modes.IOutlineEntry[] = [];

			stylesheet.accept((node) => {

				let entry:Modes.IOutlineEntry = {
					label: null,
					type: 'rule',
					range: null,
					children: []
				};

				if(node instanceof nodes.Selector) {
					entry.label = node.getText();
				} else if(node instanceof nodes.VariableDeclaration) {
					entry.label = (<nodes.VariableDeclaration> node).getName();
					entry.type = 'letiable';
				} else if(node instanceof nodes.MixinDeclaration) {
					entry.label = (<nodes.MixinDeclaration> node).getName();
					entry.type = 'method';
				} else if(node instanceof nodes.FunctionDeclaration) {
					entry.label = (<nodes.FunctionDeclaration> node).getName();
					entry.type = 'function';
				} else if(node instanceof nodes.Keyframe) {
					entry.label = nls.localize('literal.keyframes', "@keyframes {0}", (<nodes.Keyframe> node).getName());
				} else if(node instanceof nodes.FontFace) {
					entry.label = nls.localize('literal.fontface', "@font-face");
				}

				if(entry.label) {
					entry.range = this._range(node, model, true);
					result.push(entry);
				}

				return true;
			});

			return result;
		});
	}

	public computeInfo(resource:URI, position:EditorCommon.IPosition): winjs.TPromise<Modes.IComputeExtraInfoResult> {

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

	public findDeclaration(resource:URI, position:EditorCommon.IPosition):winjs.TPromise<Modes.IReference> {

		return this.languageService.join().then(() => {

			let model = this.resourceService.get(resource),
				offset = model.getOffsetFromPosition(position),
				node = occurrences.findDeclaration(this.languageService.getStylesheet(resource), offset);

			if (!node) {
				return null;
			}

			return <Modes.IReference> {
				resource: resource,
				range: this._range(node, model, true)
			};
		});
	}

	public findOccurrences(resource:URI, position:EditorCommon.IPosition, strict?:boolean):winjs.TPromise<Modes.IOccurence[]> {

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

	public findReferences(resource:URI, position:EditorCommon.IPosition):winjs.TPromise<Modes.IReference[]> {

		return this.languageService.join().then(() => {
			let model = this.resourceService.get(resource),
				offset = model.getOffsetFromPosition(position),
				nodes = occurrences.findOccurrences(this.languageService.getStylesheet(resource), offset);

			return nodes.map((occurrence) => {
				return <Modes.IReference> {
					resource: model.getAssociatedResource(),
					range: this._range(occurrence.node, model)
				};
			});
		});
	}

	public findColorDeclarations(resource:URI):winjs.Promise {

		return this.languageService.join().then(() => {

			let model = this.resourceService.get(resource),
				styleSheet = this.languageService.getStylesheet(resource),
				result:{range:EditorCommon.IRange; value:string; }[] = [];

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

	_range(node:{offset:number; length:number;}, model:EditorCommon.IMirrorModel, empty:boolean = false):EditorCommon.IRange {
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

	private getFixesForUnknownProperty(property: nodes.Property) : Modes.IQuickFix[] {

		let propertyName = property.getName();
		let result: Modes.IQuickFix[] = [];
		for (let p in languageFacts.getProperties()) {
			let score = strings.difference(propertyName, p);
			if (score >= propertyName.length / 2 /*score_lim*/) {
				result.push({
					command: {
						id: 'css.renameProptery',
						title: nls.localize('css.quickfix.rename', "Rename to '{0}'", p),
						arguments: [{ type: 'rename', name: p }]
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

	public getQuickFixes(resource: URI, marker: IMarker | EditorCommon.IRange): winjs.TPromise<Modes.IQuickFix[]> {
		if ((<IMarker> marker).code !== lintRules.Rules.UnknownProperty.id) {
			return winjs.TPromise.as([]);
		}

		return this.languageService.join().then(() => {

			let model = this.resourceService.get(resource),
				offset = model.getOffsetFromPosition({ column: marker.startColumn, lineNumber: marker.startLineNumber }),
				stylesheet = this.languageService.getStylesheet(resource),
				nodepath = nodes.getNodePath(stylesheet, offset);

			for (let i = nodepath.length - 1; i >= 0; i--) {
				let node = nodepath[i];
				if (node instanceof nodes.Declaration) {
					let property = (<nodes.Declaration> node).getProperty();
					if (property && property.offset === offset && property.length === marker.endColumn - marker.startColumn) {
						return this.getFixesForUnknownProperty(property);
					}
				}
			}
			return [];
		});
	}

	public runQuickFixAction(resource: URI, range: EditorCommon.IRange, quickFix: Modes.IQuickFix): winjs.TPromise<Modes.IQuickFixResult>{
		let [{type, name}] = quickFix.command.arguments;
		switch (type) {
			case 'rename': {
				return winjs.TPromise.as({
					edits: [{ resource, range, newText: name }]
				});
			}
		}
		return null;
	}
}
