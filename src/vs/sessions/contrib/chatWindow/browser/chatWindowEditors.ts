/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { EditorExtensions, EditorsOrder, IEditorFactoryRegistry } from '../../../../workbench/common/editor.js';
import { EditorInput } from '../../../../workbench/common/editor/editorInput.js';
import { IEditorGroup } from '../../../../workbench/services/editor/common/editorGroupsService.js';

/** An editor of the editor area of a chat window, serialized with the serializer of its editor type. */
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

/** Whether `value`, read from storage, is a serialized chat window editor. */
export function isSerializedChatWindowEditor(value: unknown): value is ISerializedChatWindowEditor {
	const candidate = value as Partial<ISerializedChatWindowEditor> | undefined;
	return typeof candidate?.typeId === 'string' && typeof candidate.value === 'string' && (candidate.active === undefined || typeof candidate.active === 'boolean');
}
