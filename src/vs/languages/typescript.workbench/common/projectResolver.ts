/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as glob from 'vs/base/common/glob';
import * as nls from 'vs/nls';
import * as objects from 'vs/base/common/objects';
import * as typescript from 'vs/languages/typescript/common/typescript';
import * as lifecycle from 'vs/base/common/lifecycle';
import * as errors from 'vs/base/common/errors';
import * as collections from 'vs/base/common/collections';
import * as async from 'vs/base/common/async';
import * as winjs from 'vs/base/common/winjs.base';
import Severity from 'vs/base/common/severity';
import URI from 'vs/base/common/uri';
import * as paths from 'vs/base/common/paths';
import * as ts from 'vs/languages/typescript/common/lib/typescriptServices';
import {IModelService} from 'vs/editor/common/services/modelService';
import {IEventService} from 'vs/platform/event/common/event';
import * as Files from 'vs/platform/files/common/files';
import {IMarkerService} from 'vs/platform/markers/common/markers';
import {IMessageService} from 'vs/platform/message/common/message';
import {ISearchService, QueryType} from 'vs/platform/search/common/search';
import {ITelemetryService} from 'vs/platform/telemetry/common/telemetry';
import {IWorkspaceContextService} from 'vs/platform/workspace/common/workspace';

interface $ProjectPerf {
	start: number;
	d: number;
	files: number;
	projects: number;
}

const defaultExcludeSegments: string[] = [
	'/.git/',
	'/node_modules/',
	'/bower_components/',
	'/jspm_packages/',
	'/tmp/',
	'/temp/',
];

class ProjectFileEventListener {

	private static _ignores = defaultExcludeSegments.map(s => paths.normalize(s, true));

	private _excludes: string[];
	private _includes: string[];

	constructor(private _baseDir: string, files: string[], exclude: string[]) {

		this._baseDir = paths.normalize(this._baseDir, true);

		if (Array.isArray(files)) {
			this._includes = [];
			for (let relativePath of files) {
				this._includes.push(paths.normalize(paths.join(this._baseDir, relativePath), true));
			}
		}

		if (Array.isArray(exclude)) {
			this._excludes = [];
			for (let relativePath of exclude) {
				this._excludes.push(paths.normalize(paths.join(this._baseDir, relativePath), true));
			}
		}
	}

	handleChange(resource:URI):boolean {

		// hard-coded list of folders to ignore
		for(let ignore of ProjectFileEventListener._ignores) {
			if(resource.fsPath.indexOf(ignore) !== -1) {
				return false;
			}
		}

		// must be in the project dir
		if(this._baseDir && resource.fsPath.indexOf(this._baseDir) !== 0) {
			return false;
		}

		// the resource is not on the include list
		if(this._includes && this._includes.indexOf(resource.fsPath) < 0) {
			return false;
		}

		// the resource matches an item from the exclude list
		if(this._excludes && this._excludes
			.some(exclude => resource.fsPath.indexOf(exclude) === 0)) {

			return false;
		}

		return true;
	}
}

class VirtualProjectFileEventListener extends ProjectFileEventListener {

	handleChange(resource: URI): boolean {
		return /\.d\.ts$/.test(resource.fsPath) && super.handleChange(resource);
	}
}

class ProjectResolver implements typescript.IProjectResolver2 {

	private static _defaultExcludePattern = `{${defaultExcludeSegments.map(s => `**${s}**`).join(',')}}`;
	private static _defaultExcludePatternForVirtualProject = `{**/lib*.d.ts,${defaultExcludeSegments.map(s => `**${s}**`).join(',')}}`;

