<!--
Copyright (c) Microsoft Corporation. All rights reserved.
Licensed under the MIT License. See License.txt in the project root for license information.
-->

# Artifact integrations

**Status: Initial generic implementation added; validation is pending.** Production registries remain empty. This change does not adopt a GitHub or experiment integration, replace Agent Merge, implement a public extension API, or change scheduled Automations.

### Implementation map

The sketches below explain the design; the current internal API is defined by the [platform contracts](../artifactIntegrations/common/artifactIntegration.ts) and [runtime adapters](../artifactIntegrations/common/artifactRuntime.ts).

| Component | Implementation |
| --- | --- |
| Typed registration and credential-scoped resource leases | [ArtifactIntegrationRegistry](../artifactIntegrations/common/artifactIntegrationRegistry.ts) |
| Binding configuration, observation, details leases, and restoration | [ArtifactIntegrationService](../artifactIntegrations/common/artifactIntegrationService.ts) |
| Durable claims, explicit retries, action preparation, dispatch fencing, cancellation, and reconciliation | [ArtifactExecutionService](../artifactIntegrations/common/artifactExecutionService.ts) |
| Versioned ledger, revision conflicts, and consent fingerprints | [ArtifactIntegrationStore](../artifactIntegrations/common/artifactIntegrationStore.ts) |
| Serializable requests, sequenced updates, leased subscriptions, and paged history | [ArtifactIntegrationProtocol](../artifactIntegrations/common/artifactIntegrationProtocol.ts) |
| Host composition and storage | [AgentHostArtifactRuntime](node/artifactIntegrations/agentHostArtifactRuntime.ts) and [file storage](../artifactIntegrations/node/artifactIntegrationStorage.ts) |
| One client owner per installation/profile and target host | [LocalArtifactIntegrationHost](../artifactIntegrations/browser/localArtifactIntegrationHost.ts), using Web Locks, IndexedDB, and cross-window messaging |
| Client environment adapters and authority selection | [client runtime](../../sessions/services/artifactIntegrations/browser/clientArtifactRuntime.ts) and [Agent Host projection](../../sessions/contrib/providers/agentHost/browser/agentHostArtifactIntegrations.ts) |
| Main resource part, independent sections, structured details, actions, automation controls, and activity | [generic Sessions presentation](../../sessions/contrib/chat/browser/artifactIntegrationPresentation.ts) |

Both environments instantiate the same platform-common service and executor. A registration pairs its resource factory with its typed binding factory; only the presentation projection crosses the transport. Providers request work through the binding's automation context rather than implementing a second dispatch loop.

Implementation details worth preserving:

- Recording captures the trusted originating chat and, when available, turn. Agent-supplied inputs cannot set provenance. Promotion and later metadata updates do not replace the origin already captured by the coordinator. Missing legacy provenance blocks automatic prompts, not manual actions.
- New boolean controls are off; enum controls use their declared inactive value. Consent includes the allowed actions, action kind/execution scope, attempt budget, enum values, and explicit action/control `consentVersion`. Contributors must change those versions when semantics or schedules broaden.
- A configuration revision detects competing writes. Accepted work is fenced by its own control's generation and consent, so changing one control does not accidentally revoke another.
- A prepared native action cannot have performed its effect yet. Preparation is repeated after waiting. Ambiguous effects block conflicting work on the resource, including canonical aliases, until reconciliation.
- Both current AHP adapters use the ordinary queued-message path and declare best-effort admission. Their sends wait for acknowledgement without joining the client's optimistic/reconnect outbox. Accepted queue entries are not reported as completed turns.
- Accepted sends return a disposable request handle with a stable ID, current receipt, observable state, a completion promise, and explicit cancellation. The same adapter reattaches handles from persisted identity after restart without sending again; temporary disconnection keeps completion pending.
- Detail snapshots contain at most 200 items and explicitly report completeness. Additional detail windows are provider-owned. Run-history pages allow 1-200 entries, with a default of 50; the compact live snapshot retains the latest 50 runs.
- Details remain valid while any details consumer holds a lease, including across transport restoration. Existing artifacts and references retain their normal presentation when no integration matches.
- The initial renderer uses existing buttons and the workbench hover infrastructure, including hover accessible view/verbosity, and extends Sessions accessibility help. Provider strings are plain text; icons and colors resolve through registered theme tokens.

### Deliberate boundaries and validation status

The following are not silently emulated:

- Native `resourceAndWorkspace` actions are explicitly blocked by both concrete adapters until a real workspace execution lease is supplied. Resource-scoped code actions and ordinary chat prompts are supported.
- The public extension API, extension-host proxy/registration protocol, and explicit runtime/account rebinding remain later work. The current registry supports one local registration per logical integration ID. A changed runtime, account, or canonical identity pauses the existing binding.
- A change from client-owned to host-owned coordination, or the reverse, does not migrate saved consent/history automatically. Existing authority selection pauses rather than creating two executors.
- Host file storage depends on the existing single primary Agent Host owner for its data directory. It is not a distributed lock for independently started processes sharing that directory. Client fallback explicitly coordinates windows sharing its profile-local store.

Focused synthetic tests have been added for the [shared runtime and transport](../artifactIntegrations/test/common), [chat adapter](test/common/artifactIntegrationChat.test.ts), and [presentation](../../sessions/contrib/chat/test/browser/artifactIntegrationPresentation.test.ts), alongside recording and reconnect regression coverage. They have **not been executed**. Dependency restoration, compilation, lint/layer checks, cross-window takeover checks, and real-window accessibility/UI validation are deferred at the user's request after dependency installation was blocked by the sandbox's Playwright cache policy. The acceptance tables below remain the validation checklist, not a claim that all scenarios have passed.

## 1. Recommendation

Call the contributions **artifact integrations**, rather than artifact providers. They enrich resources that have already been recorded; they do not produce the artifacts, own their records, or supply their UI.

The architecture has four essential pieces:

1. An **artifact record** says why a resource belongs to a session and which chat originally recorded it.
2. An **integration resource model** observes that resource, shared across sessions within one coordinator authority, provider runtime, target host, and credential scope.
3. A **session binding** contributes presentation, actions, and automation controls for that artifact in that session.
4. A **shared coordinator and execution service** executes or dispatches provider-owned code, or sends a prompt, through one tracked, authorized execution path.

**Providers decide what the resource means and when to act. The selected coordinator admits and tracks execution through environment-specific APIs. The client renders the result.**

This is deliberately not a generic rule engine. An integration publishes named boolean or enum automation controls and observes their configured values. Its own code implements polling, schedules, predicates, and trigger decisions.

Separate **coordinator placement** from **provider runtime**. A capable agent host owns the coordinator; for an agent host without integration support, a client runs the same coordinator implementation as a local fallback. Providers can run beside that coordinator or in an extension host behind a framework-owned proxy.

The reusable implementation lives in `vs/platform/artifactIntegrations/common`, not only in agent-host Node code. Host and client composition supply different persistence, session, permission, and chat-message APIs. This shares behavior, not merely interface definitions. An extension author still need not implement separate client and host halves.

## 2. Agreed product boundaries

| Concern | Decision |
| --- | --- |
| Runtime | One shared platform implementation, composed on a capable agent host or on a client for a host that lacks integration support. Availability follows the selected coordinator and provider runtimes. No separate always-on service. |
| Fallback scope | Automation on an unsupported host is explicitly enabled per client installation/profile, with local configuration/history. Windows sharing that store coordinate execution; independently enabled computers may duplicate work. |
| Contributors | Built-in integrations initially, with reusable logic where environment dependencies permit. Future extension support uses proxies to the selected coordinator and explicit unavailable/paused behavior, not a new headless extension runtime. No public extension API implementation now. |
| Composition | Multiple integrations independently enrich the same resource. One designated integration supplies the main presentation only; it does not own the other contributions. |
| Sharing | Share live resource observations within one coordinator authority, provider runtime, and target host/account. Do not share automation consent across sessions or independently configured fallback clients. |
| Automation authoring | Providers publish named boolean/enum controls. The UI renders them; providers interpret them and decide when to request execution. |
| Execution | Both native code and prompts use a common tracked execution API, not after-the-fact reporting. |
| Manual prompt destination | The chat from which the user invoked the action, captured at invocation. |
| Automatic prompt destination | The chat that originally recorded the artifact. Never whichever chat is currently visible. |
| Busy chat | Wait when known busy, coalesce duplicates, and revalidate before submission. Prefer atomic admission; older hosts still support automatic prompts on an explicitly best-effort path. |
| Background sending | Preserve every unfinished draft and the visible/active chat. Sending automatically is not a composer submission and must not navigate or clear input. |
| Retries | Providers may explicitly request another attempt even after a completed turn if the objective remains unmet. Enforce a finite limit; exhaustion disables the associated control until the user enables it again. |
| Presentation | A main resource part, optional sections with live details, state-dependent actions, and state-independent general actions. Details are surface-neutral; the initial chat UI shows them in rich hovers. No provider-owned DOM, CSS, webviews, or client-side renderers. |
| Archiving | Pause automation, retain configuration, and revalidate on unarchive. |
| This deliverable | Generic framework, host/client adapters, presentation, and synthetic tests. No production provider adoption. Validation remains pending. |

References and artifacts can both receive integrations. Their existing `isArtifact` distinction remains unchanged; recording either does not authorize automation.

## 3. Existing seams and constraints

The proposal builds on these existing boundaries:

