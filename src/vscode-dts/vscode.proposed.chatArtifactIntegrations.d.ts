/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/* eslint-disable local/vscode-dts-string-type-literals, local/vscode-dts-literal-or-types -- Snapshots and outcomes use the framework's serializable discriminated contracts. */

declare module 'vscode' {

	export type ChatArtifactAvailability =
		| { readonly kind: 'available' | 'loading' }
		| { readonly kind: 'authenticationRequired' | 'stale' | 'unavailable' | 'error'; readonly reason: string };

	/** Plain-text presentation shared by artifact pills and other artifact surfaces. */
	export interface ChatArtifactPresentation {
		readonly label: string;
		readonly icon: ThemeIcon;
		readonly description?: string;
		readonly detailsId: string;
	}

	export interface ChatArtifactSection extends ChatArtifactPresentation {
		readonly id: string;
	}

	export interface ChatArtifactActionReference {
		readonly id: string;
		readonly enabled: boolean;
		readonly disabledReason?: string;
	}

	export interface ChatArtifactAutomationReference {
		readonly id: string;
		readonly available: boolean;
		readonly unavailableReason?: string;
		/** May prevent new consent without pausing an already enabled rule. */
		readonly enablement?: { readonly enabled: boolean; readonly disabledReason?: string };
	}

	/** Surface-neutral details. Resource links never execute commands. */
	export interface ChatArtifactDetails {
		/** Main details supply the full resource title, rather than its compact pill label. */
		readonly title: string;
		/** Main details supply the actual resource description; list details can explain the list's scope or contents. */
		readonly description?: string;
		/** Defaults to plain text. Markdown is untrusted and may be presented as plain text. */
		readonly descriptionFormat?: 'plaintext' | 'markdown';
		readonly availability?: ChatArtifactAvailability;
		readonly facts?: readonly { readonly id: string; readonly label: string; readonly value: string }[];
		readonly actions?: readonly string[];
		readonly automations?: readonly string[];
		readonly items?: readonly {
			readonly id: string;
			readonly icon: ThemeIcon;
			readonly label: string;
			readonly description?: string;
			readonly resource: Uri;
		}[];
		readonly completeness?: 'complete' | 'partial';
	}

	export interface ChatArtifactDetailsModel extends Disposable {
		readonly details: ChatArtifactDetails;
		readonly onDidChange: Event<void>;
		/** Present while a partial details model can fetch another page. */
		loadMore?(token: CancellationToken): ProviderResult<void>;
	}

	/** A complete presentation snapshot; replacing it and firing onDidChange updates every observing surface. */
	export interface ChatArtifactIntegrationState {
		readonly availability?: ChatArtifactAvailability;
		readonly main?: ChatArtifactPresentation;
		/**
		 * How this artifact contributes to a group of several artifacts of this provider, which shows the icon
		 * with the highest priority among them, for example a failing pull request's icon over an open one's.
		 * Priorities are only compared among this provider's artifacts, and only when this provider presents
		 * the artifact's main part.
		 */
		readonly group?: { readonly icon: ThemeIcon; readonly priority: number };
		readonly sections?: readonly ChatArtifactSection[];
		/** Independent state lists. Their optional icons remain available even without a corresponding pill section. */
		readonly lists?: readonly { readonly id: string; readonly label: string; readonly icon?: ThemeIcon; readonly detailsId: string }[];
		/** Actions relevant to the current resource state. Omit inapplicable actions; disable those temporarily blocked. */
		readonly stateActions?: readonly ChatArtifactActionReference[];
		readonly generalActions?: readonly ChatArtifactActionReference[];
		readonly automationAvailability?: readonly ChatArtifactAutomationReference[];
	}

	export type ChatArtifactJsonValue = null | boolean | number | string | readonly ChatArtifactJsonValue[] | { readonly [key: string]: ChatArtifactJsonValue };

	export type ChatArtifactActionResult =
		| { readonly kind: 'completed'; readonly summary: string }
		| { readonly kind: 'skipped'; readonly reason: string };

	export type ChatArtifactActionReconciliation =
		| { readonly kind: 'completed'; readonly summary: string }
		| { readonly kind: 'notExecuted' }
		| { readonly kind: 'indeterminate'; readonly reason: string };

	export interface ChatArtifactActionContext {
		readonly runId: string;
		readonly source: 'manual' | 'automation';
		/** Who started the run: a person, an agent through its tools after the tool approval policy allowed it, or an automation rule. */
		readonly initiator: 'user' | 'agent' | 'automation';
		readonly optionId?: string;
		readonly input?: ChatArtifactJsonValue;
	}

