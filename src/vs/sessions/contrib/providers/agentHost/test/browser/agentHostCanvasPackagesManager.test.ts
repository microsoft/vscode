/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise } from '../../../../../../base/common/async.js';
import { Emitter } from '../../../../../../base/common/event.js';
import { constObservable } from '../../../../../../base/common/observable.js';
import { URI } from '../../../../../../base/common/uri.js';
import { mock, upcastPartial } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import type { IAgentConnection } from '../../../../../../platform/agentHost/common/agentService.js';
import type { IAgentHostCanvasPackage, IAgentHostCanvasPackagesClient } from '../../../../../../platform/agentHost/common/agentHostCanvasPackages.js';
import { IAgentHostConnectionsService } from '../../../../../../platform/agentHost/common/agentHostConnectionsService.js';
import { ICommandService } from '../../../../../../platform/commands/common/commands.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { IDialogService, IFileDialogService, type IConfirmation, type IConfirmationResult } from '../../../../../../platform/dialogs/common/dialogs.js';
import { INotificationService } from '../../../../../../platform/notification/common/notification.js';
import { IOpenerService } from '../../../../../../platform/opener/common/opener.js';
import { QuickInputHideReason, type IPickOptions, type IQuickInputHideEvent, type IQuickInputService, type IQuickPick, type IQuickPickDidAcceptEvent, type IQuickPickItem, type IQuickPickSeparator, type QuickPickInput } from '../../../../../../platform/quickinput/common/quickInput.js';
import { FileSystemProviderErrorCode, IFileService, createFileSystemProviderError } from '../../../../../../platform/files/common/files.js';
import type { ServicesAccessor } from '../../../../../../platform/instantiation/common/instantiation.js';
import { IWorkspaceTrustManagementService, IWorkspaceTrustRequestService } from '../../../../../../platform/workspace/common/workspaceTrust.js';
import { IEditorService } from '../../../../../../workbench/services/editor/common/editorService.js';
import { ISessionsService } from '../../../../../services/sessions/browser/sessionsService.js';
import type { IActiveSession } from '../../../../../services/sessions/common/sessionsManagement.js';
import { AgentHostCanvasPackagesManager, CANVAS_AUTHORING_TEMPLATE_FILES, createLocalCanvasPackage } from '../../browser/agentHostCanvasPackages.contribution.js';
import { isEqual, joinPath } from '../../../../../../base/common/resources.js';

