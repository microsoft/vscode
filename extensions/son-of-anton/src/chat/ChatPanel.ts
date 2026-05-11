/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as vscode from 'vscode';
import { globalScopedConfig } from './globalScopedConfig';
import { LlmClient, LlmContentPart, LlmMessage, ModelId, ToolDefinition as LlmToolDefinition } from 'son-of-anton-core/llm/LlmClient';
import { ToolRegistry, createInstrumentedWorkspaceToolContext } from '../tools/registry';
import type { ApprovalRequest } from '../tools/registry';
import { clearActiveApproval, getActiveApproval, setActiveApproval } from './approvalRegistry';
import type { HookRunner } from 'son-of-anton-core/persistence/HookRunner';
import { ToolExecutionResult, ToolCategory } from 'son-of-anton-core/tools/types';
import { SPECIALIST_ROLES, getSpecialist, buildSystemPrompt } from 'son-of-anton-core/chat/specialistRegistry';
import { PERSONAS, getRoster } from 'son-of-anton-core/chat/personas';
import { MODEL_METADATA } from 'son-of-anton-core/llm/modelMetadata';
import { AgentBridge } from './AgentBridge';
import { AgentEvent, AgentPlan } from './agentEvents';
import { ChatMode } from 'son-of-anton-core/agents/agentEvents';
import { AgentHandle } from 'son-of-anton-core/agents/types';
import { parseAndDispatch, SlashCommandContext, getCommandList } from './ChatSlashCommands';
import { WorkspaceContextProvider, isSensitivePath } from './WorkspaceContextProvider';
import { CostReporter } from '../monitoring/CostReporter';
import { SpendGuard, readSpendLimits } from '../monitoring/SpendGuard';
import { ConversationStore, ChatTab } from './ConversationStore';
import { loadCliConversation } from './CliConversationReader';
import { CheckpointManager } from 'son-of-anton-core/checkpoint/CheckpointManager';
import { CredentialBroker } from 'son-of-anton-core/auth/CredentialBroker';
import { TaskBoardModel, BoardSnapshot, BoardTask, SubtaskState } from '../board/TaskBoardModel';
import { detectCredentials, CredentialState } from 'son-of-anton-core/credentials/credentialDetection';
import { saveProviderCredentials, ProviderId, deleteProfileEntry } from 'son-of-anton-core/credentials/providerCredentialSaver';
import {
	listMcpServers,
	saveMcpServer,
	deleteMcpServer,
	type McpServerConfig as PersistedMcpServerConfig,
} from '../onboarding/mcpServerSaver';
import { WriteSnapshotStore } from './WriteSnapshotStore';
import * as path from 'path';

/**
 * A single structured content part attached to a chat message. Mirrors the
 * `LlmContentPart` shape but is duplicated here so the persistence layer
 * does not depend on the LLM client's type names.
 */
export type ChatMessageContentPart =
	| { type: 'text'; text: string }
	| { type: 'image'; mimeType: string; base64Data: string; name?: string };

/**
 * Either a plain string (legacy persistence shape, treated as a single text
 * part) or an array of structured parts (new shape introduced for image
 * attachments). Both forms round-trip cleanly through `globalState`.
 */
export type ChatMessageContent = string | ReadonlyArray<ChatMessageContentPart>;

export interface ChatMessage {
	role: 'user' | 'assistant' | 'system';
	content: ChatMessageContent;
	model?: ModelId;
	timestamp: number;
}

/** Attachment payload posted from the webview when the user sends a message. */
interface ImageAttachmentPayload {
	mime: string;
	base64: string;
	name?: string;
}

/**
 * Discriminated mention payload posted from the webview alongside the legacy
 * `mentions: string[]`. Each variant tells the host how to resolve the chip
 * into a markdown block at send time.
 */
type KindedMention =
	| { kind: 'workspace' }
	| { kind: 'file'; path?: string }
	| { kind: 'folder'; path?: string }
	| { kind: 'problems' }
	| { kind: 'terminal' }
	| { kind: 'url'; url?: string };

interface WebviewMessage {
	type: string;
	text?: string;
	model?: ModelId;
	attachments?: string[];
	mentions?: string[];
	/**
	 * Kinded mention payload (Phase 62). Lets the webview tell the host
	 * about pseudo-mentions (`@problems`, `@terminal`, `@url`) that don't
	 * map to a workspace path. The legacy `mentions` array still ships
	 * alongside this so older replay paths and persisted snapshots keep
	 * working unchanged.
	 */
	mentionsKinded?: KindedMention[];
	/**
	 * Image attachments collected from the composer (drag/drop, paste, file
	 * picker). Each entry carries the MIME type and the base64-encoded bytes
	 * — never a path — so the host doesn't need to re-read the source.
	 */
	images?: ImageAttachmentPayload[];
	diffId?: string;
	specialistId?: string;
	command?: string;
	arg?: string;
	code?: string;
	language?: string;
	relPath?: string;
	diff?: string;
	/** Approval correlation id (Phase 41). Echoed back from the webview when the user clicks Approve/Reject on a risky tool call. */
	id?: string;
	/** Approval action selected by the user. */
	action?: 'approve' | 'reject';
	/** Optional human-readable rationale supplied alongside `action`. */
	reason?: string;
	/** Checkpoint id targeted by a `checkpoint*` message from the webview pill. */
	checkpointId?: string;
	/** Provider id for `providerSave`. */
	provider?: string;
	/** Free-form payload from the inline provider form / settings view. */
	fields?: Record<string, string>;
	/**
	 * Multi-deployment management UI (Phase C). Identifies the named profile
	 * being deleted via `deleteProviderProfile`. Saving uses the same field
	 * inside `fields.profileName` so the legacy `providerSave` payload shape
	 * stays untouched.
	 */
	profileName?: string;
	/** Setting id (e.g. `sota.personality.enabled`) targeted by `settingChange` / `openSettingsJson`. */
	settingId?: string;
	/** New value for a `settingChange`. Booleans only for the toggles we ship today. */
	value?: boolean | string;
	/** External URL for the `openLink` message — validated against `https://` before opening. */
	url?: string;
	/**
	 * MCP server payload posted from the chat settings view (Phase 55). The
	 * webview never holds onto a stable copy of the array itself; it always
	 * round-trips through the host so settings.json stays the source of truth.
	 */
	server?: {
		name?: unknown;
		command?: unknown;
		args?: unknown;
		env?: unknown;
		cwd?: unknown;
	};
	/** Add vs. edit discriminator for `mcpServerSave`. Defaults to `'add'` when omitted. */
	mode?: 'add' | 'edit';
	/** Server name targeted by `mcpServerDelete`. */
	name?: string;
	/**
	 * Cline-style chat mode. Sent on `modeChange` (webview → host) and echoed
	 * back via `modeChanged` (host → webview). Distinct from {@link mode} so
	 * the existing MCP add/edit discriminator stays untouched.
	 */
	chatMode?: ChatMode;
	/**
	 * Active chat sidebar tab. Sent on `tabChange` (webview → host) and
	 * echoed back via `tabChanged` (host → webview). Persisted on the
	 * conversation summary so switching conversations restores the tab the
	 * user last had open.
	 */
	tab?: ChatTab;
	/**
	 * Inline tool-result review (`toolResultEdited`). Tool-call id of the
	 * result the user edited via the inline form. The host stashes the
	 * accompanying {@link editedOutput} keyed by this id and consumes it on
	 * the next-turn LLM message + persistence sites.
	 */
	toolCallId?: string;
	/** Replacement output supplied by the user for the `toolResultEdited` message. */
	editedOutput?: string;
	/**
	 * Workspace-relative path posted by the `previewWriteFileDiff` message
	 * (Phase 63). Identifies the target file the proposed write would touch.
	 */
	path?: string;
	/**
	 * Full proposed file content posted alongside `path` for the
	 * `previewWriteFileDiff` message. The host opens a `vscode.diff` editor
	 * comparing the on-disk file against this content.
	 */
	proposedContent?: string;
	/**
	 * Subtask id targeted by a `rerunFromSubtask` message (Phase 62). Sent
	 * when the user right-clicks a row in the focus-chain checklist; may be
	 * empty if the row was clicked before the matching `subtaskStart` event
	 * stamped an id onto it.
	 */
	subtaskId?: string;
	/**
	 * Specialist handle (e.g. `anton-code`) for the `rerunFromSubtask` row,
	 * or for the `setSpecialistModel` payload that targets a specific
	 * `sota.agents.<handle>.model` setting key.
	 */
	handle?: string;
	/**
	 * Configuration scope for `setSpecialistModel`. Mapped to
	 * `vscode.ConfigurationTarget`: `'user' | 'workspace' | 'folder'`.
	 * Defaults to `'user'` when omitted so settings flow into the global
	 * profile by default (the safest option for personal preference).
	 */
	scope?: 'user' | 'workspace' | 'folder';
	/** Subtask description copied from the focus-chain row for `rerunFromSubtask`. */
	description?: string;
	/**
	 * File path posted by the `openWriteDiff` message (Phase 63). The
	 * webview ships the workspace-relative path the write tool targeted so
	 * the host can resolve it back into the on-disk URI for the diff
	 * editor's right-hand pane.
	 */
	filePath?: string;
	/**
	 * Snapshot id associated with a captured pre-image for `openWriteDiff`.
	 * When present, the host opens the diff against the synthetic
	 * `son-of-anton-snapshot:` URI; otherwise it falls back to `git:HEAD`.
	 */
	snapshotId?: string;
	/**
	 * Generative-UI block id (Phase 82 — `emit_ui_block`). Posted back from
	 * the webview on `uiBlockResponse` (form/confirm submission) and
	 * `uiBlockAction` (card action button). Identifies which rendered
	 * block the message refers to so the host can disambiguate when more
	 * than one block is on screen.
	 */
	blockId?: string;
	/**
	 * Free-form action name supplied by `uiBlockAction` (e.g. the action
	 * button's `name` field on a `card`). Forwarded to the agent as part
	 * of the synthetic user turn so the LLM can react.
	 */
	actionName?: string;
	/**
	 * Action payload supplied by `uiBlockAction` (e.g. an `href`, an opaque
	 * token, or a small parameter object). Stringified before forwarding.
	 */
	actionPayload?: unknown;
	/**
	 * Response value for `uiBlockResponse`. Form submissions send a
	 * `Record<string, string | boolean>`; confirm prompts send a boolean.
	 * Stringified before forwarding to the agent.
	 */
	responseValue?: unknown;
}

/**
 * Outcome of a pending tool-call approval. Resolved via `waitForApproval` once
 * the webview reports the user's decision (or the request is cancelled / times
 * out). `'cancel'` is reserved for chat-level aborts so the loop can bail out
 * without surfacing a misleading rejection in the persisted card.
 */
interface ApprovalDecision {
	action: 'approve' | 'reject' | 'cancel';
	reason?: string;
}

/**
 * Lightweight workspace index entry posted to the webview for the `@`-mention
 * popup. Folders are surfaced separately via the `kind` discriminator so the
 * popup can render the appropriate icon and so the host can include a folder
 * tree when the user sends a `[workspace]` mention.
 */
interface WorkspaceIndexEntry {
	kind: 'file' | 'folder' | 'workspace';
	name: string;
	relPath: string;
}

const WORKSPACE_INDEX_FILE_LIMIT = 100;

const ACTIVE_SESSIONS = new Set<ChatSession>();

const VALID_CHAT_TABS: ReadonlyArray<ChatTab> = ['chat', 'tasks', 'history', 'settings', 'roster'];

/**
 * Type guard for the tab id arriving from the webview. Defensive — a
 * malformed payload defaults to `'chat'` at the call site so the user
 * never lands on an invisible pane.
 */
function isValidChatTab(value: unknown): value is ChatTab {
	return typeof value === 'string' && (VALID_CHAT_TABS as ReadonlyArray<string>).includes(value);
}

/**
 * Serialise an arbitrary webview-provided value to a compact JSON string for
 * inclusion in a synthetic user turn (`uiBlockResponse` / `uiBlockAction`).
 * Falls back to `String(value)` if the value contains a cycle or other
 * unserialisable content — the goal is "give the LLM a readable record",
 * never to throw.
 */
function safeStringify(value: unknown): string {
	if (value === undefined) {
		return 'null';
	}
	try {
		return JSON.stringify(value);
	} catch (err) {
		return JSON.stringify(String(value));
	}
}

/**
 * Risky-tool approval timeout. Five minutes balances "user stepped away"
 * tolerance against runaway entries piling up in the pending-approvals map.
 * The card auto-rejects with `reason: 'timeout'` so the model still gets a
 * structured tool result.
 */
const APPROVAL_TIMEOUT_MS = 5 * 60 * 1000;

/** Number of leading lines of `write_file` content to surface in the approval card preview. */
const APPROVAL_PREVIEW_LINES = 30;

/**
 * Core chat session bound to a `vscode.Webview`. Hosted either by a
 * `WebviewPanel` (`ChatPanel.createOrShow`) or a `WebviewView`
 * (`ChatViewProvider`). The two host types share this implementation so the
 * chat experience stays consistent regardless of placement.
 */
export class ChatSession {
	private conversation: ChatMessage[] = [];
	private currentConversationId: string;
	private abortController: AbortController | undefined;
	private readonly disposables: vscode.Disposable[] = [];
	private disposed = false;
	private currentSpecialistId: string = 'anton';
	// Tracked at the session level so `/model` can mutate it from the slash
	// command pipeline. The webview is the authoritative source for normal
	// per-message picks via the model chip; we sync this field whenever a
	// message arrives so the two stay aligned.
	private currentModel: ModelId = 'sonnet';
	/**
	 * Cline-style chat mode for the active conversation. `'plan'` pins the
	 * orchestrator into "design only, no tool calls" — `'act'` is the default
	 * and lets it dispatch subtasks. Persisted on the conversation summary so
	 * switching between conversations restores the mode the user last set.
	 */
	private currentMode: ChatMode = 'act';
	/**
	 * Active chat sidebar tab for the current conversation. The chat surface
	 * uses a tab bar across the top (Chat / Tasks / History / Settings /
	 * Roster) and we persist the user's choice per-conversation so switching
	 * between conversations restores the tab they last had open.
	 */
	private currentTab: ChatTab = 'chat';
	private workspaceIndexRefreshTimer: ReturnType<typeof setTimeout> | undefined;
	private workspaceIndex: WorkspaceIndexEntry[] = [];
	private costUpdateDebounceTimer: ReturnType<typeof setTimeout> | undefined;
	/**
	 * In-flight approval prompts for risky tool calls (Phase 41). Keyed by the
	 * approval id minted in the tool-execution loop; resolved when the webview
	 * posts `approvalResponse`, or rejected on cancellation / timeout.
	 */
	private readonly pendingApprovals = new Map<string, {
		resolve: (decision: ApprovalDecision) => void;
		timer: ReturnType<typeof setTimeout>;
	}>();

	/**
	 * User-edited tool results (Phase: inline tool-result review). Keyed by
	 * tool-call id; populated when the webview posts `toolResultEdited` after
	 * the user replaces a tool's output via the inline edit form. Consumed at
	 * the next-turn LLM message construction site and the persistence site so
	 * the edited content (not the raw result) is what the model reads on the
	 * subsequent turn and what is stored in the conversation transcript.
	 */
	private readonly editedToolResults = new Map<string, string>();

	/**
	 * Generative-UI block ids that have already been rendered for the
	 * current session. The first emit creates the block; subsequent emits
	 * with the same id are logged-and-ignored (per spec §"No re-render on
	 * subsequent emits with the same blockId"). Cleared on
	 * `clearConversation` and on reload paths so reloaded sessions can
	 * re-render the persisted blocks fresh.
	 */
	private readonly emittedUiBlockIds = new Set<string>();

	/**
	 * In-flight ui-block responses (form/confirm). Tracked so an
	 * `ui-block-response` message from the webview can re-invoke the agent
	 * with the user's answer as a synthetic user turn — mirroring the
	 * approval flow but for free-form generative UI. Currently a marker
	 * set; future use may carry per-block context (e.g. originating
	 * subtask) so the synthetic turn re-targets the same specialist.
	 */
	private readonly pendingUiBlockResponses = new Set<string>();

	/**
	 * Per-message metric deltas (Phase 68). `LlmClient.getTokenUsage()` and
	 * `LlmClient.estimateCost()` are both cumulative across the session; we
	 * snapshot them before each request and subtract on completion to derive
	 * the per-message contribution (tokens + dollars). Latency is measured
	 * between the assistant wrapper-allocation point and the stream-complete
	 * signal. Metrics are session-scoped only — reloaded messages have no
	 * stamped attributes so the webview shows "—" placeholders. See the
	 * `messageMetrics` postMessage in handleSendMessage / runViaAgentBridge.
	 */
	private lastInputTokens = 0;
	private lastOutputTokens = 0;
	private lastCachedTokens = 0;
	private lastEstimatedCost = 0;
	private streamStartedAt = 0;

	/**
	 * H11 — session-wide cumulative meter (chat panel only). Mirrors the live
	 * cost/token counter the CLI TUI's StatusBar surfaces. These ticks up on
	 * every `messageComplete` (one per assistant turn) and resets on
	 * conversation switch / new conversation. Independent of `CostReporter`
	 * so the meter still works in surfaces that don't wire one in. The values
	 * are pushed to the webview as a `sessionUsage` postMessage with the
	 * shape `{ totalCost, totalTokens, turnCount }`.
	 */
	private sessionTotalCost = 0;
	private sessionTotalTokens = 0;
	private sessionTurnCount = 0;

	/**
	 * H17 — lifecycle-hook turn counter. Distinct from {@link sessionTurnCount}
	 * which mirrors the H11 status-bar meter: `turnsRun` increments once per
	 * completed {@link handleSendMessage} (regardless of which dispatch path
	 * the turn took) and feeds the `session-end` hook payload so a hook
	 * author can see how chatty a session was. Keeping it separate from the
	 * meter avoids coupling hook payloads to the cost-display semantics.
	 */
	private turnsRun = 0;

	/**
	 * Phase 86 — spend cap helper. Lazily wired up from the optional
	 * {@link costReporter}: when no reporter is supplied (e.g. legacy CLI
	 * surfaces or tests), we leave the guard undefined and every cap check
	 * short-circuits as "no block".
	 */
	private spendGuard?: SpendGuard;

	constructor(
		private readonly webview: vscode.Webview,
		private readonly extensionUri: vscode.Uri,
		private readonly conversationStore: ConversationStore,
		private readonly llmClient: LlmClient,
		private readonly toolRegistry: ToolRegistry,
		private readonly agentBridge?: AgentBridge,
		private readonly workspaceContext?: WorkspaceContextProvider,
		private readonly costReporter?: CostReporter,
		initialConversationId?: string,
		private readonly checkpointManager?: CheckpointManager,
		private readonly secrets?: vscode.SecretStorage,
		private readonly credentialBroker?: CredentialBroker,
		private readonly taskBoardModel?: TaskBoardModel,
		private readonly writeSnapshotStore?: WriteSnapshotStore,
		private readonly hookRunner?: HookRunner,
	) {
		// Resolve the initial conversation: prefer the requested id, fall back
		// to the most recent existing conversation, or create a fresh one when
		// the store is empty (first run).
		const resolved = this.resolveInitialConversation(initialConversationId);
		this.currentConversationId = resolved.summary.id;
		this.conversation = [...resolved.messages];
		this.currentSpecialistId = resolved.summary.lastSpecialist ?? 'anton';
		this.currentMode = resolved.summary.lastMode ?? 'act';
		this.currentTab = resolved.summary.lastTab ?? 'chat';
		this.webview.html = this.getHtmlContent();
		this.setupMessageHandler();

		// React to setting changes that affect available auth so the empty
		// state CTA disappears the moment a user pastes an API key in
		// Settings (instead of waiting for the 30s heartbeat).
		this.disposables.push(
			vscode.workspace.onDidChangeConfiguration((e) => {
				if (
					e.affectsConfiguration('sota.apiKey') ||
					e.affectsConfiguration('sota.openaiApiKey') ||
					e.affectsConfiguration('sotaAuth.anthropic-oauth.clientId') ||
					e.affectsConfiguration('sotaAuth.chatgpt-oauth.clientId')
				) {
					void this.refreshConnectionState();
				}
				// Phase 86 — keep the spend-meter live when caps are nudged
				// from settings.json directly (i.e. without going through the
				// chat panel's textarea handlers).
				if (
					e.affectsConfiguration('sota.spendLimit.enabled') ||
					e.affectsConfiguration('sota.spendLimit.session') ||
					e.affectsConfiguration('sota.spendLimit.task')
				) {
					this.postSpendLimitState();
				}
			}),
		);

		if (this.conversation.length > 0) {
			this.webview.postMessage({
				type: 'loadConversation',
				messages: this.conversation,
				lastSpecialist: this.currentSpecialistId,
				lastMode: this.currentMode,
			});
		} else {
			// Even on an empty conversation we want the chip to reflect the
			// persisted mode (default 'act'); the webview also reads the mode
			// out of `loadConversation` but that message only fires when
			// scrollback exists — push a dedicated `modeChanged` so the chip
			// always picks up the right initial state.
			this.webview.postMessage({ type: 'modeChanged', chatMode: this.currentMode });
		}

		// Echo the persisted active tab so the tab bar selects the correct
		// pane on first paint. Sent unconditionally — the webview defaults
		// to `'chat'` so this is also how the Roster/Tasks/Settings tab
		// gets restored after a window reload.
		this.webview.postMessage({ type: 'tabChanged', tab: this.currentTab });
		this.postBoardSnapshot();
		this.postHistorySnapshot();
		// H11 — paint the session meter at zero on first load. The
		// accumulator is per-conversation lifetime (not persisted across
		// reloads), so the canonical initial state is always zero.
		this.postSessionUsage();

		// Replay any previously-captured checkpoints so the user can roll
		// back to them across window reloads. Posted AFTER `loadConversation`
		// so the user message bubbles already exist by the time the pills
		// try to attach.
		this.postCheckpointsForCurrentConversation();

		ACTIVE_SESSIONS.add(this);

		// Register this session's approval handler so the agent-stack tool
		// context delegates write / shell prompts to the webview-card UX
		// instead of falling back to modal dialogs. Cleared on dispose.
		// Multiple chat sessions could exist simultaneously (sidebar +
		// editor); the most-recently-opened wins, matching VS Code's own
		// "active" semantics.
		setActiveApproval(this.boundRequestApproval);

		// Kick off an initial connection-state refresh and a 30s poll.
		void this.refreshConnectionState();
		const intervalHandle = setInterval(() => {
			void this.refreshConnectionState();
		}, 30000);
		this.disposables.push(new vscode.Disposable(() => clearInterval(intervalHandle)));

		// Workspace index for the `@`-mention popup. Initial population happens
		// on first paint; thereafter we debounce-refresh on create/delete so a
		// large `npm install` doesn't trigger a flood of postMessages.
		void this.refreshWorkspaceIndex();
		this.disposables.push(
			vscode.workspace.onDidCreateFiles(() => this.scheduleWorkspaceIndexRefresh()),
		);
		this.disposables.push(
			vscode.workspace.onDidDeleteFiles(() => this.scheduleWorkspaceIndexRefresh()),
		);
		this.disposables.push(
			vscode.workspace.onDidRenameFiles(() => this.scheduleWorkspaceIndexRefresh()),
		);
		this.disposables.push(new vscode.Disposable(() => {
			if (this.workspaceIndexRefreshTimer) {
				clearTimeout(this.workspaceIndexRefreshTimer);
				this.workspaceIndexRefreshTimer = undefined;
			}
		}));

		// Subscribe to the shared CostReporter so the header meter refreshes
		// whenever a record/reset lands. The webview hides its meter until the
		// first `costUpdate` arrives, so an idle session paints no $0.00.
		if (this.costReporter) {
			this.spendGuard = new SpendGuard(this.costReporter);
			this.disposables.push(
				this.costReporter.onDidChange(() => this.postCostUpdate()),
			);
			// Phase 86 — also push a `spendLimitState` whenever the running
			// total updates so the Settings → Features meter stays live without
			// polling. Cheap enough that we piggy-back on the same event.
			this.disposables.push(
				this.costReporter.onDidChange(() => this.postSpendLimitState()),
			);
		}

		// Phase 86 — best-effort migration of the legacy single-toggle
		// auto-approval setting onto the new per-category flag. We only
		// touch `sota.autoApprove.read` when:
		//   1. the legacy key is `true` AND
		//   2. the new key is still at its default (no explicit user choice)
		// so a user who already opted into the new panel keeps their pick.
		void this.migrateLegacyAutoApprove();

		// Subscribe to the task board so the Tasks tab repaints whenever the
		// orchestrator publishes a new plan or a subtask transitions state.
		// Filtered by conversation id so a board change for a different
		// conversation doesn't push a noisy update to this session.
		if (this.taskBoardModel) {
			this.disposables.push(
				this.taskBoardModel.onDidChangeBoard(({ conversationId }) => {
					if (conversationId === this.currentConversationId) {
						this.postBoardSnapshot();
					}
				}),
			);
		}

		// Subscribe to the conversation list so the History tab refreshes on
		// create / rename / delete from any surface.
		this.disposables.push(
			this.conversationStore.onDidChange(() => this.postHistorySnapshot()),
		);
		this.disposables.push(new vscode.Disposable(() => {
			if (this.costUpdateDebounceTimer) {
				clearTimeout(this.costUpdateDebounceTimer);
				this.costUpdateDebounceTimer = undefined;
			}
		}));

		// H17 — `session-start` lifecycle hook. Fire-and-forget at the tail of
		// construction so the panel doesn't pay any latency cost on first paint;
		// hook failures are swallowed so a flaky script can never block the
		// chat panel from coming up. The CLI fires the same event on its TUI
		// mount — keep payload field names aligned so a single hook script can
		// serve both surfaces.
		if (this.hookRunner) {
			void this.hookRunner
				.fire('session-start', {
					conversationId: this.currentConversationId,
					specialistId: this.currentSpecialistId,
					model: this.currentModel,
					mode: this.currentMode,
					timestamp: Date.now(),
				})
				.catch(() => { /* swallow — hooks must never break a session */ });
		}
	}

	/**
	 * Debounced `costUpdate` emit. The reporter fires onDidChange after every
	 * recorded entry; rapid bursts (tool-call loops, agent fan-out) would
	 * otherwise spam the webview. 100ms keeps the meter feeling live without
	 * thrashing the postMessage channel.
	 */
	private postCostUpdate(): void {
		if (this.disposed || !this.costReporter) {
			return;
		}
		if (this.costUpdateDebounceTimer) {
			return;
		}
		this.costUpdateDebounceTimer = setTimeout(() => {
			this.costUpdateDebounceTimer = undefined;
			if (this.disposed || !this.costReporter) {
				return;
			}
			const tokens = this.costReporter.getTotalTokens();
			const dollars = this.costReporter.getTotalCost();
			const tokensByModel = this.costReporter.getTokensByModel();
			const costByModel = this.costReporter.getCostByModel();
			// Only emit rows for models with non-zero usage so the popover stays
			// readable when most of the 14 supported models are unused.
			const breakdown = (Object.keys(costByModel) as ModelId[])
				.map(model => ({
					model,
					tokens: tokensByModel[model].input + tokensByModel[model].output,
					dollars: costByModel[model],
				}))
				.filter(row => row.tokens > 0 || row.dollars > 0)
				.sort((a, b) => b.dollars - a.dollars);
			this.webview.postMessage({
				type: 'costUpdate',
				tokens: tokens.input + tokens.output,
				inputTokens: tokens.input,
				outputTokens: tokens.output,
				dollars,
				breakdown,
			});
		}, 100);
	}

	/**
	 * H11 — fold a single completed assistant turn's deltas into the running
	 * session totals and broadcast a `sessionUsage` postMessage to the webview.
	 * Tokens and cost arriving here are already deltas (the cumulative figures
	 * are kept inside `LlmClient`; the per-message hooks subtract the snapshot
	 * taken at request start). Negative deltas — which can occur if the
	 * underlying counters reset between turns — are clamped to zero so the
	 * meter only ever ticks forward.
	 */
	private recordSessionTurn(deltaTokens: number, deltaCost: number): void {
		const safeTokens = Math.max(0, Math.floor(deltaTokens));
		const safeCost = Math.max(0, deltaCost);
		this.sessionTotalTokens += safeTokens;
		this.sessionTotalCost += safeCost;
		this.sessionTurnCount += 1;
		this.postSessionUsage();
	}

	/**
	 * H11 — push the current session totals to the webview. Posted on every
	 * completed turn and on conversation reset so the meter mirrors the
	 * accumulator without polling. Always emits the canonical zero payload
	 * after a reset so the webview can paint `0 tok · $0.00` on a blank slate
	 * rather than holding the previous conversation's totals.
	 */
	private postSessionUsage(): void {
		if (this.disposed) {
			return;
		}
		this.webview.postMessage({
			type: 'sessionUsage',
			totalCost: this.sessionTotalCost,
			totalTokens: this.sessionTotalTokens,
			turnCount: this.sessionTurnCount,
		});
	}