	private _fileService: Files.IFileService;
	private _searchService: ISearchService;
	private _eventService: IEventService;
	private _markerService: IMarkerService;
	private _messageService: IMessageService;
	private _modelService: IModelService;
	private _telemetryService: ITelemetryService;
	private _workspace: URI;
	private _consumer: typescript.IProjectConsumer;
	private _configuration: { files: string; projects: string; maxFilesPerProject: number;};
	private _projectsIndex: {[dirname:string]:URI};
	private _projectDiscovery: winjs.TPromise<void>;
	private _fileChangesHandler: async.RunOnceScheduler;
	private _fileChangeEvents: Files.IFileChange[] = [];
	private _projectFileEventListener: { [r: string]: ProjectFileEventListener } = Object.create(null);
	private _projectPromises: { [r: string]: winjs.TPromise<typescript.IProjectChange> } = Object.create(null);
	private _pendingFiles: { [r: string]: { resource: URI; kind: typescript.ChangeKind } } = Object.create(null);
	private _unbindListener: Function;

	constructor(configuration: { files: string; projects: string; maxFilesPerProject: number; },
		consumer: typescript.IProjectConsumer,
		@Files.IFileService fileService: Files.IFileService,
		@ISearchService searchService: ISearchService,
		@IEventService eventService: IEventService,
		@IMarkerService markerService: IMarkerService,
		@IMessageService messageService: IMessageService,
		@IModelService modelService: IModelService,
		@ITelemetryService telemetryService: ITelemetryService,
		@IWorkspaceContextService contextService: IWorkspaceContextService
	) {
		this._fileService = fileService;
		this._searchService = searchService;
		this._eventService = eventService;
		this._markerService = markerService;
		this._messageService = messageService;
		this._modelService = modelService;
		this._telemetryService = telemetryService;
		this._workspace = contextService.getWorkspace() && contextService.getWorkspace().resource;
		this._consumer = consumer;
		this._configuration = configuration;

		this._fileChangesHandler = new async.RunOnceScheduler(this._processFileChangesEvents.bind(this), 1000);
		this._unbindListener = this._eventService.addListener(Files.EventType.FILE_CHANGES,
			this._onFileChangesEvent.bind(this));
	}

	public dispose(): void {
		lifecycle.cAll(this._unbindListener);
	}

	public setConsumer(consumer:typescript.IProjectConsumer):void {
		this._consumer = consumer;
	}

	public resolveProjects(): winjs.TPromise<any> {
		if (this._workspace) {
			var result = this._resolve;
			if (!result) {
				result = this._resolve = this._doResolve();
				async.always(this._resolve, ():void => this._resolve = null);
			}
			return new async.ShallowCancelThenPromise(result);
		}
	}

	public resolveFiles(resources: URI[]): winjs.TPromise<any> {

		// fetch only file-resources from disk
		resources = resources.filter(resource => resource.scheme === 'file');

		if (resources.length) {
			var handle = this._messageService.setStatusMessage(
				nls.localize('resolve.files.N', "Loading additional files..."), undefined, 250);

			var result = this._fileService.resolveContents(resources).then(contents => {
				var changes = contents.map(c => {
					return <typescript.IFileChange> {
						kind: typescript.ChangeKind.Added,
						content: c.value,
						resource: c.resource
					};
				});
				return this._consumer.acceptFileChanges(changes)
					.then(undefined, err => this._messageService.show(Severity.Warning, err));
			});
			return async.always(result, () => handle.dispose());
		}
	}

	private _resolve: winjs.TPromise<any>;

