/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { toErrorMessage } from '../../../../../base/common/errorMessage.js';
import { DisposableStore, toDisposable } from '../../../../../base/common/lifecycle.js';
import { FileAccess } from '../../../../../base/common/network.js';
import { dirname, isEqual, joinPath } from '../../../../../base/common/resources.js';
import Severity from '../../../../../base/common/severity.js';
import { URI } from '../../../../../base/common/uri.js';
import { localize, localize2 } from '../../../../../nls.js';
import { Action2, registerAction2 } from '../../../../../platform/actions/common/actions.js';
import { AgentHostLocalCanvasesSettingId } from '../../../../../platform/agentHost/common/agentService.js';
import { IAgentHostConnectionsService } from '../../../../../platform/agentHost/common/agentHostConnectionsService.js';
import { isLocalCanvasDevelopmentPlatform, type IAgentHostCanvasPackage, type IAgentHostCanvasPackagesClient } from '../../../../../platform/agentHost/common/agentHostCanvasPackages.js';
import { supportsAgentHostLocalCanvases } from '../../../../../platform/agentHost/common/agentHostExtensionProtocol.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { ContextKeyExpr } from '../../../../../platform/contextkey/common/contextkey.js';
import { IDialogService, IFileDialogService } from '../../../../../platform/dialogs/common/dialogs.js';
import { FileSystemProviderErrorCode, IFileService, toFileSystemProviderErrorCode } from '../../../../../platform/files/common/files.js';
import { IInstantiationService, type ServicesAccessor } from '../../../../../platform/instantiation/common/instantiation.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import { IOpenerService } from '../../../../../platform/opener/common/opener.js';
import { IQuickInputService, type IQuickPickItem, type QuickPickInput } from '../../../../../platform/quickinput/common/quickInput.js';
import { IWorkspaceTrustManagementService, IWorkspaceTrustRequestService } from '../../../../../platform/workspace/common/workspaceTrust.js';
import { ChatContextKeys } from '../../../../../workbench/contrib/chat/common/actions/chatContextKeys.js';
import { IEditorService } from '../../../../../workbench/services/editor/common/editorService.js';
import { ISessionsService } from '../../../../services/sessions/browser/sessionsService.js';
import { SessionCanvasesEnabledContext } from '../../../../common/contextkeys.js';

/** The canvas authoring starter shipped alongside this contribution; see its README for what it is and is not. */
export const CANVAS_AUTHORING_TEMPLATE_ROOT = FileAccess.asFileUri('vs/sessions/contrib/providers/agentHost/canvasAuthoringTemplate');
export const CANVAS_AUTHORING_TEMPLATE_FILES = ['README.md', 'extension.mjs', 'index.html', 'client.js', 'style.css'];

/**
 * Whether {@link IAgentHostCanvasPackagesClient} is unavailable, and if so
 * why. Distinguishes "connection doesn't expose the capability" (a different
 * host, or the ambient host hasn't finished starting) from "the setting that
 * gates SDK canvas startup is off" — the client can exist and still manage
 * packages while the setting is off, but no canvas from an approved package
 * can actually run until it is enabled and the window reloads.
 */
export type CanvasPackagesUnsupportedReason = 'connection-unsupported' | 'setting-disabled';

/** Pure gating check kept separate from any service so it is trivially unit-testable. */
export function describeCanvasPackagesUnsupportedReason(client: IAgentHostCanvasPackagesClient | undefined, settingEnabled: boolean): CanvasPackagesUnsupportedReason | undefined {
	if (!client) {
		return 'connection-unsupported';
	}
	if (!settingEnabled) {
		return 'setting-disabled';
	}
	return undefined;
}

/** Human-readable size, e.g. `4.2 MB`. Kept pure/exported for direct unit testing. */
export function formatCanvasPackageSize(byteLength: number): string {
	if (byteLength < 1024) {
		return localize('agentHostCanvasPackages.size.bytes', "{0} B", byteLength);
	}
	if (byteLength < 1024 * 1024) {
		return localize('agentHostCanvasPackages.size.kb', "{0} KB", Math.round(byteLength / 1024));
	}
	return localize('agentHostCanvasPackages.size.mb', "{0} MB", (byteLength / (1024 * 1024)).toFixed(1));
}

