/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { KeyCode, KeyMod } from '../../../../../base/common/keyCodes.js';
import { ServicesAccessor } from '../../../../../editor/browser/editorExtensions.js';
import { localize2 } from '../../../../../nls.js';
import {
	Action2,
	registerAction2,
} from '../../../../../platform/actions/common/actions.js';
import { KeybindingWeight } from '../../../../../platform/keybinding/common/keybindingsRegistry.js';
import { CHAT_CATEGORY } from './chatActions.js';
import { IChatWidgetService } from '../chat.js';
import { ChatContextKeys } from '../../common/actions/chatContextKeys.js';
import { ChatScrollbarPromptMarkerClickBehavior } from '../../common/constants.js';
import {
	IChatPendingDividerViewModel,
	IChatRequestViewModel,
	IChatResponseViewModel,
	isRequestVM,
	isResponseVM,
} from '../../common/model/chatViewModel.js';
import { isAskQuestionsToolInvocation } from '../widget/chatContentParts/toolInvocationParts/chatToolPartUtilities.js';

type ChatPromptNavigationItem =
	| IChatRequestViewModel
	| IChatResponseViewModel
	| IChatPendingDividerViewModel;

/**
 * The semantic category of a scrollbar marker. Each type maps to a distinct
 * color and lane assignment, allowing users to visually distinguish different
 * kinds of chat turns at a glance in the overview ruler.
 */
export const enum ChatScrollbarPromptMarkerType {
	/** A user-authored prompt (request). Rendered in the right lane. */
	Prompt = 'prompt',
	/** A response containing an ask-questions tool invocation or question carousel. Rendered in the left lane. */
	AskQuestion = 'askQuestion',
	/** A response containing one or more file edits. Rendered full-width. */
	FileChange = 'fileChange',
	/** A system-initiated compaction request (e.g. `/compact`). Rendered full-width. */
	Compaction = 'compaction',
	/** A response that ended in an error. Rendered full-width. */
	Error = 'error',
}

/**
 * Which horizontal portion of the scrollbar the marker occupies.
 * Left and right lanes each take 50% of the scrollbar width; full spans the entire width.
 * This mirrors Monaco's overview ruler lane layout.
 */
export const enum ChatScrollbarPromptMarkerLane {
	Left = 'left',
	Right = 'right',
	Full = 'full',
}

/**
 * The host widget that marker clicks are dispatched to.
 */
export interface IChatScrollbarPromptMarkerTarget {
	reveal(item: IChatRequestViewModel | IChatResponseViewModel): void;
	focusItem(item: IChatRequestViewModel | IChatResponseViewModel): void;
}

/**
 * Describes a single marker to be rendered on the chat scrollbar overview ruler.
 *
 * A descriptor is produced for each user prompt (request row) and, conditionally,
 * for its paired response row. File-change responses may produce multiple
 * descriptors — one per logical edit cluster within the response — so that
 * individual file operations are individually navigable.
 */
export interface IChatScrollbarPromptMarkerDescriptor {
	/** Unique identifier for this marker. May include a suffix for multi-marker responses (e.g. `responseId#fileChange0`). */
	readonly id: string;
	/** The ID of the request that this marker belongs to. */
	readonly requestId: string;
	/** The request view model that originated this marker's turn. */
	readonly request: IChatRequestViewModel;
	/** The chat row (request or response) that this marker positions itself against and navigates to when clicked. */
	readonly target: IChatRequestViewModel | IChatResponseViewModel;
	/** The semantic type, determining color and lane. */
	readonly markerType: ChatScrollbarPromptMarkerType;
	/** Which horizontal lane the marker occupies. */
	readonly lane: ChatScrollbarPromptMarkerLane;
	/** Z-index ordering value; higher-priority markers render above lower ones when overlapping. */
	readonly priority: number;
	/** Minimum pixel height to keep the marker visible even for very short chat rows. */
	readonly minHeight: number;
	/**
	 * When set, positions the marker at a fractional offset within the target row's
	 * rendered height (0 = top, 1 = bottom). Used by file-change markers that represent
	 * a sub-region of a large response. When undefined, the marker spans the full row.
	 */
	readonly topRatio?: number;
	/**
	 * When set, controls the fractional height of the marker relative to the target
	 * row's rendered height. Used together with {@link topRatio} for sub-row markers.
	 * When undefined, the marker uses the full row height.
	 */
	readonly heightRatio?: number;
}

