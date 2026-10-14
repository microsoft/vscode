/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { mainWindow } from '../../../../../../base/browser/window.js';
import { DeferredPromise } from '../../../../../../base/common/async.js';
import { VSBuffer } from '../../../../../../base/common/buffer.js';
import { toDisposable } from '../../../../../../base/common/lifecycle.js';
import { constObservable } from '../../../../../../base/common/observable.js';
import { URI } from '../../../../../../base/common/uri.js';
import { upcastPartial } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { ICommandService } from '../../../../../../platform/commands/common/commands.js';
import { IFileDialogService } from '../../../../../../platform/dialogs/common/dialogs.js';
import { IFileContent, IFileService, IFileStatWithMetadata } from '../../../../../../platform/files/common/files.js';
import { IOpenerService } from '../../../../../../platform/opener/common/opener.js';
import { workbenchInstantiationService } from '../../../../../test/browser/workbenchTestServices.js';
import { IChatImageCarouselService } from '../../../browser/chatImageCarouselService.js';
import { ChatArtifactsWidget } from '../../../browser/widget/chatArtifactsWidget.js';
import { IArtifactSourceGroup, IChatArtifacts, IChatArtifactsService } from '../../../common/tools/chatArtifactsService.js';

suite('ChatArtifactsWidget', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const generatedName = 'generated-image-a1b2c3d4e5f6.jpg';

	for (const { source, fileName, expectedName } of [
		{ source: 'vscode-agent-host://remote/output.jpeg?version=1', fileName: generatedName, expectedName: generatedName },
		{ source: 'vscode-agent-host://remote/opaque?version=1', fileName: generatedName, expectedName: generatedName },
		{ source: 'file:///reports/plan.md', fileName: undefined, expectedName: 'plan.md' },
	]) {
		for (const cancelled of [false, true]) {
			test(`saving ${source} preserves its source URI and suggested filename (cancelled=${cancelled})`, async () => {
				const instantiationService = workbenchInstantiationService(undefined, store);
				instantiationService.stub(ICommandService, upcastPartial<ICommandService>({}));
				instantiationService.stub(IOpenerService, upcastPartial<IOpenerService>({}));
				instantiationService.stub(IChatImageCarouselService, upcastPartial<IChatImageCarouselService>({}));

				const sourceUri = URI.parse(source);
				const targetUri = URI.file('/selected/artifact');
				const reads: string[] = [];
				const writes: { uri: string; content: string }[] = [];
				const saved = new DeferredPromise<void>();
				let suggestedName: string | undefined;
				instantiationService.stub(IChatArtifactsService, upcastPartial<IChatArtifactsService>({
					getArtifacts: () => upcastPartial<IChatArtifacts>({
						artifactGroups: constObservable<readonly IArtifactSourceGroup[]>([{
							source: { kind: 'rules' },
							artifacts: [{ label: 'Friendly label', uri: sourceUri.toString(), fileName, type: 'screenshot' }],
						}]),
					}),
				}));
				instantiationService.stub(IFileDialogService, upcastPartial<IFileDialogService>({
					defaultFilePath: async () => URI.file('/saved'),
					showSaveDialog: async options => {
						suggestedName = options.defaultUri?.path;
						if (cancelled) {
							saved.complete();
						}
						return cancelled ? undefined : targetUri;
					},
				}));
				instantiationService.stub(IFileService, upcastPartial<IFileService>({
					readFile: async resource => {
						reads.push(resource.toString());
						return upcastPartial<IFileContent>({ value: VSBuffer.fromString('image bytes') });
					},
					writeFile: async (resource, content) => {
						assert.ok(content instanceof VSBuffer);
						writes.push({ uri: resource.toString(), content: content.toString() });
						saved.complete();
						return upcastPartial<IFileStatWithMetadata>({});
					},
				}));
				const widget = store.add(instantiationService.createInstance(ChatArtifactsWidget));
				mainWindow.document.body.appendChild(widget.domNode);
				store.add(toDisposable(() => widget.domNode.remove()));
				widget.setSessionResource(URI.parse('chat-session://test/generated-images'));
				const saveButton = widget.domNode.querySelector<HTMLElement>('.chat-artifacts-list-actions .codicon-save');
				assert.ok(saveButton);
				saveButton.click();
				await saved.p;

				assert.deepStrictEqual({ label: widget.domNode.querySelector('.chat-artifacts-list-label')?.textContent, suggestedName, reads, writes }, {
					label: 'Friendly label',
					suggestedName: `/saved/${expectedName}`,
					reads: cancelled ? [] : [sourceUri.toString()],
					writes: cancelled ? [] : [{ uri: targetUri.toString(), content: 'image bytes' }],
				});
			});
		}
	}
});