	private _doResolve(): winjs.TPromise<any> {

		var $perf: $ProjectPerf = {
			start: Date.now(),
			d: 0,
			projects: 0,
			files: 0
		};

		var p = this.projectDiscovery().then(_ => {
			// [read] all tsconfig.json files
			var promises: winjs.TPromise<typescript.IProjectChange>[] = [];
			for (var key in this._projectPromises) {
				promises.push(this._projectPromises[key]);
				delete this._projectPromises[key];
			}
			return winjs.TPromise.join(promises);

		}).then(projectChanges => {
			// [send] all project changes to worker
			$perf.projects = projectChanges.length;
			if (projectChanges.length) {
				return this._consumer.acceptProjectChanges(projectChanges).then(projectsIndex => {
					// TODO@Alex AllThreads returns falsy result
					this._projectsIndex = (<any>projectsIndex)[0];
				});
			}
		}).then(_ => {
			// [read] all project source files, persist change kind
			var toFetch: URI[] = [],
				changes: typescript.IFileChange[] = [],
				pendingFiles = objects.clone(this._pendingFiles);

			for (var key in this._pendingFiles) {
				var kind = this._pendingFiles[key].kind;
				var resource = this._pendingFiles[key].resource;
				if (this._pendingFiles[key].kind === typescript.ChangeKind.Removed) {
					changes.push({ kind, resource, content: undefined });
				} else {
					// changed or added
					toFetch.push(resource);
					$perf.files += 1;
				}
				delete this._pendingFiles[key];
			}

			if (toFetch.length) {
				return this._fileService.resolveContents(toFetch).then(contents => {
					contents.forEach(fileContent => {
						changes.push({
							resource: fileContent.resource,
							content: fileContent.value,
							kind: pendingFiles[fileContent.resource.toString()].kind
						});
						delete pendingFiles[fileContent.resource.toString()];
					});
					// if (toFetch.length !== contents.length) {
					// 	console.warn('files that are MISSING: ', Object.keys(pendingFiles));
					// }
					// [send] all project source files
					return this._consumer.acceptFileChanges(changes)
						.then(undefined, err => this._messageService.show(Severity.Warning, err));
				});

			} else if (changes.length) {
				// [send] all project source files
				return this._consumer.acceptFileChanges(changes)
					.then(undefined, err => this._messageService.show(Severity.Warning, err));
			}
		}).then(_ => {
			// perf numbers
			$perf.d = Date.now() - $perf.start;
			// console.log('[ts] resolve done', $perf);
		});

		return p;
	}

	private projectDiscovery() {
		if (!this._projectDiscovery) {

			this._projectDiscovery = this._searchResources(this._configuration.projects).then(result => {
				this._resolveProject(typescript.virtualProjectResource, typescript.ChangeKind.Added);
				for (let resource of result.resources) {
					this._resolveProject(resource, typescript.ChangeKind.Added);
				}
			});

			// TODO@Joh count how often this fails and stop trying
			this._projectDiscovery.done(undefined, err => {
				this._projectDiscovery = null;
				console.error(err);
			});
		}

		return this._projectDiscovery;
	}

	private _searchResources(globPattern: string, maxResults: number = 1500, root: URI = this._workspace, excludes?: string[]): winjs.TPromise<{ resources: URI[]; limitReached: boolean; }> {

		let includePattern:glob.IExpression = {};
		includePattern[globPattern] = true;

		let excludePattern: glob.IExpression = Object.create(null);
		excludePattern[ProjectResolver._defaultExcludePattern] = true;

		// add custom exclude patterns
		if(Array.isArray(excludes)) {
			for (let exclude of excludes) {
				exclude = exclude.replace(/^[\\\/]/, '').replace(/[\\\/]$/, '');
				excludePattern[`${exclude}/**`] = true;
			}
		}

		return this._searchService.search({
			folderResources: [root],
			type: QueryType.File,
			maxResults,
			includePattern,
			excludePattern,
		}).then(complete => {
			return {
				resources: complete.results.map(r => r.resource),
				limitReached: complete.limitHit
			};
		});
	}

	private _resolveProject(resource: URI, kind: typescript.ChangeKind): void {

		var dirname = paths.dirname(resource.fsPath);
		var p = this._doResolveProject(resource, kind);
		this._projectPromises[dirname] = this._projectPromises[dirname] && this._projectPromises[dirname].then(_ => p, _ => p) || p;

		p.done(undefined, err => {
			if (!errors.isPromiseCanceledError(err)) {
				console.error(resource.toString(), kind, err);
			}
		});
	}

