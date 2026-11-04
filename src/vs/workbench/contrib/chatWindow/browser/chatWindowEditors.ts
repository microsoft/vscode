/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../../base/common/uri.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { EditorExtensions, EditorsOrder, IEditorFactoryRegistry } from '../../../common/editor.js';
import { EditorInput } from '../../../common/editor/editorInput.js';
import { GroupsOrder, IContentPart, IEditorGroup, IEditorPart } from '../../../services/editor/common/editorGroupsService.js';
import { IChatWindow, IChatWindowChatPart, IChatWindowOpenOptions } from './chatWindow.js';

/** An editor of a chat window's main part, serialized with the serializer of its editor type. */
export interface ISerializedChatWindowEditor {
	readonly typeId: string;
	readonly value: string;
	readonly active?: boolean;
}

/** Serializes the editors of `group` that can be, in their order, marking the active one. */
export function serializeChatWindowEditors(group: IEditorGroup): ISerializedChatWindowEditor[] {
	const registry = Registry.as<IEditorFactoryRegistry>(EditorExtensions.EditorFactory);
	return group.getEditors(EditorsOrder.SEQUENTIAL).flatMap(editor => {
		const serializer = registry.getEditorSerializer(editor);
		const value = serializer?.canSerialize(editor) ? serializer.serialize(editor) : undefined;
		return value === undefined ? [] : [{ typeId: editor.typeId, value, active: editor === group.activeEditor }];
	});
}

/**
 * The editors `window` shows besides its chat, serialized, such as to open them in the main window as it closes: those of
 * its main part, those beside the chat in its chat part, such as tabs beside it, and those of the parts it created, such as
 * for editors dropped on its edges. The chat itself has no serializer and stays out.
 */
export function serializeChatWindowEditorsBesideChat(window: IChatWindow, createdParts: readonly IContentPart[]): ISerializedChatWindowEditor[] {
	return [...window.mainPart.groups, ...window.chatPart.groups, ...createdParts.flatMap(part => part.groups)].flatMap(group => serializeChatWindowEditors(group));
}

/** Deserializes what {@link serializeChatWindowEditors} serialized, skipping editors whose type is no longer available or that fail to deserialize. */
export function deserializeChatWindowEditors(instantiationService: IInstantiationService, editors: readonly ISerializedChatWindowEditor[], onError?: (error: unknown) => void): { readonly editors: EditorInput[]; readonly activeEditor: EditorInput | undefined } {
	const registry = Registry.as<IEditorFactoryRegistry>(EditorExtensions.EditorFactory);
	const inputs: EditorInput[] = [];
	let activeEditor: EditorInput | undefined;
	for (const { typeId, value, active } of editors) {
		let input: EditorInput | undefined;
		try {
			input = registry.getEditorSerializer(typeId)?.deserialize(instantiationService, value);
		} catch (error) {
			onError?.(error);
		}
		if (input) {
			inputs.push(input);
			if (active) {
				activeEditor = input;
			}
		}
	}
	return { editors: inputs, activeEditor };
}

/**
 * Closes `window` to open its chat in a chat window of its own again, with what it showed besides its chat: the editors
 * of its main part, the groups of its chat part, such as editors beside the chat, the parts it created, such as for
 * editors dropped on its edges, and its terminals.
 */
export async function reopenChatWindow(window: IChatWindow, instantiationService: IInstantiationService, open: (chat: URI, options: IChatWindowOpenOptions) => Promise<unknown>, parts: { readonly chatPart: IChatWindowChatPart | undefined; readonly createdParts: readonly IContentPart[] }): Promise<void> {
	const chat = window.chat.get();
	// Serialized, as closing the window disposes them, and opened again in the new window.
	const editors = window.mainPart.groups.flatMap(group => serializeChatWindowEditors(group));
	const createdParts = parts.createdParts.map(part => part.groups.flatMap(group => serializeChatWindowEditors(group))).filter(created => created.length > 0);
	const showTerminals = window.terminalsVisible.get();
	if (window.close()) {
		await open(chat, {
			editors: deserializeChatWindowEditors(instantiationService, editors),
			showTerminals,
			chatPart: parts.chatPart,
			createdParts: createdParts.length ? createdParts.map(created => deserializeChatWindowEditors(instantiationService, created)) : undefined,
		});
	}
}

/** Whether `value`, read from storage, is a serialized chat window editor. */
export function isSerializedChatWindowEditor(value: unknown): value is ISerializedChatWindowEditor {
	const candidate = value as Partial<ISerializedChatWindowEditor> | undefined;
	return typeof candidate?.typeId === 'string' && typeof candidate.value === 'string' && (candidate.active === undefined || typeof candidate.active === 'boolean');
}

/** The groups of a chat window's chat part to open it with again, if the part has more groups than the chat's own. */
export function captureChatPart(chatPart: IContentPart, chatInput: EditorInput): IChatWindowChatPart | undefined {
	const groups = chatPart.getGroups(GroupsOrder.GRID_APPEARANCE);
	const chatGroup = groups.findIndex(group => group.contains(chatInput));
	// Its groups, or the editors beside the chat in its group, as tabs
	const hasMore = groups.length > 1 || (chatGroup !== -1 && groups[chatGroup].count > 1);
	return hasMore && chatGroup !== -1 ? { state: chatPart.createState(), chatGroup } : undefined;
}

/** The group of a chat part, restored from what {@link captureChatPart} captured, to open the chat in: its own group, else the active one. */
export function getRestoredChatGroup(chatPart: IEditorPart, captured: IChatWindowChatPart | undefined): IEditorGroup {
	return (captured && chatPart.getGroups(GroupsOrder.GRID_APPEARANCE)[captured.chatGroup]) || chatPart.activeGroup;
}

/** Whether `value`, read from storage, is what {@link captureChatPart} captured. */
export function isChatWindowChatPart(value: unknown): value is IChatWindowChatPart {
	const candidate = value as Partial<IChatWindowChatPart> | undefined;
	return typeof candidate?.state === 'object' && candidate.state !== null && typeof candidate.chatGroup === 'number';
}
