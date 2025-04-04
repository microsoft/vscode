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
 * Unique ID of the markers provider class.
 */
const MARKERS_OWNER_ID = 'reusable-prompts-syntax';

/**
 * Prompt links diagnostics provider for a single text model.
 */
class PromptLinkDiagnosticsProvider extends ObservableDisposable {
	/**
	 * Reference to the current prompt syntax parser instance.
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
	 * Update diagnostic markers for the current editor.
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
 * Convert a prompt link with an issue to a marker data.
 *
 * @throws
 *  - if there is no link issue (e.g., `topError` undefined)
 *  - if there is no link range to highlight (e.g., `linkRange` undefined)
 *  - if the original error is of `NotPromptFile` type - we don't want to
 *    show diagnostic markers for non-prompt file links in the prompts
 */
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

	// `error` severity for the link itself, `warning` for any of its children
	const severity = (topError.errorSubject === 'root')
		? MarkerSeverity.Error
		: MarkerSeverity.Warning;

	return {
		message: topError.localizedMessage,
		severity,
		...linkRange,
	};
};

/**
 * The class that manages creation and disposal of {@link PromptLinkDiagnosticsProvider}
 * classes for each specific editor text model.
 */
export class PromptLinkDiagnosticsInstanceManager extends Disposable {
	/**
	 * Currently available {@link PromptLinkDiagnosticsProvider} instances.
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
	 * Initialize a new {@link PromptLinkDiagnosticsProvider} for the given editor.
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
	.registerWorkbenchContribution(PromptLinkDiagnosticsInstanceManager, LifecyclePhase.Eventually);
