/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { mainWindow } from '../../../../base/browser/window.js';
import { Event } from '../../../../base/common/event.js';
import { Disposable, MutableDisposable } from '../../../../base/common/lifecycle.js';
import { autorun, derived, derivedOpts, IReader, observableFromEvent, observableSignalFromEvent, observableValue } from '../../../../base/common/observable.js';
import { IModelService } from '../../../../editor/common/services/model.js';
import { localize } from '../../../../nls.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { IBreadcrumbsService } from '../../../browser/parts/editor/breadcrumbs.js';
import { REOPEN_ACTIVE_EDITOR_WITH_COMMAND_ID } from '../../../browser/parts/editor/editorCommands.js';
import { getAvailableEditorTypes } from '../../../browser/parts/editor/editorTypePicker.js';
import { registerWorkbenchContribution2, WorkbenchPhase } from '../../../common/contributions.js';
import { EditorPartModalVisibleContext } from '../../../common/contextkeys.js';
import { DEFAULT_EDITOR_ASSOCIATION, EditorResourceAccessor } from '../../../common/editor.js';
import { EditorInput } from '../../../common/editor/editorInput.js';
import { editorsAssociationsSettingId, IEditorResolverService } from '../../../services/editor/common/editorResolverService.js';
import { GroupsOrder, IEditorGroup, IEditorGroupsService } from '../../../services/editor/common/editorGroupsService.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { isVisibleOnboardingTarget, registerOnboardingTargetProvider } from '../../onboarding/browser/spotlight/onboardingTarget.js';
import { ISpotlightPayload, ISpotlightStep, SPOTLIGHT_PRESENTATION_KIND } from '../../onboarding/browser/spotlight/spotlightTypes.js';
import { onboardingScenarioRegistry } from '../../onboarding/common/onboardingRegistry.js';
import { IOnboardingExperiment, IOnboardingScenario } from '../../onboarding/common/onboardingScenario.js';
import { isOnboardingDeveloperModeEnabled, ONBOARDING_DEVELOPER_MODE_CONFIG } from '../../onboarding/common/onboardingScenarioService.js';
import { WebviewInput } from '../../webviewPanel/browser/webviewEditorInput.js';

const MARKDOWN_EDITOR_ID = 'vscode.markdown.editor';
const MARKDOWN_PREVIEW_EDITOR_ID = 'vscode.markdown.preview.editor';
/** The view type of the preview that "Open Preview to the Side" opens as a webview panel. */
const MARKDOWN_SIDE_PREVIEW_VIEW_TYPE = 'mainThreadWebview-markdown.preview';

const NUDGE_TARGET_ID = 'markdownEditor.nudge.editorTypeDropdown';
/** Both nudges count as the same onboarding: a user sees at most one of them. */
const NUDGE_SEEN_KEY = 'markdownEditor.nudge';

const USED_MARKDOWN_EDITOR_STORAGE_KEY = 'markdownEditorPromotion.usedMarkdownEditor';

type MarkdownEditorNudgeKind = 'textEditor' | 'preview';

const NUDGE_SCENARIO_IDS: Record<MarkdownEditorNudgeKind, string> = {
	textEditor: 'markdownEditor.nudge.textEditor',
	preview: 'markdownEditor.nudge.preview',
};

/**
 * Each nudge only runs while an experiment turns it on, so experiments can compare them. They share
 * the assignment-context identifier, so all arms (including control) count as exposed from the same
 * moment: the first time any nudge would show.
 */
const NUDGE_EXPERIMENTS: Record<MarkdownEditorNudgeKind, IOnboardingExperiment> = {
	textEditor: { behaviorFlag: 'onb.markdownEditorNudge.textEditor.show', assignmentContextIdFlag: 'onb.markdownEditorNudge.id' },
	preview: { behaviorFlag: 'onb.markdownEditorNudge.preview.show', assignmentContextIdFlag: 'onb.markdownEditorNudge.id' },
};

/** No nudges right after the window opens, while the user resumes their work. */
const STARTUP_GRACE_MS = 60_000;

