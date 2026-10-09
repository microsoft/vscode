/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../../../base/common/codicons.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { Schemas } from '../../../../base/common/network.js';
import { derivedOpts, IObservable } from '../../../../base/common/observable.js';
import { isEqualOrParent, relativePath } from '../../../../base/common/resources.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { URI } from '../../../../base/common/uri.js';
import { localize } from '../../../../nls.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { getChatPillLocationHover, type IChatPillEntry, type IChatPillSection } from '../../../browser/chatPills.js';
import { AICustomizationManagementCommands, AICustomizationManagementSection } from './aiCustomization/aiCustomizationManagement.js';
import { ISessionChatCustomization, SessionCustomizationKind } from '../common/sessionChatCustomizations.js';

interface ICustomizationFolder {
	readonly name: string;
	readonly workingDirectory: URI;
}

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
	sessionFolders: readonly ICustomizationFolder[],
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
			hover: path ? getChatPillLocationHover(path) : undefined,
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
function getCustomizationPath(uri: URI, sessionFolders: readonly ICustomizationFolder[]): string {
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
		customizations: IObservable<readonly ISessionChatCustomization[]>,
		sessionFolders: IObservable<readonly ICustomizationFolder[]>,
		@ICommandService private readonly _commandService: ICommandService,
	) {
		super();

		this.sections = derivedOpts({ owner: this, equalsFn: sectionsEqual }, reader => {
			return buildSessionCustomizationSections(customizations.read(reader), sessionFolders.read(reader), customization => this._reveal(customization));
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
			&& entry.ariaDescription === b[i].entries[j].ariaDescription));
}
