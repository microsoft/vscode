/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import sinon from 'sinon';
import type * as vscode from 'vscode';
import { DeferredPromise, timeout } from '../../../../base/common/async.js';
import { VSBuffer } from '../../../../base/common/buffer.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { CancellationError, errorHandler, setUnexpectedErrorHandler } from '../../../../base/common/errors.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable, DisposableStore } from '../../../../base/common/lifecycle.js';
import { URI, UriComponents } from '../../../../base/common/uri.js';
import { mock } from '../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { IFileDialogService } from '../../../../platform/dialogs/common/dialogs.js';
import { ExtensionIdentifier } from '../../../../platform/extensions/common/extensions.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { TestInstantiationService } from '../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ILabelService } from '../../../../platform/label/common/label.js';
import { InMemoryStorageService, IStorageService } from '../../../../platform/storage/common/storage.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { TestThemeService } from '../../../../platform/theme/test/common/testThemeService.js';
import { IUndoRedoService } from '../../../../platform/undoRedo/common/undoRedo.js';
import { IUriIdentityService } from '../../../../platform/uriIdentity/common/uriIdentity.js';
import { createTextModel } from '../../../../editor/test/common/testTextModel.js';
import { IResolvedTextEditorModel, ITextModelService } from '../../../../editor/common/services/resolverService.js';
import { CustomEditorDiffInput } from '../../../contrib/customEditor/browser/customEditorDiffInput.js';
import { CustomEditorInput } from '../../../contrib/customEditor/browser/customEditorInput.js';
import { CustomDocumentBackupData } from '../../../contrib/customEditor/browser/customEditorInputFactory.js';
import { ICustomEditorService } from '../../../contrib/customEditor/common/customEditor.js';
import { CustomEditorModelManager } from '../../../contrib/customEditor/common/customEditorModelManager.js';
import { IOverlayWebview, WebviewContentOptions, WebviewExtensionDescription, WebviewOptions } from '../../../contrib/webview/browser/webview.js';
import { WebviewInput } from '../../../contrib/webviewPanel/browser/webviewEditorInput.js';
import { IWebviewWorkbenchService } from '../../../contrib/webviewPanel/browser/webviewWorkbenchService.js';
import { ICustomEditorLabelService } from '../../../services/editor/common/customEditorLabelService.js';
import { IEditorGroup, IEditorGroupsService } from '../../../services/editor/common/editorGroupsService.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { IWorkbenchEnvironmentService } from '../../../services/environment/common/environmentService.js';
import { IExtensionService, nullExtensionDescription } from '../../../services/extensions/common/extensions.js';
import { IFilesConfigurationService } from '../../../services/filesConfiguration/common/filesConfigurationService.js';
import { IWorkbenchLayoutService } from '../../../services/layout/browser/layoutService.js';
import { IPathService } from '../../../services/path/common/pathService.js';
import { IOutlineService } from '../../../services/outline/browser/outline.js';
import { ITextFileEditorModelManager, ITextFileService } from '../../../services/textfile/common/textfiles.js';
import { IUntitledTextEditorService } from '../../../services/untitled/common/untitledTextEditorService.js';
import { IWorkingCopyFileService } from '../../../services/workingCopy/common/workingCopyFileService.js';
import { IWorkingCopyService } from '../../../services/workingCopy/common/workingCopyService.js';
import { BrowserWorkingCopyBackupTracker } from '../../../services/workingCopy/browser/workingCopyBackupTracker.js';
import { MainThreadCustomEditors } from '../../browser/mainThreadCustomEditors.js';
import { MainThreadWebviewPanels } from '../../browser/mainThreadWebviewPanels.js';
import { MainThreadWebviews } from '../../browser/mainThreadWebviews.js';
import { CustomEditorProviderCapabilities, ExtHostCustomEditorsShape, MainThreadCustomEditorsShape } from '../../common/extHost.protocol.js';
import { ExtHostCustomEditors } from '../../common/extHostCustomEditors.js';
import { ExtHostDocuments } from '../../common/extHostDocuments.js';
import { IExtensionStoragePaths } from '../../common/extHostStoragePaths.js';
import { ExtHostWebview, ExtHostWebviews } from '../../common/extHostWebview.js';
import { ExtHostWebviewPanels } from '../../common/extHostWebviewPanels.js';
import { SingleProxyRPCProtocol } from '../common/testRPCProtocol.js';
import { WebviewEditor } from '../../../contrib/webviewPanel/browser/webviewEditor.js';
import { InMemoryTestWorkingCopyBackupService, workbenchInstantiationService } from '../../../test/browser/workbenchTestServices.js';
import { Selection } from '../../../../editor/common/core/selection.js';
import { TextEditorSelectionRevealType } from '../../../../platform/editor/common/editor.js';

