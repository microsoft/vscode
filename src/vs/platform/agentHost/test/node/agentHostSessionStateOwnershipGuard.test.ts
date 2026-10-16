/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { readdirSync, readFileSync } from 'fs';
import { join } from '../../../../base/common/path.js';
import { FileAccess } from '../../../../base/common/network.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { AH_META_EHCLI_ADOPTED_DB_KEY, AH_META_EHCLI_LAST_TURN_DB_KEY } from '../../common/state/sessionState.js';
import { getSessionStateValueKey, SESSION_STATE_VALUE_KEYS } from '../../node/agentHostSessionStateMirror.js';
import { AH_CHAT_CONFIG_VALUES_DB_KEY } from '../../node/agentHostChatRowStore.js';

/**
 * Grep guard v1 for invariants I1/I6: production code under `node/` must not read or write a
 * key owned by the central session state store directly in a session.db.
 *
 * The guard finds database metadata calls whose arguments mention an owned key, counts them per
 * (file, key) and compares them with {@link ALLOWLIST}. A new access fails the test; so does an
 * allowance that is no longer used, so the list only ever shrinks. Besides the named identifiers,
 * every string constant declared under `node/` or `common/` (a module `const` or a class
 * `static readonly`, such as `CopilotAgent._META_*`) whose value is an owned key is resolved and
 * tracked the same way. Keys computed at runtime are not seen.
 */

const OWNED_IDENTIFIERS: readonly string[] = [
	'AH_META_IS_ARCHIVED_DB_KEY', 'AH_META_IS_READ_DB_KEY', 'AH_META_DEFAULT_CHAT_IS_READ_DB_KEY', 'AH_META_AUTO_ARCHIVED_AT_DB_KEY',
	'AH_META_WORKSPACELESS_DB_KEY', 'AH_META_WORKSPACE_CONVERSION_QUARANTINED_DB_KEY', 'AH_META_CREATED_BY_SESSION_DB_KEY',
	'AH_META_IS_DONE_DB_KEY', 'AH_META_DEV_CONTAINER_WORKTREE_DB_KEY',
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

/** Whether `value` is a key the central session state store owns. */
function isOwnedKeyValue(value: string): boolean {
	return getSessionStateValueKey(value) !== undefined
		|| OWNED_LITERALS.some(literal => literal.endsWith('.') ? value.startsWith(literal) : value === literal)
		|| SESSION_STATE_VALUE_KEYS.some(entry => entry.key === value);
}

const CONSTANT_DECLARATION = /\b(?:const|static\s+readonly|readonly)\s+(?<name>[A-Za-z_$][\w$]*)\s*(?::[^=;]+)?=\s*'(?<value>[^'\n]+)'/g;

/** The string constants declared in `source` whose value is an owned key, by name. */
function findOwnedConstants(source: string): Map<string, string> {
	const constants = new Map<string, string>();
	for (const match of stripComments(source).matchAll(CONSTANT_DECLARATION)) {
		const { name, value } = match.groups!;
		if (isOwnedKeyValue(value)) {
			constants.set(name, value);
		}
	}
	return constants;
}

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

/**
 * Chat data: each chat's own keys, read and written in the chat's own database (the session
 * database for the default chat) as older builds do. Never owned by the session state store.
 */
const CHAT_DATA_KEYS: readonly { readonly identifier: string; readonly key: string }[] = [
	{ identifier: 'AH_META_EHCLI_ADOPTED_DB_KEY', key: AH_META_EHCLI_ADOPTED_DB_KEY },
	{ identifier: 'AH_META_EHCLI_LAST_TURN_DB_KEY', key: AH_META_EHCLI_LAST_TURN_DB_KEY },
	{ identifier: 'AH_CHAT_CONFIG_VALUES_DB_KEY', key: AH_CHAT_CONFIG_VALUES_DB_KEY },
];

/**
 * The final allowlist: every remaining direct access of an owned key, each a read or write of a
 * database that is not the store's mirror target for that key, or that the store cannot serve.
 */
