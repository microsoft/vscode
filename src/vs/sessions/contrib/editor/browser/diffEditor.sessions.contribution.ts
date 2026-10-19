/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../../base/common/uri.js';
import { isEqual } from '../../../../base/common/resources.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { autorun } from '../../../../base/common/observable.js';
import { isCodeEditor, isDiffEditor } from '../../../../editor/browser/editorBrowser.js';
import { DiffEditorViewMode } from '../../../../editor/common/config/editorOptions.js';
import { ITextResourceConfigurationService } from '../../../../editor/common/services/textResourceConfiguration.js';
import { localize } from '../../../../nls.js';
import { ConfigurationScope, Extensions as ConfigurationExtensions, IConfigurationNode, IConfigurationRegistry } from '../../../../platform/configuration/common/configurationRegistry.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { DiffEditorCommandsService, IDiffEditorCommandsService } from '../../../../workbench/browser/parts/editor/diffEditorCommandsService.js';
import { TextDiffEditor } from '../../../../workbench/browser/parts/editor/textDiffEditor.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../../workbench/common/contributions.js';
import { IEditorService } from '../../../../workbench/services/editor/common/editorService.js';
import { MultiDiffEditor } from '../../../../workbench/contrib/multiDiffEditor/browser/multiDiffEditor.js';
import { SessionChangesEditor } from '../../changes/browser/sessionChangesEditor.js';
import { IDiffEditorOptionsService, SESSIONS_DIFF_EDITOR_WORD_WRAP_SETTING, SESSIONS_EDITOR_WORD_WRAP_SETTING } from '../common/diffEditorOptionsService.js';
import { DiffEditorOptionsService } from './diffEditorOptionsService.js';

/** Drives the shared preferred diff layout for supported editors in the Agents window. */
export class SessionsDiffEditorCommandsService extends DiffEditorCommandsService {

	constructor(
		@IEditorService editorService: IEditorService,
		@ITextResourceConfigurationService textResourceConfigurationService: ITextResourceConfigurationService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IDiffEditorOptionsService private readonly diffEditorOptionsService: IDiffEditorOptionsService,
	) {
		super(editorService, textResourceConfigurationService, contextKeyService);
	}

	override async toggleRenderSideBySide(args: unknown[]): Promise<void> {
		const resource = args[0] instanceof URI ? args[0] : undefined;
		if (resource || !(this.editorService.activeEditorPane instanceof SessionChangesEditor || this.editorService.activeEditorPane instanceof MultiDiffEditor)) {
			for (const pane of [this.editorService.activeEditorPane, ...this.editorService.visibleEditorPanes]) {
				if (pane instanceof MultiDiffEditor) {
					this.diffEditorOptionsService.toggleRenderSideBySide();
					return;
				}
				if (!(pane instanceof TextDiffEditor)) {
					continue;
				}

				const control = pane.getControl();
				if (!isDiffEditor(control)) {
					continue;
				}

				const modifiedResource = control.getModifiedEditor().getModel()?.uri;
				if (resource && (!modifiedResource || !isEqual(resource, modifiedResource))) {
					continue;
				}

				this.diffEditorOptionsService.toggleRenderSideBySide();
				return;
			}
		}

		if (this.editorService.activeEditorPane instanceof SessionChangesEditor || this.editorService.activeEditorPane instanceof MultiDiffEditor) {
			this.diffEditorOptionsService.toggleRenderSideBySide();
			return;
		}

		if (resource) {
			this.diffEditorOptionsService.toggleRenderSideBySide();
			return;
		}

		return super.toggleRenderSideBySide(args);
	}

	override async setViewMode(args: unknown[], mode: DiffEditorViewMode): Promise<void> {
		const resource = args[0] instanceof URI ? args[0] : undefined;
		const activeEditorPane = this.editorService.activeEditorPane;
		if (activeEditorPane instanceof SessionChangesEditor || activeEditorPane instanceof MultiDiffEditor) {
			this.diffEditorOptionsService.setViewMode(mode);
			if (mode === 'automatic') {
				activeEditorPane.resetDiffEditorWidthBasedLayout();
			}
			return;
		}

		for (const pane of [this.editorService.activeEditorPane, ...this.editorService.visibleEditorPanes]) {
			if (!(pane instanceof TextDiffEditor)) {
				continue;
			}
			const control = pane.getControl();
			if (!isDiffEditor(control)) {
				continue;
			}
			const modifiedResource = control.getModifiedEditor().getModel()?.uri;
			if (!resource || modifiedResource && isEqual(resource, modifiedResource)) {
				this.diffEditorOptionsService.setViewMode(mode);
				if (mode === 'automatic') {
					control.resetWidthBasedLayout();
				}
				return;
			}
		}

		return super.setViewMode(args, mode);
	}
}

export class SessionsDiffEditorLayoutContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.sessions.diffEditorLayout';

	constructor(
		@IEditorService private readonly editorService: IEditorService,
		@IDiffEditorOptionsService private readonly diffEditorOptionsService: IDiffEditorOptionsService,
	) {
		super();
		this._register(this.editorService.onDidActiveEditorChange(() => this.applyLayout()));
		this._register(this.editorService.onDidVisibleEditorsChange(() => this.applyLayout()));
		this._register(autorun(reader => {
			this.diffEditorOptionsService.viewMode.read(reader);
			this.diffEditorOptionsService.diffEditorWordWrap.read(reader);
			this.applyDiffEditorLayout();
		}));
		this._register(autorun(reader => {
			this.diffEditorOptionsService.editorWordWrap.read(reader);
			this.applyCodeEditorWordWrap();
		}));
	}

	private applyLayout(): void {
		this.applyDiffEditorLayout();
		this.applyCodeEditorWordWrap();
	}

	private applyDiffEditorLayout(): void {
		const viewMode = this.diffEditorOptionsService.viewMode.get();
		const wordWrap = this.diffEditorOptionsService.diffEditorWordWrap.get();
		for (const pane of new Set([this.editorService.activeEditorPane, ...this.editorService.visibleEditorPanes])) {
			if (pane instanceof TextDiffEditor) {
				const control = pane.getControl();
				if (isDiffEditor(control)) {
					control.updateOptions({
						renderSideBySide: viewMode !== 'inline',
						useInlineViewWhenSpaceIsLimited: viewMode === 'automatic',
						diffWordWrap: wordWrap,
					});
				}
			} else if (pane instanceof MultiDiffEditor) {
				pane.setDiffEditorLayoutOptions(viewMode, wordWrap);
			}
		}
	}

	private applyCodeEditorWordWrap(): void {
		const wordWrap = this.diffEditorOptionsService.editorWordWrap.get();
		for (const pane of new Set([this.editorService.activeEditorPane, ...this.editorService.visibleEditorPanes])) {
			const control = pane?.getControl();
			if (isCodeEditor(control)) {
				control.updateOptions({ wordWrapOverride1: wordWrap });
			}
		}
	}
}

registerSingleton(IDiffEditorOptionsService, DiffEditorOptionsService, InstantiationType.Delayed);
registerSingleton(IDiffEditorCommandsService, SessionsDiffEditorCommandsService, InstantiationType.Delayed);
registerWorkbenchContribution2(SessionsDiffEditorLayoutContribution.ID, SessionsDiffEditorLayoutContribution, WorkbenchPhase.AfterRestored);

export const sessionsEditorWordWrapConfiguration = {
	id: 'sessions',
	properties: {
		[SESSIONS_DIFF_EDITOR_WORD_WRAP_SETTING]: {
			type: 'string',
			enum: ['off', 'on', 'inherit'],
			default: 'inherit',
			scope: ConfigurationScope.APPLICATION,
			tags: ['experimental'],
			experiment: { mode: 'auto' },
			markdownEnumDescriptions: [
				localize('sessions.diffEditor.wordWrap.off', "Lines will never wrap."),
				localize('sessions.diffEditor.wordWrap.on', "Lines will wrap at the viewport width."),
				localize('sessions.diffEditor.wordWrap.inherit', "Lines will wrap according to the {0} setting.", '`#editor.wordWrap#`'),
			],
			description: localize('sessions.diffEditor.wordWrap', "Controls how diff editors in the Agents window wrap lines."),
		},
		[SESSIONS_EDITOR_WORD_WRAP_SETTING]: {
			type: 'string',
			enum: ['off', 'on', 'inherit'],
			default: 'inherit',
			scope: ConfigurationScope.APPLICATION,
			tags: ['experimental'],
			experiment: { mode: 'auto' },
			markdownEnumDescriptions: [
				localize('sessions.editor.wordWrap.off', "Lines will never wrap."),
				localize('sessions.editor.wordWrap.on', "Lines will wrap at the viewport width."),
				localize('sessions.editor.wordWrap.inherit', "Lines will wrap according to the {0} setting.", '`#editor.wordWrap#`'),
			],
			description: localize('sessions.editor.wordWrap', "Controls how code editors in the Agents window wrap lines."),
		},
	},
} satisfies IConfigurationNode;

Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration).registerConfiguration(sessionsEditorWordWrapConfiguration);
