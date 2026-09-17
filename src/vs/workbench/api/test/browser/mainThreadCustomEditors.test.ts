/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { Event } from '../../../../base/common/event.js';
import { Disposable, DisposableStore } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { mock } from '../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { IResourceEditorInput } from '../../../../platform/editor/common/editor.js';
import { GroupIdentifier, isEditorOpenError } from '../../../common/editor.js';
import { CustomEditorInput } from '../../../contrib/customEditor/browser/customEditorInput.js';
import { ICustomEditorService } from '../../../contrib/customEditor/common/customEditor.js';
import { IWebviewWorkbenchService } from '../../../contrib/webviewPanel/browser/webviewWorkbenchService.js';
import { IEditorGroup, IEditorGroupsService } from '../../../services/editor/common/editorGroupsService.js';
import { IEditorService, IUntypedEditorReplacement } from '../../../services/editor/common/editorService.js';
import { IExtensionService } from '../../../services/extensions/common/extensions.js';
import { IUntitledTextEditorService } from '../../../services/untitled/common/untitledTextEditorService.js';
import { IWorkingCopyFileService } from '../../../services/workingCopy/common/workingCopyFileService.js';
import { IWorkingCopyService } from '../../../services/workingCopy/common/workingCopyService.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IUriIdentityService } from '../../../../platform/uriIdentity/common/uriIdentity.js';
import { TestStorageService } from '../../../test/common/workbenchTestServices.js';
import { MainThreadCustomEditors } from '../../browser/mainThreadCustomEditors.js';
import { SingleProxyRPCProtocol } from '../common/testRPCProtocol.js';

