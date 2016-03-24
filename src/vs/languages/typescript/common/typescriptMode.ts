/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as nls from 'vs/nls';
import WinJS = require('vs/base/common/winjs.base');
import URI from 'vs/base/common/uri';
import EditorCommon = require('vs/editor/common/editorCommon');
import Modes = require('vs/editor/common/modes');
import lifecycle = require('vs/base/common/lifecycle');
import async = require('vs/base/common/async');
import tokenization = require('vs/languages/typescript/common/features/tokenization');
import quickFixMainActions = require('vs/languages/typescript/common/features/quickFixMainActions');
import typescriptWorker = require('vs/languages/typescript/common/typescriptWorker2');
import typescript = require('vs/languages/typescript/common/typescript');
import ts = require('vs/languages/typescript/common/lib/typescriptServices');
import {AbstractMode, createWordRegExp, ModeWorkerManager} from 'vs/editor/common/modes/abstractMode';
import {IModelService} from 'vs/editor/common/services/modelService';
import {OneWorkerAttr, AllWorkersAttr} from 'vs/platform/thread/common/threadService';
import {AsyncDescriptor} from 'vs/platform/instantiation/common/descriptors';
import {IMarker} from 'vs/platform/markers/common/markers';
import {ITelemetryService} from 'vs/platform/telemetry/common/telemetry';
import {IThreadService, ThreadAffinity} from 'vs/platform/thread/common/thread';
import {IInstantiationService} from 'vs/platform/instantiation/common/instantiation';
import {RichEditSupport} from 'vs/editor/common/modes/supports/richEditSupport';
import {DeclarationSupport} from 'vs/editor/common/modes/supports/declarationSupport';
import {ReferenceSupport} from 'vs/editor/common/modes/supports/referenceSupport';
import {ParameterHintsSupport} from 'vs/editor/common/modes/supports/parameterHintsSupport';
import {SuggestSupport} from 'vs/editor/common/modes/supports/suggestSupport';

export import tokenization = tokenization;

class SemanticValidator {

	private _modelService: IModelService;
	private _mode: TypeScriptMode<any>;
	private _validation: async.RunOnceScheduler;
	private _lastChangedResource: URI;
	private _listener: { [r: string]: Function } = Object.create(null);

	constructor(mode: TypeScriptMode<any>, @IModelService modelService: IModelService) {
		this._modelService = modelService;
		this._mode = mode;
		this._validation = new async.RunOnceScheduler(this._doValidate.bind(this), 750);
		if (this._modelService) {
			this._modelService.onModelAdded(this._onModelAdded, this);
			this._modelService.onModelRemoved(this._onModelRemoved, this);
			this._modelService.onModelModeChanged(event => {
				// Handle a model mode changed as a remove + add
				this._onModelRemoved(event.model);
				this._onModelAdded(event.model);
			}, this);
			this._modelService.getModels().forEach(this._onModelAdded, this);
		// } else {
		// 	console.warn('NO model service for validation');
		}
	}

	public dispose(): void {
		this._validation.dispose();
	}

	private _lastValidationReq: number = 0;

	public validateOpen(): void {
		this._scheduleValidation();
	}

	private _scheduleValidation(resource?: URI): void {
		this._lastValidationReq += 1;
		this._lastChangedResource = resource;
		this._validation.schedule();
	}

	private _doValidate(): void {

		var resources: URI[] = [];
		if (this._lastChangedResource) {
			resources.push(this._lastChangedResource);
		}
		for (var k in this._listener) {
			if (!this._lastChangedResource || k !== this._lastChangedResource.toString()) {
				resources.push(URI.parse(k));
			}
		}

		var thisValidationReq = this._lastValidationReq;
		var validate = async.sequence(resources.map(r => {
			return () => {

				if (!this._modelService.getModel(r)) {
					return WinJS.TPromise.as(undefined);
				}

				if (thisValidationReq === this._lastValidationReq) {
					return this._mode.performSemanticValidation(r);
				}
			};
		}));

		validate.done(undefined, err => console.warn(err));
	}

