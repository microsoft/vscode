/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import 'vs/workbench/parts/search/browser/search.contribution'; // load contributions
import * as assert from 'assert';
import * as fs from 'fs';
import { WorkspaceContextService, IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { createSyncDescriptor } from 'vs/platform/instantiation/common/descriptors';
import { IEditorGroupService } from 'vs/workbench/services/group/common/groupService';
import { ISearchService, IQueryOptions } from 'vs/platform/search/common/search';
import { ITelemetryService, ITelemetryInfo, ITelemetryExperiments } from 'vs/platform/telemetry/common/telemetry';
import { defaultExperiments } from 'vs/platform/telemetry/common/telemetryUtils';
import { IUntitledEditorService, UntitledEditorService } from 'vs/workbench/services/untitled/common/untitledEditorService';
import { IWorkbenchEditorService } from 'vs/workbench/services/editor/common/editorService';
import * as minimist from 'minimist';
import * as path from 'path';
import { SearchService } from 'vs/workbench/services/search/node/searchService';
import { ServiceCollection } from 'vs/platform/instantiation/common/serviceCollection';
import { TestEnvironmentService, TestEditorService, TestEditorGroupService } from 'vs/workbench/test/workbenchTestServices';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { TPromise } from 'vs/base/common/winjs.base';
import URI from 'vs/base/common/uri';
import { InstantiationService } from 'vs/platform/instantiation/common/instantiationService';
import { SimpleConfigurationService } from 'vs/editor/browser/standalone/simpleServices';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { ModelServiceImpl } from 'vs/editor/common/services/modelServiceImpl';
import { IModelService } from 'vs/editor/common/services/modelService';

import { SearchModel } from 'vs/workbench/parts/search/common/searchModel';
import { QueryBuilder } from 'vs/workbench/parts/search/common/searchQuery';

import Event, * as event from 'vs/base/common/event';

declare var __dirname: string;

// Checkout sources to run against:
// git clone --separate-git-dir=testGit --no-checkout --single-branch https://chromium.googlesource.com/chromium/src testWorkspace
// cd testWorkspace; git checkout 39a7f93d67f7
// Run from repository root folder with (test.bat on Windows): ./scripts/test-int-mocha.sh --grep TextSearch.performance --timeout 500000 --testWorkspace <path>
suite('TextSearch performance (integration)', () => {

	test('Measure', () => {
		if (process.env['VSCODE_PID']) {
			return undefined; // TODO@Rob find out why test fails when run from within VS Code
		}

		const n = 3;
		const argv = minimist(process.argv);
		const testWorkspaceArg = argv['testWorkspace'];
		const testWorkspacePath = testWorkspaceArg ? path.resolve(testWorkspaceArg) : __dirname;
		if (!fs.existsSync(testWorkspacePath)) {
			throw new Error(`--testWorkspace doesn't exist`);
		}

		const telemetryService = new TestTelemetryService();
		const configurationService = new SimpleConfigurationService();
		const instantiationService = new InstantiationService(new ServiceCollection(
			[ITelemetryService, telemetryService],
			[IConfigurationService, new SimpleConfigurationService()],
			[IModelService, new ModelServiceImpl(null, configurationService)],
			[IWorkspaceContextService, new WorkspaceContextService({ resource: URI.file(testWorkspacePath) })],
			[IWorkbenchEditorService, new TestEditorService()],
			[IEditorGroupService, new TestEditorGroupService()],
			[IEnvironmentService, TestEnvironmentService],
			[IUntitledEditorService, createSyncDescriptor(UntitledEditorService)],
			[ISearchService, createSyncDescriptor(SearchService)]
		));

		let queryOptions: IQueryOptions = {
			folderResources: [URI.file(testWorkspacePath)],
			maxResults: 2048
		};

		const searchModel: SearchModel = instantiationService.createInstance(SearchModel);
		function runSearch(): TPromise<any> {
			const queryBuilder: QueryBuilder = instantiationService.createInstance(QueryBuilder);
			const query = queryBuilder.text({ pattern: 'static_library(' }, queryOptions);

			// Wait for the 'searchResultsFinished' event, which is fired after the search() promise is resolved
			const onSearchResultsFinished = event.filterEvent(telemetryService.eventLogged, e => e.name === 'searchResultsFinished');
			event.once(onSearchResultsFinished)(onComplete);

			function onComplete(): void {
				try {
					const allEvents = telemetryService.events.map(e => JSON.stringify(e)).join('\n');
					assert.equal(telemetryService.events.length, 3, 'Expected 3 telemetry events, got:\n' + allEvents);

					const [firstRenderEvent, resultsShownEvent, resultsFinishedEvent] = telemetryService.events;
					assert.equal(firstRenderEvent.name, 'searchResultsFirstRender');
					assert.equal(resultsShownEvent.name, 'searchResultsShown');
					assert.equal(resultsFinishedEvent.name, 'searchResultsFinished');

					telemetryService.events = [];

					resolve(resultsFinishedEvent);
				} catch (e) {
					// Fail the runSearch() promise
					error(e);
				}
			}

			let resolve;
			let error;
			return new TPromise((_resolve, _error) => {
				resolve = _resolve;
				error = _error;

				// Don't wait on this promise, we're waiting on the event fired above
				searchModel.search(query).then(
					null,
					_error);
			});
		}

		const finishedEvents = [];
		return runSearch() // Warm-up first
			.then(() => {
				if (testWorkspaceArg) { // Don't measure by default
					let i = n;
					return (function iterate() {
						if (!i--) {
							return;
						}

						return runSearch()
							.then((resultsFinishedEvent: any) => {
								console.log(`Iteration ${n - i}: ${resultsFinishedEvent.data.duration / 1000}s`);
								finishedEvents.push(resultsFinishedEvent);
								return iterate();
							});
					})().then(() => {
						const totalTime = finishedEvents.reduce((sum, e) => sum + e.data.duration, 0);
						console.log(`Avg duration: ${totalTime / n / 1000}s`);
					});
				}
			});
	});
});

class TestTelemetryService implements ITelemetryService {
	public _serviceBrand: any;
	public isOptedIn = true;

	public events: any[] = [];

	private emitter = new event.Emitter<any>();

	public get eventLogged(): Event<any> {
		return this.emitter.event;
	}

	public publicLog(eventName: string, data?: any): TPromise<void> {
		const event = { name: eventName, data: data };
		this.events.push(event);
		this.emitter.fire(event);
		return TPromise.as<void>(null);
	}

	public getTelemetryInfo(): TPromise<ITelemetryInfo> {
		return TPromise.as({
			instanceId: 'someValue.instanceId',
			sessionId: 'someValue.sessionId',
			machineId: 'someValue.machineId'
		});
	}

	public getExperiments(): ITelemetryExperiments {
		return defaultExperiments;
	}
};
