/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { GroupIdentifier, IEditorIdentifier, isResourceEditorInput, IUntypedEditorInput } from '../../../../common/editor.js';
import { DiffEditorInput } from '../../../../common/editor/diffEditorInput.js';
import { IEditorService, IUntypedEditorReplacement } from '../../../../services/editor/common/editorService.js';
import { workbenchInstantiationService } from '../../../../test/browser/workbenchTestServices.js';
import { ImagePreviewEditorInput } from '../../browser/imagePreviewEditorInput.js';
import { reopenInTextEditor } from '../../browser/mediaPreviewErrors.js';

function describe(input: IUntypedEditorInput): object {
	return isResourceEditorInput(input) ? { resource: input.resource.toString(), override: input.options?.override } : {};
}

suite('Media Preview - reopenInTextEditor', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('replaces standalone previews and opens previews shown in diffs separately', async () => {
		const disposables = store.add(new DisposableStore());
		const instantiationService = workbenchInstantiationService(undefined, disposables);
		const original = URI.file('/images/before.png');
		const modified = URI.file('/images/after.png');
		const failing = disposables.add(instantiationService.createInstance(ImagePreviewEditorInput, modified, undefined));
		const other = disposables.add(instantiationService.createInstance(ImagePreviewEditorInput, URI.file('/images/other.png'), undefined));
		const diff = disposables.add(instantiationService.createInstance(DiffEditorInput, 'diff', undefined, disposables.add(instantiationService.createInstance(ImagePreviewEditorInput, original, undefined)), failing, true));

		const calls: { kind: string; groupId: GroupIdentifier; editor: object }[] = [];
		const editorService = new class extends mock<IEditorService>() {
			override getEditors(): readonly IEditorIdentifier[] {
				return [{ editor: failing, groupId: 1 }, { editor: other, groupId: 1 }, { editor: diff, groupId: 2 }];
			}
			override async replaceEditors(replacements: IUntypedEditorReplacement[], groupId: GroupIdentifier): Promise<void> {
				for (const { replacement } of replacements) {
					calls.push({ kind: 'replace', groupId, editor: describe(replacement) });
				}
			}
			override async openEditor(editor: unknown, groupId?: unknown): Promise<undefined> {
				calls.push({ kind: 'open', groupId: groupId as GroupIdentifier, editor: describe(editor as IUntypedEditorInput) });
				return undefined;
			}
		};

		await reopenInTextEditor(failing, editorService);

		assert.deepStrictEqual(calls, [
			{ kind: 'replace', groupId: 1, editor: { resource: modified.toString(), override: 'default' } },
			{ kind: 'open', groupId: 2, editor: { resource: modified.toString(), override: 'default' } },
		]);
	});
});