	/**
	 * H11 — clear the session meter. Used by `clearConversation` and
	 * `switchConversation` so flipping conversations starts the meter fresh.
	 * Always emits a `sessionUsage` postMessage with zeroes so the webview
	 * doesn't keep painting the previous conversation's totals during the
	 * brief window before the next turn lands.
	 */
	private resetSessionUsage(): void {
		this.sessionTotalCost = 0;
		this.sessionTotalTokens = 0;
		this.sessionTurnCount = 0;
		this.postSessionUsage();
	}

	/**
	 * Post the "Anton is watching" Easter-egg overlay to this session's
	 * webview. Returns `true` if the message was forwarded — the webview
	 * decides whether to render the overlay (only when the chat tab is
	 * actually mounted). Used by the {@link AntonIsWatching} personality
	 * surface via the static {@link ChatPanel.broadcastAntonIsWatching}
	 * helper; not exposed as a postMessage from the user side.
	 */
	postAntonIsWatching(text: string): boolean {
		if (this.disposed) {
			return false;
		}
		this.webview.postMessage({ type: 'showAntonIsWatching', text });
		return true;
	}

	dispose(): void {
		// H17 — `session-end` lifecycle hook. Fire-and-forget BEFORE flipping
		// `disposed = true` and tearing the rest down: `dispose` is sync so we
		// can't await the hook, and the React-cleanup analogue in the CLI's
		// `ChatApp.tsx` follows the same shape. Failures are swallowed for
		// the same reason as session-start.
		if (this.hookRunner) {
			void this.hookRunner
				.fire('session-end', {
					conversationId: this.currentConversationId,
					turnsRun: this.turnsRun,
					finalCost: this.sessionTotalCost,
					timestamp: Date.now(),
				})
				.catch(() => { /* swallow — hooks must never break a session */ });
		}
		this.disposed = true;
		ACTIVE_SESSIONS.delete(this);
		this.abortController?.abort();
		// Clear the approval registry IF this session was the active one,
		// so the agent-stack tool context falls back to its modal default
		// when no chat panel is open.
		if (getActiveApproval() === this.boundRequestApproval) {
			clearActiveApproval();
		}
		// Settle any in-flight approval prompts as cancellations so awaiters
		// resolve cleanly instead of leaking promises across panel disposal.
		this.cancelPendingApprovals('cancel');
		for (const d of this.disposables) {
			d.dispose();
		}
		this.disposables.length = 0;
	}

