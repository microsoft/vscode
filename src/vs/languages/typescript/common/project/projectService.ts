/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import URI from 'vs/base/common/uri';
import arrays = require('vs/base/common/arrays');
import typescript = require('vs/languages/typescript/common/typescript');
import paths = require('vs/base/common/paths');
import ts = require('vs/languages/typescript/common/lib/typescriptServices');
import snapshots = require('vs/languages/typescript/common/project/snapshots');
import rewriting = require('vs/languages/typescript/common/js/rewriting');
import EditorCommon = require('vs/editor/common/editorCommon');
import textEdits = require('vs/languages/typescript/common/js/textEdits');
import LineMap = require('vs/languages/typescript/common/lineMap');
import {Position} from 'vs/editor/common/core/position';

export class Script {

	private _value: string;
	private _version: number = 0;
	private _lineMap: LineMap;
	private _snap: ts.IScriptSnapshot;

	public update(value: string): Script {
		if (value !== this._value) {
			this._value = value;
			this._lineMap = undefined;
			this._snap = undefined;
			this._version += 1;
		}
		return this;
	}

	public version(): number {
		return this._version;
	}

	public snap(): ts.IScriptSnapshot {
		if (!this._snap) {
			this._snap = snapshots.fromValue(this._value);
		}
		return this._snap;
	}

	public lineMap(): LineMap {
		if (!this._lineMap) {
			this._lineMap = LineMap.create(this._value);
		}
		return this._lineMap;
	}
}

export class LanguageServiceHost implements ts.LanguageServiceHost {

	private _roots: string[];
	private _scriptLookUp: (fileName: string) => Script;
	private _compilerOptions: ts.CompilerOptions;
	private _projectVersion: string;
	private _missing: MissingFilesManager;

	constructor(roots: string[], scriptLookUp: (fileName: string) => Script) {
		this._missing = createMissingFileManager();
		this._scriptLookUp = (fileName: string) => {
			let script = scriptLookUp(fileName);
			if (!script) {
				this._missing.addMissing(fileName);
			}
			return script;
		};
		this.setRoots(roots);
		this.setCompilationSettings(ts.getDefaultCompilerOptions());
	}

	addRoot(fileName: string): boolean {
		if (!~this._roots.indexOf(fileName)) {
			this._roots.push(fileName);
			this._projectVersion = undefined;
			return true;
		}
	}

	addRootIfMissing(fileName: string): boolean {
		if (this._missing.removeMissing(fileName)) {
			return this.addRoot(fileName);
		}
	}

	removeRoot(fileName: string): boolean {
		var idx = this._roots.indexOf(fileName);
		if (~idx && !!this._roots.splice(idx, 1)) {
			this._projectVersion = undefined;
			return true;
		}
	}

	isRoot(fileName: string): boolean {
		return this._roots.indexOf(fileName) >= 0;
	}

	setRoots(roots :string[]) {
		this._roots = roots;
		this._projectVersion = undefined;
	}

	setCompilationSettings(options: ts.CompilerOptions): void {
		this._projectVersion = undefined;
		this._compilerOptions = options || ts.getDefaultCompilerOptions();
		this._compilerOptions.allowNonTsExtensions = true; // because of JS* and mirror model we need this
		this._compilerOptions.module = ts.ModuleKind.CommonJS; // because of JS*
		this._compilerOptions.target = options && options.target !== undefined ? options.target : ts.ScriptTarget.Latest; // because of JS*
	}

	getCompilationSettings(): ts.CompilerOptions {
		return this._compilerOptions;
	}

	getMissingFileNamesSinceLastTime(): string[]{
		return this._missing.getMissingSinceLastTime();
	}

	getScriptFileNames(): string[] {
		return this._roots;
	}

	getScriptVersion(fileName: string): string {
		var script = this._scriptLookUp(fileName);
		return script && script.version().toString();
	}

	getScriptSnapshot(fileName: string): ts.IScriptSnapshot {
		var script = this._scriptLookUp(fileName);
		return script && script.snap();
	}

	getScriptLineMap(fileName: string): LineMap {
		var script = this._scriptLookUp(fileName);
		return script && script.lineMap();
	}

