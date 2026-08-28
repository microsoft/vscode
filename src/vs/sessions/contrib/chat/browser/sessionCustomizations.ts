/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../../../base/common/codicons.js';
import { isMarkdownString, MarkdownString } from '../../../../base/common/htmlContent.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { Schemas } from '../../../../base/common/network.js';
import { derivedOpts, IObservable } from '../../../../base/common/observable.js';
import { isEqualOrParent, relativePath } from '../../../../base/common/resources.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { URI } from '../../../../base/common/uri.js';
import { localize } from '../../../../nls.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { ChatPillSingleEntry, type IChatDropdownPillOptions } from '../../../../workbench/browser/chatDropdownPill.js';
import { type IChatPillEntry, type IChatPillSection } from '../../../../workbench/browser/chatPills.js';
import { AICustomizationManagementCommands, AICustomizationManagementSection } from '../../../../workbench/contrib/chat/browser/aiCustomization/aiCustomizationManagement.js';
import { ISessionChatCustomization, ISessionFolder, SessionCustomizationKind, type IChat } from '../../../services/sessions/common/session.js';
import type { IActiveSession } from '../../../services/sessions/common/sessionsManagement.js';

/** Action id of the customizations pill. */
export const SESSION_CUSTOMIZATIONS_PILL_ID = 'sessions.chatPills.customizations';

/** Presentation of the customizations pill. */
export const chatCustomizationPillOptions: IChatDropdownPillOptions = {
	widgetId: 'chatCustomizations',
	icon: Codicon.bookmark,
	title: localize('chatCustomizations.title', "Customizations"),
	summaryLabel: count => count === 1
		? localize('chatCustomizations.countSingle', "1 Customization")
		: localize('chatCustomizations.count', "{0} Customizations", count),
	summaryAriaLabel: count => count === 1
		? localize('chatCustomizations.showSingle', "Show 1 customization")
		: localize('chatCustomizations.show', "Show {0} customizations", count),
	singleEntry: ChatPillSingleEntry.Summary,
};

const customizationIcons: ReadonlyMap<SessionCustomizationKind, ThemeIcon> = new Map([
	[SessionCustomizationKind.Agent, Codicon.robot],
	[SessionCustomizationKind.Skill, Codicon.lightbulb],
	[SessionCustomizationKind.Instruction, Codicon.book],
	[SessionCustomizationKind.Hook, Codicon.plug],
	[SessionCustomizationKind.Prompt, Codicon.commentDiscussion],
	[SessionCustomizationKind.McpServer, Codicon.mcp],
	[SessionCustomizationKind.Plugin, Codicon.extensions],
]);

/** The customizations editor section each customization kind is revealed in. */
const customizationSections: ReadonlyMap<SessionCustomizationKind, AICustomizationManagementSection> = new Map([
	[SessionCustomizationKind.Agent, AICustomizationManagementSection.Agents],
	[SessionCustomizationKind.Skill, AICustomizationManagementSection.Skills],
	[SessionCustomizationKind.Instruction, AICustomizationManagementSection.Instructions],
	[SessionCustomizationKind.Hook, AICustomizationManagementSection.Hooks],
	[SessionCustomizationKind.Prompt, AICustomizationManagementSection.Prompts],
	[SessionCustomizationKind.McpServer, AICustomizationManagementSection.McpServers],
	[SessionCustomizationKind.Plugin, AICustomizationManagementSection.Plugins],
]);

/** Section order and titles for the customizations dropdown. */
const sectionOrder: readonly { readonly kind: SessionCustomizationKind; readonly title: string }[] = [
	{ kind: SessionCustomizationKind.Agent, title: localize('sessionCustomizations.agents', "Agents") },
	{ kind: SessionCustomizationKind.Skill, title: localize('sessionCustomizations.skills', "Skills") },
	{ kind: SessionCustomizationKind.Instruction, title: localize('sessionCustomizations.instructions', "Instructions") },
	{ kind: SessionCustomizationKind.Hook, title: localize('sessionCustomizations.hooks', "Hooks") },
	{ kind: SessionCustomizationKind.Prompt, title: localize('sessionCustomizations.prompts', "Prompts") },
	{ kind: SessionCustomizationKind.McpServer, title: localize('sessionCustomizations.mcpServers', "MCP Servers") },
	{ kind: SessionCustomizationKind.Plugin, title: localize('sessionCustomizations.plugins', "Plugins") },
];

