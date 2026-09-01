/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { MutableDisposable } from '../../../../base/common/lifecycle.js';
import { autorun } from '../../../../base/common/observable.js';
import { URI } from '../../../../base/common/uri.js';
import { ICodeEditor } from '../../../../editor/browser/editorBrowser.js';
import { ICodeEditorService } from '../../../../editor/browser/services/codeEditorService.js';
import { Position } from '../../../../editor/common/core/position.js';
import { Range } from '../../../../editor/common/core/range.js';
import { CompletionItem, CompletionItemKind } from '../../../../editor/common/languages.js';
import { ITextModel } from '../../../../editor/common/model.js';
import { ILanguageFeaturesService } from '../../../../editor/common/services/languageFeatures.js';
import { CommandsRegistry } from '../../../../platform/commands/common/commands.js';
import { IChatInputCompletionItem, IChatSessionsService, isAgentHostTarget } from '../../../../workbench/contrib/chat/common/chatSessionsService.js';
import { getChatSessionType } from '../../../../workbench/contrib/chat/common/model/chatUri.js';
import { AgentHostInputCompletionsBase } from '../../../../workbench/contrib/chat/browser/widget/input/editor/agentHostInputCompletionsBase.js';
import { registerChatInputReferenceDecorationType } from '../../../../workbench/contrib/chat/browser/widget/input/editor/chatInputReferenceDecorations.js';
import { ISessionsManagementService } from '../../../services/sessions/common/sessionsManagement.js';

const ACCEPT_AUTOMATION_SKILL_COMPLETION_COMMAND = 'sessions.automations.acceptSkillCompletion';
const AUTOMATION_SKILL_DECORATION_TYPE = 'automation-skill-reference';

interface IAcceptAutomationSkillCompletionArgument {
	readonly handler: AutomationInputCompletions;
	readonly range: Range;
	readonly text: string;
}

CommandsRegistry.registerCommand(ACCEPT_AUTOMATION_SKILL_COMPLETION_COMMAND, (_accessor, argument: IAcceptAutomationSkillCompletionArgument) => {
	argument.handler.acceptCompletion(argument.range, argument.text);
});

export class AutomationInputCompletions extends AgentHostInputCompletionsBase<void, string> {

	private readonly registration = this._register(new MutableDisposable());
	private references: Array<{ decorationId: string; text: string }> = [];

	constructor(
		private readonly editor: ICodeEditor,
		@ILanguageFeaturesService languageFeaturesService: ILanguageFeaturesService,
		@IChatSessionsService chatSessionsService: IChatSessionsService,
		@ISessionsManagementService private readonly sessionsManagementService: ISessionsManagementService,
		@ICodeEditorService codeEditorService: ICodeEditorService,
	) {
		super(languageFeaturesService, chatSessionsService);

		this._register(registerChatInputReferenceDecorationType(codeEditorService, AUTOMATION_SKILL_DECORATION_TYPE));
		this._register(this.editor.onDidChangeModelContent(() => this.updateDecorations()));

		let currentScheme: string | undefined;
		this._register(autorun(reader => {
			const session = this.sessionsManagementService.automationSession.read(reader);
			const scheme = session ? getChatSessionType(session.resource) : undefined;
			if (scheme === currentScheme) {
				return;
			}
			currentScheme = scheme;
			this.registration.clear();
			if (scheme && isAgentHostTarget(scheme)) {
				void this.registerForScheme(scheme);
			}
		}));
	}

	private async registerForScheme(scheme: string): Promise<void> {
		const triggerCharacters = await this._chatSessionsService.getChatInputCompletionTriggerCharacters(scheme);
		if (!triggerCharacters?.length) {
			return;
		}

		const session = this.sessionsManagementService.automationSession.get();
		const editorUri = this.editor.getModel()?.uri;
		if (!session || getChatSessionType(session.resource) !== scheme || !editorUri) {
			return;
		}

		this.registration.value = this._registerProvider(
			{ scheme: editorUri.scheme, hasAccessToAllModels: true },
			`automationInputCompletions[${scheme}]`,
			triggerCharacters,
			scheme,
		);
	}

	protected override _resolveContext(model: ITextModel, scheme: string): { sessionResource: URI; context: void } | undefined {
		const session = this.sessionsManagementService.automationSession.get();
		if (model !== this.editor.getModel() || !session || getChatSessionType(session.resource) !== scheme) {
			return undefined;
		}
		return { sessionResource: session.resource, context: undefined };
	}

	protected override _buildItem(position: Position, item: IChatInputCompletionItem): CompletionItem | undefined {
		if (item.attachment.kind !== 'skill' && !(item.attachment.kind === 'command' && item.attachment.isSkill)) {
			return undefined;
		}
		const ranges = AutomationInputCompletions.computeRange(position, item);
		const referenceText = item.insertText.trimEnd();
		return {
			label: { label: item.label ?? item.insertText, description: item.attachment.description },
			insertText: item.insertText,
			filterText: item.insertText,
			range: ranges,
			documentation: item.attachment.description,
			kind: CompletionItemKind.Text,
			command: {
				id: ACCEPT_AUTOMATION_SKILL_COMPLETION_COMMAND,
				title: '',
				arguments: [{
					handler: this,
					range: ranges.replace.setEndPosition(ranges.replace.startLineNumber, ranges.replace.startColumn + referenceText.length),
					text: referenceText,
				} satisfies IAcceptAutomationSkillCompletionArgument],
			},
		};
	}

	acceptCompletion(range: Range, text: string): void {
		this.updateDecorations({ range, text });
	}

	private updateDecorations(accepted?: { range: Range; text: string }): void {
		const model = this.editor.getModel();
		if (!model) {
			this.references = [];
			return;
		}

		const references = this.references.flatMap(reference => {
			const range = model.getDecorationRange(reference.decorationId);
			return range && model.getValueInRange(range) === reference.text ? [{ range, text: reference.text }] : [];
		});
		if (accepted) {
			references.push(accepted);
		}
		const decorationIds = this.editor.setDecorationsByType('chat', AUTOMATION_SKILL_DECORATION_TYPE, references.map(reference => ({ range: reference.range })));
		this.references = decorationIds.map((decorationId, index) => ({ decorationId, text: references[index].text }));
	}
}
