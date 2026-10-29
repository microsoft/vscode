/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DomScrollableElement } from '../../../../../base/browser/ui/scrollbar/scrollableElement.js';
import { mainWindow } from '../../../../../base/browser/window.js';
import { DeferredPromise, timeout } from '../../../../../base/common/async.js';
import { errorHandler } from '../../../../../base/common/errors.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { normalizeDriveLetter } from '../../../../../base/common/labels.js';
import { isWindows } from '../../../../../base/common/platform.js';
import { ScrollbarVisibility } from '../../../../../base/common/scrollable.js';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IFileDialogService, IOpenDialogOptions } from '../../../../../platform/dialogs/common/dialogs.js';
import { IWorkspaceTrustManagementService, IWorkspaceTrustUriInfo } from '../../../../../platform/workspace/common/workspaceTrust.js';
import { TestEditorGroupView, TestFileDialogService, TestWorkbenchExtensionEnablementService, workbenchInstantiationService } from '../../../../test/browser/workbenchTestServices.js';
import { TestWorkspaceTrustManagementService } from '../../../../test/common/workbenchTestServices.js';
import { WorkspaceTrustedUrisTable, WorkspaceTrustEditor } from '../../browser/workspaceTrustEditor.js';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IExtensionsWorkbenchService } from '../../../extensions/common/extensions.js';
import { IWorkbenchConfigurationService } from '../../../../services/configuration/common/configuration.js';
import { IWorkbenchExtensionEnablementService } from '../../../../services/extensionManagement/common/extensionManagement.js';
import { IExtensionManifestPropertiesService } from '../../../../services/extensions/common/extensionManifestPropertiesService.js';
import { WorkspaceTrustEditorInput } from '../../../../services/workspaces/browser/workspaceTrustEditorInput.js';

class PickerFileDialogService extends TestFileDialogService {
	nextPick: URI[] | undefined;

	override showOpenDialog(_options: IOpenDialogOptions): Promise<URI[] | undefined> {
		return Promise.resolve(this.nextPick);
	}
}

/**
 * Models the real trust service: URIs are canonicalized (query and fragment removed, plus an optional
 * path-changing mapping such as a remote's canonical URI), implicitly trusted resources resolve to
 * themselves and get no entry, the change event fires before the mutation completes, duplicates do
 * not fire an event, and every call returns fresh URI instances so that reference equality cannot
 * be relied upon.
 */
class FakeWorkspaceTrustManagementService extends TestWorkspaceTrustManagementService {
	private readonly _onDidChangeTrustedFoldersEmitter = this._register(new Emitter<void>());
	override onDidChangeTrustedFolders = this._onDidChangeTrustedFoldersEmitter.event;

	private entries: URI[];
	verificationGate: Promise<void> | undefined;
	completionGate: Promise<void> | undefined;
	failure: Error | undefined;
	autoTrusted: ((uri: URI) => boolean) | undefined;
	canonicalize: ((uri: URI) => URI) | undefined;

	constructor(entries: URI[]) {
		super();
		this.entries = entries.map(uri => URI.parse(uri.toString()));
	}

	override getTrustedUris(): URI[] {
		return this.entries.map(uri => URI.parse(uri.toString()));
	}

	override async getUriTrustInfo(uri: URI): Promise<IWorkspaceTrustUriInfo> {
		const canonical = this.getCanonicalUri(uri);
		if (this.autoTrusted?.(canonical)) {
			return { trusted: true, uri: canonical };
		}
		const match = this.entries
			.filter(entry => canonical.path === entry.path || canonical.path.startsWith(`${entry.path}/`))
			.sort((a, b) => b.path.length - a.path.length)[0];
		return match ? { trusted: true, uri: URI.parse(match.toString()) } : { trusted: false, uri: canonical };
	}

	override async setUrisTrust(uris: URI[], trusted: boolean): Promise<void> {
		if (this.failure) {
			throw this.failure;
		}

		let changed = false;
		for (const uri of uris.map(uri => this.getCanonicalUri(uri))) {
			if (trusted && this.autoTrusted?.(uri)) {
				continue;
			}
			const exists = this.entries.some(entry => entry.toString() === uri.toString());
			if (trusted && !exists) {
				this.entries.push(uri);
				changed = true;
			} else if (!trusted && exists) {
				this.entries = this.entries.filter(entry => entry.toString() !== uri.toString());
				changed = true;
			}
		}

		if (changed) {
			this._onDidChangeTrustedFoldersEmitter.fire();
		}
		await this.completionGate;
	}

