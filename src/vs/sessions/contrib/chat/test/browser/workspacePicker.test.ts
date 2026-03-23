/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';

import { Event } from '../../../../../base/common/event.js';
import { URI, UriComponents } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { InMemoryStorageService, IStorageService } from '../../../../../platform/storage/common/storage.js';
import { IActionWidgetService } from '../../../../../platform/actionWidget/browser/actionWidget.js';
import { ActionListItemKind, IActionListDelegate, IActionListItem } from '../../../../../platform/actionWidget/browser/actionList.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { IFileDialogService, IOpenDialogOptions } from '../../../../../platform/dialogs/common/dialogs.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import { IUriIdentityService } from '../../../../../platform/uriIdentity/common/uriIdentity.js';
import { ExtUri } from '../../../../../base/common/resources.js';
import { IRemoteAgentHostEntry, IRemoteAgentHostService, IRemoteAgentHostConnectionInfo } from '../../../../../platform/agentHost/common/remoteAgentHostService.js';
import { IQuickInputService, IQuickPickItem } from '../../../../../platform/quickinput/common/quickInput.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { WorkspacePicker } from '../../browser/workspacePicker.js';
import { SessionWorkspace, GITHUB_REMOTE_FILE_SCHEME } from '../../../sessions/common/sessionWorkspace.js';
import { AGENT_HOST_SCHEME, agentHostAuthority } from '../../../../../platform/agentHost/common/agentHostUri.js';
import { agentHostUri } from '../../../../../platform/agentHost/common/agentHostFileSystemProvider.js';

