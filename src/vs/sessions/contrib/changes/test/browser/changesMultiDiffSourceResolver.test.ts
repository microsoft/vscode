/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Event } from '../../../../../base/common/event.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { constObservable, derived, IObservable, observableValue, transaction } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock, upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { fromAgentHostUri, toAgentHostContentUri, toAgentHostUri } from '../../../../../platform/agentHost/common/agentHostUri.js';
import { IMultiDiffSourceResolver, IMultiDiffSourceResolverService } from '../../../../../workbench/contrib/multiDiffEditor/browser/multiDiffSourceResolverService.js';
import { IChat, ISession, ISessionFileChange } from '../../../../services/sessions/common/session.js';
import { ChangesMultiDiffSourceResolver } from '../../browser/changesMultiDiffSourceResolver.js';
import { ChangesViewMode } from '../../common/changes.js';
import { ISessionChangesService } from '../../common/sessionChangesService.js';
import { ISessionsService } from '../../../../services/sessions/browser/sessionsService.js';
import { IActiveSession, ISessionsManagementService } from '../../../../services/sessions/common/sessionsManagement.js';
import { IChangesSessionObservables, IChangesViewService } from '../../common/changesViewService.js';

function noSessions(): ISessionsService {
	return new class extends mock<ISessionsService>() {
		override readonly activeSession = constObservable<IActiveSession | undefined>(undefined);
		override readonly mainWindowActiveSession = constObservable<IActiveSession | undefined>(undefined);
		override readonly windowSessions = constObservable<readonly IActiveSession[]>([]);
		override readonly visibleSessions = constObservable<readonly (IActiveSession | undefined)[]>([]);
	}();
}