/** Short, stable prefix of a SHA-256 revision for display. */
export function shortenCanvasPackageRevision(revision: string): string {
	return revision.slice(0, 12);
}

/** Whether a package's current approval (if any) was granted for an older, since-replaced revision. */
export function isCanvasPackageApprovalStale(pkg: Pick<IAgentHostCanvasPackage, 'revision' | 'approval'>): boolean {
	return pkg.approval !== undefined && pkg.approval.revision !== pkg.revision;
}

/** One-line summary of a package's approval state for a picker's description column. */
export function formatCanvasPackageApprovalSummary(pkg: Pick<IAgentHostCanvasPackage, 'revision' | 'approval'>): string {
	if (!pkg.approval) {
		return localize('agentHostCanvasPackages.approval.none', "Not approved");
	}
	const scope = pkg.approval.workspaces
		? localize('agentHostCanvasPackages.approval.workspaces', "Approved for {0} workspace(s) on this local host (across profiles)", pkg.approval.workspaces.length)
		: localize('agentHostCanvasPackages.approval.host', "Approved for all workspaces and profiles on this local host");
	return isCanvasPackageApprovalStale(pkg)
		? localize('agentHostCanvasPackages.approval.stale', "{0} at an older revision — review and re-approve", scope)
		: scope;
}

/** Approval scope choice offered in the package's action picker. */
export type CanvasPackageApprovalScope = 'workspace' | 'host';

/**
 * A single folder of the *active session's* workspace, captured together with
 * the identity of the session it belongs to. This is deliberately not "the
 * window's workspace" ({@link IWorkspaceContextService}): the Agents Window's
 * own ambient workspace is a generated, internal one, unrelated to whatever
 * project the active session is working in.
 */
export interface ICanvasPackageSessionWorkspace {
	/** Identity of the session this folder was captured from ({@link ISession.sessionId}). */
	readonly sessionId: string;
	/** Canonical root of the session's (first) workspace folder. */
	readonly folder: URI;
}

/**
 * Result of resolving what to pass as `workspace` to
 * {@link IAgentHostCanvasPackagesClient.approve} for a chosen scope, computed
 * against a session workspace captured at confirmation time. Kept pure so the
 * "no workspace open" and "workspace changed after the user confirmed"
 * rejection paths are unit-testable without any services.
 */
export type ResolvedCanvasPackageApprovalTarget =
	| { readonly rejected: false; readonly workspace: URI | undefined }
	| { readonly rejected: true; readonly reason: 'no-workspace-open' | 'workspace-changed' };

/**
 * Re-validates a captured session workspace against the session workspace
 * open *now* (same session, same folder), rather than silently retargeting
 * approval to whatever session/folder happens to be active when the async
 * confirmation/trust flow resolves.
 */
export function resolveCanvasPackageApprovalTarget(scope: CanvasPackageApprovalScope, captured: ICanvasPackageSessionWorkspace | undefined, current: ICanvasPackageSessionWorkspace | undefined): ResolvedCanvasPackageApprovalTarget {
	if (scope === 'host') {
		return { rejected: false, workspace: undefined };
	}
	if (!captured) {
		return { rejected: true, reason: 'no-workspace-open' };
	}
	if (!current || current.sessionId !== captured.sessionId || !isEqual(current.folder, captured.folder)) {
		return { rejected: true, reason: 'workspace-changed' };
	}
	return { rejected: false, workspace: captured.folder };
}

interface IPackagePick extends IQuickPickItem {
	readonly kind: 'package';
	readonly pkg: IAgentHostCanvasPackage;
}
interface IPrepareActionPick extends IQuickPickItem {
	readonly kind: 'prepare';
}
interface IRefreshActionPick extends IQuickPickItem {
	readonly kind: 'refresh';
}
type MainPick = IPackagePick | IPrepareActionPick | IRefreshActionPick;

