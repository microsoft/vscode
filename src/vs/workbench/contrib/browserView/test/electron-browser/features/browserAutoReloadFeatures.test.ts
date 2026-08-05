/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { timeout } from '../../../../../../base/common/async.js';
import { Emitter } from '../../../../../../base/common/event.js';
import { Disposable, DisposableStore } from '../../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../../base/common/uri.js';
import { runWithFakedTimers } from '../../../../../../base/test/common/timeTravelScheduler.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { IBrowserViewNavigationEvent, IBrowserViewVisibilityEvent } from '../../../../../../platform/browserView/common/browserView.js';
import { IConfigurationChangeEvent, IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { FileChangesEvent, FileChangeType, IFileService, IFileSystemWatcher } from '../../../../../../platform/files/common/files.js';
import { BrowserEditorInput } from '../../../common/browserEditorInput.js';
import { IBrowserViewModel, IBrowserViewWorkbenchService } from '../../../common/browserView.js';
import { BrowserAutoReloadService, BrowserAutoReloadWatcher } from '../../../electron-browser/features/browserAutoReloadFeatures.js';

suite('Browser Auto Reload Features', () => {
	const disposables = new DisposableStore();

	teardown(() => disposables.clear());
	ensureNoDisposablesAreLeakedInTestSuite();

	test('watches only non-empty file URLs', () => {
		const fileService = new TestFileService();
		const emptyModel = disposables.add(new TestBrowserViewModel(''));
		const httpModel = disposables.add(new TestBrowserViewModel('https://example.com'));
		disposables.add(new BrowserAutoReloadWatcher(new TestBrowserEditorInput(emptyModel).input, true, fileService.service));
		disposables.add(new BrowserAutoReloadWatcher(new TestBrowserEditorInput(httpModel).input, true, fileService.service));

		assert.deepStrictEqual(fileService.snapshot(), {
			resources: [],
			activeWatchers: 0,
			disposedWatchers: 0,
		});

		emptyModel.navigate('file:///workspace/index.html?theme=dark#section');
		assert.deepStrictEqual(fileService.snapshot(), {
			resources: ['file:///workspace/index.html'],
			activeWatchers: 1,
			disposedWatchers: 0,
		});
	});

	test('watches file URLs and replaces the watcher on navigation', () => {
		const fileService = new TestFileService();
		const model = disposables.add(new TestBrowserViewModel('file:///workspace/index.html?theme=dark#section'));
		const watcher = disposables.add(new BrowserAutoReloadWatcher(new TestBrowserEditorInput(model).input, true, fileService.service));

		assert.deepStrictEqual(fileService.snapshot(), {
			resources: ['file:///workspace/index.html'],
			activeWatchers: 1,
			disposedWatchers: 0,
		});

		model.navigate('https://example.com');
		assert.deepStrictEqual(fileService.snapshot(), {
			resources: ['file:///workspace/index.html'],
			activeWatchers: 0,
			disposedWatchers: 1,
		});

		model.navigate('file:///workspace/other.html');
		assert.deepStrictEqual(fileService.snapshot(), {
			resources: ['file:///workspace/index.html', 'file:///workspace/other.html'],
			activeWatchers: 1,
			disposedWatchers: 1,
		});

		watcher.setEnabled(false);
		assert.deepStrictEqual(fileService.snapshot(), {
			resources: ['file:///workspace/index.html', 'file:///workspace/other.html'],
			activeWatchers: 0,
			disposedWatchers: 2,
		});
	});

	test('debounces relevant file changes into one reload', () => {
		return runWithFakedTimers({ useFakeTimers: true, maxTaskCount: 10_000 }, async () => {
			const fileService = new TestFileService();
			const model = disposables.add(new TestBrowserViewModel('file:///workspace/index.html'));
			disposables.add(new BrowserAutoReloadWatcher(new TestBrowserEditorInput(model).input, true, fileService.service));

			fileService.fire(URI.file('/workspace/unrelated.html'));
			fileService.fire(URI.file('/workspace/index.html'), FileChangeType.DELETED);
			await timeout(301);
			assert.strictEqual(model.reloadCount, 0);

			fileService.fire(URI.file('/workspace/index.html'), FileChangeType.UPDATED);
			fileService.fire(URI.file('/workspace/index.html'), FileChangeType.ADDED);
			await timeout(301);
			assert.strictEqual(model.reloadCount, 1);
		});
	});

	test('defers hidden changes and reloads once when visible', () => {
		return runWithFakedTimers({ useFakeTimers: true, maxTaskCount: 10_000 }, async () => {
			const fileService = new TestFileService();
			const model = disposables.add(new TestBrowserViewModel('file:///workspace/index.html'));
			disposables.add(new BrowserAutoReloadWatcher(new TestBrowserEditorInput(model).input, true, fileService.service));

			model.setVisible(false);
			fileService.fire(URI.file('/workspace/index.html'));
			fileService.fire(URI.file('/workspace/index.html'));
			model.setVisible(true);
			assert.strictEqual(model.reloadCount, 0);
			await timeout(301);
			assert.strictEqual(model.reloadCount, 1);

			model.setVisible(false);
			fileService.fire(URI.file('/workspace/index.html'));
			await timeout(301);
			assert.strictEqual(model.reloadCount, 1);
			model.setVisible(true);
			assert.strictEqual(model.reloadCount, 2);
		});
	});

	test('navigation and disabling clear pending reloads', () => {
		return runWithFakedTimers({ useFakeTimers: true, maxTaskCount: 10_000 }, async () => {
			const fileService = new TestFileService();
			const model = disposables.add(new TestBrowserViewModel('file:///workspace/index.html'));
			const watcher = disposables.add(new BrowserAutoReloadWatcher(new TestBrowserEditorInput(model).input, true, fileService.service));

			model.setVisible(false);
			fileService.fire(URI.file('/workspace/index.html'));
			await timeout(301);
			model.navigate('file:///workspace/other.html');
			model.setVisible(true);
			assert.strictEqual(model.reloadCount, 0);

			model.setVisible(false);
			fileService.fire(URI.file('/workspace/other.html'));
			await timeout(301);
			watcher.setEnabled(false);
			model.setVisible(true);
			assert.strictEqual(model.reloadCount, 0);
		});
	});

	test('service tracks browser inputs and preserves per-browser overrides', () => {
		const fileService = new TestFileService();
		const configurationService = new TestConfigurationService(true);
		const browserViewService = new TestBrowserViewWorkbenchService();
		const firstModel = disposables.add(new TestBrowserViewModel('file:///workspace/first.html'));
		const firstInput = new TestBrowserEditorInput(firstModel);
		browserViewService.set('first', firstInput.input);
		const service = disposables.add(new BrowserAutoReloadService(browserViewService.service, configurationService.service, fileService.service));
		const changes: Array<{ browserId: string; enabled: boolean }> = [];
		disposables.add(service.onDidChangeState(e => changes.push(e)));

		assert.deepStrictEqual({
			firstEnabled: service.isEnabled('first'),
			watchers: fileService.snapshot().activeWatchers,
		}, {
			firstEnabled: true,
			watchers: 1,
		});

		service.setEnabled('first', false);
		configurationService.setDefault(false);
		const secondModel = disposables.add(new TestBrowserViewModel('file:///workspace/second.html'));
		browserViewService.set('second', new TestBrowserEditorInput(secondModel).input);
		configurationService.setDefault(true);

		assert.deepStrictEqual({
			firstEnabled: service.isEnabled('first'),
			secondEnabled: service.isEnabled('second'),
			watchers: fileService.snapshot().activeWatchers,
			changes,
		}, {
			firstEnabled: false,
			secondEnabled: true,
			watchers: 1,
			changes: [
				{ browserId: 'first', enabled: false },
				{ browserId: 'second', enabled: true },
			],
		});

		browserViewService.delete('first');
		assert.strictEqual(service.isEnabled('first'), true);
	});
});

class TestBrowserEditorInput {
	readonly input: BrowserEditorInput;

	constructor(model: TestBrowserViewModel) {
		this.input = {
			onceModelResolves: callback => {
				callback(model.model);
				return Disposable.None;
			},
		} as Partial<BrowserEditorInput> as BrowserEditorInput;
	}
}

class TestBrowserViewModel extends Disposable {
	private readonly _onDidNavigate = this._register(new Emitter<IBrowserViewNavigationEvent>());
	private readonly _onDidChangeVisibility = this._register(new Emitter<IBrowserViewVisibilityEvent>());
	private readonly _onWillDispose = this._register(new Emitter<void>());
	private _url: string;
	private _visible = true;
	reloadCount = 0;

	readonly model: IBrowserViewModel;

	constructor(url: string) {
		super();
		this._url = url;
		const thisTest = this;
		this.model = {
			id: url,
			get url() { return thisTest._url; },
			get visible() { return thisTest._visible; },
			onDidNavigate: this._onDidNavigate.event,
			onDidChangeVisibility: this._onDidChangeVisibility.event,
			onWillDispose: this._onWillDispose.event,
			reload: async () => { this.reloadCount++; },
			dispose: () => this.dispose(),
		} as Partial<IBrowserViewModel> as IBrowserViewModel;
	}

	navigate(url: string): void {
		this._url = url;
		this._onDidNavigate.fire({
			url,
			title: '',
			canGoBack: false,
			canGoForward: false,
			certificateError: undefined,
		});
	}

	setVisible(visible: boolean): void {
		this._visible = visible;
		this._onDidChangeVisibility.fire({ visible });
	}

	override dispose(): void {
		this._onWillDispose.fire();
		super.dispose();
	}
}

class TestFileService {
	private readonly watchers: Array<{ resource: URI; emitter: Emitter<FileChangesEvent>; disposed: boolean }> = [];

	readonly service = {
		_serviceBrand: undefined,
		createWatcher: (resource: URI): IFileSystemWatcher => {
			const watcher = { resource, emitter: new Emitter<FileChangesEvent>(), disposed: false };
			this.watchers.push(watcher);
			return {
				onDidChange: watcher.emitter.event,
				dispose: () => {
					if (!watcher.disposed) {
						watcher.disposed = true;
						watcher.emitter.dispose();
					}
				},
			};
		},
	} as Partial<IFileService> as IFileService;

	fire(resource: URI, type: FileChangeType = FileChangeType.UPDATED): void {
		for (const watcher of this.watchers) {
			if (!watcher.disposed) {
				watcher.emitter.fire(new FileChangesEvent([{ resource, type }], false));
			}
		}
	}

	snapshot(): { resources: string[]; activeWatchers: number; disposedWatchers: number } {
		return {
			resources: this.watchers.map(watcher => watcher.resource.toString()),
			activeWatchers: this.watchers.filter(watcher => !watcher.disposed).length,
			disposedWatchers: this.watchers.filter(watcher => watcher.disposed).length,
		};
	}
}

class TestBrowserViewWorkbenchService {
	private readonly inputs = new Map<string, BrowserEditorInput>();
	private readonly _onDidChangeBrowserViews = new Emitter<void>();

	readonly service = {
		_serviceBrand: undefined,
		onDidChangeBrowserViews: this._onDidChangeBrowserViews.event,
		getKnownBrowserViews: () => this.inputs,
	} as Partial<IBrowserViewWorkbenchService> as IBrowserViewWorkbenchService;

	set(id: string, input: BrowserEditorInput): void {
		this.inputs.set(id, input);
		this._onDidChangeBrowserViews.fire();
	}

	delete(id: string): void {
		this.inputs.delete(id);
		this._onDidChangeBrowserViews.fire();
	}
}

class TestConfigurationService {
	private readonly _onDidChangeConfiguration = new Emitter<IConfigurationChangeEvent>();

	readonly service = {
		_serviceBrand: undefined,
		onDidChangeConfiguration: this._onDidChangeConfiguration.event,
		getValue: <T>() => this.defaultValue as T,
	} as Partial<IConfigurationService> as IConfigurationService;

	constructor(private defaultValue: boolean) { }

	setDefault(value: boolean): void {
		this.defaultValue = value;
		this._onDidChangeConfiguration.fire({
			affectsConfiguration: () => true,
		} as Partial<IConfigurationChangeEvent> as IConfigurationChangeEvent);
	}
}