	getCurrentDirectory(): string {
		return '';
	}

	getDefaultLibFileName(options: ts.CompilerOptions): string {
		if (!options || options.noLib) {
			return '';
		} else if (options.target === ts.ScriptTarget.ES6) {
			return typescript.defaultLibES6.toString();
		} else {
			return typescript.defaultLib.toString();
		}
	}

	// getProjectVersion(): string {
	// 	if (!this._projectVersion) {
	// 		this._projectVersion = Date.now().toString(16);
	// 	}
	// 	var value = [this._projectVersion];
	// 	for (var i = this._roots.length - 1; i >= 0; i--) {
	// 		value.push(this.getScriptVersion(this._roots[i]));
	// 	}
	// 	return value.join() + this._scriptStore.version;
	// }

	// getNewLine? (): string;
	// getLocalizedDiagnosticMessages?(): any;
	// getCancellationToken? (): CancellationToken;
}

export interface IProject {
	resource: URI;
	host: LanguageServiceHost;
	languageService: ts.LanguageService;
}

export interface IRewrittenProject extends IProject {
	translations: rewriting.ITranslations;
}

class Project implements IProject {

	resource: URI;

	host: LanguageServiceHost;

	languageService: ts.LanguageService;

	constructor(projectService: ProjectService, resource: URI, files: URI[], compilerOptions: ts.CompilerOptions) {
		this.resource = resource;
		this.host = new LanguageServiceHost(files.map(r => r.toString()), projectService.lookUpScript.bind(projectService));
		this.host.setCompilationSettings(compilerOptions);
		this.languageService = ts.createLanguageService(this.host);
	}
}

interface MissingFilesManager {
	getMissingSinceLastTime():string[];
	getMissingSince(generation: number): { generation: number; fileNames: string[] };
	addMissing(fileName: string): void;
	removeMissing(fileName: string): boolean;
}

function createMissingFileManager(): MissingFilesManager {

	var _missing: { [name: string]: number } = Object.create(null),
		_generation = 0;

	function addMissing(fileName: string) {
		_missing[fileName] = _missing[fileName] || _generation++;
	}

	function removeMissing(fileName: string): boolean {
		if (_missing[fileName]) {
			delete _missing[fileName];
			return true;
		}
	}

	function getMissingSince(generation: number = 0) {
		var fileNames: string[];
		for (var key in _missing) {
			if (_missing[key] >= generation) {
				if (!fileNames) {
					fileNames = [key];
				} else {
					fileNames.push(key);
				}
			}
		}
		return {
			generation: _generation,
			fileNames
		};
	}

	var _lastTime = 0;
	function getMissingSinceLastTime() {
		var result = getMissingSince(_lastTime);
		_lastTime = result.generation;
		return result.fileNames;
	}

	return {
		addMissing,
		removeMissing,
		getMissingSince,
		getMissingSinceLastTime
	};
}

export class ProjectService {

	private _scripts: { [resource: string]: Script } = Object.create(null);
	private _projects: { [resource: string]: Project } = Object.create(null);
	private _virtualProject: Project;
	private _rewrittenProjects: { [id: string]: RewrittenProject } = Object.create(null);
	private _defaultRewriter: rewriting.ISyntaxRewriter[];

	constructor() {
		this._virtualProject = this._projects[paths.dirname(typescript.virtualProjectResource.fsPath)] = new Project(this, typescript.virtualProjectResource, [], undefined);
	}

	public set defaultRewriter(value: rewriting.ISyntaxRewriter[]) {
		this._defaultRewriter = value;
	}

	public getProject(resource: URI): IProject;
	public getProject(resource: URI, rewriter: rewriting.ISyntaxRewriter[]): IRewrittenProject;
	public getProject(resource: URI, rewriter: rewriting.ISyntaxRewriter[] = this._defaultRewriter): any {

		var project = this._lookUpProject(resource);
		if (arrays.isFalsyOrEmpty(rewriter)) {
			return project;
		}

		var identifier = project.resource.toString() + rewriter.map(r => r.name).join(),
			rewrittenProject: RewrittenProject;

		rewrittenProject = this._rewrittenProjects[identifier] || new RewrittenProject(this, project, rewriter);
		return this._rewrittenProjects[identifier] = rewrittenProject;
	}