/**
 * Returns all user prompt requests from the given chat items, filtering out
 * system-initiated requests (except compaction) and deduplicating by message text.
 */
export function getUserPromptRequests(
	items: readonly ChatPromptNavigationItem[],
): IChatRequestViewModel[] {
	return items.filter((item): item is IChatRequestViewModel =>
		isRequestVM(item),
	);
}

/**
 * Returns the set of request view models that have at least one marker descriptor.
 * This is the subset of {@link getUserPromptRequests} that survived deduplication
 * and system-initiated filtering.
 */
export function getScrollbarPromptMarkerRequests(
	items: readonly ChatPromptNavigationItem[],
): IChatRequestViewModel[] {
	return getScrollbarPromptMarkerDescriptors(items).filter(
		(descriptor) => descriptor.target === descriptor.request,
	).map(
		(descriptor) => descriptor.request,
	);
}

/**
 * Computes all scrollbar marker descriptors for a given set of chat items.
 *
 * The algorithm works in three phases:
 * 1. **Index responses** by their owning request ID for O(1) lookup.
 * 2. **Deduplicate requests** by message text (or by ID for compaction), keeping
 *    only the latest attempt. System-initiated requests are excluded unless they
 *    are compaction requests.
 * 3. **Emit descriptors** — one prompt marker per surviving request, plus zero or
 *    more response markers (error, ask-question, or file-change) for the paired
 *    response. File-change responses may emit multiple markers, one per logical
 *    edit cluster.
 */
export function getScrollbarPromptMarkerDescriptors(
	items: readonly ChatPromptNavigationItem[],
): IChatScrollbarPromptMarkerDescriptor[] {
	const latestByDedupKey = new Map<string, IChatRequestViewModel>();
	const responseByRequestId = new Map<string, IChatResponseViewModel>();

	// Phase 1: Index responses by request ID
	for (const item of items) {
		if (isResponseVM(item)) {
			responseByRequestId.set(item.requestId, item);
		}
	}

	// Phase 2: Deduplicate requests, keeping the latest attempt per message text
	for (const item of items) {
		if (!isRequestVM(item)) {
			continue;
		}

		// Skip system-initiated requests unless they are compaction
		if (item.isSystemInitiated && !isCompactionRequest(item)) {
			continue;
		}

		// Compaction requests are deduplicated by ID (each is unique);
		// all other requests are deduplicated by message text
		const dedupKey =
			isCompactionRequest(item)
				? item.id
				: item.messageText;
		const previous = latestByDedupKey.get(dedupKey);
		if (
			!previous ||
			item.attempt > previous.attempt ||
			(item.attempt === previous.attempt &&
				item.timestamp >= previous.timestamp)
		) {
			latestByDedupKey.set(dedupKey, item);
		}
	}

	// Build the set of request IDs that survived deduplication
	const selectedRequestIds = new Set<string>();
	for (const item of items) {
		if (!isRequestVM(item)) {
			continue;
		}

		if (item.isSystemInitiated && !isCompactionRequest(item)) {
			continue;
		}

		const dedupKey =
			isCompactionRequest(item)
				? item.id
				: item.messageText;
		if (latestByDedupKey.get(dedupKey) === item) {
			selectedRequestIds.add(item.id);
		}
	}

	// Phase 3: Emit descriptors for each surviving request and its paired response
	const descriptors: IChatScrollbarPromptMarkerDescriptor[] = [];
	for (const item of items) {
		if (!isRequestVM(item) || !selectedRequestIds.has(item.id)) {
			continue;
		}

		// Emit a prompt or compaction marker for the request row itself
		const requestMarkerType = isCompactionRequest(item)
			? ChatScrollbarPromptMarkerType.Compaction
			: ChatScrollbarPromptMarkerType.Prompt;
		descriptors.push({
			id: item.id,
			requestId: item.id,
			request: item,
			target: item,
			markerType: requestMarkerType,
			lane: getMarkerLane(requestMarkerType),
			priority: getMarkerPriority(requestMarkerType),
			minHeight: 4,
		});

		// Emit zero or more markers for the paired response row
		descriptors.push(...getResponseMarkerDescriptors(item, responseByRequestId.get(item.id)));
	}

	return descriptors;
}

/**
 * Computes marker descriptors for a response, classifying it by its most
 * significant semantic property. The classification priority is:
 * 1. Error — a failed response always wins
 * 2. Ask-question — a response containing an ask-questions tool or carousel
 * 3. File-change — a response containing file edits (may produce multiple markers)
 * 4. File-change fallback — when the request has editedFileEvents but the response
 *    has no structured edit parts (e.g. the response is missing or incomplete)
 *
 * If none of these apply, no response marker is emitted.
 */
