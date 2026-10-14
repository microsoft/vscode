/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { readdirSync, readFileSync } from 'fs';
import { join } from '../../../../base/common/path.js';
import { FileAccess } from '../../../../base/common/network.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';

/**
 * Grep guard v1 for invariants I1/I6: production code under `node/` must not read or write a
 * key owned by the central session state store directly in a session.db.
 *
 * The guard finds database metadata calls whose arguments mention an owned key, counts them per
 * (file, key) and compares them with {@link ALLOWLIST}. A new access fails the test; so does an
 * allowance that is no longer used, so the list only ever shrinks. Keys passed through variables
 * are not seen (v1 limitation).
 */

const OWNED_IDENTIFIERS: readonly string[] = [
	'AH_META_IS_ARCHIVED_DB_KEY', 'AH_META_IS_READ_DB_KEY', 'AH_META_DEFAULT_CHAT_IS_READ_DB_KEY', 'AH_META_AUTO_ARCHIVED_AT_DB_KEY',
	'AH_META_WORKSPACELESS_DB_KEY', 'AH_META_WORKSPACE_CONVERSION_QUARANTINED_DB_KEY', 'AH_META_CREATED_BY_SESSION_DB_KEY',
	'AH_META_EHCLI_ADOPTED_DB_KEY', 'AH_META_EHCLI_LAST_TURN_DB_KEY', 'AH_META_IS_DONE_DB_KEY', 'AH_META_DEV_CONTAINER_WORKTREE_DB_KEY',
	'SESSION_WORKING_DIRECTORIES_KEY', 'SESSION_ARTIFACTS_KEY', 'SESSION_CUSTOM_TITLE_KEY', 'SESSION_CUSTOM_TITLE_SOURCE_KEY',
	'customChatTitleMetadataKey', 'customChatTitleSourceMetadataKey',
	'META_SOURCE_CONTROL_STATE', 'META_PENDING_RECORDED_PULL_REQUESTS', 'META_CHANGES_SUMMARY',
	'META_GIT_STATE', 'META_GIT_DATA_STATE', 'META_GITHUB_STATE', 'META_GITHUB_DATA_STATE', 'META_DIFF_BASE_BRANCH',
	'REMOTE_SESSION_ORIGIN_METADATA_KEY', 'SESSION_INITIATOR_METADATA_KEY', 'SESSION_META_MULTI_ROOT_KEY', 'SESSION_META_FOLDER_PICKER_KEY',
	'CHAT_WORKING_DIRECTORIES_MIRROR_KEY', 'getChatChangesSummaryMetadataKey',
];

const OWNED_LITERALS: readonly string[] = [
	'configValues', 'customizationEnablement', 'agentHost.additionalWorktrees', 'agentHost.chatWorkingDirectories',
	'agentHost.diffBaseBranch', 'agentHost.workspaceless', 'copilot.worktree.', 'peerChats',
];

/** Modules that implement the store, its mirror or the database layer and may touch owned keys freely. */
const EXEMPT_FILES: readonly string[] = [
	'agentHostSessionStateStore.ts',
	'agentHostSessionStateMirror.ts',
	'agentHostSessionStateDatabase.ts',
	'agentHostCatalogSyncService.ts',
	'agentHostCatalogSourceResolver.ts',
	'agentHostCatalogReconciliationService.ts',
	'agentHostChatCatalogMigration.ts',
	'sessionDatabase.ts',
	'compatibleSessionDatabase.ts',
	'localAgentHostMetadata.ts',
];

interface IAllowance {
	readonly file: string;
	readonly key: string;
	readonly count: number;
	/** The step that removes the access, or `permanent`. */
	readonly removedBy: string;
	readonly reason: string;
}

const TITLES = 'title strategy/seed reads and writes still go to the db that older builds read';

