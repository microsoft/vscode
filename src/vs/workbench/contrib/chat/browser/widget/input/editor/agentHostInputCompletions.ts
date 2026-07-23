/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DisposableMap } from '../../../../../../../base/common/lifecycle.js';
import { Schemas } from '../../../../../../../base/common/network.js';
import { assertType } from '../../../../../../../base/common/types.js';
import { URI } from '../../../../../../../base/common/uri.js';
import { AgentHostCompletionReferenceKind, toAgentHostCompletionVariableEntry, type IAgentHostCompletionVariableValue } from '../../../../common/attachments/chatVariableEntries.js';
import { Position } from '../../../../../../../editor/common/core/position.js';
import { Range } from '../../../../../../../editor/common/core/range.js';
import { CompletionItem, CompletionItemKind } from '../../../../../../../editor/common/languages.js';
import { ITextModel } from '../../../../../../../editor/common/model.js';
import { ILanguageFeaturesService } from '../../../../../../../editor/common/services/languageFeatures.js';
import { CommandsRegistry } from '../../../../../../../platform/commands/common/commands.js';
import { IConfigurationService } from '../../../../../../../platform/configuration/common/configuration.js';
import { IDialogService } from '../../../../../../../platform/dialogs/common/dialogs.js';
import { IStorageService } from '../../../../../../../platform/storage/common/storage.js';
import { IWorkspaceContextService } from '../../../../../../../platform/workspace/common/workspace.js';
import { IAgentHostService } from '../../../../../../../platform/agentHost/common/agentService.js';
import { getCompletionAction, type IAgentHostCompletionAction } from '../../../../../../../platform/agentHost/common/meta/agentCompletionAttachmentMeta.js';
import { Registry } from '../../../../../../../platform/registry/common/platform.js';
import { Extensions as WorkbenchExtensions, IWorkbenchContributionsRegistry } from '../../../../../../common/contributions.js';
import { LifecyclePhase } from '../../../../../../services/lifecycle/common/lifecycle.js';
import { ChatDynamicVariableModel } from '../../../attachments/chatDynamicVariables.js';
import { IChatInputCompletionItem, IChatSessionsService, isAgentHostTarget } from '../../../../common/chatSessionsService.js';
import { getChatSessionType } from '../../../../common/model/chatUri.js';
import { IChatWidget, IChatWidgetService } from '../../../chat.js';
import { applyAgentHostCompletionAction, isPolicyBlockedCompletionAction } from '../../../agentHostCompletionAction.js';
import { applyAgentHostSessionConfigChange } from '../../../agentSessions/agentHost/applyAgentHostSessionConfig.js';
import { IAgentHostSessionWorkingDirectoryResolver } from '../../../agentSessions/agentHost/agentHostSessionWorkingDirectoryResolver.js';
import { IAgentHostUntitledProvisionalSessionService } from '../../../agentSessions/agentHost/agentHostUntitledProvisionalSessionService.js';
import { AgentHostInputCompletionsBase } from './agentHostInputCompletionsBase.js';
/**
 * Completion provider that delegates `@`-mention (and other server-defined)
 * completions to the agent host for AHP-backed chat sessions.
 *
 * Registrations are made dynamically per content-provider scheme so each
 * connection can announce its own trigger characters via the protocol's
 * `InitializeResult.completionTriggerCharacters`. When a content provider
 * is registered, we ask it for its trigger chars and register a Monaco
 * completion provider scoped to that scheme; when it is unregistered we
 * tear the registration down.
 *
 * The provider uses the same `_addReferenceCmd` pattern as
 * `BuiltinDynamicCompletions`: when an item is accepted, a command runs
 * that adds an {@link IDynamicVariable} entry to the widget's variable
 * model so the resource becomes part of the outgoing user message.
 */
export class AgentHostInputCompletions extends AgentHostInputCompletionsBase<IChatWidget, string> {

	private static readonly addReferenceCommand = '_chatAgentHostAddReferenceCmd';
	private static readonly configActionCommand = '_chatAgentHostConfigActionCmd';

	/** Per-scheme registrations of the Monaco completion provider. */
	private readonly _registrations = this._register(new DisposableMap<string>());

