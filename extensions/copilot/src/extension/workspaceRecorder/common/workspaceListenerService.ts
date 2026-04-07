/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { Uri } from 'vscode';
import { IDocumentEventDataSetChangeReason } from '../../../platform/workspaceRecorder/common/workspaceLog';
import { Event } from '../../../util/vs/base/common/event';
import { createDecorator as createServiceIdentifier } from '../../../util/vs/platform/instantiation/common/instantiation';

export const IWorkspaceListenerService = createServiceIdentifier<IWorkspaceListenerService>('IWorkspaceListenerService');

export interface IWorkspaceListenerService {
	readonly _serviceBrand: undefined;

	onStructuredData: Event<IRecordableLogEntry | IRecordableEditorLogEntry>;

	// If it fires, it is guaranteed to fire 10 seconds after the corresponding model version.
	onHandleChangeReason: Event<{ documentUri: string; documentVersion: number; reason: string; metadata: ITextModelEditReasonMetadata }>;
}

export interface IRecordableLogEntry {
	sourceId: string;
	time: number;
}

export interface IRecordableEditorLogEntry extends IRecordableLogEntry {
	modelUri: Uri;
	modelVersion: number;
}

export interface ITextModelEditReasonMetadata extends IDocumentEventDataSetChangeReason {
	source: 'inlineSuggestion.accept' | 'snippet' | 'Chat.applyEdits' | 'inlineChat.applyEdit' | 'reloadFromDisk' | 'formatEditsCommand' | string;
	extensionId?: string;
	nes?: boolean;
	type?: 'word' | 'line';
	requestUuid?: string;
}
