/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DisposableMap } from '../../../../../../../base/common/lifecycle.js';
import { Schemas } from '../../../../../../../base/common/network.js';
import { assertType } from '../../../../../../../base/common/types.js';
import { URI } from '../../../../../../../base/common/uri.js';
import { Position } from '../../../../../../../editor/common/core/position.js';
import { Range } from '../../../../../../../editor/common/core/range.js';
import { CompletionItem, CompletionItemKind } from '../../../../../../../editor/common/languages.js';
import { ITextModel } from '../../../../../../../editor/common/model.js';
import { ILanguageFeaturesService } from '../../../../../../../editor/common/services/languageFeatures.js';
import { CommandsRegistry } from '../../../../../../../platform/commands/common/commands.js';
import { Registry } from '../../../../../../../platform/registry/common/platform.js';
import { Extensions as WorkbenchExtensions, IWorkbenchContributionsRegistry } from '../../../../../../common/contributions.js';
import { LifecyclePhase } from '../../../../../../services/lifecycle/common/lifecycle.js';
import { ChatDynamicVariableModel } from '../../../attachments/chatDynamicVariables.js';
import { IChatInputCompletionItem, IChatSessionsService, isAgentHostTarget } from '../../../../common/chatSessionsService.js';
import { getChatSessionType } from '../../../../common/model/chatUri.js';
import { IChatWidget, IChatWidgetService } from '../../../chat.js';
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

	/** Per-scheme registrations of the Monaco completion provider. */
	private readonly _registrations = this._register(new DisposableMap<string>());

	constructor(
		@ILanguageFeaturesService languageFeaturesService: ILanguageFeaturesService,
		@IChatWidgetService private readonly _chatWidgetService: IChatWidgetService,
		@IChatSessionsService chatSessionsService: IChatSessionsService,
	) {
		super(languageFeaturesService, chatSessionsService);

		this._register(CommandsRegistry.registerCommand(AgentHostInputCompletions.addReferenceCommand, (_services, arg) => {
			assertType(arg instanceof AgentHostReferenceArgument);
			arg.widget.getContrib<ChatDynamicVariableModel>(ChatDynamicVariableModel.ID)?.addReference({
				id: arg.uri.toString(),
				range: arg.range,
				isFile: !arg.isDirectory,
				isDirectory: arg.isDirectory,
				fullName: arg.displayName,
				data: arg.uri,
				_meta: arg._meta,
			});
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

	protected override _buildItem(position: Position, item: IChatInputCompletionItem, widget: IChatWidget): CompletionItem {
		const replaceRange = AgentHostInputCompletions.computeRange(position, item);
		const attachment = item.attachment;
		switch (attachment.kind) {
			case 'command': {
				return {
					label: item.insertText,
					insertText: item.insertText,
					filterText: item.insertText,
					range: replaceRange,
					kind: CompletionItemKind.Text,
					detail: attachment.description,
				};
			}
			case 'skill': {
				const label = item.insertText.trimEnd();
				return {
					label: attachment.displayName ? { label, description: attachment.displayName } : label,
					insertText: item.insertText,
					filterText: item.insertText,
					range: replaceRange,
					kind: CompletionItemKind.Text,
					detail: attachment.description,
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
						arguments: [new AgentHostReferenceArgument(widget, attachment.uri, attachment.displayName, !!attachment.isDirectory, replaceRange.replace.setEndPosition(replaceRange.replace.startLineNumber, replaceRange.replace.startColumn + item.insertText.length), attachment._meta)],
					},
				};
			}
		}
	}
}

class AgentHostReferenceArgument {
	constructor(
		readonly widget: IChatWidget,
		readonly uri: URI,
		readonly displayName: string | undefined,
		readonly isDirectory: boolean,
		readonly range: Range,
		readonly _meta: Record<string, unknown> | undefined,
	) { }
}

Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench).registerWorkbenchContribution(AgentHostInputCompletions, LifecyclePhase.Eventually);
