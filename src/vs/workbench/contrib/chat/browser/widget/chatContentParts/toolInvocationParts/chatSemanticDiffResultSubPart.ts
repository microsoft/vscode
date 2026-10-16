/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../../../base/browser/dom.js';
import { status } from '../../../../../../../base/browser/ui/aria/aria.js';
import { Codicon } from '../../../../../../../base/common/codicons.js';
import { Emitter } from '../../../../../../../base/common/event.js';
import { constObservable } from '../../../../../../../base/common/observable.js';
import { ThemeIcon } from '../../../../../../../base/common/themables.js';
import { localize } from '../../../../../../../nls.js';
import { ISemanticDiffAnalysis, ISemanticDiffReport, isSemanticDiffHunkUncertain } from '../../../../../../../platform/agentHost/common/semanticDiff.js';
import { IInstantiationService } from '../../../../../../../platform/instantiation/common/instantiation.js';
import { ServiceCollection } from '../../../../../../../platform/instantiation/common/serviceCollection.js';
import { IContextKeyService } from '../../../../../../../platform/contextkey/common/contextkey.js';
import { MenuWorkbenchToolBar } from '../../../../../../../platform/actions/browser/toolbar.js';
import { ICommandService } from '../../../../../../../platform/commands/common/commands.js';
import { IHoverService } from '../../../../../../../platform/hover/browser/hover.js';
import { ChangesStatsWidget } from '../../../../../../browser/changesStatsWidget.js';
import { IChatSemanticDiffResultData, IChatToolInvocation, IChatToolInvocationSerialized } from '../../../../common/chatService/chatService.js';
import { ISemanticDiffCardActionContext, ISemanticDiffCardSource, OpenSemanticDiffGroupChangesCommandId, SemanticDiffCardMenu } from '../../../../common/semanticDiffCard.js';
import { IChatCodeBlockInfo } from '../../../chat.js';
import { BaseChatToolInvocationSubPart } from './chatToolInvocationSubPart.js';
import '../media/chatSemanticDiffResult.css';

type Hunk = ISemanticDiffAnalysis['hunks'][number];
type File = ISemanticDiffAnalysis['files'][number];
interface IFileProjection {
	readonly file: File;
	readonly hunks: readonly Hunk[];
}

interface IGroupProjection {
	readonly group: ISemanticDiffAnalysis['groups'][number];
	readonly files: readonly IFileProjection[];
	readonly hunks: readonly Hunk[];
}

/** Projects only inventory membership, preserving the submitted group, file, and hunk order. */
export function projectSemanticDiffGroups(analysis: ISemanticDiffAnalysis): readonly IGroupProjection[] {
	return analysis.groups.map(group => {
		const hunks = analysis.hunks.filter(hunk => hunk.classification.groupId === group.id);
		return { group, hunks, files: projectFiles(analysis.files, hunks) };
	});
}

function projectFiles(files: readonly File[], hunks: readonly Hunk[]): IFileProjection[] {
	return files.map(file => ({ file, hunks: hunks.filter(hunk => hunk.fileId === file.id) })).filter(file => file.hunks.length > 0);
}

// Response ownership bounds the cache lifetime without retaining closed chats.
const announcedResults = new WeakMap<object, Set<string>>();
let nextInstanceId = 0;

/** Records the result as announced and returns whether this is its first rendering for the owner. */
function markAnnounced(owner: object, toolCallId: string): boolean {
	let announced = announcedResults.get(owner);
	if (!announced) {
		announced = new Set();
		announcedResults.set(owner, announced);
	}
	if (announced.has(toolCallId)) {
		return false;
	}
	announced.add(toolCallId);
	return true;
}

function fileLabel(file: File): string {
	return file.oldPath === null ? file.path : localize('semanticDiff.rename', "{0} → {1}", file.oldPath, file.path);
}

function fileStatusLabel(file: File): string {
	switch (file.status) {
		case 'added': return localize('semanticDiff.added', "Added");
		case 'modified': return localize('semanticDiff.modified', "Modified");
		case 'deleted': return localize('semanticDiff.deleted', "Deleted");
		case 'renamed': return localize('semanticDiff.renamed', "Renamed");
	}
}