	export interface ChatArtifactActionDescriptor {
		readonly id: string;
		readonly label: string;
		readonly icon: ThemeIcon;
		/** Change this when the action's effects or required permissions expand. */
		readonly consentVersion?: string;
	}

	export interface ChatArtifactCodeAction extends ChatArtifactActionDescriptor {
		readonly kind?: 'code';
		readonly executionScope: 'resource' | 'resourceAndWorkspace';
		/** Revalidates state and permissions before the editor reserves the external effect. */
		prepare(context: ChatArtifactActionContext, token: CancellationToken): ProviderResult<{ readonly kind: 'ready' } | { readonly kind: 'skipped'; readonly reason: string }>;
		/** Revalidate state and required permissions before changing the resource; cancellation does not imply rollback. */
		run(context: ChatArtifactActionContext, token: CancellationToken): ProviderResult<ChatArtifactActionResult | void>;
		/** Checks an uncertain outcome without repeating the mutation. */
		reconcile?(runId: string, token: CancellationToken): ProviderResult<ChatArtifactActionReconciliation>;
	}

	export interface ChatArtifactPrompt {
		readonly text: string;
	}

	export interface ChatArtifactPromptAction extends ChatArtifactActionDescriptor {
		readonly kind: 'prompt';
		/** Prepares text without sending it. The editor routes and tracks the ordinary chat turn, with its normal permissions. */
		providePrompt(context: ChatArtifactActionContext, token: CancellationToken): ProviderResult<ChatArtifactPrompt | { readonly kind: 'skipped'; readonly reason: string }>;
	}

	export type ChatArtifactAction = ChatArtifactCodeAction | ChatArtifactPromptAction;

	export interface ChatArtifactAutomationOptionDescriptor {
		readonly id: string;
		readonly label: string;
		/** Explains the automatic effects in the control and the enablement chat notice. */
		readonly description: string;
		readonly actionIds: readonly string[];
		/** Maximum dispatched attempts per occurrence and consent generation. */
		readonly maxAttempts: number;
		/** Change this when the rule's meaning, schedule, or permissions expand. */
		readonly consentVersion?: string;
	}

	export type ChatArtifactAutomationOption = ChatArtifactAutomationOptionDescriptor & (
		| { readonly kind: 'boolean'; readonly defaultValue: false }
		| {
			readonly kind: 'enum';
			readonly choices: readonly { readonly value: string; readonly label: string; readonly description?: string }[];
			readonly disabledValue: string;
			/** Must equal disabledValue; only the user can enable automation. */
			readonly defaultValue: string;
		}
	);

	export interface ChatArtifactAutomationConfiguration {
		readonly revision: number;
		readonly values: Readonly<Record<string, boolean | string>>;
		readonly generations: Readonly<Record<string, number>>;
		/** Milliseconds since the epoch when each current consent generation was enabled. */
		readonly enabledAt: Readonly<Record<string, number>>;
		readonly disablements: Readonly<Record<string, { readonly reason: string; readonly attempts: number; readonly lastRunId?: string }>>;
	}

	export interface ChatArtifactAutomationRequest {
		readonly optionId: string;
		readonly actionId: string;
		readonly configurationRevision: number;
		/** Stable identity of the trigger occurrence, reused after reloads to prevent duplicate dispatch. */
		readonly occurrenceKey: string;
		readonly reason: string;
		readonly input?: ChatArtifactJsonValue;
		/** Only a settled, unambiguous attempt may be retried. */
		readonly retryOf?: string;
	}

	export interface ChatArtifactRun {
		readonly id: string;
		readonly actionId: string;
		readonly source: 'manual' | 'automation';
		readonly state: 'queued' | 'preparing' | 'blocked' | 'submitted' | 'running' | 'completed' | 'skipped' | 'failed' | 'cancelled' | 'interrupted';
		readonly reason: string;
		readonly createdAt: number;
		readonly updatedAt: number;
		readonly optionId?: string;
		readonly generation?: number;
		readonly occurrenceKey?: string;
		readonly dispatched: boolean;
		readonly indeterminate?: boolean;
	}

	export interface ChatArtifactAutomationState {
		read(): { readonly revision: number; readonly value?: ChatArtifactJsonValue };
		/** Durably replaces this binding's JSON checkpoint, rejecting a stale revision. Never store credentials here. */
		write(expectedRevision: number, value: ChatArtifactJsonValue): Thenable<void>;
	}