	constructor(
		@ILanguageFeaturesService languageFeaturesService: ILanguageFeaturesService,
		@IChatWidgetService private readonly _chatWidgetService: IChatWidgetService,
		@IChatSessionsService chatSessionsService: IChatSessionsService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
	) {
		super(languageFeaturesService, chatSessionsService);

		this._register(CommandsRegistry.registerCommand(AgentHostInputCompletions.addReferenceCommand, (_services, arg) => {
			assertType(arg instanceof AgentHostReferenceArgument);
			arg.widget.getContrib<ChatDynamicVariableModel>(ChatDynamicVariableModel.ID)?.addReference({
				id: arg.id,
				range: arg.range,
				isFile: arg.isFile,
				isDirectory: arg.isDirectory,
				fullName: arg.displayName,
				data: arg.data,
				_meta: arg._meta,
			});
		}));

		// Accept handler for config-action completions (permission/mode toggles).
		// Applies the session-config change (with the elevated-permission
		// confirmation) and, for keep-text items, adds the argument-hint
		// reference. Toggle items insert nothing, so there is no text to remove.
		this._register(CommandsRegistry.registerCommand(AgentHostInputCompletions.configActionCommand, async (accessor, arg) => {
			assertType(arg instanceof AgentHostConfigActionArgument);
			const sessionResource = arg.widget.viewModel?.model.sessionResource;
			if (!sessionResource) {
				return;
			}
			const dialogService = accessor.get(IDialogService);
			const storageService = accessor.get(IStorageService);
			const services = {
				agentHostService: accessor.get(IAgentHostService),
				provisionalService: accessor.get(IAgentHostUntitledProvisionalSessionService),
				workingDirectoryResolver: accessor.get(IAgentHostSessionWorkingDirectoryResolver),
				workspaceContextService: accessor.get(IWorkspaceContextService),
				configurationService: accessor.get(IConfigurationService),
			};
			const applied = await applyAgentHostCompletionAction(arg.action, dialogService, storageService, async config => { await applyAgentHostSessionConfigChange(sessionResource, config, services); });
			if (applied && arg.reference) {
				arg.widget.getContrib<ChatDynamicVariableModel>(ChatDynamicVariableModel.ID)?.addReference({
					id: arg.reference.id,
					range: arg.reference.range,
					isFile: arg.reference.isFile,
					isDirectory: arg.reference.isDirectory,
					fullName: arg.reference.displayName,
					data: arg.reference.data,
					_meta: arg.reference._meta,
				});
			}
		}));

		// Sync existing registrations and observe changes.
		for (const scheme of this._chatSessionsService.getContentProviderSchemes()) {
			void this._registerForScheme(scheme);
		}
		this._register(this._chatSessionsService.onDidChangeContentProviderSchemes(({ added, removed }) => {
			for (const scheme of removed) {
				this._registrations.deleteAndDispose(scheme);
			}
			for (const scheme of added) {
				void this._registerForScheme(scheme);
			}
		}));
	}

	private async _registerForScheme(scheme: string): Promise<void> {
		if (!isAgentHostTarget(scheme)) {
			return;
		}
		const triggerCharacters = await this._chatSessionsService.getChatInputCompletionTriggerCharacters(scheme);
		if (!triggerCharacters || triggerCharacters.length === 0) {
			return;
		}

		// The provider may have been removed while we were awaiting the
		// trigger characters. Re-check before registering.
		if (!this._chatSessionsService.getContentProviderSchemes().includes(scheme)) {
			return;
		}

		this._registrations.set(scheme, this._registerProvider(
			{ scheme: Schemas.vscodeChatInput, hasAccessToAllModels: true },
			`agentHostChatInputCompletions[${scheme}]`,
			triggerCharacters,
			scheme,
		));
	}

	protected override _resolveContext(model: ITextModel, scheme: string): { sessionResource: URI; context: IChatWidget } | undefined {
		const widget = this._chatWidgetService.getWidgetByInputUri(model.uri);
		if (!widget?.viewModel) {
			return undefined;
		}
		const sessionResource = widget.viewModel.model.sessionResource;
		// Only respond when the active session is handled by the same
		// content provider that registered this Monaco provider.
		// Without this check, two providers sharing trigger characters
		// (e.g. both register `@`) would both fire and produce duplicate
		// RPCs / suggestions.
		if (getChatSessionType(sessionResource) !== scheme) {
			return undefined;
		}
		return { sessionResource, context: widget };
	}

