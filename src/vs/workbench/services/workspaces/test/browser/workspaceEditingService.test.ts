/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { DidEnterWorkspaceEvent } from '../../browser/abstractWorkspaceEditingService.js';
import { BrowserWorkspaceEditingService } from '../../browser/workspaceEditingService.js';
import { UNKNOWN_EMPTY_WINDOW_WORKSPACE, WorkbenchState } from '../../../../../platform/workspace/common/workspace.js';
import { IResolvedFolderLocation } from '../../../../../platform/workspace/common/folderLocations.js';
import { extUri } from '../../../../../base/common/resources.js';
import { DeferredPromise, timeout } from '../../../../../base/common/async.js';

suite('WorkspaceEditingService', () => {

	suite('DidEnterWorkspaceEvent', () => {

		test('event captures old workspace and new workspace URI', () => {
			const oldWorkspace = { id: 'old-folder', uri: URI.file('/old/folder') };
			const newWorkspace = { id: 'new-workspace', configPath: URI.file('/test/workspace.code-workspace') };
			const event = new DidEnterWorkspaceEvent(oldWorkspace, newWorkspace);

			assert.strictEqual(event.oldWorkspace, oldWorkspace);
			assert.strictEqual(event.newWorkspace, newWorkspace);
		});

		test('join collects promises', async () => {
			const newWorkspace = { id: 'new-workspace', configPath: URI.file('/test/workspace.code-workspace') };
			const event = new DidEnterWorkspaceEvent(UNKNOWN_EMPTY_WINDOW_WORKSPACE, newWorkspace);

			let executed1 = false;
			let executed2 = false;

			event.join(
				(async () => { executed1 = true; })(),
			);

			event.join(
				(async () => { executed2 = true; })(),
			);

			await event.wait();

			assert.strictEqual(executed1, true, 'First promise should have executed');
			assert.strictEqual(executed2, true, 'Second promise should have executed');
		});

		test('wait resolves when all promises complete', async () => {
			const newWorkspace = { id: 'new-workspace', configPath: URI.file('/test/workspace.code-workspace') };
			const event = new DidEnterWorkspaceEvent(UNKNOWN_EMPTY_WINDOW_WORKSPACE, newWorkspace);

			let resolve1: () => void;
			let resolve2: () => void;
			const promise1 = new Promise<void>(r => { resolve1 = r; });
			const promise2 = new Promise<void>(r => { resolve2 = r; });

			event.join(promise1);
			event.join(promise2);

			let waitCompleted = false;
			const waitPromise = event.wait().then(() => { waitCompleted = true; });

			// Should not be completed yet
			await Promise.resolve();
			assert.strictEqual(waitCompleted, false);

			// Resolve first promise
			resolve1!();
			await Promise.resolve();
			assert.strictEqual(waitCompleted, false);

			// Resolve second promise
			resolve2!();
			await waitPromise;
			assert.strictEqual(waitCompleted, true);
		});

		test('wait resolves immediately when no promises are joined', async () => {
			const newWorkspace = { id: 'new-workspace', configPath: URI.file('/test/workspace.code-workspace') };
			const event = new DidEnterWorkspaceEvent(UNKNOWN_EMPTY_WINDOW_WORKSPACE, newWorkspace);

			await event.wait();
			// Should complete without error
		});
	});

	suite('setFolderLocation', () => {

		function trackingContext(primary: URI, switched: (URI | undefined)[]) {
			let current = primary;
			return {
				getWorkbenchState: () => WorkbenchState.FOLDER,
				getWorkspace: () => ({ folders: [{ uri: current }], uri: primary }),
				setFolderLocation: async (location: URI, o?: { onApplied?: () => void }) => { switched.push(location); current = location; o?.onApplied?.(); return true; }
			};
		}

		function createService(options: { current: URI; primaryTrusted: boolean; currentTrusted?: boolean; builtIn?: boolean; state?: WorkbenchState; confirmed?: boolean; destinationTrusted?: boolean; vetoReasons?: string[]; vetoConfirmed?: boolean; stopFails?: boolean }) {
			const trusted: URI[] = [];
			const prompts: string[] = [];
			const switchTrust: (boolean | undefined)[] = [];
			const trustLookups: URI[] = [];
			const resolved: URI[] = [];
			const switched: (URI | undefined)[] = [];
			const reasons: (string | undefined)[] = [];
			const events: string[] = [];
			const dialogs: { message: string; detail?: string; primaryButton?: string }[] = [];
			let current = options.current;
			const service = ds.add(new (BrowserWorkspaceEditingService as unknown as new (...args: unknown[]) => BrowserWorkspaceEditingService)(
				undefined,
				{
					getWorkbenchState: () => options.state ?? WorkbenchState.FOLDER,
					getWorkspace: () => ({ folders: [{ uri: current }], uri: URI.file('/work/project') }),
					getWorkspaceFolder: (uri: URI) => ({ uri, name: 'project' }),
					removeFolders: async (folders: URI[]) => { events.push(`removed:${folders.map(f => f.path).join(',')}`); },
					updateFolders: async () => { events.push('updated'); },
					setFolderLocation: async (location: URI, o?: { trusted?: boolean; onApplied?: () => void }) => { events.push('switch'); current = location; switched.push(location); switchTrust.push(o?.trusted); o?.onApplied?.(); return true; }
				},
				undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined,
				{
					confirm: async (dialog: { message: string; detail?: string; primaryButton?: string }) => {
						if (dialog.primaryButton) {
							dialogs.push(dialog);
							return { confirmed: options.vetoConfirmed ?? false };
						}
						prompts.push('trust');
						return { confirmed: options.confirmed ?? false };
					}
				},
				undefined,
				{ extUri },
				{
					isWorkspaceTrusted: () => options.currentTrusted ?? options.primaryTrusted,
					getUriTrustInfo: async (uri: URI) => { trustLookups.push(uri); return { trusted: extUri.isEqual(uri, URI.file('/work/project')) ? options.primaryTrusted : (options.destinationTrusted ?? false) || trusted.some(t => extUri.isEqual(t, uri)) }; },
					setUrisTrust: async (uris: URI[]) => { trusted.push(...uris); }
				},
				undefined, undefined,
				{ info: () => { } },
				{
					canSetLocation: () => (options.state ?? WorkbenchState.FOLDER) === WorkbenchState.FOLDER,
					resolveLocation: async (_primary: URI, location: URI) => { resolved.push(location); return { uri: location, label: 'L', providerId: 'test', builtIn: options.builtIn ?? true }; },
					setLocation: (_folder: unknown, _location: unknown, reason?: string) => { reasons.push(reason); }
				},
				{ isWorkspaceTrustEnabled: () => true }
			));
			ds.add(service.onWillRemoveFolders(e => {
				events.push(`willRemove:${e.folders.map(f => f.path).join(',')}`);
				if (options.vetoReasons) {
					e.veto(options.vetoReasons, async () => {
						events.push('stop');
						if (options.stopFails) {
							throw new Error('cannot stop');
						}
					});
				}
			}));
			(service as unknown as { createAndEnterWorkspace(): Promise<void> }).createAndEnterWorkspace = async () => { events.push('entered'); };
			return { service, reasons, events, dialogs, prompts, switchTrust, trustLookups: () => trustLookups.map(u => u.toString()), trusted: () => trusted.map(u => u.toString()), resolved: () => resolved.length, switched: () => switched.map(u => u?.toString()) };
		}

		test('a non-local location is rejected without resolving, trusting or switching', async () => {
			const fixture = createService({ current: URI.file('/work/project'), primaryTrusted: true });
			await assert.rejects(() => fixture.service.setFolderLocation(URI.parse('vscode-remote://host/work/alt')));
			assert.deepStrictEqual({ resolved: fixture.resolved(), trusted: fixture.trusted(), switched: fixture.switched() }, { resolved: 0, trusted: [], switched: [] });
		});

		test('the folder option must match the folder of the workspace, and multi-root workspaces are rejected', async () => {
			const fixture = createService({ current: URI.file('/work/project'), primaryTrusted: true });
			await fixture.service.setFolderLocation(URI.file('/work/alt'), { folder: URI.file('/work/project') });
			await assert.rejects(() => fixture.service.setFolderLocation(URI.file('/work/alt2'), { folder: URI.file('/work/other') }));

			const multiRoot = createService({ current: URI.file('/work/project'), primaryTrusted: true, state: WorkbenchState.WORKSPACE });
			await assert.rejects(() => multiRoot.service.setFolderLocation(URI.file('/work/alt'), { folder: URI.file('/work/project') }));

			assert.deepStrictEqual({ switched: fixture.switched(), multiRootSwitched: multiRoot.switched() }, { switched: [URI.file('/work/alt').toString()], multiRootSwitched: [] });
		});

		test('the reason of the request is propagated to the current location change', async () => {
			const fixture = createService({ current: URI.file('/work/project'), primaryTrusted: true });
			await fixture.service.setFolderLocation(URI.file('/work/alt'), { reason: 'user' });
			await fixture.service.setFolderLocation(URI.file('/work/alt'));
			assert.deepStrictEqual(fixture.reasons, ['user', undefined]);
		});

		test('removing folders asks by default unless the caller forces the change, and stops what runs once confirmed', async () => {
			const folder = URI.file('/work/other');
			const confirmed = createService({ current: URI.file('/work/project'), primaryTrusted: true, state: WorkbenchState.WORKSPACE, vetoReasons: ['A debug session is running.'], vetoConfirmed: true });
			await confirmed.service.removeFolders([folder]);
			const cancelled = createService({ current: URI.file('/work/project'), primaryTrusted: true, state: WorkbenchState.WORKSPACE, vetoReasons: ['A debug session is running.'], vetoConfirmed: false });
			await cancelled.service.removeFolders([folder]);
			const unattended = createService({ current: URI.file('/work/project'), primaryTrusted: true, state: WorkbenchState.WORKSPACE, vetoReasons: ['A debug session is running.'] });
			await unattended.service.removeFolders([folder], { force: true });
			assert.deepStrictEqual({
				confirmed: confirmed.events,
				dialog: confirmed.dialogs.map(({ message, detail, primaryButton }) => ({ message, detail, primaryButton })),
				cancelled: cancelled.events,
				unattended: unattended.events
			}, {
				confirmed: ['willRemove:/work/other', 'stop', 'removed:/work/other'],
				dialog: [{ message: `Remove the folder 'project'?`, detail: 'A debug session is running.\n\nRemoving stops them.', primaryButton: '&&Stop and Remove' }],
				cancelled: ['willRemove:/work/other'],
				unattended: ['removed:/work/other']
			});
		});

		test('a failure to stop what runs keeps the folder', async () => {
			const folder = URI.file('/work/other');
			const removal = createService({ current: URI.file('/work/project'), primaryTrusted: true, state: WorkbenchState.WORKSPACE, vetoReasons: ['A debug session is running.'], vetoConfirmed: true, stopFails: true });
			await assert.rejects(() => removal.service.removeFolders([folder]), /cannot stop/);
			const switching = createService({ current: URI.file('/work/project'), primaryTrusted: true, vetoReasons: ['A debug session is running.'], vetoConfirmed: true, stopFails: true });
			await assert.rejects(() => switching.service.setFolderLocation(URI.file('/work/alt'), { reason: 'user' }), /cannot stop/);
			assert.deepStrictEqual({ removal: removal.events, switching: switching.events }, { removal: ['willRemove:/work/other', 'stop'], switching: ['willRemove:/work/project', 'stop'] });
		});

		test('removing or replacing the only folder asks before entering a workspace', async () => {
			const project = URI.file('/work/project');
			const removal = createService({ current: project, primaryTrusted: true, vetoReasons: ['A debug session is running.'], vetoConfirmed: false });
			await removal.service.removeFolders([project]);
			const replacement = createService({ current: project, primaryTrusted: true, vetoReasons: ['A debug session is running.'], vetoConfirmed: true });
			await replacement.service.updateFolders(0, 1, [{ uri: URI.file('/work/other') }]);
			assert.deepStrictEqual({ removal: removal.events, replacement: replacement.events }, {
				removal: ['willRemove:/work/project'],
				replacement: ['willRemove:/work/project', 'stop', 'entered']
			});
		});

		test('an update only asks about the folders that leave the workspace', async () => {
			const a = URI.file('/work/a');
			const retained = createService({ current: a, primaryTrusted: true, state: WorkbenchState.WORKSPACE, vetoReasons: ['A debug session is running.'], vetoConfirmed: false });
			await retained.service.updateFolders(0, 1, [{ uri: a }, { uri: URI.file('/work/c') }]);
			const leaving = createService({ current: a, primaryTrusted: true, state: WorkbenchState.WORKSPACE, vetoReasons: ['A debug session is running.'], vetoConfirmed: true });
			await leaving.service.updateFolders(0, 1, [{ uri: URI.file('/work/c') }]);
			assert.deepStrictEqual({ retained: retained.events, leaving: leaving.events }, { retained: ['updated'], leaving: ['willRemove:/work/a', 'stop', 'updated'] });
		});

		test('a user switch that something vetoes asks, and stops what runs before switching once confirmed', async () => {
			const alt = URI.file('/work/alt');
			const fixture = createService({ current: URI.file('/work/project'), primaryTrusted: true, vetoReasons: ['A debug session is running.', 'The task \'build\' is running.'], vetoConfirmed: true });
			await fixture.service.setFolderLocation(alt, { reason: 'user' });
			assert.deepStrictEqual({ events: fixture.events, dialogs: fixture.dialogs.map(({ message, detail, primaryButton }) => ({ message, detail, primaryButton })) }, {
				events: ['willRemove:/work/project', 'stop', 'switch'],
				dialogs: [{ message: `Switch the folder to 'L'?`, detail: `A debug session is running.\nThe task 'build' is running.\n\nSwitching stops them.`, primaryButton: '&&Stop and Switch' }]
			});
		});

		test('cancelling the confirmation stops nothing, switches nothing and grants no trust', async () => {
			const fixture = createService({ current: URI.file('/work/project'), primaryTrusted: true, builtIn: false, vetoReasons: ['A debug session is running.'], vetoConfirmed: false });
			await fixture.service.setFolderLocation(URI.file('/work/alt'), { reason: 'user' });
			assert.deepStrictEqual({ events: fixture.events, trusted: fixture.trusted(), prompts: fixture.prompts, published: fixture.reasons }, { events: ['willRemove:/work/project'], trusted: [], prompts: [], published: [] });
		});

		test('a user switch nothing vetoes does not ask', async () => {
			const fixture = createService({ current: URI.file('/work/project'), primaryTrusted: true });
			await fixture.service.setFolderLocation(URI.file('/work/alt'), { reason: 'user' });
			assert.deepStrictEqual({ events: fixture.events, dialogs: fixture.dialogs.length }, { events: ['willRemove:/work/project', 'switch'], dialogs: 0 });
		});

		test('a switch asks by default, even without a reason, and force switches without asking', async () => {
			const asking = createService({ current: URI.file('/work/alt'), primaryTrusted: true, vetoReasons: ['A debug session is running.'], vetoConfirmed: false });
			await asking.service.setFolderLocation(URI.file('/work/project'));
			const skipping = createService({ current: URI.file('/work/alt'), primaryTrusted: true, vetoReasons: ['A debug session is running.'] });
			await skipping.service.setFolderLocation(URI.file('/work/project'), { force: true });
			assert.deepStrictEqual({ asking: asking.events, skipping: skipping.events, dialogs: skipping.dialogs.length }, { asking: ['willRemove:/work/alt'], skipping: ['switch'], dialogs: 0 });
		});

		test('an update and a single-folder replacement skip the veto when asked to', async () => {
			const project = URI.file('/work/project');
			const replacement = createService({ current: project, primaryTrusted: true, vetoReasons: ['A debug session is running.'] });
			await replacement.service.updateFolders(0, 1, [{ uri: URI.file('/work/other') }], { force: true });
			const workspace = createService({ current: project, primaryTrusted: true, state: WorkbenchState.WORKSPACE, vetoReasons: ['A debug session is running.'] });
			await workspace.service.updateFolders(0, 1, [{ uri: URI.file('/work/other') }], { force: true });
			assert.deepStrictEqual({ replacement: replacement.events, workspace: workspace.events }, { replacement: ['entered'], workspace: ['updated'] });
		});

		test('trust is inherited from the primary, not from the current location', async () => {
			const alt = URI.file('/work/alt');

			// Trusted current alternate, untrusted primary: no inheritance
			const untrustedPrimary = createService({ current: URI.file('/work/b'), primaryTrusted: false, currentTrusted: true });
			await untrustedPrimary.service.setFolderLocation(alt);

			// Untrusted current alternate, trusted primary: inheritance
			const trustedPrimary = createService({ current: URI.file('/work/b'), primaryTrusted: true, currentTrusted: false });
			await trustedPrimary.service.setFolderLocation(alt);

			assert.deepStrictEqual({ untrustedPrimary: untrustedPrimary.trusted(), trustedPrimary: trustedPrimary.trusted(), lookups: trustedPrimary.trustLookups() }, { untrustedPrimary: [], trustedPrimary: [alt.toString()], lookups: [alt.toString(), URI.file('/work/project').toString()] });
		});

		test('a pending switch is superseded by a later return to the primary', async () => {
			const primary = URI.file('/work/project');
			const alt = URI.file('/work/alt');
			const resolution = new DeferredPromise<IResolvedFolderLocation>();
			const switched: (URI | undefined)[] = [];
			const service = ds.add(new (BrowserWorkspaceEditingService as unknown as new (...args: unknown[]) => BrowserWorkspaceEditingService)(
				undefined,
				trackingContext(primary, switched),
				undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined,
				{ extUri },
				{ getUriTrustInfo: async () => ({ trusted: false }), setUrisTrust: async () => { } },
				undefined, undefined, undefined,
				{ canSetLocation: () => true, resolveLocation: () => resolution.p, setLocation: () => { } },
				{ isWorkspaceTrustEnabled: () => true }
			));

			const pending = service.setFolderLocation(alt);
			await service.setFolderLocation(primary);
			resolution.complete({ uri: alt, label: 'Alt', providerId: 'test', builtIn: false });
			await pending;

			assert.deepStrictEqual(switched.map(u => u?.toString()), [primary.toString()]);
		});

		test('an idle-only return does nothing while a switch is in flight', async () => {
			const primary = URI.file('/work/project');
			const alt = URI.file('/work/alt');
			const resolution = new DeferredPromise<IResolvedFolderLocation>();
			const switched: (URI | undefined)[] = [];
			const service = ds.add(new (BrowserWorkspaceEditingService as unknown as new (...args: unknown[]) => BrowserWorkspaceEditingService)(
				undefined,
				{ getWorkbenchState: () => WorkbenchState.FOLDER, getWorkspace: () => ({ folders: [{ uri: primary }], uri: primary }), setFolderLocation: async (location: URI) => { switched.push(location); } },
				undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, { confirm: async () => ({ confirmed: true }) },
				undefined,
				{ extUri },
				{ isWorkspaceTrusted: () => true, getUriTrustInfo: async () => ({ trusted: false }), setUrisTrust: async () => { } },
				undefined, undefined, undefined,
				{ canSetLocation: () => true, resolveLocation: () => resolution.p, setLocation: () => { } },
				{ isWorkspaceTrustEnabled: () => true }
			));

			const pending = service.setFolderLocation(alt);
			await service.setFolderLocation(primary, { ifIdle: true });
			resolution.complete({ uri: alt, label: 'Alt', providerId: 'test', builtIn: false });
			await pending;
			await service.setFolderLocation(primary, { ifIdle: true });

			assert.deepStrictEqual(switched.map(u => u?.toString()), [alt.toString(), primary.toString()]);
		});

		test('switching a trusted workspace to an untrusted location asks once, and declining still switches in Restricted Mode', async () => {
			const alt = URI.file('/work/alt');
			const declined = createService({ current: URI.file('/work/project'), primaryTrusted: true, builtIn: false, confirmed: false });
			await declined.service.setFolderLocation(alt);
			const accepted = createService({ current: URI.file('/work/project'), primaryTrusted: true, builtIn: false, confirmed: true });
			await accepted.service.setFolderLocation(alt);

			assert.deepStrictEqual({
				declined: { prompts: declined.prompts, trusted: declined.trusted(), switched: declined.switched(), switchTrust: declined.switchTrust },
				accepted: { prompts: accepted.prompts, trusted: accepted.trusted(), switched: accepted.switched(), switchTrust: accepted.switchTrust }
			}, {
				declined: { prompts: ['trust'], trusted: [], switched: [alt.toString()], switchTrust: [false] },
				accepted: { prompts: ['trust'], trusted: [alt.toString()], switched: [alt.toString()], switchTrust: [true] }
			});
		});

		test('an untrusted workspace switching to a trusted location loads it trusted, without asking', async () => {
			const fixture = createService({ current: URI.file('/work/project'), primaryTrusted: false, builtIn: false, destinationTrusted: true });
			await fixture.service.setFolderLocation(URI.file('/work/alt'));
			assert.deepStrictEqual({ prompts: fixture.prompts, switchTrust: fixture.switchTrust }, { prompts: [], switchTrust: [true] });
		});

		test('a built-in location of a trusted primary switches without asking', async () => {
			const fixture = createService({ current: URI.file('/work/project'), primaryTrusted: true, builtIn: true });
			await fixture.service.setFolderLocation(URI.file('/work/alt'));
			assert.deepStrictEqual({ prompts: fixture.prompts, switchTrust: fixture.switchTrust }, { prompts: [], switchTrust: [true] });
		});

		test('a switch superseded while the trust prompt is open persists no trust and does not switch', async () => {
			const primary = URI.file('/work/project');
			const alt = URI.file('/work/alt');
			const answer = new DeferredPromise<{ confirmed: boolean }>();
			const trusted: URI[] = [];
			const switched: (URI | undefined)[] = [];
			const service = ds.add(new (BrowserWorkspaceEditingService as unknown as new (...args: unknown[]) => BrowserWorkspaceEditingService)(
				undefined,
				trackingContext(primary, switched),
				undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined,
				{ confirm: () => answer.p },
				undefined,
				{ extUri },
				{ isWorkspaceTrusted: () => true, getUriTrustInfo: async (uri: URI) => ({ trusted: extUri.isEqual(uri, primary) }), setUrisTrust: async (uris: URI[]) => { trusted.push(...uris); } },
				undefined, undefined, undefined,
				{ canSetLocation: () => true, resolveLocation: async (_primary: URI, location: URI) => ({ uri: location, label: 'Alt', providerId: 'test', builtIn: false }), setLocation: () => { } },
				{ isWorkspaceTrustEnabled: () => true }
			));

			const pending = service.setFolderLocation(alt);
			await timeout(0);
			await service.setFolderLocation(primary);
			answer.complete({ confirmed: true });
			await pending;

			assert.deepStrictEqual({ trusted: trusted.map(u => u.toString()), switched: switched.map(u => u?.toString()) }, { trusted: [], switched: [primary.toString()] });
		});

		function createServiceWithPendingTrust() {
			const primary = URI.file('/work/project');
			const alt = URI.file('/work/alt');
			const trustInfo = new DeferredPromise<{ trusted: boolean }>();
			const trusted: URI[] = [];
			const switched: (URI | undefined)[] = [];
			const currentLocations: (IResolvedFolderLocation | undefined)[] = [];
			let folders = [{ uri: primary }];
			let identity = primary;
			const service = ds.add(new (BrowserWorkspaceEditingService as unknown as new (...args: unknown[]) => BrowserWorkspaceEditingService)(
				undefined,
				{ getWorkbenchState: () => WorkbenchState.FOLDER, getWorkspace: () => ({ folders, uri: identity }), setFolderLocation: async (location: URI, o?: { onApplied?: () => void }) => { switched.push(location); folders = [{ uri: location }]; o?.onApplied?.(); return true; } },
				undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined,
				{ extUri },
				{ isWorkspaceTrusted: () => true, getUriTrustInfo: (uri: URI) => extUri.isEqual(uri, primary) ? trustInfo.p : Promise.resolve({ trusted: false }), setUrisTrust: async (uris: URI[]) => { trusted.push(...uris); } },
				undefined, undefined, undefined,
				{ canSetLocation: () => true, resolveLocation: async (_primary: URI, location: URI) => ({ uri: location, label: 'Alt', providerId: 'test', builtIn: true }), setLocation: (_folder: unknown, location: IResolvedFolderLocation | undefined) => { currentLocations.push(location); } },
				{ isWorkspaceTrustEnabled: () => true }
			));
			return {
				service, primary, alt, trustInfo,
				changeWorkspace: () => {
					folders = [{ uri: URI.file('/work/other') }];
					identity = URI.file('/work/other');
				},
				state: () => ({ trusted: trusted.map(u => u.toString()), switched: switched.map(u => u?.toString()), currentLocations: currentLocations.length })
			};
		}

		test('a switch superseded while reading the primary trust grants no trust', async () => {
			const fixture = createServiceWithPendingTrust();
			const pending = fixture.service.setFolderLocation(fixture.alt);
			await timeout(0);
			await fixture.service.setFolderLocation(fixture.primary);
			fixture.trustInfo.complete({ trusted: true });
			await pending;

			assert.deepStrictEqual(fixture.state(), { trusted: [], switched: [fixture.primary.toString()], currentLocations: 1 });
		});

		test('returning to the primary settles the primary\'s own trust before switching', async () => {
			const primary = URI.file('/work/project');
			// Trusted alternate, untrusted primary: asked once, declining returns in Restricted Mode
			const declined = createService({ current: URI.file('/work/b'), primaryTrusted: false, currentTrusted: true, confirmed: false });
			await declined.service.setFolderLocation(primary);
			const accepted = createService({ current: URI.file('/work/b'), primaryTrusted: false, currentTrusted: true, confirmed: true });
			await accepted.service.setFolderLocation(primary);
			// Untrusted alternate, trusted primary: returns trusted without asking
			const trustedPrimary = createService({ current: URI.file('/work/b'), primaryTrusted: true, currentTrusted: false });
			await trustedPrimary.service.setFolderLocation(primary);

			assert.deepStrictEqual({
				declined: { prompts: declined.prompts, trusted: declined.trusted(), switchTrust: declined.switchTrust },
				accepted: { prompts: accepted.prompts, trusted: accepted.trusted(), switchTrust: accepted.switchTrust },
				trustedPrimary: { prompts: trustedPrimary.prompts, trusted: trustedPrimary.trusted(), switchTrust: trustedPrimary.switchTrust }
			}, {
				declined: { prompts: ['trust'], trusted: [], switchTrust: [false] },
				accepted: { prompts: ['trust'], trusted: [primary.toString()], switchTrust: [true] },
				trustedPrimary: { prompts: [], trusted: [], switchTrust: [true] }
			});
		});

		test('a switch superseded after its trust grant started keeps the grant and is not applied', async () => {
			const primary = URI.file('/work/project');
			const alt = URI.file('/work/alt');
			const grant = new DeferredPromise<void>();
			const trusted: URI[] = [];
			const switched: (URI | undefined)[] = [];
			const service = ds.add(new (BrowserWorkspaceEditingService as unknown as new (...args: unknown[]) => BrowserWorkspaceEditingService)(
				undefined,
				trackingContext(primary, switched),
				undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined,
				{ extUri },
				{ isWorkspaceTrusted: () => true, getUriTrustInfo: async (uri: URI) => ({ trusted: extUri.isEqual(uri, primary) }), setUrisTrust: async (uris: URI[]) => { trusted.push(...uris); await grant.p; } },
				undefined, undefined, undefined,
				{ canSetLocation: () => true, resolveLocation: async (_primary: URI, location: URI) => ({ uri: location, label: 'Alt', providerId: 'test', builtIn: true }), setLocation: () => { } },
				{ isWorkspaceTrustEnabled: () => true }
			));

			const pending = service.setFolderLocation(alt);
			await timeout(0);
			await service.setFolderLocation(primary);
			grant.complete();
			await pending;

			assert.deepStrictEqual({ trusted: trusted.map(u => u.toString()), switched: switched.map(u => u?.toString()) }, { trusted: [alt.toString()], switched: [primary.toString()] });
		});

		test('a completed switch does not attach its location to the folder of a newer switch', async () => {
			const primary = URI.file('/work/project');
			const first = URI.file('/work/first');
			const second = URI.file('/work/second');
			const firstApplied = new DeferredPromise<void>();
			let current = primary;
			const located: string[] = [];
			const service = ds.add(new (BrowserWorkspaceEditingService as unknown as new (...args: unknown[]) => BrowserWorkspaceEditingService)(
				undefined,
				{
					getWorkbenchState: () => WorkbenchState.FOLDER,
					getWorkspace: () => ({ folders: [{ uri: current }], uri: primary }),
					setFolderLocation: async (location: URI, o?: { onApplied?: () => void }) => {
						current = location;
						if (extUri.isEqual(location, first)) {
							await firstApplied.p;
						}
						o?.onApplied?.();
						return true;
					}
				},
				undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined,
				{ extUri },
				undefined, undefined, undefined, undefined,
				{ canSetLocation: () => true, resolveLocation: async (_primary: URI, location: URI) => ({ uri: location, label: 'L', providerId: 'test', builtIn: true }), setLocation: (_folder: unknown, location: { uri: URI }) => { located.push(location.uri.toString()); } },
				{ isWorkspaceTrustEnabled: () => false }
			));

			const pendingFirst = service.setFolderLocation(first);
			await timeout(0);
			await service.setFolderLocation(second);
			firstApplied.complete();
			await pendingFirst;

			assert.deepStrictEqual(located, [second.toString()]);
		});

		test('an applied switch publishes its location even when a newer attempt fails to resolve', async () => {
			const primary = URI.file('/work/project');
			const alt = URI.file('/work/alt');
			const unknown = URI.file('/work/unknown');
			const switched: (URI | undefined)[] = [];
			const located: (string | undefined)[] = [];
			const holds: DeferredPromise<void>[] = [];
			const context = trackingContext(primary, switched);
			const applyHeld = context.setFolderLocation;
			context.setFolderLocation = async (location, o) => {
				await holds[holds.length - 1].p;
				return applyHeld(location, o);
			};
			const service = ds.add(new (BrowserWorkspaceEditingService as unknown as new (...args: unknown[]) => BrowserWorkspaceEditingService)(
				undefined,
				context,
				undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined,
				{ extUri },
				undefined, undefined, undefined, undefined,
				{
					canSetLocation: () => true,
					resolveLocation: async (_primary: URI, location: URI) => extUri.isEqual(location, unknown) ? undefined : { uri: location, label: 'L', providerId: 'test', builtIn: true },
					setLocation: (_folder: unknown, location: { uri: URI } | undefined) => { located.push(location?.uri.toString()); }
				},
				{ isWorkspaceTrustEnabled: () => false }
			));

			const applyAfterFailedAttempt = async (location: URI) => {
				const hold = new DeferredPromise<void>();
				holds.push(hold);
				const pending = service.setFolderLocation(location);
				await timeout(0);
				await assert.rejects(() => service.setFolderLocation(unknown));
				hold.complete();
				await pending;
			};
			await applyAfterFailedAttempt(alt);
			await applyAfterFailedAttempt(primary);

			assert.deepStrictEqual({ located, switched: switched.map(u => u?.toString()) }, { located: [alt.toString(), undefined], switched: [alt.toString(), primary.toString()] });
		});

		test('a workspace change while reading the primary trust grants no trust and does not switch', async () => {
			const fixture = createServiceWithPendingTrust();
			const pending = fixture.service.setFolderLocation(fixture.alt);
			await timeout(0);
			fixture.changeWorkspace();
			fixture.trustInfo.complete({ trusted: true });
			await assert.rejects(() => pending);

			assert.deepStrictEqual(fixture.state(), { trusted: [], switched: [], currentLocations: 0 });
		});

		test('the last invocation wins regardless of resolution order', async () => {
			const primary = URI.file('/work/project');
			const first = URI.file('/work/first');
			const second = URI.file('/work/second');
			const resolutions = new Map<string, DeferredPromise<IResolvedFolderLocation>>([[first.toString(), new DeferredPromise()], [second.toString(), new DeferredPromise()]]);
			const switched: (URI | undefined)[] = [];
			const trusted: URI[] = [];

			const service = ds.add(new (BrowserWorkspaceEditingService as unknown as new (...args: unknown[]) => BrowserWorkspaceEditingService)(
				undefined,
				trackingContext(primary, switched),
				undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined,
				{ extUri },
				{ isWorkspaceTrusted: () => true, getUriTrustInfo: async (uri: URI) => ({ trusted: extUri.isEqual(uri, primary) }), setUrisTrust: async (uris: URI[]) => { trusted.push(...uris); } },
				undefined, undefined, undefined,
				{ canSetLocation: () => true, resolveLocation: (_primary: URI, location: URI) => resolutions.get(location.toString())!.p, setLocation: () => { } },
				{ isWorkspaceTrustEnabled: () => true }
			));

			const p1 = service.setFolderLocation(first);
			const p2 = service.setFolderLocation(second);
			resolutions.get(second.toString())!.complete({ uri: second, label: 'Second', providerId: 'test', builtIn: true });
			await p2;
			resolutions.get(first.toString())!.complete({ uri: first, label: 'First', providerId: 'test', builtIn: true });
			await p1;

			assert.deepStrictEqual({ switched: switched.map(u => u?.toString()), trusted: trusted.map(u => u.toString()) }, { switched: [second.toString()], trusted: [second.toString()] });
		});
	});

	const ds = ensureNoDisposablesAreLeakedInTestSuite();
});
