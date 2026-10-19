/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../base/common/uri.js';
import { upcastDeepPartial, upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { EditorOpenSource, IResourceEditorInput } from '../../../../../platform/editor/common/editor.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { IOpenerService } from '../../../../../platform/opener/common/opener.js';
import { REOPEN_ACTIVE_EDITOR_WITH_COMMAND_ID } from '../../../../browser/parts/editor/editorCommands.js';
import { EditorInput } from '../../../../common/editor/editorInput.js';
import { IEditorGroup, IEditorGroupsService } from '../../../../services/editor/common/editorGroupsService.js';
import { EditorMatches, IEditorResolverService } from '../../../../services/editor/common/editorResolverService.js';
import { IEditorService, SIDE_GROUP } from '../../../../services/editor/common/editorService.js';
import { IExtensionService } from '../../../../services/extensions/common/extensions.js';
import { EditorLinkHandlerProvider } from '../../browser/linkHandlers.js';

suite('Link handlers', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	suite('EditorLinkHandlerProvider', () => {

		function createProvider(editorsInGroup: EditorInput[]) {
			const calls: unknown[] = [];
			const group = upcastPartial<IEditorGroup>({
				id: 7,
				activeEditor: editorsInGroup.at(-1),
				findEditors: () => editorsInGroup,
				getIndexOfEditor: editor => editorsInGroup.indexOf(editor),
			});
			const instantiationService = store.add(new TestInstantiationService());
			instantiationService.stub(IOpenerService, { registerLinkHandlerProvider: () => Disposable.None });
			instantiationService.stub(IFileService, { hasProvider: (resource: URI) => resource.scheme === 'file' });
			instantiationService.stub(IExtensionService, { whenInstalledExtensionsRegistered: async () => true });
			instantiationService.stub(IEditorResolverService, upcastPartial<IEditorResolverService>({
				getEditorMatches: () => upcastDeepPartial<EditorMatches>({
					matches: [
						{ editor: { id: 'default', label: 'Text Editor', detail: 'Built-in' } },
						{ editor: { id: 'markdown.preview', label: 'Markdown Preview' } },
					],
					defaultRule: { editor: { id: 'markdown.preview' } },
				}),
				setDefaultEditor: (resource, editorId) => calls.push({ setDefaultEditor: [resource.toString(), editorId] }),
			}));
			instantiationService.stub(IEditorGroupsService, upcastPartial<IEditorGroupsService>({ activeGroup: group }));
			instantiationService.stub(IEditorService, upcastPartial<IEditorService>({
				openEditor: (async (editor: IResourceEditorInput, preferredGroup?: unknown) => {
					calls.push({ openEditor: [{ resource: editor.resource.toString(), options: editor.options }, preferredGroup === group ? 'activeGroup' : preferredGroup] });
					return undefined;
				}) as IEditorService['openEditor'],
			}));
			instantiationService.stub(ICommandService, upcastPartial<ICommandService>({
				executeCommand: async (id: string, ...args: unknown[]) => {
					calls.push({ executeCommand: [id, ...args] });
					return undefined;
				},
			}));
			const provider = store.add(instantiationService.createInstance(EditorLinkHandlerProvider));
			return { provider, calls };
		}

		const readme = URI.file('/workspace/README.md');
		const readmeAtLine = readme.with({ fragment: 'L3' });

		test('provides the matching editor types and marks the default', async () => {
			const { provider, calls } = createProvider([]);

			const handlers = await provider.provideLinkHandlers(readmeAtLine);
			await handlers[0].setAsDefault?.();

			assert.deepStrictEqual({
				handlers: handlers.map(({ id, label, detail, isDefault }) => ({ id, label, detail, isDefault })),
				web: await provider.provideLinkHandlers(URI.parse('https://example.com/README.md')),
				unknownScheme: await provider.provideLinkHandlers(URI.parse('unknown://example/README.md')),
				calls,
			}, {
				handlers: [
					{ id: 'default', label: 'Text Editor', detail: 'Built-in', isDefault: false },
					{ id: 'markdown.preview', label: 'Markdown Preview', detail: undefined, isDefault: true },
				],
				web: [],
				unknownScheme: [],
				calls: [{ setDefaultEditor: [readme.toString(), 'default'] }],
			});
		});

		test('switches an editor showing the resource to the picked editor type', async () => {
			const textEditor = upcastPartial<EditorInput>({ editorId: undefined });
			const { provider, calls } = createProvider([upcastPartial<EditorInput>({ editorId: 'other' }), textEditor]);

			const [, previewHandler] = await provider.provideLinkHandlers(readmeAtLine);
			await previewHandler.open({ fromUserGesture: true });

			assert.deepStrictEqual(calls, [
				{ executeCommand: [REOPEN_ACTIVE_EDITOR_WITH_COMMAND_ID, 'markdown.preview', { groupId: 7, editorIndex: 1 }] },
				{ openEditor: [{ resource: readme.toString(), options: { selection: { startLineNumber: 3, startColumn: 1, endLineNumber: undefined, endColumn: undefined }, source: EditorOpenSource.USER, override: 'markdown.preview' } }, 'activeGroup'] },
			]);
		});

		test('reveals an editor of the picked type without switching, and opens to the side without switching', async () => {
			const { provider, calls } = createProvider([upcastPartial<EditorInput>({ editorId: undefined })]);

			const [textHandler, previewHandler] = await provider.provideLinkHandlers(readme);
			await textHandler.open();
			await previewHandler.open({ openToSide: true, editorOptions: { preserveFocus: true } });

			assert.deepStrictEqual(calls, [
				{ openEditor: [{ resource: readme.toString(), options: { selection: undefined, source: EditorOpenSource.API, override: 'default' } }, 'activeGroup'] },
				{ openEditor: [{ resource: readme.toString(), options: { selection: undefined, source: EditorOpenSource.API, preserveFocus: true, override: 'markdown.preview' } }, SIDE_GROUP] },
			]);
		});
	});
});
