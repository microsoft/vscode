/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise, timeout } from '../../../../../base/common/async.js';
import { Emitter } from '../../../../../base/common/event.js';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IResourceEditorInput, ITextEditorOptions } from '../../../../../platform/editor/common/editor.js';
import { ILayoutService } from '../../../../../platform/layout/browser/layoutService.js';
import { EditorCloseContext, IEditorCloseEvent, IUntypedEditorInput } from '../../../../common/editor.js';
import { BrowserHostService } from '../../browser/browserHostService.js';
import { TestEditorService, TestFileEditorInput, TestLayoutService, workbenchInstantiationService } from '../../../../test/browser/workbenchTestServices.js';
import { TestFileService } from '../../../../test/common/workbenchTestServices.js';

class WaitTestEditorService extends TestEditorService {

	private readonly _onDidCloseEditorEmitter = this._register(new Emitter<IEditorCloseEvent>());
	override readonly onDidCloseEditor = this._onDidCloseEditorEmitter.event;

	readonly opened = new DeferredPromise<IUntypedEditorInput[]>();

	override async openEditors(editors: IUntypedEditorInput[]) {
		this.opened.complete(editors);

		return [];
	}

	close(resource: URI): void {
		this._onDidCloseEditorEmitter.fire({ editor: this._register(new TestFileEditorInput(resource, 'testEditorInput')), groupId: 0, context: EditorCloseContext.UNKNOWN, index: 0, sticky: false });
	}
}

class WaitTestFileService extends TestFileService {

	readonly deleted: URI[] = [];

	override async del(resource: URI): Promise<void> {
		this.deleted.push(resource);
	}
}

suite('BrowserHostService', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('--wait with --goto releases once the editor without line/column is closed', async () => {
		const fileService = new WaitTestFileService();
		const editorService = disposables.add(new WaitTestEditorService());
		const instantiationService = workbenchInstantiationService({
			fileService: () => fileService,
			editorService: () => editorService
		}, disposables);
		instantiationService.stub(ILayoutService, new TestLayoutService());

		const hostService = disposables.add(instantiationService.createInstance(BrowserHostService));
		const waitMarkerFileURI = URI.file('/tmp/wait-marker');

		await hostService.openWindow([{ fileUri: URI.file('/workspace/README.md:3:5') }], { gotoLineMode: true, waitMarkerFileURI });

		const opened = await editorService.opened.p;
		editorService.close(URI.file('/workspace/README.md'));
		await timeout(0);

		assert.deepStrictEqual({
			opened: opened.map(editor => ({ resource: (editor as IResourceEditorInput).resource.toString(), selection: (editor.options as ITextEditorOptions | undefined)?.selection })),
			deleted: fileService.deleted.map(resource => resource.toString())
		}, {
			opened: [{ resource: URI.file('/workspace/README.md').toString(), selection: { startLineNumber: 3, startColumn: 5 } }],
			deleted: [waitMarkerFileURI.toString()]
		});
	});
});
