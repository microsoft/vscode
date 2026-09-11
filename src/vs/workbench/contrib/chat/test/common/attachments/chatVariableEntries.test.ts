/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Codicon } from '../../../../../../base/common/codicons.js';
import { URI } from '../../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { getExplicitFileOrImageAttachmentSummary, IChatRequestVariableEntry, isChatContextIconPath, isExplicitFileOrImageVariableEntry, resolveChatContextIcon } from '../../../common/attachments/chatVariableEntries.js';
import { collectCanvasContextReferences, getCanvasContextReference, toCanvasContextVariableEntry, withCanvasVariableContext } from '../../../common/attachments/chatCanvasContext.js';
import { CanvasContextReferencesMetaKey, freezeCanvasMessageContext, withoutCanvasContextSnapshot } from '../../../../../../platform/agentHost/common/agentHostCanvasContext.js';
import { MessageKind, type Message } from '../../../../../../platform/agentHost/common/state/sessionState.js';
import { CanvasAvailabilityStatus, CanvasSourceKind, CanvasTrustStatus, type CanvasState } from '../../../../../../platform/agentHost/common/state/protocol/channels-canvas/state.js';

suite('Chat variable entries', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('identifies explicit file and image entries', () => {
		const fileEntry: IChatRequestVariableEntry = { kind: 'file', id: 'file', name: 'README.md', value: URI.file('/test/README.md') };
		const imageEntry: IChatRequestVariableEntry = { kind: 'image', id: 'image', name: 'screenshot.png', value: new Uint8Array(), mimeType: 'image/png' };
		const workspaceEntry: IChatRequestVariableEntry = { kind: 'workspace', id: 'workspace', name: 'workspace', value: 'workspace' };

		assert.strictEqual(isExplicitFileOrImageVariableEntry(fileEntry), true);
		assert.strictEqual(isExplicitFileOrImageVariableEntry(imageEntry), true);
		assert.strictEqual(isExplicitFileOrImageVariableEntry(workspaceEntry), false);
	});

	test('summarizes explicit file and image entries', () => {
		const fileEntry: IChatRequestVariableEntry = { kind: 'file', id: 'file', name: 'README.md', value: URI.file('/test/README.md') };
		const imageEntry1: IChatRequestVariableEntry = { kind: 'image', id: 'image-1', name: 'screenshot-1.png', value: new Uint8Array(), mimeType: 'image/png' };
		const imageEntry2: IChatRequestVariableEntry = { kind: 'image', id: 'image-2', name: 'screenshot-2.png', value: new Uint8Array(), mimeType: 'image/png' };

		assert.strictEqual(getExplicitFileOrImageAttachmentSummary([imageEntry1]), 'Attached 1 image');
		assert.strictEqual(getExplicitFileOrImageAttachmentSummary([imageEntry1, imageEntry2]), 'Attached 2 images');
		assert.strictEqual(getExplicitFileOrImageAttachmentSummary([fileEntry]), 'Attached 1 file');
		assert.strictEqual(getExplicitFileOrImageAttachmentSummary([fileEntry, imageEntry1]), 'Attached 2 files');
	});

	test('does not summarize hidden or automatic context entries', () => {
		const workspaceEntry: IChatRequestVariableEntry = { kind: 'workspace', id: 'workspace', name: 'workspace', value: 'workspace' };
		const implicitEntry: IChatRequestVariableEntry = { kind: 'implicit', id: 'implicit', name: 'implicit', value: undefined, uri: undefined, isFile: true, isSelection: false, enabled: true };
		const promptEntry: IChatRequestVariableEntry = { kind: 'promptText', id: 'prompt', name: 'prompt', value: 'instructions', modelDescription: 'instructions', automaticallyAdded: true };

		assert.strictEqual(getExplicitFileOrImageAttachmentSummary([workspaceEntry, implicitEntry, promptEntry]), undefined);
	});

	test('round trips element image data through export serialization', () => {
		const entry: IChatRequestVariableEntry = {
			kind: 'element',
			id: 'element',
			name: 'button',
			value: 'Element: button',
			imageData: new Uint8Array([1, 2, 3]),
			imageMimeType: 'image/jpeg',
		};

		const restored = IChatRequestVariableEntry.fromExport(IChatRequestVariableEntry.toExport(entry));

		assert.deepStrictEqual(
			restored.kind === 'element' && restored.imageData instanceof Uint8Array
				? { ...restored, imageData: Array.from(restored.imageData) }
				: restored,
			{ ...entry, imageData: [1, 2, 3] }
		);
	});

	suite('canvas context', () => {
		const reference = { resource: 'ahp-canvas:/selected', incarnation: 'first' };
		const message: Message = { text: 'My unchanged draft', origin: { kind: MessageKind.User } };

		test('round trips visible references without endpoint or generic attachment text', () => {
			const entry = toCanvasContextVariableEntry(reference, 'My canvas');
			const restored = IChatRequestVariableEntry.fromExport(IChatRequestVariableEntry.toExport(entry));
			assert.deepStrictEqual({
				reference: getCanvasContextReference(restored),
				submission: withCanvasVariableContext(message, [restored]),
				removed: withCanvasVariableContext(message, []),
			}, {
				reference,
				submission: { ...message, _meta: { [CanvasContextReferencesMetaKey]: [reference] } },
				removed: message,
			});
		});

		test('coalesces identical references and rejects conflicting incarnations', () => {
			const first = toCanvasContextVariableEntry(reference, 'First');
			const conflicting = toCanvasContextVariableEntry({ ...reference, incarnation: 'replacement' }, 'Replacement');
			assert.deepStrictEqual(collectCanvasContextReferences([first, first]), [reference]);
			assert.throws(() => collectCanvasContextReferences([first, conflicting]), /conflicting incarnations/);
		});

		test('rejects a malformed reference rather than treating it as ordinary text', () => {
			assert.throws(() => getCanvasContextReference({
				kind: 'generic', id: 'invalid', name: 'Canvas', value: { $mid: 'sessionCanvasContext', resource: 'https://example.com', incarnation: 'first' },
			}), /Invalid canvas context attachment/);
		});

		test('a host-frozen queue echo compares equal without submitting or freezing the context again', () => {
			const canvas: CanvasState = {
				resource: reference.resource, identity: {
					chat: 'ahp-chat:/session/main', source: { kind: CanvasSourceKind.Extension, extensionId: 'extension' },
					canvasType: 'counter', instanceId: 'one', incarnation: reference.incarnation,
				},
				title: 'Original title', trust: { status: CanvasTrustStatus.Trusted },
				availability: { status: CanvasAvailabilityStatus.NotLoaded }, revision: 1,
			};
			const submitted = withCanvasVariableContext(message, [toCanvasContextVariableEntry(reference, canvas.title)]);
			const frozen = freezeCanvasMessageContext(submitted, canvas.identity.chat, 'client', () => canvas);
			assert.deepStrictEqual(withoutCanvasContextSnapshot(frozen), submitted);
		});
	});

	suite('resolveChatContextIcon', () => {
		const light = URI.file('/icons/light.svg');
		const dark = URI.file('/icons/dark.svg');

		test('returns the theme icon unchanged', () => {
			assert.strictEqual(resolveChatContextIcon(Codicon.gitPullRequest, false), Codicon.gitPullRequest);
			assert.strictEqual(resolveChatContextIcon(Codicon.gitPullRequest, true), Codicon.gitPullRequest);
		});

		test('returns a single uri unchanged for both themes', () => {
			const uri = URI.file('/icons/icon.svg');
			assert.strictEqual(resolveChatContextIcon(uri, false), uri);
			assert.strictEqual(resolveChatContextIcon(uri, true), uri);
		});

		test('picks the light uri in a light theme', () => {
			assert.strictEqual(resolveChatContextIcon({ light, dark }, false), light);
		});

		test('picks the dark uri in a dark theme', () => {
			assert.strictEqual(resolveChatContextIcon({ light, dark }, true), dark);
		});
	});

	suite('isChatContextIconPath', () => {
		const light = URI.file('/icons/light.svg');
		const dark = URI.file('/icons/dark.svg');

		test('accepts theme icons, single uris and complete light/dark objects', () => {
			assert.strictEqual(isChatContextIconPath(Codicon.gitPullRequest), true);
			assert.strictEqual(isChatContextIconPath(URI.file('/icons/icon.svg')), true);
			assert.strictEqual(isChatContextIconPath({ light, dark }), true);
		});

		test('rejects null, undefined and partial light/dark objects', () => {
			assert.strictEqual(isChatContextIconPath(null), false);
			assert.strictEqual(isChatContextIconPath(undefined), false);
			assert.strictEqual(isChatContextIconPath({ dark }), false);
			assert.strictEqual(isChatContextIconPath({ light }), false);
			assert.strictEqual(isChatContextIconPath({}), false);
		});
	});
});