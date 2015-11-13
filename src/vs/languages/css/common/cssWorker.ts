/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import nls = require('vs/nls');
import _severity from 'vs/base/common/severity';
import strings = require('vs/base/common/strings');
import winjs = require('vs/base/common/winjs.base');
import {AbstractModeWorker} from 'vs/editor/common/modes/abstractModeWorker';
import languageService = require('vs/languages/css/common/services/cssLanguageService');
import languageFacts = require('vs/languages/css/common/services/languageFacts');
import occurrences = require('./services/occurrences');
import cssIntellisense = require('vs/languages/css/common/services/intelliSense');
import network = require('vs/base/common/network');
import EditorCommon = require('vs/editor/common/editorCommon');
import Modes = require('vs/editor/common/modes');
import nodes = require('vs/languages/css/common/parser/cssNodes');
import _level = require('vs/languages/css/common/level');
import parser = require('vs/languages/css/common/parser/cssParser');
import selectorPrinting = require('vs/languages/css/common/services/selectorPrinting');
import lint = require('vs/languages/css/common/services/lint');
import lintRules = require('vs/languages/css/common/services/lintRules');
import supports = require('vs/editor/common/modes/supports');
import {IMarker, IMarkerData} from 'vs/platform/markers/common/markers';
import {IMarkerService} from 'vs/platform/markers/common/markers';
import {IResourceService} from 'vs/editor/common/services/resourceService';

export class CSSWorker extends AbstractModeWorker {

	public languageService: languageService.ILanguageService;

	private validationEnabled : boolean;
	private lintSettings : lintRules.IConfigurationSettings;

	constructor(mode: Modes.IMode, participants: Modes.IWorkerParticipant[], @IResourceService resourceService: IResourceService,
		@IMarkerService markerService: IMarkerService) {

		super(mode, participants, resourceService, markerService);
		this.languageService = this.createLanguageService(resourceService, mode.getId());
		this.lintSettings = {};
		this.validationEnabled = true;
	}

	protected _createInPlaceReplaceSupport(): Modes.IInplaceReplaceSupport {
		return new supports.WorkerInplaceReplaceSupport(this.resourceService, this);
	}

	public createLanguageService(resourceService:IResourceService, modeId:string): languageService.CSSLanguageService {
		return new languageService.CSSLanguageService(resourceService, this.createParser.bind(this), modeId);
	}

	public createParser() : parser.Parser {
		return new parser.Parser();
	}

	/**
	 * @return true if you want to revalidate your models
	 */
	_doConfigure(raw:any):winjs.TPromise<boolean> {
		if (raw) {
			this.validationEnabled = raw.validate;
			if (raw.lint) {
				this.lintSettings = lintRules.sanitize(raw.lint);
			} else {
				this.lintSettings = {};
			}
			return winjs.TPromise.as(true);
		}
		return winjs.TPromise.as(false);
	}

	public doValidate(resource: network.URL):void {
		if (!this.validationEnabled) {
			this.markerService.changeOne(this._getMode().getId(), resource, []);
			return;
		}

		this.languageService.join().then(() => {

			var modelMirror = this.resourceService.get(resource),
				node = this.languageService.getStylesheet(resource),
				entries: nodes.IMarker[] = [];

			entries.push.apply(entries, nodes.ParseErrorCollector.entries(node));
			entries.push.apply(entries, this.collectLintEntries(node));

			var markerData = entries
				.filter(entry => entry.getLevel() !== _level.Level.Ignore)
				.map(entry => this._createMarkerData(modelMirror, entry));

			this.markerService.changeOne(this._getMode().getId(), resource, markerData);
		});
	}

