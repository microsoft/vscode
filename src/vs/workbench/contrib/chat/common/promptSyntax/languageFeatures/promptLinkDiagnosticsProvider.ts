/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IPromptsService } from '../service/types.js';
import { IPromptFileReference } from '../parsers/types.js';
import { assert } from '../../../../../../base/common/assert.js';
import { NotPromptFile } from '../../promptFileReferenceErrors.js';
import { ITextModel } from '../../../../../../editor/common/model.js';
import { assertDefined } from '../../../../../../base/common/types.js';
import { Disposable } from '../../../../../../base/common/lifecycle.js';
import { IEditor } from '../../../../../../editor/common/editorCommon.js';
import { ObjectCache } from '../../../../../../base/common/objectCache.js';
import { TextModelPromptParser } from '../parsers/textModelPromptParser.js';
import { Registry } from '../../../../../../platform/registry/common/platform.js';
import { PromptsConfig } from '../../../../../../platform/prompts/common/config.js';
import { isPromptFile } from '../../../../../../platform/prompts/common/constants.js';
import { LifecyclePhase } from '../../../../../services/lifecycle/common/lifecycle.js';
import { IEditorService } from '../../../../../services/editor/common/editorService.js';
import { ObservableDisposable } from '../../../../../../base/common/observableDisposable.js';
import { IWorkbenchContributionsRegistry, Extensions } from '../../../../../common/contributions.js';
import { IInstantiationService } from '../../../../../../platform/instantiation/common/instantiation.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { IMarkerData, IMarkerService, MarkerSeverity } from '../../../../../../platform/markers/common/markers.js';

/**
 * TODO: @legomushroom - list
 *  - improve error messages
 */

/**
 * TODO: @legomushroom
 */
const MARKERS_OWNER_ID = 'reusable-prompts-syntax';

/**
 * TODO: @legomushroom
 */
class PromptLinkDiagnosticsProvider extends ObservableDisposable {
	/**
	 * TODO: @legomushroom
	 */
	private readonly parser: TextModelPromptParser;

	constructor(
		private readonly editor: ITextModel,
		@IMarkerService private readonly markerService: IMarkerService,
		@IPromptsService private readonly promptsService: IPromptsService,
	) {
		super();

		this.parser = this.promptsService
			.getSyntaxParserFor(this.editor)
			.onUpdate(this.updateMarkers.bind(this))
			.onDispose(this.dispose.bind(this))
			.start();

		// initialize markers
		this.updateMarkers();
	}

	/**
	 * TODO: @legomushroom
	 */
	private async updateMarkers() {
		// ensure that parsing process is settled
		await this.parser.allSettled();

		// clean up all previously added markers
		this.markerService.remove(MARKERS_OWNER_ID, [this.editor.uri]);

		const markers: IMarkerData[] = [];
		for (const link of this.parser.references) {
			const { topError, linkRange } = link;

			if (!topError || !linkRange) {
				continue;
			}

			const { originalError } = topError;

			// the `NotPromptFile` error is allowed because we allow users
			// to include non-prompt file links in the prompt files
			// note! this check also handles the `FolderReference` error
			if (originalError instanceof NotPromptFile) {
				continue;
			}

			markers.push(toMarker(link));
		}

		this.markerService.changeOne(
			MARKERS_OWNER_ID,
			this.editor.uri,
			markers,
		);
	}
}

/**
 * TODO: @legomushroom
 */
// TODO: @legomushroom - add @throws info
const toMarker = (
	link: IPromptFileReference,
): IMarkerData => {
	const { topError, linkRange } = link;

	// a sanity check because this function must be
	// used only if these link attributes are present
	assertDefined(
		topError,
		'Top error must to be defined.',
	);
	assertDefined(
		linkRange,
		'Link range must to be defined.',
	);

	const { originalError } = topError;
	assert(
		!(originalError instanceof NotPromptFile),
		'Error must not be of "not prompt file" type.',
	);

	// use `error` severity if the error relates to the link itself, and use
	// the `warning` severity if the error is related to one of its children
	const severity = (topError.isRootError)
		? MarkerSeverity.Error
		: MarkerSeverity.Warning;

	return {
		message: topError.localizedMessage,
		severity,
		...linkRange,
	};
};

/**
 * TODO: @legomushroom
 */
export class PromptsLinkDiagnosticsProvider extends Disposable {
	/**
	 * TODO: @legomushroom
	 */
	private readonly providers: ObjectCache<PromptLinkDiagnosticsProvider, ITextModel>;

	constructor(
		@IEditorService editorService: IEditorService,
		@IInstantiationService initService: IInstantiationService,
		@IConfigurationService configService: IConfigurationService,
	) {
		super();

		// cache of prompt marker providers
		this.providers = this._register(
			new ObjectCache((editor: ITextModel) => {
				const parser: PromptLinkDiagnosticsProvider = initService.createInstance(
					PromptLinkDiagnosticsProvider,
					editor,
				);

				// this is a sanity check and the contract of the object cache,
				// we must return a non-disposed object from this factory function
				parser.assertNotDisposed(
					'Created prompt parser must not be disposed.',
				);

				return parser;
			}),
		);

		// if the feature is disabled, do not create any providers
		if (!PromptsConfig.enabled(configService)) {
			return;
		}

		// subscribe to changes of the active editor
		this._register(editorService.onDidActiveEditorChange(() => {
			const { activeTextEditorControl } = editorService;
			if (!activeTextEditorControl) {
				return;
			}

			this.handleNewEditor(activeTextEditorControl);
		}));

		// handle existing visible text editors
		editorService
			.visibleTextEditorControls
			.forEach(this.handleNewEditor.bind(this));
	}

	/**
	 * TODO: @legomushroom
	 */
	private handleNewEditor(editor: IEditor): this {
		const model = editor.getModel();
		if (!model) {
			return this;
		}

		// we support only `text editors` for now so filter out `diff` ones
		if ('modified' in model || 'model' in model) {
			return this;
		}

		// enable this only for prompt file editors
		if (!isPromptFile(model.uri)) {
			return this;
		}

		// note! calling `get` also creates a provider if it does not exist;
		// 		and the provider is auto-removed when the model is disposed
		this.providers.get(model);

		return this;
	}
}

// register the provider as a workbench contribution
Registry.as<IWorkbenchContributionsRegistry>(Extensions.Workbench)
	.registerWorkbenchContribution(PromptsLinkDiagnosticsProvider, LifecyclePhase.Eventually);
