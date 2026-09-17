# Shared workflow workbench

This contribution provides workflow discovery, authoring, and reusable progress widgets. It does not own execution, permissions, session creation, or provider-specific behavior.

## Experimental rollout

`chat.workflows.enabled` is an experimental, window-scoped setting, disabled by default. `WorkflowSettingId.Enabled` and the configuration-backed `WorkflowContextKeys.enabled` expression are exported from `common/workflowConfiguration.ts`; the context key is `config.chat.workflows.enabled`. Tests and UI scenarios must enable the setting explicitly.

The flag gates the Workflows management section, authoring commands, and selection/setup, in addition to the normal AI-hidden gate. Turning it off during setup prevents new-session command dispatch. Existing-run inspection remains available through the actual runtime service; existing document edits are not discarded.

This is rollout configuration, not a permission grant or a substitute for managed policy. The session owner mirrors it to each owning host connection, and the host must revoke future workflow dispatch when disabled. The workbench does not implement that runtime enforcement or bypass existing tool authorization.

## Sources and file format

- Workspace: `.vscode/workflows/*.workflow.jsonc` and `*.checkpoint.jsonc`.
- Personal: the active profile's `workflowsHome` resource, including default-profile inheritance. Profile copy, import, export, and initialization carry the JSONC definitions only, never run state or execution authority. File operations use `IFileService`, including remote and virtual resources.
- Built-in: `builtinWorkflowDefinitions` and `builtinWorkflowCheckpointTypes`.
- Enabled, registered extensions: declarative packaged files contributed through the proposed `workflowTemplates` and `workflowCheckpointTypes` extension points. Contributing a workflow declaration does not activate executable workflow code.

Sources without a file system provider are reported unavailable without installing watches or attempting file I/O. Other sources, including personal and built-in workflows, remain available independently. Discovery uses normal FileService activation for lazy file system providers; provider registration and removal refresh source availability and scoped watches.

Extension-source enablement is projected from the existing extension management and enablement services, not a second set of permissions. Owning host adapters publish a complete snapshot before enabling execution and on explicit enablement/profile/install changes. Absent extension IDs are unavailable, including packages removed while disconnected; no per-session discovery or per-extension network round trips are needed. Disabling a required source pauses its runs; enabling it again never resumes them. An extension-host process disconnect alone does not revoke packaged definitions.

For example, a reusable checkpoint file:

```jsonc
{
	"$schema": "vscode://schemas/workflow-checkpoint/v1",
	"id": "example/summary",
	"version": 1,
	"label": "Summarize",
	"instructions": "Summarize the completed task and submit the summary as proof.",
	"proofSchema": {
		"type": "object",
		"properties": { "summary": { "type": "string", "minLength": 1 } },
		"required": ["summary"],
		"additionalProperties": false
	},
	"completion": { "kind": "reported" }
}
```

A workflow references the exact checkpoint version:

```jsonc
{
	"$schema": "vscode://schemas/workflow/v1",
	"id": "example/task",
	"version": 1,
	"label": "Task With Summary",
	"checkpoints": [
		{ "id": "summary", "type": "example/summary@1" }
	]
}
```

The proposed extension manifest shape is:

```json
{
	"contributes": {
		"workflowCheckpointTypes": [
			"checkpoints/summary.checkpoint.jsonc"
		],
		"workflowTemplates": [
			"workflows/task.workflow.jsonc"
		]
	}
}
```

Packaged paths must be relative and cannot escape their extension. The source identity comes from discovery, never the document's `source` property. There is no executable extension hook in these contribution points.

Different versions may coexist. Lookups and conflict detection use the engine's canonical `getWorkflowCheckpointTypeReference` helper; picker entries retain the exact definition without displaying its version. Versions remain in the JSONC contract, not the main picker, catalog, or editor form. Duplicate `id@version` definitions are diagnosed on every conflicting source; there is no implicit workspace-over-user or extension-over-built-in override. Invalid documents remain discoverable. The catalog and runtime do not fetch external schemas. Input, proof, and output contracts use the platform workflow engine's bounded schema subset, not unrestricted JSON Schema.

`watch()` uses correlated, nonrecursive file watchers, including parent folders needed to discover a newly created workflows directory. Catalog construction does not install permanent per-workspace watchers.

## Authoring and selection

The Customizations **Workflows** section is an independent registered management widget, not a prompt-file section. Its sidebar count includes all templates visible to the active harness, independently of the widget's search and source filters. `getWorkflowSourceCounts()` provides the same catalog's per-source totals. A harness may restrict visible sources with `IHarnessDescriptor.workflowSources`.