	private _lookUpProject(resource: URI): IProject {
		// TODO@Joh improve perf!
		var dirnames = paths.dirnames(resource.fsPath),
			iter = dirnames.next();

		while (!iter.done) {
			var dirname = iter.value;
			if (this._projects[dirname]
				&& this._projects[dirname].host.isRoot(resource.toString())) {

				return this._projects[dirname];
			}
			iter = dirnames.next();
		}

		// If no configured project could be found we use a single
		// virtual project to deal with all other files.
		this._virtualProject.host.addRoot(resource.toString());
		return this._virtualProject;
	}

	public projects(): IProject[]{
		var result: IProject[] = [];
		for (var key in this._projects) {
			result.push(this._projects[key]);
		}
		return result;
	}

	public lookUpScript(fileName: string): Script {
		var script = this._scripts[fileName];
		return script;
	}

	public get version() {
		return Object.keys(this._scripts).join('');
	}

	public scriptsNames(): string[]{
		return Object.keys(this._scripts);
	}

	private _forEachProject(callback: (p: Project) => any): void {
		for (let key in this._projects) {
			callback(this._projects[key]);
		}
		for (let key in this._rewrittenProjects) {
			callback(this._rewrittenProjects[key]);
		}
		callback(this._virtualProject);
	}

	public getMissingScriptNamesSinceLastTime(): string[] {
		let allMissing: { [fileName: string]: any } = Object.create(null);
		this._forEachProject(project => {
			let missing = project.host.getMissingFileNamesSinceLastTime();
			if (missing) {
				for (let fileName of missing) {
					allMissing[fileName] = 0;
				}
			}
		});
		return Object.keys(allMissing);
	}

	public getTotalLength():number {
		let total = 0;
		for(let k in this._scripts) {
			total += this._scripts[k].snap().getLength();
		}
		return total;
	}

	// ---- sync'ing of files and projects -------------------------------------

	private _removeRewrittenProject(projectResource: URI): void {
		for (var key in this._rewrittenProjects) {
			if (this._rewrittenProjects[key].resource.toString() === projectResource.toString()) {
				delete this._rewrittenProjects[key];
			}
		}
	}

	_syncProject(kind: typescript.ChangeKind, resource: URI, files: URI[], options: ts.CompilerOptions): void {

		// console.log('SYNC project ', typescript.ChangeKind[kind], resource.fsPath, files.map(f => f.fsPath), options);

		var projectFolderName = paths.dirname(resource.fsPath);
		if (kind === typescript.ChangeKind.Added || kind === typescript.ChangeKind.Changed) {
			// replace/update the project when it was added/changed
			// *remove any rewritten project that relates to this project
			// *remove project files from virtual project
			if (kind === typescript.ChangeKind.Changed) {
				this._projects[projectFolderName].host.setCompilationSettings(options);
				this._projects[projectFolderName].host.setRoots(files.map(f => f.toString()));
			} else {
				this._projects[projectFolderName] = new Project(this, resource, files, options);
			}
			this._removeRewrittenProject(resource);
			if (resource.toString() !== this._virtualProject.resource.toString()) {
				for (resource of files) {
					this._virtualProject.host.removeRoot(resource.toString());
				}
			}

		} else if (kind === typescript.ChangeKind.Removed) {
			// remove project with this key and *all* rewritten projects that
			// relate to this project - via resource
			var project = this._projects[projectFolderName];
			if (project) {
				delete this._projects[projectFolderName];
				this._removeRewrittenProject(project.resource);
			}
			// remove rewritten project!
		}
	}

	_syncFile(kind: typescript.ChangeKind, resource: URI, content: string): void {
		var fileName = resource.toString();
		if (kind === typescript.ChangeKind.Removed) {
			delete this._scripts[fileName];
		} else if (kind === typescript.ChangeKind.Changed) {
			var script = this._scripts[fileName] || new Script();
			this._scripts[fileName] = script.update(content);
		} else if(kind === typescript.ChangeKind.Added) {
			this._scripts[fileName] = new Script().update(content);
			this._forEachProject(project => project.host.addRootIfMissing(fileName));
		}
	}
}