	private _onModelAdded(model: EditorCommon.IModel): void {

		if (!this._mode._shouldBeValidated(model)) {
			return;
		}

		var validate: Function,
			unbind: Function;

		validate = () => {
			this._scheduleValidation(model.getAssociatedResource());
		};

		unbind = model.addListener(EditorCommon.EventType.ModelContentChanged2, _ => validate());
		this._listener[model.getAssociatedResource().toString()] = unbind;
		validate();
	}

	private _onModelRemoved(model: EditorCommon.IModel): void {
		var unbind = this._listener[model.getAssociatedResource().toString()];
		if (unbind) {
			unbind();
			delete this._listener[model.getAssociatedResource().toString()];
		}
	}
}

export class TypeScriptMode<W extends typescriptWorker.TypeScriptWorker2> extends AbstractMode implements lifecycle.IDisposable {

	public tokenizationSupport: Modes.ITokenizationSupport;
	public richEditSupport: Modes.IRichEditSupport;
	public configSupport:Modes.IConfigurationSupport;
	public referenceSupport: Modes.IReferenceSupport;
	public extraInfoSupport:Modes.IExtraInfoSupport;
	public occurrencesSupport:Modes.IOccurrencesSupport;
	public quickFixSupport:Modes.IQuickFixSupport;
	public logicalSelectionSupport:Modes.ILogicalSelectionSupport;
	public parameterHintsSupport:Modes.IParameterHintsSupport;
	public outlineSupport:Modes.IOutlineSupport;
	public declarationSupport: Modes.IDeclarationSupport;
	public formattingSupport: Modes.IFormattingSupport;
	public emitOutputSupport:Modes.IEmitOutputSupport;
	public renameSupport: Modes.IRenameSupport;
	public suggestSupport: Modes.ISuggestSupport;

	private _telemetryService: ITelemetryService;
	private _disposables: lifecycle.IDisposable[] = [];
	private _projectResolver: WinJS.TPromise<typescript.IProjectResolver2>;
	private _semanticValidator: SemanticValidator;
	private _modeWorkerManager: ModeWorkerManager<W>;
	private _threadService:IThreadService;
	private _instantiationService: IInstantiationService;

