/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../../../base/browser/dom.js';
import { status } from '../../../../../../../base/browser/ui/aria/aria.js';
import { Button } from '../../../../../../../base/browser/ui/button/button.js';
import { Emitter } from '../../../../../../../base/common/event.js';
import { MutableDisposable } from '../../../../../../../base/common/lifecycle.js';
import { Schemas } from '../../../../../../../base/common/network.js';
import { posix } from '../../../../../../../base/common/path.js';
import { URI } from '../../../../../../../base/common/uri.js';
import { localize } from '../../../../../../../nls.js';
import { formatSemanticDiffRange, getSemanticDiffChangeTypeLabel, getSemanticDiffConfidenceLabel, ISemanticDiffAnalysis, ISemanticDiffReport, isSemanticDiffHunkUncertain, validateSemanticDiffReport } from '../../../../../../../platform/agentHost/common/semanticDiff.js';
import { defaultButtonStyles } from '../../../../../../../platform/theme/browser/defaultStyles.js';
import { FileKind } from '../../../../../../../platform/files/common/files.js';
import { IInstantiationService } from '../../../../../../../platform/instantiation/common/instantiation.js';
import { IThemeService } from '../../../../../../../platform/theme/common/themeService.js';
import { DEFAULT_LABELS_CONTAINER, ResourceLabels } from '../../../../../../browser/labels.js';
import { createFileIconThemableTreeContainerScope } from '../../../../../files/browser/views/explorerView.js';
import { IChatSemanticDiffData, IChatToolInvocation, IChatToolInvocationSerialized } from '../../../../common/chatService/chatService.js';
import { IChatCodeBlockInfo } from '../../../chat.js';
import { BaseChatToolInvocationSubPart } from './chatToolInvocationSubPart.js';
import '../media/chatSemanticDiffResult.css';

type Hunk = ISemanticDiffAnalysis['hunks'][number];
type File = ISemanticDiffAnalysis['files'][number];
type ChangeType = Hunk['classification']['changeType'];

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

interface IDisclosureState {
	readonly expanded: Set<string>;
	announced: boolean;
}

// Response ownership bounds the cache lifetime without retaining closed chats.
const disclosureStates = new WeakMap<object, Map<string, IDisclosureState>>();
let nextInstanceId = 0;

function getDisclosureState(owner: object, toolCallId: string): IDisclosureState {
	let invocations = disclosureStates.get(owner);
	if (!invocations) {
		invocations = new Map();
		disclosureStates.set(owner, invocations);
	}
	let state = invocations.get(toolCallId);
	if (!state) {
		state = { expanded: new Set(), announced: false };
		invocations.set(toolCallId, state);
	}
	return state;
}