type DetailOperation = 'approveWorkspace' | 'approveHost' | 'revoke' | 'remove' | 'openSource' | 'openSnapshot' | 'viewDetails' | 'updateSnapshot';
interface IDetailPick extends IQuickPickItem {
	readonly operation: DetailOperation;
}

/**
 * Quick-pick-driven UI over {@link IAgentHostCanvasPackagesClient}: prepare
 * an inert local snapshot from a source folder, review its exact contents,
 * and explicitly approve/revoke/remove a workspace or shared-host-wide grant to
 * run it. Never runs or imports code itself — every mutating call goes
 * straight through to the client, which is the sole owner of that policy.
 */
export class AgentHostCanvasPackagesManager {

	constructor(
		@IAgentHostConnectionsService private readonly connectionsService: IAgentHostConnectionsService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IQuickInputService private readonly quickInputService: IQuickInputService,
		@IFileDialogService private readonly fileDialogService: IFileDialogService,
		@IDialogService private readonly dialogService: IDialogService,
		@INotificationService private readonly notificationService: INotificationService,
		@ICommandService private readonly commandService: ICommandService,
		@IOpenerService private readonly openerService: IOpenerService,
		@IWorkspaceTrustManagementService private readonly workspaceTrustManagementService: IWorkspaceTrustManagementService,
		@IWorkspaceTrustRequestService private readonly workspaceTrustRequestService: IWorkspaceTrustRequestService,
		@ISessionsService private readonly sessionsService: ISessionsService,
	) { }

	async run(): Promise<void> {
		const client = this.connectionsService.ambientConnection.canvasPackages;
		const settingEnabled = this.configurationService.getValue<boolean>(AgentHostLocalCanvasesSettingId) === true;
		const unsupported = describeCanvasPackagesUnsupportedReason(client, settingEnabled);
		if (!client) {
			this.notifyUnsupported(unsupported!);
			return;
		}
		await this.manage(client);
	}

	private notifyUnsupported(reason: CanvasPackagesUnsupportedReason): void {
		this.notificationService.info(reason === 'setting-disabled'
			? localize('agentHostCanvasPackages.unsupported.settingDisabled', "Local canvas packages are disabled. Enable \"{0}\" and reload the window, then manage and run them here.", AgentHostLocalCanvasesSettingId)
			: localize('agentHostCanvasPackages.unsupported.connection', "The connected Agent Host does not support local canvas packages. It may still be starting, or this runtime does not support the feature yet."));
	}

	private currentSessionWorkspace(): ICanvasPackageSessionWorkspace | undefined {
		const session = this.sessionsService.activeSession.get();
		const folder = session?.workspace.get()?.folders[0]?.root;
		if (!session || !folder) {
			return undefined;
		}
		return { sessionId: session.sessionId, folder };
	}