	override async setTrustedUris(uris: URI[]): Promise<void> {
		await this.verificationGate;
		if (this.failure) {
			throw this.failure;
		}
		this.entries = uris.map(uri => this.getCanonicalUri(uri));
		this._onDidChangeTrustedFoldersEmitter.fire();
		await this.completionGate;
	}

	private getCanonicalUri(uri: URI): URI {
		return (this.canonicalize?.(uri) ?? uri).with({ query: null, fragment: null });
	}

	addExternally(uri: URI): void {
		this.entries.push(uri);
		this._onDidChangeTrustedFoldersEmitter.fire();
	}
}

interface ITableState {
	readonly rows: string[];
	readonly selected: string[];
	readonly focused: string[];
	readonly activeDescendant: string | undefined;
	readonly tableHasDomFocus: boolean;
}

suite('WorkspaceTrustEditor source recovery', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	let container: HTMLElement;
	let retries: number;
	let resolved: boolean;
	let resolveOnRetry: boolean;
	let allowTrustChanges: boolean;
	let trustChanges: number;
	let retryGate: DeferredPromise<void> | undefined;
	let retryFailure: Error | undefined;

	setup(async () => {
		retries = 0;
		resolved = false;
		resolveOnRetry = false;
		allowTrustChanges = true;
		trustChanges = 0;
		retryGate = undefined;
		retryFailure = undefined;
		container = mainWindow.document.createElement('div');
		mainWindow.document.body.appendChild(container);

		const changed = store.add(new Emitter<void>());
		const trustService = store.add(new class extends TestWorkspaceTrustManagementService {
			override onDidChangeTrustedFolders = changed.event;
			override isWorkspaceTrusted() { return false; }
			override getTrustedUris() { return []; }
			override canSetWorkspaceTrust() { return resolved && allowTrustChanges; }
			override isWorkspaceTrustSourceResolved() { return resolved; }
			override async setWorkspaceTrust() { trustChanges++; }
			override async resolveWorkspaceTrust() {
				retries++;
				await retryGate?.p;
				if (retryFailure) {
					throw retryFailure;
				}
				resolved = resolveOnRetry;
				changed.fire();
			}
		});
		const instantiationService = workbenchInstantiationService(undefined, store);
		instantiationService.stub(IWorkspaceTrustManagementService, trustService);
		instantiationService.stub(IExtensionsWorkbenchService, { onChange: Event.None, local: [] });
		instantiationService.stub(IWorkbenchConfigurationService, Object.assign(new TestConfigurationService(), {
			restrictedSettings: { default: [] },
			onDidChangeRestrictedSettings: Event.None,
		}));
		instantiationService.stub(IWorkbenchExtensionEnablementService, new TestWorkbenchExtensionEnablementService());
		instantiationService.stub(IExtensionManifestPropertiesService, new class extends mock<IExtensionManifestPropertiesService>() { });
		const editor = store.add(instantiationService.createInstance(WorkspaceTrustEditor, new TestEditorGroupView(1)));
		editor.create(container);
		await editor.setInput(store.add(new WorkspaceTrustEditorInput()), {}, {}, CancellationToken.None);
		await timeout(150);
	});

	teardown(() => container.remove());

	function retryButton(): HTMLElement | null {
		return container.querySelector('[aria-label="Retry Source Check"] .monaco-button');
	}

	test('explains an unverified source and retries without granting trust', async () => {
		assert.ok(container.textContent?.includes('source repository for this workspace could not be verified'));
		assert.strictEqual(container.querySelector('[aria-label^="Trust,"]'), null);
		retryGate = new DeferredPromise<void>();
		resolveOnRetry = true;
		const button = retryButton()!;
		button.focus();
		button.click();
		assert.strictEqual(button.getAttribute('aria-disabled'), 'true');
		assert.strictEqual(retries, 1);
		await retryGate.complete();
		await timeout(150);

		assert.strictEqual(retryButton(), null);
		assert.ok(container.querySelector('.workspace-trust-editor.untrusted'));
		const trustButton = Array.from(container.querySelectorAll('.monaco-button')).find(button => button.textContent === 'Trust');
		assert.ok(trustButton);
		const focusedHeading = mainWindow.document.activeElement === container.querySelector('.workspace-trust-header');
		mainWindow.document.activeElement!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', keyCode: 13, repeat: true, bubbles: true }));
		await timeout(0);
		assert.deepStrictEqual({ focusedHeading, trustChanges }, { focusedHeading: true, trustChanges: 0 });
	});

	test('an unsuccessful check stays restricted and can be retried again', async () => {
		const button = retryButton()!;
		button.focus();
		button.click();
		await timeout(150);

		assert.strictEqual(retries, 1);
		assert.strictEqual(resolved, false);
		assert.strictEqual(retryButton()!.getAttribute('aria-disabled'), 'false');
		assert.ok(container.textContent?.includes('source repository for this workspace could not be verified'));
		assert.notStrictEqual(retryButton(), button);
		assert.strictEqual(mainWindow.document.activeElement, retryButton());
	});

	test('focuses the editor heading when a successful retry leaves no trust action', async () => {
		resolveOnRetry = true;
		allowTrustChanges = false;
		retryButton()!.focus();
		retryButton()!.click();
		await timeout(150);

		assert.strictEqual(retryButton(), null);
		assert.strictEqual(mainWindow.document.activeElement, container.querySelector('.workspace-trust-header'));
	});

	for (const phase of ['during the request', 'before the debounced render']) {
		test(`does not take focus back when the user leaves the action ${phase}`, async () => {
			retryGate = new DeferredPromise<void>();
			retryButton()!.focus();
			retryButton()!.click();
			if (phase === 'before the debounced render') {
				await retryGate.complete();
				await timeout(0);
			}
			const otherControl = container.appendChild(mainWindow.document.createElement('button'));
			otherControl.textContent = 'Other control';
			otherControl.focus();
			if (phase === 'during the request') {
				await retryGate.complete();
			}
			await timeout(150);

			assert.strictEqual(retries, 1);
			assert.strictEqual(mainWindow.document.activeElement, otherControl);
		});
	}

	test('reports retry errors and re-enables the action', async () => {
		retryFailure = new Error('Retry failed');
		const errors: unknown[] = [];
		const previousHandler = errorHandler.getUnexpectedErrorHandler();
		errorHandler.setUnexpectedErrorHandler(error => errors.push(error));
		try {
			retryButton()!.click();
			await timeout(0);
		} finally {
			errorHandler.setUnexpectedErrorHandler(previousHandler);
		}

		assert.deepStrictEqual(errors, [retryFailure]);
		assert.strictEqual(retryButton()!.getAttribute('aria-disabled'), 'false');
		assert.strictEqual(resolved, false);
	});
});