`WorkflowEditorModel` projects a real JSONC text model. Form changes enter the document's undo history immediately. Titles reveal a background and text cursor on hover, then select their text in a stationary input when activated; Enter applies a rename, while Escape or clicking away cancels it. The connected checkpoint outline puts the hover/focus move toolbar beside the rightmost drag handle and also supports Alt+Up/Down. Remove lives in the checkpoint context menu, available by right-click or Shift+F10. A narrow editor offers a back action and Escape to return to the checkpoint list. The on-demand code editor, dirty state, Save, Revert, and file backups use the same document. Invalid drafts can be saved; validation prevents resolving them for a run. Checkpoint movement and removal must preserve dependencies. Read-only sources can be copied to the personal profile with a distinct identifier.

Workflow editor inputs request modal placement so Inspect Workflow and Edit Workflow can replace the Customizations modal without closing it. Read-only state is independent of this capability, and the standard editor routing still honors `workbench.editor.useModal: "off"`.

Instruction overrides and **Customize for This Workflow** affect one workflow only. A local contract is embedded in that workflow's `localType`; it does not modify the library. **View Contract** shows the actual shared contract read-only. The separate **Checkpoint Library** opens writable user/workspace contracts as normal text documents and built-in/extension contracts through a read-only content provider. Library changes affect future snapshots that reference that contract, not existing runs.

### Agent authoring tools

The shared workbench registers a **Workflows** tool set, available through the existing client-tool bridge to the agent host and the normal language-model tool service to other providers:

- `listWorkflows` returns stable catalog keys, checkpoint summaries, sources, editability, and diagnostics.
- `getWorkflow` reads the definition and JSONC content with an opaque revision for editing.
- `listWorkflowCheckpoints` lists exact reusable type references; passing `references` returns their complete contracts.
- `createWorkflow` validates and saves a new personal (default) or workspace definition without overwriting an existing file.
- `updateWorkflow` validates the complete replacement definition and requires the revision from `getWorkflow`. It preserves the workflow identity, comments outside changed properties, and existing run snapshots.

Tools use the invoking session's working directory and harness source restrictions, not the selected session or active Customizations editor. A multi-root window requires an explicit workspace for workspace creation. Built-in and extension definitions are read-only and can be copied with a distinct id. Source diagnostics remain visible when discovery is incomplete. Updates reject stale reads and unsaved editor changes; creation and updates retain normal tool approval and cancellation and reject a profile change before saving. The rollout and AI-hidden gates are checked at invocation as well as discovery. Local checkpoint contracts support workflow-specific additions without changing the shared library.

`WorkflowAuthoringService` owns the stricter, validated agent-authoring path over the existing catalog and FileService. The editor can still save invalid drafts. Neither authoring path attaches a workflow, starts execution, changes a stopping point, or changes an immutable run snapshot.

After-completion groups are declarative. Choosing an existing group or naming a planned group does not create a group or move a session. The runtime's session integration performs the eventual move.

Selecting a workflow resolves an immutable snapshot without opening setup prompts. The initial stopping point is the first checkpoint; users can extend it in the checkpoint list after starting. In the new-session composer, the optional Workflow picker follows the workspace/provider controls rather than appearing as an attachment. Its empty state has a dashed border. It opens an anchored action list, with choices grouped by Workspace, User, Built-in, and Extensions. Workflow descriptions appear on a second line beneath their names, with the full text available on hover and to screen readers. **No Workflow** clears the selection inside that same picker; there is no separate remove button. Clearing also remains available for an invalid draft or after rollout disablement, without enabling discovery or execution. Saving, discovering, inspecting, and selecting never start execution. The session entry point retains the selection until the user explicitly chooses **Start Workflow**. Disabled Start Workflow controls explain the missing task, provider, model, or readiness requirement on hover and in their accessible description.

Workflow inputs may be partial. Supplied values retain schema validation, including nested requirements. Immediately before assigning a checkpoint, missing bound workflow inputs become a durable `inputRequest` on a blocked run with no polling or dispatch. Earlier proof is committed even when the next checkpoint needs information; inputs beyond the stopping point are not requested yet. The rail renders the current request as labeled fields backed by view-model drafts. Explicit `provideInputs` uses the current run revision, accepts only requested keys, and preserves prior inputs, proof, the stopping point, and the previous-turn completion barrier. Paused or cancelled runs cannot accept input submissions. The agent-host adapter infers a compatible `repository` URI from the owning session's repository, never from an unrelated active editor, without replacing an explicit value. Existing permission, policy, and tool checks remain authoritative.