// ---- rewriting

class RewrittenProject implements IRewrittenProject {

	resource: URI;

	host: LanguageServiceHost;

	languageService: ts.LanguageService;

	translations: rewriting.ITranslations;

	constructor(projectService: ProjectService, project: IProject, rewriter:rewriting.ISyntaxRewriter[]) {
		var host = new RewritingLanguageServiceHost(project.host.getScriptFileNames(),
			projectService.lookUpScript.bind(projectService),
			project.languageService.getSourceFile.bind(project.languageService),
			rewriter);

		this.resource = project.resource;
		this.translations = host;
		this.host = host;
		this.host.setCompilationSettings(project.host.getCompilationSettings());
		this.languageService = ts.createLanguageService(this.host);
	}
}


interface IRewrittenScript {
	versionId: string;
	script: Script;
	translator: rewriting.ITranslator;
}

class Translator implements rewriting.ITranslator {

	private _textOperationResult: textEdits.ITextOperationResult;
	private _lineMapModified: LineMap;
	private _lineMapOriginal: LineMap;

	constructor(textOperationResult: textEdits.ITextOperationResult, modified:ts.IScriptSnapshot, original:ts.IScriptSnapshot) {
		this._textOperationResult = textOperationResult;
		this._lineMapModified = LineMap.create(modified.getText(0, modified.getLength()));
		this._lineMapOriginal = LineMap.create(original.getText(0, original.getLength()));
	}

	public to(position:EditorCommon.IPosition):EditorCommon.IPosition;
	public to(range:EditorCommon.IRange):EditorCommon.IRange;
	public to(thing:any):any {
		if(Position.isIPosition(thing)) {
			return this._doTranslate(this._textOperationResult.doEdits, this._lineMapOriginal, this._lineMapModified, <EditorCommon.IPosition> thing, textEdits.TranslationBehaviour.None);
		} else {
			var range = <EditorCommon.IRange> thing,
				startPosition = this._doTranslate(this._textOperationResult.doEdits, this._lineMapOriginal, this._lineMapModified, { lineNumber: range.startLineNumber, column: range.startColumn }, textEdits.TranslationBehaviour.None),
				endPosition = this._doTranslate(this._textOperationResult.doEdits, this._lineMapOriginal, this._lineMapModified, { lineNumber: range.endLineNumber, column: range.endColumn }, textEdits.TranslationBehaviour.None);
			return <EditorCommon.IRange> {
				startLineNumber: startPosition.lineNumber,
				startColumn: startPosition.column,
				endLineNumber: endPosition.lineNumber,
				endColumn: endPosition.column
			};
		}
	}

	public from(position:EditorCommon.IPosition):EditorCommon.IPosition;
	public from(range:EditorCommon.IRange):EditorCommon.IRange;
	public from(thing:any):any {

		if(Position.isIPosition(thing)) {
			return this._doTranslate(this._textOperationResult.undoEdits, this._lineMapModified, this._lineMapOriginal, <EditorCommon.IPosition> thing, textEdits.TranslationBehaviour.None);
		} else {
			var range = <EditorCommon.IRange> thing,
				startPosition = this._doTranslate(this._textOperationResult.undoEdits, this._lineMapModified, this._lineMapOriginal, { lineNumber: range.startLineNumber, column: range.startColumn }, textEdits.TranslationBehaviour.StickLeft),
				endPosition = this._doTranslate(this._textOperationResult.undoEdits, this._lineMapModified, this._lineMapOriginal, { lineNumber: range.endLineNumber, column: range.endColumn }, textEdits.TranslationBehaviour.StickRight);
			return <EditorCommon.IRange> {
				startLineNumber: startPosition.lineNumber,
				startColumn: startPosition.column,
				endLineNumber: endPosition.lineNumber,
				endColumn: endPosition.column
			};
		}
	}