/** The user making an editor active, which is when a nudge for it may show. */
interface IEditorActivation {
	readonly editor: EditorInput;
	readonly afterStartupGrace: boolean;
	/** Whether the user changed the file's text since. */
	readonly edited: boolean;
}

/**
 * A situation in which to suggest the Markdown Editor for a Markdown file.
 */
interface IMarkdownEditorNudge {
	/** `textEditor`: the file is open as text. `preview`: it is open in a Markdown preview. */
	readonly kind: MarkdownEditorNudgeKind;
	/** The group whose editor type dropdown is highlighted and whose editor is reopened in the Markdown Editor. */
	readonly group: IEditorGroup;
	readonly editor: EditorInput;
	/** A preview opened to the side of {@link editor}; it is closed when the user tries the Markdown Editor. */
	readonly sidePreview?: { readonly group: IEditorGroup; readonly editor: EditorInput };
}

function isSameNudge(a: IMarkdownEditorNudge | undefined, b: IMarkdownEditorNudge | undefined): boolean {
	return a === b || (!!a && !!b && a.kind === b.kind && a.group === b.group && a.editor === b.editor && a.sidePreview?.editor === b.sidePreview?.editor);
}

function isSidePreview(editor: EditorInput | undefined): boolean {
	return editor instanceof WebviewInput && editor.viewType === MARKDOWN_SIDE_PREVIEW_VIEW_TYPE;
}

/**
 * Suggests the Markdown Editor to users who have not used it yet, by highlighting the editor type
 * dropdown in the breadcrumbs, which is also where they switch back:
 * - when they work on a Markdown file in the text editor, and
 * - when they open a Markdown preview, either in place (the dropdown shows "Markdown Preview") or to
 *   the side (the dropdown of the source text editor is highlighted, and trying the Markdown Editor
 *   replaces both).
 *
 * "Try Editor" reopens the file in the Markdown Editor without changing the default editor. A nudge
 * shows right when the user opens or switches to the file or preview, never for editors restored at
 * startup or while the user edits. The onboarding engine shows at most one of the nudges, once, and
 * only for users whose experiment arm enables that nudge.
 */
export class MarkdownEditorPromotion extends Disposable {
	static readonly ID = 'workbench.contrib.markdownEditorPromotion';