Required string inputs marked `format: "iana-time-zone"` start with the client's local IANA time zone, independent of their property name or contributing extension. Editing an existing selection preserves its saved inputs instead of recapturing the zone. The owning runtime validates and persists that explicit value; a remote host or later restart must not substitute its own local zone. Calendar start conditions use the shared runner's durable waits rather than agent turns that sleep.

## Integration APIs

- `IWorkflowCatalogService`: `getCatalog(workspace?)`, `watch(workspace?)`, `resolve(entry, workspace?)`, `createWorkflow(definition, target)`, and `createCheckpointType(definition, target)`.
- `IWorkflowService`: `registerRuntime(adapter)`, `watchSession(session)`, `getUnsupportedReason(session)`, `getSessionRun(session)`, `start(options)`, `control(session, control)`, and runtime/run change events.
- `IWorkflowUIService`: `selectWorkflow(workspace?, selection?, anchor?)`, `showWorkflow(session, revealTurn?)`, `openEditor(entry, workspace?)`, `openCheckpointType(entry, workspace?)`, and `useInNewSession(entry, workspace?)`.

`WorkflowSelection` is exported from `common/workflowService.ts` and re-exported by the browser UI contract for compatibility. It contains `snapshot`, `stopAfter`, optional partial `inputs`, and optional `origin: WorkflowRun['origin']` (`{ runId, checkpointId }` for independent-child lineage, never a catalog key). Passing an existing selection reopens the template picker; choosing that same template retains its snapshot, stopping point, inputs, and lineage. The picker returns `null` for explicit removal and `undefined` for dismissal. A runtime adapter supplies `id`, a platform `IWorkflowRuntime`, `supportsSession(URI)`, and optionally `getUnsupportedReason(URI)`. The router does not branch on provider names. Disposing a registration disconnects it; ambiguous ownership and disconnected controls are rejected.

**Use in New Session** calls the session owner's `registerSessionStarter((selection, workspace?) => Promise<void>)` callback to stage a new session, not silently start execution. The callback is scoped to its registration; disposing or replacing it during setup prevents dispatch. It does not register or shadow a command. Session owners may also register `registerGroupProvider(workspace => readonly { id, label }[])`. Shared workbench code does not import the sessions layer.

The agent-host adapter requires both host-transport and provider workflow capabilities. Local listeners explicitly enable the workflow extension independently of legacy VS Code extension methods; unrelated extension operations remain disabled. Workflow requests and change notifications use that same protocol connection, including after reconnect, and execution retains the host's normal readiness, source, permission, and policy checks.

Starting a workflow in an empty chat records the original prompt as a durable, right-aligned user message without sending an extra agent turn. Session/worktree preparation belongs to that message and uses the same working-directory service as ordinary requests. Only after preparation completes does the first automatic, left-aligned workflow message appear. Cancelling preparation pauses the workflow; preparation and persistence errors remain explicit and cannot start the agent. Existing conversations are not prefixed with another initial prompt, and restoring history preserves the user message without repeating its worktree announcement on the first agent turn.

The original user message seeds the session title through the existing host title controller, before workspace preparation, without replacing an explicitly chosen title. Compact session-list and header captions show only the last checkpoint that dispatched a message, not the next checkpoint waiting for inputs or a start condition. Before the first dispatch, the toggle shows the workflow name and the list omits the checkpoint caption. Detailed progress and attention state remain available through the rail, hovers, and accessibility descriptions.

`WorkflowRunWidget` consumes `WorkflowRunViewModel`; `WorkflowDraftWidget` is an optional compact selection control. Completed checkpoints expand independently into proof lists only. Each row is one resource label: files show their name, and PRs, issues, and links show an icon and title without a trailing description or state. GitHub icons use the state captured in that checkpoint's receipt, never a later live state. Custom pointer hovers and accessible descriptions expose that historical state. Structured proof without links appears as one **View Proof** entry backed by a read-only text-model provider.

The inline **Show First Chat Turn** action sits immediately before the expansion chevron and reveals the original checkpoint turn without resuming work. `WorkflowStoppingPointWidget` places a horizontal line after the inclusive stopping checkpoint. Dragging, its hover/focus move toolbar, and keyboard arrows/Home/End only propose a change; **Apply** or Enter confirms it, and **Cancel** or Escape discards it. Movement and confirmation use standard toolbars with vertically centered control-sized actions and Left/Right keyboard navigation. The line cannot move above completed checkpoints.

The Sessions workflow toggle follows the session-header or chat-tab toolbar, is vertically centered, and has a compact control border and expanded background tied to its owning sidebar. `SessionView` owns the provider-neutral sidebar slot: it reserves space beside the chat grid and stacks below chat in narrow layouts. Chat clicks and **Show First Chat Turn** keep it open. Closing restores focus to the toggle or owning chat; session changes and disposal release it without restoring old-session focus.