	protected override _buildItem(position: Position, item: IChatInputCompletionItem, widget: IChatWidget): CompletionItem | undefined {
		const replaceRange = AgentHostInputCompletions.computeRange(position, item);
		const attachment = item.attachment;
		switch (attachment.kind) {
			case 'command': {
				const action = getCompletionAction(attachment._meta);
				if (action) {
					// Omit an elevated auto-approve toggle (Allow all / Assisted)
					// when enterprise policy disables global auto-approval, rather
					// than offering an item that would warn then clamp to Default.
					if (isPolicyBlockedCompletionAction(action, this._configurationService)) {
						return undefined;
					}
					// Config-action completion (permission/mode toggle). Keep-text
					// items (non-empty insertText) retain the `/command ` text and
					// add the argument-hint reference; toggle items insert nothing.
					const keep = item.insertText !== '';
					const label = item.label ?? item.insertText;
					const reference = keep
						? AgentHostReferenceArgument.forCommand(widget, attachment.command, attachment.description, AgentHostInputCompletions._insertedTokenRange(replaceRange, item.insertText), attachment._meta)
						: undefined;
					return {
						label: { label, description: attachment.description },
						insertText: item.insertText,
						filterText: label,
						range: replaceRange,
						kind: CompletionItemKind.Text,
						detail: attachment.description,
						command: {
							id: AgentHostInputCompletions.configActionCommand,
							title: '',
							arguments: [new AgentHostConfigActionArgument(widget, action, reference)],
						},
					};
				}
				return {
					label: { label: item.insertText, description: attachment.description },
					insertText: item.insertText,
					filterText: item.insertText,
					range: replaceRange,
					kind: CompletionItemKind.Text,
					detail: attachment.description,
					command: {
						id: AgentHostInputCompletions.addReferenceCommand,
						title: '',
						arguments: [AgentHostReferenceArgument.forCommand(widget, attachment.command, attachment.description, AgentHostInputCompletions._insertedTokenRange(replaceRange, item.insertText), attachment._meta)],
					},
				};
			}
			case 'skill': {
				const label = attachment.displayName ? '/' + attachment.displayName : item.insertText.trimEnd();
				return {
					label: { label, description: attachment.description },
					insertText: item.insertText,
					filterText: item.insertText,
					range: replaceRange,
					kind: CompletionItemKind.Text,
					detail: attachment.description,
					command: {
						id: AgentHostInputCompletions.addReferenceCommand,
						title: '',
						arguments: [AgentHostReferenceArgument.forSkill(widget, attachment.uri, attachment.displayName, AgentHostInputCompletions._insertedTokenRange(replaceRange, item.insertText), attachment._meta)],
					},
				};
			}
			default: {
				const label = attachment.displayName ?? item.insertText;
				const description = attachment.uri.path;
				return {
					label: { label, description },
					insertText: item.insertText,
					filterText: item.insertText,
					range: replaceRange,
					kind: attachment.isDirectory ? CompletionItemKind.Folder : CompletionItemKind.File,
					command: {
						id: AgentHostInputCompletions.addReferenceCommand,
						title: '',
						arguments: [AgentHostReferenceArgument.forResource(widget, attachment.uri, attachment.displayName, !!attachment.isDirectory, AgentHostInputCompletions._insertedRange(replaceRange, item.insertText), attachment._meta)],
					},
				};
			}
		}
	}

	private static _insertedRange(replaceRange: { replace: Range }, insertText: string): Range {
		return replaceRange.replace.setEndPosition(replaceRange.replace.startLineNumber, replaceRange.replace.startColumn + insertText.length);
	}

	private static _insertedTokenRange(replaceRange: { replace: Range }, insertText: string): Range {
		return this._insertedRange(replaceRange, insertText.trimEnd());
	}
}

class AgentHostReferenceArgument {
	private constructor(
		readonly widget: IChatWidget,
		readonly id: string,
		readonly data: URI | IAgentHostCompletionVariableValue,
		readonly displayName: string | undefined,
		readonly isFile: boolean,
		readonly isDirectory: boolean,
		readonly range: Range,
		readonly _meta: Record<string, unknown> | undefined,
	) { }

	static forResource(widget: IChatWidget, uri: URI, displayName: string | undefined, isDirectory: boolean, range: Range, _meta: Record<string, unknown> | undefined): AgentHostReferenceArgument {
		return new AgentHostReferenceArgument(widget, uri.toString(), uri, displayName, !isDirectory, isDirectory, range, _meta);
	}

	static forSkill(widget: IChatWidget, uri: URI, displayName: string | undefined, range: Range, _meta: Record<string, unknown> | undefined): AgentHostReferenceArgument {
		const entry = toAgentHostCompletionVariableEntry(AgentHostCompletionReferenceKind.Skill, displayName ?? uri.toString(), uri, _meta);
		return new AgentHostReferenceArgument(widget, entry.id, entry.value, displayName, false, false, range, _meta);
	}

	static forCommand(widget: IChatWidget, command: string, description: string | undefined, range: Range, _meta: Record<string, unknown> | undefined): AgentHostReferenceArgument {
		const entry = toAgentHostCompletionVariableEntry(AgentHostCompletionReferenceKind.Command, description ?? command, command, _meta);
		return new AgentHostReferenceArgument(widget, entry.id, entry.value, description, false, false, range, _meta);
	}
}

/**
 * Argument passed to the config-action accept command. Carries the target
 * widget, the {@link IAgentHostCompletionAction} to apply, and — for keep-text
 * items — the argument-hint reference to add once applied. Toggle items insert
 * nothing, so no text needs to be removed.
 */
class AgentHostConfigActionArgument {
	constructor(
		readonly widget: IChatWidget,
		readonly action: IAgentHostCompletionAction,
		readonly reference: AgentHostReferenceArgument | undefined,
	) { }
}

Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench).registerWorkbenchContribution(AgentHostInputCompletions, LifecyclePhase.Eventually);
