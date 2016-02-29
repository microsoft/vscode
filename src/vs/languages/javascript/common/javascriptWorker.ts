/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import URI from 'vs/base/common/uri';
import objects = require('vs/base/common/objects');
import arrays = require('vs/base/common/arrays');
import winjs = require('vs/base/common/winjs.base');
import EditorCommon = require('vs/editor/common/editorCommon');
import Modes = require('vs/editor/common/modes');
import typeScriptWorker = require('vs/languages/typescript/common/typescriptWorker2');
import Options = require('vs/languages/typescript/common/options');
import rewriter = require('vs/languages/typescript/common/js/rewriting');
import suggestions = require('vs/languages/typescript/common/features/suggestions');
import parameterHints = require('vs/languages/typescript/common/features/parameterHints');
import occurrences = require('vs/languages/typescript/common/features/occurrences');
import extraInfo = require('vs/languages/typescript/common/features/extraInfo');
import references = require('vs/languages/typescript/common/features/references');
import definitions = require('vs/languages/typescript/common/features/definitions');
import quickFix = require('vs/languages/typescript/common/features/quickFix');
import diagnostics = require('vs/languages/typescript/common/features/diagnostics');
import rename = require('vs/languages/typescript/common/features/rename');
import ShebangRewriter = require('vs/languages/typescript/common/js/shebangRewriter');
import {IMarker, IMarkerData, IMarkerService} from 'vs/platform/markers/common/markers';
import {IResourceService} from 'vs/editor/common/services/resourceService';

export class JavaScriptWorker extends typeScriptWorker.TypeScriptWorker2 {

	private _fancyRewriters: rewriter.ISyntaxRewriter[];

	constructor(modeId: string, participants: Modes.IWorkerParticipant[], @IResourceService resourceService: IResourceService,
		@IMarkerService markerService: IMarkerService) {

		super(modeId, participants, resourceService, markerService);

		// since we colorize the shebang we should also always handle it
		this._projectService.defaultRewriter = [new ShebangRewriter()];
		this._fancyRewriters = [new ShebangRewriter()];

		participants.forEach((participant:any) => {
			if (typeof participant['computeEdits'] === 'function') {
				this._fancyRewriters.push(participant);
			}
		});
	}

	_doConfigure(options: any): winjs.TPromise<void> {
		return super._doConfigure(options, Options.javaScriptOptions);
	}

	public doValidateSemantics(resource: URI): boolean {

		var markers: IMarkerData[] = [];

		// perform the semantic checks on the rewritten project and
		// filter/translate the error markers
		var project = this._projectService.getProject(resource, this._fancyRewriters);
		var result = diagnostics.getSemanticDiagnostics(project.languageService, resource, this._options);
		if (result) {
			var translator = project.translations.getTranslator(resource);
			result.markers.forEach(marker => {
				var info = translator.info(marker);
				if (info.origin) {
					// put marker on orgin of this modification
					objects.mixin(marker, info.origin, true);
					markers.push(marker);
				} else if (!info.isInserted) {
					// put marker on original position
					objects.mixin(marker, translator.from(marker), true);
					markers.push(marker);
				}
			});
			this.markerService.changeOne(`/${this._modeId}/semantic`, resource, markers);
			return result.hasMissingFiles;
		}
	}

	protected doSuggest(resource: URI, position: EditorCommon.IPosition): winjs.TPromise<Modes.ISuggestResult> {

		var project = this._projectService.getProject(resource, this._fancyRewriters);
		position = project.translations.getTranslator(resource).to(position);

		var result = suggestions.computeSuggestions(project.languageService, resource, position, this._options);

		arrays.forEach(result.suggestions, (suggestion, rm) => {
			if (rewriter.containsEncodedVariableName(suggestion.label)) {
				rm();
			}
		});

		return winjs.TPromise.as(result);
	}

	public getSuggestionDetails(resource: URI, position: EditorCommon.IPosition, suggestion: Modes.ISuggestion): winjs.TPromise<Modes.ISuggestion> {

		var project = this._projectService.getProject(resource, this._fancyRewriters);
		position = project.translations.getTranslator(resource).to(position);

		var result = suggestions.getSuggestionDetails(project.languageService, resource, position, suggestion, this._options);
		result.typeLabel = rewriter.decodeVariableNames(result.typeLabel, project.translations.getOriginal(resource));
		return winjs.TPromise.as(result);
	}