The stopping line is the primary control for automatic progress, not a visible Pause/Resume pair. Its context menu (right-click or Shift+F10) offers **Stop Workflow** while running or waiting: this uses the runtime's existing pause operation to revoke the active assignment and automatic wake-ups without losing proof or changing the confirmed stopping point. **Continue** appears only for paused or blocked work within that point and sends an explicit resume operation, never a state-dependent toggle. Editing the limit does not resume these runs; source re-enablement, inspection, and reopening a session remain inert. Runs that have reached their stopping point continue only when the user explicitly extends and applies the line.

Run summaries, checkpoint status labels, and Accessible View reuse the platform's `getWorkflowProgressLabel`, `getWorkflowProgressDescription`, and `getWorkflowStatusLabel` helpers. The current checkpoint's accessible description includes the reason, when present, and completed checkpoint count; explicit control errors remain visible instead of being replaced by progress text.

An optional `startConditionReceipts` array supplies historical checked evidence independently of completion receipts. Accessible View retains these observations and their recorded output separately from completion proof; the compact card does not present them as completion evidence. This never marks a checkpoint completed, changes reported completion provenance, or authorizes further work. The runtime rechecks conditions before starting work.

`WorkflowRunViewModel` owns a `watchSession(URI)` lease. The router reference-counts view interest, forwards one optional `IWorkflowRuntime.watchSession(sessionString)` lease per watched session, and reconnects that lease when runtime ownership changes. Full runs are retained only inside live watch scopes; releasing the last watcher clears the snapshot. Unwatched sessions retain at most bounded lightweight revision metadata, not definitions. Async reads from released/replaced watch scopes or runtime registrations cannot repopulate the cache. Parent host facades must use summary progress without hydrating full records on routine wakes and fetch full records only for watched views. Callers loading a panel must watch before its initial `getSessionRun`; `showWorkflow` holds this initial lease until the editor can acquire its own. Watching does not start work, schedule timers, or hydrate transcripts.

`WorkflowRunWidgetOptions.createLinkedWorkflow?: (checkpointId: string) => void | Promise<void>` optionally adds **New Linked Workflow** to each checkpoint's More Actions menu. The parent supplies this handler only when supported. It prepares an independent child draft, chooses its own stopping point, and requires explicit start; the widget neither starts a run nor forwards the parent's stopping point. Pending entry actions are not duplicated, and completion never reconstructs a disposed view.

## Accessibility and validation

Automatic workflow requests share the Agent Merge disclosure card. Their collapsed label identifies the checkpoint (and repair, missing-proof, or continuation trigger when applicable); attribution reads **Workflow {workflow name}**. Expanded details show only the checkpoint instructions and a formatted **Proof Schema**. The **Agent Message** eye action reveals the complete message, including the fixed workflow protocol, and toggles back to the details. These are inspection-only controls. Transcript find, timeline labels, and screen-reader descriptions use the same concise summary.

Agent prompts omit the repeated current task, checkpoint label, and trigger metadata. Inputs are included only when nonempty, and repair feedback remains available when needed. Proof requirements and the fixed execution protocol remain in the actual agent message. The original request is available through `get_checkpoint` rather than repeated in every assignment; initial attachments retain their content without ranges into the replaced prompt. The shared prompt formatter also supplies fixtures; display parsing supports earlier saved prompts and leaves unrecognized text intact rather than rewriting history.

The display source carries the immutable run's workflow and checkpoint labels through live requests, serialized models, and operation logs, independently of the prompt text. The host's workflow chat contribution persists it as turn-owned presentation data and restores system-notification origin after provider replay, including provider turn-ID aliases. For older history, only first turns, receipt turns, and the current assignment recorded by the owning run are backfilled; unrelated messages are never classified by prompt resemblance. These display records do not grant execution authority.

Widgets support keyboard navigation, labeled controls, focus restoration, Accessible View, and scoped Accessibility Help through the standard commands and shortcuts, without dedicated Help, Accessible View, or Outline buttons. `accessibility.verbosity.workflows` controls the help hint. The progress rail supports Up/Down, Home/End, and Enter/Space without taking those keys outside checkpoint controls.

Focused tests live in `test/common` and `test/browser`. `workflows.fixture.ts` renders the real catalog, editor, and run widgets in dark, light, dark high contrast, and light high contrast themes, including narrow layouts, on-demand JSONC editors, read-only authoring, stopped progress, and a proposed stopping point.
