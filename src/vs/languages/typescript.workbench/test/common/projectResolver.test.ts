/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import assert = require('assert');
import URI from 'vs/base/common/uri';
import glob = require('vs/base/common/glob');
import winjs = require('vs/base/common/winjs.base');
import typescript = require('vs/languages/typescript/common/typescript');
import instantiation = require('vs/platform/instantiation/common/instantiationService');
import project = require('vs/languages/typescript/common/project/projectService');
import ts = require('vs/languages/typescript/common/lib/typescriptServices');
import ProjectResolver = require('vs/languages/typescript.workbench/common/projectResolver');
import {NULL_THREAD_SERVICE} from 'vs/platform/test/common/nullThreadService';
import markerService = require('vs/platform/markers/common/markerService');
import eventEmitter = require('vs/base/common/eventEmitter');
import EditorCommon = require('vs/editor/common/editorCommon');
import Files = require('vs/platform/files/common/files');
import {IModelService} from 'vs/editor/common/services/modelService';
import {IInstantiationService} from 'vs/platform/instantiation/common/instantiation';
import {IMessageService} from 'vs/platform/message/common/message';
import * as Search from 'vs/platform/search/common/search';
import {ITelemetryService} from 'vs/platform/telemetry/common/telemetry';
import {IWorkspaceContextService, IWorkspace} from 'vs/platform/workspace/common/workspace';

function createContextService(resource: URI = URI.file('/foo/bar')): IWorkspaceContextService {

	function getWorkspace(): IWorkspace {
		return {
			resource,
			id: undefined,
			mtime: undefined,
			name: undefined,
			uid: undefined
		}
	};

	return {
		serviceId : IWorkspaceContextService,
		getWorkspace,
		getConfiguration: undefined,
		getOptions: undefined,
		toResource: undefined,
		toWorkspaceRelativePath: undefined,
		isInsideWorkspace: undefined
	}
}

function createModelService(): IModelService {

	function getModel(r: URI): EditorCommon.IModel {
		return null;
	}

	return {
		serviceId : IModelService,
		getModel,
		createModel: undefined,
		getModels: undefined,
		onModelAdded: undefined,
		onModelRemoved: undefined,
		onModelModeChanged: undefined,
		destroyModel: undefined
	}
}

function createMessageService(): IMessageService {
	return {
		serviceId : IMessageService,
		setStatusMessage: () => { return { dispose: () => { } } },
		confirm: undefined,
		hideAll: undefined,
		show: undefined
	};
}

function createSearchService(index:{ [n: string]: string } = Object.create(null)): Search.ISearchService {

	function search(query: Search.ISearchQuery): winjs.PPromise<Search.ISearchComplete, Search.ISearchProgressItem> {

		var results: Search.IFileMatch[] = [];

		for (var key in index) {
			var resource = URI.file(key);
			if (glob.match(query.includePattern, resource.path)) {
				results.push({
					resource
				});
			}
		}

		return winjs.PPromise.as({
			results
		});
	}

	return {
		serviceId : Search.ISearchService,
		search
	};
}

function createFileService(index: { [n: string]: string } = Object.create(null)): Files.IFileService {

	function resolveContent(resource: URI): winjs.TPromise<Files.IContent> {

		if (!index[resource.path]) {
			return winjs.TPromise.as(null);
		}

		var result: Files.IContent = {
			resource,
			value: index[resource.path],
			charset: undefined,
			etag: undefined,
			mime: undefined,
			mtime: undefined,
			name: undefined
		}
		return winjs.TPromise.as(result);
	}

	function resolveContents(resources: URI[]): any {
		var result: Files.IContent[] = [];
		resources.forEach(resource => {
			if (index[resource.path]) {
				result.push({
					resource,
					value: index[resource.path],
					charset: undefined,
					etag: undefined,
					mime: undefined,
					mtime: undefined,
					name: undefined
				});
			}
		});
		return winjs.TPromise.as(result);
	}

	return {
		serviceId : Files.IFileService,
		resolveContent,
		resolveContents,
		copyFile: undefined,
		createFile: undefined,
		createFolder: undefined,
		del: undefined,
		dispose: undefined,
		moveFile: undefined,
		rename: undefined,
		resolveFile: undefined,
		updateContent: undefined,
		updateOptions: undefined,
		importFile: undefined,
		watchFileChanges: undefined,
		unwatchFileChanges: undefined
	}
}

function createTelemetryService(): ITelemetryService {

	function publicLog() {

	}

	return {
		serviceId : ITelemetryService,
		addTelemetryAppender: undefined,
		dispose: undefined,
		getAppenders: undefined,
		getAppendersCount: undefined,
		publicLog,
		removeTelemetryAppender: undefined,
		start: undefined,
		getSessionId: undefined,
		getInstanceId: undefined,
		getMachineId: undefined,
		getTelemetryInfo: undefined,
		setInstantiationService: undefined
	}
}

var instantiationService: IInstantiationService;

function setup() {
	instantiationService = instantiation.createInstantiationService({
		eventService: new eventEmitter.EventEmitter(),
		markerService: new markerService.MainProcessMarkerService(NULL_THREAD_SERVICE),
		fileService: createFileService(),
		searchService: createSearchService(),
		messageService: createMessageService(),
		modelService: createModelService(),
		contextService: createContextService(),
		telemetryService: createTelemetryService()
	});
}

suite('TS - Project Resolver', () => {
	setup();


	test('no workspace, no resolve', function () {

		var resolver = instantiationService
			.createChild({ contextService: createContextService(null) })
			.createInstance(ProjectResolver, null, null);

		var promise = resolver.resolveProjects();
		assert.ok(promise === undefined);
	});

	test('project -> expand files', function (done) {

		var fileChangesCount = 0,
			projectChangesCount = 0;

		var consumer: typescript.IProjectConsumer = {
			acceptFileChanges: (changes):any => {
				fileChangesCount += changes.length;
				return winjs.TPromise.as([]);
			},
			acceptProjectChanges: (changes):any => {
				projectChangesCount += changes.length;
				return winjs.TPromise.as([]);
			}
		};

		var files: { [n: string]: string } = Object.create(null);
		files['/jsconfig.json'] = '{}';
		files['/a.js'] = 'a';
		files['/b.js'] = 'b';
		files['/c.d.ts'] = 'c';
		files['/d.ts'] = 'd';

		var resolver = instantiationService.createChild({
			searchService: createSearchService(files),
			fileService: createFileService(files),
		}).createInstance(
			ProjectResolver, { files: '{**/*.js,**/*.d.ts}', projects: '**/jsconfig.json' }, consumer);

		resolver.resolveProjects().then(_ => {
			assert.equal(fileChangesCount, 3);
			assert.equal(projectChangesCount, 2);
			done();
		}, err => {
			assert.ok(false, JSON.stringify(err, null, 4));
			done();
		});
	});
});
