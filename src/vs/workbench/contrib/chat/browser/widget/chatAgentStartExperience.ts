/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { MarkdownString } from '../../../../../base/common/htmlContent.js';
import { Disposable, DisposableMap, DisposableStore, IDisposable } from '../../../../../base/common/lifecycle.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { URI } from '../../../../../base/common/uri.js';
import { generateUuid } from '../../../../../base/common/uuid.js';
import { MenuId, MenuRegistry } from '../../../../../platform/actions/common/actions.js';
import { CommandsRegistry, ICommandService } from '../../../../../platform/commands/common/commands.js';
import { ContextKeyExpr } from '../../../../../platform/contextkey/common/contextkey.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../../common/contributions.js';
import { ChatContextKeys } from '../../common/actions/chatContextKeys.js';
import { IChatQuestion, IChatQuestionAnswerValue } from '../../common/chatService/chatService.js';
import { IValue, PromptHeaderAttributes } from '../../common/promptSyntax/promptFileParser.js';
import { IPromptsService } from '../../common/promptSyntax/service/promptsService.js';
import { IChatWidget, IChatWidgetService } from '../chat.js';

/**
 * What a custom agent shows before the model is involved, from its agent file:
 *
 * ```yaml
 * commands:              # buttons in the chat input while the agent is selected
 *   - name: repro
 *     label: Add steps to reproduce
 *     icon: list-ordered
 *     prompt: "Steps to reproduce:\n1. "   # appended to the input (`send: true` sends it)
 *   - name: screenshot
 *     label: Attach a screenshot
 *     command: workbench.action.chat.attachAppWindowScreenshot   # runs with { sessionResource }
 * start-form:            # shown in a new, empty chat; submitting it sends the answers
 *   message: Tell the agent about the bug
 *   questions:           # the format of the askQuestions tool
 *     - { id: what, type: text, title: What is wrong? }
 * ```
 */
interface IAgentCommand {
	readonly name: string;
	readonly label: string;
	readonly icon?: string;
	readonly prompt?: string;
	readonly send?: boolean;
	readonly command?: string;
}

interface IAgentStartForm {
	readonly message?: string;
	readonly questions: readonly IChatQuestion[];
}

interface IAgentStartExperience {
	readonly agentName: string;
	readonly commands: readonly IAgentCommand[];
	readonly startForm: IAgentStartForm | undefined;
	/** Markdown for the empty chat; `command:<name>` links run the agent's own commands. */
	readonly welcome: string | undefined;
}

/** The VS Code command behind an agent command: a valid command URI path, so welcome links can run it. */
function agentCommandId(agentName: string, commandName: string): string {
	const slug = (value: string) => value.toLowerCase().replace(/[^a-z0-9-]+/g, '-');
	return `_chat.agentCommand.${slug(agentName)}.${slug(commandName)}`;
}

export class ChatAgentStartExperienceContribution extends Disposable implements IWorkbenchContribution {
	static readonly ID = 'workbench.contrib.chatAgentStartExperience';

	private readonly _widgets = this._register(new DisposableMap<IChatWidget>());
	/** Menu items and commands per agent command, registered once and kept up to date. */
	private readonly _commandRegistrations = new Map<string, { definition: IAgentCommand; readonly registration: IDisposable }>();
	/** Widgets whose current (empty) chat already got the start form, by the chat's session. */
	private readonly _formShown = new WeakMap<IChatWidget, string>();

	constructor(
		@IChatWidgetService private readonly _chatWidgetService: IChatWidgetService,
		@IPromptsService private readonly _promptsService: IPromptsService,
		@ICommandService private readonly _commandService: ICommandService,
		@ILogService private readonly _logService: ILogService,
	) {
		super();
		this._chatWidgetService.getAllWidgets().forEach(widget => this._attach(widget));
		this._register(this._chatWidgetService.onDidAddWidget(widget => this._attach(widget)));
		this._register(this._chatWidgetService.onDidRemoveWidget(widget => this._widgets.deleteAndDispose(widget)));
		this._register({ dispose: () => this._commandRegistrations.forEach(entry => entry.registration.dispose()) });
	}

	private _attach(widget: IChatWidget): void {
		if (this._widgets.has(widget)) {
			return;
		}
		const store = new DisposableStore();
		const update = () => void this._update(widget).catch(error => this._logService.error('[ChatAgentStartExperience]', error));
		store.add(widget.input.onDidChangeCurrentChatMode(update));
		store.add(widget.onDidChangeViewModel(update));
		this._widgets.set(widget, store);
		update();
	}