function hunkCount(count: number): string {
	return count === 1 ? localize('semanticDiff.oneHunk', "1 hunk") : localize('semanticDiff.hunks', "{0} hunks", count);
}

function fileCount(count: number): string {
	return count === 1 ? localize('semanticDiff.oneFile', "1 file") : localize('semanticDiff.files', "{0} files", count);
}

function counts(files: number, hunks: number): string {
	return localize('semanticDiff.counts', "{0}, {1}", fileCount(files), hunkCount(hunks));
}

/** Renders intent cards as inert text; no submitted path or text is executable. */
export class ChatSemanticDiffResultSubPart extends BaseChatToolInvocationSubPart {
	readonly domNode = dom.$('.chat-semantic-diff');
	readonly codeblocks: IChatCodeBlockInfo[] = [];
	private readonly _onDidChangeHeight = this._register(new Emitter<void>());
	readonly onDidChangeHeight = this._onDidChangeHeight.event;
	private readonly idPrefix = `chat-semantic-diff-${nextInstanceId++}`;

	constructor(
		toolInvocation: IChatToolInvocation | IChatToolInvocationSerialized,
		readonly data: IChatSemanticDiffResultData,
		announcementOwner: object,
		announceCompletion: boolean,
		private readonly sourceContext: ISemanticDiffCardSource | undefined,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
		@ICommandService private readonly commandService: ICommandService,
		@IHoverService private readonly hoverService: IHoverService,
	) {
		super(toolInvocation);

		const result = data.result;
		if (!result.ok) {
			dom.append(this.domNode, dom.$('p.semantic-diff-error', undefined, localize('semanticDiff.invalid', "Cannot display this classification result: {0}", result.error.error.message)));
			return;
		}

		this.renderReport(result.report);
		if (markAnnounced(announcementOwner, toolInvocation.toolCallId) && announceCompletion) {
			status(localize('semanticDiff.ready', "Hunk classification available. {0}. {1}", counts(result.report.summary.files, result.report.summary.hunks), result.report.status === 'partial' ? localize('semanticDiff.partialAnnouncement', "Partial analysis.") : ''));
		}
	}

	private renderReport(report: ISemanticDiffReport): void {
		const { analysis, summary } = report;
		if (report.status === 'partial') {
			const notice = dom.append(this.domNode, dom.$('.semantic-diff-notice'));
			dom.append(notice, dom.$('h3', undefined, localize('semanticDiff.partial', "Partial analysis")));
			dom.append(notice, dom.$('p', undefined, localize('semanticDiff.partialSummary', "The submitted inventory is incomplete. Classified hunks: {0}; uncertain hunks: {1}.", summary.hunks, summary.uncertainHunks)));
			const limitations = dom.append(notice, dom.$('ul'));
			for (const limitation of analysis.limitations) {
				const file = analysis.files.find(file => file.id === limitation.fileId);
				const message = file ? localize('semanticDiff.scopedLimitation', "{0}: {1}", fileLabel(file), limitation.message) : limitation.message;
				const row = dom.append(limitations, dom.$('li', undefined, message));
				if (limitation.code === 'staleSource') {
					row.classList.add('semantic-diff-stale');
					row.prepend(dom.$('strong', undefined, localize('semanticDiff.stale', "Stale analysis: ")));
				}
			}
		}

		if (analysis.files.length === 0 && analysis.hunks.length === 0) {
			dom.append(this.domNode, dom.$('p.semantic-diff-empty', undefined, report.status === 'complete'
				? localize('semanticDiff.empty', "No changes reported for this comparison.")
				: localize('semanticDiff.partialEmpty', "No text changes are available in the submitted evidence. The comparison may contain changes that were not included.")));
		}

		for (const [index, projection] of projectSemanticDiffGroups(analysis).entries()) {
			this.renderGroup(report, projection, index);
		}

		const withoutHunks = analysis.files.filter(file => !analysis.hunks.some(hunk => hunk.fileId === file.id));
		if (withoutHunks.length) {
			const section = dom.append(this.domNode, dom.$('section.semantic-diff-nontext'));
			dom.append(section, dom.$('h3', undefined, localize('semanticDiff.nonText', "Not analyzed as text")));
			const list = dom.append(section, dom.$('ul'));
			for (const file of withoutHunks) {
				const item = dom.append(list, dom.$('li', undefined, localize('semanticDiff.nonTextFile', "{0} ({1})", fileLabel(file), fileStatusLabel(file))));
				for (const limitation of analysis.limitations.filter(limitation => limitation.fileId === file.id)) {
					dom.append(item, dom.$('p', undefined, limitation.message));
				}
			}
		}
	}

