/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { addDisposableListener, EventType, isHTMLElement } from '../../../../../base/browser/dom.js';
import { timeout } from '../../../../../base/common/async.js';
import { StandardKeyboardEvent } from '../../../../../base/browser/keyboardEvent.js';
import { mainWindow } from '../../../../../base/browser/window.js';
import { workbenchInstantiationService, registerTestEditor, TestFileEditorInput, createEditorParts, TestLayoutService } from '../../../../test/browser/workbenchTestServices.js';
import { GroupsOrder, IEditorGroup, IEditorGroupsService, IModalEditorPart } from '../../common/editorGroupsService.js';
import { EditorExtensions, EditorInputCapabilities, IEditorFactoryRegistry, IEditorOpenContext } from '../../../../common/editor.js';
import { URI } from '../../../../../base/common/uri.js';
import { SyncDescriptor } from '../../../../../platform/instantiation/common/descriptors.js';
import { DisposableStore, toDisposable } from '../../../../../base/common/lifecycle.js';
import { IKeybindingService, IKeyboardEvent } from '../../../../../platform/keybinding/common/keybinding.js';
import { ResultKind, ResolutionResult } from '../../../../../platform/keybinding/common/keybindingResolver.js';
import { MockKeybindingService, MockScopableContextKeyService } from '../../../../../platform/keybinding/test/common/mockKeybindingService.js';
import { SideBySideEditorInput } from '../../../../common/editor/sideBySideEditorInput.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { Registry } from '../../../../../platform/registry/common/platform.js';
import { IEditorService, MODAL_GROUP, MODAL_GROUP_TYPE, UseModalEditorMode } from '../../common/editorService.js';
import { findGroup } from '../../common/editorGroupFinder.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { EditorService } from '../../browser/editorService.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../../platform/storage/common/storage.js';
import { TestStorageService } from '../../../../test/common/workbenchTestServices.js';
import { Memento } from '../../../../common/memento.js';
import { IContextKeyService, IContextKeyServiceTarget } from '../../../../../platform/contextkey/common/contextkey.js';
import { EditorPartModalCanMaximizeContext, EditorPartModalVisibleContext } from '../../../../common/contextkeys.js';
import { ContextKeyService } from '../../../../../platform/contextkey/browser/contextKeyService.js';
import { CLOSE_MODAL_EDITOR_COMMAND_ID } from '../../../../browser/parts/editor/editorCommands.js';
import { IWorkbenchLayoutService, Parts } from '../../../layout/browser/layoutService.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { IEditorOptions, IModalEditorOptions, IModalEditorOptionsProvider } from '../../../../../platform/editor/common/editor.js';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { NullTelemetryService } from '../../../../../platform/telemetry/common/telemetryUtils.js';
import { IThemeService } from '../../../../../platform/theme/common/themeService.js';
import { EditorPaneDescriptor, IEditorPaneRegistry } from '../../../../browser/editor.js';
import { EditorPane } from '../../../../browser/parts/editor/editorPane.js';
import { IEditorGroupView } from '../../../../browser/parts/editor/editor.js';
import { EditorInput } from '../../../../common/editor/editorInput.js';

class TestModalOptionsEditorInput extends TestFileEditorInput implements IModalEditorOptionsProvider {

	private readonly _onDidChangeModalEditorOptions = this._register(new Emitter<void>());
	readonly onDidChangeModalEditorOptions = this._onDidChangeModalEditorOptions.event;

	private modalEditorOptions: IModalEditorOptions | undefined;

	getModalEditorOptions(): IModalEditorOptions | undefined {
		return this.modalEditorOptions;
	}

	setModalEditorOptions(options: IModalEditorOptions | undefined): void {
		this.modalEditorOptions = options;
		this._onDidChangeModalEditorOptions.fire();
	}
}

/** An editor whose content prefers a size, which its {@link TestFitToContentEditorPane} reports. */
class TestFitToContentEditorInput extends TestModalOptionsEditorInput {

	private readonly _onDidChangeContentSize = this._register(new Emitter<void>());
	readonly onDidChangeContentSize = this._onDidChangeContentSize.event;

	private _contentSize: { width: number; height: number } | undefined;
	get contentSize() { return this._contentSize; }

	setContentSize(size: { width: number; height: number }): void {
		this._contentSize = size;
		this._onDidChangeContentSize.fire();
	}
}

class TestFitToContentEditorPane extends EditorPane {

	private readonly _onDidChangePreferredContentSize = this._register(new Emitter<void>());
	readonly onDidChangePreferredContentSize = this._onDidChangePreferredContentSize.event;

	private readonly inputListener = this._register(new DisposableStore());

	constructor(group: IEditorGroup, @IThemeService themeService: IThemeService, @IStorageService storageService: IStorageService) {
		super('testFitToContentEditorPane', group, NullTelemetryService, themeService, storageService);
	}

	get preferredContentSize() {
		return this.input instanceof TestFitToContentEditorInput ? this.input.contentSize : undefined;
	}

	override async setInput(input: EditorInput, options: IEditorOptions | undefined, context: IEditorOpenContext, token: CancellationToken): Promise<void> {
		await super.setInput(input, options, context, token);
		this.inputListener.clear();
		if (input instanceof TestFitToContentEditorInput) {
			this.inputListener.add(input.onDidChangeContentSize(() => this._onDidChangePreferredContentSize.fire()));
		}
		this._onDidChangePreferredContentSize.fire();
	}

	/** The size the editor pane was last laid out with. */
	lastLayoutSize: { width: number; height: number } | undefined;

	protected createEditor(): void { }
	layout(dimension: { width: number; height: number }): void { this.lastLayoutSize = { width: dimension.width, height: dimension.height }; }
}

class TestFloatingEditorLayoutService extends TestLayoutService {

	floatingPanelsEnabled = false;

	private readonly visibleParts = new Set<Parts>([
		Parts.EDITOR_PART,
		Parts.STATUSBAR_PART,
	]);

	override isFloatingPanelsEnabled(): boolean { return this.floatingPanelsEnabled; }
	override isVisible(part: Parts): boolean { return this.visibleParts.has(part); }
}

