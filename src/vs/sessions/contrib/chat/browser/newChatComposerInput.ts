/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../../base/common/event.js';
import { IHoverDelegate } from '../../../../base/browser/ui/hover/hoverDelegate.js';
import { IDisposable } from '../../../../base/common/lifecycle.js';
import { IObservable } from '../../../../base/common/observable.js';
import * as dom from '../../../../base/browser/dom.js';
import { localize } from '../../../../nls.js';
import { IChatInputPickerResponsiveLayoutItem } from '../../../../workbench/contrib/chat/browser/widget/input/chatInputPickerResponsiveLayout.js';
import { IModelPickerComparison } from '../../../../workbench/contrib/chat/browser/widget/input/modelPicker/modelPickerComparison.js';
import { getGitHubIssueOrPullRequestAttachments } from '../../../../workbench/contrib/chat/browser/widget/input/editor/chatPasteProviders.js';
import { IChatRequestVariableEntry, isExplicitFileOrImageVariableEntry } from '../../../../workbench/contrib/chat/common/attachments/chatVariableEntries.js';
import { IWorkspaceSelectionSnapshot } from '../../../common/workspaceSelection.js';
import { isInputGitHubContext, toInputGitHubContextMetadata } from '../common/newChatContextIds.js';
import { IActiveSession } from '../../../services/sessions/common/sessionsManagement.js';
import type { IChat } from '../../../services/sessions/common/session.js';
import { NewSessionWorkspacePreselectionSource } from './newSessionComposerService.js';
import type { NewChatUserInteraction } from './newChatUserInteraction.js';
import type { ISessionTypePickerOptions } from './sessionTypePicker.js';
import type { IChatPetPlatformOccupation } from '../../../../workbench/contrib/chat/browser/widget/chatPetWidget.js';

/**
 * The attachments with the input's GitHub issue and pull request links kept as
 * pills: links typed into the input are added, and pills for links no longer
 * in it are removed. Returns `undefined` when nothing changes.
 */
export function syncInputGitHubContextAttachments(input: string, attachments: readonly IChatRequestVariableEntry[]): IChatRequestVariableEntry[] | undefined {
	const inputAttachments = getGitHubIssueOrPullRequestAttachments(input, toInputGitHubContextMetadata());
	const inputAttachmentIds = new Set(inputAttachments.map(attachment => attachment.id));
	const synced = attachments.filter(attachment => !isInputGitHubContext(attachment) || inputAttachmentIds.has(attachment.id));
	const syncedIds = new Set(synced.map(attachment => attachment.id));
	for (const attachment of inputAttachments) {
		if (!syncedIds.has(attachment.id)) {
			synced.push(attachment);
			syncedIds.add(attachment.id);
		}
	}
	const changed = synced.length !== attachments.length || synced.some((attachment, index) => attachment !== attachments[index]);
	return changed ? synced : undefined;
}

/** Whether the composer has something to send: text, an explicit file or image, or host-provided content. */
export function hasSendableNewChatContent(query: string, attachments: readonly IChatRequestVariableEntry[], hasAdditionalSendContent = false): boolean {
	return !!query.trim() || attachments.some(isExplicitFileOrImageVariableEntry) || hasAdditionalSendContent;
}

/** The new-session composer's prompt placeholder. */
export const NEW_SESSION_PROMPT_PLACEHOLDER = localize('sessionsChatInput.placeholder.pitchYourIdea', "Pitch your idea");

/**
 * The labeled pickers in `container`, for responsive layouts that compact them
 * when the row runs out of room.
 */
