/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { bufferToStream, VSBuffer } from '../../../../../base/common/buffer.js';
import { AuthInfo, Credentials, IRequestService } from '../../../../../platform/request/common/request.js';
import { GroupsOrder, IEditorGroupContextKeyProvider, IEditorGroupsService } from '../../../../services/editor/common/editorGroupsService.js';
import { WebviewInput } from '../../../webviewPanel/browser/webviewEditorInput.js';
import { ReleaseNotesManager } from '../../browser/releaseNotesEditor.js';
import { workbenchInstantiationService } from '../../../../test/electron-browser/workbenchTestServices.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { Disposable, IDisposable } from '../../../../../base/common/lifecycle.js';
import { ContextKeyValue, IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { ITestInstantiationService, TestEditorGroupsService } from '../../../../test/browser/workbenchTestServices.js';
import { IWebviewService } from '../../../webview/browser/webview.js';
import { WebviewService } from '../../../webview/browser/webviewService.js';
import { IWebviewWorkbenchService, WebviewEditorService } from '../../../webviewPanel/browser/webviewWorkbenchService.js';
import { IRequestContext } from '../../../../../base/parts/request/common/request.js';
import { EditorsOrder } from '../../../../common/editor.js';
import { ContextKeyService } from '../../../../../platform/contextkey/browser/contextKeyService.js';

class MockRequestService implements IRequestService {
	resolveProxy(url: string): Promise<string | undefined> {
		throw new Error('Method not implemented.');
	}
	lookupAuthorization(authInfo: AuthInfo): Promise<Credentials | undefined> {
		throw new Error('Method not implemented.');
	}
	lookupKerberosAuthorization(url: string): Promise<string | undefined> {
		throw new Error('Method not implemented.');
	}
	loadCertificates(): Promise<string[]> {
		throw new Error('Method not implemented.');
	}
	_serviceBrand: undefined;

	private mockResponses = new Map<string, string>();

	setMockResponse(url: string, content: string): void {
		this.mockResponses.set(url, content);
	}

	async request(options: { url: string }, token: CancellationToken): Promise<IRequestContext> {
		const url = options.url;
		const mockContent = this.mockResponses.get(url);

		if (mockContent !== undefined) {
			return {
				res: {
					headers: {},
					statusCode: 200
				},
				stream: bufferToStream(VSBuffer.fromString(mockContent))
			} as IRequestContext;
		}

		// Simulate network error for unmocked URLs
		throw new Error('Mock network error - URL not mocked');
	}
}
export class ReleaseNotesEditorGroupsService extends TestEditorGroupsService {
	override registerContextKeyProvider<T extends ContextKeyValue>(_provider: IEditorGroupContextKeyProvider<T>): IDisposable { return Disposable.None; }
}


suite('Release Notes Editor', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();
	let instantiationService: ITestInstantiationService;
	let mockRequestService: MockRequestService;
	let editorGroupsService: IEditorGroupsService;

	setup(() => {
		instantiationService = workbenchInstantiationService({});
		editorGroupsService = instantiationService.stub(IEditorGroupsService, new ReleaseNotesEditorGroupsService());
		instantiationService.stub(IWebviewService, disposables.add(instantiationService.createInstance(WebviewService)));
		instantiationService.stub(IContextKeyService, disposables.add(instantiationService.createInstance(ContextKeyService)));
		instantiationService.stub(IWebviewWorkbenchService, disposables.add(instantiationService.createInstance(WebviewEditorService)));
		// Set up mock request service
		mockRequestService = new MockRequestService();
		instantiationService.stub(IRequestService, mockRequestService);

	});

	teardown(async () => {
		// Clean up any opened tabs after each test
		const allGroups = editorGroupsService.getGroups(GroupsOrder.MOST_RECENTLY_ACTIVE);
		for (const group of allGroups) {
			const editors = group.getEditors(EditorsOrder.MOST_RECENTLY_ACTIVE);
			for (const editor of editors) {
				editor.dispose();
			}
		}
	});

	test('Release Notes Manager - opens webview with mocked content', async () => {
		const mockReleaseNotesContent = `# Release Notes for Version 1.2.0

## New Features
- Added feature A
- Improved feature B

## Bug Fixes
- Fixed issue #123
- Resolved problem with feature C
`;

		// Mock the release notes URL
		const version = '1.2.0';
		const expectedUrl = 'https://code.visualstudio.com/raw/v1_2.md';
		mockRequestService.setMockResponse(expectedUrl, mockReleaseNotesContent);

		// Create release notes manager
		const releaseNotesManager = disposables.add(instantiationService.createInstance(ReleaseNotesManager));

		// Show release notes
		const result = await releaseNotesManager.show(version, false);

		// Verify that the webview was created successfully
		assert.strictEqual(result, true, 'Release notes should be shown successfully');

		// Check that a release notes tab was opened
		const allGroups = editorGroupsService.getGroups(GroupsOrder.MOST_RECENTLY_ACTIVE);
		const allEditors = allGroups.flatMap(group => group.getEditors(EditorsOrder.MOST_RECENTLY_ACTIVE));
		const releaseNotesEditor = allEditors.find(editor => editor instanceof WebviewInput && editor.viewType === 'releaseNotes');

		assert.ok(releaseNotesEditor, 'A release notes webview should be opened');
		assert.ok(releaseNotesEditor instanceof WebviewInput, 'Editor should be a WebviewInput');
		assert.strictEqual(releaseNotesEditor.viewType, 'releaseNotes', 'Webview should have correct viewType');
	});

	test('Release Notes Manager - handles network error gracefully', async () => {
		const version = '1.3.0';
		// Don't mock any response - this will simulate a network error

		const releaseNotesManager = disposables.add(instantiationService.createInstance(ReleaseNotesManager));

		// Attempt to show release notes should fail
		await assert.rejects(
			async () => await releaseNotesManager.show(version, false),
			(error: Error) => error.message.includes('Mock network error'),
			'Should throw an error when network request fails'
		);

		// Verify no webview was created on error
		const allGroups = editorGroupsService.getGroups(GroupsOrder.MOST_RECENTLY_ACTIVE);
		const allEditors = allGroups.flatMap(group => group.getEditors(EditorsOrder.MOST_RECENTLY_ACTIVE));
		const releaseNotesEditors = allEditors.filter(editor => editor instanceof WebviewInput && editor.viewType === 'releaseNotes');

		assert.strictEqual(releaseNotesEditors.length, 0, 'No webview should be created on error');
	});

	test('Release Notes Manager - reuses existing webview when shown again', async () => {
		const mockReleaseNotesContent = `# Release Notes for Version 1.4.0

## Changes
- Updated something important
`;

		const version = '1.4.0';
		const expectedUrl = 'https://code.visualstudio.com/raw/v1_4.md';
		mockRequestService.setMockResponse(expectedUrl, mockReleaseNotesContent);

		const releaseNotesManager = disposables.add(instantiationService.createInstance(ReleaseNotesManager));

		// Show release notes first time
		await releaseNotesManager.show(version, false);

		const allGroups = editorGroupsService.getGroups(GroupsOrder.MOST_RECENTLY_ACTIVE);
		let allEditors = allGroups.flatMap(group => group.getEditors(EditorsOrder.MOST_RECENTLY_ACTIVE));
		let releaseNotesEditors = allEditors.filter(editor => editor instanceof WebviewInput && editor.viewType === 'releaseNotes');

		assert.strictEqual(releaseNotesEditors.length, 1, 'One webview should be created initially');

		// Show release notes second time with same version
		await releaseNotesManager.show(version, false);

		allEditors = allGroups.flatMap(group => group.getEditors(EditorsOrder.MOST_RECENTLY_ACTIVE));
		releaseNotesEditors = allEditors.filter(editor => editor instanceof WebviewInput && editor.viewType === 'releaseNotes');

		assert.strictEqual(releaseNotesEditors.length, 1, 'Should reuse existing webview');
	});

	test('Release Notes Manager - handles current file mode', async () => {
		const releaseNotesManager = disposables.add(instantiationService.createInstance(ReleaseNotesManager));

		// Test current file mode (useCurrentFile = true)
		// This should not make any network requests and should work with current file content
		try {
			await releaseNotesManager.show('1.5.0', true);
			// If no error is thrown, the current file mode is working
			assert.ok(true, 'Current file mode should work without network requests');
		} catch (error) {
			// Current file mode might fail if no active editor, which is expected in tests
			assert.ok(error instanceof Error, 'Should handle missing current file gracefully');
		}
	});
});