const ALLOWLIST: readonly IAllowance[] = [
	{ file: 'agentHostPeerChatStore.ts', key: 'SESSION_CUSTOM_TITLE_KEY', count: 1, removedBy: 'permanent', reason: 'peer-store mirror writer: peer db keys are read by older builds' },
	{ file: 'agentHostPeerChatStore.ts', key: 'SESSION_CUSTOM_TITLE_SOURCE_KEY', count: 2, removedBy: 'permanent', reason: 'peer-store mirror writer: peer db keys are read by older builds' },
	{ file: 'agentHostPeerChatStore.ts', key: 'customChatTitleMetadataKey', count: 1, removedBy: 'permanent', reason: 'peer-store mirror writer: peer db keys are read by older builds' },
	{ file: 'agentHostPeerChatStore.ts', key: 'customChatTitleSourceMetadataKey', count: 1, removedBy: 'permanent', reason: 'peer-store mirror writer: peer db keys are read by older builds' },
	{ file: 'agentHostPeerChatStore.ts', key: 'AH_META_IS_READ_DB_KEY', count: 2, removedBy: 'permanent', reason: 'peer-store mirror writer: peer db keys are read by older builds' },
	{ file: 'agentHostSessionTitleController.ts', key: 'SESSION_CUSTOM_TITLE_KEY', count: 1, removedBy: 'C4', reason: TITLES },
	{ file: 'agentHostSessionTitleController.ts', key: 'SESSION_CUSTOM_TITLE_SOURCE_KEY', count: 1, removedBy: 'C4', reason: TITLES },
	{ file: 'agentHostSessionTitleController.ts', key: 'customChatTitleMetadataKey', count: 1, removedBy: 'C4', reason: TITLES },
	{ file: 'agentHostSessionTitleController.ts', key: 'customChatTitleSourceMetadataKey', count: 1, removedBy: 'C4', reason: TITLES },
	{ file: 'chatContributions/sessionTitle/sessionTitleContribution.ts', key: 'SESSION_CUSTOM_TITLE_KEY', count: 1, removedBy: 'C4', reason: TITLES },
	{ file: 'chatContributions/sessionTitle/sessionTitleContribution.ts', key: 'customChatTitleMetadataKey', count: 1, removedBy: 'C4', reason: TITLES },
	{ file: 'agentService.ts', key: 'configValues', count: 1, removedBy: 'C4', reason: 'changeset-summary migration reads the legacy aggregate from the session db' },
	{ file: 'agentService.ts', key: 'SESSION_CUSTOM_TITLE_KEY', count: 1, removedBy: 'C4', reason: TITLES },
	{ file: 'agentServiceComposition.ts', key: 'AH_META_AUTO_ARCHIVED_AT_DB_KEY', count: 1, removedBy: 'C4', reason: 'auto-archive sweep still reads the session db marker' },
	{ file: 'claude/claudeSessionMetadataStore.ts', key: 'AH_META_WORKSPACELESS_DB_KEY', count: 1, removedBy: 'permanent', reason: 'provider hasKnownSession reads its own default-chat db (design §4.5)' },
	{ file: 'codex/codexSessionMetadataStore.ts', key: 'AH_META_WORKSPACELESS_DB_KEY', count: 1, removedBy: 'permanent', reason: 'provider hasKnownSession reads its own default-chat db (design §4.5)' },
	{ file: 'copilot/copilotAgent.ts', key: 'AH_META_IS_READ_DB_KEY', count: 1, removedBy: 'permanent', reason: 'adoption flow reads the provider-owned db (design §4.5)' },
	{ file: 'copilot/copilotAgent.ts', key: 'SESSION_CUSTOM_TITLE_KEY', count: 1, removedBy: 'permanent', reason: 'adoption flow reads the provider-owned db (design §4.5)' },
	{ file: 'copilot/copilotAgent.ts', key: 'SESSION_CUSTOM_TITLE_SOURCE_KEY', count: 1, removedBy: 'permanent', reason: 'adoption flow reads the provider-owned db (design §4.5)' },
	{ file: 'copilot/copilotAgent.ts', key: 'AH_META_WORKSPACELESS_DB_KEY', count: 2, removedBy: 'permanent', reason: 'fork source and adoption reads of the provider-owned db (design §4.5)' },
	{ file: 'copilot/copilotAgent.ts', key: 'META_DIFF_BASE_BRANCH', count: 1, removedBy: 'permanent', reason: 'fork source read of the provider-owned db (design §4.5)' },
	{ file: 'copilot/copilotAgentSession.ts', key: 'META_DIFF_BASE_BRANCH', count: 1, removedBy: 'permanent', reason: 'own-db diffBaseBranch for restricted telemetry (design §4.5)' },
	{ file: 'shared/worktreeIsolation.ts', key: 'AH_META_IS_ARCHIVED_DB_KEY', count: 2, removedBy: 'permanent', reason: 'detached-worktree record dbs keep their own copy' },
	{ file: 'shared/worktreeIsolation.ts', key: 'AH_META_IS_DONE_DB_KEY', count: 1, removedBy: 'permanent', reason: 'detached-worktree record dbs keep their own copy' },
	{ file: 'shared/worktreeIsolation.ts', key: 'META_DIFF_BASE_BRANCH', count: 2, removedBy: 'permanent', reason: 'detached-worktree record dbs keep their own copy' },
];

