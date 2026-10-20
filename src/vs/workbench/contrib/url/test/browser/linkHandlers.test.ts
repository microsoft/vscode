/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { timeout } from '../../../../../base/common/async.js';
import { Emitter } from '../../../../../base/common/event.js';
import { ResolvedKeybinding } from '../../../../../base/common/keybindings.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock, upcastDeepPartial, upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { CommandsRegistry, ICommandService } from '../../../../../platform/commands/common/commands.js';
import { EditorOpenSource, IResourceEditorInput } from '../../../../../platform/editor/common/editor.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { IKeybindingService } from '../../../../../platform/keybinding/common/keybinding.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import { TestNotificationService } from '../../../../../platform/notification/test/common/testNotificationService.js';
import { ILinkHandler, IOpenerService, OpenInternalOptions } from '../../../../../platform/opener/common/opener.js';
import { IKeyMods, IQuickInputHideEvent, IQuickInputService, IQuickPick, IQuickPickDidAcceptEvent, IQuickPickItem, IQuickPickItemButtonEvent, QuickInputHideReason } from '../../../../../platform/quickinput/common/quickInput.js';
import { REOPEN_ACTIVE_EDITOR_WITH_COMMAND_ID } from '../../../../browser/parts/editor/editorCommands.js';
import { EditorInput } from '../../../../common/editor/editorInput.js';
import { IEditorGroup, IEditorGroupsService } from '../../../../services/editor/common/editorGroupsService.js';
import { EditorMatches, IEditorResolverService } from '../../../../services/editor/common/editorResolverService.js';
import { IEditorService, SIDE_GROUP } from '../../../../services/editor/common/editorService.js';
import { IExtensionService } from '../../../../services/extensions/common/extensions.js';
import { EditorLinkHandlerProvider, IOpenLinkWithArgs, OPEN_LINK_WITH_COMMAND_ID } from '../../browser/linkHandlers.js';

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

	suite('Open Link With command', () => {

		class TestQuickPick extends mock<IQuickPick<IQuickPickItem & { handler: ILinkHandler }>>() {
			readonly onDidAcceptEmitter = store.add(new Emitter<IQuickPickDidAcceptEvent>());
			readonly onDidHideEmitter = store.add(new Emitter<IQuickInputHideEvent>());
			readonly onDidTriggerItemButtonEmitter = store.add(new Emitter<IQuickPickItemButtonEvent<IQuickPickItem & { handler: ILinkHandler }>>());
			override readonly onDidAccept = this.onDidAcceptEmitter.event;
			override readonly onDidHide = this.onDidHideEmitter.event;
			override readonly onDidTriggerItemButton = this.onDidTriggerItemButtonEmitter.event;
			override items: readonly (IQuickPickItem & { handler: ILinkHandler })[] = [];
			override activeItems: readonly (IQuickPickItem & { handler: ILinkHandler })[] = [];
			override selectedItems: readonly (IQuickPickItem & { handler: ILinkHandler })[] = [];
			override keyMods: IKeyMods = { ctrlCmd: false, alt: false, shift: false };
			override placeholder: string | undefined;
			override busy = false;
			override canAcceptInBackground = false;
			override show() { }
			override hide() { this.onDidHideEmitter.fire({ reason: QuickInputHideReason.Other }); }
			override dispose() { }
		}

		async function runCommand(args: IOpenLinkWithArgs, interact: (picker: TestQuickPick) => void) {
			const opened: unknown[] = [];
			const handler = (id: string, isDefault: boolean, canSetAsDefault: boolean): ILinkHandler => ({
				id,
				label: `Label ${id}`,
				isDefault,
				open: async (options?: OpenInternalOptions) => {
					opened.push({ id, options });
					return true;
				},
				setAsDefault: canSetAsDefault ? async () => { opened.push({ setAsDefault: id }); } : undefined,
			});
			const picker = new TestQuickPick();
			const instantiationService = store.add(new TestInstantiationService());
			instantiationService.stub(IOpenerService, upcastPartial<IOpenerService>({
				getLinkHandlers: async () => [handler('second', true, true), handler('first', false, false)],
			}));
			instantiationService.stub(IQuickInputService, upcastPartial<IQuickInputService>({ createQuickPick: (() => picker) as IQuickInputService['createQuickPick'] }));
			instantiationService.stub(INotificationService, new TestNotificationService());
			instantiationService.stub(IKeybindingService, upcastPartial<IKeybindingService>({
				resolveKeybinding: () => [upcastPartial<ResolvedKeybinding>({ getLabel: () => 'Alt+Enter' })],
			}));

			const command = CommandsRegistry.getCommand(OPEN_LINK_WITH_COMMAND_ID);
			assert.ok(command);
			const result = instantiationService.invokeFunction(command.handler, args);
			await timeout(0);
			const shown = {
				placeholder: picker.placeholder,
				items: picker.items.map(item => ({ label: item.label, description: item.description, buttons: item.buttons?.map(button => button.tooltip) })),
				busy: picker.busy,
			};
			interact(picker);
			return { result: await result, shown, opened };
		}

		test('shows the handlers with the default first and opens the accepted one', async () => {
			assert.deepStrictEqual(await runCommand({ link: 'https://example.com', editorOptions: { pinned: true } }, picker => {
				picker.keyMods = { ctrlCmd: false, alt: true, shift: false };
				picker.selectedItems = [picker.items[1]];
				picker.onDidAcceptEmitter.fire({ inBackground: true });
			}), {
				result: true,
				shown: {
					placeholder: 'Select how to open \'https://example.com\'',
					items: [
						{ label: 'Label second', description: 'Default', buttons: ['Open to the Side (Alt+Enter)', 'Set as Default and Open'] },
						{ label: 'Label first', description: undefined, buttons: ['Open to the Side (Alt+Enter)'] },
					],
					busy: false,
				},
				opened: [{ id: 'first', options: { fromUserGesture: true, openToSide: true, editorOptions: { pinned: true, preserveFocus: true } } }],
			});
		});

		test('item buttons open to the side or set the default before opening', async () => {
			const toSide = await runCommand({ link: 'https://example.com' }, picker => {
				picker.onDidTriggerItemButtonEmitter.fire({ item: picker.items[0], button: picker.items[0].buttons![0] });
			});
			const setAsDefault = await runCommand({ link: 'https://example.com', openToSide: true }, picker => {
				picker.onDidTriggerItemButtonEmitter.fire({ item: picker.items[0], button: picker.items[0].buttons![1] });
			});
			const cancelled = await runCommand({ link: 'https://example.com' }, picker => picker.hide());

			assert.deepStrictEqual({ toSide: toSide.opened, setAsDefault: setAsDefault.opened, cancelled: { result: cancelled.result, opened: cancelled.opened } }, {
				toSide: [{ id: 'second', options: { fromUserGesture: true, openToSide: true, editorOptions: { preserveFocus: undefined } } }],
				setAsDefault: [
					{ setAsDefault: 'second' },
					{ id: 'second', options: { fromUserGesture: true, openToSide: true, editorOptions: { preserveFocus: undefined } } },
				],
				cancelled: { result: false, opened: [] },
			});
		});
	});
});