- [Artifact records](common/sessionArtifacts.ts) are session-owned metadata with stable IDs, labels, and locations. They currently have no originating-chat field or live capability model.
- [Artifact recording](node/shared/artifactServerTools.ts) already receives `context.chatUri`, but stores the record against its owning session. The host can capture provenance here without trusting an agent-supplied chat ID.
- [Collection mutations](common/sessionArtifactCollection.ts) deduplicate records and can promote a reference into an artifact while preserving its ID. Promotion must also preserve provenance when provenance is introduced.
- [Artifact persistence and publication](node/shared/sessionArtifacts.ts) already serialize mutations and persist before publishing. Keep that ordering.
- [The Sessions projection](../../sessions/contrib/providers/agentHost/browser/agentHostSessionArtifacts.ts) and [artifact presentation](../../sessions/contrib/chat/browser/sessionArtifacts.ts) currently contain special handling for GitHub references. Do not remove it until a later, separately validated migration.
- [Chat pills](../../workbench/browser/chatPills.ts) already support labels, icons, actions, hovers, and accessible descriptions. Extend the shared presentation primitives for separately interactive sections; they do not already expose the proposed segmented/live-detail contract.
- [Pull request hovers](../../sessions/contrib/github/browser/pullRequestHover.ts) provide precedent for themed status icons, detail content, and keyboard-reachable resource links. Reuse those interaction patterns without exposing provider-owned DOM.
- [Agent Merge](node/agentMergeController.ts) provides useful precedent for headless observation, action gating, duplicate suppression, and native-versus-prompt execution. It remains independent in this proposal.
- [Host Automations](node/agentHostAutomationService.ts) persist runs but currently create a fresh session for execution. Their protocol describes event triggers, but this implementation rejects them. They are not an existing artifact-action executor.
- [Chat lifecycle contributions](common/agentHostChatContributionsService.ts) are the integration seam for turn admission and completion. Do not grow domain-specific lifecycle logic in the central agent orchestration classes.
- [The extension tool bridge](../../workbench/api/browser/mainThreadLanguageModelTools.ts) demonstrates proxying extension-owned implementations through named requests, progress, results, and cancellation. It is precedent, not an existing artifact-integration API.
- [Client connection tracking](node/agentHostClientConnectionService.ts) exposes connected-client availability. Artifact integrations need binding-scoped runtime ownership, not execution routed by whichever chat or window is active.
- [Scheduled Automation authority and migration](../../sessions/AUTOMATIONS.md) provide precedent for client-owned versus host-owned execution and guarded ownership transfer. Reuse that separation, not the feature's new-session execution semantics.
- [Sessions request routing](../../sessions/services/sessions/common/sessionsManagement.ts) identifies an explicit existing chat, but the [current implementation](../../sessions/services/sessions/browser/sessionsManagementService.ts) discards an unrelated new-session draft before handling `background`. The artifact adapter needs a non-composer send path that preserves drafts as well as focus. A `Promise<void>` send result is also not a durable receipt or proof of turn completion.
- [Ordinary queued messages](common/state/protocol/channels-chat/actions.ts) already have stable pending-message IDs and a `queuedMessageId` on the resulting turn-start action. This supports best-effort prompt delivery on older hosts without inventing an atomic admission guarantee or revalidation hook that they do not have.

## 4. Scope is the foundation

```text
Recorded artifact in session A ----+---- Integration X / session binding A
                                  |          | controls + local state
                                  |          +--> tracked execution --> chat A's origin
                                  |
                                  +---- Integration Y / session binding A
                                  |
                                  +---- Integration X / shared resource model
                                              ^
Recorded artifact in session B ---------------+
       |
       +---- Integration X / session binding B
                  | independent controls + local state
                  +--> tracked execution --> chat B's origin
```

The integration resource model is shared **within an integration**. Integration X and integration Y do not merge arbitrary state or share a mutable object. They may reuse a lower-level domain service where appropriate.

### 4.1 Artifact record

Retain the existing record identity and location fields. Add host-authored origin metadata:

```ts
interface ArtifactOrigin {
	readonly chat: string;
	readonly turnId?: string;
}
```

New records capture origin at creation. Re-recording from another chat, changing a label, or promoting a reference preserves the original origin. Removing and later recording the resource creates a new record with new provenance and disabled automation.

Legacy records without trustworthy provenance remain usable for viewing and manual actions. Automatic prompt actions are unavailable with an explicit explanation; do not guess the main chat, infer provenance from the active tab, or rewrite origin during a duplicate addition. Likewise, a deleted or non-writable origin chat blocks automatic prompts rather than silently retargeting them.

An artifact record does not contain provider callbacks, credentials, polling timers, live raw state, or a copy of the execution history.

### 4.2 Integration resource model

Pool resource models by:

```text
(coordinator authority, target host, integration ID, provider runtime authority, provider resource key, credential scope)
```

Providers local to a coordinator use that environment's runtime authority. Extension-host providers use their selected registration authority; two clients running the same extension do not automatically share models or credentials. Fallback consent is still session-scoped, but within that client's independent authority.

Matching is URI-based, fast, and side-effect-free. The artifact's kind is a hint, not proof that a URL belongs to GitHub or another service. All matching integrations attach. A proxy can await a cancellable matching request to its runtime; a disconnected registration is unavailable, not a fresh negative match that removes existing bindings.

Each integration owns domain-specific canonicalization: a PR overview and its checks page can represent the same PR to that integration. It must not rewrite another integration's identity or lowercase arbitrary paths/query values. Resolve the effective credential scope before sharing observations; when an account changes, invalidate and rebind rather than leaking cached state between accounts.

The provider's resource model can be strongly typed and use existing domain services. PR snapshots and experiment snapshots do not need a common business-state schema.

Observation has its own availability and freshness: loading, available, stale, authentication-required, unavailable, and error are not business states such as draft or merged. Retain a clearly marked last-known view where useful; unknown state must not be interpreted as a successful condition.

### 4.3 Session binding

A binding is identified by:

```text
(coordinator authority ID, session, artifact record ID, integration ID)
```

It references the pooled resource model and owns:

- The session's automation selections and configuration revision.
- Provider-local, versioned checkpoints and session-specific state.
- The integration's structured view and action availability.
- The provider's automation controller for this binding.
- The association with this binding's execution history.

This separates external facts from local progress. "The experiment has a scorecard" is usually a shared resource fact. "This session analyzed scorecard version 17" is session state, unless the provider has actually published that outcome to the external service. The generic framework must support both without pretending they are the same fact.

Two sessions may intentionally enable the same automation independently. Sharing a subscription is not sharing consent. The coordinator must not silently choose one session as the global owner. Independently configured fallback clients likewise do not share consent or duplicate claims.

### 4.4 Integration contribution

The client receives a projection, not the provider's raw model:

```text
Artifact
  Main part: designated integration's icon, label, and details reference
  Integration X: sections, live details models, action groups, automation options, activity
  Integration Y: sections, live details models, action groups, automation options, activity
```

Every section, details model, item, action, and option ID is qualified by its integration and binding. The main presenter is a presentation role, not an authoritative resource provider. No object spreading of unrelated provider state; no last-writer-wins status field.

## 5. Contract sketches

These sketches describe the proposed boundaries, not a drop-in implementation. Existing VS Code primitives such as `URI`, `IObservable`, `IDisposable`, and `CancellationToken` are used conceptually. Only serializable DTOs cross process boundaries; runtime models and callbacks remain in their selected provider runtime.

### 5.1 Registration and lifetime

```ts
interface IArtifactIntegration<TResource extends IDisposable> {
	readonly id: string;
	readonly label: string;
	readonly automationOptions: readonly ArtifactAutomationOption[];

	match(
		resource: URI,
		token: CancellationToken
	): ArtifactResourceMatch | undefined | Promise<ArtifactResourceMatch | undefined>;
	createResource(
		match: ArtifactResourceMatch,
		context: IArtifactResourceContext,
		token: CancellationToken
	): Promise<TResource>;
	createBinding(
		resource: TResource,
		context: IArtifactBindingContext
	): IArtifactIntegrationBinding;
}

interface IArtifactIntegrationBinding extends IDisposable {
	readonly view: IObservable<ArtifactContributionView>;
	readonly actions: readonly ArtifactAction[];
	acquireDetails(detailsId: string): IArtifactDetailsModel;
	activateAutomation(context: IArtifactAutomationContext): IDisposable;
}

interface IArtifactBindingContext {
	readonly session: URI;
	readonly artifactId: string;
	readonly resource: URI;
	readonly origin?: ArtifactOrigin;
	readonly configuration: IObservable<ArtifactAutomationConfiguration>;
	readonly state: IArtifactBindingStateStore;
}

interface ArtifactAutomationConfiguration {
	readonly revision: number;
	readonly values: Readonly<Record<string, boolean | string>>;
}
```

`ArtifactResourceMatch` identifies the integration's canonical resource and pooling key. `IArtifactResourceContext` carries coordinator, target-host, runtime-authority, and credential-scope identity, not credential material. `IArtifactBindingStateStore` provides versioned, validated, coordinator-owned per-binding persistence for provider checkpoints; it is not another provider-owned database.

Registration is generic, so the concrete resource type remains checked between its factory and binding factory. The registry can capture that pairing in an adapter; consumers do not require `any` or a global union of every provider's business state.

These are internal platform contracts usable in either coordinator environment. An extension registration supplies a proxy implementing the same coordinator-facing responsibilities, while its domain model and callbacks remain in the extension host. A future public extension API should use public event/disposable/cancellation conventions, not expose internal observables or DI services.

The coordinator validates descriptors, restores configuration, registers handlers, and only then activates automation. `activateAutomation` installs the provider's own observers/timers and returns their disposable. Configuration changes are observable; the framework does not interpret provider predicates.

The coordinator owns bindings and reference-counted resource leases. A binding must not dispose the shared resource model. Enabling automation retains the required models without a UI subscriber, subject to runtime availability; it cannot keep a closed client or disconnected extension host alive. Disabling the last automation releases that retention when no view or run still needs it. An executing run retains its dependencies until it settles.

### 5.2 Automation controls, not rule definitions

```ts
interface ArtifactAutomationOptionBase {
	readonly id: string;
	readonly label: string;
	readonly description: string;
	readonly actionIds: readonly string[];
	readonly maxAttempts: number;
}

type ArtifactAutomationOption = ArtifactAutomationOptionBase & (
	| {
		readonly kind: 'boolean';
		readonly defaultValue: false;
	}
	| {
		readonly kind: 'enum';
		readonly choices: readonly {
			readonly value: string;
			readonly label: string;
			readonly description?: string;
		}[];
		readonly disabledValue: string;
		readonly defaultValue: string;
	}
);
```

