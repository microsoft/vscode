/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { toDisposable } from '../../../../../base/common/lifecycle.js';
import { extUri } from '../../../../../base/common/resources.js';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import { IOpenerService } from '../../../../../platform/opener/common/opener.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import { NullTelemetryService } from '../../../../../platform/telemetry/common/telemetryUtils.js';
import { IUriIdentityService } from '../../../../../platform/uriIdentity/common/uriIdentity.js';
import { IWorkspace, IWorkspaceContextService, IWorkspaceFoldersChangeEvent, WorkbenchState } from '../../../../../platform/workspace/common/workspace.js';
import { testWorkspace } from '../../../../../platform/workspace/test/common/testWorkspace.js';
import { IHostService } from '../../../../services/host/browser/host.js';
import { WorkspaceWatcher } from '../../browser/workspaceWatcher.js';

suite('WorkspaceWatcher', () => {

	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('stops watching a folder that was added to a single-folder workspace and removed again', () => {
		const onDidChangeWorkspaceFolders = store.add(new Emitter<IWorkspaceFoldersChangeEvent>());
		const onDidChangeWorkbenchState = store.add(new Emitter<WorkbenchState>());
		let workspace: IWorkspace = testWorkspace(URI.file('/a'));

		const watched: string[] = [];
		const instantiationService = store.add(new TestInstantiationService());
		instantiationService.stub(IWorkspaceContextService, {
			onDidChangeWorkspaceFolders: onDidChangeWorkspaceFolders.event,
			onDidChangeWorkbenchState: onDidChangeWorkbenchState.event,
			getWorkspace: () => workspace
		});
		instantiationService.stub(IFileService, {
			onDidWatchError: Event.None,
			watch: (resource: URI) => {
				watched.push(resource.path);
				return toDisposable(() => watched.splice(watched.indexOf(resource.path), 1));
			}
		});
		instantiationService.stub(IConfigurationService, new TestConfigurationService());
		instantiationService.stub(IUriIdentityService, { extUri });
		instantiationService.stub(INotificationService, {});
		instantiationService.stub(IOpenerService, {});
		instantiationService.stub(IHostService, {});
		instantiationService.stub(ITelemetryService, NullTelemetryService);

		store.add(instantiationService.createInstance(WorkspaceWatcher));

		// Adding a folder to a single-folder window changes the workbench
		// state before the workspace folders change event is fired
		workspace = testWorkspace(URI.file('/a'), URI.file('/b'));
		const added = workspace.folders[1];
		onDidChangeWorkbenchState.fire(WorkbenchState.WORKSPACE);
		onDidChangeWorkspaceFolders.fire({ added: [added], removed: [], changed: [] });
		const watchedAfterAdd = [...watched];

		workspace = testWorkspace(URI.file('/a'));
		onDidChangeWorkspaceFolders.fire({ added: [], removed: [added], changed: [] });

		assert.deepStrictEqual({ watchedAfterAdd, watchedAfterRemove: watched }, {
			watchedAfterAdd: ['/a', '/b'],
			watchedAfterRemove: ['/a']
		});
	});
});
