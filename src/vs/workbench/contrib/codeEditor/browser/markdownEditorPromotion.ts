/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { mainWindow } from '../../../../base/browser/window.js';
import { Event } from '../../../../base/common/event.js';
import { Disposable, DisposableMap } from '../../../../base/common/lifecycle.js';
import { ResourceSet } from '../../../../base/common/map.js';
import { autorun, derived, derivedOpts, IReader, observableFromEvent, observableSignal, observableSignalFromEvent, observableValue } from '../../../../base/common/observable.js';
import { extname, isEqual } from '../../../../base/common/resources.js';
import { isObject } from '../../../../base/common/types.js';
import { URI } from '../../../../base/common/uri.js';
import { ITextModel } from '../../../../editor/common/model.js';
import { ILanguageService } from '../../../../editor/common/languages/language.js';
import { IModelService } from '../../../../editor/common/services/model.js';
import { localize } from '../../../../nls.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IContextKeyService, RawContextKey } from '../../../../platform/contextkey/common/contextkey.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { IBreadcrumbsService } from '../../../browser/parts/editor/breadcrumbs.js';
import { REOPEN_ACTIVE_EDITOR_WITH_COMMAND_ID } from '../../../browser/parts/editor/editorCommands.js';
import { getAvailableEditorTypes } from '../../../browser/parts/editor/editorTypePicker.js';
import { registerWorkbenchContribution2, WorkbenchPhase } from '../../../common/contributions.js';
import { EditorPartModalVisibleContext } from '../../../common/contextkeys.js';
import { DEFAULT_EDITOR_ASSOCIATION } from '../../../common/editor.js';
import { EditorInput } from '../../../common/editor/editorInput.js';
import { editorsAssociationsSettingId, hiddenEditorTypesSettingId, IEditorResolverService } from '../../../services/editor/common/editorResolverService.js';
import { IEditorGroup, IEditorGroupsService } from '../../../services/editor/common/editorGroupsService.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { IExtensionService } from '../../../services/extensions/common/extensions.js';
import { isVisibleOnboardingTarget, registerOnboardingTargetProvider } from '../../onboarding/browser/spotlight/onboardingTarget.js';
import { ISpotlightPayload, ISpotlightStep, SPOTLIGHT_PRESENTATION_KIND } from '../../onboarding/browser/spotlight/spotlightTypes.js';
import { onboardingScenarioRegistry } from '../../onboarding/common/onboardingRegistry.js';
import { IOnboardingExperiment, IOnboardingScenario } from '../../onboarding/common/onboardingScenario.js';
import { isOnboardingDeveloperModeEnabled, IOnboardingScenarioService, ONBOARDING_DEVELOPER_MODE_CONFIG } from '../../onboarding/common/onboardingScenarioService.js';
import { WebviewInput } from '../../webviewPanel/browser/webviewEditorInput.js';
import { countOtherMarkdownEditors, countPreviewExtensions, defaultMarkdownEditorKind, IMarkdownEditorNudgeContext, MarkdownEditorNudgeContextClassification, RECENT_MARKDOWN_EDIT_MS } from './markdownEditorNudgeContext.js';

const MARKDOWN_EDITOR_ID = 'vscode.markdown.editor';
const MARKDOWN_PREVIEW_EDITOR_ID = 'vscode.markdown.preview.editor';
/** The view type of the preview that "Open Preview to the Side" opens as a webview panel. */
const MARKDOWN_SIDE_PREVIEW_VIEW_TYPE = 'mainThreadWebview-markdown.preview';

const NUDGE_TARGET_ID = 'markdownEditor.nudge.editorTypeDropdown';
/** Both nudges count as the same onboarding: a user sees at most one of them. */
const NUDGE_SEEN_KEY = 'markdownEditor.nudge';

/** Set while a shown nudge no longer matches the editors it is about, which ends it. */
const NudgeOutdatedContext = new RawContextKey<boolean>('markdownEditorNudgeOutdated', false);

const USED_MARKDOWN_EDITOR_STORAGE_KEY = 'markdownEditorPromotion.usedMarkdownEditor';
const NUDGE_CONTEXT_REPORTED_STORAGE_KEY = 'markdownEditorPromotion.nudgeContextReported';
const LAST_MARKDOWN_EDIT_STORAGE_KEY = 'markdownEditorPromotion.lastMarkdownEdit';
/** The editor the empty editor hint last opened an untitled file with (see `emptyEditorHintActions.ts`). */
const LAST_UNTITLED_EDITOR_STORAGE_KEY = 'emptyEditorHint.lastUntitledEditor';
/** The time of the last Markdown edit is stored at most this often. */
const MARKDOWN_EDIT_STORE_INTERVAL_MS = 60 * 60 * 1000;

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
	readonly resource: URI;
	/** A preview of {@link resource} to the side of {@link editor}; it is closed when the user tries the Markdown Editor. */
	readonly sidePreview?: { readonly group: IEditorGroup; readonly editor: EditorInput };
}