/**
 * Removed central state that may not come back under `node/` or `common/`. Checkpoints are chat
 * data: turn rows and checkpoint repositories live in the chats' own databases. Branch changes
 * are computed live and never stored centrally.
 */
const REMOVED_CENTRAL_STATE: readonly string[] = [
	'chat_turn_checkpoints', 'session_checkpoint_repositories', 'checkpoint_sequence', 'IAgentHostCheckpointIndex', 'AgentHostCheckpointIndex',
	'nextSessionCheckpointSequence', 'upsertTurnCheckpoints', 'readTurnCheckpoints', 'deleteTurnCheckpoints', 'addCheckpointRepositories', 'readCheckpointRepositories',
	'session_branch_changesets', 'readBranchChangeset', 'hashBranchChangeset', 'IAgentHostSessionBranchChangesetState', 'IAgentHostSessionBranchChangesetPatch',
];

/**
 * Ref listings per file. Checkpoint refs are found through the rows of the chat that recorded
 * them, never by listing a session's ref prefix; the checkpoint service lists only the legacy
 * extension-host refs it adopts.
 */
const REF_LISTINGS: Readonly<Record<string, number>> = {
	'agentHostCheckpointService.ts': 1,
	'agentHostReviewService.ts': 1,
	'agentHostSessionStateStore.ts': 0,
};

const DB_ACCESS = /\.(getMetadata|getMetadataObject|setMetadata|setMetadataValues|deleteMetadata|setMetadataValuesAndCatalogSyncSnapshot)\(/g;

function stripComments(source: string): string {
	return source.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
}

function keyMentioned(args: string, key: string): boolean {
	return OWNED_IDENTIFIERS.includes(key)
		? new RegExp(`\\b${key}\\b`).test(args)
		: args.includes(`'${key}`) || args.includes(`\`${key}`) || args.includes(`"${key}`) || new RegExp(`\\b${key.replace(/\./g, '\\.')}\\b`).test(args);
}

/** Counts, per owned key, the database metadata calls in `source` whose arguments mention that key. */
function findOwnedKeyAccesses(source: string): Map<string, number> {
	const text = stripComments(source);
	const counts = new Map<string, number>();
	for (const match of text.matchAll(DB_ACCESS)) {
		let index = match.index + match[0].length;
		const start = index;
		for (let depth = 1; index < text.length && depth > 0; index++) {
			if (text[index] === '(') {
				depth++;
			} else if (text[index] === ')') {
				depth--;
			}
		}
		const args = text.slice(start, index);
		for (const key of [...OWNED_IDENTIFIERS, ...OWNED_LITERALS]) {
			if (keyMentioned(args, key)) {
				counts.set(key, (counts.get(key) ?? 0) + 1);
			}
		}
	}
	return counts;
}

function listSources(dir: string, prefix = ''): string[] {
	const files: string[] = [];
	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		if (entry.isDirectory()) {
			if (entry.name !== 'protocol') {
				files.push(...listSources(join(dir, entry.name), `${prefix}${entry.name}/`));
			}
		} else if (entry.name.endsWith('.ts')) {
			files.push(`${prefix}${entry.name}`);
		}
	}
	return files;
}