	private async _update(widget: IChatWidget): Promise<void> {
		const mode = widget.input.currentModeObs.get();
		const uri = mode.uri?.get();
		if (!uri || mode.isBuiltin) {
			widget.setAgentWelcome?.(undefined);
			return;
		}
		const experience = await this._read(mode.name.get(), uri);
		if (!experience || widget.input.currentModeObs.get().id !== mode.id) {
			return;
		}
		experience.commands.forEach(command => this._registerCommand(experience.agentName, command));
		widget.setAgentWelcome?.(experience.welcome ? {
			title: experience.agentName,
			icon: Codicon.chatSparkle,
			message: this._welcomeMarkdown(experience, widget.viewModel?.sessionResource),
		} : undefined);
		if (experience.startForm) {
			this._showStartForm(widget, experience.startForm);
		}
	}

	/** Trusts exactly the agent's own commands, and passes them the chat they were clicked in. */
	private _welcomeMarkdown(experience: IAgentStartExperience, sessionResource: URI | undefined): MarkdownString {
		const ids: string[] = [];
		const value = experience.welcome!.replace(/\]\(command:([\w-]+)\)/g, (link, name: string) => {
			if (!experience.commands.some(command => command.name === name)) {
				return link;
			}
			const id = agentCommandId(experience.agentName, name);
			ids.push(id);
			const args = encodeURIComponent(JSON.stringify([{ sessionResource: sessionResource?.toString() }]));
			return `](command:${id}?${args})`;
		});
		return new MarkdownString(value, { isTrusted: { enabledCommands: ids }, supportThemeIcons: true });
	}

	private async _read(agentName: string, uri: URI): Promise<IAgentStartExperience | undefined> {
		const header = (await this._promptsService.parseNew(uri, CancellationToken.None)).header;
		if (!header) {
			return undefined;
		}
		const commands = toArray(toJson(header.getAttribute(PromptHeaderAttributes.commands)?.value)).map(asAgentCommand).filter((command): command is IAgentCommand => !!command);
		const form = toJson(header.getAttribute(PromptHeaderAttributes.startForm)?.value);
		return { agentName, commands, startForm: asStartForm(form), welcome: asString(toJson(header.getAttribute(PromptHeaderAttributes.welcome)?.value)) };
	}

	private _registerCommand(agentName: string, definition: IAgentCommand): void {
		const id = agentCommandId(agentName, definition.name);
		const existing = this._commandRegistrations.get(id);
		if (existing) {
			existing.definition = definition;
			return;
		}
		const entry = { definition, registration: new DisposableStore() };
		// From the input toolbar: `{ widget }`; from a welcome link: `{ sessionResource }`.
		entry.registration.add(CommandsRegistry.registerCommand(id, (_accessor, context?: { widget?: IChatWidget; sessionResource?: string }) => this._run(entry.definition,
			context?.widget
			?? (context?.sessionResource ? this._chatWidgetService.getWidgetBySessionResource(URI.parse(context.sessionResource)) : undefined)
			?? this._chatWidgetService.lastFocusedWidget)));
		entry.registration.add(MenuRegistry.appendMenuItem(MenuId.ChatInputStatus, {
			command: { id, title: definition.label, icon: definition.icon ? ThemeIcon.fromId(definition.icon) : Codicon.play },
			group: 'navigation',
			order: this._commandRegistrations.size,
			when: ContextKeyExpr.equals(ChatContextKeys.chatModeName.key, agentName),
		}));
		this._commandRegistrations.set(id, entry);
	}

	private async _run(command: IAgentCommand, widget: IChatWidget | undefined): Promise<void> {
		if (!widget) {
			return;
		}
		if (command.prompt !== undefined) {
			const current = widget.getInput();
			const text = current ? `${current.replace(/\s+$/, '')}\n\n${command.prompt}` : command.prompt;
			if (command.send) {
				await widget.acceptInput(text);
			} else {
				widget.setInput(text);
				widget.focusInput();
			}
		}
		if (command.command) {
			await this._commandService.executeCommand(command.command, { sessionResource: widget.viewModel?.sessionResource });
		}
	}

	private _showStartForm(widget: IChatWidget, form: IAgentStartForm): void {
		const viewModel = widget.viewModel;
		if (!viewModel || viewModel.getItems().length > 0) {
			return;
		}
		const session = viewModel.sessionResource.toString();
		if (this._formShown.get(widget) === session) {
			return;
		}
		this._formShown.set(widget, session);
		const resolveId = `chat.agentStartForm.${generateUuid()}`;
		widget.input.renderQuestionCarousel({ kind: 'questionCarousel', resolveId, allowSkip: true, message: form.message, questions: [...form.questions] }, undefined, {
			shouldAutoFocus: true,
			sessionResource: viewModel.sessionResource,
			onSubmit: answers => {
				widget.input.clearQuestionCarousel(undefined, resolveId);
				if (answers) {
					void widget.acceptInput(formatAnswers(form.questions, answers));
				} else {
					widget.focusInput();
				}
			},
		});
	}
}