An enum has an explicit inactive value; the default must equal that value. For example, merge can expose `never`, `ifUnchanged`, and `always`. The coordinator understands which value is inactive, while only the integration interprets the difference between the active modes.

`actionIds` declares which registered actions the control may cause. It is a routing and authorization boundary, not a condition expression. More specific semantics, such as merging only an unchanged head, remain provider-owned and are checked again before execution.

`maxAttempts` is a required, finite positive integer limiting dispatched attempts for one occurrence during an enablement period, including its initial attempt. The provider declares the budget; the shared coordinator enforces it. This is execution metadata, not an additional rule language or a free-form setting. No unlimited value is accepted.

The coordinator validates values, persists changes before publishing them, and uses revision-checked writes so consumers of one authority cannot silently overwrite each other. Independent fallback authorities intentionally have separate configurations. Invalid values fail explicitly. Missing integrations retain stored choices but cannot run; removed options and unknown enum values become unavailable, not silently mapped to a newly active mode.

Installing an integration, adding an artifact, discovering a new option, or receiving an agent-authored URL must not enable automation. Expanding a control's authorized actions requires renewed consent; do not silently widen the meaning of an existing enabled value.

Retry exhaustion changes the saved option to `false` or its declared disabled enum value. The coordinator persists and publishes an explanation, attempt count, and link to the last run alongside that configuration change; an off switch without a reason is insufficient. User re-enablement is explicit and clears that disablement notice while starting a new attempt budget, not erasing history.

### 5.3 Actions have one coordinator-owned execution boundary

```ts
type ArtifactPreparation<T> =
	| { readonly kind: 'ready'; readonly value: T }
	| { readonly kind: 'skip'; readonly reason: string };

interface ArtifactActionBase {
	readonly id: string;
	readonly iconId: string;
	readonly label: string;
}

type ArtifactAction = ArtifactActionBase & (
	| {
		readonly kind: 'code';
		readonly executionScope: 'resource' | 'resourceAndWorkspace';
		prepare(
			context: IArtifactActionContext,
			token: CancellationToken
		): Promise<ArtifactPreparation<IArtifactCodeExecution>>;
	}
	| {
		readonly kind: 'prompt';
		prepare(
			context: IArtifactActionContext,
			token: CancellationToken
		): Promise<ArtifactPreparation<ArtifactPrompt>>;
	}
);

interface IArtifactCodeExecution {
	run(context: IArtifactCodeExecutionContext): Promise<ArtifactCodeResult>;
}

type ArtifactCodeResult =
	| { readonly kind: 'completed'; readonly summary: string; readonly result?: ArtifactJsonValue }
	| { readonly kind: 'skipped'; readonly reason: string };

interface ArtifactPrompt {
	readonly text: string;
}

interface IArtifactAutomationContext {
	runAutomation(request: ArtifactAutomationRequest): Promise<ArtifactRunHandle>;
}

interface ArtifactAutomationRequest {
	readonly optionId: string;
	readonly actionId: string;
	readonly configurationRevision: number;
	readonly occurrenceKey: string;
	readonly reason: string;
	readonly input?: ArtifactJsonValue;
	readonly retryOf?: string;
}
```

The supporting execution types have these responsibilities:

| Type | Contract |
| --- | --- |
| `IArtifactActionContext` | Coordinator-resolved binding, invocation source, run ID, validated provider input, and automatic occurrence/configuration identity. No ambient active-chat lookup. |
| `IArtifactCodeExecutionContext` | Cancellation token, stable run/idempotency identity, and common progress reporting. No arbitrary prompt-sending callback. |
| `ArtifactCodeResult` | A serializable completion summary and optional structured result. Errors reject; they are not returned as successful summaries. |
| `ArtifactJsonValue` | JSON-compatible values only. The action owns validation and versioning of its input. |
| `ArtifactRunHandle` | The accepted run ID, scoped cancellation, and a separately observable completion outcome. Acceptance or queueing is not success. |

All integration-owned callable actions are registered on the binding; the view advertises the subset suitable for manual invocation, grouped as state-dependent or general. Each has an icon and label. An automation may use an internal action that has no menu item, but it still has a stable ID, label, execution kind, and declared association with its automation control.

Client-owned general utilities such as Copy Link use the existing client services, not a provider callback or an automatic run. This is a bounded set of built-in presentation actions, not a provider-supplied command-execution escape hatch. Provider-contributed general actions still use the shared tracked executor.

The manual entry point invokes a registered action with an explicit invoking chat and a client request ID. The automation entry point is already bound to the session, artifact, and integration. A provider cannot use it to select an unrelated session or override the automatic prompt destination.

`prepare` may refresh observations and check applicability, but must not perform the action's effect or send a prompt. It returns work or an explicit skip. The coordinator invokes returned code only inside the tracked run. Prepared callbacks are ephemeral; persist action IDs and input, never serialized closures.

This API is intentionally stronger than `reportAutomationRan(...)`: the run exists before the side effect, so crashes and failures cannot disappear between execution and reporting.

### 5.4 Structured presentation

The presentation contract describes a main resource part, optional sections, and two distinct action groups. The initial chat UI arranges these as a **segmented resource control**:

| Part | Contents | Semantic operation |
| --- | --- | --- |
| Main part | Colored icon, label, details reference | Open the recorded artifact resource; details are separately available. |
| Optional section | Colored icon, label, its own details reference | Reveal the section's live details in the UI's chosen surface. |
| State-dependent action | Icon and label | Invokes an action offered for the current resource state, such as Merge or Fix CI. |
| General action | Icon and label | Invokes a state-independent operation, such as Copy Link. |

The client owns layout, separators, action placement, overflow, and accessible behavior. A provider supplies structured data, not a renderer:

```ts
interface ArtifactIcon {
	readonly id: string;
	readonly colorId?: string;
}

interface ArtifactPartPresentation {
	readonly icon: ArtifactIcon;
	readonly label: string;
	readonly detailsId: string;
}

interface ArtifactSectionPresentation extends ArtifactPartPresentation {
	readonly id: string;
}

interface ArtifactActionView {
	readonly id: string;
	readonly enabled: boolean;
	readonly disabledReason?: string;
}

interface ArtifactContributionView {
	readonly availability: ArtifactAvailability;
	readonly main?: ArtifactPartPresentation;
	readonly sections: readonly ArtifactSectionPresentation[];
	readonly stateActions: readonly ArtifactActionView[];
	readonly generalActions: readonly ArtifactActionView[];
	readonly automationAvailability: readonly {
		readonly id: string;
		readonly available: boolean;
		readonly unavailableReason?: string;
	}[];
}
```

`ArtifactIcon.id` and `colorId` reference registered icons and theme colors; a missing color uses the normal foreground. This permits domain colors such as a merged PR's icon without accepting arbitrary CSS or hardcoded RGB values. Color always accompanies a text meaning.

The main part's label may be a provider-supplied display label, but it does not rewrite the recorded label, resource, or provenance. Its open target always comes from the artifact record. `main` is optional for integrations that only contribute sections/actions; the generic artifact presentation is the fallback.

Action views reference registered action descriptors, which supply icons and labels. `stateActions` may change as the resource state changes; `generalActions` remain discoverable across those business-state transitions. General does not mean unconditionally authorized: authentication, policy, and execution availability can still disable an action with an explanation. The client appends its own standard general actions, such as Copy Link.

`ArtifactAvailability` is a discriminated value carrying observation status, last successful observation time, and an explanation for stale/unavailable/error states. A control's unavailability can prevent enabling it, but must never prevent turning it off. Presentation and business state remain separate: changing an icon, label, or details text must not create an automation occurrence or alter a business predicate.

### 5.5 Live section details

The main part and each section refer to a provider-owned **details model**. Details belong to that part or section, not to the UI displaying them. The same model can feed a rich hover, an inline expansion, a panel, or another client surface without changing the integration API.

Details contain structured information, links to existing actions and automation controls, and optionally a list of resource items:

```ts
interface IArtifactDetailsModel extends IDisposable {
	readonly details: IObservable<ArtifactDetails>;
}

type ArtifactDetailsLink =
	| { readonly kind: 'action'; readonly actionId: string }
	| { readonly kind: 'automation'; readonly optionId: string };

interface ArtifactDetails {
	readonly availability: ArtifactAvailability;
	readonly title: string;
	readonly description?: string;
	readonly facts?: readonly {
		readonly id: string;
		readonly label: string;
		readonly value: string;
	}[];
	readonly links: readonly ArtifactDetailsLink[];
	readonly items: readonly {
		readonly id: string;
		readonly icon: ArtifactIcon;
		readonly label: string;
		readonly description?: string;
		readonly resource: string;
	}[];
}
```

- An action link invokes the referenced, currently exposed manual action through the same path as its ordinary action button. It cannot make an internal automation-only action callable.
- An automation link reveals and focuses the referenced control in the artifact's automation configuration. Merely following the link never toggles it or grants consent.
- Clicking an item opens that item's resource through the normal opener/editor routing. It does not open the parent artifact or trigger an action.
- All references are scoped to the contributing binding and validated. Links inherit the current descriptor label and availability; stale rendered details cannot bypass updated permissions.

Consumers acquire a disposable model lease through `acquireDetails`. Updates are pushed while the lease is held, including item state, available actions, and automation availability. Multiple surfaces can consume the same details concurrently. Releasing one lease must not stop another consumer; detail subscriptions are released when the last lease ends, independently of enabled automation.

Acquisition and transport identify the binding and details model, not a renderer or popup. Providers do not receive a hover/panel distinction, and they do not own open/close events, focus, or layout. Those are consumer responsibilities.

Keep section details separate from the compact main/section summaries. Load them lazily, publish an explicit loading state, and subscribe only while needed. CI and review lists can be large: use bounded/paged loading, indicate partial results, and never present a partial or unavailable list as a complete empty result. Pagination is a detail-subscription concern, not a change to the shape of each item.