/** Builds the dropdown sections, preserving the order customizations appeared in. */
export function buildSessionCustomizationSections(
	customizations: readonly ISessionChatCustomization[],
	sessionFolders: readonly ISessionFolder[],
	reveal: (customization: ISessionChatCustomization) => void,
): readonly IChatPillSection[] {
	const entriesByKind = new Map<SessionCustomizationKind, IChatPillEntry[]>();
	for (const customization of customizations) {
		const entries = entriesByKind.get(customization.kind) ?? [];
		const path = customization.uri ? getCustomizationPath(customization.uri, sessionFolders) : undefined;
		entries.push({
			id: customization.id,
			label: customization.name,
			icon: customizationIcons.get(customization.kind) ?? Codicon.bookmark,
			ariaDescription: path,
			hover: path ? { content: new MarkdownString().appendText(path) } : undefined,
			open: () => reveal(customization),
		});
		entriesByKind.set(customization.kind, entries);
	}

	const sections: IChatPillSection[] = [];
	for (const { kind, title } of sectionOrder) {
		const entries = entriesByKind.get(kind);
		if (entries?.length) {
			sections.push({ title, entries });
		}
	}
	return sections;
}

/**
 * The path shown beside a customization: relative to the session folder holding
 * it (prefixed with the folder name when the session spans several), else absolute.
 */
function getCustomizationPath(uri: URI, sessionFolders: readonly ISessionFolder[]): string {
	for (const folder of sessionFolders) {
		if (!isEqualOrParent(uri, folder.workingDirectory)) {
			continue;
		}
		const path = relativePath(folder.workingDirectory, uri);
		if (path === undefined) {
			continue;
		}
		if (!path) {
			return folder.name;
		}
		return sessionFolders.length > 1 ? `${folder.name}/${path}` : path;
	}
	return uri.scheme === Schemas.file ? uri.fsPath : uri.toString(true);
}

/** Publishes the active chat's customization sections for the chat input pill. */
export class SessionCustomizations extends Disposable {
	readonly sections: IObservable<readonly IChatPillSection[]>;

	constructor(
		chat: IObservable<IChat | undefined>,
		session: IObservable<IActiveSession | undefined>,
		@ICommandService private readonly _commandService: ICommandService,
	) {
		super();

		this.sections = derivedOpts({ owner: this, equalsFn: sectionsEqual }, reader => {
			const customizations = chat.read(reader)?.customizations?.read(reader) ?? [];
			const sessionFolders = session.read(reader)?.workspace.read(reader)?.folders ?? [];
			return buildSessionCustomizationSections(customizations, sessionFolders, customization => this._reveal(customization));
		});
	}

	private _reveal(customization: ISessionChatCustomization): void {
		void this._commandService.executeCommand(AICustomizationManagementCommands.OpenEditor, {
			section: customizationSections.get(customization.kind),
			revealUri: customization.uri,
		});
	}
}

/**
 * Entries are rebuilt on every recompute (their `open` closures are fresh), so
 * compare the identity that actually drives rendering.
 */
function sectionsEqual(a: readonly IChatPillSection[], b: readonly IChatPillSection[]): boolean {
	return a.length === b.length && a.every((section, i) => section.title === b[i].title
		&& section.entries.length === b[i].entries.length
		&& section.entries.every((entry, j) => entry.id === b[i].entries[j].id
			&& entry.label === b[i].entries[j].label
			&& hoverContentEqual(entry, b[i].entries[j])));
}

function hoverContentEqual(a: IChatPillEntry, b: IChatPillEntry): boolean {
	const aContent = a.hover?.content;
	const bContent = b.hover?.content;
	return isMarkdownString(aContent) && isMarkdownString(bContent)
		? aContent.value === bContent.value
		: aContent === bContent;
}
