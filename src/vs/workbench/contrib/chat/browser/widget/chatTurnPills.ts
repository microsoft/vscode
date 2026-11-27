/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../../../../base/common/codicons.js';
import { Schemas } from '../../../../../base/common/network.js';
import { isWeb } from '../../../../../base/common/platform.js';
import { URI } from '../../../../../base/common/uri.js';
import { localize } from '../../../../../nls.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IOpenerService } from '../../../../../platform/opener/common/opener.js';
import { BrowserViewEditorId } from '../../../browserView/common/browserView.js';
import { getEditorOverrideForChatResource } from './chatEditorAssociations.js';
import { ChatPillSingleEntry, type IChatDropdownPillOptions } from '../../../../browser/chatDropdownPill.js';

/**
 * Presentation of the artifacts pill. Only a file artifact is worth showing in
 * place of the summary — its name and themed icon say what it is — while any
 * other lone artifact stays behind the count, so the row keeps a stable shape
 * instead of turning into whichever artifact happens to be recorded first.
 */
export const chatArtifactPillOptions: IChatDropdownPillOptions = {
	widgetId: 'chatArtifacts',
	icon: Codicon.package,
	title: localize('chatArtifacts.title', "Artifacts"),
	summaryLabel: count => count === 1
		? localize('chatArtifacts.countSingle', "1 Artifact")
		: localize('chatArtifacts.count', "{0} Artifacts", count),
	summaryAriaLabel: count => count === 1
		? localize('chatArtifacts.showSingle', "Show 1 artifact")
		: localize('chatArtifacts.show', "Show {0} artifacts", count),
	singleEntry: ChatPillSingleEntry.InlineResource,
};

/** Aggregate diff counts shown in the changes pill (scoped to a single turn). */
export interface IDiffStats {
	readonly files: number;
	readonly insertions: number;
	readonly deletions: number;
}

export const EMPTY_DIFF_STATS: IDiffStats = { files: 0, insertions: 0, deletions: 0 };

/** A file outside the workspace that the artifact pill can open. */
export interface IPreviewFile {
	readonly uri: URI;
	readonly kind: 'markdown' | 'html';
	/** Whether the file was created (vs. edited) during the turn. */
	readonly created: boolean;
}

/** Classify a resource as a previewable file, if applicable. */
export function previewKind(uri: URI, htmlPreviewAvailable = !isWeb): IPreviewFile['kind'] | undefined {
	const path = uri.path.toLowerCase();
	if (path.endsWith('.md') || path.endsWith('.markdown')) {
		return 'markdown';
	}
	if (htmlPreviewAvailable && uri.scheme === Schemas.file && (path.endsWith('.html') || path.endsWith('.htm'))) {
		return 'html';
	}
	return undefined;
}

export function diffStatsEqual(a: IDiffStats, b: IDiffStats): boolean {
	return a.files === b.files && a.insertions === b.insertions && a.deletions === b.deletions;
}

/** Opens a turn file with the editor configured for resources opened from chat. */
export async function openChatTurnFile(file: IPreviewFile, openerService: IOpenerService, configurationService: IConfigurationService): Promise<void> {
	const configuredOverride = getEditorOverrideForChatResource(file.uri, configurationService);
	await openerService.open(file.uri, {
		fromUserGesture: true,
		editorOptions: {
			override: configuredOverride ?? (file.kind === 'html' ? BrowserViewEditorId : undefined),
		},
	});
}