Publish stable item IDs so each consuming UI can preserve its own focus, scroll position, and navigation state during refreshes. Retain useful last-known content with a stale/error explanation on refresh failure.

Titles, facts, descriptions, and item labels are plain text; UI-authored strings are localized, and external text is treated as untrusted content. No raw HTML, CSS classes, arbitrary colors, executable command links, or generic markdown injection are accepted. Richness comes from the shared structural model, not arbitrary markup.

## 6. The execution path

```text
User action                      Provider decides a trigger is due
     |                                      |
invokeAction(...)                 context.runAutomation(...)
     +----------------------+---------------+
                            |
                    Validate and claim
                            |
                  Persist queued run
                            |
               Wait for execution admission
                            |
                  Provider prepares again
                            |
                 Recheck authorization
                       /            \
             Run native code     Send normal chat turn
                       \            /
                    Record outcome
                            |
                  Publish common activity
```

### 6.1 Admission and revalidation

Before accepting work, validate the binding, registered action, invocation identity, and any declared automation control. Automatic work must name a currently active control and the configuration revision the provider observed.

Before dispatch, recheck artifact existence, current configuration/consent, session lifecycle, credentials, managed policy, and the latest available target-chat state. Providers revalidate the domain condition against fresh state. Atomic admission can reject a race at submission; best-effort queueing cannot guarantee another provider check at the later backend turn start. Manual action availability displayed minutes ago is not permission to execute now.

Native code uses the owning capability's authorization checks; prompt actions use the selected environment's ordinary chat-send path and the agent runtime's permission enforcement. Client fallback cannot bypass a host or enterprise restriction. An automation preference is not a permanent permission grant. Required one-time human approval yields a visible blocked state, including when no client is connected. Do not implement a second managed-policy parser in this framework.

### 6.2 Busy chats and execution coordination

Prompt actions wait while the target chat is known busy and respect available session/worktree restrictions. Until submission, the coordinator retains an action request rather than a permanently prepared prompt. Prepare again after waiting; if CI was fixed in the meantime, skip the repair.

The chat adapter declares its admission guarantee independently of artifact-integration support:

- **Atomic:** prepare against fresh state, then submit only if the backend still admits a new turn. A busy rejection means no message was submitted; wait and prepare again. A dedicated backend capability or an in-process host admission path can provide this guarantee.
- **Best effort:** automatic prompts remain supported. Check the latest busy state, prepare just before submission, and prefer the backend's existing non-steering queue with a stable message ID. Even when the chat looked idle, queueing avoids deliberately replacing a turn that started in the gap. Where no queue is available, use ordinary background delivery after the available checks without claiming race-free admission.

Best effort deliberately relaxes the final revalidation guarantee: once a prepared message is accepted into an older host's queue, the provider may not be called again when it is consumed. Another client can also change chat state between checks. Surface this delivery mode honestly; lack of atomic admission alone must not disable automatic prompts.

Never implement background automation by steering an active turn, cancelling the user's work, or knowingly replacing an active turn. Reuse normal permission-checked chat delivery. Do not attempt remove-and-reinsert queue tricks to simulate atomic refresh: the original message may already have been consumed. A failure-isolated outgoing-turn observer is not an authoritative admission gate.

Preserving drafts and navigation is a firm requirement in both modes, not part of the best-effort relaxation. The send path must leave new-session drafts, target-chat drafts, unsent attachments, and the visible/active chat untouched. It must not call composer cleanup or send-follow navigation. A draft being present does not delay otherwise eligible automatic work.

Track backend queue acceptance separately from a started turn. An accepted submission returns a request handle, not a completed outcome. Its completion promise resolves when the exact queued message or correlated turn completes, fails, or is cancelled. This is a technical outcome, not proof that the integration's domain objective was achieved.

A locally queued request can still be re-prepared; a message already accepted by the backend must be observed/reconciled rather than blindly submitted again. Persist the request identity before dispatch and its receipt after acknowledgement so a restarted coordinator can obtain a new handle for the same work. Failure or uncertain acknowledgement is visible in the run history.

Code actions declare their execution scope. The coordinator serializes resource mutations for the same recorded resource/account within its authority; the lane is not integration-qualified, so different contributors coordinate. Actions touching the workspace also require an adapter that can participate in the target session/worktree's execution restrictions. A client must not substitute its own checkout for a remote workspace. Read-only observation is not blocked by this execution lane.

Local serialization is not a global lock across independent fallback clients, aliases, hosts, or external users. Providers must still use external preconditions or idempotency mechanisms, such as merging a specific expected PR head.

### 6.3 Duplicate occurrences and retries

The durable automatic occurrence key includes the user-authorized enablement period:

```text
(binding ID, automation option ID, enablement generation, provider occurrence key)
```

An occurrence key identifies meaningful work, not a poll timestamp or view revision. Examples:

- CI repair: PR head plus the relevant failed-check attempts.
- Review repair: PR head plus the actionable review/comment revision.
- Weekly analysis: the intended schedule occurrence in the provider's persisted time zone.

An occurrence owns one or more explicitly linked attempts, with at most one nonterminal attempt. Repeated requests return the existing attempt; they do not create more prompts. Distinct occurrences are not implicitly merged. A provider can cancel superseded pending work, or return a skipped result when preparation finds that newer work has replaced it.

Technical completion and domain success are different. A prompt run can be `completed` while checks still fail. The provider may then request `retryOf` for that completed attempt, explaining the unmet objective. The coordinator does not infer business success from a turn finishing and does not introduce generic postcondition predicates.

`retryOf` identifies a prior terminal attempt and creates a linked successor under the same occurrence. Duplicate retries of that attempt return the same successor. Only the latest settled attempt may receive a new successor. Automatic retries require current authorization, fresh provider preparation, bounded backoff, and remaining budget; ordinary polling still returns the existing attempt instead of retrying implicitly.

The enforced budget counts the initial dispatch and its retries, recorded durably before native execution or prompt submission. Duplicate requests, time spent waiting locally, and skips before dispatch do not consume another attempt. An uncertain dispatch keeps its reservation until reconciled. Counts survive restarts. Changing an unrelated option, polling again, or generating a new request ID must not reset the budget; an occurrence key must identify real work, not be rotated to evade the limit.

When the provider requests further work but `maxAttempts` has already been exhausted, atomically disable that automation control, persist its explanation, revoke its pending automatic work, and reject the additional attempt with a typed limit-reached error. Disable only the control responsible for that work, not every integration or automation in the session. A final allowed attempt that resolves the objective needs no retry and does not cause a false exhaustion notice merely because its counter reached the limit.

The user can enable the control again to authorize a fresh budget, including another attempt at the same unresolved occurrence. The coordinator creates a new enablement generation and retains all prior attempts/claims. Timers, provider refreshes, and reconnection cannot re-enable the control. Disablement is revision-checked against its originating generation so a late result cannot turn off a newly re-enabled control.

An interrupted native effect or ambiguously submitted prompt must be reconciled before retry, even after re-enablement. Preserve handled-attempt markers independently of pruned display history. A successful external mutation is not replayed merely because an agent turn was inconclusive; fresh provider preparation and external preconditions still apply.

Two sessions can each perform their independently authorized prompt work. Do not apply a global deduplication key that silently suppresses one session. For native mutations against the same target, fresh external preconditions prevent a second merge/start/stop after the first already succeeded.

### 6.4 A common run lifecycle

```text
queued -> preparing -> submitted -> running -> completed
   |          |             |          |
   |          +-> skipped   +----------+-> failed / cancelled / interrupted
   +-> blocked
```

`submitted` represents a prompt accepted by the backend whose turn has not yet started, such as a queued message. Native code and immediately started prompts can move directly from preparation to running. `blocked` is nonterminal with a reason, such as missing authentication or required approval; it may return to admission after that condition is resolved. Cancellation and failure can terminate any nonterminal stage. A provider skip can terminate preparation; code that discovers a race must also report a truthful no-op.

Each run records its binding, action, source, automation control when applicable, enablement generation, occurrence/request identity, attempt lineage, configuration revision, reason, timestamps, target chat, admission mode, submission/turn correlation, progress, and outcome.

For code, completion follows the callback result. For prompts, completion follows the correlated chat turn's terminal outcome, not successful enqueueing. A completed agent turn does not prove CI is fixed or an experiment is correctly analyzed; those are provider-observed postconditions.

The shared coordinator generates consistent activity from these records. It can show queued work, native actions, prompts, failures, and skips together. Code runs get a system-authored activity entry; prompt runs link to their existing chat turn rather than duplicating it. In fallback mode, activity/history is client-local unless an existing backend API can publish it; do not fake a host transcript entry by sending a user prompt. Activity notices are not injected as model instructions.

## 7. Persistence, recovery, and authority

Persist artifact provenance, configuration with revisions and consent boundaries, per-control enablement generations/attempt budgets/disablement reasons, provider checkpoints with schema versions, run records, duplicate claims, and submission/turn correlation. Resource snapshots are caches, not authorization evidence; restored snapshots start stale.

Each binding belongs to one explicit coordinator authority. In host mode this authority is shared by connected clients; in fallback mode it is local to a client installation/profile and target host. Windows sharing that local store coordinate one executor. Independent fallback clients have distinct bindings and may intentionally duplicate work when each user enables automation there.

Within an authority, an extension-host provider has one selected runtime owner and requests execution from that coordinator. Stored work is not silently transferred to another coordinator, host, or provider runtime. Shared implementation is not shared persistence or cross-computer coordination.

After restart:

