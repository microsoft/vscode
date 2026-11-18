/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { toDisposable } from '../../../../../../base/common/lifecycle.js';
import { constObservable, observableValue } from '../../../../../../base/common/observable.js';
import { upcastPartial } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { IEditorService } from '../../../../../services/editor/common/editorService.js';
import { GroupModelChangeKind } from '../../../../../common/editor.js';
import { IAgentsViewProvidersService } from '../../../browser/agentsView/agentsViewProviders.js';
import { EditorWindowWorktreeCleanup } from '../../../browser/editorWindow/editorWindowWorktreeCleanup.js';
import { SessionWorktreeCleanupEditorInput } from '../../../browser/sessionInputBanners/sessionWorktreeCleanupEditorInput.js';
import { ISessionWorktreeCleanupService } from '../../../browser/sessionInputBanners/sessionWorktreeCleanupService.js';

suite('EditorWindowWorktreeCleanup', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('holds providers only while cleanup is open, including when it is not the active editor', () => {
		const changed = disposables.add(new Emitter<void>());
		const editors: SessionWorktreeCleanupEditorInput[] = [];
		const calls: string[] = [];
		disposables.add(new EditorWindowWorktreeCleanup(
			upcastPartial<IEditorService>({
				editors,
				onDidEditorsChange: Event.map(changed.event, () => ({ groupId: 1, event: { kind: GroupModelChangeKind.EDITOR_OPEN } })),
			}),
			upcastPartial<IAgentsViewProvidersService>({
				acquire: () => { calls.push('acquire'); return toDisposable(() => calls.push('release')); },
			}),
			upcastPartial<ISessionWorktreeCleanupService>({ isSchedulingCleanup: constObservable(false) }),
		));
		changed.fire();
		const initially = [...calls];
		editors.push(disposables.add(new SessionWorktreeCleanupEditorInput()));
		changed.fire();
		changed.fire();
		editors.pop();
		changed.fire();
		assert.deepStrictEqual({ initially, calls }, { initially: [], calls: ['acquire', 'release'] });
	});

	test('holds providers for an already open cleanup editor and releases them on disposal', () => {
		const calls: string[] = [];
		const contribution = disposables.add(new EditorWindowWorktreeCleanup(
			upcastPartial<IEditorService>({
				editors: [disposables.add(new SessionWorktreeCleanupEditorInput())],
				onDidEditorsChange: Event.None,
			}),
			upcastPartial<IAgentsViewProvidersService>({
				acquire: () => { calls.push('acquire'); return toDisposable(() => calls.push('release')); },
			}),
			upcastPartial<ISessionWorktreeCleanupService>({ isSchedulingCleanup: constObservable(false) }),
		));
		contribution.dispose();
		assert.deepStrictEqual(calls, ['acquire', 'release']);
	});

	test('keeps providers after closing cleanup until scheduling finishes', () => {
		const changed = disposables.add(new Emitter<void>());
		const editors = [disposables.add(new SessionWorktreeCleanupEditorInput())];
		const isSchedulingCleanup = observableValue('isSchedulingCleanup', false);
		const calls: string[] = [];
		disposables.add(new EditorWindowWorktreeCleanup(
			upcastPartial<IEditorService>({
				editors,
				onDidEditorsChange: Event.map(changed.event, () => ({ groupId: 1, event: { kind: GroupModelChangeKind.EDITOR_CLOSE } })),
			}),
			upcastPartial<IAgentsViewProvidersService>({
				acquire: () => { calls.push('acquire'); return toDisposable(() => calls.push('release')); },
			}),
			upcastPartial<ISessionWorktreeCleanupService>({ isSchedulingCleanup }),
		));
		isSchedulingCleanup.set(true, undefined);
		editors.pop();
		changed.fire();
		const whileScheduling = [...calls];
		isSchedulingCleanup.set(false, undefined);
		assert.deepStrictEqual({ whileScheduling, calls }, { whileScheduling: ['acquire'], calls: ['acquire', 'release'] });
	});
});