	private async manage(client: IAgentHostCanvasPackagesClient): Promise<void> {
		for (; ;) {
			const settingEnabled = this.configurationService.getValue<boolean>(AgentHostLocalCanvasesSettingId) === true;
			const initialized = this.connectionsService.ambientConnection.initializeResult.get();
			const executionSupported = initialized?.canvases !== undefined || supportsAgentHostLocalCanvases(initialized);
			const store = new DisposableStore();
			let disposed = false;
			store.add(toDisposable(() => { disposed = true; }));

			const picker = store.add(this.quickInputService.createQuickPick<MainPick>({ useSeparators: true }));
			picker.title = localize('agentHostCanvasPackages.title', "Local Canvas Packages");
			picker.matchOnDescription = true;
			picker.matchOnDetail = true;
			picker.ignoreFocusOut = true;
			picker.placeholder = !settingEnabled
				? localize('agentHostCanvasPackages.placeholderDisabled', "Enable \"{0}\" to run approved packages", AgentHostLocalCanvasesSettingId)
				: executionSupported
					? localize('agentHostCanvasPackages.placeholder', "Choose a package to review, approve, or manage")
					: !isLocalCanvasDevelopmentPlatform()
						? localize('agentHostCanvasPackages.placeholderPlatformUnavailable', "Canvas execution is unavailable on this platform. The local development preview is qualified only on macOS arm64. You can still prepare and review packages.")
						: localize('agentHostCanvasPackages.placeholderRuntimeUnavailable', "Canvas execution is unavailable with this SDK/runtime. You can still prepare and review packages.");

			// Install cancellation/lifetime handling *before* the async
			// `client.list()` call starts. Otherwise hiding the picker while
			// the initial fetch is still pending (e.g. pressing Escape) is
			// either dropped (no listener yet exists to observe it) or hangs
			// until the fetch resolves.
			let resolveResult!: (value: MainPick | undefined) => void;
			const result = new Promise<MainPick | undefined>(resolve => { resolveResult = resolve; });
			store.add(picker.onDidAccept(() => resolveResult(picker.selectedItems[0])));
			store.add(picker.onDidHide(() => resolveResult(undefined)));

			picker.busy = true;
			picker.show();

			client.list().then(
				packages => {
					if (disposed) {
						return;
					}
					picker.busy = false;
					picker.items = this.mainItems(packages);
				},
				error => {
					this.notificationService.error(localize('agentHostCanvasPackages.listError', "Could not list local canvas packages: {0}", toErrorMessage(error)));
					if (!disposed) {
						resolveResult(undefined);
					}
				},
			);

			let selected: MainPick | undefined;
			try {
				selected = await result;
			} finally {
				picker.hide();
				store.dispose();
			}
			if (!selected) {
				return;
			}
			if (selected.kind === 'package') {
				await this.managePackage(client, selected.pkg);
			} else if (selected.kind === 'prepare') {
				await this.prepare(client);
			}
			// Loop back and refresh after every action (including a bare
			// refresh) so the list always reflects the latest server-side
			// state, instead of recursing (which would grow the call stack
			// for a long-lived session).
		}
	}

	private mainItems(packages: readonly IAgentHostCanvasPackage[]): QuickPickInput<MainPick>[] {
		const items: QuickPickInput<MainPick>[] = [];
		if (packages.length > 0) {
			items.push({ type: 'separator', label: localize('agentHostCanvasPackages.section.packages', "Packages") });
			for (const pkg of packages) {
				items.push({
					id: pkg.id,
					kind: 'package',
					pkg,
					label: pkg.name,
					description: formatCanvasPackageApprovalSummary(pkg),
					detail: localize('agentHostCanvasPackages.item.detail', "{0} · {1} files · {2} · revision {3}", pkg.source, pkg.fileCount, formatCanvasPackageSize(pkg.byteLength), shortenCanvasPackageRevision(pkg.revision)),
				});
			}
		}
		items.push({ type: 'separator' });
		items.push({ id: 'prepare', kind: 'prepare', label: localize('agentHostCanvasPackages.action.prepare', "{0} Prepare Package from Source Folder…", '$(folder-opened)') });
		items.push({ id: 'refresh', kind: 'refresh', label: localize('agentHostCanvasPackages.action.refresh', "{0} Refresh", '$(refresh)') });
		return items;
	}

