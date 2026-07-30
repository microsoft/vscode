/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { matchesWords } from '../../../../../base/common/filters.js';
import { TfIdfCalculator, normalizeTfIdfScores } from '../../../../../base/common/tfIdf.js';
import { basename } from '../../../../../base/common/resources.js';
import { URI } from '../../../../../base/common/uri.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { MenuId, IMenuService, MenuItemAction } from '../../../../../platform/actions/common/actions.js';
import { IWorkspaceContextService } from '../../../../../platform/workspace/common/workspace.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';
import { QueryBuilder } from '../../../../services/search/common/queryBuilder.js';
import { ISearchService } from '../../../../services/search/common/search.js';

/**
 * What a line typed into the omnibar turned out to mean.
 *
 * `agent` is the default and the fallback: sending a sentence to an agent is
 * what the bar is for, and it is the only outcome that cannot lose your words.
 * A wrong file-open or command-run discards the thing you typed, so both are
 * only chosen on strong evidence.
 */
export type OmniIntent =
	| { readonly kind: 'file'; readonly resource: URI; readonly label: string; readonly detail: string }
	| { readonly kind: 'command'; readonly commandId: string; readonly label: string }
	| { readonly kind: 'agent' };

/**
 * Past this many words a line is a sentence, and sentences are for agents.
 * "Hero.tsx" and "settings json" are lookups; "make the hero bigger" is work.
 */
const FILE_MAX_WORDS = 3;

/**
 * TF-IDF is how the command palette matches loose phrasing to command titles.
 * The palette shows its matches in a list you choose from; here a match runs
 * on its own, so the bar is worth more than the palette's own 0.5.
 */
const COMMAND_TFIDF_THRESHOLD = 0.75;

/** Beyond this a phrase is describing work, not naming a command. */
const COMMAND_MAX_WORDS = 8;

/** Cheap guard: lines opening with these are describing work to be done. */
const WORK_PREFIXES = [
	'add', 'make', 'fix', 'update', 'change', 'remove', 'delete', 'write',
	'refactor', 'rename', 'implement', 'create', 'build', 'can you', 'please',
	'why', 'how', 'what', 'where', 'when', 'who', 'explain', 'summarize',
];

function words(text: string): string[] {
	return text.trim().split(/\s+/).filter(Boolean);
}

/**
 * Resolves free text to an action. One box has to serve every intent, and by
 * voice there is no prefix to type, so the bar has to guess — but it guesses
 * toward the outcome that keeps your words.
 */
export class OmniIntentResolver {

	private readonly _fileQueryBuilder: QueryBuilder;

	constructor(
		@IInstantiationService instantiationService: IInstantiationService,
		@ISearchService private readonly searchService: ISearchService,
		@IWorkspaceContextService private readonly workspaceContextService: IWorkspaceContextService,
		@IMenuService private readonly menuService: IMenuService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
		@ICommandService private readonly commandService: ICommandService,
		@IEditorService private readonly editorService: IEditorService,
	) {
		this._fileQueryBuilder = instantiationService.createInstance(QueryBuilder);
	}

	async resolve(text: string, token: CancellationToken): Promise<OmniIntent> {
		const trimmed = text.trim();
		if (!trimmed) {
			return { kind: 'agent' };
		}

		const parts = words(trimmed);
		const lower = trimmed.toLowerCase();

		// A question is always for the agent, however short.
		if (trimmed.endsWith('?') || WORK_PREFIXES.some(p => lower.startsWith(`${p} `))) {
			return { kind: 'agent' };
		}

		// Short and name-shaped: try to find the file it names.
		if (parts.length <= FILE_MAX_WORDS) {
			const file = await this._resolveFile(trimmed, token);
			if (file) {
				return file;
			}
		}

		if (parts.length <= COMMAND_MAX_WORDS) {
			const command = this._resolveCommand(trimmed, token);
			if (command) {
				return command;
			}
		}

		return { kind: 'agent' };
	}