function getResponseMarkerDescriptors(
	request: IChatRequestViewModel,
	response: IChatResponseViewModel | undefined,
): IChatScrollbarPromptMarkerDescriptor[] {
	if (!response) {
		return hasFileChangeRequest(request)
			? [{
				id: `${request.id}-fileChange`,
				requestId: request.id,
				request,
				target: request,
				markerType: ChatScrollbarPromptMarkerType.FileChange,
				lane: getMarkerLane(ChatScrollbarPromptMarkerType.FileChange),
				priority: getMarkerPriority(ChatScrollbarPromptMarkerType.FileChange),
				minHeight: 4,
			}]
			: [];
	}

	if (response.errorDetails) {
		return [{
			id: response.id,
			requestId: request.id,
			request,
			target: response,
			markerType: ChatScrollbarPromptMarkerType.Error,
			lane: getMarkerLane(ChatScrollbarPromptMarkerType.Error),
			priority: getMarkerPriority(ChatScrollbarPromptMarkerType.Error),
			minHeight: 4,
		}];
	}

	if (hasAskQuestionsResponse(response)) {
		return [{
			id: response.id,
			requestId: request.id,
			request,
			target: response,
			markerType: ChatScrollbarPromptMarkerType.AskQuestion,
			lane: getMarkerLane(ChatScrollbarPromptMarkerType.AskQuestion),
			priority: getMarkerPriority(ChatScrollbarPromptMarkerType.AskQuestion),
			minHeight: 4,
		}];
	}

	const fileChangeDescriptors = getFileChangeResponseDescriptors(request, response);
	if (fileChangeDescriptors.length > 0) {
		return fileChangeDescriptors;
	}

	if (hasFileChangeRequest(request)) {
		return [{
			id: response.id,
			requestId: request.id,
			request,
			target: response,
			markerType: ChatScrollbarPromptMarkerType.FileChange,
			lane: getMarkerLane(ChatScrollbarPromptMarkerType.FileChange),
			priority: getMarkerPriority(ChatScrollbarPromptMarkerType.FileChange),
			minHeight: 4,
		}];
	}

	return [];
}

/**
 * Maps a marker type to its horizontal lane assignment.
 * - Prompt → right lane (user prompts on the right)
 * - AskQuestion → left lane (questions on the left)
 * - All others → full width
 */
function getMarkerLane(
	markerType: ChatScrollbarPromptMarkerType,
): ChatScrollbarPromptMarkerLane {
	switch (markerType) {
		case ChatScrollbarPromptMarkerType.AskQuestion:
			return ChatScrollbarPromptMarkerLane.Left;
		case ChatScrollbarPromptMarkerType.Prompt:
			return ChatScrollbarPromptMarkerLane.Right;
		default:
			return ChatScrollbarPromptMarkerLane.Full;
	}
}

/**
 * Maps a marker type to its z-index priority for overlap resolution.
 * Higher values render above lower ones when markers collide vertically.
 */
function getMarkerPriority(
	markerType: ChatScrollbarPromptMarkerType,
): number {
	switch (markerType) {
		case ChatScrollbarPromptMarkerType.Error:
			return 100;
		case ChatScrollbarPromptMarkerType.Compaction:
			return 90;
		case ChatScrollbarPromptMarkerType.FileChange:
			return 80;
		case ChatScrollbarPromptMarkerType.AskQuestion:
			return 70;
		default:
			return 60;
	}
}

/**
 * Returns true if the request was initiated by the `/compact` slash command.
 */
function isCompactionRequest(request: IChatRequestViewModel): boolean {
	return request.slashCommand?.name === 'compact';
}

/**
 * Returns true if the response contains an ask-questions tool invocation
 * (identified by tool ID) or a question carousel part.
 */
function hasAskQuestionsResponse(response: IChatResponseViewModel | undefined): boolean {
	if (!response) {
		return false;
	}

	return response.model.entireResponse.value.some(part =>
		(part.kind === 'toolInvocation' || part.kind === 'toolInvocationSerialized')
			? isAskQuestionsToolInvocation(part)
			: part.kind === 'questionCarousel'
	);
}