1. Restore records and enabled bindings when their owning coordinator is running, without needing the originating chat to be visible. A client fallback does not recover on the agent host while that client is closed.
2. Recreate available provider resource models and controllers; fetch fresh state. Client-bound registrations stay unavailable until an owning runtime reconnects and is rebound.
3. Reconcile recorded prompt runs against backend pending-message and turn identity before considering another send. A missing pending item is not proof of non-delivery: it may already have become a turn. If the backend cannot determine whether a send committed, record an interrupted/indeterminate outcome instead of automatically resending.
4. Re-prepare coordinator-local queued requests only if the binding and configuration are still valid. Already submitted backend messages are observed, not re-enqueued.
5. Mark in-flight code interrupted when its outcome is unknown. Let the provider reconcile external state before any explicit retry; do not rerun the old callback.
6. Let providers recover their own schedules/checkpoints. There is no generic evaluation of a serialized condition.

Scheduled integrations persist their time zone and due-occurrence cursor. Request the run durably before advancing the cursor; a crash before the checkpoint can safely re-offer the same occurrence key. The provider defines skip versus bounded catch-up behavior. It must not emit an unbounded backlog after a long shutdown.

The guarantee is durable claims and traceable attempts, **not exactly-once external side effects**. External APIs, correlated sends, conditional mutations, and provider reconciliation supply the remaining guarantees.

### Lifecycle boundaries

| Transition | Behavior |
| --- | --- |
| A viewing UI disconnects | A host coordinator and its otherwise available providers continue. A client fallback stops if its owning runtime closes or loses the target-host connection; its local ledger remains. |
| A client-bound provider's runtime/connection disappears | Pause monitoring and new automatic execution for that provider. Keep configuration, mark cached state stale/unavailable, and reconcile any already dispatched action before retry. |
| All controls become inactive | Stop that binding's automation controller, revoke local queued work, and request cancellation of its correlated backend submissions. Keep the artifact and manual capabilities; surface backend cancellation limits. |
| A control changes while work waits | Invalidate the old request's authorization revision; re-evaluate under the current selection rather than executing stale intent. |
| Retry limit is exhausted | Persist the option's disabled value and explanation. Revoke pending work for that control; only explicit user re-enablement authorizes a new budget. |
| Session is archived | Pause controllers and revoke local queued work. Request cancellation of backend submissions and in-flight automatic work; retain configuration and truthful outcomes, including cancellation races. |
| Session is unarchived | Restore controllers and revalidate against fresh state; do not replay cached prepared work. |
| Artifact is removed or session deleted | Tear down bindings, revoke future execution, and cancel pending work. For already submitted backend messages, cancel only the correlated pending item/turn where supported; report races or unsupported cancellation rather than claiming it was undone. |
| Origin chat is removed/read-only | Block automatic prompt execution with an explanation. Never redirect it to the main or active chat. |
| Provider is absent or fails | Keep the generic artifact openable and other integrations operational. Surface the affected contribution's unavailable/error state. |
| Credentials or policy change | Invalidate cached authorization, rebind credential-scoped observations where necessary, and block or cancel affected work. |

Configuration and lifecycle changes are direct service operations. Observables represent resulting state; events must not become an implicit control-flow bus between provider, renderer, and executor.

## 8. Multi-provider UI composition

Keep one artifact entry and its authoritative recorded location. One designated presentation integration supplies its main icon, color, display label, and details reference. All integrations can contribute their own optional sections and action groups.

The shared registry assigns explicit precedence among integrations eligible to supply `main`; designation is stable while they remain attached and does not depend on network completion or update order. A missing or unavailable main presentation falls back to the generic artifact icon/label/location details rather than letting a faster provider take over. Other contributions continue independently. The coordinator publishes the selected presenter so consumers of that authority agree; independent fallback clients may have different registered integrations.

The initial chat UI uses rich hovers to show details. This is a renderer choice, not a provider or protocol contract. Its conceptual layout is:

```text
[ main: icon label | section: icon label | section: icon label ]
  state actions: icon label, ...
  general actions: icon label, ...
```

This illustrates one composition, not a mandatory surface. Other UIs can render the same section details inline or in a panel. The client also chooses whether actions are inline, in a menu, or revealed on focus.

For the initial chat UI:

- Keep the surface **Calm** and **Focused**: one thing leads, the rest supports. The main part identifies the resource; sections give compact summaries; rich details appear on intent.
- Order sections by stable integration precedence and provider-declared section order. Preserve provider identity in details/actions when needed to distinguish otherwise identical labels.
- Do not synthesize a single business status from incompatible providers. A PR main part can say "Merged" while another integration's deployment section says "Pending"; both remain visible and meaningful.
- The main part is a resource link. Optional sections are separate disclosure buttons; their click must not bubble into opening that resource. Do not nest all controls inside one clickable pill.
- Hover/focus uses the existing managed-hover patterns. Clicking a section opens a persistent, focusable rich hover suitable for links and lists, not an inert tooltip; Enter/Space provides the same disclosure. Escape dismisses it and returns focus to the section.
- Give the rich interactive surface appropriate popup/dialog semantics rather than `role=tooltip`. Main-part hover details must also have the standard keyboard-accessible show/focus route without changing its resource-open click.
- Render boolean and enum controls from descriptors. Show the automatic prompt destination next to automation configuration.
- Keep state-dependent and general actions separate; retain provider-qualified IDs and grouping even when labels coincide. Referencing an action in a hover does not create a second execution implementation.
- Render freshness, unavailable states, blocked runs, and errors explicitly.
- Make state, controls, detail items, and activity available through the keyboard and accessible text, not just icon/color/hover. Preserve focus during live updates; if the focused item disappears, move focus to a neighboring item or the details container. Avoid announcing every poll.

Use existing pill/action/menu/managed-hover primitives and theme tokens, extending the shared segment model where needed. Update the feature's accessibility help and accessible view for these interactions; respect verbosity preferences. Gate AI-owned surfaces with the existing AI enablement mechanisms.

A richer renderer is not part of the initial contract. Extend the shared presentation vocabulary only when a concrete integration proves it cannot represent important information.

## 9. Worked examples

These are illustrative mappings, not implementations or registrations.

### GitHub pull request integration

| Concern | Example |
| --- | --- |
| Shared resource state | Open/draft/closed/merged, head revision, unresolved reviews, checks summary, mergeability, freshness. |
| Manual actions | Merge and mark ready as native code; fix CI and address comments as prompts. |
| Presentation | Main PR icon/color and label; optional checks and comments sections. State actions stay separate from general actions such as Copy Link. |
| Controls | `fixCI: boolean`, `addressReviews: boolean`, `markReady: boolean`, `merge: never / ifUnchanged / always`. |
| Session state | Consent/configuration revision, merge baseline, handled occurrence checkpoints, repair history. |

When failed checks appear, the provider evaluates its own state and selection, then requests:

```ts
const run = await execution.runAutomation({
	optionId: 'fixCI',
	actionId: 'fixCI',
	configurationRevision: configuration.revision,
	occurrenceKey: `${snapshot.headSha}:${snapshot.failedCheckAttemptsKey}`,
	reason: localize('artifact.fixCI.reason', "Required checks failed for the current pull request head."),
	input: { expectedHead: snapshot.headSha }
});
```

The coordinator records the run, waits if the origin chat is busy, and invokes the provider's action preparation. The provider refreshes checks and verifies that the same work is still applicable. The chat adapter sends the prompt through the normal turn path and the coordinator tracks that turn. A new head supersedes the old repair candidate; a repeated poll does not produce another turn.

For automatic mark-ready or merge, the provider supplies code-backed actions. Preparation tests the provider's conditions; execution uses current authorization and an expected head. These are separate actions and separately visible runs, not extra steps hidden inside a repair prompt.

A second deployment integration can attach to the same PR URL and contribute deployment state and actions without modifying the GitHub integration's state, controls, or labels.

The checks section might show a failure-colored icon and `3 Passed, 2 Running, 1 Failed`. Its details contain per-check icon/label/resource rows, a Fix CI action link, and a link to the Fix CI automation control. In the initial chat UI, clicking the section displays those details in a live hover; a panel could subscribe to the same details instead. A check completing updates the summary and its row in every subscribed surface. Clicking the check row opens that check's resource; clicking Fix CI invokes the tracked prompt action.

Likewise, the comments section's details contain live comment/thread items with their own resource links, an Address Comments action, and a link to the corresponding automation control. These are different instances of the same details contract, not GitHub-specific renderers.

### Experiment integration

| Concern | Example |
| --- | --- |
| Shared resource state | Not started/running/completed, scorecard availability and version, externally published analysis if any. |
| Manual actions | Start/stop as native code; analyze as a prompt in the invoking chat. |
| Presentation | Main experiment icon/color and label; optional scorecard and analysis sections with live details. Start/stop/analyze are state-dependent; Copy Link remains general. |
| Controls | `analysis: off / everyMonday` initially; more enum modes can be added deliberately. |
| Session state | Last analyzed scorecard version, schedule time zone/cursor, analysis runs. |

The integration owns the Monday schedule. At a due occurrence it checks that the experiment is running and a suitable scorecard exists, then calls the same `runAutomation` API with the intended schedule occurrence as its key. The coordinator targets the artifact's original chat and the action revalidates after any wait. In client-fallback mode this requires the owning client to be running and connected; persisted schedule state is not an always-on scheduler.

The framework does not learn what a scorecard is, parse `experiment.started && monday`, or assume that every completed analysis turn has successfully analyzed the latest scorecard.

## 10. Shared runtime and environment adapters

### 10.1 Share the implementation, not just the types

There is one implementation of registration, matching, resource pooling, bindings, configuration validation, details leases, duplicate claims, queueing/revalidation, and the run lifecycle. It lives in the platform `common` layer and imports neither Node APIs, DOM APIs, nor workbench/Sessions implementation types.

Both compositions instantiate that implementation:

```text
Capable agent host                      Host without integration support
  shared coordinator                      client-local shared coordinator
    + agent-host adapters                   + client adapters
    + local/proxied providers               + local/proxied providers
           |                                       |
   protocol state projection                local state projection
           +-------------------+-------------------+
                               |
                    same client-facing model
```

Provider placement is independent of coordinator placement. A built-in provider can execute beside either coordinator when its dependencies are available; an extension-host provider uses a proxy to the selected coordinator. "Client fallback" is not a second provider implementation or an extension-host requirement.

