/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ResourceSet } from '../../../../../../base/common/map.js';
import { basename, IExtUri } from '../../../../../../base/common/resources.js';
import { URI } from '../../../../../../base/common/uri.js';
import { localize } from '../../../../../../nls.js';
import { IChatToolInvocation, IChatToolInvocationSerialized, ToolConfirmKind } from '../../../common/chatService/chatService.js';
import { getToolInvocationSummary } from '../../../common/tools/toolInvocationSummary.js';
import { isToolResultInputOutputDetails } from '../../../common/tools/languageModelToolsService.js';

/** Summarizes visible tool activity and outcomes without interpreting model-authored messages. */
export function getToolGroupSummary(
	tools: readonly (IChatToolInvocation | IChatToolInvocationSerialized)[],
	editResourcesByPart: readonly (readonly URI[])[],
	visibleItemCount: number,
	extUri: IExtUri,
): string | undefined {
	if (visibleItemCount < tools.length + editResourcesByPart.length) {
		return undefined;
	}
	const getComparisonKey = (uri: URI) => extUri.getComparisonKey(uri);
	const reads = new ResourceSet(getComparisonKey);
	const edits = new ResourceSet(editResourcesByPart.flat(), getComparisonKey);
	const directories = new ResourceSet(getComparisonKey);
	const diagnostics = new ResourceSet(getComparisonKey);
	const phrases = new Set<string>();
	const patterns = new Set<string>();
	const calls = new Set<string>();
	let commands = 0;
	let readSteps = 0;
	let editSteps = editResourcesByPart.filter(resources => resources.length > 0).length;
	let textSearchSteps = 0;
	let fileSearchSteps = 0;
	let directorySteps = 0;
	let diagnosticSteps = 0;
	let failed = 0;
	let skipped = 0;
	let denied = 0;
	let unfinished = 0;
	let otherSteps = visibleItemCount - tools.length - editResourcesByPart.length + editResourcesByPart.filter(resources => resources.length === 0).length;

	for (const tool of tools) {
		if (calls.has(tool.toolCallId)) {
			continue;
		}
		calls.add(tool.toolCallId);
		const confirmation = IChatToolInvocation.executionConfirmedOrDenied(tool);
		const summary = getToolInvocationSummary(tool);
		if (confirmation?.type === ToolConfirmKind.Denied || summary?.kind === 'denied') {
			denied++;
			continue;
		}
		if (confirmation?.type === ToolConfirmKind.Skipped || summary?.kind === 'skipped') {
			skipped++;
			continue;
		}
		const resultDetails = IChatToolInvocation.resultDetails(tool);
		if (IChatToolInvocation.resultError(tool) || isToolResultInputOutputDetails(resultDetails) && resultDetails.isError) {
			failed++;
			continue;
		}
		if (!summary) {
			otherSteps++;
			continue;
		}
		switch (summary.kind) {
			case 'failed':
				failed++;
				break;
			case 'incomplete':
				unfinished++;
				break;
			case 'read':
				if (summary.resources.length === 0) {
					otherSteps++;
					break;
				}
				readSteps++;
				for (const { uri } of summary.resources) {
					if (!reads.has(uri)) {
						reads.add(uri);
					}
				}
				break;
			case 'search':
				if (summary.queries.length === 0 || summary.queries.some(query => !query.trim())) {
					otherSteps++;
					break;
				}
				if (summary.searchKind === 'files') {
					fileSearchSteps++;
				} else {
					textSearchSteps++;
				}
				for (const query of summary.queries) {
					(summary.searchKind === 'files' ? patterns : phrases).add(query);
				}
				break;
			case 'command':
				commands++;
				break;
			case 'edit':
				if (summary.resources.length === 0) {
					otherSteps++;
					break;
				}
				editSteps++;
				for (const { uri } of summary.resources) {
					edits.add(uri);
				}
				break;
			case 'list':
			case 'diagnostics':
				if (summary.resources.length === 0) {
					otherSteps++;
					break;
				}
				if (summary.kind === 'list') {
					directorySteps++;
				} else {
					diagnosticSteps++;
				}
				for (const { uri } of summary.resources) {
					(summary.kind === 'list' ? directories : diagnostics).add(uri);
				}
				break;
			default:
				otherSteps++;
				break;
		}
	}
	const labels: { text: string; steps: number; overflowDetail?: string }[] = [];
	const addLabel = (initial: string, continuation: string, steps: number) => labels.push({ text: labels.length === 0 ? initial : continuation, steps });
	if (edits.size === 1) {
		const file = basename([...edits][0]);
		labels.push({ text: localize('toolSummary.editedFile', "Edited {0}", file), steps: editSteps });
	} else if (edits.size > 1) {
		labels.push({ text: localize('toolSummary.editedFiles', "Edited {0} files", edits.size), steps: editSteps });
	}
	if (commands > 0) {
		addLabel(
			commands === 1 ? localize('toolSummary.ranCommand', "Ran 1 command") : localize('toolSummary.ranCommands', "Ran {0} commands", commands),
			commands === 1 ? localize('toolSummary.ranCommand.continued', "ran 1 command") : localize('toolSummary.ranCommands.continued', "ran {0} commands", commands), commands);
	}
	if (reads.size === 1) {
		const file = basename([...reads][0]);
		addLabel(localize('toolSummary.readFile', "Read {0}", file), localize('toolSummary.readFile.continued', "read {0}", file), readSteps);
	} else if (reads.size > 1) {
		addLabel(localize('toolSummary.readFiles', "Read {0} files", reads.size), localize('toolSummary.readFiles.continued', "read {0} files", reads.size), readSteps);
	}
	if (phrases.size > 0) {
		addLabel(
			phrases.size === 1 ? localize('toolSummary.searchedPhrase', "Searched for 1 phrase") : localize('toolSummary.searchedPhrases', "Searched for {0} phrases", phrases.size),
			phrases.size === 1 ? localize('toolSummary.searchedPhrase.continued', "searched for 1 phrase") : localize('toolSummary.searchedPhrases.continued', "searched for {0} phrases", phrases.size), textSearchSteps);
	}
	if (patterns.size > 0) {
		addLabel(
			patterns.size === 1 ? localize('toolSummary.searchedPattern', "Searched for 1 file pattern") : localize('toolSummary.searchedPatterns', "Searched for {0} file patterns", patterns.size),
			patterns.size === 1 ? localize('toolSummary.searchedPattern.continued', "searched for 1 file pattern") : localize('toolSummary.searchedPatterns.continued', "searched for {0} file patterns", patterns.size), fileSearchSteps);
	}
	if (directories.size > 0) {
		addLabel(
			directories.size === 1 ? localize('toolSummary.listedDirectory', "Listed 1 directory") : localize('toolSummary.listedDirectories', "Listed {0} directories", directories.size),
			directories.size === 1 ? localize('toolSummary.listedDirectory.continued', "listed 1 directory") : localize('toolSummary.listedDirectories.continued', "listed {0} directories", directories.size), directorySteps);
	}
	if (diagnostics.size > 0) {
		const first = [...diagnostics][0];
		addLabel(
			diagnostics.size === 1 ? localize('toolSummary.checkedPath', "Checked {0} for problems", basename(first) || first.path) : localize('toolSummary.checkedPaths', "Checked {0} paths for problems", diagnostics.size),
			diagnostics.size === 1 ? localize('toolSummary.checkedPath.continued', "checked {0} for problems", basename(first) || first.path) : localize('toolSummary.checkedPaths.continued', "checked {0} paths for problems", diagnostics.size), diagnosticSteps);
	}
	if (failed > 0) {
		labels.push({
			text: failed === 1 ? localize('toolSummary.failed', "1 tool call failed") : localize('toolSummary.failedPlural', "{0} tool calls failed", failed),
			steps: failed,
			overflowDetail: localize('toolSummary.failedOverflow', "{0} failed", failed),
		});
	}
	if (skipped > 0) {
		labels.push({
			text: skipped === 1 ? localize('toolSummary.skipped', "1 tool call skipped") : localize('toolSummary.skippedPlural', "{0} tool calls skipped", skipped),
			steps: skipped,
			overflowDetail: localize('toolSummary.skippedOverflow', "{0} skipped", skipped),
		});
	}
	if (denied > 0) {
		labels.push({
			text: denied === 1 ? localize('toolSummary.denied', "1 tool call denied") : localize('toolSummary.deniedPlural', "{0} tool calls denied", denied),
			steps: denied,
			overflowDetail: localize('toolSummary.deniedOverflow', "{0} denied", denied),
		});
	}
	if (unfinished > 0) {
		labels.push({
			text: unfinished === 1 ? localize('toolSummary.unfinished', "1 unfinished tool call") : localize('toolSummary.unfinishedPlural', "{0} unfinished tool calls", unfinished),
			steps: unfinished,
			overflowDetail: localize('toolSummary.unfinishedOverflow', "{0} unfinished", unfinished),
		});
	}
	const visibleLabels = labels.slice(0, 3).map(label => label.text);
	const overflow = labels.slice(3);
	otherSteps += overflow.reduce((total, label) => total + label.steps, 0);
	if (otherSteps > 0 && visibleLabels.length > 0) {
		const otherLabel = otherSteps === 1 ? localize('toolSummary.otherStep', "1 other step") : localize('toolSummary.otherSteps', "{0} other steps", otherSteps);
		const outcomes = combineLabels(overflow.flatMap(label => label.overflowDetail ? [label.overflowDetail] : []));
		visibleLabels.push(outcomes ? localize('toolSummary.otherStepsWithOutcomes', "{0} ({1})", otherLabel, outcomes) : otherLabel);
	}
	return combineLabels(visibleLabels);
}

function combineLabels(labels: readonly string[]): string | undefined {
	return labels.reduce<string | undefined>((summary, label) => summary === undefined
		? label : localize('toolSummary.combined', "{0}, {1}", summary, label), undefined);
}