	/**
	 * Public approval entry point. Translates an `ApprovalRequest` from the
	 * agent-stack tool context into a webview-card prompt, awaits the
	 * user's decision, and returns the resolved `ApprovalDecision`. The
	 * card flips into its post-response state via `approvalResolved` so
	 * users see a clear approved / rejected / cancelled outcome.
	 *
	 * Routes through the same `pendingApprovals` map that the chat panel's
	 * own runDirectTurn flow uses, so a single chat session never has two
	 * parallel approval surfaces fighting for the same id.
	 */
	async requestApproval(request: ApprovalRequest): Promise<ApprovalDecision> {
		if (this.disposed) {
			return { action: 'reject', reason: 'chat panel disposed' };
		}
		const approvalId = `approval-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
		// Build a payload the webview's existing approval-card renderer
		// can consume verbatim. The request shape is already aligned with
		// what `buildApprovalPayload` produces for direct-tool-loop runs;
		// we just adapt the kind → toolName mapping the webview expects.
		const toolName = request.kind === 'write' ? 'write_file' : 'run_command';
		const payload = this.buildApprovalPayload(toolName, this.requestToInput(request));
		this.webview.postMessage({
			type: 'approvalRequest',
			id: approvalId,
			toolName,
			toolCallId: approvalId,
			input: this.requestToInput(request),
			payload,
			autoApproved: false,
		});
		const decision = await this.waitForApproval(approvalId, this.abortController?.signal);
		this.webview.postMessage({
			type: 'approvalResolved',
			id: approvalId,
			toolCallId: approvalId,
			action: decision.action,
			reason: decision.reason,
		});
		return decision;
	}

	private requestToInput(request: ApprovalRequest): Record<string, unknown> {
		if (request.kind === 'write') {
			return { path: request.path, content: request.content };
		}
		return { command: request.command, args: request.args, cwd: request.cwd, timeoutMs: request.timeoutMs };
	}

	/**
	 * Bound reference to {@link requestApproval} so we can identity-compare
	 * during dispose to avoid clearing a different session's registration.
	 * Set in the constructor; never reassigned.
	 */
	private readonly boundRequestApproval = (req: ApprovalRequest): Promise<ApprovalDecision> => this.requestApproval(req);

	/**
	 * Resolve every pending approval with the given outcome and clear their
	 * timeout timers. Used by `dispose()` and by the `cancelRequest` handler so
	 * a chat-level cancel doesn't leave the tool loop blocked forever.
	 */
	private cancelPendingApprovals(action: ApprovalDecision['action'], reason?: string): void {
		if (this.pendingApprovals.size === 0) {
			return;
		}
		// Snapshot first so the resolve callbacks (which delete from the map)
		// don't mutate it under iteration.
		const entries = Array.from(this.pendingApprovals.values());
		this.pendingApprovals.clear();
		for (const entry of entries) {
			clearTimeout(entry.timer);
			entry.resolve({ action, reason });
		}
	}

	/**
	 * Wait for the webview to respond to an `approvalRequest` with matching id.
	 * The returned promise resolves with the user's decision, with `'cancel'`
	 * when the supplied AbortSignal fires, or with `{ action: 'reject', reason:
	 * 'timeout' }` after `APPROVAL_TIMEOUT_MS` so we never block the tool loop
	 * indefinitely on an absent user.
	 */
	private waitForApproval(approvalId: string, signal?: AbortSignal): Promise<ApprovalDecision> {
		// Already aborted — short-circuit so we don't enrol a doomed entry.
		if (signal?.aborted) {
			return Promise.resolve({ action: 'cancel' });
		}
		return new Promise<ApprovalDecision>((resolve) => {
			const timer = setTimeout(() => {
				if (this.pendingApprovals.delete(approvalId)) {
					resolve({ action: 'reject', reason: 'timeout' });
				}
			}, APPROVAL_TIMEOUT_MS);
			this.pendingApprovals.set(approvalId, { resolve, timer });
			if (signal) {
				const onAbort = () => {
					const entry = this.pendingApprovals.get(approvalId);
					if (!entry) {
						return;
					}
					this.pendingApprovals.delete(approvalId);
					clearTimeout(entry.timer);
					entry.resolve({ action: 'cancel' });
				};
				if (signal.aborted) {
					onAbort();
				} else {
					signal.addEventListener('abort', onAbort, { once: true });
				}
			}
		});
	}

	/**
	 * Build the structured payload the approval card needs to render the
	 * proposed action. We surface only what's safe and useful: the tool name,
	 * a tool-specific summary (write target / command + cwd), and a bounded
	 * preview of the proposed content so the card stays compact even for
	 * large writes. The webview re-validates before display.
	 */
	private buildApprovalPayload(toolName: string, input: Record<string, unknown>): {
		path?: string;
		previewLines?: string[];
		totalLines?: number;
		command?: string;
		args?: ReadonlyArray<string>;
		cwd?: string;
	} {
		if (toolName === 'write_file') {
			const rawPath = input['path'];
			const rawContent = input['content'];
			const path = typeof rawPath === 'string' ? rawPath : '';
			const content = typeof rawContent === 'string' ? rawContent : '';
			const lines = content.length > 0 ? content.split('\n') : [];
			const previewLines = lines.slice(0, APPROVAL_PREVIEW_LINES);
			return { path, previewLines, totalLines: lines.length };
		}
		if (toolName === 'run_command') {
			const command = typeof input['command'] === 'string' ? (input['command'] as string) : '';
			const rawArgs = input['args'];
			const args = Array.isArray(rawArgs)
				? (rawArgs as ReadonlyArray<unknown>).filter((a): a is string => typeof a === 'string')
				: [];
			const cwd = typeof input['cwd'] === 'string' && input['cwd'] ? (input['cwd'] as string) : undefined;
			return { command, args, cwd };
		}
		return {};
	}

	/**
	 * Phase 86 — per-category auto-approval gate. Replaces the old single
	 * `sota.chat.autoApproveSafeOperations` toggle with four independent
	 * flags keyed off the tool's {@link ToolCategory}:
	 *
	 * - `read`  → `sota.autoApprove.read`  (default `true`)
	 * - `write` → `sota.autoApprove.write` (default `false`)
	 * - `shell` → `sota.autoApprove.shell` (default `false`, plus denylist)
	 * - `mcp`   → `sota.autoApprove.mcp`   (default `false`)
	 *
	 * Tools without a declared category fall back to `'read'` (the safest
	 * default — they were never gated under the legacy regime either).
	 *
	 * For shell tools, an additional denylist check is applied: any
	 * `run_command` whose reconstructed command line matches a regex in
	 * `sota.commandDenylist` always requires explicit approval, regardless
	 * of the auto-approve toggle.
	 *
	 * The legacy `sota.chat.autoApproveSafeOperations` setting is honoured
	 * as a fallback for `read` callers that haven't yet migrated, mirrored
	 * onto the new key once at session start (see
	 * {@link migrateLegacyAutoApprove}).
	 */
	private isAutoApproveEnabled(category: ToolCategory | undefined, toolName?: string, input?: Record<string, unknown>): boolean {
		const cfg = vscode.workspace.getConfiguration('sota');
		const cat: ToolCategory = category ?? 'read';
		let allowed: boolean;
		switch (cat) {
			case 'read':
				allowed = cfg.get<boolean>('autoApprove.read', true);
				break;
			case 'write':
				allowed = cfg.get<boolean>('autoApprove.write', false);
				break;
			case 'shell':
				allowed = cfg.get<boolean>('autoApprove.shell', false);
				if (allowed && toolName === 'run_command' && this.commandMatchesDenylist(input)) {
					return false;
				}
				break;
			case 'mcp':
				allowed = cfg.get<boolean>('autoApprove.mcp', false);
				break;
			default:
				allowed = false;
		}
		return allowed;
	}

	/**
	 * Match a `run_command` invocation against `sota.commandDenylist`. Each
	 * configured pattern is treated as a JavaScript regex; invalid regex
	 * entries are skipped (with a warn) so a typo can never silently
	 * weaken the denylist semantics. Compares against the full reconstructed
	 * command line — `command + " " + args.join(' ')` — so multi-arg shell
	 * patterns like `dd if=` match either `dd if=/dev/zero` or `dd` followed
	 * by `if=/dev/zero` arg.
	 */
	private commandMatchesDenylist(input?: Record<string, unknown>): boolean {
		if (!input || typeof input !== 'object') {
			return false;
		}
		const cfg = vscode.workspace.getConfiguration('sota');
		const denylist = cfg.get<ReadonlyArray<string>>('commandDenylist', []) ?? [];
		if (denylist.length === 0) {
			return false;
		}
		const cmd = typeof input['command'] === 'string' ? (input['command'] as string) : '';
		const rawArgs = input['args'];
		const args = Array.isArray(rawArgs)
			? (rawArgs as ReadonlyArray<unknown>).filter((a): a is string => typeof a === 'string')
			: [];
		const reconstructed = [cmd, ...args].join(' ').trim();
		if (!reconstructed) {
			return false;
		}
		for (const pattern of denylist) {
			if (typeof pattern !== 'string' || pattern.length === 0) {
				continue;
			}
			try {
				const re = new RegExp(pattern);
				if (re.test(reconstructed)) {
					return true;
				}
			} catch (err) {
				console.warn(`[chat] commandDenylist pattern rejected: ${pattern} (${err instanceof Error ? err.message : String(err)})`);
			}
		}
		return false;
	}

	/**
	 * One-shot migration helper: when the legacy `sota.chat.autoApproveSafeOperations`
	 * setting is `true` and the new `sota.autoApprove.read` key is still at
	 * its default, mirror the legacy choice onto the new key. Idempotent —
	 * re-running has no effect once the new key is explicit.
	 */
	private async migrateLegacyAutoApprove(): Promise<void> {
		try {
			const cfg = vscode.workspace.getConfiguration('sota');
			const legacy = cfg.get<boolean>('chat.autoApproveSafeOperations', false);
			if (!legacy) {
				return;
			}
			const inspect = cfg.inspect<boolean>('autoApprove.read');
			const explicit = inspect && (
				inspect.globalValue !== undefined
				|| inspect.workspaceValue !== undefined
				|| inspect.workspaceFolderValue !== undefined
			);
			if (explicit) {
				return;
			}
			await cfg.update('autoApprove.read', true, vscode.ConfigurationTarget.Global);
		} catch (err) {
			console.warn(`[chat] migrateLegacyAutoApprove failed: ${err instanceof Error ? err.message : String(err)}`);
		}
	}

	/**
	 * Query the auth broker (via a registered command) and forward the result
	 * to the webview so the header indicator can render. Defensive: if the
	 * command isn't registered or throws, we silently leave the indicator
	 * hidden rather than surfacing errors to the user.
	 */
	private async refreshConnectionState(): Promise<void> {
		if (this.disposed) {
			return;
		}
		// Detect API-key fallbacks alongside the OAuth broker query so the
		// webview can decide whether to show the auth gate. We tolerate failures
		// from each source independently — a missing config or a thrown command
		// must not prevent the rest of the status from being reported.
		const apiKeySetting = vscode.workspace.getConfiguration('sota').get<string>('apiKey');
		const openaiApiKeySetting = vscode.workspace.getConfiguration('sota').get<string>('openaiApiKey');
		const anthropicEnv = process.env.ANTHROPIC_API_KEY;
		const openaiEnv = process.env.OPENAI_API_KEY;
		const apiKeys = {
			anthropic: Boolean((apiKeySetting && apiKeySetting.trim()) || (anthropicEnv && anthropicEnv.trim())),
			openai: Boolean((openaiApiKeySetting && openaiApiKeySetting.trim()) || (openaiEnv && openaiEnv.trim())),
		};

		let providers: Array<{ id: string; displayName: string; connected: boolean }> = [];
		try {
			const result = await vscode.commands.executeCommand<{ providers?: Array<{ id: string; displayName: string; connected: boolean }> }>('sotaAuth.status');
			if (this.disposed) {
				return;
			}
			providers = result && Array.isArray(result.providers) ? result.providers : [];
		} catch {
			// Command not registered or threw — fall through with empty providers.
		}

		if (this.disposed) {
			return;
		}

		// Surface the full per-provider credential snapshot so the empty-state
		// 5-card layout can render accurate status pills (Connected /
		// Not configured / Error). Detection is best-effort — if either the
		// secret store or the broker throws, we fall back to a fully-empty
		// state rather than blocking the chat surface.
		let providerState: CredentialState | undefined;
		if (this.secrets && this.credentialBroker) {
			try {
				providerState = await detectCredentials(
					this.secrets,
					vscode.workspace.getConfiguration('sota'),
					this.credentialBroker,
				);
			} catch {
				providerState = undefined;
			}
		}

		if (this.disposed) {
			return;
		}
		this.webview.postMessage({
			type: 'connectionState',
			status: { providers, apiKeys, providerState },
		});
	}

	/**
	 * Schedule a debounced workspace-index refresh. File-system events arrive
	 * in bursts (e.g. `npm install`); coalescing them keeps the webview from
	 * being deluged with `workspaceIndexUpdate` messages while the burst is
	 * still in flight.
	 */
	private scheduleWorkspaceIndexRefresh(): void {
		if (this.disposed) {
			return;
		}
		if (this.workspaceIndexRefreshTimer) {
			clearTimeout(this.workspaceIndexRefreshTimer);
		}
		this.workspaceIndexRefreshTimer = setTimeout(() => {
			this.workspaceIndexRefreshTimer = undefined;
			void this.refreshWorkspaceIndex();
		}, 500);
	}

	/**
	 * Resolve a sample of workspace files and folders for the `@`-mention
	 * popup. The popup filters in the webview, so we don't need every path —
	 * a representative slice is sufficient and bounds memory cost. Sensitive
	 * paths are filtered defensively even though `findFiles` already excludes
	 * `node_modules`, since the workspace may carry credentials elsewhere.
	 */
	private async refreshWorkspaceIndex(): Promise<void> {
		if (this.disposed) {
			return;
		}
		const entries: WorkspaceIndexEntry[] = [];
		const folders = vscode.workspace.workspaceFolders ?? [];

		// `[workspace]` pseudo-entry — selected, this attaches the project
		// file tree to the next message.
		if (folders.length > 0) {
			entries.push({ kind: 'workspace', name: '@workspace', relPath: '[workspace]' });
		}

		for (const folder of folders) {
			entries.push({
				kind: 'folder',
				name: folder.name,
				relPath: folder.name,
			});
		}

		try {
			const uris = await vscode.workspace.findFiles(
				'**/*',
				'**/node_modules/**',
				WORKSPACE_INDEX_FILE_LIMIT,
			);
			for (const uri of uris) {
				const rel = vscode.workspace.asRelativePath(uri, false);
				if (isSensitivePath(rel)) {
					continue;
				}
				const segments = rel.split(/[\\/]/);
				const name = segments[segments.length - 1] || rel;
				entries.push({ kind: 'file', name, relPath: rel });
			}
		} catch {
			// findFiles can throw on ill-defined workspaces (e.g. virtual fs).
			// Surface an empty list rather than blocking the chat surface.
		}

		if (this.disposed) {
			return;
		}
		this.workspaceIndex = entries;
		this.webview.postMessage({ type: 'workspaceIndexUpdate', entries });
	}

	clearConversation(): void {
		// "Clear" now means "start a new conversation" — the previous one is
		// preserved in the store so users can return to it from the History
		// view. Side effects mirror the legacy in-place wipe so cost meters,
		// pending approvals, and the streaming UI all reset cleanly.
		this.cancelPendingApprovals('cancel');
		this.abortController?.abort();
		this.emittedUiBlockIds.clear();
		this.pendingUiBlockResponses.clear();
		const fresh = this.conversationStore.create();
		this.currentConversationId = fresh.summary.id;
		this.conversation = [...fresh.messages];
		// Fresh conversation starts on the Chat tab so the user sees the
		// composer immediately rather than landing on whichever pane was
		// active in the previous conversation.
		this.currentTab = 'chat';
		this.webview.postMessage({ type: 'tabChanged', tab: this.currentTab });
		this.postBoardSnapshot();
		this.postHistorySnapshot();
		this.webview.postMessage({ type: 'conversationCleared' });
		// Reset the running cost meter so a fresh chat starts at $0.00. The
		// CostReporter's onDidChange will fanout the empty totals; the
		// dedicated `costReset` message is the canonical "hide and zero" cue
		// so the webview doesn't paint a stale value during the brief window
		// before the next costUpdate lands.
		if (this.costReporter) {
			this.costReporter.resetSession();
		}
		this.webview.postMessage({ type: 'costReset' });
		// H11 — also zero the standalone session meter so the status-bar
		// totals reset alongside the cost-reporter chip in the header.
		this.resetSessionUsage();
	}

	/**
	 * Switch the active conversation. Aborts any in-flight stream and pending
	 * approvals so the previous conversation's tool loop doesn't continue
	 * writing into the new one. The webview replaces its scrollback wholesale
	 * via `loadConversation` and resets per-session state (cost meter,
	 * approval cards) the same way `clearConversation` does.
	 */
	switchConversation(id: string): void {
		if (id === this.currentConversationId) {
			return;
		}
		const record = this.conversationStore.load(id);
		if (!record) {
			return;
		}
		// Abort the in-flight stream and any pending approvals so the
		// previous conversation's tool loop unwinds cleanly. The next
		// streamRequest will mint a fresh AbortController.
		this.cancelPendingApprovals('cancel');
		this.abortController?.abort();
		this.emittedUiBlockIds.clear();
		this.pendingUiBlockResponses.clear();
		this.currentConversationId = record.summary.id;
		this.conversation = [...record.messages];
		this.currentSpecialistId = record.summary.lastSpecialist ?? this.currentSpecialistId;
		this.currentMode = record.summary.lastMode ?? 'act';
		this.currentTab = record.summary.lastTab ?? 'chat';
		this.webview.postMessage({
			type: 'loadConversation',
			messages: this.conversation,
			lastSpecialist: this.currentSpecialistId,
			lastMode: this.currentMode,
		});
		// Replay checkpoints so the pills come back after a conversation
		// switch. Posted after `loadConversation` so the user bubbles are
		// already in the DOM by the time the pill-attach handler runs.
		this.postCheckpointsForCurrentConversation();
		// Cost meter is per-session, not per-conversation, so reset it on
		// switch — the previous conversation's totals don't apply here.
		if (this.costReporter) {
			this.costReporter.resetSession();
		}
		this.webview.postMessage({ type: 'costReset' });
		// H11 — reset the standalone session meter on conversation switch.
		// `sessionUsage` is per-conversation; switching contexts means the
		// previous conversation's running totals no longer apply.
		this.resetSessionUsage();
		this.webview.postMessage({ type: 'specialistChange', specialistId: this.currentSpecialistId });
		this.webview.postMessage({ type: 'modeChanged', chatMode: this.currentMode });
		this.webview.postMessage({ type: 'tabChanged', tab: this.currentTab });
		this.postBoardSnapshot();
		this.postHistorySnapshot();
	}

	/**
	 * Abort any in-flight chat stream and outstanding approval prompts.
	 * Exposed so the static `ChatPanel.abortAll()` helper can fan out the
	 * cancellation across every active session before a checkpoint restore
	 * rewrites the working tree.
	 */
	abortInFlight(): void {
		this.cancelPendingApprovals('cancel');
		this.abortController?.abort();
	}

	/**
	 * Reload the active conversation's persisted message list and repaint
	 * the webview scrollback. Used after a checkpoint restore with
	 * `conversationToo: true` so the trimmed messages disappear from any
	 * open chat surface.
	 */
	reloadCurrentConversation(): void {
		const record = this.conversationStore.load(this.currentConversationId);
		if (!record) {
			return;
		}
		this.conversation = [...record.messages];
		this.webview.postMessage({
			type: 'loadConversation',
			messages: this.conversation,
			lastSpecialist: this.currentSpecialistId,
			lastMode: this.currentMode,
		});
		this.postCheckpointsForCurrentConversation();
	}

	/**
	 * Push the list of existing checkpoints for the active conversation to
	 * the webview so it can re-attach pills to user message bubbles. Sent
	 * after every load/switch so a conversation that already has checkpoints
	 * doesn't lose its rollback affordances on window reload.
	 */
	private postCheckpointsForCurrentConversation(): void {
		if (!this.checkpointManager) {
			return;
		}
		const checkpoints = this.checkpointManager.list(this.currentConversationId);
		if (checkpoints.length === 0) {
			return;
		}
		this.webview.postMessage({
			type: 'checkpointsLoaded',
			checkpoints: checkpoints.map(cp => ({
				checkpointId: cp.id,
				turnIndex: cp.turnIndex,
				capturedAt: cp.capturedAt,
				summary: cp.summary,
				userMessage: cp.userMessage,
			})),
		});
	}

	/**
	 * Push the active conversation's task board snapshot to the webview so
	 * the Tasks tab can render the current plan. Sent on conversation
	 * load/switch and whenever the model emits `onDidChangeBoard`. The
	 * payload is plain serialisable data so JSON round-tripping through
	 * postMessage stays clean.
	 */
	private postBoardSnapshot(): void {
		if (this.disposed) {
			return;
		}
		const snapshot: BoardSnapshot | undefined = this.taskBoardModel?.getSnapshot(this.currentConversationId);
		const tasks = snapshot ? snapshot.tasks.map((t: BoardTask) => ({
			id: t.id,
			instruction: t.instruction,
			assignee: t.assignee,
			scopeFiles: [...t.scopeFiles],
			dependencies: [...t.dependencies],
			state: t.state,
			summary: t.summary,
		})) : [];
		this.webview.postMessage({
			type: 'tasksSnapshot',
			conversationId: this.currentConversationId,
			tasks,
			counts: this.computeStateCounts(tasks.map(t => t.state)),
		});
	}

	/** Tally subtask states into a record matching the kanban's column ordering. */
	private computeStateCounts(states: ReadonlyArray<SubtaskState>): Record<SubtaskState, number> {
		const counts: Record<SubtaskState, number> = {
			'backlog': 0,
			'ready': 0,
			'in-progress': 0,
			'review': 0,
			'done': 0,
			'failed': 0,
		};
		for (const s of states) {
			counts[s] = (counts[s] ?? 0) + 1;
		}
		return counts;
	}

	/**
	 * Push a compact summary of every conversation in the store to the
	 * webview so the History tab can render a flat list. Mirrors the
	 * sidebar tree's data feed without needing a separate provider.
	 */
	private postHistorySnapshot(): void {
		if (this.disposed) {
			return;
		}
		const summaries = this.conversationStore.list().map(s => ({
			id: s.id,
			title: s.title,
			updatedAt: s.updatedAt,
			messageCount: s.messageCount,
		}));
		this.webview.postMessage({
			type: 'historySnapshot',
			activeId: this.currentConversationId,
			conversations: summaries,
		});
	}

	/**
	 * Build the dependency surface the slash-command dispatcher needs. Closures
	 * over the session so command handlers can mutate state (specialist, model)
	 * and trigger side effects (clear, status) without leaking implementation
	 * details into the pure parsing module.
	 */
	private buildSlashCommandContext(): SlashCommandContext {
		return {
			getSpecialistId: () => this.currentSpecialistId,
			setSpecialistId: (id: string) => {
				this.currentSpecialistId = id;
				// Reflect the change in the toolbar chip immediately so the
				// next user message inherits the new selection without
				// requiring the user to also click the chip.
				this.webview.postMessage({ type: 'specialistChange', specialistId: id });
			},
			getModel: () => this.currentModel,
			setModel: (id: ModelId) => {
				this.currentModel = id;
				this.webview.postMessage({ type: 'modelChange', model: id });
			},
			getMode: () => this.currentMode,
			setMode: (mode: ChatMode) => {
				this.currentMode = mode;
				// Persist immediately so a reload picks up the new mode even
				// if the user hasn't yet sent another message.
				this.saveConversation();
				this.webview.postMessage({ type: 'modeChanged', chatMode: mode });
			},
			clearConversation: async () => {
				this.clearConversation();
			},
			getProviderStatus: async () => {
				try {
					const result = await vscode.commands.executeCommand<{ providers?: Array<{ id: string; displayName: string; connected: boolean }> }>('sotaAuth.status');
					const providers = result && Array.isArray(result.providers) ? result.providers : [];
					return providers.map(p => ({ name: p.displayName || p.id, connected: Boolean(p.connected) }));
				} catch {
					return [];
				}
			},
		};
	}

	/**
	 * Post a "system" message (slash-command output) to the webview AND
	 * persist it under the new `'system'` role so a session reload restores
	 * the same scrollback. Visually distinct from assistant messages — the
	 * webview applies the `.msg-system` class for styling.
	 */
	private postSystemMessage(markdown: string): void {
		const entry: ChatMessage = {
			role: 'system',
			content: markdown,
			timestamp: Date.now(),
		};
		this.conversation.push(entry);
		this.saveConversation();
		this.webview.postMessage({ type: 'systemMessage', content: markdown });
	}

	/**
	 * Pick the initial conversation when the session boots. Honours an
	 * explicit caller-supplied id, then falls back to the most recently used
	 * conversation, and finally creates a new one when the store is empty.
	 */
	private resolveInitialConversation(initialConversationId: string | undefined): {
		summary: { id: string; lastSpecialist?: AgentHandle | 'anton'; lastMode?: ChatMode; lastTab?: ChatTab };
		messages: ChatMessage[];
	} {
		if (initialConversationId) {
			const record = this.conversationStore.load(initialConversationId);
			if (record) {
				return { summary: record.summary, messages: record.messages };
			}
		}
		const list = this.conversationStore.list();
		if (list.length > 0) {
			const mostRecent = list[0];
			const record = this.conversationStore.load(mostRecent.id);
			if (record) {
				return { summary: record.summary, messages: record.messages };
			}
		}
		const fresh = this.conversationStore.create();
		return { summary: fresh.summary, messages: fresh.messages };
	}

	private saveConversation(): void {
		const lastSpecialist = this.currentSpecialistId as AgentHandle | 'anton';
		this.conversationStore.update(
			this.currentConversationId,
			this.conversation,
			lastSpecialist,
			this.currentMode,
			this.currentTab,
		);
	}

	private setupMessageHandler(): void {
		this.webview.onDidReceiveMessage(
			async (message: WebviewMessage) => {
				switch (message.type) {
					case 'sendMessage':
						// Refresh connection state opportunistically so the user
						// sees fresh auth status if they just signed in via a popup.
						void this.refreshConnectionState();
						await this.handleSendMessage(message);
						break;
					case 'modeChange': {
						// Plan/Act toggle from the composer toolbar pill. Persist
						// the choice on the conversation summary so reloading and
						// switching conversations both restore the right mode.
						const next: ChatMode = message.chatMode === 'plan' ? 'plan' : 'act';
						if (next !== this.currentMode) {
							this.currentMode = next;
							this.saveConversation();
							// Echo back so the chip stays consistent if the host
							// massaged the value (defensive: webview is the
							// authoritative source for normal toggles, but we
							// post `modeChanged` here so the slash-command path
							// and toolbar path use the same downstream wiring).
							this.webview.postMessage({ type: 'modeChanged', chatMode: next });
						}
						break;
					}
					case 'tabChange': {
						// User picked a different tab in the chat sidebar header.
						// Persist the choice on the conversation summary so a
						// reload (or switching conversations) restores the same
						// pane the user was last looking at.
						const next: ChatTab = isValidChatTab(message.tab) ? message.tab : 'chat';
						if (next !== this.currentTab) {
							this.currentTab = next;
							this.saveConversation();
						}
						// Echo back unconditionally so the active-state class on
						// the tab button stays in sync if the host massaged the
						// value (defensive — host is the source of truth).
						this.webview.postMessage({ type: 'tabChanged', tab: this.currentTab });
						break;
					}
					case 'cancelRequest':
						this.abortController?.abort();
						// Settle outstanding approval prompts so the tool loop
						// doesn't block awaiting `approvalResponse` after the
						// user has already pressed Stop.
						this.cancelPendingApprovals('cancel');
						break;
					case 'approvalResponse': {
						if (typeof message.id !== 'string') {
							break;
						}
						const pending = this.pendingApprovals.get(message.id);
						if (!pending) {
							break;
						}
						this.pendingApprovals.delete(message.id);
						clearTimeout(pending.timer);
						const action: ApprovalDecision['action'] = message.action === 'approve' ? 'approve' : 'reject';
						pending.resolve({ action, reason: typeof message.reason === 'string' ? message.reason : undefined });
						break;
					}
					case 'toolResultEdited': {
						const toolCallId = message.toolCallId;
						const editedOutput = message.editedOutput;
						if (typeof toolCallId === 'string' && typeof editedOutput === 'string') {
							this.editedToolResults.set(toolCallId, editedOutput);
						}
						break;
					}
					case 'uiBlockResponse': {
						// Form/confirm submission from a generative-UI block.
						// Forward the user's answer as a synthetic user turn so
						// the agent sees it as a normal continuation of the
						// conversation. The webview already froze the block's
						// inputs before posting this message; the host only
						// needs to dispatch the next agent turn.
						const blockId = typeof message.blockId === 'string' ? message.blockId : '';
						if (!blockId) {
							break;
						}
						this.pendingUiBlockResponses.delete(blockId);
						const valueJson = safeStringify(message.responseValue);
						const syntheticText = `UI block response (${blockId}): ${valueJson}`;
						await this.handleSendMessage({
							type: 'sendMessage',
							text: syntheticText,
						});
						break;
					}
					case 'uiBlockAction': {
						// Card action-button click. Same shape as a response
						// but with a named action — kept distinct from
						// `uiBlockResponse` so cards can fire arbitrary
						// actions without visibly freezing the block.
						const blockId = typeof message.blockId === 'string' ? message.blockId : '';
						if (!blockId) {
							break;
						}
						const actionName = typeof message.actionName === 'string' ? message.actionName : 'unnamed';
						const payloadJson = safeStringify(message.actionPayload);
						const syntheticText = `UI block action (${blockId}.${actionName}): ${payloadJson}`;
						await this.handleSendMessage({
							type: 'sendMessage',
							text: syntheticText,
						});
						break;
					}
					case 'clearConversation':
						this.clearConversation();
						break;
					case 'acceptDiff':
						await this.handleAcceptDiff(message.diffId);
						break;
					case 'rejectDiff':
						// No action needed — diff is simply dismissed
						break;
					case 'copyCode':
						if (message.text) {
							await vscode.env.clipboard.writeText(message.text);
						}
						break;
					case 'runCommand':
						if (typeof message.command === 'string') {
							if (typeof message.arg === 'string') {
								await vscode.commands.executeCommand(message.command, message.arg);
							} else {
								await vscode.commands.executeCommand(message.command);
							}
							// Trigger an immediate refresh after command completes so the
							// empty-state CTA disappears as soon as the user signs in.
							void this.refreshConnectionState();
						}
						break;
					case 'historyRename': {
						// Rename a conversation from the History tab. The TreeItem-based
						// `sota.renameConversation` command needs a tree node arg, so
						// we drive the rename directly via the store with an inline
						// input box for the new title.
						const id = typeof message.id === 'string' ? message.id : '';
						if (!id) break;
						const current = this.conversationStore.list().find(s => s.id === id);
						if (!current) break;
						const next = await vscode.window.showInputBox({
							prompt: 'Rename conversation',
							value: current.title,
							validateInput: (value) => (value.trim().length === 0 ? 'Title cannot be empty.' : undefined),
						});
						if (next !== undefined) {
							this.conversationStore.rename(id, next);
						}
						break;
					}
					case 'historyDelete': {
						// Mirrors the `sota.deleteConversation` command's confirm-and-
						// delete flow without requiring a TreeItem argument so the
						// History tab can call it directly.
						const id = typeof message.id === 'string' ? message.id : '';
						if (!id) break;
						const current = this.conversationStore.list().find(s => s.id === id);
						if (!current) break;
						const choice = await vscode.window.showWarningMessage(
							`Delete conversation “${current.title}”?`,
							{ modal: true },
							'Delete',
						);
						if (choice === 'Delete') {
							this.conversationStore.delete(id);
						}
						break;
					}
					case 'openCodeInEditor': {
						if (typeof message.code !== 'string') {
							break;
						}
						// Defensive: a malformed language tag from the fenced code
						// block (too long or non [a-z0-9-] chars) would cause VS Code
						// to fall back to plaintext anyway, so we normalise it up
						// front to avoid surprising users with cryptic errors.
						const rawLanguage = typeof message.language === 'string' ? message.language : '';
						const language = rawLanguage && rawLanguage.length <= 32 && /^[A-Za-z0-9_-]+$/.test(rawLanguage)
							? rawLanguage
							: 'plaintext';
						const doc = await vscode.workspace.openTextDocument({ content: message.code, language });
						await vscode.window.showTextDocument(doc, { preview: false });
						break;
					}
					case 'saveCodeToFile': {
						await this.handleSaveCodeToFile(message);
						break;
					}
					case 'previewDiff': {
						if (typeof message.diff !== 'string' || !message.diff) {
							break;
						}
						await this.handlePreviewDiff(message.diff);
						break;
					}
					case 'previewWriteFileDiff': {
						if (typeof message.path === 'string' && typeof message.proposedContent === 'string') {
							await this.openWriteFileDiffPreview(message.path, message.proposedContent);
						}
						break;
					}
					case 'openWriteDiff': {
						if (typeof message.filePath === 'string' && message.filePath.length > 0) {
							const snapId = typeof message.snapshotId === 'string' && message.snapshotId.length > 0
								? message.snapshotId
								: undefined;
							await this.openWriteDiffEditor(message.filePath, snapId);
						}
						break;
					}
					case 'pickImage':
						await this.handlePickImage();
						break;
					case 'costResetRequest':
						// User clicked "Reset" inside the cost-meter popover.
						// Flush the in-memory entries (weekly reports stay) and
						// notify the webview so the meter zeroes immediately.
						if (this.costReporter) {
							this.costReporter.resetSession();
						}
						this.webview.postMessage({ type: 'costReset' });
						break;
					case 'checkpointCompare':
						if (typeof message.checkpointId === 'string') {
							await this.handleCheckpointCompare(message.checkpointId);
						}
						break;
					case 'checkpointRestoreWorkspace':
						if (typeof message.checkpointId === 'string') {
							await this.handleCheckpointRestore(message.checkpointId, false);
						}
						break;
					case 'checkpointRestoreAll':
						if (typeof message.checkpointId === 'string') {
							await this.handleCheckpointRestore(message.checkpointId, true);
						}
						break;
					case 'providerSave':
						await this.handleProviderSave(message);
						break;
					case 'providerTest':
						await this.handleProviderTest(message);
						break;
					case 'requestProviderProfiles':
						this.postProviderProfiles(typeof message.provider === 'string' ? message.provider : undefined);
						break;
					case 'deleteProviderProfile':
						await this.handleDeleteProviderProfile(message);
						break;
					case 'connectClaudeCode':
						await this.handleConnectClaudeCode();
						break;
					case 'connectCodexCli':
						await this.handleConnectCodexCli();
						break;
					case 'settingChange':
						await this.handleSettingChange(message);
						break;
					case 'requestSettings':
						this.postSettingsState();
						break;
					case 'getSpecialistModelsState':
						this.postSpecialistModelsState();
						break;
					case 'setSpecialistModel':
						await this.handleSetSpecialistModel(message);
						break;
					case 'reloadWindow':
						// Surfaced by the Specialist Models sub-tab's "Reload
						// window to apply" button after the user has changed
						// at least one per-agent override. The agent stack
						// reads the setting at activation, so a window
						// reload is the cheapest way to land the change.
						await vscode.commands.executeCommand('workbench.action.reloadWindow');
						break;
					case 'openSettingsJson':
						if (typeof message.settingId === 'string' && message.settingId.length > 0) {
							await vscode.commands.executeCommand('workbench.action.openSettings', message.settingId);
						}
						break;
					case 'requestMcpServers':
						await this.postMcpServersState();
						break;
					case 'mcpServerSave':
						await this.handleMcpServerSave(message);
						break;
					case 'mcpServerDelete':
						await this.handleMcpServerDelete(message);
						break;
					case 'openLink': {
						const url = typeof message.url === 'string' ? message.url : '';
						// Defensive: only follow https URLs so a malformed message
						// can never trigger arbitrary `code:` / `file:` navigation.
						if (/^https:\/\//.test(url)) {
							await vscode.env.openExternal(vscode.Uri.parse(url));
						}
						break;
					}
					case 'resetAllSettings': {
						await this.handleResetAllSettings();
						break;
					}
					case 'exportConversation': {
						// Delegates to the host command so the save dialog,
						// filename, and post-save toast match what the palette
						// flow does — keeping a single export code path.
						await vscode.commands.executeCommand('sota.exportConversation');
						break;
					}
					case 'rerunFromSubtask': {
						// Phase 62 — user right-clicked a focus-chain row and
						// chose "Re-run from here". We pre-fill the composer
						// with `@<handle> <description>` so they can adjust
						// before submitting (option (a): non-destructive).
						const handle = typeof message.handle === 'string' ? message.handle.trim() : '';
						const description = typeof message.description === 'string' ? message.description : '';
						// First line only — keeps the composer compact and matches
						// what the checklist row showed.
						const firstLine = description.split('\n')[0].trim();
						const mention = handle ? '@' + handle + ' ' : '';
						const text = (mention + firstLine).trim();
						if (text.length > 0) {
							this.webview.postMessage({ type: 'prefillComposer', text });
						}
						break;
					}
				}
			},
			null,
			this.disposables,
		);
	}

	/**
	 * Persist provider credentials posted from the chat empty-state inline
	 * form (or the settings view). Delegates to the shared
	 * `saveProviderCredentials` so the wizard and chat surface stay in sync,
	 * and pushes a refreshed `connectionState` so the status pills update
	 * the moment a save completes.
	 */
	private async handleProviderSave(message: WebviewMessage): Promise<void> {
		const provider = typeof message.provider === 'string' ? message.provider : '';
		const fields = message.fields && typeof message.fields === 'object' ? message.fields : {};
		const validProviders: ReadonlyArray<ProviderId> = ['anthropic', 'openai', 'foundry', 'bedrock', 'google', 'openrouter', 'ollama', 'lmstudio', 'deepseek', 'mistral', 'groq', 'cerebras', 'together', 'fireworks'];
		if (!validProviders.includes(provider as ProviderId)) {
			this.webview.postMessage({
				type: 'providerSaveResult',
				provider,
				ok: false,
				message: 'Unknown provider.',
				deferred: false,
			});
			return;
		}
		if (!this.secrets) {
			this.webview.postMessage({
				type: 'providerSaveResult',
				provider,
				ok: false,
				message: 'Secret storage unavailable in this chat surface.',
				deferred: false,
			});
			return;
		}
		// Wrap the save call so that an unhandled exception inside the saver
		// (or its validation probe) still sends a terminal `providerSaveResult`
		// to the webview — without this the inline form spinner could hang
		// forever at "Saving and validating…" if the network or LLM client
		// threw something the saver didn't catch internally.
		let result: { ok: boolean; message: string; deferred?: boolean };
		try {
			result = await saveProviderCredentials(
				provider as ProviderId,
				fields,
				{
					llmClient: this.llmClient,
					secrets: this.secrets,
					config: globalScopedConfig('sota'),
				},
			);
		} catch (err) {
			const detail = err instanceof Error ? err.message : String(err);
			result = { ok: false, message: `Save failed: ${detail}`, deferred: false };
		}
		this.webview.postMessage({
			type: 'providerSaveResult',
			provider,
			ok: result.ok,
			message: result.message,
			deferred: result.deferred ?? false,
		});
		if (result.ok) {
			void this.refreshConnectionState();
		}
	}

	/**
	 * Phase 3 — connectivity probe used by the inline provider forms' "Test
	 * connection" button. Persists nothing; the user typed credentials are
	 * read from the form post and forwarded to the host's LlmClient via the
	 * cheapest model in the provider's roster. Time-boxed at 10s.
	 */
	private async handleProviderTest(message: WebviewMessage): Promise<void> {
		const provider = typeof message.provider === 'string' ? message.provider : '';
		const validProviders: ReadonlyArray<ProviderId> = ['anthropic', 'openai', 'foundry', 'bedrock', 'google', 'openrouter', 'ollama', 'lmstudio', 'deepseek', 'mistral', 'groq', 'cerebras', 'together', 'fireworks'];
		if (!validProviders.includes(provider as ProviderId)) {
			this.webview.postMessage({ type: 'providerTestResult', provider, ok: false, message: 'Unknown provider.' });
			return;
		}
		// Local-server providers — Ollama and LM Studio — get a cheap GET
		// probe at the listing endpoint rather than a chat-completion round
		// trip. This is what the user expects ("can the form reach the
		// server right now?") and avoids depending on a model being loaded.
		const fields = message.fields && typeof message.fields === 'object'
			? message.fields as Record<string, string>
			: {};
		if (provider === 'ollama') {
			const baseUrl = ((fields['baseUrl'] ?? '').trim() || 'http://localhost:11434').replace(/\/+$/, '');
			const result = await this.pingHttpEndpoint(`${baseUrl}/api/tags`, 'Ollama', 'ollama serve', undefined, 10000);
			this.webview.postMessage({ type: 'providerTestResult', provider, ok: result.ok, message: result.message });
			return;
		}
		if (provider === 'lmstudio') {
			const baseUrl = ((fields['baseUrl'] ?? '').trim() || 'http://localhost:1234').replace(/\/+$/, '');
			const apiKey = (fields['apiKey'] ?? '').trim() || undefined;
			const result = await this.pingHttpEndpoint(`${baseUrl}/v1/models`, 'LM Studio', 'the LM Studio app\'s "Local Server" tab', apiKey, 10000);
			this.webview.postMessage({ type: 'providerTestResult', provider, ok: result.ok, message: result.message });
			return;
		}
		const probeModel: Record<ProviderId, string> = {
			anthropic: 'haiku',
			openai: 'gpt-4o-mini',
			foundry: 'foundry-gpt-4o-mini',
			bedrock: 'bedrock-claude-haiku',
			google: 'gemini-1-5-flash',
			openrouter: 'openrouter-claude-sonnet-4-7',
			ollama: 'ollama-llama-3-1',
			lmstudio: 'lmstudio-loaded',
			deepseek: 'deepseek-v3',
			mistral: 'mistral-small',
			groq: 'groq-llama-3-1-8b',
			cerebras: 'cerebras-llama-3-1-8b',
			together: 'together-qwen-2-5-coder',
			fireworks: 'fireworks-qwen-2-5-coder',
		};
		try {
			const result = await this.llmClient.pingProvider(probeModel[provider as ProviderId] as Parameters<typeof this.llmClient.pingProvider>[0], 10000);
			this.webview.postMessage({ type: 'providerTestResult', provider, ok: result.ok, message: result.message });
		} catch (err) {
			const detail = err instanceof Error ? err.message : String(err);
			this.webview.postMessage({ type: 'providerTestResult', provider, ok: false, message: detail });
		}
	}

	/**
	 * Cheap GET probe for local-server providers (Ollama, LM Studio). We avoid
	 * a chat-completion round-trip because (a) the user might not have a
	 * model loaded yet, and (b) a 404/connection-refused on the listing
	 * endpoint is a clearer "your server isn't reachable" signal than a chat
	 * 500. Time-boxed by `timeoutMs`; auth header optional.
	 */
	private async pingHttpEndpoint(
		url: string,
		productName: string,
		serveHint: string,
		apiKey: string | undefined,
		timeoutMs: number,
	): Promise<{ ok: boolean; message: string }> {
		const controller = new AbortController();
		const timer = setTimeout(() => controller.abort(), timeoutMs);
		try {
			const headers: Record<string, string> = { 'Accept': 'application/json' };
			if (apiKey) {
				headers['Authorization'] = `Bearer ${apiKey}`;
			}
			const res = await fetch(url, { method: 'GET', headers, signal: controller.signal });
			if (res.ok) {
				return { ok: true, message: `${productName} reachable.` };
			}
			return { ok: false, message: `${productName} returned HTTP ${res.status}. Is ${serveHint} running?` };
		} catch (err) {
			const detail = err instanceof Error ? err.message : String(err);
			return { ok: false, message: `${productName} unreachable: ${detail}. Start ${serveHint} and try again.` };
		} finally {
			clearTimeout(timer);
		}
	}

	/**
	 * Push the current contents of the multi-deployment maps for Foundry,
	 * Bedrock, and Google so the management UI can render the saved-list view
	 * without re-walking settings.json on every render. Optional `provider`
	 * filters the response to a single id; omitting it returns all three.
	 */
	private postProviderProfiles(provider?: string): void {
		if (this.disposed) {
			return;
		}
		const cfg = vscode.workspace.getConfiguration('sota');
		const parseMap = (key: string): Record<string, Record<string, string>> => {
			const raw = (cfg.get<string>(key) ?? '{}').trim() || '{}';
			try {
				const candidate = JSON.parse(raw);
				if (candidate && typeof candidate === 'object' && !Array.isArray(candidate)) {
					return candidate as Record<string, Record<string, string>>;
				}
			} catch {
				// fall through
			}
			return {};
		};
		const profiles: Record<string, Record<string, Record<string, string>>> = {
			foundry: parseMap('foundryProfiles'),
			bedrock: parseMap('bedrockProfiles'),
			google: parseMap('googleProfiles'),
		};
		if (provider && provider in profiles) {
			this.webview.postMessage({ type: 'providerProfiles', provider, profiles: profiles[provider] });
			return;
		}
		this.webview.postMessage({ type: 'providerProfiles', profiles });
	}

	/**
	 * Remove a saved profile from the matching `<provider>Profiles` map. The
	 * delete only touches the named entry — the legacy single-credential
	 * settings (foundryEndpoint / foundryApiKey / bedrockRegion / etc.) are
	 * left intact so the user's currently-selected default keeps working.
	 */
	private async handleDeleteProviderProfile(message: WebviewMessage): Promise<void> {
		const provider = typeof message.provider === 'string' ? message.provider : '';
		const name = typeof message.profileName === 'string' ? message.profileName : '';
		const settingKey = provider === 'foundry'
			? 'foundryProfiles'
			: provider === 'bedrock'
				? 'bedrockProfiles'
				: provider === 'google'
					? 'googleProfiles'
					: undefined;
		if (!settingKey || !name) {
			return;
		}
		try {
			await deleteProfileEntry(globalScopedConfig('sota'), settingKey, name);
		} catch (err) {
			console.warn('[chatPanel] deleteProviderProfile failed:', err);
		}
		this.postProviderProfiles(provider);
	}

	/**
	 * Push current values of the `sota.*` settings the inline settings view
	 * exposes. Sent in response to a `requestSettings` message so the toggles
	 * paint the correct initial state when the user opens the gear panel.
	 */
	private postSettingsState(): void {
		if (this.disposed) {
			return;
		}
		const cfg = vscode.workspace.getConfiguration('sota');
		const denylist = cfg.get<ReadonlyArray<string>>('commandDenylist', []) ?? [];
		const settings: Record<string, unknown> = {
			'sota.personality.enabled': cfg.get<boolean>('personality.enabled', true),
			'sota.chat.includeWorkspaceContext': cfg.get<boolean>('chat.includeWorkspaceContext', true),
			'sota.chat.autoApproveSafeOperations': cfg.get<boolean>('chat.autoApproveSafeOperations', false),
			// Phase 86 — per-category auto-approval toggles. The legacy single
			// flag above is kept for backward compatibility; new code reads
			// these four exclusively.
			'sota.autoApprove.read': cfg.get<boolean>('autoApprove.read', true),
			'sota.autoApprove.write': cfg.get<boolean>('autoApprove.write', false),
			'sota.autoApprove.shell': cfg.get<boolean>('autoApprove.shell', false),
			'sota.autoApprove.mcp': cfg.get<boolean>('autoApprove.mcp', false),
			'sota.commandDenylist': Array.isArray(denylist) ? denylist.join('\n') : '',
			// Phase 86 — spend caps (numbers + master toggle).
			'sota.spendLimit.enabled': cfg.get<boolean>('spendLimit.enabled', true),
			'sota.spendLimit.session': cfg.get<number>('spendLimit.session', 5.0),
			'sota.spendLimit.task': cfg.get<number>('spendLimit.task', 1.0),
			// Phase 2 (settings sub-tabs) — advisory toggles for now; runtime
			// behaviour is wired separately as features ship.
			'sota.chat.focusChainEnabled': cfg.get<boolean>('chat.focusChainEnabled', true),
			'sota.chat.perMessageHoverDetails': cfg.get<boolean>('chat.perMessageHoverDetails', true),
			'sota.chat.personaAccents': cfg.get<boolean>('chat.personaAccents', true),
			'sota.personality.asciiArt': cfg.get<boolean>('personality.asciiArt', true),
			'sota.personality.easterEggs': cfg.get<boolean>('personality.easterEggs', true),
			'sota.personality.antonIsWatching': cfg.get<boolean>('personality.antonIsWatching', true),
			'sota.personality.antonIsWatching.frequency': cfg.get<string>(
				'personality.antonIsWatching.frequency',
				'normal',
			),
			'sota.terminal.shellIntegration': cfg.get<boolean>('terminal.shellIntegration', true),
			'sota.defaultModel': cfg.get<string>('defaultModel', 'sonnet'),
			'sota.reasoningEffort': cfg.get<string>('reasoningEffort', 'medium'),
			'sota.thinkingBudgetTokens': cfg.get<number>('thinkingBudgetTokens', 0),
			'sota.personality.voiceIntensity': cfg.get<number>('personality.voiceIntensity', 5),
			'sota.terminal.outputLineCap': cfg.get<number>('terminal.outputLineCap', 100),
		};
		this.webview.postMessage({ type: 'settingsState', settings });
		this.postSpendLimitState();
	}

	/**
	 * Emit the live spend-limit meter values so the Settings → Features
	 * panel can repaint its progress bar without a round-trip.
	 *
	 * Sent on:
	 *  - `requestSettings` (paired with `settingsState`)
	 *  - every `costReporter.onDidChange` event (so the meter is "live")
	 *  - configuration changes that touch `sota.spendLimit.*`
	 */
	private postSpendLimitState(): void {
		if (this.disposed) {
			return;
		}
		const limits = readSpendLimits();
		const sessionUsd = this.costReporter ? this.costReporter.getTotalCost() : 0;
		const taskUsd = this.spendGuard ? this.spendGuard.getTaskCost() : 0;
		this.webview.postMessage({
			type: 'spendLimitState',
			enabled: limits.enabled,
			sessionCapUsd: limits.sessionCapUsd,
			taskCapUsd: limits.taskCapUsd,
			sessionUsd,
			taskUsd,
		});
	}

	/**
	 * Connect Anthropic via the locally-installed Claude Code CLI. No API key
	 * required — the CLI handles auth itself (subscription tokens stored by
	 * the Claude Code installer). We just verify the binary is present, set
	 * the active model to a `claude-code-*` id, and surface the result.
	 */
	private async handleConnectClaudeCode(): Promise<void> {
		const { isClaudeCodeAvailable } = await import('son-of-anton-core/llm/claudeCodeRunner');
		if (!isClaudeCodeAvailable()) {
			this.webview.postMessage({
				type: 'providerSaveResult',
				provider: 'anthropic',
				ok: false,
				deferred: false,
				message: 'Claude Code CLI not detected on PATH. Install it from https://docs.anthropic.com/en/docs/claude-code, then try again.',
			});
			return;
		}
		this.webview.postMessage({
			type: 'providerSaveResult',
			provider: 'anthropic',
			ok: true,
			deferred: false,
			message: 'Connected via Claude Code. Pick a "via Claude Code" model in the dropdown to use your subscription.',
		});
		void this.refreshConnectionState();
	}

	/**
	 * Mirror of `handleConnectClaudeCode` for the OpenAI Codex CLI. Verifies
	 * the `codex` binary is on PATH and sends a "Connected" result so the
	 * empty-state form can advance. Auth itself is handled by the CLI's own
	 * sign-in flow (subscription tokens stored under `~/.codex/`); we just
	 * confirm the binary is available.
	 */
	private async handleConnectCodexCli(): Promise<void> {
		const { isCodexAvailable } = await import('son-of-anton-core/llm/codexRunner');
		if (!isCodexAvailable()) {
			this.webview.postMessage({
				type: 'providerSaveResult',
				provider: 'openai',
				ok: false,
				deferred: false,
				message: 'OpenAI Codex CLI not detected on PATH. Install it from https://github.com/openai/codex and run `codex login`, then try again.',
			});
			return;
		}
		this.webview.postMessage({
			type: 'providerSaveResult',
			provider: 'openai',
			ok: true,
			deferred: false,
			message: 'Connected via Codex CLI. Pick a "via Codex CLI" model in the dropdown to use your ChatGPT subscription.',
		});
		void this.refreshConnectionState();
	}

	/**
	 * Persist a workspace setting toggled from the inline settings view. Only
	 * the `sota.*` namespace is allowed so a malicious / malformed message can
	 * never mutate unrelated extensions' configuration. Booleans flow straight
	 * through; everything else is rejected to avoid weakening the type
	 * guarantees of the affected settings.
	 */
	/**
	 * Reset every `sota.*` toggle/value the inline settings view exposes back
	 * to its default. Confirmation lives in the webview (a modal) so the host
	 * is only invoked after the user has explicitly opted in. Provider keys
	 * are intentionally NOT touched — losing those would log the user out.
	 */
	private async handleResetAllSettings(): Promise<void> {
		const cfg = vscode.workspace.getConfiguration('sota');
		const keys: ReadonlyArray<string> = [
			'personality.enabled',
			'personality.voiceIntensity',
			'personality.asciiArt',
			'personality.easterEggs',
			'chat.includeWorkspaceContext',
			'chat.autoApproveSafeOperations',
			'autoApprove.read',
			'autoApprove.write',
			'autoApprove.shell',
			'autoApprove.mcp',
			'commandDenylist',
			'spendLimit.enabled',
			'spendLimit.session',
			'spendLimit.task',
			'chat.focusChainEnabled',
			'chat.perMessageHoverDetails',
			'chat.personaAccents',
			'terminal.outputLineCap',
			'terminal.shellIntegration',
			'reasoningEffort',
			'thinkingBudgetTokens',
			'defaultModel',
		];
		for (const key of keys) {
			try {
				await cfg.update(key, undefined, vscode.ConfigurationTarget.Global);
			} catch (err) {
				console.warn(`[chat] reset of ${key} failed: ${err instanceof Error ? err.message : String(err)}`);
			}
		}
		// Re-push so the webview repaints with defaults.
		this.postSettingsState();
	}

	/**
	 * Ordered list of specialist handles whose `sota.agents.<handle>.model`
	 * setting is exposed in the Settings → Specialist Models sub-tab. Each
	 * tuple stores the handle, a human-friendly display name, and the
	 * hardcoded default the agent stack falls back to when the override
	 * setting is empty. The list mirrors (a) the per-agent settings declared
	 * in `package.json` and (b) the `AGENT_CONFIGS` defaults in
	 * `son-of-anton-core/src/agents/AgentStackFactory.ts`. Update both in
	 * lock-step when adding a new specialist.
	 */
	private static readonly SPECIALIST_MODEL_ENTRIES: ReadonlyArray<{
		readonly handle: string;
		readonly displayName: string;
		readonly defaultModel: string;
	}> = [
		{ handle: 'anton', displayName: 'Orchestrator', defaultModel: 'opus' },
		{ handle: 'anton-code', displayName: 'Code', defaultModel: 'sonnet' },
		{ handle: 'anton-test', displayName: 'Test', defaultModel: 'sonnet' },
		{ handle: 'anton-e2e', displayName: 'E2E', defaultModel: 'sonnet' },
		{ handle: 'anton-security', displayName: 'Security', defaultModel: 'sonnet' },
		{ handle: 'anton-docs', displayName: 'Docs', defaultModel: 'haiku' },
		{ handle: 'anton-ci', displayName: 'CI', defaultModel: 'sonnet' },
		{ handle: 'anton-pr', displayName: 'PR', defaultModel: 'sonnet' },
		{ handle: 'anton-moderniser', displayName: 'Moderniser', defaultModel: 'sonnet' },
		{ handle: 'anton-review', displayName: 'Review', defaultModel: 'sonnet' },
	];

	/**
	 * Resolve a webview-supplied scope discriminator to a
	 * `vscode.ConfigurationTarget`. Unknown / missing values fall back to
	 * `Global` so the operation can never silently target the wrong scope.
	 */
	private resolveConfigurationTarget(scope: WebviewMessage['scope']): vscode.ConfigurationTarget {
		switch (scope) {
			case 'workspace': return vscode.ConfigurationTarget.Workspace;
			case 'folder': return vscode.ConfigurationTarget.WorkspaceFolder;
			case 'user':
			default: return vscode.ConfigurationTarget.Global;
		}
	}

	/**
	 * Push the current per-specialist model overrides down to the webview so
	 * the Settings → Specialist Models sub-tab can paint each row's selected
	 * value plus its "Default" / "Pinned" status pill. Reads the underlying
	 * `sota.agents.<handle>.model` settings keys via `getConfiguration`.
	 * Sent in response to `getSpecialistModelsState`, and again after every
	 * successful `setSpecialistModel` write so the pane re-renders without
	 * the webview having to keep a stale in-memory copy.
	 */
	private postSpecialistModelsState(): void {
		if (this.disposed) {
			return;
		}
		const cfg = vscode.workspace.getConfiguration();
		const entries = ChatSession.SPECIALIST_MODEL_ENTRIES.map(entry => {
			const raw = cfg.get<string>(`sota.agents.${entry.handle}.model`, '') ?? '';
			const value = typeof raw === 'string' ? raw.trim() : '';
			return {
				handle: entry.handle,
				displayName: entry.displayName,
				defaultModel: entry.defaultModel,
				value,
				pinned: value.length > 0,
			};
		});
		this.webview.postMessage({ type: 'specialistModelsState', entries });
	}

	/**
	 * Persist a single per-specialist model override and push fresh state
	 * back so the Settings → Specialist Models row repaints. Validates the
	 * handle against the canonical list so a malformed message can't write
	 * arbitrary `sota.agents.*` keys. Empty / missing model strings clear
	 * the override (i.e. revert to the hardcoded `AGENT_CONFIGS` default).
	 */
	private async handleSetSpecialistModel(message: WebviewMessage): Promise<void> {
		const handle = typeof message.handle === 'string' ? message.handle.trim() : '';
		const known = ChatSession.SPECIALIST_MODEL_ENTRIES.some(e => e.handle === handle);
		if (!known) {
			return;
		}
		const rawModel = typeof message.model === 'string' ? message.model.trim() : '';
		const target = this.resolveConfigurationTarget(message.scope);
		// Empty string clears the override so the AgentConfig default kicks
		// back in. `update(key, undefined, ...)` removes the entry entirely
		// from the affected settings.json scope — preferable to writing an
		// empty string, which would still register as "set" in the inspect()
		// view and confuse later debugging.
		const value: string | undefined = rawModel.length > 0 ? rawModel : undefined;
		try {
			await vscode.workspace
				.getConfiguration()
				.update(`sota.agents.${handle}.model`, value, target);
		} catch (err) {
			console.warn(`[chat] setSpecialistModel failed for ${handle}: ${err instanceof Error ? err.message : String(err)}`);
		}
		this.postSpecialistModelsState();
	}

	private async handleSettingChange(message: WebviewMessage): Promise<void> {
		const settingId = typeof message.settingId === 'string' ? message.settingId : '';
		if (!settingId.startsWith('sota.')) {
			return;
		}
		const value = message.value;
		// Phase 2 — sub-tabs introduced number / string typed settings (sliders,
		// dropdowns) on top of the existing boolean toggles. Allow all three;
		// anything else is dropped to keep the surface narrow.
		if (typeof value !== 'boolean' && typeof value !== 'number' && typeof value !== 'string') {
			return;
		}
		const key = settingId.slice('sota.'.length);
		try {
			// Phase 86 — `sota.commandDenylist` is a string[] in settings.json
			// but the webview ships it as a single textarea value (one regex
			// per line). Split on newlines and drop empties so a trailing
			// blank line doesn't become an empty regex.
			if (settingId === 'sota.commandDenylist' && typeof value === 'string') {
				const patterns = value
					.split(/\r?\n/)
					.map(s => s.trim())
					.filter(s => s.length > 0);
				await vscode.workspace
					.getConfiguration('sota')
					.update(key, patterns, vscode.ConfigurationTarget.Global);
				return;
			}
			await vscode.workspace
				.getConfiguration('sota')
				.update(key, value, vscode.ConfigurationTarget.Global);
			// Push fresh spend-limit state when the cap settings change so the
			// meter repaints without waiting for the next cost event.
			if (settingId.startsWith('sota.spendLimit.')) {
				this.postSpendLimitState();
			}
		} catch (err) {
			console.warn(`[chat] settingChange failed: ${err instanceof Error ? err.message : String(err)}`);
		}
	}

	/**
	 * Send the current `sota.mcp.servers` array down to the webview. Called on
	 * `requestMcpServers` and after every successful save / delete so the
	 * inline list stays in lock-step with `settings.json`.
	 */
	private async postMcpServersState(): Promise<void> {
		if (this.disposed) {
			return;
		}
		try {
			const cfg = vscode.workspace.getConfiguration('sota');
			const servers = await listMcpServers(cfg);
			this.webview.postMessage({ type: 'mcpServersState', servers });
		} catch (err) {
			console.warn(`[chat] postMcpServersState failed: ${err instanceof Error ? err.message : String(err)}`);
			this.webview.postMessage({ type: 'mcpServersState', servers: [] });
		}
	}

	/**
	 * Persist an add / edit posted from the chat settings MCP form. All
	 * validation happens inside `saveMcpServer` so the rules stay in lock-step
	 * across surfaces. We round-trip through `postMcpServersState` after a
	 * success so the webview's list refreshes from the canonical source
	 * rather than from its in-memory copy.
	 */
	private async handleMcpServerSave(message: WebviewMessage): Promise<void> {
		const candidate = this.coerceServerFromWebview(message.server);
		if (!candidate) {
			this.webview.postMessage({
				type: 'mcpServerSaveResult',
				ok: false,
				message: 'Invalid server payload.',
			});
			return;
		}
		const mode: 'add' | 'edit' = message.mode === 'edit' ? 'edit' : 'add';
		const cfg = vscode.workspace.getConfiguration('sota');
		const result = await saveMcpServer(candidate, mode, cfg);
		this.webview.postMessage({
			type: 'mcpServerSaveResult',
			ok: result.ok,
			message: result.message,
			name: candidate.name,
		});
		if (result.ok) {
			await this.postMcpServersState();
		}
	}

	/**
	 * Remove a configured server by name. Existing in-memory `McpClient`
	 * connections persist for the lifetime of the chat session — the user is
	 * told as much in the success message — but settings.json is updated
	 * immediately so future sessions don't see the deleted entry.
	 */
	private async handleMcpServerDelete(message: WebviewMessage): Promise<void> {
		const name = typeof message.name === 'string' ? message.name : '';
		if (!name) {
			this.webview.postMessage({
				type: 'mcpServerSaveResult',
				ok: false,
				message: 'Server name is required.',
			});
			return;
		}
		const cfg = vscode.workspace.getConfiguration('sota');
		const result = await deleteMcpServer(name, cfg);
		this.webview.postMessage({
			type: 'mcpServerSaveResult',
			ok: result.ok,
			message: result.message,
			name,
		});
		if (result.ok) {
			await this.postMcpServersState();
		}
	}

	/**
	 * Translate the loosely-typed `server` payload from the webview into the
	 * shape our persistence module expects. Returns `undefined` only when the
	 * payload itself is missing — field-level validation still happens inside
	 * `saveMcpServer` so the user gets a meaningful error message rather than
	 * a silent rejection.
	 */
	private coerceServerFromWebview(payload: WebviewMessage['server']): PersistedMcpServerConfig | undefined {
		if (!payload || typeof payload !== 'object') {
			return undefined;
		}
		const name = typeof payload.name === 'string' ? payload.name : '';
		const command = typeof payload.command === 'string' ? payload.command : '';
		const args = Array.isArray(payload.args)
			? payload.args.filter((a): a is string => typeof a === 'string')
			: undefined;
		let env: Record<string, string> | undefined;
		if (payload.env && typeof payload.env === 'object' && !Array.isArray(payload.env)) {
			env = {};
			for (const [k, v] of Object.entries(payload.env as Record<string, unknown>)) {
				if (typeof v === 'string') {
					env[k] = v;
				}
			}
			if (Object.keys(env).length === 0) {
				env = undefined;
			}
		}
		const cwd = typeof payload.cwd === 'string' && payload.cwd.length > 0 ? payload.cwd : undefined;
		const result: PersistedMcpServerConfig = { name, command };
		const writable = result as { -readonly [K in keyof PersistedMcpServerConfig]: PersistedMcpServerConfig[K] };
		if (args && args.length > 0) {
			writable.args = args;
		}
		if (env) {
			writable.env = env;
		}
		if (cwd) {
			writable.cwd = cwd;
		}
		return result;
	}

	/**
	 * Open a side-by-side diff between the working tree (or a representative
	 * file) and the captured stash commit. We use git's own
	 * `git.openChange`/`git.diff` infrastructure where available so the
	 * diffs honour the user's configured diff tool and ignore-rules. When
	 * git isn't available we fall back to surfacing the SHA so the user can
	 * resolve manually.
	 */
	private async handleCheckpointCompare(checkpointId: string): Promise<void> {
		if (!this.checkpointManager) {
			return;
		}
		const checkpoint = this.checkpointManager.get(checkpointId);
		if (!checkpoint || !checkpoint.gitSha) {
			vscode.window.showWarningMessage('Checkpoint missing — unable to open diff.');
			return;
		}
		const folder = vscode.workspace.workspaceFolders?.[0];
		if (!folder) {
			vscode.window.showWarningMessage('No workspace folder open.');
			return;
		}
		// `git.api.toGitUri` produces a virtual URI that the git extension
		// resolves to the file content at a given ref. We can then diff
		// it against the live workspace file. Without the git extension
		// installed (rare but possible), surface the SHA so the user can
		// run `git diff <sha>` themselves.
		try {
			const gitExt = vscode.extensions.getExtension<{ getAPI: (v: number) => unknown }>('vscode.git');
			if (gitExt) {
				if (!gitExt.isActive) {
					await gitExt.activate();
				}
				type GitApi = { toGitUri?: (uri: vscode.Uri, ref: string) => vscode.Uri };
				const api = gitExt.exports.getAPI(1) as GitApi;
				if (api && typeof api.toGitUri === 'function') {
					// Diff the workspace ROOT against the checkpoint — VS
					// Code interprets a folder URI on the left of `vscode.diff`
					// as "compare every changed file", which lines up nicely
					// with the user's intent ("show me what changed since
					// the checkpoint").
					const checkpointUri = api.toGitUri(folder.uri, checkpoint.gitSha);
					await vscode.commands.executeCommand(
						'vscode.diff',
						checkpointUri,
						folder.uri,
						`Checkpoint ${checkpoint.gitSha.slice(0, 7)} ↔ Working tree`,
					);
					return;
				}
			}
		} catch (err) {
			console.warn(`[chat] checkpoint compare failed: ${err instanceof Error ? err.message : String(err)}`);
		}
		vscode.window.showInformationMessage(
			`Checkpoint ${checkpoint.gitSha.slice(0, 7)} captured ${new Date(checkpoint.capturedAt).toLocaleString()}. Run \`git diff ${checkpoint.gitSha}\` from the terminal to inspect changes.`,
		);
	}

	private async handleCheckpointRestore(checkpointId: string, conversationToo: boolean): Promise<void> {
		if (!this.checkpointManager) {
			return;
		}
		// Restore is destructive — abort any in-flight stream and outstanding
		// approval prompts before the workspace gets rewritten under the
		// model's feet. The CheckpointManager handles the modal warning
		// itself so we don't double-prompt the user here.
		this.cancelPendingApprovals('cancel');
		this.abortController?.abort();
		try {
			await this.checkpointManager.restore(checkpointId, { conversationToo });
		} catch (err) {
			// CheckpointManager already surfaces a message via
			// `showErrorMessage`; we just need to avoid letting the rejection
			// propagate up into the message handler's unhandled rejection
			// path.
			console.warn(`[chat] checkpoint restore failed: ${err instanceof Error ? err.message : String(err)}`);
			return;
		}
		if (conversationToo) {
			// Reload the conversation from the store so the webview drops the
			// trimmed messages from its scrollback.
			const record = this.conversationStore.load(this.currentConversationId);
			if (record) {
				this.conversation = [...record.messages];
				this.webview.postMessage({
					type: 'loadConversation',
					messages: this.conversation,
					lastSpecialist: this.currentSpecialistId,
					lastMode: this.currentMode,
				});
			}
		}
	}

	private async handleSendMessage(message: WebviewMessage): Promise<void> {
		// Allow attachment-only messages: when the user types nothing but has
		// attached context (e.g. just the current file), we still want to send.
		const hasAttachments = Array.isArray(message.attachments) && message.attachments.length > 0;
		const hasMentions = Array.isArray(message.mentions) && message.mentions.length > 0;
		// Image attachments are validated separately so a malformed entry doesn't
		// silently get embedded in the prompt; sanitisation lives below.
		const incomingImages: ImageAttachmentPayload[] = Array.isArray(message.images)
			? message.images.filter((img): img is ImageAttachmentPayload =>
				Boolean(img) && typeof img === 'object'
				&& typeof img.mime === 'string' && img.mime.startsWith('image/')
				&& typeof img.base64 === 'string' && img.base64.length > 0)
			: [];
		const hasImages = incomingImages.length > 0;
		if (!message.text && !hasAttachments && !hasMentions && !hasImages) {
			return;
		}

		// Phase 86 — session-cap pre-flight. Refuse to dispatch when the
		// running session total has already met / exceeded the configured
		// USD cap. The webview shows a modal so the user can either bump the
		// cap or start a new conversation. `/continue` from the user's next
		// message will retry once the cap is increased.
		if (this.spendGuard) {
			const sessionCheck = this.spendGuard.checkSessionCap();
			if (sessionCheck.blocked) {
				this.webview.postMessage({
					type: 'spendCapBlocked',
					scope: 'session',
					currentUsd: sessionCheck.currentUsd,
					capUsd: sessionCheck.capUsd,
				});
				return;
			}
		}

		const model: ModelId = message.model ?? this.currentModel;
		this.currentModel = model;
		// Resolve the specialist for this turn, falling back to the orchestrator
		// if the webview sent an unknown id (e.g. specialist was removed).
		const requestedSpecialistId = message.specialistId ?? this.currentSpecialistId;
		const specialistId = getSpecialist(requestedSpecialistId) ? requestedSpecialistId : 'anton';
		this.currentSpecialistId = specialistId;
		// Mode arrives on every send so a chip toggle that hasn't yet been
		// echoed back stays authoritative for the turn the user is firing.
		// Falls back to the session's persisted mode (default 'act').
		const mode: ChatMode = message.chatMode === 'plan' ? 'plan' : message.chatMode === 'act' ? 'act' : this.currentMode;
		this.currentMode = mode;

		// Slash-command interception: when the user's message starts with `/`,
		// parse it locally first. Recognised commands are handled in-process
		// (no LLM call); unrecognised slashy text falls through so users can
		// still ask questions like "/loop never resolves on this branch".
		// `/approve` is a special case — it's handled but ALSO needs to fire
		// an orchestrator turn (with `command='approve'`) so the active plan
		// actually executes.
		const rawText = message.text ?? '';
		let approveOverride = false;
		let rejectOverride = false;
		if (rawText.trimStart().startsWith('/')) {
			const result = await parseAndDispatch(rawText, this.buildSlashCommandContext());
			if (result.handled) {
				if (result.output) {
					this.postSystemMessage(result.output);
				}
				if (result.action === 'approve') {
					approveOverride = true;
				} else if (result.action === 'reject') {
					rejectOverride = true;
				} else {
					return;
				}
			}
			// Unknown command — fall through to normal dispatch.
		}

		// H17 — `pre-prompt` lifecycle hook. Fires AFTER slash-command
		// interception so handled commands don't pay the script latency,
		// and BEFORE the user message is persisted / sent to the LLM so a
		// denying hook can fully veto the turn without polluting the
		// transcript. `/approve` and `/reject` overrides bypass entirely:
		// they aren't user prompts in the LLM sense, they're control signals
		// addressed to the orchestrator's queued plan. A non-empty
		// `replacement` rewrites the prompt that's sent to the model; the
		// user still sees their typed text in their own bubble, which
		// mirrors the CLI's behaviour. Errors are swallowed so a flaky
		// script can never break a chat turn.
		let promptForLlm = rawText;
		if (this.hookRunner && !approveOverride && !rejectOverride) {
			try {
				const fired = await this.hookRunner.fire('pre-prompt', {
					conversationId: this.currentConversationId,
					prompt: rawText,
					specialistId,
					model,
					mode,
				});
				if (!fired.allowed) {
					this.postSystemMessage('pre-prompt hook denied this prompt.');
					return;
				}
				if (fired.replacement && fired.replacement.length > 0) {
					promptForLlm = fired.replacement;
				}
			} catch {
				// Swallow — hooks must never break a session.
			}
		}

		const baseSystemPrompt = buildSystemPrompt(specialistId);

		// Workspace context is collected lazily per-turn so the markdown
		// reflects the user's CURRENT editor/selection at send time. Slash
		// commands short-circuit before this point, so they never pay this
		// cost. The cost itself is dominated by a single README read; the
		// rest is in-memory state.
		const workspaceCtx = this.workspaceContext
			? await this.workspaceContext.collect()
			: { markdown: '', estimatedTokens: 0 };
		const systemPrompt = workspaceCtx.markdown
			? `${baseSystemPrompt}\n\n---\n\n${workspaceCtx.markdown}`
			: baseSystemPrompt;

		// The LLM receives the full prompt — typed text plus any resolved
		// attachment bodies. The persisted scrollback only keeps a short
		// summary so reloading a session doesn't repeatedly pay for stale
		// attachment payloads. `promptForLlm` is the post-`pre-prompt`-hook
		// text (rewritten by a replacing hook, or the raw text otherwise);
		// `message.text` is intentionally left untouched so the user's
		// own bubble keeps their typed text as the visible summary.
		const fullPrompt = await this.buildUserPrompt(promptForLlm, message.attachments, message.mentions, message.mentionsKinded);
		const visibleSummaryText = (message.text && message.text.trim())
			? message.text
			: hasImages
				? '_(image attachment)_'
				: `_Attached: ${message.attachments?.join(', ') ?? 'context'}_`;

		// Persistence shape: when the turn carries images, store structured
		// content so reloading shows the thumbnails alongside the text.
		// Plain-text turns keep the legacy `string` shape so the on-disk
		// format only widens when there's actually something multimodal to
		// preserve.
		const persistedContent: ChatMessageContent = hasImages
			? [
				...incomingImages.map(img => ({
					type: 'image' as const,
					mimeType: img.mime,
					base64Data: img.base64,
					name: typeof img.name === 'string' ? img.name : undefined,
				})),
				{ type: 'text' as const, text: visibleSummaryText },
			]
			: visibleSummaryText;

		const userMessage: ChatMessage = {
			role: 'user',
			content: persistedContent,
			model,
			timestamp: Date.now(),
		};

		// Capture a workspace checkpoint just BEFORE we append the user
		// message — `turnIndex` records the position the user message will
		// occupy, which is also the slice point used by the
		// "Restore workspace + conversation" path. Capture is best-effort:
		// failures must never block the chat send loop, so we swallow errors
		// here and continue. The git stash isn't atomic with the LLM request
		// (file changes between stash and the model's first tool call could
		// be missed), but the window is sub-second on a typical machine and
		// chat turns rarely race against external file edits.
		if (this.checkpointManager) {
			try {
				const trigger = (typeof message.text === 'string' && message.text.trim().length > 0)
					? message.text
					: visibleSummaryText;
				const checkpoint = await this.checkpointManager.capture(
					this.currentConversationId,
					this.conversation.length,
					trigger,
				);
				if (checkpoint) {
					this.webview.postMessage({
						type: 'checkpointCaptured',
						checkpointId: checkpoint.id,
						turnIndex: checkpoint.turnIndex,
						capturedAt: checkpoint.capturedAt,
						summary: checkpoint.summary,
						userMessage: checkpoint.userMessage,
					});
				}
			} catch (err) {
				console.warn(`[chat] checkpoint capture failed: ${err instanceof Error ? err.message : String(err)}`);
			}
		}

		this.conversation.push(userMessage);
		this.saveConversation();

		this.abortController = new AbortController();

		// Phase 86 — snapshot the session total at the start of this turn so
		// `SpendGuard.checkTaskCap()` can compute the per-turn delta as the
		// model fans out tool calls / sub-agents. Idempotent across retries.
		if (this.spendGuard) {
			this.spendGuard.beginTask();
		}

		// Notify the webview that a request is in flight so the cost meter
		// can render its pulsing dot. Paired with `requestEnded` below.
		// `specialistId` + `userMessage` feed the pinned active-task header so
		// the user can keep their place in long streams (Phase 66).
		this.webview.postMessage({
			type: 'requestStarted',
			specialistId,
			userMessage: visibleSummaryText,
		});

		// Phase 68 — snapshot cumulative usage + start time so we can derive a
		// per-message delta when the stream completes. The assistant message
		// will be pushed at the current `this.conversation.length` (one past
		// the user message just appended above), which is also the conversation
		// index the webview's wrapper holds for this turn.
		const assistantConversationIndex = this.conversation.length;
		const usageSnapshot = this.llmClient.getTokenUsage();
		this.lastInputTokens = usageSnapshot.input;
		this.lastOutputTokens = usageSnapshot.output;
		this.lastCachedTokens = usageSnapshot.cached;
		this.lastEstimatedCost = this.llmClient.estimateCost(model);
		this.streamStartedAt = Date.now();

		// Plan mode is orchestrator-only — specialists always execute their
		// remit. Surface a one-time hint so the user understands why the chip
		// is decorative on non-`anton` turns; we still dispatch normally.
		if (mode === 'plan' && specialistId !== 'anton') {
			this.postSystemMessage('_Plan mode applies when chatting with @anton. This specialist will execute as usual._');
		}

		// Agent stack route: if the active specialist maps to a registered agent,
		// drive the agent backend instead of the direct-LLM path. The legacy path
		// remains as a fallback for specialists that aren't in the agent stack
		// yet (e.g. anton-spec) and for sessions where no bridge was supplied.
		if (this.agentBridge && this.agentBridge.hasAgent(specialistId)) {
			// Workspace context is now injected as a system-prompt section by
			// `BaseAgent.buildSystemPrompt` via `request.workspaceContextSnapshot`,
			// so the user's typed text stays clean — no prepending.
			let bridgeAssistantText = '';
			try {
				bridgeAssistantText = await this.runViaAgentBridge(specialistId, fullPrompt, model, mode, assistantConversationIndex, workspaceCtx.markdown, approveOverride, rejectOverride);
			} finally {
				this.webview.postMessage({ type: 'requestEnded' });
			}
			this.turnsRun += 1;
			this.firePostResponseHook(rawText, bridgeAssistantText, specialistId, model, mode);
			return;
		}

		// Tool-call orchestration: loop until the model stops asking for tools or
		// we hit the cap. The tools-module ToolDefinition shape is structurally
		// compatible with LlmClient's local ToolDefinition (the latter is a
		// looser superset), so a runtime-safe cast is used at the boundary.
		const tools = this.toolRegistry.definitions() as unknown as ReadonlyArray<LlmToolDefinition>;
		// Single execution context per send — tool calls reuse the same handles.
		// H14 — when a HookRunner is supplied (workspace trusted +
		// `.son-of-anton/hooks.json` exists) the context is wrapped so
		// `pre-write-file` / `pre-shell-command` / `post-tool-call` scripts
		// fire on the same primitives the agent stack uses. Without a runner
		// this collapses back to the bare workspace context.
		const ctx = createInstrumentedWorkspaceToolContext(this.hookRunner);
		const MAX_TOOL_TURNS = 5;

		// Build the initial LLM message list. The latest user turn carries the
		// full prompt (including attachment bodies) so the model sees the actual
		// content rather than just the label kept in the persisted scrollback.
		// `system`-role entries are local UI artefacts (slash-command output)
		// and must NOT be sent to the LLM, so we filter them out here.
		const lastUserIndex = this.conversation.length - 1;
		let llmMessages: LlmMessage[] = this.conversation.flatMap((m, i) => {
			if (m.role !== 'user' && m.role !== 'assistant') {
				return [];
			}
			// On the latest user turn we substitute the assembled `fullPrompt`
			// (typed text + resolved attachment bodies + mentions) so the model
			// sees the rich context. When images are attached we ALSO promote
			// to a structured content array so the wire-level serialisers
			// (Anthropic blocks, OpenAI parts, Gemini inline_data) can include
			// the binary data. Older turns are passed through verbatim — for
			// new sessions that's strings; for sessions reloaded with
			// structured content the array shape survives unchanged.
			if (i === lastUserIndex && m.role === 'user') {
				if (hasImages) {
					const parts: LlmContentPart[] = [
						...incomingImages.map(img => ({
							type: 'image' as const,
							mimeType: img.mime,
							base64Data: img.base64,
						})),
						{ type: 'text' as const, text: fullPrompt },
					];
					return [{ role: 'user' as const, content: parts }];
				}
				return [{ role: 'user' as const, content: fullPrompt }];
			}
			return [{
				role: m.role,
				content: this.toLlmContent(m.content),
			}];
		});

		// Anthropic's content-block tool_result form is the canonical way to
		// round-trip results, but our LlmMessage.content is plain text. Rather
		// than refactor the whole message shape, we serialise tool results into
		// a single synthetic user message. The model loses the structured
		// tool_use_id correlation but still receives the data — a pragmatic
		// shortcut for non-content-block-aware clients. Tracked for future
		// upgrade once LlmMessage gains content-block support.
		// `assistantBuffer` is what we feed BACK to the model as the assistant's
		// last turn (per-loop reset). `fullAssistantText` is what we persist —
		// the user-visible accumulation across all loop turns, including
		// structured tool-call summaries so reloading shows what happened.
		let assistantBuffer = '';
		let fullAssistantText = '';
		let aborted = false;
		let turn = 0;

		try {
			while (turn < MAX_TOOL_TURNS) {
				turn++;
				const pendingToolCalls: Array<{ id: string; name: string; input: Record<string, unknown> }> = [];
				let stopReason: string | undefined;

				try {
					for await (const event of this.llmClient.streamRequest({
						model,
						messages: llmMessages,
						systemPrompt,
						signal: this.abortController.signal,
						tools,
						agentHandle: 'chat',
					})) {
						if (event.type === 'token') {
							assistantBuffer += event.token;
							fullAssistantText += event.token;
							this.webview.postMessage({ type: 'streamToken', token: event.token });
						} else if (event.type === 'tool-call') {
							pendingToolCalls.push({ id: event.id, name: event.name, input: event.input });
							// Render a structured tool-call card in the webview
							// instead of the previous italic markdown marker. The
							// host doesn't append anything to the visible token
							// stream — the card lives outside the markdown body.
							// Generative-UI tool (`emit_ui_block`) is the lone
							// exception: its result is the block itself, so we
							// suppress the generic running card to avoid a
							// throwaway "tool" placeholder flickering above the
							// rendered block. The block postMessage in the
							// execute branch below handles all visible UI.
							if (event.name !== 'emit_ui_block') {
								this.webview.postMessage({
									type: 'toolCall',
									id: event.id,
									name: event.name,
									status: 'running',
									input: event.input,
								});
							}
						} else if (event.type === 'complete') {
							stopReason = event.stopReason;
							const willLoop = stopReason === 'tool_use' && pendingToolCalls.length > 0 && turn < MAX_TOOL_TURNS;
							// Only emit messageComplete on the FINAL turn so the
							// webview doesn't flip out of streaming state mid-loop.
							if (!willLoop) {
								const usage = this.llmClient.getTokenUsage();
								const cost = this.llmClient.estimateCost();
								this.webview.postMessage({
									type: 'messageComplete',
									inputTokens: event.inputTokens,
									outputTokens: event.outputTokens,
									totalTokens: usage.input + usage.output,
									estimatedCost: cost.toFixed(4),
								});
								// Phase 68 — per-message metrics popover. Tool-loop
								// turns accumulate into the same assistant wrapper
								// so we deliberately publish ONLY on the final
								// turn; the delta below covers all input/output
								// across sub-turns of this send.
								const turnInputDelta = Math.max(0, usage.input - this.lastInputTokens);
								const turnOutputDelta = Math.max(0, usage.output - this.lastOutputTokens);
								const turnCachedDelta = Math.max(0, usage.cached - this.lastCachedTokens);
								const turnCostDelta = Math.max(0, this.llmClient.estimateCost(model) - this.lastEstimatedCost);
								this.webview.postMessage({
									type: 'messageMetrics',
									conversationIndex: assistantConversationIndex,
									model,
									latencyMs: Date.now() - this.streamStartedAt,
									inputTokens: turnInputDelta,
									outputTokens: turnOutputDelta,
									cachedTokens: turnCachedDelta,
									cost: turnCostDelta,
								});
								// H11 — fold the same per-turn deltas into the
								// session-wide cumulative meter so the chat
								// status bar ticks up across multiple turns.
								this.recordSessionTurn(turnInputDelta + turnOutputDelta, turnCostDelta);
							}
						} else if (event.type === 'error') {
							this.webview.postMessage({ type: 'streamError', error: event.error });
							stopReason = 'error';
						}
					}
				} catch (err) {
					// Treat AbortError-shaped exceptions as a clean cancel; bail
					// out of the loop without surfacing a misleading error to UI.
					const isAbort = this.abortController?.signal.aborted
						|| (err instanceof Error && (err.name === 'AbortError' || /aborted/i.test(err.message)));
					if (isAbort) {
						aborted = true;
						break;
					}
					throw err;
				}

				if (aborted) {
					break;
				}

				if (stopReason !== 'tool_use' || pendingToolCalls.length === 0) {
					break; // model is done
				}

				if (turn >= MAX_TOOL_TURNS) {
					this.webview.postMessage({
						type: 'streamError',
						error: `Tool call loop exceeded ${MAX_TOOL_TURNS} turns. Aborting.`,
					});
					break;
				}

				// Phase 86 — task spend-cap check between tool turns. If the
				// per-task USD cap has been breached by the LLM streaming
				// burst we just finished, abort BEFORE we run the next batch
				// of tool calls (which would only push the bill higher). The
				// webview gets a structured error so the user sees a clear
				// "Aborting" notice rather than the generic streamError.
				if (this.spendGuard && this.spendGuard.checkTaskCap()) {
					const limits = readSpendLimits();
					this.webview.postMessage({
						type: 'spendCapBlocked',
						scope: 'task',
						currentUsd: this.spendGuard.getTaskCost(),
						capUsd: limits.taskCapUsd,
					});
					this.abortController?.abort();
					aborted = true;
					break;
				}

				// Execute pending tool calls and assemble a synthetic user
				// follow-up. The execution context is shared across calls in the
				// same send (per Phase 19 spec) so we don't pay per-call setup.
				const resultLines: string[] = ['[Tool results]'];
				for (const call of pendingToolCalls) {
					// Phase 41: gate tools whose definition declares
					// `riskLevel: 'requiresApproval'` (write_file, run_command)
					// behind an inline approval card unless the user has opted
					// into the auto-approve setting. Safe tools (read_file,
					// list_directory, search_workspace) bypass entirely.
					const tool = this.toolRegistry.get(call.name);
					const category: ToolCategory | undefined = tool?.definition.category;
					const autoApprove = this.isAutoApproveEnabled(category, call.name, call.input);
					// Phase 86 — every tool that declares a `category` flows
					// through the per-category auto-approve gate. The legacy
					// `riskLevel: 'requiresApproval'` flag remains a backstop
					// for tools without a category (so removing the category
					// can't accidentally weaken gating). When `autoApprove`
					// returns false, we route through the approval card path
					// so the user can confirm or reject.
					const declaredRisk = tool?.definition.riskLevel === 'requiresApproval';
					const categoryGated = typeof category === 'string' && !autoApprove;
					const requiresApproval = declaredRisk || categoryGated;
					let result: ToolExecutionResult;
					let approvalDecision: ApprovalDecision | undefined;

					if (requiresApproval) {
						const approvalId = `approval-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
						const payload = this.buildApprovalPayload(call.name, call.input);
						this.webview.postMessage({
							type: 'approvalRequest',
							id: approvalId,
							toolName: call.name,
							toolCallId: call.id,
							input: call.input,
							payload,
							autoApproved: autoApprove,
						});

						if (autoApprove) {
							approvalDecision = { action: 'approve', reason: 'auto-approved' };
						} else {
							approvalDecision = await this.waitForApproval(approvalId, this.abortController?.signal);
						}

						if (approvalDecision.action === 'approve') {
							result = await this.toolRegistry.execute(call.name, call.input, ctx);
						} else if (approvalDecision.action === 'reject') {
							const reason = approvalDecision.reason && approvalDecision.reason.length > 0
								? `: ${approvalDecision.reason}`
								: '.';
							result = { content: `Tool call rejected by user${reason}`, isError: true };
						} else {
							// 'cancel' — chat-level abort. Surface a clean
							// rejection result so the loop terminates without
							// continuing to call more tools.
							result = { content: 'Tool call cancelled.', isError: true };
						}

						// Echo the final state back so the card flips from its
						// pending appearance into approved/rejected/cancelled.
						this.webview.postMessage({
							type: 'approvalResolved',
							id: approvalId,
							toolCallId: call.id,
							action: approvalDecision.action,
							reason: approvalDecision.reason,
						});
					} else {
						result = await this.toolRegistry.execute(call.name, call.input, ctx);
					}

					const inputJson = JSON.stringify(call.input);
					const status = result.isError ? 'error' : 'ok';
					// Inline tool-result review: if the user edited this tool's
					// output via the webview's inline edit form before the next
					// LLM turn read it, substitute the edited content. The map
					// is consumed once per call.id; the edited string takes the
					// place of `result.content` in BOTH the next-turn synthetic
					// follow-up message AND the persisted sentinel below so the
					// model reads (and reloads see) the user-curated version.
					const finalContent = this.editedToolResults.get(call.id) ?? result.content;
					const userEdited = this.editedToolResults.has(call.id);
					resultLines.push(`${call.name}(${inputJson}) → ${status}`);
					resultLines.push('```');
					resultLines.push(finalContent);
					resultLines.push('```');

					// Phase 63 — for `write_file` (and any future write-shaped
					// tools that attach `metadata.kind === 'write'`), stash
					// the captured pre-image so the webview's "View diff"
					// button has something to address. The id is opaque — it
					// only matters that the same id round-trips back to the
					// host on click. Snapshots evict on reload by design;
					// the diff button falls back to `git:HEAD` when no id is
					// available.
					let snapshotId: string | undefined;
					if (
						this.writeSnapshotStore
						&& result.metadata
						&& result.metadata.kind === 'write'
						&& typeof result.metadata.preImage === 'string'
					) {
						snapshotId = this.writeSnapshotStore.capture(result.metadata.preImage);
					}

					// Generative-UI tool: bypass the generic tool-result card.
					// The result's `metadata.kind === 'ui-block'` payload is
					// posted as a dedicated `uiBlock` message that the webview
					// renderer registry consumes to mount an interactive block
					// inline in the assistant message. We dedup by `blockId`
					// host-side so a misbehaving model that re-emits the same
					// id is silently ignored (logged below) instead of
					// stomping the user's already-rendered (possibly
					// responded-to) block.
					const isUiBlock = result.metadata
						&& result.metadata.kind === 'ui-block'
						&& !result.isError;
					if (isUiBlock) {
						const meta = result.metadata as { kind: 'ui-block'; component: string; props: Record<string, unknown>; blockId: string };
						if (this.emittedUiBlockIds.has(meta.blockId)) {
							console.warn(`[chat] emit_ui_block: duplicate blockId ${meta.blockId} ignored`);
						} else {
							this.emittedUiBlockIds.add(meta.blockId);
							this.webview.postMessage({
								type: 'uiBlock',
								blockId: meta.blockId,
								component: meta.component,
								props: meta.props,
							});
						}
					} else {
						// Update the existing card by id with the final state so
						// the webview can flip the spinner glyph and reveal the
						// collapsible output. The webview is defensive about
						// missing prior cards (e.g. session reload mid-run).
						// `metadata` (when present) drives richer render branches —
						// e.g. shell metadata renders a terminal-style block.
						this.webview.postMessage({
							type: 'toolCall',
							id: call.id,
							name: call.name,
							status: result.isError ? 'error' : 'ok',
							input: call.input,
							output: result.content,
							metadata: result.metadata,
							snapshotId,
						});
					}

					if (isUiBlock) {
						// Generative-UI: persist the rendered block as its own
						// sentinel so reloading the session re-mounts the block
						// (in its initial, un-responded state — input freezing
						// is a live-only signal). The text `<<<sota:tool>>>`
						// sentinel is intentionally skipped to avoid showing a
						// duplicate "tool ran" card next to the block. The
						// model's transcript still receives the
						// `result.content` summary via the synthetic follow-up
						// below.
						const meta = result.metadata as { kind: 'ui-block'; component: string; props: Record<string, unknown>; blockId: string };
						const uiPayload = { component: meta.component, props: meta.props, blockId: meta.blockId };
						const uiEncoded = Buffer.from(JSON.stringify(uiPayload), 'utf-8').toString('base64');
						fullAssistantText += `\n\n<<<sota:uiblock data="${uiEncoded}">>>\n\n`;
					} else {
						// Persist a base64-encoded payload inside a unique sentinel so
						// reloading shows what tools were called and what they returned.
						// The sentinel survives any tool-output content (including
						// triple backticks or HTML comments that would break a fence).
						// When the user edited the result inline before the next turn
						// read it, prepend a `__EDITED__\n` marker line so the reload
						// path can re-add the "Edited" pill. The marker is stripped
						// during decode before parsing the header/body.
						const headerLine = `${call.name}(${inputJson}) → ${status}`;
						const bodyText = `${headerLine}\n${finalContent}`;
						const prefixedBody = userEdited ? `__EDITED__\n${bodyText}` : bodyText;
						const encoded = Buffer.from(prefixedBody, 'utf-8').toString('base64');
						fullAssistantText += `\n\n<<<sota:tool data="${encoded}">>>\n\n`;
					}
					// Drop the override now that it's been baked into the
					// transcript — keeps the map small and prevents stale edits
					// from leaking into a hypothetical retry of the same call.
					if (userEdited) {
						this.editedToolResults.delete(call.id);
					}

					// Persist a parallel sentinel for structured tool metadata
					// (currently only the shell kind — the `write` kind is
					// captured in memory via `WriteSnapshotStore` and deliberately
					// NOT persisted: the pre-image content can be very large and
					// the diff button reverts to a `git:HEAD` comparison on reload).
					// On reload, the terminal sentinel UPGRADES the
					// immediately-preceding `<<<sota:tool>>>` card by injecting a
					// terminal-style block in place of the generic output `<pre>`.
					// Live streams render the same upgrade from the postMessage
					// `metadata` field. Skipped for tools that didn't attach
					// metadata so the older session shape is preserved.
					if (result.metadata && result.metadata.kind === 'shell') {
						const metaPayload = { toolCallId: call.id, ...result.metadata };
						const metaEncoded = Buffer.from(JSON.stringify(metaPayload), 'utf-8').toString('base64');
						fullAssistantText += `<<<sota:terminal data="${metaEncoded}">>>\n\n`;
					}

					// Persist a parallel approval sentinel so reloads show the
					// outcome card alongside the tool card. Encoded the same
					// way as `<<<sota:tool>>>` for symmetry. Skipped for safe
					// tools — there's nothing to approve in that case.
					if (requiresApproval && approvalDecision) {
						const approvalRecord = {
							toolName: call.name,
							input: call.input,
							decision: approvalDecision.action,
							reason: approvalDecision.reason,
							autoApproved: autoApprove,
							payload: this.buildApprovalPayload(call.name, call.input),
						};
						const approvalEncoded = Buffer.from(JSON.stringify(approvalRecord), 'utf-8').toString('base64');
						fullAssistantText += `<<<sota:approval data="${approvalEncoded}">>>\n\n`;
					}

					// If the user cancelled mid-loop, bail out instead of
					// pressing on to the next pending tool call. The synthetic
					// follow-up will still be sent so the model sees the
					// cancellation in its tool-result transcript on retry.
					if (approvalDecision && approvalDecision.action === 'cancel') {
						aborted = true;
						break;
					}
				}

				// Cancellation mid-tool-loop (cancelRequest while waiting for
				// approval, or AbortSignal-driven cancel) breaks the for-loop
				// above with `aborted=true`. Bail out of the outer while so we
				// don't push another LLM round-trip.
				if (aborted) {
					break;
				}

				const followUp = resultLines.join('\n');

				// Append the assistant turn so far and a synthetic user message
				// carrying the tool results. Don't push these into
				// `this.conversation` — they're transient inputs for the model,
				// not user-typed messages worth persisting.
				llmMessages = [
					...llmMessages,
					{ role: 'assistant', content: assistantBuffer },
					{ role: 'user', content: followUp },
				];
				assistantBuffer = '';
			}
		} finally {
			this.abortController = undefined;
			// Always pair with `requestStarted` so the webview's pulse animation
			// stops on success, error, AND user-cancellation paths.
			this.webview.postMessage({ type: 'requestEnded' });
		}

		// Persist the visible assistant output (concatenation of token streams
		// AND structured tool-call summaries) so reloading the session shows a
		// readable trace of what happened — instead of the old `<see chat
		// history>` placeholder.
		if (fullAssistantText) {
			this.conversation.push({
				role: 'assistant',
				content: fullAssistantText,
				model,
				timestamp: Date.now(),
			});
			this.saveConversation();
		}

		// H17 — `post-response` lifecycle hook. Fires once per completed turn,
		// AFTER `messageComplete` and the assistant persistence above, so a
		// hook script sees the final state of the transcript. The original
		// (pre-`pre-prompt`-rewrite) `rawText` is forwarded so hooks see what
		// the user actually typed, matching the CLI's `useAgentStream` shape.
		this.turnsRun += 1;
		this.firePostResponseHook(rawText, fullAssistantText, specialistId, model, mode);
	}

	/**
	 * H17 — fire the `post-response` lifecycle hook for the just-settled turn.
	 *
	 * Shared between the direct-LLM and agent-bridge dispatch paths so the
	 * payload shape stays identical regardless of which orchestrator handled
	 * the turn. Token / cost figures are read off the `LlmClient`'s cumulative
	 * counters and subtracted against the per-turn snapshot taken at request
	 * start (the same primitives the Phase 68 message-metrics popover uses);
	 * negative deltas — possible if the counter resets mid-turn — are clamped
	 * to zero. The call is fire-and-forget with a `.catch()` swallow: a hook
	 * failure must never break a chat turn.
	 */
	private firePostResponseHook(prompt: string, assistantText: string, specialistId: string, model: ModelId, mode: ChatMode): void {
		if (!this.hookRunner) {
			return;
		}
		const usage = this.llmClient.getTokenUsage();
		const inputTokens = Math.max(0, usage.input - this.lastInputTokens);
		const outputTokens = Math.max(0, usage.output - this.lastOutputTokens);
		const cachedTokens = Math.max(0, usage.cached - this.lastCachedTokens);
		const costUsd = Math.max(0, this.llmClient.estimateCost(model) - this.lastEstimatedCost);
		void this.hookRunner
			.fire('post-response', {
				conversationId: this.currentConversationId,
				prompt,
				assistantText,
				specialistId,
				model,
				mode,
				usage: { inputTokens, outputTokens, cachedTokens, costUsd },
			})
			.catch(() => { /* swallow — hooks must never break a turn */ });
	}

	/**
	 * Drive the active specialist (or orchestrator) through the agent stack.
	 * Translates AgentEvents into webview messages, persists the assembled
	 * assistant text, and fans cancellation/abort through to the bridge.
	 *
	 * Returns the visible assistant text that was persisted (or the empty
	 * string when nothing was assembled — e.g. error or early cancel). The
	 * caller uses this to populate the `post-response` lifecycle-hook payload
	 * so a single helper in `handleSendMessage` covers both dispatch paths.
	 */
	private async runViaAgentBridge(specialistId: string, fullPrompt: string, model: ModelId, mode: ChatMode, assistantConversationIndex: number, workspaceContextSnapshot?: string, approveOverride: boolean = false, rejectOverride: boolean = false): Promise<string> {
		if (!this.agentBridge) {
			return '';
		}
		const cancellationSource = new vscode.CancellationTokenSource();
		// Bridge AbortController -> CancellationToken so the existing Cancel
		// button (which aborts the controller) still cancels in-flight LLM work.
		this.abortController?.signal.addEventListener('abort', () => {
			cancellationSource.cancel();
		});

		let assembled = '';
		let finalText: string | undefined;
		let errorText: string | undefined;
		let spendCapAborted = false;
		const emit = (event: AgentEvent): void => {
			this.handleAgentEvent(event);
			if (event.type === 'token') {
				assembled += event.token;
			} else if (event.type === 'subtask-token') {
				assembled += event.token;
			} else if (event.type === 'final') {
				finalText = event.text;
			} else if (event.type === 'error') {
				errorText = event.message;
			}
			// Phase 86 — task spend-cap check. Trigger once per turn from
			// inside the bridge emit so a runaway sub-agent fan-out aborts
			// mid-stream instead of running to completion. We only trip
			// after the first agent event so the very first invocation
			// (which may carry no cost yet) doesn't no-op the loop.
			if (
				!spendCapAborted
				&& this.spendGuard
				&& this.spendGuard.checkTaskCap()
			) {
				spendCapAborted = true;
				const limits = readSpendLimits();
				this.webview.postMessage({
					type: 'spendCapBlocked',
					scope: 'task',
					currentUsd: this.spendGuard.getTaskCost(),
					capUsd: limits.taskCapUsd,
				});
				cancellationSource.cancel();
				this.abortController?.abort();
			}
		};

		try {
			// `/approve` and `/reject` always route through the orchestrator
			// regardless of the active specialist chip — only the orchestrator
			// owns the active plan, and the `command='approve' | 'reject'`
			// branches skip the orchestrator's message-as-prompt handling and
			// act on the queued plan directly.
			if (specialistId === 'anton' || approveOverride || rejectOverride) {
				// Forward the composer's model pick onto the orchestrator so the
				// orchestrator's planning LLM call routes through the user's
				// chosen provider. Without this the orchestrator silently
				// hardcoded Opus and tried Anthropic regardless of the picker.
				await this.agentBridge.runOrchestrator(fullPrompt, emit, cancellationSource.token, {
					mode,
					conversationId: this.currentConversationId,
					model,
					workspaceContextSnapshot,
					command: approveOverride ? 'approve' : rejectOverride ? 'reject' : undefined,
				});
			} else {
				// Mode is orchestrator-specific — specialists always execute.
				// We still surface a system-style hint upstream of the call so
				// users notice the chip is non-functional for non-orchestrator
				// turns; see handleSendMessage's pre-dispatch hint.
				await this.agentBridge.runSpecialist(specialistId as AgentHandle, fullPrompt, emit, cancellationSource.token, model, workspaceContextSnapshot, this.currentConversationId);
			}
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			this.webview.postMessage({ type: 'streamError', error: message });
		} finally {
			cancellationSource.dispose();
			this.abortController = undefined;
		}

		if (errorText) {
			this.webview.postMessage({ type: 'streamError', error: errorText });
			return '';
		}

		// Token usage telemetry is currently captured per-LLM-call inside the
		// agent stack; we publish the cumulative LlmClient counters here so the
		// status bar at the bottom of the chat reflects the full session.
		const usage = this.llmClient.getTokenUsage();
		const cost = this.llmClient.estimateCost();
		this.webview.postMessage({
			type: 'messageComplete',
			inputTokens: usage.input,
			outputTokens: usage.output,
			totalTokens: usage.input + usage.output,
			estimatedCost: cost.toFixed(4),
		});
		// Phase 68 — per-message metrics popover. The agent stack drives
		// many sub-LLM calls under the hood; the delta below sums all of
		// them since this send started, attributed to the user-visible
		// assistant turn it produced.
		const turnInputDelta = Math.max(0, usage.input - this.lastInputTokens);
		const turnOutputDelta = Math.max(0, usage.output - this.lastOutputTokens);
		const turnCachedDelta = Math.max(0, usage.cached - this.lastCachedTokens);
		const turnCostDelta = Math.max(0, this.llmClient.estimateCost(model) - this.lastEstimatedCost);
		this.webview.postMessage({
			type: 'messageMetrics',
			conversationIndex: assistantConversationIndex,
			model,
			latencyMs: Date.now() - this.streamStartedAt,
			inputTokens: turnInputDelta,
			outputTokens: turnOutputDelta,
			cachedTokens: turnCachedDelta,
			cost: turnCostDelta,
		});
		// H11 — fold the same per-turn deltas into the session-wide
		// cumulative meter so the chat status bar ticks up across
		// multiple turns even when no `CostReporter` is wired in.
		this.recordSessionTurn(turnInputDelta + turnOutputDelta, turnCostDelta);

		const persisted = (finalText && finalText.length > 0) ? finalText : assembled;
		if (persisted) {
			this.conversation.push({
				role: 'assistant',
				content: persisted,
				model,
				timestamp: Date.now(),
			});
			this.saveConversation();
		}
		return persisted;
	}

	/**
	 * Translate an AgentEvent into the webview-side messages the chat UI
	 * already understands (for `token`) plus new structured cards for the
	 * orchestrator's plan/subtask events.
	 */
	private handleAgentEvent(event: AgentEvent): void {
		switch (event.type) {
			case 'token':
				this.webview.postMessage({ type: 'streamToken', token: event.token });
				break;
			case 'plan-proposed':
				this.webview.postMessage({ type: 'agentPlan', plan: serialisePlan(event.plan) });
				break;
			case 'subtask-started':
				this.webview.postMessage({
					type: 'subtaskStart',
					subtaskId: event.subtaskId,
					assignee: event.assignee,
					instruction: event.instruction,
				});
				if (event.assignee === 'anton-security') {
					// Phase 80 — drive the webview-side header pulse so the user
					// sees that Anton Security is actively working. Stops on the
					// matching `subtask-completed` / `subtask-failed` below.
					this.webview.postMessage({ type: 'securityPulseStart' });
				}
				break;
			case 'subtask-token':
				this.webview.postMessage({
					type: 'subtaskToken',
					subtaskId: event.subtaskId,
					token: event.token,
				});
				break;
			case 'subtask-completed':
				this.webview.postMessage({
					type: 'subtaskComplete',
					subtaskId: event.subtaskId,
					assignee: event.assignee,
					summary: event.summary,
				});
				if (event.assignee === 'anton-security') {
					this.webview.postMessage({ type: 'securityPulseStop' });
				}
				break;
			case 'subtask-failed':
				this.webview.postMessage({
					type: 'subtaskFail',
					subtaskId: event.subtaskId,
					assignee: event.assignee,
					error: event.error,
				});
				if (event.assignee === 'anton-security') {
					this.webview.postMessage({ type: 'securityPulseStop' });
				}
				break;
			case 'subtask-blocked':
				// Phase 80 — no dedicated webview card for blocked subtasks
				// today, but we still need to stop the security pulse so the
				// header doesn't keep pulsing while the subtask waits on a
				// dependency or upstream input.
				if (event.assignee === 'anton-security') {
					this.webview.postMessage({ type: 'securityPulseStop' });
				}
				break;
			case 'ui-block': {
				// Generative-UI block emitted by an agent on the orchestrator/
				// specialist path. The direct-LLM tool loop posts the
				// `uiBlock` message inline at execution time; agents reach
				// this path via AgentBridge so we do the same translation
				// here, with the same dedup guard.
				if (this.emittedUiBlockIds.has(event.blockId)) {
					console.warn(`[chat] ui-block: duplicate blockId ${event.blockId} ignored`);
					break;
				}
				this.emittedUiBlockIds.add(event.blockId);
				this.webview.postMessage({
					type: 'uiBlock',
					blockId: event.blockId,
					component: event.component,
					props: event.props,
					subtaskId: event.subtaskId,
				});
				break;
			}
			case 'tool-call': {
				// Direct specialist tool-loop path emits tool-call events as
				// the model invokes tools. Forward to the existing toolCall
				// webview message so the chat surface renders the same
				// inline tool card the chat-panel direct-tool-loop path
				// already produces. Status maps verbatim — the webview
				// already knows 'running' / 'done' / 'error'. Skip
				// emit_ui_block here too so generative-UI blocks render via
				// their dedicated `uiBlock` postMessage instead.
				if (event.name === 'emit_ui_block') {
					break;
				}
				this.webview.postMessage({
					type: 'toolCall',
					id: event.id,
					name: event.name,
					status: event.status,
					input: event.input,
					output: event.output,
				});
				break;
			}
			case 'final':
			case 'error':
				// Handled by the runViaAgentBridge caller (which has access to the
				// finalisation/error-emission machinery so it can also dispatch
				// messageComplete or streamError consistently).
				break;
		}
	}

	/**
	 * Translate a persisted `ChatMessageContent` into the shape expected by
	 * `LlmMessage.content`. The two types are structurally identical at
	 * runtime (image parts share `mimeType` / `base64Data`); the only
	 * persistence-only field is `name`, which is dropped here because
	 * provider serialisers don't want it on the wire.
	 */
	private toLlmContent(content: ChatMessageContent): string | ReadonlyArray<LlmContentPart> {
		if (typeof content === 'string') {
			return content;
		}
		const parts: LlmContentPart[] = [];
		for (const part of content) {
			if (part.type === 'text') {
				parts.push({ type: 'text', text: part.text });
			} else {
				parts.push({ type: 'image', mimeType: part.mimeType, base64Data: part.base64Data });
			}
		}
		return parts;
	}

	private async buildUserPrompt(text: string, attachments?: string[], mentions?: string[], mentionsKinded?: KindedMention[]): Promise<string> {
		const hasAttachments = Array.isArray(attachments) && attachments.length > 0;
		const hasKinded = Array.isArray(mentionsKinded) && mentionsKinded.length > 0;
		const hasMentions = Array.isArray(mentions) && mentions.length > 0;
		if (!hasAttachments && !hasMentions && !hasKinded) {
			return text;
		}
		const sections: string[] = [];
		const trimmed = text.trim();
		if (trimmed) {
			sections.push(trimmed);
		}
		// Kinded mentions are the authoritative source when the webview sent
		// them — they cover @problems / @terminal / @url plus the original
		// file/folder/workspace shapes. Older replay paths only ship the
		// legacy string[] so we fall back to the existing builder when
		// `mentionsKinded` is missing.
		if (hasKinded && mentionsKinded) {
			const block = await this.resolveKindedMentions(mentionsKinded);
			if (block) {
				sections.push(block);
			}
		} else if (hasMentions && mentions) {
			const mentionBlock = this.buildMentionBlock(mentions);
			if (mentionBlock) {
				sections.push(mentionBlock);
			}
		}
		if (hasAttachments && attachments) {
			for (const id of attachments) {
				const block = this.resolveAttachment(id);
				if (block) {
					sections.push(block);
				}
			}
		}
		return sections.join('\n\n');
	}

	/**
	 * Resolve the kinded mention payload into a single markdown block. Each
	 * mention contributes a labelled section; the final block is prefixed
	 * with the same "Mentioned context" header the legacy resolver emits so
	 * downstream prompt formatting stays consistent.
	 */
	private async resolveKindedMentions(mentions: KindedMention[]): Promise<string> {
		const parts: string[] = [];
		// Collect file/folder/workspace mentions and reuse the existing
		// builder for them so the workspace tree expansion behaviour is
		// preserved unchanged. Pseudo mentions get one part each.
		const legacyPaths: string[] = [];
		for (const m of mentions) {
			if (!m || typeof m.kind !== 'string') {
				continue;
			}
			if (m.kind === 'problems') {
				const problems = this.workspaceContext
					? await this.workspaceContext.getProblems()
					: '## Diagnostics\n\n[workspace context unavailable]\n';
				parts.push(problems);
			} else if (m.kind === 'terminal') {
				const terminal = this.workspaceContext
					? await this.workspaceContext.resolveTerminalMention()
					: '## Terminal\n\n[workspace context unavailable]\n';
				parts.push(terminal);
			} else if (m.kind === 'url') {
				const url = typeof m.url === 'string' ? m.url : '';
				const block = this.workspaceContext
					? await this.workspaceContext.resolveUrlMention(url)
					: `## URL: ${url}\n\n[workspace context unavailable]\n`;
				parts.push(block);
			} else if (m.kind === 'workspace') {
				legacyPaths.push('[workspace]');
			} else if (m.kind === 'file' || m.kind === 'folder') {
				if (typeof m.path === 'string' && m.path.length > 0) {
					legacyPaths.push(m.path);
				}
			}
		}
		if (legacyPaths.length > 0) {
			const block = this.buildMentionBlock(legacyPaths);
			if (block) {
				parts.unshift(block);
			}
		}
		return parts.length > 0 ? parts.join('\n\n') : '';
	}

	/**
	 * Compose a markdown summary of `@`-mentioned paths. Folders and files
	 * are listed verbatim; the synthetic `[workspace]` mention is expanded
	 * into a truncated tree (top-level entries only) so the model gets a
	 * sense of project layout without paying for a full recursive listing.
	 */
	private buildMentionBlock(mentions: string[]): string {
		if (mentions.length === 0) {
			return '';
		}
		const lines: string[] = ['**Mentioned files:**'];
		const safeMentions = mentions.filter(m => typeof m === 'string' && m.length > 0 && !m.includes('..') && !m.startsWith('/') && !m.startsWith('\\'));
		for (const m of safeMentions) {
			if (m === '[workspace]') {
				lines.push('- `[workspace]`');
			} else {
				lines.push(`- ${m}`);
			}
		}
		if (safeMentions.includes('[workspace]')) {
			const tree = this.buildWorkspaceTree();
			if (tree) {
				lines.push('', '**Workspace tree:**', '', '```', tree, '```');
			}
		}
		return lines.join('\n');
	}

	/**
	 * Build a single-level workspace listing, capped to a sensible number of
	 * entries so we never blow up the prompt. Sensitive directories are
	 * filtered using the same predicate as the context provider.
	 */
	private buildWorkspaceTree(): string {
		const folders = vscode.workspace.workspaceFolders ?? [];
		if (folders.length === 0) {
			return '';
		}
		const lines: string[] = [];
		const MAX_ENTRIES = 60;
		for (const folder of folders) {
			lines.push(`${folder.name}/`);
			let count = 0;
			for (const entry of this.workspaceIndex) {
				if (entry.kind !== 'file') {
					continue;
				}
				if (count >= MAX_ENTRIES) {
					lines.push('  …(truncated)');
					break;
				}
				const rel = entry.relPath.replace(/\\/g, '/');
				if (isSensitivePath(rel)) {
					continue;
				}
				lines.push(`  ${rel}`);
				count++;
			}
		}
		return lines.join('\n');
	}

	/**
	 * Translate an attachment id from the composer chip into a markdown block
	 * containing the actual content (file body, selection, etc.). Returns
	 * `undefined` for unknown ids so callers can skip them silently.
	 */
	private resolveAttachment(id: string): string | undefined {
		const editor = vscode.window.activeTextEditor;
		switch (id) {
			case 'current-file': {
				if (!editor) {
					return '_(no active file to attach)_';
				}
				const filename = vscode.workspace.asRelativePath(editor.document.uri);
				const language = editor.document.languageId || '';
				const content = editor.document.getText();
				// Truncate very large files to ~20k chars to avoid blowing the
				// context window. Selections are sent verbatim (see below).
				const MAX = 20_000;
				const truncated = content.length > MAX
					? content.slice(0, MAX) + `\n\n…(${content.length - MAX} more characters truncated)`
					: content;
				return `**Attached file:** \`${filename}\`\n\n\`\`\`${language}\n${truncated}\n\`\`\``;
			}
			case 'current-selection': {
				if (!editor) {
					return '_(no active editor for selection)_';
				}
				if (editor.selection.isEmpty) {
					return '_(no text selected)_';
				}
				const filename = vscode.workspace.asRelativePath(editor.document.uri);
				const language = editor.document.languageId || '';
				const startLine = editor.selection.start.line + 1;
				const endLine = editor.selection.end.line + 1;
				const content = editor.document.getText(editor.selection);
				return `**Attached selection** (\`${filename}\` lines ${startLine}-${endLine}):\n\n\`\`\`${language}\n${content}\n\`\`\``;
			}
			case 'terminal-output': {
				// VS Code's stable API doesn't expose terminal scrollback to
				// extensions, so we surface a graceful hint rather than a
				// silent no-op. The user can paste the relevant lines manually.
				return '_(Terminal output capture is not yet supported. Please paste any relevant terminal output into the message manually.)_';
			}
			default:
				return undefined;
		}
	}

	private async handleAcceptDiff(diffId?: string): Promise<void> {
		if (!diffId) {
			return;
		}
		// Diff application will be implemented when MCP integration is ready.
		// For now, show a notification.
		vscode.window.showInformationMessage('Diff accepted. Apply logic pending MCP integration.');
	}

	/**
	 * Open the OS file picker scoped to image formats, read the selected file
	 * as base64, and post it back to the webview as `imagePicked`. Errors are
	 * surfaced as VS Code notifications so the user has feedback if e.g. the
	 * file is unreadable. The webview is responsible for enforcing the
	 * per-message size and count caps; this handler is the I/O bridge.
	 */
	private async handlePickImage(): Promise<void> {
		const picked = await vscode.window.showOpenDialog({
			canSelectMany: false,
			canSelectFiles: true,
			canSelectFolders: false,
			openLabel: 'Attach image',
			filters: { Images: ['png', 'jpg', 'jpeg', 'gif', 'webp'] },
		});
		if (!picked || picked.length === 0) {
			return;
		}
		const uri = picked[0];
		try {
			const bytes = await vscode.workspace.fs.readFile(uri);
			const base64 = Buffer.from(bytes).toString('base64');
			const lower = uri.path.toLowerCase();
			const mime = lower.endsWith('.png') ? 'image/png'
				: lower.endsWith('.jpg') || lower.endsWith('.jpeg') ? 'image/jpeg'
					: lower.endsWith('.gif') ? 'image/gif'
						: lower.endsWith('.webp') ? 'image/webp'
							: 'application/octet-stream';
			if (!mime.startsWith('image/')) {
				vscode.window.showErrorMessage('Selected file is not a recognised image format.');
				return;
			}
			const name = uri.path.split('/').pop() ?? 'image';
			this.webview.postMessage({
				type: 'imagePicked',
				mime,
				base64,
				name,
			});
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			vscode.window.showErrorMessage(`Could not read image: ${message}`);
		}
	}

	/**
	 * Persist a code block emitted by the assistant to a workspace-relative
	 * path supplied by the model via a path hint comment on the first line.
	 *
	 * Defence-in-depth: even though the webview also validates the path, we
	 * re-check on the host because the postMessage channel is a security
	 * boundary and the webview is sandboxed but not authoritative.
	 */
	private async handleSaveCodeToFile(message: WebviewMessage): Promise<void> {
		const code = message.code;
		const relPath = message.relPath;
		if (typeof code !== 'string' || code.length === 0 || typeof relPath !== 'string' || relPath.length === 0) {
			vscode.window.showErrorMessage('Refusing to save: invalid relative path.');
			return;
		}
		// Reject path traversal, absolute paths, backslash abuse, and null bytes.
		if (
			relPath.includes('..') ||
			relPath.startsWith('/') ||
			relPath.startsWith('\\') ||
			relPath.includes('\0')
		) {
			vscode.window.showErrorMessage('Refusing to save: invalid relative path.');
			return;
		}

		const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
		if (!workspaceFolder) {
			vscode.window.showErrorMessage('Open a folder/workspace before saving generated code.');
			return;
		}

		const targetUri = vscode.Uri.joinPath(workspaceFolder.uri, relPath);

		try {
			let exists = false;
			try {
				await vscode.workspace.fs.stat(targetUri);
				exists = true;
			} catch {
				// stat throws when the file doesn't exist — that's the happy path
				// for a new file. Any other error surfaces from the writeFile call.
			}

			if (exists) {
				const choice = await vscode.window.showWarningMessage(
					`File ${relPath} already exists. Overwrite?`,
					{ modal: true },
					'Overwrite',
					'Cancel',
				);
				if (choice !== 'Overwrite') {
					return;
				}
			}

			await vscode.workspace.fs.writeFile(targetUri, new TextEncoder().encode(code));
			await vscode.window.showTextDocument(targetUri, { preview: false });
			vscode.window.showInformationMessage(`Saved to ${relPath}`);
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			vscode.window.showErrorMessage(`Failed to save ${relPath}: ${message}`);
		}
	}

	/**
	 * Open a side-by-side diff editor showing the workspace file (left) against
	 * an in-memory document carrying the proposed content (right). The proposed
	 * content is produced by applying the supplied unified-diff text to the
	 * current file contents — the assistant's diff is treated as a *proposal*
	 * the user can review and save through VS Code's standard flow.
	 *
	 * Defence-in-depth: even though the webview validates the path before
	 * rendering the Preview button, we re-validate here because the
	 * postMessage channel is a security boundary.
	 */
	private async handlePreviewDiff(diff: string): Promise<void> {
		const pathMatch =
			/^\+\+\+\s+b\/(.+)$/m.exec(diff)
			?? /^\+\+\+\s+(.+)$/m.exec(diff)
			?? /^---\s+a\/(.+)$/m.exec(diff)
			?? /^---\s+(.+)$/m.exec(diff);
		const relPath = pathMatch ? pathMatch[1].trim() : '';
		if (
			!relPath ||
			relPath.includes('..') ||
			relPath.startsWith('/') ||
			relPath.startsWith('\\') ||
			relPath.includes(' ') ||
			relPath.includes('\0')
		) {
			vscode.window.showErrorMessage('Refusing to preview diff: invalid path in diff header.');
			return;
		}

		const root = vscode.workspace.workspaceFolders?.[0]?.uri;
		if (!root) {
			vscode.window.showErrorMessage('Open a folder/workspace before previewing a diff.');
			return;
		}

		const targetUri = vscode.Uri.joinPath(root, relPath);

		let currentContent = '';
		try {
			const bytes = await vscode.workspace.fs.readFile(targetUri);
			currentContent = new TextDecoder('utf-8').decode(bytes);
		} catch {
			currentContent = '';
		}

		let proposedContent: string;
		try {
			proposedContent = applyUnifiedDiff(currentContent, diff);
		} catch (err) {
			const errMessage = err instanceof Error ? err.message : String(err);
			vscode.window.showErrorMessage(`Could not apply diff: ${errMessage}`);
			return;
		}

		const proposedDoc = await vscode.workspace.openTextDocument({
			content: proposedContent,
			language: this.guessLanguageFromPath(relPath),
		});

		const title = `${relPath} (Son of Anton proposal)`;
		await vscode.commands.executeCommand('vscode.diff', targetUri, proposedDoc.uri, title);
	}

	/**
	 * Open a side-by-side diff editor for a pending `write_file` approval
	 * (Phase 63). Compares the workspace file (left) against an untitled
	 * document containing the proposed content (right) so the user can judge
	 * a large write before clicking Approve. Purely additive — the approval
	 * state is unaffected by previewing.
	 */
	private async openWriteFileDiffPreview(relativePath: string, proposedContent: string): Promise<void> {
		const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
		if (!workspaceFolder) {
			await vscode.window.showWarningMessage('No workspace open.');
			return;
		}

		const targetUri = vscode.Uri.joinPath(workspaceFolder.uri, relativePath);

		// Read current content (empty if the file doesn't exist yet — which is
		// the common "new file write" case; the diff naturally shows the entire
		// proposal as additions).
		let currentContent = '';
		try {
			const bytes = await vscode.workspace.fs.readFile(targetUri);
			currentContent = new TextDecoder('utf-8').decode(bytes);
		} catch {
			currentContent = '';
		}

		if (currentContent === proposedContent) {
			await vscode.window.showInformationMessage('Proposed content matches current file — no changes.');
			return;
		}

		const proposedDoc = await vscode.workspace.openTextDocument({
			content: proposedContent,
			language: this.guessLanguageFromPath(relativePath),
		});

		const title = `${relativePath} (Son of Anton proposal)`;
		await vscode.commands.executeCommand('vscode.diff', targetUri, proposedDoc.uri, title);
	}

	/**
	 * Open VS Code's native side-by-side diff editor for a completed
	 * `write_file` tool call (Phase 63). The left side is the captured
	 * pre-image (via {@link WriteSnapshotStore}) when a `snapshotId` is
	 * available; otherwise it falls back to `git:HEAD:<path>` so reloaded
	 * sessions still get a useful diff against the last-committed version.
	 *
	 * Path safety: the webview only ships file paths it received from the
	 * tool input itself, but the postMessage channel is a security boundary
	 * — re-validate against traversal / absolute paths here.
	 */
	private async openWriteDiffEditor(filePath: string, snapshotId: string | undefined): Promise<void> {
		const cleaned = filePath.replace(/\\/g, '/');
		if (
			cleaned.length === 0 ||
			cleaned.includes('..') ||
			cleaned.startsWith('/') ||
			cleaned.includes('\0')
		) {
			vscode.window.showErrorMessage('Refusing to open diff: invalid path.');
			return;
		}

		const wsRoot = vscode.workspace.workspaceFolders?.[0]?.uri;
		if (!wsRoot) {
			vscode.window.showWarningMessage('Open a folder/workspace before viewing a diff.');
			return;
		}
		const targetUri = vscode.Uri.joinPath(wsRoot, cleaned);

		// Pick the left-hand pane source. Snapshot path is preferred when
		// available — it's the exact pre-image at the moment of the write,
		// regardless of git state. The git fallback covers reloaded sessions
		// where the snapshot has been evicted.
		let leftUri: vscode.Uri;
		if (snapshotId && this.writeSnapshotStore) {
			leftUri = this.writeSnapshotStore.uriFor(snapshotId, path.basename(cleaned));
		} else {
			// `git:` URIs are exposed by the built-in git extension; the path
			// portion is the absolute on-disk path, and `?ref=HEAD` selects
			// the committed revision. Falls through to an empty editor when
			// the workspace isn't a git repo — VS Code will still open the
			// diff but the left side reads as "(file doesn't exist)".
			leftUri = targetUri.with({ scheme: 'git', query: JSON.stringify({ path: targetUri.fsPath, ref: 'HEAD' }) });
		}

		const title = `${path.basename(cleaned)}: before ↔ after`;
		try {
			await vscode.commands.executeCommand('vscode.diff', leftUri, targetUri, title);
		} catch (err) {
			const msg = err instanceof Error ? err.message : String(err);
			vscode.window.showErrorMessage(`Could not open diff: ${msg}`);
		}
	}

	/**
	 * Best-effort language id from a relative path's extension. Falls back to
	 * `plaintext` so the proposal doc always has *some* language and never
	 * breaks document creation.
	 */
	private guessLanguageFromPath(relPath: string): string {
		const ext = relPath.toLowerCase().split('.').pop() ?? '';
		const map: Record<string, string> = {
			ts: 'typescript', tsx: 'typescriptreact',
			js: 'javascript', jsx: 'javascriptreact',
			py: 'python', rb: 'ruby', go: 'go', rs: 'rust',
			java: 'java', kt: 'kotlin', swift: 'swift',
			json: 'json', yaml: 'yaml', yml: 'yaml',
			md: 'markdown', html: 'html', css: 'css', scss: 'scss',
			sh: 'shellscript', bash: 'shellscript', zsh: 'shellscript',
		};
		return map[ext] ?? 'plaintext';
	}

	private getHtmlContent(): string {
		const cssUri = this.webview.asWebviewUri(
			vscode.Uri.joinPath(this.extensionUri, 'media', 'chat.css')
		);
		// The webview JS body is loaded as an external file (instead of an
		// inline script) so this template literal stays a manageable size.
		// Loaded via `nonce` + the webview's cspSource so both CSP forms
		// admit it — see the CSP `script-src` directive below.
		const webviewJsUri = this.webview.asWebviewUri(
			vscode.Uri.joinPath(this.extensionUri, 'media', 'chat-webview.js')
		);

		// CSP requires a fresh per-load random nonce on every inline <script>
		// — a static placeholder is a footgun. Without a real nonce the CSP
		// blocks every script in the chat HTML, which leaves the UI as static
		// markup with no event handlers, no message sending, and no dynamic
		// rendering.
		let nonce = '';
		const NONCE_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
		for (let i = 0; i < 32; i++) {
			nonce += NONCE_CHARS.charAt(Math.floor(Math.random() * NONCE_CHARS.length));
		}

		const defaultModel = vscode.workspace.getConfiguration('sota').get<string>('defaultModel', 'sonnet');
		// Serialise the registry into the page so the webview JS can render the
		// agent menu without an extra round-trip. JSON.stringify produces JSON
		// that's safe to embed inside a <script type="application/json"> block.
		const specialistRolesJson = JSON.stringify(SPECIALIST_ROLES);
		// Per-specialist visual identity (avatar monogram, accent colour,
		// tagline). Embedded alongside the role data so the webview can render
		// the persona avatar above each assistant bubble without an extra
		// round-trip. Persona data is parallel to role data — joined by `id`
		// at render time — so the prompt layer stays decoupled from UI concerns.
		const personasJson = JSON.stringify(PERSONAS);
		// Roster cards for the Roster tab — display order matches
		// `SPECIALIST_ROLES`. Joined with `SPECIALIST_ROLES` client-side so
		// each card can show the role's display name + description alongside
		// the persona's avatar/tagline.
		const rosterJson = JSON.stringify(getRoster());
		// Embed the slash-command catalogue so the popup can render without an
		// extra round-trip. The host-side dispatcher (`parseAndDispatch`) is
		// the source of truth for execution; the popup is purely a UX layer.
		const slashCommandsJson = JSON.stringify(getCommandList());
		// Phase 5 — per-model tooltip data for the picker. Keep parallel to
		// `MODEL_LABELS` in chat-webview.js so every model id surfaces its
		// own context window / pricing / capabilities row.
		const modelMetadataJson = JSON.stringify(MODEL_METADATA);
		const initialTab: ChatTab = this.currentTab;

		return /* html */`<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${this.webview.cspSource} https: data:; style-src ${this.webview.cspSource}; script-src 'nonce-${nonce}' ${this.webview.cspSource};">
	<link href="${cssUri}" rel="stylesheet">
	<title>Son of Anton Chat</title>
</head>
<body data-default-model="${defaultModel}" data-initial-tab="${initialTab}">
	<div class="chat">
		<div class="chat-header">
			<div class="hdr-titles">
				<div class="hdr-title">Son of Anton</div>
				<div class="hdr-subtitle" id="hdrSubtitle" hidden></div>
			</div>
			<button class="hdr-cost" id="hdrCost" type="button" hidden title="Session totals. Reset on /clear." aria-label="Session token and cost totals" aria-haspopup="true">
				<span class="hdr-cost-pulse" id="hdrCostPulse" hidden aria-hidden="true"></span>
				<span class="hdr-cost-tokens" id="hdrCostTokens">0 tok</span>
				<span class="hdr-cost-divider" aria-hidden="true">·</span>
				<span class="hdr-cost-dollars" id="hdrCostDollars">$0.00</span>
			</button>
			<div class="hdr-conn" id="hdrConn" hidden>
				<span class="hdr-conn-dot"></span>
				<span class="hdr-conn-label" id="hdrConnLabel"></span>
			</div>
			<button class="hdr-btn hdr-btn-settings" id="settingsBtn" title="Settings" aria-label="Open settings tab">
				<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 5.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5z"/><path d="M13.4 9.6a5.6 5.6 0 0 0 0-3.2l1.4-1.1-1.5-2.6-1.7.6a5.6 5.6 0 0 0-2.8-1.6L8.5 0h-3l-.3 1.7a5.6 5.6 0 0 0-2.8 1.6l-1.7-.6L-.8 5.3l1.4 1.1a5.6 5.6 0 0 0 0 3.2L-.8 10.7l1.5 2.6 1.7-.6a5.6 5.6 0 0 0 2.8 1.6L5.5 16h3l.3-1.7a5.6 5.6 0 0 0 2.8-1.6l1.7.6 1.5-2.6-1.4-1.1z"/></svg>
			</button>
			<button class="hdr-btn hdr-btn-export" id="exportBtn" title="Export conversation" aria-label="Export conversation as Markdown">
				<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 11V3M5 6l3-3 3 3M3 13h10"/></svg>
			</button>
			<button class="hdr-btn" id="newChatBtn" title="Start a new chat" aria-label="Start a new chat">
				<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M8 3v10M3 8h10"/></svg>
				<span>New</span>
			</button>
		</div>

		<div class="chat-tabs" role="tablist" aria-label="Chat sidebar sections">
			<button class="chat-tab" role="tab" type="button" data-tab="chat" aria-selected="true" title="Chat (Cmd/Ctrl+1)" aria-label="Chat tab">
				<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2.5 3h11a1 1 0 0 1 1 1v7a1 1 0 0 1-1 1H6.5l-3 2.5V12H2.5a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z"/></svg>
				<span class="chat-tab-label">Chat</span>
			</button>
			<button class="chat-tab" role="tab" type="button" data-tab="tasks" aria-selected="false" title="Tasks (Cmd/Ctrl+2)" aria-label="Tasks tab">
				<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="2" y="2.5" width="3.6" height="11" rx="0.6"/><rect x="6.4" y="2.5" width="3.6" height="7" rx="0.6"/><rect x="10.8" y="2.5" width="3.6" height="9" rx="0.6"/></svg>
				<span class="chat-tab-label">Tasks</span>
			</button>
			<button class="chat-tab" role="tab" type="button" data-tab="history" aria-selected="false" title="History (Cmd/Ctrl+3)" aria-label="History tab">
				<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="8" cy="8" r="6"/><path d="M8 4.5v3.7l2.3 1.6"/></svg>
				<span class="chat-tab-label">History</span>
			</button>
			<button class="chat-tab" role="tab" type="button" data-tab="settings" aria-selected="false" title="Settings (Cmd/Ctrl+4)" aria-label="Settings tab">
				<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="8" cy="8" r="2"/><path d="M8 1.5v2M8 12.5v2M1.5 8h2M12.5 8h2M3.6 3.6l1.4 1.4M11 11l1.4 1.4M3.6 12.4l1.4-1.4M11 5l1.4-1.4"/></svg>
				<span class="chat-tab-label">Settings</span>
			</button>
			<button class="chat-tab" role="tab" type="button" data-tab="roster" aria-selected="false" title="Roster (Cmd/Ctrl+5)" aria-label="Roster tab">
				<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="6" cy="6" r="2.4"/><path d="M2 13c.6-2 2-3 4-3s3.4 1 4 3"/><circle cx="11.5" cy="5.5" r="1.6"/><path d="M9.5 9c.6-1 1.4-1.5 2-1.5 1.4 0 2.6 1 3 2.5"/></svg>
				<span class="chat-tab-label">Roster</span>
			</button>
		</div>

		<div class="popover hdr-cost-popover" id="hdrCostPopover" hidden role="menu" aria-label="Session cost breakdown">
			<div class="popover-section-label">Session totals</div>
			<div class="hdr-cost-popover-body" id="hdrCostPopoverBody">
				<div class="hdr-cost-popover-empty">No usage yet.</div>
			</div>
			<div class="hdr-cost-popover-footer">
				<button class="hdr-cost-popover-reset" id="hdrCostPopoverReset" type="button">Reset</button>
			</div>
		</div>

		<div class="chat-pane" id="pane-chat" data-pane="chat" role="tabpanel">
		<div class="message-list" id="messageList">
			<div class="empty-state" id="emptyState">
				<!-- Visible when ANY auth is available -->
				<div id="emptyStateReady" hidden>
					<div class="empty-title">How can I help?</div>
					<div class="empty-subtitle">Ask anything about your code or the current workspace.</div>
					<div class="empty-prompts">
						<button class="prompt-card" data-prompt="Explain what the current file does and how it fits in the codebase.">
							<span class="prompt-card-icon" aria-hidden="true">
								<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 2h7l3 3v9H3z"/><path d="M10 2v3h3"/><path d="M5 8h6M5 11h4"/></svg>
							</span>
							<span class="prompt-card-text">Explain the current file</span>
						</button>
						<button class="prompt-card" data-prompt="Suggest tests for the selected code, covering happy path and edge cases.">
							<span class="prompt-card-icon" aria-hidden="true">
								<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h8M6 4v9a1 1 0 0 0 1 1h2a1 1 0 0 0 1-1V4"/><path d="M5 9h6"/></svg>
							</span>
							<span class="prompt-card-text">Suggest tests for the selection</span>
						</button>
						<button class="prompt-card" data-prompt="Review the recent changes for bugs, missing edge cases, and unclear code.">
							<span class="prompt-card-icon" aria-hidden="true">
								<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M2 8a6 6 0 1 0 12 0 6 6 0 0 0-12 0z"/><path d="M5 8l2 2 4-4"/></svg>
							</span>
							<span class="prompt-card-text">Review recent changes</span>
						</button>
					</div>
				</div>
				<!-- Visible when NO auth available — the 5-provider Cline-style picker. -->
				<div id="emptyStateAuth" hidden>
					<div class="empty-state-providers" id="emptyStateProviders">
						<div class="provider-list-title">Connect to get started</div>
						<div class="provider-list-subtitle">Pick an LLM provider to start chatting:</div>
						<div class="provider-cards">
							<button class="provider-card" type="button" data-provider="anthropic">
								<div class="provider-card-header">
									<span class="provider-card-icon provider-card-icon-anthropic" aria-hidden="true">A</span>
									<span class="provider-card-name">Anthropic Claude</span>
									<span class="provider-card-status" data-status="anthropic">Not configured</span>
								</div>
								<div class="provider-card-desc">Sign in with your Claude Code subscription, or provide a direct API key. Opus, Sonnet, Haiku.</div>
							</button>
							<button class="provider-card" type="button" data-provider="openai">
								<div class="provider-card-header">
									<span class="provider-card-icon provider-card-icon-openai" aria-hidden="true">O</span>
									<span class="provider-card-name">OpenAI</span>
									<span class="provider-card-status" data-status="openai">Not configured</span>
								</div>
								<div class="provider-card-desc">API key. GPT-4o, GPT-4o-mini, GPT-5 Codex.</div>
							</button>
							<button class="provider-card" type="button" data-provider="foundry">
								<div class="provider-card-header">
									<span class="provider-card-icon provider-card-icon-foundry" aria-hidden="true">⌬</span>
									<span class="provider-card-name">Microsoft Foundry / Azure OpenAI</span>
									<span class="provider-card-status" data-status="foundry">Not configured</span>
								</div>
								<div class="provider-card-desc">Endpoint + key + deployment.</div>
							</button>
							<button class="provider-card" type="button" data-provider="bedrock">
								<div class="provider-card-header">
									<span class="provider-card-icon provider-card-icon-bedrock" aria-hidden="true">aws</span>
									<span class="provider-card-name">Amazon Bedrock</span>
									<span class="provider-card-status" data-status="bedrock">Not configured</span>
								</div>
								<div class="provider-card-desc">Region + AWS credentials or profile.</div>
							</button>
							<button class="provider-card" type="button" data-provider="google">
								<div class="provider-card-header">
									<span class="provider-card-icon provider-card-icon-google" aria-hidden="true">G</span>
									<span class="provider-card-name">Google Gemini</span>
									<span class="provider-card-status" data-status="google">Not configured</span>
								</div>
								<div class="provider-card-desc">API key. Gemini 1.5 Pro/Flash, 2.0 Flash.</div>
							</button>
							<button class="provider-card" type="button" data-provider="openrouter">
								<div class="provider-card-header">
									<span class="provider-card-icon provider-card-icon-openrouter" aria-hidden="true">OR</span>
									<span class="provider-card-name">OpenRouter</span>
									<span class="provider-card-status" data-status="openrouter">Not configured</span>
								</div>
								<div class="provider-card-desc">Single API key. Claude, GPT, Llama, DeepSeek, Mistral, Qwen, Grok, plus 200+ more.</div>
							</button>
							<button class="provider-card" type="button" data-provider="ollama">
								<div class="provider-card-header">
									<span class="provider-card-icon provider-card-icon-ollama" aria-hidden="true">Ol</span>
									<span class="provider-card-name">Ollama (local)</span>
									<span class="provider-card-status" data-status="ollama">Not configured</span>
								</div>
								<div class="provider-card-desc">Local llama.cpp server. Offline / privacy-friendly. Requires <code>ollama serve</code> running.</div>
							</button>
							<button class="provider-card" type="button" data-provider="lmstudio">
								<div class="provider-card-header">
									<span class="provider-card-icon provider-card-icon-lmstudio" aria-hidden="true">LS</span>
									<span class="provider-card-name">LM Studio (local)</span>
									<span class="provider-card-status" data-status="lmstudio">Not configured</span>
								</div>
								<div class="provider-card-desc">Local model server with a friendly UI. OpenAI-compatible API.</div>
							</button>
							<button class="provider-card" type="button" data-provider="deepseek">
								<div class="provider-card-header">
									<span class="provider-card-icon provider-card-icon-deepseek" aria-hidden="true">DS</span>
									<span class="provider-card-name">DeepSeek</span>
									<span class="provider-card-status" data-status="deepseek">Not configured</span>
								</div>
								<div class="provider-card-desc">API key. DeepSeek V3 chat + R1 reasoning at deep-discount pricing.</div>
							</button>
							<button class="provider-card" type="button" data-provider="mistral">
								<div class="provider-card-header">
									<span class="provider-card-icon provider-card-icon-mistral" aria-hidden="true">Mi</span>
									<span class="provider-card-name">Mistral</span>
									<span class="provider-card-status" data-status="mistral">Not configured</span>
								</div>
								<div class="provider-card-desc">API key. Mistral Large/Small, Codestral, Pixtral vision.</div>
							</button>
							<button class="provider-card" type="button" data-provider="groq">
								<div class="provider-card-header">
									<span class="provider-card-icon provider-card-icon-groq" aria-hidden="true">Gq</span>
									<span class="provider-card-name">Groq</span>
									<span class="provider-card-status" data-status="groq">Not configured</span>
								</div>
								<div class="provider-card-desc">API key. LPU-accelerated, very fast Llama / Mixtral / DeepSeek inference.</div>
							</button>
							<button class="provider-card" type="button" data-provider="cerebras">
								<div class="provider-card-header">
									<span class="provider-card-icon provider-card-icon-cerebras" aria-hidden="true">Cb</span>
									<span class="provider-card-name">Cerebras</span>
									<span class="provider-card-status" data-status="cerebras">Not configured</span>
								</div>
								<div class="provider-card-desc">API key. Wafer-scale, fastest single-stream throughput. Llama 3.3/3.1.</div>
							</button>
							<button class="provider-card" type="button" data-provider="together">
								<div class="provider-card-header">
									<span class="provider-card-icon provider-card-icon-together" aria-hidden="true">Tg</span>
									<span class="provider-card-name">Together AI</span>
									<span class="provider-card-status" data-status="together">Not configured</span>
								</div>
								<div class="provider-card-desc">API key. Llama 405B, Qwen Coder, Mixtral 8x22B, plus 100+ open models.</div>
							</button>
							<button class="provider-card" type="button" data-provider="fireworks">
								<div class="provider-card-header">
									<span class="provider-card-icon provider-card-icon-fireworks" aria-hidden="true">Fw</span>
									<span class="provider-card-name">Fireworks AI</span>
									<span class="provider-card-status" data-status="fireworks">Not configured</span>
								</div>
								<div class="provider-card-desc">API key. Llama 405B, DeepSeek V3, Qwen Coder, plus user fine-tunes.</div>
							</button>
						</div>
						<div class="provider-list-footer">
							<button class="provider-list-settings-link" type="button" id="emptyStateSettingsLink">Open settings</button>
						</div>
					</div>

					<!-- Inline form for the selected provider. Rendered into this slot
					     by JS when a card is clicked; cleared when the user backs out. -->
					<div class="provider-form-host" id="providerFormHost" hidden></div>
				</div>
			</div>
		</div>
		</div>
		<!-- /pane-chat -->

		<div class="chat-pane" id="pane-tasks" data-pane="tasks" role="tabpanel" hidden>
			<div class="tasks-pane-shell">
				<div class="tasks-pane-header">
					<div class="tasks-pane-title">Active plan</div>
					<button class="tasks-pane-open-board" type="button" id="tasksOpenBoardBtn" title="Open the full kanban board in an editor tab">
						<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="2.5" y="2.5" width="11" height="11" rx="1"/><path d="M6 6h4M6 9h4"/></svg>
						<span>Open Full Board</span>
					</button>
				</div>
				<div class="tasks-pane-counts" id="tasksPaneCounts" hidden></div>
				<div class="tasks-pane-list" id="tasksPaneList"></div>
				<div class="tasks-pane-empty" id="tasksPaneEmpty" hidden>
					<p>No active plan. Send a request to <code>@anton</code> to generate one.</p>
					<button class="tasks-pane-empty-cta" type="button" data-action="open-chat-tab">Open Chat</button>
				</div>
			</div>
		</div>

		<div class="chat-pane" id="pane-history" data-pane="history" role="tabpanel" hidden>
			<div class="history-pane-shell">
				<div class="history-pane-header">
					<div class="history-pane-title">Conversations</div>
					<button class="history-pane-new" type="button" id="historyNewBtn" title="Start a new conversation">
						<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M8 3v10M3 8h10"/></svg>
						<span>New conversation</span>
					</button>
				</div>
				<div class="history-pane-list" id="historyPaneList"></div>
				<div class="history-pane-empty" id="historyPaneEmpty" hidden>
					<p>No conversations yet. Start chatting to populate this list.</p>
				</div>
			</div>
		</div>

		<div class="chat-pane" id="pane-settings" data-pane="settings" role="tabpanel" hidden>
			<div class="chat-settings-view chat-settings-view-tabbed" id="chatSettingsView" data-active-subtab="api">
				<aside class="settings-subtab-nav" role="tablist" aria-label="Settings sections">
					<button class="settings-subtab" data-subtab="api" role="tab" aria-selected="true" aria-controls="settingsSubtab-api">
						<svg class="settings-section-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 4l5 3 5-3M3 4v8l5 3 5-3V4M3 4l5 3v8"/></svg>
						<span>API Configuration</span>
					</button>
					<button class="settings-subtab" data-subtab="models" role="tab" aria-selected="false" aria-controls="settingsSubtab-models">
						<svg class="settings-section-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="8" cy="8" r="5"/><path d="M8 3v10M3 8h10"/></svg>
						<span>Models</span>
					</button>
					<button class="settings-subtab" data-subtab="specialists" role="tab" aria-selected="false" aria-controls="settingsSubtab-specialists">
						<svg class="settings-section-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="5" cy="6" r="2"/><circle cx="11" cy="6" r="2"/><path d="M1.5 13c0-2 1.6-3 3.5-3s3.5 1 3.5 3M7.5 13c0-2 1.6-3 3.5-3s3.5 1 3.5 3"/></svg>
						<span>Specialist Models</span>
					</button>
					<button class="settings-subtab" data-subtab="features" role="tab" aria-selected="false" aria-controls="settingsSubtab-features">
						<svg class="settings-section-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="2" y="2" width="5" height="5"/><rect x="9" y="2" width="5" height="5"/><rect x="2" y="9" width="5" height="5"/><rect x="9" y="9" width="5" height="5"/></svg>
						<span>Features</span>
					</button>
					<button class="settings-subtab" data-subtab="personality" role="tab" aria-selected="false" aria-controls="settingsSubtab-personality">
						<svg class="settings-section-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="8" cy="6" r="2.5"/><path d="M3 13c0-2.5 2.2-4 5-4s5 1.5 5 4"/></svg>
						<span>Personality</span>
					</button>
					<button class="settings-subtab" data-subtab="mcp" role="tab" aria-selected="false" aria-controls="settingsSubtab-mcp">
						<svg class="settings-section-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="2" y="3" width="12" height="4" rx="1"/><rect x="2" y="9" width="12" height="4" rx="1"/><circle cx="5" cy="5" r="0.6" fill="currentColor"/><circle cx="5" cy="11" r="0.6" fill="currentColor"/></svg>
						<span>MCP Servers</span>
					</button>
					<button class="settings-subtab" data-subtab="terminal" role="tab" aria-selected="false" aria-controls="settingsSubtab-terminal">
						<svg class="settings-section-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="2" y="3" width="12" height="10" rx="1"/><path d="M5 7l2 2-2 2M9 11h3"/></svg>
						<span>Terminal</span>
					</button>
					<button class="settings-subtab" data-subtab="about" role="tab" aria-selected="false" aria-controls="settingsSubtab-about">
						<svg class="settings-section-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="8" cy="8" r="6"/><path d="M8 11V7M8 5h.01"/></svg>
						<span>About</span>
					</button>
				</aside>
				<div class="settings-subtab-content">
					<h3 class="chat-settings-title">Son of Anton Settings</h3>

					<section class="settings-section settings-subtab-pane" id="settingsSubtab-api" data-subtab-pane="api" role="tabpanel" aria-labelledby="settingsSubtab-api">
						<div class="settings-section-head">
							<svg class="settings-section-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 4l5 3 5-3M3 4v8l5 3 5-3V4M3 4l5 3v8"/></svg>
							<h4>API Configuration</h4>
						</div>
						<p class="settings-section-blurb">Connect one or more LLM providers. Click a provider to add an API key, OAuth, or deployment details.</p>
						<div class="settings-providers" id="settingsProviders"></div>
					</section>

					<section class="settings-section settings-subtab-pane" id="settingsSubtab-models" data-subtab-pane="models" role="tabpanel" hidden aria-labelledby="settingsSubtab-models">
						<div class="settings-section-head">
							<svg class="settings-section-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="8" cy="8" r="5"/><path d="M8 3v10M3 8h10"/></svg>
							<h4>Models</h4>
						</div>
						<p class="settings-section-blurb">Pin a default model and tune reasoning controls. Per-model overrides also live in the composer toolbar.</p>
						<label class="settings-field">
							<span class="settings-field-label">Default model</span>
							<select class="settings-input" data-setting-select="sota.defaultModel" id="settingsDefaultModel">
								<option value="opus">Opus</option>
								<option value="sonnet">Sonnet</option>
								<option value="haiku">Haiku</option>
							</select>
						</label>
						<label class="settings-field">
							<span class="settings-field-label">Reasoning effort (gpt-5 / o-series)</span>
							<select class="settings-input" data-setting-select="sota.reasoningEffort" id="settingsReasoningEffort">
								<option value="auto">auto</option>
								<option value="low">low</option>
								<option value="medium">medium</option>
								<option value="high">high</option>
							</select>
						</label>
						<label class="settings-field">
							<span class="settings-field-label">Thinking budget (Claude 4.x), tokens — <span class="settings-slider-value" id="thinkingBudgetValue">0</span></span>
							<input class="settings-input settings-slider" type="range" min="0" max="24000" step="1000" data-setting-number="sota.thinkingBudgetTokens" id="settingsThinkingBudget" />
						</label>
						<button class="settings-link-button" type="button" data-action="open-settings-json" data-setting-id="sota.defaultModel">Edit model routing in settings.json</button>
					</section>

					<section class="settings-section settings-subtab-pane" id="settingsSubtab-specialists" data-subtab-pane="specialists" role="tabpanel" hidden aria-labelledby="settingsSubtab-specialists">
						<div class="settings-section-head">
							<svg class="settings-section-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="5" cy="6" r="2"/><circle cx="11" cy="6" r="2"/><path d="M1.5 13c0-2 1.6-3 3.5-3s3.5 1 3.5 3M7.5 13c0-2 1.6-3 3.5-3s3.5 1 3.5 3"/></svg>
							<h4>Specialist Models</h4>
						</div>
						<p class="settings-section-blurb">Pin a model per specialist. Empty selection falls back to that agent's hardcoded default (shown in brackets). Reload the window for changes to take effect — the agent stack reads these at activation.</p>
						<div class="specialist-models-controls">
							<label class="settings-field specialist-models-scope">
								<span class="settings-field-label">Apply to</span>
								<select class="settings-input" id="specialistModelsScope">
									<option value="user">User</option>
									<option value="workspace">Workspace</option>
									<option value="folder">Folder</option>
								</select>
							</label>
							<button class="settings-link-button" type="button" id="specialistModelsReload" hidden>Reload window to apply</button>
						</div>
						<div class="specialist-models-list" id="specialistModelsList" role="list"></div>
						<button class="settings-link-button" type="button" data-action="open-settings-json" data-setting-id="sota.agents">Edit agent models in settings.json</button>
					</section>

					<section class="settings-section settings-subtab-pane" id="settingsSubtab-features" data-subtab-pane="features" role="tabpanel" hidden aria-labelledby="settingsSubtab-features">
						<div class="settings-section-head">
							<svg class="settings-section-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="2" y="2" width="5" height="5"/><rect x="9" y="2" width="5" height="5"/><rect x="2" y="9" width="5" height="5"/><rect x="9" y="9" width="5" height="5"/></svg>
							<h4>Features</h4>
						</div>
						<p class="settings-section-blurb">Tune what Anton sees about your workspace and the optional UI flourishes.</p>
						<label class="settings-toggle">
							<input type="checkbox" data-setting="sota.chat.includeWorkspaceContext" />
							<span>Auto-inject workspace context</span>
						</label>
						<label class="settings-toggle">
							<input type="checkbox" data-setting="sota.chat.focusChainEnabled" />
							<span>Focus-chain checklist</span>
						</label>
						<label class="settings-toggle">
							<input type="checkbox" data-setting="sota.chat.perMessageHoverDetails" />
							<span>Per-message hover details</span>
						</label>
						<label class="settings-toggle">
							<input type="checkbox" data-setting="sota.chat.personaAccents" />
							<span>Persona accents</span>
						</label>
						<div class="settings-subhead">Auto-approval</div>
						<div class="settings-trust-banner" role="note">
							<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 1.5l6.5 3v4.5c0 3.5-2.7 6-6.5 7-3.8-1-6.5-3.5-6.5-7v-4.5L8 1.5z"/><path d="M8 6v3M8 11h.01"/></svg>
							<span>Auto-approval gives agents direct access to your system. Review changes before they run.</span>
						</div>
						<label class="settings-toggle">
							<input type="checkbox" data-setting="sota.autoApprove.read" />
							<span>Read-only ops (read_file, list_directory, search, fetch_url)</span>
						</label>
						<label class="settings-toggle">
							<input type="checkbox" data-setting="sota.autoApprove.write" />
							<span>File writes (write_file, edit_file)</span>
						</label>
						<label class="settings-toggle">
							<input type="checkbox" data-setting="sota.autoApprove.shell" />
							<span>Shell commands (run_command)</span>
						</label>
						<label class="settings-toggle">
							<input type="checkbox" data-setting="sota.autoApprove.mcp" />
							<span>MCP server tools</span>
						</label>
						<label class="settings-field">
							<span class="settings-field-label">Command denylist (one regex per line)</span>
							<textarea class="settings-input settings-textarea" data-setting-text="sota.commandDenylist" id="settingsCommandDenylist" rows="4" spellcheck="false" placeholder="rm -rf"></textarea>
						</label>
						<div class="settings-subhead">Spend caps</div>
						<label class="settings-toggle">
							<input type="checkbox" data-setting="sota.spendLimit.enabled" />
							<span>Enforce spend caps (block when exceeded)</span>
						</label>
						<label class="settings-field">
							<span class="settings-field-label">Session cap (USD)</span>
							<input class="settings-input" type="number" min="0" step="0.5" data-setting-number-input="sota.spendLimit.session" id="settingsSpendLimitSession" />
						</label>
						<label class="settings-field">
							<span class="settings-field-label">Per-task cap (USD)</span>
							<input class="settings-input" type="number" min="0" step="0.25" data-setting-number-input="sota.spendLimit.task" id="settingsSpendLimitTask" />
						</label>
						<div class="spend-meter" id="settingsSpendMeter" hidden>
							<div class="spend-meter-row">
								<span class="spend-meter-label">Session</span>
								<span class="spend-meter-value" id="spendMeterSessionLabel">$0.00 / $0.00</span>
							</div>
							<div class="spend-meter-bar">
								<div class="spend-meter-fill" id="spendMeterSessionFill"></div>
							</div>
							<div class="spend-meter-row">
								<span class="spend-meter-label">Current task</span>
								<span class="spend-meter-value" id="spendMeterTaskLabel">$0.00 / $0.00</span>
							</div>
							<div class="spend-meter-bar">
								<div class="spend-meter-fill" id="spendMeterTaskFill"></div>
							</div>
						</div>
					</section>

					<section class="settings-section settings-subtab-pane" id="settingsSubtab-personality" data-subtab-pane="personality" role="tabpanel" hidden aria-labelledby="settingsSubtab-personality">
						<div class="settings-section-head">
							<svg class="settings-section-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="8" cy="6" r="2.5"/><path d="M3 13c0-2.5 2.2-4 5-4s5 1.5 5 4"/></svg>
							<h4>Personality</h4>
						</div>
						<p class="settings-section-blurb">Anton has the dry deadpan of a thousand-year-old butler. These flags decide how much of Silicon Valley's voice bleeds through.</p>
						<label class="settings-toggle">
							<input type="checkbox" data-setting="sota.personality.enabled" />
							<span>Show Silicon Valley quotes</span>
						</label>
						<p class="settings-toggle-example">e.g. "It's possible that Son of Anton thought I was malfunctioning." — Gilfoyle</p>
						<label class="settings-field">
							<span class="settings-field-label">Voice intensity — <span class="settings-slider-value" id="voiceIntensityValue">5</span></span>
							<input class="settings-input settings-slider" type="range" min="0" max="10" step="1" data-setting-number="sota.personality.voiceIntensity" id="settingsVoiceIntensity" />
						</label>
						<label class="settings-toggle">
							<input type="checkbox" data-setting="sota.personality.asciiArt" />
							<span>ASCII art on idle screens</span>
						</label>
						<label class="settings-toggle">
							<input type="checkbox" data-setting="sota.personality.easterEggs" />
							<span>Easter eggs</span>
						</label>
						<label class="settings-toggle">
							<input type="checkbox" data-setting="sota.personality.antonIsWatching" id="settingsAntonIsWatchingToggle" />
							<span>Anton is watching</span>
						</label>
						<p class="settings-toggle-example">A periodic dry observation surfaced once per window — never while you're idle.</p>
						<label class="settings-field" id="settingsAntonIsWatchingFrequencyField">
							<span class="settings-field-label">Frequency</span>
							<select class="settings-input" data-setting-select="sota.personality.antonIsWatching.frequency">
								<option value="rare">Rare (2–4 hour window)</option>
								<option value="normal">Normal (30 min – 4 hour window)</option>
								<option value="often">Often (10 min – 2 hour window)</option>
							</select>
						</label>
					</section>

					<section class="settings-section settings-subtab-pane" id="settingsSubtab-mcp" data-subtab-pane="mcp" role="tabpanel" hidden aria-labelledby="settingsSubtab-mcp">
						<div class="settings-section-head">
							<svg class="settings-section-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="2" y="3" width="12" height="4" rx="1"/><rect x="2" y="9" width="12" height="4" rx="1"/><circle cx="5" cy="5" r="0.6" fill="currentColor"/><circle cx="5" cy="11" r="0.6" fill="currentColor"/></svg>
							<h4>MCP Servers</h4>
						</div>
						<p class="settings-section-blurb">Model Context Protocol servers expose tools and resources to Anton. Add a server here, or edit <code>sota.mcp.servers</code> in settings.json.</p>
						<div class="mcp-servers" id="settingsMcpServers">
							<div class="mcp-servers-list" id="mcpServersList"></div>
							<div class="mcp-servers-empty" id="mcpServersEmpty" hidden>
								<p>No MCP servers configured yet.</p>
							</div>
							<button class="mcp-server-add" type="button" data-action="add">+ Add MCP Server</button>
							<div class="mcp-server-form-host" id="mcpServerFormHost" hidden></div>
						</div>
						<button class="settings-link-button" type="button" data-action="open-settings-json" data-setting-id="sota.mcp.servers">Edit in settings.json</button>
					</section>

					<section class="settings-section settings-subtab-pane" id="settingsSubtab-terminal" data-subtab-pane="terminal" role="tabpanel" hidden aria-labelledby="settingsSubtab-terminal">
						<div class="settings-section-head">
							<svg class="settings-section-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="2" y="3" width="12" height="10" rx="1"/><path d="M5 7l2 2-2 2M9 11h3"/></svg>
							<h4>Terminal</h4>
						</div>
						<p class="settings-section-blurb">Tune how much terminal output Anton can read at a time.</p>
						<label class="settings-field">
							<span class="settings-field-label">Output line cap — <span class="settings-slider-value" id="terminalOutputLinesValue">100</span></span>
							<input class="settings-input settings-slider" type="range" min="20" max="500" step="10" data-setting-number="sota.terminal.outputLineCap" id="settingsTerminalLineCap" />
						</label>
						<label class="settings-toggle">
							<input type="checkbox" data-setting="sota.terminal.shellIntegration" />
							<span>Shell integration (advisory)</span>
						</label>
					</section>

					<section class="settings-section settings-subtab-pane" id="settingsSubtab-about" data-subtab-pane="about" role="tabpanel" hidden aria-labelledby="settingsSubtab-about">
						<div class="settings-section-head">
							<svg class="settings-section-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="8" cy="8" r="6"/><path d="M8 11V7M8 5h.01"/></svg>
							<h4>About</h4>
						</div>
						<p class="settings-section-blurb">Son of Anton — an AI-native code editor forked from VS Code.</p>
						<p class="settings-toggle-example" id="settingsAboutVersion">Version: loading…</p>
						<button class="settings-link-button" type="button" data-action="open-link" data-link="https://github.com/CodeHalwell/Son-Of-Anton">Open project on GitHub</button>
						<button class="settings-link-button" type="button" data-action="open-settings-json" data-setting-id="@ext:son-of-anton.son-of-anton">Open all sota.* settings</button>
						<button class="settings-link-button settings-link-danger" type="button" data-action="reset-all-settings">Reset all Son of Anton settings…</button>
					</section>
				</div>
			</div>
		</div>

		<div class="chat-pane" id="pane-roster" data-pane="roster" role="tabpanel" hidden>
			<div class="roster-pane-shell">
				<div class="roster-pane-header">
					<div class="roster-pane-title">Specialists</div>
					<div class="roster-pane-subtitle">Pick a specialist to start chatting in their voice.</div>
				</div>
				<div class="roster-pane-grid" id="rosterPaneGrid"></div>
			</div>
		</div>

		<div class="composer-host" id="composerHost">
		<div class="composer">
			<button class="floating-stop" id="floatingStop" type="button" hidden title="Stop generating (Esc)" aria-label="Stop generating">
				<svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><rect x="4" y="4" width="8" height="8" rx="1.5"/></svg>
				<span>Stop generating</span>
			</button>
			<div class="composer-stack">
				<div class="popup slash-popup" id="slashPopup" hidden role="listbox" aria-label="Slash commands"></div>
				<div class="popup mention-popup" id="mentionPopup" hidden role="listbox" aria-label="Workspace mentions"></div>
				<div class="context-chips" id="contextChips"></div>
				<div class="composer-shell">
					<textarea class="composer-input" id="messageInput" placeholder="Ask Anton anything…" rows="3"></textarea>
					<div class="composer-toolbar">
						<button class="toolbar-chip" id="attachBtn" title="Add context" aria-label="Add context">
							<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M8 3v10M3 8h10"/></svg>
							<span>Add context</span>
						</button>
						<button class="toolbar-chip" id="agentChip" aria-haspopup="true">
							<span id="agentLabel">Anton</span>
							<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M4 6l4 4 4-4"/></svg>
						</button>
						<div class="plan-act-toggle" id="planActToggle" role="radiogroup" aria-label="Mode" data-mode="act" title="Plan or Act mode (Cmd+. / Ctrl+.)">
							<button class="plan-act-btn" id="planActBtnPlan" type="button" data-mode="plan" role="radio" aria-checked="false" tabindex="-1">Plan</button>
							<button class="plan-act-btn active" id="planActBtnAct" type="button" data-mode="act" role="radio" aria-checked="true" tabindex="0">Act</button>
						</div>
						<button class="toolbar-chip" id="modelChip" aria-haspopup="true">
							<span id="modelLabel">Sonnet</span>
							<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M4 6l4 4 4-4"/></svg>
						</button>
						<!-- Phase 4 — reasoning controls. The two chips below are
						     hidden by default and toggled in JS based on the active
						     model id. Keeping the markup permanent (vs. injecting on
						     demand) avoids re-rendering the toolbar on model swaps. -->
						<button class="toolbar-chip toolbar-chip-reasoning" id="reasoningEffortChip" aria-haspopup="true" hidden title="Reasoning effort">
							<span class="toolbar-chip-prefix">Effort:</span>
							<span id="reasoningEffortLabel">medium</span>
							<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M4 6l4 4 4-4"/></svg>
						</button>
						<button class="toolbar-chip toolbar-chip-thinking" id="thinkingBudgetChip" aria-haspopup="true" hidden title="Extended thinking budget">
							<span class="toolbar-chip-prefix">Think:</span>
							<span id="thinkingBudgetLabel">0</span>
							<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M4 6l4 4 4-4"/></svg>
						</button>
						<div class="popover" id="reasoningEffortMenu" hidden role="menu">
							<button class="popover-item" role="menuitem" data-effort="auto"><span class="item-check"></span>auto</button>
							<button class="popover-item" role="menuitem" data-effort="low"><span class="item-check"></span>low</button>
							<button class="popover-item" role="menuitem" data-effort="medium"><span class="item-check"></span>medium</button>
							<button class="popover-item" role="menuitem" data-effort="high"><span class="item-check"></span>high</button>
						</div>
						<div class="popover" id="thinkingBudgetMenu" hidden role="menu">
							<button class="popover-item" role="menuitem" data-budget="0"><span class="item-check"></span>off</button>
							<button class="popover-item" role="menuitem" data-budget="2000"><span class="item-check"></span>2K</button>
							<button class="popover-item" role="menuitem" data-budget="6000"><span class="item-check"></span>6K</button>
							<button class="popover-item" role="menuitem" data-budget="12000"><span class="item-check"></span>12K</button>
							<button class="popover-item" role="menuitem" data-budget="24000"><span class="item-check"></span>24K</button>
						</div>
						<div class="toolbar-spacer"></div>
						<button class="send-button is-empty" id="sendBtn" title="Send (Enter)" aria-label="Send">
							<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M8 13V3M3 8l5-5 5 5"/></svg>
						</button>
					</div>
				</div>
			</div>
		</div>

		<div class="composer-mode-note" id="composerModeNote" hidden role="status">
			Plan mode: Anton will draft a plan but won't run any tools.
		</div>

		<div class="status-bar">
			<span id="tokenCount">0 tokens</span>
			<span class="status-bar-session" id="sessionUsage" title="Session totals across this conversation. Resets when you switch or start a new chat." aria-label="Session usage totals">
				<span class="status-bar-session-label">Session</span>
				<span class="status-bar-session-tokens" id="sessionUsageTokens">0 tok</span>
				<span class="status-bar-session-divider" aria-hidden="true">·</span>
				<span class="status-bar-session-cost" id="sessionUsageCost">$0.00</span>
				<span class="status-bar-session-turns" id="sessionUsageTurns">0 turns</span>
			</span>
			<span id="costEstimate">$0.00</span>
		</div>
		</div>
		<!-- /composer-host -->

		<div class="popover" id="modelMenu" hidden role="menu">
			<div class="popover-section-label">Claude (latest)</div>
			<button class="popover-item" role="menuitem" data-model="claude-opus-4-7"><span class="item-check"></span>Claude Opus 4.7<span class="item-key">complex</span></button>
			<button class="popover-item" role="menuitem" data-model="claude-sonnet-4-7"><span class="item-check"></span>Claude Sonnet 4.7<span class="item-key">balanced</span></button>
			<button class="popover-item" role="menuitem" data-model="claude-haiku-4-7"><span class="item-check"></span>Claude Haiku 4.7<span class="item-key">fast</span></button>
			<div class="popover-section-label">Claude (older)</div>
			<button class="popover-item" role="menuitem" data-model="claude-sonnet-4-6"><span class="item-check"></span>Claude Sonnet 4.6<span class="item-key">prev</span></button>
			<button class="popover-item" role="menuitem" data-model="claude-sonnet-4-5"><span class="item-check"></span>Claude Sonnet 4.5<span class="item-key"></span></button>
			<button class="popover-item" role="menuitem" data-model="claude-opus-4-1"><span class="item-check"></span>Claude Opus 4.1<span class="item-key"></span></button>
			<button class="popover-item" role="menuitem" data-model="claude-3-7-sonnet"><span class="item-check"></span>Claude 3.7 Sonnet<span class="item-key"></span></button>
			<button class="popover-item" role="menuitem" data-model="claude-3-5-sonnet"><span class="item-check"></span>Claude 3.5 Sonnet<span class="item-key"></span></button>
			<button class="popover-item" role="menuitem" data-model="claude-3-5-haiku"><span class="item-check"></span>Claude 3.5 Haiku<span class="item-key"></span></button>
			<button class="popover-item" role="menuitem" data-model="claude-3-opus"><span class="item-check"></span>Claude 3 Opus<span class="item-key"></span></button>
			<button class="popover-item" role="menuitem" data-model="opus"><span class="item-check"></span>Opus (alias)<span class="item-key">legacy</span></button>
			<button class="popover-item" role="menuitem" data-model="sonnet"><span class="item-check"></span>Sonnet (alias)<span class="item-key">legacy</span></button>
			<button class="popover-item" role="menuitem" data-model="haiku"><span class="item-check"></span>Haiku (alias)<span class="item-key">legacy</span></button>
			<div class="popover-section-label">Claude Code (subscription)</div>
			<button class="popover-item" role="menuitem" data-model="claude-code-opus"><span class="item-check"></span>Opus via Claude Code<span class="item-key">subscription</span></button>
			<button class="popover-item" role="menuitem" data-model="claude-code-sonnet"><span class="item-check"></span>Sonnet via Claude Code<span class="item-key">subscription</span></button>
			<button class="popover-item" role="menuitem" data-model="claude-code-haiku"><span class="item-check"></span>Haiku via Claude Code<span class="item-key">subscription</span></button>
			<div class="popover-section-label">OpenAI — GPT-5 / 4.1 / 4o</div>
			<button class="popover-item" role="menuitem" data-model="gpt-5"><span class="item-check"></span>GPT-5<span class="item-key">flagship</span></button>
			<button class="popover-item" role="menuitem" data-model="gpt-5-mini"><span class="item-check"></span>GPT-5 mini<span class="item-key">balanced</span></button>
			<button class="popover-item" role="menuitem" data-model="gpt-5-nano"><span class="item-check"></span>GPT-5 nano<span class="item-key">cheap</span></button>
			<button class="popover-item" role="menuitem" data-model="gpt-5-codex"><span class="item-check"></span>GPT-5 Codex<span class="item-key">code</span></button>
			<button class="popover-item" role="menuitem" data-model="gpt-4-1"><span class="item-check"></span>GPT-4.1<span class="item-key"></span></button>
			<button class="popover-item" role="menuitem" data-model="gpt-4-1-mini"><span class="item-check"></span>GPT-4.1 mini<span class="item-key"></span></button>
			<button class="popover-item" role="menuitem" data-model="gpt-4-1-nano"><span class="item-check"></span>GPT-4.1 nano<span class="item-key"></span></button>
			<button class="popover-item" role="menuitem" data-model="gpt-4o"><span class="item-check"></span>GPT-4o<span class="item-key"></span></button>
			<button class="popover-item" role="menuitem" data-model="gpt-4o-mini"><span class="item-check"></span>GPT-4o mini<span class="item-key"></span></button>
			<button class="popover-item" role="menuitem" data-model="gpt-4-turbo"><span class="item-check"></span>GPT-4 Turbo<span class="item-key">legacy</span></button>
			<button class="popover-item" role="menuitem" data-model="gpt-3-5-turbo"><span class="item-check"></span>GPT-3.5 Turbo<span class="item-key">legacy</span></button>
			<div class="popover-section-label">OpenAI — Reasoning (o1 / o3 / o4)</div>
			<button class="popover-item" role="menuitem" data-model="o1"><span class="item-check"></span>o1<span class="item-key">reasoning</span></button>
			<button class="popover-item" role="menuitem" data-model="o1-pro"><span class="item-check"></span>o1 pro<span class="item-key">deep</span></button>
			<button class="popover-item" role="menuitem" data-model="o1-mini"><span class="item-check"></span>o1 mini<span class="item-key"></span></button>
			<button class="popover-item" role="menuitem" data-model="o3"><span class="item-check"></span>o3<span class="item-key">reasoning</span></button>
			<button class="popover-item" role="menuitem" data-model="o3-mini"><span class="item-check"></span>o3 mini<span class="item-key"></span></button>
			<button class="popover-item" role="menuitem" data-model="o4-mini"><span class="item-check"></span>o4 mini<span class="item-key"></span></button>
			<div class="popover-section-label">Microsoft Foundry / Azure</div>
			<button class="popover-item" role="menuitem" data-model="foundry-gpt-5"><span class="item-check"></span>Foundry GPT-5<span class="item-key">azure</span></button>
			<button class="popover-item" role="menuitem" data-model="foundry-gpt-5-mini"><span class="item-check"></span>Foundry GPT-5 mini<span class="item-key">azure</span></button>
			<button class="popover-item" role="menuitem" data-model="foundry-gpt-5-nano"><span class="item-check"></span>Foundry GPT-5 nano<span class="item-key">azure</span></button>
			<button class="popover-item" role="menuitem" data-model="foundry-gpt-4-1"><span class="item-check"></span>Foundry GPT-4.1<span class="item-key">azure</span></button>
			<button class="popover-item" role="menuitem" data-model="foundry-gpt-4-1-mini"><span class="item-check"></span>Foundry GPT-4.1 mini<span class="item-key">azure</span></button>
			<button class="popover-item" role="menuitem" data-model="foundry-gpt-4-1-nano"><span class="item-check"></span>Foundry GPT-4.1 nano<span class="item-key">azure</span></button>
			<button class="popover-item" role="menuitem" data-model="foundry-gpt-4o"><span class="item-check"></span>Foundry GPT-4o<span class="item-key">azure</span></button>
			<button class="popover-item" role="menuitem" data-model="foundry-gpt-4o-mini"><span class="item-check"></span>Foundry GPT-4o mini<span class="item-key">azure</span></button>
			<button class="popover-item" role="menuitem" data-model="foundry-gpt-4"><span class="item-check"></span>Foundry GPT-4<span class="item-key">azure</span></button>
			<button class="popover-item" role="menuitem" data-model="foundry-o1"><span class="item-check"></span>Foundry o1<span class="item-key">azure</span></button>
			<button class="popover-item" role="menuitem" data-model="foundry-o3"><span class="item-check"></span>Foundry o3<span class="item-key">azure</span></button>
			<button class="popover-item" role="menuitem" data-model="foundry-o4-mini"><span class="item-check"></span>Foundry o4 mini<span class="item-key">azure</span></button>
			<button class="popover-item" role="menuitem" data-model="foundry-claude-sonnet"><span class="item-check"></span>Foundry Claude Sonnet<span class="item-key">azure</span></button>
			<button class="popover-item" role="menuitem" data-model="foundry-mistral-large"><span class="item-check"></span>Foundry Mistral Large<span class="item-key">azure</span></button>
			<button class="popover-item" role="menuitem" data-model="foundry-llama-3-70b"><span class="item-check"></span>Foundry Llama 3 70B<span class="item-key">azure</span></button>
			<button class="popover-item" role="menuitem" data-model="foundry-phi-4"><span class="item-check"></span>Foundry Phi-4<span class="item-key">azure</span></button>
			<button class="popover-item" role="menuitem" data-model="foundry-custom"><span class="item-check"></span>Foundry (custom deployment)<span class="item-key">azure</span></button>
			<div class="popover-section-label">Amazon Bedrock</div>
			<button class="popover-item" role="menuitem" data-model="bedrock-claude-opus-4"><span class="item-check"></span>Bedrock Claude Opus 4<span class="item-key">aws</span></button>
			<button class="popover-item" role="menuitem" data-model="bedrock-claude-sonnet-4"><span class="item-check"></span>Bedrock Claude Sonnet 4<span class="item-key">aws</span></button>
			<button class="popover-item" role="menuitem" data-model="bedrock-claude-haiku-4"><span class="item-check"></span>Bedrock Claude Haiku 4<span class="item-key">aws</span></button>
			<button class="popover-item" role="menuitem" data-model="bedrock-claude-3-7-sonnet"><span class="item-check"></span>Bedrock Claude 3.7 Sonnet<span class="item-key">aws</span></button>
			<button class="popover-item" role="menuitem" data-model="bedrock-claude-sonnet"><span class="item-check"></span>Bedrock Claude 3.5 Sonnet<span class="item-key">aws</span></button>
			<button class="popover-item" role="menuitem" data-model="bedrock-claude-haiku"><span class="item-check"></span>Bedrock Claude 3.5 Haiku<span class="item-key">aws</span></button>
			<button class="popover-item" role="menuitem" data-model="bedrock-llama-3-1-70b"><span class="item-check"></span>Bedrock Llama 3.1 70B<span class="item-key">aws</span></button>
			<button class="popover-item" role="menuitem" data-model="bedrock-llama-3-1-8b"><span class="item-check"></span>Bedrock Llama 3.1 8B<span class="item-key">aws</span></button>
			<button class="popover-item" role="menuitem" data-model="bedrock-llama-3-70b"><span class="item-check"></span>Bedrock Llama 3 70B<span class="item-key">aws</span></button>
			<button class="popover-item" role="menuitem" data-model="bedrock-mistral-large"><span class="item-check"></span>Bedrock Mistral Large<span class="item-key">aws</span></button>
			<button class="popover-item" role="menuitem" data-model="bedrock-cohere-command-r-plus"><span class="item-check"></span>Bedrock Cohere Command R+<span class="item-key">aws</span></button>
			<button class="popover-item" role="menuitem" data-model="bedrock-titan-text-express"><span class="item-check"></span>Bedrock Titan Text Express<span class="item-key">aws</span></button>
			<button class="popover-item" role="menuitem" data-model="bedrock-nova-pro"><span class="item-check"></span>Bedrock Nova Pro<span class="item-key">aws</span></button>
			<button class="popover-item" role="menuitem" data-model="bedrock-nova-lite"><span class="item-check"></span>Bedrock Nova Lite<span class="item-key">aws</span></button>
			<button class="popover-item" role="menuitem" data-model="bedrock-nova-micro"><span class="item-check"></span>Bedrock Nova Micro<span class="item-key">aws</span></button>
			<div class="popover-section-label">Google Gemini</div>
			<button class="popover-item" role="menuitem" data-model="gemini-3-1-pro-preview"><span class="item-check"></span>Gemini 3.1 Pro (preview)<span class="item-key">google</span></button>
			<button class="popover-item" role="menuitem" data-model="gemini-3-1-flash-lite"><span class="item-check"></span>Gemini 3.1 Flash Lite<span class="item-key">google</span></button>
			<button class="popover-item" role="menuitem" data-model="gemini-3-1-flash-live-preview"><span class="item-check"></span>Gemini 3.1 Flash Live (preview)<span class="item-key">google</span></button>
			<button class="popover-item" role="menuitem" data-model="gemini-3-flash-preview"><span class="item-check"></span>Gemini 3 Flash (preview)<span class="item-key">google</span></button>
			<button class="popover-item" role="menuitem" data-model="gemini-deep-research-preview"><span class="item-check"></span>Deep Research (preview)<span class="item-key">google</span></button>
			<button class="popover-item" role="menuitem" data-model="gemini-deep-research-max-preview"><span class="item-check"></span>Deep Research Max (preview)<span class="item-key">google</span></button>
			<button class="popover-item" role="menuitem" data-model="gemma-4-31b-it"><span class="item-check"></span>Gemma 4 31B (instruction-tuned)<span class="item-key">google</span></button>
			<button class="popover-item" role="menuitem" data-model="gemini-2-5-pro"><span class="item-check"></span>Gemini 2.5 Pro<span class="item-key">google</span></button>
			<button class="popover-item" role="menuitem" data-model="gemini-2-5-flash"><span class="item-check"></span>Gemini 2.5 Flash<span class="item-key">google</span></button>
			<button class="popover-item" role="menuitem" data-model="gemini-2-0-pro"><span class="item-check"></span>Gemini 2.0 Pro<span class="item-key">google</span></button>
			<button class="popover-item" role="menuitem" data-model="gemini-2-0-flash"><span class="item-check"></span>Gemini 2.0 Flash<span class="item-key">google</span></button>
			<button class="popover-item" role="menuitem" data-model="gemini-2-0-flash-lite"><span class="item-check"></span>Gemini 2.0 Flash Lite<span class="item-key">google</span></button>
			<button class="popover-item" role="menuitem" data-model="gemini-1-5-pro"><span class="item-check"></span>Gemini 1.5 Pro<span class="item-key">google</span></button>
			<button class="popover-item" role="menuitem" data-model="gemini-1-5-flash"><span class="item-check"></span>Gemini 1.5 Flash<span class="item-key">google</span></button>
			<div class="popover-section-label">OpenRouter</div>
			<button class="popover-item" role="menuitem" data-model="openrouter-claude-opus-4-7"><span class="item-check"></span>Claude Opus 4.7 (OpenRouter)<span class="item-key">router</span></button>
			<button class="popover-item" role="menuitem" data-model="openrouter-claude-sonnet-4-7"><span class="item-check"></span>Claude Sonnet 4.7 (OpenRouter)<span class="item-key">router</span></button>
			<button class="popover-item" role="menuitem" data-model="openrouter-gpt-5"><span class="item-check"></span>GPT-5 (OpenRouter)<span class="item-key">router</span></button>
			<button class="popover-item" role="menuitem" data-model="openrouter-llama-3-1-405b"><span class="item-check"></span>Llama 3.1 405B (OpenRouter)<span class="item-key">router</span></button>
			<button class="popover-item" role="menuitem" data-model="openrouter-deepseek-v3"><span class="item-check"></span>DeepSeek V3 (OpenRouter)<span class="item-key">router</span></button>
			<button class="popover-item" role="menuitem" data-model="openrouter-mistral-large"><span class="item-check"></span>Mistral Large (OpenRouter)<span class="item-key">router</span></button>
			<button class="popover-item" role="menuitem" data-model="openrouter-qwen-2-5-coder"><span class="item-check"></span>Qwen 2.5 Coder (OpenRouter)<span class="item-key">router</span></button>
			<button class="popover-item" role="menuitem" data-model="openrouter-grok-2"><span class="item-check"></span>Grok 2 (OpenRouter)<span class="item-key">router</span></button>
			<button class="popover-item" role="menuitem" data-model="openrouter-custom"><span class="item-check"></span>OpenRouter (custom)<span class="item-key">router</span></button>
			<div class="popover-section-label">Ollama (local)</div>
			<button class="popover-item" role="menuitem" data-model="ollama-llama-3-1"><span class="item-check"></span>Llama 3.1 (Ollama)<span class="item-key">local</span></button>
			<button class="popover-item" role="menuitem" data-model="ollama-qwen-2-5-coder"><span class="item-check"></span>Qwen 2.5 Coder (Ollama)<span class="item-key">local</span></button>
			<button class="popover-item" role="menuitem" data-model="ollama-deepseek-r1"><span class="item-check"></span>DeepSeek R1 (Ollama)<span class="item-key">local</span></button>
			<button class="popover-item" role="menuitem" data-model="ollama-custom"><span class="item-check"></span>Ollama (custom)<span class="item-key">local</span></button>
			<div class="popover-section-label">LM Studio (local)</div>
			<button class="popover-item" role="menuitem" data-model="lmstudio-loaded"><span class="item-check"></span>LM Studio (loaded model)<span class="item-key">local</span></button>
			<button class="popover-item" role="menuitem" data-model="lmstudio-custom"><span class="item-check"></span>LM Studio (custom)<span class="item-key">local</span></button>
			<div class="popover-section-label">DeepSeek</div>
			<button class="popover-item" role="menuitem" data-model="deepseek-v3"><span class="item-check"></span>DeepSeek V3<span class="item-key">cheap</span></button>
			<button class="popover-item" role="menuitem" data-model="deepseek-r1"><span class="item-check"></span>DeepSeek R1<span class="item-key">reasoning</span></button>
			<div class="popover-section-label">Mistral</div>
			<button class="popover-item" role="menuitem" data-model="mistral-large"><span class="item-check"></span>Mistral Large<span class="item-key">flagship</span></button>
			<button class="popover-item" role="menuitem" data-model="mistral-small"><span class="item-check"></span>Mistral Small<span class="item-key">cheap</span></button>
			<button class="popover-item" role="menuitem" data-model="codestral"><span class="item-check"></span>Codestral<span class="item-key">code</span></button>
			<button class="popover-item" role="menuitem" data-model="mistral-pixtral"><span class="item-check"></span>Pixtral Large<span class="item-key">vision</span></button>
			<div class="popover-section-label">Groq (fast)</div>
			<button class="popover-item" role="menuitem" data-model="groq-llama-3-3-70b"><span class="item-check"></span>Llama 3.3 70B (Groq)<span class="item-key">fast</span></button>
			<button class="popover-item" role="menuitem" data-model="groq-llama-3-1-8b"><span class="item-check"></span>Llama 3.1 8B (Groq)<span class="item-key">fast</span></button>
			<button class="popover-item" role="menuitem" data-model="groq-mixtral-8x7b"><span class="item-check"></span>Mixtral 8x7B (Groq)<span class="item-key">fast</span></button>
			<button class="popover-item" role="menuitem" data-model="groq-deepseek-r1-llama-70b"><span class="item-check"></span>DeepSeek R1 Llama 70B (Groq)<span class="item-key">fast</span></button>
			<div class="popover-section-label">Cerebras (fastest)</div>
			<button class="popover-item" role="menuitem" data-model="cerebras-llama-3-3-70b"><span class="item-check"></span>Llama 3.3 70B (Cerebras)<span class="item-key">wafer</span></button>
			<button class="popover-item" role="menuitem" data-model="cerebras-llama-3-1-8b"><span class="item-check"></span>Llama 3.1 8B (Cerebras)<span class="item-key">wafer</span></button>
			<div class="popover-section-label">Together AI</div>
			<button class="popover-item" role="menuitem" data-model="together-llama-3-1-405b"><span class="item-check"></span>Llama 3.1 405B (Together)<span class="item-key">together</span></button>
			<button class="popover-item" role="menuitem" data-model="together-qwen-2-5-coder"><span class="item-check"></span>Qwen 2.5 Coder (Together)<span class="item-key">code</span></button>
			<button class="popover-item" role="menuitem" data-model="together-mixtral-8x22b"><span class="item-check"></span>Mixtral 8x22B (Together)<span class="item-key">together</span></button>
			<button class="popover-item" role="menuitem" data-model="together-custom"><span class="item-check"></span>Together (custom)<span class="item-key">together</span></button>
			<div class="popover-section-label">Fireworks AI</div>
			<button class="popover-item" role="menuitem" data-model="fireworks-llama-3-1-405b"><span class="item-check"></span>Llama 3.1 405B (Fireworks)<span class="item-key">fireworks</span></button>
			<button class="popover-item" role="menuitem" data-model="fireworks-deepseek-v3"><span class="item-check"></span>DeepSeek V3 (Fireworks)<span class="item-key">fireworks</span></button>
			<button class="popover-item" role="menuitem" data-model="fireworks-qwen-2-5-coder"><span class="item-check"></span>Qwen 2.5 Coder (Fireworks)<span class="item-key">code</span></button>
			<button class="popover-item" role="menuitem" data-model="fireworks-custom"><span class="item-check"></span>Fireworks (custom)<span class="item-key">fireworks</span></button>
			<div class="popover-section-label">OpenAI Codex CLI (subscription)</div>
			<button class="popover-item" role="menuitem" data-model="codex-gpt-5"><span class="item-check"></span>GPT-5 via Codex CLI<span class="item-key">subscription</span></button>
			<button class="popover-item" role="menuitem" data-model="codex-gpt-5-mini"><span class="item-check"></span>GPT-5 mini via Codex CLI<span class="item-key">subscription</span></button>
			<button class="popover-item" role="menuitem" data-model="codex-gpt-5-codex"><span class="item-check"></span>GPT-5 Codex via Codex CLI<span class="item-key">subscription</span></button>
		</div>

		<div class="popover" id="agentMenu" hidden role="menu">
			<!-- populated by JS from SPECIALIST_ROLES -->
		</div>

		<div class="popover" id="attachMenu" hidden role="menu">
			<button class="popover-item" role="menuitem" data-attach="current-file" data-label="Current file">Current file</button>
			<button class="popover-item" role="menuitem" data-attach="current-selection" data-label="Selection">Selection</button>
			<button class="popover-item" role="menuitem" data-attach="terminal-output" data-label="Terminal output">Terminal output</button>
			<button class="popover-item" role="menuitem" data-attach="image" data-label="Image">Image…</button>
		</div>

	</div>

	<script type="application/json" id="specialistRolesData" nonce="${nonce}">${specialistRolesJson}</script>
	<script type="application/json" id="personasData" nonce="${nonce}">${personasJson}</script>
	<script type="application/json" id="rosterData" nonce="${nonce}">${rosterJson}</script>
	<script type="application/json" id="slashCommandsData" nonce="${nonce}">${slashCommandsJson}</script>
	<script type="application/json" id="modelMetadataData" nonce="${nonce}">${modelMetadataJson}</script>

	<script nonce="${nonce}" src="${webviewJsUri}"></script>
</body>
</html>`;
	}

}

