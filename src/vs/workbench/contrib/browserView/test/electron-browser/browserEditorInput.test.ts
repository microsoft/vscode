/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Event } from '../../../../../base/common/event.js';
import { Disposable, DisposableStore, IDisposable } from '../../../../../base/common/lifecycle.js';
import { Schemas } from '../../../../../base/common/network.js';
import { hasKey } from '../../../../../base/common/types.js';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { BrowserViewUri } from '../../../../../platform/browserView/common/browserViewUri.js';
import { IContextKeyService, RawContextKey } from '../../../../../platform/contextkey/common/contextkey.js';
import { ITunnelProxyInfo } from '../../../../../platform/tunnel/common/tunnelProxy.js';
import { BrowserEditorInput, BrowserEditorSerializer, IBrowserEditorInputData } from '../../common/browserEditorInput.js';
import { IBrowserEditorViewState, IBrowserViewContextualFilter, IBrowserViewFilterContext, IBrowserViewOpenHandler, IBrowserViewWorkbenchService } from '../../common/browserView.js';
import { IUntypedEditorInput } from '../../../../common/editor.js';
import { applyAvailableEditorIds } from '../../../../common/contextkeys.js';
import { IEditorResolverService, RegisteredEditorPriority } from '../../../../services/editor/common/editorResolverService.js';
import { workbenchInstantiationService } from '../../../../test/browser/workbenchTestServices.js';
import { IEditorService, type PreferredGroup } from '../../../../services/editor/common/editorService.js';
import { formatBrowserEditorList, getBrowserPageResourceNavigationError } from '../../electron-browser/tools/browserToolHelpers.js';

class TestBrowserViewWorkbenchService implements IBrowserViewWorkbenchService {
	declare readonly _serviceBrand: undefined;

	readonly onDidChangeBrowserViews = Event.None;
	readonly onDidChangeSharingAvailable = Event.None;
	readonly isSharingAvailable = false;
	readonly known = new Map<string, BrowserEditorInput>();
	input: BrowserEditorInput | undefined;
	lastCreate: { id: string; url: string | undefined; associatedResource: string | undefined } | undefined;

	willUseRemoteProxy(): boolean {
		return false;
	}

	setRemoteProxyInfo(_info: ITunnelProxyInfo | undefined): void { }

	getKnownBrowserViews(): Map<string, BrowserEditorInput> {
		return this.known;
	}

	registerContextualFilter(_filter: IBrowserViewContextualFilter): IDisposable {
		return Disposable.None;
	}

	getContextualBrowserViews(_context?: IBrowserViewFilterContext): Map<string, BrowserEditorInput> {
		return this.known;
	}

	async getPreferredGroup(preferredGroup?: PreferredGroup): Promise<PreferredGroup | undefined> {
		return preferredGroup;
	}

	registerOpenHandler(_handler: IBrowserViewOpenHandler): IDisposable {
		return Disposable.None;
	}

	getOrCreateLazy(id: string, initialState?: IBrowserEditorViewState, associatedResource?: URI): BrowserEditorInput {
		this.lastCreate = {
			id,
			url: initialState?.url,
			associatedResource: associatedResource?.toString()
		};
		if (!this.input) {
			throw new Error('No browser editor input configured for test.');
		}
		return this.input;
	}

	async clearGlobalStorage(): Promise<void> { }

	async clearWorkspaceStorage(): Promise<void> { }
}

function getResource(input: IUntypedEditorInput): URI | undefined {
	return hasKey(input, { resource: true }) ? input.resource : undefined;
}