	constructor(
		descriptor:Modes.IModeDescriptor,
		@IInstantiationService instantiationService: IInstantiationService,
		@IThreadService threadService: IThreadService,
		@ITelemetryService telemetryService: ITelemetryService
	) {
		super(descriptor.id);
		this._threadService = threadService;
		this._instantiationService = instantiationService;
		this._telemetryService = telemetryService;
		this._modeWorkerManager = this._createModeWorkerManager(descriptor, instantiationService);

		if (this._threadService && this._threadService.isInMainThread) {

			// semantic validation from the client side
			this._semanticValidator = instantiationService.createInstance(SemanticValidator, this);
			this._disposables.push(this._semanticValidator);

			// create project resolver
			var desc = this._getProjectResolver();
			if(!desc) {
				throw new Error('missing project resolver!');
			}
			if (desc instanceof AsyncDescriptor) {
				this._projectResolver = instantiationService.createInstance(desc, this).then(undefined, err => {
					console.error(err);
					return typescript.Defaults.ProjectResolver;
				});
			} else {
				this._projectResolver = WinJS.TPromise.as(desc);
			}

			this._projectResolver = this._projectResolver.then(instance => {
				instance.setConsumer(this);
				return instance;
			});
		}

		this.configSupport = this;
		this.extraInfoSupport = this;
		this.occurrencesSupport = this;
		this.formattingSupport = this;
		this.quickFixSupport = this;
		this.logicalSelectionSupport = this;
		this.outlineSupport = this;
		this.emitOutputSupport = this;
		this.renameSupport = this;
		this.tokenizationSupport = tokenization.createTokenizationSupport(this, tokenization.Language.TypeScript);

		this.richEditSupport = new RichEditSupport(this.getId(), null, {
			wordPattern: createWordRegExp('$'),

			comments: {
				lineComment: '//',
				blockComment: ['/*', '*/']
			},

			brackets: [
				['{', '}'],
				['[', ']'],
				['(', ')']
			],

			onEnterRules: [
				{
					// e.g. /** | */
					beforeText: /^\s*\/\*\*(?!\/)([^\*]|\*(?!\/))*$/,
					afterText: /^\s*\*\/$/,
					action: { indentAction: Modes.IndentAction.IndentOutdent, appendText: ' * ' }
				},
				{
					// e.g. /** ...|
					beforeText: /^\s*\/\*\*(?!\/)([^\*]|\*(?!\/))*$/,
					action: { indentAction: Modes.IndentAction.None, appendText: ' * ' }
				},
				{
					// e.g.  * ...|
					beforeText: /^(\t|(\ \ ))*\ \*(\ ([^\*]|\*(?!\/))*)?$/,
					action: { indentAction: Modes.IndentAction.None, appendText: '* ' }
				},
				{
					// e.g.  */|
					beforeText: /^(\t|(\ \ ))*\ \*\/\s*$/,
					action: { indentAction: Modes.IndentAction.None, removeText: 1 }
				}
			],

			__electricCharacterSupport: {
				docComment: {scope:'comment.doc', open:'/**', lineStart:' * ', close:' */'}
			},

			__characterPairSupport: {
				autoClosingPairs: [
					{ open: '{', close: '}' },
					{ open: '[', close: ']' },
					{ open: '(', close: ')' },
					{ open: '"', close: '"', notIn: ['string'] },
					{ open: '\'', close: '\'', notIn: ['string', 'comment'] },
					{ open: '`', close: '`' }
				]
			}
		});

		this.referenceSupport = new ReferenceSupport(this.getId(), {
			tokens: ['identifier.ts'],
			findReferences: (resource, position, includeDeclaration) => this.findReferences(resource, position, includeDeclaration)});

		this.declarationSupport = new DeclarationSupport(this.getId(), {
			tokens: ['identifier.ts', 'string.ts', 'attribute.value.vs'],
			findDeclaration: (resource, position) => this.findDeclaration(resource, position)});

		this.parameterHintsSupport = new ParameterHintsSupport(this.getId(), {
			triggerCharacters: ['(', ','],
			excludeTokens: ['string.ts'],
			getParameterHints: (resource, position) => this.getParameterHints(resource, position)});

		this.suggestSupport = new SuggestSupport(this.getId(), {
			triggerCharacters: ['.'],
			excludeTokens: ['string', 'comment', 'number'],
			suggest: (resource, position) => this.suggest(resource, position),
			getSuggestionDetails: (resource, position, suggestion) => this.getSuggestionDetails(resource, position, suggestion)});
	}

	public creationDone(): void {
		if (this._threadService.isInMainThread) {
			// Pick a worker to do validation
			this._pickAWorkerToValidate();
		}
	}

	protected _createModeWorkerManager(descriptor:Modes.IModeDescriptor, instantiationService: IInstantiationService): ModeWorkerManager<W> {
		return new ModeWorkerManager<W>(descriptor, 'vs/languages/typescript/common/typescriptWorker2', 'TypeScriptWorker2', null, instantiationService);
	}

	protected _worker<T>(runner:(worker:W)=>WinJS.TPromise<T>): WinJS.TPromise<T>;
	protected _worker<T>(runner:(worker:W)=>T): WinJS.TPromise<T>;
	protected _worker<T>(runner:(worker:W)=>any): WinJS.TPromise<T> {
		return this._modeWorkerManager.worker(runner);
	}

	public dispose(): void {
		this._disposables = lifecycle.disposeAll(this._disposables);
	}

	_shouldBeValidated(model: EditorCommon.IModel): boolean {
		return model.getMode() === this || /\.ts$/.test(model.getAssociatedResource().fsPath);
	}

	// ---- project sync

	protected _getProjectResolver(): AsyncDescriptor<typescript.IProjectResolver2>|typescript.IProjectResolver2 {
		return typescript.Defaults.ProjectResolver;
	}

	acceptProjectChanges(changes: { kind: typescript.ChangeKind; resource: URI; files: URI[]; options: ts.CompilerOptions }[]): WinJS.TPromise<{[dirname:string]:URI}> {
		this._semanticValidator.validateOpen();
		return this._doAcceptProjectChanges(changes);
	}

	static $_doAcceptProjectChanges = AllWorkersAttr(TypeScriptMode, TypeScriptMode.prototype._doAcceptProjectChanges);
	private _doAcceptProjectChanges(changes: { kind: typescript.ChangeKind; resource: URI; files: URI[]; options: ts.CompilerOptions }[]): WinJS.TPromise<{[dirname:string]:URI}> {
		return this._worker(worker => worker.acceptProjectChanges(changes));
	}