function secondaryTypeLabel(type: Exclude<ChangeType, null>): string {
	switch (type) {
		case 'logic': return localize('semanticDiff.alsoLogic', "Also logic");
		case 'test': return localize('semanticDiff.alsoTest', "Also test");
		case 'supporting': return localize('semanticDiff.alsoSupporting', "Also supporting");
		case 'generated': return localize('semanticDiff.alsoGenerated', "Also generated");
	}
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

/** Native, lazy classification disclosures; no submitted path or text is executable. */
export class ChatSemanticDiffResultSubPart extends BaseChatToolInvocationSubPart {
	readonly domNode = dom.$('.chat-semantic-diff');
	readonly codeblocks: IChatCodeBlockInfo[] = [];
	private readonly _onDidChangeHeight = this._register(new Emitter<void>());
	readonly onDidChangeHeight = this._onDidChangeHeight.event;
	private readonly state: IDisclosureState;
	private readonly resourceLabels = this._register(new MutableDisposable<ResourceLabels>());
	private readonly idPrefix = `chat-semantic-diff-${nextInstanceId++}`;
	private selectionAtPointerDown = false;

	constructor(
		toolInvocation: IChatToolInvocation | IChatToolInvocationSerialized,
		readonly data: IChatSemanticDiffData,
		stateOwner: object,
		announceCompletion: boolean,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IThemeService themeService: IThemeService,
	) {
		super(toolInvocation);
		this._register(createFileIconThemableTreeContainerScope(this.domNode, themeService));
		this.state = getDisclosureState(stateOwner, toolInvocation.toolCallId);
		this._register(dom.addDisposableListener(this.domNode, dom.EventType.MOUSE_DOWN, () => {
			this.selectionAtPointerDown = this.hasSelection();
		}));

		const result = data.result.ok ? validateSemanticDiffReport(data.result.report) : data.result;
		if (!result.ok) {
			dom.append(this.domNode, dom.$('p.semantic-diff-error', undefined, localize('semanticDiff.invalid', "Cannot display this classification result: {0}", result.error.error.message)));
			return;
		}

		this.renderReport(result.report);
		if (!this.state.announced) {
			this.state.announced = true;
			if (announceCompletion) {
				status(localize('semanticDiff.ready', "Hunk classification available. {0}. {1}", counts(result.report.summary.files, result.report.summary.hunks), result.report.status === 'partial' ? localize('semanticDiff.partialAnnouncement', "Partial analysis.") : ''));
			}
		}
	}

	private renderReport(report: ISemanticDiffReport): void {
		const { analysis, summary } = report;
		if (report.status === 'partial') {
			const notice = dom.append(this.domNode, dom.$('.semantic-diff-notice'));
			dom.append(notice, dom.$('h3', undefined, localize('semanticDiff.partial', "Partial analysis")));
			dom.append(notice, dom.$('p', undefined, localize('semanticDiff.unresolved', "Hunks without a group: {0}; hunks without a type: {1}; uncertain hunks: {2}. Axis counts may overlap.", summary.unassignedHunks, summary.untypedHunks, summary.uncertainHunks)));
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

		const ungrouped = analysis.hunks.filter(hunk => hunk.classification.groupId === null);
		if (ungrouped.length) {
			const section = dom.append(this.domNode, dom.$('section.semantic-diff-ungrouped'));
			dom.append(section, dom.$('h3', undefined, localize('semanticDiff.needsGrouping', "Needs grouping")));
			this.renderFiles(section, report, null, projectFiles(analysis.files, ungrouped));
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

		this.createDisclosure(this.domNode, this.domNode, localize('semanticDiff.analysisDetails', "Analysis Details"), 'analysis', 'semantic-diff-analysis-toggle', panel => {
			const source = analysis.source;
			const comparison = source.comparison === 'staged' ? localize('semanticDiff.staged', "Staged changes") : source.comparison === 'workingTree' ? localize('semanticDiff.workingTree', "Working tree") : localize('semanticDiff.commitRange', "Commit range");
			const lines = [
				localize('semanticDiff.repository', "Repository: {0}", source.repositoryLabel),
				localize('semanticDiff.comparison', "Comparison: {0}", comparison),
				localize('semanticDiff.base', "Base revision: {0}", source.baseRevision),
				localize('semanticDiff.target', "Target revision: {0}", source.targetRevision ?? localize('semanticDiff.noTarget', "Not applicable")),
				localize('semanticDiff.captured', "Captured: {0}", source.capturedAt),
				localize('semanticDiff.inventory', "Submitted inventory: {0}", source.inventoryComplete ? localize('semanticDiff.complete', "Complete") : localize('semanticDiff.incomplete', "Incomplete")),
				localize('semanticDiff.globalCounts', "{0} intent groups; {1}; {2}", summary.groups, counts(summary.files, summary.hunks), this.formatLineCounts(analysis.hunks)),
				localize('semanticDiff.provenance', "Classification and source metadata reported by the agent; not verified against Git."),
				localize('semanticDiff.freshness', "Source freshness is unknown beyond the reported capture time, including when reopening a saved result."),
				localize('semanticDiff.contextRanges', "Source ranges may include unchanged context; they are not exact changed-line spans."),
			];
			if (source.diffFingerprint) {
				lines.splice(4, 0, localize('semanticDiff.fingerprint', "Fingerprint: {0}", source.diffFingerprint));
			}
			for (const line of lines) {
				dom.append(panel, dom.$('p', undefined, line));
			}
		});
	}

	private renderGroup(report: ISemanticDiffReport, projection: IGroupProjection, index: number): void {
		const { group, files, hunks } = projection;
		const card = dom.append(this.domNode, dom.$(`section.semantic-diff-card.semantic-diff-accent-${index % 4}`));
		const heading = dom.append(card, dom.$('h3.semantic-diff-card-heading'));
		const title = dom.append(heading, dom.$('span.semantic-diff-title', undefined, group.title));
		title.id = `${this.idPrefix}-group-${index}`;
		card.setAttribute('aria-labelledby', title.id);
		dom.append(card, dom.$('p.semantic-diff-description', undefined, group.description));
		if (hunks.some(isSemanticDiffHunkUncertain)) {
			dom.append(card, dom.$('p.semantic-diff-uncertainty', undefined, localize('semanticDiff.uncertain', "Uncertain classification")));
		}
		const lineCounts = this.formatLineCounts(hunks);
		const summary = dom.$('span.semantic-diff-group-summary', undefined,
			dom.$('span.semantic-diff-file-count', undefined, fileCount(files.length)),
			' ',
			this.renderLineCounts(hunks),
		);
		this.createDisclosure(
			heading, card, summary, JSON.stringify(['group', group.id]), 'semantic-diff-group-toggle',
			panel => this.renderFiles(panel, report, group.id, files),
			localize('semanticDiff.groupDisclosureWithFiles', "{0}, {1} {2}, {3}", group.title, fileCount(files.length), lineCounts, hunkCount(hunks.length)),
			false,
		);
	}

	private renderFiles(parent: HTMLElement, report: ISemanticDiffReport, groupId: string | null, files: readonly IFileProjection[]): void {
		const list = dom.append(parent, dom.$('ul.semantic-diff-files'));
		const labels = this.resourceLabels.value ??= this.instantiationService.createInstance(ResourceLabels, DEFAULT_LABELS_CONTAINER);
		for (const { file, hunks } of files) {
			const row = dom.append(list, dom.$('li.semantic-diff-file'));
			const label = dom.$('span.semantic-diff-file-row');
			const resourceLabel = this._register(labels.create(label));
			const directory = posix.dirname(file.path);
			resourceLabel.setResource({
				// Derive icons without treating agent-provided paths as local workspace files.
				resource: URI.from({ scheme: Schemas.inMemory, path: `/${file.path}` }),
				name: posix.basename(file.path),
				description: directory === '.' ? '' : directory,
			}, {
				fileKind: FileKind.FILE,
				forceLabel: true,
				title: fileLabel(file),
				descriptionTitle: fileLabel(file),
			});
			resourceLabel.element.classList.add('semantic-diff-resource-label');
			dom.append(label, this.renderLineCounts(hunks));
			const ariaLabel = localize('semanticDiff.fileDisclosure', "{0}, {1}, {2}, {3}", fileLabel(file), fileStatusLabel(file), hunkCount(hunks.length), this.formatLineCounts(hunks));
			this.createDisclosure(row, row, label, JSON.stringify(['file', groupId, file.id]), 'semantic-diff-file-toggle', panel => {
				const groups = new Set(report.analysis.hunks.filter(hunk => hunk.fileId === file.id).map(hunk => hunk.classification.groupId));
				dom.append(panel, dom.$('h4', undefined, groups.size > 1 && groupId !== null
					? localize('semanticDiff.groupHunks', "Hunks in this group")
					: localize('semanticDiff.classifications', "Hunk classifications")));
				const list = dom.append(panel, dom.$('ul.semantic-diff-hunks'));
				for (const hunk of hunks) {
					this.renderHunk(dom.append(list, dom.$('li.semantic-diff-hunk')), report, hunk);
				}
			}, ariaLabel, false);
		}
	}

	private renderHunk(parent: HTMLElement, report: ISemanticDiffReport, hunk: Hunk): void {
		const classification = hunk.classification;
		dom.append(parent, dom.$('h5', undefined, classification.summary));
		dom.append(parent, dom.$('p.semantic-diff-ranges', undefined, localize('semanticDiff.ranges', "Old: {0}; New: {1}", formatSemanticDiffRange(hunk.oldRange, 'old'), formatSemanticDiffRange(hunk.newRange, 'new'))));
		const types = dom.append(parent, dom.$('p.semantic-diff-types'));
		dom.append(types, dom.$('span.semantic-diff-type', undefined, getSemanticDiffChangeTypeLabel(classification.changeType)));
		for (const type of classification.secondaryChangeTypes) {
			dom.append(types, dom.$('span.semantic-diff-type', undefined, secondaryTypeLabel(type)));
		}
		dom.append(parent, dom.$('p.semantic-diff-counts', undefined, this.renderLineCounts([hunk])));
		if (isSemanticDiffHunkUncertain(hunk)) {
			const axes = [
				...(classification.groupId === null ? [localize('semanticDiff.noGroup', "Unclassified group")] : classification.groupConfidence === 'low' ? [localize('semanticDiff.lowGroup', "Low group confidence")] : []),
				...(classification.changeType === null ? [getSemanticDiffChangeTypeLabel(null)] : classification.typeConfidence === 'low' ? [localize('semanticDiff.lowType', "Low type confidence")] : []),
			];
			dom.append(parent, dom.$('p.semantic-diff-uncertainty', undefined, localize('semanticDiff.uncertaintyReason', "{0}: {1}", axes.join('; '), classification.uncertainty ?? '')));
		}
		for (const limitation of report.analysis.limitations.filter(limitation => limitation.hunkId === hunk.id)) {
			dom.append(parent, dom.$('p.semantic-diff-limitation', undefined, limitation.message));
		}
		this.createDisclosure(parent, parent, localize('semanticDiff.classificationDetails', "Classification Details"), JSON.stringify(['rationale', hunk.id]), 'semantic-diff-rationale-toggle', panel => {
			dom.append(panel, dom.$('p', undefined, localize('semanticDiff.groupReason', "Group: {0}", classification.groupReason)));
			dom.append(panel, dom.$('p', undefined, localize('semanticDiff.typeReason', "Type: {0}", classification.typeReason)));
			dom.append(panel, dom.$('p', undefined, localize('semanticDiff.confidences', "Group confidence: {0}; Type confidence: {1}", getSemanticDiffConfidenceLabel(classification.groupConfidence), getSemanticDiffConfidenceLabel(classification.typeConfidence))));
			if (classification.uncertainty && !isSemanticDiffHunkUncertain(hunk)) {
				dom.append(panel, dom.$('p', undefined, classification.uncertainty));
			}
		});
	}

	private lineCounts(hunks: readonly Hunk[]): { additions: number; deletions: number } {
		const additions = hunks.reduce((sum, hunk) => sum + hunk.additions, 0);
		const deletions = hunks.reduce((sum, hunk) => sum + hunk.deletions, 0);
		return { additions, deletions };
	}

	private formatLineCounts(hunks: readonly Hunk[]): string {
		const { additions, deletions } = this.lineCounts(hunks);
		return localize('semanticDiff.compactLines', "+{0} -{1}", additions, deletions);
	}

	private renderLineCounts(hunks: readonly Hunk[]): HTMLElement {
		const { additions, deletions } = this.lineCounts(hunks);
		return dom.$('span.semantic-diff-line-counts', undefined,
			dom.$('span.semantic-diff-lines-added', undefined, localize('semanticDiff.addedLines', "+{0}", additions)),
			' ',
			dom.$('span.semantic-diff-lines-removed', undefined, localize('semanticDiff.removedLines', "-{0}", deletions)),
		);
	}

	private hasSelection(): boolean {
		const selection = dom.getWindow(this.domNode).getSelection();
		return !!selection && !selection.isCollapsed && (this.domNode.contains(selection.anchorNode) || this.domNode.contains(selection.focusNode));
	}

	private createDisclosure(buttonParent: HTMLElement, panelParent: HTMLElement, label: string | HTMLElement, stateKey: string, className: string, render: (panel: HTMLElement) => void, ariaLabel = typeof label === 'string' ? label : label.textContent ?? '', showChevron = true): void {
		const button = this._register(new Button(buttonParent, {
			...defaultButtonStyles,
			buttonBackground: undefined,
			buttonForeground: undefined,
			buttonHoverBackground: undefined,
			buttonBorder: undefined,
			ariaLabel,
		}));
		button.element.classList.add('semantic-diff-disclosure', className);
		const icon = showChevron ? dom.append(button.element, dom.$('span.codicon', { 'aria-hidden': 'true' })) : undefined;
		dom.append(button.element, dom.$('span.semantic-diff-disclosure-label', undefined, label));
		const panel = dom.append(panelParent, dom.$('.semantic-diff-panel'));
		panel.id = `${this.idPrefix}-${encodeURIComponent(stateKey)}`;
		button.element.setAttribute('aria-controls', panel.id);
		let rendered = false;
		const update = (expanded: boolean, notify: boolean) => {
			if (!expanded && panel.contains(dom.getActiveElement())) {
				button.focus();
			}
			if (expanded && !rendered) {
				rendered = true;
				render(panel);
			}
			panel.hidden = !expanded;
			button.element.setAttribute('aria-expanded', String(expanded));
			icon?.classList.toggle('codicon-chevron-down', expanded);
			icon?.classList.toggle('codicon-chevron-right', !expanded);
			if (expanded) {
				this.state.expanded.add(stateKey);
			} else {
				this.state.expanded.delete(stateKey);
			}
			if (notify) {
				this._onDidChangeHeight.fire();
			}
		};
		this._register(button.onDidClick(event => {
			event.stopPropagation();
			if (event.type !== dom.EventType.KEY_DOWN && (this.selectionAtPointerDown || this.hasSelection())) {
				return;
			}
			event.preventDefault();
			update(!this.state.expanded.has(stateKey), true);
		}));
		update(this.state.expanded.has(stateKey), false);
	}
}