/**
 * Convert an AgentPlan into a postMessage-safe payload (plain arrays/objects,
 * no readonly modifiers) so the webview JSON serialiser handles it cleanly.
 */
function serialisePlan(plan: AgentPlan): { subtasks: Array<{ instruction: string; assignee: string; scopeFiles: string[]; dependencies: string[] }> } {
	return {
		subtasks: plan.subtasks.map(s => ({
			instruction: s.instruction,
			assignee: s.assignee,
			scopeFiles: [...s.scopeFiles],
			dependencies: [...s.dependencies],
		})),
	};
}

/**
 * Apply a unified-diff patch to an original text and return the proposed
 * result. Pure function (no I/O) so it's testable in isolation.
 *
 * Supports standard unified diffs with one or more hunks of the form:
 *
 *     @@ -<origStart>,<origLen> +<newStart>,<newLen> @@
 *      context line
 *     -removed line
 *     +added line
 *
 * Hunk lines outside the recognised prefixes (` `, `-`, `+`, `\`) end the
 * current hunk so trailing junk doesn't bleed into the output. A defensive
 * mismatch between a context/removal line and the original file throws,
 * letting the caller surface a meaningful error.
 */
export function applyUnifiedDiff(originalContent: string, diffText: string): string {
	const original = originalContent.split('\n');
	const diffLines = diffText.split('\n');
	const result: string[] = [];
	let cursor = 0; // 0-based index into `original`
	let i = 0;

	while (i < diffLines.length) {
		const line = diffLines[i];
		const hunkHeader = /^@@\s+-(\d+)(?:,\d+)?\s+\+(\d+)(?:,\d+)?\s+@@/.exec(line);
		if (!hunkHeader) {
			i++;
			continue;
		}

		const origStart = Math.max(0, parseInt(hunkHeader[1], 10) - 1);
		// Pass through any unchanged lines between the previous hunk and this one.
		while (cursor < origStart && cursor < original.length) {
			result.push(original[cursor++]);
		}
		i++;

		while (i < diffLines.length) {
			const body = diffLines[i];
			if (body.startsWith('@@')) {
				break;
			}
			const prefix = body.charAt(0);
			const content = body.slice(1);
			if (prefix === ' ') {
				if (cursor >= original.length || original[cursor] !== content) {
					throw new Error(`Hunk context mismatch at line ${cursor + 1}`);
				}
				result.push(original[cursor++]);
			} else if (prefix === '-') {
				if (cursor >= original.length || original[cursor] !== content) {
					throw new Error(`Hunk context mismatch at line ${cursor + 1}`);
				}
				cursor++;
			} else if (prefix === '+') {
				result.push(content);
			} else if (prefix === '\\') {
				// e.g. "\ No newline at end of file" — informational, skip.
			} else {
				// Anything else (blank line, narrative text) terminates the hunk.
				break;
			}
			i++;
		}
	}

	// Pass through any trailing original lines beyond the last hunk.
	while (cursor < original.length) {
		result.push(original[cursor++]);
	}

	return result.join('\n');
}