	acceptFileChanges(changes: { kind: typescript.ChangeKind; resource: URI; content: string }[]): WinJS.TPromise<boolean> {

		let newLengthTotal = 0;
		for(let change of changes) {
			if(change.content) {
				newLengthTotal += change.content.length;
			}
		}

		return this._canAcceptFileChanges(newLengthTotal).then(canAccept => {
			if (canAccept === false) { // explict compare with false because the tests return null here
				return WinJS.TPromise.wrapError(nls.localize('err.tooMuchData',
					"Sorry, but there are too many JavaScript source files for VS Code. Consider using the exclude-property in jsconfig.json."));
			}
			return this._doAcceptFileChanges(changes).then(accepted => {
				this._semanticValidator.validateOpen();
				return accepted;
			});
		});
	}

	static $_canAcceptFileChanges = OneWorkerAttr(TypeScriptMode, TypeScriptMode.prototype._canAcceptFileChanges);
	private _canAcceptFileChanges(length: number): WinJS.TPromise<boolean> {
		return this._worker(worker => worker.canAcceptFileChanges(length));
	}

	static $_doAcceptFileChanges = AllWorkersAttr(TypeScriptMode, TypeScriptMode.prototype._doAcceptFileChanges);
	private _doAcceptFileChanges(changes: { kind: typescript.ChangeKind; resource: URI; content: string }[]): WinJS.TPromise<boolean> {
		return this._worker(worker => worker.acceptFileChanges(changes));
	}

	private _defaultLibPromise: WinJS.TPromise<any>;

	private _defaultLib(): WinJS.TPromise<any> {
		if (!this._defaultLibPromise) {

			var fileChanges: typescript.IFileChange[] = [];
			var p1 = new WinJS.TPromise<string>((c, e) => require([typescript.defaultLib.path.substr(1)], c, e)).then(content => {
				fileChanges.push({
					kind: typescript.ChangeKind.Added,
					resource: typescript.defaultLib,
					content
				});
			});
			var p2 = new WinJS.TPromise<string>((c, e) => require([typescript.defaultLibES6.path.substr(1)], c, e)).then(content => {
				fileChanges.push({
					kind: typescript.ChangeKind.Added,
					resource: typescript.defaultLibES6,
					content
				});
			});

			this._defaultLibPromise = WinJS.TPromise.join([p1, p2]).then(values => this.acceptFileChanges(fileChanges));
		}
		return new async.ShallowCancelThenPromise(this._defaultLibPromise);
	}

	private _syncProjects(): WinJS.TPromise<any> {
		if (this._projectResolver) {
			return this._defaultLib()
				.then(_ => this._projectResolver)
				.then(r => r.resolveProjects());
		}
	}

	public superConfigure(options:any): WinJS.TPromise<void> {
		if (this._threadService.isInMainThread) {
			return this._configureWorkers(options);
		} else {
			return this._worker((w) => w._doConfigure(options));
		}
	}

	public configure(options: any): WinJS.TPromise<void> {
		var ret = this.superConfigure(options);
		if (this._semanticValidator) {
			ret.then(validate => validate && this._semanticValidator.validateOpen());
		}
		return ret;
	}

	static $_configureWorkers = AllWorkersAttr(TypeScriptMode, TypeScriptMode.prototype._configureWorkers);
	private _configureWorkers(options:any): WinJS.TPromise<void> {
		return this._worker((w) => w._doConfigure(options));
	}

	// ---- worker talk

	static $_pickAWorkerToValidate = OneWorkerAttr(TypeScriptMode, TypeScriptMode.prototype._pickAWorkerToValidate, TypeScriptMode.prototype._syncProjects, ThreadAffinity.Group3);
	private _pickAWorkerToValidate(): WinJS.Promise {
		return this._worker((w) => w.enableValidator());
	}