suite('AgentHostCanvasPackagesManager', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function pkg(overrides: Partial<IAgentHostCanvasPackage> = {}): IAgentHostCanvasPackage {
		return {
			id: 'pkg-1', name: 'Test Package', source: 'file:///source', snapshot: 'file:///snapshot',
			revision: 'rev1', fileCount: 3, byteLength: 1024, approval: undefined,
			...overrides,
		};
	}

	/** Minimal quick-pick fixture: only what {@link AgentHostCanvasPackagesManager.manage} touches. */
	function quickPickFixture(actionLabel?: string, onPick?: () => void) {
		const shown = new DeferredPromise<void>();
		const listed = new DeferredPromise<void>();
		const redisplayed = new DeferredPromise<void>();
		let showCount = 0;
		let picker: { hide(): void; busy: boolean } | undefined;
		let accepted: Emitter<IQuickPickDidAcceptEvent> | undefined;
		let hidden: Emitter<IQuickInputHideEvent> | undefined;
		let selected: IQuickPickItem[] = [];
		let itemsSet: QuickPickInput<IQuickPickItem>[] = [];
		let actions: readonly IQuickPickItem[] = [];
		const service = new class extends mock<IQuickInputService>() {
			override pick<T extends IQuickPickItem>(picks: Promise<QuickPickInput<T>[]> | QuickPickInput<T>[], options: IPickOptions<T> & { canPickMany: true }): Promise<T[] | undefined>;
			override pick<T extends IQuickPickItem>(picks: Promise<QuickPickInput<T>[]> | QuickPickInput<T>[], options?: Omit<IPickOptions<T>, 'canPickMany'>): Promise<T | undefined>;
			override async pick<T extends IQuickPickItem>(picks: Promise<QuickPickInput<T>[]> | QuickPickInput<T>[], options?: IPickOptions<T>): Promise<T[] | T | undefined> {
				const items = (await picks).filter((item): item is T => item.type !== 'separator');
				actions = items;
				onPick?.();
				const item = items.find(item => item.label === actionLabel);
				return options?.canPickMany ? (item ? [item] : undefined) : item;
			}
			override createQuickPick<T extends IQuickPickItem>(_options?: { useSeparators: boolean }): any {
				accepted = store.add(new Emitter<IQuickPickDidAcceptEvent>());
				hidden = store.add(new Emitter<IQuickInputHideEvent>());
				let items: ReadonlyArray<T | IQuickPickSeparator> = [];
				let busy = false;
				let visible = false;
				const p = upcastPartial<IQuickPick<T, { useSeparators: true }>>({
					get items() { return items; },
					set items(value: ReadonlyArray<T | IQuickPickSeparator>) { items = value; itemsSet = value as unknown as QuickPickInput<IQuickPickItem>[]; void listed.complete(); },
					get selectedItems() { return selected as unknown as readonly T[]; },
					set selectedItems(value: readonly T[]) { selected = value as unknown as IQuickPickItem[]; },
					get busy() { return busy; },
					set busy(value: boolean) { busy = value; },
					onDidAccept: accepted.event,
					onDidHide: hidden.event,
					show: () => { visible = true; void (showCount++ === 0 ? shown : redisplayed).complete(); },
					hide: () => {
						if (visible) {
							visible = false;
							hidden!.fire({ reason: QuickInputHideReason.Gesture });
						}
					},
					dispose: () => { accepted!.dispose(); hidden!.dispose(); },
				});
				picker = { hide: () => p.hide(), get busy() { return p.busy; } };
				return p;
			}
		};
		return {
			service, shown, listed, redisplayed,
			accept: (item: IQuickPickItem) => { selected = [item]; accepted!.fire({ inBackground: false }); },
			hide: () => picker!.hide(),
			currentItems: () => itemsSet,
			actionItems: () => actions,
			isBusy: () => picker!.busy,
		};
	}

	function services(overrides: {
		client?: IAgentHostCanvasPackagesClient;
		settingEnabled?: boolean;
		quickInputService?: IQuickInputService;
		showOpenDialog?: () => Promise<URI[] | undefined>;
		confirm?: (confirmation: IConfirmation) => Promise<IConfirmationResult>;
		isWorkspaceTrusted?: boolean;
		requestResourcesTrust?: () => Promise<boolean | undefined>;
		sessionId?: string;
		sessionFolder?: URI;
	} = {}) {
		const notifications: { kind: 'info' | 'warn' | 'error'; message: string }[] = [];
		const approveCalls: { id: string; revision: string; workspace: URI | undefined }[] = [];
		const client: IAgentHostCanvasPackagesClient = overrides.client ?? {
			list: async () => [pkg()],
			prepare: async () => { throw new Error('unused'); },
			approve: async (id, revision, workspace) => { approveCalls.push({ id, revision, workspace }); },
			revoke: async () => { },
			remove: async () => { },
		};
		const connectionsService = new class extends mock<IAgentHostConnectionsService>() {
			override get ambientConnection(): IAgentConnection {
				return upcastPartial<IAgentConnection>({ canvasPackages: client, initializeResult: constObservable(undefined) });
			}
		};
		const configurationService = new class extends mock<IConfigurationService>() {
			override getValue(): unknown { return overrides.settingEnabled ?? true; }
		};
		const dialogService = new class extends mock<IDialogService>() {
			override confirm(confirmation: IConfirmation): Promise<IConfirmationResult> {
				return overrides.confirm ? overrides.confirm(confirmation) : Promise.resolve({ confirmed: true });
			}
		};
		const notificationService = new class extends mock<INotificationService>() {
			override info(message: string): void { notifications.push({ kind: 'info', message }); }
			override warn(message: string): void { notifications.push({ kind: 'warn', message }); }
			override error(message: string): void { notifications.push({ kind: 'error', message }); }
		};
		const fileDialogService = new class extends mock<IFileDialogService>() {
			override showOpenDialog(): Promise<URI[] | undefined> {
				return overrides.showOpenDialog ? overrides.showOpenDialog() : Promise.resolve(undefined);
			}
		};
		const workspaceTrustManagementService = new class extends mock<IWorkspaceTrustManagementService>() {
			override isWorkspaceTrusted(): boolean { return overrides.isWorkspaceTrusted ?? true; }
		};
		const workspaceTrustRequestService = new class extends mock<IWorkspaceTrustRequestService>() {
			override requestResourcesTrust(): Promise<boolean | undefined> {
				return overrides.requestResourcesTrust ? overrides.requestResourcesTrust() : Promise.resolve(true);
			}
		};
		let sessionId = overrides.sessionId ?? 'session-1';
		let sessionFolder: URI | undefined = overrides.sessionFolder ?? URI.parse('file:///workspace');
		const sessionsService = new class extends mock<ISessionsService>() {
			override get activeSession(): ISessionsService['activeSession'] {
				if (!sessionId) {
					return constObservable(undefined);
				}
				return constObservable(upcastPartial<IActiveSession>({
					sessionId,
					workspace: constObservable(sessionFolder ? { folders: [{ root: sessionFolder }] } : undefined) as IActiveSession['workspace'],
				}));
			}
		};
		const quickInputService = overrides.quickInputService ?? new class extends mock<IQuickInputService>() {
			override async pick(): Promise<undefined> { return undefined; }
		};
		const manager = new AgentHostCanvasPackagesManager(
			connectionsService,
			configurationService,
			quickInputService,
			fileDialogService,
			dialogService,
			notificationService,
			new class extends mock<ICommandService>() { },
			new class extends mock<IOpenerService>() { },
			workspaceTrustManagementService,
			workspaceTrustRequestService,
			sessionsService,
		);
		return {
			manager, notifications, approveCalls,
			setSession: (id: string | undefined, folder: URI | undefined) => { sessionId = id ?? ''; sessionFolder = folder; },
		};
	}

	async function performPackageAction(manager: AgentHostCanvasPackagesManager, picker: ReturnType<typeof quickPickFixture>): Promise<void> {
		const running = manager.run();
		await picker.listed.p;
		const item = picker.currentItems().find(item => item.type !== 'separator' && item.id === 'pkg-1');
		assert.ok(item && item.type !== 'separator');
		picker.accept(item);
		await Promise.race([running, picker.redisplayed.p]);
		picker.hide();
		await running;
	}

	test('cancelling the picker while the initial list fetch is pending resolves cleanly without leaking or hanging', async () => {
		const listDeferred = new DeferredPromise<IAgentHostCanvasPackage[]>();
		const picker = quickPickFixture();
		const { manager } = services({ client: { list: () => listDeferred.p, prepare: async () => { throw new Error('unused'); }, approve: async () => { }, revoke: async () => { }, remove: async () => { } }, quickInputService: picker.service });

		const running = manager.run();
		await picker.shown.p;
		assert.strictEqual(picker.isBusy(), true);

		// Hide (e.g. Escape) before `client.list()` resolves.
		picker.hide();
		await running;

		// The late list resolution must be a no-op: no items assigned, no throw.
		listDeferred.complete([pkg()]);
		await new Promise(resolve => setTimeout(resolve, 0));
		assert.deepStrictEqual(picker.currentItems(), []);
	});

	for (const scope of ['workspace', 'host'] as const) {
		test(`${scope} approval exposes the shared-host scope in the actual review and confirmation flow`, async () => {
			const label = scope === 'workspace' ? '$(check) Approve for This Workspace' : '$(check-all) Approve for All Workspaces on This Local Host';
			const picker = quickPickFixture(label);
			const confirmations: IConfirmation[] = [];
			const { manager, approveCalls, notifications } = services({
				quickInputService: picker.service,
				confirm: async confirmation => {
					confirmations.push(confirmation);
					return { confirmed: true };
				},
			});
			await performPackageAction(manager, picker);
			assert.deepStrictEqual({
				defaultAction: picker.actionItems()[0].label,
				hostDescription: picker.actionItems()[1].description,
				approval: approveCalls.map(call => ({ ...call, workspace: call.workspace?.toString() })),
				confirmation: confirmations.map(confirmation => ({
					unsandboxed: typeof confirmation.detail === 'string' && confirmation.detail.includes('NOT sandboxed by VS Code'),
					sharedScope: typeof confirmation.detail === 'string' && confirmation.detail.includes('profiles sharing this local Agent Host and user-data directory'),
					preservesGrants: typeof confirmation.detail === 'string' && confirmation.detail.includes('Existing approvals for this revision'),
				})),
				statusSharedScope: notifications.some(notification => notification.kind === 'info' && notification.message.includes('profiles sharing this local Agent Host and user-data directory')),
			}, {
				defaultAction: '$(check) Approve for This Workspace',
				hostDescription: 'Includes every profile sharing this Agent Host and its user-data directory',
				approval: [{ id: 'pkg-1', revision: 'rev1', workspace: scope === 'workspace' ? 'file:///workspace' : undefined }],
				confirmation: [{ unsandboxed: true, sharedScope: true, preservesGrants: scope === 'workspace' }],
				statusSharedScope: true,
			});
		});
	}

	test('an unavailable registry reports its error without offering empty-registry management actions', async () => {
		const picker = quickPickFixture();
		const mutations: string[] = [];
		const { manager, notifications } = services({
			quickInputService: picker.service,
			client: {
				list: async () => { throw new Error('Saved canvas approvals are unavailable; records are preserved.'); },
				prepare: async () => { mutations.push('prepare'); return pkg(); },
				approve: async () => { mutations.push('approve'); },
				revoke: async () => { mutations.push('revoke'); },
				remove: async () => { mutations.push('remove'); },
			},
		});
		await manager.run();
		assert.deepStrictEqual({
			items: picker.currentItems(), mutations, notifications,
		}, {
			items: [], mutations: [],
			notifications: [{ kind: 'error', message: 'Could not list local canvas packages: Saved canvas approvals are unavailable; records are preserved.' }],
		});
	});

	test('if the session/folder changes while the action picker is open (before approve is invoked), approval is rejected rather than silently applied to the new session', async () => {
		const picker = quickPickFixture('$(check) Approve for This Workspace', () => setSession('session-2', URI.parse('file:///other-workspace')));
		const { manager, approveCalls, notifications, setSession } = services({
			quickInputService: picker.service,
		});
		await performPackageAction(manager, picker);

		assert.deepStrictEqual(approveCalls, []);
		assert.ok(notifications.some(n => n.kind === 'warn' && /changed/.test(n.message)));
	});

	test('approving for the workspace with no session/folder change end-to-end reaches the client with the exact captured workspace', async () => {
		const chosenPkg = pkg({ approval: undefined });
		const picker = quickPickFixture('$(check) Approve for This Workspace');
		const { manager, approveCalls } = services({ quickInputService: picker.service });
		await performPackageAction(manager, picker);

		assert.strictEqual(approveCalls.length, 1);
		assert.strictEqual(approveCalls[0].id, chosenPkg.id);
		assert.strictEqual(approveCalls[0].revision, chosenPkg.revision);
		assert.strictEqual(approveCalls[0].workspace?.toString(), URI.parse('file:///workspace').toString());
	});

	test('approval is rejected (and never reaches the client) if the session workspace changes again after confirmation, before trust/approve complete', async () => {
		const picker = quickPickFixture('$(check) Approve for This Workspace');
		const { manager, approveCalls, notifications, setSession } = services({
			quickInputService: picker.service,
			confirm: async () => {
				setSession('session-3', URI.parse('file:///yet-another-workspace'));
				return { confirmed: true };
			},
		});
		await performPackageAction(manager, picker);

		assert.deepStrictEqual(approveCalls, []);
		assert.ok(notifications.some(n => n.kind === 'warn' && /changed/.test(n.message)));
	});

	test('declining the unsandboxed-execution confirmation never calls approve', async () => {
		const picker = quickPickFixture('$(check-all) Approve for All Workspaces on This Local Host');
		const { manager, approveCalls } = services({
			quickInputService: picker.service,
			confirm: async () => ({ confirmed: false }),
		});
		await performPackageAction(manager, picker);

		assert.deepStrictEqual(approveCalls, []);
	});

	test('declining workspace trust never calls approve', async () => {
		const picker = quickPickFixture('$(check) Approve for This Workspace');
		const { manager, approveCalls } = services({
			quickInputService: picker.service,
			isWorkspaceTrusted: false,
			requestResourcesTrust: async () => false,
		});
		await performPackageAction(manager, picker);

		assert.deepStrictEqual(approveCalls, []);
	});

	test('approving for the workspace when no session workspace is open warns and never calls approve', async () => {
		const picker = quickPickFixture('$(check) Approve for This Workspace');
		const { manager, approveCalls, notifications } = services({
			quickInputService: picker.service, sessionId: '',
		});
		await performPackageAction(manager, picker);

		assert.deepStrictEqual(approveCalls, []);
		assert.ok(notifications.some(n => n.kind === 'warn'));
	});
});