	private _doResolveProject(resource: URI, kind: typescript.ChangeKind): winjs.TPromise<typescript.IProjectChange> {
		return resource.toString() === typescript.virtualProjectResource.toString()
			? this._doResolveVirtualProject(kind)
			: this._doResolveProjectFile(resource, kind);
	}

	private _doResolveProjectFile(resource: URI, kind: typescript.ChangeKind): winjs.TPromise<typescript.IProjectChange> {

		// remove markers
		this._markerService.remove('ts.projectResolver', [resource]);

		// removed project
		if (kind === typescript.ChangeKind.Removed) {
			delete this._projectFileEventListener[resource.toString()];
			return winjs.TPromise.as({ kind, resource, files: undefined, options: undefined });
		}

		// added or changed project
		let data: typescript.IProjectChange = {
			kind,
			resource,
			files: <URI[]>[],
			options: ts.getDefaultCompilerOptions()
		};

		let fileLimitReached = false;

		return this._fileService.resolveContent(resource).then(content => {

			let parsed = ts.parseConfigFileText(resource.fsPath, content.value),
				basePath = paths.dirname(resource.fsPath);

			if (parsed.error) {
				this._markerService.changeOne('ts.projectResolver', resource, [{
					message: parsed.error.messageText.toString(),
					code: parsed.error.code.toString(),
					severity: Severity.Error,
					startLineNumber: 1,
					startColumn: 1,
					endLineNumber: 1,
					endColumn: 1
				}]);
				return winjs.TPromise.wrapError(errors.canceled());
			}

			// compiler options
			data.options = ts.parseConfigFile(parsed.config, { readDirectory: () => [] }, basePath).options;

			// add/replace project event listener
			this._projectFileEventListener[resource.toString()] = new ProjectFileEventListener(
				basePath, parsed.config['files'], parsed.config['exclude']);

			// files
			if (Array.isArray(parsed.config['files'])) {
				var files = (<string[]> parsed.config['files'])
					.map(path => paths.join(basePath, path))
					.map(path => URI.file(path));

				data.files = files;
				if (data.files.length > this._configuration.maxFilesPerProject) {
					data.files.length = this._configuration.maxFilesPerProject;
					fileLimitReached = true;
				}

			} else {
				// glob
				// we also get into this when the files property isn't formulated
				// properly. This isn't über-correct but nice to the user
				return this._searchResources(this._configuration.files, this._configuration.maxFilesPerProject,
					URI.file(basePath), parsed.config['exclude']).then(result => {

					fileLimitReached = result.limitReached;
					data.files = result.resources;
				});
			}
		}).then(_ => {
			if (kind === typescript.ChangeKind.Added) {

				// add all files of this project to the fetch list
				data.files.forEach(resource => this._pendingFiles[resource.toString()] = { resource, kind });

				// send telemetry info about compiler options and number of files
				this._telemetryService.publicLog('js.project', {
					compilerOptions: data.options,
					fileCount: data.files.length
				});
			}

			if (fileLimitReached) {
				// send another telemetry event when there a too many files
				this._telemetryService.publicLog('js.project.fileLimitReached', { maxFilesPerProject: this._configuration.maxFilesPerProject });
			}

			return data;
		});
	}

	private _doResolveVirtualProject(kind: typescript.ChangeKind): winjs.TPromise<typescript.IProjectChange> {
		// when starting we optimistically configure the virtual
		// project with the first 50 d.ts files we find in the
		// workspace

		this._projectFileEventListener[typescript.virtualProjectResource.toString()] =
			new VirtualProjectFileEventListener(undefined, undefined, undefined);

		let excludePattern: glob.IExpression = Object.create(null);
		excludePattern[ProjectResolver._defaultExcludePatternForVirtualProject] = true;

		return this._searchService.search({
			folderResources: [this._workspace],
			type: QueryType.File,
			maxResults: 50,
			includePattern: { '**/*.d.ts': true },
			excludePattern
		}).then(result => {

			let files: URI[] = [];
			for (let match of result.results) {
				files.push(match.resource);
				this._pendingFiles[match.resource.toString()] = { resource: match.resource, kind };
			}

			return <typescript.IProjectChange> {
				files,
				resource: typescript.virtualProjectResource,
				kind: typescript.ChangeKind.Changed,
				options: undefined
			};
		});
	}

