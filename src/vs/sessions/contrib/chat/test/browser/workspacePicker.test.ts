/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';

import { Event } from '../../../../../base/common/event.js';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { InMemoryStorageService, IStorageService } from '../../../../../platform/storage/common/storage.js';
import { IActionWidgetService } from '../../../../../platform/actionWidget/browser/actionWidget.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { IFileDialogService } from '../../../../../platform/dialogs/common/dialogs.js';
import { IUriIdentityService } from '../../../../../platform/uriIdentity/common/uriIdentity.js';
import { ExtUri } from '../../../../../base/common/resources.js';
import { IRemoteAgentHostService, IRemoteAgentHostConnectionInfo } from '../../../../../platform/agentHost/common/remoteAgentHostService.js';
import { IQuickInputService } from '../../../../../platform/quickinput/common/quickInput.js';
import { WorkspacePicker } from '../../browser/workspacePicker.js';
import { SessionWorkspace, GITHUB_REMOTE_FILE_SCHEME } from '../../../sessions/common/sessionWorkspace.js';
import { AGENT_HOST_FS_SCHEME, agentHostUri } from '../../../remoteAgentHost/browser/agentHostFileSystemProvider.js';
import { agentHostAuthority } from '../../../remoteAgentHost/browser/remoteAgentHost.contribution.js';