/**
 * Panel-mode entry point preserved for the `sota.openChat` command. Opens the
 * chat as an editor-area webview panel beside the current editor.
 */
export class ChatPanel {
	private static currentPanel: vscode.WebviewPanel | undefined;

	static createOrShow(
		context: vscode.ExtensionContext,
		conversationStore: ConversationStore,
		llmClient: LlmClient,
		toolRegistry: ToolRegistry,
		agentBridge?: AgentBridge,
		workspaceContext?: WorkspaceContextProvider,
		costReporter?: CostReporter,
		checkpointManager?: CheckpointManager,
		credentialBroker?: CredentialBroker,
		taskBoardModel?: TaskBoardModel,
		writeSnapshotStore?: WriteSnapshotStore,
		hookRunner?: HookRunner,
	): void {
		if (ChatPanel.currentPanel) {
			ChatPanel.currentPanel.reveal(vscode.ViewColumn.Beside);
			return;
		}

		const panel = vscode.window.createWebviewPanel(
			'sotaChat',
			'Son of Anton Chat',
			vscode.ViewColumn.Beside,
			{
				enableScripts: true,
				retainContextWhenHidden: true,
				localResourceRoots: [
					vscode.Uri.joinPath(context.extensionUri, 'media'),
				],
			},
		);

		const session = new ChatSession(panel.webview, context.extensionUri, conversationStore, llmClient, toolRegistry, agentBridge, workspaceContext, costReporter, undefined, checkpointManager, context.secrets, credentialBroker, taskBoardModel, writeSnapshotStore, hookRunner);

		panel.onDidDispose(() => {
			session.dispose();
			ChatPanel.currentPanel = undefined;
		});

		ChatPanel.currentPanel = panel;
	}

