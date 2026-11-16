/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../base/browser/dom.js';
import { Button } from '../../../../../base/browser/ui/button/button.js';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { MarkdownString } from '../../../../../base/common/htmlContent.js';
import { Disposable, DisposableMap, DisposableStore } from '../../../../../base/common/lifecycle.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { URI } from '../../../../../base/common/uri.js';
import { CommandsRegistry, ICommandService } from '../../../../../platform/commands/common/commands.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { IMarkdownRendererService } from '../../../../../platform/markdown/browser/markdownRenderer.js';
import { defaultButtonStyles } from '../../../../../platform/theme/browser/defaultStyles.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../../common/contributions.js';
import { SessionConfigKey } from '../../../../../platform/agentHost/common/sessionConfigKeys.js';
import { ChatPermissionLevel } from '../../common/constants.js';
import { IValue, PromptHeaderAttributes } from '../../common/promptSyntax/promptFileParser.js';
import { IPromptsService } from '../../common/promptSyntax/service/promptsService.js';
import { IChatWidget, IChatWidgetService } from '../chat.js';

/**
 * How a custom agent starts a new chat, from its agent file:
 *
 * ```yaml
 * commands:              # actions the first message's buttons run
 *   - name: screenshot
 *     label: Attach a screenshot
 *     icon: device-camera
 *     command: workbench.action.chat.attachAppWindowScreenshot   # only the chat's attach actions; runs with { sessionResource }
 *   - name: repro
 *     label: Add steps to reproduce
 *     prompt: "Steps to reproduce:\n1. "   # appended to the input (`send: true` sends it)
 * first-message:         # shown as the agent's message in an empty chat
 *   markdown: What went wrong?
 *   buttons: [screenshot]   # the first one is the primary button
 * permissions: assisted  # manual | assisted, selected in a new chat
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

interface IAgentFirstMessage {
	readonly markdown: string;
	readonly buttons: readonly string[];
}

interface IAgentStartExperience {
	readonly agentName: string;
	readonly commands: readonly IAgentCommand[];
	readonly firstMessage: IAgentFirstMessage | undefined;
	readonly permissions: ChatPermissionLevel | undefined;
}

/** The VS Code command behind an agent command. */
function agentCommandId(agentName: string, commandName: string): string {
	const slug = (value: string) => value.toLowerCase().replace(/[^a-z0-9-]+/g, '-');
	return `_chat.agentCommand.${slug(agentName)}.${slug(commandName)}`;
}

export class ChatAgentStartExperienceContribution extends Disposable implements IWorkbenchContribution {
	static readonly ID = 'workbench.contrib.chatAgentStartExperience';

	private readonly _widgets = this._register(new DisposableMap<IChatWidget>());
	private readonly _firstMessages = this._register(new DisposableMap<IChatWidget>());
	/** Commands per agent command ID, registered once and kept up to date. */
	private readonly _commands = new Map<string, { definition: IAgentCommand; readonly registration: DisposableStore }>();
	/** The level each widget's new chat (by session) got from its agent, so another agent can undo it and the user's later choice sticks. */
	private readonly _permissionsApplied = new WeakMap<IChatWidget, { readonly session: string; readonly level: ChatPermissionLevel }>();

	constructor(
		@IChatWidgetService private readonly _chatWidgetService: IChatWidgetService,
		@IPromptsService private readonly _promptsService: IPromptsService,
		@ICommandService private readonly _commandService: ICommandService,
		@IMarkdownRendererService private readonly _markdownRendererService: IMarkdownRendererService,
		@ILogService private readonly _logService: ILogService,
	) {
		super();
		this._chatWidgetService.getAllWidgets().forEach(widget => this._attach(widget));
		this._register(this._chatWidgetService.onDidAddWidget(widget => this._attach(widget)));
		this._register(this._chatWidgetService.onDidRemoveWidget(widget => {
			this._widgets.deleteAndDispose(widget);
			this._firstMessages.deleteAndDispose(widget);
		}));
		this._register({ dispose: () => this._commands.forEach(entry => entry.registration.dispose()) });
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
		const experience = uri && !mode.isBuiltin ? await this._read(mode.name.get(), uri).catch(error => {
			this._logService.error('[ChatAgentStartExperience]', error);
			return undefined;
		}) : undefined;
		// The widget went away, or another agent was selected, while the agent file was read.
		if (!this._widgets.has(widget) || widget.input.currentModeObs.get().id !== mode.id) {
			return;
		}
		experience?.commands.forEach(command => this._registerCommand(experience.agentName, command));
		this._setFirstMessage(widget, experience?.firstMessage && this._renderFirstMessage(experience, experience.firstMessage, widget));
		await this._applyPermissions(widget, experience?.permissions);
	}

	private async _read(agentName: string, uri: URI): Promise<IAgentStartExperience | undefined> {
		const header = (await this._promptsService.parseNew(uri, CancellationToken.None)).header;
		if (!header) {
			return undefined;
		}
		const attribute = (name: string) => toJson(header.getAttribute(name)?.value);
		const permissions = asString(attribute(PromptHeaderAttributes.permissions));
		return {
			agentName,
			commands: toArray(attribute(PromptHeaderAttributes.commands)).map(asAgentCommand).filter((command): command is IAgentCommand => !!command),
			firstMessage: asFirstMessage(attribute(PromptHeaderAttributes.firstMessage)),
			permissions: permissions === 'manual' ? ChatPermissionLevel.Default : permissions === ChatPermissionLevel.Assisted ? ChatPermissionLevel.Assisted : undefined,
		};
	}