suite('WorkspacePicker', () => {

	const ds = ensureNoDisposablesAreLeakedInTestSuite();
	let instantiationService: TestInstantiationService;
	let connections: IRemoteAgentHostConnectionInfo[];
	let configuredEntries: IRemoteAgentHostEntry[];
	let shownItems: IActionListItem<{ readonly uri: UriComponents }>[];
	let shownDelegate: IActionListDelegate<{ readonly uri: UriComponents }> | undefined;
	let pickedItem: IQuickPickItem | undefined;
	let inputValues: Array<string | undefined>;
	let openDialogResult: URI[] | undefined;
	let openDialogOptions: { title?: string; defaultUri?: URI } | undefined;
	let addedEntries: IRemoteAgentHostEntry[];
	let addedConnection: IRemoteAgentHostConnectionInfo | undefined;

	setup(() => {
		instantiationService = ds.add(new TestInstantiationService());
		connections = [];
		configuredEntries = [];
		shownItems = [];
		shownDelegate = undefined;
		pickedItem = undefined;
		inputValues = [];
		openDialogResult = undefined;
		openDialogOptions = undefined;
		addedEntries = [];
		addedConnection = undefined;

		instantiationService.stub(IStorageService, ds.add(new InMemoryStorageService()));
		instantiationService.stub(IActionWidgetService, new class extends mock<IActionWidgetService>() {
			override get isVisible() { return false; }
			override hide(): void { }
			override show<T>(
				_id: string,
				_fromRight: boolean,
				items: IActionListItem<T>[],
				delegate: IActionListDelegate<T>,
			): void {
				shownItems = items as IActionListItem<{ readonly uri: UriComponents }>[];
				shownDelegate = delegate as IActionListDelegate<{ readonly uri: UriComponents }>;
			}
		});
		instantiationService.stub(IFileDialogService, new class extends mock<IFileDialogService>() {
			override async showOpenDialog(options: IOpenDialogOptions): Promise<URI[] | undefined> {
				openDialogOptions = options;
				return openDialogResult;
			}
		});
		instantiationService.stub(ICommandService, new class extends mock<ICommandService>() { });
		instantiationService.stub(INotificationService, new class extends mock<INotificationService>() { });
		instantiationService.stub(IUriIdentityService, new class extends mock<IUriIdentityService>() {
			override readonly extUri = new ExtUri(uri => false);
		});
		instantiationService.stub(IRemoteAgentHostService, new class extends mock<IRemoteAgentHostService>() {
			override readonly onDidChangeConnections = Event.None;
			override get connections() { return connections; }
			override get configuredEntries() { return configuredEntries; }
			override getConnection() { return undefined; }
			override async addRemoteAgentHost(entry: IRemoteAgentHostEntry): Promise<IRemoteAgentHostConnectionInfo> {
				addedEntries.push(entry);
				assert.ok(addedConnection);
				return addedConnection;
			}
		});
		instantiationService.stub(IConfigurationService, { getValue: () => true });
		instantiationService.stub(IQuickInputService, new class extends mock<IQuickInputService>() {
			override async pick<T extends IQuickPickItem>(): Promise<T | undefined> {
				return pickedItem as T | undefined;
			}

			override async input(): Promise<string | undefined> {
				return inputValues.shift();
			}
		});
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
		assert.strictEqual(picker.selectedProject.uri.scheme, AGENT_HOST_SCHEME);
		assert.strictEqual(picker.selectedProject.uri.path, '/file/-/home/user/project');
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
		assert.strictEqual(fired.uri.path, '/file/-/remote/path');
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
		assert.strictEqual(picker2.selectedProject.uri.path, '/file/-/home/user/project');
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

	test('showPicker includes Browse Remotes even without active connections', () => {
		const picker = createPicker();
		const container = document.createElement('div');
		picker.render(container);

		picker.showPicker();

		assert.ok(shownItems.some(item => item.kind === ActionListItemKind.Action && item.label === 'Browse Remotes...'));
	});

	test('showPicker hides Browse Remotes when setting is disabled', () => {
		instantiationService.stub(IConfigurationService, { getValue: () => false });
		const picker = ds.add(instantiationService.createInstance(WorkspacePicker));
		const container = document.createElement('div');
		picker.render(container);

		picker.showPicker();

		assert.ok(!shownItems.some(item => item.kind === ActionListItemKind.Action && item.label === 'Browse Remotes...'));
	});

	test('Browse Remotes shows configured entries and selecting one ensures connection', async () => {
		configuredEntries = [{ address: 'ws://myhost:9090', name: 'My Host' }];
		pickedItem = {
			remoteType: 'existing',
			label: 'My Host',
			description: 'ws://myhost:9090',
			address: 'ws://myhost:9090',
		} as IQuickPickItem;
		addedConnection = {
			address: 'ws://myhost:9090',
			name: 'My Host',
			clientId: 'myhost-client',
			defaultDirectory: '/home/user',
		};
		openDialogResult = [agentHostUri(agentHostAuthority('ws://myhost:9090'), '/home/user/project')];

		const picker = createPicker();
		const container = document.createElement('div');
		picker.render(container);
		picker.showPicker();

		const browseRemotesItem = shownItems.find(item => item.kind === ActionListItemKind.Action && item.label === 'Browse Remotes...');
		assert.ok(browseRemotesItem);
		assert.ok(shownDelegate);

		shownDelegate.onSelect(browseRemotesItem.item!);
		await Event.toPromise(picker.onDidSelectProject);

		assert.deepStrictEqual(addedEntries, [{
			address: 'ws://myhost:9090',
			name: 'My Host',
		}]);
		assert.ok(openDialogOptions);
		assert.strictEqual(openDialogOptions.title, 'Select Folder on My Host');
		assert.strictEqual(openDialogOptions.defaultUri?.toString(), agentHostUri(agentHostAuthority('ws://myhost:9090'), '/home/user').toString());
		assert.ok(picker.selectedProject);
		assert.strictEqual(picker.selectedProject.uri.path, '/file/-/home/user/project');
	});

	test('Browse Remotes can add a remote and continue to folder selection', async () => {
		configuredEntries = [{ address: 'ws://existing:8080', name: 'Existing' }];
		connections = [{ address: 'ws://existing:8080', name: 'Existing', clientId: 'existing-client' }];
		pickedItem = {
			remoteType: 'add',
			label: 'Add Remote...',
			description: 'Connect to a new remote agent host',
		} as IQuickPickItem;
		inputValues = ['Listening on ws://127.0.0.1:8089', 'Loopback'];
		addedConnection = {
			address: '127.0.0.1:8089',
			name: 'Loopback',
			clientId: 'new-client',
			defaultDirectory: '/home/loopback',
		};
		openDialogResult = [agentHostUri(agentHostAuthority('127.0.0.1:8089'), '/home/loopback/project')];

		const picker = createPicker();
		const container = document.createElement('div');
		picker.render(container);
		picker.showPicker();

		const browseRemotesItem = shownItems.find(item => item.kind === ActionListItemKind.Action && item.label === 'Browse Remotes...');
		assert.ok(browseRemotesItem);
		assert.ok(shownDelegate);

		shownDelegate.onSelect(browseRemotesItem.item!);
		await Event.toPromise(picker.onDidSelectProject);

		assert.deepStrictEqual(addedEntries, [{
			address: '127.0.0.1:8089',
			name: 'Loopback',
			connectionToken: undefined,
		}]);
		assert.ok(openDialogOptions);
		assert.strictEqual(openDialogOptions.title, 'Select Folder on Loopback');
		assert.strictEqual(openDialogOptions.defaultUri?.toString(), agentHostUri(agentHostAuthority('127.0.0.1:8089'), '/home/loopback').toString());
		assert.ok(picker.selectedProject);
		assert.strictEqual(picker.selectedProject.uri.path, '/file/-/home/loopback/project');
	});

	test('Browse Remotes with no configured entries goes straight to add remote', async () => {
		configuredEntries = [];
		inputValues = ['192.168.1.100:8080', 'Home Server'];
		addedConnection = {
			address: '192.168.1.100:8080',
			name: 'Home Server',
			clientId: 'home-client',
			defaultDirectory: '/workspace',
		};
		openDialogResult = [agentHostUri(agentHostAuthority('192.168.1.100:8080'), '/workspace/myproject')];

		const picker = createPicker();
		const container = document.createElement('div');
		picker.render(container);
		picker.showPicker();

		const browseRemotesItem = shownItems.find(item => item.kind === ActionListItemKind.Action && item.label === 'Browse Remotes...');
		assert.ok(browseRemotesItem);
		assert.ok(shownDelegate);

		shownDelegate.onSelect(browseRemotesItem.item!);
		await Event.toPromise(picker.onDidSelectProject);

		assert.deepStrictEqual(addedEntries, [{
			address: '192.168.1.100:8080',
			name: 'Home Server',
			connectionToken: undefined,
		}]);
		assert.ok(picker.selectedProject);
		assert.strictEqual(picker.selectedProject.uri.path, '/file/-/workspace/myproject');
	});
});