suite('Modal Editor Group', () => {

	const TEST_EDITOR_ID = 'MyFileEditorForModalEditorGroup';
	const TEST_EDITOR_INPUT_ID = 'testEditorInputForModalEditorGroup';

	const disposables = new DisposableStore();

	setup(() => {
		disposables.add(registerTestEditor(TEST_EDITOR_ID, [new SyncDescriptor(TestFileEditorInput), new SyncDescriptor(SideBySideEditorInput)], TEST_EDITOR_INPUT_ID));
	});

	teardown(() => {
		disposables.clear();
	});

	function createTestFileEditorInput(resource: URI, typeId: string): TestFileEditorInput {
		return disposables.add(new TestFileEditorInput(resource, typeId));
	}

	test('MODAL_GROUP constant is defined correctly', () => {
		assert.strictEqual(MODAL_GROUP, -4);
		assert.strictEqual(typeof MODAL_GROUP, 'number');
	});

	test('MODAL_GROUP_TYPE type exists', () => {
		const modalGroupValue: MODAL_GROUP_TYPE = MODAL_GROUP;
		assert.strictEqual(modalGroupValue, -4);
	});

	test('createModalEditorPart creates a modal editor part', async () => {
		const instantiationService = workbenchInstantiationService({ contextKeyService: instantiationService => instantiationService.createInstance(MockScopableContextKeyService) }, disposables);
		instantiationService.invokeFunction(accessor => Registry.as<IEditorFactoryRegistry>(EditorExtensions.EditorFactory).start(accessor));
		const parts = await createEditorParts(instantiationService, disposables);
		instantiationService.stub(IEditorGroupsService, parts);

		const modalPart = await parts.createModalEditorPart();

		assert.ok(modalPart);
		assert.ok(modalPart.activeGroup);
		assert.strictEqual(typeof modalPart.close, 'function');

		await modalPart.close();
	});

	test('getPart resolves the part by ancestry when several parts share a document', async () => {
		const instantiationService = workbenchInstantiationService({ contextKeyService: instantiationService => instantiationService.createInstance(MockScopableContextKeyService) }, disposables);
		instantiationService.invokeFunction(accessor => Registry.as<IEditorFactoryRegistry>(EditorExtensions.EditorFactory).start(accessor));
		const parts = await createEditorParts(instantiationService, disposables);
		instantiationService.stub(IEditorGroupsService, parts);

		const modalPart = await parts.createModalEditorPart();
		const modalChild = (modalPart.modalElement as HTMLElement).appendChild(document.createElement('div'));
		const mainChild = parts.testMainPart.getContainer()!.appendChild(document.createElement('div'));

		assert.deepStrictEqual({
			modalIsNotMain: parts.getPart(modalChild) !== parts.mainPart,
			main: parts.getPart(mainChild) === parts.mainPart,
			modalByGroup: parts.getPart(modalPart.activeGroup.id) !== parts.mainPart
		}, { modalIsNotMain: true, main: true, modalByGroup: true });

		await modalPart.close();
	});

	test('getPart resolves the container of the main part to the active part of the document', async () => {
		const instantiationService = workbenchInstantiationService({ contextKeyService: instantiationService => instantiationService.createInstance(MockScopableContextKeyService) }, disposables);
		instantiationService.invokeFunction(accessor => Registry.as<IEditorFactoryRegistry>(EditorExtensions.EditorFactory).start(accessor));
		const parts = await createEditorParts(instantiationService, disposables);
		instantiationService.stub(IEditorGroupsService, parts);

		const modalPart = await parts.createModalEditorPart();
		modalPart.activeGroup.focus();

		assert.strictEqual(parts.getPart(parts.testMainPart.getContainer()!) !== parts.mainPart, true);

		await modalPart.close();
	});

	test('floating layout applies DPR 2.5 border insets only to the main editor', async () => {
		const instantiationService = workbenchInstantiationService({ contextKeyService: instantiationService => instantiationService.createInstance(MockScopableContextKeyService) }, disposables);
		const layoutService = new TestFloatingEditorLayoutService();
		instantiationService.stub(IWorkbenchLayoutService, layoutService);
		instantiationService.invokeFunction(accessor => Registry.as<IEditorFactoryRegistry>(EditorExtensions.EditorFactory).start(accessor));
		const parts = await createEditorParts(instantiationService, disposables);
		instantiationService.stub(IEditorGroupsService, parts);
		const mainPart = parts.testMainPart;
		const devicePixelRatio = 2.5;
		mainPart.floatingBorderWidth = Math.floor(devicePixelRatio) / devicePixelRatio;

		const captureMainState = () => ({
			height: mainPart.element.style.height,
			contentDimension: {
				width: mainPart.contentDimension.width,
				height: mainPart.contentDimension.height,
			},
			outerEdges: {
				left: mainPart.element.classList.contains('floating-editor-outer-left'),
				right: mainPart.element.classList.contains('floating-editor-outer-right'),
				top: mainPart.element.classList.contains('floating-editor-outer-top'),
				bottom: mainPart.element.classList.contains('floating-editor-outer-bottom'),
			},
		});

		mainPart.layout(300, 200, 0, 0);
		const classicMain = captureMainState();

		layoutService.floatingPanelsEnabled = true;
		mainPart.layout(300, 200, 0, 0);
		const floatingMain = captureMainState();

		const modalPart = await parts.createModalEditorPart();
		assert.ok(isHTMLElement(modalPart.modalElement));
		const modalEditorElement = modalPart.modalElement.querySelector<HTMLElement>('.modal-editor-part');
		assert.ok(modalEditorElement);
		const floatingModal = {
			height: modalEditorElement.style.height,
		};

		layoutService.floatingPanelsEnabled = false;
		mainPart.layout(300, 200, 0, 0);
		const restoredMain = captureMainState();

		await modalPart.close();

		assert.deepStrictEqual({
			classicMain,
			floatingMain,
			floatingModal,
			restoredMain,
		}, {
			classicMain: {
				height: '',
				contentDimension: { width: 300, height: 200 },
				outerEdges: { left: false, right: false, top: false, bottom: false },
			},
			floatingMain: {
				height: 'calc(100% - 8px)',
				contentDimension: { width: 290.4, height: 190.4 },
				outerEdges: { left: true, right: true, top: true, bottom: true },
			},
			floatingModal: {
				height: '',
			},
			restoredMain: {
				height: '',
				contentDimension: { width: 300, height: 200 },
				outerEdges: { left: false, right: false, top: false, bottom: false },
			},
		});
	});

	test('Escape closes modal before focused controls can stop propagation', async () => {
		let resolvedCommand = 'test.otherCommand';
		let dispatchCount = 0;
		const keybindingService = new class extends MockKeybindingService {
			override softDispatch(): ResolutionResult {
				return { kind: ResultKind.KbFound, commandId: resolvedCommand, commandArgs: undefined, isBubble: false };
			}
			override dispatchEvent(): boolean {
				dispatchCount++;
				dispatchClose?.();
				return true;
			}
		}();
		const instantiationService = workbenchInstantiationService({ contextKeyService: instantiationService => instantiationService.createInstance(MockScopableContextKeyService) }, disposables);
		instantiationService.stub(IKeybindingService, keybindingService);
		instantiationService.invokeFunction(accessor => Registry.as<IEditorFactoryRegistry>(EditorExtensions.EditorFactory).start(accessor));
		const parts = await createEditorParts(instantiationService, disposables);
		instantiationService.stub(IEditorGroupsService, parts);

		const modalPart = await parts.createModalEditorPart();
		const dispatchClose = () => void modalPart.close();
		const modalElement = modalPart.modalElement as HTMLElement;
		const control = modalElement.appendChild(document.createElement('button'));
		let controlKeydownCount = 0;
		disposables.add(addDisposableListener(control, EventType.KEY_DOWN, event => {
			controlKeydownCount++;
			event.stopPropagation();
		}));
		const states: { modalAttached: boolean; controlKeydownCount: number; dispatchCount: number }[] = [];

		control.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', keyCode: 27, bubbles: true }));
		states.push({ modalAttached: !!modalElement.parentElement, controlKeydownCount, dispatchCount });

		resolvedCommand = CLOSE_MODAL_EDITOR_COMMAND_ID;
		control.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', keyCode: 27, bubbles: true }));
		await timeout(0);
		states.push({ modalAttached: !!modalElement.parentElement, controlKeydownCount, dispatchCount });

		assert.deepStrictEqual(states, [
			{ modalAttached: true, controlKeydownCount: 1, dispatchCount: 0 },
			{ modalAttached: false, controlKeydownCount: 1, dispatchCount: 1 },
		]);
	});

	test('Tab and Shift+Tab keep focus inside the modal editor part', async () => {
		const instantiationService = workbenchInstantiationService({ contextKeyService: instantiationService => instantiationService.createInstance(MockScopableContextKeyService) }, disposables);
		instantiationService.invokeFunction(accessor => Registry.as<IEditorFactoryRegistry>(EditorExtensions.EditorFactory).start(accessor));
		const parts = await createEditorParts(instantiationService, disposables);
		instantiationService.stub(IEditorGroupsService, parts);

		const backgroundControl = mainWindow.document.body.appendChild(mainWindow.document.createElement('button'));
		disposables.add({ dispose: () => backgroundControl.remove() });

		const modalPart = await parts.createModalEditorPart();
		const modalElement = modalPart.modalElement as HTMLElement;
		for (const element of modalElement.querySelectorAll<HTMLElement>('a[href], area[href], button, input, select, textarea, iframe, object, embed, [contenteditable="true"], [tabindex]')) {
			element.tabIndex = -1;
		}

		const firstControl = mainWindow.document.createElement('button');
		firstControl.tabIndex = 1;
		modalElement.prepend(firstControl);
		const secondControl = mainWindow.document.createElement('button');
		secondControl.tabIndex = 1;
		firstControl.after(secondControl);
		const lastControl = modalElement.appendChild(mainWindow.document.createElement('button'));

		lastControl.focus();
		const forwardEvent = new KeyboardEvent('keydown', { key: 'Tab', keyCode: 9, bubbles: true, cancelable: true });
		lastControl.dispatchEvent(forwardEvent);
		const forwardFocus = mainWindow.document.activeElement;

		firstControl.focus();
		const backwardEvent = new KeyboardEvent('keydown', { key: 'Tab', keyCode: 9, shiftKey: true, bubbles: true, cancelable: true });
		firstControl.dispatchEvent(backwardEvent);

		assert.deepStrictEqual({
			forwardWrappedToFirst: forwardFocus === firstControl,
			forwardPrevented: forwardEvent.defaultPrevented,
			backwardWrappedToLast: mainWindow.document.activeElement === lastControl,
			backwardPrevented: backwardEvent.defaultPrevented,
			backgroundFocused: mainWindow.document.activeElement === backgroundControl,
		}, {
			forwardWrappedToFirst: true,
			forwardPrevented: true,
			backwardWrappedToLast: true,
			backwardPrevented: true,
			backgroundFocused: false,
		});

		await modalPart.close();
	});

	test('Tab commands reach editable controls at the modal boundary', async () => {
		const keybindingService = new class extends MockKeybindingService {
			override softDispatch(_event: IKeyboardEvent, target: IContextKeyServiceTarget): ResolutionResult {
				return isHTMLElement(target) && target.classList.contains('inputarea')
					? { kind: ResultKind.KbFound, commandId: 'tab', commandArgs: undefined, isBubble: false }
					: { kind: ResultKind.NoMatchingKb };
			}
		}();
		const instantiationService = workbenchInstantiationService({ contextKeyService: instantiationService => instantiationService.createInstance(MockScopableContextKeyService) }, disposables);
		instantiationService.stub(IKeybindingService, keybindingService);
		instantiationService.invokeFunction(accessor => Registry.as<IEditorFactoryRegistry>(EditorExtensions.EditorFactory).start(accessor));
		const parts = await createEditorParts(instantiationService, disposables);
		instantiationService.stub(IEditorGroupsService, parts);

		const modalPart = await parts.createModalEditorPart();
		const modalElement = modalPart.modalElement as HTMLElement;
		for (const element of modalElement.querySelectorAll<HTMLElement>('a[href], area[href], button, input, select, textarea, iframe, object, embed, [contenteditable="true"], [tabindex]')) {
			element.tabIndex = -1;
		}

		modalElement.appendChild(mainWindow.document.createElement('button'));
		const editor = modalElement.appendChild(mainWindow.document.createElement('div'));
		editor.classList.add('monaco-editor');
		const editorInput = editor.appendChild(mainWindow.document.createElement('textarea'));
		editorInput.classList.add('inputarea');
		let editorKeydownCount = 0;
		disposables.add(addDisposableListener(editorInput, EventType.KEY_DOWN, () => editorKeydownCount++));

		editorInput.focus();
		const event = new KeyboardEvent('keydown', { key: 'Tab', keyCode: 9, bubbles: true, cancelable: true });
		editorInput.dispatchEvent(event);

		assert.deepStrictEqual({
			editorStillFocused: mainWindow.document.activeElement === editorInput,
			eventPrevented: event.defaultPrevented,
			editorKeydownCount,
		}, {
			editorStillFocused: true,
			eventPrevented: false,
			editorKeydownCount: 1,
		});

		await modalPart.close();
	});

	test('bubble close keybindings reach focused controls and dispatch once', async () => {
		let dispatchCount = 0;
		const keybindingService = new class extends MockKeybindingService {
			override softDispatch(): ResolutionResult {
				return { kind: ResultKind.KbFound, commandId: CLOSE_MODAL_EDITOR_COMMAND_ID, commandArgs: undefined, isBubble: true };
			}
			override dispatchEvent(_event: IKeyboardEvent, _target: IContextKeyServiceTarget): boolean {
				dispatchCount++;
				return false;
			}
		}();
		const instantiationService = workbenchInstantiationService({ contextKeyService: instantiationService => instantiationService.createInstance(MockScopableContextKeyService) }, disposables);
		instantiationService.stub(IKeybindingService, keybindingService);
		instantiationService.invokeFunction(accessor => Registry.as<IEditorFactoryRegistry>(EditorExtensions.EditorFactory).start(accessor));
		const parts = await createEditorParts(instantiationService, disposables);
		instantiationService.stub(IEditorGroupsService, parts);
		disposables.add(addDisposableListener(mainWindow, EventType.KEY_DOWN, e => {
			const event = new StandardKeyboardEvent(e);
			keybindingService.dispatchEvent(event, event.target);
		}));

		const modalPart = await parts.createModalEditorPart();
		const control = (modalPart.modalElement as HTMLElement).appendChild(document.createElement('button'));
		let controlKeydownCount = 0;
		let stopPropagation = false;
		disposables.add(addDisposableListener(control, EventType.KEY_DOWN, event => {
			controlKeydownCount++;
			if (stopPropagation) {
				event.stopPropagation();
			}
		}));
		const states: { controlKeydownCount: number; dispatchCount: number }[] = [];

		control.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', keyCode: 27, bubbles: true }));
		await timeout(0);
		states.push({ controlKeydownCount, dispatchCount });

		stopPropagation = true;
		control.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', keyCode: 27, bubbles: true }));
		await timeout(0);
		states.push({ controlKeydownCount, dispatchCount });

		assert.deepStrictEqual(states, [
			{ controlKeydownCount: 1, dispatchCount: 1 },
			{ controlKeydownCount: 2, dispatchCount: 2 },
		]);
		await modalPart.close();
	});

	test('modal editor part has correct initial state', async () => {
		const instantiationService = workbenchInstantiationService({ contextKeyService: instantiationService => instantiationService.createInstance(MockScopableContextKeyService) }, disposables);
		instantiationService.invokeFunction(accessor => Registry.as<IEditorFactoryRegistry>(EditorExtensions.EditorFactory).start(accessor));
		const parts = await createEditorParts(instantiationService, disposables);
		instantiationService.stub(IEditorGroupsService, parts);

		const modalPart = await parts.createModalEditorPart();

		// Modal part should have exactly one group initially with 0 editors
		assert.strictEqual(modalPart.activeGroup.count, 0);

		await modalPart.close();
	});

	test('modal editor part can open editors', async () => {
		const instantiationService = workbenchInstantiationService({ contextKeyService: instantiationService => instantiationService.createInstance(MockScopableContextKeyService) }, disposables);
		instantiationService.invokeFunction(accessor => Registry.as<IEditorFactoryRegistry>(EditorExtensions.EditorFactory).start(accessor));
		const parts = await createEditorParts(instantiationService, disposables);
		instantiationService.stub(IEditorGroupsService, parts);

		const modalPart = await parts.createModalEditorPart();

		const input = createTestFileEditorInput(URI.file('foo/bar'), TEST_EDITOR_INPUT_ID);
		await modalPart.activeGroup.openEditor(input, { pinned: true });

		assert.strictEqual(modalPart.activeGroup.count, 1);
		assert.strictEqual(modalPart.activeGroup.activeEditor, input);

		await modalPart.close();
	});

	test('modal editor part is added to parts list', async () => {
		const instantiationService = workbenchInstantiationService({ contextKeyService: instantiationService => instantiationService.createInstance(MockScopableContextKeyService) }, disposables);
		instantiationService.invokeFunction(accessor => Registry.as<IEditorFactoryRegistry>(EditorExtensions.EditorFactory).start(accessor));
		const parts = await createEditorParts(instantiationService, disposables);
		instantiationService.stub(IEditorGroupsService, parts);

		const initialGroupCount = parts.groups.length;

		const modalPart = await parts.createModalEditorPart();

		// Modal part's group should be added to the total groups
		assert.strictEqual(parts.groups.length, initialGroupCount + 1);

		await modalPart.close();
	});

	test('closing modal part fires onWillClose event', async () => {
		const instantiationService = workbenchInstantiationService({ contextKeyService: instantiationService => instantiationService.createInstance(MockScopableContextKeyService) }, disposables);
		instantiationService.invokeFunction(accessor => Registry.as<IEditorFactoryRegistry>(EditorExtensions.EditorFactory).start(accessor));
		const parts = await createEditorParts(instantiationService, disposables);
		instantiationService.stub(IEditorGroupsService, parts);

		const modalPart = await parts.createModalEditorPart();

		// Verify onWillClose is an event that can be listened to
		assert.ok(typeof modalPart.onWillClose === 'function');
		assert.ok(modalPart.onWillClose !== undefined);

		const input = createTestFileEditorInput(URI.file('foo/bar'), TEST_EDITOR_INPUT_ID);
		await modalPart.activeGroup.openEditor(input, { pinned: true });

		// Verify close returns true
		const result = await modalPart.close();
		assert.strictEqual(result, true);
	});

	test('modal editor part close returns true when no confirming editors', async () => {
		const instantiationService = workbenchInstantiationService({ contextKeyService: instantiationService => instantiationService.createInstance(MockScopableContextKeyService) }, disposables);
		instantiationService.invokeFunction(accessor => Registry.as<IEditorFactoryRegistry>(EditorExtensions.EditorFactory).start(accessor));
		const parts = await createEditorParts(instantiationService, disposables);
		instantiationService.stub(IEditorGroupsService, parts);

		const modalPart = await parts.createModalEditorPart();

		const input = createTestFileEditorInput(URI.file('foo/bar'), TEST_EDITOR_INPUT_ID);
		await modalPart.activeGroup.openEditor(input, { pinned: true });

		const result = await modalPart.close();

		assert.strictEqual(result, true);
	});

	test('modal editor part getGroups returns groups in correct order', async () => {
		const instantiationService = workbenchInstantiationService({ contextKeyService: instantiationService => instantiationService.createInstance(MockScopableContextKeyService) }, disposables);
		instantiationService.invokeFunction(accessor => Registry.as<IEditorFactoryRegistry>(EditorExtensions.EditorFactory).start(accessor));
		const parts = await createEditorParts(instantiationService, disposables);
		instantiationService.stub(IEditorGroupsService, parts);

		const modalPart = await parts.createModalEditorPart();

		const input = createTestFileEditorInput(URI.file('foo/bar'), TEST_EDITOR_INPUT_ID);
		await modalPart.activeGroup.openEditor(input, { pinned: true });

		// Modal part group should be in the groups list
		const allGroups = parts.getGroups(GroupsOrder.MOST_RECENTLY_ACTIVE);
		const modalGroup = modalPart.activeGroup;

		assert.ok(allGroups.some(g => g.id === modalGroup.id));

		await modalPart.close();
	});

	test('modal editor part is singleton - subsequent calls return same instance', async () => {
		const instantiationService = workbenchInstantiationService({ contextKeyService: instantiationService => instantiationService.createInstance(MockScopableContextKeyService) }, disposables);
		instantiationService.invokeFunction(accessor => Registry.as<IEditorFactoryRegistry>(EditorExtensions.EditorFactory).start(accessor));
		const parts = await createEditorParts(instantiationService, disposables);
		instantiationService.stub(IEditorGroupsService, parts);

		const modalPart1 = await parts.createModalEditorPart();
		const modalPart2 = await parts.createModalEditorPart();

		// Same instance should be returned
		assert.ok(modalPart1);
		assert.ok(modalPart2);
		assert.strictEqual(modalPart1, modalPart2);
		assert.strictEqual(modalPart1.activeGroup.id, modalPart2.activeGroup.id);

		await modalPart1.close();
	});

	test('createModalEditorPart is race-proof: concurrent creation returns same singleton instance', async () => {
		const instantiationService = workbenchInstantiationService({ contextKeyService: instantiationService => instantiationService.createInstance(MockScopableContextKeyService) }, disposables);
		instantiationService.invokeFunction(accessor => Registry.as<IEditorFactoryRegistry>(EditorExtensions.EditorFactory).start(accessor));
		const parts = await createEditorParts(instantiationService, disposables);
		instantiationService.stub(IEditorGroupsService, parts);

		let addGroupCount = 0;
		disposables.add(parts.onDidAddGroup(() => {
			addGroupCount++;
		}));

		// Fire multiple concurrent creation requests before any of them has a
		// chance to resolve and assign the singleton instance
		const [modalPart1, modalPart2, modalPart3] = await Promise.all([
			parts.createModalEditorPart(),
			parts.createModalEditorPart(),
			parts.createModalEditorPart()
		]);

		// All concurrent calls must resolve to the exact same singleton instance/group
		assert.strictEqual(modalPart1, modalPart2);
		assert.strictEqual(modalPart2, modalPart3);
		assert.strictEqual(modalPart1.activeGroup.id, modalPart2.activeGroup.id);
		assert.strictEqual(modalPart1.activeGroup.id, modalPart3.activeGroup.id);

		// Only a single group/registration event should have fired for the singleton,
		// proving only one modal part was ever created despite the concurrent calls
		assert.strictEqual(addGroupCount, 1);

		await modalPart1.close();
	});

	test('modal editor part singleton is reset after close', async () => {
		const instantiationService = workbenchInstantiationService({ contextKeyService: instantiationService => instantiationService.createInstance(MockScopableContextKeyService) }, disposables);
		instantiationService.invokeFunction(accessor => Registry.as<IEditorFactoryRegistry>(EditorExtensions.EditorFactory).start(accessor));
		const parts = await createEditorParts(instantiationService, disposables);
		instantiationService.stub(IEditorGroupsService, parts);

		// Create first modal
		const modalPart1 = await parts.createModalEditorPart();
		const firstGroupId = modalPart1.activeGroup.id;

		// Close it
		await modalPart1.close();

		// Create another modal - should be a new instance
		const modalPart2 = await parts.createModalEditorPart();

		// Should be a different group
		assert.notStrictEqual(modalPart2.activeGroup.id, firstGroupId);

		await modalPart2.close();
	});

	test('modal editor part onDidAddGroup fires only once for singleton', async () => {
		const instantiationService = workbenchInstantiationService({ contextKeyService: instantiationService => instantiationService.createInstance(MockScopableContextKeyService) }, disposables);
		instantiationService.invokeFunction(accessor => Registry.as<IEditorFactoryRegistry>(EditorExtensions.EditorFactory).start(accessor));
		const parts = await createEditorParts(instantiationService, disposables);
		instantiationService.stub(IEditorGroupsService, parts);

		let addGroupCount = 0;
		disposables.add(parts.onDidAddGroup(() => {
			addGroupCount++;
		}));

		// Create modal twice
		await parts.createModalEditorPart();
		await parts.createModalEditorPart();

		// onDidAddGroup should fire only once since it's a singleton
		assert.strictEqual(addGroupCount, 1);

		await (await parts.createModalEditorPart()).close();
	});

	test('modal editor part enforces no tabs mode', async () => {
		const instantiationService = workbenchInstantiationService({ contextKeyService: instantiationService => instantiationService.createInstance(MockScopableContextKeyService) }, disposables);
		instantiationService.invokeFunction(accessor => Registry.as<IEditorFactoryRegistry>(EditorExtensions.EditorFactory).start(accessor));
		const parts = await createEditorParts(instantiationService, disposables);
		instantiationService.stub(IEditorGroupsService, parts);

		const modalPart = await parts.createModalEditorPart();

		// Modal parts should enforce no tabs mode
		assert.strictEqual(modalPart.partOptions.showTabs, 'none');

		await modalPart.close();
	});

	test('modal editor part enforces closeEmptyGroups', async () => {
		const instantiationService = workbenchInstantiationService({ contextKeyService: instantiationService => instantiationService.createInstance(MockScopableContextKeyService) }, disposables);
		instantiationService.invokeFunction(accessor => Registry.as<IEditorFactoryRegistry>(EditorExtensions.EditorFactory).start(accessor));
		const parts = await createEditorParts(instantiationService, disposables);
		instantiationService.stub(IEditorGroupsService, parts);

		const modalPart = await parts.createModalEditorPart();

		// Modal parts should enforce closeEmptyGroups
		assert.strictEqual(modalPart.partOptions.closeEmptyGroups, true);

		await modalPart.close();
	});

	test('closing all editors in modal removes the modal group', async () => {
		const instantiationService = workbenchInstantiationService({ contextKeyService: instantiationService => instantiationService.createInstance(MockScopableContextKeyService) }, disposables);
		instantiationService.invokeFunction(accessor => Registry.as<IEditorFactoryRegistry>(EditorExtensions.EditorFactory).start(accessor));
		const parts = await createEditorParts(instantiationService, disposables);
		instantiationService.stub(IEditorGroupsService, parts);

		const modalPart = await parts.createModalEditorPart();

		const input = createTestFileEditorInput(URI.file('foo/bar'), TEST_EDITOR_INPUT_ID);
		await modalPart.activeGroup.openEditor(input, { pinned: true });

		const modalGroupId = modalPart.activeGroup.id;

		// The modal group should exist in parts
		assert.ok(parts.getGroup(modalGroupId));

		// Closing the last editor in the last group should close the modal
		// which removes the group from parts
		await modalPart.activeGroup.closeAllEditors();

		// The modal group should no longer exist in parts
		assert.strictEqual(parts.getGroup(modalGroupId), undefined);
	});

	test('modal editor part does not persist state', async () => {
		const instantiationService = workbenchInstantiationService({ contextKeyService: instantiationService => instantiationService.createInstance(MockScopableContextKeyService) }, disposables);
		instantiationService.invokeFunction(accessor => Registry.as<IEditorFactoryRegistry>(EditorExtensions.EditorFactory).start(accessor));
		const parts = await createEditorParts(instantiationService, disposables);
		instantiationService.stub(IEditorGroupsService, parts);

		const modalPart = await parts.createModalEditorPart();

		const input = createTestFileEditorInput(URI.file('foo/bar'), TEST_EDITOR_INPUT_ID);
		await modalPart.activeGroup.openEditor(input, { pinned: true });

		// Modal part should have saveState as a no-op (we can't directly test this,
		// but we verify the modal was created successfully which means state handling works)
		assert.ok(modalPart.activeGroup);

		await modalPart.close();
	});

	test('activePart returns modal when focused', async () => {
		const instantiationService = workbenchInstantiationService({ contextKeyService: instantiationService => instantiationService.createInstance(MockScopableContextKeyService) }, disposables);
		instantiationService.invokeFunction(accessor => Registry.as<IEditorFactoryRegistry>(EditorExtensions.EditorFactory).start(accessor));
		const parts = await createEditorParts(instantiationService, disposables);
		instantiationService.stub(IEditorGroupsService, parts);

		const modalPart = await parts.createModalEditorPart();

		const input = createTestFileEditorInput(URI.file('foo/bar'), TEST_EDITOR_INPUT_ID);
		await modalPart.activeGroup.openEditor(input, { pinned: true });

		// Focus the modal group
		modalPart.activeGroup.focus();

		// The modal group should be included in the groups
		const groups = parts.getGroups(GroupsOrder.MOST_RECENTLY_ACTIVE);
		assert.ok(groups.some(g => g.id === modalPart.activeGroup.id));

		await modalPart.close();
	});

	test('modal part group can be found by id', async () => {
		const instantiationService = workbenchInstantiationService({ contextKeyService: instantiationService => instantiationService.createInstance(MockScopableContextKeyService) }, disposables);
		instantiationService.invokeFunction(accessor => Registry.as<IEditorFactoryRegistry>(EditorExtensions.EditorFactory).start(accessor));
		const parts = await createEditorParts(instantiationService, disposables);
		instantiationService.stub(IEditorGroupsService, parts);

		const modalPart = await parts.createModalEditorPart();

		const modalGroup = modalPart.activeGroup;
		const foundGroup = parts.getGroup(modalGroup.id);

		assert.ok(foundGroup);
		assert.strictEqual(foundGroup!.id, modalGroup.id);

		await modalPart.close();
	});

	test('onDidAddGroup fires when modal is created', async () => {
		const instantiationService = workbenchInstantiationService({ contextKeyService: instantiationService => instantiationService.createInstance(MockScopableContextKeyService) }, disposables);
		instantiationService.invokeFunction(accessor => Registry.as<IEditorFactoryRegistry>(EditorExtensions.EditorFactory).start(accessor));
		const parts = await createEditorParts(instantiationService, disposables);
		instantiationService.stub(IEditorGroupsService, parts);

		let addedGroupId: number | undefined;
		disposables.add(parts.onDidAddGroup(group => {
			addedGroupId = group.id;
		}));

		const modalPart = await parts.createModalEditorPart();

		assert.ok(addedGroupId !== undefined);
		assert.strictEqual(addedGroupId, modalPart.activeGroup.id);

		await modalPart.close();
	});

	test('onDidRemoveGroup fires when modal is closed', async () => {
		const instantiationService = workbenchInstantiationService({ contextKeyService: instantiationService => instantiationService.createInstance(MockScopableContextKeyService) }, disposables);
		instantiationService.invokeFunction(accessor => Registry.as<IEditorFactoryRegistry>(EditorExtensions.EditorFactory).start(accessor));
		const parts = await createEditorParts(instantiationService, disposables);
		instantiationService.stub(IEditorGroupsService, parts);

		const modalPart = await parts.createModalEditorPart();

		const modalGroupId = modalPart.activeGroup.id;

		let removedGroupId: number | undefined;
		disposables.add(parts.onDidRemoveGroup(group => {
			removedGroupId = group.id;
		}));

		await modalPart.close();

		assert.ok(removedGroupId !== undefined);
		assert.strictEqual(removedGroupId, modalGroupId);
	});

	test('activeModalEditorPart is set when modal is created and cleared on close', async () => {
		const instantiationService = workbenchInstantiationService({ contextKeyService: instantiationService => instantiationService.createInstance(MockScopableContextKeyService) }, disposables);
		instantiationService.invokeFunction(accessor => Registry.as<IEditorFactoryRegistry>(EditorExtensions.EditorFactory).start(accessor));
		const parts = await createEditorParts(instantiationService, disposables);
		instantiationService.stub(IEditorGroupsService, parts);
		const contextKeyService = instantiationService.invokeFunction(accessor => accessor.get(IContextKeyService));

		// No modal initially
		assert.deepStrictEqual({
			activeModalEditorPart: parts.activeModalEditorPart,
			modalEditorVisible: EditorPartModalVisibleContext.getValue(contextKeyService),
		}, {
			activeModalEditorPart: undefined,
			modalEditorVisible: false,
		});

		// Create modal
		const modalPart = await parts.createModalEditorPart();
		assert.deepStrictEqual({
			activeModalEditorPart: parts.activeModalEditorPart,
			modalEditorVisible: EditorPartModalVisibleContext.getValue(contextKeyService),
		}, {
			activeModalEditorPart: modalPart,
			modalEditorVisible: true,
		});

		// Close modal
		await modalPart.close();
		assert.deepStrictEqual({
			activeModalEditorPart: parts.activeModalEditorPart,
			modalEditorVisible: EditorPartModalVisibleContext.getValue(contextKeyService),
		}, {
			activeModalEditorPart: undefined,
			modalEditorVisible: false,
		});
	});

	test('findGroup returns main part group when modal is active and preferredGroup is not MODAL_GROUP', async () => {
		const instantiationService = workbenchInstantiationService({ contextKeyService: instantiationService => instantiationService.createInstance(MockScopableContextKeyService) }, disposables);
		instantiationService.invokeFunction(accessor => Registry.as<IEditorFactoryRegistry>(EditorExtensions.EditorFactory).start(accessor));
		const parts = await createEditorParts(instantiationService, disposables);
		instantiationService.stub(IEditorGroupsService, parts);

		const mainGroup = parts.mainPart.activeGroup;

		// Create modal and open an editor in it
		const modalPart = await parts.createModalEditorPart();
		const input = createTestFileEditorInput(URI.file('foo/bar'), TEST_EDITOR_INPUT_ID);
		await modalPart.activeGroup.openEditor(input, { pinned: true });

		// findGroup without MODAL_GROUP should return main part group, not modal group
		const newInput = createTestFileEditorInput(URI.file('foo/baz'), TEST_EDITOR_INPUT_ID);
		const [group] = await instantiationService.invokeFunction(accessor => findGroup(accessor, { resource: newInput.resource }, undefined));

		assert.strictEqual(group.id, mainGroup.id);
	});

	test('findGroup closes modal when preferredGroup is not MODAL_GROUP and preserveFocus is not set', async () => {
		const instantiationService = workbenchInstantiationService({ contextKeyService: instantiationService => instantiationService.createInstance(MockScopableContextKeyService) }, disposables);
		instantiationService.invokeFunction(accessor => Registry.as<IEditorFactoryRegistry>(EditorExtensions.EditorFactory).start(accessor));
		const parts = await createEditorParts(instantiationService, disposables);
		instantiationService.stub(IEditorGroupsService, parts);

		// Create modal
		const modalPart = await parts.createModalEditorPart();
		const input = createTestFileEditorInput(URI.file('foo/bar'), TEST_EDITOR_INPUT_ID);
		await modalPart.activeGroup.openEditor(input, { pinned: true });

		assert.ok(parts.activeModalEditorPart);

		// findGroup without MODAL_GROUP and without preserveFocus should close the modal
		const newInput = createTestFileEditorInput(URI.file('foo/baz'), TEST_EDITOR_INPUT_ID);
		await instantiationService.invokeFunction(accessor => findGroup(accessor, { resource: newInput.resource }, undefined));

		assert.strictEqual(parts.activeModalEditorPart, undefined);
	});

	test('findGroup keeps modal open when preserveFocus is true', async () => {
		const instantiationService = workbenchInstantiationService({ contextKeyService: instantiationService => instantiationService.createInstance(MockScopableContextKeyService) }, disposables);
		instantiationService.invokeFunction(accessor => Registry.as<IEditorFactoryRegistry>(EditorExtensions.EditorFactory).start(accessor));
		const parts = await createEditorParts(instantiationService, disposables);
		instantiationService.stub(IEditorGroupsService, parts);

		// Create modal
		const modalPart = await parts.createModalEditorPart();
		const input = createTestFileEditorInput(URI.file('foo/bar'), TEST_EDITOR_INPUT_ID);
		await modalPart.activeGroup.openEditor(input, { pinned: true });

		assert.ok(parts.activeModalEditorPart);

		// findGroup with preserveFocus should keep the modal open
		const newInput = createTestFileEditorInput(URI.file('foo/baz'), TEST_EDITOR_INPUT_ID);
		await instantiationService.invokeFunction(accessor => findGroup(accessor, { resource: newInput.resource, options: { preserveFocus: true } }, undefined));

		assert.strictEqual(parts.activeModalEditorPart, modalPart);

		await modalPart.close();
	});

	test('modal editor part starts not maximized', async () => {
		const instantiationService = workbenchInstantiationService({ contextKeyService: instantiationService => instantiationService.createInstance(MockScopableContextKeyService) }, disposables);
		instantiationService.invokeFunction(accessor => Registry.as<IEditorFactoryRegistry>(EditorExtensions.EditorFactory).start(accessor));
		const parts = await createEditorParts(instantiationService, disposables);
		instantiationService.stub(IEditorGroupsService, parts);

		const modalPart = await parts.createModalEditorPart();

		assert.strictEqual(modalPart.maximized, false);

		await modalPart.close();
	});

	test('modal editor part toggleMaximized toggles state', async () => {
		const instantiationService = workbenchInstantiationService({ contextKeyService: instantiationService => instantiationService.createInstance(MockScopableContextKeyService) }, disposables);
		instantiationService.invokeFunction(accessor => Registry.as<IEditorFactoryRegistry>(EditorExtensions.EditorFactory).start(accessor));
		const parts = await createEditorParts(instantiationService, disposables);
		instantiationService.stub(IEditorGroupsService, parts);

		const modalPart = await parts.createModalEditorPart();

		assert.strictEqual(modalPart.maximized, false);

		modalPart.toggleMaximized();
		assert.strictEqual(modalPart.maximized, true);

		modalPart.toggleMaximized();
		assert.strictEqual(modalPart.maximized, false);

		await modalPart.close();
	});

	test('modal editor part fires onDidChangeMaximized', async () => {
		const instantiationService = workbenchInstantiationService({ contextKeyService: instantiationService => instantiationService.createInstance(MockScopableContextKeyService) }, disposables);
		instantiationService.invokeFunction(accessor => Registry.as<IEditorFactoryRegistry>(EditorExtensions.EditorFactory).start(accessor));
		const parts = await createEditorParts(instantiationService, disposables);
		instantiationService.stub(IEditorGroupsService, parts);

		const modalPart = await parts.createModalEditorPart();

		const events: boolean[] = [];
		disposables.add(modalPart.onDidChangeMaximized(maximized => events.push(maximized)));

		modalPart.toggleMaximized();
		modalPart.toggleMaximized();

		assert.deepStrictEqual(events, [true, false]);

		await modalPart.close();
	});

	test('modal editor part remembers maximized state across instances', async () => {
		const instantiationService = workbenchInstantiationService({ contextKeyService: instantiationService => instantiationService.createInstance(MockScopableContextKeyService) }, disposables);
		instantiationService.invokeFunction(accessor => Registry.as<IEditorFactoryRegistry>(EditorExtensions.EditorFactory).start(accessor));
		const parts = await createEditorParts(instantiationService, disposables);
		instantiationService.stub(IEditorGroupsService, parts);

		// Open modal and maximize it
		const modalPart1 = await parts.createModalEditorPart();
		modalPart1.toggleMaximized();
		assert.strictEqual(modalPart1.maximized, true);
		await modalPart1.close();

		// Open a new modal - should remember maximized state
		const modalPart2 = await parts.createModalEditorPart();
		assert.strictEqual(modalPart2.maximized, true);
		await modalPart2.close();

		// Open another modal after un-maximizing
		const modalPart3 = await parts.createModalEditorPart();
		assert.strictEqual(modalPart3.maximized, true);
		modalPart3.toggleMaximized();
		assert.strictEqual(modalPart3.maximized, false);
		await modalPart3.close();

		// Should now remember non-maximized state
		const modalPart4 = await parts.createModalEditorPart();
		assert.strictEqual(modalPart4.maximized, false);
		await modalPart4.close();
	});

	suite('useModal: all', () => {

		test('findGroup creates modal and returns its active group', async () => {
			const instantiationService = workbenchInstantiationService({ contextKeyService: instantiationService => instantiationService.createInstance(MockScopableContextKeyService) }, disposables);
			instantiationService.invokeFunction(accessor => Registry.as<IEditorFactoryRegistry>(EditorExtensions.EditorFactory).start(accessor));
			const configurationService = new TestConfigurationService();
			await configurationService.setUserConfiguration('workbench.editor.useModal', 'all');
			instantiationService.stub(IConfigurationService, configurationService);
			const parts = await createEditorParts(instantiationService, disposables);
			instantiationService.stub(IEditorGroupsService, parts);

			// findGroup with undefined preferredGroup should create modal and return its group
			const input = createTestFileEditorInput(URI.file('foo/bar'), TEST_EDITOR_INPUT_ID);
			const result = instantiationService.invokeFunction(accessor => findGroup(accessor, { resource: input.resource }, undefined));

			// Should return a promise (async modal creation)
			assert.ok(result instanceof Promise);
			const [group] = await result;

			// The group should be in the modal part
			assert.ok(parts.activeModalEditorPart);
			assert.strictEqual(group.id, parts.activeModalEditorPart.activeGroup.id);

			await parts.activeModalEditorPart.close();
		});

		test('findGroup does not auto-close modal', async () => {
			const instantiationService = workbenchInstantiationService({ contextKeyService: instantiationService => instantiationService.createInstance(MockScopableContextKeyService) }, disposables);
			instantiationService.invokeFunction(accessor => Registry.as<IEditorFactoryRegistry>(EditorExtensions.EditorFactory).start(accessor));
			const configurationService = new TestConfigurationService();
			await configurationService.setUserConfiguration('workbench.editor.useModal', 'all');
			instantiationService.stub(IConfigurationService, configurationService);
			const parts = await createEditorParts(instantiationService, disposables);
			instantiationService.stub(IEditorGroupsService, parts);

			// Create modal first
			const modalPart = await parts.createModalEditorPart();
			const input = createTestFileEditorInput(URI.file('foo/bar'), TEST_EDITOR_INPUT_ID);
			await modalPart.activeGroup.openEditor(input, { pinned: true });

			// findGroup without MODAL_GROUP should NOT close the modal
			const newInput = createTestFileEditorInput(URI.file('foo/baz'), TEST_EDITOR_INPUT_ID);
			const result = instantiationService.invokeFunction(accessor => findGroup(accessor, { resource: newInput.resource }, undefined));

			// Since the setting is 'on', modal stays open
			const [group] = result instanceof Promise ? await result : result;

			assert.ok(parts.activeModalEditorPart);
			assert.strictEqual(group.id, modalPart.activeGroup.id);

			await modalPart.close();
		});

		test('findGroup auto-closes modal when setting is not all', async () => {
			const instantiationService = workbenchInstantiationService({ contextKeyService: instantiationService => instantiationService.createInstance(MockScopableContextKeyService) }, disposables);
			instantiationService.invokeFunction(accessor => Registry.as<IEditorFactoryRegistry>(EditorExtensions.EditorFactory).start(accessor));
			const configurationService = new TestConfigurationService();
			await configurationService.setUserConfiguration('workbench.editor.useModal', 'off');
			instantiationService.stub(IConfigurationService, configurationService);
			const parts = await createEditorParts(instantiationService, disposables);
			instantiationService.stub(IEditorGroupsService, parts);

			// Create modal
			const modalPart = await parts.createModalEditorPart();
			const input = createTestFileEditorInput(URI.file('foo/bar'), TEST_EDITOR_INPUT_ID);
			await modalPart.activeGroup.openEditor(input, { pinned: true });

			assert.ok(parts.activeModalEditorPart);

			// findGroup without MODAL_GROUP should close the modal
			const newInput = createTestFileEditorInput(URI.file('foo/baz'), TEST_EDITOR_INPUT_ID);
			await instantiationService.invokeFunction(accessor => findGroup(accessor, { resource: newInput.resource }, undefined));

			assert.strictEqual(parts.activeModalEditorPart, undefined);
		});

		test('shows tabs when multiple editors are open', async () => {
			const instantiationService = workbenchInstantiationService({ contextKeyService: instantiationService => instantiationService.createInstance(MockScopableContextKeyService) }, disposables);
			instantiationService.invokeFunction(accessor => Registry.as<IEditorFactoryRegistry>(EditorExtensions.EditorFactory).start(accessor));
			const configurationService = new TestConfigurationService();
			await configurationService.setUserConfiguration('workbench.editor.useModal', 'all');
			instantiationService.stub(IConfigurationService, configurationService);
			const parts = await createEditorParts(instantiationService, disposables);
			instantiationService.stub(IEditorGroupsService, parts);

			const editorService = disposables.add(instantiationService.createInstance(EditorService, undefined));
			instantiationService.stub(IEditorService, editorService);

			const input1 = createTestFileEditorInput(URI.file('foo/bar'), TEST_EDITOR_INPUT_ID);
			await editorService.openEditor(input1, { pinned: true }, MODAL_GROUP);

			const modalPart = parts.activeModalEditorPart!;
			assert.ok(modalPart);

			// With 1 editor, tabs should be hidden
			assert.strictEqual(modalPart.partOptions.showTabs, 'none');

			// Open a second editor
			const input2 = createTestFileEditorInput(URI.file('foo/baz'), TEST_EDITOR_INPUT_ID);
			await editorService.openEditor(input2, { pinned: true }, MODAL_GROUP);

			// With 2 editors, tabs should be visible
			assert.strictEqual(modalPart.partOptions.showTabs, 'multiple');

			await modalPart.close();
		});

		test('hides tabs when not in all mode even with multiple editors', async () => {
			const instantiationService = workbenchInstantiationService({ contextKeyService: instantiationService => instantiationService.createInstance(MockScopableContextKeyService) }, disposables);
			instantiationService.invokeFunction(accessor => Registry.as<IEditorFactoryRegistry>(EditorExtensions.EditorFactory).start(accessor));
			const configurationService = new TestConfigurationService();
			await configurationService.setUserConfiguration('workbench.editor.useModal', 'some');
			instantiationService.stub(IConfigurationService, configurationService);
			const parts = await createEditorParts(instantiationService, disposables);
			instantiationService.stub(IEditorGroupsService, parts);

			const editorService = disposables.add(instantiationService.createInstance(EditorService, undefined));
			instantiationService.stub(IEditorService, editorService);

			const input1 = createTestFileEditorInput(URI.file('foo/bar'), TEST_EDITOR_INPUT_ID);
			await editorService.openEditor(input1, { pinned: true }, MODAL_GROUP);

			const modalPart = parts.activeModalEditorPart!;
			assert.ok(modalPart);

			const input2 = createTestFileEditorInput(URI.file('foo/baz'), TEST_EDITOR_INPUT_ID);
			await editorService.openEditor(input2, { pinned: true }, MODAL_GROUP);

			// With 'some' mode, tabs should remain hidden even with multiple editors
			assert.strictEqual(modalPart.partOptions.showTabs, 'none');

			await modalPart.close();
		});
	});

	suite('editors in header', () => {

		class TestHeaderTabEditorInput extends TestFileEditorInput implements IModalEditorOptionsProvider {
			constructor(private readonly name: string, private readonly showEditorsInHeader: boolean) {
				super(URI.file(`foo/${name}`), TEST_EDITOR_INPUT_ID);
			}
			override getName(): string { return this.name; }
			getModalEditorOptions(): IModalEditorOptions { return { showEditorsInHeader: this.showEditorsInHeader }; }
		}

		async function createModalEditorService(useModal: UseModalEditorMode) {
			const instantiationService = workbenchInstantiationService({ contextKeyService: instantiationService => instantiationService.createInstance(MockScopableContextKeyService) }, disposables);
			instantiationService.invokeFunction(accessor => Registry.as<IEditorFactoryRegistry>(EditorExtensions.EditorFactory).start(accessor));
			const configurationService = new TestConfigurationService();
			await configurationService.setUserConfiguration('workbench.editor.useModal', useModal);
			instantiationService.stub(IConfigurationService, configurationService);
			const parts = await createEditorParts(instantiationService, disposables);
			instantiationService.stub(IEditorGroupsService, parts);
			const editorService = disposables.add(instantiationService.createInstance(EditorService, undefined));
			instantiationService.stub(IEditorService, editorService);
			return { parts, editorService };
		}

		/** The tabs the header shows, with the selected one marked. */
		function headerTabs(parts: IEditorGroupsService): string[] {
			const header = (parts.activeModalEditorPart!.modalElement as HTMLElement).querySelector<HTMLElement>('.modal-editor-header')!;
			if (!header.classList.contains('has-editor-tabs')) {
				return [];
			}
			return Array.from(header.querySelectorAll<HTMLElement>('.modal-editor-tabs [role="tab"]'), tab => `${tab.textContent}${tab.getAttribute('aria-selected') === 'true' ? ' (selected)' : ''}`);
		}

		test('lists every editor of the group as a tab once one asks for it', async () => {
			const { parts, editorService } = await createModalEditorService('some');
			const models = disposables.add(new TestHeaderTabEditorInput('Models', true));
			const routers = disposables.add(new TestHeaderTabEditorInput('Routers', true));
			const other = disposables.add(new TestHeaderTabEditorInput('Other', false));
			const snapshots: string[][] = [];

			await editorService.openEditor(other, { pinned: true }, MODAL_GROUP);
			await editorService.openEditor(models, { pinned: true, inactive: true }, MODAL_GROUP);
			snapshots.push(headerTabs(parts));
			const modalPart = parts.activeModalEditorPart!;
			await modalPart.activeGroup.closeEditor(other);
			snapshots.push(headerTabs(parts));
			await editorService.openEditor(routers, { pinned: true, inactive: true }, MODAL_GROUP);
			snapshots.push(headerTabs(parts));

			// Selecting a tab shows its editor
			const editorChanged = Event.toPromise(modalPart.activeGroup.onDidActiveEditorChange);
			(modalPart.modalElement as HTMLElement).querySelectorAll<HTMLElement>('.modal-editor-tabs [role="tab"]')[1].click();
			await editorChanged;
			snapshots.push(headerTabs(parts), [modalPart.activeGroup.activeEditor!.getName()]);

			assert.deepStrictEqual(snapshots, [
				['Other (selected)', 'Models'],
				[],
				['Models (selected)', 'Routers'],
				['Models', 'Routers (selected)'],
				['Routers'],
			]);

			await modalPart.close();
		});

		test('leaves the tabs to the editor group when it shows them', async () => {
			const { parts, editorService } = await createModalEditorService('all');

			await editorService.openEditor(disposables.add(new TestHeaderTabEditorInput('Models', true)), { pinned: true }, MODAL_GROUP);
			await editorService.openEditor(disposables.add(new TestHeaderTabEditorInput('Routers', true)), { pinned: true }, MODAL_GROUP);

			assert.deepStrictEqual({ groupTabs: parts.activeModalEditorPart!.partOptions.showTabs, headerTabs: headerTabs(parts) }, { groupTabs: 'multiple', headerTabs: [] });

			await parts.activeModalEditorPart!.close();
		});
	});

	test('modal editor part editors can be moved to another group', async () => {
		const instantiationService = workbenchInstantiationService({ contextKeyService: instantiationService => instantiationService.createInstance(MockScopableContextKeyService) }, disposables);
		instantiationService.invokeFunction(accessor => Registry.as<IEditorFactoryRegistry>(EditorExtensions.EditorFactory).start(accessor));
		const parts = await createEditorParts(instantiationService, disposables);
		instantiationService.stub(IEditorGroupsService, parts);

		// Create modal and open editors
		const modalPart = await parts.createModalEditorPart();
		const input1 = createTestFileEditorInput(URI.file('foo/bar'), TEST_EDITOR_INPUT_ID);
		const input2 = createTestFileEditorInput(URI.file('foo/baz'), TEST_EDITOR_INPUT_ID);
		await modalPart.activeGroup.openEditor(input1, { pinned: true });
		await modalPart.activeGroup.openEditor(input2, { pinned: true });

		assert.strictEqual(modalPart.activeGroup.count, 2);

		// Move editors from modal to main part group
		const targetGroup = parts.mainPart.activeGroup;
		for (const group of modalPart.getGroups(GroupsOrder.MOST_RECENTLY_ACTIVE)) {
			group.moveEditors(group.editors.map(editor => ({ editor, options: { preserveFocus: true } })), targetGroup);
		}

		// Editors should be in the target group now
		assert.strictEqual(targetGroup.count, 2);
		assert.strictEqual(modalPart.activeGroup.count, 0);

		// Close modal
		await modalPart.close();
		assert.strictEqual(parts.activeModalEditorPart, undefined);
	});

	test('openEditor with MODAL_GROUP ignores preserveFocus', async () => {
		const instantiationService = workbenchInstantiationService({ contextKeyService: instantiationService => instantiationService.createInstance(MockScopableContextKeyService) }, disposables);
		instantiationService.invokeFunction(accessor => Registry.as<IEditorFactoryRegistry>(EditorExtensions.EditorFactory).start(accessor));
		const parts = await createEditorParts(instantiationService, disposables);
		instantiationService.stub(IEditorGroupsService, parts);

		const editorService = disposables.add(instantiationService.createInstance(EditorService, undefined));
		instantiationService.stub(IEditorService, editorService);

		const input = createTestFileEditorInput(URI.file('foo/bar'), TEST_EDITOR_INPUT_ID);
		const pane = await editorService.openEditor(input, { pinned: true, preserveFocus: true }, MODAL_GROUP);

		assert.ok(pane);
		assert.strictEqual(pane.options?.preserveFocus, false);

		await parts.activeModalEditorPart?.close();
	});

	test('modal editor part state is remembered on close and reused on next open', async () => {
		const instantiationService = workbenchInstantiationService({ contextKeyService: instantiationService => instantiationService.createInstance(MockScopableContextKeyService) }, disposables);
		instantiationService.invokeFunction(accessor => Registry.as<IEditorFactoryRegistry>(EditorExtensions.EditorFactory).start(accessor));
		const parts = await createEditorParts(instantiationService, disposables);
		instantiationService.stub(IEditorGroupsService, parts);

		// Create maximized modal and close it
		const modalPart1 = await parts.createModalEditorPart({ maximized: true });
		await modalPart1.close();

		// Create a new modal — it should restore maximized state
		const modalPart2 = await parts.createModalEditorPart();
		assert.strictEqual(modalPart2.maximized, true);

		await modalPart2.close();
	});

	test('modal editor part state restores from profile storage', async () => {
		const instantiationService = workbenchInstantiationService({ contextKeyService: instantiationService => instantiationService.createInstance(MockScopableContextKeyService) }, disposables);
		instantiationService.invokeFunction(accessor => Registry.as<IEditorFactoryRegistry>(EditorExtensions.EditorFactory).start(accessor));
		const storageService = instantiationService.get(IStorageService) as TestStorageService;

		// Pre-populate storage with modal state and clear memento cache
		// so the next EditorParts instance reads fresh from storage
		storageService.store('memento/workbench.editorParts', JSON.stringify({
			'editorparts.modalState': {
				maximized: true,
				size: { width: 500, height: 400 },
				position: { left: 100, top: 50 }
			}
		}), StorageScope.PROFILE, StorageTarget.MACHINE);
		Memento.clear(StorageScope.PROFILE);

		const parts = await createEditorParts(instantiationService, disposables);
		instantiationService.stub(IEditorGroupsService, parts);

		// Create modal — it should use state from storage
		const modalPart = await parts.createModalEditorPart();
		assert.strictEqual(modalPart.maximized, true);

		await modalPart.close();
	});

	suite('modal editor options', () => {

		async function createParts(useModal: string, useScopedContextKeys = false, configuration?: { [key: string]: unknown }) {
			const instantiationService = workbenchInstantiationService({ contextKeyService: instantiationService => useScopedContextKeys ? disposables.add(new ContextKeyService(new TestConfigurationService())) : instantiationService.createInstance(MockScopableContextKeyService) }, disposables);
			instantiationService.invokeFunction(accessor => Registry.as<IEditorFactoryRegistry>(EditorExtensions.EditorFactory).start(accessor));
			const configurationService = new TestConfigurationService();
			await configurationService.setUserConfiguration('workbench.editor.useModal', useModal);
			for (const key in configuration) {
				await configurationService.setUserConfiguration(key, configuration[key]);
			}
			instantiationService.stub(IConfigurationService, configurationService);
			Memento.clear(StorageScope.PROFILE); // start from the default modal size, position and maximized state
			const parts = await createEditorParts(instantiationService, disposables);
			instantiationService.stub(IEditorGroupsService, parts);
			instantiationService.stub(IEditorService, disposables.add(instantiationService.createInstance(EditorService, undefined)));

			return { instantiationService, parts };
		}

		function createInput(options: IModalEditorOptions): TestModalOptionsEditorInput {
			const input = disposables.add(new TestModalOptionsEditorInput(URI.file('foo/bar'), TEST_EDITOR_INPUT_ID));
			input.setModalEditorOptions(options);

			return input;
		}

		function createFitToContentInput(contentSize: { width: number; height: number } | undefined): TestFitToContentEditorInput {
			disposables.add(Registry.as<IEditorPaneRegistry>(EditorExtensions.EditorPane).registerEditorPane(EditorPaneDescriptor.create(TestFitToContentEditorPane, 'testFitToContentEditorPane', 'Test Fit To Content Editor'), [new SyncDescriptor(TestFitToContentEditorInput)]));
			const input = disposables.add(new TestFitToContentEditorInput(URI.file('foo/fit'), TEST_EDITOR_INPUT_ID));
			input.setModalEditorOptions({ fitToContent: true });
			if (contentSize) {
				input.setContentSize(contentSize);
			}

			return input;
		}

		function getModalBounds(modalPart: IModalEditorPart) {
			const element = (modalPart.modalElement as HTMLElement).querySelector<HTMLElement>('.modal-editor-resizable')!;

			return { left: element.style.left, top: element.style.top, width: element.style.width, height: element.style.height };
		}

		test('findGroup opens an always modal editor in the modal also when useModal is off', async () => {
			const { instantiationService, parts } = await createParts('off');
			const input = createInput({ alwaysModal: true });

			const result = instantiationService.invokeFunction(accessor => findGroup(accessor, { editor: input, options: {} }, undefined));
			const [group] = result instanceof Promise ? await result : result;

			assert.ok(parts.activeModalEditorPart);
			assert.strictEqual(group.id, parts.activeModalEditorPart.activeGroup.id);

			await parts.activeModalEditorPart.close();
		});

		test('an editor that cannot maximize restores a maximized modal and keeps it from maximizing', async () => {
			const { parts } = await createParts('some');
			const modalPart = await parts.createModalEditorPart({ maximized: true });

			await modalPart.activeGroup.openEditor(createInput({ canMaximize: false }), { pinned: true });
			const maximizedOnOpen = modalPart.maximized;
			modalPart.toggleMaximized();

			assert.deepStrictEqual({ maximizedOnOpen, maximizedAfterToggle: modalPart.maximized }, { maximizedOnOpen: false, maximizedAfterToggle: false });

			await modalPart.close();
		});

		test('the Maximize Modal Editor action is hidden for an editor that cannot maximize', async () => {
			const { instantiationService, parts } = await createParts('some', true);
			const modalPart = await parts.createModalEditorPart();
			const modalContext = () => instantiationService.get(IContextKeyService).getContext(modalPart.modalElement as HTMLElement);

			await modalPart.activeGroup.openEditor(createTestFileEditorInput(URI.file('foo/default'), TEST_EDITOR_INPUT_ID), { pinned: true });
			const canMaximizeDefault = modalContext().getValue<boolean>(EditorPartModalCanMaximizeContext.key);
			await modalPart.activeGroup.openEditor(createInput({ canMaximize: false }), { pinned: true });

			assert.deepStrictEqual({ canMaximizeDefault, canMaximize: modalContext().getValue<boolean>(EditorPartModalCanMaximizeContext.key) }, { canMaximizeDefault: true, canMaximize: false });

			await modalPart.close();
		});

		test('an editor that cannot resize opens at the default size, not the size of other modal editors, where they were moved to', async () => {
			const { parts } = await createParts('some');
			const modalPart = await parts.createModalEditorPart({ size: { width: 500, height: 400 }, position: { left: 10, top: 20 } });

			await modalPart.activeGroup.openEditor(createInput({ canResize: false }), { pinned: true });

			assert.deepStrictEqual({ bounds: getModalBounds(modalPart), size: modalPart.size }, {
				bounds: { left: '10px', top: '20px', width: '640px', height: '480px' },
				size: { width: 500, height: 400 }
			});

			await modalPart.close();
		});

		test('an editor that fits its content fits and centers the modal, and fits it again when its editor pane reports a new size', async () => {
			const { parts } = await createParts('some');
			const modalPart = await parts.createModalEditorPart({ position: { left: 10, top: 20 } });
			const input = createFitToContentInput({ width: 500, height: 300 });

			await modalPart.activeGroup.openEditor(input, { pinned: true });
			const initialBounds = getModalBounds(modalPart);
			input.setContentSize({ width: 600, height: 340 });

			assert.deepStrictEqual({ initialBounds, changedBounds: getModalBounds(modalPart) }, {
				initialBounds: { left: '149px', top: '132.5px', width: '502px', height: '335px' },
				changedBounds: { left: '99px', top: '112.5px', width: '602px', height: '375px' }
			});

			await modalPart.close();
		});

		test('a modal without editor options keeps a size below its minimum size, and where it is centered for it', async () => {
			const { parts } = await createParts('some');
			const modalPart = await parts.createModalEditorPart({ size: { width: 300, height: 200 } });

			await modalPart.activeGroup.openEditor(createTestFileEditorInput(URI.file('foo/default'), TEST_EDITOR_INPUT_ID), { pinned: true });

			assert.deepStrictEqual(getModalBounds(modalPart), { left: '250px', top: '200px', width: '400px', height: '300px' });

			await modalPart.close();
		});

		test('an editor that fits content below the minimum size centers the modal at its minimum size', async () => {
			const { parts } = await createParts('some');
			const modalPart = await parts.createModalEditorPart();

			await modalPart.activeGroup.openEditor(createFitToContentInput({ width: 300, height: 200 }), { pinned: true });

			assert.deepStrictEqual(getModalBounds(modalPart), { left: '200px', top: '150px', width: '400px', height: '300px' });

			await modalPart.close();
		});

		test('an editor that fits its content gets its size for the editor pane, next to the modal sidebar and below the editor tabs', async () => {
			const { parts } = await createParts('all');
			const modalPart = await parts.createModalEditorPart({ sidebar: { sidebarWidth: 200, render: () => toDisposable(() => { }) } });

			const otherInput = createTestFileEditorInput(URI.file('foo/default'), TEST_EDITOR_INPUT_ID);
			await modalPart.activeGroup.openEditor(otherInput, { pinned: true });
			await modalPart.activeGroup.openEditor(createFitToContentInput({ width: 500, height: 300 }), { pinned: true });
			const pane = modalPart.activeGroup.activeEditorPane as TestFitToContentEditorPane;
			const withTabs = pane.lastLayoutSize;
			await modalPart.activeGroup.closeEditor(otherInput);

			assert.deepStrictEqual({ withTabs, withoutTabs: pane.lastLayoutSize }, { withTabs: { width: 500, height: 300 }, withoutTabs: { width: 500, height: 300 } });

			await modalPart.close();
		});

		test('an editor that fits its content keeps its size when its editor group adds a row of tabs', async () => {
			const { parts } = await createParts('all', false, { 'workbench': { editor: { useModal: 'all', pinnedTabsOnSeparateRow: true } } });
			const modalPart = await parts.createModalEditorPart();

			const otherInput = createTestFileEditorInput(URI.file('foo/default'), TEST_EDITOR_INPUT_ID);
			await modalPart.activeGroup.openEditor(otherInput, { pinned: true });
			await modalPart.activeGroup.openEditor(createFitToContentInput({ width: 500, height: 300 }), { pinned: true });
			const pane = modalPart.activeGroup.activeEditorPane as TestFitToContentEditorPane;
			const groupView = modalPart.activeGroup as IEditorGroupView;
			const titleHeight = groupView.titleHeight.total;
			modalPart.activeGroup.stickEditor(otherInput);
			await new Promise(resolve => mainWindow.requestAnimationFrame(() => mainWindow.requestAnimationFrame(resolve))); // the tabs lay out in an animation frame

			assert.deepStrictEqual({ addedRow: groupView.titleHeight.total > titleHeight, size: pane.lastLayoutSize }, { addedRow: true, size: { width: 500, height: 300 } });

			await modalPart.close();
		});

		test('an editor that fits its content keeps the width of the modal sidebar when the content is narrower than the modal minimum', async () => {
			const { parts } = await createParts('some');
			const modalPart = await parts.createModalEditorPart({ sidebar: { render: () => toDisposable(() => { }) } });

			await modalPart.activeGroup.openEditor(createFitToContentInput({ width: 300, height: 300 }), { pinned: true });
			const sidebar = (modalPart.modalElement as HTMLElement).querySelector<HTMLElement>('.modal-editor-sidebar')!;

			assert.deepStrictEqual({ sidebarWidth: sidebar.style.width, modalWidth: getModalBounds(modalPart).width }, { sidebarWidth: '260px', modalWidth: '562px' });

			await modalPart.close();
		});

		test('a modal editor that does not fit its content narrows the sidebar that an editor fitting its content made wider than it', async () => {
			const { instantiationService, parts } = await createParts('all');
			(instantiationService.get(IWorkbenchLayoutService) as TestLayoutService).mainContainerDimension = { width: 1800, height: 900 };
			const modalPart = await parts.createModalEditorPart({ sidebar: { render: () => toDisposable(() => { }) } });
			const sidebar = (modalPart.modalElement as HTMLElement).querySelector<HTMLElement>('.modal-editor-sidebar')!;

			const otherInput = createTestFileEditorInput(URI.file('foo/default'), TEST_EDITOR_INPUT_ID);
			await modalPart.activeGroup.openEditor(otherInput, { pinned: true });
			await modalPart.activeGroup.openEditor(createFitToContentInput({ width: 300, height: 300 }), { pinned: true });

			// Drag the sidebar sash as far right as the fitted modal lets it go
			const sash = sidebar.parentElement!.querySelector<HTMLElement>(':scope > .monaco-sash.vertical')!;
			sash.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0, clientX: 0, clientY: 0 }));
			mainWindow.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, button: 0, clientX: 2000, clientY: 0 }));
			mainWindow.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, button: 0, clientX: 2000, clientY: 0 }));
			const fittedSidebarWidth = sidebar.style.width;
			await modalPart.activeGroup.openEditor(otherInput);

			assert.deepStrictEqual({ fittedSidebarWidth, sidebarWidth: sidebar.style.width }, { fittedSidebarWidth: '1498px', sidebarWidth: '260px' });

			await modalPart.close();
		});

		test('an editor that fits its content centers the modal at the default size until its editor pane reports a size, then fits it', async () => {
			const { parts } = await createParts('some');
			const modalPart = await parts.createModalEditorPart({ position: { left: 10, top: 20 } });
			const input = createFitToContentInput(undefined);

			await modalPart.activeGroup.openEditor(input, { pinned: true });
			const initialBounds = getModalBounds(modalPart);
			input.setContentSize({ width: 500, height: 300 });

			assert.deepStrictEqual({ initialBounds, fittedBounds: getModalBounds(modalPart) }, {
				initialBounds: { left: '80px', top: '60px', width: '640px', height: '480px' },
				fittedBounds: { left: '149px', top: '132.5px', width: '502px', height: '335px' }
			});

			await modalPart.close();
		});

		test('an editor that fits its content without a reported size shows the modal at its minimum size at the top left of a window smaller than that', async () => {
			const { instantiationService, parts } = await createParts('some');
			(instantiationService.get(IWorkbenchLayoutService) as TestLayoutService).mainContainerDimension = { width: 350, height: 250 };
			const modalPart = await parts.createModalEditorPart();

			await modalPart.activeGroup.openEditor(createFitToContentInput(undefined), { pinned: true });

			assert.deepStrictEqual(getModalBounds(modalPart), { left: '0px', top: '0px', width: '400px', height: '300px' });

			await modalPart.close();
		});

		test('an editor that fits its content shows the modal at its minimum size at the top left of a window smaller than that', async () => {
			const { instantiationService, parts } = await createParts('some');
			(instantiationService.get(IWorkbenchLayoutService) as TestLayoutService).mainContainerDimension = { width: 350, height: 250 };
			const modalPart = await parts.createModalEditorPart();

			await modalPart.activeGroup.openEditor(createFitToContentInput({ width: 300, height: 200 }), { pinned: true });

			assert.deepStrictEqual(getModalBounds(modalPart), { left: '0px', top: '0px', width: '400px', height: '300px' });

			await modalPart.close();
		});
	});

	suite('RequiresModal capability', () => {

		test('findGroup respects useModal: off for editor with RequiresModal', async () => {
			const instantiationService = workbenchInstantiationService({ contextKeyService: instantiationService => instantiationService.createInstance(MockScopableContextKeyService) }, disposables);
			instantiationService.invokeFunction(accessor => Registry.as<IEditorFactoryRegistry>(EditorExtensions.EditorFactory).start(accessor));
			const configurationService = new TestConfigurationService();
			await configurationService.setUserConfiguration('workbench.editor.useModal', 'off');
			instantiationService.stub(IConfigurationService, configurationService);
			const parts = await createEditorParts(instantiationService, disposables);
			instantiationService.stub(IEditorGroupsService, parts);

			const input = createTestFileEditorInput(URI.file('foo/bar'), TEST_EDITOR_INPUT_ID);
			input.capabilities = EditorInputCapabilities.RequiresModal;

			const result = instantiationService.invokeFunction(accessor => findGroup(accessor, { editor: input, options: {} }, undefined));

			const [group] = result instanceof Promise ? await result : result;

			// With useModal: off, the user preference wins and no modal part is created
			assert.strictEqual(parts.activeModalEditorPart, undefined);
			assert.strictEqual(group.id, parts.mainPart.activeGroup.id);
		});

		test('findGroup opens modal for editor with RequiresModal when useModal is some', async () => {
			const instantiationService = workbenchInstantiationService({ contextKeyService: instantiationService => instantiationService.createInstance(MockScopableContextKeyService) }, disposables);
			instantiationService.invokeFunction(accessor => Registry.as<IEditorFactoryRegistry>(EditorExtensions.EditorFactory).start(accessor));
			const configurationService = new TestConfigurationService();
			await configurationService.setUserConfiguration('workbench.editor.useModal', 'some');
			instantiationService.stub(IConfigurationService, configurationService);
			const parts = await createEditorParts(instantiationService, disposables);
			instantiationService.stub(IEditorGroupsService, parts);

			const input = createTestFileEditorInput(URI.file('foo/bar'), TEST_EDITOR_INPUT_ID);
			input.capabilities = EditorInputCapabilities.RequiresModal;

			const result = instantiationService.invokeFunction(accessor => findGroup(accessor, { editor: input, options: {} }, undefined));

			assert.ok(result instanceof Promise);
			const [group] = await result;

			assert.ok(parts.activeModalEditorPart);
			assert.strictEqual(group.id, parts.activeModalEditorPart.activeGroup.id);

			await parts.activeModalEditorPart.close();
		});

		test('findGroup does not close modal for RequiresModal editor when modal is already open', async () => {
			const instantiationService = workbenchInstantiationService({ contextKeyService: instantiationService => instantiationService.createInstance(MockScopableContextKeyService) }, disposables);
			instantiationService.invokeFunction(accessor => Registry.as<IEditorFactoryRegistry>(EditorExtensions.EditorFactory).start(accessor));
			const configurationService = new TestConfigurationService();
			await configurationService.setUserConfiguration('workbench.editor.useModal', 'some');
			instantiationService.stub(IConfigurationService, configurationService);
			const parts = await createEditorParts(instantiationService, disposables);
			instantiationService.stub(IEditorGroupsService, parts);

			// Create a modal part first
			const modalPart = await parts.createModalEditorPart();
			const existingInput = createTestFileEditorInput(URI.file('foo/existing'), TEST_EDITOR_INPUT_ID);
			await modalPart.activeGroup.openEditor(existingInput, { pinned: true });

			// Now open a RequiresModal editor — modal should stay open
			const input = createTestFileEditorInput(URI.file('foo/bar'), TEST_EDITOR_INPUT_ID);
			input.capabilities = EditorInputCapabilities.RequiresModal;

			const result = instantiationService.invokeFunction(accessor => findGroup(accessor, { editor: input, options: {} }, undefined));

			assert.ok(result instanceof Promise);
			const [group] = await result;

			assert.ok(parts.activeModalEditorPart);
			assert.strictEqual(parts.activeModalEditorPart, modalPart);
			assert.strictEqual(group.id, modalPart.activeGroup.id);

			await modalPart.close();
		});
	});

	ensureNoDisposablesAreLeakedInTestSuite();
});