	constructor(
		@IEditorService editorService: IEditorService,
		@IEditorGroupsService editorGroupsService: IEditorGroupsService,
		@IEditorResolverService editorResolverService: IEditorResolverService,
		@IModelService modelService: IModelService,
		@IBreadcrumbsService breadcrumbsService: IBreadcrumbsService,
		@IConfigurationService configurationService: IConfigurationService,
		@IStorageService storageService: IStorageService,
		@ICommandService commandService: ICommandService,
	) {
		super();

		const activeEditor = observableFromEvent(this, editorService.onDidActiveEditorChange, () => editorService.activeEditor);

		const usedMarkdownEditor = observableValue(this, storageService.getBoolean(USED_MARKDOWN_EDITOR_STORAGE_KEY, StorageScope.PROFILE, false));
		this._register(autorun(reader => {
			if (activeEditor.read(reader)?.editorId === MARKDOWN_EDITOR_ID && !usedMarkdownEditor.read(reader)) {
				storageService.store(USED_MARKDOWN_EDITOR_STORAGE_KEY, true, StorageScope.PROFILE, StorageTarget.USER);
				usedMarkdownEditor.set(true, undefined);
			}
		}));

		const developerModeChanged = observableSignalFromEvent(this, Event.filter(configurationService.onDidChangeConfiguration, e => e.affectsConfiguration(ONBOARDING_DEVELOPER_MODE_CONFIG)));
		const isDeveloperMode = (kind: MarkdownEditorNudgeKind, reader: IReader) => {
			developerModeChanged.read(reader);
			return isOnboardingDeveloperModeEnabled(configurationService, NUDGE_SCENARIO_IDS[kind]);
		};

		// Only nudge when the user opens or switches to an editor, never for editors restored at
		// startup, and not while they edit the file.
		const startTime = Date.now();
		const activation = observableValue<IEditorActivation | undefined>(this, undefined);
		const activationEditListener = this._register(new MutableDisposable());
		this._register(editorService.onDidActiveEditorChange(() => {
			const editor = editorService.activeEditor;
			activationEditListener.clear();
			activation.set(editor ? { editor, afterStartupGrace: Date.now() - startTime >= STARTUP_GRACE_MS, edited: false } : undefined, undefined);
			const resource = EditorResourceAccessor.getOriginalUri(editor);
			const model = resource && modelService.getModel(resource);
			if (editor && model) {
				activationEditListener.value = Event.once(model.onDidChangeContent)(() => {
					activation.set({ ...activation.get()!, edited: true }, undefined);
				});
			}
		}));

		const layoutChanged = observableSignalFromEvent(this, Event.any<unknown>(
			editorService.onDidActiveEditorChange,
			editorService.onDidVisibleEditorsChange,
			editorGroupsService.onDidChangeActiveGroup,
			breadcrumbsService.onDidChangeEditorTypeControl,
			editorResolverService.onDidChangeEditorRegistrations,
			Event.filter(configurationService.onDidChangeConfiguration, e => e.affectsConfiguration(editorsAssociationsSettingId)),
		));

		const editorTypeControl = (group: IEditorGroup) => {
			const control = breadcrumbsService.getEditorTypeControl(group.id);
			return control && control.element.ownerDocument === mainWindow.document ? control : undefined;
		};

		/** The ID of the editor type `group` shows its Markdown file with, if the Markdown Editor could open it instead. */
		const promotableEditorTypeOf = (group: IEditorGroup): string | undefined => {
			const editor = group.activeEditor;
			if (!editor || !editorTypeControl(group)) {
				return undefined;
			}
			const available = getAvailableEditorTypes(editor, editorResolverService, modelService);
			const isPromotable = available
				&& !available.isDiffEditor
				&& available.editors.some(e => e.id === MARKDOWN_EDITOR_ID)
				&& available.editorMatches.defaultRule.editor.id !== MARKDOWN_EDITOR_ID
				// The Markdown Editor also opens `*.txt` files; only promote it for Markdown.
				&& modelService.getModel(available.resource)?.getLanguageId() === 'markdown';
			return isPromotable ? available.currentId : undefined;
		};

		/** The Markdown file the user looks at, as text or as a preview, if the Markdown Editor could open it instead. */
		const findNudge = (): IMarkdownEditorNudge | undefined => {
			const [activeGroup, ...otherGroups] = editorGroupsService.getGroups(GroupsOrder.MOST_RECENTLY_ACTIVE);
			const sidePreviewGroup = [activeGroup, ...otherGroups].find(group => isSidePreview(group?.activeEditor ?? undefined));
			const sidePreview = sidePreviewGroup?.activeEditor ? { group: sidePreviewGroup, editor: sidePreviewGroup.activeEditor } : undefined;

			// The side preview has no breadcrumbs: highlight the dropdown of its source, the most
			// recently active Markdown text editor next to it.
			const sourceGroup = sidePreviewGroup === activeGroup ? otherGroups.find(group => promotableEditorTypeOf(group) === DEFAULT_EDITOR_ASSOCIATION.id) : activeGroup;
			const editorType = sourceGroup && promotableEditorTypeOf(sourceGroup);
			if (!sourceGroup?.activeEditor || !editorType) {
				return undefined;
			}
			if (editorType === MARKDOWN_PREVIEW_EDITOR_ID) {
				return { kind: 'preview', group: sourceGroup, editor: sourceGroup.activeEditor };
			}
			if (editorType !== DEFAULT_EDITOR_ASSOCIATION.id) {
				return undefined;
			}
			return sidePreview
				? { kind: 'preview', group: sourceGroup, editor: sourceGroup.activeEditor, sidePreview }
				: { kind: 'textEditor', group: sourceGroup, editor: sourceGroup.activeEditor };
		};

		const nudge = derivedOpts<IMarkdownEditorNudge | undefined>({ owner: this, equalsFn: isSameNudge }, reader => {
			layoutChanged.read(reader);
			const active = activeEditor.read(reader);
			const currentActivation = activation.read(reader);
			if (!active || currentActivation?.editor !== active || currentActivation.edited) {
				return undefined;
			}
			const candidate = findNudge();
			if (!candidate) {
				return undefined;
			}
			const developerMode = isDeveloperMode(candidate.kind, reader);
			if (!developerMode && (usedMarkdownEditor.read(reader) || !currentActivation.afterStartupGrace)) {
				return undefined;
			}
			return candidate;
		});

		this._register(registerOnboardingTargetProvider(NUDGE_TARGET_ID, scope => {
			const group = scope === undefined ? nudge.get()?.group : undefined;
			const control = group && editorTypeControl(group);
			return control && isVisibleOnboardingTarget(mainWindow, control.element)
				? { element: control.element, onDidActivate: control.onDidOpen }
				: undefined;
		}));

		const tryMarkdownEditor = async () => {
			const current = nudge.get();
			if (!current) {
				return;
			}
			if (current.sidePreview) {
				await current.sidePreview.group.closeEditor(current.sidePreview.editor);
			}
			await commandService.executeCommand(REOPEN_ACTIVE_EDITOR_WITH_COMMAND_ID, MARKDOWN_EDITOR_ID, {
				groupId: current.group.id,
				editorIndex: current.group.getIndexOfEditor(current.editor),
			});
		};

		const step = (title: string, description: string): ISpotlightStep => ({
			id: 'editorTypeDropdown',
			targetId: NUDGE_TARGET_ID,
			title,
			description,
			primaryAction: {
				label: localize('markdownEditorNudge.tryEditor', "Try Editor"),
				advance: true,
				run: tryMarkdownEditor,
			},
			endTourLabel: localize('markdownEditorNudge.dontShowAgain', "Don't Show Again"),
			placement: 'below',
			allowTargetInteraction: true,
			advanceOnTargetClick: true,
			missingTarget: { kind: 'wait', timeoutMs: 1000 },
		});

		const scenarios: IOnboardingScenario<ISpotlightPayload>[] = [{
			id: NUDGE_SCENARIO_IDS.textEditor,
			seenKey: NUDGE_SEEN_KEY,
			when: EditorPartModalVisibleContext.toNegated(),
			trigger: { kind: 'observable', signal: derived(reader => nudge.read(reader)?.kind === 'textEditor') },
			experiment: NUDGE_EXPERIMENTS.textEditor,
			presentation: {
				kind: SPOTLIGHT_PRESENTATION_KIND,
				payload: {
					steps: [step(
						localize('markdownEditorNudge.textEditor.title', "Try the new Markdown Editor"),
						localize('markdownEditorNudge.textEditor.description', "Edit Markdown files as formatted documents. You can switch back to the Text Editor here at any time."),
					)],
				},
			},
		}, {
			id: NUDGE_SCENARIO_IDS.preview,
			seenKey: NUDGE_SEEN_KEY,
			priority: 1,
			when: EditorPartModalVisibleContext.toNegated(),
			trigger: { kind: 'observable', signal: derived(reader => nudge.read(reader)?.kind === 'preview') },
			experiment: NUDGE_EXPERIMENTS.preview,
			presentation: {
				kind: SPOTLIGHT_PRESENTATION_KIND,
				payload: {
					steps: [step(
						localize('markdownEditorNudge.preview.title', "Edit While You Read"),
						localize('markdownEditorNudge.preview.description', "The Markdown Editor shows formatted Markdown that you can edit directly, without a separate preview. You can switch editors here at any time."),
					)],
				},
			},
		}];
		for (const scenario of scenarios) {
			this._register(onboardingScenarioRegistry.register(scenario));
		}
	}
}

registerWorkbenchContribution2(MarkdownEditorPromotion.ID, MarkdownEditorPromotion, WorkbenchPhase.AfterRestored);