function formatAnswers(questions: readonly IChatQuestion[], answers: Map<string, IChatQuestionAnswerValue>): string {
	const label = (question: IChatQuestion, value: string | undefined) => question.options?.find(option => option.value === value)?.label ?? value;
	return questions.map(question => {
		const answer = answers.get(question.id);
		let text: string | undefined;
		if (typeof answer === 'string') {
			text = answer;
		} else if (answer && 'selectedValues' in answer) {
			text = [...answer.selectedValues.map(value => label(question, value)), answer.freeformValue].filter(Boolean).join(', ');
		} else if (answer) {
			text = answer.freeformValue || label(question, answer.selectedValue);
		}
		return text?.trim() ? `**${question.title}**\n${text.trim()}` : undefined;
	}).filter(Boolean).join('\n\n');
}

function toJson(value: IValue | undefined): unknown {
	switch (value?.type) {
		case 'scalar': return value.value;
		case 'sequence': return value.items.map(toJson);
		case 'map': return Object.fromEntries(value.properties.map(property => [property.key.value, toJson(property.value)]));
		default: return undefined;
	}
}

function toArray(value: unknown): readonly unknown[] {
	return Array.isArray(value) ? value : [];
}

function asString(value: unknown): string | undefined {
	return typeof value === 'string' && value.trim() ? value : undefined;
}

function asAgentCommand(value: unknown): IAgentCommand | undefined {
	if (!value || typeof value !== 'object') {
		return undefined;
	}
	const raw = value as Record<string, unknown>;
	const name = asString(raw.name);
	const label = asString(raw.label) ?? name;
	const prompt = typeof raw.prompt === 'string' ? raw.prompt : undefined;
	const command = asString(raw.command);
	return name && label && (prompt !== undefined || command) ? { name, label, icon: asString(raw.icon), prompt, send: raw.send === 'true', command } : undefined;
}

function asStartForm(value: unknown): IAgentStartForm | undefined {
	if (!value || typeof value !== 'object') {
		return undefined;
	}
	const raw = value as Record<string, unknown>;
	const questions = toArray(raw.questions).map((item, index): IChatQuestion | undefined => {
		if (!item || typeof item !== 'object') {
			return undefined;
		}
		const q = item as Record<string, unknown>;
		const title = asString(q.title);
		const type = q.type === 'singleSelect' || q.type === 'multiSelect' ? q.type : 'text';
		const options = toArray(q.options).map((option, optionIndex) => {
			const o = (option && typeof option === 'object' ? option : { label: option }) as Record<string, unknown>;
			const label = asString(o.label) ?? asString(o.value);
			return label ? { id: asString(o.id) ?? `${optionIndex}`, label, value: asString(o.value) ?? label } : undefined;
		}).filter((option): option is { id: string; label: string; value: string } => !!option);
		return title ? {
			id: asString(q.id) ?? `q${index}`,
			type,
			title,
			message: asString(q.message),
			...(options.length ? { options } : {}),
			...(q.required === 'false' ? { required: false } : {}),
			...(q.allowFreeformInput === 'true' ? { allowFreeformInput: true } : {}),
		} : undefined;
	}).filter((question): question is IChatQuestion => !!question);
	return questions.length ? { message: asString(raw.message), questions } : undefined;
}

registerWorkbenchContribution2(ChatAgentStartExperienceContribution.ID, ChatAgentStartExperienceContribution, WorkbenchPhase.AfterRestored);