	/**
	 * Clear the active session(s) by starting a fresh conversation in each.
	 * The previous conversation is preserved in the store so it remains
	 * browsable from the History view.
	 */
	static clearConversation(): void {
		for (const session of ACTIVE_SESSIONS) {
			session.clearConversation();
		}
	}

	/**
	 * Forward a "switch to this conversation" request to every active session.
	 * Used by `sota.openConversation` so clicking an entry in the History
	 * sidebar updates whichever chat surfaces are currently open.
	 */
	static switchConversation(id: string): void {
		for (const session of ACTIVE_SESSIONS) {
			session.switchConversation(id);
		}
	}

	/**
	 * Abort the in-flight stream and any pending approval prompts in every
	 * active session. Used by checkpoint restore (palette path) so a chat
	 * loop in flight doesn't continue writing into a freshly rewritten
	 * working tree.
	 */
	static abortAll(): void {
		for (const session of ACTIVE_SESSIONS) {
			session.abortInFlight();
		}
	}

	/**
	 * Reload the conversation from the store in every active session — used
	 * after a checkpoint restore with `conversationToo: true` so any open
	 * chat surfaces drop the trimmed messages.
	 */
	static reloadCurrentConversations(): void {
		for (const session of ACTIVE_SESSIONS) {
			session.reloadCurrentConversation();
		}
	}

