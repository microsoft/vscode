/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../../base/browser/dom.js';
import { $ } from '../../../../../../base/browser/dom.js';
import { Codicon } from '../../../../../../base/common/codicons.js';
import { combinedDisposable, Disposable, IDisposable } from '../../../../../../base/common/lifecycle.js';
import { autorun, constObservable, derived, derivedObservableWithCache, IObservable } from '../../../../../../base/common/observable.js';
import { isEqual } from '../../../../../../base/common/resources.js';
import { ThemeIcon } from '../../../../../../base/common/themables.js';
import { localize, localize2 } from '../../../../../../nls.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { IHoverService } from '../../../../../../platform/hover/browser/hover.js';
import { IInstantiationService } from '../../../../../../platform/instantiation/common/instantiation.js';
import { IEditorService } from '../../../../../services/editor/common/editorService.js';
import { IEditSessionEntryDiff } from '../../../common/editing/chatEditingService.js';
import { IChatRendererContent, IChatTurnPillsPart } from '../../../common/model/chatViewModel.js';
import { ChatTreeItem } from '../../chat.js';
import { IChatResponseFileChangesService } from '../../chatResponseFileChangesService.js';
import { EMPTY_DIFF_STATS, IDiffStats, observeTurnStatusPillsEnabled } from '../chatTurnPills.js';
import { renderChangesSummaryFileList } from './chatChangesSummaryPart.js';
import { ChatCollapsibleContentPart } from './chatCollapsibleContentPart.js';
import { IChatContentPart, IChatContentPartRenderContext } from './chatContentParts.js';

/**
 * Renders a single agent turn's changes as a checkpoint-style summary: a
 * `N files changed +ins -del` header, where the counts open the changes and the
 * rest of the header is a disclosure that expands to the list of changed files.
 */
export class ChatTurnPillsContentPart extends Disposable implements IChatContentPart {

	readonly domNode: HTMLElement;

	private readonly _diffs: IObservable<readonly IEditSessionEntryDiff[]>;

	constructor(
		private readonly _content: IChatTurnPillsPart,
		_context: IChatContentPartRenderContext,
		@IChatResponseFileChangesService private readonly _chatResponseFileChangesService: IChatResponseFileChangesService,
		@IHoverService private readonly _hoverService: IHoverService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@IEditorService private readonly _editorService: IEditorService,
	) {
		super();

		this.domNode = $('.chat-turn-pills-part');

		const providedDiffs = this._chatResponseFileChangesService.getChangesForRequest(_content.sessionResource, _content.requestId) ?? constObservable([]);
		// The provider observable is rebuilt on reconnect and starts out empty, so
		// keep the last non-empty result rather than dropping a rendered summary.
		this._diffs = derivedObservableWithCache<readonly IEditSessionEntryDiff[]>(this, (reader, lastValue) => {
			const diffs = providedDiffs.read(reader);
			return diffs.length > 0 ? diffs : (lastValue ?? diffs);
		});

		const providedStats = this._chatResponseFileChangesService.getChangeStatsForRequest?.(
			_content.sessionResource,
			_content.requestId,
			{ isLastTurn: _content.isLastTurn },
		);
		const stats = derivedObservableWithCache<IDiffStats>(this, (reader, lastValue) => {
			if (providedStats) {
				return providedStats.read(reader);
			}
			const diffs = this._diffs.read(reader);
			if (diffs.length === 0) {
				return lastValue ?? EMPTY_DIFF_STATS;
			}
			let insertions = 0, deletions = 0;
			for (const diff of diffs) {
				insertions += diff.added;
				deletions += diff.removed;
			}
			return { files: diffs.length, insertions, deletions };
		});

		const turnStatusPillsEnabled = observeTurnStatusPillsEnabled(this._configurationService);
		const changesEnabled = derived(this, reader => turnStatusPillsEnabled.read(reader));
		const showChanges = derived(this, reader => changesEnabled.read(reader) && stats.read(reader).files > 0);

		const root = this.domNode.appendChild($('.checkpoint-file-changes-summary.checkpoint-file-changes-compact'));
		const details = root.appendChild(document.createElement('details'));
		details.classList.add('checkpoint-file-changes-disclosure');
		const header = details.appendChild(document.createElement('summary'));
		header.classList.add('checkpoint-file-changes-summary-header');

		this._register(this._renderChangesHeader(header, stats));
		this._register(this._renderChevron(header, details));
		this._register(dom.addDisposableListener(header, 'click', () => {
			this.domNode.dispatchEvent(new CustomEvent(ChatCollapsibleContentPart.userToggleEvent, { bubbles: true }));
		}));
		this._register(renderChangesSummaryFileList(details, this._diffs, this._instantiationService, this._editorService, this._configurationService));

		this._register(autorun(reader => {
			this.domNode.style.display = showChanges.read(reader) ? '' : 'none';
		}));
	}

	private _renderChangesHeader(header: HTMLElement, stats: IObservable<IDiffStats>): IDisposable {
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
				'View all file changes: {0}, {1} lines added, {2} lines deleted',
				fileCountLabel,
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
		}));
	}

	private _renderChevron(header: HTMLElement, details: HTMLDetailsElement): IDisposable {
		const chevron = header.appendChild($('span.chat-file-changes-chevron.chat-collapsible-hover-chevron', { 'aria-hidden': 'true' }));
		chevron.classList.add(...ThemeIcon.asClassNameArray(Codicon.chevronRightCompact));

		const setExpansionState = () => {
			header.setAttribute('aria-expanded', String(details.open));
			chevron.classList.toggle('expanded', details.open);
		};
		setExpansionState();

		return dom.addDisposableListener(details, 'toggle', setExpansionState);
	}

	private _openChanges(): void {
		this._chatResponseFileChangesService.openChangesForRequest(
			this._content.sessionResource,
			this._content.requestId,
			{ isLastTurn: this._content.isLastTurn },
		);
	}

	hasSameContent(other: IChatRendererContent, _followingContent: IChatRendererContent[], _element: ChatTreeItem): boolean {
		return other.kind === 'turnPills'
			&& other.requestId === this._content.requestId
			&& isEqual(other.sessionResource, this._content.sessionResource)
			&& other.isLastTurn === this._content.isLastTurn;
	}
}