suite('Agent Host session state ownership guard', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('finds owned-key accesses and ignores other keys and comments', () => {
		const counts = findOwnedKeyAccesses([
			`await db.getMetadata(AH_META_IS_ARCHIVED_DB_KEY);`,
			`await db.setMetadataValues({ [SESSION_CUSTOM_TITLE_KEY]: title, [customChatTitleMetadataKey(chat)]: title });`,
			`await db.getMetadataObject({ configValues: true });`,
			`await db.getMetadata('copilot.worktree.path');`,
			`await db.getMetadata('some.provider.key');`,
			`// await db.getMetadata(META_GIT_STATE);`,
			`const x = AH_META_IS_READ_DB_KEY;`,
		].join('\n'));
		assert.deepStrictEqual([...counts].sort(), [
			['AH_META_IS_ARCHIVED_DB_KEY', 1],
			['SESSION_CUSTOM_TITLE_KEY', 1],
			['configValues', 1],
			['copilot.worktree.', 1],
			['customChatTitleMetadataKey', 1],
		]);
	});

	test('every allowance names a removing step or is permanent with a reason', () => {
		for (const allowance of ALLOWLIST) {
			assert.ok(/^(C[0-9]+|permanent)$/.test(allowance.removedBy) && allowance.reason.length > 0, `${allowance.file}:${allowance.key}`);
		}
	});

	test('no removed central checkpoint or branch-changes state and no ref-prefix listing for checkpoints', () => {
		const agentHostDir = join(FileAccess.asFileUri('').fsPath, '..', 'src', 'vs', 'platform', 'agentHost');
		const found: string[] = [];
		const listings: Record<string, number> = {};
		for (const folder of ['node', 'common']) {
			for (const file of listSources(join(agentHostDir, folder))) {
				const text = stripComments(readFileSync(join(agentHostDir, folder, file), 'utf8'));
				for (const name of REMOVED_CENTRAL_STATE) {
					if (new RegExp(`\\b${name}\\b`).test(text)) {
						found.push(`${folder}/${file} :: ${name}`);
					}
				}
				const fileName = file.split('/').pop()!;
				if (folder === 'node' && REF_LISTINGS[fileName] !== undefined) {
					listings[fileName] = [...text.matchAll(/\.listRefNamesWithOids(\?\.)?\(/g)].length;
				}
			}
		}
		assert.deepStrictEqual({ found, listings }, { found: [], listings: REF_LISTINGS });
	});

	test('production code accesses owned keys in a session db only where allowlisted', () => {
		const nodeDir = join(FileAccess.asFileUri('').fsPath, '..', 'src', 'vs', 'platform', 'agentHost', 'node');
		const allowed = new Map(ALLOWLIST.map(allowance => [`${allowance.file}\u0000${allowance.key}`, allowance.count]));
		const found = new Map<string, number>();
		for (const file of listSources(nodeDir)) {
			if (EXEMPT_FILES.includes(file.split('/').pop()!)) {
				continue;
			}
			for (const [key, count] of findOwnedKeyAccesses(readFileSync(join(nodeDir, file), 'utf8'))) {
				found.set(`${file}\u0000${key}`, count);
			}
		}
		const render = (map: Map<string, number>) => [...map].map(([id, count]) => `${id.replace('\u0000', ' :: ')} x${count}`).sort();
		assert.deepStrictEqual(render(found), render(allowed));
	});
});
