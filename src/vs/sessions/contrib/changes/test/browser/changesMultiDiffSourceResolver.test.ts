/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { constObservable, derived, IObservable, observableValue } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock, upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { fromAgentHostUri, toAgentHostContentUri, toAgentHostUri } from '../../../../../platform/agentHost/common/agentHostUri.js';
import { IMultiDiffSourceResolver, IMultiDiffSourceResolverService } from '../../../../../workbench/contrib/multiDiffEditor/browser/multiDiffSourceResolverService.js';
import { ISessionFileChange } from '../../../../services/sessions/common/session.js';
import { ChangesMultiDiffSourceResolver } from '../../browser/changesMultiDiffSourceResolver.js';
import { ChangesViewMode } from '../../common/changes.js';
import { ISessionChangesService } from '../../common/sessionChangesService.js';
import { ISessionsService } from '../../../../services/sessions/browser/sessionsService.js';
import { IActiveSession } from '../../../../services/sessions/common/sessionsManagement.js';
import { IChangesSessionObservables, IChangesViewService } from '../../common/changesViewService.js';

function noSessions(): ISessionsService {
	return new class extends mock<ISessionsService>() {
		override readonly activeSession = constObservable<IActiveSession | undefined>(undefined);
		override readonly mainWindowActiveSession = constObservable<IActiveSession | undefined>(undefined);
		override readonly windowSessions = constObservable<readonly IActiveSession[]>([]);
		override readonly visibleSessions = constObservable<readonly (IActiveSession | undefined)[]>([]);
	}();
}

