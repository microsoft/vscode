/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IAgentHostChangesetService } from '../../common/agentHostChangesetService.js';

export class FakeChangesetService implements IAgentHostChangesetService {
	declare readonly _serviceBrand: undefined;
	registerStaticChangesets(): void { }
	restoreStaticChangeset(): void { }
	parsePersistedStaticChangesets(): { session?: undefined } { return {}; }
	applyPersistedStaticChangesets(): void { }
	restorePersistedStaticChangesets(): { session?: undefined } { return {}; }
	persistChangesSummary(): void { }
	isStaticChangesetComputeActive(): boolean { return false; }
	getListMetadataKeys() { return undefined; }
	computeListEntryChanges() { return undefined; }
	refreshBranchChangeset(): void { }
	refreshSessionChangeset(): void { }
	refreshWorkingSetChangeset(): void { }
	refreshChangesetCatalog(): void { }
	onWorkingDirectoryAvailable(): void { }
	recomputeSubscribedChangesets(): void { }
	async computeUncommittedChangeset(session: string): Promise<string> { return `${session}/changeset/uncommitted`; }
	async computeTurnChangeset(session: string): Promise<string> { return `${session}/x`; }
	async computeCompareTurnsChangeset(session: string): Promise<string> { return `${session}/y`; }
	onToolCallEditsApplied(): void { }
	onTurnComplete(): void { }
	onSessionTruncated(): void { }
	openTrackedTurnDatabase(): undefined { return undefined; }
	openTrackedSessionDatabases() { return { sources: [], otherChatDatabases: [], workingDirectories: undefined, folderScope: undefined, dispose: () => { } }; }
	onFileEditsDiscarded(): void { }
	onFileEditsAccepted(): void { }
	ensureChatChangesSummary(): void { }
	refreshChatChangesSummary(): void { }
}