function noManagement(): ISessionsManagementService {
	return new class extends mock<ISessionsManagementService>() {
		override readonly onDidChangeSessions = Event.None;
		override getSession(): ISession | undefined { return undefined; }
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
			override getChatResource(): URI | undefined { return undefined; }
			override getSessionResource(resource: URI): URI | undefined {
				return resource.toString() === sourceResource.toString() ? sessionResource : undefined;
			}
		}();
		disposables.add(new ChangesMultiDiffSourceResolver(changesViewService, resolverService, sessionChangesService, noSessions(), noManagement()));
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
			override getChatResource(): URI | undefined { return undefined; }
			override getSessionResource(): URI { return sessionResource; }
		}();
		disposables.add(new ChangesMultiDiffSourceResolver(changesViewService, resolverService, sessionChangesService, sessionsService, noManagement()));
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
			override getChatResource(): URI | undefined { return undefined; }
			override getSessionResource(resource: URI): URI | undefined {
				return resource.toString() === sourceResource.toString() ? sessionResource : undefined;
			}
		}();
		disposables.add(new ChangesMultiDiffSourceResolver(changesViewService, resolverService, sessionChangesService, noSessions(), noManagement()));
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

	/** A session with two chats, X and Y, each with changes of its own, and the services a resolver reads them from. */
	function twoChats() {
		const sessionResource = URI.parse('agent-host:test-session');
		const chat = (name: string) => upcastPartial<IChat>({ resource: URI.parse(`agent-host-chat:/test-session/${name}`) });
		const chatX = chat('x');
		const chatY = chat('y');
		const session = upcastPartial<ISession>({ sessionId: 'test-session', resource: sessionResource, chats: constObservable<readonly IChat[]>([chatX, chatY]) });
		const changesOf = new Map([[chatX, observableValue<readonly ISessionFileChange[]>('x', [createChange('/workspace/x.ts')])], [chatY, observableValue<readonly ISessionFileChange[]>('y', [createChange('/workspace/y.ts')])]]);
		/** A wrapper of the session that shows `chat`, as a window does. */
		const wrapper = (activeChat: IChat) => upcastPartial<IActiveSession>({ sessionId: 'test-session', resource: sessionResource, activeChat: constObservable(activeChat) });
		const mainWindowWrapper = wrapper(chatX);
		const mainWindowActiveSession = observableValue<IActiveSession | undefined>('mainWindowActiveSession', mainWindowWrapper);
		const activeSession = observableValue<IActiveSession | undefined>('activeSession', mainWindowWrapper);
		const windowSessions = observableValue<readonly IActiveSession[]>('windowSessions', []);
		const visibleSessions = observableValue<readonly (IActiveSession | undefined)[]>('visibleSessions', [mainWindowWrapper]);
		const sessionsService = new class extends mock<ISessionsService>() {
			override readonly activeSession = activeSession;
			override readonly mainWindowActiveSession = mainWindowActiveSession;
			override readonly windowSessions = windowSessions;
			override readonly visibleSessions = visibleSessions;
		}();
		const management = new class extends mock<ISessionsManagementService>() {
			override readonly onDidChangeSessions = Event.None;
			override getSession(resource: URI): ISession | undefined { return resource.toString() === sessionResource.toString() ? session : undefined; }
		}();
		const changesViewService = new class extends mock<IChangesViewService>() {
			override readonly viewModeObs = observableValue<ChangesViewMode>(this, ChangesViewMode.List);
			// The main window's active session's changes: of its active chat.
			override readonly activeSessionResourceObs = derived(reader => mainWindowActiveSession.read(reader)?.resource);
			override readonly activeSessionChangesObs = derived(reader => {
				const active = mainWindowActiveSession.read(reader)?.activeChat.read(reader);
				return active ? changesOf.get(active)!.read(reader) : [];
			});
			override getSessionChanges(sessionObs: IObservable<ISession | undefined>, chatObs?: IObservable<IChat | undefined>): IChangesSessionObservables {
				const chatOf = chatObs ?? derived(reader => (sessionObs.read(reader) as IActiveSession | undefined)?.activeChat.read(reader));
				return upcastPartial<IChangesSessionObservables>({
					resourceObs: derived(reader => sessionObs.read(reader)?.resource),
					changesObs: derived(reader => {
						const of = chatOf.read(reader);
						return of ? changesOf.get(of)!.read(reader) : [];
					}),
				});
			}
		}();
		const sources = new Map([['x', URI.parse('changes-multi-diff-source:x')], ['y', URI.parse('changes-multi-diff-source:y')], ['main', URI.parse('changes-multi-diff-source:main')]]);
		const sessionChangesService = new class extends mock<ISessionChangesService>() {
			override getSessionResource(): URI { return sessionResource; }
			override getChatResource(resource: URI): URI | undefined {
				return resource.toString() === sources.get('x')!.toString() ? chatX.resource : resource.toString() === sources.get('y')!.toString() ? chatY.resource : undefined;
			}
		}();
		const resolver = disposables.add(new ChangesMultiDiffSourceResolver(changesViewService, new class extends mock<IMultiDiffSourceResolverService>() {
			override registerResolver() { return Disposable.None; }
		}(), sessionChangesService, sessionsService, management));
		return { resolver, sources, chatX, chatY, changesOf, wrapper, mainWindowActiveSession, activeSession, windowSessions, visibleSessions };
	}

	test('two Changes editors of two chats of a session, in one window, each show the changes of their own chat, whichever chat or session is active', async () => {
		const { resolver, sources, chatX, chatY, changesOf, wrapper, mainWindowActiveSession, activeSession } = twoChats();
		const x = await resolver.resolveDiffSource(sources.get('x')!);
		const y = await resolver.resolveDiffSource(sources.get('y')!);
		const files = () => ({ x: x.resources.value.map(item => item.modifiedUri!.path), y: y.resources.value.map(item => item.modifiedUri!.path) });
		const observed = [files()];
		// The main window shows chat Y, then another session; a window of chat Y has focus.
		mainWindowActiveSession.set(wrapper(chatY), undefined);
		observed.push(files());
		mainWindowActiveSession.set(undefined, undefined);
		activeSession.set(wrapper(chatY), undefined);
		observed.push(files());
		changesOf.get(chatX)!.set([createChange('/workspace/x2.ts')], undefined);
		observed.push(files());

		assert.deepStrictEqual(observed, [
			{ x: ['/workspace/x.ts'], y: ['/workspace/y.ts'] },
			{ x: ['/workspace/x.ts'], y: ['/workspace/y.ts'] },
			{ x: ['/workspace/x.ts'], y: ['/workspace/y.ts'] },
			{ x: ['/workspace/x2.ts'], y: ['/workspace/y.ts'] },
		]);
	});

	test('the main window\'s Changes editor shows the chat the main window shows, not the chat of another window of its session that has focus', async () => {
		const { resolver, sources, chatY, wrapper, activeSession } = twoChats();
		const main = await resolver.resolveDiffSource(sources.get('main')!);
		const files = () => main.resources.value.map(item => item.modifiedUri!.path);
		const observed = [files()];
		// A window that shows chat Y of the same session has focus: it is the active session.
		activeSession.set(wrapper(chatY), undefined);
		observed.push(files());

		assert.deepStrictEqual(observed, [['/workspace/x.ts'], ['/workspace/x.ts']]);
	});

	test('the main window\'s Changes editor, moved into a window that shows its session, such as when its chat opens in a window of its own, shows the chat that window shows', async () => {
		const { resolver, sources, chatY, wrapper, mainWindowActiveSession, activeSession, windowSessions, visibleSessions } = twoChats();
		const moved = await resolver.resolveDiffSource(sources.get('main')!);
		const files = () => moved.resources.value.map(item => item.modifiedUri!.path);
		const observed = [files()];
		// The session leaves the main window, which shows another session, for a window that shows its chat Y and has focus.
		const windowSession = wrapper(chatY);
		transaction(tx => {
			visibleSessions.set([], tx);
			mainWindowActiveSession.set(undefined, tx);
			windowSessions.set([windowSession], tx);
			activeSession.set(windowSession, tx);
		});
		observed.push(files());
		// Resolved again there, as the window's editor area restores or re-opens it.
		const reopened = await resolver.resolveDiffSource(sources.get('main')!);

		assert.deepStrictEqual({ observed, reopened: reopened.resources.value.map(item => item.modifiedUri!.path) }, { observed: [['/workspace/x.ts'], ['/workspace/y.ts']], reopened: ['/workspace/y.ts'] });
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
				override getChatResource(): URI | undefined { return undefined; }
				override getSessionResource() { return sessionResource; }
			}(),
			noSessions(),
			noManagement(),
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
					override getChatResource(): URI | undefined { return undefined; }
					override getSessionResource() { return sessionResource; }
				}(),
				noSessions(),
				noManagement(),
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
