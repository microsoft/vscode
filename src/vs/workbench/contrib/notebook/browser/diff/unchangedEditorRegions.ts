/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from '../../../../../base/common/event.js';
import { Disposable, DisposableStore } from '../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../base/common/uri.js';
import { UnchangedRegion } from '../../../../../editor/browser/widget/diffEditor/diffEditorViewModel.js';
import { IEditorWorkerService } from '../../../../../editor/common/services/editorWorker.js';
import { ITextModelService } from '../../../../../editor/common/services/resolverService.js';
import { ITextResourceConfigurationService } from '../../../../../editor/common/services/textResourceConfiguration.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { getEditorPadding } from './diffCellEditorOptions.js';
import { HeightOfHiddenLinesRegionInDiffEditor } from './diffElementViewModel.js';

export type UnchangedEditorRegionOptions = {
	enabled: boolean;
	contextLineCount: number;
	minimumLineCount: number;
	revealLineCount: number;
	onDidChangeEnablement: Event<boolean>;
};

export interface IUnchangedEditorRegionsService {
	readonly options: Readonly<UnchangedEditorRegionOptions>;

	/**
	 * Given two URIs, compute the height of the editor with unchanged regions collapsed.
	 * @param originalUri
	 * @param modifiedUri
	 */
	computeEditorHeight(originalUri: URI, modifiedUri: URI): Promise<number>;
}

export class UnchangedEditorRegionsService extends Disposable implements IUnchangedEditorRegionsService {
	public readonly options: Readonly<UnchangedEditorRegionOptions>;
	constructor(configurationService: IConfigurationService,
		private readonly editorWorkerService: IEditorWorkerService,
		private readonly textModelResolverService: ITextModelService,
		private readonly textConfigurationService: ITextResourceConfigurationService,
		private readonly lineHeight: number
	) {
		super();
		this.options = this._register(createHideUnchangedRegionOptions(configurationService));
	}

	public static Empty: IUnchangedEditorRegionsService = {
		options: {
			enabled: false,
			contextLineCount: 0,
			minimumLineCount: 0,
			revealLineCount: 0,
			onDidChangeEnablement: Event.None,
		},
		computeEditorHeight: (_originalUri: URI, _modifiedUri: URI) => Promise.resolve(0)
	};

	public async computeEditorHeight(
		originalUri: URI,
		modifiedUri: URI) {
		const { numberOfUnchangedRegions, numberOfVisibleLines } = await computeInputUnchangedLines(originalUri, modifiedUri, this.options, this.editorWorkerService, this.textModelResolverService, this.textConfigurationService);
		const lineCount = numberOfVisibleLines;
		const unchangeRegionsHeight = numberOfUnchangedRegions * HeightOfHiddenLinesRegionInDiffEditor;
		// TODO: When we have a horizontal scrollbar, we need to add 12 to the height.
		// Right now there's no way to determine if a horizontal scrollbar is visible in the editor.
		return lineCount * this.lineHeight + getEditorPadding(lineCount).top + getEditorPadding(lineCount).bottom + unchangeRegionsHeight;

	}
}

function createHideUnchangedRegionOptions(configurationService: IConfigurationService): UnchangedEditorRegionOptions & { dispose: () => void } {
	const disposables = new DisposableStore();
	const unchangedRegionsEnablementEmitter = disposables.add(new Emitter<boolean>());

	const options = {
		enabled: configurationService.getValue<boolean>('diffEditor.hideUnchangedRegions.enabled'),
		minimumLineCount: configurationService.getValue<number>('diffEditor.hideUnchangedRegions.minimumLineCount'),
		contextLineCount: configurationService.getValue<number>('diffEditor.hideUnchangedRegions.contextLineCount'),
		revealLineCount: configurationService.getValue<number>('diffEditor.hideUnchangedRegions.revealLineCount'),
		// We only care about enable/disablement.
		// If user changes counters when a diff editor is open, we do not care, might as well ask user to reload.
		// Simpler and almost never going to happen.
		onDidChangeEnablement: unchangedRegionsEnablementEmitter.event.bind(unchangedRegionsEnablementEmitter),
		dispose: () => disposables.dispose()
	};

	disposables.add(configurationService.onDidChangeConfiguration(e => {
		if (e.affectsConfiguration('diffEditor.hideUnchangedRegions.minimumLineCount')) {
			options.minimumLineCount = configurationService.getValue<number>('diffEditor.hideUnchangedRegions.minimumLineCount');
		}
		if (e.affectsConfiguration('diffEditor.hideUnchangedRegions.contextLineCount')) {
			options.contextLineCount = configurationService.getValue<number>('diffEditor.hideUnchangedRegions.contextLineCount');
		}
		if (e.affectsConfiguration('diffEditor.hideUnchangedRegions.revealLineCount')) {
			options.revealLineCount = configurationService.getValue<number>('diffEditor.hideUnchangedRegions.revealLineCount');
		}
		if (e.affectsConfiguration('diffEditor.hideUnchangedRegions.enabled')) {
			options.enabled = configurationService.getValue('diffEditor.hideUnchangedRegions.enabled');
			unchangedRegionsEnablementEmitter.fire(options.enabled);
		}

	}));

	return options;
}

async function computeInputUnchangedLines(originalUri: URI,
	modifiedUri: URI,
	unchangedRegionOptions: UnchangedEditorRegionOptions,
	editorWorkerService: IEditorWorkerService,
	textModelResolverService: ITextModelService,
	textConfigurationService: ITextResourceConfigurationService
) {
	// Ensure we have resolved the cell text models.
	const [originalModel, modifiedModel] = await Promise.all([textModelResolverService.createModelReference(originalUri), textModelResolverService.createModelReference(modifiedUri)]);

	try {
		const ignoreTrimWhitespace = textConfigurationService.getValue<boolean>(originalUri, 'diffEditor.ignoreTrimWhitespace');
		const diff = await editorWorkerService.computeDiff(originalUri, modifiedUri, {
			ignoreTrimWhitespace,
			maxComputationTimeMs: 0,
			computeMoves: false
		}, 'advanced');
		const originalLineCount = originalModel.object.textEditorModel.getLineCount();
		const modifiedLineCount = modifiedModel.object.textEditorModel.getLineCount();
		const unchanged = diff ? UnchangedRegion.fromDiffs(diff.changes,
			originalLineCount,
			modifiedLineCount,
			unchangedRegionOptions.minimumLineCount ?? 3,
			unchangedRegionOptions.contextLineCount ?? 3) : [];

		const totalLines = Math.max(originalLineCount, modifiedLineCount);
		const numberOfUnchangedRegions = unchanged.length;
		const numberOfVisibleLines = totalLines - unchanged.reduce((prev, curr) => prev + curr.lineCount, 0);
		return { numberOfUnchangedRegions, numberOfVisibleLines };
	} finally {
		originalModel.dispose();
		modifiedModel.dispose();
	}
}

