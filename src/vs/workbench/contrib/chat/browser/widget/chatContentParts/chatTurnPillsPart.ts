/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../../base/browser/dom.js';
import { $ } from '../../../../../../base/browser/dom.js';
import { IAction, toAction } from '../../../../../../base/common/actions.js';
import { Codicon } from '../../../../../../base/common/codicons.js';
import { combinedDisposable, Disposable, IDisposable } from '../../../../../../base/common/lifecycle.js';
import { autorun, constObservable, derived, derivedOpts, IObservable } from '../../../../../../base/common/observable.js';
import { basename, getComparisonKey, isEqual } from '../../../../../../base/common/resources.js';
import { ThemeIcon } from '../../../../../../base/common/themables.js';
import { URI } from '../../../../../../base/common/uri.js';
import { localize, localize2 } from '../../../../../../nls.js';
import { ICommandService } from '../../../../../../platform/commands/common/commands.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { FileKind } from '../../../../../../platform/files/common/files.js';
import { IHoverService } from '../../../../../../platform/hover/browser/hover.js';
import { IInstantiationService } from '../../../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../../../platform/log/common/log.js';
import { IOpenerService } from '../../../../../../platform/opener/common/opener.js';
import { IThemeService } from '../../../../../../platform/theme/common/themeService.js';
import { DEFAULT_LABELS_CONTAINER, ResourceLabels } from '../../../../../browser/labels.js';
import { IEditorService } from '../../../../../services/editor/common/editorService.js';
import { createFileIconThemableTreeContainerScope } from '../../../../files/browser/views/explorerView.js';
import { MultiDiffEditorInput } from '../../../../multiDiffEditor/browser/multiDiffEditorInput.js';
import { MultiDiffEditorItem } from '../../../../multiDiffEditor/browser/multiDiffSourceResolverService.js';
import { IEditSessionEntryDiff } from '../../../common/editing/chatEditingService.js';
import { IChatRendererContent, IChatTurnPillsPart } from '../../../common/model/chatViewModel.js';
import { ChatTreeItem } from '../../chat.js';
import { IChatResponseFileChangesService } from '../../chatResponseFileChangesService.js';
import { diffStatsEqual, EMPTY_DIFF_STATS, IDiffStats, IPreviewFile, observeTurnStatusPillsEnabled, openChatPreviewFile, previewFilesEqual, previewKind } from '../chatTurnPills.js';
import { renderChangesSummaryFileList } from './chatChangesSummaryPart.js';
import { ChatCollapsibleContentPart } from './chatCollapsibleContentPart.js';
import { IChatContentPart, IChatContentPartRenderContext } from './chatContentParts.js';

/**
 * Renders a single agent turn's changes as a checkpoint-style summary: a
 * `N files changed +ins -del` header with a "View All File Changes" action, an
 * optional inline resource-label action for the first previewable file the turn
 * produced, and a disclosure that expands to the list of changed files. Preview
 * candidates prefer the turn's file-edit stream so files outside the workspace
 * can appear.
 */
export class ChatTurnPillsContentPart extends Disposable implements IChatContentPart {

	readonly domNode: HTMLElement;

	private readonly _diffs: IObservable<readonly IEditSessionEntryDiff[]>;

