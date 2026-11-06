/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ConfigKey, IConfigurationService } from '../../../platform/configuration/common/configurationService';
import { IStatelessNextEditProvider } from '../../../platform/inlineEdits/common/statelessNextEditProvider';
import { NesHistoryContextProvider } from '../../../platform/inlineEdits/common/workspaceEditTracker/nesHistoryContextProvider';
import { NesXtabHistoryTracker } from '../../../platform/inlineEdits/common/workspaceEditTracker/nesXtabHistoryTracker';
import { IExperimentationService } from '../../../platform/telemetry/common/nullExperimentationService';
import { Event } from '../../../util/vs/base/common/event';
import { Disposable } from '../../../util/vs/base/common/lifecycle';
import { IInstantiationService } from '../../../util/vs/platform/instantiation/common/instantiation';
import { NesChangeHint } from '../common/nesTriggerHint';
import { createNextEditProvider } from '../node/createNextEditProvider';
import { DebugRecorder } from '../node/debugRecorder';
import { NextEditProvider } from '../node/nextEditProvider';
import { DiagnosticsNextEditProvider } from './features/diagnosticsInlineEditProvider';
import { InlineEditTriggerer } from './inlineEditTriggerer';
import { VSCodeWorkspace } from './parts/vscodeWorkspace';

export class InlineEditModel extends Disposable {
	public readonly debugRecorder: DebugRecorder;
	public readonly nextEditProvider: NextEditProvider;

	private readonly _predictor: IStatelessNextEditProvider;
	private _triggerer: InlineEditTriggerer;

	public readonly inlineEditsInlineCompletionsEnabled = this._configurationService.getConfigObservable(ConfigKey.TeamInternal.InlineEditsInlineCompletionsEnabled);

	public readonly onChange: Event<NesChangeHint>;

	constructor(
		private readonly _predictorId: string | undefined,
		public readonly workspace: VSCodeWorkspace,
		historyContextProvider: NesHistoryContextProvider,
		public readonly diagnosticsBasedProvider: DiagnosticsNextEditProvider | undefined,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@IExperimentationService private readonly _expService: IExperimentationService,
	) {
		super();

		this.debugRecorder = this._register(new DebugRecorder(this.workspace));

		this._predictor = createNextEditProvider(this._predictorId, this._instantiationService);
		const xtabDiffNEntries = this._configurationService.getExperimentBasedConfig(ConfigKey.TeamInternal.InlineEditsXtabDiffNEntries, this._expService);
		const xtabHistoryTracker = new NesXtabHistoryTracker(this.workspace, xtabDiffNEntries, this._configurationService, this._expService);
		this.nextEditProvider = this._instantiationService.createInstance(NextEditProvider, this.workspace, this._predictor, historyContextProvider, xtabHistoryTracker, this.debugRecorder);

		this._triggerer = this._register(this._instantiationService.createInstance(InlineEditTriggerer, this.workspace, this.nextEditProvider));
		this.onChange = this._triggerer.onChange;
	}
}