Reusable built-in integration logic also belongs in a common platform module. Factor environment-specific authentication, network, filesystem, and workspace operations behind explicit domain APIs. Sharing a coordinator must not require importing an existing Node-only provider into a browser, running local filesystem operations against a remote path, or pretending an unavailable dependency succeeded.

### 10.2 Environment APIs

The composition root supplies a small set of typed dependencies through constructors, not a service locator or `isClient` branches inside the core:

| API | Shared behavior it supports | Agent-host adapter | Client-fallback adapter |
| --- | --- | --- | --- |
| Session access | Qualified session/chat IDs, artifacts, provenance, lifecycle and availability | Host session state and artifact persistence | Existing backend session/artifact projection plus validated local provenance where available |
| Persistence | Revision-checked configuration, checkpoints, atomic occurrence claims, run history | Host durable store | Machine-local store, scoped to the target host and client authority |
| Chat access | Declared admission guarantee, submission, recoverable request handles, completion, and cancellation | Host turn path and lifecycle contribution, with atomic admission where supported | Non-composer background send/queue path, preserving drafts and tracking the exact backend message/turn; best effort where necessary |
| Authorization | Current policy, credentials, consent and required confirmation | Existing host/domain/SDK enforcement | Existing client/domain checks and backend enforcement; no permission widening |

Publication is the same observable/state model in both cases. A host transport projects it over the protocol; a fallback facade consumes it locally. The core does not serialize through a fake loopback connection just to use its own model.

A representative chat contract is:

```ts
interface ArtifactPromptRequest {
	readonly session: string;
	readonly chat: string;
	readonly requestId: string;
	readonly prompt: ArtifactPrompt;
}

type ArtifactPromptReceipt =
	| { readonly kind: 'queued'; readonly queuedMessageId: string }
	| { readonly kind: 'turn'; readonly turnId: string };

type ArtifactPromptSubmission =
	| { readonly kind: 'accepted'; readonly handle: IArtifactPromptHandle }
	| { readonly kind: 'busy' }
	| { readonly kind: 'notSent'; readonly reason: string }
	| { readonly kind: 'indeterminate'; readonly reason: string };

type ArtifactPromptRecovery =
	| { readonly kind: 'attached'; readonly handle: IArtifactPromptHandle }
	| { readonly kind: 'notSent' }
	| { readonly kind: 'indeterminate'; readonly reason: string };

interface IArtifactPromptHandle extends IDisposable {
	readonly requestId: string;
	readonly receipt: ArtifactPromptReceipt;
	readonly state: IObservable<ArtifactPromptState>;
	readonly completion: Promise<ArtifactPromptOutcome>;
	cancel(token: CancellationToken): Promise<void>;
}

interface IArtifactChatAccess {
	readonly admission: 'atomic' | 'bestEffort';
	observeChat(session: string, chat: string): IArtifactChatObservation;
	submit(request: ArtifactPromptRequest, token: CancellationToken, isCurrent: () => boolean): Promise<ArtifactPromptSubmission>;
	recover(request: ArtifactPromptRequest, receipt: ArtifactPromptReceipt | undefined, token: CancellationToken): Promise<ArtifactPromptRecovery>;
}
```

The chat adapter owns queue-to-turn correlation and the lifetime of request tracking. Consumers observe intermediate state or await completion on the same handle; these are projections of one state machine, not independently maintained results. A stable submission ID links the durable run to the actual request. `accepted` can mean queued, not started or completed; `busy` and `notSent` mean nothing was submitted. `indeterminate` means delivery is uncertain, not that it is safe to retry.

`ArtifactPromptState` distinguishes submitted, running, temporarily unavailable, confirmed terminal outcomes, and indeterminate tracking. `ArtifactPromptOutcome` contains completed, failed, or cancelled, with the correlated turn ID when one exists. Temporary disconnection suspends observation and leaves completion pending until the adapter reconnects. Permanent tracking loss rejects completion with `ArtifactPromptTrackingError`, leaving the durable run uncertain rather than treating it as execution failure.

Disposing a handle releases observation and interrupts any pending local completion wait; it does not remove a queued message or cancel a turn. Only `cancel()` requests that effect, and the completion promise reports the confirmed result, including a turn that finishes before cancellation reaches it. Terminal handles release their state subscriptions without waiting for the caller to dispose them. Multiple handles may observe the same request independently.

Promises and subscriptions are never persisted or sent over the wire. After restart, `recover()` uses the saved identity and receipt to attach a fresh handle; it never calls the submission path. Without a saved receipt, recovery waits for the initial chat snapshot before looking up the request; cancellation or adapter disposal releases that wait. Saved turn receipts also identify legacy turns whose messages lack correlation metadata. If no reliable match can be established, recovery remains indeterminate. Session/artifact lifecycle observation is still separate from request tracking: removing an artifact or archiving a session must remain visible to the coordinator.

Do not implement this adapter as just `sendMessage(text): Promise<void>`. The client must preserve every draft and the visible/active chat, maintain the exact destination and current permissions, and observe the actual outcome. The current `SessionsManagementService.sendRequest` implementation cannot be used unchanged because it discards a new-session draft even with `background: true`. Introduce or extract a non-composer send operation through the owning service that retains normal routing/authorization but does not run composer cleanup or navigation.

Cancellation targets only this run's pending message or correlated turn, never whichever turn is currently active. A queued receipt must be reconciled if the message was consumed before cancellation. Failure to locate or cancel it is explicit.

Adapters must report their real capabilities. Prefer atomic admission when available, but its absence does not disable automatic prompts: the shared executor uses the best-effort path described above. For the current ordinary chat queue, preserve its stable pending ID and correlate the resulting `queuedMessageId`; do not mistake queue upsert support for deduplication after a message was consumed. Respect the backend's permitted message-origin format, keeping automation attribution in supported metadata/local run history rather than impersonating a server-only message kind.

If submission acknowledgement or recovery lookup is inconclusive, surface `indeterminate` and do not replay automatically. Missing correlation cannot be replaced by assuming that the next completed turn belongs to this request. Workspace-dependent actions remain unavailable when the adapter cannot safely operate on the target workspace; best-effort prompt delivery does not relax identity, permission, or filesystem boundaries.

The fallback assumes the host still exposes ordinary artifact/session/chat operations. Missing artifact-origin metadata cannot be invented: retain trusted originating-chat information locally if it is observed from the actual recording operation, otherwise keep automatic prompts unavailable for that record. Never infer origin from the currently selected tab.

### 10.3 Selecting a coordinator

Select per target host using negotiated capabilities, not whether an integration happens to have returned data:

| Condition | Behavior |
| --- | --- |
| Integration coordinator is supported and permitted | Use the host authority and project its state. Do not start a parallel local coordinator for those bindings. |
| Host is positively known to lack integration support | Use the shared implementation with client adapters for new client-local bindings. Ordinary host chat/artifact APIs still provide the underlying session. |
| Capability discovery is pending | Wait. An empty projection is not proof that the host lacks support. |
| Host is disconnected, timing out, or returning an error | Keep the recorded authority unavailable. Never create fallback execution as automatic failover. |
| Feature or operation is denied by policy or explicitly disabled | Honor that restriction. Fallback is compatibility behavior, not a way around denial. |
| Host supports the coordinator but one provider/action is unavailable | Report that capability unavailable or register a supported provider proxy. Do not create a second coordinator to bypass it. |

Existing objects route by persisted authority identity, not a fresh "best available" choice on every call. A target-host reconnect or provider account change cannot silently change the owner of queued work.

### 10.4 Client-local ownership and persistence

The initial fallback is intentionally local. Its durable namespace includes the client installation/profile authority and stable target-host identity, then session, artifact, and integration. Configuration, checkpoints, deduplication markers, and run history do not roam through Settings Sync or become enabled on another computer merely because that session is opened there.

The UI explains: **"Runs on this computer while connected."** The user must enable automatic behavior separately on another client. If they enable it on both, both may act on the same external resource. Sharing the source code does not create cross-computer coordination; this is an accepted limitation, not an exactly-once guarantee.

Windows sharing the local store must route to one local execution owner and use durable atomic run claims with an ownership generation checked before dispatch. The existing [Automation leader-election implementation](../../sessions/contrib/automations/browser/automationLeaderElection.ts) is relevant prior art, but its nonce-based check alone is not a substitute for atomic claims or a single writer. Reuse or extract suitable coordination primitives through proper APIs; never reuse another feature's storage keys. If an environment cannot provide that local coordination, do not enable duplicate automatic executors there.

Closing the owning client or losing its target-host connection pauses automatic work. The ledger remains, and reopening restores selections before fresh state/permission checks and provider-defined bounded catch-up. If another local window takes ownership, it reconciles outstanding runs before dispatching; an already sent native effect or prompt must not be blindly repeated.

### 10.5 Changes of authority

If a previously unsupported host gains native support, do not let restored local automations and host automations become two owners of the same transferred binding. Pause new local dispatch, reconcile in-flight work in its source ledger, and make any handover explicit.

For the initial design, retain the local ledger visibly paused rather than silently migrating it. A future transfer must persist destination configuration/checkpoints, retire source execution with revision checks, and only then activate the destination under current consent and capabilities. History that cannot be transferred remains a source-owned archive. Configuration is not copied into two independently active authorities.

Likewise, losing access to a previously host-owned coordinator must not recreate its enabled state in a local fallback. Re-enabling a separately scoped client-local automation is a distinct user decision, not automatic downgrade/failover.

### 10.6 Layering and implementation shape

```text
platform/artifactIntegrations/common/
  artifactIntegration.ts                 Provider contracts and state/details DTOs
  artifactRuntime.ts                     Authority identity and environment API contracts
  artifactIntegrationService.ts          Shared registry, pooling, binding/configuration logic
  artifactExecutionService.ts            Shared admission, claims, queueing and run lifecycle
  artifactIntegrationStore.ts            Ledger contracts, schema and shared state transitions

platform/agentHost/node/artifactIntegrations/
  agentHostArtifactRuntime.ts            Host composition and environment adapters

platform/agentHost/node/chatContributions/artifactRuns/
  artifactRunsContribution.ts            Host turn correlation and lifecycle observation

sessions/services/artifactIntegrations/
  common/artifactIntegrations.ts         Provider-neutral client facade
  browser/clientArtifactRuntime.ts       Fallback composition, local storage/chat adapters

sessions/contrib/providers/agentHost/browser/
  agentHostArtifactIntegrations.ts       Host capability/protocol projection adapter
```