	private async managePackage(client: IAgentHostCanvasPackagesClient, pkg: IAgentHostCanvasPackage): Promise<void> {
		// Capture the session workspace once, when the action picker for this
		// package is shown — not later, inside `approve()`, after the user has
		// picked an option and possibly switched the active session/folder in
		// the meantime.
		const capturedWorkspace = this.currentSessionWorkspace();
		const items: IDetailPick[] = [
			{
				operation: 'approveWorkspace',
				label: localize('agentHostCanvasPackages.detail.approveWorkspace', "{0} Approve for This Workspace", '$(check)'),
				description: capturedWorkspace ? capturedWorkspace.folder.fsPath : localize('agentHostCanvasPackages.detail.noWorkspace', "Open a folder in the active session to enable this option"),
			},
			{
				operation: 'approveHost',
				label: localize('agentHostCanvasPackages.detail.approveHost', "{0} Approve for All Workspaces on This Local Host", '$(check-all)'),
				description: localize('agentHostCanvasPackages.detail.hostScope', "Includes every profile sharing this Agent Host and its user-data directory"),
			},
		];
		if (pkg.approval) {
			items.push({ operation: 'revoke', label: localize('agentHostCanvasPackages.detail.revoke', "{0} Revoke Approval", '$(circle-slash)') });
		}
		items.push(
			{ operation: 'updateSnapshot', label: localize('agentHostCanvasPackages.detail.update', "{0} Prepare Updated Snapshot from Source", '$(sync)') },
			{ operation: 'openSource', label: localize('agentHostCanvasPackages.detail.openSource', "{0} Open Source Folder", '$(folder)') },
			{ operation: 'openSnapshot', label: localize('agentHostCanvasPackages.detail.openSnapshot', "{0} Open Installed Snapshot (Exact Reviewed Copy)", '$(files)') },
			{ operation: 'viewDetails', label: localize('agentHostCanvasPackages.detail.viewDetails', "{0} View Package Details", '$(info)') },
			{
				operation: 'remove',
				label: localize('agentHostCanvasPackages.detail.remove', "{0} Remove Package…", '$(trash)'),
				description: localize('agentHostCanvasPackages.detail.removeDescription', "Revokes all approvals; saved document data is preserved"),
			},
		);

		const selection = await this.quickInputService.pick(items, {
			title: localize('agentHostCanvasPackages.detail.title', "{0} — revision {1}", pkg.name, shortenCanvasPackageRevision(pkg.revision)),
			placeHolder: localize('agentHostCanvasPackages.detail.placeholder', "Choose what to do with this local canvas package"),
		});
		if (!selection) {
			return;
		}
		switch (selection.operation) {
			case 'approveWorkspace': await this.approve(client, pkg, 'workspace', capturedWorkspace); break;
			case 'approveHost': await this.approve(client, pkg, 'host', capturedWorkspace); break;
			case 'revoke': await this.revoke(client, pkg); break;
			case 'remove': await this.remove(client, pkg); break;
			case 'openSource': await this.reveal(pkg.source); break;
			case 'openSnapshot': await this.reveal(pkg.snapshot); break;
			case 'viewDetails': this.viewDetails(pkg); break;
			case 'updateSnapshot': await this.prepare(client, URI.parse(pkg.source)); break;
		}
	}

	private async approve(client: IAgentHostCanvasPackagesClient, pkg: IAgentHostCanvasPackage, scope: CanvasPackageApprovalScope, capturedWorkspace: ICanvasPackageSessionWorkspace | undefined): Promise<void> {
		// The revision and (for workspace scope) target folder were captured
		// at user-confirmation time, when the action picker was shown: never
		// let a later focus/session change silently retarget an approval the
		// user has not re-confirmed.
		const capturedRevision = pkg.revision;

		const target = resolveCanvasPackageApprovalTarget(scope, capturedWorkspace, this.currentSessionWorkspace());
		if (target.rejected && target.reason === 'no-workspace-open') {
			this.notificationService.warn(localize('agentHostCanvasPackages.approve.noWorkspace', "Open a folder in the active session to approve \"{0}\" for that workspace. Approval for all workspaces and profiles sharing this local host is a separate choice.", pkg.name));
			return;
		}

		const confirmed = await this.confirmUnsandboxed(pkg, scope, capturedWorkspace?.folder);
		if (!confirmed) {
			return;
		}

		if (scope === 'workspace' && capturedWorkspace) {
			if (!this.workspaceTrustManagementService.isWorkspaceTrusted()) {
				const trusted = await this.workspaceTrustRequestService.requestResourcesTrust({
					uri: capturedWorkspace.folder,
					message: localize('agentHostCanvasPackages.approve.trustMessage', "Approving \"{0}\" to run in this workspace requires you to trust the workspace.", pkg.name),
				});
				if (!trusted) {
					return;
				}
			}
		}

		// Re-check staleness after the confirm/trust dialogs, which may have
		// given the user (or something else) time to switch the active
		// session or its workspace folder.
		const revalidated = resolveCanvasPackageApprovalTarget(scope, capturedWorkspace, this.currentSessionWorkspace());
		if (revalidated.rejected) {
			this.notificationService.warn(localize('agentHostCanvasPackages.approve.stale', "The target workspace changed before approval completed. Re-run approval for the workspace you intend."));
			return;
		}

		try {
			await client.approve(pkg.id, capturedRevision, revalidated.workspace);
			this.notificationService.info(scope === 'workspace'
				? localize('agentHostCanvasPackages.approve.okWorkspace', "Approved \"{0}\" (revision {1}) to run in this workspace across profiles sharing this local Agent Host and user-data directory. Existing approvals for this revision are preserved.", pkg.name, shortenCanvasPackageRevision(capturedRevision))
				: localize('agentHostCanvasPackages.approve.okHost', "Approved \"{0}\" (revision {1}) to run in all workspaces and profiles sharing this local Agent Host and user-data directory.", pkg.name, shortenCanvasPackageRevision(capturedRevision)));
		} catch (error) {
			this.notificationService.error(localize('agentHostCanvasPackages.approve.error', "Could not approve \"{0}\": {1}", pkg.name, toErrorMessage(error)));
		}
	}

