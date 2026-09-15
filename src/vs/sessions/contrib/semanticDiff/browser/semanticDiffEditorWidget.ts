/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/semanticDiffEditor.css';
import './semanticDiffColors.js';
import { $, append, Dimension, getActiveElement, isAncestor, isHTMLElement, trackFocus } from '../../../../base/browser/dom.js';
import { CheckboxActionViewItem, ICheckboxActionViewItemOptions } from '../../../../base/browser/ui/toggle/toggle.js';
import { ActionViewItem } from '../../../../base/browser/ui/actionbar/actionViewItems.js';
import { CountBadge } from '../../../../base/browser/ui/countBadge/countBadge.js';
import { Action, IAction } from '../../../../base/common/actions.js';
import { Event } from '../../../../base/common/event.js';
import { MarkdownString } from '../../../../base/common/htmlContent.js';
import { Disposable, DisposableStore, IDisposable, MutableDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { autorun, derived, observableSignalFromEvent } from '../../../../base/common/observable.js';
import { basename, dirname } from '../../../../base/common/path.js';
import { isEqual } from '../../../../base/common/resources.js';
import { assertType } from '../../../../base/common/types.js';
import { URI } from '../../../../base/common/uri.js';
import { IDiffEditorConstructionOptions } from '../../../../editor/browser/editorBrowser.js';
import { CodeEditorWidget } from '../../../../editor/browser/widget/codeEditor/codeEditorWidget.js';
import { DiffEditorWidget } from '../../../../editor/browser/widget/diffEditor/diffEditorWidget.js';
import { RefCounted } from '../../../../editor/browser/widget/diffEditor/utils.js';
import { EditorGutter, IGutterItemInfo } from '../../../../editor/browser/widget/diffEditor/utils/editorGutter.js';
import { DiffItemSource, IDocumentDiffItem } from '../../../../editor/browser/widget/multiDiffEditor/model.js';
import { MultiDiffEditorWidget } from '../../../../editor/browser/widget/multiDiffEditor/multiDiffEditorWidget.js';
import { MultiDiffEditorViewModel } from '../../../../editor/browser/widget/multiDiffEditor/multiDiffEditorViewModel.js';
import { IResourceLabel, IWorkbenchUIElementFactory, MultiDiffEditorItemLabelKind } from '../../../../editor/browser/widget/multiDiffEditor/workbenchUIElementFactory.js';
import { IModelService } from '../../../../editor/common/services/model.js';
import { IModelDeltaDecoration } from '../../../../editor/common/model.js';
import { LineRange } from '../../../../editor/common/core/ranges/lineRange.js';
import { ILanguageService } from '../../../../editor/common/languages/language.js';
import { localize } from '../../../../nls.js';
import { WorkbenchToolBar } from '../../../../platform/actions/browser/toolbar.js';
import { IMenuService, MenuId } from '../../../../platform/actions/common/actions.js';
import { formatSemanticDiffRange, getSemanticDiffChangeTypeLabel } from '../../../../platform/agentHost/common/semanticDiff.js';
import { ISemanticDiffProjectedFile, ISemanticDiffVerifiedHunk } from '../../../../platform/agentHost/common/semanticDiffProjection.js';
import { IContextKeyService, RawContextKey } from '../../../../platform/contextkey/common/contextkey.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { ServiceCollection } from '../../../../platform/instantiation/common/serviceCollection.js';
import { defaultCheckboxStyles } from '../../../../platform/theme/browser/defaultStyles.js';
import { IHoverService } from '../../../../platform/hover/browser/hover.js';
import { ResourceLabel } from '../../../../workbench/browser/labels.js';
import { AccessibilityVerbositySettingId } from '../../../../workbench/contrib/accessibility/browser/accessibilityConfiguration.js';
import { ISemanticDiffSourceResolverService } from '../../../../workbench/contrib/chat/common/semanticDiffEditor.js';
import { IAccessibleViewService } from '../../../../platform/accessibility/browser/accessibleView.js';
import { SemanticDiffEditorInput, SemanticDiffFilter } from './semanticDiffEditorInput.js';

export const SemanticDiffEditorFocused = new RawContextKey<boolean>('semanticDiffEditorFocused', false);

export const semanticDiffReadonlyOptions: IDiffEditorConstructionOptions = {
	readOnly: true,
	domReadOnly: true,
	originalEditable: false,
	ignoreTrimWhitespace: false,
	renderIndicators: false,
	hideOriginalLineNumbers: false,
	renderMarginRevertIcon: false,
	renderGutterMenu: false,
	contextmenu: false,
	codeLens: false,
	links: false,
	folding: false,
	renderSideBySide: false,
	useInlineViewWhenSpaceIsLimited: false,
	originalAriaLabel: localize('semanticDiff.baselineAria', "Read-only comparison baseline; canonical original line numbers"),
	modifiedAriaLabel: localize('semanticDiff.projectionAria', "Read-only filtered projection; line numbers are not target-file coordinates"),
};

interface ISemanticDiffGutterItem extends IGutterItemInfo {
	readonly hunk: ISemanticDiffVerifiedHunk;
}

class SemanticDiffFilterActionViewItem extends CheckboxActionViewItem {
	constructor(action: IAction, options: ICheckboxActionViewItemOptions, private readonly type: SemanticDiffFilter, private readonly count: number) {
		super(undefined, action, options);
	}

	override render(container: HTMLElement): void {
		super.render(container);
		container.classList.add(`semantic-diff-type-${this.type ?? 'unclassified'}`);
		const badgeContainer = append(this.label!, $('span.semantic-diff-filter-count', { 'aria-hidden': 'true' }));
		this._register(new CountBadge(badgeContainer, { count: this.count }, {
			badgeBackground: undefined, badgeForeground: undefined, badgeBorder: undefined,
		}));
		this.toggle.domNode.setAttribute('aria-label', this.count === 1
			? localize('semanticDiff.filterOneHunk', "{0}, 1 hunk", this.action.label)
			: localize('semanticDiff.filterHunks', "{0}, {1} hunks", this.action.label, this.count));
	}
}

export class SemanticDiffEditorWidget extends Disposable {
	readonly domNode: HTMLElement;
	readonly scopedContextKeyService: IContextKeyService;
	readonly diffWidget: MultiDiffEditorWidget;
	private readonly toolbarContainer: HTMLElement;
	private readonly status: HTMLElement;
	private readonly diffContainer: HTMLElement;
	private readonly toolbar: WorkbenchToolBar;
	private statusMessage = '';
	private readonly viewModel = this._register(new MutableDisposable<MultiDiffEditorViewModel>());
	private readonly hunkDecorations = this._register(new MutableDisposable());
	private readonly documents = new Map<string, RefCounted<IDocumentDiffItem>>();
	private dimension = new Dimension(0, 0);
	private projections: readonly ISemanticDiffProjectedFile[] = [];

	constructor(
		container: HTMLElement,
		readonly input: SemanticDiffEditorInput,
		@IInstantiationService instantiationService: IInstantiationService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IMenuService menuService: IMenuService,
		@IModelService private readonly modelService: IModelService,
		@ILanguageService private readonly languageService: ILanguageService,
		@IHoverService hoverService: IHoverService,
		@IAccessibleViewService accessibleViewService: IAccessibleViewService,
		@ISemanticDiffSourceResolverService private readonly sourceResolver: ISemanticDiffSourceResolverService,
	) {
		super();
		this.domNode = append(container, $('.semantic-diff-editor'));
		this.domNode.tabIndex = -1;
		this.toolbarContainer = append(this.domNode, $('.semantic-diff-toolbar'));
		const body = append(this.domNode, $('.semantic-diff-body'));
		this.status = append(body, $('.semantic-diff-status'));
		this.status.setAttribute('role', 'status');
		this.status.setAttribute('aria-live', 'polite');
		this.diffContainer = append(body, $('.semantic-diff-content'));

		this.scopedContextKeyService = this._register(contextKeyService.createScoped(this.domNode));
		const focused = SemanticDiffEditorFocused.bindTo(this.scopedContextKeyService);
		const focusTracker = this._register(trackFocus(this.domNode));
		this._register(focusTracker.onDidFocus(() => focused.set(true)));
		this._register(focusTracker.onDidBlur(() => focused.set(false)));
		this._register(toDisposable(() => focused.reset()));
		const scopedInstantiationService = this._register(instantiationService.createChild(new ServiceCollection([IContextKeyService, this.scopedContextKeyService])));
		const actions = input.availableTypes.map(type => {
			const action = this._register(new Action(`semanticDiff.filter.${type ?? 'unclassified'}`, getSemanticDiffChangeTypeLabel(type), undefined, true, () => input.toggleType(type)));
			action.checked = input.selectedTypes.get().has(type);
			const count = input.hunks.filter(hunk => hunk.classification.changeType === type).length;
			return { type, action, count };
		});
		this.toolbar = this._register(scopedInstantiationService.createInstance(WorkbenchToolBar, this.toolbarContainer, {
			ariaLabel: localize('semanticDiff.filterToolbar', "Primary change type filters"),
			actionViewItemProvider: (action, options) => {
				const filter = actions.find(filter => filter.action === action);
				return filter
					? new SemanticDiffFilterActionViewItem(action, { ...options, label: true, checkboxStyles: defaultCheckboxStyles }, filter.type, filter.count)
					: new ActionViewItem(undefined, action, { ...options, label: true, icon: false });
			},
		}));
		const retry = this._register(new Action('semanticDiff.retry', localize('semanticDiff.retry', "Retry Source"), undefined, false, () => input.resolveSource(this.sourceResolver, true)));
		const filterActions = actions.map(item => item.action);
		this.toolbar.setActions(filterActions);
		let retryVisible = false;
		this._register(autorun(reader => {
			const types = input.selectedTypes.read(reader);
			for (const item of actions) {
				item.action.checked = types.has(item.type);
			}
			const showRetry = input.sourceState.read(reader).kind === 'error';
			retry.enabled = showRetry;
			if (showRetry !== retryVisible) {
				retryVisible = showRetry;
				this.toolbar.setActions(showRetry ? [...filterActions, retry] : filterActions);
			}
		}));
		this._register(hoverService.setupDelayedHover(this.toolbarContainer, {
			content: localize('semanticDiff.filterHover', "Filters select whole hunks by primary type. Secondary types are annotations only."),
		}));
		const hint = accessibleViewService.getOpenAriaHint(AccessibilityVerbositySettingId.SemanticDiff);
		this.domNode.setAttribute('aria-label', hint ? localize('semanticDiff.ariaHint', "{0}. {1}", input.group.title, hint) : input.group.title);

		// Generic file commands must not escape this projection into an editable, full-file editor.
		const readOnlyMenus: IMenuService = {
			_serviceBrand: undefined,
			createMenu: (id, context, options) => id === MenuId.MultiDiffEditorFileToolbar
				? { onDidChange: Event.None, getActions: () => [], dispose: () => { } }
				: menuService.createMenu(id, context, options),
			getMenuActions: (id, context, options) => id === MenuId.MultiDiffEditorFileToolbar ? [] : menuService.getMenuActions(id, context, options),
			getMenuContexts: id => menuService.getMenuContexts(id),
			resetHiddenStates: (ids?: readonly MenuId[]) => menuService.resetHiddenStates(ids),
		};
		const diffInstantiationService = this._register(scopedInstantiationService.createChild(new ServiceCollection([IMenuService, readOnlyMenus])));
		const labels: IWorkbenchUIElementFactory = {
			createResourceLabel: (element, kind, accessory) => this.createResourceLabel(element, kind, accessory, scopedInstantiationService),
			createDiffEditorOverlay: editor => this.createGutter(editor, hoverService),
		};
		this.diffWidget = this._register(diffInstantiationService.createInstance(MultiDiffEditorWidget, this.diffContainer, labels, {
			variant: 'noCards',
			diffEditorOptions: semanticDiffReadonlyOptions,
		}));
		this._register(autorun(reader => {
			const state = input.sourceState.read(reader);
			const projections = input.projections.read(reader);
			this.statusMessage = state.kind === 'error'
				? localize('semanticDiff.sourceError', "Source unavailable: {0}", state.message)
				: state.kind !== 'ready'
					? localize('semanticDiff.loading', "Resolving the recorded comparison…")
					: getSemanticDiffCounts(input, projections);
			this.status.hidden = state.kind === 'ready' && projections.length > 0;
			this.status.textContent = this.status.hidden ? '' : state.kind === 'ready'
				? localize('semanticDiff.noMatchingHunks', "No hunks match the selected types.")
				: this.statusMessage;
			this.updateProjections(projections);
			this.layout(this.dimension);
		}));
		this._register(input.onWillDispose(() => this.dispose()));
	}

	async load(): Promise<void> {
		await this.input.resolveSource(this.sourceResolver);
		await this.viewModel.value?.waitForDiffOr1s();
	}

	private createResourceLabel(element: HTMLElement, kind: MultiDiffEditorItemLabelKind, accessory: HTMLElement, instantiationService: IInstantiationService): IResourceLabel {
		const label = instantiationService.createInstance(ResourceLabel, element, {});
		return {
			setUri: (uri, options) => {
				const item = uri && this.projections.find(file =>
					isEqual(this.input.getProjectionUri(file.file.id, 'original'), uri) ||
					isEqual(this.input.getProjectionUri(file.file.id, 'modified'), uri));
				if (!item || !uri) {
					label.element.clear();
					accessory.textContent = '';
					return;
				}
				const path = isEqual(uri, this.input.getProjectionUri(item.file.id, 'original')) ? item.file.oldPath ?? item.file.path : item.file.path;
				label.element.setResource({ resource: uri.with({ path: `/${path}` }), name: basename(path), description: dirname(path) === '.' ? undefined : dirname(path) }, {
					strikethrough: options?.strikethrough,
					title: path,
				});
				if (kind === MultiDiffEditorItemLabelKind.Primary) {
					accessory.classList.add('semantic-diff-file-stats');
					accessory.replaceChildren(
						$('span.semantic-diff-lines-added', undefined, localize('semanticDiff.addedLines', "+{0}", item.additions)),
						' ',
						$('span.semantic-diff-lines-removed', undefined, localize('semanticDiff.removedLines', "-{0}", item.deletions)),
					);
				}
			},
			dispose: () => label.dispose(),
		};
	}

	private createGutter(editor: DiffEditorWidget, hoverService: IHoverService): IDisposable {
		const modifiedEditor = editor.getModifiedEditor();
		assertType(modifiedEditor instanceof CodeEditorWidget, 'CodeEditorWidget');
		const store = new DisposableStore();
		const container = append(editor.getContainerDomNode(), $('.semantic-diff-gutter', { 'aria-hidden': 'true' }));
		store.add(toDisposable(() => container.remove()));
		const diffChanged = observableSignalFromEvent(this, Event.any(editor.onDidUpdateDiff, editor.onDidChangeModel));
		const items = derived<ISemanticDiffGutterItem[]>(this, reader => {
			diffChanged.read(reader);
			const model = editor.getModel();
			const projection = this.input.projections.read(reader).find(file => model && (
				isEqual(this.input.getProjectionUri(file.file.id, 'original'), model.original.uri) ||
				isEqual(this.input.getProjectionUri(file.file.id, 'modified'), model.modified.uri)));
			const diff = editor.getDiffComputationResult();
			if (!projection || !diff) {
				return [];
			}
			return projection.mappings.flatMap(mapping => {
				const hunk = projection.hunks.find(hunk => hunk.id === mapping.hunkId)!;
				const original = LineRange.ofLength(mapping.original.start + (mapping.original.count === 0 ? 1 : 0), mapping.original.count);
				const modified = LineRange.ofLength(mapping.projectedModified.start + (mapping.projectedModified.count === 0 ? 1 : 0), mapping.projectedModified.count);
				return diff.changes2.flatMap((change, index) => {
					const originalRange = original.intersect(change.original);
					const modifiedRange = modified.intersect(change.modified);
					if ((!originalRange || originalRange.isEmpty) && (!modifiedRange || modifiedRange.isEmpty)) {
						return [];
					}
					return [{ id: `${hunk.id}:${index}`, range: modifiedRange ?? change.modified, hunk }];
				});
			});
		});
		const modelChanged = observableSignalFromEvent(this, editor.onDidChangeModel);
		store.add(autorun(reader => {
			modelChanged.read(reader);
			if (!editor.getModel()) {
				return;
			}
			const gutter = append(container, $('div'));
			reader.store.add(toDisposable(() => gutter.remove()));
			reader.store.add(new EditorGutter<ISemanticDiffGutterItem>(modifiedEditor, gutter, {
				getIntersectingGutterItems: (_range, reader) => items.read(reader),
				createView: (item, target) => {
					const viewStore = new DisposableStore();
					viewStore.add(autorun(reader => {
						const hunk = item.read(reader).hunk;
						target.className = `semantic-diff-hunk-decoration semantic-diff-type-${hunk.classification.changeType ?? 'unclassified'}`;
						reader.store.add(hoverService.setupDelayedHover(target, {
							content: localize('semanticDiff.hunkTypeTooltip', "{0}: {1}", getSemanticDiffChangeTypeLabel(hunk.classification.changeType), hunk.classification.summary),
						}));
					}));
					return { layout: () => { }, dispose: () => viewStore.dispose() };
				},
			}));
		}));
		return store;
	}

	private updateProjections(projections: readonly ISemanticDiffProjectedFile[]): void {
		this.saveViewState();
		this.hunkDecorations.clear();
		this.diffWidget.setViewModel(undefined);
		this.viewModel.clear();
		this.projections = projections;
		const documents = projections.map(projection => {
			let document = this.documents.get(projection.file.id);
			if (!document) {
				const models = new DisposableStore();
				const createSide = (text: string | undefined, side: 'original' | 'modified') => {
					const uri = this.input.getProjectionUri(projection.file.id, side);
					const language = this.languageService.createByFilepathOrFirstLine(URI.from({ scheme: 'semantic-diff', path: `/${projection.file.path}` }));
					const model = projection.file.contentKind !== 'text' ? undefined : models.add(this.modelService.createModel(text ?? '', language, uri));
					return new DiffItemSource(uri, model);
				};
				const original = createSide(projection.original, 'original');
				const modified = createSide(projection.modified, 'modified');
				const getProjection = () => this.projections.find(file => file.file.id === projection.file.id);
				document = this._register(RefCounted.createOfNonDisposable<IDocumentDiffItem>({
					get original() { return projection.file.status === 'added' ? undefined : original; },
					get modified() { return projection.file.status === 'deleted' && getProjection()?.modified === undefined ? undefined : modified; },
					options: semanticDiffReadonlyOptions,
				}, models));
				this.documents.set(projection.file.id, document);
			} else {
				document.object.original?.textModel?.setValue(projection.original ?? '');
				document.object.modified?.textModel?.setValue(projection.modified ?? '');
			}
			return document;
		});
		const viewModel = this.viewModel.value = this.diffWidget.createViewModel({
			documents: { value: documents, onDidChange: Event.None },
		});
		this.hunkDecorations.value = autorun(reader => {
			for (const item of viewModel.items.read(reader)) {
				const projection = projections.find(projection => item.documentDiffItem === this.documents.get(projection.file.id)?.object);
				const diff = item.diffEditorViewModel.diff.read(reader);
				if (!projection || !diff) {
					continue;
				}
				const hunks = new Map(projection.hunks.map(hunk => [hunk.id, hunk]));
				for (const side of ['original', 'modified'] as const) {
					const model = item.diffEditorViewModel.model[side];
					const decorations: IModelDeltaDecoration[] = projection.mappings.flatMap(mapping => {
						const hunk = hunks.get(mapping.hunkId)!;
						const sourceRange = side === 'original' ? mapping.original : mapping.projectedModified;
						if (sourceRange.count === 0) {
							return [];
						}
						const hunkRange = LineRange.ofLength(sourceRange.start, sourceRange.count);
						// Git and the editor can align identical context lines differently; follow the rendered diff.
						return diff.mappings.flatMap(change => {
							const range = hunkRange.intersect(change.lineRangeMapping[side])?.toInclusiveRange();
							return range ? [{
								range,
								options: {
									description: 'semantic-diff-hunk-type',
									hoverMessage: new MarkdownString().appendText(localize('semanticDiff.hunkTypeTooltip', "{0}: {1}", getSemanticDiffChangeTypeLabel(hunk.classification.changeType), hunk.classification.summary)),
								},
							}] : [];
						});
					});
					const ids = model.deltaDecorations([], decorations);
					reader.store.add(toDisposable(() => {
						if (!model.isDisposed()) {
							model.deltaDecorations(ids, []);
						}
					}));
				}
			}
		});
		this.diffWidget.setViewModel(viewModel, { preserveFocus: true, viewState: this.input.viewState });
		this.diffContainer.style.display = projections.length ? '' : 'none';
	}

	saveViewState(): void {
		if (this.viewModel.value && this.projections.length) {
			const state = this.diffWidget.getViewState();
			this.input.viewState = {
				...state,
				docStates: { ...this.input.viewState?.docStates, ...state.docStates },
			};
		}
	}

	layout(dimension: Dimension): void {
		this.dimension = dimension;
		this.domNode.style.width = `${dimension.width}px`;
		this.domNode.style.height = `${dimension.height}px`;
		this.diffWidget.layout(new Dimension(dimension.width, Math.max(0, dimension.height - this.toolbarContainer.offsetHeight)));
	}

	focus(): void {
		if (this._store.isDisposed) {
			return;
		}
		if (!this.diffWidget.focus()) {
			this.toolbar.focus();
		}
	}

	captureFocus(): () => void {
		const element = getActiveElement();
		return () => {
			if (isHTMLElement(element) && element.isConnected && isAncestor(element, this.domNode)) {
				element.focus();
			} else {
				this.focus();
			}
		};
	}

	getAccessibleContent(): string {
		const input = this.input;
		const lines = [
			input.group.title, input.group.description, formatSemanticDiffComparison(input),
			localize('semanticDiff.accessibleProjection', "Read-only filtered projection. Original lines refer to the baseline. Modified lines refer to the projection, not the target file."),
			this.statusMessage,
			localize('semanticDiff.accessibleTypes', "Selected primary types: {0}", [...input.selectedTypes.get()].map(getSemanticDiffChangeTypeLabel).join(', ') || localize('semanticDiff.none', "none")),
		];
		for (const limitation of input.request.report.analysis.limitations) {
			lines.push(localize('semanticDiff.accessibleLimitation', "Limitation ({0}): {1}", limitation.code, limitation.message));
		}
		for (const file of this.projections) {
			lines.push(file.file.path);
			if (file.file.oldPath) {
				lines.push(localize('semanticDiff.renamedFrom', "Renamed from {0}", file.file.oldPath));
			}
			for (const hunk of file.hunks) {
				lines.push(localize('semanticDiff.accessibleHunk', "Hunk {0}: {1}. {2}. {3}. Primary: {4}. Secondary: {5}. {6}",
					hunk.id, hunk.classification.summary, formatSemanticDiffRange(hunk.oldRange, 'old'),
					formatSemanticDiffRange(hunk.newRange, 'new'), getSemanticDiffChangeTypeLabel(hunk.classification.changeType),
					hunk.classification.secondaryChangeTypes.map(getSemanticDiffChangeTypeLabel).join(', ') || localize('semanticDiff.none', "none"),
					hunk.classification.uncertainty ?? ''));
				lines.push(hunk.classification.groupReason, hunk.classification.typeReason);
			}
			for (const mapping of file.mappings) {
				lines.push(localize('semanticDiff.accessibleMapping', "Canonical original {0}; canonical modified {1}; projected modified {2}.",
					formatSemanticDiffRange(mapping.original, 'old'), formatSemanticDiffRange(mapping.canonicalModified, 'new'), formatSemanticDiffRange(mapping.projectedModified, 'new')));
			}
			lines.push(localize('semanticDiff.accessibleBaseline', "Baseline content:"), file.original ?? localize('semanticDiff.absentBaseline', "The file does not exist in the baseline."),
				localize('semanticDiff.accessibleProjected', "Filtered projection content:"), file.modified ?? localize('semanticDiff.deletedProjection', "The file is deleted by the selected changes."));
		}
		return lines.join('\n');
	}

	override dispose(): void {
		this.saveViewState();
		this.hunkDecorations.clear();
		this.diffWidget.setViewModel(undefined);
		super.dispose();
		this.domNode.remove();
	}
}

function getSemanticDiffCounts(input: SemanticDiffEditorInput, files: readonly ISemanticDiffProjectedFile[]): string {
	const visible = files.reduce((sum, file) => sum + file.hunks.length, 0);
	const counts = localize('semanticDiff.counts', "{0} of {1} hunks · {2} of {3} files · Source verified",
		visible, input.hunks.length, files.length, new Set(input.hunks.map(hunk => hunk.fileId)).size);
	return visible ? counts : localize('semanticDiff.noMatches', "No hunks match the selected types. {0}", counts);
}

function formatSemanticDiffComparison(input: SemanticDiffEditorInput): string {
	const report = input.request.report;
	const source = report.analysis.source;
	const comparison = source.comparison === 'commitRange' ? localize('semanticDiff.commitRange', "Commit range")
		: source.comparison === 'staged' ? localize('semanticDiff.staged', "Staged changes")
			: localize('semanticDiff.workingTree', "Working tree");
	return localize('semanticDiff.comparison', "{0} · {1}: {2} → {3} · {4} classification · Classification source: agent-reported",
		source.repositoryLabel, comparison,
		source.baseRevision,
		source.targetRevision ?? '—',
		report.status === 'partial' ? localize('semanticDiff.partial', "Partial") : localize('semanticDiff.complete', "Complete"));
}