export function getLabeledPickerResponsiveItems(container: HTMLElement): IChatInputPickerResponsiveLayoutItem[] {
	const elements = new Map<HTMLElement, HTMLElement | undefined>();
	const actionItemLabelCounts = new Map<HTMLElement, number>();
	const visit = (element: HTMLElement, pickerSlot: HTMLElement | undefined, actionItem: HTMLElement | undefined): void => {
		const currentPickerSlot = element.classList.contains('sessions-chat-picker-slot') ? element : pickerSlot;
		const currentActionItem = element.classList.contains('action-item') ? element : actionItem;
		if (element.classList.contains('sessions-chat-dropdown-label')) {
			const pickerElement = currentPickerSlot ?? currentActionItem;
			if (pickerElement) {
				elements.set(pickerElement, currentActionItem);
				if (currentActionItem) {
					actionItemLabelCounts.set(currentActionItem, (actionItemLabelCounts.get(currentActionItem) ?? 0) + 1);
				}
			}
		}
		for (const child of element.children) {
			if (dom.isHTMLElement(child)) {
				visit(child, currentPickerSlot, currentActionItem);
			}
		}
	};
	visit(container, undefined, undefined);

	return Array.from(elements, ([element, actionItem]) => ({
		element,
		isCompact: () => element.classList.contains('compact-picker'),
		setCompact: compact => {
			element.classList.toggle('compact-picker', compact);
			if (actionItem && actionItem !== element && actionItemLabelCounts.get(actionItem) === 1) {
				actionItem.classList.toggle('compact-picker', compact);
			}
		},
	}));
}

/**
 * Options passed to a composer's `sendRequest` callback when the user submits
 * the input.
 */
export interface INewChatInputSendRequest {
	readonly query: string;
	readonly attachments?: IChatRequestVariableEntry[];
	readonly background?: boolean;
	readonly userInteraction?: NewChatUserInteraction;
}

/** Repository controls a host renders in place of the session provider's. */
export interface IComposerRepositoryControls extends IDisposable {
	/** Whether any control is shown, so an otherwise empty controls row can hide. */
	readonly visible: IObservable<boolean>;
}

/** Options a new-session or new-chat host supplies to its composer input. */
export interface INewChatComposerInputOptions {
	readonly session: IObservable<IActiveSession | undefined>;
	/**
	 * The chat the input binds to. Defaults to the session's active chat, such as a new session's
	 * draft chat. A host that shows one of several chats passes its own, so the input never binds
	 * to another chat that is active elsewhere.
	 */
	readonly chat?: IObservable<IChat | undefined>;
	readonly getWorkspacePreselectionSource?: () => NewSessionWorkspacePreselectionSource;
	readonly getWorkspaceSelection?: () => IWorkspaceSelectionSnapshot;
	readonly onDidChangeWorkspaceSelection?: Event<void>;
	readonly canApplyWorkspaceDefault?: () => boolean;
	readonly sendRequest: (request: INewChatInputSendRequest) => Promise<boolean>;
	readonly inputVisible?: IObservable<boolean>;
	readonly hostVisible?: IObservable<boolean>;
	readonly canSendRequest: IObservable<boolean>;
	readonly canSubmitWithoutSession?: IObservable<boolean>;
	readonly hasAdditionalSendContent?: IObservable<boolean>;
	readonly loading: IObservable<boolean>;
	readonly useExperimentalLayout?: IObservable<boolean>;
	readonly placeholder?: string;
	/** Marks the input box as this onboarding spotlight target. */
	readonly onboardingTargetId?: string;
	/**
	 * The repository controls (such as isolation and branch). By default the session provider
	 * contributes them; `false` renders none, and a function renders the host's own controls in
	 * their place, so they are positioned like the provider's.
	 */
	readonly renderRepositoryControls?: boolean | ((container: HTMLElement, hoverDelegate: IHoverDelegate) => IComposerRepositoryControls);
	readonly sessionTypePickerOptions?: ISessionTypePickerOptions;
	readonly supportsBackground?: boolean;
	readonly sendButtonLabel?: IObservable<string | undefined>;
	readonly modelPickerComparison?: IModelPickerComparison;
	readonly deferredNotificationsEnabled?: IObservable<boolean>;
	readonly petHostPreferred?: IObservable<boolean>;
	readonly getChatPetPlatformElements?: () => readonly HTMLElement[];
	readonly getChatPetBasePlatformElement?: () => HTMLElement | undefined;
	readonly onDidChangeChatPetPlatform?: Event<void>;
	readonly setChatPetPlatformOccupation?: (occupation: IChatPetPlatformOccupation | undefined) => void;
	/**
	 * Keep this composer a valid voice target even while a created session
	 * is active. Used by the in-session "new chat" composer so dictation
	 * creates a parallel chat instead of routing to the parent session's
	 * chat widget. The welcome composer leaves this unset.
	 */
	readonly voiceRoutesWhileSessionActive?: boolean;
}