	/** One recorded artifact in one session, not shared with other recordings of the same resource. */
	export interface ChatArtifactAutomationContext {
		readonly configuration: ChatArtifactAutomationConfiguration;
		readonly runs: readonly ChatArtifactRun[];
		readonly state: ChatArtifactAutomationState;
		readonly onDidChange: Event<void>;
		/** Requests authorized, deduplicated work; automatic prompts always target the artifact's original chat. */
		runAutomation(request: ChatArtifactAutomationRequest): Thenable<ChatArtifactRun>;
		reconcileRun(runId: string): Thenable<void>;
		/** Revokes consent, never grants or broadens it. */
		disableAutomation(optionId: string, expectedRevision: number, reason: string): Thenable<void>;
	}

	/** A resource observation shared across recorded artifacts until its last consumer is released. */
	export interface ChatArtifactIntegration extends Disposable {
		readonly state: ChatArtifactIntegrationState;
		/** Action definitions remain stable for this observation's lifetime. */
		readonly actions: readonly ChatArtifactAction[];
		readonly onDidChange: Event<void>;
		/** Acquires independently updating, optionally paged details for an ID exposed by the current state. */
		acquireDetails(detailsId: string): ChatArtifactDetailsModel;
		/** Active only while consent, session and runtime permit automation. Release timers and subscriptions on cancellation/disposal. */
		activateAutomation?(context: ChatArtifactAutomationContext, token: CancellationToken): ProviderResult<Disposable>;
	}

	export interface ChatArtifactResourceMatch {
		readonly kind: 'matched';
		readonly resource: Uri;
		/** Stable canonical identity for aliases of the same resource. */
		readonly key: string;
		/** Stable identity of the account or credential set used to access this resource, not of the resource itself. Saved consent never carries over to a different credential scope. */
		readonly credentialScope: string;
	}

	export type ChatArtifactMatchResult = ChatArtifactResourceMatch | {
		readonly kind: 'authenticationRequired';
		readonly reason: string;
		readonly main: ChatArtifactPresentation;
	};

	export interface ChatArtifactIntegrationProvider {
		/** One line of plain text, at most 100 characters. */
		readonly label: string;
		/** Names the recorded resources this provider supports, such as "Experiment links on example.com", so agents know when to use it. One line of plain text, at most 300 characters. */
		readonly description?: string;
		/** Names several of this provider's artifacts when they are grouped, such as "Experiments". One line of plain text, at most 100 characters. */
		readonly groupLabel?: string;
		/** Stable for this registration's lifetime. Every referenced action must exist on each observation. Option and choice labels are one line of plain text, at most 100 characters. */
		readonly automationOptions?: readonly ChatArtifactAutomationOption[];
		/** Invalidates matching and existing resource observations, for example after an account change. */
		readonly onDidChange?: Event<void>;
		/** Match only supported resources; never authenticate interactively or mutate state here. */
		// eslint-disable-next-line local/vscode-dts-provider-naming
		match(resource: Uri, token: CancellationToken): ProviderResult<ChatArtifactMatchResult | undefined>;
		/**
		 * Signs in interactively when the user chooses Sign In for a resource whose match reported `authenticationRequired`,
		 * for example with `authentication.getSession(..., { createIfNone: true })`. Credentials stay in this extension;
		 * matching runs again afterwards.
		 */
		// eslint-disable-next-line local/vscode-dts-provider-naming
		signIn?(resource: Uri, token: CancellationToken): ProviderResult<void>;
		/** Creates an observation for a matched resource. Cancelled or unused observations are disposed. */
		// eslint-disable-next-line local/vscode-dts-provider-naming
		createArtifactIntegration(resource: Uri, token: CancellationToken): ProviderResult<ChatArtifactIntegration>;
	}

	namespace chat {
		/**
		 * Enriches explicitly recorded chat artifacts and references, without discovering or recording resources.
		 * Use the `onChatArtifactIntegration` activation event to register lazily.
		 *
		 * @param id An identifier unique within the extension.
		 * @param provider Supplies state, details, actions and opt-in automation in this extension host.
		 * @returns A registration whose disposal releases the provider's observations.
		 */
		export function registerArtifactIntegrationProvider(id: string, provider: ChatArtifactIntegrationProvider): Disposable;
	}
}