	private _onFileChangesEvent(e: Files.FileChangesEvent): void {
		this._fileChangeEvents.push(...e.changes);
		this._fileChangesHandler.schedule();
	}

	private _processFileChangesEvents() {

		let projectEvents: { [r: string]: number[] } = Object.create(null);
		let changes = this._fileChangeEvents.slice(0);
		this._fileChangeEvents.length = 0;
		let isAffectedByChanges = false;

		changes.forEach(change => {

			var kind: typescript.ChangeKind;

			if (glob2.match(this._configuration.projects, change.resource.fsPath)) {
				// update projects
				kind = ProjectResolver._asChangeKind(change.type);
				collections.lookupOrInsert(projectEvents, change.resource.toString(), []).push(kind);
				isAffectedByChanges = true;

			} else if (glob2.match(this._configuration.files, change.resource.fsPath)) {

				kind = ProjectResolver._asChangeKind(change.type);
				if (kind === typescript.ChangeKind.Changed && this._modelService.getModel(<any>change.resource)) {
					// we have already seen this change
					return;
				}

				collections.forEach(this._projectFileEventListener, entry => {

					if (!entry.value.handleChange(change.resource)) {
						// this listener is not interested in this change
						// so we can return early
						return;
					}

					this._pendingFiles[change.resource.toString()] = { kind, resource: change.resource };
					isAffectedByChanges = true;

					// in case this file as added or removed we need to tell
					// project it has changed
					if (kind === typescript.ChangeKind.Added || kind === typescript.ChangeKind.Removed) {
						collections.lookupOrInsert(projectEvents, entry.key, []).push(typescript.ChangeKind.Changed);
					}
				});
			}
		});

		// trigger project resolution for those that were collected earlier
		for(let project in projectEvents) {
			let value = projectEvents[project];
			let lastKind: typescript.ChangeKind;
			for(let kind of value) {
				if (kind !== lastKind) {
					lastKind = kind;
					this._resolveProject(URI.parse(project), kind);
				}
			}
		}

		if(isAffectedByChanges) {
			this.resolveProjects();
		}
	}

	private static _asChangeKind(fileChangeType: Files.FileChangeType): typescript.ChangeKind {
		switch (fileChangeType) {
			case Files.FileChangeType.UPDATED: return typescript.ChangeKind.Changed;
			case Files.FileChangeType.ADDED: return typescript.ChangeKind.Added;
			case Files.FileChangeType.DELETED: return typescript.ChangeKind.Removed;
		}
		throw new Error('unknown change type');
	}
}

namespace glob2 {

	const prefix1 = '**/*.';

	export function match(pattern: string, path: string): boolean {
		if (pattern[0] === '{' && pattern[pattern.length - 1] === '}') {
			var parts = pattern.substr(1, pattern.length - 2).split(',');
			return parts.some(part => matchOne(part, path));
		} else {
			return matchOne(pattern, path);
		}
	}

	function matchOne(pattern: string, path: string): boolean {

		let offset = -1;
		if (pattern.indexOf(prefix1) === 0) {
			offset = prefix1.length;
		}
		if (offset === -1) {
			return glob.match(pattern, path);
		}
		let suffix = pattern.substring(offset);
		if (suffix.match(/[.\\\/*]/)) {
			return glob.match(pattern, path);
		}

		// endWith check
		offset = path.lastIndexOf(suffix);
		if (offset === -1) {
			return false;
		} else {
			return offset + suffix.length === path.length;
		}
	}
}

export = ProjectResolver;