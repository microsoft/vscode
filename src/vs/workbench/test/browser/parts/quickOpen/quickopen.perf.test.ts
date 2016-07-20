/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import 'vs/workbench/parts/search/browser/search.contribution'; // load contributions
import * as assert from 'assert';
import {BaseWorkspaceContextService} from 'vs/platform/workspace/common/baseWorkspaceContextService';
import {createSyncDescriptor} from 'vs/platform/instantiation/common/descriptors';
import {ensureStaticPlatformServices, IEditorOverrideServices} from 'vs/editor/browser/standalone/standaloneServices';
import {IEditorGroupService} from 'vs/workbench/services/group/common/groupService';
import {ISearchService} from 'vs/platform/search/common/search';
import {ITelemetryService, ITelemetryInfo} from 'vs/platform/telemetry/common/telemetry';
import {IUntitledEditorService, UntitledEditorService} from 'vs/workbench/services/untitled/common/untitledEditorService';
import {IWorkbenchEditorService} from 'vs/workbench/services/editor/common/editorService';
import * as minimist from 'minimist';
import * as path from 'path';
import {QuickOpenHandler, IQuickOpenRegistry, Extensions} from 'vs/workbench/browser/quickopen';
import {Registry} from 'vs/platform/platform';
import {SearchService} from 'vs/workbench/services/search/node/searchService';
import {ServiceCollection} from 'vs/platform/instantiation/common/serviceCollection';
import {TestConfiguration, TestEditorService, TestEditorGroupService} from 'vs/test/utils/servicesTestUtils';
import * as Timer from 'vs/base/common/timer';
import {TPromise} from 'vs/base/common/winjs.base';
import URI from 'vs/base/common/uri';

declare var __dirname: string;

// Checkout sources to run against:
// git clone --separate-git-dir=testGit --no-checkout --single-branch https://chromium.googlesource.com/chromium/src testWorkspace
// cd testWorkspace; git checkout 39a7f93d67f7
// Run from repository root folder with (test.bat on Windows): ./scripts/test.sh --grep QuickOpen.performance --timeout 120000 --testWorkspace <path>
suite('QuickOpen performance', () => {

	test('Measure', () => {
		const n = 3;
		const testWorkspaceArg = minimist(process.argv)['testWorkspace'];
		const testWorkspacePath = testWorkspaceArg ? path.join(process.cwd(), testWorkspaceArg) : __dirname;

		const telemetryService = new TestTelemetryService();
		const overrides: IEditorOverrideServices = {
			contextService: new BaseWorkspaceContextService({
				resource: URI.file(testWorkspacePath),
				id: null,
				name: null,
				uid: null,
				mtime: null
			}, TestConfiguration),

			telemetryService: telemetryService
		};

		const services = ensureStaticPlatformServices(overrides);
		const instantiationService = services.instantiationService.createChild(new ServiceCollection(
			[IWorkbenchEditorService, new TestEditorService()],
			[IEditorGroupService, new TestEditorGroupService()],
			[IUntitledEditorService, createSyncDescriptor(UntitledEditorService)],
			[ISearchService, createSyncDescriptor(SearchService)]
		));

		const registry = Registry.as<IQuickOpenRegistry>(Extensions.Quickopen);
		const descriptors = registry.getDefaultQuickOpenHandlers();
		assert.strictEqual(descriptors.length, 1);

		let i = n;
		return (function measure() {
			if (!i--) {
				return;
			}
			return instantiationService.createInstance(descriptors[0])
				.then((handler: QuickOpenHandler) => {
					return handler.getResults('a').then(result => {
						const events = telemetryService.events;
						assert.strictEqual(events.length, 1);
						assert.strictEqual(events[0].name, 'openAnything');
						assert.ok(!events[0].data.fromCache);
						if (testWorkspaceArg) {
							console.log(JSON.stringify(events[0].data) + ',');
						}
						events.length = 0;
						return measure();
					});
				});
		})();
	});
});

class TestTelemetryService implements ITelemetryService {

	public _serviceBrand: any;
	public isOptedIn = true;

	public events: Timer.ITimerEvent[] = [];

	public timedPublicLog(name: string, data?: any): Timer.ITimerEvent {
		Timer.ENABLE_TIMER = true;
		const event = Timer.start('TestTelemetry', name);
		Timer.ENABLE_TIMER = false;
		if (data) {
			event.data = data;
		}
		this.events.push(event);
		return event;
	}

	public publicLog(eventName: string, data?: any): TPromise<void> {
		return TPromise.as<void>(null);
	}

	public getTelemetryInfo(): TPromise<ITelemetryInfo> {
		return TPromise.as({
			instanceId: 'someValue.instanceId',
			sessionId: 'someValue.sessionId',
			machineId: 'someValue.machineId'
		});
	}
};
