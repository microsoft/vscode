/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { URI } from '../../../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../../base/test/common/utils.js';
import { IImageVariableEntry } from '../../../../common/attachments/chatVariableEntries.js';
import { ChatModeKind } from '../../../../common/constants.js';
import { IChatModelInputState } from '../../../../common/model/chatModel.js';
import { deserializeUntitledInputAttachments, deserializeUntitledInputState, serializeUntitledInputAttachments, serializeUntitledInputState } from '../../../../browser/widget/input/chatInputStatePersistence.js';

suite('ChatInputStatePersistence', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('stores image payloads separately from frequently updated input state', () => {
		const image: IImageVariableEntry = {
			id: 'image',
			kind: 'image',
			name: 'image.png',
			mimeType: 'image/png',
			value: new Uint8Array(64 * 1024).fill(42),
			references: [{ kind: 'reference', reference: URI.file('/image.png') }],
		};
		const state: IChatModelInputState = {
			attachments: [image],
			mode: { id: ChatModeKind.Agent, kind: ChatModeKind.Agent },
			selectedModel: undefined,
			inputText: 'hello',
			selections: [],
			contrib: {},
		};

		const serializedState = serializeUntitledInputState(state);
		const serializedAttachments = serializeUntitledInputAttachments(state.attachments);
		const restoredState = deserializeUntitledInputState(serializedState);
		const restoredImage = deserializeUntitledInputAttachments(serializedAttachments)[0];

		assert.deepStrictEqual({
			state: {
				attachments: restoredState.attachments,
				mode: restoredState.mode,
				inputText: restoredState.inputText,
			},
			attachment: {
				id: restoredImage.id,
				value: Array.from((restoredImage.value as Uint8Array).subarray(0, 3)),
				valueLength: (restoredImage.value as Uint8Array).byteLength,
				reference: restoredImage.references?.[0].reference,
			},
			stateRemainsSmall: serializedState.length < 1024,
			attachmentPayloadIsSeparate: !serializedState.includes('$base64') && serializedAttachments.includes('$base64'),
		}, {
			state: {
				attachments: [],
				mode: state.mode,
				inputText: state.inputText,
			},
			attachment: {
				id: image.id,
				value: [42, 42, 42],
				valueLength: 64 * 1024,
				reference: URI.file('/image.png'),
			},
			stateRemainsSmall: true,
			attachmentPayloadIsSeparate: true,
		});
	});
});