	private async confirmUnsandboxed(pkg: IAgentHostCanvasPackage, scope: CanvasPackageApprovalScope, workspace: URI | undefined): Promise<boolean> {
		const scopeDetail = scope === 'workspace' && workspace
			? localize('agentHostCanvasPackages.confirm.scopeWorkspace', "This workspace ({0}), across profiles sharing this local Agent Host and user-data directory. Existing approvals for this revision, including any host-wide approval, are preserved. Revoke approval first to narrow its scope.", workspace.fsPath)
			: localize('agentHostCanvasPackages.confirm.scopeHost', "All workspaces and profiles sharing this local Agent Host and user-data directory");
		const { confirmed } = await this.dialogService.confirm({
			type: Severity.Warning,
			message: localize('agentHostCanvasPackages.confirm.message', "Run \"{0}\" as a local Node backend?", pkg.name),
			detail: localize('agentHostCanvasPackages.confirm.detail', "The installed snapshot runs as a regular Node.js process with your OS user's full file-system and network access. It is NOT sandboxed by VS Code. Only approve packages whose exact reviewed snapshot (revision {0}) you trust.\n\nScope: {1}", shortenCanvasPackageRevision(pkg.revision), scopeDetail),
			primaryButton: localize('agentHostCanvasPackages.confirm.primary', "Approve"),
		});
		return confirmed;
	}

	private async revoke(client: IAgentHostCanvasPackagesClient, pkg: IAgentHostCanvasPackage): Promise<void> {
		try {
			await client.revoke(pkg.id);
			this.notificationService.info(localize('agentHostCanvasPackages.revoke.ok', "Revoked all approvals for \"{0}\" on this local Agent Host, across profiles sharing its user-data directory.", pkg.name));
		} catch (error) {
			this.notificationService.error(localize('agentHostCanvasPackages.revoke.error', "Could not revoke approval for \"{0}\": {1}", pkg.name, toErrorMessage(error)));
		}
	}

	private async remove(client: IAgentHostCanvasPackagesClient, pkg: IAgentHostCanvasPackage): Promise<void> {
		const { confirmed } = await this.dialogService.confirm({
			type: Severity.Warning,
			message: localize('agentHostCanvasPackages.remove.message', "Remove \"{0}\"?", pkg.name),
			detail: localize('agentHostCanvasPackages.remove.detail', "This removes the package from this local Agent Host's registry and revokes all approvals, across profiles sharing its user-data directory. Saved document data and inert snapshots are preserved."),
			primaryButton: localize('agentHostCanvasPackages.remove.primary', "Remove"),
		});
		if (!confirmed) {
			return;
		}
		try {
			await client.remove(pkg.id);
			this.notificationService.info(localize('agentHostCanvasPackages.remove.ok', "Removed \"{0}\".", pkg.name));
		} catch (error) {
			this.notificationService.error(localize('agentHostCanvasPackages.remove.error', "Could not remove \"{0}\": {1}", pkg.name, toErrorMessage(error)));
		}
	}

