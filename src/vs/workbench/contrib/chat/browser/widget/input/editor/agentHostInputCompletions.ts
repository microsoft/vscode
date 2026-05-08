/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../../../../base/common/cancellation.js';
import { Disposable, DisposableMap } from '../../../../../../../base/common/lifecycle.js';
import { Schemas } from '../../../../../../../base/common/network.js';
import { assertType } from '../../../../../../../base/common/types.js';
import { URI } from '../../../../../../../base/common/uri.js';
import { Position } from '../../../../../../../editor/common/core/position.js';
import { Range } from '../../../../../../../editor/common/core/range.js';
import { CompletionContext, CompletionItem, CompletionItemKind, CompletionList } from '../../../../../../../editor/common/languages.js';
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
export class AgentHostInputCompletions extends Disposable {

	private static readonly addReferenceCommand = '_chatAgentHostAddReferenceCmd';

	/** Per-scheme registrations of the Monaco completion provider. */
	private readonly _registrations = this._register(new DisposableMap<string>());

	constructor(
		@ILanguageFeaturesService private readonly _languageFeaturesService: ILanguageFeaturesService,
		@IChatWidgetService private readonly _chatWidgetService: IChatWidgetService,
		@IChatSessionsService private readonly _chatSessionsService: IChatSessionsService,
	) {
		super();

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

		const registration = this._languageFeaturesService.completionProvider.register({ scheme: Schemas.vscodeChatInput, hasAccessToAllModels: true }, {
			_debugDisplayName: `agentHostChatInputCompletions[${scheme}]`,
			triggerCharacters: [...triggerCharacters],
			provideCompletionItems: (model, position, context, token) => this._provide(model, position, context, token, scheme),
		});
		this._registrations.set(scheme, registration);
	}

	private async _provide(model: ITextModel, position: Position, _context: CompletionContext, token: CancellationToken, scheme: string): Promise<CompletionList | null> {
		const widget = this._chatWidgetService.getWidgetByInputUri(model.uri);
		if (!widget?.viewModel) {
			return null;
		}

		const sessionResource = widget.viewModel.model.sessionResource;
		// Only respond when the active session is handled by the same
		// content provider that registered this Monaco provider.
		if (getChatSessionType(sessionResource) !== scheme) {
			return null;
		}

		const text = model.getValue();
		const offset = model.getOffsetAt(position);
		const result = await this._chatSessionsService.provideChatInputCompletions(sessionResource, { text, offset }, token);
		if (token.isCancellationRequested || !result) {
			return null;
		}

		const suggestions: CompletionItem[] = [];
		for (const item of result.items) {
			suggestions.push(this._toMonacoItem(position, widget, item));
		}
		return { suggestions };
	}

	private _toMonacoItem(position: Position, widget: IChatWidget, item: IChatInputCompletionItem): CompletionItem {
		const replaceRange = this._computeRange(position, item);
		const label = item.attachment.displayName ?? item.insertText;
		const description = item.attachment.uri.path;
		return {
			label: { label, description },
			insertText: item.insertText,
			filterText: item.insertText,
			range: replaceRange,
			kind: item.attachment.isDirectory ? CompletionItemKind.Folder : CompletionItemKind.File,
			command: {
				id: AgentHostInputCompletions.addReferenceCommand,
				title: '',
				arguments: [new AgentHostReferenceArgument(widget, item.attachment.uri, item.attachment.displayName, !!item.attachment.isDirectory, replaceRange.replace.setEndPosition(replaceRange.replace.startLineNumber, replaceRange.replace.startColumn + item.insertText.length), item.attachment._meta)],
			},
		};
	}

	private _computeRange(position: Position, item: IChatInputCompletionItem): { insert: Range; replace: Range } {
		// Positions returned by the provider are already 1-based Monaco
		// positions, so they can be used directly. When omitted, default
		// to a zero-length range at the cursor (Monaco then inserts
		// without replacing).
		const start = item.start ?? position;
		const end = item.end ?? position;
		const replace = new Range(start.lineNumber, start.column, end.lineNumber, end.column);
		const insert = new Range(start.lineNumber, start.column, position.lineNumber, position.column);
		return { insert, replace };
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
