/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { RunOnceScheduler } from '../../../../../base/common/async.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import { IWorkbenchContribution, WorkbenchPhase, registerWorkbenchContribution2 } from '../../../../common/contributions.js';
import { IWorkbenchEnvironmentService } from '../../../../services/environment/common/environmentService.js';
import { IEditorGroupsService } from '../../../../services/editor/common/editorGroupsService.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';
import { ChatEditorInput } from '../widgetHosts/editor/chatEditorInput.js';

/** Countable editor state for one editor group. */
export interface IChatEditorTopologyGroup {
	readonly editorTypeIds: readonly string[];
	readonly activeEditorTypeId: string | undefined;
}

/** Count-only topology of the main editor part. */
export interface IChatEditorTopologySnapshot {
	readonly openChatEditorCount: number;
	readonly visibleChatEditorCount: number;
	readonly chatEditorGroupCount: number;
	readonly visibleEditorCount: number;
	readonly editorGroupCount: number;
}

/** Computes the count-only topology of Chat Editors in the supplied groups. */
export function computeChatEditorTopologySnapshot(groups: readonly IChatEditorTopologyGroup[]): IChatEditorTopologySnapshot {
	let openChatEditorCount = 0;
	let visibleChatEditorCount = 0;
	let chatEditorGroupCount = 0;
	let visibleEditorCount = 0;

	for (const group of groups) {
		const groupChatEditorCount = group.editorTypeIds.filter(typeId => typeId === ChatEditorInput.TypeID).length;
		openChatEditorCount += groupChatEditorCount;
		chatEditorGroupCount += groupChatEditorCount > 0 ? 1 : 0;
		visibleEditorCount += group.activeEditorTypeId === undefined ? 0 : 1;
		visibleChatEditorCount += group.activeEditorTypeId === ChatEditorInput.TypeID ? 1 : 0;
	}

	return {
		openChatEditorCount,
		visibleChatEditorCount,
		chatEditorGroupCount,
		visibleEditorCount,
		editorGroupCount: groups.length,
	};
}

/** Returns whether a distinct topology involving Chat Editors should be logged. */
export function shouldLogChatEditorTopologySnapshot(previous: IChatEditorTopologySnapshot | undefined, current: IChatEditorTopologySnapshot): boolean {
	if (previous
		&& previous.openChatEditorCount === current.openChatEditorCount
		&& previous.visibleChatEditorCount === current.visibleChatEditorCount
		&& previous.chatEditorGroupCount === current.chatEditorGroupCount
		&& previous.visibleEditorCount === current.visibleEditorCount
		&& previous.editorGroupCount === current.editorGroupCount) {
		return false;
	}

	return current.openChatEditorCount > 0 || (previous?.openChatEditorCount ?? 0) > 0;
}

type ChatEditorTopologyClassification = {
	openChatEditorCount: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Number of Chat Editors open in the main editor part, including inactive tabs.' };
	visibleChatEditorCount: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Number of Chat Editors simultaneously visible as the active editor in a main editor group.' };
	chatEditorGroupCount: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Number of main editor groups containing at least one Chat Editor.' };
	visibleEditorCount: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Number of main editor groups with a visible active editor.' };
	editorGroupCount: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Total number of main editor groups.' };
	owner: 'bryanchen-d';
	comment: 'Tracks count-only main editor topology snapshots while Chat Editors are open to measure simultaneous multi-Chat layouts.';
};

export class ChatEditorTopologyTelemetry extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.chatEditorTopologyTelemetry';

	private readonly logScheduler = this._register(new RunOnceScheduler(() => this.logCurrentSnapshot(), 100));
	private previousSnapshot: IChatEditorTopologySnapshot | undefined;

	constructor(
		@IEditorService private readonly editorService: IEditorService,
		@IEditorGroupsService private readonly editorGroupsService: IEditorGroupsService,
		@ITelemetryService private readonly telemetryService: ITelemetryService,
		@IWorkbenchEnvironmentService environmentService: IWorkbenchEnvironmentService,
	) {
		super();

		if (environmentService.isSessionsWindow) {
			return;
		}

		void this.initialize();
	}

	private async initialize(): Promise<void> {
		const mainPart = this.editorGroupsService.mainPart;
		await mainPart.whenRestored;
		if (this._store.isDisposed) {
			return;
		}

		const scheduleLog = () => this.logScheduler.schedule();
		this._register(this.editorService.onDidEditorsChange(scheduleLog));
		this._register(this.editorService.onDidVisibleEditorsChange(scheduleLog));
		this._register(mainPart.onDidAddGroup(scheduleLog));
		this._register(mainPart.onDidRemoveGroup(scheduleLog));

		this.logCurrentSnapshot();
	}

	private logCurrentSnapshot(): void {
		const snapshot = computeChatEditorTopologySnapshot(this.editorGroupsService.mainPart.groups.map(group => ({
			editorTypeIds: group.editors.map(editor => editor.typeId),
			activeEditorTypeId: group.activeEditor?.typeId,
		})));
		const previousSnapshot = this.previousSnapshot;
		this.previousSnapshot = snapshot;

		if (!shouldLogChatEditorTopologySnapshot(previousSnapshot, snapshot)) {
			return;
		}

		this.telemetryService.publicLog2<IChatEditorTopologySnapshot, ChatEditorTopologyClassification>('chat.editorTopology', snapshot);
	}
}

registerWorkbenchContribution2(ChatEditorTopologyTelemetry.ID, ChatEditorTopologyTelemetry, WorkbenchPhase.AfterRestored);
