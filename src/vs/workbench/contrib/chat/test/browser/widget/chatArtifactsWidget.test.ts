/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { addDisposableListener, EventType } from '../../../../../../base/browser/dom.js';
import { mainWindow } from '../../../../../../base/browser/window.js';
import { DeferredPromise } from '../../../../../../base/common/async.js';
import { VSBuffer } from '../../../../../../base/common/buffer.js';
import { toDisposable } from '../../../../../../base/common/lifecycle.js';
import { constObservable } from '../../../../../../base/common/observable.js';
import { isWeb } from '../../../../../../base/common/platform.js';
import { URI } from '../../../../../../base/common/uri.js';
import { upcastPartial } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { ICommandService } from '../../../../../../platform/commands/common/commands.js';
import { IFileDialogService } from '../../../../../../platform/dialogs/common/dialogs.js';
import { IFileContent, IFileService, IFileStatWithMetadata } from '../../../../../../platform/files/common/files.js';
import { IOpenerService } from '../../../../../../platform/opener/common/opener.js';
import { ISharedWebContentExtractorService, NullSharedWebContentExtractorService } from '../../../../../../platform/webContentExtractor/common/webContentExtractor.js';
import { workbenchInstantiationService } from '../../../../../test/browser/workbenchTestServices.js';
import { IChatImageCarouselService } from '../../../browser/chatImageCarouselService.js';
import { ChatArtifactsWidget } from '../../../browser/widget/chatArtifactsWidget.js';
import { IArtifactSourceGroup, IChatArtifacts, IChatArtifactsService } from '../../../common/tools/chatArtifactsService.js';

suite('ChatArtifactsWidget', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const generatedName = 'generated-image-a1b2c3d4e5f6.jpg';

	for (const { source, fileName, expectedName, image } of [
		{ source: 'vscode-agent-host://remote/output.jpeg?version=1', fileName: generatedName, expectedName: generatedName, image: true },
		{ source: 'vscode-agent-host://remote/opaque?version=1', fileName: generatedName, expectedName: generatedName, image: true },
		{ source: 'file:///reports/plan.md', fileName: undefined, expectedName: 'plan.md', image: false },
	]) {
		const browserDownload = isWeb && image;
		for (const cancelled of browserDownload ? [false] : [false, true]) {
			test(`saving ${source} preserves its source URI and suggested filename (cancelled=${cancelled})`, async () => {
				const instantiationService = workbenchInstantiationService(undefined, store);
				instantiationService.stub(ICommandService, upcastPartial<ICommandService>({}));
				instantiationService.stub(IOpenerService, upcastPartial<IOpenerService>({}));
				instantiationService.stub(IChatImageCarouselService, upcastPartial<IChatImageCarouselService>({}));
				instantiationService.stub(ISharedWebContentExtractorService, new NullSharedWebContentExtractorService());

				const sourceUri = URI.parse(source);
				const targetUri = URI.file('/selected/artifact');
				const reads: string[] = [];
				const writes: { uri: string; content: string }[] = [];
				const saved = new DeferredPromise<string | undefined>();
				let suggestedName: string | undefined;
				let downloadName: string | undefined;
				if (browserDownload) {
					store.add(addDisposableListener(mainWindow.document, EventType.CLICK, event => {
						const anchor = event.target;
						if (anchor instanceof HTMLAnchorElement && anchor.download) {
							event.preventDefault();
							downloadName = anchor.download;
							saved.complete(anchor.href);
						}
					}));
				}
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
							saved.complete(undefined);
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
						saved.complete(undefined);
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
				const downloadUrl = await saved.p;
				const downloadedContent = downloadUrl ? await (await fetch(downloadUrl)).text() : undefined;

				assert.deepStrictEqual({ label: widget.domNode.querySelector('.chat-artifacts-list-label')?.textContent, suggestedName, downloadName, downloadedContent, reads, writes }, {
					label: 'Friendly label',
					suggestedName: browserDownload ? undefined : `/saved/${expectedName}`,
					downloadName: browserDownload ? expectedName : undefined,
					downloadedContent: browserDownload ? 'image bytes' : undefined,
					reads: cancelled ? [] : [sourceUri.toString()],
					writes: cancelled || browserDownload ? [] : [{ uri: targetUri.toString(), content: 'image bytes' }],
				});
			});
		}
	}
});