	private async reveal(uriString: string): Promise<void> {
		const uri = URI.parse(uriString);
		try {
			await this.commandService.executeCommand('revealFileInOS', uri);
		} catch {
			await this.openerService.open(dirname(uri));
		}
	}

	private viewDetails(pkg: IAgentHostCanvasPackage): void {
		const approvalLine = !pkg.approval
			? localize('agentHostCanvasPackages.view.notApproved', "Approval: not approved")
			: pkg.approval.workspaces
				? localize('agentHostCanvasPackages.view.approvedWorkspaces', "Approval: revision {0} for {1}, across profiles sharing this local Agent Host and user-data directory", shortenCanvasPackageRevision(pkg.approval.revision), pkg.approval.workspaces.join(', '))
				: localize('agentHostCanvasPackages.view.approvedHost', "Approval: revision {0} for all workspaces and profiles sharing this local Agent Host and user-data directory", shortenCanvasPackageRevision(pkg.approval.revision));
		const lines = [
			localize('agentHostCanvasPackages.view.name', "Name: {0}", pkg.name),
			localize('agentHostCanvasPackages.view.id', "Id: {0}", pkg.id),
			localize('agentHostCanvasPackages.view.source', "Source: {0}", pkg.source),
			localize('agentHostCanvasPackages.view.snapshot', "Installed snapshot: {0}", pkg.snapshot),
			localize('agentHostCanvasPackages.view.revision', "Revision (SHA-256): {0}", pkg.revision),
			localize('agentHostCanvasPackages.view.files', "Files: {0}", pkg.fileCount),
			localize('agentHostCanvasPackages.view.size', "Size: {0}", formatCanvasPackageSize(pkg.byteLength)),
			approvalLine,
		];
		this.notificationService.notify({ severity: Severity.Info, message: lines.join('\n') });
	}

	private async prepare(client: IAgentHostCanvasPackagesClient, initialSource?: URI): Promise<void> {
		let source = initialSource;
		if (!source) {
			const folders = await this.fileDialogService.showOpenDialog({
				canSelectFiles: false,
				canSelectFolders: true,
				canSelectMany: false,
				title: localize('agentHostCanvasPackages.prepare.title', "Select a Local Canvas Package Source Folder"),
				openLabel: localize('agentHostCanvasPackages.prepare.openLabel', "Prepare Package"),
			});
			source = folders?.[0];
		}
		if (!source) {
			return;
		}
		try {
			const pkg = await client.prepare(source);
			this.notificationService.info(localize('agentHostCanvasPackages.prepare.ok', "Prepared \"{0}\" (revision {1}, {2} files, {3}). Review the installed snapshot, then approve it to let this revision run.", pkg.name, shortenCanvasPackageRevision(pkg.revision), pkg.fileCount, formatCanvasPackageSize(pkg.byteLength)));
		} catch (error) {
			this.notificationService.error(localize('agentHostCanvasPackages.prepare.error', "Could not prepare a package from \"{0}\": {1}", source.fsPath, toErrorMessage(error)));
		}
	}
}

/**
 * Copies the bundled canvas authoring starter into an empty destination folder
 * chosen by the user, then opens its entry point for editing. Purely a local
 * file-system scaffold: it never prepares, approves, or runs anything, and it
 * never touches an existing package's installed snapshot. The intended flow
 * afterwards is: edit the copy, then use "Manage Local Canvas Packages" to
 * prepare a new snapshot from the edited folder and review/approve it.
 */
