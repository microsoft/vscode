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
import { IHostService } from '../../../services/host/browser/host.js';

/**
 * File types whose default editor changes are reported, by file extension, each with a file name to
 * resolve the default for. Associations for single files (e.g. `README.md`) do not change them.
 */
const WELL_KNOWN_FILE_TYPES = {
	md: URI.file('/default-editor.md'),
	markdown: URI.file('/default-editor.markdown'),
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

/**
 * Association changes within this time after a `setDefaultEditor` call are attributed to it. One
 * call can write both association settings, e.g. when the Reopen With picker sets the general
 * default from a diff and clears the diff-only association.
 */
const SOURCE_ATTRIBUTION_MS = 5_000;

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
	fileType: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The file extension of the well-known file type, e.g. md.' };
	editorKind: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Whether the default for opening files or for diffs changed.' };
	from: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The previous default editor: a well-known built-in editor, or other.' };
	to: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The new default editor: a well-known built-in editor, or other.' };
	source: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The UI that set the default (e.g. the editor type picker or the Markdown Editor nudge), or other for settings, settings sync and other changes.' };
};

/**
 * Reports changes of the effective default editor of well-known file types, whatever caused them:
 * the editor type picker, the reopen-with picker, a nudge, settings.json or settings sync. Changes
 * caused by extensions registering or unregistering editors are not reported.
 *
 * Every window observes a change of user settings. To report it once, only the window that made
 * the change reports it, or, for changes from outside (settings.json, settings sync), the focused
 * window. Outside changes while no window is focused are not reported.
 */
export class DefaultEditorTelemetry extends Disposable implements IWorkbenchContribution {
	static readonly ID = 'workbench.contrib.defaultEditorTelemetry';

	/** The resolved default editor IDs. Not mapped to well-known names, so changes between other editors are seen. */
	private readonly _defaults = new Map<string, string>();
	private _lastSetDefaultEditor: { readonly source: DefaultEditorChangeSource | undefined; readonly time: number } | undefined;

	constructor(
		@IEditorResolverService private readonly _editorResolverService: IEditorResolverService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@ITelemetryService private readonly _telemetryService: ITelemetryService,
		@IHostService private readonly _hostService: IHostService,
		@IExtensionService extensionService: IExtensionService,
	) {
		super();

		this._register(this._editorResolverService.onWillSetDefaultEditor(e => this._lastSetDefaultEditor = { source: e.source, time: Date.now() }));

		// Compare against defaults once editors contributed by extensions are known.
		extensionService.whenInstalledExtensionsRegistered().then(() => {
			if (this._store.isDisposed) {
				return;
			}
			this._updateDefaults(false);
			this._register(this._editorResolverService.onDidChangeEditorRegistrations(() => this._updateDefaults(false)));
			this._register(this._configurationService.onDidChangeConfiguration(e => {
				if (e.affectsConfiguration(editorsAssociationsSettingId) || e.affectsConfiguration(diffEditorsAssociationsSettingId)) {
					this._updateDefaults(true);
				}
			}));
		});
	}

	private _updateDefaults(isAssociationChange: boolean): void {
		const last = this._lastSetDefaultEditor;
		const madeHere = !!last && Date.now() - last.time < SOURCE_ATTRIBUTION_MS;
		const report = isAssociationChange && (madeHere || this._hostService.hasFocus);
		const source = madeHere ? last.source ?? 'other' : 'other';

		for (const [fileType, resource] of Object.entries(WELL_KNOWN_FILE_TYPES) as [WellKnownFileType, URI][]) {
			for (const editorKind of EDITOR_KINDS) {
				const key = `${fileType}/${editorKind}`;
				const editorId = this._editorResolverService.getEditorMatches(resource, { isDiffEditor: editorKind === 'diffEditor' }).defaultRule.editor.id;
				const previous = this._defaults.get(key);
				this._defaults.set(key, editorId);
				if (report && previous !== undefined && previous !== editorId) {
					this._telemetryService.publicLog2<DefaultEditorChangedEvent, DefaultEditorChangedClassification>('editorResolver.defaultEditorChanged', {
						fileType,
						editorKind,
						from: wellKnownEditor(previous),
						to: wellKnownEditor(editorId),
						source,
					});
				}
			}
		}
	}
}