	private _doTranslate(_edits:textEdits.Edit[], from:LineMap, to:LineMap, position:EditorCommon.IPosition, behaviour:textEdits.TranslationBehaviour):EditorCommon.IPosition {

		var offset = from.getOffset(position),
			newOffset = textEdits.translate(_edits, offset, behaviour);

		return to.getPositionFromOffset(newOffset);
	}

	public info(range: EditorCommon.IRange): rewriting.ITranslationInfo {

		var minChar = this._lineMapModified.getOffset(Position.startPosition(range)),
			limChar = this._lineMapModified.getOffset(Position.endPosition(range)),
			span: textEdits.TextSpan;

		span = new textEdits.TextSpan(minChar, limChar - minChar);

		// origin
		var origin: EditorCommon.IRange;
		// disabled because of https://monacotools.visualstudio.com/DefaultCollection/Monaco/_workitems/edit/17733
		// for (var i = 0; i < this._textOperationResult.derived.length; i += 2) {
		// 	if (this._textOperationResult.derived[i].contains(span)) {
		// 		var originSpan = this._textOperationResult.derived[i + 1];
		// 		origin = this._lineMapOriginal.getRangeFromSpan({ start: originSpan.offset, length: originSpan.length });
		// 		break;
		// 	}
		// }

		// inserted?
		var edits = this._textOperationResult.undoEdits,
			isInserted = false,
			isOverlapping = false;

		for (var i = 0, len = edits.length; i < len && !isInserted && !isOverlapping; i++) {
			if (edits[i].contains(span)) {
				isInserted = true;
			}
			if (edits[i].overlaps(span)) {
				isOverlapping = true;
			}
		}

		return {
			origin,
			isInserted,
			isOverlapping
		};
	}
}

class RewritingLanguageServiceHost extends LanguageServiceHost implements rewriting.ITranslations {

	private _syntaxRewriter: rewriting.ISyntaxRewriter[];
	private _sourceFileLookUp: (fileName: string) => ts.SourceFile;
	private _rewrittenSnapshots: { [n: string]: IRewrittenScript } = Object.create(null);

	constructor(roots: string[], scripts: (fileName: string) => Script,
		sourceFiles: (fileName: string) => ts.SourceFile, rewriter: rewriting.ISyntaxRewriter[]) {

		super(roots, scripts);
		this._sourceFileLookUp = sourceFiles;
		this._syntaxRewriter = rewriter;
	}

	getTranslator(resource: URI): rewriting.ITranslator {
		var fileName = resource.toString();
		var cached = this._getOrCreateRewrittenSnapshot(fileName);
		return cached && cached.translator || rewriting.IdentityTranslator.Instance;
	}

	getOriginal(resource: URI): ts.IScriptSnapshot {
		return super.getScriptSnapshot(resource.toString());
	}

	getScriptSnapshot(fileName: string): ts.IScriptSnapshot {
		var cached = this._getOrCreateRewrittenSnapshot(fileName);
		return cached && cached.script.snap() || super.getScriptSnapshot(fileName);
	}

	getScriptLineMap(fileName: string): LineMap {
		var cached = this._getOrCreateRewrittenSnapshot(fileName);
		return cached && cached.script.lineMap() || super.getScriptLineMap(fileName);
	}

	private _getOrCreateRewrittenSnapshot(fileName:string):IRewrittenScript {

		if (paths.extname(fileName) === '.ts') {
			return null;
		}

		if(!super.getScriptSnapshot(fileName)) {
			return null;
		}

		var versionId = this.getScriptVersion(fileName),
			cached = this._rewrittenSnapshots[fileName];

		if(!cached || cached.versionId !== versionId) {

			var snapshot = super.getScriptSnapshot(fileName),
				result = rewriting.translate(this._syntaxRewriter, snapshot, this._sourceFileLookUp.bind(this, fileName)),
				script = new Script().update(result.value);

			cached = {
				script,
				versionId: this.getScriptVersion(fileName),
				translator: new Translator(result, script.snap(), snapshot)
			};

			this._rewrittenSnapshots[fileName] = cached;
			// console.info(result.value);
		}

		return cached;
	}
}