suite('WorkspaceTrustedUrisTable', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	let container: HTMLElement;
	let dialogService: PickerFileDialogService;
	let trustService: FakeWorkspaceTrustManagementService;
	let table: WorkspaceTrustedUrisTable;

	const folder = (name: string) => URI.file(isWindows ? `c:\\trusted\\${name}` : `/trusted/${name}`);
	const label = (element: Element | null | undefined) => element?.getAttribute('aria-label')?.match(/[\\/]trusted[\\/](?<name>[^\s\\/]+) on /)?.groups?.name;

	setup(() => {
		container = mainWindow.document.createElement('div');
		container.style.width = '800px';
		mainWindow.document.body.appendChild(container);
	});

	teardown(() => {
		container.remove();
	});

	function createTable(names: string[], scrollableElement?: DomScrollableElement): void {
		const instantiationService = workbenchInstantiationService(undefined, store);
		dialogService = instantiationService.createInstance(PickerFileDialogService);
		trustService = store.add(new FakeWorkspaceTrustManagementService(names.map(folder)));
		instantiationService.stub(IFileDialogService, dialogService);
		instantiationService.stub(IWorkspaceTrustManagementService, trustService);
		table = store.add(instantiationService.createInstance(WorkspaceTrustedUrisTable, container, scrollableElement));
		table.updateTable();
	}

	function getState(): ITableState {
		const list = container.querySelector('.monaco-list')!;
		const rows = Array.from(container.querySelectorAll('.monaco-list-row'))
			.sort((a, b) => Number(a.getAttribute('data-index')) - Number(b.getAttribute('data-index')));
		const activeDescendantId = list.getAttribute('aria-activedescendant');
		return {
			rows: rows.map(label).filter((name): name is string => !!name),
			selected: rows.filter(row => row.getAttribute('aria-selected') === 'true').map(row => label(row)!),
			focused: rows.filter(row => row.classList.contains('focused')).map(row => label(row)!),
			activeDescendant: activeDescendantId ? label(mainWindow.document.getElementById(activeDescendantId)) : undefined,
			tableHasDomFocus: list === mainWindow.document.activeElement,
		};
	}

	function getAddButton(): HTMLElement {
		return container.querySelector<HTMLElement>('.trusted-uris-button-bar .monaco-button')!;
	}

	function selectRow(name: string): void {
		const row = Array.from(container.querySelectorAll('.monaco-list-row')).find(row => label(row) === name)!;
		row.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
		row.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }));
	}

	function acceptInlineEdit(name: string, newName: string): void {
		const row = Array.from(container.querySelectorAll('.monaco-list-row')).find(row => label(row) === name)!;
		row.querySelector<HTMLElement>('.codicon-workspace-trust-editor-edit-folder')!.click();
		const input = row.querySelector<HTMLInputElement>('.input-mode input')!;
		input.value = folder(newName).fsPath;
		input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', keyCode: 13, bubbles: true, cancelable: true }));
	}

	async function addFolder(pick: URI[] | undefined): Promise<void> {
		dialogService.nextPick = pick;
		getAddButton().focus();
		getAddButton().click();
		await timeout(0);
	}

	function focusedState(rows: string[], name: string): ITableState {
		return { rows, selected: [name], focused: [name], activeDescendant: name, tableHasDomFocus: true };
	}

	test('selects and focuses the added folder at its sorted position', async () => {
		const results: ITableState[] = [];
		for (const name of ['a-first', 'm-middle', 'zz-end']) {
			container.replaceChildren();
			createTable(['c-two', 'n-three', 'z-last']);
			selectRow('z-last');
			await addFolder([folder(name)]);
			results.push(getState());
		}

		assert.deepStrictEqual(results, [
			focusedState(['a-first', 'c-two', 'n-three', 'z-last'], 'a-first'),
			focusedState(['c-two', 'm-middle', 'n-three', 'z-last'], 'm-middle'),
			focusedState(['c-two', 'n-three', 'z-last', 'zz-end'], 'zz-end'),
		]);
	});

	test('reveals the added folder in the surrounding scrollable element', async () => {
		// Mirrors the editor: the table is laid out to fit all rows inside a constrained-height
		// scrollable body that is scrolled down to the Add Folder button.
		const content = mainWindow.document.createElement('div');
		const scrollableElement = store.add(new DomScrollableElement(content, { vertical: ScrollbarVisibility.Auto }));
		const viewport = scrollableElement.getDomNode();
		// max-height rather than height: the browser test page renders in quirks mode, where the
		// table's `height: 100%` would otherwise resolve against this constrained ancestor.
		viewport.style.maxHeight = '200px';
		content.style.maxHeight = '200px';
		const spacer = content.appendChild(mainWindow.document.createElement('div'));
		spacer.style.height = '300px';
		content.appendChild(container);
		mainWindow.document.body.appendChild(viewport);
		try {
			createTable(Array.from({ length: 20 }, (_, i) => `n-${String(i).padStart(2, '0')}`), scrollableElement);
			scrollableElement.scanDomNode();
			scrollableElement.setScrollPosition({ scrollTop: Number.MAX_SAFE_INTEGER });
			const scrollTopBefore = scrollableElement.getScrollPosition().scrollTop;

			await addFolder([folder('a-first')]);

			const row = Array.from(container.querySelectorAll('.monaco-list-row')).find(row => label(row) === 'a-first')!;
			const rowRect = row.getBoundingClientRect();
			const viewportRect = viewport.getBoundingClientRect();
			assert.deepStrictEqual({
				scrolledUp: scrollableElement.getScrollPosition().scrollTop < scrollTopBefore,
				rowVisible: rowRect.top >= viewportRect.top && rowRect.bottom <= viewportRect.bottom,
				focused: getState().focused,
			}, { scrolledUp: true, rowVisible: true, focused: ['a-first'] });
		} finally {
			viewport.remove();
		}
	});

	test('moves focus only after the addition completes', async () => {
		createTable(['c-two', 'z-last']);
		selectRow('z-last');
		const gate = new DeferredPromise<void>();
		trustService.completionGate = gate.p;

		await addFolder([folder('m-middle')]);
		const pending = getState();
		gate.complete();
		await timeout(0);

		assert.deepStrictEqual([pending, getState()], [
			{ rows: ['c-two', 'm-middle', 'z-last'], selected: ['z-last'], focused: ['z-last'], activeDescendant: 'z-last', tableHasDomFocus: false },
			focusedState(['c-two', 'm-middle', 'z-last'], 'm-middle'),
		]);
	});

	test('focuses the existing row when a duplicate folder is added', async () => {
		createTable(['c-two', 'm-middle', 'z-last']);
		selectRow('z-last');
		await addFolder([folder('m-middle')]);
		assert.deepStrictEqual(getState(), focusedState(['c-two', 'm-middle', 'z-last'], 'm-middle'));
	});

	test('focuses the stored canonical entry', async () => {
		createTable(['c-two', 'z-last']);
		selectRow('z-last');
		await addFolder([folder('m-middle').with({ query: 'q=1', fragment: 'f' })]);
		assert.deepStrictEqual(getState(), focusedState(['c-two', 'm-middle', 'z-last'], 'm-middle'));
	});

	test('focuses the stored entry when canonicalization changes the path', async () => {
		const results: ITableState[] = [];
		for (const existing of [['c-two', 'z-last'], ['c-two', 'm-middle', 'z-last']]) {
			container.replaceChildren();
			createTable(existing);
			trustService.canonicalize = uri => uri.with({ path: uri.path.replace(/^\/alias\//, folder('').path) });
			selectRow('z-last');
			await addFolder([URI.file('/alias/m-middle')]);
			results.push(getState());
		}

		assert.deepStrictEqual(results, [
			focusedState(['c-two', 'm-middle', 'z-last'], 'm-middle'),
			focusedState(['c-two', 'm-middle', 'z-last'], 'm-middle'),
		]);
	});

	test('does not focus an unrelated folder added externally while the addition is pending', async () => {
		const results: ITableState[] = [];
		for (const implicitlyTrusted of [true, false]) {
			container.replaceChildren();
			createTable(['c-two', 'z-last']);
			selectRow('z-last');
			trustService.autoTrusted = implicitlyTrusted ? uri => uri.path.endsWith('/m-middle') : undefined;
			const gate = new DeferredPromise<void>();
			trustService.completionGate = gate.p;

			await addFolder([folder('m-middle')]);
			trustService.addExternally(folder('b-other'));
			gate.complete();
			await timeout(0);
			results.push(getState());
		}

		assert.deepStrictEqual(results, [
			{ rows: ['b-other', 'c-two', 'z-last'], selected: ['z-last'], focused: ['z-last'], activeDescendant: 'z-last', tableHasDomFocus: false },
			focusedState(['b-other', 'c-two', 'm-middle', 'z-last'], 'm-middle'),
		]);
	});

	test('does not focus a trusted parent when the folder gets no entry', async () => {
		createTable(['c-two', 'z-last']);
		selectRow('z-last');
		trustService.autoTrusted = () => true;
		await addFolder([folder('c-two/child')]);
		assert.deepStrictEqual([getState().rows, getState().selected, mainWindow.document.activeElement === getAddButton()], [['c-two', 'z-last'], ['z-last'], true]);
	});

	test('leaves focus unchanged when the picker is cancelled', async () => {
		createTable(['c-two', 'z-last']);
		selectRow('z-last');
		await addFolder(undefined);
		await addFolder([]);
		assert.deepStrictEqual([getState().rows, getState().selected, mainWindow.document.activeElement === getAddButton()], [['c-two', 'z-last'], ['z-last'], true]);
	});

	test('does not steal focus on external refresh', () => {
		createTable(['c-two', 'z-last']);
		selectRow('z-last');
		getAddButton().focus();
		trustService.addExternally(folder('m-middle'));
		assert.deepStrictEqual([getState().rows, getState().selected, mainWindow.document.activeElement === getAddButton()], [['c-two', 'm-middle', 'z-last'], ['z-last'], true]);
	});

	test('reports failures and keeps the previous selection', async () => {
		createTable(['c-two', 'z-last']);
		selectRow('z-last');
		trustService.failure = new Error('persistence failed');
		const errors: unknown[] = [];
		const previousHandler = errorHandler.getUnexpectedErrorHandler();
		errorHandler.setUnexpectedErrorHandler(error => errors.push(error));
		try {
			await addFolder([folder('m-middle')]);
		} finally {
			errorHandler.setUnexpectedErrorHandler(previousHandler);
		}
		assert.deepStrictEqual([errors, getState().selected, mainWindow.document.activeElement === getAddButton()], [[trustService.failure], ['z-last'], true]);
	});

	test('does not accept an edit until trust persistence completes', async () => {
		createTable(['c-two']);
		const gate = new DeferredPromise<void>();
		trustService.completionGate = gate.p;
		let accepted = 0;
		store.add(table.onDidAcceptEdit(() => accepted++));
		const edit = table.acceptEdit({ uri: folder('c-two'), parentOfWorkspaceItem: false }, folder('m-middle'));
		const acceptedBeforeCompletion = accepted;
		gate.complete();
		await edit;

		assert.deepStrictEqual({
			acceptedBeforeCompletion,
			accepted,
			trustedUris: trustService.getTrustedUris().map(uri => uri.toString()),
		}, {
			acceptedBeforeCompletion: 0,
			accepted: 1,
			trustedUris: [folder('m-middle').toString()],
		});
	});

	test('reports a failed edit without accepting it or changing stored trust', async () => {
		createTable(['c-two']);
		trustService.failure = new Error('source could not be verified');
		let accepted = 0;
		store.add(table.onDidAcceptEdit(() => accepted++));
		const errors: unknown[] = [];
		const previousHandler = errorHandler.getUnexpectedErrorHandler();
		errorHandler.setUnexpectedErrorHandler(error => errors.push(error));
		try {
			await table.acceptEdit({ uri: folder('c-two'), parentOfWorkspaceItem: false }, folder('m-middle'));
		} finally {
			errorHandler.setUnexpectedErrorHandler(previousHandler);
		}

		assert.deepStrictEqual({
			errors,
			accepted,
			trustedUris: trustService.getTrustedUris().map(uri => uri.toString()),
		}, {
			errors: [trustService.failure],
			accepted: 0,
			trustedUris: [folder('c-two').toString()],
		});
	});

	test('inline editing shows the saved path until verification and then the canonical path', async () => {
		createTable(['c-two']);
		const gate = new DeferredPromise<void>();
		trustService.verificationGate = gate.p;
		trustService.canonicalize = uri => uri.path === folder('m-middle').path ? folder('verified-source') : uri;

		acceptInlineEdit('c-two', 'm-middle');
		const pendingLabel = container.querySelector('.path-label')!.textContent;
		const pendingUris = trustService.getTrustedUris().map(uri => uri.toString());
		await gate.complete();
		await timeout(0);

		assert.deepStrictEqual({
			pendingLabel,
			pendingUris,
			label: container.querySelector('.path-label')!.textContent,
			trustedUris: trustService.getTrustedUris().map(uri => uri.toString()),
		}, {
			pendingLabel: normalizeDriveLetter(folder('c-two').fsPath),
			pendingUris: [folder('c-two').toString()],
			label: normalizeDriveLetter(folder('verified-source').fsPath),
			trustedUris: [folder('verified-source').toString()],
		});
	});

	test('inline editing keeps the saved path visible when verification fails', async () => {
		createTable(['c-two']);
		const gate = new DeferredPromise<void>();
		trustService.verificationGate = gate.p;
		trustService.failure = new Error('source could not be verified');
		const errors: unknown[] = [];
		const previousHandler = errorHandler.getUnexpectedErrorHandler();
		errorHandler.setUnexpectedErrorHandler(error => errors.push(error));
		let pendingLabel: string | null;
		try {
			acceptInlineEdit('c-two', 'm-middle');
			pendingLabel = container.querySelector('.path-label')!.textContent;
			await gate.complete();
			await timeout(0);
		} finally {
			errorHandler.setUnexpectedErrorHandler(previousHandler);
		}

		assert.deepStrictEqual({
			pendingLabel,
			errors,
			label: container.querySelector('.path-label')!.textContent,
			trustedUris: trustService.getTrustedUris().map(uri => uri.toString()),
		}, {
			pendingLabel: normalizeDriveLetter(folder('c-two').fsPath),
			errors: [trustService.failure],
			label: normalizeDriveLetter(folder('c-two').fsPath),
			trustedUris: [folder('c-two').toString()],
		});
	});

	test('does not touch the table when disposed during the addition', async () => {
		createTable(['c-two', 'z-last']);
		const gate = new DeferredPromise<void>();
		trustService.completionGate = gate.p;
		await addFolder([folder('m-middle')]);
		const list = container.querySelector('.monaco-list');
		const errors: unknown[] = [];
		const previousHandler = errorHandler.getUnexpectedErrorHandler();
		errorHandler.setUnexpectedErrorHandler(error => errors.push(error));
		try {
			table.dispose();
			gate.complete();
			await timeout(0);
		} finally {
			errorHandler.setUnexpectedErrorHandler(previousHandler);
		}
		assert.deepStrictEqual([errors, mainWindow.document.activeElement === list], [[], false]);
	});

	test('edit selects the row matching an equivalent URI', () => {
		createTable(['c-two', 'm-middle', 'z-last']);
		selectRow('z-last');
		table.edit({ uri: folder('m-middle'), parentOfWorkspaceItem: false });
		assert.deepStrictEqual([getState().selected, getState().focused], [['m-middle'], ['m-middle']]);
	});

	test('removing a folder keeps the existing focus policy', async () => {
		const removeRow = async (name: string) => {
			const row = Array.from(container.querySelectorAll('.monaco-list-row')).find(row => label(row) === name)!;
			row.querySelector<HTMLElement>('.codicon-workspace-trust-editor-remove-folder')!.click();
			await timeout(0);
			const state = getState();
			return [state.rows, state.focused];
		};

		createTable(['c-two', 'm-middle', 'z-last']);
		assert.deepStrictEqual([await removeRow('m-middle'), await removeRow('z-last'), await removeRow('c-two')], [
			[['c-two', 'z-last'], ['z-last']],
			[['c-two'], ['c-two']],
			[[], []],
		]);
	});
});

suite('WorkspaceTrustEditor', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	let container: HTMLElement;

	setup(() => {
		container = mainWindow.document.createElement('div');
		container.style.width = '800px';
		container.style.height = '300px';
		mainWindow.document.body.appendChild(container);
	});

	teardown(() => {
		container.remove();
	});

	test('header shadow tracks native scrolling of the body (#131746)', () => {
		const instantiationService = workbenchInstantiationService(undefined, store);
		instantiationService.stub(IWorkspaceTrustManagementService, store.add(new TestWorkspaceTrustManagementService()));
		instantiationService.stub(IExtensionsWorkbenchService, {});
		instantiationService.stub(IExtensionManifestPropertiesService, {});
		instantiationService.stub(IWorkbenchExtensionEnablementService, {});
		const editor = store.add(instantiationService.createInstance(WorkspaceTrustEditor, new TestEditorGroupView(0)));
		editor.create(container);

		const scrollableNode = container.querySelector<HTMLElement>('.workspace-trust-editor > .monaco-scrollable-element')!;
		const body = scrollableNode.querySelector<HTMLElement>('.workspace-trust-editor-body')!;
		// The editor's stylesheet is not loaded in unit tests, so constrain the body directly.
		body.style.height = '100px';
		body.appendChild(mainWindow.document.createElement('div')).style.height = '1000px';

		// Native scrolling, e.g. the browser revealing a control focused with Tab.
		const scrollNatively = (scrollTop: number) => {
			body.scrollTop = scrollTop;
			body.dispatchEvent(new mainWindow.Event('scroll'));
			return !!scrollableNode.querySelector(':scope > .shadow.top');
		};

		assert.deepStrictEqual([scrollNatively(200), scrollNatively(0)], [true, false]);
	});
});
