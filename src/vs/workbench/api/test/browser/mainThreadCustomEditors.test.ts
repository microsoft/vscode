/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { timeout } from '../../../../base/common/async.js';
import { VSBuffer } from '../../../../base/common/buffer.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { CancellationError, errorHandler, setUnexpectedErrorHandler } from '../../../../base/common/errors.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
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
import { CustomEditorDiffInput } from '../../../contrib/customEditor/browser/customEditorDiffInput.js';
import { CustomEditorInput } from '../../../contrib/customEditor/browser/customEditorInput.js';
import { ICustomEditorService } from '../../../contrib/customEditor/common/customEditor.js';
import { CustomEditorModelManager } from '../../../contrib/customEditor/common/customEditorModelManager.js';
import { IOverlayWebview, WebviewContentOptions, WebviewExtensionDescription, WebviewOptions } from '../../../contrib/webview/browser/webview.js';
import { WebviewInput } from '../../../contrib/webviewPanel/browser/webviewEditorInput.js';
import { IWebviewWorkbenchService } from '../../../contrib/webviewPanel/browser/webviewWorkbenchService.js';
import { ICustomEditorLabelService } from '../../../services/editor/common/customEditorLabelService.js';
import { IEditorGroupsService } from '../../../services/editor/common/editorGroupsService.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { IWorkbenchEnvironmentService } from '../../../services/environment/common/environmentService.js';
import { IExtensionService } from '../../../services/extensions/common/extensions.js';
import { IFilesConfigurationService } from '../../../services/filesConfiguration/common/filesConfigurationService.js';
import { IWorkbenchLayoutService } from '../../../services/layout/browser/layoutService.js';
import { IPathService } from '../../../services/path/common/pathService.js';
import { IUntitledTextEditorService } from '../../../services/untitled/common/untitledTextEditorService.js';
import { IWorkingCopyFileService } from '../../../services/workingCopy/common/workingCopyFileService.js';
import { IWorkingCopyService } from '../../../services/workingCopy/common/workingCopyService.js';
import { MainThreadCustomEditors } from '../../browser/mainThreadCustomEditors.js';
import { MainThreadWebviewPanels } from '../../browser/mainThreadWebviewPanels.js';
import { MainThreadWebviews } from '../../browser/mainThreadWebviews.js';
import { CustomEditorProviderCapabilities, ExtHostCustomEditorsShape } from '../../common/extHost.protocol.js';
import { SingleProxyRPCProtocol } from '../common/testRPCProtocol.js';

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
		setUnexpectedErrorHandler(originalUnexpectedErrorHandler);
	});

	/**
	 * Registers a custom editor provider backed by a fake extension host and returns the calls that reach it.
	 */
	function createCustomEditors(extHost: {
		createCustomDocument: (request: { readonly path: string; readonly attempt: number; readonly token: CancellationToken }) => Promise<{ editable: boolean }>;
		resolveCustomEditor?: () => Promise<void>;
		capabilities?: CustomEditorProviderCapabilities;
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
				return extHost.createCustomDocument({ path, attempt, token });
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
		};

		const webviewInputs = new Map<string, WebviewInput>();
		const mainThreadWebviewPanels = new class extends mock<MainThreadWebviewPanels>() {
			override get webviewInputs(): Iterable<WebviewInput> {
				return webviewInputs.values();
			}

			override addWebviewInput(handle: string, input: WebviewInput) {
				handles.push(handle);
				webviewInputs.set(handle, input);
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

		const didStopExtensionHosts = store.add(new Emitter<void>());
		const models = new CustomEditorModelManager();
		const instantiationService = store.add(new TestInstantiationService());
		instantiationService.stub(ICustomEditorService, new class extends mock<ICustomEditorService>() {
			override readonly models = models;
			override registerCustomEditorCapabilities() { return Disposable.None; }
			override getCustomEditorCapabilities() { return undefined; }
		});
		instantiationService.stub(IWebviewWorkbenchService, webviewWorkbenchService);
		instantiationService.stub(IExtensionService, { activateByEvent: async () => { }, onWillStop: Event.None, onDidStop: didStopExtensionHosts.event });
		instantiationService.stub(IStorageService, store.add(new InMemoryStorageService()));
		instantiationService.stub(IWorkingCopyService, { workingCopies: [], registerWorkingCopy: () => Disposable.None });
		instantiationService.stub(IWorkingCopyFileService, { registerWorkingCopyProvider: () => Disposable.None, onWillRunWorkingCopyFileOperation: Event.None });
		instantiationService.stub(IEditorGroupsService, { getGroup: () => undefined, getGroups: () => [] });
		instantiationService.stub(IEditorService, { activeEditor: undefined });
		instantiationService.stub(IUriIdentityService, { asCanonicalUri: (uri: URI) => uri });
		instantiationService.stub(IUntitledTextEditorService, { get: () => undefined });
		instantiationService.stub(IFileService, { onDidFilesChange: Event.None, onDidChangeFileSystemProviderRegistrations: Event.None, onDidChangeFileSystemProviderCapabilities: Event.None });
		instantiationService.stub(ILabelService, { onDidChangeFormatters: Event.None, getUriLabel: (uri: URI) => uri.path });
		instantiationService.stub(IThemeService, new TestThemeService());
		instantiationService.stub(IFilesConfigurationService, { onDidChangeReadonly: Event.None, isReadonly: () => false });
		instantiationService.stub(ICustomEditorLabelService, { onDidChange: Event.None, getName: () => undefined });
		instantiationService.stub(IFileDialogService, {});
		instantiationService.stub(IUndoRedoService, { pushElement: () => { }, removeElements: () => { } });
		instantiationService.stub(IWorkbenchEnvironmentService, {});
		instantiationService.stub(IPathService, {});
		instantiationService.stub(IWorkbenchLayoutService, {});

		const customEditors = store.add(instantiationService.createInstance(MainThreadCustomEditors, SingleProxyRPCProtocol(proxy), mainThreadWebviews, mainThreadWebviewPanels));
		customEditors.$registerCustomEditorProvider({ id: new ExtensionIdentifier('test.extension'), location: URI.file('/extensions/test') }, viewType, {}, extHost.capabilities ?? {}, false, false);

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

		return { calls, models, resolvers, createInput, createDiffInput, customEditors, stopExtensionHosts: () => didStopExtensionHosts.fire() };
	}

	test('disconnects a dirty custom editor after the extension host stops (#184142)', async () => {
		const customEditors = createCustomEditors({ createCustomDocument: async () => ({ editable: true }) });
		const { input, webview } = customEditors.createInput();
		await input.resolve();
		await customEditors.customEditors.$onDidEdit(resource, viewType, 1, undefined);

		const wasDirty = input.isDirty();
		const wasReadonly = input.isReadonly();
		customEditors.stopExtensionHosts();
		const afterStop = {
			wasDirty,
			wasReadonly,
			dirty: input.isDirty(),
			readonly: input.isReadonly(),
			message: webview.html?.includes('extension host'),
		};

		await assert.rejects(customEditors.customEditors.$onDidEdit(resource, viewType, 2, undefined), /not editable/);
		customEditors.models.disposeAllModelsForView(viewType);
		await timeout(0);
		input.dispose();
		await timeout(0);
		assert.deepStrictEqual({ afterStop, unexpectedErrors }, {
			afterStop: { wasDirty: true, wasReadonly: false, dirty: true, readonly: true, message: true },
			unexpectedErrors: [],
		});
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