	private _createMarkerData(model: EditorCommon.IMirrorModel, marker: nodes.IMarker): IMarkerData {
		var range = model.getRangeFromOffsetAndLength(marker.getOffset(), marker.getLength());
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

	public doSuggest(resource:network.URL, position:EditorCommon.IPosition):winjs.TPromise<Modes.ISuggestions> {

		return this.languageService.join().then(() => {

			var model = this.resourceService.get(resource);
			var result = this.createIntellisense().getCompletionsAtPosition(this.languageService, model, resource, position);
			return result;
		});

	}

	public getRangesToPosition(resource:network.URL, position:EditorCommon.IPosition):winjs.TPromise<Modes.ILogicalSelectionEntry[]> {

		return this.languageService.join().then(() => {

			var model = this.resourceService.get(resource),
				offset = model.getOffsetFromPosition(position),
				styleSheet = this.languageService.getStylesheet(resource),
				path = nodes.getNodePath(styleSheet, offset),
				result: Modes.ILogicalSelectionEntry[] = [];

			for (var i = 0; i < path.length; i++) {
				var node = path[i];
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

	public getOutline(resource:network.URL):winjs.TPromise<Modes.IOutlineEntry[]> {

		return this.languageService.join().then(() => {

			var model = this.resourceService.get(resource),
				stylesheet = this.languageService.getStylesheet(resource),
				result:Modes.IOutlineEntry[] = [];

			stylesheet.accept((node) => {

				var entry:Modes.IOutlineEntry = {
					label: null,
					type: 'rule',
					range: null,
					children: []
				};

				if(node instanceof nodes.Selector) {
					entry.label = node.getText();
				} else if(node instanceof nodes.VariableDeclaration) {
					entry.label = (<nodes.VariableDeclaration> node).getName();
					entry.type = 'variable';
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

	public computeInfo(resource:network.URL, position:EditorCommon.IPosition): winjs.TPromise<Modes.IComputeExtraInfoResult> {

		return this.languageService.join().then(() => {

			var model = this.resourceService.get(resource),
				offset = model.getOffsetFromPosition(position),
				stylesheet = this.languageService.getStylesheet(resource),
				nodepath = nodes.getNodePath(stylesheet, offset);

			for (var i = 0; i < nodepath.length; i++) {
				var node = nodepath[i];
				if(node instanceof nodes.Selector) {
					return {
						htmlContent: [selectorPrinting.selectorToHtml(<nodes.Selector> node)],
						range: this._range(node, model)
					};
				}
				if(node instanceof nodes.SimpleSelector) {
					return {
						htmlContent: [selectorPrinting.simpleSelectorToHtml(<nodes.SimpleSelector> node)],
						range: this._range(node, model)
					};
				}
			}

			return null;
		});
	}

	public findDeclaration(resource:network.URL, position:EditorCommon.IPosition):winjs.TPromise<Modes.IReference> {

		return this.languageService.join().then(() => {

			var model = this.resourceService.get(resource),
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

	public findOccurrences(resource:network.URL, position:EditorCommon.IPosition, strict?:boolean):winjs.TPromise<Modes.IOccurence[]> {

		return this.languageService.join().then(() => {

			var model = this.resourceService.get(resource),
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

	public findReferences(resource:network.URL, position:EditorCommon.IPosition):winjs.TPromise<Modes.IReference[]> {

		return this.languageService.join().then(() => {
			var model = this.resourceService.get(resource),
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

	public navigateValueSetFallback(resource:network.URL, range:EditorCommon.IRange, up:boolean):winjs.TPromise<Modes.IInplaceReplaceSupportResult> {
		return this.languageService.join().then(() => {

			var model = this.resourceService.get(resource);
			var offset = model.getOffsetFromPosition({ lineNumber: range.startLineNumber, column: range.startColumn });
			var styleSheet = this.languageService.getStylesheet(resource);

			var node = nodes.getNodeAtOffset(styleSheet, offset);
			if (!node) {
				return;
			}
			var declaration = nodes.getParentDeclaration(node);
			if (!declaration) {
				return;
			}

			var entry: languageFacts.IEntry = languageFacts.getProperties()[declaration.getFullPropertyName()];
			if (!entry || !entry.values) {
				return;
			}

			var values = entry.values.filter(value => languageFacts.isCommonValue(value)).map(v => v.name);

			var isColor = (entry.restrictions.indexOf('color') >= 0);
			if (isColor) {
				values = values.concat(Object.getOwnPropertyNames(languageFacts.colors), Object.getOwnPropertyNames(languageFacts.colorKeywords));
			}

			var text = node.getText();
			for (var i = 0, len = values.length; i < len; i++) {
				if (strings.equalsIgnoreCase(values[i], text)) {
					var nextIdx = i;
					if(up) {
						nextIdx = (i + 1) % len;
					} else {
						nextIdx =  i - 1;
						if(nextIdx < 0) {
							nextIdx = len - 1;
						}
					}
					var result:Modes.IInplaceReplaceSupportResult = {
						value: values[nextIdx],
						range: this._range(node, model)
					};
					return result;
				}
			}
			// if none matches, take the first one
			if (values.length > 0) {
				var result:Modes.IInplaceReplaceSupportResult = {
					value: values[0],
					range: this._range(node, model)
				};
				return result;
			}

			return null;
		});
	}

	public findColorDeclarations(resource:network.URL):winjs.Promise {

		return this.languageService.join().then(() => {

			var model = this.resourceService.get(resource),
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
		if(empty) {
			var position = model.getPositionFromOffset(node.offset);
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

		var propertyName = property.getName();
		var result: Modes.IQuickFix[] = [];
		for (var p in languageFacts.getProperties()) {
			var score = strings.difference(propertyName, p);
			if (score >= propertyName.length / 2 /*score_lim*/) {
				result.push({
					label: nls.localize('css.quickfix.rename', "Rename to '{0}'", p),
					id: JSON.stringify({ type: 'rename', name: p }),
					score: score
				});
			}
		}

		// Sort in descending order.
		result.sort((a, b) => {
			return b.score - a.score;
		});

		return result.slice(0, 3 /*max_result*/);
	}

	public getQuickFixes(resource: network.URL, marker: IMarker | EditorCommon.IRange): winjs.TPromise<Modes.IQuickFix[]> {
		if ((<IMarker> marker).code !== lintRules.Rules.UnknownProperty.id) {
			return winjs.TPromise.as([]);
		}

		return this.languageService.join().then(() => {

			var model = this.resourceService.get(resource),
				offset = model.getOffsetFromPosition({ column: marker.startColumn, lineNumber: marker.startLineNumber }),
				stylesheet = this.languageService.getStylesheet(resource),
				nodepath = nodes.getNodePath(stylesheet, offset);

			for (var i = nodepath.length - 1; i >= 0; i--) {
				var node = nodepath[i];
				if (node instanceof nodes.Declaration) {
					var property = (<nodes.Declaration> node).getProperty();
					if (property && property.offset === offset && property.length === marker.endColumn - marker.startColumn) {
						return this.getFixesForUnknownProperty(property);
					}
				}
			}
			return [];
		});
	}

	public runQuickFixAction(resource:network.URL, range:EditorCommon.IRange, id: any):winjs.TPromise<Modes.IQuickFixResult>{
		var command = JSON.parse(id);
		switch (command.type) {
			case 'rename': {
				return winjs.TPromise.as({
					edits: [{ resource, range, newText: command.name }]
				});
			}
		}
		return null;
	}
}