function isSameNudge(a: IMarkdownEditorNudge | undefined, b: IMarkdownEditorNudge | undefined): boolean {
	return a === b || (!!a && !!b && a.kind === b.kind && a.group === b.group && a.editor === b.editor && a.sidePreview?.editor === b.sidePreview?.editor);
}

function isSidePreview(editor: EditorInput | null | undefined): editor is WebviewInput {
	return editor instanceof WebviewInput && editor.viewType === MARKDOWN_SIDE_PREVIEW_VIEW_TYPE;
}

/**
 * The document a side preview shows. The Markdown preview keeps it in its webview state, which it
 * updates whenever it follows another document.
 */
function sidePreviewResource(preview: WebviewInput): URI | undefined {
	try {
		const state: unknown = JSON.parse(preview.webview.state ?? 'null');
		const resource = isObject(state) ? (state as { readonly resource?: unknown }).resource : undefined;
		return typeof resource === 'string' ? URI.parse(resource) : undefined;
	} catch {
		return undefined;
	}
}

/**
 * Suggests the Markdown Editor to users who have not used it yet, by highlighting the editor type
 * dropdown in the breadcrumbs, which is also where they switch back:
 * - when they work on a Markdown file in the text editor, and
 * - when they open a Markdown preview, either in place (the dropdown shows "Markdown Preview") or to
 *   the side (the dropdown of the text editor of the previewed file is highlighted, and trying the
 *   Markdown Editor replaces both).
 *
 * "Try Editor" makes the Markdown Editor the default for Markdown files and reopens the file in it. A nudge
 * shows right when the user opens or switches to the file or preview, never for editors restored at
 * startup or for files edited since they were opened. The onboarding engine shows at most one of the
 * nudges, once, and only for users whose experiment arm enables that nudge.
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
		@IContextKeyService contextKeyService: IContextKeyService,
		@ILanguageService languageService: ILanguageService,
		@ITelemetryService telemetryService: ITelemetryService,
		@IExtensionService extensionService: IExtensionService,
		@IOnboardingScenarioService onboardingService: IOnboardingScenarioService,
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

		// Only nudge when the user opens or switches to an editor, never for editors restored at startup.
		const startTime = Date.now();
		const activation = observableValue<IEditorActivation | undefined>(this, undefined);
		this._register(editorService.onDidActiveEditorChange(() => {
			const editor = editorService.activeEditor;
			activation.set(editor ? { editor, afterStartupGrace: Date.now() - startTime >= STARTUP_GRACE_MS } : undefined, undefined);
		}));

		// Documents changed since they were opened. Reloading from disk is not an edit.
		let lastMarkdownEditStored = storageService.getNumber(LAST_MARKDOWN_EDIT_STORAGE_KEY, StorageScope.PROFILE, 0);
		const recordMarkdownEdit = () => {
			const now = Date.now();
			if (now - lastMarkdownEditStored >= MARKDOWN_EDIT_STORE_INTERVAL_MS) {
				lastMarkdownEditStored = now;
				storageService.store(LAST_MARKDOWN_EDIT_STORAGE_KEY, now, StorageScope.PROFILE, StorageTarget.MACHINE);
			}
		};
		const editedResources = new ResourceSet();
		const editedResourcesChanged = observableSignal(this);
		const modelListeners = this._register(new DisposableMap<ITextModel>());
		const watchModel = (model: ITextModel) => modelListeners.set(model, model.onDidChangeContent(e => {
			if (e.isFlush) {
				return;
			}
			if (model.getLanguageId() === 'markdown') {
				recordMarkdownEdit();
			}
			if (!editedResources.has(model.uri)) {
				editedResources.add(model.uri);
				editedResourcesChanged.trigger(undefined);
			}
		}));
		modelService.getModels().forEach(watchModel);
		this._register(modelService.onModelAdded(watchModel));
		this._register(modelService.onModelRemoved(model => {
			modelListeners.deleteAndDispose(model);
			editedResources.delete(model.uri);
		}));

		const layoutChanged = observableSignalFromEvent(this, Event.any<unknown>(
			editorService.onDidActiveEditorChange,
			editorService.onDidVisibleEditorsChange,
			editorGroupsService.onDidChangeActiveGroup,
			breadcrumbsService.onDidChangeEditorTypeControl,
			editorResolverService.onDidChangeEditorRegistrations,
			Event.filter(configurationService.onDidChangeConfiguration, e => e.affectsConfiguration(editorsAssociationsSettingId) || e.affectsConfiguration(hiddenEditorTypesSettingId)),
		));

		// Side previews report the document they show through their webview state.
		const sidePreviewStateChanged = observableSignal(this);
		this._register(autorun(reader => {
			layoutChanged.read(reader);
			for (const group of editorGroupsService.groups) {
				if (isSidePreview(group.activeEditor)) {
					reader.store.add(group.activeEditor.webview.onDidUpdateState(() => sidePreviewStateChanged.trigger(undefined)));
				}
			}
		}));

		const editorTypeControl = (group: IEditorGroup) => {
			const control = breadcrumbsService.getEditorTypeControl(group.id);
			return control && control.element.ownerDocument === mainWindow.document ? control : undefined;
		};

		/**
		 * The editor type `group` shows its Markdown file with, if the Markdown Editor could open it
		 * instead and the group's dropdown offers it.
		 */
		const promotableEditorTypeOf = (group: IEditorGroup): { readonly editorType: string; readonly resource: URI } | undefined => {
			const editor = group.activeEditor;
			if (!editor || !editorTypeControl(group)) {
				return undefined;
			}
			const available = getAvailableEditorTypes(editor, editorResolverService, modelService, configurationService.getValue<readonly string[]>(hiddenEditorTypesSettingId));
			const isPromotable = available
				&& !available.isDiffEditor
				&& available.editors.some(e => e.id === MARKDOWN_EDITOR_ID)
				&& available.editorMatches.defaultRule.editor.id !== MARKDOWN_EDITOR_ID
				// The Markdown Editor also opens `*.txt` files; only promote it for Markdown.
				&& modelService.getModel(available.resource)?.getLanguageId() === 'markdown';
			return isPromotable ? { editorType: available.currentId, resource: available.resource } : undefined;
		};

		const textEditorOf = (resource: URI, exclude: IEditorGroup) => editorGroupsService.groups.find(group => {
			const promotable = group !== exclude ? promotableEditorTypeOf(group) : undefined;
			return promotable?.editorType === DEFAULT_EDITOR_ASSOCIATION.id && isEqual(promotable.resource, resource);
		});
		const sidePreviewOf = (resource: URI, exclude: IEditorGroup) => {
			const group = editorGroupsService.groups.find(group => group !== exclude && isSidePreview(group.activeEditor) && isEqual(sidePreviewResource(group.activeEditor), resource));
			return group?.activeEditor ? { group, editor: group.activeEditor } : undefined;
		};

		/** The Markdown file the user looks at, as text or as a preview, if the Markdown Editor could open it instead. */
		const findNudge = (): IMarkdownEditorNudge | undefined => {
			const activeGroup = editorGroupsService.activeGroup;
			const active = activeGroup.activeEditor;
			if (isSidePreview(active)) {
				// The side preview has no breadcrumbs: highlight the dropdown of the text editor of
				// the document it shows.
				const resource = sidePreviewResource(active);
				const sourceGroup = resource && textEditorOf(resource, activeGroup);
				return sourceGroup?.activeEditor && resource
					? { kind: 'preview', group: sourceGroup, editor: sourceGroup.activeEditor, resource, sidePreview: { group: activeGroup, editor: active } }
					: undefined;
			}
			const promotable = promotableEditorTypeOf(activeGroup);
			if (!active || !promotable) {
				return undefined;
			}
			if (promotable.editorType === MARKDOWN_PREVIEW_EDITOR_ID) {
				return { kind: 'preview', group: activeGroup, editor: active, resource: promotable.resource };
			}
			if (promotable.editorType !== DEFAULT_EDITOR_ASSOCIATION.id) {
				return undefined;
			}
			const sidePreview = sidePreviewOf(promotable.resource, activeGroup);
			return { kind: sidePreview ? 'preview' : 'textEditor', group: activeGroup, editor: active, resource: promotable.resource, sidePreview };
		};

		const nudge = derivedOpts<IMarkdownEditorNudge | undefined>({ owner: this, equalsFn: isSameNudge }, reader => {
			layoutChanged.read(reader);
			sidePreviewStateChanged.read(reader);
			editedResourcesChanged.read(reader);
			const active = activeEditor.read(reader);
			const currentActivation = activation.read(reader);
			if (!active || currentActivation?.editor !== active) {
				return undefined;
			}
			const candidate = findNudge();
			if (!candidate || editedResources.has(candidate.resource)) {
				return undefined;
			}
			if (!isDeveloperMode(candidate.kind, reader) && (usedMarkdownEditor.read(reader) || !currentActivation.afterStartupGrace)) {
				return undefined;
			}
			return candidate;
		});

		// Describe who reaches a nudge, once per profile, in every experiment arm. Logged at the
		// would-show moment, when the experiment's assignment context already flows into telemetry.
		this._register(onboardingService.onDidReachWouldShow(scenarioId => {
			const current = nudge.get();
			// Re-read the flag: another window of this profile may have reported in the meantime.
			if (!current || NUDGE_SCENARIO_IDS[current.kind] !== scenarioId || storageService.getBoolean(NUDGE_CONTEXT_REPORTED_STORAGE_KEY, StorageScope.PROFILE, false)) {
				return;
			}
			storageService.store(NUDGE_CONTEXT_REPORTED_STORAGE_KEY, true, StorageScope.PROFILE, StorageTarget.MACHINE);
			const matches = editorResolverService.getEditorMatches(current.resource);
			const lastMarkdownEdit = storageService.getNumber(LAST_MARKDOWN_EDIT_STORAGE_KEY, StorageScope.PROFILE);
			telemetryService.publicLog2<IMarkdownEditorNudgeContext, MarkdownEditorNudgeContextClassification>('markdownEditor.nudgeContext', {
				nudge: current.kind,
				previewExtensionCount: countPreviewExtensions(extensionService.extensions),
				otherMarkdownEditorCount: countOtherMarkdownEditors(matches),
				defaultBefore: defaultMarkdownEditorKind(matches),
				editedMarkdownRecently: lastMarkdownEdit !== undefined && Date.now() - lastMarkdownEdit < RECENT_MARKDOWN_EDIT_MS,
				untitledMarkdownEditorUsed: storageService.get(LAST_UNTITLED_EDITOR_STORAGE_KEY, StorageScope.PROFILE) === MARKDOWN_EDITOR_ID,
			});
		}));
		// A shown nudge is bound to the editors it was shown for. It ends when they change.
		const shownNudge = observableValue<IMarkdownEditorNudge | undefined>(this, undefined);
		const nudgeOutdated = NudgeOutdatedContext.bindTo(contextKeyService);
		this._register(autorun(reader => {
			layoutChanged.read(reader);
			const shown = shownNudge.read(reader);
			const isCurrent = !shown || (
				shown.group.activeEditor === shown.editor
				&& (!shown.sidePreview || shown.sidePreview.group.activeEditor === shown.sidePreview.editor)
			);
			nudgeOutdated.set(!isCurrent);
		}));

		this._register(registerOnboardingTargetProvider(NUDGE_TARGET_ID, scope => {
			const group = scope === undefined ? shownNudge.get()?.group : undefined;
			const control = group && editorTypeControl(group);
			return control && isVisibleOnboardingTarget(mainWindow, control.element)
				? { element: control.element, onDidActivate: control.onDidOpen }
				: undefined;
		}));

		const tryMarkdownEditor = async () => {
			const shown = shownNudge.get();
			if (!shown || nudgeOutdated.get()) {
				return;
			}
			if (shown.sidePreview) {
				await shown.sidePreview.group.closeEditor(shown.sidePreview.editor);
			}
			// Associate the file's extension only, never a broader pattern of the current default rule
			// (e.g. `*`), and only if the extension itself is Markdown, not a `.txt` file in Markdown mode.
			const extension = extname(shown.resource);
			if (extension && languageService.guessLanguageIdByFilepathOrFirstLine(URI.file(`/file${extension}`)) === 'markdown') {
				editorResolverService.setDefaultEditor(shown.resource, MARKDOWN_EDITOR_ID, false, { source: 'markdownEditorNudge', associationPattern: `*${extension}` });
			}
			await commandService.executeCommand(REOPEN_ACTIVE_EDITOR_WITH_COMMAND_ID, MARKDOWN_EDITOR_ID, {
				groupId: shown.group.id,
				editorIndex: shown.group.getIndexOfEditor(shown.editor),
			});
		};

		const step = (title: string, description: string): ISpotlightStep => ({
			id: 'editorTypeDropdown',
			targetId: NUDGE_TARGET_ID,
			title,
			description,
			onBeforeShow: () => shownNudge.set(nudge.get(), undefined),
			primaryAction: {
				label: localize('markdownEditorNudge.tryEditor', "Try Editor"),
				advance: true,
				run: tryMarkdownEditor,
			},
			endTourLabel: localize('markdownEditorNudge.dontShowAgain', "Don't Show Again"),
			placement: 'below',
			allowTargetInteraction: true,
			advanceOnTargetClick: true,
			advanceWhen: NudgeOutdatedContext.isEqualTo(true),
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
