/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise, timeout } from '../../../../../../base/common/async.js';
import { constObservable, derived, observableValue } from '../../../../../../base/common/observable.js';
import { URI } from '../../../../../../base/common/uri.js';
import { mock } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IInstantiationService } from '../../../../../../platform/instantiation/common/instantiation.js';
import { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { IUntypedEditorInput, isResourceEditorInput } from '../../../../../common/editor.js';
import { IEditorService } from '../../../../../services/editor/common/editorService.js';
import { AcceptAction, AcceptHunkAction, RejectAction, RejectHunkAction } from '../../../browser/chatEditing/chatEditingEditorActions.js';
import { findChatEditingSessionEntry, IChatEditReviewSession, IModifiedFileEntry, IModifiedFileEntryEditorIntegration, ModifiedFileEntryState } from '../../../common/editing/chatEditingService.js';
import { ChatConfiguration } from '../../../common/constants.js';

suite('Chat editing editor actions', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function entry(path: string, state = ModifiedFileEntryState.Modified, changes = 1): IModifiedFileEntry {
		return new class extends mock<IModifiedFileEntry>() {
			override readonly modifiedURI = URI.file(path);
			override readonly state = observableValue('state', state);
			override readonly changesCount = constObservable(changes);
		}();
	}

	function session(initialEntries: readonly IModifiedFileEntry[]) {
		return new class extends mock<IChatEditReviewSession>() {
			override readonly entries = observableValue('entries', initialEntries);
			override getEntry(uri: URI) { return this.entries.get().find(entry => entry.modifiedURI.path === uri.path); }
			override readEntry(uri: URI, reader: Parameters<IChatEditReviewSession['readEntry']>[1]) {
				return this.entries.read(reader).find(entry => entry.modifiedURI.path === uri.path);
			}
		}();
	}

	test('a settled entry cannot hide a pending entry in another session', () => {
		const first = session([entry('/file.ts', ModifiedFileEntryState.Accepted)]);
		const second = session([entry('/file.ts')]);
		const selected = derived(reader => findChatEditingSessionEntry([first, second], URI.file('/file.ts'), reader)?.session);
		const before = selected.get();
		first.entries.set([entry('/file.ts')], undefined);
		assert.deepStrictEqual([before === second, selected.get() === first], [true, true]);
	});

	for (const keep of [true, false]) {
		for (const hunk of [true, false]) {
			for (const succeeds of [true, false]) {
				test(`${keep ? 'Keep' : 'Undo'} ${hunk ? 'hunk' : 'file'} waits for completion before navigating (success: ${succeeds})`, async () => {
					const instantiation = store.add(new TestInstantiationService());
					instantiation.stub(IInstantiationService, instantiation);
					instantiation.stub(IConfigurationService, new TestConfigurationService({ [ChatConfiguration.RevealNextChangeOnResolve]: true }));
					const opened: string[] = [];
					instantiation.stub(IEditorService, new class extends mock<IEditorService>() {
						override async openEditor(input: IUntypedEditorInput) {
							if (isResourceEditorInput(input)) {
								opened.push(input.resource.path);
							}
							return undefined;
						}
					});
					const first = entry('/first.ts');
					const second = entry('/second.ts');
					const review = session([first, second]);
					const gate = new DeferredPromise<void>();
					const resolve = async () => {
						await gate.p;
						if (succeeds) {
							review.entries.set([second], undefined);
						}
					};
					review.accept = resolve;
					review.reject = resolve;
					const integration = new class extends mock<IModifiedFileEntryEditorIntegration>() {
						override acceptNearestChange = resolve;
						override rejectNearestChange = resolve;
					}();
					const action = hunk
						? keep ? new AcceptHunkAction() : new RejectHunkAction()
						: keep ? new AcceptAction() : new RejectAction();
					const pending = instantiation.invokeFunction(accessor => action.runChatEditingCommand(accessor, review, first, integration));
					await timeout(0);
					const beforeCompletion = [...opened];
					gate.complete();
					await pending;
					assert.deepStrictEqual({ beforeCompletion, opened }, { beforeCompletion: [], opened: succeeds ? ['/second.ts'] : [] });
				});
			}
		}
	}

	test('resolving the last file does not try to navigate an empty session', async () => {
		const instantiation = store.add(new TestInstantiationService());
		instantiation.stub(IInstantiationService, instantiation);
		instantiation.stub(IConfigurationService, new TestConfigurationService({ [ChatConfiguration.RevealNextChangeOnResolve]: true }));
		const opened: IUntypedEditorInput[] = [];
		instantiation.stub(IEditorService, new class extends mock<IEditorService>() {
			override async openEditor(input: IUntypedEditorInput) { opened.push(input); return undefined; }
		});
		const first = entry('/first.ts');
		const review = session([first]);
		review.accept = async () => { review.entries.set([], undefined); };
		await instantiation.invokeFunction(accessor => new AcceptAction().runChatEditingCommand(accessor, review, first, new class extends mock<IModifiedFileEntryEditorIntegration>() { }()));
		assert.deepStrictEqual(opened, []);
	});

	for (const replacement of [false, true]) {
		test(`deferred decisions navigate to newly published entries (replacement: ${replacement})`, async () => {
			const instantiation = store.add(new TestInstantiationService());
			instantiation.stub(IInstantiationService, instantiation);
			instantiation.stub(IConfigurationService, new TestConfigurationService({ [ChatConfiguration.RevealNextChangeOnResolve]: true }));
			const opened: string[] = [];
			instantiation.stub(IEditorService, new class extends mock<IEditorService>() {
				override async openEditor(input: IUntypedEditorInput) {
					if (isResourceEditorInput(input)) {
						opened.push(input.resource.path);
					}
					return undefined;
				}
			});
			const first = entry('/first.ts');
			const third = entry('/third.ts');
			const review = session(replacement ? [first, entry('/second.ts'), third] : [first]);
			const gate = new DeferredPromise<void>();
			review.accept = async () => {
				await gate.p;
				review.entries.set([entry('/second.ts'), third], undefined);
			};
			const pending = instantiation.invokeFunction(accessor => new AcceptAction().runChatEditingCommand(accessor, review, first, new class extends mock<IModifiedFileEntryEditorIntegration>() { }()));
			await timeout(0);
			const beforeCompletion = [...opened];
			gate.complete();
			await pending;
			assert.deepStrictEqual({ beforeCompletion, opened }, { beforeCompletion: [], opened: ['/second.ts'] });
		});
	}

	test('resolving the last hunk does not reopen the same entry while its state is settling', async () => {
		const instantiation = store.add(new TestInstantiationService());
		instantiation.stub(IInstantiationService, instantiation);
		instantiation.stub(IConfigurationService, new TestConfigurationService({ [ChatConfiguration.RevealNextChangeOnResolve]: true }));
		const opened: IUntypedEditorInput[] = [];
		instantiation.stub(IEditorService, new class extends mock<IEditorService>() {
			override async openEditor(input: IUntypedEditorInput) { opened.push(input); return undefined; }
		});
		const first = entry('/first.ts', ModifiedFileEntryState.Modified, 0);
		const review = session([first]);
		const integration = new class extends mock<IModifiedFileEntryEditorIntegration>() {
			override async acceptNearestChange() { }
		}();
		await instantiation.invokeFunction(accessor => new AcceptHunkAction().runChatEditingCommand(accessor, review, first, integration));
		assert.deepStrictEqual(opened, []);
	});
});
