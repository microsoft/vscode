/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../base/common/cancellation.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { IJSONSchema } from '../../../../base/common/jsonSchema.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { isObject } from '../../../../base/common/types.js';
import { URI } from '../../../../base/common/uri.js';
import { localize } from '../../../../nls.js';
import { ConfigurationTarget, IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { ContextKeyExpr } from '../../../../platform/contextkey/common/contextkey.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IWorkbenchContribution } from '../../../../workbench/common/contributions.js';
import { IsSessionsWindowContext } from '../../../../workbench/common/contextkeys.js';
import { ChatContextKeys } from '../../../../workbench/contrib/chat/common/actions/chatContextKeys.js';
import { CountTokensCallback, ILanguageModelToolsService, IPreparedToolInvocation, IToolData, IToolImpl, IToolInvocation, IToolInvocationPreparationContext, IToolResult, ToolDataSource, ToolProgress } from '../../../../workbench/contrib/chat/common/tools/languageModelToolsService.js';
import { IViewsService } from '../../../../workbench/services/views/common/viewsService.js';
import { SESSIONS_LIST_AGENT_TOOLS_SETTING, SESSIONS_LIST_GROUP_EXTERNAL_SESSIONS_SETTING } from '../../../common/sessionConfig.js';
import { ISessionsProvidersService } from '../../../services/sessions/browser/sessionsProvidersService.js';
import { getSessionGroupSectionId, ISessionGroupsService } from '../../../services/sessions/browser/sessionGroupsService.js';
import { ISession, SessionStatus } from '../../../services/sessions/common/session.js';
import { ISessionsManagementService } from '../../../services/sessions/common/sessionsManagement.js';
import { SESSIONS_LIST_UNGROUPED_PLACEMENT, SessionsGrouping, SessionsList, SessionsListSessionPosition, SessionsListSnapshotNode, SessionsSorting } from './views/sessionsList.js';
import { getSessionFilterOptions, SessionFilter, sessionFilterKey } from './views/sessionsListFilters.js';
import { SessionsView, SessionsViewId } from './views/sessionsView.js';

export const ReadSessionsListToolId = 'vscode_readSessionsList';
export const OrganizeSessionsListToolId = 'vscode_organizeSessionsList';

const sessionsListToolsWhen = ContextKeyExpr.and(IsSessionsWindowContext, ChatContextKeys.enabled, ContextKeyExpr.equals(`config.${SESSIONS_LIST_AGENT_TOOLS_SETTING}`, true));

/** How many sessions each header lists when the whole list is read. */
const MAX_SESSIONS_PER_HEADER = 25;

const sessionStatusNames: Record<SessionStatus, string> = {
	[SessionStatus.Untitled]: 'untitled',
	[SessionStatus.InProgress]: 'inProgress',
	[SessionStatus.NeedsInput]: 'needsInput',
	[SessionStatus.Completed]: 'completed',
	[SessionStatus.Error]: 'error',
};

const sessionsListActions = ['setView', 'createGroup', 'renameGroup', 'deleteGroup', 'moveSessions', 'moveHeader', 'setCollapsed'] as const;
type SessionsListAction = typeof sessionsListActions[number];
/** Actions that resolve their targets against the composed list rather than only the list's state services. */
const listReadingActions: ReadonlySet<string> = new Set<SessionsListAction>(['createGroup', 'moveSessions', 'moveHeader', 'setCollapsed']);

type SessionsListNodeOutput =
	| {
		readonly type: 'section' | 'group';
		readonly id: string;
		readonly label: string;
		readonly collapsed: boolean;
		readonly hidden?: true;
		readonly comparison?: true;
		readonly children: readonly SessionsListNodeOutput[];
		readonly omittedSessions?: number;
	}
	| {
		readonly type: 'session';
		readonly id: string;
		readonly title: string;
		readonly status: string;
		readonly workspace?: string;
		readonly unread?: true;
		readonly current?: true;
		readonly hidden?: true;
	};

interface ISessionsListOperationResult {
	readonly action: string;
	readonly ok: boolean;
	readonly id?: string;
	readonly error?: string;
}

class SessionsListToolInputError extends Error { }

/** Reveals the Sessions list without focusing it, so its list state can be read and changed. */
async function getSessionsView(viewsService: IViewsService, configurationService: IConfigurationService): Promise<SessionsView & { readonly sessionsControl: SessionsList }> {
	if (configurationService.getValue<boolean>(SESSIONS_LIST_AGENT_TOOLS_SETTING) !== true) {
		throw new Error('The Sessions list tools are disabled.');
	}
	const view = viewsService.getViewWithId<SessionsView>(SessionsViewId) ?? await viewsService.openView<SessionsView>(SessionsViewId, false);
	if (!view?.sessionsControl) {
		throw new Error('The Sessions list is not available.');
	}
	// The list renders state changes only while visible; bring it up to date.
	view.sessionsControl.refresh();
	return view as SessionsView & { readonly sessionsControl: SessionsList };
}

function toolResult(value: unknown, message: string): IToolResult {
	return { content: [{ kind: 'text', value: JSON.stringify(value) }], toolResultMessage: message };
}

function toolError(message: string): IToolResult {
	return { content: [{ kind: 'text', value: `Error: ${message}` }], toolResultError: message };
}

export class ReadSessionsListTool implements IToolImpl {

	constructor(
		@IViewsService private readonly viewsService: IViewsService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@ISessionsManagementService private readonly sessionsManagementService: ISessionsManagementService,
		@ISessionsProvidersService private readonly sessionsProvidersService: ISessionsProvidersService,
	) { }

	getToolData(): IToolData {
		return {
			id: ReadSessionsListToolId,
			toolReferenceName: 'readSessionsList',
			canBeReferencedInPrompt: false,
			icon: Codicon.listTree,
			displayName: localize('sessionsList.tool.read.displayName', "Read Sessions List"),
			userDescription: localize('sessionsList.tool.read.userDescription', "Read how the Sessions list is grouped, sorted, filtered, and organized"),
			modelDescription: `Read the Agents window Sessions list as the user sees it: its view options (grouping, sorting, filters, archived visibility, section capping) and its tree of sections, nested custom groups, and session rows. Use it to find where sessions are and to get the IDs that organizeSessionsList takes before changing the list. Header IDs are stable section IDs: "pinned", "quickchats", "external", "archived" (the Done section), "recent"/"older" when grouped by time, "workspace:<label>", "repository:<owner/name>", "environment:<id>", and "group:<id>" for custom groups. The tree reflects the current filters: sessions they exclude are not listed. Rows and sections that capping hides behind "Show more" are listed with hidden: true. Without headerId, each header lists at most ${MAX_SESSIONS_PER_HEADER} sessions and reports omittedSessions; pass headerId to list every session of one header. The session running this tool is marked current: true. This tool changes nothing.`,
			source: ToolDataSource.Internal,
			when: sessionsListToolsWhen,
			runsInWorkspace: false,
			agentHostPreferences: { defer: 'auto' },
			inputSchema: {
				type: 'object',
				properties: {
					headerId: {
						type: 'string',
						description: 'Section or custom group ID to read with all of its sessions. Omit to read the whole list.',
					},
				},
				additionalProperties: false,
			},
		};
	}

	async prepareToolInvocation(_context: IToolInvocationPreparationContext, _token: CancellationToken): Promise<IPreparedToolInvocation> {
		return {
			invocationMessage: localize('sessionsList.tool.read.invocationMessage', "Reading the Sessions list"),
			pastTenseMessage: localize('sessionsList.tool.read.pastTenseMessage', "Read the Sessions list"),
		};
	}

	async invoke(invocation: IToolInvocation, _countTokens: CountTokensCallback, _progress: ToolProgress, _token: CancellationToken): Promise<IToolResult> {
		const headerId = isObject(invocation.parameters) && typeof (invocation.parameters as { headerId?: unknown }).headerId === 'string'
			? (invocation.parameters as { headerId: string }).headerId
			: undefined;
		let view: SessionsView & { readonly sessionsControl: SessionsList };
		try {
			view = await getSessionsView(this.viewsService, this.configurationService);
		} catch (error) {
			return toolError(error instanceof Error ? error.message : String(error));
		}
		const currentSessionId = getInvokingSession(this.sessionsManagementService, invocation.context?.sessionResource)?.sessionId;
		const snapshot = view.sessionsControl.getTreeSnapshot();
		let tree: readonly SessionsListSnapshotNode[] = snapshot;
		if (headerId !== undefined) {
			const header = findHeader(snapshot, headerId);
			if (!header) {
				return toolError(`The Sessions list has no section or group "${headerId}". Call readSessionsList without headerId to see the list.`);
			}
			tree = [header];
		}
		const output = {
			view: this.getViewState(view),
			tree: tree.map(node => toNodeOutput(node, currentSessionId, headerId === undefined ? MAX_SESSIONS_PER_HEADER : undefined)),
		};
		return toolResult(output, headerId === undefined
			? localize('sessionsList.tool.read.result', "Read the Sessions list")
			: localize('sessionsList.tool.read.result.header', "Read the {0} section of the Sessions list", headerId));
	}

	private getViewState(view: SessionsView & { readonly sessionsControl: SessionsList }) {
		const list = view.sessionsControl;
		const filterOptions = getSessionFilterOptions(this.sessionsManagementService.getSessions(), this.sessionsProvidersService.getProviders().map(provider => provider.environment));
		return {
			grouping: view.grouping,
			sorting: view.sorting,
			showArchived: !list.isExcludeArchived(),
			sessionsPerSection: list.isWorkspaceGroupCapped() ? 'recent' : 'all',
			compact: view.compact,
			externalSection: this.configurationService.getValue<boolean>(SESSIONS_LIST_GROUP_EXTERNAL_SESSIONS_SETTING) === true,
			filters: filterOptions.map(option => ({ ...option.filter, label: option.label, included: !list.filters.isExcluded(option.filter) })),
		};
	}
}

export class OrganizeSessionsListTool implements IToolImpl {

	constructor(
		@IViewsService private readonly viewsService: IViewsService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@ISessionsManagementService private readonly sessionsManagementService: ISessionsManagementService,
		@ISessionsProvidersService private readonly sessionsProvidersService: ISessionsProvidersService,
		@ISessionGroupsService private readonly sessionGroupsService: ISessionGroupsService,
	) { }

	getToolData(): IToolData {
		return {
			id: OrganizeSessionsListToolId,
			toolReferenceName: 'organizeSessionsList',
			canBeReferencedInPrompt: false,
			icon: Codicon.listTree,
			displayName: localize('sessionsList.tool.organize.displayName', "Organize Sessions List"),
			userDescription: localize('sessionsList.tool.organize.userDescription', "Group, order, filter, and sort the Sessions list"),
			modelDescription: `Change how the Agents window Sessions list is organized and displayed, as the user can by hand: create, rename, nest, reorder, collapse, and delete custom groups; move sessions into a group, Pinned, archived (Done), or back to their ungrouped section, and reorder them; nest or reorder workspace, repository, and environment sections; and change grouping, sorting, filters, archived visibility, and section capping. Use it whenever the user asks to arrange, group, pin, sort, or filter their sessions. It does not rename, open, or delete sessions.

Call readSessionsList first: operations take its header IDs and session IDs. Operations run in order, and later operations can refer to a group created earlier in the same call by its "key". The call stops at the first failing operation; the result reports each operation that ran.

Placement follows the list's precedence: archived > pinned > custom group > ungrouped section. Moving sessions changes only what their destination needs (unarchive, pin or unpin, join or leave a group). Moving sessions to "archived" marks them done; the user can undo it. Archived sessions keep a fixed order, and comparison groups own their membership and cannot be renamed or deleted. Deleting a group deletes its subgroups, ungroups their sessions, and returns their nested sections to the top level. The changes are local presentation state of the list, persisted for the user.`,
			source: ToolDataSource.Internal,
			when: sessionsListToolsWhen,
			runsInWorkspace: false,
			agentHostPreferences: { defer: 'auto' },
			inputSchema: organizeInputSchema,
		};
	}

	async prepareToolInvocation(context: IToolInvocationPreparationContext, _token: CancellationToken): Promise<IPreparedToolInvocation> {
		const count = getOperations(context.parameters)?.length ?? 0;
		return {
			invocationMessage: count === 1
				? localize('sessionsList.tool.organize.invocationMessage.single', "Organizing the Sessions list")
				: localize('sessionsList.tool.organize.invocationMessage', "Organizing the Sessions list ({0} changes)", count),
			pastTenseMessage: localize('sessionsList.tool.organize.pastTenseMessage', "Organized the Sessions list"),
		};
	}

	async invoke(invocation: IToolInvocation, _countTokens: CountTokensCallback, _progress: ToolProgress, token: CancellationToken): Promise<IToolResult> {
		const operations = getOperations(invocation.parameters);
		if (!operations || operations.length === 0) {
			return toolError('"operations" must be a non-empty array.');
		}
		let view: SessionsView & { readonly sessionsControl: SessionsList };
		try {
			view = await getSessionsView(this.viewsService, this.configurationService);
		} catch (error) {
			return toolError(error instanceof Error ? error.message : String(error));
		}

		const keys = new Map<string, string>();
		const results: ISessionsListOperationResult[] = [];
		// A hidden list does not render state changes, so recompose it only before operations that read it, and once at the end.
		let stale = false;
		for (const operation of operations) {
			if (token.isCancellationRequested) {
				break;
			}
			const action = isObject(operation) && typeof operation.action === 'string' ? operation.action : '';
			if (stale && listReadingActions.has(action)) {
				view.sessionsControl.update();
				stale = false;
			}
			try {
				const id = await this.applyOperation(view, operation, keys);
				results.push(id ? { action, ok: true, id } : { action, ok: true });
			} catch (error) {
				results.push({ action, ok: false, error: error instanceof Error ? error.message : String(error) });
				break;
			} finally {
				stale = true;
			}
		}
		if (stale) {
			view.sessionsControl.update();
		}

		const failed = results.some(result => !result.ok);
		const skipped = operations.length - results.length;
		const output = {
			results,
			...(skipped > 0 ? { skippedOperations: skipped } : {}),
			...(failed ? { hint: 'Operations after the failure did not run. Call readSessionsList to see the current state before retrying.' } : {}),
		};
		const succeeded = results.filter(result => result.ok).length;
		return toolResult(output, failed
			? localize('sessionsList.tool.organize.result.failed', "Applied {0} of {1} Sessions list changes", succeeded, operations.length)
			: succeeded === 1
				? localize('sessionsList.tool.organize.result.single', "Applied 1 Sessions list change")
				: localize('sessionsList.tool.organize.result', "Applied {0} Sessions list changes", succeeded));
	}

	/** Applies one operation; returns the ID of the group it creates. */
	private async applyOperation(view: SessionsView & { readonly sessionsControl: SessionsList }, operation: Record<string, unknown>, keys: Map<string, string>): Promise<string | undefined> {
		const list = view.sessionsControl;
		const action = operation.action as SessionsListAction;
		switch (action) {
			case 'setView':
				await this.setView(view, operation);
				return undefined;
			case 'createGroup': {
				const name = readName(operation);
				const parent = optionalString(operation, 'parent');
				const sessions = optionalStringArray(operation, 'sessions');
				const key = optionalString(operation, 'key');
				if (key !== undefined && keys.has(key)) {
					throw new SessionsListToolInputError(`Key "${key}" already names a group created in this call.`);
				}
				const group = list.addGroup(name, parent === undefined ? undefined : this.resolveHeader(parent, keys));
				const headerId = getSessionGroupSectionId(group.id);
				if (key !== undefined) {
					keys.set(key, headerId);
				}
				if (sessions?.length) {
					await list.moveSessionsTo(this.resolveSessions(sessions), headerId, undefined);
				}
				return headerId;
			}
			case 'renameGroup':
				list.renameGroup(this.resolveHeader(requiredString(operation, 'id'), keys), readName(operation));
				return undefined;
			case 'deleteGroup':
				await list.deleteGroup(this.resolveHeader(requiredString(operation, 'id'), keys));
				return undefined;
			case 'moveSessions': {
				const sessions = this.resolveSessions(optionalStringArray(operation, 'sessions') ?? []);
				if (sessions.length === 0) {
					throw new SessionsListToolInputError('"sessions" must list at least one session ID.');
				}
				const to = optionalString(operation, 'to');
				await list.moveSessionsTo(sessions, to === undefined ? undefined : this.resolvePlacement(to, keys), this.readSessionPosition(operation));
				return undefined;
			}
			case 'moveHeader': {
				const headerId = this.resolveHeader(requiredString(operation, 'id'), keys);
				const sibling = this.readHeaderSibling(operation, keys);
				let parentId: string | undefined;
				if (operation.parent === null) {
					parentId = undefined;
				} else if (operation.parent !== undefined) {
					parentId = this.resolveHeader(requiredString(operation, 'parent'), keys);
				} else if (sibling) {
					// Without a parent, the header joins its sibling's parent.
					parentId = findHeaderParent(list.getTreeSnapshot(), sibling.siblingId);
				} else {
					throw new SessionsListToolInputError('"moveHeader" needs "parent" (a group ID, or null for the top level), "before", or "after".');
				}
				list.moveHeaderTo(headerId, parentId, sibling);
				return undefined;
			}
			case 'setCollapsed': {
				if (typeof operation.collapsed !== 'boolean') {
					throw new SessionsListToolInputError('"setCollapsed" needs a boolean "collapsed".');
				}
				list.setHeaderCollapsed(this.resolveHeader(requiredString(operation, 'id'), keys), operation.collapsed);
				return undefined;
			}
			default:
				throw new SessionsListToolInputError(`Unknown action "${String(operation.action)}". Use one of: ${sessionsListActions.join(', ')}.`);
		}
	}

	private async setView(view: SessionsView & { readonly sessionsControl: SessionsList }, operation: Record<string, unknown>): Promise<void> {
		const list = view.sessionsControl;
		const grouping = optionalEnum(operation, 'grouping', Object.values(SessionsGrouping));
		const sorting = optionalEnum(operation, 'sorting', Object.values(SessionsSorting));
		const sessionsPerSection = optionalEnum(operation, 'sessionsPerSection', ['recent', 'all'] as const);
		const showArchived = optionalBoolean(operation, 'showArchived');
		const compact = optionalBoolean(operation, 'compact');
		const externalSection = optionalBoolean(operation, 'externalSection');
		const resetFilters = optionalBoolean(operation, 'resetFilters');
		const filters = this.readFilters(operation);

		// Validate before changing anything, so a rejected operation changes nothing.
		if (resetFilters) {
			view.resetFilters();
		}
		if (grouping !== undefined) {
			view.setGrouping(grouping);
		}
		if (sorting !== undefined) {
			view.setSorting(sorting);
		}
		for (const { filter, included } of filters) {
			list.filters.setExcluded(filter, !included);
		}
		if (showArchived !== undefined) {
			view.setShowArchived(showArchived);
		}
		if (sessionsPerSection !== undefined) {
			view.setWorkspaceGroupCapped(sessionsPerSection === 'recent');
		}
		if (compact !== undefined) {
			view.setCompact(compact);
		}
		if (externalSection !== undefined && this.configurationService.getValue<boolean>(SESSIONS_LIST_GROUP_EXTERNAL_SESSIONS_SETTING) !== externalSection) {
			await this.configurationService.updateValue(SESSIONS_LIST_GROUP_EXTERNAL_SESSIONS_SETTING, externalSection, ConfigurationTarget.USER);
		}
	}

	private readFilters(operation: Record<string, unknown>): { readonly filter: SessionFilter; readonly included: boolean }[] {
		if (operation.filters === undefined) {
			return [];
		}
		if (!Array.isArray(operation.filters)) {
			throw new SessionsListToolInputError('"filters" must be an array.');
		}
		const options = new Map(getSessionFilterOptions(this.sessionsManagementService.getSessions(), this.sessionsProvidersService.getProviders().map(provider => provider.environment))
			.map(option => [sessionFilterKey(option.filter), option.filter]));
		return operation.filters.map((entry: unknown) => {
			if (!isObject(entry)) {
				throw new SessionsListToolInputError('Each filter must be an object with "kind", "id", and "included".');
			}
			const { kind, id, environment, included } = entry as Record<string, unknown>;
			if (typeof id !== 'string' || typeof included !== 'boolean' || (kind !== 'harness' && kind !== 'environment' && kind !== 'application')) {
				throw new SessionsListToolInputError('Each filter needs "kind" (harness, environment, or application), a string "id", and a boolean "included".');
			}
			if (kind === 'application' && typeof environment !== 'string') {
				throw new SessionsListToolInputError('An application filter needs the "environment" it belongs to.');
			}
			const filter: SessionFilter = kind === 'application' ? { kind, environment: environment as string, id } : { kind, id };
			const option = options.get(sessionFilterKey(filter));
			if (!option) {
				throw new SessionsListToolInputError(`There is no ${kind} filter "${id}"${kind === 'application' ? ` in environment "${environment}"` : ''}. Use the filters that readSessionsList reports.`);
			}
			return { filter: option, included };
		});
	}

	private readSessionPosition(operation: Record<string, unknown>): SessionsListSessionPosition | undefined {
		const before = optionalString(operation, 'before');
		const after = optionalString(operation, 'after');
		const position = optionalEnum(operation, 'position', ['top', 'bottom'] as const);
		if ([before, after, position].filter(value => value !== undefined).length > 1) {
			throw new SessionsListToolInputError('Use only one of "before", "after", and "position".');
		}
		if (before !== undefined || after !== undefined) {
			return { session: this.resolveSessions([before ?? after!])[0], position: before !== undefined ? 'before' : 'after' };
		}
		return position;
	}

	private readHeaderSibling(operation: Record<string, unknown>, keys: Map<string, string>): { readonly siblingId: string; readonly position: 'before' | 'after' } | undefined {
		const before = optionalString(operation, 'before');
		const after = optionalString(operation, 'after');
		if (before !== undefined && after !== undefined) {
			throw new SessionsListToolInputError('Use only one of "before" and "after".');
		}
		const sibling = before ?? after;
		return sibling === undefined ? undefined : { siblingId: this.resolveHeader(sibling, keys), position: before !== undefined ? 'before' : 'after' };
	}

	/** A header ID from readSessionsList, a key of a group created in this call, or a bare group ID. */
	private resolveHeader(ref: string, keys: ReadonlyMap<string, string>): string {
		const keyed = keys.get(ref);
		if (keyed !== undefined) {
			return keyed;
		}
		return this.sessionGroupsService.getGroup(ref) ? getSessionGroupSectionId(ref) : ref;
	}

	private resolvePlacement(ref: string, keys: ReadonlyMap<string, string>): string {
		return ref === 'pinned' || ref === 'archived' || ref === SESSIONS_LIST_UNGROUPED_PLACEMENT ? ref : this.resolveHeader(ref, keys);
	}

	private resolveSessions(ids: readonly string[]): ISession[] {
		const sessions = this.sessionsManagementService.getSessions();
		return ids.map(id => {
			const session = sessions.find(candidate => candidate.sessionId === id || candidate.resource.toString() === id);
			if (!session) {
				throw new SessionsListToolInputError(`Session "${id}" does not exist. Use the session IDs that readSessionsList reports.`);
			}
			return session;
		});
	}
}

const organizeInputSchema: IJSONSchema & { type: 'object' } = {
	type: 'object',
	properties: {
		operations: {
			type: 'array',
			minItems: 1,
			description: 'Changes to apply in order.',
			items: {
				type: 'object',
				properties: {
					action: {
						type: 'string',
						enum: [...sessionsListActions],
						description: [
							'setView: change any of grouping, sorting, filters, resetFilters, showArchived, sessionsPerSection, compact, externalSection.',
							'createGroup: create a group named "name", optionally nested first in "parent" and holding "sessions"; returns its ID. "key" lets later operations refer to it.',
							'renameGroup: rename group "id" to "name".',
							'deleteGroup: delete group "id".',
							'moveSessions: move "sessions" to "to", optionally positioned with "before"/"after" (a session ID in the destination) or "position". Without "to", the sessions join the placement of the "before"/"after" session, which also reorders them.',
							'moveHeader: move group or workspace/repository/environment section "id" into group "parent" (null for the top level), optionally next to sibling header "before"/"after". Without "parent", it joins the parent of its "before"/"after" sibling. Nested without a sibling, it becomes the first child.',
							'setCollapsed: collapse or expand section or group "id".',
						].join('\n'),
					},
					id: { type: 'string', description: 'Header ID of the group or section the action changes (renameGroup, deleteGroup, moveHeader, setCollapsed).' },
					name: { type: 'string', description: 'Group name (createGroup, renameGroup).' },
					key: { type: 'string', description: 'Name for the group createGroup creates, which later operations of this call can use instead of its ID.' },
					parent: { type: ['string', 'null'], description: 'Group to nest in (createGroup, moveHeader); null moves a header to the top level.' },
					sessions: { type: 'array', items: { type: 'string' }, description: 'Session IDs (createGroup, moveSessions), moved in their current list order.' },
					to: { type: 'string', description: 'Destination of moveSessions: "pinned", "archived", "ungrouped" (each session\'s own workspace, repository, environment, chats, or date section), or the header ID of a custom group or an ungrouped section.' },
					before: { type: 'string', description: 'Position before this session ID (moveSessions) or sibling header ID (moveHeader).' },
					after: { type: 'string', description: 'Position after this session ID (moveSessions) or sibling header ID (moveHeader).' },
					position: { type: 'string', enum: ['top', 'bottom'], description: 'Position first or last in the destination (moveSessions).' },
					collapsed: { type: 'boolean', description: 'Whether to collapse (setCollapsed).' },
					grouping: { type: 'string', enum: Object.values(SessionsGrouping), description: 'Section the list by workspace, repository, environment, or date (setView).' },
					sorting: { type: 'string', enum: Object.values(SessionsSorting), description: 'Sort sessions by creation or last update time (setView).' },
					filters: {
						type: 'array',
						description: 'Filters to include or exclude, as readSessionsList reports them (setView).',
						items: {
							type: 'object',
							properties: {
								kind: { type: 'string', enum: ['harness', 'environment', 'application'] },
								id: { type: 'string' },
								environment: { type: 'string', description: 'Environment of an application filter.' },
								included: { type: 'boolean' },
							},
							required: ['kind', 'id', 'included'],
						},
					},
					resetFilters: { type: 'boolean', description: 'Before applying the other options, reset the filters, archived visibility, sessions per section, and each section\'s show more or show less choice to their defaults; grouping, sorting, compact, and externalSection are unaffected. The user can undo it (setView).' },
					showArchived: { type: 'boolean', description: 'Show archived (Done) sessions (setView).' },
					sessionsPerSection: { type: 'string', enum: ['recent', 'all'], description: 'Cap workspace, repository, and environment sections to recent sessions, or show all (setView).' },
					compact: { type: 'boolean', description: 'Use compact rows (setView).' },
					externalSection: { type: 'boolean', description: 'Show sessions created outside VS Code in their own External section (setView).' },
				},
				required: ['action'],
			},
		},
	},
	required: ['operations'],
	additionalProperties: false,
};

function getOperations(parameters: unknown): Record<string, unknown>[] | undefined {
	const operations = isObject(parameters) ? (parameters as { operations?: unknown }).operations : undefined;
	return Array.isArray(operations) ? operations.map(operation => isObject(operation) ? operation as Record<string, unknown> : {}) : undefined;
}

function optionalString(operation: Record<string, unknown>, property: string): string | undefined {
	const value = operation[property];
	if (value !== undefined && typeof value !== 'string') {
		throw new SessionsListToolInputError(`"${property}" must be a string.`);
	}
	return value;
}

function requiredString(operation: Record<string, unknown>, property: string): string {
	const value = optionalString(operation, property);
	if (value === undefined) {
		throw new SessionsListToolInputError(`"${operation.action}" needs "${property}".`);
	}
	return value;
}

function optionalStringArray(operation: Record<string, unknown>, property: string): string[] | undefined {
	const value = operation[property];
	if (value !== undefined && (!Array.isArray(value) || !value.every(item => typeof item === 'string'))) {
		throw new SessionsListToolInputError(`"${property}" must be an array of strings.`);
	}
	return value;
}

function optionalBoolean(operation: Record<string, unknown>, property: string): boolean | undefined {
	const value = operation[property];
	if (value !== undefined && typeof value !== 'boolean') {
		throw new SessionsListToolInputError(`"${property}" must be a boolean.`);
	}
	return value;
}

function optionalEnum<T extends string>(operation: Record<string, unknown>, property: string, values: readonly T[]): T | undefined {
	const value = operation[property];
	if (value !== undefined && !values.includes(value as T)) {
		throw new SessionsListToolInputError(`"${property}" must be one of: ${values.join(', ')}.`);
	}
	return value as T | undefined;
}

function readName(operation: Record<string, unknown>): string {
	const name = requiredString(operation, 'name').trim();
	if (!name) {
		throw new SessionsListToolInputError('"name" must not be empty.');
	}
	return name;
}

function getInvokingSession(sessionsManagementService: ISessionsManagementService, resource: URI | undefined): ISession | undefined {
	return resource && (sessionsManagementService.getSession(resource) ?? sessionsManagementService.getSessionForChatResource(resource)?.session);
}

function findHeader(nodes: readonly SessionsListSnapshotNode[], headerId: string): SessionsListSnapshotNode | undefined {
	for (const node of nodes) {
		if (node.type === 'session') {
			continue;
		}
		if (node.id === headerId) {
			return node;
		}
		const match = findHeader(node.children, headerId);
		if (match) {
			return match;
		}
	}
	return undefined;
}

/** The custom group the header is nested in, or `undefined` at the top level. */
function findHeaderParent(nodes: readonly SessionsListSnapshotNode[], headerId: string, parentId?: string): string | undefined {
	for (const node of nodes) {
		if (node.type === 'session') {
			continue;
		}
		if (node.id === headerId) {
			return parentId;
		}
		const match = findHeaderParent(node.children, headerId, node.id);
		if (match !== undefined) {
			return match;
		}
	}
	return undefined;
}

function toNodeOutput(node: SessionsListSnapshotNode, currentSessionId: string | undefined, maxSessions: number | undefined): SessionsListNodeOutput {
	if (node.type === 'session') {
		const session = node.session;
		const workspace = session.workspace.get()?.label;
		return {
			type: 'session',
			id: session.sessionId,
			title: session.title.get(),
			status: sessionStatusNames[session.status.get()] ?? 'unknown',
			...(workspace ? { workspace } : {}),
			...(!session.isRead.get() ? { unread: true } : {}),
			...(session.sessionId === currentSessionId ? { current: true } : {}),
			...(node.hidden ? { hidden: true } : {}),
		};
	}
	let sessionCount = 0;
	let omittedSessions = 0;
	const children: SessionsListNodeOutput[] = [];
	for (const child of node.children) {
		if (child.type === 'session' && maxSessions !== undefined && sessionCount >= maxSessions) {
			omittedSessions++;
			continue;
		}
		if (child.type === 'session') {
			sessionCount++;
		}
		children.push(toNodeOutput(child, currentSessionId, maxSessions));
	}
	return {
		type: node.type,
		id: node.id,
		label: node.label,
		collapsed: node.collapsed,
		...(node.hidden ? { hidden: true } : {}),
		...(node.comparison ? { comparison: true } : {}),
		children,
		...(omittedSessions > 0 ? { omittedSessions } : {}),
	};
}

export class SessionsListToolsContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'sessions.contrib.sessionsListTools';

	constructor(
		@ILanguageModelToolsService toolsService: ILanguageModelToolsService,
		@IInstantiationService instantiationService: IInstantiationService,
	) {
		super();
		for (const tool of [instantiationService.createInstance(ReadSessionsListTool), instantiationService.createInstance(OrganizeSessionsListTool)]) {
			this._register(toolsService.registerTool(tool.getToolData(), tool));
		}
	}
}
