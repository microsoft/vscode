/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../../base/common/codicons.js';
import { ThemeIcon } from '../../../base/common/themables.js';
import { localize2 } from '../../../nls.js';
import { ICommandActionTitle } from '../../action/common/action.js';
import { IConfigurationService } from '../../configuration/common/configuration.js';

export const ChatSessionArchiveActionWordingSettingId = 'chat.experimental.sessionArchiveActionWording';

export const enum ChatSessionArchiveActionWording {
	Archive = 'archive',
	MarkAsDone = 'done',
}

export interface IChatSessionArchiveAction {
	readonly title: ICommandActionTitle;
	readonly icon: ThemeIcon;
}

export interface IChatSessionArchiveActionPresentation {
	readonly archive: IChatSessionArchiveAction;
	readonly archiveAll: IChatSessionArchiveAction;
	readonly unarchive: IChatSessionArchiveAction;
	readonly unarchiveAll: IChatSessionArchiveAction;
}

const archiveActionPresentation: IChatSessionArchiveActionPresentation = {
	archive: {
		title: localize2('chatSession.archive', "Archive"),
		icon: Codicon.archive,
	},
	archiveAll: {
		title: localize2('chatSession.archiveAll', "Archive All"),
		icon: Codicon.archive,
	},
	unarchive: {
		title: localize2('chatSession.unarchive', "Unarchive"),
		icon: Codicon.unarchive,
	},
	unarchiveAll: {
		title: localize2('chatSession.unarchiveAll', "Unarchive All"),
		icon: Codicon.unarchive,
	},
};

const markAsDoneActionPresentation: IChatSessionArchiveActionPresentation = {
	archive: {
		title: localize2('chatSession.markAsDone', "Mark as Done"),
		icon: Codicon.check,
	},
	archiveAll: {
		title: localize2('chatSession.markAllAsDone', "Mark All as Done"),
		icon: Codicon.checkAll,
	},
	unarchive: {
		title: localize2('chatSession.restore', "Restore"),
		icon: Codicon.redo,
	},
	unarchiveAll: {
		title: localize2('chatSession.restoreAll', "Restore All"),
		icon: Codicon.redo,
	},
};

export function getChatSessionArchiveActionWording(configurationService: IConfigurationService): ChatSessionArchiveActionWording {
	return configurationService.getValue<ChatSessionArchiveActionWording>(ChatSessionArchiveActionWordingSettingId) === ChatSessionArchiveActionWording.MarkAsDone
		? ChatSessionArchiveActionWording.MarkAsDone
		: ChatSessionArchiveActionWording.Archive;
}

export function getChatSessionArchiveActionPresentation(wording: ChatSessionArchiveActionWording): IChatSessionArchiveActionPresentation {
	return wording === ChatSessionArchiveActionWording.MarkAsDone ? markAsDoneActionPresentation : archiveActionPresentation;
}
