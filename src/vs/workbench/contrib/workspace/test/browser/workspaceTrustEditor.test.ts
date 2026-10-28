/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DomScrollableElement } from '../../../../../base/browser/ui/scrollbar/scrollableElement.js';
import { mainWindow } from '../../../../../base/browser/window.js';
import { DeferredPromise, timeout } from '../../../../../base/common/async.js';
import { errorHandler } from '../../../../../base/common/errors.js';
import { Emitter } from '../../../../../base/common/event.js';
import { ScrollbarVisibility } from '../../../../../base/common/scrollable.js';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IFileDialogService, IOpenDialogOptions } from '../../../../../platform/dialogs/common/dialogs.js';
import { IWorkspaceTrustManagementService, IWorkspaceTrustUriInfo } from '../../../../../platform/workspace/common/workspaceTrust.js';
import { TestEditorGroupView, TestFileDialogService, workbenchInstantiationService } from '../../../../test/browser/workbenchTestServices.js';
import { TestWorkspaceTrustManagementService } from '../../../../test/common/workbenchTestServices.js';
import { IWorkbenchExtensionEnablementService } from '../../../../services/extensionManagement/common/extensionManagement.js';
import { IExtensionManifestPropertiesService } from '../../../../services/extensions/common/extensionManifestPropertiesService.js';
import { IExtensionsWorkbenchService } from '../../../extensions/common/extensions.js';
import { WorkspaceTrustedUrisTable, WorkspaceTrustEditor } from '../../browser/workspaceTrustEditor.js';

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

suite('WorkspaceTrustedUrisTable', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	let container: HTMLElement;
	let dialogService: PickerFileDialogService;
	let trustService: FakeWorkspaceTrustManagementService;
	let table: WorkspaceTrustedUrisTable;

	const folder = (name: string) => URI.file(`/trusted/${name}`);
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
			trustService.canonicalize = uri => uri.with({ path: uri.path.replace(/^\/alias\//, '/trusted/') });
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
			body.dispatchEvent(new Event('scroll'));
			return !!scrollableNode.querySelector(':scope > .shadow.top');
		};

		assert.deepStrictEqual([scrollNatively(200), scrollNatively(0)], [true, false]);
	});
});