These are proposed paths, not files created by this design. The platform core does not import `ISessionsManagementService`, workbench UI services, or agent-host orchestration classes. Their adapters live in the consuming layers. Keep the artifact-specific abstraction focused rather than creating a general workflow engine or plugin loader.

Host composition follows [host service construction](node/serviceBootstrapping.md): process-local DI, explicit activation, and one disposal owner. Client composition follows normal workbench/Sessions service registration. Both inject the shared implementations' dependencies explicitly. Host chat lifecycle hooks use the existing contribution registry.

### 10.7 Transport and the client facade

Expose one provider-neutral client facade, backed by a host projection or the local shared runtime. Its state includes authority location/availability so users can distinguish host-owned behavior from client-local behavior.

A capable host exposes the corresponding capability-gated protocol surface:

- Contribution views, designated main presenter, and effective configuration keyed by artifact and integration.
- Lazy, live details subscriptions keyed by binding and details ID, with bounded/paged item delivery and explicit loading/freshness. No surface-specific subscription types.
- Revision-checked configuration-change requests.
- Idempotent manual-action requests carrying the invoking chat.
- Run status/cancellation and lazily paged history.

Keep compact artifact records and main/section summaries separate from details streams, high-churn integration state, and execution history. Do not inflate every session summary with raw check lists, scorecards, or transcripts.

Do not change the upstream Agent Host Protocol or its generated files for this framework. Use the existing VS Code extension-protocol mechanism: initialize metadata advertises `vscode.artifactIntegrations: 1`; requests use `vscode/artifactIntegrations`; updates use `vscode/artifactIntegrations/update`. Subscription IDs and monotonically increasing revisions identify each projected stream. Message correlation uses the `vscode.artifactIntegrationRun` metadata slot. Unknown capability versions remain unresolved rather than triggering fallback.

The private request union covers acquisition/release, revision-checked configuration, invocation, cancellation/reconciliation, details acquisition/loading, and paged history. Reconnect restores read subscriptions, never side-effect requests. Older clients keep ordinary artifacts. A newer client with an unsupported host consumes its local runtime through the same facade and never sends unsupported integration RPCs to that host.

The Agent Host Sessions provider adapts protocol state and capabilities to provider-neutral contracts. Shared Sessions services route to that projection or compose the fallback; they do not import the provider implementation. The chat contribution consumes the facade. Preserve the [Sessions layer direction](../../sessions/LAYERS.md).

Do not migrate Agent Merge, the GitHub pill, or scheduled Automations in the first framework change. Reuse proven lower-level observation, cron, storage, and turn-lifecycle helpers where their contracts fit, without installing competing schedulers for existing features.

The internal registry accepts local implementations and can later accept extension-host proxies. Neither provider placement nor coordinator placement changes the state/details model, action semantics, or run state machine. Availability, storage scope, and actual backend guarantees are explicit environment differences, not copied business logic.

## 11. Future extension contributions

### 11.1 Placement, not duplicated provider implementations

Coordinator placement and provider placement are separate choices. The same logical integration contract supports these provider runtimes:

| Runtime | Provider code runs in | Availability |
| --- | --- | --- |
| Host-resident | The owning agent host | Independent of connected UIs, subject to its dependencies and authorization. |
| Client-resident built-in | The client fallback environment, using the shared platform implementation | Requires the client runtime and target-host connection. No extension host is required. |
| Client-bound extension | An extension host reached through a connected VS Code client | Requires that runtime and its bridge to the selected coordinator. Closing an artifact view does not end registration; losing the runtime or bridge does. |

"Client-bound" describes the connection and lifetime, not necessarily a physical machine. The extension host can be local, remote, or a web worker; the agent host can independently be local or remote. Do not assume matching filesystem paths, processes, credentials, or network access.

```text
Extension host             VS Code client bridge          Selected coordinator
  integration code  <--->  registration/RPC adapter <---> integration proxy
  observations                                            shared coordinator core
  details models                                          + environment adapters
  trigger decisions                                             |
  native action handlers                               shared state/details facade
                                                                |
                                                             client UIs
```

The extension implements its integration once. The framework supplies the extension-host RPC adapter and a proxy to the selected coordinator. Host mode adds the client-to-agent-host bridge; fallback mode routes to the local coordinator without sending integration RPCs to the unsupported host. There is no mandatory extension-authored "client integration" plus "host integration" pair.

The domain model, observation, credentials, native action handlers, and trigger logic live together in the selected provider runtime. Configuration, checkpoints, consent, admission, duplicate claims, and run records remain coordinator-owned. The shared executor always routes prompt submission through its chat adapter. Rendering, focus, and local utilities such as clipboard operations stay client-owned.

In host mode, other authorized clients can render the host's accepted contribution/details state without installing the contributing extension. Fallback does not invent that cross-client transport: its projection and history remain local to its authority, including locally coordinated windows. The model must not rely on client-local commands, callbacks, or renderer code. Resource links use normal client opening capabilities and show an explicit unavailable state if a target cannot be opened there.

### 11.2 Registration and state flow

1. An enabled extension registers an integration through the future extension API. The client bridge supplies trusted extension provenance and resolves the selected coordinator; lack of host integration support routes to the client fallback rather than unsupported integration RPCs.
2. The coordinator registers a proxy and binds applicable artifacts to a specific contributing runtime. Fast declarative selectors may narrow matching before provider-specific resolution. Only the required resource/session context crosses to the extension.
3. The coordinator restores the binding's configuration/checkpoints from its authoritative store and sends them to its runtime. The provider observes configuration changes but cannot make an unacknowledged local preference authoritative.
4. The runtime publishes serializable contribution snapshots/updates. It supplies live details only when acquired, with the same reference-counted consumption model as host-resident providers.
5. The coordinator validates, attributes, and sequences those updates, then exposes them through its state facade/transport. Provider business state remains provider-owned; accepting a projection does not transfer execution authority.

Use versioned descriptors and named operations for registration, binding, configuration delivery, details subscriptions, action preparation/execution/cancellation, run requests, and results. Carry coordinator identity, registration generation, binding identity, request/run identity, and stream revisions where relevant. Public extension events and internal observables are adapted locally; callbacks, observables, disposables, and closures never cross the wire.

Provider code and credentials stay in the extension runtime. Publish only the contribution/detail data needed by authorized session consumers, not arbitrary extension storage or credential material. Do not share an observation across runtime/account boundaries merely because its URL matches.

### 11.3 One execution path, including remote code

An extension-owned trigger calls the same logical `runAutomation` operation as a built-in provider. The bridge delivers the request; the coordinator validates the binding, active control, runtime ownership, configuration revision, and occurrence key before creating the durable run.

Manual actions use that same executor and resolve to the binding's selected runtime, not necessarily the client where the user clicked. Manual prompt destination still comes from the invoking chat; automatic prompt destination still comes from artifact provenance.

At admission, the coordinator requests fresh preparation from the owning runtime:

- **Prompt action:** the extension returns prompt data. The shared executor rechecks admission and uses its chat adapter to send the normal correlated turn. The extension does not choose another destination or send an untracked prompt.
- **Code action:** the extension prepares an operation represented on the wire by a scoped, transient handle. The coordinator's proxy returns a normal code-execution object whose invocation dispatches that handle back to the extension. The coordinator records dispatch/running state before requesting the effect; progress, result, error, and cancellation travel through the bridge.

A prepared handle is bound to the registration generation, binding, action, and run. It is not a durable closure or permission token. Losing the runtime invalidates unexecuted preparation; recovery goes through the recorded action and fresh provider preparation.

The coordinator owns admission and honest lifecycle reporting, not the extension process itself. Native extension code still operates under the existing extension trust model; this bridge is not a new sandbox and cannot stop arbitrary code that bypasses the integration API. Mediated actions must honor current session lifecycle and authorization, and use provider-side external preconditions/idempotency as well.

### 11.4 Runtime ownership and multiple clients

Distinguish a logical integration ID from a live registration:

- The logical ID is extension-qualified, stable across reconnects, and separate from built-in IDs.
- A live registration identifies a contributing client/extension-host instance and a coordinator-issued generation. Its runtime and credential scope are not inferred from the logical ID.
- Each session binding within an authority selects exactly one runtime owner for that logical integration. Two registrations must not both run its controller for that binding. Independent fallback clients have different authorities; they may each run their separately enabled controller.

The initial client-bound model pins ownership to the contributing registration. Do not route automation to the last active window, merge observations from different accounts, or silently transfer ownership to another client that happens to have the extension installed. Any replacement owner requires an explicit coordinator-acknowledged rebind with compatible identity, scope, and configuration.

On revocation/rebind, advance the registration generation and reject old state updates, trigger requests, and unexecuted handles. This prevents stale connections from altering current state or starting new work. It cannot undo a native effect already dispatched to an extension; resolve that uncertainty before permitting a conflicting replacement attempt.

### 11.5 Disconnect, reconnect, and user-visible behavior

The coordinator publishes its own placement and the provider's runtime placement/availability separately. A provider cannot claim to be headless simply by setting a boolean; that capability follows from its actual coordinator, registration, and dependencies.

When a client-bound runtime disappears:

