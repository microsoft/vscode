/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { IWorkbenchContribution } from '../../../common/contributions.js';
import { DEFAULT_EDITOR_ASSOCIATION } from '../../../common/editor.js';
import { DefaultEditorChangeSource, diffEditorsAssociationsSettingId, editorsAssociationsSettingId, IEditorResolverService } from '../../../services/editor/common/editorResolverService.js';
import { IExtensionService } from '../../../services/extensions/common/extensions.js';

/** File types whose default editor changes are reported, each with a file name to resolve their default for. */
const WELL_KNOWN_FILE_TYPES = {
	markdown: URI.file('/default-editor.md'),
} as const satisfies Record<string, URI>;

type WellKnownFileType = keyof typeof WELL_KNOWN_FILE_TYPES;

/** Editors reported by name. All others, including extension editors, are reported as `other`. */
const WELL_KNOWN_EDITORS: Record<string, string> = {
	[DEFAULT_EDITOR_ASSOCIATION.id]: 'text',
	'vscode.markdown.editor': 'markdownEditor',
	'vscode.markdown.preview.editor': 'markdownPreview',
};

function wellKnownEditor(editorId: string): string {
	return WELL_KNOWN_EDITORS[editorId] ?? 'other';
}

type EditorKind = 'editor' | 'diffEditor';
const EDITOR_KINDS: readonly EditorKind[] = ['editor', 'diffEditor'];

/** A `setDefaultEditor` call is attributed to the association change it causes if that follows within this time. */
const SOURCE_ATTRIBUTION_MS = 10_000;

type DefaultEditorChangedEvent = {
	fileType: WellKnownFileType;
	editorKind: EditorKind;
	from: string;
	to: string;
	source: DefaultEditorChangeSource | 'other';
};

type DefaultEditorChangedClassification = {
	owner: 'hediet';
	comment: 'Reports when the effective default editor for a well-known file type changes, to learn how often users adopt or revert editors such as the Markdown Editor.';
	fileType: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The well-known file type, e.g. markdown.' };
	editorKind: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Whether the default for opening files or for diffs changed.' };
	from: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The previous default editor: a well-known built-in editor, or other.' };
	to: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The new default editor: a well-known built-in editor, or other.' };
	source: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The UI that set the default (e.g. the editor type picker or the Markdown Editor nudge), or other for settings, settings sync and other changes.' };
};

/**
 * Reports changes of the effective default editor of well-known file types, whatever caused them:
 * the editor type picker, the reopen-with picker, a nudge, settings.json or settings sync. Changes
 * caused by extensions registering or unregistering editors are not reported.
 */
export class DefaultEditorTelemetry extends Disposable implements IWorkbenchContribution {
	static readonly ID = 'workbench.contrib.defaultEditorTelemetry';

	private readonly _defaults = new Map<string, string>();
	private _pendingSource: { readonly source: DefaultEditorChangeSource | undefined; readonly time: number } | undefined;

	constructor(
		@IEditorResolverService private readonly _editorResolverService: IEditorResolverService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@ITelemetryService private readonly _telemetryService: ITelemetryService,
		@IExtensionService extensionService: IExtensionService,
	) {
		super();

		// Compare against defaults once editors contributed by extensions are known.
		extensionService.whenInstalledExtensionsRegistered().then(() => {
			if (this._store.isDisposed) {
				return;
			}
			this._updateDefaults(false);
			this._register(this._editorResolverService.onDidChangeEditorRegistrations(() => this._updateDefaults(false)));
			this._register(this._editorResolverService.onWillSetDefaultEditor(e => this._pendingSource = { source: e.source, time: Date.now() }));
			this._register(this._configurationService.onDidChangeConfiguration(e => {
				if (e.affectsConfiguration(editorsAssociationsSettingId) || e.affectsConfiguration(diffEditorsAssociationsSettingId)) {
					this._updateDefaults(true);
				}
			}));
		});
	}

	private _updateDefaults(report: boolean): void {
		const pending = this._pendingSource;
		this._pendingSource = undefined;
		const source = pending?.source && Date.now() - pending.time < SOURCE_ATTRIBUTION_MS ? pending.source : 'other';

		for (const [fileType, resource] of Object.entries(WELL_KNOWN_FILE_TYPES) as [WellKnownFileType, URI][]) {
			for (const editorKind of EDITOR_KINDS) {
				const key = `${fileType}/${editorKind}`;
				const editor = wellKnownEditor(this._editorResolverService.getEditorMatches(resource, { isDiffEditor: editorKind === 'diffEditor' }).defaultRule.editor.id);
				const previous = this._defaults.get(key);
				this._defaults.set(key, editor);
				if (report && previous !== undefined && previous !== editor) {
					this._telemetryService.publicLog2<DefaultEditorChangedEvent, DefaultEditorChangedClassification>('editorResolver.defaultEditorChanged', {
						fileType,
						editorKind,
						from: previous,
						to: editor,
						source,
					});
				}
			}
		}
	}
}