suite('WorkspacePicker', () => {

	const ds = ensureNoDisposablesAreLeakedInTestSuite();
	let instantiationService: TestInstantiationService;
	let connections: IRemoteAgentHostConnectionInfo[];

	setup(() => {
		instantiationService = ds.add(new TestInstantiationService());
		connections = [];

		instantiationService.stub(IStorageService, ds.add(new InMemoryStorageService()));
		instantiationService.stub(IActionWidgetService, new class extends mock<IActionWidgetService>() {
			override get isVisible() { return false; }
		});
		instantiationService.stub(IFileDialogService, new class extends mock<IFileDialogService>() { });
		instantiationService.stub(ICommandService, new class extends mock<ICommandService>() { });
		instantiationService.stub(IUriIdentityService, new class extends mock<IUriIdentityService>() {
			override readonly extUri = new ExtUri(uri => false);
		});
		instantiationService.stub(IRemoteAgentHostService, new class extends mock<IRemoteAgentHostService>() {
			override readonly onDidChangeConnections = Event.None;
			override get connections() { return connections; }
			override getConnection() { return undefined; }
		});
		instantiationService.stub(IQuickInputService, new class extends mock<IQuickInputService>() { });
	});

	function createPicker(): WorkspacePicker {
		return ds.add(instantiationService.createInstance(WorkspacePicker));
	}

	test('setSelectedProject with local folder', () => {
		const picker = createPicker();
		const folder = new SessionWorkspace(URI.file('/home/user/project'));

		picker.setSelectedProject(folder);

		assert.ok(picker.selectedProject);
		assert.strictEqual(picker.selectedProject.isFolder, true);
		assert.strictEqual(picker.selectedProject.uri.path, '/home/user/project');
	});

	test('setSelectedProject with remote agent host URI', () => {
		const picker = createPicker();
		const authority = agentHostAuthority('http://myremote:3000');
		const remoteUri = agentHostUri(authority, '/home/user/project');
		const project = new SessionWorkspace(remoteUri);

		picker.setSelectedProject(project);

		assert.ok(picker.selectedProject);
		assert.strictEqual(picker.selectedProject.isRemoteAgentHost, true);
		assert.strictEqual(picker.selectedProject.uri.scheme, AGENT_HOST_FS_SCHEME);
		assert.strictEqual(picker.selectedProject.uri.path, '/home/user/project');
	});

	test('setSelectedProject with GitHub repo URI', () => {
		const picker = createPicker();
		const repoUri = URI.from({ scheme: GITHUB_REMOTE_FILE_SCHEME, authority: 'github', path: '/owner/repo/HEAD' });
		const project = new SessionWorkspace(repoUri);

		picker.setSelectedProject(project);

		assert.ok(picker.selectedProject);
		assert.strictEqual(picker.selectedProject.isRepo, true);
	});

	test('onDidSelectProject fires when project is selected', () => {
		const picker = createPicker();
		const authority = agentHostAuthority('http://myremote:3000');
		const remoteUri = agentHostUri(authority, '/remote/path');
		const project = new SessionWorkspace(remoteUri);

		let fired: SessionWorkspace | undefined;
		ds.add(picker.onDidSelectProject(p => { fired = p; }));

		picker.setSelectedProject(project, true);

		assert.ok(fired);
		assert.strictEqual(fired.isRemoteAgentHost, true);
		assert.strictEqual(fired.uri.path, '/remote/path');
	});

	test('onDidSelectProject does not fire when fireEvent is false', () => {
		const picker = createPicker();
		const project = new SessionWorkspace(URI.file('/some/folder'));

		let fired = false;
		ds.add(picker.onDidSelectProject(() => { fired = true; }));

		picker.setSelectedProject(project, false);

		assert.strictEqual(fired, false);
		assert.ok(picker.selectedProject);
	});

	test('clearSelection clears the selected project', () => {
		const picker = createPicker();
		picker.setSelectedProject(new SessionWorkspace(URI.file('/folder')), false);

		assert.ok(picker.selectedProject);

		picker.clearSelection();

		assert.strictEqual(picker.selectedProject, undefined);
	});

	test('removeFromRecents clears selection if it matches', () => {
		const picker = createPicker();
		const uri = URI.file('/folder');
		picker.setSelectedProject(new SessionWorkspace(uri), false);

		picker.removeFromRecents(uri);

		assert.strictEqual(picker.selectedProject, undefined);
	});

	test('removeFromRecents preserves selection if it does not match', () => {
		const picker = createPicker();
		const selectedUri = URI.file('/selected');
		picker.setSelectedProject(new SessionWorkspace(selectedUri), false);

		picker.removeFromRecents(URI.file('/other'));

		assert.ok(picker.selectedProject);
		assert.strictEqual(picker.selectedProject.uri.path, '/selected');
	});

	test('remote project persists and restores from storage', () => {
		const storageService = ds.add(new InMemoryStorageService());
		instantiationService.stub(IStorageService, storageService);

		// Create picker and select a remote project
		const picker1 = ds.add(instantiationService.createInstance(WorkspacePicker));
		const authority = agentHostAuthority('http://myremote:3000');
		const remoteUri = agentHostUri(authority, '/home/user/project');
		picker1.setSelectedProject(new SessionWorkspace(remoteUri), false);

		// Create a second picker -- it should restore from storage
		const picker2 = ds.add(instantiationService.createInstance(WorkspacePicker));
		assert.ok(picker2.selectedProject);
		assert.strictEqual(picker2.selectedProject.isRemoteAgentHost, true);
		assert.strictEqual(picker2.selectedProject.uri.path, '/home/user/project');
		assert.strictEqual(picker2.selectedProject.uri.authority, authority);
	});

	test('trigger label uses cached remoteName when connection is unavailable', () => {
		const storageService = ds.add(new InMemoryStorageService());
		instantiationService.stub(IStorageService, storageService);

		const address = 'http://myremote:3000';
		const authority = agentHostAuthority(address);

		// Simulate a live connection so remoteName gets cached
		connections = [{ address, name: 'macbook', clientId: 'test-client' }];
		const picker1 = ds.add(instantiationService.createInstance(WorkspacePicker));
		const remoteUri = agentHostUri(authority, '/home/user/project');
		picker1.setSelectedProject(new SessionWorkspace(remoteUri), false);

		// Simulate startup with no connections available
		connections = [];
		const picker2 = ds.add(instantiationService.createInstance(WorkspacePicker));

		// Render and check the trigger label uses cached "macbook", not encoded authority
		const container = document.createElement('div');
		picker2.render(container);
		const label = container.querySelector('.sessions-chat-dropdown-label');
		assert.ok(label);
		assert.strictEqual(label.textContent, 'project [macbook]');
	});
});