export async function createLocalCanvasPackage(accessor: ServicesAccessor): Promise<void> {
	const fileDialogService = accessor.get(IFileDialogService);
	const fileService = accessor.get(IFileService);
	const notificationService = accessor.get(INotificationService);
	const editorService = accessor.get(IEditorService);

	const destinationFolders = await fileDialogService.showOpenDialog({
		canSelectFiles: false,
		canSelectFolders: true,
		canSelectMany: false,
		title: localize('agentHostCanvasPackages.create.title', "Choose an Empty Destination Folder for the New Canvas Package"),
		openLabel: localize('agentHostCanvasPackages.create.openLabel', "Create Here"),
	});
	const destination = destinationFolders?.[0];
	if (!destination) {
		return;
	}

	// Never overwrite or merge into an existing folder's contents: require
	// the destination to either not exist yet or already be empty.
	try {
		const stat = await fileService.resolve(destination);
		if (stat.children && stat.children.length > 0) {
			notificationService.warn(localize('agentHostCanvasPackages.create.notEmpty', "\"{0}\" is not empty. Choose an empty folder so the starter's files cannot overwrite anything already there.", destination.fsPath));
			return;
		}
	} catch (error) {
		if (toFileSystemProviderErrorCode(error) !== FileSystemProviderErrorCode.FileNotFound) {
			notificationService.error(localize('agentHostCanvasPackages.create.resolveError', "Could not inspect \"{0}\": {1}", destination.fsPath, toErrorMessage(error)));
			return;
		}
		// Destination doesn't exist yet: fine, individual file copies below create it.
	}

	try {
		for (const file of CANVAS_AUTHORING_TEMPLATE_FILES) {
			await fileService.copy(joinPath(CANVAS_AUTHORING_TEMPLATE_ROOT, file), joinPath(destination, file), false);
		}
	} catch (error) {
		notificationService.error(localize('agentHostCanvasPackages.create.copyError', "Could not copy the canvas authoring starter into \"{0}\": {1}", destination.fsPath, toErrorMessage(error)));
		return;
	}

	notificationService.info(localize('agentHostCanvasPackages.create.ok', "Created a canvas authoring starter in \"{0}\". Edit it, then use \"Manage Local Canvas Packages\" to prepare a snapshot from this folder and review/approve it.", destination.fsPath));

	await editorService.openEditor({ resource: joinPath(destination, 'extension.mjs') });
}

const AGENT_HOST_CANVAS_PACKAGES_MANAGE_COMMAND_ID = 'workbench.action.sessions.agentHost.canvasPackages.manage';
const AGENT_HOST_CANVAS_PACKAGES_CREATE_COMMAND_ID = 'workbench.action.sessions.agentHost.canvasPackages.create';

/**
 * Local canvas packages are gated by two independent things: whether the
 * ambient connection exposes the capability at all (checked at runtime, see
 * {@link describeCanvasPackagesUnsupportedReason}), and whether the
 * default-off {@link AgentHostLocalCanvasesSettingId} setting is enabled.
 * Since the setting starts disabled, keep both of these commands out of the
 * command palette and off the keybinding surface until it is turned on and
 * the SDK-runtime-requiring reload has happened — a management client (or a
 * freshly authored folder) that will not actually run yet shouldn't be
 * discoverable as if the feature were fully live.
 */
const canvasPackagesCommandsPrecondition = ContextKeyExpr.and(ChatContextKeys.enabled, SessionCanvasesEnabledContext);

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: AGENT_HOST_CANVAS_PACKAGES_MANAGE_COMMAND_ID,
			title: localize2('agentHostCanvasPackages.manage', "Manage Local Canvas Packages"),
			f1: true,
			precondition: canvasPackagesCommandsPrecondition,
		});
	}
	override run(accessor: ServicesAccessor): Promise<void> {
		return accessor.get(IInstantiationService).createInstance(AgentHostCanvasPackagesManager).run();
	}
});

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: AGENT_HOST_CANVAS_PACKAGES_CREATE_COMMAND_ID,
			title: localize2('agentHostCanvasPackages.create', "Create Local Canvas Package…"),
			f1: true,
			precondition: canvasPackagesCommandsPrecondition,
		});
	}
	override run(accessor: ServicesAccessor): Promise<void> {
		return createLocalCanvasPackage(accessor);
	}
});