suite('createLocalCanvasPackage', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	/** In-memory fixture standing in for the small slice of {@link IFileService} the action touches. */
	function fileServiceFixture(existing: 'missing' | 'empty' | 'nonEmpty') {
		const copyCalls: Array<{ from: URI; to: URI }> = [];
		const service = new class extends mock<IFileService>() {
			override async resolve(resource: URI): Promise<any> {
				if (existing === 'missing') {
					throw createFileSystemProviderError('not found', FileSystemProviderErrorCode.FileNotFound);
				}
				return { resource, children: existing === 'nonEmpty' ? [{ resource: joinPath(resource, 'stale.txt') }] : [] };
			}
			override async copy(from: URI, to: URI, _overwrite?: boolean): Promise<any> {
				copyCalls.push({ from, to });
				return undefined;
			}
		};
		return { service, copyCalls };
	}

	function accessorServices(overrides: {
		destination?: URI;
		existing: 'missing' | 'empty' | 'nonEmpty';
	}) {
		const { service: fileService, copyCalls } = fileServiceFixture(overrides.existing);
		const notifications: Array<{ kind: string; message: string }> = [];
		const openedEditors: unknown[] = [];
		const fileDialogService = new class extends mock<IFileDialogService>() {
			override async showOpenDialog(): Promise<URI[] | undefined> {
				return overrides.destination ? [overrides.destination] : undefined;
			}
		};
		const notificationService = new class extends mock<INotificationService>() {
			override info(message: string): void { notifications.push({ kind: 'info', message }); }
			override warn(message: string): void { notifications.push({ kind: 'warn', message }); }
			override error(message: string): void { notifications.push({ kind: 'error', message }); }
		};
		const editorService = new class extends mock<IEditorService>() {
			override async openEditor(input: unknown): Promise<any> { openedEditors.push(input); return undefined; }
		};
		const accessor: ServicesAccessor = {
			get: <T>(id: unknown): T => {
				switch (id) {
					case IFileDialogService: return fileDialogService as unknown as T;
					case IFileService: return fileService as unknown as T;
					case INotificationService: return notificationService as unknown as T;
					case IEditorService: return editorService as unknown as T;
					default: throw new Error(`Unexpected service requested: ${String(id)}`);
				}
			},
		};
		return { accessor, copyCalls, notifications, openedEditors };
	}

	test('copies the starter into an empty destination and opens the entry point, without ever overwriting', async () => {
		const destination = URI.parse('file:///dest');
		const { accessor, copyCalls, notifications, openedEditors } = accessorServices({ destination, existing: 'empty' });

		await createLocalCanvasPackage(accessor);

		assert.strictEqual(copyCalls.length, CANVAS_AUTHORING_TEMPLATE_FILES.length);
		for (const call of copyCalls) {
			assert.ok(!isEqual(call.from, call.to), 'copies from the template root, not onto itself');
		}
		assert.ok(notifications.some(n => n.kind === 'info'));
		assert.strictEqual(openedEditors.length, 1);
	});

	test('copies the starter when the destination does not exist yet', async () => {
		const destination = URI.parse('file:///new-dest');
		const { accessor, copyCalls } = accessorServices({ destination, existing: 'missing' });

		await createLocalCanvasPackage(accessor);

		assert.strictEqual(copyCalls.length, CANVAS_AUTHORING_TEMPLATE_FILES.length);
	});

	test('refuses a non-empty destination and never copies anything into it', async () => {
		const destination = URI.parse('file:///occupied');
		const { accessor, copyCalls, notifications, openedEditors } = accessorServices({ destination, existing: 'nonEmpty' });

		await createLocalCanvasPackage(accessor);

		assert.deepStrictEqual(copyCalls, []);
		assert.strictEqual(openedEditors.length, 0);
		assert.ok(notifications.some(n => n.kind === 'warn'));
	});

	test('does nothing when the user cancels the destination picker', async () => {
		const { accessor, copyCalls, notifications } = accessorServices({ destination: undefined, existing: 'empty' });

		await createLocalCanvasPackage(accessor);

		assert.deepStrictEqual(copyCalls, []);
		assert.deepStrictEqual(notifications, []);
	});

});
