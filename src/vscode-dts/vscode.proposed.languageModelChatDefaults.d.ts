/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {
	export enum LanguageModelChatDefaultsStatus {
		Available = 1,
		Unavailable = 2,
		Unsupported = 3,
	}

	export enum LanguageModelChatDefaultsSource {
		Scoped = 1,
		Profile = 2,
		Default = 3,
	}

	export enum LanguageModelChatDefaultsOutcome {
		Applied = 1,
		Conflict = 2,
		Failed = 3,
	}

	/** Host support only. This does not attest to a chat participant's request forwarding. */
	export interface LanguageModelChatDefaultsCapabilities {
		readonly version: 1;
		readonly scopeAwareDefaults: true;
		readonly numericSuggestions: true;
		readonly customNumericValues: true;
		readonly requestConfigurationFidelity: boolean;
	}

	export interface LanguageModelChatDefaultsTarget {
		/** Opaque, host-lifetime identity. Do not persist, interpret, or construct this value. */
		readonly id: string;
		readonly label: string;
	}

	export interface LanguageModelChatDefaultsSnapshot {
		readonly targetId: string;
		/** An unavailable schema/model is not an empty/default configuration. */
		readonly status: LanguageModelChatDefaultsStatus;
		readonly schema?: LanguageModelConfigurationSchema;
		/** Raw native overrides. A present empty scoped entry suppresses the profile fallback. */
		readonly preferences: { readonly scoped?: Readonly<Record<string, unknown>>; readonly profile?: Readonly<Record<string, unknown>> };
		readonly effective: Readonly<Record<string, unknown>>;
		readonly sources: Readonly<Record<string, LanguageModelChatDefaultsSource>>;
		/** Opaque concurrency token over the target, schema, and relevant preferences. */
		readonly revision: string;
	}

	export interface LanguageModelChatDefaultsPatch {
		/** Partial scalar overrides. Unknown, read-only or unsupported properties reject the patch. */
		readonly set?: Readonly<Record<string, unknown>>;
		/** Properties to return to their current schema defaults; must not also appear in set. */
		readonly reset?: readonly string[];
	}

	export interface LanguageModelChatDefaultsUpdateResult {
		/** A stale revision conflicts before writing. A conflict detected during readback or a failed operation may have partially persisted. */
		readonly outcome: LanguageModelChatDefaultsOutcome;
		/** Observed state, including after a conflict or partial failure. Never automatically replay a patch. */
		readonly snapshot: LanguageModelChatDefaultsSnapshot;
	}

	/**
	 * Provider-owned defaults for NEW chats, not a workspace setting or existing-chat editor.
	 * Native picker changes and this API share the scoped bucket and profile mirror. Existing
	 * chat snapshots remain unchanged. The stores are not transactional, nor is a revision
	 * a cross-window storage lock. Request-local forwarding must be qualified separately.
	 *
	 * Version 1 supports the shared Local panel/chat-editor target (not inline chat). Session-
	 * targeted pools and managed Auto are excluded. Editable controls are scalar enums and
	 * bounded positive safe integers with suggestedValues; composite schemas are rejected. Reset
	 * requires a valid explicit schema default. No credentials or general settings are exposed.
	 */
	export interface LanguageModelChatDefaults {
		readonly capabilities: LanguageModelChatDefaultsCapabilities;
		/** Invalidation only: reread, and retain unsaved UI drafts separately. */
		readonly onDidChange: Event<{ readonly targetId: string }>;
		getTargets(): Thenable<readonly LanguageModelChatDefaultsTarget[]>;
		inspect(targetId: string): Thenable<LanguageModelChatDefaultsSnapshot>;
		update(targetId: string, patch: LanguageModelChatDefaultsPatch, expectedRevision: string): Thenable<LanguageModelChatDefaultsUpdateResult>;
	}

	export namespace lm {
		/**
		 * Access defaults only for a model contributed by this extension's currently registered
		 * provider. The model must be an actual LanguageModelChat returned by the editor, not a
		 * reconstructed ID. Foreign provider access rejects. Requires the proposed
		 * languageModelChatDefaults API (and chatProvider for the configuration schema).
		 */
		export function getChatModelDefaults(model: LanguageModelChat): Thenable<LanguageModelChatDefaults>;
	}
}