	/**
	 * In a new chat, selects the level the agent asks for, through the permissions picker (policy, and confirmation before
	 * elevating, as when the user picks it). Selecting another agent in the same empty chat undoes it.
	 */
	private async _applyPermissions(widget: IChatWidget, level: ChatPermissionLevel | undefined): Promise<void> {
		const viewModel = widget.viewModel;
		if (!viewModel || viewModel.getItems().length > 0) {
			return;
		}
		const session = viewModel.sessionResource.toString();
		const applied = this._permissionsApplied.get(widget);
		const previous = applied?.session === session ? applied.level : undefined;
		const target = level ?? (previous !== undefined ? ChatPermissionLevel.Default : undefined);
		const picker = widget.input.getAgentHostPicker(SessionConfigKey.Mode) ?? widget.input.getAgentHostPicker(SessionConfigKey.AutoApprove);
		if (target === undefined || target === previous || !picker) {
			return;
		}
		this._permissionsApplied.set(widget, { session, level: target });
		await picker.requestPermissionLevel(target);
	}

	private _setFirstMessage(widget: IChatWidget, rendered: { element: HTMLElement; store: DisposableStore } | undefined): void {
		this._firstMessages.deleteAndDispose(widget);
		if (rendered) {
			this._firstMessages.set(widget, rendered.store);
		}
		widget.setAgentFirstMessage?.(rendered?.element);
	}

	/** Renders like a chat response: markdown, then a row of command buttons as in `ChatCommandButtonContentPart`. */
	private _renderFirstMessage(experience: IAgentStartExperience, message: IAgentFirstMessage, widget: IChatWidget): { element: HTMLElement; store: DisposableStore } {
		const store = new DisposableStore();
		const element = dom.$('.interactive-item-container.interactive-response.chat-agent-first-message-item');
		const user = dom.append(dom.append(element, dom.$('.header')), dom.$('.user'));
		dom.append(user, dom.$('.avatar-container', undefined, dom.$('.avatar.codicon-avatar', undefined, dom.$(ThemeIcon.asCSSSelector(Codicon.chatSparkle)))));
		dom.append(user, dom.$('h3.username', undefined, experience.agentName));
		const value = dom.append(element, dom.$('.value'));
		const markdown = store.add(this._markdownRendererService.render(new MarkdownString(message.markdown, { supportThemeIcons: true })));
		markdown.element.classList.add('rendered-markdown');
		value.appendChild(markdown.element);

		const commands = message.buttons.map(name => experience.commands.find(command => command.name === name)).filter((command): command is IAgentCommand => !!command);
		if (commands.length) {
			const row = dom.append(value, dom.$('.chat-command-button'));
			commands.forEach((command, index) => {
				const button = store.add(new Button(row, { ...defaultButtonStyles, supportIcons: true, secondary: index > 0 }));
				button.label = command.icon ? `$(${command.icon}) ${command.label}` : command.label;
				store.add(button.onDidClick(() => this._commandService.executeCommand(agentCommandId(experience.agentName, command.name), { widget })));
			});
		}
		return { element, store };
	}

	private _registerCommand(agentName: string, definition: IAgentCommand): void {
		const id = agentCommandId(agentName, definition.name);
		const existing = this._commands.get(id);
		if (existing) {
			existing.definition = definition;
			return;
		}
		const entry = { definition, registration: new DisposableStore() };
		entry.registration.add(CommandsRegistry.registerCommand(id, (_accessor, context?: { widget?: IChatWidget }) =>
			this._run(entry.definition, context?.widget ?? this._chatWidgetService.lastFocusedWidget)));
		this._commands.set(id, entry);
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
	// Agent files can come from any workspace: their buttons may add context to the chat, nothing else.
	const allowedCommand = command?.startsWith(allowedAgentCommandPrefix) ? command : undefined;
	return name && label && (prompt !== undefined || allowedCommand) ? { name, label, icon: asString(raw.icon), prompt, send: raw.send === 'true', command: allowedCommand } : undefined;
}

/** The commands an agent's buttons may run: the chat's attach actions (e.g. `workbench.action.chat.attachAppWindowScreenshot`). */
const allowedAgentCommandPrefix = 'workbench.action.chat.attach';

function asFirstMessage(value: unknown): IAgentFirstMessage | undefined {
	if (typeof value === 'string') {
		return asString(value) ? { markdown: value, buttons: [] } : undefined;
	}
	if (!value || typeof value !== 'object') {
		return undefined;
	}
	const raw = value as Record<string, unknown>;
	const markdown = asString(raw.markdown);
	return markdown ? { markdown, buttons: toArray(raw.buttons).map(asString).filter((name): name is string => !!name) } : undefined;
}

registerWorkbenchContribution2(ChatAgentStartExperienceContribution.ID, ChatAgentStartExperienceContribution, WorkbenchPhase.AfterRestored);