suite('BrowserEditorInput', () => {
	const disposables = new DisposableStore();
	let browserViewWorkbenchService: TestBrowserViewWorkbenchService;
	let instantiationService: ReturnType<typeof workbenchInstantiationService>;

	setup(() => {
		browserViewWorkbenchService = new TestBrowserViewWorkbenchService();
		instantiationService = workbenchInstantiationService(undefined, disposables);
		instantiationService.stub(IBrowserViewWorkbenchService, browserViewWorkbenchService);
	});

	teardown(() => disposables.clear());
	ensureNoDisposablesAreLeakedInTestSuite();

	function createInput(data: IBrowserEditorInputData): BrowserEditorInput {
		const input = disposables.add(instantiationService.createInstance(BrowserEditorInput, data, async () => {
			throw new Error('Unexpected model resolution in BrowserEditorInput test.');
		}));
		browserViewWorkbenchService.input = input;
		return input;
	}

	test('uses the browser resource for regular inputs', () => {
		const input = createInput({ id: 'regular-browser' });
		const untyped = input.toUntyped();

		assert.deepStrictEqual({
			resourceScheme: input.resource.scheme,
			untypedResource: getResource(untyped)?.toString(),
			override: untyped.options?.override
		}, {
			resourceScheme: Schemas.vscodeBrowser,
			untypedResource: input.resource.toString(),
			override: BrowserEditorInput.EDITOR_ID
		});
	});

	test('preserves a associated file resource through reopen and serialization', () => {
		const associatedResource = URI.file('/workspace/index.html');
		const input = createInput({
			id: 'file-browser',
			url: associatedResource.toString(),
			associatedResource,
		});
		const untyped = input.toUntyped();
		const serializer = new BrowserEditorSerializer();
		const serialized = serializer.serialize(input);
		assert.ok(serialized);
		serializer.deserialize(instantiationService, serialized);

		assert.deepStrictEqual({
			resource: input.resource.toString(),
			preferredResource: input.preferredResource.toString(),
			untypedResource: getResource(untyped)?.toString(),
			matchesBrowserInput: input.matches(untyped),
			matchesTextInput: input.matches({ resource: associatedResource }),
			restored: browserViewWorkbenchService.lastCreate
		}, {
			resource: BrowserViewUri.forId('file-browser').toString(),
			preferredResource: associatedResource.toString(),
			untypedResource: associatedResource.toString(),
			matchesBrowserInput: true,
			matchesTextInput: false,
			restored: {
				id: 'file-browser',
				url: associatedResource.toString(),
				associatedResource: associatedResource.toString()
			}
		});
	});

	test('uses resource presentation for associated resources by default', () => {
		const input = createInput({
			id: 'file-browser',
			url: URI.file('/workspace/index.html').toString(),
			associatedResource: URI.file('/workspace/index.html')
		});

		assert.deepStrictEqual({
			name: input.getName(),
			icon: input.getIcon()
		}, {
			name: 'index.html',
			icon: undefined
		});
	});

	test('describes and restricts resource-backed pages for browser tools', () => {
		const associatedResource = URI.file('/workspace/index.html');
		const input = createInput({
			id: 'resource-browser',
			associatedResource,
			url: associatedResource.toString(),
			title: 'Resource editor'
		});
		const regularInput = createInput({ id: 'regular-browser' });

		assert.deepStrictEqual({
			context: formatBrowserEditorList(instantiationService.get(IEditorService), [input]),
			query: getBrowserPageResourceNavigationError(input, associatedResource.with({ query: 'view=preview' }).toString()),
			fragment: getBrowserPageResourceNavigationError(input, associatedResource.with({ fragment: 'content' }).toString()),
			otherResource: getBrowserPageResourceNavigationError(input, URI.file('/workspace/other.html').toString()),
			regularPage: getBrowserPageResourceNavigationError(regularInput, 'https://example.com')
		}, {
			context: '- [resource-browser] Resource editor (file:///workspace/index.html) (resource-backed; navigation is limited to this resource) (not visible)',
			query: undefined,
			fragment: undefined,
			otherResource: 'This browser page is associated with a resource and cannot be navigated to a different resource. Only query and fragment changes are allowed. Use a different page or open a new one with the open_browser_page tool.',
			regularPage: undefined
		});
	});

	test('uses the associated file resource to find available editor types', () => {
		const associatedResource = URI.file('/workspace/index.html');
		const input = createInput({
			id: 'file-browser',
			associatedResource
		});
		const editorResolverService = instantiationService.get(IEditorResolverService);
		disposables.add(editorResolverService.registerEditor('*.html', {
			id: 'test.browserEditor',
			label: 'Test Browser Editor',
			priority: RegisteredEditorPriority.default
		}, {}, {}));
		const contextKey = new RawContextKey<string>('browserEditorAvailableEditorIds', '').bindTo(instantiationService.get(IContextKeyService));

		applyAvailableEditorIds(contextKey, input, editorResolverService);

		assert.strictEqual(contextKey.get()?.split(',').includes('test.browserEditor'), true);
	});

	test('follows associated file renames', async () => {
		const associatedResource = URI.file('/workspace/index.html');
		const target = URI.file('/workspace/renamed.html');
		const input = createInput({
			id: 'file-browser',
			associatedResource,
			url: associatedResource.toString()
		});

		const result = await input.rename(1, target);

		assert.deepStrictEqual(result, {
			editor: {
				resource: target,
				options: {
					override: BrowserEditorInput.EDITOR_ID,
					viewState: {
						url: target.toString(),
						title: undefined,
						favicon: undefined
					}
				}
			}
		});
	});

	test('preserves query and fragment when following associated file renames', async () => {
		const associatedResource = URI.file('/workspace/index.html');
		const target = URI.file('/workspace/renamed.html');
		const currentResource = associatedResource.with({ query: 'view=preview', fragment: 'content' });
		const input = createInput({
			id: 'file-browser',
			associatedResource,
			url: currentResource.toString()
		});

		const result = await input.rename(1, target);

		assert.deepStrictEqual(result, {
			editor: {
				resource: target,
				options: {
					override: BrowserEditorInput.EDITOR_ID,
					viewState: {
						url: target.with({ query: currentResource.query, fragment: currentResource.fragment }).toString(),
						title: undefined,
						favicon: undefined
					}
				}
			}
		});
	});
});