- Keep the artifact, its automation selections, checkpoints, and history.
- Mark last-known contribution/details state stale and the integration unavailable. Explain that monitoring/automation requires the contributing client runtime.
- Pause observation and new automatic execution; disable affected manual provider actions. Generic resource opening and client-owned general actions remain usable.
- Keep undispatched requests visibly blocked, not completed. Revalidate configuration, domain state, and runtime identity before resuming.
- A native action already dispatched may have run even if its result was lost. Record an interrupted/unknown outcome and require reconciliation, not automatic replay or failover.
- A prompt already committed to a chat remains an ordinary backend turn. An available coordinator continues tracking it; a disconnected fallback reconciles it through its chat adapter on return. Disconnection does not erase its run or justify another send; subsequent provider-dependent work waits for availability.

On reconnect, explicitly re-register/rebind, restore authoritative configuration/checkpoints, fetch fresh state, reconcile outstanding outcomes, and then reactivate the controller. Provider-defined bounded catch-up semantics still apply. Extension disablement/uninstallation follows the same unavailable boundary; reinstalling or upgrading does not grant broader automation consent.

A disconnect alone preserves saved enablement as user intent, with effective status paused/unavailable. Retry exhaustion is different: it persistently disables the control until user re-enablement. Do not pretend persistence makes the provider's schedule execute while its runtime is absent.

### 11.6 Scope boundary

This is the future extension path, not part of the first framework implementation. Keep local and proxy responsibilities separable now; defer the public API and concrete bridge until extension support is implemented.

Truly headless third-party integrations would require a separately designed agent-host contribution runtime: packaging, installation, isolation, credentials, permissions, upgrades, and lifecycle. Do not copy a normal extension bundle into the agent-host process or evaluate callbacks received from clients. Client fallback provides compatibility with older hosts, not headless execution.

## 12. Delivery sequence and acceptance criteria

The initial implementation follows this sequence without a real provider; validation of these stages remains pending:

1. Add platform-common contracts and implementations for registry/resource pooling, configuration, details, and execution state.
2. Add durable binding provenance, run claims, recovery, and native/prompt execution against typed environment APIs.
3. Compose agent-host and client-fallback adapters; negotiate capabilities, preserve authority identity, and coordinate local windows.
4. Add the host protocol projection and provider-neutral client facade, with the same structured presentation for either source.
5. Run shared behavior tests through both environments and targeted adapter tests, using synthetic integrations only. Production provider registration remains empty; the public extension bridge is later work.

The focused tests should prove the following:

| Scenario | Required observation |
| --- | --- |
| Two integrations match one URL | Both contribute independently; IDs and state never collide. |
| Multiple eligible main presenters | Stable designation across clients; unrelated sections survive an unavailable main presentation and fallback. |
| Main part, section, and detail item are activated | Main opens the artifact; section reveals its details in the chosen UI surface; item opens its own resource. No accidental bubbling or combined operation. |
| Business state changes | State actions update; general actions remain discoverable, subject to current authorization. Both have icons and labels. |
| Details are displayed in multiple UI surfaces | The same API and model feed hover, panel, or inline rendering; all consumers receive current state without provider-specific renderer logic. |
| A details surface receives live updates | Summary and detail rows update without losing that surface's focus/scroll; disappearing focused items have a defined focus fallback. |
| Details action and automation links | Action uses the existing tracked path; automation link reveals configuration without enabling it. Stale links cannot bypass current availability. |
| One of multiple details consumers releases its lease | Remaining consumers keep receiving updates. The last lease releases detail subscriptions without stopping independently enabled automation. |
| Detail load fails or is incomplete | Loading, stale/error, or partial state is explicit; unavailable/partial data is not presented as a complete empty list. |
| Same authority/integration/runtime/resource/account in two sessions | One resource observer, two independently configured bindings. |
| Different accounts, target hosts, or fallback authorities | No unintended shared credential-scoped model, configuration, or execution authority. |
| Duplicate recording and reference promotion | Original artifact ID and originating chat remain stable. |
| Defaults, unknown controls, or invalid enum values | No accidental automatic execution; explicit validation/unavailable state. |
| Two consumers update one authority's configuration | Conflict is detected; no silent last-writer overwrite. Independent fallback authorities retain separate selections. |
| Manual action in chat B, artifact originated in A | Manual prompt goes to B; automatic prompt goes to A. |
| Legacy/missing/deleted origin | Manual use remains possible; automatic prompts are blocked, not retargeted. |
| Busy chat and changing external state | One local queued occurrence; fresh preparation sends or skips. Best-effort backend queueing explicitly lacks a guaranteed second domain check at turn start. |
| Prompt finishes but its objective remains unmet | An explicit provider-requested `retryOf` can create a bounded successor even though the previous turn completed normally. Polling alone cannot. |
| Limit is N attempts and the provider requests attempt N+1 | No further dispatch; the responsible control changes to its disabled value with a persisted reason and last-run reference. Duplicate requests do not consume the budget. |
| Final allowed attempt resolves the objective | No unnecessary retry or false exhaustion notice; the framework does not equate the counter reaching N with business failure. |
| User re-enables an exhausted control | A new enablement generation/budget permits new work while preserving old claims/history; stale results cannot disable the new generation. |
| Provider reconnects after exhaustion | Control stays disabled; neither a new runtime nor a new request ID resets the saved budget or consent. |
| Duplicate trigger requests/reconnects | One durable claim and correlated turn. No repeated code execution or prompts. |
| Disable/archive/remove before dispatch | No new dispatch under stale authorization. Already accepted best-effort backend messages are separately cancelled/reconciled, with limits reported honestly. |
| Crash before/after native side effect | Unknown outcomes are visible and require reconciliation, not blind replay. |
| Crash between prompt dispatch and acknowledgement | Recovery finds the existing turn; when lookup is inconclusive, the run remains indeterminate rather than sending again. |
| Accepted request handle | Queue acceptance does not settle completion; the promise and observable state report the same confirmed terminal outcome. |
| Disconnect while awaiting completion | Completion stays pending, observation resumes after reconnect, and the prompt is not resent. |
| Caller closes and later reattaches | A new handle uses persisted identity/receipt to follow existing work, including a legacy turn identified by a saved turn receipt. |
| Handle is disposed or one of several observers closes | Only that observer and its local wait end; backend work and other handles remain unaffected. |
| Completion tracking loses its chat or correlation | Completion rejects with an explicit tracking error; the ledger stays uncertain and blocks conflicting retries until reconciliation. |
| Cancellation races acknowledgement or completion | A late handle receives pending cancellation; a finished request cannot cause a later human turn to be cancelled. |
| Host restart without a client | Enabled host-resident bindings recover and follow provider catch-up semantics; client-bound bindings remain visibly unavailable until rebound. |
| One integration errors or disappears | Other contributions and the generic artifact remain usable. |
| Polling changes and completed turns | No unintended new occurrence; turn completion does not imply a domain postcondition. |
| Headless runs and later reconnect | Consistent history shows queued, blocked, code, prompt, and terminal outcomes. |
| Lifetimes and accessibility | No leaked observers/timers; keyboard and accessible text expose the same capabilities. |

Prove shared-runtime compatibility before adding production providers:

| Scenario | Required observation |
| --- | --- |
| Same synthetic integration scenario in both environments | Same state transitions, control validation, coalescing, preparation, action outcomes, and details updates, apart from declared availability/storage scope. |
| Connected host lacks integration capability | Client fallback works through base session/chat APIs and sends no unsupported integration RPCs. |
| Capability is pending, connection fails, or policy denies execution | No fallback is inferred from failure and no restriction is bypassed. |
| Two windows share the fallback store | One local owner and durable claim; ownership loss fences pending dispatch and uncertain effects are reconciled. |
| Same session opens on another computer | Its automation remains off until explicitly enabled there; local history/configuration is not silently shared. |
| Independent computers both explicitly enable fallback | Independent execution is expected and disclosed; no cross-client exactly-once guarantee is claimed. |
| Host gains integration support | New local dispatch pauses; no automatic dual-owner migration or replay occurs. |
| Older host lacks atomic admission | Automatic prompts still use best-effort background delivery, preferring the ordinary non-steering queue; the weaker guarantee is explicit. |
| Another client starts work after the last idle check | Atomic mode rejects and re-prepares; best-effort mode uses available queueing without claiming last-moment revalidation or deliberately interrupting that work. |
| Backend accepts a queued message | Run stays submitted until its own turn starts; unrelated turn completion does not complete it. Missing pending item alone cannot justify resending. |
| Chat adapter reports busy or indeterminate | Busy work is re-prepared later; ambiguous sends are visible and not automatically replayed. |
| User has an unfinished new-session or target-chat draft | Automatic sending proceeds without clearing text/attachments, discarding the draft session, navigating, or moving focus. |
| Fallback lacks trusted origin or remote workspace access | Dependent actions are unavailable; no guessed destination or local-path substitution. |

For the later extension bridge, additionally prove:

| Scenario | Required observation |
| --- | --- |
| Client-bound and coordinator-local providers coexist | Same contribution/details and execution model in both compositions; runtime availability is explicit. |
| A second client lacks the extension in host mode | It can render authorized projected state and invoke permitted actions routed to the selected runtime owner; fallback does not promise cross-client projection. |
| Two clients advertise the same extension to one authority | One owner per logical integration binding; no duplicate controller or implicit credential/model sharing. |
| Runtime disconnects with automation enabled | Saved intent remains; effective execution pauses and cached state is marked stale/unavailable. |
| Runtime disappears before versus after native dispatch | Undispatched work blocks; ambiguous dispatched work is reconciled rather than replayed. |
| Matching crosses the extension bridge | Cancellation and errors are explicit; runtime unavailability is not interpreted as a negative match. |
| Reconnect replaces a registration | Fresh state and configuration are restored; old-generation updates and unexecuted handles are rejected. |
| Prompt is committed before its extension disconnects | The coordinator tracks or later reconciles the existing turn; recovery does not send a duplicate. |
| Details have consumers on multiple clients | Closing one surface releases only its lease, not another consumer's subscription or an independent controller. |
| Extension is disabled, uninstalled, or changes its action schema | Capabilities become unavailable or require compatible rebind/consent; existing selections cannot authorize new effects silently. |

The framework is successful when these behaviors hold without GitHub or experiment-specific conditionals in its registry, executor, protocol projection, or renderer.
