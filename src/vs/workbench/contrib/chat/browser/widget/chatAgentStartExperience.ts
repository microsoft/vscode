/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../base/browser/dom.js';
import { renderAsPlaintext } from '../../../../../base/browser/markdownRenderer.js';
import { Button } from '../../../../../base/browser/ui/button/button.js';
import { toAction } from '../../../../../base/common/actions.js';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { MarkdownString } from '../../../../../base/common/htmlContent.js';
import { Disposable, DisposableMap, DisposableStore } from '../../../../../base/common/lifecycle.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { URI } from '../../../../../base/common/uri.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { IMarkdownRendererService } from '../../../../../platform/markdown/browser/markdownRenderer.js';
import { defaultButtonStyles } from '../../../../../platform/theme/browser/defaultStyles.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../../common/contributions.js';
import { IValue, PromptHeaderAttributes, VSCodeAgentAttributes } from '../../common/promptSyntax/promptFileParser.js';
import { IPromptsService } from '../../common/promptSyntax/service/promptsService.js';
import { IChatAgentEmptyChatMessage, IChatWidget, IChatWidgetService } from '../chat.js';

/**
 * The message a custom agent shows in an empty chat, from the VS Code-only `vscode:` map of its agent file.
 * It is not part of the transcript and disappears once the user sends a request.
 *
 * ```yaml
 * vscode:
 *   empty-chat-message:
 *     markdown: What went wrong?
 *     buttons:                # the first one is the primary button
 *       - label: Attach a screenshot
 *         icon: device-camera
 *         command: workbench.action.chat.attachAppWindowScreenshot   # any command; agent files are trusted
 *         args: [...]         # its arguments; without them it gets { sessionResource } of the chat
 * ```
 */
interface IAgentEmptyChatMessage {
	readonly agentName: string;
	readonly markdown: string;
	readonly buttons: readonly IAgentButton[];
}

interface IAgentButton {
	readonly label: string;
	readonly icon?: string;
	readonly command: string;
	/** Arguments from the agent file (YAML values; scalars are strings). */
	readonly args?: readonly unknown[];
}

export class ChatAgentStartExperienceContribution extends Disposable implements IWorkbenchContribution {
	static readonly ID = 'workbench.contrib.chatAgentStartExperience';

	private readonly _widgets = this._register(new DisposableMap<IChatWidget>());
	private readonly _messages = this._register(new DisposableMap<IChatWidget>());

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
			this._messages.deleteAndDispose(widget);
		}));
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
		const message = uri && !mode.isBuiltin ? await this._read(mode.name.get(), uri).catch(error => {
			this._logService.error('[ChatAgentStartExperience]', error);
			return undefined;
		}) : undefined;
		// The widget went away, or another agent was selected, while the agent file was read.
		if (!this._widgets.has(widget) || widget.input.currentModeObs.get().id !== mode.id) {
			return;
		}
		this._messages.deleteAndDispose(widget);
		const rendered = message && this._render(message, widget);
		if (rendered) {
			this._messages.set(widget, rendered.store);
		}
		widget.setAgentEmptyChatMessage?.(rendered?.message);
	}

	private async _read(agentName: string, uri: URI): Promise<IAgentEmptyChatMessage | undefined> {
		const header = (await this._promptsService.parseNew(uri, CancellationToken.None)).header;
		const vscode = asRecord(toJson(header?.getAttribute(PromptHeaderAttributes.vscode)?.value));
		const message = vscode?.[VSCodeAgentAttributes.emptyChatMessage];
		const raw = typeof message === 'string' ? { markdown: message } : asRecord(message);
		const markdown = asString(raw?.markdown);
		return markdown ? { agentName, markdown, buttons: toArray(raw?.buttons).map(asButton).filter((button): button is IAgentButton => !!button) } : undefined;
	}

	/** Renders like a chat response: markdown, then a row of command buttons as in `ChatCommandButtonContentPart`. */
	private _render(message: IAgentEmptyChatMessage, widget: IChatWidget): { message: IChatAgentEmptyChatMessage; store: DisposableStore } {
		const store = new DisposableStore();
		const element = dom.$('.interactive-item-container.interactive-response.chat-agent-empty-chat-message-item');
		const user = dom.append(dom.append(element, dom.$('.header')), dom.$('.user'));
		dom.append(user, dom.$('.avatar-container', undefined, dom.$('.avatar.codicon-avatar', undefined, dom.$(ThemeIcon.asCSSSelector(Codicon.chatSparkle)))));
		dom.append(user, dom.$('h3.username', undefined, message.agentName));
		const value = dom.append(element, dom.$('.value'));
		const markdownString = new MarkdownString(message.markdown, { supportThemeIcons: true });
		const markdown = store.add(this._markdownRendererService.render(markdownString));
		markdown.element.classList.add('rendered-markdown');
		value.appendChild(markdown.element);

		const actions = message.buttons.map((definition, index) => toAction({
			id: `chat.agentEmptyChatMessage.button${index}`,
			label: definition.label,
			run: () => this._commandService.executeCommand(definition.command, ...(definition.args ?? [{ sessionResource: widget.viewModel?.sessionResource }])),
		}));
		if (actions.length) {
			const row = dom.append(value, dom.$('.chat-command-button'));
			// The empty chat focuses the input on click, which would undo a command that moves focus.
			store.add(dom.addDisposableListener(row, dom.EventType.CLICK, e => e.stopPropagation()));
			message.buttons.forEach((definition, index) => {
				const button = store.add(new Button(row, { ...defaultButtonStyles, supportIcons: true, secondary: index > 0 }));
				button.label = definition.icon ? `$(${definition.icon}) ${definition.label}` : definition.label;
				store.add(button.onDidClick(() => actions[index].run()));
			});
		}
		const accessibleText = `${message.agentName}: ${renderAsPlaintext(markdownString)}`;
		return { message: { element, accessibleText, actions }, store };
	}
}

function toJson(value: IValue | undefined): unknown {
	switch (value?.type) {
		case 'scalar': return value.format === 'none' ? plainScalar(value.value) : value.value;
		case 'sequence': return value.items.map(toJson);
		case 'map': return Object.fromEntries(value.properties.map(property => [property.key.value, toJson(property.value)]));
		default: return undefined;
	}
}

/** An unquoted YAML scalar, typed as YAML reads it, so that e.g. command arguments can be booleans or numbers. */
function plainScalar(value: string): unknown {
	switch (value) {
		case 'true': return true;
		case 'false': return false;
		case 'null': case '~': return null;
	}
	return /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?$/.test(value) ? Number(value) : value;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
	return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

function toArray(value: unknown): readonly unknown[] {
	return Array.isArray(value) ? value : [];
}

function asString(value: unknown): string | undefined {
	return typeof value === 'string' && value.trim() ? value : undefined;
}

function asButton(value: unknown): IAgentButton | undefined {
	const raw = asRecord(value);
	const label = asString(raw?.label);
	const command = asString(raw?.command);
	return label && command ? { label, icon: asString(raw?.icon), command, args: Array.isArray(raw?.args) ? raw.args : undefined } : undefined;
}

registerWorkbenchContribution2(ChatAgentStartExperienceContribution.ID, ChatAgentStartExperienceContribution, WorkbenchPhase.AfterRestored);