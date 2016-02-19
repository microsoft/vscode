/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import winjs = require('vs/base/common/winjs.base');
import paths = require('vs/base/common/paths');
import URI from 'vs/base/common/uri';
import lifecycle = require('vs/base/common/lifecycle');
import EditorCommon = require('vs/editor/common/editorCommon');
import Modes = require('vs/editor/common/modes');
import objects = require('vs/base/common/objects');
import ts = require('vs/languages/typescript/common/lib/typescriptServices');
import Options = require('vs/languages/typescript/common/options');
import typescript = require('vs/languages/typescript/common/typescript');
import projectService = require('vs/languages/typescript/common/project/projectService');
import format = require('vs/languages/typescript/common/features/format');
import logicalSelection = require('vs/languages/typescript/common/features/logicalSelection');
import extraInfo = require('vs/languages/typescript/common/features/extraInfo');
import outline = require('vs/languages/typescript/common/features/outline');
import occurrences = require('vs/languages/typescript/common/features/occurrences');
import definitions = require('vs/languages/typescript/common/features/definitions');
import references = require('vs/languages/typescript/common/features/references');
import parameterHints = require('vs/languages/typescript/common/features/parameterHints');
import suggestions = require('vs/languages/typescript/common/features/suggestions');
import quickFix = require('vs/languages/typescript/common/features/quickFix');
import diagnostics = require('vs/languages/typescript/common/features/diagnostics');
import emitting = require('vs/languages/typescript/common/features/emitting');
import rename = require('vs/languages/typescript/common/features/rename');
import {IResourceService, ResourceEvents, IResourceAddedEvent, IResourceRemovedEvent} from 'vs/editor/common/services/resourceService';
import {IMarker, IMarkerService} from 'vs/platform/markers/common/markers';
import {filterSuggestions} from 'vs/editor/common/modes/supports/suggestSupport';
import {ValidationHelper} from 'vs/editor/common/worker/validationHelper';

export class TypeScriptWorker2 {

	private _modelListener: { [resource: string]: Function } = Object.create(null);

	protected _projectService: projectService.ProjectService;
	protected _options: Options;
	protected _disposables: lifecycle.IDisposable[] = [];
	private _validationHelper: ValidationHelper;
	private resourceService:IResourceService;
	protected markerService: IMarkerService;
	protected _modeId: string;

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

		this._projectService = new projectService.ProjectService();