	constructor(
		private readonly _content: IChatTurnPillsPart,
		_context: IChatContentPartRenderContext,
		@IChatResponseFileChangesService chatResponseFileChangesService: IChatResponseFileChangesService,
		@ICommandService private readonly _commandService: ICommandService,
		@IOpenerService private readonly _openerService: IOpenerService,
		@ILogService private readonly _logService: ILogService,
		@IHoverService private readonly _hoverService: IHoverService,
		@IEditorService private readonly _editorService: IEditorService,
		@IConfigurationService configurationService: IConfigurationService,
		@IThemeService themeService: IThemeService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
	) {
		super();

		this.domNode = $('.chat-turn-pills-part');

		this._diffs = chatResponseFileChangesService.getChangesForRequest(_content.sessionResource, _content.requestId) ?? constObservable([]);

		const stats = derivedOpts<IDiffStats>({ owner: this, equalsFn: diffStatsEqual }, reader => {
			const diffs = this._diffs.read(reader);
			if (diffs.length === 0) {
				return EMPTY_DIFF_STATS;
			}
			let insertions = 0, deletions = 0;
			for (const diff of diffs) {
				insertions += diff.added;
				deletions += diff.removed;
			}
			return { files: diffs.length, insertions, deletions };
		});

		const previewDiffs = chatResponseFileChangesService.getFileEditsForRequest?.(_content.sessionResource, _content.requestId) ?? this._diffs;
		const previewFiles = derivedOpts<readonly IPreviewFile[]>({ owner: this, equalsFn: previewFilesEqual }, reader => {
			const created: IPreviewFile[] = [];
			const edited: IPreviewFile[] = [];
			const seen = new Set<string>();
			const addDiffs = (diffs: readonly IEditSessionEntryDiff[]) => {
				for (const diff of diffs) {
					const kind = previewKind(diff.modifiedURI);
					if (!kind) {
						continue;
					}
					const key = getComparisonKey(diff.modifiedURI);
					if (seen.has(key)) {
						continue;
					}
					seen.add(key);
					// The agent host provider maps a created file's `originalURI` to its
					// `modifiedURI` (there is no before-content), so equal URIs mark a
					// creation. Created files are listed first so the primary preview is
					// the first created file, else the first edited one.
					const isCreated = isEqual(diff.originalURI, diff.modifiedURI);
					(isCreated ? created : edited).push({ uri: diff.modifiedURI, kind, created: isCreated });
				}
			};
			addDiffs(previewDiffs.read(reader));
			addDiffs(this._diffs.read(reader));
			return [...created, ...edited];
		});

		const turnStatusPillsEnabled = observeTurnStatusPillsEnabled(configurationService);
		const changesEnabled = derived(this, reader => turnStatusPillsEnabled.read(reader));
		const previewEnabled = derived(this, reader => turnStatusPillsEnabled.read(reader));
		const showChanges = derived(this, reader => changesEnabled.read(reader) && stats.read(reader).files > 0);
		const showPreview = derived(this, reader => previewEnabled.read(reader) && previewFiles.read(reader).length > 0);

		// Reuse the checkpoint summary's structure and classes so the two look
		// identical. `show-file-icons` (added by the themable tree scope below)
		// lets the preview action's resource label render the file's themed icon.
		const root = this.domNode.appendChild($('.checkpoint-file-changes-summary.checkpoint-file-changes-compact'));
		this._register(createFileIconThemableTreeContainerScope(root, themeService));

		const details = root.appendChild(document.createElement('details'));
		details.classList.add('checkpoint-file-changes-disclosure');
		const header = details.appendChild(document.createElement('summary'));
		header.classList.add('checkpoint-file-changes-summary-header');

		const resourceLabels = this._register(this._instantiationService.createInstance(ResourceLabels, DEFAULT_LABELS_CONTAINER));

		this._register(this._renderChangesHeader(header, stats, showChanges));
		this._register(this._renderPreviewAction(header, previewFiles, showPreview, resourceLabels));
		this._register(this._renderChevron(header, details, showChanges));
		this._register(dom.addDisposableListener(header, 'click', () => {
			root.dispatchEvent(new CustomEvent(ChatCollapsibleContentPart.userToggleEvent, { bubbles: true }));
		}));

		// Only feed diffs into the list when the changes summary is shown, so the
		// disclosure stays empty when just the preview action is enabled. Each
		// previewable row gets a "Preview" action that opens the file's preview.
		const listDiffs = derived(this, reader => showChanges.read(reader) ? this._diffs.read(reader) : []);
		this._register(renderChangesSummaryFileList(details, listDiffs, this._instantiationService, this._editorService, configurationService, {
			getRowActions: diff => this._getRowActions(diff),
		}));

		this._register(autorun(reader => {
			this.domNode.style.display = (showChanges.read(reader) || showPreview.read(reader)) ? '' : 'none';
		}));
	}

	private _renderChangesHeader(header: HTMLElement, stats: IObservable<IDiffStats>, showChanges: IObservable<boolean>): IDisposable {
		const filesLabel = header.appendChild($('span.chat-file-changes-label'));
		const counts = header.appendChild(document.createElement('button'));
		counts.classList.add('chat-file-changes-counts');
		counts.type = 'button';
		const addedLabel = counts.appendChild($('span.insertions'));
		const removedLabel = counts.appendChild($('span.deletions'));

		const hoverDisposable = this._hoverService.setupDelayedHover(counts, () => ({
			content: localize2('chat.viewTurnFileChangesSummary', 'View All File Changes')
		}));
		const clickDisposable = dom.addDisposableListener(counts, 'click', (e) => {
			this._openChanges();
			dom.EventHelper.stop(e, true);
		});

		return combinedDisposable(hoverDisposable, clickDisposable, autorun(reader => {
			const { files, insertions, deletions } = stats.read(reader);
			const fileCountLabel = files === 1
				? localize('chat.turnChanges.oneFile', '1 file changed')
				: localize('chat.turnChanges.manyFiles', '{0} files changed', files);
			filesLabel.textContent = fileCountLabel;
			addedLabel.textContent = `+${insertions}`;
			removedLabel.textContent = `-${deletions}`;
			counts.setAttribute('aria-label', localize(
				'chat.turnChanges.viewAllAccessible',
				'View all file changes, {0} lines added, {1} lines deleted',
				insertions,
				deletions
			));
			header.setAttribute('aria-label', localize(
				'chat.turnChanges.accessibleSummary',
				'{0}, {1} lines added, {2} lines deleted',
				fileCountLabel,
				insertions,
				deletions
			));

			const show = showChanges.read(reader);
			filesLabel.classList.toggle('hidden', !show);
			counts.classList.toggle('hidden', !show);
		}));
	}