	public getParameterHints(resource: URI, position: EditorCommon.IPosition): winjs.TPromise<Modes.IParameterHints> {

		var project = this._projectService.getProject(resource, this._fancyRewriters);
		position = project.translations.getTranslator(resource).to(position);

		var result = parameterHints.compute(project.languageService, resource, position);
		if (result) {
			let sourceFile = project.translations.getOriginal(resource);
			for (var signature of result.signatures) {
				signature.label = rewriter.decodeVariableNames(signature.label, sourceFile);
				for (var parameter of signature.parameters) {
					parameter.label = rewriter.decodeVariableNames(parameter.label, sourceFile);
					parameter.signatureLabelOffset = 0;
					parameter.signatureLabelEnd = 0;
				}
			}
			return winjs.TPromise.as(result);
		}
	}

	public findOccurrences(resource: URI, position: EditorCommon.IPosition, strict?: boolean): winjs.TPromise<Modes.IOccurence[]> {

		var project = this._projectService.getProject(resource, this._fancyRewriters);
		var translator = project.translations.getTranslator(resource);
		position = translator.to(position);

		var result = occurrences.compute(project.languageService, resource, position, strict);
		arrays.forEach(result, (element, remove) => {
			if(translator.info(element.range).isInserted) {
				remove();
			} else {
				element.range = project.translations.getTranslator(resource).from(element.range);
			}
		});

		return winjs.TPromise.as(result);
	}

	public _findTypeScriptDeclaration(resource: URI, position: EditorCommon.IPosition): winjs.TPromise<Modes.IReference> {

		var project = this._projectService.getProject(resource, this._fancyRewriters);
		position = project.translations.getTranslator(resource).to(position);
		var result = definitions.findDeclaration(project, resource, position);

		if (result) {
			var translator = project.translations.getTranslator(result.resource);
			if (!translator.info(result.range).isInserted) {
				result.range = translator.from(result.range);
				return winjs.TPromise.as(result);
			}
		}
	}

	public findReferences(resource:URI, position:EditorCommon.IPosition, includeDeclaration:boolean):winjs.TPromise<Modes.IReference[]> {

		var project = this._projectService.getProject(resource, this._fancyRewriters);
		position = project.translations.getTranslator(resource).to(position);

		var result = references.find(project, resource, position, includeDeclaration);

		arrays.forEach(result, (element, remove) => {
			var translator = project.translations.getTranslator(element.resource);
			if(translator.info(element.range).isInserted) {
				remove();
			} else {
				element.range = translator.from(element.range);
			}
		});

		return winjs.TPromise.as(result);
	}

	public computeInfo(resource: URI, position: EditorCommon.IPosition): winjs.TPromise<Modes.IComputeExtraInfoResult> {

		var project = this._projectService.getProject(resource, this._fancyRewriters);
		position = project.translations.getTranslator(resource).to(position);

		var result = extraInfo.compute(project.languageService, resource, position);
		if (result) {
			result.range = project.translations.getTranslator(resource).from(result.range);
			rewriter.decodeVariableNames(result.htmlContent, project.translations.getOriginal(resource));
		}
		return winjs.TPromise.as(result);
	}

	public runQuickFixAction(resource: URI, range: EditorCommon.IRange, id: any): winjs.TPromise<Modes.IQuickFixResult> {

		var project = this._projectService.getProject(resource, this._fancyRewriters);
		var translatedRange = project.translations.getTranslator(resource).to(range);
		objects.mixin(translatedRange, range, false);

		var result = quickFix.evaluate(project.languageService, resource, translatedRange, id);
		if (result) {
			for (let edit of result.edits) {
				edit.range = project.translations.getTranslator(edit.resource).from(edit.range);
			}
		}
		return winjs.TPromise.as(result);
	}

	public getQuickFixes(resource: URI, range: IMarker | EditorCommon.IRange): winjs.TPromise<Modes.IQuickFix[]> {

		var project = this._projectService.getProject(resource, this._fancyRewriters);
		var translatedRange = project.translations.getTranslator(resource).to(range);
		objects.mixin(translatedRange, range, false);

		var result = quickFix.compute(project.languageService, resource, translatedRange);
		return winjs.TPromise.as(result);
	}

	public rename(resource: URI, position: EditorCommon.IPosition, newName: string): winjs.TPromise<Modes.IRenameResult> {

		var project = this._projectService.getProject(resource, this._fancyRewriters);
		var result = rename(project, resource, project.translations.getTranslator(resource).to(position), newName);

		for (var i = 0; i < result.edits.length; i++) {
			var edit = result.edits[i];
			var translator = project.translations.getTranslator(edit.resource);
			var info = translator.info(edit.range);

			if (info.isInserted) {
				// don't rename something that got inserted
				result.edits.splice(i, 1);
				i -= 1;
			} else if (info.isOverlapping) {
				// stop if we overlap with an rewrite-edit
				result.edits = [];
				break;
			}
			// translate edit
			edit.range = translator.from(edit.range);
		}

		return winjs.TPromise.as(result);
	}
}