type WebviewResolver = Parameters<IWebviewWorkbenchService['registerResolver']>[0];

suite('MainThreadCustomEditors', () => {

	const store = ensureNoDisposablesAreLeakedInTestSuite();

	const viewType = 'test.customEditor';
	const resource = URI.file('/workspace/file.custom');

	let unexpectedErrors: string[];
	let originalUnexpectedErrorHandler: (error: Error) => void;

	setup(() => {
		unexpectedErrors = [];
		originalUnexpectedErrorHandler = errorHandler.getUnexpectedErrorHandler();
		setUnexpectedErrorHandler(error => unexpectedErrors.push(error.message));
	});

	teardown(() => {
		sinon.restore();
		setUnexpectedErrorHandler(originalUnexpectedErrorHandler);
	});

	/**
	 * Creates custom editor inputs backed by the supplied extension host or a fake.
	 */
	function createCustomEditors(extHost: {
		createCustomDocument?: (request: { readonly path: string; readonly attempt: number; readonly token: CancellationToken }) => Promise<{ editable: boolean }>;
		resolveCustomEditor?: () => Promise<void>;
		capabilities?: CustomEditorProviderCapabilities;
		textEditor?: boolean;
		resolveNavigation?: (handle: string, token: CancellationToken) => Promise<{ selection: undefined } | undefined>;
		extensionHost?: ExtHostCustomEditorsShape;
		workingCopyService?: IWorkingCopyService;
	}) {
		const calls: string[] = [];
		const handles: string[] = [];
		const handleName = (handle: string) => `webview#${handles.indexOf(handle) + 1}`;

		const createAttempts = new Map<string, number>();
		const proxy = new class extends mock<ExtHostCustomEditorsShape>() {
			override $createCustomDocument(resource: UriComponents, _viewType: string, _backupId: string | undefined, _untitledDocumentData: VSBuffer | undefined, token: CancellationToken) {
				const path = URI.revive(resource).path;
				const attempt = (createAttempts.get(path) ?? 0) + 1;
				createAttempts.set(path, attempt);
				calls.push(`$createCustomDocument(${path})`);
				return extHost.createCustomDocument?.({ path, attempt, token }) ?? Promise.resolve({ editable: false });
			}

			override async $disposeCustomDocument(resource: UriComponents) {
				calls.push(`$disposeCustomDocument(${URI.revive(resource).path})`);
			}

			override $resolveCustomEditor(resource: UriComponents, handle: string) {
				calls.push(`$resolveCustomEditor(${URI.revive(resource).path}, ${handleName(handle)})`);
				return extHost.resolveCustomEditor?.() ?? Promise.resolve();
			}

			override async $resolveCustomEditorInlineDiff(originalResource: UriComponents, modifiedResource: UriComponents, handle: string) {
				calls.push(`$resolveCustomEditorInlineDiff(${URI.revive(originalResource).path}, ${URI.revive(modifiedResource).path}, ${handleName(handle)})`);
			}

			override async $resolveCustomTextEditorNavigation(handle: string, _viewType: string, _resource: UriComponents, token: CancellationToken) {
				calls.push(`resolveNavigation(${handleName(handle)})`);
				return extHost.resolveNavigation ? extHost.resolveNavigation(handle, token) : { selection: undefined };
			}

			override $disposeCustomTextEditorNavigation(handle: string): void {
				calls.push(`disposeNavigation(${handleName(handle)})`);
			}
		};

		const webviewInputs = new Map<string, WebviewInput>();
		const mainThreadWebviewPanels = new class extends mock<MainThreadWebviewPanels>() {
			override get webviewInputs(): Iterable<WebviewInput> {
				return webviewInputs.values();
			}

			override addWebviewInput(handle: string, input: WebviewInput) {
				handles.push(handle);
				webviewInputs.set(handle, input);
				store.add(Event.once(input.onWillDispose)(() => webviewInputs.delete(handle)));
				calls.push(`addWebviewInput(${handleName(handle)})`);
			}
		};

		const mainThreadWebviews = new class extends mock<MainThreadWebviews>() {
			override getWebviewResolvedFailedContent(viewType: string) {
				return `failed to load ${viewType}`;
			}
		};

		const resolvers: WebviewResolver[] = [];
		const webviewWorkbenchService = new class extends mock<IWebviewWorkbenchService>() {
			override registerResolver(resolver: WebviewResolver) {
				resolvers.push(resolver);
				return Disposable.None;
			}

			override async resolveWebview(webview: WebviewInput, token: CancellationToken) {
				await resolvers.find(resolver => resolver.canResolve(webview))?.resolveWebview(webview, token);
			}
		};

		const models = new CustomEditorModelManager();
		const instantiationService = store.add(new TestInstantiationService());
		instantiationService.stub(ICustomEditorService, new class extends mock<ICustomEditorService>() {
			override readonly models = models;
			override registerCustomEditorCapabilities() { return Disposable.None; }
			override getCustomEditorCapabilities() { return undefined; }
		});
		instantiationService.stub(IWebviewWorkbenchService, webviewWorkbenchService);
		instantiationService.stub(IExtensionService, { activateByEvent: async () => { }, onWillStop: Event.None });
		instantiationService.stub(IStorageService, store.add(new InMemoryStorageService()));
		instantiationService.stub(IWorkingCopyService, extHost.workingCopyService ?? { workingCopies: [] });
		instantiationService.stub(IWorkingCopyFileService, { registerWorkingCopyProvider: () => Disposable.None, onWillRunWorkingCopyFileOperation: Event.None });
		const group = new class extends mock<IEditorGroup>() { override id = 0; };
		instantiationService.stub(IEditorGroupsService, { getGroup: () => group, getGroups: () => [group] });
		instantiationService.stub(IEditorService, { activeEditor: undefined });
		instantiationService.stub(IUriIdentityService, { asCanonicalUri: (uri: URI) => uri });
		instantiationService.stub(IUntitledTextEditorService, { get: () => undefined });
		instantiationService.stub(IFileService, { onDidFilesChange: Event.None, onDidChangeFileSystemProviderRegistrations: Event.None, onDidChangeFileSystemProviderCapabilities: Event.None });
		instantiationService.stub(ILabelService, { onDidChangeFormatters: Event.None, getUriLabel: (uri: URI) => uri.path });
		instantiationService.stub(IThemeService, new TestThemeService());
		instantiationService.stub(IFilesConfigurationService, { onDidChangeReadonly: Event.None, isReadonly: () => false });
		instantiationService.stub(ICustomEditorLabelService, { onDidChange: Event.None, getName: () => undefined });
		instantiationService.stub(IFileDialogService, {});
		instantiationService.stub(IUndoRedoService, { removeElements: () => { } });
		instantiationService.stub(IWorkbenchEnvironmentService, {});
		instantiationService.stub(IPathService, {});
		instantiationService.stub(IWorkbenchLayoutService, {});
		let outlineChanges = 0;
		instantiationService.stub(IOutlineService, { notifyOutlineChanged: () => { outlineChanges++; } });
		if (extHost.textEditor) {
			const textModel = store.add(createTextModel('text', undefined, undefined, resource));
			const resolved = new class extends mock<IResolvedTextEditorModel>() {
				override textEditorModel = textModel;
				override isReadonly() { return false; }
			};
			instantiationService.stub(ITextModelService, { createModelReference: async () => ({ object: resolved, dispose: () => { } }) });
			instantiationService.stub(ITextFileService, {
				files: new class extends mock<ITextFileEditorModelManager>() {
					override get() { return undefined; }
					override onDidChangeDirty = Event.None;
				},
				isDirty: () => false
			});
		}

		const customEditors = store.add(instantiationService.createInstance(MainThreadCustomEditors, SingleProxyRPCProtocol(extHost.extensionHost ?? proxy), mainThreadWebviews, mainThreadWebviewPanels));
		const extension = { id: new ExtensionIdentifier('test.extension'), location: URI.file('/extensions/test') };
		if (extHost.textEditor) {
			customEditors.$registerTextEditorProvider(extension, viewType, {}, extHost.capabilities ?? {}, false);
		} else if (!extHost.extensionHost) {
			customEditors.$registerCustomEditorProvider(extension, viewType, {}, extHost.capabilities ?? {}, false, false);
		}

		function createWebview() {
			const onDidDispose = new Emitter<void>();
			return new class extends mock<IOverlayWebview>() {
				html: string | undefined;
				override origin = '';
				override options: WebviewOptions = {};
				override contentOptions: WebviewContentOptions = {};
				override extension: WebviewExtensionDescription | undefined = undefined;
				override readonly onDidDispose = onDidDispose.event;

				override setHtml(html: string) {
					this.html = html;
				}

				override dispose() {
					onDidDispose.fire();
					onDidDispose.dispose();
				}
			};
		}

		function createInput() {
			const webview = createWebview();
			const input = store.add(instantiationService.createInstance(CustomEditorInput, { resource, viewType, webviewTitle: undefined, preferredName: 'file.custom', iconPath: undefined }, webview, {}));
			return { input, webview };
		}

		function createDiffInput(originalResource: URI) {
			const input = store.add(instantiationService.createInstance(CustomEditorDiffInput, { originalResource, modifiedResource: resource, viewType, label: 'file.custom', description: undefined, iconPath: undefined }, createWebview()));
			return { input };
		}

		return { calls, models, resolvers, createInput, createDiffInput, customEditors, outlineChanges: () => outlineChanges };
	}

	async function testProviderBackups(scenario: 'sequential' | 'superseded' | 'reopened' | 'savedAndReopened', providerBackupIds?: readonly [string, string]): Promise<void> {
		const cancelPrevious = scenario === 'superseded' || scenario === 'reopened';
		const reopen = scenario === 'reopened' || scenario === 'savedAndReopened';
		const registration = store.add(new DisposableStore());
		const backupService = store.add(new InMemoryTestWorkingCopyBackupService());
		const services = workbenchInstantiationService({ workingCopyBackupService: () => backupService }, store);
		const workingCopyService = services.get(IWorkingCopyService);
		const changes = store.add(new Emitter<vscode.CustomDocumentContentChangeEvent>());
		const pendingBackups = [new DeferredPromise<vscode.CustomDocumentBackup>(), new DeferredPromise<vscode.CustomDocumentBackup>()];
		const backupStarted = [new DeferredPromise<void>(), new DeferredPromise<void>()];
		const documents: vscode.CustomDocument[] = [];
		const destinations: string[] = [];
		const backupIds: string[] = [];
		const tokens: CancellationToken[] = [];
		const availableBackups = new Map<string, string>();
		const deletedBackups: string[] = [];
		let disposed = 0;
		const editors = new ExtHostCustomEditors(
			SingleProxyRPCProtocol(new class extends mock<MainThreadCustomEditorsShape>() {
				override $registerCustomEditorProvider(...args: Parameters<MainThreadCustomEditorsShape['$registerCustomEditorProvider']>): void {
					fixture.customEditors.$registerCustomEditorProvider(...args);
				}
				override $unregisterEditorProvider(): void {
					fixture.customEditors.$unregisterEditorProvider(viewType);
				}
				override $onContentChange(...args: Parameters<MainThreadCustomEditorsShape['$onContentChange']>): void {
					fixture.customEditors.$onContentChange(...args);
				}
			}),
			new class extends mock<ExtHostDocuments>() { },
			new class extends mock<IExtensionStoragePaths>() {
				override workspaceValue() { return URI.file('/test/custom-editor-backups'); }
			},
			new class extends mock<ExtHostWebviews>() {
				override createNewWebview(): ExtHostWebview { return new class extends mock<ExtHostWebview>() { }; }
				override ensureDefaultContentOptions(): void { }
			},
			new class extends mock<ExtHostWebviewPanels>() {
				override createNewWebviewPanel(): ReturnType<ExtHostWebviewPanels['createNewWebviewPanel']> {
					return new class extends mock<ReturnType<ExtHostWebviewPanels['createNewWebviewPanel']>>() { };
				}
			},
		);
		const fixture = createCustomEditors({ extensionHost: editors, workingCopyService });
		const backupCalls = sinon.spy(editors, '$backup');
		const provider: vscode.CustomEditorProvider = {
			onDidChangeCustomDocument: changes.event,
			openCustomDocument: () => {
				const document: vscode.CustomDocument = { uri: resource, dispose: () => { disposed++; } };
				documents.push(document);
				return document;
			},
			resolveCustomEditor: () => { },
			saveCustomDocument: async () => { },
			saveCustomDocumentAs: async () => { },
			revertCustomDocument: async () => { },
			backupCustomDocument: (document, context, token) => {
				const index = destinations.length;
				destinations.push(context.destination.toString());
				const id = providerBackupIds?.[index] ?? context.destination.toString();
				backupIds.push(id);
				// Write before returning so a late deletion is distinct from a stale write.
				availableBackups.set(id, `document-${documents.indexOf(document) + 1}`);
				tokens.push(token);
				backupStarted[index].complete();
				return pendingBackups[index].p;
			},
		};
		registration.add(editors.registerCustomEditorProvider(nullExtensionDescription, viewType, provider, {}));
		store.add(services.createInstance(class extends BrowserWorkingCopyBackupTracker {
			protected override getBackupScheduleDelay(): number { return 0; }
		}));
		let { input } = fixture.createInput();
		await input.resolve();

		changes.fire({ document: documents[0] });
		await backupStarted[0].p;
		if (!cancelPrevious) {
			const storedBackup = backupService.joinBackupResource();
			completeBackup(0);
			await storedBackup;
		}
		if (reopen) {
			await input.save(0);
			input.dispose();
			await timeout(0);
			input = fixture.createInput().input;
			await input.resolve();
		}
		changes.fire({ document: documents[documents.length - 1] });
		await backupStarted[1].p;

		function completeBackup(index: number): void {
			const id = backupIds[index];
			pendingBackups[index].complete({
				id,
				delete: () => {
					deletedBackups.push(id);
					availableBackups.delete(id);
				},
			});
		}

		const storedBackup = backupService.joinBackupResource();
		completeBackup(1);
		await storedBackup;
		const beforeLateCompletion = availableBackups.get(backupIds[1]);
		if (cancelPrevious) {
			completeBackup(0);
			await backupCalls.firstCall.returnValue;
		}
		const backup = await backupService.resolve<CustomDocumentBackupData>(workingCopyService.workingCopies[0]);
		const result = {
			cancelled: tokens[0].isCancellationRequested,
			distinctDestinations: destinations[0] !== destinations[1],
			backupId: backup?.meta?.backupId,
			beforeLateCompletion,
			afterLateCompletion: availableBackups.get(backupIds[1]),
			availableBackups: [...availableBackups.keys()],
			deletedBackups: [...deletedBackups],
		};

		await input.save(0);
		input.dispose();
		await timeout(0);

		assert.deepStrictEqual({ ...result, afterSave: [...availableBackups.keys()], disposed, unexpectedErrors }, {
			cancelled: cancelPrevious,
			distinctDestinations: true,
			backupId: backupIds[1],
			beforeLateCompletion: reopen ? 'document-2' : 'document-1',
			afterLateCompletion: reopen ? 'document-2' : 'document-1',
			availableBackups: [backupIds[1]],
			deletedBackups: [backupIds[0]],
			afterSave: [],
			disposed: reopen ? 2 : 1,
			unexpectedErrors: [],
		});
	}

	test('replaces a completed provider backup and deletes it after saving', () => testProviderBackups('sequential'));

	test('retains the latest backup when a cancelled provider backup finishes last', () => testProviderBackups('superseded'));

	test('a late cancelled backup cannot delete a reopened document backup', () => testProviderBackups('reopened'));

	test('preserves opaque provider backup IDs across document lifetimes', () => testProviderBackups('reopened', ['opaque backup 0: %/?#', 'opaque backup 1: %/?#']));

	test('allows a saved provider backup ID to be reused after reopening', () => testProviderBackups('savedAndReopened', ['opaque backup: %/?#', 'opaque backup: %/?#']));

	test('custom text navigation resolves only after its editor and invalidates Outline capability on disposal', async () => {
		const fixture = createCustomEditors({ createCustomDocument: async () => ({ editable: false }), textEditor: true, capabilities: { supportsNavigation: true } });
		const { input } = fixture.createInput();
		assert.strictEqual(input.navigation, undefined);
		await input.resolve();
		assert.ok(input.navigation);
		assert.strictEqual(fixture.outlineChanges(), 1);
		assert.deepStrictEqual(fixture.calls, [
			'addWebviewInput(webview#1)',
			'$resolveCustomEditor(/workspace/file.custom, webview#1)',
			'resolveNavigation(webview#1)'
		]);
		await input.applyOptions({ selection: { startLineNumber: 1, startColumn: 1 } }, CancellationToken.Cancelled);
		input.dispose();
		assert.strictEqual(input.navigation, undefined);
		assert.strictEqual(fixture.outlineChanges(), 2);
		assert.strictEqual(fixture.calls.at(-1), 'disposeNavigation(webview#1)');
		assert.deepStrictEqual(unexpectedErrors, []);
	});

	test('unregistering a text provider removes navigation from still-open panels', async () => {
		const fixture = createCustomEditors({ createCustomDocument: async () => ({ editable: false }), textEditor: true, capabilities: { supportsNavigation: true } });
		const first = fixture.createInput().input;
		const second = fixture.createInput().input;
		await first.resolve();
		await second.resolve();
		assert.notStrictEqual(first.navigation, second.navigation);
		fixture.customEditors.$unregisterEditorProvider(viewType);
		assert.strictEqual(first.navigation, undefined);
		assert.strictEqual(second.navigation, undefined);
		assert.strictEqual(fixture.outlineChanges(), 4);
		assert.deepStrictEqual(unexpectedErrors, []);
	});

	test('navigation resolution is canceled when its panel closes before completion', async () => {
		const navigationRequested = new DeferredPromise<CancellationToken>();
		const navigation = new DeferredPromise<{ selection: undefined }>();
		const fixture = createCustomEditors({
			createCustomDocument: async () => ({ editable: false }), textEditor: true, capabilities: { supportsNavigation: true },
			resolveNavigation: (_handle, token) => {
				navigationRequested.complete(token);
				return navigation.p;
			}
		});
		const { input } = fixture.createInput();
		const resolution = input.resolve();
		const pendingToken = await navigationRequested.p;
		input.dispose();
		assert.strictEqual(pendingToken.isCancellationRequested, true);
		await resolution;
		navigation.complete({ selection: undefined });
		assert.strictEqual(input.navigation, undefined);
		assert.strictEqual(fixture.outlineChanges(), 0);
		assert.deepStrictEqual(unexpectedErrors, []);
	});

	test('binary custom editors and custom text diff panels do not resolve navigation', async () => {
		const binary = createCustomEditors({ createCustomDocument: async () => ({ editable: false }), capabilities: { supportsNavigation: true } });
		const binaryInput = binary.createInput().input;
		await binaryInput.resolve();
		const text = createCustomEditors({ createCustomDocument: async () => ({ editable: false }), textEditor: true, capabilities: { supportsNavigation: true, supportsInlineDiff: true } });
		const diffInput = text.createDiffInput(URI.file('/workspace/original.custom')).input;
		await diffInput.resolve();
		assert.strictEqual(binary.calls.some(call => call.startsWith('resolveNavigation')), false);
		assert.strictEqual(text.calls.some(call => call.startsWith('resolveNavigation')), false);
		binaryInput.dispose();
		diffInput.dispose();
		await timeout(0);
	});

	test('navigation errors leave the custom panel intact without a text-editor fallback', async () => {
		const fixture = createCustomEditors({
			createCustomDocument: async () => ({ editable: false }), textEditor: true, capabilities: { supportsNavigation: true },
			resolveNavigation: async () => { throw new Error('navigation failed'); }
		});
		const { input, webview } = fixture.createInput();
		await input.resolve();
		assert.strictEqual(input.navigation, undefined);
		assert.strictEqual(webview.html, undefined);
		assert.deepStrictEqual(unexpectedErrors, ['navigation failed']);
		input.dispose();
		await timeout(0);
	});

	test('selection notifications during navigation resolution supersede its initial snapshot', async () => {
		const navigationRequested = new DeferredPromise<string>();
		const navigation = new DeferredPromise<{ selection: undefined }>();
		const fixture = createCustomEditors({
			createCustomDocument: async () => ({ editable: false }), textEditor: true, capabilities: { supportsNavigation: true },
			resolveNavigation: (handle) => {
				navigationRequested.complete(handle);
				return navigation.p;
			}
		});
		const { input } = fixture.createInput();
		const resolution = input.resolve();
		const panelHandle = await navigationRequested.p;
		const selection = { selectionStartLineNumber: 1, selectionStartColumn: 1, positionLineNumber: 1, positionColumn: 3 };
		fixture.customEditors.$onDidChangeCustomTextEditorSelection(panelHandle, selection);
		navigation.complete({ selection: undefined });
		await resolution;
		assert.strictEqual(input.navigation?.selection, selection);
		input.dispose();
		await timeout(0);
	});

	test('custom editor pane accepts missing options when switching back to an open editor', async () => {
		const fixture = createCustomEditors({
			createCustomDocument: async () => ({ editable: false }), textEditor: true, capabilities: { supportsNavigation: true },
		});
		const { input } = fixture.createInput();
		await input.resolve();
		const instantiationService = workbenchInstantiationService(undefined, store);
		const pane = store.add(instantiationService.createInstance(class extends WebviewEditor {
			override get input() { return input; }
		}, new class extends mock<IEditorGroup>() { }));

		await pane.setInput(input, undefined, {}, CancellationToken.None);
		pane.setOptions(undefined);
		await timeout(0);

		assert.deepStrictEqual({ options: pane.options, unexpectedErrors }, { options: undefined, unexpectedErrors: [] });
		input.dispose();
		await timeout(0);
	});

	test('custom editor pane exposes live navigation selections for editor type switches', async () => {
		let handle: string | undefined;
		const fixture = createCustomEditors({
			createCustomDocument: async () => ({ editable: false }), textEditor: true, capabilities: { supportsNavigation: true },
			resolveNavigation: async panelHandle => {
				handle = panelHandle;
				return { selection: undefined };
			}
		});
		const { input } = fixture.createInput();
		await input.resolve();
		const instantiationService = workbenchInstantiationService(undefined, store);
		const pane = store.add(instantiationService.createInstance(class extends WebviewEditor {
			override get input() { return input; }
		}, new class extends mock<IEditorGroup>() { }));
		const before = pane.getSelection();
		const selection = { selectionStartLineNumber: 1, selectionStartColumn: 4, positionLineNumber: 1, positionColumn: 1 };
		fixture.customEditors.$onDidChangeCustomTextEditorSelection(handle!, selection);
		const restored = pane.getSelection()?.restore({ override: 'default', pinned: true });
		fixture.customEditors.$onDidChangeCustomTextEditorSelection(handle!, undefined);
		assert.deepStrictEqual({ before, restored, after: pane.getSelection() }, {
			before: undefined,
			restored: { override: 'default', pinned: true, selection: Selection.liftSelection(selection), selectionRevealType: TextEditorSelectionRevealType.CenterIfOutsideViewport },
			after: undefined
		});
		input.dispose();
		await timeout(0);
	});

	test('creates the document before resolving the editor and disposes it with the editor', async () => {
		const customEditors = createCustomEditors({ createCustomDocument: async () => ({ editable: false }) });

		const { input } = customEditors.createInput();
		await input.resolve();
		input.dispose();
		await timeout(0);

		assert.deepStrictEqual({ calls: customEditors.calls, unexpectedErrors }, {
			calls: [
				'addWebviewInput(webview#1)',
				'$createCustomDocument(/workspace/file.custom)',
				'$resolveCustomEditor(/workspace/file.custom, webview#1)',
				'$disposeCustomDocument(/workspace/file.custom)',
			],
			unexpectedErrors: [],
		});
	});

	test('sets an error page instead of rejecting when the extension fails to resolve the editor', async () => {
		const customEditors = createCustomEditors({
			createCustomDocument: async () => ({ editable: false }),
			resolveCustomEditor: async () => { throw new Error('Could not render the editor'); },
		});

		const { input, webview } = customEditors.createInput();
		const resolver = customEditors.resolvers.find(resolver => resolver.canResolve(input))!;
		await resolver.resolveWebview(input, CancellationToken.None);
		const html = webview.html;
		input.dispose();
		await timeout(0);

		assert.deepStrictEqual({ calls: customEditors.calls, html, unexpectedErrors }, {
			calls: [
				'addWebviewInput(webview#1)',
				'$createCustomDocument(/workspace/file.custom)',
				'$resolveCustomEditor(/workspace/file.custom, webview#1)',
				'$disposeCustomDocument(/workspace/file.custom)',
			],
			html: `failed to load ${viewType}`,
			unexpectedErrors: ['Could not render the editor'],
		});
	});

	test('asks the extension again when a new editor opens a document that failed to open (#250622)', async () => {
		const customEditors = createCustomEditors({
			createCustomDocument: async ({ attempt }) => {
				if (attempt === 1) {
					throw new Error('Could not open the document');
				}
				return { editable: false };
			},
		});

		const failed = customEditors.createInput();
		await assert.rejects(failed.input.resolve(), /Could not open the document/);
		failed.input.dispose();

		const reopened = customEditors.createInput();
		await reopened.input.resolve();
		reopened.input.dispose();
		await timeout(0);

		assert.deepStrictEqual({ calls: customEditors.calls, unexpectedErrors }, {
			calls: [
				'addWebviewInput(webview#1)',
				'$createCustomDocument(/workspace/file.custom)',
				'addWebviewInput(webview#2)',
				'$createCustomDocument(/workspace/file.custom)',
				'$resolveCustomEditor(/workspace/file.custom, webview#2)',
				'$disposeCustomDocument(/workspace/file.custom)',
			],
			unexpectedErrors: [],
		});
	});

	test('asks the extension again when retrying an editor whose document failed to open (#250622)', async () => {
		const customEditors = createCustomEditors({
			createCustomDocument: async ({ attempt }) => {
				if (attempt === 1) {
					throw new Error('Could not open the document');
				}
				return { editable: false };
			},
		});

		const { input } = customEditors.createInput();
		await assert.rejects(input.resolve(), /Could not open the document/);
		await input.resolve();
		input.dispose();
		await timeout(0);

		assert.deepStrictEqual({ calls: customEditors.calls, unexpectedErrors }, {
			calls: [
				'addWebviewInput(webview#1)',
				'$createCustomDocument(/workspace/file.custom)',
				'$createCustomDocument(/workspace/file.custom)',
				'$resolveCustomEditor(/workspace/file.custom, webview#1)',
				'$disposeCustomDocument(/workspace/file.custom)',
			],
			unexpectedErrors: [],
		});
	});

	test('retries an editor whose shared document was canceled by closing another editor (#250622)', async () => {
		const customEditors = createCustomEditors({
			createCustomDocument: ({ attempt, token }) => {
				if (attempt === 1) {
					return new Promise((_resolve, reject) => {
						const listener = token.onCancellationRequested(() => {
							listener.dispose();
							reject(new CancellationError());
						});
					});
				}
				return Promise.resolve({ editable: false });
			},
		});

		const closed = customEditors.createInput();
		const remaining = customEditors.createInput();
		const resolving = [closed.input.resolve(), remaining.input.resolve()];
		await timeout(0);
		closed.input.dispose();
		const results = await Promise.allSettled(resolving);

		await remaining.input.resolve();
		remaining.input.dispose();
		await timeout(0);

		assert.deepStrictEqual({
			results: results.map(result => result.status === 'rejected' ? (result.reason as Error).message : result.status),
			calls: customEditors.calls,
			unexpectedErrors,
		}, {
			results: ['fulfilled', 'Canceled'],
			calls: [
				'addWebviewInput(webview#1)',
				'$createCustomDocument(/workspace/file.custom)',
				'addWebviewInput(webview#2)',
				'$createCustomDocument(/workspace/file.custom)',
				'$resolveCustomEditor(/workspace/file.custom, webview#2)',
				'$disposeCustomDocument(/workspace/file.custom)',
			],
			unexpectedErrors: [],
		});
	});

	test('retries an inline diff whose original document failed to open (#250622)', async () => {
		const originalResource = URI.file('/workspace/original.custom');
		const customEditors = createCustomEditors({
			capabilities: { supportsInlineDiff: true },
			createCustomDocument: async ({ path, attempt }) => {
				if (path === originalResource.path && attempt === 1) {
					throw new Error('Could not open the original document');
				}
				return { editable: false };
			},
		});

		const { input } = customEditors.createDiffInput(originalResource);
		await assert.rejects(input.resolve(), /Could not open the original document/);
		await input.resolve();
		input.dispose();
		await timeout(0);

		assert.deepStrictEqual({ calls: customEditors.calls, unexpectedErrors }, {
			calls: [
				'addWebviewInput(webview#1)',
				'$createCustomDocument(/workspace/file.custom)',
				'$createCustomDocument(/workspace/original.custom)',
				'$disposeCustomDocument(/workspace/file.custom)',
				'$createCustomDocument(/workspace/file.custom)',
				'$createCustomDocument(/workspace/original.custom)',
				'$resolveCustomEditorInlineDiff(/workspace/original.custom, /workspace/file.custom, webview#1)',
				'$disposeCustomDocument(/workspace/original.custom)',
				'$disposeCustomDocument(/workspace/file.custom)',
			],
			unexpectedErrors: [],
		});
	});
});