/**
 * Computes one or more file-change marker descriptors for a response by
 * grouping its edit parts into logical clusters. Each cluster typically
 * corresponds to a single file write operation (e.g. `copilot_createFile`
 * followed by its `textEditGroup`), allowing users to navigate to
 * individual file operations within a large response.
 *
 * Each descriptor carries {@link topRatio} and {@link heightRatio} so the
 * controller can position the marker at the correct sub-region of the
 * response row rather than spanning the entire row.
 */
function getFileChangeResponseDescriptors(
	request: IChatRequestViewModel,
	response: IChatResponseViewModel,
): IChatScrollbarPromptMarkerDescriptor[] {
	const parts = response.model.entireResponse.value;
	const groups = groupFileEditParts(parts);
	if (groups.length === 0) {
		return [];
	}

	return groups.map((group, index) => ({
		id: groups.length === 1 ? response.id : `${response.id}#fileChange${index}`,
		requestId: request.id,
		request,
		target: response,
		markerType: ChatScrollbarPromptMarkerType.FileChange,
		lane: getMarkerLane(ChatScrollbarPromptMarkerType.FileChange),
		priority: getMarkerPriority(ChatScrollbarPromptMarkerType.FileChange),
		minHeight: 4,
		topRatio: group.startIndex / parts.length,
		heightRatio: Math.max((group.endExclusive - group.startIndex) / parts.length, 1 / parts.length),
	}));
}

/**
 * Groups response parts into logical file-edit clusters. A cluster starts at
 * a file-write tool invocation (e.g. `copilot_createFile`, `copilot_replaceString`)
 * and extends through all consecutive edit parts (`textEditGroup`, `notebookEditGroup`,
 * `externalEdit`) that follow it. Non-edit parts between edit parts do not break
 * the cluster, but a new write tool invocation starts a new cluster.
 *
 * If no write tool invocations are found, each edit part becomes its own cluster.
 */
function groupFileEditParts(
	parts: readonly IChatResponseViewModel['model']['entireResponse']['value'][number][],
): Array<{ startIndex: number; endExclusive: number }> {
	const groups: Array<{ startIndex: number; endExclusive: number }> = [];
	let pendingWriteToolIndex: number | undefined;
	let currentGroup: { startIndex: number; endExclusive: number } | undefined;

	for (let index = 0; index < parts.length; index++) {
		const part = parts[index];

		if (isFileWriteToolInvocation(part)) {
			// A new write tool starts a new cluster — flush the previous one
			if (currentGroup) {
				groups.push(currentGroup);
				currentGroup = undefined;
			}
			pendingWriteToolIndex = index;
			continue;
		}

		if (!isFileEditPart(part)) {
			continue;
		}

		if (!currentGroup) {
			currentGroup = {
				startIndex: pendingWriteToolIndex ?? index,
				endExclusive: index + 1,
			};
		} else {
			currentGroup.endExclusive = index + 1;
		}
	}

	if (currentGroup) {
		groups.push(currentGroup);
	}

	// Fallback: if no write tool invocations were found, treat each edit part as its own cluster
	if (groups.length > 0) {
		return groups;
	}

	return parts.flatMap((part, index) => isFileEditPart(part)
		? [{ startIndex: index, endExclusive: index + 1 }]
		: []);
}

/**
 * Returns true if the response part represents a file edit
 * (text edit group, notebook edit group, or external edit).
 */
function isFileEditPart(
	part: IChatResponseViewModel['model']['entireResponse']['value'][number],
): boolean {
	switch (part.kind) {
		case 'textEditGroup':
		case 'notebookEditGroup':
		case 'externalEdit':
			return true;
		default:
			return false;
	}
}

/**
 * Returns true if the response part is a tool invocation that performs a
 * file write operation (create, delete, replace, rename, etc.).
 * These tool invocations mark the start of a new file-edit cluster.
 */
function isFileWriteToolInvocation(
	part: IChatResponseViewModel['model']['entireResponse']['value'][number],
): boolean {
	if (part.kind !== 'toolInvocation' && part.kind !== 'toolInvocationSerialized') {
		return false;
	}

	return /^copilot_(createFile|createDirectory|deleteFile|replaceString|multiReplaceString|insertEditIntoFile|applyPatch|renameFile|moveFile)$/i.test(part.toolId);
}

/**
 * Returns true if the request has recorded file-edit events
 * (from `editedFileEvents` on the request model). This is used as a
 * fallback signal for file-change markers when the response itself
 * has no structured edit parts.
 */
function hasFileChangeRequest(request: IChatRequestViewModel): boolean {
	return (request.editedFileEvents?.length ?? 0) > 0;
}

