/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

		const vscode = acquireVsCodeApi();
		const messageList = document.getElementById('messageList');
		const emptyState = document.getElementById('emptyState');
		const messageInput = document.getElementById('messageInput');
		const sendBtn = document.getElementById('sendBtn');
		const newChatBtn = document.getElementById('newChatBtn');
		const tokenCount = document.getElementById('tokenCount');
		const costEstimate = document.getElementById('costEstimate');
		const attachBtn = document.getElementById('attachBtn');
		const attachMenu = document.getElementById('attachMenu');
		const modelChip = document.getElementById('modelChip');
		const modelMenu = document.getElementById('modelMenu');
		const modelLabel = document.getElementById('modelLabel');
		const agentChip = document.getElementById('agentChip');
		const agentMenu = document.getElementById('agentMenu');
		const agentLabel = document.getElementById('agentLabel');
		// Plan/Act mode toggle (Phase 58). A two-button pill — Plan | Act —
		// sitting in the composer toolbar to the LEFT of the model selector.
		// `planActToggle` is the wrapper that carries `data-mode` for styling
		// hooks; `planActButtons` is the NodeList we iterate to update active
		// state. Both refs may be null on legacy fragments.
		const planActToggle = document.getElementById('planActToggle');
		const planActButtons = document.querySelectorAll('.plan-act-btn');
		const composerModeNote = document.getElementById('composerModeNote');
		const contextChips = document.getElementById('contextChips');
		const hdrConn = document.getElementById('hdrConn');
		const hdrConnLabel = document.getElementById('hdrConnLabel');
		const hdrSubtitle = document.getElementById('hdrSubtitle');
		const emptyStateReady = document.getElementById('emptyStateReady');
		const emptyStateAuth = document.getElementById('emptyStateAuth');
		const slashPopup = document.getElementById('slashPopup');
		const mentionPopup = document.getElementById('mentionPopup');
		const floatingStop = document.getElementById('floatingStop');
		const hdrCost = document.getElementById('hdrCost');
		const hdrCostTokens = document.getElementById('hdrCostTokens');
		const hdrCostDollars = document.getElementById('hdrCostDollars');
		const hdrCostPulse = document.getElementById('hdrCostPulse');
		const hdrCostPopover = document.getElementById('hdrCostPopover');
		const hdrCostPopoverBody = document.getElementById('hdrCostPopoverBody');
		const hdrCostPopoverReset = document.getElementById('hdrCostPopoverReset');
		const settingsBtn = document.getElementById('settingsBtn');
		const exportBtn = document.getElementById('exportBtn');
		const chatSettingsView = document.getElementById('chatSettingsView');
		const emptyStateProviders = document.getElementById('emptyStateProviders');
		const providerFormHost = document.getElementById('providerFormHost');
		const settingsProviders = document.getElementById('settingsProviders');
		const emptyStateSettingsLink = document.getElementById('emptyStateSettingsLink');
		const mcpServersList = document.getElementById('mcpServersList');
		const mcpServersEmpty = document.getElementById('mcpServersEmpty');
		const mcpServerFormHost = document.getElementById('mcpServerFormHost');
		// Tab bar surfaces. The chat surface is split into 5 panes — only one
		// is visible at a time. Each pane is a sibling of the message-list /
		// composer so tab switching is a pure visibility flip with no DOM
		// teardown.
		const chatTabsBar = document.querySelector('.chat-tabs');
		const chatPanes = Array.from(document.querySelectorAll('.chat-pane'));
		const composerHost = document.getElementById('composerHost');
		const tasksPaneList = document.getElementById('tasksPaneList');
		const tasksPaneEmpty = document.getElementById('tasksPaneEmpty');
		const tasksPaneCounts = document.getElementById('tasksPaneCounts');
		const tasksOpenBoardBtn = document.getElementById('tasksOpenBoardBtn');
		const historyPaneList = document.getElementById('historyPaneList');
		const historyPaneEmpty = document.getElementById('historyPaneEmpty');
		const historyNewBtn = document.getElementById('historyNewBtn');
		const rosterPaneGrid = document.getElementById('rosterPaneGrid');

		const MODEL_LABELS = {
			// Anthropic — short aliases (kept for legacy sessions/CLI defaults).
			opus: 'Opus',
			sonnet: 'Sonnet',
			haiku: 'Haiku',
			// Anthropic — Claude 4.x family.
			'claude-opus-4-7': 'Claude Opus 4.7',
			'claude-sonnet-4-7': 'Claude Sonnet 4.7',
			'claude-haiku-4-7': 'Claude Haiku 4.7',
			'claude-opus-4-6': 'Claude Opus 4.6',
			'claude-sonnet-4-6': 'Claude Sonnet 4.6',
			'claude-haiku-4-6': 'Claude Haiku 4.6',
			'claude-opus-4-5': 'Claude Opus 4.5',
			'claude-sonnet-4-5': 'Claude Sonnet 4.5',
			'claude-haiku-4-5': 'Claude Haiku 4.5',
			'claude-opus-4-1': 'Claude Opus 4.1',
			'claude-sonnet-4-1': 'Claude Sonnet 4.1',
			'claude-opus-4': 'Claude Opus 4',
			'claude-sonnet-4': 'Claude Sonnet 4',
			'claude-3-7-sonnet': 'Claude 3.7 Sonnet',
			'claude-3-5-sonnet': 'Claude 3.5 Sonnet',
			'claude-3-5-haiku': 'Claude 3.5 Haiku',
			'claude-3-opus': 'Claude 3 Opus',
			'claude-3-sonnet': 'Claude 3 Sonnet',
			'claude-3-haiku': 'Claude 3 Haiku',
			// OpenAI.
			'gpt-4o': 'GPT-4o',
			'gpt-4o-mini': 'GPT-4o mini',
			'gpt-5': 'GPT-5',
			'gpt-5-mini': 'GPT-5 mini',
			'gpt-5-nano': 'GPT-5 nano',
			'gpt-5-codex': 'GPT-5 Codex',
			'gpt-4-1': 'GPT-4.1',
			'gpt-4-1-mini': 'GPT-4.1 mini',
			'gpt-4-1-nano': 'GPT-4.1 nano',
			'gpt-4-turbo': 'GPT-4 Turbo',
			'gpt-3-5-turbo': 'GPT-3.5 Turbo',
			'o1': 'o1',
			'o1-mini': 'o1 mini',
			'o1-pro': 'o1 pro',
			'o3': 'o3',
			'o3-mini': 'o3 mini',
			'o4-mini': 'o4 mini',
			// Microsoft Foundry.
			'foundry-gpt-5': 'Foundry GPT-5',
			'foundry-gpt-5-mini': 'Foundry GPT-5 mini',
			'foundry-gpt-5-nano': 'Foundry GPT-5 nano',
			'foundry-gpt-4': 'Foundry GPT-4',
			'foundry-gpt-4o': 'Foundry GPT-4o',
			'foundry-gpt-4o-mini': 'Foundry GPT-4o mini',
			'foundry-gpt-4-1': 'Foundry GPT-4.1',
			'foundry-gpt-4-1-mini': 'Foundry GPT-4.1 mini',
			'foundry-gpt-4-1-nano': 'Foundry GPT-4.1 nano',
			'foundry-o1': 'Foundry o1',
			'foundry-o1-mini': 'Foundry o1 mini',
			'foundry-o3': 'Foundry o3',
			'foundry-o3-mini': 'Foundry o3 mini',
			'foundry-o4-mini': 'Foundry o4 mini',
			'foundry-claude-sonnet': 'Foundry Claude Sonnet',
			'foundry-mistral-large': 'Foundry Mistral Large',
			'foundry-llama-3-70b': 'Foundry Llama 3 70B',
			'foundry-phi-4': 'Foundry Phi-4',
			'foundry-custom': 'Foundry (custom deployment)',
			// Amazon Bedrock.
			'bedrock-claude-opus-4': 'Bedrock Claude Opus 4',
			'bedrock-claude-sonnet-4': 'Bedrock Claude Sonnet 4',
			'bedrock-claude-haiku-4': 'Bedrock Claude Haiku 4',
			'bedrock-claude-3-7-sonnet': 'Bedrock Claude 3.7 Sonnet',
			'bedrock-claude-sonnet': 'Bedrock Claude 3.5 Sonnet',
			'bedrock-claude-haiku': 'Bedrock Claude 3.5 Haiku',
			'bedrock-llama-3-1-70b': 'Bedrock Llama 3.1 70B',
			'bedrock-llama-3-1-8b': 'Bedrock Llama 3.1 8B',
			'bedrock-llama-3-70b': 'Bedrock Llama 3 70B',
			'bedrock-mistral-large': 'Bedrock Mistral Large',
			'bedrock-titan-text-express': 'Bedrock Titan Text Express',
			'bedrock-cohere-command-r-plus': 'Bedrock Cohere Command R+',
			'bedrock-nova-pro': 'Bedrock Nova Pro',
			'bedrock-nova-lite': 'Bedrock Nova Lite',
			'bedrock-nova-micro': 'Bedrock Nova Micro',
			// Google Gemini.
			'gemini-2-5-pro': 'Gemini 2.5 Pro',
			'gemini-2-5-flash': 'Gemini 2.5 Flash',
			'gemini-2-0-pro': 'Gemini 2.0 Pro',
			'gemini-2-0-flash': 'Gemini 2.0 Flash',
			'gemini-2-0-flash-lite': 'Gemini 2.0 Flash Lite',
			'gemini-1-5-pro': 'Gemini 1.5 Pro',
			'gemini-1-5-flash': 'Gemini 1.5 Flash',
			// Claude Code (subscription).
			'claude-code-opus': 'Opus via Claude Code',
			'claude-code-sonnet': 'Sonnet via Claude Code',
			'claude-code-haiku': 'Haiku via Claude Code',
			// OpenRouter.
			'openrouter-claude-opus-4-7': 'Claude Opus 4.7 (OpenRouter)',
			'openrouter-claude-sonnet-4-7': 'Claude Sonnet 4.7 (OpenRouter)',
			'openrouter-gpt-5': 'GPT-5 (OpenRouter)',
			'openrouter-llama-3-1-405b': 'Llama 3.1 405B (OpenRouter)',
			'openrouter-deepseek-v3': 'DeepSeek V3 (OpenRouter)',
			'openrouter-mistral-large': 'Mistral Large (OpenRouter)',
			'openrouter-qwen-2-5-coder': 'Qwen 2.5 Coder (OpenRouter)',
			'openrouter-grok-2': 'Grok 2 (OpenRouter)',
			'openrouter-custom': 'OpenRouter (custom)',
			// Ollama (local).
			'ollama-llama-3-1': 'Llama 3.1 (Ollama)',
			'ollama-qwen-2-5-coder': 'Qwen 2.5 Coder (Ollama)',
			'ollama-deepseek-r1': 'DeepSeek R1 (Ollama)',
			'ollama-custom': 'Ollama (custom)',
			// LM Studio (local).
			'lmstudio-loaded': 'LM Studio (loaded model)',
			'lmstudio-custom': 'LM Studio (custom)',
			// DeepSeek.
			'deepseek-v3': 'DeepSeek V3',
			'deepseek-r1': 'DeepSeek R1',
			// Mistral.
			'mistral-large': 'Mistral Large',
			'mistral-small': 'Mistral Small',
			'codestral': 'Codestral',
			'mistral-pixtral': 'Pixtral Large',
			// Groq.
			'groq-llama-3-3-70b': 'Llama 3.3 70B (Groq)',
			'groq-llama-3-1-8b': 'Llama 3.1 8B (Groq)',
			'groq-mixtral-8x7b': 'Mixtral 8x7B (Groq)',
			'groq-deepseek-r1-llama-70b': 'DeepSeek R1 Llama 70B (Groq)',
			// Cerebras.
			'cerebras-llama-3-3-70b': 'Llama 3.3 70B (Cerebras)',
			'cerebras-llama-3-1-8b': 'Llama 3.1 8B (Cerebras)',
			// Together AI.
			'together-llama-3-1-405b': 'Llama 3.1 405B (Together)',
			'together-qwen-2-5-coder': 'Qwen 2.5 Coder (Together)',
			'together-mixtral-8x22b': 'Mixtral 8x22B (Together)',
			'together-custom': 'Together (custom)',
			// Fireworks.
			'fireworks-llama-3-1-405b': 'Llama 3.1 405B (Fireworks)',
			'fireworks-deepseek-v3': 'DeepSeek V3 (Fireworks)',
			'fireworks-qwen-2-5-coder': 'Qwen 2.5 Coder (Fireworks)',
			'fireworks-custom': 'Fireworks (custom)',
			// OpenAI Codex CLI (subscription).
			'codex-gpt-5': 'GPT-5 via Codex CLI',
			'codex-gpt-5-mini': 'GPT-5 mini via Codex CLI',
			'codex-gpt-5-codex': 'GPT-5 Codex via Codex CLI',
		};
		const ATTACH_LABELS = { 'current-file': 'Current file', 'current-selection': 'Selection', 'terminal-output': 'Terminal output' };

		// Generative-UI renderer registry. Keyed by component name; each value
		// is a `(props, helpers) => HTMLElement` function that builds and
		// returns the block's root DOM node. See docs/generative-ui.md for
		// the per-component prop shape and how to add a new renderer.
		// `helpers` carries:
		//   - blockId: the stable block id minted host-side
		//   - respond(value): post a `uiBlockResponse` for form/confirm flows
		//   - onAction(name, payload): post a `uiBlockAction` for card actions
		// Renderers must escape any user/LLM-supplied strings before
		// injecting into HTML — use the existing `escapeHtml` helper.
		const GENERATIVE_UI_RENDERERS = Object.create(null);

		// Specialist roles are injected as JSON by the host so we don't need a
		// round-trip to populate the menu. Defensive: an empty/invalid blob
		// falls back to a single 'anton' entry so the chip still works.
		let SPECIALISTS = [];
		try {
			const raw = document.getElementById('specialistRolesData');
			SPECIALISTS = raw ? JSON.parse(raw.textContent) : [];
		} catch (e) {
			SPECIALISTS = [];
		}
		if (!Array.isArray(SPECIALISTS) || SPECIALISTS.length === 0) {
			SPECIALISTS = [{ id: 'anton', displayName: 'Anton', description: '', roleDescription: '' }];
		}

		// Per-specialist visual identity (avatar, accent colour, tagline).
		// Indexed by id so `buildAssistantMeta` can look up the persona for
		// every assistant bubble without scanning the array on each render.
		// An unknown id falls back to a generic muted "?" avatar — see
		// `buildAssistantMeta`.
		const PERSONAS_BY_ID = Object.create(null);
		try {
			const raw = document.getElementById('personasData');
			const arr = raw ? JSON.parse(raw.textContent) : [];
			if (Array.isArray(arr)) {
				for (const persona of arr) {
					if (persona && typeof persona.id === 'string') {
						PERSONAS_BY_ID[persona.id] = persona;
					}
				}
			}
		} catch (e) {
			// Persona registry parse failure leaves PERSONAS_BY_ID empty,
			// which means every bubble renders the muted fallback avatar.
		}

		// Persona-specific composer placeholders (Phase 80). When a non-default
		// specialist is pinned and the mode is `act`, the composer placeholder
		// switches to the specialist's voice. Plan mode keeps its dedicated
		// "Plan something with Anton…" prompt regardless of pin state — Plan
		// is an orchestrator-only mode (specialists always execute). The
		// fallback for unmapped ids is the canonical "Ask Anton anything…".
		const PERSONA_PLACEHOLDERS = Object.freeze({
			'anton': "Anton is listening — what's on your mind?",
			'anton-code': "Anton Code is here — what should we build?",
			'anton-test': "Anton Test is here — what would you like covered?",
			'anton-e2e': "Anton E2E is here — describe the user journey.",
			'anton-security': "Anton Security is listening — what would you like scanned?",
			'anton-docs': "Anton Docs is here — what should be written?",
			'anton-ci': "Anton CI is here — what's failing?",
			'anton-pr': "Anton PR is here — what's the change?",
			'anton-moderniser': "Anton Moderniser is here — what's the legacy code?",
			'anton-spec': "Anton Spec is here — what's the seam?",
		});
		const DEFAULT_COMPOSER_PLACEHOLDER = 'Ask Anton anything…';
		const PLAN_COMPOSER_PLACEHOLDER = 'Plan something with Anton…';

		// Slash-command catalogue. Same lifecycle as SPECIALISTS — embedded by
		// the host so the popup renders synchronously without an extra
		// postMessage round-trip. Mirrored to a global so future host-side
		// updates (e.g. dynamic command registration) can rebroadcast.
		let SLASH_COMMANDS = [];
		try {
			const raw = document.getElementById('slashCommandsData');
			SLASH_COMMANDS = raw ? JSON.parse(raw.textContent) : [];
		} catch (e) {
			SLASH_COMMANDS = [];
		}
		if (!Array.isArray(SLASH_COMMANDS)) {
			SLASH_COMMANDS = [];
		}
		window.__SOTA_SLASH_COMMANDS = SLASH_COMMANDS;

		// Roster cards for the Roster tab. Each entry pairs a persona record
		// (avatar / accent / tagline) with its matching specialist role's
		// display name + description. Joined client-side so the tab can
		// render synchronously on first paint.
		let ROSTER = [];
		try {
			const raw = document.getElementById('rosterData');
			ROSTER = raw ? JSON.parse(raw.textContent) : [];
		} catch (e) {
			ROSTER = [];
		}
		if (!Array.isArray(ROSTER)) {
			ROSTER = [];
		}

		const VALID_TABS = ['chat', 'tasks', 'history', 'settings', 'roster'];

		/**
		 * Resolve the initial tab id. Defensive — a malformed data attribute
		 * defaults to `'chat'` so the user never lands on an invisible pane.
		 */
		function readInitialTab() {
			const candidate = document.body.dataset.initialTab;
			if (typeof candidate === 'string' && VALID_TABS.indexOf(candidate) >= 0) {
				return candidate;
			}
			return 'chat';
		}
		let currentTab = readInitialTab();
		let lastTasksSnapshot = null;
		let lastHistorySnapshot = null;

		// Workspace index — populated by an initial `workspaceIndexUpdate`
		// message from the host. Until that arrives the @-mention popup just
		// shows the workspace pseudo-entry so the UX still works on cold start.
		let WORKSPACE_INDEX = [];
		window.__SOTA_WORKSPACE_INDEX = WORKSPACE_INDEX;

		let isStreaming = false;
		let currentAssistantDiv = null;
		let currentAssistantHeader = null;
		// The text span that streamed tokens write into. Lives as a sibling
		// of any tool-call cards inside the message body so finalising the
		// markdown render doesn't replace the cards' DOM nodes.
		let currentAssistantTextSpan = null;
		// Running index that lines up 1:1 with positions in the host's
		// persisted conversation array. Incremented on every wrapper appended
		// to the message list (user, assistant, system) so checkpoint stripes
		// can find the user bubble by `data-conversation-index === turnIndex`.
		// Reset on `loadConversation` / `conversationCleared`.
		let nextConversationIndex = 0;
		// Pending checkpoints keyed by turnIndex → array of entries. Populated
		// by `checkpointCaptured`/`checkpointsLoaded` messages; consumed by
		// `insertCheckpointStripe` once the user bubble lands in the DOM. The
		// value is an array (not a single entry) so that the rare case where
		// two checkpoints share the same turn — e.g. one from the chat send
		// loop and one from a manual `sota.captureCheckpoint` — renders both
		// stripes back-to-back rather than dropping one. We keep the map even
		// after rendering so a re-paint (e.g. `loadConversation` followed by
		// `checkpointsLoaded`) can still find the data.
		const checkpointsByTurnIndex = new Map();
		let attachments = [];
		// Mention chips collected from the @-popup. Each entry is an object so
		// the host can distinguish file/folder/workspace mentions from the
		// pseudo kinds (`problems`, `terminal`, `url`). Shape:
		//   { kind: 'file' | 'folder' | 'workspace', path?: string, label: string }
		//   { kind: 'problems' | 'terminal', label: string }
		//   { kind: 'url', url: string, label: string }
		let mentions = [];
		// Image attachments collected from drag-drop, paste, or the file
		// picker. Each entry carries the MIME type and the base64-encoded
		// bytes (NOT a path) so the host doesn't need to re-read anything
		// at send time. Capped per message — the user is shown a toast if
		// they try to exceed the limits.
		let imageAttachments = [];
		const MAX_IMAGES_PER_MESSAGE = 10;
		const MAX_IMAGE_BYTES_TOTAL = 5 * 1024 * 1024;
		// Approximate base64 inflation factor: 4 base64 chars per 3 raw bytes.
		// Multiplied through this constant any time we need to translate the
		// budget from raw bytes to base64-string length.
		const BASE64_OVERHEAD = 4 / 3;
		let currentModel = document.body.dataset.defaultModel || 'sonnet';
		let currentAgent = 'anton';
		// Cline-style chat mode. 'plan' pins Anton into design-only mode (no
		// tool dispatch); 'act' is the default. Persisted per-conversation by
		// the host via `modeChange` postMessage, echoed back as
		// `modeChanged` on conversation load and slash-command transitions.
		let currentMode = 'act';
		// Sender attribution helpers. We suppress the assistant's name label
		// when the previous message also came from the same specialist so
		// consecutive turns read as a continuous voice. `lastSenderRole`
		// tracks the immediately previous message in the list (any role) so
		// follow-on bubbles can be tightened with a smaller gap.
		let lastSenderRole = null;
		let lastAssistantSpecialist = null;
		// Last assignee seen on a `subtaskStart` event in the current dispatch
		// sequence. Drives the inline handoff banner — when this changes (and
		// on the very first dispatch of a turn, where the implicit "from" is
		// the orchestrator) we render a small pill in the message-list flow
		// to make the specialist transition visible. Reset on conversation
		// load/clear and on every fresh `agentPlan` so banners only fire for
		// the in-flight plan, not residual state.
		let lastSubtaskAssignee = null;
		// Phase 69 — per-turn de-dup of `from->to` handoff pairs. Even if the
		// orchestrator alternates A→B→A→B inside a single agent run, each
		// distinct pair only renders one banner. Keyed by the assistant
		// wrapper's `dataset.conversationIndex` (or a synthetic 'turn' if
		// missing) joined with `from->to`. Reset on conversation load/clear
		// and on every fresh `agentPlan`.
		const renderedHandoffPairs = new Set();
		// Cache the most recent user message text so the assistant's
		// "Regenerate" inline action can re-emit it without round-tripping
		// to the host. Cleared on `clearConversation`.
		let lastUserPrompt = '';
		// Mirror used by Up-Arrow recall when the textarea is empty. Distinct
		// from `lastUserPrompt` because regenerate consumes the persisted
		// content (which may be a mention summary), whereas recall wants the
		// exact text the user typed last time.
		let lastSentUserText = '';

		// --- Phase 87: command history recall -----------------------------
		//
		// Bash-style history navigation. `commandHistory` is an array of
		// previously-submitted user prompts (most-recent-LAST). Up-arrow
		// steps backward, Down-arrow forward; reaching the bottom restores
		// `historyDraft` (whatever the user had typed before they started
		// recalling). Persisted across panel reloads via `vscode.setState`,
		// capped at 100 entries to keep the state payload tiny.
		const HISTORY_MAX_ENTRIES = 100;
		let commandHistory = (function () {
			try {
				const state = vscode.getState && vscode.getState();
				if (state && Array.isArray(state.commandHistory)) {
					return state.commandHistory.filter((s) => typeof s === 'string').slice(-HISTORY_MAX_ENTRIES);
				}
			} catch (e) { /* tolerated */ }
			return [];
		})();
		// `-1` means "not currently recalling". When >=0 it's an index into
		// `commandHistory` whose value is currently in the textarea.
		let historyIndex = -1;
		// Saved draft so Down-arrow can restore the user's pre-recall input.
		let historyDraft = '';

		function persistCommandHistory() {
			try {
				const prev = (vscode.getState && vscode.getState()) || {};
				const next = Object.assign({}, prev, { commandHistory });
				if (vscode.setState) vscode.setState(next);
			} catch (e) { /* tolerated — state API may be unavailable in tests */ }
		}

		function pushCommandHistory(text) {
			const value = String(text || '').trim();
			if (!value) return;
			// Dedup against the immediate previous entry so consecutive
			// retries don't fill the buffer with the same prompt.
			if (commandHistory[commandHistory.length - 1] === value) {
				historyIndex = -1;
				historyDraft = '';
				return;
			}
			commandHistory.push(value);
			if (commandHistory.length > HISTORY_MAX_ENTRIES) {
				commandHistory.splice(0, commandHistory.length - HISTORY_MAX_ENTRIES);
			}
			historyIndex = -1;
			historyDraft = '';
			persistCommandHistory();
		}

		function cursorOnFirstLine() {
			if (!messageInput) return true;
			if (messageInput.value.length === 0) return true;
			const pos = typeof messageInput.selectionStart === 'number' ? messageInput.selectionStart : 0;
			const head = messageInput.value.slice(0, pos);
			return head.indexOf('\n') === -1;
		}

		function cursorOnLastLine() {
			if (!messageInput) return true;
			if (messageInput.value.length === 0) return true;
			const pos = typeof messageInput.selectionStart === 'number' ? messageInput.selectionStart : messageInput.value.length;
			const tail = messageInput.value.slice(pos);
			return tail.indexOf('\n') === -1;
		}

		function setComposerValue(value) {
			messageInput.value = value;
			messageInput.dispatchEvent(new Event('input'));
			// Position cursor at the end so the user can immediately edit
			// or fire Enter to resend.
			const len = messageInput.value.length;
			try { messageInput.setSelectionRange(len, len); } catch (e) { /* tolerated */ }
		}

		function stepHistoryBackward() {
			if (commandHistory.length === 0) return;
			if (historyIndex === -1) {
				// Save the in-progress draft before kicking off a recall.
				historyDraft = messageInput ? messageInput.value : '';
				historyIndex = commandHistory.length - 1;
			} else if (historyIndex > 0) {
				historyIndex--;
			} else {
				// Already at the oldest entry — stay put.
				return;
			}
			setComposerValue(commandHistory[historyIndex]);
		}

		function stepHistoryForward() {
			if (historyIndex === -1) return;
			if (historyIndex < commandHistory.length - 1) {
				historyIndex++;
				setComposerValue(commandHistory[historyIndex]);
				return;
			}
			// Past the newest entry — restore the user's pre-recall draft.
			historyIndex = -1;
			setComposerValue(historyDraft);
			historyDraft = '';
		}

		// --- Chat sidebar tab bar -----------------------------------------
		//
		// Keeps the visible pane in sync with `currentTab`. The composer is
		// only painted on the Chat tab — every other tab fills the available
		// vertical space.
		function applyActiveTab(tab) {
			const next = VALID_TABS.indexOf(tab) >= 0 ? tab : 'chat';
			currentTab = next;
			for (const pane of chatPanes) {
				if (!pane) continue;
				pane.hidden = pane.dataset.pane !== next;
			}
			if (chatTabsBar) {
				chatTabsBar.querySelectorAll('.chat-tab').forEach((btn) => {
					const isActive = btn.getAttribute('data-tab') === next;
					btn.classList.toggle('chat-tab-active', isActive);
					btn.setAttribute('aria-selected', isActive ? 'true' : 'false');
					btn.setAttribute('tabindex', isActive ? '0' : '-1');
				});
			}
			if (composerHost) {
				composerHost.hidden = next !== 'chat';
			}
			if (next === 'chat') {
				// Auto-scroll back to the latest message so re-entering the
				// Chat tab feels natural even after a long stream finished
				// while the user was on a different tab.
				if (messageList) {
					messageList.scrollTop = messageList.scrollHeight;
				}
			}
		}

		/**
		 * User-initiated tab switch. Fires a `tabChange` postMessage so the
		 * host can persist the choice; the host echoes back `tabChanged`
		 * which calls `applyActiveTab` again — that's harmless because the
		 * function is idempotent.
		 */
		function selectTab(tab) {
			if (VALID_TABS.indexOf(tab) < 0) return;
			if (tab === currentTab) return;
			applyActiveTab(tab);
			vscode.postMessage({ type: 'tabChange', tab });
		}

		if (chatTabsBar) {
			chatTabsBar.addEventListener('click', (ev) => {
				const target = ev.target instanceof HTMLElement ? ev.target.closest('.chat-tab') : null;
				if (!target) return;
				const tab = target.getAttribute('data-tab');
				if (!tab) return;
				selectTab(tab);
			});
		}

		// Cmd/Ctrl + 1..5 → switch tabs. Standard keyboard shortcut chord
		// for a tabbed surface; no other keybinding owns it in this webview.
		document.addEventListener('keydown', (ev) => {
			if (!(ev.metaKey || ev.ctrlKey) || ev.shiftKey || ev.altKey) return;
			const idx = ['1', '2', '3', '4', '5'].indexOf(ev.key);
			if (idx < 0) return;
			ev.preventDefault();
			selectTab(VALID_TABS[idx]);
		});

		applyActiveTab(currentTab);

		// --- Tasks pane ---------------------------------------------------

		const TASKS_STATE_LABELS = {
			'backlog': 'Backlog',
			'ready': 'Ready',
			'in-progress': 'In progress',
			'review': 'Review',
			'done': 'Done',
			'failed': 'Failed',
		};
		const TASKS_STATE_ORDER = ['backlog', 'ready', 'in-progress', 'review', 'done', 'failed'];

		function renderTasksPane(snapshot) {
			lastTasksSnapshot = snapshot || null;
			if (!tasksPaneList || !tasksPaneEmpty) return;
			const tasks = snapshot && Array.isArray(snapshot.tasks) ? snapshot.tasks : [];
			tasksPaneList.textContent = '';
			if (tasksPaneCounts) tasksPaneCounts.textContent = '';
			if (tasks.length === 0) {
				tasksPaneEmpty.hidden = false;
				tasksPaneList.hidden = true;
				if (tasksPaneCounts) tasksPaneCounts.hidden = true;
				return;
			}
			tasksPaneEmpty.hidden = true;
			tasksPaneList.hidden = false;

			// State counts strip — compact bar above the task list.
			if (tasksPaneCounts) {
				const counts = (snapshot && snapshot.counts) || {};
				const fragments = TASKS_STATE_ORDER
					.filter((state) => Number(counts[state] || 0) > 0)
					.map((state) => {
						const cell = document.createElement('span');
						cell.className = 'tasks-pane-count tasks-pane-count-' + state;
						cell.textContent = TASKS_STATE_LABELS[state] + ' ' + Number(counts[state] || 0);
						return cell;
					});
				if (fragments.length > 0) {
					tasksPaneCounts.hidden = false;
					for (const f of fragments) tasksPaneCounts.appendChild(f);
				} else {
					tasksPaneCounts.hidden = true;
				}
			}

			for (const task of tasks) {
				if (!task || typeof task.id !== 'string') continue;
				const card = document.createElement('div');
				card.className = 'tasks-pane-card';
				card.setAttribute('data-task-id', task.id);
				card.setAttribute('data-state', task.state || 'backlog');

				const head = document.createElement('div');
				head.className = 'tasks-pane-card-head';
				const statePill = document.createElement('span');
				statePill.className = 'tasks-pane-state tasks-pane-state-' + (task.state || 'backlog');
				statePill.textContent = TASKS_STATE_LABELS[task.state] || task.state || '';
				head.appendChild(statePill);
				const avatar = buildPersonaAvatar(task.assignee || 'anton', { size: 'sm' });
				if (avatar) head.appendChild(avatar);
				card.appendChild(head);

				const instruction = document.createElement('div');
				instruction.className = 'tasks-pane-card-instruction';
				const text = (task.instruction || '').trim();
				instruction.textContent = text.length > 200 ? text.slice(0, 197) + '…' : text;
				instruction.title = text;
				card.appendChild(instruction);

				const deps = Array.isArray(task.dependencies) ? task.dependencies : [];
				if (deps.length > 0) {
					const depRow = document.createElement('div');
					depRow.className = 'tasks-pane-card-deps';
					for (const dep of deps) {
						const chip = document.createElement('span');
						chip.className = 'tasks-pane-dep';
						chip.textContent = dep;
						depRow.appendChild(chip);
					}
					card.appendChild(depRow);
				}

				tasksPaneList.appendChild(card);
			}
		}

		/**
		 * Build a small avatar circle for a specialist id. Reused by the
		 * Tasks list (compact) and the Roster cards (large). Defensive to
		 * unknown ids — falls back to a muted "?" monogram.
		 */
		function buildPersonaAvatar(specialistId, opts) {
			opts = opts || {};
			const size = opts.size === 'lg' ? 'lg' : (opts.size === 'sm' ? 'sm' : 'md');
			const persona = PERSONAS_BY_ID[specialistId];
			const avatar = document.createElement('span');
			avatar.className = 'persona-avatar persona-avatar-' + size;
			if (persona && persona.accent) {
				avatar.style.setProperty('--persona-accent', persona.accent);
				avatar.style.backgroundColor = persona.accent;
			}
			const monogram = document.createElement('span');
			monogram.className = 'persona-avatar-monogram';
			monogram.textContent = (persona && persona.monogram) || '?';
			avatar.appendChild(monogram);
			avatar.title = specialistId;
			return avatar;
		}

		if (tasksOpenBoardBtn) {
			tasksOpenBoardBtn.addEventListener('click', () => {
				vscode.postMessage({ type: 'runCommand', command: 'sota.openTaskBoard' });
			});
		}
		if (tasksPaneEmpty) {
			tasksPaneEmpty.addEventListener('click', (ev) => {
				const target = ev.target instanceof HTMLElement ? ev.target.closest('[data-action="open-chat-tab"]') : null;
				if (target) {
					selectTab('chat');
				}
			});
		}

		// --- History pane -------------------------------------------------

		function formatRelativeTime(timestamp) {
			const now = Date.now();
			const seconds = Math.max(0, Math.floor((Number(now) - Number(timestamp)) / 1000));
			if (seconds < 60) return 'just now';
			const minutes = Math.floor(seconds / 60);
			if (minutes < 60) return minutes + 'm ago';
			const hours = Math.floor(minutes / 60);
			if (hours < 24) return hours + 'h ago';
			const days = Math.floor(hours / 24);
			if (days === 1) return 'Yesterday';
			if (days < 7) return days + 'd ago';
			try {
				const date = new Date(timestamp);
				return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
			} catch (e) {
				return '';
			}
		}

		function renderHistoryPane(snapshot) {
			lastHistorySnapshot = snapshot || null;
			if (!historyPaneList || !historyPaneEmpty) return;
			const conversations = snapshot && Array.isArray(snapshot.conversations) ? snapshot.conversations : [];
			const activeId = snapshot && typeof snapshot.activeId === 'string' ? snapshot.activeId : '';
			historyPaneList.textContent = '';
			if (conversations.length === 0) {
				historyPaneEmpty.hidden = false;
				historyPaneList.hidden = true;
				return;
			}
			historyPaneEmpty.hidden = true;
			historyPaneList.hidden = false;

			for (const conv of conversations) {
				if (!conv || typeof conv.id !== 'string') continue;
				const row = document.createElement('div');
				row.className = 'history-pane-row';
				if (conv.id === activeId) row.classList.add('history-pane-row-active');
				row.setAttribute('data-conversation-id', conv.id);

				const body = document.createElement('button');
				body.type = 'button';
				body.className = 'history-pane-row-open';
				body.setAttribute('data-action', 'open');
				body.setAttribute('data-conversation-id', conv.id);
				const titleEl = document.createElement('div');
				titleEl.className = 'history-pane-row-title';
				titleEl.textContent = conv.title || 'Untitled';
				titleEl.title = conv.title || 'Untitled';
				body.appendChild(titleEl);
				const metaEl = document.createElement('div');
				metaEl.className = 'history-pane-row-meta';
				const count = Number(conv.messageCount || 0);
				const messageWord = count === 1 ? 'message' : 'messages';
				metaEl.textContent = formatRelativeTime(conv.updatedAt) + ' · ' + count + ' ' + messageWord;
				body.appendChild(metaEl);
				row.appendChild(body);

				const actions = document.createElement('div');
				actions.className = 'history-pane-row-actions';
				const renameBtn = document.createElement('button');
				renameBtn.type = 'button';
				renameBtn.className = 'history-pane-row-action';
				renameBtn.setAttribute('data-action', 'rename');
				renameBtn.setAttribute('data-conversation-id', conv.id);
				renameBtn.title = 'Rename';
				renameBtn.setAttribute('aria-label', 'Rename ' + (conv.title || 'conversation'));
				renameBtn.textContent = 'Rename';
				const deleteBtn = document.createElement('button');
				deleteBtn.type = 'button';
				deleteBtn.className = 'history-pane-row-action history-pane-row-action-danger';
				deleteBtn.setAttribute('data-action', 'delete');
				deleteBtn.setAttribute('data-conversation-id', conv.id);
				deleteBtn.title = 'Delete';
				deleteBtn.setAttribute('aria-label', 'Delete ' + (conv.title || 'conversation'));
				deleteBtn.textContent = 'Delete';
				actions.appendChild(renameBtn);
				actions.appendChild(deleteBtn);
				row.appendChild(actions);

				historyPaneList.appendChild(row);
			}
		}

		if (historyNewBtn) {
			historyNewBtn.addEventListener('click', () => {
				vscode.postMessage({ type: 'runCommand', command: 'sota.newConversation' });
			});
		}
		if (historyPaneList) {
			historyPaneList.addEventListener('click', (ev) => {
				const target = ev.target instanceof HTMLElement ? ev.target : null;
				if (!target) return;
				const actionEl = target.closest('[data-action]');
				if (!actionEl) return;
				const action = actionEl.getAttribute('data-action');
				const id = actionEl.getAttribute('data-conversation-id') || '';
				if (!id) return;
				if (action === 'open') {
					vscode.postMessage({ type: 'runCommand', command: 'sota.openConversation', arg: id });
					selectTab('chat');
					return;
				}
				if (action === 'rename') {
					ev.stopPropagation();
					vscode.postMessage({ type: 'historyRename', id });
					return;
				}
				if (action === 'delete') {
					ev.stopPropagation();
					vscode.postMessage({ type: 'historyDelete', id });
					return;
				}
			});
		}

		// --- Roster pane --------------------------------------------------

		function renderRosterPane() {
			if (!rosterPaneGrid) return;
			rosterPaneGrid.textContent = '';
			const roleById = Object.create(null);
			for (const role of SPECIALISTS) {
				if (role && typeof role.id === 'string') roleById[role.id] = role;
			}
			for (const persona of ROSTER) {
				if (!persona || typeof persona.id !== 'string') continue;
				const role = roleById[persona.id];
				const card = document.createElement('div');
				card.className = 'roster-card';
				card.style.setProperty('--persona-accent', persona.accent || 'var(--sota-accent)');
				card.setAttribute('data-specialist-id', persona.id);

				const head = document.createElement('div');
				head.className = 'roster-card-head';
				const avatar = buildPersonaAvatar(persona.id, { size: 'lg' });
				head.appendChild(avatar);
				const info = document.createElement('div');
				info.className = 'roster-card-info';
				const name = document.createElement('div');
				name.className = 'roster-card-name';
				name.textContent = (role && role.displayName) || persona.id;
				info.appendChild(name);
				const handle = document.createElement('div');
				handle.className = 'roster-card-handle';
				handle.textContent = '@' + persona.id;
				info.appendChild(handle);
				head.appendChild(info);
				card.appendChild(head);

				const tagline = document.createElement('div');
				tagline.className = 'roster-card-tagline';
				tagline.textContent = persona.tagline || '';
				card.appendChild(tagline);

				if (role && role.description) {
					const desc = document.createElement('div');
					desc.className = 'roster-card-description';
					desc.textContent = role.description;
					card.appendChild(desc);
				}

				const cta = document.createElement('button');
				cta.type = 'button';
				cta.className = 'roster-card-cta';
				cta.setAttribute('data-action', 'talk-to');
				cta.setAttribute('data-specialist-id', persona.id);
				cta.textContent = 'Talk to @' + persona.id;
				card.appendChild(cta);

				rosterPaneGrid.appendChild(card);
			}
		}

		if (rosterPaneGrid) {
			rosterPaneGrid.addEventListener('click', (ev) => {
				const target = ev.target instanceof HTMLElement ? ev.target.closest('[data-action="talk-to"]') : null;
				if (!target) return;
				const id = target.getAttribute('data-specialist-id') || 'anton';
				currentAgent = id;
				updateAgentLabel();
				updateAgentMenuChecks();
				updateHeaderSubtitle();
				selectTab('chat');
				if (messageInput) {
					try { messageInput.focus(); } catch (e) { /* noop */ }
				}
			});
		}

		renderRosterPane();
		renderTasksPane(null);
		renderHistoryPane(null);

		renderAgentMenu();
		updateAgentLabel();
		updateAgentMenuChecks();
		updateModelLabel();
		updateModelMenuChecks();
		updateModeUi();
		updateEmptyState();
		updateHeaderSubtitle();
		updateSendAffordance();
		// Default the auth gate to "ready" until the host reports otherwise so
		// we never paint a blank empty-state during the brief startup window
		// before the first connectionState message arrives.
		updateAuthGate(null);

		function escapeHtml(text) {
			const div = document.createElement('div');
			div.textContent = text;
			return div.innerHTML;
		}

		/**
		 * Convert a small subset of Markdown to safe HTML. All input is
		 * escaped before tag insertion; only the markdown shapes we recognise
		 * become HTML, which keeps the surface narrow and predictable for
		 * a webview that renders LLM output.
		 */
		function renderMarkdown(text) {
			// 0a. Hold sota:tool sentinels aside. The persisted form is
			//    <<<sota:tool data="<base64>">>> and is robust against any
			//    tool-output content (triple backticks, HTML, etc.).
			const toolBlocks = [];
			let toolIndex = 0;
			const sansTool = text.replace(/<<<sota:tool data="([A-Za-z0-9+/=]+)">>>/g, (_, b64) => {
				toolBlocks[toolIndex] = b64;
				return '@@TB' + (toolIndex++) + '@@';
			});

			// 0b. Hold sota:approval sentinels aside. Parallel to sota:tool
			//    but carries the approval card's final state (approved /
			//    rejected / cancelled / auto-approved). Reload-only — live
			//    streams render the card via 'approvalRequest' postMessage.
			const approvalBlocks = [];
			let approvalIndex = 0;
			const sansApproval = sansTool.replace(/<<<sota:approval data="([A-Za-z0-9+/=]+)">>>/g, (_, b64) => {
				approvalBlocks[approvalIndex] = b64;
				return '@@AB' + (approvalIndex++) + '@@';
			});

			// 0c. Hold sota:terminal sentinels aside. These carry structured
			//     shell metadata (command, cwd, exit code, stdout/stderr) so
			//     a reloaded run_command result can render as a terminal-
			//     style block. The preceding sota:tool sentinel still emits
			//     the standard tool-card shell — the terminal block is
			//     injected into that card by id-correlation at render time.
			const terminalBlocks = [];
			let terminalIndex = 0;
			const sansTerminal = sansApproval.replace(/<<<sota:terminal data="([A-Za-z0-9+/=]+)">>>/g, (_, b64) => {
				terminalBlocks[terminalIndex] = b64;
				return '@@TM' + (terminalIndex++) + '@@';
			});

			// 0d. Hold sota:uiblock sentinels aside. These carry a
			//     generative-UI block payload (component, props, blockId)
			//     emitted by the LLM via the `emit_ui_block` builtin tool.
			//     On reload we re-mount the block by routing the payload
			//     through the same `GENERATIVE_UI_RENDERERS` registry the
			//     live `uiBlock` postMessage uses. The block re-mounts in
			//     its un-responded state — input freezing is a live-only
			//     signal that doesn't survive persistence.
			const uiBlocks = [];
			let uiBlockIndex = 0;
			const sansUiBlock = sansTerminal.replace(/<<<sota:uiblock data="([A-Za-z0-9+/=]+)">>>/g, (_, b64) => {
				uiBlocks[uiBlockIndex] = b64;
				return '@@UB' + (uiBlockIndex++) + '@@';
			});

			// 1. Hold fenced code blocks aside so block/inline rules below don't touch their contents.
			const codeBlocks = [];
			let codeIndex = 0;
			const sansCode = sansUiBlock.replace(/```(\w*)\n([\s\S]*?)```/g, (_, lang, code) => {
				codeBlocks[codeIndex] = { lang, code };
				return '@@CB' + (codeIndex++) + '@@';
			});

			// 2. Escape everything else.
			let html = escapeHtml(sansCode);

			// 3. Block-level (anchored to line start).
			html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
			html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>');
			html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>');
			html = html.replace(/^&gt; (.+)$/gm, '<blockquote>$1</blockquote>');

			// 4. Bullet lists — collapse runs of "- " lines into a <ul>.
			html = html.replace(/(?:^- .+\n?)+/gm, (run) => {
				const items = run.split('\n').filter(Boolean).map(l => '<li>' + l.replace(/^- /, '') + '</li>').join('');
				return '<ul>' + items + '</ul>';
			});

			// 5. Inline.
			html = html.replace(/`([^`\n]+)`/g, '<code>$1</code>');
			html = html.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
			html = html.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>');
			html = html.replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>');

			// 6. Remaining newlines become hard breaks, but not directly after a closing block tag.
			html = html.replace(/\n/g, '<br>');
			html = html.replace(/(<\/(h1|h2|h3|blockquote|ul|li)>)<br>/g, '$1');

			// 7. Restore code blocks (escaping their bodies).
			html = html.replace(/@@CB(\d+)@@/g, (_, idxStr) => {
				const block = codeBlocks[parseInt(idxStr, 10)];
				if (!block) {
					return '';
				}
				const lang = (block.lang || 'text').slice(0, 32);
				// 'tool' fences are how persisted assistant messages encode a
				// prior tool-call summary. Render them as static tool-card
				// markup so reloaded conversations show the same expandable
				// card UI as live streaming.
				if (lang === 'tool') {
					return renderToolFenceAsCard(block.code);
				}
				const escapedCode = escapeHtml(block.code.replace(/\n+$/, ''));
				const detectedPath = detectPathHint(block.code);
				const saveBtn = detectedPath
					? '<button class="code-save" data-path="' + escapeHtml(detectedPath) + '" onclick="saveCodeToFile(this)" title="Save to ' + escapeHtml(detectedPath) + '">Save</button>'
					: '';
				// If this is a diff/patch fence with a recognisable target path,
				// emit a Preview button that ships the full diff payload as
				// base64 so HTML attribute encoding can't lose characters.
				const langLower = (block.lang || '').toLowerCase();
				const isDiff = langLower === 'diff' || langLower === 'patch';
				const diffPath = isDiff ? detectDiffTargetPath(block.code) : '';
				let diffBtn = '';
				if (isDiff && diffPath) {
					try {
						const encodedDiff = btoa(unescape(encodeURIComponent(block.code)));
						diffBtn = '<button class="code-diff" data-diff="' + escapeHtml(encodedDiff) + '" onclick="previewDiff(this)" title="Preview as diff">Preview</button>';
					} catch (e) {
						diffBtn = '';
					}
				}
				return '<div class="code-block">' +
					'<div class="code-header">' +
						'<span class="code-lang">' + escapeHtml(lang) + '</span>' +
						'<div class="code-actions">' +
							diffBtn +
							saveBtn +
							'<button class="code-open" onclick="openCodeInEditor(this)" title="Open in new editor tab">Open</button>' +
							'<button class="code-copy" onclick="copyCode(this)">Copy</button>' +
						'</div>' +
					'</div>' +
					'<pre><code class="language-' + escapeHtml(lang) + '">' + escapedCode + '</code></pre>' +
				'</div>';
			});

			// 8. Restore sota:tool sentinels — decode base64 body and route
			// through the existing card renderer. When a tool sentinel is
			// IMMEDIATELY followed by a sota:terminal sentinel (only HTML
			// whitespace / <br> between them), pair them up: the metadata
			// upgrades the generic tool-card body into a terminal block.
			html = html.replace(/@@TB(\d+)@@(\s|<br>|<br\/>|<br \/>)*@@TM(\d+)@@/g, (_, toolIdxStr, _gap, metaIdxStr) => {
				const tb64 = toolBlocks[parseInt(toolIdxStr, 10)];
				const mb64 = terminalBlocks[parseInt(metaIdxStr, 10)];
				if (!tb64) {
					return '';
				}
				let metadata = null;
				if (mb64) {
					try {
						metadata = JSON.parse(decodeURIComponent(escape(atob(mb64))));
					} catch (e) {
						metadata = null;
					}
				}
				try {
					const decoded = decodeURIComponent(escape(atob(tb64)));
					return renderToolFenceAsCard(decoded, metadata);
				} catch (e) {
					return '';
				}
			});

			// Any remaining tool sentinels with no paired terminal metadata
			// fall back to the standard tool-card render.
			html = html.replace(/@@TB(\d+)@@/g, (_, idxStr) => {
				const b64 = toolBlocks[parseInt(idxStr, 10)];
				if (!b64) {
					return '';
				}
				try {
					const decoded = decodeURIComponent(escape(atob(b64)));
					return renderToolFenceAsCard(decoded, null);
				} catch (e) {
					return '';
				}
			});

			// Orphan terminal sentinels (no preceding tool sentinel) — render
			// a standalone terminal block. Should be rare; keeps the surface
			// safe against partial persistence shapes.
			html = html.replace(/@@TM(\d+)@@/g, (_, idxStr) => {
				const b64 = terminalBlocks[parseInt(idxStr, 10)];
				if (!b64) {
					return '';
				}
				try {
					const decoded = decodeURIComponent(escape(atob(b64)));
					const metadata = JSON.parse(decoded);
					return renderTerminalBlock(metadata);
				} catch (e) {
					return '';
				}
			});

			// 8c. Restore sota:uiblock sentinels — decode base64 JSON and
			// emit a placeholder div that the post-render hydration step
			// will replace with the live `GENERATIVE_UI_RENDERERS` output.
			// We can't return a full DOM node from a string-based pipeline,
			// so we stash the payload on a data attribute and let
			// `hydrateUiBlockPlaceholders` mount the renderer after the
			// fragment is attached to the DOM.
			html = html.replace(/@@UB(\d+)@@/g, (_, idxStr) => {
				const b64 = uiBlocks[parseInt(idxStr, 10)];
				if (!b64) {
					return '';
				}
				try {
					const decoded = decodeURIComponent(escape(atob(b64)));
					// Re-encode as a base64 attribute so any quotes/HTML in
					// the payload can't escape the placeholder's data attr.
					const safe = btoa(unescape(encodeURIComponent(decoded)));
					return '<div class="ui-block-placeholder" data-ui-block-payload="' + safe + '"></div>';
				} catch (e) {
					return '';
				}
			});

			// 9. Restore sota:approval sentinels — decode base64 JSON and
			// emit a static approval card carrying the resolved outcome.
			html = html.replace(/@@AB(\d+)@@/g, (_, idxStr) => {
				const b64 = approvalBlocks[parseInt(idxStr, 10)];
				if (!b64) {
					return '';
				}
				try {
					const decoded = decodeURIComponent(escape(atob(b64)));
					const record = JSON.parse(decoded);
					return renderApprovalRecordAsCard(record);
				} catch (e) {
					return '';
				}
			});

			return html;
		}

		/**
		 * Render a persisted approval record back into static approval-card
		 * markup. Mirrors the live `renderApprovalRequest` shape but always
		 * emits a resolved state (the live action buttons are replaced with a
		 * static outcome label). `record` carries `{ toolName, input,
		 * decision, reason?, autoApproved, payload }`.
		 */
		function renderApprovalRecordAsCard(record) {
			if (!record || typeof record !== 'object') {
				return '';
			}
			const toolName = typeof record.toolName === 'string' ? record.toolName : 'tool';
			const decision = record.decision === 'approve' ? 'approved'
				: record.decision === 'cancel' ? 'cancelled'
				: 'rejected';
			const state = record.autoApproved ? 'auto-approved' : decision;
			const pillLabel = record.autoApproved
				? 'Auto-approved'
				: state === 'approved' ? 'Approved' : state === 'cancelled' ? 'Cancelled' : 'Rejected';
			const titleLabel = record.autoApproved ? 'Auto-approved action' : 'Approve action';
			const reason = typeof record.reason === 'string' && record.reason ? record.reason : '';
			const outcomeText = state === 'approved'
				? 'Approved'
				: state === 'cancelled'
					? 'Cancelled'
					: state === 'auto-approved'
						? 'Auto-approved'
						: 'Rejected' + (reason ? ' (' + reason + ')' : '');

			const payload = record.payload && typeof record.payload === 'object' ? record.payload : {};
			let bodyHtml = '<div class="approval-tool-name">' + escapeHtml(toolName) + '</div>';
			if (toolName === 'write_file') {
				const path = typeof payload.path === 'string' ? payload.path : '(no path)';
				bodyHtml += '<div class="approval-target"><code>' + escapeHtml(path) + '</code></div>';
				const previewLines = Array.isArray(payload.previewLines) ? payload.previewLines.filter(l => typeof l === 'string') : [];
				const totalLines = typeof payload.totalLines === 'number' ? payload.totalLines : previewLines.length;
				if (previewLines.length > 0) {
					const previewText = escapeHtml(previewLines.join('\n'));
					let extra = '';
					if (totalLines > previewLines.length) {
						extra = '<div class="approval-preview-more">+ ' + (totalLines - previewLines.length) + ' more lines</div>';
					}
					bodyHtml += '<div class="approval-preview"><pre>' + previewText + '</pre>' + extra + '</div>';
				}
			} else if (toolName === 'run_command') {
				const command = typeof payload.command === 'string' ? payload.command : '';
				const args = Array.isArray(payload.args) ? payload.args.filter(a => typeof a === 'string') : [];
				const argDisplay = args.length > 0
					? ' ' + args.map(a => /[\s"']/.test(a) ? JSON.stringify(a) : a).join(' ')
					: '';
				bodyHtml += '<div class="approval-command"><code>' + escapeHtml(command + argDisplay) + '</code></div>';
				const cwd = payload.cwd ? payload.cwd : 'workspace root';
				bodyHtml += '<div class="approval-cwd">cwd: ' + escapeHtml(cwd) + '</div>';
			}

			const iconSvg = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 1.5 14.5 13.5h-13z"/><path d="M8 6v4"/><circle cx="8" cy="12" r="0.5" fill="currentColor"/></svg>';
			return '<div class="approval-card" data-approval-state="' + escapeHtml(state) + '">' +
				'<div class="approval-header">' +
					'<span class="approval-icon">' + iconSvg + '</span>' +
					'<span class="approval-title">' + escapeHtml(titleLabel) + '</span>' +
					'<span class="approval-pill">' + escapeHtml(pillLabel) + '</span>' +
				'</div>' +
				'<div class="approval-body">' + bodyHtml + '</div>' +
				'<div class="approval-outcome">' + escapeHtml(outcomeText) + '</div>' +
			'</div>';
		}

		/**
		 * Inspect the first non-empty line of a fenced code body for a
		 * "path:" hint comment in any of the supported comment syntaxes.
		 * Returns the workspace-relative path string, or '' if no valid
		 * hint is found. Rejects absolute paths and traversal sequences
		 * so a malicious model can't trick the webview into rendering a
		 * Save button that targets the host filesystem.
		 */
		function detectPathHint(code) {
			if (typeof code !== 'string' || !code) {
				return '';
			}
			// First non-empty line — leading whitespace tolerated, but blank
			// lines at the top are skipped to handle assistants that add a
			// preamble newline after the opening fence.
			const lines = code.split('\n');
			let firstLine = '';
			for (const line of lines) {
				if (line.trim().length > 0) {
					firstLine = line;
					break;
				}
			}
			if (!firstLine) {
				return '';
			}
			const patterns = [
				/^\s*\/\/\s*path:\s*(\S.*?)\s*$/i,
				/^\s*#\s*path:\s*(\S.*?)\s*$/i,
				/^\s*<!--\s*path:\s*(\S.*?)\s*-->\s*$/i,
			];
			let candidate = '';
			for (const pat of patterns) {
				const m = firstLine.match(pat);
				if (m && m[1]) {
					candidate = m[1].trim();
					break;
				}
			}
			if (!candidate) {
				return '';
			}
			// Reject anything that could escape the workspace root or smuggle
			// in an absolute/Windows path.
			if (
				candidate.indexOf('..') !== -1 ||
				candidate.charAt(0) === '/' ||
				candidate.charAt(0) === '\\' ||
				candidate.indexOf('\0') !== -1
			) {
				return '';
			}
			return candidate;
		}

		/**
		 * Inspect a unified-diff body for the target file path. Prefers the
		 * post-image header (`+++ b/<path>`) and falls through to plausible
		 * variants. Returns '' when no safe workspace-relative path is found
		 * so the webview can suppress the Preview button defensively — the
		 * host re-validates the same constraints.
		 */
		function detectDiffTargetPath(diff) {
			if (typeof diff !== 'string' || !diff) {
				return '';
			}
			const patterns = [
				/^\+\+\+\s+b\/(.+)$/m,
				/^\+\+\+\s+(.+)$/m,
				/^---\s+a\/(.+)$/m,
				/^---\s+(.+)$/m,
			];
			let candidate = '';
			for (const pat of patterns) {
				const m = diff.match(pat);
				if (m && m[1]) {
					candidate = m[1].trim();
					break;
				}
			}
			if (!candidate) {
				return '';
			}
			if (
				candidate.indexOf('..') !== -1 ||
				candidate.charAt(0) === '/' ||
				candidate.charAt(0) === '\\' ||
				candidate.indexOf(' ') !== -1 ||
				candidate.indexOf('\0') !== -1 ||
				candidate === '/dev/null'
			) {
				return '';
			}
			return candidate;
		}

		/**
		 * Render a persisted ```tool fenced block back into static tool-card
		 * markup. The first line is the header (`name(args-json) → status`)
		 * and the remaining lines are the captured output. We never have a
		 * persisted 'running' card — it would mean a session was reloaded
		 * mid-tool-call, which the host doesn't persist anyway.
		 *
		 * `metadata` (optional) is the structured payload from a paired
		 * `<<<sota:terminal>>>` sentinel. When present and `kind === 'shell'`,
		 * the generic output `<pre>` is replaced with a Cline-style
		 * terminal block.
		 */
		function renderToolFenceAsCard(body, metadata) {
			let rawBody = typeof body === 'string' ? body.replace(/^\n+|\n+$/g, '') : '';
			// Inline tool-result review: decoded bodies that begin with
			// '__EDITED__\n' carry a user-edit flag. Strip the marker before
			// parsing the header/output and remember to surface the "Edited"
			// pill on the rendered card.
			let userEdited = false;
			if (rawBody.indexOf('__EDITED__\n') === 0) {
				userEdited = true;
				rawBody = rawBody.substring('__EDITED__\n'.length);
			}
			const text = rawBody;
			const lines = text.split('\n');
			const header = lines[0] || '';
			const output = lines.slice(1).join('\n');
			// Header form: '<name>(<json>) → <ok|error>'. Be defensive — if it
			// doesn't match, fall back to rendering the raw text in the card.
			const m = /^([^()\s]+)\((.*)\)\s*\u2192\s*(ok|error)\s*$/.exec(header);
			let name = 'tool';
			let argsRaw = '';
			let status = 'ok';
			if (m) {
				name = m[1];
				argsRaw = m[2];
				status = m[3] === 'error' ? 'error' : 'ok';
			} else {
				name = header || 'tool';
			}

			const isShell = metadata && metadata.kind === 'shell';
			// For shell metadata the status pill maps to the exit code,
			// and 'cancelled' surfaces explicitly.
			let pillStatus = status;
			let statusLabel = status === 'error' ? 'Error' : 'Ok';
			if (isShell) {
				if (metadata.cancelled === true) {
					pillStatus = 'error';
					statusLabel = 'Cancelled';
				} else if (typeof metadata.exitCode === 'number' && metadata.exitCode !== 0) {
					pillStatus = 'error';
					statusLabel = 'Error';
				} else {
					pillStatus = 'ok';
					statusLabel = 'Ok';
				}
			}
			const icon = pillStatus === 'error' ? '\u2717' : '\u2713';

			// Tighter truncation for the rendered card (~80 chars) — the full
			// args remain available via tooltip so power users aren't blocked.
			const argsTrunc = argsRaw.length > 80 ? argsRaw.slice(0, 79) + '\u2026' : argsRaw;
			const argsTitle = argsRaw.length > 80 ? ' title="' + escapeHtml(argsRaw) + '"' : '';
			const escapedName = escapeHtml(name);
			const escapedArgs = escapeHtml(argsTrunc);

			const bodyHtml = isShell
				? renderTerminalBlock(metadata)
				: '<details class="tool-card-output">' +
					'<summary>View output</summary>' +
					'<pre>' + escapeHtml(output) + '</pre>' +
				  '</details>';

			// Persisted cards are by definition inactive — the LLM has
			// already read the result on the turn that produced it, so we
			// drop the Edit button (CSS hides it on data-active="false").
			// The "Edited" pill, however, is preserved across reloads so
			// the reviewer can see which results were curated.
			const editedPillHtml = userEdited
				? '<span class="tool-card-edited-pill" title="User edited this result before it was read by the model.">Edited</span>'
				: '';

			return '<div class="tool-card" data-tool-status="' + pillStatus + '" data-active="false"' + (userEdited ? ' data-user-edited="true"' : '') + '>' +
				'<div class="tool-card-header">' +
					'<span class="tool-card-icon">' + icon + '</span>' +
					'<span class="tool-card-name">' + escapedName + '</span>' +
					'<span class="tool-card-args"' + argsTitle + '>' + escapedArgs + '</span>' +
					'<span class="tool-card-status">' + statusLabel + '</span>' +
					editedPillHtml +
				'</div>' +
				bodyHtml +
			'</div>';
		}

		/**
		 * Render a Cline-style terminal block from `ShellExecutionMetadata`.
		 * Header bar shows the prompt, command, cwd, exit pill, and an
		 * optional cancelled pill. Body shows stdout (default colour) and
		 * stderr (red). Long output is collapsed by default with a Show
		 * more / Show less toggle, keeping the first 5 + last 5 lines
		 * visible. All text is escaped before insertion — the surface is
		 * safe against non-ASCII and HTML-shaped output bytes.
		 */
		function renderTerminalBlock(meta) {
			const safe = meta && typeof meta === 'object' ? meta : {};
			const command = typeof safe.command === 'string' ? safe.command : '';
			const args = Array.isArray(safe.args) ? safe.args.filter(a => typeof a === 'string') : [];
			const argDisplay = args.length > 0
				? ' ' + args.map(a => /[\s"']/.test(a) ? JSON.stringify(a) : a).join(' ')
				: '';
			const fullCmd = command + argDisplay;
			const cwd = typeof safe.cwd === 'string' && safe.cwd ? safe.cwd : '';
			const stdout = typeof safe.stdout === 'string' ? safe.stdout : '';
			const stderr = typeof safe.stderr === 'string' ? safe.stderr : '';
			const cancelled = safe.cancelled === true;
			const exitCode = typeof safe.exitCode === 'number' ? safe.exitCode : null;
			const exitOk = !cancelled && (exitCode === 0 || exitCode === null);

			let header = '<div class="terminal-block-header">' +
				'<span class="terminal-prompt">$</span>' +
				'<code class="terminal-cmd">' + escapeHtml(fullCmd) + '</code>';
			if (cwd) {
				header += '<span class="terminal-cwd" title="' + escapeHtml(cwd) + '">' + escapeHtml(cwd) + '</span>';
			}
			if (cancelled) {
				header += '<span class="terminal-cancelled">cancelled</span>';
			}
			const exitText = exitCode === null ? 'exit ?' : 'exit ' + exitCode;
			header += '<span class="terminal-exit ' + (exitOk ? 'terminal-exit-ok' : 'terminal-exit-error') + '">' +
				escapeHtml(exitText) + '</span>';
			header += '</div>';

			// Build body. Long output collapses with a Show more toggle —
			// the first 5 and last 5 lines remain visible. Stdout and
			// stderr render as separate spans so CSS can colour them.
			const body = renderTerminalBody(stdout, stderr);
			const cancelledClass = cancelled ? ' terminal-cancelled-state' : '';
			return '<div class="terminal-block' + cancelledClass + '">' + header + body + '</div>';
		}

		/**
		 * Build the `<pre>` body of a terminal block. Output longer than
		 * `COLLAPSE_THRESHOLD` lines is split into a head/tail visible
		 * portion and a collapsed middle that toggles via a Show more
		 * button. Stdout and stderr are rendered as separate `<span>`
		 * children so the stylesheet can colour them.
		 */
		function renderTerminalBody(stdout, stderr) {
			const COLLAPSE_THRESHOLD = 30;
			const HEAD = 5;
			const TAIL = 5;
			const stdoutLines = stdout ? stdout.split('\n') : [];
			const stderrLines = stderr ? stderr.split('\n') : [];
			const total = stdoutLines.length + stderrLines.length;

			const stdoutHtml = stdout ? '<span class="terminal-stdout">' + escapeHtml(stdout) + '</span>' : '';
			const stderrHtml = stderr ? '<span class="terminal-stderr">' + escapeHtml(stderr) + '</span>' : '';

			if (total <= COLLAPSE_THRESHOLD) {
				return '<pre class="terminal-block-body">' + stdoutHtml + stderrHtml + '</pre>';
			}

			// Build a head / tail view across the COMBINED stream
			// (stdout then stderr). The streams stay visually
			// distinguishable because each stays inside its own
			// coloured span.
			const combined = stdoutLines.concat(stderrLines);
			const hidden = combined.length - HEAD - TAIL;
			const stdoutCount = stdoutLines.length;
			// Slice helpers that preserve the stdout/stderr boundary so we
			// can wrap each chunk in the right span.
			function sliceWithKind(start, end) {
				const out = [];
				if (start < stdoutCount) {
					const e = Math.min(end, stdoutCount);
					out.push({ kind: 'stdout', lines: combined.slice(start, e) });
				}
				if (end > stdoutCount) {
					const s = Math.max(start, stdoutCount);
					out.push({ kind: 'stderr', lines: combined.slice(s, end) });
				}
				return out;
			}
			function chunksToHtml(chunks) {
				return chunks.map(c => {
					const text = c.lines.join('\n');
					if (text.length === 0) {
						return '';
					}
					const cls = c.kind === 'stderr' ? 'terminal-stderr' : 'terminal-stdout';
					return '<span class="' + cls + '">' + escapeHtml(text) + '</span>';
				}).join('');
			}
			const headHtml = chunksToHtml(sliceWithKind(0, HEAD));
			const tailHtml = chunksToHtml(sliceWithKind(combined.length - TAIL, combined.length));
			const fullHtml = chunksToHtml(sliceWithKind(0, combined.length));

			const collapsed =
				'<pre class="terminal-block-body terminal-collapsed">' +
					headHtml +
					'\n<button type="button" class="terminal-show-more" onclick="toggleTerminalExpand(this)">Show ' + hidden + ' more lines</button>\n' +
					tailHtml +
				'</pre>';
			const expanded =
				'<pre class="terminal-block-body terminal-expanded" hidden>' +
					fullHtml +
					'<button type="button" class="terminal-show-more" onclick="toggleTerminalExpand(this)">Show less</button>' +
				'</pre>';
			return collapsed + expanded;
		}

		/**
		 * Toggle the collapsed/expanded variants of a terminal block. The
		 * two `<pre>` siblings carry the same content; we just flip
		 * which one is hidden so the click is essentially free. Exposed on
		 * `window` so inline `onclick` handlers in the rendered HTML can
		 * reach it (matches the pattern used by copyCode / saveCodeToFile).
		 */
		window.toggleTerminalExpand = function (btn) {
			const block = btn.closest('.terminal-block');
			if (!block) return;
			const collapsed = block.querySelector('.terminal-collapsed');
			const expanded = block.querySelector('.terminal-expanded');
			if (!collapsed || !expanded) return;
			const isCollapsed = !collapsed.hidden;
			collapsed.hidden = isCollapsed;
			expanded.hidden = !isCollapsed;
		};

		/**
		 * Format a unix-ms timestamp as HH:MM in the user's locale.
		 * Falls back to an empty string for missing values so the
		 * `<time>` element collapses cleanly when `addMessage` is
		 * called without a timestamp (live turns, slash-command output).
		 */
		function formatTime(ms) {
			if (typeof ms !== 'number' || !isFinite(ms)) {
				return '';
			}
			try {
				const d = new Date(ms);
				return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
			} catch (e) {
				return '';
			}
		}

		/**
		 * Build the meta row for assistant messages: a small specialist
		 * label and a hover-only timestamp. The label is suppressed when
		 * the previous message was from the same assistant specialist so
		 * consecutive assistant turns read as one voice.
		 *
		 * Returns the meta element (always present, but `hidden` when
		 * the label would be a duplicate). Streaming dots get appended to
		 * this same element by `startStreamingMessage`.
		 */
		function buildAssistantMeta(displayName, specialistId, timestampMs) {
			const meta = document.createElement('div');
			meta.className = 'msg-meta';

			// Persona lookup. An unknown id (or no id at all) maps to a generic
			// "?" avatar with the muted foreground colour so the layout never
			// collapses — better than swallowing the avatar slot when persona
			// data is missing.
			const persona = specialistId ? PERSONAS_BY_ID[specialistId] : undefined;
			const monogram = (persona && persona.monogram) || '?';
			const accent = persona && persona.accent;
			const tagline = persona && persona.tagline;

			const avatar = document.createElement('span');
			avatar.className = 'msg-avatar';
			avatar.setAttribute('aria-hidden', 'true');
			avatar.textContent = monogram;
			if (accent) {
				avatar.style.backgroundColor = accent;
			}
			if (tagline) {
				avatar.title = tagline;
			}
			meta.appendChild(avatar);

			const name = document.createElement('span');
			name.className = 'msg-name msg-specialist-name';
			name.textContent = displayName || 'Anton';
			if (accent) {
				name.style.color = accent;
			}
			meta.appendChild(name);

			const time = document.createElement('time');
			time.className = 'msg-time';
			const formatted = formatTime(timestampMs);
			if (formatted) {
				time.textContent = formatted;
				time.setAttribute('datetime', new Date(timestampMs).toISOString());
			}
			meta.appendChild(time);

			// Suppress the label entirely when this turn is from the same
			// specialist as the immediately preceding assistant message.
			if (specialistId && lastAssistantSpecialist === specialistId) {
				meta.hidden = true;
			}
			return meta;
		}

		/**
		 * Stamp the persona accent onto an assistant message wrapper so the
		 * left-hand stripe (Phase 39) and any descendant CSS rule that reads
		 * `--persona-accent` pick up the specialist's colour. Also sets a
		 * `data-specialist` attribute so themes can target a specific
		 * specialist if they ever need to. Falls back to the default stripe
		 * when the specialist id is unknown.
		 */
		function applyPersonaToWrapper(wrapper, specialistId) {
			if (!wrapper) return;
			if (specialistId) {
				wrapper.dataset.specialist = specialistId;
			}
			const persona = specialistId ? PERSONAS_BY_ID[specialistId] : undefined;
			if (persona && persona.accent) {
				wrapper.style.setProperty('--persona-accent', persona.accent);
			} else {
				wrapper.style.removeProperty('--persona-accent');
			}
		}

		/**
		 * Build the inline action toolbar (copy / regenerate / feedback)
		 * for a finalised assistant message. The toolbar is positioned
		 * absolutely inside the body and fades in on hover. Wired to
		 * `postMessage`-driven handlers; feedback events are visual-only
		 * pending host-side wiring in a future phase.
		 *
		 * `source` is the raw markdown text we want copy/regenerate to
		 * reference; passed in rather than scraped from the DOM so the
		 * exact authored content survives the markdown round-trip.
		 */
		function buildAssistantActions(source, isLatest) {
			const bar = document.createElement('div');
			bar.className = 'msg-actions';
			bar.setAttribute('role', 'toolbar');
			bar.setAttribute('aria-label', 'Message actions');

			// Copy
			const copy = document.createElement('button');
			copy.type = 'button';
			copy.className = 'msg-action';
			copy.title = 'Copy message';
			copy.setAttribute('aria-label', 'Copy message');
			copy.innerHTML = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="5" width="8" height="8" rx="1.5"/><path d="M3 11V4a1 1 0 0 1 1-1h7"/></svg>';
			copy.addEventListener('click', () => {
				vscode.postMessage({ type: 'copyCode', text: source || '' });
				const original = copy.title;
				copy.title = 'Copied';
				setTimeout(() => { copy.title = original; }, 1500);
			});
			bar.appendChild(copy);

			// Regenerate — only meaningful on the most recent assistant turn.
			const regen = document.createElement('button');
			regen.type = 'button';
			regen.className = 'msg-action msg-action-regen';
			regen.title = 'Regenerate response';
			regen.setAttribute('aria-label', 'Regenerate response');
			regen.innerHTML = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M13 8a5 5 0 1 1-1.46-3.54"/><path d="M13 3v3h-3"/></svg>';
			if (!isLatest) {
				regen.hidden = true;
			}
			regen.addEventListener('click', () => {
				if (isStreaming || !lastUserPrompt) return;
				// Re-emit the last user prompt as a fresh send. We don't
				// rebuild a user bubble — the previous one stays visible —
				// so the replay matches the typical "regenerate" UX.
				setStreamingState(true);
				startStreamingMessage(getCurrentAgentDisplayName(), currentAgent);
				vscode.postMessage({
					type: 'sendMessage',
					text: lastUserPrompt,
					model: currentModel,
					attachments: [],
					specialistId: currentAgent,
					chatMode: currentMode,
				});
			});
			bar.appendChild(regen);

			// Feedback (visual only). The host-side handler is a future phase;
			// we still emit `feedback` postMessage events for the eventual
			// telemetry pipeline to subscribe to.
			const up = document.createElement('button');
			up.type = 'button';
			up.className = 'msg-action msg-action-fb';
			up.title = 'Helpful';
			up.setAttribute('aria-label', 'Mark response as helpful');
			up.innerHTML = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M6 13V7l3-4 1 1v3h3a1 1 0 0 1 1 1l-1 5H6z"/><path d="M3 7h3v6H3z"/></svg>';
			up.addEventListener('click', () => {
				up.classList.toggle('is-active');
				down.classList.remove('is-active');
				vscode.postMessage({ type: 'feedback', value: up.classList.contains('is-active') ? 'up' : null });
			});
			bar.appendChild(up);

			const down = document.createElement('button');
			down.type = 'button';
			down.className = 'msg-action msg-action-fb';
			down.title = 'Not helpful';
			down.setAttribute('aria-label', 'Mark response as not helpful');
			down.innerHTML = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M10 3v6l-3 4-1-1V9H3a1 1 0 0 1-1-1l1-5h7z"/><path d="M13 3h-3v6h3z"/></svg>';
			down.addEventListener('click', () => {
				down.classList.toggle('is-active');
				up.classList.remove('is-active');
				vscode.postMessage({ type: 'feedback', value: down.classList.contains('is-active') ? 'down' : null });
			});
			bar.appendChild(down);

			return bar;
		}

		/**
		 * Hide the regenerate button on every assistant message except the
		 * most recent. Called when a new assistant turn is started so prior
		 * regenerate buttons disappear.
		 */
		function refreshRegenerateAffordance() {
			const all = messageList.querySelectorAll('.msg-assistant');
			all.forEach((node, idx) => {
				const regen = node.querySelector('.msg-action-regen');
				if (regen) {
					regen.hidden = idx !== all.length - 1;
				}
			});
		}

		/**
		 * Render a structured content array (image and text parts) into a
		 * pre-built body element. Image parts emit a thumbnail `<img>` BEFORE
		 * the text so the bubble lays out vertically — thumbnails on top,
		 * prose below. Returns the concatenated raw text so callers that need
		 * to track it (e.g. `lastUserPrompt`) get a string they can re-send.
		 */
		function renderStructuredContent(body, parts) {
			let textBuffer = '';
			for (const part of parts) {
				if (!part || typeof part !== 'object') continue;
				if (part.type === 'image' && typeof part.base64Data === 'string' && typeof part.mimeType === 'string') {
					const img = document.createElement('img');
					img.className = 'msg-image';
					img.src = 'data:' + part.mimeType + ';base64,' + part.base64Data;
					img.alt = typeof part.name === 'string' ? part.name : '';
					body.appendChild(img);
				} else if (part.type === 'text' && typeof part.text === 'string') {
					textBuffer += (textBuffer ? '\n' : '') + part.text;
				}
			}
			if (textBuffer) {
				const textWrap = document.createElement('div');
				textWrap.className = 'msg-text';
				textWrap.innerHTML = renderMarkdown(textBuffer);
				if (typeof window.__sotaHydrateUiBlocks === 'function') {
					window.__sotaHydrateUiBlocks(textWrap);
				}
				body.appendChild(textWrap);
			}
			return textBuffer;
		}

		/**
		 * Render a relative-time string ("2 minutes ago") for the checkpoint
		 * stripe label and popover header. Mirrors the host's formatter so
		 * what the popover says lines up with what the stripe label says.
		 */
		function formatCheckpointAge(ms) {
			const delta = Math.max(0, Date.now() - Number(ms));
			const seconds = Math.floor(delta / 1000);
			if (seconds < 60) return seconds <= 1 ? 'a moment ago' : seconds + ' seconds ago';
			const minutes = Math.floor(seconds / 60);
			if (minutes < 60) return minutes === 1 ? '1 minute ago' : minutes + ' minutes ago';
			const hours = Math.floor(minutes / 60);
			if (hours < 24) return hours === 1 ? '1 hour ago' : hours + ' hours ago';
			const days = Math.floor(hours / 24);
			return days === 1 ? '1 day ago' : days + ' days ago';
		}

		/**
		 * Insert a horizontal checkpoint stripe immediately AFTER the given
		 * user message wrapper in the message list. The stripe is the
		 * Phase 59 visual upgrade: a 1px line spanning the list width with a
		 * pill-shaped, clickable label that opens the popover with the three
		 * roll-back actions (compare, restore workspace, restore + chat).
		 *
		 * Idempotent only against same-checkpoint duplicates: a stripe that
		 * already exists with the same `data-checkpoint-id` is left alone
		 * (so `checkpointsLoaded` can be re-emitted safely), but a second
		 * checkpoint sharing the same `turnIndex` will append a second
		 * stripe back-to-back rather than deduping.
		 */
		function insertCheckpointStripe(userWrapper, entry) {
			if (!userWrapper || !entry || typeof entry.checkpointId !== 'string') return;
			// Search forward from the user wrapper through any existing
			// stripes we already laid down for this turn and bail if one
			// matches this checkpoint id.
			let cursor = userWrapper.nextSibling;
			while (cursor && cursor instanceof HTMLElement && cursor.classList.contains('checkpoint-stripe')) {
				if (cursor.dataset.checkpointId === entry.checkpointId) {
					return;
				}
				cursor = cursor.nextSibling;
			}
			const stripe = document.createElement('div');
			stripe.className = 'checkpoint-stripe';
			stripe.dataset.checkpointId = entry.checkpointId;
			if (typeof entry.turnIndex === 'number') {
				stripe.dataset.conversationIndex = String(entry.turnIndex);
			}

			const line = document.createElement('div');
			line.className = 'checkpoint-stripe-line';
			line.setAttribute('aria-hidden', 'true');
			stripe.appendChild(line);

			const label = document.createElement('button');
			label.type = 'button';
			label.className = 'checkpoint-stripe-label';
			label.setAttribute('aria-haspopup', 'true');
			label.setAttribute('aria-expanded', 'false');
			const ageText = formatCheckpointAge(entry.capturedAt);
			const tooltipParts = ['Captured ' + ageText];
			if (entry.summary) tooltipParts.push(entry.summary);
			label.title = tooltipParts.join(' · ');
			label.setAttribute('aria-label', 'Workspace checkpoint, ' + tooltipParts.join(', '));
			const summaryHtml = entry.summary
				? '<span class="checkpoint-stripe-summary">' + escapeHtml(String(entry.summary)) + '</span>'
				: '';
			label.innerHTML =
				'<svg viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">' +
				'<circle cx="8" cy="8" r="5.5"/>' +
				'<path d="M8 5v3l2 1.5"/>' +
				'</svg>' +
				'<span>Checkpoint</span>' +
				'<span class="checkpoint-stripe-time">' + escapeHtml(ageText) + '</span>' +
				summaryHtml;
			label.addEventListener('click', (e) => {
				e.stopPropagation();
				openCheckpointPopover(label, entry);
			});
			stripe.appendChild(label);

			// Insert as a sibling AFTER the user wrapper. If there are
			// already stripes from earlier checkpoints on this turn, append
			// after the last of them so they stack back-to-back.
			const insertBefore = cursor || null;
			messageList.insertBefore(stripe, insertBefore);
		}

		// Singleton popover element — created on first use so the DOM stays
		// minimal until the user actually clicks a stripe.
		let checkpointPopover = null;
		let checkpointPopoverEntry = null;
		let checkpointPopoverAnchor = null;

		function ensureCheckpointPopover() {
			if (checkpointPopover) return checkpointPopover;
			const el = document.createElement('div');
			el.className = 'popover checkpoint-stripe-popover';
			el.setAttribute('role', 'menu');
			el.hidden = true;
			el.innerHTML =
				'<div class="popover-section-label" id="checkpointPopoverLabel">Checkpoint</div>' +
				'<div class="checkpoint-popover-meta" id="checkpointPopoverMeta" hidden></div>' +
				'<button class="popover-item" role="menuitem" data-action="compare">' +
				'<span class="item-check"></span>Compare with current</button>' +
				'<button class="popover-item" role="menuitem" data-action="restoreWorkspace">' +
				'<span class="item-check"></span>Restore workspace</button>' +
				'<button class="popover-item" role="menuitem" data-action="restoreAll">' +
				'<span class="item-check"></span>Restore workspace + conversation</button>';
			document.body.appendChild(el);
			el.addEventListener('click', (e) => {
				const target = e.target instanceof HTMLElement ? e.target.closest('[data-action]') : null;
				if (!target || !checkpointPopoverEntry) return;
				const action = target.dataset.action;
				const id = checkpointPopoverEntry.checkpointId;
				closeCheckpointPopover();
				if (action === 'compare') {
					vscode.postMessage({ type: 'checkpointCompare', checkpointId: id });
				} else if (action === 'restoreWorkspace') {
					vscode.postMessage({ type: 'checkpointRestoreWorkspace', checkpointId: id });
				} else if (action === 'restoreAll') {
					vscode.postMessage({ type: 'checkpointRestoreAll', checkpointId: id });
				}
			});
			checkpointPopover = el;
			return el;
		}

		function openCheckpointPopover(anchor, entry) {
			const el = ensureCheckpointPopover();
			checkpointPopoverEntry = entry;
			checkpointPopoverAnchor = anchor;
			const label = el.querySelector('#checkpointPopoverLabel');
			if (label) {
				label.textContent = 'Checkpoint captured ' + formatCheckpointAge(entry.capturedAt);
			}
			const meta = el.querySelector('#checkpointPopoverMeta');
			if (meta) {
				const lines = [];
				if (entry.userMessage) {
					lines.push(
						'<div class="checkpoint-popover-meta-row"><span class="checkpoint-popover-meta-label">User message</span>' +
						'<span class="checkpoint-popover-meta-value">"' + escapeHtml(String(entry.userMessage)) + '"</span></div>'
					);
				}
				if (entry.summary) {
					lines.push(
						'<div class="checkpoint-popover-meta-row"><span class="checkpoint-popover-meta-label">Files</span>' +
						'<span class="checkpoint-popover-meta-value">' + escapeHtml(String(entry.summary)) + '</span></div>'
					);
				}
				if (lines.length > 0) {
					meta.innerHTML = lines.join('');
					meta.hidden = false;
				} else {
					meta.innerHTML = '';
					meta.hidden = true;
				}
			}
			if (anchor instanceof HTMLElement) {
				anchor.setAttribute('aria-expanded', 'true');
			}
			el.hidden = false;
			const rect = anchor.getBoundingClientRect();
			el.style.position = 'fixed';
			// Anchor the popover ABOVE the stripe label by default — the
			// stripe sits between turns, so opening upward keeps the popover
			// over the user message that owns this checkpoint. Fall back to
			// below if there isn't enough room above.
			const popoverHeight = el.offsetHeight || 200;
			const spaceAbove = rect.top;
			const openAbove = spaceAbove >= popoverHeight + 8;
			if (openAbove) {
				el.style.top = Math.max(8, rect.top - popoverHeight - 4) + 'px';
			} else {
				el.style.top = (rect.bottom + 4) + 'px';
			}
			// Right-align so the menu doesn't flow off-screen on narrow
			// side panels.
			el.style.left = 'auto';
			el.style.right = Math.max(8, window.innerWidth - rect.right) + 'px';
		}

		function closeCheckpointPopover() {
			if (checkpointPopover) {
				checkpointPopover.hidden = true;
				checkpointPopoverEntry = null;
				if (checkpointPopoverAnchor instanceof HTMLElement) {
					checkpointPopoverAnchor.setAttribute('aria-expanded', 'false');
				}
				checkpointPopoverAnchor = null;
			}
		}

		// Dismiss the checkpoint popover on outside-click / escape so it
		// behaves like the other menu popovers in the chat header.
		document.addEventListener('click', (e) => {
			if (!checkpointPopover || checkpointPopover.hidden) return;
			const target = e.target instanceof Node ? e.target : null;
			if (target && (checkpointPopover.contains(target) || (target instanceof HTMLElement && target.closest('.checkpoint-stripe-label')))) {
				return;
			}
			closeCheckpointPopover();
		});
		document.addEventListener('keydown', (e) => {
			if (e.key === 'Escape' && checkpointPopover && !checkpointPopover.hidden) {
				closeCheckpointPopover();
			}
		});

		function addMessage(role, content, opts) {
			opts = opts || {};
			const wrapper = document.createElement('div');
			wrapper.className = 'msg msg-' + role;
			if (lastSenderRole === role && role !== 'system') {
				wrapper.classList.add('msg-follow-on');
			}
			const conversationIndex = nextConversationIndex++;
			wrapper.dataset.conversationIndex = String(conversationIndex);
			// Phase 68 — stamp the persisted timestamp on every wrapper so the
			// hover popover can render "Time" / "Sent" without a second lookup.
			// Falls back to "now" only when a freshly-rendered bubble has no
			// caller-supplied timestamp (e.g. local-only system echoes).
			if (typeof opts.timestamp === 'number' && Number.isFinite(opts.timestamp)) {
				wrapper.dataset.timestamp = String(opts.timestamp);
			}

			const isStructured = Array.isArray(content);

			if (role === 'assistant') {
				const specialistId = opts.specialistId || currentAgent;
				const displayName = opts.displayName || getCurrentAgentDisplayName();
				applyPersonaToWrapper(wrapper, specialistId);
				const meta = buildAssistantMeta(displayName, specialistId, opts.timestamp);
				wrapper.appendChild(meta);

				const body = document.createElement('div');
				body.className = 'msg-body';
				if (isStructured) {
					const text = renderStructuredContent(body, content);
					body.appendChild(buildAssistantActions(text, true));
				} else {
					body.innerHTML = renderMarkdown(content);
					body.appendChild(buildAssistantActions(content, true));
				}
				// Hydrate any persisted ui-block placeholders to live blocks.
				if (typeof window.__sotaHydrateUiBlocks === 'function') {
					window.__sotaHydrateUiBlocks(body);
				}
				wrapper.appendChild(body);

				lastAssistantSpecialist = specialistId;
			} else {
				const body = document.createElement('div');
				body.className = 'msg-body';
				let userText = '';
				if (isStructured) {
					userText = renderStructuredContent(body, content);
				} else {
					body.innerHTML = renderMarkdown(content);
					userText = content;
				}
				wrapper.appendChild(body);

				if (role === 'user') {
					lastAssistantSpecialist = null;
					lastUserPrompt = userText;
					// Phase 68 — record the rendered prompt length so the user
					// tooltip can show "Length: N chars" without re-walking the
					// DOM. Uses the visible text (post-attachment-resolution) so
					// the count matches what the user actually sees.
					wrapper.dataset.contentLength = String((userText || '').length);
					// Phase 66 — refresh the sticky transcript header so it
					// always reflects the most recent user prompt.
					updateTranscriptTaskHeader(conversationIndex, userText);
				}
			}

			messageList.appendChild(wrapper);
			// If a checkpoint was captured for this turn before the bubble
			// existed (or we're replaying a stored conversation), insert the
			// stripe(s) immediately after the user wrapper. Stored as an
			// array so multiple checkpoints on the same turn render
			// back-to-back (Phase 59 edge case).
			if (role === 'user') {
				const pending = checkpointsByTurnIndex.get(conversationIndex);
				if (Array.isArray(pending)) {
					for (const cp of pending) {
						insertCheckpointStripe(wrapper, cp);
					}
				}
			}
			lastSenderRole = role;
			refreshRegenerateAffordance();
			scrollToBottom();
			updateEmptyState();
			return wrapper;
		}

		/**
		 * Phase 99 — animated "Anton is thinking" indicator. Three concentric
		 * rings, each with a `stroke-dasharray` ≈ 25% of the circumference,
		 * rotate at different speeds and opposite directions (CSS-driven —
		 * see `chat.css`'s `.thinking-ring` keyframes). Pure SVG so the GPU
		 * can composite the rotation without repainting; honours
		 * `prefers-reduced-motion` by falling back to a slow opacity pulse.
		 *
		 * Caller passes one of:
		 *   - 'inline'   — 16px ring beside a bit of dimmed text.
		 *   - 'standalone' — 24px ring on its own (placeholder cards).
		 *   - 'avatar'   — 12px ring overlaid on a roster avatar.
		 *
		 * Returns the SVG markup as a string so callers can splice it into
		 * a larger `innerHTML` without round-tripping through DOM creation.
		 */
		function renderThinkingIndicator(variant) {
			const v = variant === 'standalone' ? 'standalone' : (variant === 'avatar' ? 'avatar' : 'inline');
			return ''
				+ '<svg class="thinking-ring thinking-ring-' + v + '" viewBox="0 0 32 32" aria-hidden="true">'
				+ '<circle class="thinking-ring-arc thinking-ring-arc-outer" cx="16" cy="16" r="14" pathLength="100" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>'
				+ '<circle class="thinking-ring-arc thinking-ring-arc-mid" cx="16" cy="16" r="10" pathLength="100" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>'
				+ '<circle class="thinking-ring-arc thinking-ring-arc-inner" cx="16" cy="16" r="6" pathLength="100" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>'
				+ '</svg>';
		}

		function startStreamingMessage(displayName, specialistId) {
			const wrapper = document.createElement('div');
			wrapper.className = 'msg msg-assistant';
			if (lastSenderRole === 'assistant') {
				wrapper.classList.add('msg-follow-on');
			}
			wrapper.dataset.conversationIndex = String(nextConversationIndex++);
			// Phase 68 — record the wall-clock start so the hover popover can
			// resolve a relative time even before metrics arrive.
			wrapper.dataset.timestamp = String(Date.now());

			const resolvedId = specialistId || currentAgent;
			applyPersonaToWrapper(wrapper, resolvedId);
			const meta = buildAssistantMeta(displayName || getCurrentAgentDisplayName(), resolvedId, Date.now());
			// Force the meta visible during streaming so the user sees the
			// thinking indicator next to a name even on consecutive
			// assistant turns.
			meta.hidden = false;
			// Phase 99 — animated SVG thinking indicator + small-caps label.
			// Both nodes carry the `streaming-dots` class so existing
			// finalisation code (`clearStreamingIndicator`) removes them
			// the instant the first token arrives. The label is styled
			// dim + small-caps to read as ambient status, not noise.
			const indicator = document.createElement('span');
			indicator.className = 'streaming-dots thinking-indicator';
			indicator.innerHTML = renderThinkingIndicator('inline')
				+ '<span class="thinking-indicator-label">Anton is thinking…</span>';
			meta.appendChild(indicator);
			wrapper.appendChild(meta);
			currentAssistantHeader = meta;

			const body = document.createElement('div');
			body.className = 'msg-body';
			body.dataset.specialistId = resolvedId;
			wrapper.appendChild(body);

			messageList.appendChild(wrapper);
			lastSenderRole = 'assistant';
			lastAssistantSpecialist = resolvedId;
			refreshRegenerateAffordance();
			scrollToBottom();
			currentAssistantDiv = body;
			updateEmptyState();
			return wrapper;
		}

		/**
		 * Smoothly scroll the message list to the bottom. Used after each
		 * append so streaming feels alive without yanking the viewport.
		 */
		function scrollToBottom() {
			messageList.scrollTo({ top: messageList.scrollHeight, behavior: 'smooth' });
		}

		function clearStreamingIndicator() {
			if (currentAssistantHeader) {
				const dots = currentAssistantHeader.querySelector('.streaming-dots');
				if (dots) dots.remove();
				currentAssistantHeader = null;
			}
		}

		function setStreamingState(streaming) {
			isStreaming = streaming;
			sendBtn.classList.toggle('is-streaming', streaming);
			sendBtn.title = streaming ? 'Stop generating' : 'Send (Enter)';
			sendBtn.setAttribute('aria-label', streaming ? 'Stop generating' : 'Send');
			// Streaming swaps the icon to a square stop. Both states share
			// the same outer button so the size transition reads as a morph.
			sendBtn.innerHTML = streaming
				? '<svg viewBox="0 0 16 16" fill="currentColor"><rect x="4" y="4" width="8" height="8" rx="1.5"/></svg>'
				: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M8 13V3M3 8l5-5 5 5"/></svg>';
			if (floatingStop) {
				floatingStop.hidden = !streaming;
			}
			updateSendAffordance();
		}

		// Pull out any `@url <link>` patterns from the prompt text and turn
		// each into a URL mention chip. Returns the cleaned text. Recognised
		// URL forms: http(s)://… up to the next whitespace. Anything that
		// follows '@url ' but isn't a valid URL is left in the text untouched
		// so the user sees their typo and can correct it.
		function extractInlineUrlMentions(text) {
			if (typeof text !== 'string' || text.indexOf('@url') < 0) return text;
			const re = /(^|\s)@url\s+(https?:\/\/[^\s]+)/g;
			let cleaned = text;
			let m;
			const found = [];
			while ((m = re.exec(text)) !== null) {
				found.push({ full: m[0], lead: m[1], url: m[2] });
			}
			for (const entry of found) {
				const candidate = { kind: 'url', url: entry.url, label: '@url ' + entry.url };
				if (!mentionAlreadyAdded(candidate)) {
					mentions.push(candidate);
				}
				cleaned = cleaned.replace(entry.full, entry.lead);
			}
			if (found.length > 0) renderContextChips();
			return cleaned.replace(/\s{2,}/g, ' ').trim();
		}

		function sendMessage() {
			if (isStreaming) {
				vscode.postMessage({ type: 'cancelRequest' });
				return;
			}
			let text = messageInput.value.trim();

			// `@url <link>` is a deferred chip — when the user types '@url '
			// in the textarea and then a URL, we want to materialise the chip
			// at send time so the link doesn't end up inside the prompt body.
			// Strip every '@url <link>' occurrence and convert each into a
			// real mention before the text is dispatched.
			text = extractInlineUrlMentions(text);

			if (!text && mentions.length === 0 && attachments.length === 0 && imageAttachments.length === 0) return;

			// Build the user bubble. When images are attached we render them
			// as a structured array (image parts followed by the text part)
			// so the bubble shows thumbnails BEFORE the typed text — mirrors
			// how the model sees the same turn on the wire. Plain text turns
			// keep the simple string shape.
			const bubbleParts = [];
			if (text) bubbleParts.push(text);
			if (mentions.length > 0) {
				bubbleParts.push(mentions.map(m => '`' + (m.label || m.path || m.kind || '') + '`').join(' '));
			}
			const bubbleText = bubbleParts.join(' ');
			if (imageAttachments.length > 0) {
				const structured = imageAttachments.map(img => ({
					type: 'image',
					mimeType: img.mime,
					base64Data: img.base64,
					name: img.name,
				}));
				structured.push({ type: 'text', text: bubbleText || '(image attachment)' });
				addMessage('user', structured, { timestamp: Date.now() });
			} else {
				addMessage('user', bubbleText || '(no text)', { timestamp: Date.now() });
			}
			// Regenerate / Up-Arrow recall both want the user's typed text
			// without the mention-chip annotation tail, so they round-trip
			// cleanly when re-sent.
			lastUserPrompt = text;
			lastSentUserText = text;
			// Phase 87 — push the submitted prompt onto the persistent
			// recall buffer so subsequent Up/Down arrows step through it.
			pushCommandHistory(text);
			messageInput.value = '';
			messageInput.style.height = 'auto';
			closeSlashPopup();
			closeMentionPopup();
			updateSendAffordance();
			setStreamingState(true);
			// Capture the agent display name and id at send time so
			// subsequent specialist switches don't relabel this message.
			startStreamingMessage(getCurrentAgentDisplayName(), currentAgent);

			// Serialize the mention chips into a wire-friendly form. The host
			// keeps backward compatibility with the legacy string[] shape by
			// inspecting `mentionsKinded` first; we still send the simple
			// path[] under `mentions` so older message handlers (e.g. session
			// replay) keep working without touching the new schema.
			const mentionsKinded = mentions.map(m => {
				if (m.kind === 'problems') return { kind: 'problems' };
				if (m.kind === 'terminal') return { kind: 'terminal' };
				if (m.kind === 'url') return { kind: 'url', url: m.url };
				if (m.kind === 'workspace') return { kind: 'workspace' };
				if (m.kind === 'folder') return { kind: 'folder', path: m.path };
				return { kind: 'file', path: m.path };
			});
			const mentionsLegacy = mentions
				.map(m => (m.path ? m.path : (m.kind === 'workspace' ? '[workspace]' : '')))
				.filter(p => typeof p === 'string' && p.length > 0);
			vscode.postMessage({
				type: 'sendMessage',
				text: text,
				model: currentModel,
				attachments: [...attachments],
				mentions: mentionsLegacy,
				mentionsKinded,
				images: imageAttachments.map(img => ({ mime: img.mime, base64: img.base64, name: img.name })),
				specialistId: currentAgent,
				chatMode: currentMode,
			});

			attachments = [];
			mentions = [];
			imageAttachments = [];
			renderContextChips();
		}

		/**
		 * Toggle the send button between empty/idle and ready states. The
		 * idle state uses a muted background; once there's text to send,
		 * the accent kicks in to invite the click. `is-streaming` is set
		 * by `setStreamingState` and overrides the empty styling.
		 */
		function updateSendAffordance() {
			if (isStreaming) {
				sendBtn.classList.remove('is-empty');
				return;
			}
			const hasText = messageInput.value.trim().length > 0;
			const hasContext = attachments.length > 0 || mentions.length > 0 || imageAttachments.length > 0;
			sendBtn.classList.toggle('is-empty', !hasText && !hasContext);
		}

		// Use closest('.code-block') so the lookup keeps working regardless
		// of how deeply nested the action button is inside the header
		// (we wrap the buttons in a .code-actions container).
		function findCodeElForButton(btn) {
			const block = btn.closest ? btn.closest('.code-block') : null;
			return block ? block.querySelector('code') : null;
		}

		window.copyCode = function (btn) {
			const codeEl = findCodeElForButton(btn);
			const code = codeEl ? codeEl.textContent : '';
			vscode.postMessage({ type: 'copyCode', text: code });
			btn.textContent = 'Copied';
			setTimeout(() => btn.textContent = 'Copy', 1500);
		};

		window.openCodeInEditor = function (btn) {
			const codeEl = findCodeElForButton(btn);
			const code = codeEl ? codeEl.textContent : '';
			// Pull language from class="language-<lang>"
			let language = '';
			if (codeEl) {
				const cls = (codeEl.className || '').match(/language-([\w-]+)/);
				if (cls && cls[1]) {
					language = cls[1];
				}
			}
			vscode.postMessage({ type: 'openCodeInEditor', code: code, language: language });
			btn.textContent = 'Opened';
			setTimeout(() => btn.textContent = 'Open', 1500);
		};

		window.saveCodeToFile = function (btn) {
			const codeEl = findCodeElForButton(btn);
			const code = codeEl ? codeEl.textContent : '';
			const relPath = btn.dataset.path || '';
			if (!relPath || !code) return;
			vscode.postMessage({ type: 'saveCodeToFile', code: code, relPath: relPath });
			btn.textContent = 'Saving\u2026';
			setTimeout(() => btn.textContent = 'Save', 2000);
		};

		window.previewDiff = function (btn) {
			const encoded = btn.dataset.diff || '';
			try {
				const diffText = decodeURIComponent(escape(atob(encoded)));
				vscode.postMessage({ type: 'previewDiff', diff: diffText });
				btn.textContent = 'Opening\u2026';
				setTimeout(() => btn.textContent = 'Preview', 2000);
			} catch (err) {
				console.warn('Failed to decode diff payload', err);
			}
		};

		function updateEmptyState() {
			const hasMessages = messageList.querySelector('.msg') !== null;
			emptyState.style.display = hasMessages ? 'none' : '';
		}

		/**
		 * Total base64 weight of the currently-attached images. Compared
		 * against the per-message cap before adding a new entry.
		 */
		function totalAttachedImageBytes() {
			let sum = 0;
			for (const img of imageAttachments) {
				if (img && typeof img.base64 === 'string') {
					// base64.length / BASE64_OVERHEAD approximates raw byte size.
					sum += Math.floor(img.base64.length / BASE64_OVERHEAD);
				}
			}
			return sum;
		}

		/**
		 * Surface a brief toast above the composer. We keep the implementation
		 * trivial — a single transient message line — to avoid pulling in a
		 * full toast library for what's a rare error path.
		 */
		function showComposerToast(text) {
			let toast = document.getElementById('composerToast');
			if (!toast) {
				toast = document.createElement('div');
				toast.id = 'composerToast';
				toast.className = 'composer-toast';
				const composerEl = document.querySelector('.composer');
				if (composerEl) {
					composerEl.insertBefore(toast, composerEl.firstChild);
				}
			}
			toast.textContent = text;
			toast.classList.add('is-visible');
			clearTimeout(showComposerToast._timer);
			showComposerToast._timer = setTimeout(() => {
				toast.classList.remove('is-visible');
			}, 3500);
		}

		/**
		 * Validate and stash an incoming image attachment. Enforces the
		 * per-message count cap and total-byte cap; rejects anything whose
		 * MIME type isn't `image/*`. Returns true when the entry was
		 * accepted, false otherwise so callers (drop, paste, picker) can
		 * batch-process without each duplicating the toast.
		 */
		function addImageAttachment(payload) {
			if (!payload || typeof payload !== 'object') {
				return false;
			}
			const mime = typeof payload.mime === 'string' ? payload.mime : '';
			const base64 = typeof payload.base64 === 'string' ? payload.base64 : '';
			const name = typeof payload.name === 'string' ? payload.name : '';
			if (!mime.startsWith('image/') || base64.length === 0) {
				showComposerToast('Image attachment rejected: unsupported format.');
				return false;
			}
			if (imageAttachments.length >= MAX_IMAGES_PER_MESSAGE) {
				showComposerToast('Maximum of ' + MAX_IMAGES_PER_MESSAGE + ' images per message.');
				return false;
			}
			const incomingBytes = Math.floor(base64.length / BASE64_OVERHEAD);
			if (totalAttachedImageBytes() + incomingBytes > MAX_IMAGE_BYTES_TOTAL) {
				showComposerToast('Image attachments exceed 5MB cap for this message.');
				return false;
			}
			imageAttachments.push({ id: 'img-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8), mime, base64, name });
			renderContextChips();
			updateSendAffordance();
			return true;
		}

		/**
		 * Read a Blob / File as base64 (without the data: prefix). Wraps
		 * FileReader's callback flow in a Promise for use from async drop /
		 * paste handlers.
		 */
		function readBlobAsBase64(blob) {
			return new Promise((resolve, reject) => {
				const reader = new FileReader();
				reader.onerror = () => reject(reader.error || new Error('FileReader failed'));
				reader.onload = () => {
					const result = typeof reader.result === 'string' ? reader.result : '';
					const commaIdx = result.indexOf(',');
					resolve({ mime: blob.type || 'image/png', base64: commaIdx >= 0 ? result.slice(commaIdx + 1) : result });
				};
				reader.readAsDataURL(blob);
			});
		}

		function renderContextChips() {
			contextChips.textContent = '';
			attachments.forEach((id, i) => {
				const chip = document.createElement('span');
				chip.className = 'context-chip';
				chip.textContent = ATTACH_LABELS[id] || id;
				const remove = document.createElement('button');
				remove.className = 'context-chip-remove';
				remove.title = 'Remove';
				remove.setAttribute('aria-label', 'Remove ' + (ATTACH_LABELS[id] || id));
				remove.textContent = '\u00D7';
				remove.addEventListener('click', () => {
					attachments.splice(i, 1);
					renderContextChips();
				});
				chip.appendChild(remove);
				contextChips.appendChild(chip);
			});
			imageAttachments.forEach((img, i) => {
				const chip = document.createElement('span');
				chip.className = 'context-chip attachment-chip';
				chip.dataset.attachmentId = img.id;
				chip.dataset.mime = img.mime;
				const thumb = document.createElement('img');
				thumb.className = 'attachment-thumb';
				thumb.src = 'data:' + img.mime + ';base64,' + img.base64;
				thumb.alt = '';
				chip.appendChild(thumb);
				const label = document.createElement('span');
				label.className = 'attachment-label';
				label.textContent = img.name || 'image';
				label.title = img.name || 'image';
				chip.appendChild(label);
				const remove = document.createElement('button');
				remove.className = 'context-chip-remove attachment-remove';
				remove.title = 'Remove';
				remove.setAttribute('aria-label', 'Remove ' + (img.name || 'image'));
				remove.textContent = '\u00D7';
				remove.addEventListener('click', () => {
					imageAttachments.splice(i, 1);
					renderContextChips();
					updateSendAffordance();
				});
				chip.appendChild(remove);
				contextChips.appendChild(chip);
			});
			mentions.forEach((mention, i) => {
				if (!mention || typeof mention.kind !== 'string') return;
				const chip = document.createElement('span');
				chip.className = 'context-chip context-chip-mention';
				chip.dataset.mentionKind = mention.kind;
				const icon = document.createElement('span');
				icon.className = 'context-chip-icon';
				if (mention.kind === 'workspace') icon.textContent = '\u25A2';
				else if (mention.kind === 'folder') icon.textContent = '\u25A2';
				else if (mention.kind === 'problems') icon.textContent = '\u26A0';
				else if (mention.kind === 'terminal') icon.textContent = '\u232B';
				else if (mention.kind === 'url') icon.textContent = '\u29C9';
				else icon.textContent = '\u00B6';
				chip.appendChild(icon);
				const label = document.createElement('span');
				label.className = 'context-chip-label';
				// URL chips truncate the displayed URL so a long link doesn't
				// blow out the composer; the full URL stays in `data-url` and
				// the title tooltip.
				let displayLabel = mention.label || '';
				let titleText = displayLabel;
				if (mention.kind === 'url' && mention.url) {
					chip.dataset.url = mention.url;
					const max = 40;
					const trimmed = mention.url.length > max ? mention.url.slice(0, max - 1) + '\u2026' : mention.url;
					displayLabel = '@url ' + trimmed;
					titleText = mention.url;
				} else if (mention.kind === 'terminal') {
					titleText = 'Terminal buffer capture not yet supported \u2014 paste output manually.';
				} else if (mention.path) {
					chip.dataset.path = mention.path;
				}
				label.textContent = displayLabel;
				label.title = titleText;
				chip.appendChild(label);
				const remove = document.createElement('button');
				remove.className = 'context-chip-remove';
				remove.title = 'Remove mention';
				remove.setAttribute('aria-label', 'Remove mention ' + displayLabel);
				remove.textContent = '\u00D7';
				remove.addEventListener('click', () => {
					mentions.splice(i, 1);
					renderContextChips();
				});
				chip.appendChild(remove);
				contextChips.appendChild(chip);
			});
		}

		function updateModelLabel() {
			modelLabel.textContent = MODEL_LABELS[currentModel] || currentModel;
			updateReasoningChipVisibility();
		}

		function updateModelMenuChecks() {
			modelMenu.querySelectorAll('.popover-item').forEach((item) => {
				const check = item.querySelector('.item-check');
				if (!check) return;
				check.textContent = item.dataset.model === currentModel ? '\u2713' : '';
			});
		}

		// Phase 4 \u2014 show reasoning controls only for capable models.
		// gpt-5* / o-series / foundry-(o|gpt-5) \u2192 reasoning_effort dropdown.
		// Claude 4.x (incl. bedrock-claude-(opus|sonnet|haiku)-4) \u2192 thinking budget.
		function modelSupportsReasoningEffort(model) {
			return /^(o[0-9]|gpt-5)/.test(model) || /^foundry-(o[0-9]|gpt-5)/.test(model);
		}
		function modelSupportsThinkingBudget(model) {
			return /^claude-(opus|sonnet|haiku)-4/.test(model) || /^bedrock-claude-(opus|sonnet|haiku)-4/.test(model);
		}
		function updateReasoningChipVisibility() {
			const effortChip = document.getElementById('reasoningEffortChip');
			const thinkingChip = document.getElementById('thinkingBudgetChip');
			if (effortChip) effortChip.hidden = !modelSupportsReasoningEffort(currentModel);
			if (thinkingChip) thinkingChip.hidden = !modelSupportsThinkingBudget(currentModel);
		}

		function getCurrentAgentDisplayName() {
			const match = SPECIALISTS.find(s => s && s.id === currentAgent);
			return match ? match.displayName : 'Anton';
		}

		function renderAgentMenu() {
			agentMenu.textContent = '';
			SPECIALISTS.forEach((spec) => {
				if (!spec || !spec.id) return;
				const item = document.createElement('button');
				item.className = 'popover-item';
				item.setAttribute('role', 'menuitem');
				item.dataset.agent = spec.id;

				const check = document.createElement('span');
				check.className = 'item-check';
				item.appendChild(check);

				item.appendChild(document.createTextNode(spec.displayName || spec.id));

				if (spec.description) {
					const desc = document.createElement('span');
					desc.className = 'item-key';
					desc.textContent = spec.description;
					item.appendChild(desc);
				}
				agentMenu.appendChild(item);
			});
		}

		function updateAgentLabel() {
			agentLabel.textContent = getCurrentAgentDisplayName();
			applyPersonaAccentToRoot();
		}

		/**
		 * Stamp the active specialist's accent colour onto the root `.chat`
		 * container so persona-driven CSS rules (composer border tint,
		 * send-button glow, tab underline, etc.) can react via
		 * `var(--persona-accent)` and the `[data-active-specialist]`
		 * attribute. Phase 80 — ambient persona theming. The default
		 * orchestrator (`anton`) intentionally leaves the attribute unset so
		 * the panel falls back to the neutral sota-accent palette.
		 */
		function applyPersonaAccentToRoot() {
			const root = document.querySelector('.chat');
			if (!root) return;
			const persona = currentAgent && currentAgent !== 'anton'
				? PERSONAS_BY_ID[currentAgent]
				: null;
			if (persona && persona.accent) {
				root.style.setProperty('--persona-accent', persona.accent);
				root.dataset.activeSpecialist = currentAgent;
			} else {
				root.style.removeProperty('--persona-accent');
				delete root.dataset.activeSpecialist;
			}
			// Phase 80 — flag the composer container so the 1px persona stripe
			// down its left edge appears only when a non-default specialist
			// is pinned. The accent itself is read from the inherited
			// `--persona-accent` custom property set above, so the stripe
			// stays in sync without a second variable plumbed through.
			const composerEl = document.querySelector('.composer');
			if (composerEl) {
				if (persona && persona.accent) {
					composerEl.dataset.specialistPinned = 'true';
				} else {
					delete composerEl.dataset.specialistPinned;
				}
			}
		}

		/**
		 * Phase 80 — toggle the red pulse on the chat panel header while
		 * `@anton-security` is actively running a subtask. Webview-side
		 * stand-in for an activity-bar icon pulse (which would require a
		 * contribution-point change to swap the icon SVG). The host posts
		 * `securityPulseStart` / `securityPulseStop` from
		 * `ChatPanel.handleAgentEvent` so the cue starts and stops in
		 * lock-step with the orchestrator's subtask lifecycle. A no-op when
		 * the header element is missing (e.g. early in tab init).
		 */
		function setSecurityPulse(active) {
			const header = document.querySelector('.chat-header');
			if (!header) {
				return;
			}
			header.classList.toggle('security-pulsing', !!active);
		}

		/**
		 * Update the small subtitle line in the header. We surface the
		 * active specialist so the user knows who they're addressing
		 * even when the composer chip is off-screen on tall messages.
		 * Hidden when the active specialist is the default `anton`.
		 */
		function updateHeaderSubtitle() {
			if (!hdrSubtitle) return;
			if (currentAgent && currentAgent !== 'anton') {
				const name = getCurrentAgentDisplayName();
				hdrSubtitle.textContent = 'Active: ' + name;
				hdrSubtitle.hidden = false;
			} else {
				hdrSubtitle.textContent = '';
				hdrSubtitle.hidden = true;
			}
		}

		function updateAgentMenuChecks() {
			agentMenu.querySelectorAll('.popover-item').forEach((item) => {
				const check = item.querySelector('.item-check');
				if (!check) return;
				check.textContent = item.dataset.agent === currentAgent ? '\u2713' : '';
			});
		}

		/**
		 * Sync the Plan/Act pill button states, the toggle wrapper's accent
		 * data-mode, the composer hint banner, and the textarea placeholder
		 * with `currentMode`. Idempotent — called on first paint and after
		 * every mode flip from either direction (host echo, button click,
		 * keyboard shortcut).
		 */
		function updateModeUi() {
			if (planActToggle) {
				planActToggle.dataset.mode = currentMode;
			}
			planActButtons.forEach((btn) => {
				const isActive = btn.dataset.mode === currentMode;
				btn.classList.toggle('active', isActive);
				btn.setAttribute('aria-checked', isActive ? 'true' : 'false');
				// Roving tabindex: only the active button is in the tab order so
				// keyboard users can focus the toggle once and arrow between
				// states without trapping inside the radiogroup.
				btn.tabIndex = isActive ? 0 : -1;
			});
			if (composerModeNote) {
				composerModeNote.hidden = currentMode !== 'plan';
			}
			updateComposerPlaceholder();
		}

		/**
		 * Phase 80 — drive `messageInput.placeholder` from BOTH the active mode
		 * and the active specialist so the composer reflects the persona's
		 * voice. Plan mode wins (it's an orchestrator-only mode, so the
		 * specialist placeholder would be misleading); otherwise fall through
		 * to the persona-specific prompt and finally to the default. Idempotent
		 * — safe to call from any state-change path.
		 */
		function updateComposerPlaceholder() {
			if (!messageInput) {
				return;
			}
			if (currentMode === 'plan') {
				messageInput.placeholder = PLAN_COMPOSER_PLACEHOLDER;
				return;
			}
			const personaPrompt = PERSONA_PLACEHOLDERS[currentAgent];
			messageInput.placeholder = personaPrompt || DEFAULT_COMPOSER_PLACEHOLDER;
		}

		function toggleMenu(menu, anchor) {
			const isHidden = menu.hasAttribute('hidden');
			document.querySelectorAll('.popover').forEach(m => m.setAttribute('hidden', ''));
			if (!isHidden) return;
			menu.removeAttribute('hidden');
			const rect = anchor.getBoundingClientRect();
			menu.style.left = rect.left + 'px';
			menu.style.bottom = (window.innerHeight - rect.top + 4) + 'px';
		}

		function closeMenus() {
			document.querySelectorAll('.popover').forEach(m => m.setAttribute('hidden', ''));
		}

		// --- Slash + @-mention popups ---
		// Shared pattern: track an "active token" inside the textarea (a leading
		// '/' on the current line, or an '@' followed by the typed query) and
		// keep the relevant popup synced as the user types. Selection lives in
		// the popup state; Enter/Tab inserts, Escape dismisses without inserting.

		const slashPopupState = { open: false, items: [], activeIndex: 0, query: '', tokenStart: -1 };
		const mentionPopupState = { open: false, items: [], activeIndex: 0, query: '', tokenStart: -1 };

		function openSlashPopup(query, tokenStart) {
			if (!slashPopup) return;
			const filtered = filterSlashCommands(query);
			slashPopupState.open = true;
			slashPopupState.items = filtered;
			slashPopupState.activeIndex = filtered.length > 0 ? 0 : -1;
			slashPopupState.query = query;
			slashPopupState.tokenStart = tokenStart;
			renderSlashPopup();
			slashPopup.removeAttribute('hidden');
		}

		function closeSlashPopup() {
			if (!slashPopup) return;
			slashPopupState.open = false;
			slashPopupState.items = [];
			slashPopupState.activeIndex = -1;
			slashPopupState.query = '';
			slashPopupState.tokenStart = -1;
			slashPopup.setAttribute('hidden', '');
			slashPopup.textContent = '';
		}

		function filterSlashCommands(query) {
			const list = Array.isArray(SLASH_COMMANDS) ? SLASH_COMMANDS : [];
			const q = (query || '').toLowerCase();
			if (!q) {
				return list.slice(0, 10);
			}
			return list.filter(c => {
				const name = (c && c.name ? c.name : '').toLowerCase();
				return name.startsWith('/' + q) || name.includes(q);
			}).slice(0, 10);
		}

		function renderSlashPopup() {
			if (!slashPopup) return;
			slashPopup.textContent = '';
			if (slashPopupState.items.length === 0) {
				const empty = document.createElement('div');
				empty.className = 'popup-empty';
				empty.textContent = 'No matching commands';
				slashPopup.appendChild(empty);
				return;
			}
			slashPopupState.items.forEach((cmd, idx) => {
				const item = document.createElement('button');
				item.type = 'button';
				item.className = 'popup-item';
				item.setAttribute('role', 'option');
				if (idx === slashPopupState.activeIndex) {
					item.classList.add('is-active');
					item.setAttribute('aria-selected', 'true');
				}
				const name = document.createElement('span');
				name.className = 'popup-item-name';
				name.textContent = cmd.name + (cmd.args ? ' ' + cmd.args : '');
				const desc = document.createElement('span');
				desc.className = 'popup-item-desc';
				desc.textContent = cmd.description || '';
				item.appendChild(name);
				item.appendChild(desc);
				item.addEventListener('mousedown', (ev) => {
					// Use mousedown rather than click so the textarea doesn't
					// lose focus before we replace its content.
					ev.preventDefault();
					selectSlashItem(idx);
				});
				slashPopup.appendChild(item);
			});
		}

		function selectSlashItem(index) {
			const item = slashPopupState.items[index];
			if (!item) {
				closeSlashPopup();
				return;
			}
			const value = messageInput.value;
			const tokenStart = slashPopupState.tokenStart;
			if (tokenStart < 0) {
				closeSlashPopup();
				return;
			}
			// Replace from the leading '/' through the cursor with the chosen
			// command name plus a trailing space so the user can type args.
			const cursor = messageInput.selectionStart || value.length;
			const head = value.slice(0, tokenStart);
			const tail = value.slice(cursor);
			const inserted = item.name + ' ';
			messageInput.value = head + inserted + tail;
			const newCursor = head.length + inserted.length;
			try { messageInput.setSelectionRange(newCursor, newCursor); } catch (e) { /* tolerated */ }
			messageInput.dispatchEvent(new Event('input'));
			closeSlashPopup();
		}

		function openMentionPopup(query, tokenStart) {
			if (!mentionPopup) return;
			const filtered = filterMentionCandidates(query);
			mentionPopupState.open = true;
			mentionPopupState.items = filtered;
			mentionPopupState.activeIndex = filtered.length > 0 ? 0 : -1;
			mentionPopupState.query = query;
			mentionPopupState.tokenStart = tokenStart;
			renderMentionPopup();
			mentionPopup.removeAttribute('hidden');
		}

		function closeMentionPopup() {
			if (!mentionPopup) return;
			mentionPopupState.open = false;
			mentionPopupState.items = [];
			mentionPopupState.activeIndex = -1;
			mentionPopupState.query = '';
			mentionPopupState.tokenStart = -1;
			mentionPopup.setAttribute('hidden', '');
			mentionPopup.textContent = '';
		}

		// Pseudo-entries injected ahead of the workspace index so the popup
		// always offers the @problems / @terminal / @url shortcuts. They share
		// the same shape as workspace-index entries (kind/name/relPath) so the
		// existing filter and render code paths handle them transparently.
		const PSEUDO_MENTIONS = [
			{ kind: 'problems', name: '@problems', relPath: '[problems]', description: 'current diagnostics' },
			{ kind: 'url', name: '@url <link>', relPath: '[url]', description: 'fetch URL' },
			{ kind: 'terminal', name: '@terminal', relPath: '[terminal]', description: 'last terminal output' },
		];

		function filterMentionCandidates(query) {
			const list = Array.isArray(WORKSPACE_INDEX) ? WORKSPACE_INDEX : [];
			const q = (query || '').toLowerCase();
			// Pseudo-entries are matched on their literal '@name' so 'pr' picks
			// '@problems', 'te' picks '@terminal', etc. Empty query shows them
			// all up front, alongside the first slice of workspace results.
			const pseudoMatches = PSEUDO_MENTIONS.filter(p => {
				if (!q) return true;
				const rawName = (p.name || '').toLowerCase().replace(/^@/, '');
				return rawName.startsWith(q) || rawName.includes(q);
			});
			if (!q) {
				return [...pseudoMatches, ...list.slice(0, 12 - pseudoMatches.length)];
			}
			// Lightweight fuzzy: prefer prefix match on name, then substring on
			// path. Keeps the hot path predictable for hundreds of candidates.
			const scored = [];
			for (const entry of list) {
				if (!entry || typeof entry.relPath !== 'string') continue;
				const name = (entry.name || '').toLowerCase();
				const rel = (entry.relPath || '').toLowerCase();
				let score = -1;
				if (name === q) score = 100;
				else if (name.startsWith(q)) score = 80;
				else if (name.includes(q)) score = 60;
				else if (rel.includes(q)) score = 40;
				if (score >= 0) scored.push({ entry, score });
			}
			scored.sort((a, b) => b.score - a.score);
			const workspaceMatches = scored.slice(0, 12 - pseudoMatches.length).map(s => s.entry);
			return [...pseudoMatches, ...workspaceMatches];
		}

		function renderMentionPopup() {
			if (!mentionPopup) return;
			mentionPopup.textContent = '';
			if (mentionPopupState.items.length === 0) {
				const empty = document.createElement('div');
				empty.className = 'popup-empty';
				empty.textContent = 'No matching files';
				mentionPopup.appendChild(empty);
				return;
			}
			mentionPopupState.items.forEach((entry, idx) => {
				const item = document.createElement('button');
				item.type = 'button';
				item.className = 'popup-item popup-item-mention';
				item.setAttribute('role', 'option');
				if (idx === mentionPopupState.activeIndex) {
					item.classList.add('is-active');
					item.setAttribute('aria-selected', 'true');
				}
				const icon = document.createElement('span');
				icon.className = 'popup-item-icon';
				icon.setAttribute('aria-hidden', 'true');
				if (entry.kind === 'folder') icon.textContent = '\u25A2';
				else if (entry.kind === 'workspace') icon.textContent = '\u2317';
				else if (entry.kind === 'problems') icon.textContent = '\u26A0';
				else if (entry.kind === 'terminal') icon.textContent = '\u232B';
				else if (entry.kind === 'url') icon.textContent = '\u29C9';
				else icon.textContent = '\u00B6';
				const name = document.createElement('span');
				name.className = 'popup-item-name';
				name.textContent = entry.name || entry.relPath;
				const path = document.createElement('span');
				path.className = 'popup-item-desc';
				// Pseudo-entries surface their description text rather than the
				// synthetic [bracket] relPath (which is just an internal id).
				path.textContent = entry.description || entry.relPath;
				item.appendChild(icon);
				item.appendChild(name);
				item.appendChild(path);
				item.addEventListener('mousedown', (ev) => {
					ev.preventDefault();
					selectMentionItem(idx);
				});
				mentionPopup.appendChild(item);
			});
		}

		function selectMentionItem(index) {
			const entry = mentionPopupState.items[index];
			if (!entry) {
				closeMentionPopup();
				return;
			}
			const value = messageInput.value;
			const tokenStart = mentionPopupState.tokenStart;
			if (tokenStart < 0) {
				closeMentionPopup();
				return;
			}
			const cursor = messageInput.selectionStart || value.length;
			const head = value.slice(0, tokenStart);
			const tail = value.slice(cursor);

			// @url is a special two-step interaction: picking it inserts
			// '@url ' verbatim into the textarea so the user can keep typing
			// the actual URL. The chip is materialised on send (or on space).
			if (entry.kind === 'url') {
				const inserted = '@url ';
				messageInput.value = head + inserted + tail;
				const newCursor = head.length + inserted.length;
				try { messageInput.setSelectionRange(newCursor, newCursor); } catch (e) { /* tolerated */ }
				messageInput.dispatchEvent(new Event('input'));
				closeMentionPopup();
				return;
			}

			messageInput.value = head + tail;
			try { messageInput.setSelectionRange(head.length, head.length); } catch (e) { /* tolerated */ }
			const mention = mentionFromIndexEntry(entry);
			if (mention && !mentionAlreadyAdded(mention)) {
				mentions.push(mention);
				renderContextChips();
			}
			messageInput.dispatchEvent(new Event('input'));
			closeMentionPopup();
		}

		// Translate a workspace-index / pseudo entry into the persisted
		// `mentions` shape. Returns null if the entry can't be turned into a
		// mention (defensive — shouldn't happen with current call sites).
		function mentionFromIndexEntry(entry) {
			if (!entry || typeof entry.kind !== 'string') return null;
			if (entry.kind === 'problems') return { kind: 'problems', label: '@problems' };
			if (entry.kind === 'terminal') return { kind: 'terminal', label: '@terminal' };
			if (entry.kind === 'workspace') return { kind: 'workspace', path: '[workspace]', label: '[workspace]' };
			if (entry.kind === 'folder' || entry.kind === 'file') {
				return { kind: entry.kind, path: entry.relPath, label: entry.relPath };
			}
			return null;
		}

		// Cheap dedupe: file/folder mentions key off path, pseudo mentions key
		// off kind so the user can't add @problems twice.
		function mentionAlreadyAdded(candidate) {
			return mentions.some(m => {
				if (!m || m.kind !== candidate.kind) return false;
				if (candidate.kind === 'file' || candidate.kind === 'folder') return m.path === candidate.path;
				if (candidate.kind === 'workspace') return true;
				if (candidate.kind === 'problems' || candidate.kind === 'terminal') return true;
				if (candidate.kind === 'url') return m.url === candidate.url;
				return false;
			});
		}

		/**
		 * Detect the active typing token under the cursor and (re)open the
		 * appropriate popup. A '/' at the start of the current line opens the
		 * slash popup; an '@' followed by non-whitespace anywhere opens the
		 * mention popup. Dismissal is automatic when the token ends.
		 */
		function updatePopupsFromInput() {
			const value = messageInput.value;
			const cursor = messageInput.selectionStart != null ? messageInput.selectionStart : value.length;
			const before = value.slice(0, cursor);

			// Slash command detection: only at start of a fresh line.
			const slashLine = before.split(/\r?\n/).pop() || '';
			if (slashLine.startsWith('/') && !/\s/.test(slashLine)) {
				const tokenStart = before.length - slashLine.length;
				const query = slashLine.slice(1);
				openSlashPopup(query, tokenStart);
			} else if (slashPopupState.open) {
				closeSlashPopup();
			}

			// @-mention detection: find the most recent '@' not preceded by a
			// non-whitespace character (so emails like 'foo@bar' don't trigger).
			const atMatch = /(^|\s)@([^\s@]*)$/.exec(before);
			if (atMatch) {
				const tokenStart = atMatch.index + atMatch[1].length;
				const query = atMatch[2];
				openMentionPopup(query, tokenStart);
			} else if (mentionPopupState.open) {
				closeMentionPopup();
			}
		}

		/**
		 * Intercept arrow/enter/tab/escape keys when a popup is open so the
		 * popup gets first dibs over the textarea's default behaviour. Returns
		 * true when the key was consumed by a popup so the caller can early-
		 * return without running its own handlers.
		 */
		function handlePopupKeydown(e) {
			const slashOpen = slashPopupState.open;
			const mentionOpen = mentionPopupState.open;
			if (!slashOpen && !mentionOpen) {
				return false;
			}
			const state = slashOpen ? slashPopupState : mentionPopupState;
			const render = slashOpen ? renderSlashPopup : renderMentionPopup;
			const select = slashOpen ? selectSlashItem : selectMentionItem;
			const close = slashOpen ? closeSlashPopup : closeMentionPopup;

			if (e.key === 'ArrowDown') {
				e.preventDefault();
				if (state.items.length > 0) {
					state.activeIndex = (state.activeIndex + 1) % state.items.length;
					render();
				}
				return true;
			}
			if (e.key === 'ArrowUp') {
				e.preventDefault();
				if (state.items.length > 0) {
					state.activeIndex = (state.activeIndex - 1 + state.items.length) % state.items.length;
					render();
				}
				return true;
			}
			if (e.key === 'Enter' || e.key === 'Tab') {
				if (state.items.length === 0 || state.activeIndex < 0) {
					close();
					return false;
				}
				e.preventDefault();
				select(state.activeIndex);
				return true;
			}
			if (e.key === 'Escape') {
				e.preventDefault();
				close();
				return true;
			}
			return false;
		}

		// --- Event wiring ---

		sendBtn.addEventListener('click', sendMessage);

		if (floatingStop) {
			floatingStop.addEventListener('click', () => {
				if (isStreaming) {
					vscode.postMessage({ type: 'cancelRequest' });
				}
			});
		}

		newChatBtn.addEventListener('click', () => {
			vscode.postMessage({ type: 'clearConversation' });
		});

		if (exportBtn) {
			exportBtn.addEventListener('click', () => {
				vscode.postMessage({ type: 'exportConversation' });
			});
		}

		messageInput.addEventListener('keydown', (e) => {
			// Slash/mention popups intercept arrow/enter/tab/escape first so
			// the textarea's default handling doesn't fight the popup UX.
			if (handlePopupKeydown(e)) {
				return;
			}
			if (e.key === 'Escape' && isStreaming) {
				e.preventDefault();
				vscode.postMessage({ type: 'cancelRequest' });
				return;
			}
			// Phase 87 — bash-style command history recall. Up/Down step
			// through previously-submitted prompts when the cursor is on the
			// FIRST line of the textarea (or the textarea is empty). Reaching
			// the bottom restores the user's in-progress draft. We
			// preventDefault before consulting the popup-handler so the
			// arrow keys don't escape into native textarea cursor moves.
			if ((e.key === 'ArrowUp' || e.key === 'ArrowDown') && !e.shiftKey && !e.metaKey && !e.ctrlKey && !e.altKey) {
				if (commandHistory.length > 0) {
					if (e.key === 'ArrowUp' && cursorOnFirstLine()) {
						e.preventDefault();
						stepHistoryBackward();
						return;
					}
					if (e.key === 'ArrowDown' && cursorOnLastLine() && historyIndex !== -1) {
						e.preventDefault();
						stepHistoryForward();
						return;
					}
				}
			}
			if (e.key === 'Enter' && !e.shiftKey) {
				e.preventDefault();
				sendMessage();
			}
		});

		messageInput.addEventListener('input', (e) => {
			messageInput.style.height = 'auto';
			// The CSS sets a 64px min-height (3 rows) and 240px max-height
			// to keep the composer inviting when empty without runaway
			// growth on long pastes.
			messageInput.style.height = Math.min(Math.max(messageInput.scrollHeight, 64), 240) + 'px';
			updateSendAffordance();
			updatePopupsFromInput();
			// Phase 87 — once the user starts editing again outside of an
			// active recall, drop the historyIndex so a subsequent Up-arrow
			// re-saves their new draft instead of clobbering it. We only
			// react to user-driven 'input' events; programmatic dispatches
			// (e.g. inside `setComposerValue`) leave `inputType` undefined
			// on the synthetic Event we construct, which we use here as the
			// signal to skip.
			if (historyIndex !== -1 && e && e.inputType) {
				historyIndex = -1;
				historyDraft = '';
			}
		});

		messageInput.addEventListener('click', () => {
			updatePopupsFromInput();
		});

		messageInput.addEventListener('blur', () => {
			// Defer so a popup-item mousedown still wins the focus race; the
			// popup-item handlers `preventDefault`, but the timing matters.
			setTimeout(() => {
				if (document.activeElement && document.activeElement.closest && document.activeElement.closest('.popup')) {
					return;
				}
				closeSlashPopup();
				closeMentionPopup();
			}, 120);
		});

		// Global keyboard shortcuts. Cmd/Ctrl+L focuses the composer; the
		// shifted variant clears the conversation. Cmd/Ctrl+. (Phase 58)
		// flips the Plan/Act toggle when the composer surface has focus —
		// scoped to the webview document so the user gets predictable
		// behaviour regardless of which element has focus inside the chat.
		document.addEventListener('keydown', (e) => {
			const meta = e.metaKey || e.ctrlKey;
			if (!meta) {
				return;
			}
			if (e.key === 'l' || e.key === 'L') {
				e.preventDefault();
				if (e.shiftKey) {
					vscode.postMessage({ type: 'clearConversation' });
				} else {
					messageInput.focus();
				}
				return;
			}
			if (e.key === '.') {
				e.preventDefault();
				const next = currentMode === 'plan' ? 'act' : 'plan';
				setPlanMode(next);
			}
		});

		// --- Image drag-drop on the composer shell ---
		// Capture-phase listeners on the shell give the textarea its native
		// behaviour for text drops while still letting us intercept image
		// files. The `is-drop-target` class drives the accent border styling.
		const composerShell = document.querySelector('.composer-shell');
		if (composerShell) {
			composerShell.addEventListener('dragover', (e) => {
				const types = e.dataTransfer ? Array.from(e.dataTransfer.types || []) : [];
				if (!types.includes('Files')) {
					return;
				}
				e.preventDefault();
				if (e.dataTransfer) {
					e.dataTransfer.dropEffect = 'copy';
				}
				composerShell.classList.add('is-drop-target');
			});
			composerShell.addEventListener('dragleave', (e) => {
				if (e.target === composerShell) {
					composerShell.classList.remove('is-drop-target');
				}
			});
			composerShell.addEventListener('drop', async (e) => {
				const dt = e.dataTransfer;
				if (!dt || !dt.files || dt.files.length === 0) {
					composerShell.classList.remove('is-drop-target');
					return;
				}
				const images = Array.from(dt.files).filter(f => f.type && f.type.startsWith('image/'));
				if (images.length === 0) {
					composerShell.classList.remove('is-drop-target');
					return;
				}
				e.preventDefault();
				composerShell.classList.remove('is-drop-target');
				for (const file of images) {
					try {
						const payload = await readBlobAsBase64(file);
						addImageAttachment({ mime: payload.mime, base64: payload.base64, name: file.name });
					} catch (err) {
						showComposerToast('Could not read image: ' + (err && err.message ? err.message : String(err)));
					}
				}
			});
		}

		// --- Paste image onto the textarea (Cmd/Ctrl+V from clipboard) ---
		messageInput.addEventListener('paste', async (e) => {
			const items = e.clipboardData ? e.clipboardData.items : null;
			if (!items || items.length === 0) {
				return;
			}
			const imageItems = Array.from(items).filter(item => item && typeof item.type === 'string' && item.type.startsWith('image/'));
			if (imageItems.length === 0) {
				return;
			}
			e.preventDefault();
			for (const item of imageItems) {
				const blob = item.getAsFile();
				if (!blob) continue;
				try {
					const payload = await readBlobAsBase64(blob);
					// Pasted images carry no filename; synthesise one based
					// on the MIME so the chip label still reads sensibly.
					const ext = (payload.mime.split('/')[1] || 'png').toLowerCase();
					const name = 'pasted-image.' + ext;
					addImageAttachment({ mime: payload.mime, base64: payload.base64, name });
				} catch (err) {
					showComposerToast('Could not read pasted image.');
				}
			}
		});

		attachBtn.addEventListener('click', (e) => {
			e.stopPropagation();
			toggleMenu(attachMenu, attachBtn);
		});

		modelChip.addEventListener('click', (e) => {
			e.stopPropagation();
			toggleMenu(modelMenu, modelChip);
		});

		// Phase 5 — model description tooltips. Decorate each picker entry
		// with an info icon hooked up to a single shared tooltip card. We
		// build the card lazily so the markup overhead is zero until the
		// user actually hovers something.
		const MODEL_METADATA_RAW = (function () {
			const node = document.getElementById('modelMetadataData');
			if (!node || !node.textContent) return {};
			try { return JSON.parse(node.textContent); } catch (e) { return {}; }
		})();
		let modelTooltipEl = null;
		function ensureModelTooltip() {
			if (modelTooltipEl) return modelTooltipEl;
			modelTooltipEl = document.createElement('div');
			modelTooltipEl.className = 'sota-message-tooltip sota-model-tooltip';
			modelTooltipEl.hidden = true;
			document.body.appendChild(modelTooltipEl);
			return modelTooltipEl;
		}
		function fmtTokens(n) {
			if (typeof n !== 'number') return '?';
			if (n >= 1000000) return (n % 1000000 === 0 ? (n / 1000000) : (n / 1000000).toFixed(1)) + 'M';
			if (n >= 1000) return (n % 1000 === 0 ? (n / 1000) : (n / 1000).toFixed(1)) + 'K';
			return String(n);
		}
		function fmtPricing(info) {
			if (!info) return '';
			if (info.inputCostPer1M === 0 && info.outputCostPer1M === 0) return 'subscription';
			return '$' + info.inputCostPer1M + ' / $' + info.outputCostPer1M + ' per Mtok';
		}
		function showModelTooltip(modelId, anchor) {
			const info = MODEL_METADATA_RAW[modelId];
			if (!info) return;
			const tip = ensureModelTooltip();
			const caps = Array.isArray(info.capabilities) ? info.capabilities.join(' / ') : '';
			tip.innerHTML = ''
				+ '<div class="tt-row"><b>Context</b><span>' + fmtTokens(info.contextWindow) + ' tokens</span></div>'
				+ '<div class="tt-row"><b>Max output</b><span>' + fmtTokens(info.maxOutputTokens) + ' tokens</span></div>'
				+ '<div class="tt-row"><b>Capabilities</b><span>' + escapeHtml(caps) + '</span></div>'
				+ '<div class="tt-row"><b>Pricing</b><span>' + escapeHtml(fmtPricing(info)) + '</span></div>'
				+ '<div class="tt-row tt-blurb">' + escapeHtml(info.blurb || '') + '</div>';
			tip.hidden = false;
			const rect = anchor.getBoundingClientRect();
			// Position to the right of the icon; flip left if it'd overflow
			// the viewport. A 6px gap keeps it visually distinct from the row.
			const tipRect = tip.getBoundingClientRect();
			let left = rect.right + 6;
			if (left + tipRect.width > window.innerWidth - 4) {
				left = Math.max(4, rect.left - tipRect.width - 6);
			}
			tip.style.left = left + 'px';
			tip.style.top = Math.max(4, rect.top - 4) + 'px';
		}
		function hideModelTooltip() {
			if (modelTooltipEl) modelTooltipEl.hidden = true;
		}
		// Inject an info icon into each picker row. Idempotent — if the row
		// already has one we leave it alone.
		modelMenu.querySelectorAll('.popover-item').forEach((item) => {
			if (item.querySelector('.popover-item-info')) return;
			const modelId = item.getAttribute('data-model');
			if (!modelId || !MODEL_METADATA_RAW[modelId]) return;
			const icon = document.createElement('span');
			icon.className = 'popover-item-info';
			icon.setAttribute('aria-label', 'Model details');
			icon.setAttribute('role', 'button');
			icon.tabIndex = 0;
			icon.textContent = 'i';
			icon.addEventListener('mouseenter', () => showModelTooltip(modelId, icon));
			icon.addEventListener('mouseleave', hideModelTooltip);
			icon.addEventListener('focus', () => showModelTooltip(modelId, icon));
			icon.addEventListener('blur', hideModelTooltip);
			icon.addEventListener('click', (ev) => {
				// Don't let the icon click bubble into the row's model-select
				// handler; this is metadata only.
				ev.stopPropagation();
			});
			item.appendChild(icon);
		});

		modelMenu.addEventListener('click', (e) => {
			const target = e.target.closest('.popover-item');
			if (!target) return;
			currentModel = target.dataset.model;
			updateModelLabel();
			updateModelMenuChecks();
			closeMenus();
		});

		// Phase 4 — reasoning effort + thinking budget chip menus.
		const reasoningEffortChip = document.getElementById('reasoningEffortChip');
		const reasoningEffortMenu = document.getElementById('reasoningEffortMenu');
		const reasoningEffortLabel = document.getElementById('reasoningEffortLabel');
		const thinkingBudgetChip = document.getElementById('thinkingBudgetChip');
		const thinkingBudgetMenu = document.getElementById('thinkingBudgetMenu');
		const thinkingBudgetLabel = document.getElementById('thinkingBudgetLabel');

		function updateReasoningEffortChecks(effort) {
			if (!reasoningEffortMenu) return;
			reasoningEffortMenu.querySelectorAll('.popover-item').forEach((item) => {
				const check = item.querySelector('.item-check');
				if (!check) return;
				check.textContent = item.dataset.effort === effort ? '✓' : '';
			});
		}
		function updateThinkingBudgetChecks(budget) {
			if (!thinkingBudgetMenu) return;
			thinkingBudgetMenu.querySelectorAll('.popover-item').forEach((item) => {
				const check = item.querySelector('.item-check');
				if (!check) return;
				check.textContent = String(item.dataset.budget) === String(budget) ? '✓' : '';
			});
		}

		if (reasoningEffortChip && reasoningEffortMenu) {
			reasoningEffortChip.addEventListener('click', (e) => {
				e.stopPropagation();
				toggleMenu(reasoningEffortMenu, reasoningEffortChip);
			});
			reasoningEffortMenu.addEventListener('click', (e) => {
				const target = e.target.closest('.popover-item');
				if (!target) return;
				const effort = target.dataset.effort || 'medium';
				if (reasoningEffortLabel) reasoningEffortLabel.textContent = effort;
				updateReasoningEffortChecks(effort);
				vscode.postMessage({ type: 'settingChange', settingId: 'sota.reasoningEffort', value: effort });
				closeMenus();
			});
		}
		if (thinkingBudgetChip && thinkingBudgetMenu) {
			thinkingBudgetChip.addEventListener('click', (e) => {
				e.stopPropagation();
				toggleMenu(thinkingBudgetMenu, thinkingBudgetChip);
			});
			thinkingBudgetMenu.addEventListener('click', (e) => {
				const target = e.target.closest('.popover-item');
				if (!target) return;
				const budget = Number(target.dataset.budget || '0');
				if (thinkingBudgetLabel) thinkingBudgetLabel.textContent = budget === 0 ? 'off' : (budget >= 1000 ? (budget / 1000) + 'K' : String(budget));
				updateThinkingBudgetChecks(budget);
				vscode.postMessage({ type: 'settingChange', settingId: 'sota.thinkingBudgetTokens', value: budget });
				closeMenus();
			});
		}

		// When the host pushes settingsState, hydrate the chip labels too so a
		// re-mount or second window shows the persisted value.
		window.addEventListener('message', (ev) => {
			const msg = ev && ev.data;
			if (!msg || msg.type !== 'settingsState' || !msg.settings) return;
			const effort = msg.settings['sota.reasoningEffort'];
			if (typeof effort === 'string' && reasoningEffortLabel) {
				reasoningEffortLabel.textContent = effort;
				updateReasoningEffortChecks(effort);
			}
			const budget = msg.settings['sota.thinkingBudgetTokens'];
			if (typeof budget === 'number' && thinkingBudgetLabel) {
				thinkingBudgetLabel.textContent = budget === 0 ? 'off' : (budget >= 1000 ? (budget / 1000) + 'K' : String(budget));
				updateThinkingBudgetChecks(budget);
			}
		});

		agentChip.addEventListener('click', (e) => {
			e.stopPropagation();
			toggleMenu(agentMenu, agentChip);
		});

		agentMenu.addEventListener('click', (e) => {
			const target = e.target.closest('.popover-item');
			if (!target) return;
			currentAgent = target.dataset.agent || 'anton';
			updateAgentLabel();
			updateAgentMenuChecks();
			updateHeaderSubtitle();
			closeMenus();
		});

		// Plan/Act two-button pill (Phase 58). Each button is its own click
		// target — no popover, no dropdown — so a single click flips the mode
		// and posts the change to the host. We tolerate `currentMode` already
		// matching the clicked button (idempotent) so users can re-click the
		// active state without the host receiving spurious updates.
		function setPlanMode(next) {
			const normalised = next === 'plan' ? 'plan' : 'act';
			if (normalised === currentMode) return;
			currentMode = normalised;
			updateModeUi();
			vscode.postMessage({ type: 'modeChange', chatMode: currentMode });
		}

		planActButtons.forEach((btn) => {
			btn.addEventListener('click', (e) => {
				e.stopPropagation();
				setPlanMode(btn.dataset.mode);
			});
			// Arrow keys swap focus + selection between Plan/Act so screen
			// readers and keyboard users get the conventional radiogroup
			// behaviour. Space/Enter on a button already triggers `click`,
			// which routes through `setPlanMode` above.
			btn.addEventListener('keydown', (e) => {
				if (e.key === 'ArrowLeft' || e.key === 'ArrowRight' || e.key === 'ArrowUp' || e.key === 'ArrowDown') {
					e.preventDefault();
					const next = currentMode === 'plan' ? 'act' : 'plan';
					setPlanMode(next);
					const target = next === 'plan' ? document.getElementById('planActBtnPlan') : document.getElementById('planActBtnAct');
					if (target) target.focus();
				}
			});
		});

		attachMenu.addEventListener('click', (e) => {
			const target = e.target.closest('.popover-item');
			if (!target) return;
			const id = target.dataset.attach;
			if (id === 'image') {
				// Delegate to the host so the OS file picker handles format
				// filtering and disk I/O. The host posts back `imagePicked`
				// once a file is chosen and read.
				vscode.postMessage({ type: 'pickImage' });
			} else if (id && !attachments.includes(id)) {
				attachments.push(id);
				renderContextChips();
			}
			closeMenus();
		});

		document.addEventListener('click', (e) => {
			if (e.target.closest('.popover') || e.target.closest('#modelChip') || e.target.closest('#attachBtn') || e.target.closest('#agentChip') || e.target.closest('#reasoningEffortChip') || e.target.closest('#thinkingBudgetChip')) return;
			closeMenus();
			// Slash/mention popups also close on outside click — clicks on the
			// popup itself or the textarea preserve open state.
			if (!e.target.closest('.popup') && !e.target.closest('#messageInput')) {
				closeSlashPopup();
				closeMentionPopup();
			}
		});

		document.addEventListener('keydown', (e) => {
			if (e.key === 'Escape') closeMenus();
		});

		document.querySelectorAll('.prompt-card').forEach((card) => {
			card.addEventListener('click', () => {
				messageInput.value = card.dataset.prompt || card.textContent;
				messageInput.focus();
				messageInput.dispatchEvent(new Event('input'));
			});
		});

		// --- Extension → webview message handling ---

		window.addEventListener('message', (event) => {
			const message = event.data;
			switch (message.type) {
				case 'streamToken':
					// Inline tool-result review: the arrival of an assistant
					// token AFTER any active tool cards means the model is
					// now writing its post-tool response — i.e. it has
					// already read the tool results and editing is too late.
					// Walk the message list and mark all active cards
					// inactive so the Edit button is hidden.
					if (messageList) {
						const activeCards = messageList.querySelectorAll('.tool-card[data-active="true"]');
						if (activeCards.length > 0) {
							activeCards.forEach(c => { c.dataset.active = 'false'; });
						}
					}
					appendStreamingText(message.token);
					break;
				case 'toolCall':
					renderToolCall(message);
					break;
				case 'approvalRequest':
					renderApprovalRequest(message);
					break;
				case 'approvalResolved':
					updateApprovalCard(message.id, message.action, message.reason);
					break;
				case 'agentPlan':
					// A new plan starts a fresh dispatch sequence — reset the
					// last-assignee tracker so the first `subtaskStart` after
					// this fires a banner from the orchestrator. Also wipe the
					// per-turn handoff de-dup set so previously-seen pairs can
					// fire again on this new plan.
					lastSubtaskAssignee = null;
					renderedHandoffPairs.clear();
					renderAgentPlan(message.plan);
					break;
				case 'subtaskStart': {
					// Phase 69 — render an inline handoff banner whenever the
					// dispatched assignee differs from the last one (or on the
					// orchestrator → first specialist transition). The banner
					// is appended inside the in-flight assistant body so it
					// sits ABOVE the new `.subtask-tree-row` in the same
					// message column. De-duplicated per (from, to) per turn —
					// see `renderHandoffBanner`. Not persisted.
					const assignee = message.assignee;
					if (assignee && assignee !== lastSubtaskAssignee) {
						const fromSpecialist = lastSubtaskAssignee || 'anton';
						// Ensure we have an assistant body to anchor the banner
						// against; renderSubtask will lazily start one too, but
						// the banner must sit above the tree row it relates to.
						if (!currentAssistantDiv) {
							startStreamingMessage(getCurrentAgentDisplayName());
						}
						if (currentAssistantDiv && fromSpecialist !== assignee) {
							renderHandoffBanner(currentAssistantDiv, fromSpecialist, assignee);
							scrollToBottom();
						}
					}
					lastSubtaskAssignee = assignee || lastSubtaskAssignee;
					renderSubtask(message, 'running');
					updatePlanChecklistForSubtask(
						message.subtaskId,
						message.assignee,
						message.instruction,
						'in-progress'
					);
					break;
				}
				case 'subtaskToken':
					appendSubtaskToken(message.subtaskId, message.token);
					break;
				case 'subtaskComplete':
					renderSubtask(message, 'ok');
					updatePlanChecklistForSubtask(
						message.subtaskId,
						message.assignee,
						message.instruction,
						'done'
					);
					break;
				case 'subtaskFail':
					renderSubtask(message, 'error');
					updatePlanChecklistForSubtask(
						message.subtaskId,
						message.assignee,
						message.instruction,
						'failed'
					);
					break;
				case 'uiBlock':
					// Generative-UI block emitted by the LLM via the
					// `emit_ui_block` builtin tool. Look up the renderer in
					// the registry and mount the resulting DOM into the
					// active assistant body (or, if `subtaskId` is set, the
					// matching subtask card body) so the block sits inline
					// with the assistant's prose.
					mountUiBlock(message);
					break;
				case 'messageComplete':
					finalizeStreamingText();
					clearStreamingIndicator();
					attachAssistantActions();
					setStreamingState(false);
					currentAssistantDiv = null;
					currentAssistantTextSpan = null;
					tokenCount.textContent = (message.totalTokens || 0) + ' tokens';
					costEstimate.textContent = '$' + (message.estimatedCost || '0.00');
					hideActiveTaskHeader();
					break;
				case 'messageMetrics': {
					// Phase 68 — stamp per-message data-* attrs on the matching
					// assistant wrapper so the hover popover handler can read
					// them. Metrics arrive immediately after `messageComplete`
					// for the final tool-loop turn (direct path) or the assembled
					// agent run (agent-bridge path). Live-only by design —
					// reloaded messages keep no metrics so the popover renders
					// "—" placeholders for those fields.
					const idx = message.conversationIndex;
					const wrapper = messageList.querySelector(
						'.msg-assistant[data-conversation-index="' + idx + '"]'
					);
					if (wrapper) {
						wrapper.dataset.model = String(message.model || '');
						wrapper.dataset.latencyMs = String(message.latencyMs || 0);
						wrapper.dataset.inputTokens = String(message.inputTokens || 0);
						wrapper.dataset.outputTokens = String(message.outputTokens || 0);
						wrapper.dataset.cachedTokens = String(message.cachedTokens || 0);
						if (typeof message.cost === 'number' && Number.isFinite(message.cost)) {
							wrapper.dataset.cost = String(message.cost);
						}
					}
					break;
				}
				case 'streamError':
					if (currentAssistantTextSpan) {
						currentAssistantTextSpan.textContent += '\n\nError: ' + message.error;
					} else if (currentAssistantDiv) {
						const errSpan = document.createElement('div');
						errSpan.textContent = 'Error: ' + message.error;
						currentAssistantDiv.appendChild(errSpan);
					}
					attachAssistantActions();
					clearStreamingIndicator();
					setStreamingState(false);
					currentAssistantDiv = null;
					currentAssistantTextSpan = null;
					hideActiveTaskHeader();
					break;
				case 'loadConversation':
					messageList.querySelectorAll('.msg').forEach(n => n.remove());
					messageList.querySelectorAll('.checkpoint-stripe').forEach(n => n.remove());
					messageList.querySelectorAll('.handoff-banner').forEach(n => n.remove());
					hideActiveTaskHeader();
					hideTranscriptTaskHeader();
					hideHoverPopover();
					lastSenderRole = null;
					lastAssistantSpecialist = null;
					lastSubtaskAssignee = null;
					renderedHandoffPairs.clear();
					lastUserPrompt = '';
					nextConversationIndex = 0;
					checkpointsByTurnIndex.clear();
					if (message.lastMode === 'plan' || message.lastMode === 'act') {
						currentMode = message.lastMode;
						updateModeUi();
					}
					if (message.messages) {
						// Persisted messages don't carry a per-message specialist
						// (yet — Phase 47 records it at the conversation summary
						// level). Use the conversation's `lastSpecialist` as the
						// best available approximation so reloaded assistant
						// bubbles still pick up persona avatars and accent
						// stripes instead of a sea of muted "?" fallbacks.
						const reloadSpecialist = message.lastSpecialist || 'anton';
						for (const msg of message.messages) {
							const opts = { timestamp: msg.timestamp };
							if (msg.role === 'assistant') {
								opts.specialistId = msg.specialistId || reloadSpecialist;
							}
							addMessage(msg.role, msg.content, opts);
						}
					}
					updateEmptyState();
					break;
				case 'conversationCleared':
					messageList.querySelectorAll('.msg').forEach(n => n.remove());
					messageList.querySelectorAll('.checkpoint-stripe').forEach(n => n.remove());
					messageList.querySelectorAll('.handoff-banner').forEach(n => n.remove());
					hideActiveTaskHeader();
					hideTranscriptTaskHeader();
					hideHoverPopover();
					lastSenderRole = null;
					lastAssistantSpecialist = null;
					lastSubtaskAssignee = null;
					renderedHandoffPairs.clear();
					lastUserPrompt = '';
					lastSentUserText = '';
					mentions = [];
					attachments = [];
					imageAttachments = [];
					nextConversationIndex = 0;
					checkpointsByTurnIndex.clear();
					renderContextChips();
					closeSlashPopup();
					closeMentionPopup();
					updateEmptyState();
					break;
				case 'checkpointCaptured':
					if (typeof message.turnIndex === 'number') {
						const entry = {
							checkpointId: message.checkpointId,
							turnIndex: message.turnIndex,
							capturedAt: message.capturedAt,
							summary: message.summary,
							userMessage: message.userMessage,
						};
						const existing = checkpointsByTurnIndex.get(entry.turnIndex);
						if (Array.isArray(existing)) {
							// Skip duplicates (host may re-emit on reconnect).
							if (!existing.some(e => e.checkpointId === entry.checkpointId)) {
								existing.push(entry);
							}
						} else {
							checkpointsByTurnIndex.set(entry.turnIndex, [entry]);
						}
						const wrapper = messageList.querySelector(
							'.msg-user[data-conversation-index="' + entry.turnIndex + '"]'
						);
						if (wrapper) {
							insertCheckpointStripe(wrapper, entry);
						}
					}
					break;
				case 'checkpointsLoaded':
					if (Array.isArray(message.checkpoints)) {
						for (const cp of message.checkpoints) {
							if (!cp || typeof cp.turnIndex !== 'number') continue;
							const entry = {
								checkpointId: cp.checkpointId,
								turnIndex: cp.turnIndex,
								capturedAt: cp.capturedAt,
								summary: cp.summary,
								userMessage: cp.userMessage,
							};
							const existing = checkpointsByTurnIndex.get(entry.turnIndex);
							if (Array.isArray(existing)) {
								if (!existing.some(e => e.checkpointId === entry.checkpointId)) {
									existing.push(entry);
								}
							} else {
								checkpointsByTurnIndex.set(entry.turnIndex, [entry]);
							}
							const wrapper = messageList.querySelector(
								'.msg-user[data-conversation-index="' + entry.turnIndex + '"]'
							);
							if (wrapper) {
								insertCheckpointStripe(wrapper, entry);
							}
						}
					}
					break;
				case 'imagePicked':
					addImageAttachment({ mime: message.mime, base64: message.base64, name: message.name });
					break;
				case 'connectionState':
					updateConnectionUi(message.status);
					updateAuthGate(message.status);
					break;
				case 'providerSaveResult':
					applyProviderSaveResult(message);
					break;
				case 'providerTestResult':
					applyProviderTestResult(message);
					break;
				case 'providerProfiles':
					applyProviderProfiles(message);
					break;
				case 'settingsState':
					applySettingsState(message.settings);
					break;
				case 'mcpServersState':
					applyMcpServersState(Array.isArray(message.servers) ? message.servers : []);
					break;
				case 'mcpServerSaveResult':
					applyMcpServerSaveResult(message);
					break;
				case 'systemMessage':
					addMessage('system', message.content || '');
					break;
				case 'specialistChange':
					if (message.specialistId) {
						currentAgent = message.specialistId;
						updateAgentLabel();
						updateAgentMenuChecks();
						updateHeaderSubtitle();
						// Phase 80 — re-evaluate the composer placeholder so it
						// reflects the newly pinned specialist's voice. Mode
						// hasn't changed, but the persona has.
						updateComposerPlaceholder();
					}
					break;
				case 'modelChange':
					if (message.model) {
						currentModel = message.model;
						updateModelLabel();
						updateModelMenuChecks();
					}
					break;
				case 'modeChanged':
					if (message.chatMode === 'plan' || message.chatMode === 'act') {
						currentMode = message.chatMode;
						updateModeUi();
					}
					break;
				case 'tabChanged':
					if (typeof message.tab === 'string' && VALID_TABS.indexOf(message.tab) >= 0) {
						applyActiveTab(message.tab);
					}
					break;
				case 'prefillComposer':
					// Phase 62 — host echoes a "Re-run from here" prompt back
					// here so the composer becomes the source of truth. Non-
					// destructive: we just seed the textarea and focus, the
					// user submits when ready.
					if (messageInput && typeof message.text === 'string') {
						messageInput.value = message.text;
						messageInput.style.height = 'auto';
						messageInput.style.height = Math.min(messageInput.scrollHeight, 200) + 'px';
						try { messageInput.focus(); } catch (e) { /* noop */ }
						// Move caret to end so the user can extend or edit
						// without first clearing a selection.
						try {
							const len = messageInput.value.length;
							messageInput.setSelectionRange(len, len);
						} catch (e) { /* noop */ }
					}
					break;
				case 'securityPulseStart':
					setSecurityPulse(true);
					break;
				case 'securityPulseStop':
					setSecurityPulse(false);
					break;
				case 'tasksSnapshot':
					renderTasksPane(message);
					break;
				case 'historySnapshot':
					renderHistoryPane(message);
					break;
				case 'workspaceIndexUpdate':
					if (Array.isArray(message.entries)) {
						WORKSPACE_INDEX = message.entries;
						window.__SOTA_WORKSPACE_INDEX = WORKSPACE_INDEX;
						// If the popup is open, refresh its contents in place so
						// the user sees newly-created files without retyping.
						if (mentionPopupState.open) {
							const filtered = filterMentionCandidates(mentionPopupState.query);
							mentionPopupState.items = filtered;
							mentionPopupState.activeIndex = filtered.length > 0 ? 0 : -1;
							renderMentionPopup();
						}
					}
					break;
				case 'costUpdate':
					applyCostUpdate(message);
					break;
				case 'costReset':
					applyCostReset();
					break;
				case 'requestStarted':
					setCostPulseActive(true);
					showActiveTaskHeader({
						specialistId: message.specialistId || currentAgent,
						userMessage: typeof message.userMessage === 'string' ? message.userMessage : lastUserPrompt,
						kind: 'streaming',
					});
					break;
				case 'requestEnded':
					setCostPulseActive(false);
					hideActiveTaskHeader();
					// Phase 80 — belt-and-braces: clear the security pulse if a
					// run ends mid-subtask (cancel, abort, error before
					// `subtask-completed`/`-failed` lands). Idempotent.
					setSecurityPulse(false);
					break;
			}
		});

		/**
		 * Append a chunk of streamed assistant text. The text lands inside a
		 * dedicated text span so tool-call cards (which are inserted as
		 * sibling nodes) don't get clobbered when we later run markdown
		 * rendering on the accumulated text.
		 */
		function appendStreamingText(token) {
			if (!currentAssistantDiv) return;
			if (!currentAssistantTextSpan || currentAssistantTextSpan.parentNode !== currentAssistantDiv) {
				currentAssistantTextSpan = document.createElement('span');
				currentAssistantTextSpan.className = 'msg-text-stream';
				currentAssistantDiv.appendChild(currentAssistantTextSpan);
			}
			currentAssistantTextSpan.textContent += token;
			messageList.scrollTop = messageList.scrollHeight;
		}

		/**
		 * On stream completion, render the accumulated raw text as markdown
		 * but leave any sibling tool-call cards alone. We replace just the
		 * streaming text span's content rather than the whole message body.
		 */
		function finalizeStreamingText() {
			if (!currentAssistantTextSpan) return;
			const raw = currentAssistantTextSpan.textContent || '';
			if (raw.length === 0) {
				currentAssistantTextSpan.remove();
				return;
			}
			// Replace the live span with a static rendered fragment so future
			// streamTokens (in a follow-up turn) start a fresh span and don't
			// re-render the already-finalised prose.
			const wrapper = document.createElement('span');
			wrapper.className = 'msg-text-rendered';
			wrapper.innerHTML = renderMarkdown(raw);
			if (typeof window.__sotaHydrateUiBlocks === 'function') {
				window.__sotaHydrateUiBlocks(wrapper);
			}
			currentAssistantTextSpan.replaceWith(wrapper);
			currentAssistantTextSpan = null;
		}

		/**
		 * Attach the inline action toolbar to the active assistant body
		 * once streaming completes. Called from `messageComplete` and
		 * `streamError` so the finalised message is consistently
		 * decorated regardless of the terminal event.
		 */
		function attachAssistantActions() {
			if (!currentAssistantDiv) return;
			if (currentAssistantDiv.querySelector('.msg-actions')) return;
			// The "source" we hand to the copy action is the rendered text
			// content — sufficient for clipboard use without needing to
			// reassemble the markdown source.
			const source = currentAssistantDiv.textContent || '';
			currentAssistantDiv.appendChild(buildAssistantActions(source, true));
			refreshRegenerateAffordance();
		}

		// --- Phase 68: per-message hover details popover ---
		// A 400ms hover on a chat bubble reveals a small floating card with
		// per-message metadata. Assistant bubbles show model, time, latency,
		// tokens and estimated cost (where available); user bubbles show
		// "Sent" + character count. Reloaded sessions don't carry latency or
		// token data, so missing fields render as an em-dash placeholder.
		const TOOLTIP_DELAY_MS = 400;
		let hoverPopoverTimeout = null;
		let hoverPopover = null;
		let hoverPopoverAnchor = null;

		function hideHoverPopover() {
			if (hoverPopover) {
				hoverPopover.remove();
				hoverPopover = null;
			}
			hoverPopoverAnchor = null;
			if (hoverPopoverTimeout) {
				clearTimeout(hoverPopoverTimeout);
				hoverPopoverTimeout = null;
			}
		}

		/**
		 * Format a millisecond timestamp as a short-form relative string for
		 * the hover popover. Falls back to a wall-clock HH:MM rendering once
		 * the message is more than an hour old so the user can locate it on
		 * their day's timeline.
		 */
		function formatHoverTimestamp(timestampMs) {
			if (!timestampMs || !Number.isFinite(timestampMs)) return '—';
			const deltaSeconds = Math.max(0, Math.floor((Date.now() - timestampMs) / 1000));
			if (deltaSeconds < 5) return 'just now';
			if (deltaSeconds < 60) return deltaSeconds + 's ago';
			const minutes = Math.floor(deltaSeconds / 60);
			if (minutes < 60) return minutes + 'm ago';
			try {
				const date = new Date(timestampMs);
				return date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
			} catch (e) {
				return '—';
			}
		}

		function buildHoverRow(label, value) {
			const row = document.createElement('div');
			row.className = 'tt-row';
			const labelEl = document.createElement('b');
			labelEl.textContent = label;
			row.appendChild(labelEl);
			row.appendChild(document.createTextNode(' '));
			const valueEl = document.createElement('span');
			valueEl.textContent = value;
			row.appendChild(valueEl);
			return row;
		}

		function buildAssistantHoverRows(msg) {
			const dataset = msg.dataset || {};
			const model = dataset.model && dataset.model.length > 0 ? dataset.model : '—';
			const ts = parseInt(dataset.timestamp || '', 10);
			const time = Number.isFinite(ts) ? formatHoverTimestamp(ts) : '—';
			// Latency / tokens / cost are runtime-only — reloaded messages
			// have no `data-latency-ms` so we explicitly check presence
			// rather than treating missing as zero.
			const latency = Object.prototype.hasOwnProperty.call(dataset, 'latencyMs')
				? (parseInt(dataset.latencyMs, 10) || 0) + 'ms'
				: '—';
			const inputTokens = Object.prototype.hasOwnProperty.call(dataset, 'inputTokens')
				? (parseInt(dataset.inputTokens, 10) || 0).toLocaleString()
				: '—';
			const outputTokens = Object.prototype.hasOwnProperty.call(dataset, 'outputTokens')
				? (parseInt(dataset.outputTokens, 10) || 0).toLocaleString()
				: '—';
			const tokens = inputTokens + '↑ ' + outputTokens + '↓';
			let cost = '—';
			if (Object.prototype.hasOwnProperty.call(dataset, 'cost')) {
				const parsed = parseFloat(dataset.cost);
				if (Number.isFinite(parsed) && parsed > 0) {
					cost = '$' + parsed.toFixed(4);
				}
			}
			return [
				buildHoverRow('Model', model),
				buildHoverRow('Time', time),
				buildHoverRow('Latency', latency),
				buildHoverRow('Tokens', tokens),
				buildHoverRow('Cost', cost),
			];
		}

		function buildUserHoverRows(msg) {
			const dataset = msg.dataset || {};
			const ts = parseInt(dataset.timestamp || '', 10);
			const sent = Number.isFinite(ts) ? formatHoverTimestamp(ts) : '—';
			const length = parseInt(dataset.contentLength || '', 10);
			const lengthStr = Number.isFinite(length) ? length.toLocaleString() + ' chars' : '—';
			return [
				buildHoverRow('Sent', sent),
				buildHoverRow('Length', lengthStr),
			];
		}

		function showHoverPopover(msg) {
			hideHoverPopover();
			hoverPopover = document.createElement('div');
			hoverPopover.className = 'sota-message-tooltip';
			hoverPopoverAnchor = msg;

			const rows = msg.classList.contains('msg-assistant')
				? buildAssistantHoverRows(msg)
				: buildUserHoverRows(msg);
			rows.forEach(r => hoverPopover.appendChild(r));

			document.body.appendChild(hoverPopover);

			// Anchor along the top-right of the message; flip below or to the
			// left if there isn't room. `pointer-events: none` on the
			// element keeps the underlying mouseleave from firing when the
			// pointer drifts onto the tooltip itself.
			const rect = msg.getBoundingClientRect();
			const tipRect = hoverPopover.getBoundingClientRect();
			let top = rect.top - tipRect.height - 8;
			if (top < 4) top = rect.bottom + 8;
			let left = rect.right - tipRect.width - 8;
			if (left < 4) left = 4;
			if (left + tipRect.width > window.innerWidth - 4) {
				left = window.innerWidth - tipRect.width - 4;
			}
			hoverPopover.style.top = top + 'px';
			hoverPopover.style.left = left + 'px';
		}

		messageList.addEventListener('mouseenter', e => {
			const target = e.target;
			if (!(target instanceof Element)) return;
			const msg = target.closest('.msg-user, .msg-assistant');
			if (!msg) return;
			if (hoverPopoverAnchor === msg) return;
			if (hoverPopoverTimeout) {
				clearTimeout(hoverPopoverTimeout);
			}
			hoverPopoverTimeout = setTimeout(() => showHoverPopover(msg), TOOLTIP_DELAY_MS);
		}, true);

		messageList.addEventListener('mouseleave', e => {
			const target = e.target;
			if (!(target instanceof Element)) return;
			const msg = target.closest('.msg-user, .msg-assistant');
			if (!msg) return;
			hideHoverPopover();
		}, true);

		/**
		 * Truncate a JSON args blob to ~120 chars with an ellipsis so the card
		 * header stays compact even when the model passes long input.
		 */
		function truncateArgs(input) {
			let json;
			try {
				json = JSON.stringify(input ?? {});
			} catch (e) {
				json = '{}';
			}
			if (json.length > 120) {
				return json.slice(0, 119) + '\u2026';
			}
			return json;
		}

		/**
		 * Render or update a tool-call card inside the active assistant
		 * message body. Status 'running' inserts a fresh card; 'ok'/'error'
		 * either updates the existing card by id, or — defensively, in case
		 * the running marker was missed (e.g. session reload mid-run) —
		 * inserts a new card carrying the final state.
		 */
		function renderToolCall(message) {
			if (!currentAssistantDiv) {
				// No active assistant message — nothing to attach to. This is
				// rare (would mean the host posted a toolCall before any
				// streamToken) but be defensive and start a fresh assistant
				// bubble so the user still sees the activity.
				startStreamingMessage(getCurrentAgentDisplayName());
				if (!currentAssistantDiv) return;
			}
			// Finalise any in-flight streaming text so the card sits AFTER the
			// prose that triggered it, not inside it.
			finalizeStreamingText();

			const id = message.id || '';
			let card = id ? currentAssistantDiv.querySelector('[data-tool-id="' + cssEscape(id) + '"]') : null;
			if (!card) {
				card = document.createElement('div');
				card.className = 'tool-card';
				card.dataset.toolId = id;
				// Inline tool-result review: a freshly-rendered card is
				// "active" — the LLM has not yet read its result on the next
				// turn — so the Edit button is available. We flip this to
				// 'false' on the next streamToken (assistant prose AFTER the
				// tool means the model has read the result).
				card.dataset.active = 'true';
				const header = document.createElement('div');
				header.className = 'tool-card-header';
				const icon = document.createElement('span');
				icon.className = 'tool-card-icon';
				const name = document.createElement('span');
				name.className = 'tool-card-name';
				const args = document.createElement('span');
				args.className = 'tool-card-args';
				const statusPill = document.createElement('span');
				statusPill.className = 'tool-card-status';
				header.appendChild(icon);
				header.appendChild(name);
				header.appendChild(args);
				header.appendChild(statusPill);
				card.appendChild(header);
				const details = document.createElement('details');
				details.className = 'tool-card-output';
				details.hidden = true;
				const summary = document.createElement('summary');
				summary.textContent = 'View output';
				const pre = document.createElement('pre');
				details.appendChild(summary);
				details.appendChild(pre);
				card.appendChild(details);
				currentAssistantDiv.appendChild(card);
			}

			const meta = message.metadata && typeof message.metadata === 'object' ? message.metadata : null;
			const isShell = meta && meta.kind === 'shell';

			// Resolve the effective status. For shell metadata the pill maps
			// to the exit code (0 + not cancelled = ok; otherwise error /
			// cancelled). Non-shell tools fall back to the host-reported
			// status verbatim.
			let effectiveStatus = message.status || 'running';
			let effectiveStatusLabel = effectiveStatus === 'ok' ? 'Ok'
				: effectiveStatus === 'error' ? 'Error'
				: 'Running';
			if (isShell && effectiveStatus !== 'running') {
				if (meta.cancelled === true) {
					effectiveStatus = 'error';
					effectiveStatusLabel = 'Cancelled';
				} else if (typeof meta.exitCode === 'number' && meta.exitCode !== 0) {
					effectiveStatus = 'error';
					effectiveStatusLabel = 'Error';
				} else {
					effectiveStatus = 'ok';
					effectiveStatusLabel = 'Ok';
				}
			}
			card.dataset.toolStatus = effectiveStatus;

			const iconEl = card.querySelector('.tool-card-icon');
			const nameEl = card.querySelector('.tool-card-name');
			const argsEl = card.querySelector('.tool-card-args');
			const statusEl = card.querySelector('.tool-card-status');

			if (iconEl) {
				iconEl.textContent = effectiveStatus === 'ok' ? '\u2713'
					: effectiveStatus === 'error' ? '\u2717'
					: '\u2026';
			}
			if (nameEl) {
				nameEl.textContent = message.name || 'tool';
			}
			if (argsEl) {
				// Args truncation: keep it tight (~80 chars) and surface the
				// full value as a tooltip when it overflows so power users
				// can still inspect what the model passed.
				const fullJson = (function () {
					try {
						return JSON.stringify(message.input ?? {});
					} catch (e) {
						return '{}';
					}
				})();
				if (fullJson.length > 80) {
					argsEl.textContent = fullJson.slice(0, 79) + '\u2026';
					argsEl.title = fullJson;
				} else {
					argsEl.textContent = fullJson;
					argsEl.removeAttribute('title');
				}
			}
			if (statusEl) {
				statusEl.textContent = effectiveStatusLabel;
			}

			// Body rendering. Shell metadata replaces the generic
			// details/pre with a terminal-style block. The previous body
			// element is removed so we don't end up with both surfaces
			// stacked when a card flips from running -> ok with metadata.
			const existingDetails = card.querySelector('.tool-card-output');
			const existingTerminal = card.querySelector('.terminal-block');

			if (effectiveStatus === 'running') {
				if (existingTerminal) existingTerminal.remove();
				if (existingDetails) {
					existingDetails.hidden = true;
					const preEl = existingDetails.querySelector('pre');
					if (preEl) preEl.textContent = '';
				}
			} else if (isShell) {
				if (existingDetails) existingDetails.remove();
				const tmp = document.createElement('div');
				tmp.innerHTML = renderTerminalBlock(meta);
				const newBlock = tmp.firstElementChild;
				if (existingTerminal && newBlock) {
					existingTerminal.replaceWith(newBlock);
				} else if (newBlock) {
					card.appendChild(newBlock);
				}
			} else {
				if (existingTerminal) existingTerminal.remove();
				if (existingDetails) {
					existingDetails.hidden = false;
					const preEl = existingDetails.querySelector('pre');
					if (preEl) {
						preEl.textContent = typeof message.output === 'string' ? message.output : '';
					}
				}
			}

			// Inline tool-result review: surface an "Edit result" button on
			// terminal-state cards so the user can replace the output before
			// the next LLM turn reads it. The button is hidden by CSS once
			// the card is marked inactive (next streamToken arrives), so we
			// can append it unconditionally on every status flip without
			// worrying about it sticking around past its window. We dedupe
			// against an existing button to avoid stacking on re-renders.
			if (effectiveStatus !== 'running' && !card.querySelector('.tool-card-edit')) {
				const editBtn = document.createElement('button');
				editBtn.className = 'tool-card-edit';
				editBtn.type = 'button';
				editBtn.textContent = 'Edit result';
				editBtn.dataset.toolCallId = id;
				const outputForEdit = typeof message.output === 'string' ? message.output : '';
				editBtn.addEventListener('click', () => openToolEditForm(id, outputForEdit, card));
				card.appendChild(editBtn);
			}

			// Phase 63 — surface a "View diff" button on successful write-shaped
			// tool cards (today: write_file). Clicking it round-trips to the
			// host, which opens VS Code's native side-by-side diff editor with
			// the captured pre-image on the left and the on-disk file on the
			// right. The button only renders when the host actually attached a
			// snapshot id — no id means the snapshot has been evicted (or this
			// is a non-write tool) and the button would be misleading.
			if (
				effectiveStatus === 'ok'
				&& message.name === 'write_file'
				&& typeof message.snapshotId === 'string'
				&& message.snapshotId.length > 0
				&& !card.querySelector('.tool-card-view-diff')
			) {
				const inputObj = message.input && typeof message.input === 'object' ? message.input : null;
				const filePath = inputObj && typeof inputObj.path === 'string' ? inputObj.path : '';
				if (filePath) {
					const diffBtn = document.createElement('button');
					diffBtn.className = 'tool-card-view-diff';
					diffBtn.type = 'button';
					diffBtn.textContent = 'View diff';
					diffBtn.title = 'Open a side-by-side diff for the file before vs. after the write.';
					diffBtn.addEventListener('click', () => {
						vscode.postMessage({
							type: 'openWriteDiff',
							filePath: filePath,
							snapshotId: message.snapshotId,
						});
					});
					card.appendChild(diffBtn);
				}
			}
			messageList.scrollTop = messageList.scrollHeight;
		}

		/**
		 * Inline tool-result review: open the edit form inside the given
		 * card. The original body (details/terminal block) is hidden — not
		 * detached — so Cancel can restore it without re-rendering. Save
		 * round-trips the new output to the host via 'toolResultEdited' so
		 * the next-turn LLM message uses the edited content. We also flip
		 * the card's user-edited flag and add the "Edited" pill so the
		 * reviewer sees that the curated value will be sent.
		 */
		function openToolEditForm(toolCallId, originalOutput, card) {
			if (!card || card.dataset.editing === 'true') {
				return;
			}
			card.dataset.editing = 'true';

			// Hide the existing body surfaces (details/terminal) so the form
			// takes their place visually. We don't remove them — Cancel
			// restores the original view by simply un-hiding.
			const detailsEl = card.querySelector('.tool-card-output');
			const terminalEl = card.querySelector('.terminal-block');
			const editBtn = card.querySelector('.tool-card-edit');
			const detailsWasHidden = detailsEl ? detailsEl.hidden : false;
			if (detailsEl) detailsEl.hidden = true;
			if (terminalEl) terminalEl.style.display = 'none';
			if (editBtn) editBtn.style.display = 'none';

			const form = document.createElement('div');
			form.className = 'tool-card-edit-form';
			const help = document.createElement('p');
			help.className = 'tool-card-edit-help';
			help.textContent = "Edit the tool's output before the LLM reads it.";
			const ta = document.createElement('textarea');
			ta.className = 'tool-card-edit-textarea';
			ta.rows = 12;
			ta.value = originalOutput;
			const actions = document.createElement('div');
			actions.className = 'tool-card-edit-actions';
			const saveBtn = document.createElement('button');
			saveBtn.type = 'button';
			saveBtn.className = 'tool-card-edit-save primary';
			saveBtn.textContent = 'Save';
			const revertBtn = document.createElement('button');
			revertBtn.type = 'button';
			revertBtn.className = 'tool-card-edit-revert';
			revertBtn.textContent = 'Revert to original';
			const cancelBtn = document.createElement('button');
			cancelBtn.type = 'button';
			cancelBtn.className = 'tool-card-edit-cancel';
			cancelBtn.textContent = 'Cancel';
			actions.appendChild(saveBtn);
			actions.appendChild(revertBtn);
			actions.appendChild(cancelBtn);
			form.appendChild(help);
			form.appendChild(ta);
			form.appendChild(actions);
			card.appendChild(form);
			ta.focus();

			const closeForm = () => {
				form.remove();
				if (detailsEl) detailsEl.hidden = detailsWasHidden;
				if (terminalEl) terminalEl.style.display = '';
				if (editBtn) editBtn.style.display = '';
				card.dataset.editing = 'false';
			};

			// Cap the edited payload before it round-trips. 100 KB matches the
			// rough ceiling at which dropping the rest into a Claude prompt
			// stops being interactive — past that the user is almost certainly
			// pasting a runaway log. We truncate with a warning rather than
			// silently rejecting so they don't lose what they typed.
			const MAX_EDITED_BYTES = 100 * 1024;
			const submit = () => {
				let editedOutput = ta.value;
				const byteLen = (typeof TextEncoder !== 'undefined')
					? new TextEncoder().encode(editedOutput).length
					: editedOutput.length;
				if (byteLen > MAX_EDITED_BYTES) {
					editedOutput = editedOutput.slice(0, MAX_EDITED_BYTES);
					showComposerToast('Edited tool result truncated to 100 KB before sending to the model.');
				}
				vscode.postMessage({ type: 'toolResultEdited', toolCallId, editedOutput });
				// Reflect the edit in the visible body so the user sees what
				// the next LLM turn will read. For shell/terminal cards we
				// fall back to the generic details/<pre> surface — the edit
				// is a freeform string, not a re-runnable command. Build a
				// fresh details element if the card had a terminal block
				// but no pre-existing output details (the shell branch in
				// renderToolCall removes it).
				let targetDetails = detailsEl;
				if (!targetDetails) {
					targetDetails = document.createElement('details');
					targetDetails.className = 'tool-card-output';
					const summary = document.createElement('summary');
					summary.textContent = 'View output';
					const pre = document.createElement('pre');
					targetDetails.appendChild(summary);
					targetDetails.appendChild(pre);
					card.appendChild(targetDetails);
				}
				const preEl = targetDetails.querySelector('pre');
				if (preEl) preEl.textContent = editedOutput;
				targetDetails.hidden = false;
				targetDetails.open = true;
				if (terminalEl) terminalEl.remove();
				card.dataset.userEdited = 'true';
				addEditedPill(card);
				closeForm();
			};

			saveBtn.addEventListener('click', submit);

			revertBtn.addEventListener('click', () => {
				ta.value = originalOutput;
				ta.focus();
			});

			cancelBtn.addEventListener('click', () => {
				closeForm();
			});

			// Keyboard shortcuts on the textarea — Cmd/Ctrl+Enter applies the
			// edit, Escape cancels. Mirrors the composer's submit-on-meta-Enter
			// behaviour so the muscle memory carries over.
			ta.addEventListener('keydown', (e) => {
				if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
					e.preventDefault();
					submit();
					return;
				}
				if (e.key === 'Escape') {
					e.preventDefault();
					closeForm();
				}
			});
		}

		/**
		 * Inline tool-result review: append a small "Edited" pill to the
		 * card header so the user can see at a glance that this result was
		 * curated before the model read it. Idempotent — safe to call
		 * multiple times.
		 */
		function addEditedPill(card) {
			const header = card ? card.querySelector('.tool-card-header') : null;
			if (!header || header.querySelector('.tool-card-edited-pill')) {
				return;
			}
			const pill = document.createElement('span');
			pill.className = 'tool-card-edited-pill';
			pill.textContent = 'Edited';
			pill.title = 'User edited this result before it was read by the model.';
			header.appendChild(pill);
		}

		/**
		 * Render the approval card for a risky tool call (write_file /
		 * run_command). The card surfaces the proposed action — file path +
		 * preview, or command + cwd — and a pair of Approve / Reject buttons
		 * that round-trip back to the host via `approvalResponse`. When the
		 * host has signalled `autoApproved: true` we render a brief pill
		 * instead so power users still see what was dispatched.
		 */
		function renderApprovalRequest(message) {
			if (!currentAssistantDiv) {
				startStreamingMessage(getCurrentAgentDisplayName());
				if (!currentAssistantDiv) return;
			}
			finalizeStreamingText();

			const id = message.id || '';
			const card = document.createElement('div');
			card.className = 'approval-card';
			card.dataset.approvalId = id;
			card.dataset.toolName = message.toolName || 'tool';
			card.dataset.approvalState = message.autoApproved ? 'auto-approved' : 'pending';

			const header = document.createElement('div');
			header.className = 'approval-header';
			const icon = document.createElement('span');
			icon.className = 'approval-icon';
			// Inline SVG triangle/exclamation. Avoids relying on emoji glyphs.
			icon.innerHTML = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 1.5 14.5 13.5h-13z"/><path d="M8 6v4"/><circle cx="8" cy="12" r="0.5" fill="currentColor"/></svg>';
			const title = document.createElement('span');
			title.className = 'approval-title';
			title.textContent = message.autoApproved ? 'Auto-approved action' : 'Approve action';
			header.appendChild(icon);
			header.appendChild(title);

			const pill = document.createElement('span');
			pill.className = 'approval-pill';
			pill.textContent = message.autoApproved ? 'Auto-approved' : 'Pending';
			header.appendChild(pill);
			card.appendChild(header);

			const body = renderApprovalBody(message.toolName, message.payload);
			card.appendChild(body);

			if (message.autoApproved) {
				const note = document.createElement('div');
				note.className = 'approval-outcome';
				note.textContent = 'Auto-approve setting is on — executing without confirmation.';
				card.appendChild(note);
			} else {
				const actions = document.createElement('div');
				actions.className = 'approval-actions';
				// For write_file, surface a "Preview diff" button that opens a
				// proper side-by-side diff editor. The inline preview only shows
				// the first ~30 lines; the diff editor lets the user judge a
				// large change before approving. The button is purely additive
				// — Approve/Reject still drive the approval state.
				const inputPayload = message.input && typeof message.input === 'object' ? message.input : null;
				if (
					message.toolName === 'write_file'
					&& inputPayload
					&& typeof inputPayload.path === 'string'
					&& typeof inputPayload.content === 'string'
				) {
					const previewBtn = document.createElement('button');
					previewBtn.type = 'button';
					previewBtn.className = 'approval-btn approval-btn-preview';
					previewBtn.textContent = 'Preview diff';
					previewBtn.addEventListener('click', () => {
						vscode.postMessage({
							type: 'previewWriteFileDiff',
							path: inputPayload.path,
							proposedContent: inputPayload.content,
						});
					});
					actions.appendChild(previewBtn);
				}
				const approveBtn = document.createElement('button');
				approveBtn.type = 'button';
				approveBtn.className = 'approval-btn approval-btn-primary';
				approveBtn.dataset.action = 'approve';
				approveBtn.textContent = 'Approve';
				approveBtn.addEventListener('click', () => {
					sendApprovalResponse(card, 'approve');
				});
				const rejectBtn = document.createElement('button');
				rejectBtn.type = 'button';
				rejectBtn.className = 'approval-btn approval-btn-secondary';
				rejectBtn.dataset.action = 'reject';
				rejectBtn.textContent = 'Reject';
				rejectBtn.addEventListener('click', () => {
					sendApprovalResponse(card, 'reject');
				});
				actions.appendChild(rejectBtn);
				actions.appendChild(approveBtn);
				card.appendChild(actions);
			}

			currentAssistantDiv.appendChild(card);
			messageList.scrollTop = messageList.scrollHeight;
		}

		/**
		 * Build the tool-specific body of an approval card. `write_file` shows
		 * a path and the first `previewLines`; `run_command` shows the
		 * command, args (when present), and cwd. Both paths sanitise the
		 * payload before insertion — the host has already trimmed unsafe
		 * content but the DOM `textContent` write keeps the surface safe
		 * against accidentally-HTML-shaped input.
		 */
		function renderApprovalBody(toolName, payload) {
			const wrap = document.createElement('div');
			wrap.className = 'approval-body';
			const safePayload = payload && typeof payload === 'object' ? payload : {};

			const tool = document.createElement('div');
			tool.className = 'approval-tool-name';
			tool.textContent = toolName || 'tool';
			wrap.appendChild(tool);

			if (toolName === 'write_file') {
				const target = document.createElement('div');
				target.className = 'approval-target';
				const code = document.createElement('code');
				code.textContent = typeof safePayload.path === 'string' ? safePayload.path : '(no path)';
				target.appendChild(code);
				wrap.appendChild(target);

				const previewLines = Array.isArray(safePayload.previewLines) ? safePayload.previewLines : [];
				const totalLines = typeof safePayload.totalLines === 'number' ? safePayload.totalLines : previewLines.length;
				if (previewLines.length > 0) {
					const preview = document.createElement('div');
					preview.className = 'approval-preview';
					const pre = document.createElement('pre');
					pre.textContent = previewLines.join('\n');
					preview.appendChild(pre);
					if (totalLines > previewLines.length) {
						const more = document.createElement('div');
						more.className = 'approval-preview-more';
						more.textContent = '+ ' + (totalLines - previewLines.length) + ' more lines';
						preview.appendChild(more);
					}
					wrap.appendChild(preview);
				}
			} else if (toolName === 'run_command') {
				const cmdLine = document.createElement('div');
				cmdLine.className = 'approval-command';
				const code = document.createElement('code');
				const command = typeof safePayload.command === 'string' ? safePayload.command : '';
				const args = Array.isArray(safePayload.args) ? safePayload.args.filter(a => typeof a === 'string') : [];
				const argDisplay = args.length > 0
					? ' ' + args.map(a => /[\s"']/.test(a) ? JSON.stringify(a) : a).join(' ')
					: '';
				code.textContent = command + argDisplay;
				cmdLine.appendChild(code);
				wrap.appendChild(cmdLine);

				const cwdLine = document.createElement('div');
				cwdLine.className = 'approval-cwd';
				cwdLine.textContent = 'cwd: ' + (safePayload.cwd ? safePayload.cwd : 'workspace root');
				wrap.appendChild(cwdLine);
			} else {
				// Unknown tool — surface the raw payload as a fallback so the
				// user still sees what's being approved.
				const fallback = document.createElement('div');
				fallback.className = 'approval-cwd';
				try {
					fallback.textContent = JSON.stringify(safePayload);
				} catch (e) {
					fallback.textContent = '';
				}
				wrap.appendChild(fallback);
			}
			return wrap;
		}

		/**
		 * Round-trip the user's approval decision to the host. Disables the
		 * button row immediately so a double-click can't post the response
		 * twice; the host echoes back `approvalResolved` to flip the card's
		 * visual state. We don't optimistically flip here — the host is the
		 * source of truth and may have already cancelled.
		 */
		function sendApprovalResponse(card, action) {
			const id = card.dataset.approvalId || '';
			if (!id) return;
			card.querySelectorAll('.approval-btn').forEach((b) => { b.disabled = true; });
			vscode.postMessage({ type: 'approvalResponse', id, action });
		}

		/**
		 * Flip a pending approval card into its resolved state when the host
		 * confirms the outcome (or after auto-approve). Replaces the action
		 * row with a static outcome label and updates the pill so the card
		 * persists in the chat history with the correct final state.
		 */
		function updateApprovalCard(approvalId, action, reason) {
			if (!approvalId) return;
			const card = currentAssistantDiv ? currentAssistantDiv.querySelector('[data-approval-id="' + cssEscape(approvalId) + '"]') : null;
			if (!card) return;
			const state = action === 'approve' ? 'approved' : action === 'cancel' ? 'cancelled' : 'rejected';
			card.dataset.approvalState = state;
			const pill = card.querySelector('.approval-pill');
			if (pill) {
				pill.textContent = state === 'approved' ? 'Approved' : state === 'cancelled' ? 'Cancelled' : 'Rejected';
			}
			const actions = card.querySelector('.approval-actions');
			if (actions) {
				const outcome = document.createElement('div');
				outcome.className = 'approval-outcome';
				outcome.textContent = state === 'approved'
					? 'Approved'
					: state === 'cancelled'
						? 'Cancelled'
						: 'Rejected' + (reason ? ' (' + reason + ')' : '');
				actions.replaceWith(outcome);
			}
		}

		/**
		 * Phase 81 — compute the dependency-tree depth of each subtask in a
		 * plan. A subtask whose `dependencies` array is empty is depth 0; any
		 * subtask depending on a depth-N task is depth N+1. Depth is capped at
		 * 4 so deeply-nested plans visually flatten rather than disappearing
		 * off the right edge of the chat surface.
		 *
		 * The plan-proposed payload from the host drops the per-subtask `id`
		 * field, so dependencies that reference IDs unknown to this map are
		 * treated as orphan references (depth 0). Cycles in deps are also
		 * defended against — visiting a subtask that's already on the
		 * recursion stack returns 0.
		 */
		function computeSubtaskDepths(subtasks) {
			const idToIndex = new Map();
			subtasks.forEach((s, i) => {
				if (s && s.id) idToIndex.set(s.id, i);
			});

			const depthCache = new Map();

			function depthOf(subtask, visiting) {
				const key = (subtask && (subtask.id || subtask.instruction)) || '';
				if (depthCache.has(key)) return depthCache.get(key);
				if (visiting.has(key)) return 0;  // cycle protection
				visiting.add(key);

				if (!subtask || !Array.isArray(subtask.dependencies) || subtask.dependencies.length === 0) {
					depthCache.set(key, 0);
					return 0;
				}

				let maxParent = -1;
				for (const depId of subtask.dependencies) {
					const idx = idToIndex.get(depId);
					if (idx === undefined) continue;
					const parentDepth = depthOf(subtasks[idx], visiting);
					if (parentDepth > maxParent) maxParent = parentDepth;
				}

				const result = Math.min(maxParent + 1, 4);  // cap at 4
				depthCache.set(key, result);
				return result;
			}

			return subtasks.map(s => depthOf(s, new Set()));
		}

		/**
		 * Phase 81 — shared lookup populated when a plan is proposed and read
		 * by `renderSubtask` so the rendered card can pick up its tree depth.
		 * Keyed by `assignee|instruction` because plan subtasks don't carry
		 * the runtime `subtaskId` that subtask events use.
		 */
		const subtaskDepthByContent = new Map();

		function subtaskDepthKey(assignee, instruction) {
			return (assignee || '') + '|' + (instruction || '');
		}

		/**
		 * Render an orchestrator plan card inside the active assistant message.
		 * The card lists each subtask with its assignee and scope so the user
		 * can follow the dispatched plan; it sits inline with any prose tokens
		 * that streamed before the structured event arrived.
		 */
		function renderAgentPlan(plan) {
			if (!plan || !Array.isArray(plan.subtasks)) {
				return;
			}
			if (!currentAssistantDiv) {
				startStreamingMessage(getCurrentAgentDisplayName());
				if (!currentAssistantDiv) return;
			}
			finalizeStreamingText();

			// Phase 81 — compute dependency-tree depths up front and stash
			// them in the shared lookup so subsequent `renderSubtask` calls
			// can apply the correct indent class.
			const depths = computeSubtaskDepths(plan.subtasks);
			plan.subtasks.forEach((s, i) => {
				subtaskDepthByContent.set(
					subtaskDepthKey(s.assignee, s.instruction),
					depths[i] || 0
				);
			});

			const card = document.createElement('div');
			card.className = 'tool-card sota-plan-card';
			card.dataset.toolStatus = 'running';

			// "Plan" tag chip — sits above the heading.
			const tag = document.createElement('span');
			tag.className = 'sota-plan-tag';
			tag.textContent = 'Plan';
			card.appendChild(tag);

			const header = document.createElement('div');
			header.className = 'tool-card-header';
			const name = document.createElement('span');
			name.className = 'tool-card-name';
			name.textContent = 'Execution plan';
			header.appendChild(name);
			card.appendChild(header);

			// Phase 62 — compact interactive checklist mirroring the plan's
			// subtasks. Sits above the detailed list so the user has an
			// at-a-glance overview that ticks items off as `subtaskStart` /
			// `subtaskComplete` / `subtaskFail` events arrive. Click an item
			// to scroll its detailed subtask card into view.
			renderPlanChecklist(plan.subtasks, card);

			const list = document.createElement('ol');
			list.className = 'sota-plan-list';
			for (const subtask of plan.subtasks) {
				const li = document.createElement('li');
				const assignee = document.createElement('span');
				assignee.className = 'sota-plan-assignee';
				assignee.textContent = '@' + (subtask.assignee || 'anton');
				const instruction = document.createElement('span');
				instruction.className = 'sota-plan-instruction';
				instruction.textContent = ' ' + (subtask.instruction || '');
				li.appendChild(assignee);
				li.appendChild(instruction);
				if (Array.isArray(subtask.scopeFiles) && subtask.scopeFiles.length > 0) {
					const files = document.createElement('div');
					files.className = 'sota-plan-files';
					files.textContent = subtask.scopeFiles.join(', ');
					li.appendChild(files);
				}
				list.appendChild(li);
			}
			card.appendChild(list);
			currentAssistantDiv.appendChild(card);
			messageList.scrollTop = messageList.scrollHeight;
		}

		/**
		 * Phase 62 — render the focus-chain progress checklist at the top of a
		 * plan card. Each item starts in `pending`, transitions to
		 * `in-progress` on `subtaskStart`, then `done` or `failed` on
		 * completion. Clicking an item scrolls the corresponding detailed
		 * subtask card into view and briefly flashes its border.
		 *
		 * Plan subtasks don't carry IDs, so we match plan items to subtask
		 * events by position-aware (assignee, instruction). The first
		 * `subtaskStart` whose assignee+instruction match an unclaimed plan
		 * item stamps that subtask's id onto the checklist item, and all
		 * subsequent state updates query by id.
		 *
		 * Right-click on a row → posts `rerunFromSubtask` to the host so the
		 * composer is pre-filled with `@<handle> <description>`, letting the
		 * user adjust before submitting. Pre-fill is non-destructive (option
		 * (a) per the Phase 62 spec).
		 */
		function renderPlanChecklist(planSubtasks, planContainerEl) {
			if (!planSubtasks || planSubtasks.length === 0) {
				return;
			}
			const checklist = document.createElement('div');
			checklist.className = 'plan-checklist';

			// Header with title + live progress chip ("X / N done"). The chip
			// re-computes from the items' data-state after every event.
			const header = document.createElement('div');
			header.className = 'plan-checklist-header';
			const title = document.createElement('span');
			title.className = 'plan-checklist-title';
			title.textContent = 'Focus chain';
			const progress = document.createElement('span');
			progress.className = 'plan-checklist-progress';
			progress.dataset.progress = '';
			progress.textContent = '0 / ' + planSubtasks.length + ' done';
			header.appendChild(title);
			header.appendChild(progress);
			checklist.appendChild(header);

			const list = document.createElement('ul');
			list.className = 'plan-checklist-list';

			planSubtasks.forEach((subtask, idx) => {
				const item = document.createElement('li');
				item.className = 'plan-checklist-item';
				item.dataset.subtaskIndex = String(idx);
				item.dataset.state = 'pending';
				// Stash assignee+instruction so an incoming `subtaskStart`
				// can claim this item by content match.
				item.dataset.assignee = subtask.assignee || '';
				item.dataset.instruction = subtask.instruction || '';

				const checkbox = document.createElement('span');
				checkbox.className = 'plan-checklist-checkbox';
				// Empty box initially; CSS draws the checkmark/x via ::before
				// based on data-state.
				item.appendChild(checkbox);

				const persona = PERSONAS_BY_ID[subtask.assignee] || {};
				const accent = persona.accent || '';
				const monogram = persona.monogram || (subtask.assignee ? subtask.assignee.charAt(0).toUpperCase() : '?');
				const displayName = persona.displayName || subtask.assignee || 'anton';
				const instr = subtask.instruction || '';
				// First line of description only — keep the row to a single line.
				const firstLine = instr.split('\n')[0];

				const glyph = document.createElement('span');
				glyph.className = 'plan-checklist-glyph';
				if (accent) {
					glyph.style.color = accent;
				}
				glyph.textContent = monogram;
				item.appendChild(glyph);

				const handle = document.createElement('span');
				handle.className = 'plan-checklist-handle';
				handle.textContent = displayName;
				item.appendChild(handle);

				const desc = document.createElement('span');
				desc.className = 'plan-checklist-desc';
				desc.textContent = firstLine;
				desc.title = instr;
				item.appendChild(desc);

				item.addEventListener('click', () => {
					// Prefer matching by stashed subtask id; fall back to the
					// 1-based ordinal that subtask cards use as their index.
					const stashedId = item.dataset.subtaskId;
					let cardEl = null;
					if (stashedId) {
						cardEl = currentAssistantDiv
							? currentAssistantDiv.querySelector('.sota-subtask-card[data-subtask-id="' + cssEscape(stashedId) + '"]')
							: document.querySelector('.sota-subtask-card[data-subtask-id="' + cssEscape(stashedId) + '"]');
					}
					if (!cardEl) {
						const ordinal = String(idx + 1);
						const root = checklist.closest('.sota-plan-card');
						const messageRoot = root ? root.parentElement : currentAssistantDiv;
						if (messageRoot) {
							cardEl = messageRoot.querySelector('.sota-subtask-card[data-subtask-index="' + ordinal + '"]');
						}
					}
					if (cardEl) {
						cardEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
						cardEl.classList.add('subtask-flash');
						setTimeout(() => cardEl.classList.remove('subtask-flash'), 1200);
					}
				});

				// Right-click → "Re-run from here". Posts a single message
				// back to the host which handles the composer pre-fill round
				// trip; we deliberately don't auto-submit so the user can
				// tweak the text first (option (a) per the Phase 62 spec).
				item.addEventListener('contextmenu', (e) => {
					e.preventDefault();
					vscode.postMessage({
						type: 'rerunFromSubtask',
						subtaskId: item.dataset.subtaskId || '',
						handle: subtask.assignee || '',
						description: instr,
					});
				});

				list.appendChild(item);
			});

			checklist.appendChild(list);

			// Insert at the top of the plan card so the checklist sits ABOVE
			// the detailed subtask list.
			planContainerEl.insertBefore(checklist, planContainerEl.firstChild);
		}

		/**
		 * Phase 62 — recompute the "X / N done" progress chip on a checklist.
		 * Counts both `done` and `failed` items as resolved so the total
		 * reflects how much of the plan the orchestrator has burned through,
		 * not just how much succeeded.
		 */
		function updatePlanChecklistProgress(checklistEl) {
			if (!checklistEl) return;
			const items = checklistEl.querySelectorAll('.plan-checklist-item');
			const total = items.length;
			let resolved = 0;
			items.forEach(it => {
				const s = it.dataset.state;
				if (s === 'done' || s === 'failed') resolved++;
			});
			const chip = checklistEl.querySelector('[data-progress]');
			if (chip) {
				chip.textContent = resolved + ' / ' + total + ' done';
			}
		}

		/**
		 * Find the checklist item that corresponds to a subtask event and
		 * update its `data-state`. On the first `subtaskStart` for a given
		 * id we claim the next pending item whose assignee+instruction match
		 * the event, then stash the id on it so subsequent state changes are
		 * O(1).
		 */
		function updatePlanChecklistForSubtask(subtaskId, assignee, instruction, state) {
			if (!currentAssistantDiv) return;
			const id = subtaskId || '';
			let item = id
				? currentAssistantDiv.querySelector('.plan-checklist-item[data-subtask-id="' + cssEscape(id) + '"]')
				: null;
			if (!item && id) {
				// First sighting — claim the next unclaimed item whose
				// assignee+instruction match this event.
				const candidates = currentAssistantDiv.querySelectorAll(
					'.plan-checklist-item:not([data-subtask-id])'
				);
				for (const candidate of candidates) {
					const cAssignee = candidate.dataset.assignee || '';
					const cInstr = candidate.dataset.instruction || '';
					if (cAssignee === (assignee || '') && cInstr === (instruction || '')) {
						item = candidate;
						break;
					}
				}
				// Loose fallback: claim by assignee alone if instructions don't
				// align (the orchestrator may rephrase between plan and
				// dispatch).
				if (!item) {
					for (const candidate of candidates) {
						if ((candidate.dataset.assignee || '') === (assignee || '')) {
							item = candidate;
							break;
						}
					}
				}
				// Last-resort fallback: take the first unclaimed item.
				if (!item && candidates.length > 0) {
					item = candidates[0];
				}
				if (item) {
					item.dataset.subtaskId = id;
				}
			}
			if (item) {
				item.dataset.state = state;
				// Phase 62 — refresh the live progress chip on every state
				// change so the "X / N done" counter follows the subtasks.
				const checklistEl = item.closest('.plan-checklist');
				if (checklistEl) {
					updatePlanChecklistProgress(checklistEl);
				}
			}
		}

		/**
		 * Phase 69 — special-pairing overrides for handoff character beats.
		 * The orchestrator → specialist transitions get hand-tuned phrases;
		 * everything else falls back to the deterministic default pickers.
		 */
		const HANDOFF_VERBS = Object.freeze({
			'anton->anton-security': { from: 'calling security in', to: 'scanning the perimeter' },
			'anton->anton-test': { from: 'asking for receipts', to: 'writing the proof' },
			'anton->anton-docs': { from: 'needs this written down', to: 'drafting' },
			'anton->anton-pr': { from: 'wrapping up', to: 'drafting the PR' },
			'anton->anton-moderniser': { from: 'found something old', to: 'starting the dig' },
		});

		const DEFAULT_FROM_VERBS = Object.freeze([
			'passing the torch',
			'lining up the next move',
			'calling for backup',
			'calling in the specialist',
		]);
		const DEFAULT_TO_VERBS = Object.freeze([
			'rolling up sleeves',
			'stepping in',
			'taking the wheel',
			'on the case',
		]);

		/**
		 * Tiny string hash used to pick stable verbs for an unknown
		 * `from->to` pair. Deterministic so re-renders of the same banner
		 * yield the same wording — the banner shouldn't flicker on repaint.
		 */
		function handoffHash(s) {
			let h = 0;
			for (let i = 0; i < s.length; i++) {
				h = (h * 31 + s.charCodeAt(i)) | 0;
			}
			return Math.abs(h);
		}

		function pickHandoffVerbs(fromHandle, toHandle) {
			const key = fromHandle + '->' + toHandle;
			if (HANDOFF_VERBS[key]) {
				return HANDOFF_VERBS[key];
			}
			const seed = handoffHash(key);
			return {
				from: DEFAULT_FROM_VERBS[seed % DEFAULT_FROM_VERBS.length],
				to: DEFAULT_TO_VERBS[(seed + 1) % DEFAULT_TO_VERBS.length],
			};
		}

		/**
		 * Build and append an inline handoff banner above the next subtask
		 * tree row. Shows both personas with their accents and a short
		 * character beat per side ("Anton (passing the torch) → Anton Code
		 * (rolling up sleeves)"). De-duplicated per (from, to) per turn so
		 * repeated alternations don't spam the transcript. Self-suppresses
		 * when source === target. Banners are transient visual cues — not
		 * persisted — and reloading a conversation does not re-fire them.
		 */
		function renderHandoffBanner(parentEl, fromHandle, toHandle) {
			if (!parentEl || !fromHandle || !toHandle || fromHandle === toHandle) {
				return null;
			}
			const wrapper = parentEl.closest && parentEl.closest('.msg-assistant');
			const turnId = (wrapper && wrapper.dataset && wrapper.dataset.conversationIndex) || 'turn';
			const dedupKey = turnId + '::' + fromHandle + '->' + toHandle;
			if (renderedHandoffPairs.has(dedupKey)) {
				return null;
			}
			renderedHandoffPairs.add(dedupKey);

			const fromPersona = PERSONAS_BY_ID[fromHandle] || {};
			const toPersona = PERSONAS_BY_ID[toHandle] || {};
			const fromAccent = fromPersona.accent || 'var(--sota-fg-muted)';
			const toAccent = toPersona.accent || 'var(--sota-fg-muted)';
			const fromGlyph = fromPersona.monogram || (fromHandle ? fromHandle.charAt(0).toUpperCase() : '?');
			const toGlyph = toPersona.monogram || (toHandle ? toHandle.charAt(0).toUpperCase() : '?');
			const fromName = fromPersona.displayName || fromHandle;
			const toName = toPersona.displayName || toHandle;
			const verbs = pickHandoffVerbs(fromHandle, toHandle);

			const banner = document.createElement('div');
			banner.className = 'handoff-banner';
			banner.dataset.from = fromHandle;
			banner.dataset.to = toHandle;
			banner.dataset.handoff = dedupKey;
			banner.style.setProperty('--from-accent', fromAccent);
			banner.style.setProperty('--to-accent', toAccent);

			const fromGroup = document.createElement('span');
			fromGroup.className = 'handoff-from';
			const fromGlyphEl = document.createElement('span');
			fromGlyphEl.className = 'handoff-glyph';
			fromGlyphEl.style.color = fromAccent;
			fromGlyphEl.textContent = fromGlyph;
			const fromNameEl = document.createElement('span');
			fromNameEl.className = 'handoff-name';
			fromNameEl.style.color = fromAccent;
			fromNameEl.textContent = fromName;
			const fromVerbEl = document.createElement('span');
			fromVerbEl.className = 'handoff-verb';
			fromVerbEl.textContent = '(' + verbs.from + ')';
			fromGroup.appendChild(fromGlyphEl);
			fromGroup.appendChild(fromNameEl);
			fromGroup.appendChild(fromVerbEl);
			banner.appendChild(fromGroup);

			const arrow = document.createElement('span');
			arrow.className = 'handoff-arrow';
			arrow.textContent = '→';
			banner.appendChild(arrow);

			const toGroup = document.createElement('span');
			toGroup.className = 'handoff-to';
			const toGlyphEl = document.createElement('span');
			toGlyphEl.className = 'handoff-glyph';
			toGlyphEl.style.color = toAccent;
			toGlyphEl.textContent = toGlyph;
			const toNameEl = document.createElement('span');
			toNameEl.className = 'handoff-name';
			toNameEl.style.color = toAccent;
			toNameEl.textContent = toName;
			const toVerbEl = document.createElement('span');
			toVerbEl.className = 'handoff-verb';
			toVerbEl.textContent = '(' + verbs.to + ')';
			toGroup.appendChild(toGlyphEl);
			toGroup.appendChild(toNameEl);
			toGroup.appendChild(toVerbEl);
			banner.appendChild(toGroup);

			parentEl.appendChild(banner);
			return banner;
		}

		/**
		 * Render or update a subtask card. Status flips between 'running'
		 * (running), 'ok' (success) and 'error' (failure) so the user can watch
		 * the dispatch progress in place rather than as a wall of prose.
		 *
		 * Phase 81 — each card is wrapped in a `.subtask-tree-row` that draws
		 * a Unicode tree-connector glyph and indents the card under the
		 * orchestrator's message body. The last card in the turn always
		 * uses the corner glyph; previous siblings revert to the tee glyph
		 * when a new card is appended (see `updateSubtaskTreeConnectors`).
		 * The card header also carries a semantic `.subtask-status` chip
		 * ([waiting] / [running] / [done] / [failed]) coloured by the
		 * assignee's persona accent.
		 */
		function renderSubtask(message, status) {
			if (!currentAssistantDiv) {
				startStreamingMessage(getCurrentAgentDisplayName());
				if (!currentAssistantDiv) return;
			}
			finalizeStreamingText();

			const id = message.subtaskId || '';
			// Phase 81 — both the `.subtask-tree-row` wrapper and the inner
			// `.sota-subtask-card` carry the same `data-subtask-id`, so we
			// scope the lookup to `.sota-subtask-card` to make sure status
			// updates land on the card rather than the row.
			let card = id
				? currentAssistantDiv.querySelector('.sota-subtask-card[data-subtask-id="' + cssEscape(id) + '"]')
				: null;
			if (!card) {
				card = document.createElement('div');
				card.className = 'tool-card sota-subtask-card';
				card.dataset.subtaskId = id;
				// 1-based ordinal among existing subtask cards in this message,
				// stable across status updates because new cards always append.
				const existing = currentAssistantDiv.querySelectorAll('.sota-subtask-card').length;
				card.dataset.subtaskIndex = String(existing + 1);
				// Phase 81 — apply the dependency-tree depth class so the card
				// indents under its parent and draws a connector line. Depth
				// is computed when the plan is proposed; if no plan event was
				// seen for this subtask we fall back to depth 0 (flat list).
				const depthKey = subtaskDepthKey(message.assignee, message.instruction);
				const depth = subtaskDepthByContent.get(depthKey) || 0;
				card.classList.add('tree-depth-' + depth);
				card.dataset.treeDepth = String(depth);
				// Phase 81 — stamp the persona accent on the card so the
				// border-left stripe and the semantic status chip can pick it
				// up via `var(--persona-accent)` without hitting the persona
				// registry on every render.
				const persona = PERSONAS_BY_ID[message.assignee] || {};
				if (persona.accent) {
					card.style.setProperty('--persona-accent', persona.accent);
				}
				card.dataset.handle = message.assignee || '';
				const header = document.createElement('div');
				header.className = 'tool-card-header';
				const icon = document.createElement('span');
				icon.className = 'tool-card-icon';
				const badge = document.createElement('span');
				badge.className = 'sota-subtask-badge';
				badge.textContent = card.dataset.subtaskIndex;
				// Phase 81 — persona glyph (monogram) coloured by the
				// assignee's accent so each card is identifiable at a glance.
				// Sits between the badge and the display-name on the header.
				const personaGlyph = document.createElement('span');
				personaGlyph.className = 'sota-subtask-persona-glyph';
				personaGlyph.textContent = persona.monogram
					|| (message.assignee ? message.assignee.charAt(0).toUpperCase() : '?');
				if (persona.accent) {
					personaGlyph.style.color = persona.accent;
				}
				const name = document.createElement('span');
				name.className = 'tool-card-name';
				const args = document.createElement('span');
				args.className = 'tool-card-args';
				const statusPill = document.createElement('span');
				statusPill.className = 'tool-card-status';
				// Phase 81 — semantic status chip with `[waiting]` /
				// `[running]` / `[done]` / `[failed]` text. Distinct from the
				// existing `.tool-card-status` pill so we don't collide with
				// the running/ok/error visual styling. Default state is
				// 'waiting' so a card built before the first `subtaskStart`
				// event renders with the spec-compliant chip text; the very
				// next status update will flip it to running/done/failed.
				const subtaskStatus = document.createElement('span');
				subtaskStatus.className = 'subtask-status';
				subtaskStatus.dataset.status = 'waiting';
				subtaskStatus.textContent = 'waiting';
				header.appendChild(icon);
				header.appendChild(badge);
				header.appendChild(personaGlyph);
				header.appendChild(name);
				header.appendChild(args);
				header.appendChild(subtaskStatus);
				header.appendChild(statusPill);
				card.appendChild(header);
				const body = document.createElement('div');
				body.className = 'sota-subtask-body';
				card.appendChild(body);

				// Phase 81 — wrap the card in a `.subtask-tree-row` so the
				// Unicode tree connector glyph sits to its left and the entire
				// row is indented under the orchestrator's message body. We
				// keep the existing `.sota-subtask-card` class on the inner
				// node so all prior styling (status stripe, dependency-depth
				// indent, flash highlight on focus-chain click) continues to
				// apply unchanged.
				const row = document.createElement('div');
				row.className = 'subtask-tree-row';
				row.dataset.subtaskId = id;
				row.dataset.handle = message.assignee || '';
				if (persona.accent) {
					row.style.setProperty('--persona-accent', persona.accent);
				}
				const connector = document.createElement('span');
				connector.className = 'subtask-tree-connector';
				// Default to the corner glyph so a single-card turn renders
				// correctly even before `updateSubtaskTreeConnectors` fires.
				connector.textContent = '└─';
				row.appendChild(connector);
				row.appendChild(card);
				currentAssistantDiv.appendChild(row);

				// Recompute the connector glyphs on every existing row in
				// this turn now that a new sibling has been appended. The
				// previously-last card flips from the corner to the tee glyph
				// and the new card claims the corner.
				updateSubtaskTreeConnectors(currentAssistantDiv);
			}

			card.dataset.toolStatus = status;
			const iconEl = card.querySelector('.tool-card-icon');
			const nameEl = card.querySelector('.tool-card-name');
			const argsEl = card.querySelector('.tool-card-args');
			const statusEl = card.querySelector('.tool-card-status');
			const subtaskStatusEl = card.querySelector('.subtask-status');
			const bodyEl = card.querySelector('.sota-subtask-body');

			if (iconEl) {
				iconEl.textContent = status === 'ok' ? '\u2713' : status === 'error' ? '\u2717' : '\u25B6';
			}
			if (nameEl) {
				// Phase 81 \u2014 render the assignee's display name (e.g. "Anton
				// Code") rather than the raw `@handle` so the tree reads as a
				// proper byline. Falls back to the handle then 'anton' for
				// unknown personas.
				const persona = PERSONAS_BY_ID[message.assignee] || {};
				const displayName = persona.displayName || message.assignee || 'anton';
				nameEl.textContent = displayName;
			}
			if (argsEl) {
				argsEl.textContent = message.instruction || message.summary || '';
			}
			if (statusEl) {
				statusEl.textContent = status === 'ok' ? 'Done' : status === 'error' ? 'Failed' : 'Running';
			}
			if (subtaskStatusEl) {
				// Phase 81 \u2014 mirror the run state onto the semantic status
				// chip. We never show 'waiting' here because every event that
				// reaches `renderSubtask` is at least a `subtaskStart` (so the
				// card is already in flight); 'waiting' is reserved for cards
				// built ahead of dispatch, which the current code path doesn't
				// produce but the shape supports for future extensions.
				const semantic = status === 'ok' ? 'done' : status === 'error' ? 'failed' : 'running';
				subtaskStatusEl.dataset.status = semantic;
				// Phase 99 \u2014 in the running state, prepend the animated
				// thinking ring before the chip text. Other states render as
				// plain text so 'done' / 'failed' don't carry residual motion.
				if (semantic === 'running') {
					subtaskStatusEl.innerHTML = renderThinkingIndicator('inline')
						+ '<span class="subtask-status-text">running</span>';
				} else {
					subtaskStatusEl.textContent = semantic;
				}
			}
			if (bodyEl && status === 'error' && message.error) {
				bodyEl.textContent = message.error;
			} else if (bodyEl && status === 'ok' && message.summary) {
				bodyEl.textContent = message.summary;
			}
			messageList.scrollTop = messageList.scrollHeight;
		}

		/**
		 * Phase 81 \u2014 recompute the Unicode tree-connector glyph on every
		 * `.subtask-tree-row` that sits as a direct child of the supplied
		 * message body. The last row uses the corner glyph; all earlier
		 * rows use the tee glyph. Idempotent so it is safe to call after
		 * every new card is appended.
		 */
		function updateSubtaskTreeConnectors(parentEl) {
			if (!parentEl) return;
			const rows = parentEl.querySelectorAll(':scope > .subtask-tree-row');
			rows.forEach((row, i) => {
				const connector = row.querySelector('.subtask-tree-connector');
				if (!connector) {
					return;
				}
				connector.textContent = i === rows.length - 1
					? '\u2514\u2500' // \u2514\u2500
					: '\u251C\u2500'; // \u251C\u2500
			});
		}

		/**
		 * Append a streamed token into the body of an in-flight subtask card.
		 * Falls back to the standard streaming text span if the card is
		 * missing — defensive but rare.
		 */
		function appendSubtaskToken(subtaskId, token) {
			if (!currentAssistantDiv) return;
			const id = subtaskId || '';
			// Phase 81 — scope to `.sota-subtask-card` so we don't accidentally
			// select the wrapping `.subtask-tree-row`, which now also carries
			// `data-subtask-id` for connector bookkeeping.
			const card = id
				? currentAssistantDiv.querySelector('.sota-subtask-card[data-subtask-id="' + cssEscape(id) + '"]')
				: null;
			if (!card) {
				appendStreamingText(token);
				return;
			}
			const body = card.querySelector('.sota-subtask-body');
			if (body) {
				body.textContent = (body.textContent || '') + token;
			}
		}

		/**
		 * Minimal CSS.escape polyfill for selector use. We restrict to the
		 * id shapes the host actually emits (UUIDs / Anthropic tool-use ids)
		 * so a tight allowlist is sufficient.
		 */
		function cssEscape(value) {
			if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') {
				return CSS.escape(value);
			}
			return String(value).replace(/[^a-zA-Z0-9_\-]/g, '\\$&');
		}

		// =====================================================================
		// Generative UI — vanilla-JS renderer registry.
		//
		// The LLM emits structured UI blocks via the `emit_ui_block` builtin
		// tool. The host posts a `uiBlock` message to the webview which
		// dispatches into `mountUiBlock` below. Each registered renderer is
		// a `(props, helpers) => HTMLElement` function. Helpers expose:
		//   - `blockId`           stable id minted by the host
		//   - `respond(value)`    post `uiBlockResponse` (form/confirm)
		//   - `onAction(name, p)` post `uiBlockAction` (card buttons)
		//
		// Renderers MUST escape any user/LLM string before injecting into
		// HTML. The `escapeHtml` helper is sufficient for plain text; for
		// markdown body content the `renderMarkdown` helper escapes
		// internally. New components are added by registering with the
		// registry and adding matching CSS in `chat.css`.
		// =====================================================================

		/**
		 * Build the helpers bag for a single block. Wraps `vscode.postMessage`
		 * so renderers don't need to know about the host wire format.
		 */
		function buildUiBlockHelpers(blockId) {
			return {
				blockId: blockId,
				respond: function (value) {
					vscode.postMessage({
						type: 'uiBlockResponse',
						blockId: blockId,
						responseValue: value,
					});
				},
				onAction: function (name, payload) {
					vscode.postMessage({
						type: 'uiBlockAction',
						blockId: blockId,
						actionName: typeof name === 'string' ? name : 'unnamed',
						actionPayload: payload,
					});
				},
			};
		}

		/**
		 * Mount a generative-UI block in the right DOM location and freeze
		 * any later duplicate `uiBlock` postMessage with the same blockId.
		 * Subtask-scoped blocks attach to the matching `.sota-subtask-body`;
		 * orchestrator-level blocks go into the active assistant body.
		 */
		function mountUiBlock(message) {
			const blockId = (message && typeof message.blockId === 'string') ? message.blockId : '';
			const component = (message && typeof message.component === 'string') ? message.component : '';
			const props = (message && message.props && typeof message.props === 'object') ? message.props : {};
			if (!blockId || !component) {
				return;
			}
			// Idempotent: if a block with this id is already on the page,
			// the spec says ignore the duplicate. The host already dedups,
			// but reload paths and races mean defending here is cheap.
			if (messageList && messageList.querySelector('.ui-block[data-block-id="' + cssEscape(blockId) + '"]')) {
				return;
			}
			const renderer = GENERATIVE_UI_RENDERERS[component];
			if (!renderer) {
				console.warn('[chat] uiBlock: no renderer for component', component);
				return;
			}
			let host = null;
			if (message && typeof message.subtaskId === 'string' && message.subtaskId && currentAssistantDiv) {
				const card = currentAssistantDiv.querySelector('.sota-subtask-card[data-subtask-id="' + cssEscape(message.subtaskId) + '"]');
				if (card) {
					host = card.querySelector('.sota-subtask-body') || card;
				}
			}
			if (!host) {
				if (!currentAssistantDiv) {
					startStreamingMessage(getCurrentAgentDisplayName());
				}
				if (!currentAssistantDiv) {
					return;
				}
				finalizeStreamingText();
				host = currentAssistantDiv;
			}
			const helpers = buildUiBlockHelpers(blockId);
			let root;
			try {
				root = renderer(props, helpers);
			} catch (err) {
				console.warn('[chat] uiBlock renderer threw:', err);
				return;
			}
			if (!(root instanceof HTMLElement)) {
				return;
			}
			if (!root.classList.contains('ui-block')) {
				root.classList.add('ui-block');
			}
			root.dataset.blockId = blockId;
			root.dataset.uiComponent = component;
			host.appendChild(root);
			if (messageList) {
				messageList.scrollTop = messageList.scrollHeight;
			}
		}

		/**
		 * After `renderMarkdown` runs on a reloaded message body, we end up
		 * with `<div class="ui-block-placeholder" data-ui-block-payload>`
		 * stubs. Walk the surrounding subtree and swap each placeholder for
		 * a freshly-mounted block via the renderer registry. Live blocks go
		 * through `mountUiBlock` and never hit this path.
		 */
		function hydrateUiBlockPlaceholders(root) {
			if (!root || typeof root.querySelectorAll !== 'function') {
				return;
			}
			const placeholders = root.querySelectorAll('.ui-block-placeholder[data-ui-block-payload]');
			for (const placeholder of placeholders) {
				const b64 = placeholder.dataset.uiBlockPayload || '';
				if (!b64) {
					placeholder.remove();
					continue;
				}
				let payload = null;
				try {
					payload = JSON.parse(decodeURIComponent(escape(atob(b64))));
				} catch (e) {
					payload = null;
				}
				if (!payload || typeof payload.component !== 'string' || typeof payload.blockId !== 'string') {
					placeholder.remove();
					continue;
				}
				const renderer = GENERATIVE_UI_RENDERERS[payload.component];
				if (!renderer) {
					placeholder.remove();
					continue;
				}
				const helpers = buildUiBlockHelpers(payload.blockId);
				let mounted = null;
				try {
					mounted = renderer(payload.props || {}, helpers);
				} catch (err) {
					console.warn('[chat] uiBlock hydrate threw:', err);
				}
				if (mounted instanceof HTMLElement) {
					if (!mounted.classList.contains('ui-block')) {
						mounted.classList.add('ui-block');
					}
					mounted.dataset.blockId = payload.blockId;
					mounted.dataset.uiComponent = payload.component;
					placeholder.replaceWith(mounted);
				} else {
					placeholder.remove();
				}
			}
		}

		// Expose hydration to other render paths (e.g. message-list reload)
		// without forcing them to import the closure-local function.
		window.__sotaHydrateUiBlocks = hydrateUiBlockPlaceholders;

		/**
		 * Disable every focusable input under `root` and stamp a
		 * `data-responded="true"` flag so subsequent renders / styling can
		 * style the block as locked. Used by `form` and `confirm` after the
		 * user submits.
		 */
		function freezeUiBlock(root) {
			if (!root) {
				return;
			}
			root.dataset.responded = 'true';
			const focusables = root.querySelectorAll('input, textarea, select, button');
			for (const el of focusables) {
				try {
					el.disabled = true;
				} catch (e) {
					// no-op — non-form elements without `disabled`
				}
			}
		}

		// --- Renderer: card ---------------------------------------------------
		// Props: { title: string; body?: string; actions?: Array<{ name: string;
		// label: string; payload?: unknown; variant?: 'primary' | 'secondary' }> }
		function renderCard(props, helpers) {
			const root = document.createElement('div');
			root.className = 'ui-block ui-block-card';
			const title = typeof props.title === 'string' ? props.title : '';
			const body = typeof props.body === 'string' ? props.body : '';
			const actions = Array.isArray(props.actions) ? props.actions : [];
			let html = '';
			if (title) {
				html += '<div class="ui-block-card-title">' + escapeHtml(title) + '</div>';
			}
			if (body) {
				// Body goes through the existing markdown renderer so links,
				// lists, code, and emphasis behave the same as assistant
				// prose. `renderMarkdown` escapes internally.
				html += '<div class="ui-block-card-body">' + renderMarkdown(body) + '</div>';
			}
			root.innerHTML = html;
			if (actions.length > 0) {
				const row = document.createElement('div');
				row.className = 'ui-block-card-actions';
				for (const action of actions) {
					if (!action || typeof action !== 'object') {
						continue;
					}
					const name = typeof action.name === 'string' ? action.name : 'action';
					const label = typeof action.label === 'string' ? action.label : name;
					const variant = action.variant === 'primary' ? 'primary' : 'secondary';
					const btn = document.createElement('button');
					btn.type = 'button';
					btn.className = 'ui-block-btn ui-block-btn-' + variant;
					btn.textContent = label;
					btn.dataset.actionName = name;
					btn.addEventListener('click', () => {
						helpers.onAction(name, action.payload);
					});
					row.appendChild(btn);
				}
				root.appendChild(row);
			}
			return root;
		}
		GENERATIVE_UI_RENDERERS.card = renderCard;

		// --- Renderer: confirm ------------------------------------------------
		// Props: { title: string; body?: string; yesLabel?: string; noLabel?: string }
		function renderConfirm(props, helpers) {
			const root = document.createElement('div');
			root.className = 'ui-block ui-block-confirm';
			const title = typeof props.title === 'string' ? props.title : 'Confirm';
			const body = typeof props.body === 'string' ? props.body : '';
			const yesLabel = typeof props.yesLabel === 'string' ? props.yesLabel : 'Yes';
			const noLabel = typeof props.noLabel === 'string' ? props.noLabel : 'No';
			let html = '<div class="ui-block-card-title">' + escapeHtml(title) + '</div>';
			if (body) {
				html += '<div class="ui-block-card-body">' + renderMarkdown(body) + '</div>';
			}
			root.innerHTML = html;
			const row = document.createElement('div');
			row.className = 'ui-block-card-actions';
			const yesBtn = document.createElement('button');
			yesBtn.type = 'button';
			yesBtn.className = 'ui-block-btn ui-block-btn-primary';
			yesBtn.textContent = yesLabel;
			yesBtn.addEventListener('click', () => {
				helpers.respond(true);
				freezeUiBlock(root);
			});
			const noBtn = document.createElement('button');
			noBtn.type = 'button';
			noBtn.className = 'ui-block-btn ui-block-btn-secondary';
			noBtn.textContent = noLabel;
			noBtn.addEventListener('click', () => {
				helpers.respond(false);
				freezeUiBlock(root);
			});
			row.appendChild(yesBtn);
			row.appendChild(noBtn);
			root.appendChild(row);
			return root;
		}
		GENERATIVE_UI_RENDERERS.confirm = renderConfirm;

		// --- Renderer: form ---------------------------------------------------
		// Props: { title: string; submitLabel?: string;
		//   fields: Array<{ name; label; type: 'text'|'textarea'|'select'|'checkbox';
		//     options?: string[]; placeholder?: string; required?: boolean }> }
		function renderForm(props, helpers) {
			const root = document.createElement('div');
			root.className = 'ui-block ui-block-form';
			const title = typeof props.title === 'string' ? props.title : 'Form';
			const fields = Array.isArray(props.fields) ? props.fields : [];
			const submitLabel = typeof props.submitLabel === 'string' ? props.submitLabel : 'Submit';
			const titleEl = document.createElement('div');
			titleEl.className = 'ui-block-card-title';
			titleEl.textContent = title;
			root.appendChild(titleEl);
			const formEl = document.createElement('form');
			formEl.className = 'ui-block-form-grid';
			formEl.addEventListener('submit', (ev) => {
				ev.preventDefault();
				const value = collectFormValues(formEl, fields);
				helpers.respond(value);
				freezeUiBlock(root);
			});
			for (const field of fields) {
				if (!field || typeof field !== 'object' || typeof field.name !== 'string') {
					continue;
				}
				const fieldId = 'uiblk-' + helpers.blockId + '-' + field.name;
				const wrap = document.createElement('div');
				wrap.className = 'ui-block-form-row';
				const label = document.createElement('label');
				label.className = 'ui-block-form-label';
				label.htmlFor = fieldId;
				label.textContent = typeof field.label === 'string' ? field.label : field.name;
				if (field.required) {
					const req = document.createElement('span');
					req.className = 'ui-block-form-required';
					req.textContent = '*';
					label.appendChild(req);
				}
				wrap.appendChild(label);
				let input;
				if (field.type === 'textarea') {
					input = document.createElement('textarea');
					input.rows = 3;
				} else if (field.type === 'select') {
					input = document.createElement('select');
					const options = Array.isArray(field.options) ? field.options : [];
					for (const opt of options) {
						const optEl = document.createElement('option');
						optEl.value = String(opt);
						optEl.textContent = String(opt);
						input.appendChild(optEl);
					}
				} else if (field.type === 'checkbox') {
					input = document.createElement('input');
					input.type = 'checkbox';
				} else {
					input = document.createElement('input');
					input.type = 'text';
				}
				input.id = fieldId;
				input.name = field.name;
				input.className = 'ui-block-form-input';
				if (field.required && field.type !== 'checkbox') {
					input.required = true;
				}
				if (typeof field.placeholder === 'string' && field.type !== 'checkbox' && field.type !== 'select') {
					input.placeholder = field.placeholder;
				}
				wrap.appendChild(input);
				formEl.appendChild(wrap);
			}
			const actions = document.createElement('div');
			actions.className = 'ui-block-card-actions';
			const submitBtn = document.createElement('button');
			submitBtn.type = 'submit';
			submitBtn.className = 'ui-block-btn ui-block-btn-primary';
			submitBtn.textContent = submitLabel;
			actions.appendChild(submitBtn);
			formEl.appendChild(actions);
			root.appendChild(formEl);
			return root;
		}
		GENERATIVE_UI_RENDERERS.form = renderForm;

		/**
		 * Collect a form's values into a plain object keyed by field name.
		 * Checkboxes are coerced to booleans; everything else is a string.
		 */
		function collectFormValues(formEl, fields) {
			const out = Object.create(null);
			for (const field of fields) {
				if (!field || typeof field !== 'object' || typeof field.name !== 'string') {
					continue;
				}
				const el = formEl.querySelector('[name="' + cssEscape(field.name) + '"]');
				if (!el) {
					continue;
				}
				if (field.type === 'checkbox') {
					out[field.name] = !!el.checked;
				} else {
					out[field.name] = String(el.value == null ? '' : el.value);
				}
			}
			return out;
		}

		// --- Renderer: table --------------------------------------------------
		// Props: { columns: string[]; rows: Array<Record<string, string|number>>; caption?: string }
		function renderTable(props, helpers) {
			const root = document.createElement('div');
			root.className = 'ui-block ui-block-table';
			const columns = Array.isArray(props.columns) ? props.columns.map(c => String(c)) : [];
			const rows = Array.isArray(props.rows) ? props.rows : [];
			const caption = typeof props.caption === 'string' ? props.caption : '';
			let html = '';
			if (caption) {
				html += '<div class="ui-block-card-title">' + escapeHtml(caption) + '</div>';
			}
			html += '<table class="ui-block-table-grid"><thead><tr>';
			for (const col of columns) {
				html += '<th>' + escapeHtml(col) + '</th>';
			}
			html += '</tr></thead><tbody>';
			for (const row of rows) {
				if (!row || typeof row !== 'object') {
					continue;
				}
				html += '<tr>';
				for (const col of columns) {
					const cell = row[col];
					const text = (cell === undefined || cell === null) ? '' : String(cell);
					html += '<td>' + escapeHtml(text) + '</td>';
				}
				html += '</tr>';
			}
			html += '</tbody></table>';
			root.innerHTML = html;
			return root;
		}
		GENERATIVE_UI_RENDERERS.table = renderTable;

		// --- Renderer: chart --------------------------------------------------
		// Props: { type: 'bar'; labels: string[]; values: number[]; title?: string }
		function renderChart(props, helpers) {
			const root = document.createElement('div');
			root.className = 'ui-block ui-block-chart';
			const labels = Array.isArray(props.labels) ? props.labels.map(l => String(l)) : [];
			const valuesRaw = Array.isArray(props.values) ? props.values : [];
			const values = valuesRaw.map(v => {
				const n = typeof v === 'number' ? v : Number(v);
				return Number.isFinite(n) ? n : 0;
			});
			const title = typeof props.title === 'string' ? props.title : '';
			const count = Math.min(labels.length, values.length);
			if (title) {
				const titleEl = document.createElement('div');
				titleEl.className = 'ui-block-card-title';
				titleEl.textContent = title;
				root.appendChild(titleEl);
			}
			if (count === 0) {
				const empty = document.createElement('div');
				empty.className = 'ui-block-card-body';
				empty.textContent = '(no data)';
				root.appendChild(empty);
				return root;
			}
			// Hand-drawn SVG bar chart. Width is responsive via viewBox; the
			// host CSS sets a max-width so it sits comfortably in the chat.
			const svgWidth = 360;
			const svgHeight = 180;
			const padLeft = 40;
			const padRight = 12;
			const padTop = 12;
			const padBottom = 40;
			const innerW = svgWidth - padLeft - padRight;
			const innerH = svgHeight - padTop - padBottom;
			const max = Math.max(...values, 0);
			const safeMax = max > 0 ? max : 1;
			const barGap = 6;
			const barW = Math.max(2, (innerW - barGap * (count - 1)) / count);
			const SVG_NS = 'http://www.w3.org/2000/svg';
			const svg = document.createElementNS(SVG_NS, 'svg');
			svg.setAttribute('viewBox', '0 0 ' + svgWidth + ' ' + svgHeight);
			svg.setAttribute('class', 'ui-block-chart-svg');
			svg.setAttribute('role', 'img');
			if (title) {
				svg.setAttribute('aria-label', title);
			}
			// Y axis baseline.
			const axis = document.createElementNS(SVG_NS, 'line');
			axis.setAttribute('x1', String(padLeft));
			axis.setAttribute('y1', String(padTop + innerH));
			axis.setAttribute('x2', String(padLeft + innerW));
			axis.setAttribute('y2', String(padTop + innerH));
			axis.setAttribute('class', 'ui-block-chart-axis');
			svg.appendChild(axis);
			// Y label (max).
			const maxLabel = document.createElementNS(SVG_NS, 'text');
			maxLabel.setAttribute('x', String(padLeft - 6));
			maxLabel.setAttribute('y', String(padTop + 10));
			maxLabel.setAttribute('text-anchor', 'end');
			maxLabel.setAttribute('class', 'ui-block-chart-axis-label');
			maxLabel.textContent = String(max);
			svg.appendChild(maxLabel);
			const zeroLabel = document.createElementNS(SVG_NS, 'text');
			zeroLabel.setAttribute('x', String(padLeft - 6));
			zeroLabel.setAttribute('y', String(padTop + innerH + 4));
			zeroLabel.setAttribute('text-anchor', 'end');
			zeroLabel.setAttribute('class', 'ui-block-chart-axis-label');
			zeroLabel.textContent = '0';
			svg.appendChild(zeroLabel);
			for (let i = 0; i < count; i++) {
				const v = values[i];
				const h = Math.max(0, Math.round((v / safeMax) * innerH));
				const x = padLeft + i * (barW + barGap);
				const y = padTop + innerH - h;
				const rect = document.createElementNS(SVG_NS, 'rect');
				rect.setAttribute('x', String(x));
				rect.setAttribute('y', String(y));
				rect.setAttribute('width', String(barW));
				rect.setAttribute('height', String(h));
				rect.setAttribute('class', 'ui-block-chart-bar');
				const tip = document.createElementNS(SVG_NS, 'title');
				tip.textContent = labels[i] + ': ' + v;
				rect.appendChild(tip);
				svg.appendChild(rect);
				const lbl = document.createElementNS(SVG_NS, 'text');
				lbl.setAttribute('x', String(x + barW / 2));
				lbl.setAttribute('y', String(padTop + innerH + 14));
				lbl.setAttribute('text-anchor', 'middle');
				lbl.setAttribute('class', 'ui-block-chart-label');
				const labelText = labels[i].length > 10 ? labels[i].slice(0, 9) + '…' : labels[i];
				lbl.textContent = labelText;
				svg.appendChild(lbl);
			}
			root.appendChild(svg);
			return root;
		}
		GENERATIVE_UI_RENDERERS.chart = renderChart;

		// --- Renderer: progress -----------------------------------------------
		// Props: { steps: string[]; current: number }
		function renderProgress(props, helpers) {
			const root = document.createElement('div');
			root.className = 'ui-block ui-block-progress';
			const steps = Array.isArray(props.steps) ? props.steps.map(s => String(s)) : [];
			const currentRaw = Number(props.current);
			const current = Number.isFinite(currentRaw) ? Math.floor(currentRaw) : -1;
			const list = document.createElement('ol');
			list.className = 'ui-block-progress-list';
			for (let i = 0; i < steps.length; i++) {
				const item = document.createElement('li');
				let state;
				if (i < current) {
					state = 'done';
				} else if (i === current) {
					state = 'active';
				} else {
					state = 'pending';
				}
				item.className = 'ui-block-progress-step ui-block-progress-' + state;
				item.dataset.state = state;
				const marker = document.createElement('span');
				marker.className = 'ui-block-progress-marker';
				marker.textContent = state === 'done' ? '✓' : String(i + 1);
				const text = document.createElement('span');
				text.className = 'ui-block-progress-label';
				text.textContent = steps[i];
				item.appendChild(marker);
				item.appendChild(text);
				list.appendChild(item);
			}
			root.appendChild(list);
			return root;
		}
		GENERATIVE_UI_RENDERERS.progress = renderProgress;

		function updateConnectionUi(status) {
			if (!hdrConn || !hdrConnLabel) {
				return;
			}
			const providers = (status && Array.isArray(status.providers)) ? status.providers : [];
			const connected = providers.filter(p => p && p.connected);
			if (connected.length === 0) {
				hdrConn.hidden = true;
				hdrConnLabel.textContent = '';
				const dot = hdrConn.querySelector('.hdr-conn-dot');
				if (dot) {
					dot.classList.remove('connected');
				}
				return;
			}
			hdrConn.hidden = false;
			const label = connected.length === 1
				? (connected[0].displayName || connected[0].id || '')
				: (connected.length + ' providers');
			hdrConnLabel.textContent = label;
			const dot = hdrConn.querySelector('.hdr-conn-dot');
			if (dot) {
				dot.classList.add('connected');
			}
		}

		/**
		 * Toggle the empty-state between the standard sample-prompts panel
		 * and the sign-in CTA panel based on whether ANY auth source is
		 * available. Defensive: a malformed status falls through to the
		 * ready panel so we never lock the user out of the prompt cards.
		 */
		function updateAuthGate(status) {
			if (!emptyStateReady || !emptyStateAuth) {
				return;
			}
			// Defensive: if the payload is missing both shape markers we treat
			// auth as available rather than locking the user out behind a CTA.
			const hasProviders = status && Array.isArray(status.providers);
			const hasApiKeysShape = status && status.apiKeys && typeof status.apiKeys === 'object';
			if (!hasProviders && !hasApiKeysShape) {
				emptyStateReady.hidden = false;
				emptyStateAuth.hidden = true;
				return;
			}
			const providers = hasProviders ? status.providers : [];
			const apiKeys = hasApiKeysShape ? status.apiKeys : {};
			const providerState = (status && status.providerState && typeof status.providerState === 'object') ? status.providerState : null;
			const hasOAuth = providers.some(p => p && p.connected);
			let ready = hasOAuth || Boolean(apiKeys.anthropic) || Boolean(apiKeys.openai);
			// providerState gives us full coverage including Foundry / Bedrock /
			// Google — the legacy apiKeys flag only covered the original two
			// providers.
			if (providerState) {
				ready = ready
					|| Boolean(providerState.foundry && providerState.foundry.hasApiKey && providerState.foundry.hasEndpoint)
					|| Boolean(providerState.bedrock && (providerState.bedrock.hasAccessKey || providerState.bedrock.hasProfile))
					|| Boolean(providerState.google && providerState.google.hasApiKey)
					|| Boolean(providerState.openrouter && providerState.openrouter.hasApiKey)
					|| Boolean(providerState.ollama && providerState.ollama.hasBaseUrl)
					|| Boolean(providerState.lmstudio && providerState.lmstudio.hasBaseUrl)
					|| Boolean(providerState.deepseek && providerState.deepseek.hasApiKey)
					|| Boolean(providerState.mistral && providerState.mistral.hasApiKey)
					|| Boolean(providerState.groq && providerState.groq.hasApiKey)
					|| Boolean(providerState.cerebras && providerState.cerebras.hasApiKey)
					|| Boolean(providerState.together && providerState.together.hasApiKey)
					|| Boolean(providerState.fireworks && providerState.fireworks.hasApiKey)
					|| Boolean(providerState.codex && providerState.codex.hasCli);
			}
			emptyStateReady.hidden = !ready;
			emptyStateAuth.hidden = ready;
			updateProviderStatusPills(providerState, providers, apiKeys);
		}

		/**
		 * Refresh the per-card status pills on the empty-state provider list AND
		 * the matching mini-cards inside the inline settings view. Mirrors the
		 * detection logic in `credentialDetection.ts` so a configured provider
		 * shows "Connected" the moment the chat surface boots.
		 */
		function updateProviderStatusPills(providerState, oauthProviders, apiKeys) {
			const pState = providerState || {};
			const oauth = Array.isArray(oauthProviders) ? oauthProviders : [];
			const ak = apiKeys || {};
			const oauthConnected = (id) => oauth.some(p => p && p.id === id && p.connected);

			const flags = {
				anthropic: Boolean((pState.anthropic && (pState.anthropic.hasApiKey || pState.anthropic.hasOAuth)) || ak.anthropic || oauthConnected('anthropic-oauth')),
				openai: Boolean((pState.openai && (pState.openai.hasApiKey || pState.openai.hasOAuth)) || ak.openai || oauthConnected('chatgpt-oauth')),
				foundry: Boolean(pState.foundry && pState.foundry.hasApiKey && pState.foundry.hasEndpoint),
				bedrock: Boolean(pState.bedrock && (pState.bedrock.hasAccessKey || pState.bedrock.hasProfile)),
				google: Boolean(pState.google && pState.google.hasApiKey),
				openrouter: Boolean(pState.openrouter && pState.openrouter.hasApiKey),
				ollama: Boolean(pState.ollama && pState.ollama.hasBaseUrl),
				lmstudio: Boolean(pState.lmstudio && pState.lmstudio.hasBaseUrl),
				deepseek: Boolean(pState.deepseek && pState.deepseek.hasApiKey),
				mistral: Boolean(pState.mistral && pState.mistral.hasApiKey),
				groq: Boolean(pState.groq && pState.groq.hasApiKey),
				cerebras: Boolean(pState.cerebras && pState.cerebras.hasApiKey),
				together: Boolean(pState.together && pState.together.hasApiKey),
				fireworks: Boolean(pState.fireworks && pState.fireworks.hasApiKey),
			};
			window.__SOTA_PROVIDER_FLAGS = flags;

			document.querySelectorAll('.provider-card-status').forEach((el) => {
				const id = el.getAttribute('data-status');
				if (!id || !(id in flags)) return;
				const ok = flags[id];
				el.textContent = ok ? 'Connected' : 'Not configured';
				el.classList.toggle('connected', ok);
				el.classList.toggle('not-configured', !ok);
				const card = el.closest('.provider-card');
				if (card) {
					card.classList.toggle('is-connected', ok);
				}
			});

			// Also update the settings-view mini-cards if they've been rendered.
			renderSettingsProviderCards(flags);
		}

		// --- Inline provider form (Cline-style 5-card picker) ---

		// Tracks where the inline provider form was opened from, so the Back
		// button can restore the right surface. 'empty-state' returns to the
		// 5-card grid; 'settings' returns to the inline settings view.
		let providerFormOrigin = 'empty-state';

		const PROVIDER_LABELS = {
			anthropic: 'Anthropic Claude',
			openai: 'OpenAI',
			foundry: 'Microsoft Foundry / Azure OpenAI',
			bedrock: 'Amazon Bedrock',
			google: 'Google Gemini',
			openrouter: 'OpenRouter',
			ollama: 'Ollama (local)',
			lmstudio: 'LM Studio (local)',
			deepseek: 'DeepSeek',
			mistral: 'Mistral',
			groq: 'Groq',
			cerebras: 'Cerebras',
			together: 'Together AI',
			fireworks: 'Fireworks AI',
		};

		// One-line taglines for the settings provider list. Mirror the
		// model menu so users at-a-glance see what each provider gives them.
		const PROVIDER_TAGLINES = {
			anthropic: 'Claude Opus, Sonnet, Haiku — direct API or Claude Code subscription.',
			openai: 'GPT-5, GPT-4.1, GPT-4o, o1/o3/o4 reasoning families. Or sign in via Codex CLI.',
			foundry: 'Azure-hosted GPT, Claude, Mistral, Llama, Phi deployments.',
			bedrock: 'AWS-hosted Claude, Llama, Mistral, Cohere, Nova.',
			google: 'Gemini 2.5/2.0/1.5 Pro and Flash families.',
			openrouter: 'Single API key, hundreds of upstream models.',
			ollama: 'Local llama.cpp server. Offline / privacy-friendly.',
			lmstudio: 'Local model server with a friendly UI.',
			deepseek: 'DeepSeek V3 + R1 — frontier-class open weights at deep discount.',
			mistral: 'Mistral Large/Small, Codestral, Pixtral vision.',
			groq: 'LPU-accelerated, very fast Llama / Mixtral / DeepSeek inference.',
			cerebras: 'Wafer-scale, fastest single-stream throughput.',
			together: 'Llama 405B, Qwen Coder, Mixtral 8x22B, plus 100+ open models.',
			fireworks: 'Llama 405B, DeepSeek V3, Qwen Coder, plus user fine-tunes.',
		};

		// Brand glyph + colour mapping. The glyph string lives in CSS via
		// `.provider-card-icon-<id>`, so we just reuse those classes here for
		// visual consistency with the empty-state Connect cards.
		const PROVIDER_GLYPHS = {
			anthropic: 'A',
			openai: 'O',
			foundry: '⌬', // benzene glyph (matches empty-state Connect card)
			bedrock: 'aws',
			google: 'G',
			openrouter: 'OR',
			ollama: 'Ol',
			lmstudio: 'LS',
			deepseek: 'DS',
			mistral: 'Mi',
			groq: 'Gq',
			cerebras: 'Cb',
			together: 'Tg',
			fireworks: 'Fw',
		};

		const PROVIDER_HELP = {
			anthropic: { url: 'https://console.anthropic.com/settings/keys', label: 'console.anthropic.com' },
			openai: { url: 'https://platform.openai.com/api-keys', label: 'platform.openai.com' },
			foundry: { url: 'https://portal.azure.com/#browse/Microsoft.CognitiveServices%2Faccounts', label: 'the Azure portal' },
			bedrock: { url: 'https://console.aws.amazon.com/bedrock/', label: 'console.aws.amazon.com' },
			google: { url: 'https://aistudio.google.com/apikey', label: 'aistudio.google.com' },
			openrouter: { url: 'https://openrouter.ai/keys', label: 'openrouter.ai/keys' },
			ollama: { url: 'https://ollama.com/download', label: 'ollama.com' },
			lmstudio: { url: 'https://lmstudio.ai/', label: 'lmstudio.ai' },
			deepseek: { url: 'https://platform.deepseek.com/api_keys', label: 'platform.deepseek.com' },
			mistral: { url: 'https://console.mistral.ai/api-keys/', label: 'console.mistral.ai' },
			groq: { url: 'https://console.groq.com/keys', label: 'console.groq.com' },
			cerebras: { url: 'https://cloud.cerebras.ai/platform/', label: 'cloud.cerebras.ai' },
			together: { url: 'https://api.together.xyz/settings/api-keys', label: 'api.together.xyz' },
			fireworks: { url: 'https://fireworks.ai/api-keys', label: 'fireworks.ai' },
		};

		const BEDROCK_REGIONS = [
			'us-east-1',
			'us-east-2',
			'us-west-2',
			'eu-west-1',
			'eu-west-2',
			'eu-west-3',
			'eu-central-1',
			'ap-northeast-1',
			'ap-southeast-1',
			'ap-southeast-2',
		];

		// Cache of saved profiles keyed by provider id ('foundry', 'bedrock',
		// 'google'). Populated on every providerProfiles message from the host.
		// `null` means "not yet loaded"; an empty object means "no saved
		// profiles". Drives the list-view / single-form swap inside the
		// management UI.
		const PROVIDER_PROFILES = { foundry: null, bedrock: null, google: null };
		// `'list'` renders the saved-profile list with an "Add new" button;
		// `'form'` renders the existing single-form view (optionally prefilled
		// for editing). Single-credential providers (anthropic, openai) skip
		// the list state entirely and always render `'form'`.
		let providerFormView = 'form';
		let providerFormPrefill = null;

		/**
		 * Render the inline provider form for the given id into the slot in
		 * the empty-state. Replaces the card grid in place — the user feels
		 * they never left the chat.
		 *
		 * For multi-deployment providers (foundry, bedrock, google) this
		 * defaults to a list view of saved profiles when the cache is
		 * non-empty; the user clicks "Add new" or "Edit" to drop into the
		 * single-credential form.
		 */
		function showProviderForm(provider, opts) {
			if (!emptyStateProviders || !providerFormHost || !emptyState) return;
			// updateEmptyState() may have set display:none on the parent
			// because the user has scrollback; force it visible while the
			// inline form is open so the form is actually seen.
			emptyState.style.display = '';
			emptyStateProviders.hidden = true;
			providerFormHost.hidden = false;
			providerFormView = (opts && opts.view) || 'auto';
			providerFormPrefill = (opts && opts.prefill) || null;
			renderActiveProviderView(provider);
			// Multi-deployment providers fetch fresh profiles whenever the
			// view opens so a save/delete from another window is reflected
			// in the list.
			if (provider === 'foundry' || provider === 'bedrock' || provider === 'google') {
				vscode.postMessage({ type: 'requestProviderProfiles', provider: provider });
			}
		}

		function renderActiveProviderView(provider) {
			const isMulti = provider === 'foundry' || provider === 'bedrock' || provider === 'google';
			const cached = PROVIDER_PROFILES[provider];
			const hasProfiles = cached && Object.keys(cached).length > 0;
			let view = providerFormView;
			if (view === 'auto') {
				view = isMulti && hasProfiles ? 'list' : 'form';
			}
			providerFormView = view;
			if (view === 'list' && isMulti) {
				providerFormHost.innerHTML = renderProviderProfileList(provider, cached || {});
				bindProviderProfileList(provider);
				return;
			}
			providerFormHost.innerHTML = renderProviderForm(provider, providerFormPrefill);
			bindProviderForm(provider);
		}

		function hideProviderForm() {
			if (!emptyStateProviders || !providerFormHost) return;
			providerFormHost.hidden = true;
			providerFormHost.innerHTML = '';
			emptyStateProviders.hidden = false;
			// If the form was opened from the settings view, return there.
			if (providerFormOrigin === 'settings') {
				providerFormOrigin = 'empty-state';
				updateEmptyState();
				selectTab('settings');
				return;
			}
			// Form opened from the empty-state — restore the empty-state
			// to whatever scrollback presence dictates so a user with
			// existing messages doesn't get stuck on a card grid.
			updateEmptyState();
			providerFormOrigin = 'empty-state';
		}

		function renderProviderForm(provider, prefill) {
			const help = PROVIDER_HELP[provider] || { url: '#', label: 'the provider docs' };
			const fieldsHtml = renderProviderFields(provider, prefill || {});
			const advancedHtml = renderProviderAdvancedFields(provider, prefill || {});
			const isMulti = provider === 'foundry' || provider === 'bedrock' || provider === 'google';
			const cached = PROVIDER_PROFILES[provider];
			const hasProfiles = cached && Object.keys(cached).length > 0;
			const editing = Boolean(prefill && prefill.profileName);
			const titleVerb = editing ? 'Edit' : 'Connect to';
			const profileSuffix = editing ? ' · ' + escapeHtml(prefill.profileName) : '';
			// Show the "Manage saved" link only when the cache has at least
			// one entry — otherwise the list view is empty and confusing.
			const manageLink = isMulti && hasProfiles
				? '<button class="provider-form-back" type="button" data-action="manage-list">← Manage saved deployments</button>'
				: '<button class="provider-form-back" type="button" data-action="back">← Back</button>';
			// Phase 3 — collapsible Advanced section, only emitted when the
			// provider has any advanced fields to declare.
			const advancedBlock = advancedHtml
				? '<details class="provider-form-advanced">'
					+ '<summary>Advanced</summary>'
					+ advancedHtml
					+ '</details>'
				: '';
			return ''
				+ '<div class="provider-form" data-provider="' + escapeHtml(provider) + '"' + (editing ? ' data-edit-name="' + escapeHtml(prefill.profileName) + '"' : '') + '>'
				+ manageLink
				+ '<h3 class="provider-form-title">' + escapeHtml(titleVerb) + ' ' + escapeHtml(PROVIDER_LABELS[provider] || provider) + profileSuffix + '</h3>'
				+ '<p class="provider-form-help">Get your credentials from <a href="#" data-link="' + escapeHtml(help.url) + '">' + escapeHtml(help.label) + '</a>.</p>'
				+ fieldsHtml
				+ advancedBlock
				+ '<div class="provider-form-actions">'
				+ '<button class="provider-form-save primary" type="button" data-action="save">Save &amp; Validate</button>'
				+ '<button class="provider-form-test" type="button" data-action="test-connection">Test connection</button>'
				+ '<button class="provider-form-skip" type="button" data-action="back">I\'ll do this later</button>'
				+ '</div>'
				+ '<div class="provider-form-status" data-form-status hidden></div>'
				+ '</div>';
		}

		/**
		 * Phase 3 — per-provider advanced fields surfaced inside a collapsible
		 * <details> block. Returns '' when the provider has nothing extra to
		 * declare (we never render the wrapper in that case).
		 *
		 * Field names align with the new sota.* config keys so the host's
		 * persistProviderCredentials path can persist them with no extra
		 * dispatch — see providerCredentialSaver.ts.
		 */
		function renderProviderAdvancedFields(provider, prefill) {
			const v = prefill || {};
			switch (provider) {
				case 'anthropic':
					return inputField('baseUrl', 'Base URL (optional)', 'text', 'https://api.anthropic.com', v.baseUrl)
						+ inputField('customHeaders', 'Custom headers (optional, JSON)', 'text', '{"Helix-Tenant": "..."}', v.customHeaders);
				case 'openai':
					return inputField('baseUrl', 'Base URL (optional)', 'text', 'https://api.openai.com/v1', v.baseUrl)
						+ inputField('orgId', 'Organisation ID (optional)', 'text', 'org-...', v.orgId)
						+ inputField('customHeaders', 'Custom headers (optional, JSON)', 'text', '{"X-Trace": "..."}', v.customHeaders);
				case 'foundry':
					return inputField('customHeaders', 'Custom headers (optional, JSON)', 'text', '{"X-MS-Internal": "..."}', v.customHeaders);
				case 'bedrock':
					return inputField('endpointUrl', 'Endpoint URL override (optional)', 'text', 'https://bedrock-runtime.<region>.amazonaws.com', v.endpointUrl);
				case 'google':
					return inputField('projectId', 'GCP project ID (Vertex, optional)', 'text', 'my-project-id', v.projectId)
						+ inputField('location', 'Location / region (Vertex, optional)', 'text', 'us-central1', v.location);
				case 'openrouter':
					return inputField('customHeaders', 'Custom headers (optional, JSON)', 'text', '{"X-OpenRouter-Trace": "..."}', v.customHeaders);
				case 'ollama':
					return inputField('customHeaders', 'Custom headers (optional, JSON)', 'text', '{}', v.customHeaders);
				case 'lmstudio':
					return inputField('customHeaders', 'Custom headers (optional, JSON)', 'text', '{}', v.customHeaders);
				case 'deepseek':
				case 'mistral':
				case 'groq':
				case 'cerebras':
					return inputField('customHeaders', 'Custom headers (optional, JSON)', 'text', '{}', v.customHeaders);
				case 'together':
					return inputField('customModel', 'Custom model id (optional, used by together-custom)', 'text', 'meta-llama/Meta-Llama-3.1-405B-Instruct-Turbo', v.customModel)
						+ inputField('customHeaders', 'Custom headers (optional, JSON)', 'text', '{}', v.customHeaders);
				case 'fireworks':
					return inputField('customModel', 'Custom model slug (optional, used by fireworks-custom)', 'text', 'accounts/fireworks/models/llama-v3p1-405b-instruct', v.customModel)
						+ inputField('customHeaders', 'Custom headers (optional, JSON)', 'text', '{}', v.customHeaders);
				default:
					return '';
			}
		}

		function renderProviderFields(provider, prefill) {
			const v = prefill || {};
			switch (provider) {
				case 'anthropic':
					return ''
						+ '<div class="provider-form-option-group">'
						+ '<div class="provider-form-option provider-form-option-recommended">'
						+ '<div class="provider-form-option-head">'
						+ '<span class="provider-form-option-title">Sign in with Claude Code</span>'
						+ '<span class="provider-form-option-tag">Recommended</span>'
						+ '</div>'
						+ '<p class="provider-form-option-body">Use your existing Claude Code subscription — no API key required. Requires the <code>claude</code> CLI installed locally and signed in. <a href="#" data-link="https://docs.anthropic.com/en/docs/claude-code">Install Claude Code →</a></p>'
						+ '<button class="provider-form-option-action" type="button" data-action="connect-claude-code">Connect via Claude Code</button>'
						+ '</div>'
						+ '<div class="provider-form-option-divider"><span>or</span></div>'
						+ '<div class="provider-form-option">'
						+ '<div class="provider-form-option-head">'
						+ '<span class="provider-form-option-title">Use a direct API key</span>'
						+ '</div>'
						+ '<p class="provider-form-option-body">Pay-as-you-go via the Anthropic API. Best for heavy usage or when you don\'t have a Claude Code subscription.</p>'
						+ inputField('apiKey', 'API Key', 'password', 'sk-ant-...')
						+ '</div>'
						+ '</div>';
				case 'openai':
					return inputField('apiKey', 'API Key', 'password', 'sk-...');
				case 'foundry':
					return profileNameField(v.profileName)
						+ inputField('endpoint', 'Endpoint URL', 'text', 'https://my-resource.openai.azure.com', v.endpoint)
						+ inputField('apiKey', 'API Key', 'password', 'paste from Azure portal')
						+ inputField('deployment', 'Deployment name', 'text', 'e.g. gpt-4o-mini', v.deployment)
						+ inputField('apiVersion', 'API version (optional)', 'text', '2024-10-01-preview', v.apiVersion);
				case 'bedrock':
					return profileNameField(v.profileName)
						+ selectField('region', 'Region', BEDROCK_REGIONS, v.region || 'us-east-1')
						+ inputField('profile', 'AWS Profile (optional)', 'text', 'leave blank to use access keys', v.profile)
						+ inputField('accessKeyId', 'Access Key ID', 'password', 'AKIA...')
						+ inputField('secretAccessKey', 'Secret Access Key', 'password', '...')
						+ inputField('sessionToken', 'Session Token (optional)', 'password', 'for temporary STS credentials');
				case 'google':
					return profileNameField(v.profileName)
						+ inputField('apiKey', 'API Key', 'password', 'AIza...')
						+ inputField('project', 'Project (optional)', 'text', 'GCP project id (only for paid Vertex projects)', v.project);
				case 'openrouter':
					return inputField('apiKey', 'API Key', 'password', 'sk-or-v1-...');
				case 'ollama':
					// Ollama runs locally; no key required. Pre-fill the
					// canonical local URL so the user can hit Save without
					// thinking about ports.
					return ollamaTagsHostHtml()
						+ inputField('baseUrl', 'Server URL', 'text', 'http://localhost:11434', v.baseUrl || 'http://localhost:11434');
				case 'lmstudio':
					return inputField('baseUrl', 'Server URL', 'text', 'http://localhost:1234', v.baseUrl || 'http://localhost:1234')
						+ inputField('apiKey', 'API Key (optional)', 'password', '');
				default:
					return '';
			}
		}

		/**
		 * Inline list area for `GET /api/tags` results. Populated by
		 * `populateOllamaTags` after the form renders so the user sees their
		 * locally-installed models without leaving the form. Empty container
		 * keeps DOM stable so JS doesn't have to insert it later.
		 */
		function ollamaTagsHostHtml() {
			return ''
				+ '<div class="provider-form-tags-host" data-tags-host hidden>'
				+ '<div class="provider-form-tags-label">Locally installed models:</div>'
				+ '<div class="provider-form-tags" data-tags-list></div>'
				+ '</div>';
		}

		/**
		 * Display name field used by foundry / bedrock / google when adding a
		 * named profile. Defaults to "default" so the first time a user
		 * connects they don't need to think about names.
		 */
		function profileNameField(value) {
			return inputField('profileName', 'Display name', 'text', 'default', value || 'default');
		}

		function inputField(name, label, type, placeholder, value) {
			const id = 'fld-' + name;
			const v = value == null ? '' : String(value);
			return ''
				+ '<label class="provider-form-label" for="' + id + '">' + escapeHtml(label) + '</label>'
				+ '<input class="provider-form-input" id="' + id + '" name="' + escapeHtml(name) + '" type="' + escapeHtml(type) + '"'
				+ ' placeholder="' + escapeHtml(placeholder) + '" autocomplete="off" spellcheck="false" value="' + escapeHtml(v) + '" />';
		}

		function selectField(name, label, options, def) {
			const id = 'fld-' + name;
			const opts = options.map(o => '<option value="' + escapeHtml(o) + '"' + (o === def ? ' selected' : '') + '>' + escapeHtml(o) + '</option>').join('');
			return ''
				+ '<label class="provider-form-label" for="' + id + '">' + escapeHtml(label) + '</label>'
				+ '<select class="provider-form-input" id="' + id + '" name="' + escapeHtml(name) + '">' + opts + '</select>';
		}

		function renderProviderProfileList(provider, profiles) {
			const help = PROVIDER_HELP[provider] || { url: '#', label: 'the provider docs' };
			const names = Object.keys(profiles).sort();
			const rowsHtml = names.map((name) => {
				const entry = profiles[name] || {};
				const summary = formatProviderProfileSummary(provider, entry);
				return ''
					+ '<div class="provider-profile-row" data-profile-name="' + escapeHtml(name) + '">'
					+ '<div class="provider-profile-row-body">'
					+ '<span class="provider-profile-row-name">' + escapeHtml(name) + '</span>'
					+ '<span class="provider-profile-row-summary">' + escapeHtml(summary) + '</span>'
					+ '</div>'
					+ '<div class="provider-profile-row-actions">'
					+ '<button class="provider-profile-row-edit" type="button" data-action="edit-profile">Edit</button>'
					+ '<button class="provider-profile-row-delete" type="button" data-action="delete-profile">Delete</button>'
					+ '</div>'
					+ '</div>';
			}).join('');
			return ''
				+ '<div class="provider-form" data-provider="' + escapeHtml(provider) + '">'
				+ '<button class="provider-form-back" type="button" data-action="back">← Back</button>'
				+ '<h3 class="provider-form-title">Saved ' + escapeHtml(PROVIDER_LABELS[provider] || provider) + ' deployments</h3>'
				+ '<p class="provider-form-help">' + (names.length ? 'Click any deployment to edit its details.' : 'No saved deployments yet.') + ' Get credentials from <a href="#" data-link="' + escapeHtml(help.url) + '">' + escapeHtml(help.label) + '</a>.</p>'
				+ '<div class="provider-profile-list">' + rowsHtml + '</div>'
				+ '<div class="provider-form-actions">'
				+ '<button class="provider-form-save primary" type="button" data-action="add-profile">+ Add another deployment</button>'
				+ '</div>'
				+ '</div>';
		}

		function formatProviderProfileSummary(provider, entry) {
			if (!entry || typeof entry !== 'object') return '';
			if (provider === 'foundry') {
				const ep = entry.endpoint || '';
				const dp = entry.deployment || '';
				return (ep ? ep.replace(/^https?:\/\//, '') : '(no endpoint)') + (dp ? ' · ' + dp : '');
			}
			if (provider === 'bedrock') {
				const region = entry.region || '';
				const profile = entry.profile;
				return region + (profile ? ' · profile=' + profile : '');
			}
			if (provider === 'google') {
				const project = entry.project;
				return 'API key' + (project ? ' · ' + project : '');
			}
			return '';
		}

		function bindProviderProfileList(provider) {
			const root = providerFormHost.querySelector('.provider-form');
			if (!root) return;
			root.addEventListener('click', (ev) => {
				const target = ev.target;
				if (!(target instanceof HTMLElement)) return;
				const link = target.closest('a[data-link]');
				if (link) {
					ev.preventDefault();
					vscode.postMessage({ type: 'openLink', url: link.getAttribute('data-link') });
					return;
				}
				const action = target.getAttribute('data-action') || (target.closest('[data-action]') && target.closest('[data-action]').getAttribute('data-action'));
				if (action === 'back') {
					ev.preventDefault();
					hideProviderForm();
					return;
				}
				if (action === 'add-profile') {
					ev.preventDefault();
					providerFormView = 'form';
					providerFormPrefill = { profileName: '' };
					renderActiveProviderView(provider);
					return;
				}
				if (action === 'edit-profile') {
					ev.preventDefault();
					const row = target.closest('.provider-profile-row');
					if (!row) return;
					const name = row.getAttribute('data-profile-name') || '';
					const cached = PROVIDER_PROFILES[provider] || {};
					const entry = cached[name] || {};
					providerFormView = 'form';
					providerFormPrefill = Object.assign({ profileName: name }, entry);
					renderActiveProviderView(provider);
					return;
				}
				if (action === 'delete-profile') {
					ev.preventDefault();
					const row = target.closest('.provider-profile-row');
					if (!row) return;
					const name = row.getAttribute('data-profile-name') || '';
					if (!name) return;
					vscode.postMessage({ type: 'deleteProviderProfile', provider: provider, profileName: name });
					return;
				}
			});
		}

		function bindProviderForm(provider) {
			const root = providerFormHost.querySelector('.provider-form');
			if (!root) return;
			// On mount for the Ollama form, kick off a `GET /api/tags` against
			// the default base URL so the user sees their local model list
			// without clicking Test Connection. Defensive: any failure leaves
			// the inline list hidden — the user can still type a custom name.
			if (provider === 'ollama') {
				populateOllamaTags(root);
			}
			root.addEventListener('click', (ev) => {
				const target = ev.target;
				if (!(target instanceof HTMLElement)) return;
				const link = target.closest('a[data-link]');
				if (link) {
					ev.preventDefault();
					vscode.postMessage({ type: 'openLink', url: link.getAttribute('data-link') });
					return;
				}
				const action = target.getAttribute('data-action') || (target.closest('[data-action]') && target.closest('[data-action]').getAttribute('data-action'));
				if (action === 'back') {
					ev.preventDefault();
					hideProviderForm();
					return;
				}
				if (action === 'manage-list') {
					ev.preventDefault();
					providerFormView = 'list';
					providerFormPrefill = null;
					renderActiveProviderView(provider);
					return;
				}
				if (action === 'save') {
					ev.preventDefault();
					submitProviderForm(provider);
					return;
				}
				if (action === 'test-connection') {
					ev.preventDefault();
					testProviderConnection(provider);
					return;
				}
				if (action === 'connect-claude-code') {
					ev.preventDefault();
					vscode.postMessage({ type: 'connectClaudeCode' });
					return;
				}
			});
			root.addEventListener('keydown', (ev) => {
				if (ev.key === 'Enter' && !(ev.target && ev.target.tagName === 'TEXTAREA')) {
					ev.preventDefault();
					submitProviderForm(provider);
				}
			});
		}

		function submitProviderForm(provider) {
			const root = providerFormHost.querySelector('.provider-form');
			if (!root) return;
			const fields = {};
			root.querySelectorAll('input,select').forEach((el) => {
				const name = el.getAttribute('name');
				if (!name) return;
				fields[name] = String(el.value == null ? '' : el.value);
			});
			const status = root.querySelector('[data-form-status]');
			if (status) {
				status.hidden = false;
				status.className = 'provider-form-status pending';
				status.textContent = 'Saving and validating…';
			}
			const saveBtn = root.querySelector('[data-action="save"]');
			if (saveBtn) saveBtn.setAttribute('disabled', 'disabled');
			vscode.postMessage({ type: 'providerSave', provider: provider, fields: fields });
		}

		/**
		 * Phase 3 — fire a tiny smoke request through the provider WITHOUT
		 * writing anything to settings or the secret store. The host owns the
		 * actual ping (see ChatPanel.handleProviderTest); we just collect the
		 * fields, show a pending pill, and surface ✓ / ✗ inline.
		 */
		function testProviderConnection(provider) {
			const root = providerFormHost.querySelector('.provider-form');
			if (!root) return;
			const fields = {};
			root.querySelectorAll('input,select').forEach((el) => {
				const name = el.getAttribute('name');
				if (!name) return;
				fields[name] = String(el.value == null ? '' : el.value);
			});
			const status = root.querySelector('[data-form-status]');
			if (status) {
				status.hidden = false;
				status.className = 'provider-form-status pending';
				status.textContent = 'Pinging provider…';
			}
			const testBtn = root.querySelector('[data-action="test-connection"]');
			if (testBtn) testBtn.setAttribute('disabled', 'disabled');
			vscode.postMessage({ type: 'providerTest', provider: provider, fields: fields });
		}

		/**
		 * Fetch `GET /api/tags` from the Ollama server URL the form is
		 * pointing at and render any returned model names as clickable chips.
		 * The user can click a chip to drop the name into a custom-model
		 * field — but for the Connect-form path the primary use is just
		 * showing "yes, your server is up and these are your models" so the
		 * user gains confidence before clicking Save.
		 *
		 * Defensive: this is a best-effort UX nudge; failures are silent so a
		 * dead daemon doesn't show a scary error before the user has even
		 * tried to save.
		 */
		function populateOllamaTags(root) {
			const baseUrlInput = root.querySelector('input[name="baseUrl"]');
			const baseUrl = (baseUrlInput && baseUrlInput.value && baseUrlInput.value.trim()) || 'http://localhost:11434';
			const url = baseUrl.replace(/\/+$/, '') + '/api/tags';
			const host = root.querySelector('[data-tags-host]');
			const list = root.querySelector('[data-tags-list]');
			if (!host || !list) return;
			fetch(url, { headers: { Accept: 'application/json' } })
				.then(r => r.ok ? r.json() : null)
				.then(json => {
					if (!json || !Array.isArray(json.models)) return;
					const names = json.models
						.map(m => (m && typeof m.name === 'string' ? m.name : ''))
						.filter(n => n.length > 0);
					if (names.length === 0) return;
					list.innerHTML = names.map(n => '<span class="provider-form-tag">' + escapeHtml(n) + '</span>').join('');
					host.hidden = false;
				})
				.catch(() => { /* silent — server probably not running yet */ });
		}

		function applyProviderTestResult(message) {
			const root = providerFormHost ? providerFormHost.querySelector('.provider-form') : null;
			if (!root || root.getAttribute('data-provider') !== message.provider) {
				return;
			}
			const status = root.querySelector('[data-form-status]');
			const testBtn = root.querySelector('[data-action="test-connection"]');
			if (testBtn) testBtn.removeAttribute('disabled');
			if (!status) return;
			status.hidden = false;
			if (message.ok) {
				status.className = 'provider-form-status ok';
				status.textContent = '✓ ' + (message.message || 'OK');
			} else {
				status.className = 'provider-form-status err';
				status.textContent = '✗ ' + (message.message || 'Connection failed');
			}
		}

		/**
		 * Cache the saved-profile map sent from the host. Re-renders the
		 * active form when the cache update affects whichever provider's
		 * form is currently open — this is what flips the user back to the
		 * list view after a successful add or delete.
		 */
		function applyProviderProfiles(message) {
			if (message.provider) {
				if (message.provider in PROVIDER_PROFILES) {
					PROVIDER_PROFILES[message.provider] = message.profiles && typeof message.profiles === 'object' ? message.profiles : {};
				}
			} else if (message.profiles && typeof message.profiles === 'object') {
				if (message.profiles.foundry) PROVIDER_PROFILES.foundry = message.profiles.foundry;
				if (message.profiles.bedrock) PROVIDER_PROFILES.bedrock = message.profiles.bedrock;
				if (message.profiles.google) PROVIDER_PROFILES.google = message.profiles.google;
			}
			// Re-render only when the open form is for a multi-deployment
			// provider; otherwise leave the active surface alone (e.g. user
			// is on the OpenAI form when a Foundry profile delete arrives).
			const root = providerFormHost ? providerFormHost.querySelector('.provider-form') : null;
			if (!root) return;
			const openProvider = root.getAttribute('data-provider');
			if (openProvider && (openProvider === 'foundry' || openProvider === 'bedrock' || openProvider === 'google')) {
				if (!message.provider || message.provider === openProvider) {
					renderActiveProviderView(openProvider);
				}
			}
		}

		function applyProviderSaveResult(message) {
			const root = providerFormHost ? providerFormHost.querySelector('.provider-form') : null;
			if (!root || root.getAttribute('data-provider') !== message.provider) {
				// Form already closed (rare race) — refresh status and bail.
				return;
			}
			const status = root.querySelector('[data-form-status]');
			const saveBtn = root.querySelector('[data-action="save"]');
			if (saveBtn) saveBtn.removeAttribute('disabled');
			if (!status) return;
			status.hidden = false;
			const isMulti = message.provider === 'foundry' || message.provider === 'bedrock' || message.provider === 'google';
			// After a successful save on a multi-deployment provider, refresh
			// the saved-profile cache. The host echoes a `providerProfiles`
			// message which re-renders the list view automatically.
			if (message.ok && isMulti) {
				vscode.postMessage({ type: 'requestProviderProfiles', provider: message.provider });
			}
			if (message.ok && message.deferred) {
				status.className = 'provider-form-status deferred';
				status.textContent = message.message || 'Saved. Will validate on first request.';
				if (isMulti) {
					providerFormView = 'list';
					providerFormPrefill = null;
					setTimeout(() => { renderActiveProviderView(message.provider); }, 1500);
				} else {
					setTimeout(() => { hideProviderForm(); }, 1500);
				}
				return;
			}
			if (message.ok) {
				status.className = 'provider-form-status ok';
				if (isMulti) {
					status.textContent = 'Saved. Returning to list…';
					providerFormView = 'list';
					providerFormPrefill = null;
					setTimeout(() => { renderActiveProviderView(message.provider); }, 1200);
				} else {
					status.textContent = 'Connected. Closing in 2s…';
					setTimeout(() => { hideProviderForm(); }, 2000);
				}
				return;
			}
			status.className = 'provider-form-status err';
			status.textContent = 'Validation failed: ' + (message.message || 'Unknown error');
		}

		// Card click — open the inline form for the selected provider.
		document.querySelectorAll('.provider-card').forEach((card) => {
			card.addEventListener('click', () => {
				const provider = card.getAttribute('data-provider');
				if (!provider) return;
				showProviderForm(provider);
			});
		});

		if (emptyStateSettingsLink) {
			emptyStateSettingsLink.addEventListener('click', () => {
				openChatSettings();
			});
		}

		// --- Inline settings view ---

		const SETTINGS_PROVIDER_ORDER = ['anthropic', 'openai', 'foundry', 'bedrock', 'google', 'openrouter', 'ollama', 'lmstudio'];

		function renderSettingsProviderCards(flags) {
			if (!settingsProviders) return;
			const safe = flags || window.__SOTA_PROVIDER_FLAGS || {};
			settingsProviders.innerHTML = SETTINGS_PROVIDER_ORDER.map((id) => {
				const ok = Boolean(safe[id]);
				const label = PROVIDER_LABELS[id] || id;
				const tagline = PROVIDER_TAGLINES[id] || '';
				const glyph = PROVIDER_GLYPHS[id] || id.charAt(0).toUpperCase();
				// "Connected" = currently usable for the active model. We keep
				// a single state today (any present credential = connected) but
				// the badge class "configured" is reserved for a near-future
				// "saved but not active" distinction; both render green.
				const statusText = ok ? 'Connected' : 'Not configured';
				const statusClass = ok ? 'connected' : 'not-configured';
				const checkIcon = ok ? '<svg viewBox="0 0 12 12" width="10" height="10" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 6.5l2.5 2.5L10 3.5"/></svg>' : '';
				return ''
					+ '<button class="settings-provider-mini" type="button" data-settings-provider="' + escapeHtml(id) + '">'
					+ '<span class="settings-provider-mini-glyph provider-card-icon-' + escapeHtml(id) + '" aria-hidden="true">' + escapeHtml(glyph) + '</span>'
					+ '<span class="settings-provider-mini-body">'
					+ '<span class="settings-provider-mini-name">' + escapeHtml(label) + '</span>'
					+ (tagline ? '<span class="settings-provider-mini-tagline">' + escapeHtml(tagline) + '</span>' : '')
					+ '</span>'
					+ '<span class="settings-provider-mini-status ' + statusClass + '">' + checkIcon + escapeHtml(statusText) + '</span>'
					+ '<svg class="settings-provider-mini-chevron" viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 4l4 4-4 4"/></svg>'
					+ '</button>';
			}).join('');
			settingsProviders.querySelectorAll('[data-settings-provider]').forEach((btn) => {
				btn.addEventListener('click', () => {
					const id = btn.getAttribute('data-settings-provider');
					if (!id) return;
					// Switch to the Chat tab so the existing provider-form
					// host (which lives inside the empty-state) is visible,
					// and remember we came from Settings so the Back button
					// returns the user to the Settings tab.
					providerFormOrigin = 'settings';
					selectTab('chat');
					if (emptyState) {
						emptyState.hidden = false;
						emptyState.style.display = '';
					}
					if (emptyStateAuth) emptyStateAuth.hidden = false;
					if (emptyStateReady) emptyStateReady.hidden = true;
					showProviderForm(id);
				});
			});
		}

		// With the tab bar in place, "open settings" simply switches to the
		// Settings tab — the pane stays mounted in the DOM so we don't need
		// to swap message-list children around. The function name is kept so
		// existing call sites (the auth-gate "Open settings" link, the
		// gear-button click) don't have to change.
		function openChatSettings() {
			selectTab('settings');
			renderSettingsProviderCards(window.__SOTA_PROVIDER_FLAGS || {});
			vscode.postMessage({ type: 'requestSettings' });
			// Always close any MCP form left open from a previous visit so the
			// user lands on the list — we never re-hydrate stale form state.
			closeMcpServerForm();
			vscode.postMessage({ type: 'requestMcpServers' });
		}

		// Programmatic transitions (e.g. "Saved" → return to the chat) used to
		// hide the settings view. With the tab bar they simply switch back to
		// the Chat tab. Kept as a function so the inline provider/MCP form
		// completion handlers don't need to know about tab plumbing.
		function closeChatSettings() {
			selectTab('chat');
		}

		if (settingsBtn) {
			settingsBtn.addEventListener('click', () => {
				if (currentTab === 'settings') {
					selectTab('chat');
				} else {
					openChatSettings();
				}
			});
		}

		if (chatSettingsView) {
			chatSettingsView.addEventListener('click', (ev) => {
				const target = ev.target;
				if (!(target instanceof HTMLElement)) return;
				// Sub-tab nav (Phase 2). Switch the active pane before falling
				// through to MCP / link handlers so users can scope their
				// click to the visible section.
				const subtabBtn = target.closest('.settings-subtab');
				if (subtabBtn instanceof HTMLElement) {
					const tabId = subtabBtn.getAttribute('data-subtab');
					if (tabId) {
						setActiveSettingsSubtab(tabId);
					}
					return;
				}
				// Delegate MCP server actions first so the Add / Edit / Delete /
				// Back / Save / Cancel buttons inside the MCP section don't fall
				// through to the generic settings handlers below.
				const mcpScope = target.closest('#settingsMcpServers');
				if (mcpScope && handleMcpServersClick(ev)) {
					return;
				}
				const action = target.getAttribute('data-action') || (target.closest('[data-action]') && target.closest('[data-action]').getAttribute('data-action'));
				if (action === 'open-settings-json') {
					ev.preventDefault();
					const id = target.getAttribute('data-setting-id') || (target.closest('[data-setting-id]') && target.closest('[data-setting-id]').getAttribute('data-setting-id'));
					if (id) {
						vscode.postMessage({ type: 'openSettingsJson', settingId: id });
					}
					return;
				}
				if (action === 'open-link') {
					ev.preventDefault();
					const link = target.getAttribute('data-link') || (target.closest('[data-link]') && target.closest('[data-link]').getAttribute('data-link'));
					if (link) {
						vscode.postMessage({ type: 'openLink', url: link });
					}
					return;
				}
				if (action === 'reset-all-settings') {
					ev.preventDefault();
					// Cheap modal — host won't act unless confirm() returns
					// true. Avoids inventing a custom confirmation modal for
					// a destructive-but-revertible action.
					const ok = window.confirm('Reset every Son of Anton toggle, slider, and dropdown back to its default? Provider keys will be preserved.');
					if (ok) {
						vscode.postMessage({ type: 'resetAllSettings' });
					}
					return;
				}
			});
			// Boolean toggles.
			chatSettingsView.querySelectorAll('input[type="checkbox"][data-setting]').forEach((input) => {
				input.addEventListener('change', () => {
					const id = input.getAttribute('data-setting');
					if (!id) return;
					vscode.postMessage({ type: 'settingChange', settingId: id, value: Boolean(input.checked) });
				});
			});
			// String dropdowns (data-setting-select).
			chatSettingsView.querySelectorAll('select[data-setting-select]').forEach((select) => {
				select.addEventListener('change', () => {
					const id = select.getAttribute('data-setting-select');
					if (!id) return;
					vscode.postMessage({ type: 'settingChange', settingId: id, value: String(select.value || '') });
				});
			});
			// Numeric sliders (data-setting-number). Mirror the value into the
			// adjacent .settings-slider-value span for live readout.
			chatSettingsView.querySelectorAll('input[type="range"][data-setting-number]').forEach((slider) => {
				const updateLabel = () => {
					const label = slider.parentElement && slider.parentElement.querySelector('.settings-slider-value');
					if (label) label.textContent = String(slider.value);
				};
				slider.addEventListener('input', updateLabel);
				slider.addEventListener('change', () => {
					updateLabel();
					const id = slider.getAttribute('data-setting-number');
					if (!id) return;
					const num = Number(slider.value);
					if (Number.isFinite(num)) {
						vscode.postMessage({ type: 'settingChange', settingId: id, value: num });
					}
				});
			});
			// Phase 86 — numeric text inputs (data-setting-number-input) for
			// spend caps. Debounce on `change` (blur / Enter) rather than every
			// keystroke so we don't spam settings.json mid-typing.
			chatSettingsView.querySelectorAll('input[type="number"][data-setting-number-input]').forEach((input) => {
				input.addEventListener('change', () => {
					const id = input.getAttribute('data-setting-number-input');
					if (!id) return;
					const num = Number(input.value);
					if (Number.isFinite(num) && num >= 0) {
						vscode.postMessage({ type: 'settingChange', settingId: id, value: num });
					}
				});
			});
			// Phase 86 — textarea inputs (data-setting-text). Debounced on blur
			// so an in-progress regex doesn't trigger a write per keystroke.
			chatSettingsView.querySelectorAll('textarea[data-setting-text]').forEach((textarea) => {
				textarea.addEventListener('change', () => {
					const id = textarea.getAttribute('data-setting-text');
					if (!id) return;
					vscode.postMessage({ type: 'settingChange', settingId: id, value: String(textarea.value || '') });
				});
			});
			// Initial sub-tab attribute (default to 'api').
			setActiveSettingsSubtab(chatSettingsView.getAttribute('data-active-subtab') || 'api');
		}

		function setActiveSettingsSubtab(id) {
			if (!chatSettingsView) return;
			chatSettingsView.setAttribute('data-active-subtab', id);
			chatSettingsView.querySelectorAll('.settings-subtab').forEach((btn) => {
				const active = btn.getAttribute('data-subtab') === id;
				btn.classList.toggle('settings-subtab-active', active);
				btn.setAttribute('aria-selected', active ? 'true' : 'false');
			});
			chatSettingsView.querySelectorAll('.settings-subtab-pane').forEach((pane) => {
				pane.hidden = pane.getAttribute('data-subtab-pane') !== id;
			});
		}

		function applySettingsState(settings) {
			if (!chatSettingsView || !settings || typeof settings !== 'object') return;
			Object.keys(settings).forEach((id) => {
				const value = settings[id];
				const cb = chatSettingsView.querySelector('input[type="checkbox"][data-setting="' + id + '"]');
				if (cb) {
					cb.checked = Boolean(value);
					return;
				}
				const sel = chatSettingsView.querySelector('select[data-setting-select="' + id + '"]');
				if (sel && (typeof value === 'string' || typeof value === 'number')) {
					sel.value = String(value);
					return;
				}
				const slider = chatSettingsView.querySelector('input[type="range"][data-setting-number="' + id + '"]');
				if (slider && typeof value === 'number') {
					slider.value = String(value);
					const label = slider.parentElement && slider.parentElement.querySelector('.settings-slider-value');
					if (label) label.textContent = String(value);
					return;
				}
				// Phase 86 — populate textarea and numeric text inputs added
				// for the auto-approval / spend-cap panel.
				const numInput = chatSettingsView.querySelector('input[type="number"][data-setting-number-input="' + id + '"]');
				if (numInput && typeof value === 'number') {
					numInput.value = String(value);
					return;
				}
				const textarea = chatSettingsView.querySelector('textarea[data-setting-text="' + id + '"]');
				if (textarea && typeof value === 'string') {
					textarea.value = value;
					return;
				}
			});
		}

		// --- MCP servers (chat settings → MCP Servers section) ---

		// Latest server array received from the host. Stashed so the form's
		// "edit" path can hydrate fields without a second round-trip.
		let mcpServersCache = [];

		// Tracks the form's mode + the original name when editing, since the
		// user may rename a server and we still need to find the previous
		// entry in mcpServersCache for the diff hint.
		let mcpFormState = null; // { mode: 'add' | 'edit', originalName: string | null }

		/**
		 * Format a command + args summary for the row's secondary line.
		 * Truncates aggressively so a long "node /Users/.../server.js" stays
		 * inside the row width. Empty strings are silently dropped.
		 */
		function formatMcpCommandPreview(server) {
			if (!server || typeof server !== 'object') return '';
			const command = typeof server.command === 'string' ? server.command : '';
			const args = Array.isArray(server.args) ? server.args.filter((a) => typeof a === 'string') : [];
			const parts = command ? [command, ...args] : args;
			const joined = parts.join(' ');
			if (joined.length > 120) {
				return joined.slice(0, 117) + '...';
			}
			return joined;
		}

		function applyMcpServersState(servers) {
			if (!mcpServersList) return;
			mcpServersCache = Array.isArray(servers) ? servers : [];
			renderMcpServersList();
		}

		function renderMcpServersList() {
			if (!mcpServersList) return;
			mcpServersList.innerHTML = '';
			if (mcpServersCache.length === 0) {
				if (mcpServersEmpty) mcpServersEmpty.hidden = false;
				return;
			}
			if (mcpServersEmpty) mcpServersEmpty.hidden = true;
			mcpServersCache.forEach((server) => {
				if (!server || typeof server.name !== 'string') return;
				const row = document.createElement('div');
				row.className = 'mcp-server-row';
				row.setAttribute('data-server-name', server.name);
				const info = document.createElement('div');
				info.className = 'mcp-server-info';
				const nameEl = document.createElement('div');
				nameEl.className = 'mcp-server-name';
				nameEl.textContent = server.name;
				const cmdEl = document.createElement('div');
				cmdEl.className = 'mcp-server-command';
				cmdEl.textContent = formatMcpCommandPreview(server);
				info.appendChild(nameEl);
				info.appendChild(cmdEl);
				const actions = document.createElement('div');
				actions.className = 'mcp-server-actions';
				const editBtn = document.createElement('button');
				editBtn.type = 'button';
				editBtn.className = 'popover-item mcp-server-edit';
				editBtn.setAttribute('data-action', 'edit');
				editBtn.setAttribute('data-server-name', server.name);
				editBtn.textContent = 'Edit';
				const deleteBtn = document.createElement('button');
				deleteBtn.type = 'button';
				deleteBtn.className = 'popover-item mcp-server-delete';
				deleteBtn.setAttribute('data-action', 'delete');
				deleteBtn.setAttribute('data-server-name', server.name);
				deleteBtn.textContent = 'Delete';
				actions.appendChild(editBtn);
				actions.appendChild(deleteBtn);
				row.appendChild(info);
				row.appendChild(actions);
				mcpServersList.appendChild(row);
			});
		}

		/**
		 * Look up a server by name in the cached list. Used by the edit handler
		 * to hydrate the form fields without a host round-trip.
		 */
		function findMcpServer(name) {
			for (let i = 0; i < mcpServersCache.length; i++) {
				const s = mcpServersCache[i];
				if (s && typeof s.name === 'string' && s.name === name) {
					return s;
				}
			}
			return null;
		}

		function openMcpServerForm(mode, server) {
			if (!mcpServerFormHost || !mcpServersList) return;
			mcpFormState = { mode: mode, originalName: server ? server.name : null };
			const isEdit = mode === 'edit';
			const initial = server || { name: '', command: '', args: [], env: {}, cwd: '' };
			const argsText = Array.isArray(initial.args) ? initial.args.join('\n') : '';
			let envText = '';
			if (initial.env && typeof initial.env === 'object') {
				const lines = [];
				Object.keys(initial.env).forEach((k) => {
					if (typeof initial.env[k] === 'string') {
						lines.push(k + '=' + initial.env[k]);
					}
				});
				envText = lines.join('\n');
			}
			mcpServerFormHost.innerHTML = ''
				+ '<div class="mcp-server-form">'
				+ '<button class="mcp-server-form-back" type="button" data-action="back">← Back</button>'
				+ '<h4>' + (isEdit ? 'Edit MCP Server' : 'Add MCP Server') + '</h4>'
				+ '<label class="provider-form-label" for="mcpFld-name">Name</label>'
				+ '<input class="provider-form-input" id="mcpFld-name" data-field="name" type="text" placeholder="e.g. my-server" autocomplete="off" spellcheck="false" value="' + escapeHtml(typeof initial.name === 'string' ? initial.name : '') + '" />'
				+ '<p class="form-hint">Unique identifier. Used as the prefix in tool names: mcp__&lt;name&gt;__&lt;tool&gt;.</p>'
				+ '<label class="provider-form-label" for="mcpFld-command">Command</label>'
				+ '<input class="provider-form-input" id="mcpFld-command" data-field="command" type="text" placeholder="e.g. node, python, uvx" autocomplete="off" spellcheck="false" value="' + escapeHtml(typeof initial.command === 'string' ? initial.command : '') + '" />'
				+ '<p class="form-hint">Executable to spawn.</p>'
				+ '<label class="provider-form-label" for="mcpFld-args">Arguments</label>'
				+ '<textarea class="provider-form-input" id="mcpFld-args" data-field="args" rows="2" placeholder="One argument per line" spellcheck="false">' + escapeHtml(argsText) + '</textarea>'
				+ '<p class="form-hint">One argument per line. Empty if none.</p>'
				+ '<label class="provider-form-label" for="mcpFld-env">Environment Variables (optional)</label>'
				+ '<textarea class="provider-form-input" id="mcpFld-env" data-field="env" rows="3" placeholder="KEY=value, one per line" spellcheck="false">' + escapeHtml(envText) + '</textarea>'
				+ '<p class="form-hint">Format: KEY=value, one per line.</p>'
				+ '<label class="provider-form-label" for="mcpFld-cwd">Working Directory (optional)</label>'
				+ '<input class="provider-form-input" id="mcpFld-cwd" data-field="cwd" type="text" placeholder="Leave blank for workspace root" autocomplete="off" spellcheck="false" value="' + escapeHtml(typeof initial.cwd === 'string' ? initial.cwd : '') + '" />'
				+ '<div class="mcp-server-form-actions">'
				+ '<button class="primary" type="button" data-action="save">Save</button>'
				+ '<button type="button" data-action="cancel">Cancel</button>'
				+ '</div>'
				+ '<div class="mcp-server-form-status" data-status hidden></div>'
				+ '</div>';
			mcpServerFormHost.hidden = false;
			mcpServersList.hidden = true;
			if (mcpServersEmpty) mcpServersEmpty.hidden = true;
			const addBtn = chatSettingsView ? chatSettingsView.querySelector('.mcp-server-add') : null;
			if (addBtn) addBtn.hidden = true;
			const nameInput = mcpServerFormHost.querySelector('#mcpFld-name');
			if (nameInput && !isEdit) {
				try { nameInput.focus(); } catch (e) { /* ignore */ }
			}
		}

		function closeMcpServerForm() {
			if (!mcpServerFormHost || !mcpServersList) return;
			mcpServerFormHost.hidden = true;
			mcpServerFormHost.innerHTML = '';
			mcpServersList.hidden = false;
			if (mcpServersEmpty) {
				mcpServersEmpty.hidden = mcpServersCache.length > 0;
			}
			const addBtn = chatSettingsView ? chatSettingsView.querySelector('.mcp-server-add') : null;
			if (addBtn) addBtn.hidden = false;
			mcpFormState = null;
		}

		/**
		 * Parse the env textarea body into a string-to-string map. Empty lines
		 * and lines without an "=" are dropped — invalid pairs surface as a
		 * server-side validation error rather than a silent typo.
		 */
		function parseEnvText(text) {
			const out = {};
			if (typeof text !== 'string' || text.length === 0) return out;
			text.split(/\r?\n/).forEach((line) => {
				const trimmed = line.trim();
				if (!trimmed) return;
				const idx = trimmed.indexOf('=');
				if (idx <= 0) return;
				const key = trimmed.slice(0, idx).trim();
				const value = trimmed.slice(idx + 1);
				if (!key) return;
				out[key] = value;
			});
			return out;
		}

		function submitMcpServerForm() {
			if (!mcpServerFormHost || !mcpFormState) return;
			const root = mcpServerFormHost.querySelector('.mcp-server-form');
			if (!root) return;
			const name = (root.querySelector('[data-field="name"]') || {}).value || '';
			const command = (root.querySelector('[data-field="command"]') || {}).value || '';
			const argsText = (root.querySelector('[data-field="args"]') || {}).value || '';
			const envText = (root.querySelector('[data-field="env"]') || {}).value || '';
			const cwd = (root.querySelector('[data-field="cwd"]') || {}).value || '';
			const args = argsText.split(/\r?\n/).map((line) => line.trim()).filter((line) => line.length > 0);
			const env = parseEnvText(envText);
			const status = root.querySelector('[data-status]');
			if (status) {
				status.hidden = false;
				status.className = 'mcp-server-form-status pending';
				status.textContent = 'Saving…';
			}
			const saveBtn = root.querySelector('[data-action="save"]');
			if (saveBtn) saveBtn.setAttribute('disabled', 'disabled');
			vscode.postMessage({
				type: 'mcpServerSave',
				mode: mcpFormState.mode,
				server: {
					name: typeof name === 'string' ? name.trim() : '',
					command: typeof command === 'string' ? command.trim() : '',
					args: args,
					env: env,
					cwd: typeof cwd === 'string' ? cwd.trim() : '',
				},
			});
		}

		function applyMcpServerSaveResult(message) {
			if (!mcpServerFormHost || mcpServerFormHost.hidden) {
				return;
			}
			const root = mcpServerFormHost.querySelector('.mcp-server-form');
			if (!root) return;
			const status = root.querySelector('[data-status]');
			const saveBtn = root.querySelector('[data-action="save"]');
			if (saveBtn) saveBtn.removeAttribute('disabled');
			if (!status) return;
			status.hidden = false;
			if (message && message.ok) {
				status.className = 'mcp-server-form-status ok';
				status.textContent = message.message || 'Saved.';
				setTimeout(() => { closeMcpServerForm(); }, 1200);
				return;
			}
			status.className = 'mcp-server-form-status err';
			status.textContent = (message && message.message) ? message.message : 'Save failed.';
		}

		function handleMcpServersClick(ev) {
			const target = ev.target;
			if (!(target instanceof HTMLElement)) return false;
			const actionEl = target.closest('[data-action]');
			if (!actionEl) return false;
			const action = actionEl.getAttribute('data-action');
			if (action === 'add') {
				ev.preventDefault();
				openMcpServerForm('add', null);
				return true;
			}
			if (action === 'edit') {
				ev.preventDefault();
				const name = actionEl.getAttribute('data-server-name') || '';
				const server = findMcpServer(name);
				if (server) {
					openMcpServerForm('edit', server);
				}
				return true;
			}
			if (action === 'delete') {
				ev.preventDefault();
				const name = actionEl.getAttribute('data-server-name') || '';
				if (!name) return true;
				if (!window.confirm('Delete MCP server "' + name + '"?')) return true;
				vscode.postMessage({ type: 'mcpServerDelete', name: name });
				return true;
			}
			if (action === 'back' || action === 'cancel') {
				ev.preventDefault();
				closeMcpServerForm();
				return true;
			}
			if (action === 'save') {
				ev.preventDefault();
				submitMcpServerForm();
				return true;
			}
			return false;
		}

		// --- Cost meter (header) ---

		// Latest breakdown payload from the host. Stashed so the popover renders
		// from the same data the chip already paints — the host emits one
		// canonical message per change rather than two parallel updates.
		let lastCostBreakdown = [];

		/**
		 * Format an integer token count for the chip. Above 1k we drop to one
		 * decimal place so 12.3k tok stays compact; below 1k we render the
		 * exact count so a single test message reads truthfully.
		 */
		function formatTokenCount(total) {
			const value = Number(total) || 0;
			if (value >= 1000) {
				return (value / 1000).toFixed(1) + 'k tok';
			}
			return value + ' tok';
		}

		/**
		 * Format a dollar amount with the precision needed to read truthfully
		 * at small spend levels. Below $0.01 we keep four decimals so a
		 * single tiny request still shows a non-zero figure.
		 */
		function formatDollars(dollars) {
			const value = Number(dollars) || 0;
			if (value < 0.01) {
				return '$' + value.toFixed(4);
			}
			return '$' + value.toFixed(2);
		}

		function applyCostUpdate(message) {
			if (!hdrCost || !hdrCostTokens || !hdrCostDollars) {
				return;
			}
			const tokens = Number(message && message.tokens) || 0;
			const dollars = Number(message && message.dollars) || 0;
			const inputTokens = Number(message && message.inputTokens) || 0;
			const outputTokens = Number(message && message.outputTokens) || 0;
			lastCostBreakdown = Array.isArray(message && message.breakdown) ? message.breakdown : [];
			hdrCostTokens.textContent = formatTokenCount(tokens);
			hdrCostDollars.textContent = formatDollars(dollars);
			// Phase 66 — feed the sticky transcript meter from the same
			// cumulative source the chip uses. Split tokens into ↑/↓ so
			// the user can see how much of the spend was input vs output.
			updateTranscriptTaskMeter(inputTokens, outputTokens, dollars);
			// First update unhides the chip so the empty state never flashes
			// $0.00 before the first request lands.
			if (tokens > 0 || dollars > 0) {
				hdrCost.hidden = false;
			}
			// Refresh the popover body if it's currently open so the user
			// watches the breakdown update live during streaming.
			if (hdrCostPopover && !hdrCostPopover.hidden) {
				renderCostPopover();
			}
		}

		function applyCostReset() {
			if (!hdrCost || !hdrCostTokens || !hdrCostDollars) {
				return;
			}
			lastCostBreakdown = [];
			hdrCostTokens.textContent = '0 tok';
			hdrCostDollars.textContent = '$0.00';
			hdrCost.hidden = true;
			updateTranscriptTaskMeter(0, 0, 0);
			if (hdrCostPopover && !hdrCostPopover.hidden) {
				closeCostPopover();
			}
		}

		function setCostPulseActive(active) {
			if (!hdrCostPulse) {
				return;
			}
			hdrCostPulse.hidden = !active;
		}

		// Pinned active-task header (Phase 66). Shows specialist + truncated
		// user prompt + elapsed timer + Stop button while a turn is streaming
		// or an orchestrator subtask loop is dispatching. Hidden when idle.
		let activeTaskTickerId = null;
		let activeTaskStartedAt = null;

		function formatActiveTaskElapsed(seconds) {
			if (seconds < 60) {
				return seconds + 's';
			}
			const mins = Math.floor(seconds / 60);
			const secs = seconds % 60;
			return mins + 'm ' + secs + 's';
		}

		function showActiveTaskHeader(opts) {
			if (!messageList) {
				return;
			}
			const specialistId = (opts && opts.specialistId) || currentAgent;
			const userMessage = (opts && typeof opts.userMessage === 'string') ? opts.userMessage : (lastUserPrompt || '');
			const kind = (opts && opts.kind) || 'streaming';

			let header = document.getElementById('activeTaskHeader');
			if (!header) {
				header = document.createElement('div');
				header.className = 'active-task-header';
				header.id = 'activeTaskHeader';
				messageList.parentNode.insertBefore(header, messageList);
			}

			activeTaskStartedAt = Date.now();
			const persona = PERSONAS_BY_ID[specialistId] || {};
			const accent = persona.accent || 'var(--sota-fg-muted)';
			const monogram = persona.monogram || '?';
			const displayName = persona.displayName || specialistId;

			// Rebuild the header content from scratch — controlled inputs only,
			// no innerHTML for user-supplied text.
			header.textContent = '';

			const avatar = document.createElement('span');
			avatar.className = 'active-task-avatar';
			avatar.style.background = accent;
			avatar.textContent = monogram;
			header.appendChild(avatar);

			const meta = document.createElement('div');
			meta.className = 'active-task-meta';

			const nameEl = document.createElement('div');
			nameEl.className = 'active-task-name';
			nameEl.textContent = displayName + ' is working...';
			meta.appendChild(nameEl);

			const taskEl = document.createElement('div');
			taskEl.className = 'active-task-message';
			const trimmed = (userMessage || '').replace(/\s+/g, ' ').trim();
			taskEl.textContent = trimmed.length > 80 ? trimmed.slice(0, 80) + '…' : trimmed;
			if (trimmed) {
				taskEl.title = trimmed;
			}
			meta.appendChild(taskEl);

			header.appendChild(meta);

			const elapsed = document.createElement('span');
			elapsed.className = 'active-task-elapsed';
			elapsed.id = 'activeTaskElapsed';
			elapsed.textContent = '0s';
			header.appendChild(elapsed);

			const stopBtn = document.createElement('button');
			stopBtn.className = 'active-task-stop';
			stopBtn.title = 'Stop generating';
			stopBtn.setAttribute('aria-label', 'Stop generating');
			// Build the stop icon as SVG nodes (no innerHTML) so all DOM
			// content remains controlled — same approach as other inline icons.
			const SVG_NS = 'http://www.w3.org/2000/svg';
			const stopSvg = document.createElementNS(SVG_NS, 'svg');
			stopSvg.setAttribute('viewBox', '0 0 16 16');
			stopSvg.setAttribute('fill', 'currentColor');
			stopSvg.setAttribute('aria-hidden', 'true');
			const stopRect = document.createElementNS(SVG_NS, 'rect');
			stopRect.setAttribute('x', '4');
			stopRect.setAttribute('y', '4');
			stopRect.setAttribute('width', '8');
			stopRect.setAttribute('height', '8');
			stopRect.setAttribute('rx', '1');
			stopSvg.appendChild(stopRect);
			stopBtn.appendChild(stopSvg);
			stopBtn.addEventListener('click', () => {
				vscode.postMessage({ type: 'cancelRequest' });
			});
			header.appendChild(stopBtn);

			header.dataset.kind = kind;
			header.style.setProperty('--persona-accent', accent);

			if (activeTaskTickerId) {
				clearInterval(activeTaskTickerId);
			}
			activeTaskTickerId = setInterval(() => {
				if (activeTaskStartedAt === null) {
					return;
				}
				const seconds = Math.round((Date.now() - activeTaskStartedAt) / 1000);
				const elapsedEl = document.getElementById('activeTaskElapsed');
				if (elapsedEl) {
					elapsedEl.textContent = formatActiveTaskElapsed(seconds);
				}
			}, 1000);
		}

		function hideActiveTaskHeader() {
			const header = document.getElementById('activeTaskHeader');
			if (header) {
				header.remove();
			}
			if (activeTaskTickerId) {
				clearInterval(activeTaskTickerId);
				activeTaskTickerId = null;
			}
			activeTaskStartedAt = null;
		}

		// --- Phase 66 sticky transcript task header --------------------
		// Pinned at the top of the message-list scroll area. Shows the
		// most recent user prompt (truncated to 80 chars) on the left and
		// a live cumulative cost meter (Σ inputTokens↑ outputTokens↓ ·
		// $cost) on the right. Distinct from the transient streaming
		// `.active-task-header` above the message-list — different scope,
		// different visibility rules, intentionally separate IDs.
		function ensureTranscriptTaskHeader() {
			let header = document.getElementById('transcriptTaskHeader');
			if (header) {
				return header;
			}
			if (!messageList) {
				return null;
			}
			header = document.createElement('div');
			header.id = 'transcriptTaskHeader';
			header.className = 'transcript-task-header';
			header.hidden = true;

			const textEl = document.createElement('span');
			textEl.className = 'transcript-task-text';
			textEl.id = 'transcriptTaskText';
			textEl.setAttribute('role', 'button');
			textEl.setAttribute('tabindex', '0');
			textEl.title = 'Jump to the message that started this task';
			header.appendChild(textEl);

			const meterEl = document.createElement('span');
			meterEl.className = 'transcript-task-meter';
			meterEl.id = 'transcriptTaskMeter';
			meterEl.textContent = 'Σ 0↑ 0↓ · $0.00';
			header.appendChild(meterEl);

			messageList.insertBefore(header, messageList.firstChild);

			const jump = () => {
				const turnIndex = header.dataset.turnIndex;
				if (!turnIndex) {
					return;
				}
				const target = messageList.querySelector(
					'.msg-user[data-conversation-index="' + turnIndex + '"]'
				);
				if (!target) {
					return;
				}
				target.scrollIntoView({ behavior: 'smooth', block: 'start' });
				target.classList.add('subtask-flash');
				setTimeout(() => target.classList.remove('subtask-flash'), 1500);
			};
			textEl.addEventListener('click', jump);
			textEl.addEventListener('keydown', (e) => {
				if (e.key === 'Enter' || e.key === ' ') {
					e.preventDefault();
					jump();
				}
			});

			return header;
		}

		function updateTranscriptTaskHeader(turnIndex, rawText) {
			const header = ensureTranscriptTaskHeader();
			if (!header) {
				return;
			}
			const text = (rawText || '').toString();
			const firstLine = text.split('\n')[0].trim();
			const truncated = firstLine.length > 80
				? firstLine.slice(0, 80) + '…'
				: firstLine;
			const textEl = document.getElementById('transcriptTaskText');
			if (textEl) {
				textEl.textContent = truncated || '(empty prompt)';
			}
			if (typeof turnIndex === 'number' && Number.isFinite(turnIndex)) {
				header.dataset.turnIndex = String(turnIndex);
			} else {
				delete header.dataset.turnIndex;
			}
			header.hidden = false;
		}

		function updateTranscriptTaskMeter(inputTokens, outputTokens, dollars) {
			const meter = document.getElementById('transcriptTaskMeter');
			if (!meter) {
				return;
			}
			const input = Number(inputTokens) || 0;
			const output = Number(outputTokens) || 0;
			const cost = Number(dollars) || 0;
			const costStr = cost < 0.01 ? cost.toFixed(4) : cost.toFixed(2);
			meter.textContent = 'Σ ' + input + '↑ ' + output + '↓ · $' + costStr;
		}

		function hideTranscriptTaskHeader() {
			const header = document.getElementById('transcriptTaskHeader');
			if (header) {
				header.hidden = true;
				delete header.dataset.turnIndex;
			}
			updateTranscriptTaskMeter(0, 0, 0);
		}

		function renderCostPopover() {
			if (!hdrCostPopoverBody) {
				return;
			}
			hdrCostPopoverBody.textContent = '';
			if (!Array.isArray(lastCostBreakdown) || lastCostBreakdown.length === 0) {
				const empty = document.createElement('div');
				empty.className = 'hdr-cost-popover-empty';
				empty.textContent = 'No usage yet.';
				hdrCostPopoverBody.appendChild(empty);
				return;
			}
			let totalTokens = 0;
			let totalDollars = 0;
			for (const row of lastCostBreakdown) {
				if (!row || typeof row.model !== 'string') {
					continue;
				}
				const tokens = Number(row.tokens) || 0;
				const dollars = Number(row.dollars) || 0;
				totalTokens += tokens;
				totalDollars += dollars;
				const rowEl = document.createElement('div');
				rowEl.className = 'hdr-cost-popover-row';
				const label = document.createElement('span');
				label.className = 'hdr-cost-popover-label';
				label.textContent = MODEL_LABELS[row.model] || row.model;
				const value = document.createElement('span');
				value.className = 'hdr-cost-popover-value';
				value.textContent = formatTokenCount(tokens) + ' · ' + formatDollars(dollars);
				rowEl.appendChild(label);
				rowEl.appendChild(value);
				hdrCostPopoverBody.appendChild(rowEl);
			}
			const totalRow = document.createElement('div');
			totalRow.className = 'hdr-cost-popover-row hdr-cost-popover-total';
			const totalLabel = document.createElement('span');
			totalLabel.className = 'hdr-cost-popover-label';
			totalLabel.textContent = 'Total';
			const totalValue = document.createElement('span');
			totalValue.className = 'hdr-cost-popover-value';
			totalValue.textContent = formatTokenCount(totalTokens) + ' · ' + formatDollars(totalDollars);
			totalRow.appendChild(totalLabel);
			totalRow.appendChild(totalValue);
			hdrCostPopoverBody.appendChild(totalRow);
		}

		function openCostPopover() {
			if (!hdrCost || !hdrCostPopover) {
				return;
			}
			renderCostPopover();
			// Anchor below the chip so the popover lines up under the dollars.
			const rect = hdrCost.getBoundingClientRect();
			hdrCostPopover.style.top = (rect.bottom + 4) + 'px';
			hdrCostPopover.style.right = (window.innerWidth - rect.right) + 'px';
			hdrCostPopover.style.left = 'auto';
			hdrCostPopover.hidden = false;
		}

		function closeCostPopover() {
			if (hdrCostPopover) {
				hdrCostPopover.hidden = true;
			}
		}

		if (hdrCost) {
			hdrCost.addEventListener('click', (e) => {
				e.stopPropagation();
				if (hdrCostPopover && !hdrCostPopover.hidden) {
					closeCostPopover();
				} else {
					openCostPopover();
				}
			});
		}

		if (hdrCostPopoverReset) {
			hdrCostPopoverReset.addEventListener('click', (e) => {
				e.stopPropagation();
				vscode.postMessage({ type: 'costResetRequest' });
				closeCostPopover();
			});
		}

		// Click-outside dismissal — same pattern as the model/agent menus.
		document.addEventListener('click', (e) => {
			if (!hdrCostPopover || hdrCostPopover.hidden) {
				return;
			}
			const target = e.target;
			if (target instanceof Node && (hdrCostPopover.contains(target) || (hdrCost && hdrCost.contains(target)))) {
				return;
			}
			closeCostPopover();
		});

		// =================================================================
		//  Phase 87 — Quote-reply floating button
		// =================================================================
		//
		// When the user selects text inside a `.msg-assistant` bubble, show
		// a small fixed-position "Quote" button anchored next to the
		// selection. Clicking the button prefixes every line of the
		// selected text with `> ` and prepends it to the composer with a
		// blank line after the quote, then focuses the textarea after the
		// quote so the user can immediately type their follow-up.

		const quoteReplyButton = (function () {
			const btn = document.createElement('button');
			btn.type = 'button';
			btn.className = 'quote-reply-button';
			btn.hidden = true;
			btn.setAttribute('aria-label', 'Quote selection in composer');
			btn.innerHTML = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 5h4v4H4l-1 3V5zM9 5h4v4h-3l-1 3V5z"/></svg><span>Quote</span>';
			document.body.appendChild(btn);
			return btn;
		})();

		function getSelectionInsideAssistant(selection) {
			if (!selection || selection.isCollapsed || selection.rangeCount === 0) {
				return null;
			}
			const text = String(selection.toString() || '').trim();
			if (!text) return null;
			const range = selection.getRangeAt(0);
			let node = range.commonAncestorContainer;
			if (node && node.nodeType === Node.TEXT_NODE) {
				node = node.parentElement;
			}
			if (!node || !(node instanceof Element)) return null;
			const wrapper = node.closest && node.closest('.msg-assistant');
			if (!wrapper) return null;
			return { text, range, wrapper };
		}

		function positionQuoteReplyButton(range) {
			const rect = range.getBoundingClientRect();
			if (!rect || (rect.width === 0 && rect.height === 0)) {
				quoteReplyButton.hidden = true;
				return;
			}
			// Place the button just above and to the right of the selection
			// rectangle. Clamp inside the viewport so it never disappears
			// off-screen on small panels.
			const btnHeight = 24;
			const btnWidth = 70;
			const top = Math.max(4, rect.top - btnHeight - 4);
			const left = Math.min(window.innerWidth - btnWidth - 8, Math.max(8, rect.right - btnWidth));
			quoteReplyButton.style.top = top + 'px';
			quoteReplyButton.style.left = left + 'px';
			quoteReplyButton.hidden = false;
		}

		function maybeShowQuoteReplyButton() {
			if (!messageInput) return;
			const selection = window.getSelection();
			const found = getSelectionInsideAssistant(selection);
			if (!found) {
				quoteReplyButton.hidden = true;
				return;
			}
			positionQuoteReplyButton(found.range);
		}

		document.addEventListener('selectionchange', () => {
			// Schedule on the next frame so the layout has settled (helps
			// when the selection is mid-update, e.g. drag-selecting).
			requestAnimationFrame(maybeShowQuoteReplyButton);
		});

		// Hide the button on any click outside both the button itself and
		// the selection it's anchored to. Tracked via mousedown so the
		// button click doesn't race with the dismiss handler.
		document.addEventListener('mousedown', (e) => {
			if (quoteReplyButton.hidden) return;
			if (e.target instanceof Node && quoteReplyButton.contains(e.target)) return;
			// Defer one tick so a fresh selection can re-show the button.
			setTimeout(() => {
				const selection = window.getSelection();
				if (!getSelectionInsideAssistant(selection)) {
					quoteReplyButton.hidden = true;
				}
			}, 0);
		});

		quoteReplyButton.addEventListener('click', (e) => {
			e.preventDefault();
			e.stopPropagation();
			const selection = window.getSelection();
			const found = getSelectionInsideAssistant(selection);
			if (!found || !messageInput) {
				quoteReplyButton.hidden = true;
				return;
			}
			// Prefix every line of the selection with `> `. Use the regex
			// `^` per line via /gm so multi-line selections quote cleanly.
			const quoted = found.text
				.split(/\r?\n/)
				.map((line) => '> ' + line)
				.join('\n');
			const prefix = quoted + '\n\n';
			const tail = messageInput.value || '';
			messageInput.value = prefix + tail;
			// Trigger the composer's auto-resize + send-affordance update.
			messageInput.dispatchEvent(new Event('input'));
			// Position the caret immediately AFTER the inserted prefix so
			// the user can start typing their follow-up at once.
			try { messageInput.setSelectionRange(prefix.length, prefix.length); } catch (err) { /* tolerated */ }
			messageInput.focus();
			// Clear the now-stale selection and hide the button.
			try { selection.removeAllRanges(); } catch (err) { /* tolerated */ }
			quoteReplyButton.hidden = true;
		});

		// =================================================================
		//  Phase 86 — Spend-cap UI (meter + modal)
		// =================================================================
		//
		// `spendLimitState` is pushed by the host on every cost update and
		// drives the Settings → Features progress bars. `spendCapBlocked`
		// pops the modal that explains the user's options when a turn was
		// refused or aborted by the guard.

		const spendMeter = document.getElementById('settingsSpendMeter');
		const spendMeterSessionLabel = document.getElementById('spendMeterSessionLabel');
		const spendMeterSessionFill = document.getElementById('spendMeterSessionFill');
		const spendMeterTaskLabel = document.getElementById('spendMeterTaskLabel');
		const spendMeterTaskFill = document.getElementById('spendMeterTaskFill');

		function applySpendLimitState(state) {
			if (!spendMeter || !state) return;
			const sessionCap = Number(state.sessionCapUsd) || 0;
			const taskCap = Number(state.taskCapUsd) || 0;
			const sessionUsd = Number(state.sessionUsd) || 0;
			const taskUsd = Number(state.taskUsd) || 0;
			spendMeter.hidden = false;
			if (spendMeterSessionLabel) {
				spendMeterSessionLabel.textContent = '$' + sessionUsd.toFixed(2) + ' / $' + sessionCap.toFixed(2);
			}
			if (spendMeterTaskLabel) {
				spendMeterTaskLabel.textContent = '$' + taskUsd.toFixed(2) + ' / $' + taskCap.toFixed(2);
			}
			const setFill = (el, frac) => {
				if (!el) return;
				const pct = Math.max(0, Math.min(1, frac)) * 100;
				el.style.width = pct.toFixed(1) + '%';
				el.classList.remove('spend-meter-warning', 'spend-meter-danger');
				if (frac >= 1) el.classList.add('spend-meter-danger');
				else if (frac >= 0.8) el.classList.add('spend-meter-warning');
			};
			setFill(spendMeterSessionFill, sessionCap > 0 ? sessionUsd / sessionCap : 0);
			setFill(spendMeterTaskFill, taskCap > 0 ? taskUsd / taskCap : 0);
		}

		function showSpendCapBlockedModal(scope, currentUsd, capUsd) {
			// Lazy-create the modal so non-blocking sessions never pay the
			// DOM cost.
			let scrim = document.getElementById('spendCapModalScrim');
			if (!scrim) {
				scrim = document.createElement('div');
				scrim.id = 'spendCapModalScrim';
				scrim.className = 'sota-modal-scrim';
				scrim.hidden = true;
				scrim.innerHTML = ''
					+ '<div class="sota-modal-card" role="alertdialog" aria-labelledby="spendCapModalTitle" aria-describedby="spendCapModalBody">'
					+ '  <h3 class="sota-modal-title" id="spendCapModalTitle">Spend cap reached</h3>'
					+ '  <p class="sota-modal-body" id="spendCapModalBody"></p>'
					+ '  <div class="sota-modal-actions">'
					+ '    <button class="sota-modal-btn" type="button" data-action="dismiss">Dismiss</button>'
					+ '    <button class="sota-modal-btn sota-modal-btn-primary" type="button" data-action="open-settings">Open spend caps…</button>'
					+ '  </div>'
					+ '</div>';
				document.body.appendChild(scrim);
				const dismiss = () => { scrim.hidden = true; };
				scrim.addEventListener('click', (e) => {
					if (e.target === scrim) dismiss();
				});
				scrim.querySelectorAll('button[data-action]').forEach((btn) => {
					btn.addEventListener('click', () => {
						const action = btn.getAttribute('data-action');
						if (action === 'open-settings') {
							vscode.postMessage({ type: 'openSettingsJson', settingId: 'sota.spendLimit' });
						}
						dismiss();
					});
				});
			}
			const title = scrim.querySelector('#spendCapModalTitle');
			const body = scrim.querySelector('#spendCapModalBody');
			const cap = Number(capUsd) || 0;
			if (scope === 'task') {
				if (title) title.textContent = 'Task spend cap reached ($' + cap.toFixed(2) + ')';
				if (body) body.textContent = 'Aborted mid-turn after spending $' + (Number(currentUsd) || 0).toFixed(2) + '. Increase the per-task cap in Settings → Features, or use /continue to retry.';
			} else {
				if (title) title.textContent = 'Session spend cap reached ($' + cap.toFixed(2) + ')';
				if (body) body.textContent = 'The next chat turn was blocked because session spend ($' + (Number(currentUsd) || 0).toFixed(2) + ') has reached the cap. Raise the cap in Settings → Features or start a new conversation to reset.';
			}
			scrim.hidden = false;
		}

		// Hook the new message types into the existing host→webview
		// dispatcher. We listen at `window` to avoid wrestling with the
		// existing top-level handler scope; the host fans out via
		// postMessage so additive listeners are safe.
		window.addEventListener('message', (event) => {
			const msg = event && event.data;
			if (!msg || typeof msg !== 'object') return;
			if (msg.type === 'spendLimitState') {
				applySpendLimitState(msg);
			} else if (msg.type === 'spendCapBlocked') {
				showSpendCapBlockedModal(msg.scope, msg.currentUsd, msg.capUsd);
				// On block, also stop the streaming UI so the composer
				// re-enables for the next user input.
				try { setStreamingState(false); } catch (e) { /* tolerated */ }
			}
		});

		// Request a fresh meter when the Features sub-tab is opened so the
		// initial paint isn't blank. Re-uses `requestSettings` which the
		// host already pushes `spendLimitState` after.
		if (chatSettingsView) {
			chatSettingsView.addEventListener('click', (e) => {
				const target = e && e.target;
				if (target instanceof Element) {
					const subtabBtn = target.closest('.settings-subtab[data-subtab="features"]');
					if (subtabBtn) {
						vscode.postMessage({ type: 'requestSettings' });
					}
				}
			});
		}