suite('ChangesMultiDiffSourceResolver', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('publishes file changes while the active session remains loading', async () => {
		const sessionResource = URI.parse('agent-host:test-session');
		const sourceResource = URI.parse('changes-multi-diff-source:test-session');
		const branchChange = createChange('/workspace/branch.ts');
		const turnChange = createChange('/workspace/turn.ts');
		const activeChanges = observableValue<readonly ISessionFileChange[]>('activeChanges', [branchChange]);
		const loading = observableValue('loading', true);

		const changesViewService = new class extends mock<IChangesViewService>() {
			override readonly activeSessionResourceObs = observableValue<URI | undefined>(this, sessionResource);
			override readonly activeSessionChangesObs = activeChanges;
			override readonly activeSessionLoadingObs = loading;
			override readonly viewModeObs = observableValue<ChangesViewMode>(this, ChangesViewMode.List);
		}();
		let resolver: IMultiDiffSourceResolver | undefined;
		const resolverService = new class extends mock<IMultiDiffSourceResolverService>() {
			override registerResolver(value: IMultiDiffSourceResolver) {
				resolver = value;
				return Disposable.None;
			}
		}();
		const sessionChangesService = new class extends mock<ISessionChangesService>() {
			override getScopedChatResource(): URI | undefined { return undefined; }
			override getSessionResource(resource: URI): URI | undefined {
				return resource.toString() === sourceResource.toString() ? sessionResource : undefined;
			}
		}();
		disposables.add(new ChangesMultiDiffSourceResolver(changesViewService, resolverService, sessionChangesService, noSessions()));
		const source = await resolver!.resolveDiffSource(sourceResource);
		const observedChanges: string[][] = [];
		const recordChanges = () => observedChanges.push(source.resources.value.map(item => item.modifiedUri!.path));

		recordChanges();
		disposables.add(source.resources.onDidChange(recordChanges));
		activeChanges.set([turnChange], undefined);

		assert.deepStrictEqual(observedChanges, [
			['/workspace/branch.ts'],
			['/workspace/turn.ts'],
		]);
	});

	test('publishes the changes of a visible session that is not the active one', async () => {
		const sessionResource = URI.parse('agent-host:test-session');
		const sourceResource = URI.parse('changes-multi-diff-source:test-session');
		const sessionChanges = observableValue<readonly ISessionFileChange[]>('sessionChanges', [createChange('/workspace/visible.ts')]);
		let chainsCreated = 0;
		const visibleSession = upcastPartial<IActiveSession>({ sessionId: 'visible', resource: sessionResource });
		const sessionsService = new class extends mock<ISessionsService>() {
			override readonly activeSession = constObservable<IActiveSession | undefined>(upcastPartial<IActiveSession>({ sessionId: 'active', resource: URI.parse('agent-host:active') }));
			override readonly mainWindowActiveSession = constObservable<IActiveSession | undefined>(undefined);
			override readonly windowSessions = constObservable<readonly IActiveSession[]>([]);
			override readonly visibleSessions = constObservable<readonly (IActiveSession | undefined)[]>([visibleSession]);
		}();
		const changesViewService = new class extends mock<IChangesViewService>() {
			override readonly viewModeObs = observableValue<ChangesViewMode>(this, ChangesViewMode.List);
			override getSessionChanges() {
				chainsCreated++;
				return upcastPartial<IChangesSessionObservables>({ resourceObs: constObservable<URI | undefined>(sessionResource), changesObs: sessionChanges });
			}
		}();
		let resolver: IMultiDiffSourceResolver | undefined;
		const resolverService = new class extends mock<IMultiDiffSourceResolverService>() {
			override registerResolver(value: IMultiDiffSourceResolver) {
				resolver = value;
				return Disposable.None;
			}
		}();
		const sessionChangesService = new class extends mock<ISessionChangesService>() {
			override getScopedChatResource(): URI | undefined { return undefined; }
			override getSessionResource(): URI { return sessionResource; }
		}();
		disposables.add(new ChangesMultiDiffSourceResolver(changesViewService, resolverService, sessionChangesService, sessionsService));
		const source = await resolver!.resolveDiffSource(sourceResource);
		const observed: string[][] = [];
		const record = () => observed.push(source.resources.value.map(item => item.modifiedUri!.path));

		record();
		disposables.add(source.resources.onDidChange(record));
		sessionChanges.set([createChange('/workspace/updated.ts')], undefined);
		sessionChanges.set([createChange('/workspace/again.ts')], undefined);

		assert.deepStrictEqual(observed, [['/workspace/visible.ts'], ['/workspace/updated.ts'], ['/workspace/again.ts']]);
		assert.strictEqual(chainsCreated, 1);
	});

	test('publishes the changes of the chat its window shows, whichever chat of its session is active', async () => {
		const sessionResource = URI.parse('agent-host:test-session');
		const firstChat = URI.parse('agent-host:test-session/first');
		const secondChat = URI.parse('agent-host:test-session/second');
		const sourceResource = URI.parse('changes-multi-diff-source:test-session');
		const first = upcastPartial<IActiveSession>({ sessionId: 'session', resource: sessionResource, scopedChatResource: firstChat });
		const second = upcastPartial<IActiveSession>({ sessionId: 'session', resource: sessionResource, scopedChatResource: secondChat });
		const changesOf = new Map<IActiveSession, readonly ISessionFileChange[]>([[first, [createChange('/workspace/first.ts')]], [second, [createChange('/workspace/second.ts')]]]);
		const active = observableValue<IActiveSession | undefined>('active', first);
		const sessionsService = new class extends mock<ISessionsService>() {
			override readonly activeSession = active;
			override readonly mainWindowActiveSession = constObservable<IActiveSession | undefined>(undefined);
			override readonly windowSessions = constObservable<readonly IActiveSession[]>([first, second]);
			override readonly visibleSessions = constObservable<readonly (IActiveSession | undefined)[]>([]);
		}();
		const changesViewService = new class extends mock<IChangesViewService>() {
			override readonly viewModeObs = observableValue<ChangesViewMode>(this, ChangesViewMode.List);
			override getSessionChanges(session: IObservable<IActiveSession | undefined>) {
				return upcastPartial<IChangesSessionObservables>({
					resourceObs: constObservable<URI | undefined>(sessionResource),
					changesObs: derived(reader => changesOf.get(session.read(reader)!) ?? []),
				});
			}
		}();
		let resolver: IMultiDiffSourceResolver | undefined;
		const resolverService = new class extends mock<IMultiDiffSourceResolverService>() {
			override registerResolver(value: IMultiDiffSourceResolver) {
				resolver = value;
				return Disposable.None;
			}
		}();
		const sessionChangesService = new class extends mock<ISessionChangesService>() {
			override getSessionResource(): URI { return sessionResource; }
			override getScopedChatResource(): URI { return secondChat; }
		}();
		disposables.add(new ChangesMultiDiffSourceResolver(changesViewService, resolverService, sessionChangesService, sessionsService));
		const source = await resolver!.resolveDiffSource(sourceResource);
		const read = () => source.resources.value.map(item => item.modifiedUri!.path);
		disposables.add(source.resources.onDidChange(() => { }));

		const firstActive = read();
		active.set(second, undefined);
		const secondActive = read();
		assert.deepStrictEqual({ firstActive, secondActive }, { firstActive: ['/workspace/second.ts'], secondActive: ['/workspace/second.ts'] });
	});

	test('preserves the previous diff while another session is active', async () => {
		const sessionResource = URI.parse('agent-host:test-session');
		const otherSessionResource = URI.parse('agent-host:other-session');
		const sourceResource = URI.parse('changes-multi-diff-source:test-session');
		const branchChange = createChange('/workspace/branch.ts');
		const otherChange = createChange('/workspace/other.ts');
		const activeSessionResource = observableValue<URI | undefined>('activeSessionResource', sessionResource);
		const activeChanges = observableValue<readonly ISessionFileChange[]>('activeChanges', [branchChange]);

		const changesViewService = new class extends mock<IChangesViewService>() {
			override readonly activeSessionResourceObs = activeSessionResource;
			override readonly activeSessionChangesObs = activeChanges;
			override readonly viewModeObs = observableValue<ChangesViewMode>(this, ChangesViewMode.List);
		}();
		let resolver: IMultiDiffSourceResolver | undefined;
		const resolverService = new class extends mock<IMultiDiffSourceResolverService>() {
			override registerResolver(value: IMultiDiffSourceResolver) {
				resolver = value;
				return Disposable.None;
			}
		}();
		const sessionChangesService = new class extends mock<ISessionChangesService>() {
			override getScopedChatResource(): URI | undefined { return undefined; }
			override getSessionResource(resource: URI): URI | undefined {
				return resource.toString() === sourceResource.toString() ? sessionResource : undefined;
			}
		}();
		disposables.add(new ChangesMultiDiffSourceResolver(changesViewService, resolverService, sessionChangesService, noSessions()));
		const source = await resolver!.resolveDiffSource(sourceResource);
		const observedChanges: string[][] = [];
		const recordChanges = () => observedChanges.push(source.resources.value.map(item => item.modifiedUri!.path));

		recordChanges();
		disposables.add(source.resources.onDidChange(recordChanges));
		activeSessionResource.set(otherSessionResource, undefined);
		activeChanges.set([otherChange], undefined);

		assert.deepStrictEqual(observedChanges, [
			['/workspace/branch.ts'],
		]);
	});

	test('orders the diffs like the Changes view when its view mode changes', async () => {
		const sessionResource = URI.parse('agent-host:test-session');
		const viewMode = observableValue<ChangesViewMode>('viewMode', ChangesViewMode.List);
		const resolver = disposables.add(new ChangesMultiDiffSourceResolver(
			new class extends mock<IChangesViewService>() {
				override readonly activeSessionResourceObs = observableValue<URI | undefined>(this, sessionResource);
				override readonly activeSessionChangesObs = observableValue<readonly ISessionFileChange[]>(this, [
					createChange('/workspace/src/b.ts'),
					createChange('/workspace/a.ts'),
					createChange('/workspace/src/lib/c.ts'),
				]);
				override readonly viewModeObs = viewMode;
			}(),
			new class extends mock<IMultiDiffSourceResolverService>() {
				override registerResolver() { return Disposable.None; }
			}(),
			new class extends mock<ISessionChangesService>() {
				override getSessionResource() { return sessionResource; }
				override getScopedChatResource(): URI | undefined { return undefined; }
			}(),
			noSessions(),
		));
		const source = await resolver.resolveDiffSource(URI.parse('changes-multi-diff-source:test-session'));
		const observedChanges: string[][] = [];
		const recordChanges = () => observedChanges.push(source.resources.value.map(item => item.modifiedUri!.path));

		recordChanges();
		disposables.add(source.resources.onDidChange(recordChanges));
		viewMode.set(ChangesViewMode.Tree, undefined);
		viewMode.set(ChangesViewMode.List, undefined);

		assert.deepStrictEqual(observedChanges, [
			['/workspace/a.ts', '/workspace/src/b.ts', '/workspace/src/lib/c.ts'],
			['/workspace/src/lib/c.ts', '/workspace/src/b.ts', '/workspace/a.ts'],
			['/workspace/a.ts', '/workspace/src/b.ts', '/workspace/src/lib/c.ts'],
		]);
	});

	for (const { name, initial, updated } of [
		{ name: 'path', initial: { path: '/repo/docs/index.html' }, updated: { path: '/repo/src/index.html' } },
		{ name: 'scheme', initial: { scheme: 'other-file' }, updated: { scheme: 'another-file' } },
		{ name: 'authority', initial: { authority: 'first' }, updated: { authority: 'second' } },
		{ name: 'query', initial: { query: 'ref=main' }, updated: { query: 'ref=feature' } },
		{ name: 'fragment', initial: { fragment: 'L1' }, updated: { fragment: 'L2' } },
	]) {
		test(`keeps same-content files distinct and publishes ${name} updates`, async () => {
			const sessionResource = URI.parse('agent-host:test-session');
			const content = URI.parse('opaque-content://store/7f3a');
			const file = URI.file('/repo/index.html');
			const initialFile = file.with(initial);
			const updatedFile = file.with(updated);
			const makeChange = (file: URI): ISessionFileChange => ({
				uri: toAgentHostUri(file, 'remote'),
				modifiedUri: toAgentHostContentUri(content, 'remote', file),
				insertions: 1,
				deletions: 0,
			});
			const changes = observableValue<readonly ISessionFileChange[]>('changes', [
				makeChange(file),
				makeChange(initialFile),
			]);
			const resolver = disposables.add(new ChangesMultiDiffSourceResolver(
				new class extends mock<IChangesViewService>() {
					override readonly activeSessionResourceObs = observableValue<URI | undefined>(this, sessionResource);
					override readonly activeSessionChangesObs = changes;
					override readonly viewModeObs = observableValue<ChangesViewMode>(this, ChangesViewMode.List);
				}(),
				new class extends mock<IMultiDiffSourceResolverService>() {
					override registerResolver() { return Disposable.None; }
				}(),
				new class extends mock<ISessionChangesService>() {
					override getScopedChatResource(): URI | undefined { return undefined; }
					override getSessionResource() { return sessionResource; }
				}(),
				noSessions(),
			));
			const source = await resolver.resolveDiffSource(URI.parse('changes-multi-diff-source:test-session'));
			const snapshot = () => ({
				files: source.resources.value.map(item => ({
					labelPath: item.modifiedUri!.path,
					openFile: fromAgentHostUri(item.goToFileUri!).toString(),
					content: fromAgentHostUri(item.modifiedUri!).toString(),
				})).sort((a, b) => a.openFile.localeCompare(b.openFile)),
				unique: new Set(source.resources.value.map(item => item.getKey())).size,
			});
			const observed = [snapshot()];
			disposables.add(source.resources.onDidChange(() => observed.push(snapshot())));

			changes.set([makeChange(file), makeChange(updatedFile)], undefined);

			assert.deepStrictEqual(observed, [initialFile, updatedFile].map(changedFile => ({
				files: [file, changedFile].map(file => ({
					labelPath: file.path,
					openFile: file.toString(),
					content: content.toString(),
				})).sort((a, b) => a.openFile.localeCompare(b.openFile)),
				unique: 2,
			})));
		});
	}
});

function createChange(path: string): ISessionFileChange {
	const resource = URI.file(path);
	return upcastPartial<ISessionFileChange>({
		uri: resource,
		modifiedUri: resource,
	});
}