export function getFocusedScrollbarPromptMarkerRequestId(
	item: IChatRequestViewModel | IChatResponseViewModel | undefined,
): string | undefined {
	if (!item) {
		return undefined;
	}

	if (isRequestVM(item)) {
		return item.id;
	}

	if (isResponseVM(item)) {
		return item.requestId;
	}

	return undefined;
}

export function getFocusedScrollbarPromptMarkerId(
	item: IChatRequestViewModel | IChatResponseViewModel | undefined,
): string | undefined {
	return item?.id;
}

export function applyScrollbarPromptMarkerClickBehavior(
	target: IChatScrollbarPromptMarkerTarget,
	item: IChatRequestViewModel | IChatResponseViewModel,
	behavior: ChatScrollbarPromptMarkerClickBehavior,
): void {
	if (behavior === ChatScrollbarPromptMarkerClickBehavior.Reveal) {
		target.reveal(item);
		return;
	}

	target.reveal(item);
	target.focusItem(item);
}

export function registerChatPromptNavigationActions() {
	registerAction2(
		class NextUserPromptAction extends Action2 {
			constructor() {
				super({
					id: 'workbench.action.chat.nextUserPrompt',
					title: localize2(
						"interactive.nextUserPrompt.label",
						"Next User Prompt",
					),
					keybinding: {
						primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.DownArrow,
						weight: KeybindingWeight.WorkbenchContrib,
						when: ChatContextKeys.inChatSession,
					},
					precondition: ChatContextKeys.enabled,
					f1: true,
					category: CHAT_CATEGORY,
				});
			}

			run(accessor: ServicesAccessor, ...args: unknown[]) {
				navigateUserPrompts(accessor, false);
			}
		},
	);

	registerAction2(
		class PreviousUserPromptAction extends Action2 {
			constructor() {
				super({
					id: 'workbench.action.chat.previousUserPrompt',
					title: localize2(
						"interactive.previousUserPrompt.label",
						"Previous User Prompt",
					),
					keybinding: {
						primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.UpArrow,
						weight: KeybindingWeight.WorkbenchContrib,
						when: ChatContextKeys.inChatSession,
					},
					precondition: ChatContextKeys.enabled,
					f1: true,
					category: CHAT_CATEGORY,
				});
			}

			run(accessor: ServicesAccessor, ...args: unknown[]) {
				navigateUserPrompts(accessor, true);
			}
		},
	);
}

function navigateUserPrompts(accessor: ServicesAccessor, reverse: boolean) {
	const chatWidgetService = accessor.get(IChatWidgetService);
	const widget = chatWidgetService.lastFocusedWidget;
	if (!widget) {
		return;
	}

	const items = widget.viewModel?.getItems();
	if (!items || items.length === 0) {
		return;
	}

	// Get all user prompts (requests) in the conversation
	const userPrompts = getUserPromptRequests(items);
	if (userPrompts.length === 0) {
		return;
	}

	// Find the currently focused item
	const focused = widget.getFocus();
	let currentIndex = -1;

	if (focused) {
		if (isRequestVM(focused)) {
			// If a request is focused, find its index in the user prompts array
			currentIndex = userPrompts.findIndex(
				(prompt) => prompt.id === focused.id,
			);
		} else if (isResponseVM(focused)) {
			// If a response is focused, find the associated request's index
			// Response view models have a requestId property
			currentIndex = userPrompts.findIndex(
				(prompt) => prompt.id === focused.requestId,
			);
		}
	}

	// Calculate next index
	let nextIndex: number;
	if (currentIndex === -1) {
		// No current focus, go to first or last prompt based on direction
		nextIndex = reverse ? userPrompts.length - 1 : 0;
	} else {
		// Navigate to next/previous prompt
		nextIndex = reverse ? currentIndex - 1 : currentIndex + 1;

		// Clamp instead of wrap and stay at boundaries when trying to navigate past ends
		if (nextIndex < 0) {
			nextIndex = 0; // already at first, do not move further
		} else if (nextIndex >= userPrompts.length) {
			nextIndex = userPrompts.length - 1; // already at last, do not move further
		}

		// avoid re-focusing if we didn't actually move
		if (nextIndex === currentIndex) {
			return; // no change in focus
		}
	}

	// Focus and reveal the selected user prompt
	const targetPrompt = userPrompts[nextIndex];
	if (targetPrompt) {
		widget.focus(targetPrompt);
		widget.reveal(targetPrompt);
	}
}