		this._disposables.push(this.resourceService.addListener2_(ResourceEvents.ADDED, this._onResourceAdded.bind(this)));
		this._disposables.push(this.resourceService.addListener2_(ResourceEvents.REMOVED, this._onResourceRemoved.bind(this)));
		this.resourceService.all()
			.forEach(element => this._onResourceAdded({ url: element.getAssociatedResource(), addedElement: element }));
	}

	public dispose(): void {
		for (var key in this._modelListener) {
			this._modelListener[key]();
			delete this._modelListener[key];
		}
		this._disposables = lifecycle.disposeAll(this._disposables);
	}

	// ---- typescript project

	private _isInterestingModel(element: EditorCommon.IMirrorModel): boolean {

		return (
			/\.(ts|js)$/.test(element.getAssociatedResource().fsPath) ||
			element.getMode().getId() === this._modeId
		);
	}

	private _onResourceAdded(event: IResourceAddedEvent): void {
		if (this._isInterestingModel(event.addedElement)) {
			var model = event.addedElement,
				resource = event.url,
				unbind: Function,
				onChanged: Function;

			onChanged = () => this._projectService._syncFile(typescript.ChangeKind.Changed, resource, model.getValue());
			unbind = model.addListener('changed', () => onChanged());
			this._modelListener[resource.toString()] = unbind;
			onChanged();
		}
	}

	private _onResourceRemoved(event: IResourceRemovedEvent): void {

		var resource = event.url;
		var unbind = this._modelListener[resource.toString()];
		if (unbind) {
			delete this._modelListener[resource.toString()];
			unbind();

			// despite a file being removed from the resource service
			// we keep it in the project service because other files
			// might still depend on it.
			if (resource.scheme !== 'file') {
				this._projectService._syncFile(typescript.ChangeKind.Removed, resource, undefined);
			}
		}
	}

	public canAcceptFileChanges(newLength: number): boolean {
		let newTotal = this._projectService.getTotalLength() + newLength;
		// console.log('~' + Math.round(newTotal / (1024 * 1024)) + 'MB');
		return newTotal < 1024 * 1024 * 35;
	}

	public acceptFileChanges(changes: { kind: typescript.ChangeKind; resource: URI; content: string }[]): boolean {
		for (var i = 0, len = changes.length; i < len; i++) {
			if (!this.resourceService.get(changes[i].resource)) {
				this._projectService._syncFile(changes[i].kind, changes[i].resource, changes[i].content);
			}
		}
		return true;
	}

	public acceptProjectChanges(changes: { kind: typescript.ChangeKind; resource: URI; files: URI[]; options: ts.CompilerOptions }[]): { [dirname: string]: URI } {

		for (var i = 0, len = changes.length; i < len; i++) {
			this._projectService._syncProject(changes[i].kind, changes[i].resource, changes[i].files, changes[i].options);
		}

		// trigger validation for all files
		this._validationHelper.triggerDueToConfigurationChange();

		// return a project map
		var projects: { [dirname: string]: URI } = Object.create(null);
		this._projectService.projects().forEach(project => projects[paths.dirname(project.resource.fsPath)] = project.resource);
		return projects;
	}

	_doConfigure(options: any, defaults:Options = Options.typeScriptOptions): winjs.TPromise<void> {
		// very long ago options.validate could be an
		// array or an object. since this was only used
		// for selfhosting the migration story is to
		// delete such a configuration object...
		if(options && Array.isArray(options.validate)) {
			delete options.validate;
		}
		var optionsWithDefaults = Options.withDefaultOptions(options, defaults);
		if (!objects.equals(optionsWithDefaults, this._options)) {
			this._options = optionsWithDefaults;
			this._validationHelper.triggerDueToConfigurationChange();
		}

		return winjs.TPromise.as(void 0);
	}

	// ---- Implementation of various IXYZSupports

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
		var project = this._projectService.getProject(resource);
		var markers: IMarker[] = [];
		markers.push.apply(markers, diagnostics.getSyntacticDiagnostics(project.languageService, resource, project.host.getCompilationSettings(),
			this._options, this.resourceService.get(resource).getMode().getId() === 'javascript'));
		markers.push.apply(markers, diagnostics.getExtraDiagnostics(project.languageService, resource, this._options));
		this.markerService.changeOne(`/${this._modeId}/syntactic`, resource, markers);
	}

	public doValidateSemantics(resource: URI): boolean {
		var project = this._projectService.getProject(resource);
		var result = diagnostics.getSemanticDiagnostics(project.languageService, resource, this._options);
		if (result) {
			this.markerService.changeOne(`/${this._modeId}/semantic`, resource, result.markers);
			return result.hasMissingFiles;
		}
	}

	public getMissingFiles(): URI[] {
		var fileNames = this._projectService.getMissingScriptNamesSinceLastTime();
		return fileNames && fileNames.map(URI.parse);
	}

	public suggest(resource:URI, position:EditorCommon.IPosition):winjs.TPromise<Modes.ISuggestResult[]> {
		return this.doSuggest(resource, position).then(value => filterSuggestions(value));
	}

	protected doSuggest(resource: URI, position: EditorCommon.IPosition): winjs.TPromise<Modes.ISuggestResult> {
		var project = this._projectService.getProject(resource);
		var result = suggestions.computeSuggestions(project.languageService,
			resource, position, this._options);

		return winjs.TPromise.as(result);
	}

	public getSuggestionDetails(resource: URI, position: EditorCommon.IPosition, suggestion: Modes.ISuggestion): winjs.TPromise<Modes.ISuggestion> {
		var project = this._projectService.getProject(resource);
		var result = suggestions.getSuggestionDetails(project.languageService,
			resource, position, suggestion, this._options);

		return winjs.TPromise.as(result);
	}

	public runQuickFixAction(resource: URI, range: EditorCommon.IRange, id: any): winjs.TPromise<Modes.IQuickFixResult> {
		var project = this._projectService.getProject(resource);
		var result = quickFix.evaluate(project.languageService, resource, range, id);
		return winjs.TPromise.as(result);
	}

	public getQuickFixes(resource: URI, range: IMarker | EditorCommon.IRange): winjs.TPromise<Modes.IQuickFix[]> {
		var project = this._projectService.getProject(resource);
		var result = quickFix.compute(project.languageService, resource, range);
		return winjs.TPromise.as(result);
	}

	public getEmitOutput(resource: URI, type: string): winjs.TPromise<Modes.IEmitOutput> {
		var project = this._projectService.getProject(resource);
		var result = emitting.getEmitOutput(project.languageService, resource, type);
		return winjs.TPromise.as(result);
	}

	public getParameterHints(resource: URI, position: EditorCommon.IPosition): winjs.TPromise<Modes.IParameterHints> {
		var project = this._projectService.getProject(resource);
		var result = parameterHints.compute(project.languageService, resource, position);
		return winjs.TPromise.as(result);
	}

	public findDeclaration(resource: URI, position:EditorCommon.IPosition):winjs.TPromise<Modes.IReference> {
		// return winjs.TPromise.join([
		// 	this._findLinkTarget(resource, position),
		// 	this._findTypeScriptDeclaration(resource, position)
		// ]).then((results:Modes.IReference[]) => {
		// 	return arrays.coalesce(results)[0] || null;
		// });
		return this._findTypeScriptDeclaration(resource, position);
	}

	// public _findLinkTarget(resource: URI, position: EditorCommon.IPosition): winjs.TPromise<Modes.IReference> {
	// 	var project = this._findProject(resource);
	// 	return this.resolveDependenciesAndRun(resource, (project) => {
	// 		var filename = resource.toString(),
	// 			syntaxTree = project.syntaxLanguageService().getSourceFile(filename);
	// 		return moduleLinks.findLink(syntaxTree, filename, position, project.semanticLanguageService().host, project.root());
	// 	});
	// }

	public _findTypeScriptDeclaration(resource: URI, position: EditorCommon.IPosition): winjs.TPromise<Modes.IReference> {
		var project = this._projectService.getProject(resource);
		var result = definitions.findDeclaration(project, resource, position);
		return winjs.TPromise.as(result);
	}

	public findReferences(resource: URI, position: EditorCommon.IPosition, includeDeclaration: boolean): winjs.TPromise<Modes.IReference[]> {
		var project = this._projectService.getProject(resource);
		var result = references.find(project, resource, position, includeDeclaration);
		return winjs.TPromise.as(result);
	}

	public computeInfo(resource: URI, position: EditorCommon.IPosition): winjs.TPromise<Modes.IComputeExtraInfoResult> {
		var project = this._projectService.getProject(resource);
		var result = extraInfo.compute(project.languageService, resource, position);
		return winjs.TPromise.as(result);
	}

	public findOccurrences(resource: URI, position: EditorCommon.IPosition, strict?: boolean): winjs.TPromise<Modes.IOccurence[]> {
		var project = this._projectService.getProject(resource);
		var result = occurrences.compute(project.languageService, resource, position, strict);
		return winjs.TPromise.as(result);
	}

	public getOutline(resource: URI): Modes.IOutlineEntry[]{
		var project = this._projectService.getProject(resource);
		return outline.compute(project.languageService, resource);
	}

	public formatDocument(resource: URI, options: Modes.IFormattingOptions): EditorCommon.ISingleEditOperation[]{
		var project = this._projectService.getProject(resource);
		return format.formatDocument(project.languageService, resource, options);
	}

	public formatRange(resource: URI, range: EditorCommon.IRange, options: Modes.IFormattingOptions): EditorCommon.ISingleEditOperation[]{
		var project = this._projectService.getProject(resource);
		return format.formatRange(project.languageService, resource, range, options);
	}

	public formatAfterKeystroke(resource: URI, position: EditorCommon.IPosition, ch: string, options: Modes.IFormattingOptions): EditorCommon.ISingleEditOperation[]{
		var project = this._projectService.getProject(resource);
		return format.formatAfterKeystroke(project.languageService, resource, position, ch, options);
	}

	public getRangesToPosition(resource: URI, position: EditorCommon.IPosition): Modes.ILogicalSelectionEntry[]{
		var project = this._projectService.getProject(resource);
		return logicalSelection.compute(project.languageService, resource, position);
	}

	public rename(resource: URI, position: EditorCommon.IPosition, newName: string): winjs.TPromise<Modes.IRenameResult> {
		var project = this._projectService.getProject(resource);
		var result = rename(project, resource, position, newName);
		return winjs.TPromise.as(result);
	}
}