const ALLOWLIST: readonly IAllowance[] = [
	// Peer store: legacy-catalog (v1) peers' own databases, which older builds overlay over `peerChats` (goes away with v1), and
	// the one-time title adoption of chats central state does not know yet.
	{ file: 'agentHostPeerChatStore.ts', key: 'SESSION_CUSTOM_TITLE_KEY', count: 2, removedBy: 'permanent', reason: 'restoring a private chat adopts the title in its own database; a normalized peer\'s title is published to and imported from its own database for older builds' },
	{ file: 'agentHostPeerChatStore.ts', key: 'SESSION_CUSTOM_TITLE_SOURCE_KEY', count: 3, removedBy: 'permanent', reason: 'restoring a private chat adopts its own-db title source; a normalized default title snapshot adopts the source main writes to session.db; a normalized peer\'s title source is published to and imported from its own database' },
	{ file: 'agentHostPeerChatStore.ts', key: 'customChatTitleMetadataKey', count: 3, removedBy: 'permanent', reason: 'restoring a private chat adopts the title an older build wrote to session.db; a normalized peer\'s title is published to and imported from session.db for older builds, and removed when it leaves their list' },
	{ file: 'agentHostPeerChatStore.ts', key: 'customChatTitleSourceMetadataKey', count: 3, removedBy: 'permanent', reason: 'restoring a private chat adopts the title source an older build wrote to session.db; a normalized peer\'s title source is published to and imported from session.db, and removed when it leaves their list' },
	{ file: 'agentHostPeerChatStore.ts', key: 'AH_META_IS_READ_DB_KEY', count: 1, removedBy: 'permanent', reason: 'a peer\'s read state in its own database, read and written for older builds as on main, for legacy and normalized catalogs alike (group 6)' },
	// Chat-own data: the peer's own title (group 6) and the default chat's own database, neither a session.db mirror.
	{ file: 'chatContributions/sessionTitle/sessionTitleContribution.ts', key: 'SESSION_CUSTOM_TITLE_KEY', count: 1, removedBy: 'permanent', reason: 'hydration fallback: the chat\'s own title in its own database' },
	{ file: 'chatContributions/sessionTitle/sessionTitleContribution.ts', key: 'customChatTitleMetadataKey', count: 1, removedBy: 'permanent', reason: 'hydration fallback for chats central state never imported (provider-discovered legacy chats): only an older build wrote their title, to session.db' },
	{ file: 'agentService.ts', key: 'SESSION_CUSTOM_TITLE_KEY', count: 1, removedBy: 'permanent', reason: 'fallback read of the default chat\'s own database, not the session database' },
	// Provider-owned databases (design §4.5).
	{ file: 'claude/claudeSessionMetadataStore.ts', key: 'AH_META_WORKSPACELESS_DB_KEY', count: 1, removedBy: 'permanent', reason: 'provider hasKnownSession reads its own default-chat db (design §4.5)' },
	{ file: 'codex/codexSessionMetadataStore.ts', key: 'AH_META_WORKSPACELESS_DB_KEY', count: 1, removedBy: 'permanent', reason: 'provider hasKnownSession reads its own default-chat db (design §4.5)' },
	{ file: 'copilot/copilotAgent.ts', key: 'AH_META_IS_READ_DB_KEY', count: 1, removedBy: 'permanent', reason: 'adoption flow reads the provider-owned db (design §4.5)' },
	{ file: 'copilot/copilotAgent.ts', key: 'SESSION_CUSTOM_TITLE_KEY', count: 1, removedBy: 'permanent', reason: 'adoption flow reads the provider-owned db (design §4.5)' },
	{ file: 'copilot/copilotAgent.ts', key: 'SESSION_CUSTOM_TITLE_SOURCE_KEY', count: 1, removedBy: 'permanent', reason: 'adoption flow reads the provider-owned db (design §4.5)' },
	{ file: 'copilot/copilotAgent.ts', key: 'AH_META_WORKSPACELESS_DB_KEY', count: 2, removedBy: 'permanent', reason: 'fork source and adoption reads of the provider-owned db (design §4.5)' },
	{ file: 'copilot/copilotAgent.ts', key: 'META_DIFF_BASE_BRANCH', count: 1, removedBy: 'permanent', reason: 'fork source read of the provider-owned db (design §4.5)' },
	{ file: 'copilot/copilotAgentSession.ts', key: 'META_DIFF_BASE_BRANCH', count: 1, removedBy: 'permanent', reason: 'own-db diffBaseBranch for restricted telemetry (design §4.5)' },
	// Session metadata readers: `openMetadataWithoutImport` (central state, never importing) for a session; a chat's own database.
	{ file: 'copilot/copilotAgent.ts', key: 'AH_META_IS_ARCHIVED_DB_KEY', count: 1, removedBy: 'permanent', reason: 'resume reads the session\'s archived state through _openMetadata: the store, never importing' },
	{ file: 'copilot/copilotAgent.ts', key: 'AH_META_IS_DONE_DB_KEY', count: 1, removedBy: 'permanent', reason: 'resume reads the session\'s legacy archived state through _openMetadata: the store, never importing' },
	{ file: 'copilot/copilotAgent.ts', key: '_META_CUSTOMIZATION_DIRECTORY', count: 3, removedBy: 'permanent', reason: 'working-directory and stored-metadata reads through _openMetadata: the store for a session, a peer backing\'s own db' },
	{ file: 'copilot/copilotAgent.ts', key: '_META_SHARED_CUSTOMIZATION_DIRECTORIES', count: 1, removedBy: 'permanent', reason: 'working-directory snapshot read through _openMetadata (rollback, and older builds still read the value): the store for a session, a peer backing\'s own db' },
	{ file: 'copilot/copilotAgent.ts', key: '_META_PROJECT_URI', count: 2, removedBy: 'permanent', reason: 'reads through _openMetadata: the store for a session, a peer backing\'s own db' },
	{ file: 'copilot/copilotAgent.ts', key: '_META_PROJECT_DISPLAY_NAME', count: 2, removedBy: 'permanent', reason: 'reads through _openMetadata: the store for a session, a peer backing\'s own db' },
	{ file: 'copilot/copilotAgent.ts', key: '_META_PROJECT_RESOLVED', count: 2, removedBy: 'permanent', reason: 'reads through _openMetadata: the store for a session, a peer backing\'s own db' },
	// Legacy-catalog (v1) membership: the peer store is its writer, with its own revision tracking, as on main (group 5).
	{ file: 'agentHostPeerChatStore.ts', key: 'PEER_CHATS_METADATA_KEY', count: 4, removedBy: 'permanent', reason: 'peerChats read and written by its owner, the peer store: as on main for legacy catalogs; the older-build copy of normalized ones, read back before it is overwritten (group 5)' },
	{ file: 'agentHostSavedChatService.ts', key: 'PEER_CHATS_METADATA_KEY', count: 2, removedBy: 'permanent', reason: 'v1 saved-chat membership read, as on main (group 5)' },
	// A chat's working directories in the chat's own database (group 6).
	{ file: 'agentHostPeerChatStore.ts', key: 'CHAT_WORKING_DIRECTORIES_METADATA_KEY', count: 3, removedBy: 'permanent', reason: 'a peer\'s own db: written only when its working directories change, read for chats central state does not know (group 6)' },
	{ file: 'agentHostSavedChatService.ts', key: 'CHAT_WORKING_DIRECTORIES_METADATA_KEY', count: 1, removedBy: 'permanent', reason: 'v1 saved chat\'s own db (a v1 default chat\'s is the session db), as on main' },
	{ file: 'agentService.ts', key: 'CHAT_WORKING_DIRECTORIES_METADATA_KEY', count: 1, removedBy: 'permanent', reason: 'fallback read of the default chat\'s own database for a session the peer store has not normalized' },
	// Detached worktree records are their own databases, not session.db; a session's worktree metadata goes through the store.
	{ file: 'shared/worktreeIsolation.ts', key: 'AH_META_IS_ARCHIVED_DB_KEY', count: 1, removedBy: 'permanent', reason: 'detached-worktree record dbs keep their own copy' },
	{ file: 'shared/worktreeIsolation.ts', key: 'META_DIFF_BASE_BRANCH', count: 1, removedBy: 'permanent', reason: 'detached-worktree record dbs keep their own copy' },
	{ file: 'shared/worktreeIsolation.ts', key: 'WORKTREE_META_BRANCH', count: 3, removedBy: 'permanent', reason: 'a detached record\'s own db; readers use worktreeMetadataSource (the store for a session)' },
	{ file: 'shared/worktreeIsolation.ts', key: 'WORKTREE_META_PATH', count: 2, removedBy: 'permanent', reason: 'a detached record\'s own db; readers use worktreeMetadataSource (the store for a session)' },
	{ file: 'shared/worktreeIsolation.ts', key: 'WORKTREE_META_REPOSITORY_ROOT', count: 3, removedBy: 'permanent', reason: 'a detached record\'s own db; readers use worktreeMetadataSource (the store for a session)' },
	{ file: 'shared/worktreeIsolation.ts', key: 'WORKTREE_META_SYMLINK_PATTERNS', count: 2, removedBy: 'permanent', reason: 'a detached record\'s own db; readers use worktreeMetadataSource (the store for a session)' },
	{ file: 'shared/worktreeIsolation.ts', key: 'WORKTREE_META_SYMLINK_SOURCE_ROOT', count: 2, removedBy: 'permanent', reason: 'a detached record\'s own db; readers use worktreeMetadataSource (the store for a session)' },
	{ file: 'shared/worktreeIsolation.ts', key: 'WORKTREE_META_CREATION_FAILURE', count: 1, removedBy: 'permanent', reason: 'readers use worktreeMetadataSource (the store for a session, a detached record\'s own db)' },
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

function keyMentioned(args: string, key: string, identifiers: readonly string[]): boolean {
	return identifiers.includes(key)
		? new RegExp(`\\b${key.replace(/\$/g, '\\$')}\\b`).test(args)
		: args.includes(`'${key}`) || args.includes(`\`${key}`) || args.includes(`"${key}`) || new RegExp(`\\b${key.replace(/\./g, '\\.')}\\b`).test(args);
}

/** Counts, per owned key, the database metadata calls in `source` whose arguments mention that key. */
function findOwnedKeyAccesses(source: string, ownedConstants: readonly string[] = []): Map<string, number> {
	const identifiers = [...OWNED_IDENTIFIERS, ...ownedConstants.filter(name => !OWNED_IDENTIFIERS.includes(name))];
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
		for (const key of [...identifiers, ...OWNED_LITERALS]) {
			if (keyMentioned(args, key, identifiers)) {
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

	test('resolves owned keys passed through string constants and statics', () => {
		const source = [
			`private static readonly _META_CUSTOMIZATION_DIRECTORY = 'copilot.customizationDirectory';`,
			`const OWNER_KEY = 'copilot.worktree.owner';`,
			`private static readonly _META_MODEL = 'copilot.model';`,
			`await db.getMetadataObject({ [CopilotAgent._META_CUSTOMIZATION_DIRECTORY]: true, [CopilotAgent._META_MODEL]: true });`,
			`await db.setMetadata(OWNER_KEY, owner);`,
		].join('\n');
		const constants = findOwnedConstants(source);
		assert.deepStrictEqual({
			constants: [...constants].sort(),
			accesses: [...findOwnedKeyAccesses(source, [...constants.keys()])].sort(),
		}, {
			constants: [['OWNER_KEY', 'copilot.worktree.owner'], ['_META_CUSTOMIZATION_DIRECTORY', 'copilot.customizationDirectory']],
			accesses: [['OWNER_KEY', 1], ['_META_CUSTOMIZATION_DIRECTORY', 1]],
		});
	});

	test('chat data keys are not owned by the session state store', () => {
		assert.deepStrictEqual(
			CHAT_DATA_KEYS.filter(({ identifier, key }) => OWNED_IDENTIFIERS.includes(identifier) || OWNED_LITERALS.some(literal => key.startsWith(literal)) || getSessionStateValueKey(key) !== undefined),
			[],
		);
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
		const commonDir = join(nodeDir, '..', 'common');
		const ownedConstants = new Set<string>();
		for (const [dir, file] of [...listSources(nodeDir).map(file => [nodeDir, file]), ...listSources(commonDir).map(file => [commonDir, file])]) {
			for (const name of findOwnedConstants(readFileSync(join(dir, file), 'utf8')).keys()) {
				if (!CHAT_DATA_KEYS.some(entry => entry.identifier === name)) {
					ownedConstants.add(name);
				}
			}
		}
		const allowed = new Map(ALLOWLIST.map(allowance => [`${allowance.file}\u0000${allowance.key}`, allowance.count]));
		const found = new Map<string, number>();
		for (const file of listSources(nodeDir)) {
			if (EXEMPT_FILES.includes(file.split('/').pop()!)) {
				continue;
			}
			for (const [key, count] of findOwnedKeyAccesses(readFileSync(join(nodeDir, file), 'utf8'), [...ownedConstants])) {
				found.set(`${file}\u0000${key}`, count);
			}
		}
		const render = (map: Map<string, number>) => [...map].map(([id, count]) => `${id.replace('\u0000', ' :: ')} x${count}`).sort();
		assert.deepStrictEqual(render(found), render(allowed));
	});

	test('code outside the store decides what the store owns with the full session-scoped predicate, not the value-only one', () => {
		// `getSessionStateValueKey` misses folder keys such as the base branch, so splitting a write with it sends them past central state.
		const nodeDir = join(FileAccess.asFileUri('').fsPath, '..', 'src', 'vs', 'platform', 'agentHost', 'node');
		const found: string[] = [];
		for (const file of listSources(nodeDir)) {
			if (EXEMPT_FILES.includes(file.split('/').pop()!)) {
				continue;
			}
			const count = stripComments(readFileSync(join(nodeDir, file), 'utf8')).match(/\bgetSessionStateValueKey\(/g)?.length ?? 0;
			if (count > 0) {
				found.push(`${file} x${count}`);
			}
		}
		assert.deepStrictEqual(found, [
			// Pre-writes only the value keys of list-visible overrides; every other key reaches the store through the catalog sync.
			'agentService.ts x1',
		]);
	});
});