	public performSemanticValidation(resource: URI): WinJS.TPromise<void> {
		return this.doValidateSemantics(resource).then(missesFiles => {
			if (!missesFiles) {
				return;
			}
			return this.getMissingFiles().then(missing => {
				if (missing) {
					// console.log(`${resource.fsPath} misses ~${missing.length} resources`);
					return this._projectResolver.then(resolver => {
						return resolver.resolveFiles(missing);
					});
				}
			});
		});
	}

	static $doValidateSemantics = OneWorkerAttr(TypeScriptMode, TypeScriptMode.prototype.doValidateSemantics, TypeScriptMode.prototype._syncProjects, ThreadAffinity.Group3);
	public doValidateSemantics(resource: URI): WinJS.TPromise<boolean> {
		return this._worker(w => w.doValidateSemantics(resource));
	}

	static $getMissingFiles = OneWorkerAttr(TypeScriptMode, TypeScriptMode.prototype.getMissingFiles, TypeScriptMode.prototype._syncProjects, ThreadAffinity.Group3);
	public getMissingFiles(): WinJS.TPromise<URI[]> {
		return this._worker(w => w.getMissingFiles());
	}

	static $getOutline = OneWorkerAttr(TypeScriptMode, TypeScriptMode.prototype.getOutline, TypeScriptMode.prototype._syncProjects, ThreadAffinity.Group1);
	public getOutline(resource:URI):WinJS.TPromise<Modes.IOutlineEntry[]> {
		return this._worker((w) => w.getOutline(resource));
	}

	static $findOccurrences = OneWorkerAttr(TypeScriptMode, TypeScriptMode.prototype.findOccurrences, TypeScriptMode.prototype._syncProjects, ThreadAffinity.Group2);
	public findOccurrences(resource:URI, position:EditorCommon.IPosition, strict:boolean = false): WinJS.TPromise<Modes.IOccurence[]> {
		return this._worker((w) => w.findOccurrences(resource, position, strict));
	}

	static $suggest = OneWorkerAttr(TypeScriptMode, TypeScriptMode.prototype.suggest, TypeScriptMode.prototype._syncProjects, ThreadAffinity.Group2);
	public suggest(resource:URI, position:EditorCommon.IPosition):WinJS.TPromise<Modes.ISuggestResult[]> {
		return this._worker((w) => w.suggest(resource, position));
	}

	static $getSuggestionDetails = OneWorkerAttr(TypeScriptMode, TypeScriptMode.prototype.getSuggestionDetails, TypeScriptMode.prototype._syncProjects, ThreadAffinity.Group2);
	public getSuggestionDetails(resource:URI, position:EditorCommon.IPosition, suggestion:Modes.ISuggestion):WinJS.TPromise<Modes.ISuggestion> {
		return this._worker((w) => w.getSuggestionDetails(resource, position, suggestion));
	}

	static $getParameterHints = OneWorkerAttr(TypeScriptMode, TypeScriptMode.prototype.getParameterHints, TypeScriptMode.prototype._syncProjects, ThreadAffinity.Group2);
	public getParameterHints(resource:URI, position:EditorCommon.IPosition):WinJS.TPromise<Modes.IParameterHints> {
		return this._worker((w) => w.getParameterHints(resource, position));
	}

	static $getEmitOutput = OneWorkerAttr(TypeScriptMode, TypeScriptMode.prototype.getEmitOutput, TypeScriptMode.prototype._syncProjects, ThreadAffinity.Group3);
	public getEmitOutput(resource:URI, type:string = undefined):WinJS.Promise {
		return this._worker((w) => w.getEmitOutput(resource, type));
	}

	static $findReferences = OneWorkerAttr(TypeScriptMode, TypeScriptMode.prototype.findReferences, TypeScriptMode.prototype._syncProjects, ThreadAffinity.Group3);
	public findReferences(resource:URI, position:EditorCommon.IPosition, includeDeclaration:boolean):WinJS.TPromise<Modes.IReference[]> {
		return this._worker((w) => w.findReferences(resource, position, includeDeclaration));
	}

	public get filter() {
		return ['identifier.ts', 'string.ts'];
	}

	static $rename = OneWorkerAttr(TypeScriptMode, TypeScriptMode.prototype.rename, TypeScriptMode.prototype._syncProjects, ThreadAffinity.Group2);
	public rename(resource: URI, position: EditorCommon.IPosition, newName: string): WinJS.TPromise<Modes.IRenameResult> {
		return this._worker(w => w.rename(resource, position, newName));
	}