	/**
	 * Fan the `showAntonIsWatching` overlay out to every active chat
	 * session. Returns `true` if at least one session was reachable so the
	 * caller can decide whether to fall back to a plain VS Code
	 * notification when no chat surface is open.
	 */
	static broadcastAntonIsWatching(text: string): boolean {
		let posted = false;
		for (const session of ACTIVE_SESSIONS) {
			if (session.postAntonIsWatching(text)) {
				posted = true;
			}
		}
		return posted;
	}

	/**
	 * Import a CLI-authored conversation (read from
	 * `~/.son-of-anton/data/conversations/cli-<id>.json`) into the IDE's
	 * {@link ConversationStore} as a fresh editable conversation, then
	 * broadcast the switch to every active chat session so the new entry
	 * is surfaced immediately.
	 *
	 * The bridge is intentionally one-way: future writes to the same CLI
	 * file do *not* propagate to the imported IDE record, and edits in
	 * the IDE do *not* mirror back to the CLI. This keeps the cross-
	 * surface contract simple — read CLI, write IDE — and avoids the
	 * conflict-resolution rabbit hole that two-way sync would open.
	 *
	 * Returns `true` on success and `false` if the file was missing,
	 * malformed, or otherwise unreadable. The caller is responsible for
	 * surfacing user-visible feedback when this happens.
	 */
	static async openCliConversation(
		cliId: string,
		conversationStore: ConversationStore,
	): Promise<boolean> {
		if (typeof cliId !== 'string' || !cliId) {
			return false;
		}
		const cliRecord = await loadCliConversation(cliId);
		if (!cliRecord) {
			return false;
		}
		const fresh = conversationStore.create(cliRecord.messages);
		ChatPanel.switchConversation(fresh.summary.id);
		void vscode.window.showInformationMessage(
			'Imported CLI session into a new IDE conversation.',
		);
		return true;
	}
}