	private renderGroup(report: ISemanticDiffReport, projection: IGroupProjection, index: number): void {
		const { group, files, hunks } = projection;
		const card = dom.append(this.domNode, dom.$(`section.semantic-diff-card.semantic-diff-accent-${index % 4}`));
		const heading = dom.append(card, dom.$('.semantic-diff-card-heading'));
		const title = dom.append(heading, dom.$('h3.semantic-diff-title', undefined, group.title));
		const controls = dom.append(heading, dom.$('.semantic-diff-card-controls'));
		title.id = `${this.idPrefix}-group-${index}`;
		card.setAttribute('aria-labelledby', title.id);
		dom.append(card, dom.$('p.semantic-diff-description', undefined, group.description));
		if (hunks.some(isSemanticDiffHunkUncertain)) {
			dom.append(card, dom.$('p.semantic-diff-uncertainty', undefined, localize('semanticDiff.uncertain', "Uncertain classification")));
		}
		// Mirrors the changes pill above the chat input: `<diff icon> N Files +insertions -deletions`.
		const { additions, deletions } = this.lineCounts(hunks);
		const summary = dom.append(controls, this.sourceContext ? dom.$('button.semantic-diff-group-summary', { type: 'button' }) : dom.$('span.semantic-diff-group-summary'));
		dom.append(summary, dom.$(`span.semantic-diff-summary-icon${ThemeIcon.asCSSSelector(Codicon.diffMultiple)}`, { 'aria-hidden': 'true' }));
		this._register(this.instantiationService.createInstance(ChangesStatsWidget, summary, constObservable({ files: files.length, insertions: additions, deletions }), true));
		if (this.sourceContext) {
			const context: ISemanticDiffCardActionContext = { ...this.sourceContext, groupId: group.id, report };
			summary.setAttribute('aria-label', localize('semanticDiff.openGroupChanges', "Open Changes for {0}: {1}, {2} lines added, {3} lines removed", group.title, fileCount(files.length), additions, deletions));
			this._register(this.hoverService.setupDelayedHover(summary, { content: localize('semanticDiff.openChanges', "Open Changes") }));
			this._register(dom.addDisposableListener(summary, dom.EventType.CLICK, () => {
				void this.commandService.executeCommand(OpenSemanticDiffGroupChangesCommandId, context);
			}));

			const actions = dom.append(controls, dom.$('.semantic-diff-card-actions'));
			const scopedContext = this._register(this.contextKeyService.createScoped(actions));
			const scopedInstantiationService = this._register(this.instantiationService.createChild(new ServiceCollection([IContextKeyService, scopedContext])));
			const toolbar = this._register(scopedInstantiationService.createInstance(MenuWorkbenchToolBar, actions, SemanticDiffCardMenu, {
				ariaLabel: localize('semanticDiff.groupActions', "Actions for {0}", group.title),
				menuOptions: { shouldForwardArgs: true },
			}));
			toolbar.context = context;
			const updateVisibility = () => {
				const hidden = toolbar.getItemsLength() === 0;
				if (actions.hidden !== hidden) {
					actions.hidden = hidden;
					this._onDidChangeHeight.fire();
				}
			};
			this._register(toolbar.onDidChangeMenuItems(updateVisibility));
			updateVisibility();
		}
	}

	private lineCounts(hunks: readonly Hunk[]): { additions: number; deletions: number } {
		const additions = hunks.reduce((sum, hunk) => sum + hunk.additions, 0);
		const deletions = hunks.reduce((sum, hunk) => sum + hunk.deletions, 0);
		return { additions, deletions };
	}
}