	public runQuickFixAction(resource:  URI, range: EditorCommon.IRange, id: any): WinJS.TPromise<Modes.IQuickFixResult> {
		var quickFixMainSupport = this._instantiationService.createInstance(quickFixMainActions.QuickFixMainActions);
		return quickFixMainSupport.evaluate(resource, range, id).then((action) => {
			if (action) {
				return action;
			}
			return this.runQuickFixActionInWorker(resource, range, id);
		});
	}

	static $runQuickFixActionInWorker = OneWorkerAttr(TypeScriptMode, TypeScriptMode.prototype.runQuickFixActionInWorker, TypeScriptMode.prototype._syncProjects, ThreadAffinity.Group2);
	public runQuickFixActionInWorker(resource:  URI, range: EditorCommon.IRange, id: any): WinJS.TPromise<Modes.IQuickFixResult> {
		return this._worker((w) => w.runQuickFixAction(resource, range, id));
	}

	static $getQuickFixes = OneWorkerAttr(TypeScriptMode, TypeScriptMode.prototype.getQuickFixes, TypeScriptMode.prototype._syncProjects, ThreadAffinity.Group2);
	public getQuickFixes(resource: URI, range: IMarker | EditorCommon.IRange):WinJS.TPromise<Modes.IQuickFix[]> {
		return this._worker((w) => w.getQuickFixes(resource, range));
	}

	static $getRangesToPosition = OneWorkerAttr(TypeScriptMode, TypeScriptMode.prototype.getRangesToPosition, TypeScriptMode.prototype._syncProjects, ThreadAffinity.Group1);
	public getRangesToPosition(resource: URI, position:EditorCommon.IPosition):WinJS.TPromise<Modes.ILogicalSelectionEntry[]> {
		return this._worker((w) => w.getRangesToPosition(resource, position));
	}

	static $findDeclaration = OneWorkerAttr(TypeScriptMode, TypeScriptMode.prototype.findDeclaration, TypeScriptMode.prototype._syncProjects, ThreadAffinity.Group2);
	public findDeclaration(resource: URI, position:any):WinJS.TPromise<Modes.IReference> {
		return this._worker((w) => w.findDeclaration(resource, position));
	}

	static $computeInfo = OneWorkerAttr(TypeScriptMode, TypeScriptMode.prototype.computeInfo, TypeScriptMode.prototype._syncProjects, ThreadAffinity.Group2);
	public computeInfo(resource: URI, position:EditorCommon.IPosition): WinJS.TPromise<Modes.IComputeExtraInfoResult> {
		return this._worker((w) => w.computeInfo(resource, position));
	}

	public get autoFormatTriggerCharacters():string[] {
		return [';', '}', '\n'];
	}

	static $formatDocument = OneWorkerAttr(TypeScriptMode, TypeScriptMode.prototype.formatDocument, TypeScriptMode.prototype._syncProjects, ThreadAffinity.Group1);
	public formatDocument(resource: URI, options:Modes.IFormattingOptions):WinJS.TPromise<EditorCommon.ISingleEditOperation[]> {
		return this._worker((w) => w.formatDocument(resource, options));
	}

	static $formatRange = OneWorkerAttr(TypeScriptMode, TypeScriptMode.prototype.formatRange, TypeScriptMode.prototype._syncProjects, ThreadAffinity.Group1);
	public formatRange(resource: URI, range:EditorCommon.IRange, options:Modes.IFormattingOptions):WinJS.TPromise<EditorCommon.ISingleEditOperation[]> {
		return this._worker((w) => w.formatRange(resource, range, options));
	}

	static $formatAfterKeystroke = OneWorkerAttr(TypeScriptMode, TypeScriptMode.prototype.formatAfterKeystroke, TypeScriptMode.prototype._syncProjects, ThreadAffinity.Group1);
	public formatAfterKeystroke(resource: URI, position:EditorCommon.IPosition, ch: string, options:Modes.IFormattingOptions):WinJS.TPromise<EditorCommon.ISingleEditOperation[]> {
		return this._worker((w) => w.formatAfterKeystroke(resource, position, ch, options));
	}
}