	/** Run a resolved non-agent intent. Returns false if it could not be run. */
	async execute(intent: OmniIntent): Promise<boolean> {
		if (intent.kind === 'file') {
			await this.editorService.openEditor({ resource: intent.resource, options: { pinned: true } });
			return true;
		}
		if (intent.kind === 'command') {
			await this.commandService.executeCommand(intent.commandId);
			return true;
		}
		return false;
	}

	private async _resolveFile(query: string, token: CancellationToken): Promise<OmniIntent | undefined> {
		const folders = this.workspaceContextService.getWorkspace().folders;
		if (!folders.length) {
			return undefined;
		}

		const results = await this.searchService.fileSearch(
			this._fileQueryBuilder.file(folders, {
				_reason: 'omniIntent',
				filePattern: query,
				maxResults: 10,
				sortByScore: true,
			}),
			token,
		);
		if (token.isCancellationRequested || !results.results.length) {
			return undefined;
		}

		// Only take the match if the query actually names the file. Fuzzy search
		// will happily return something for any string, and opening the wrong
		// file throws away what you typed.
		const normalized = query.toLowerCase().replace(/\s+/g, '');
		for (const match of results.results) {
			const name = basename(match.resource).toLowerCase();
			if (name === normalized || name.startsWith(normalized) || stripExtension(name) === normalized) {
				return {
					kind: 'file',
					resource: match.resource,
					label: basename(match.resource),
					detail: this.workspaceContextService.getWorkspaceFolder(match.resource)?.name ?? '',
				};
			}
		}
		return undefined;
	}

	private _resolveCommand(query: string, token: CancellationToken): OmniIntent | undefined {
		const picks = this._commandPicks();
		if (!picks.length) {
			return undefined;
		}

		// An exact-ish title match beats anything statistical: if the line names
		// a command, it means that command.
		const normalized = query.toLowerCase();
		for (const pick of picks) {
			const label = pick.label.toLowerCase();
			if (label === normalized || label.endsWith(`: ${normalized}`)) {
				return { kind: 'command', commandId: pick.commandId, label: pick.label };
			}
		}

		// Otherwise fall back to the palette's own loose matching, at a higher
		// bar — the palette offers its matches, this runs one.
		const tfidf = new TfIdfCalculator();
		tfidf.updateDocuments(picks.map(pick => ({ key: pick.commandId, textChunks: [pick.label] })));
		const scored = normalizeTfIdfScores(tfidf.calculateScores(query, token))
			.filter(score => score.score > COMMAND_TFIDF_THRESHOLD);
		if (!scored.length) {
			return undefined;
		}

		const best = picks.find(pick => pick.commandId === scored[0].key);
		if (!best) {
			return undefined;
		}

		// Require the words to actually appear in the title too. TF-IDF alone
		// will rank something for any phrase, including a request for work.
		if (!matchesWords(query, best.label, false)) {
			return undefined;
		}
		return { kind: 'command', commandId: best.commandId, label: best.label };
	}

	/** The command palette's own list: enabled commands, with their titles. */
	private _commandPicks(): { commandId: string; label: string }[] {
		const menu = this.menuService.getMenuActions(MenuId.CommandPalette, this.contextKeyService);
		const picks: { commandId: string; label: string }[] = [];
		for (const [, actions] of menu) {
			for (const action of actions) {
				if (!(action instanceof MenuItemAction) || !action.enabled) {
					continue;
				}
				const title = typeof action.item.title === 'string' ? action.item.title : action.item.title.value;
				const category = typeof action.item.category === 'string' ? action.item.category : action.item.category?.value;
				picks.push({
					commandId: action.item.id,
					label: category ? `${category}: ${title}` : (title || action.item.id),
				});
			}
		}
		return picks;
	}
}

function stripExtension(name: string): string {
	const dot = name.lastIndexOf('.');
	return dot > 0 ? name.slice(0, dot) : name;
}