suite('MainThreadCustomEditors', () => {
	const store = new DisposableStore();

	teardown(() => store.clear());

	ensureNoDisposablesAreLeakedInTestSuite();

	function createCustomEditorInput(viewType: string): CustomEditorInput {
		const input = Object.create(CustomEditorInput.prototype) as CustomEditorInput;
		Object.defineProperties(input, {
			viewType: { value: viewType },
			resource: { value: URI.file('/test.png') },
			group: { value: 7 },
		});
		return input;
	}

	test('restored editor fails with a recovery action when its provider is unavailable', async () => {
		type WebviewResolver = Parameters<IWebviewWorkbenchService['registerResolver']>[0];

		let resolver: WebviewResolver | undefined;
		const webviewWorkbenchService = new class extends mock<IWebviewWorkbenchService>() {
			override registerResolver(value: WebviewResolver) {
				resolver = value;
				return Disposable.None;
			}
		};

		const activations: string[] = [];
		const extensionService = new class extends mock<IExtensionService>() {
			override activateByEvent(activationEvent: string): Promise<void> {
				activations.push(activationEvent);
				return Promise.resolve();
			}
		};

		const customEditorService = new class extends mock<ICustomEditorService>() {
			override getCustomEditorCapabilities() {
				return undefined;
			}
		};

		const replacements: Array<{ replacements: IUntypedEditorReplacement[]; group: IEditorGroup | GroupIdentifier }> = [];
		const editorService = new class extends mock<IEditorService>() {
			override replaceEditors(value: IUntypedEditorReplacement[], group: IEditorGroup | GroupIdentifier): Promise<void> {
				replacements.push({ replacements: value, group });
				return Promise.resolve();
			}
		};

		const workingCopyFileService = new class extends mock<IWorkingCopyFileService>() {
			override readonly onWillRunWorkingCopyFileOperation = Event.None;
			override registerWorkingCopyProvider() { return Disposable.None; }
		};

		const workingCopyService = new class extends mock<IWorkingCopyService>() {
			override readonly workingCopies = [];
		};

		store.add(new MainThreadCustomEditors(
			SingleProxyRPCProtocol(null),
			undefined!,
			undefined!,
			extensionService,
			store.add(new TestStorageService()),
			workingCopyService,
			workingCopyFileService,
			customEditorService,
			new class extends mock<IEditorGroupsService>() { },
			editorService,
			new class extends mock<IInstantiationService>() { },
			webviewWorkbenchService,
			new class extends mock<IUriIdentityService>() { },
			new class extends mock<IUntitledTextEditorService>() { },
		));

		assert.ok(resolver);
		const input = createCustomEditorInput('missing.customEditor');

		const error = await resolver.resolveWebview(input, CancellationToken.None).then(() => undefined, error => error);
		assert.ok(isEditorOpenError(error));
		assert.deepStrictEqual({
			activations,
			message: error.message,
			forceMessage: error.forceMessage,
			actions: error.actions.map(action => action.label),
		}, {
			activations: ['onCustomEditor:missing.customEditor'],
			message: 'Cannot open resource with custom editor type \'missing.customEditor\'. Make sure its extension is installed and enabled.',
			forceMessage: true,
			actions: ['Open with Default Editor'],
		});

		await error.actions[0].run();
		const replacement = replacements[0].replacements[0].replacement as IResourceEditorInput;
		assert.deepStrictEqual({
			group: replacements[0].group,
			editor: replacements[0].replacements[0].editor === input,
			resource: replacement.resource.toString(),
			override: replacement.options?.override,
		}, {
			group: 7,
			editor: true,
			resource: 'file:///test.png',
			override: 'default',
		});
	});

	test('restored editor delegates to a provider registered during activation', async () => {
		type WebviewResolver = Parameters<IWebviewWorkbenchService['registerResolver']>[0];

		const resolvers: WebviewResolver[] = [];
		const webviewWorkbenchService = new class extends mock<IWebviewWorkbenchService>() {
			override registerResolver(resolver: WebviewResolver) {
				resolvers.push(resolver);
				return Disposable.None;
			}

			override async resolveWebview(webview: CustomEditorInput, cancellation: CancellationToken): Promise<void> {
				const resolver = resolvers.find(resolver => resolver.canResolve(webview));
				assert.ok(resolver);
				await resolver.resolveWebview(webview, cancellation);
			}
		};

		let capabilitiesAvailable = false;
		let providerResolveCount = 0;
		const providerResolver: WebviewResolver = {
			canResolve: () => capabilitiesAvailable,
			resolveWebview: async () => { providerResolveCount++; }
		};
		const extensionService = new class extends mock<IExtensionService>() {
			override activateByEvent(): Promise<void> {
				capabilitiesAvailable = true;
				webviewWorkbenchService.registerResolver(providerResolver);
				return Promise.resolve();
			}
		};
		const customEditorService = new class extends mock<ICustomEditorService>() {
			override getCustomEditorCapabilities() {
				return capabilitiesAvailable ? {} : undefined;
			}
		};
		const workingCopyFileService = new class extends mock<IWorkingCopyFileService>() {
			override readonly onWillRunWorkingCopyFileOperation = Event.None;
			override registerWorkingCopyProvider() { return Disposable.None; }
		};

		store.add(new MainThreadCustomEditors(
			SingleProxyRPCProtocol(null),
			undefined!,
			undefined!,
			extensionService,
			store.add(new TestStorageService()),
			new class extends mock<IWorkingCopyService>() { override readonly workingCopies = []; },
			workingCopyFileService,
			customEditorService,
			new class extends mock<IEditorGroupsService>() { },
			new class extends mock<IEditorService>() { },
			new class extends mock<IInstantiationService>() { },
			webviewWorkbenchService,
			new class extends mock<IUriIdentityService>() { },
			new class extends mock<IUntitledTextEditorService>() { },
		));

		const activationResolver = resolvers[0];
		const input = createCustomEditorInput('available.customEditor');
		assert.ok(activationResolver.canResolve(input));

		await activationResolver.resolveWebview(input, CancellationToken.None);

		assert.strictEqual(providerResolveCount, 1);
		assert.ok(!activationResolver.canResolve(input));
	});
});