	private _renderPreviewAction(header: HTMLElement, previewFiles: IObservable<readonly IPreviewFile[]>, showPreview: IObservable<boolean>, resourceLabels: ResourceLabels): IDisposable {
		const container = header.appendChild($('.chat-turn-preview'));
		container.appendChild($('span.chat-turn-preview-separator', { 'aria-hidden': 'true' }));

		const button = container.appendChild(document.createElement('button'));
		button.classList.add('chat-turn-preview-action');
		button.type = 'button';
		const label = this._register(resourceLabels.create(button));

		const clickDisposable = dom.addDisposableListener(button, 'click', (e) => {
			this._openPrimaryPreview(previewFiles.get());
			dom.EventHelper.stop(e, true);
		});

		return combinedDisposable(clickDisposable, autorun(reader => {
			const files = previewFiles.read(reader);
			const primaryFile = files.at(0);
			if (primaryFile) {
				label.setResource(
					{ resource: primaryFile.uri, name: basename(primaryFile.uri) },
					{ fileKind: FileKind.FILE },
				);
				const tooltip = localize('chat.turnPreview.tooltip', 'Open Preview: {0}', basename(primaryFile.uri));
				button.setAttribute('aria-label', tooltip);
				button.title = tooltip;
			}
			container.classList.toggle('hidden', !showPreview.read(reader));
		}));
	}

	private _renderChevron(header: HTMLElement, details: HTMLDetailsElement, showChanges: IObservable<boolean>): IDisposable {
		const chevron = header.appendChild($('span.chat-file-changes-chevron.chat-collapsible-hover-chevron', { 'aria-hidden': 'true' }));
		chevron.classList.add(...ThemeIcon.asClassNameArray(Codicon.chevronRight));

		const setExpansionState = () => {
			header.setAttribute('aria-expanded', String(details.open));
			chevron.classList.toggle('expanded', details.open);
		};
		setExpansionState();

		return combinedDisposable(
			dom.addDisposableListener(details, 'toggle', setExpansionState),
			autorun(reader => {
				chevron.classList.toggle('hidden', !showChanges.read(reader));
			}),
		);
	}

	private _openChanges(): void {
		const diffs = this._diffs.get();
		if (diffs.length === 0) {
			return;
		}
		const source = URI.parse(`multi-diff-editor:${Date.now().toString()}-${Math.random().toString(36).slice(2)}`);
		const input = this._instantiationService.createInstance(
			MultiDiffEditorInput,
			source,
			localize('chatTurnPills.changes.title', "Turn File Changes"),
			diffs.map(diff => new MultiDiffEditorItem(diff.originalURI, diff.modifiedURI, undefined)),
			false,
		);
		this._editorService.openEditor(input);
	}

	private _openPrimaryPreview(files: readonly IPreviewFile[]): void {
		const primaryFile = files.at(0);
		if (primaryFile) {
			openChatPreviewFile(primaryFile, this._commandService, this._openerService, this._logService);
		}
	}

	/**
	 * Row actions for the changed-files list: markdown files get a labelless-
	 * icon-free "Preview" action that opens the file as a markdown preview.
	 */
	private _getRowActions(diff: IEditSessionEntryDiff): IAction[] {
		const kind = previewKind(diff.modifiedURI);
		if (!kind) {
			return [];
		}
		const file: IPreviewFile = { uri: diff.modifiedURI, kind, created: isEqual(diff.originalURI, diff.modifiedURI) };
		return [toAction({
			id: 'chat.turnChanges.previewFile',
			label: localize('chat.turnChanges.preview', "Preview"),
			run: () => openChatPreviewFile(file, this._commandService, this._openerService, this._logService),
		})];
	}

	hasSameContent(other: IChatRendererContent, _followingContent: IChatRendererContent[], _element: ChatTreeItem): boolean {
		return other.kind === 'turnPills'
			&& other.requestId === this._content.requestId
			&& isEqual(other.sessionResource, this._content.sessionResource);
	}
}
