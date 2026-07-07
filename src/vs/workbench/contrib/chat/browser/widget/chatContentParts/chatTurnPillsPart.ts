/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { $ } from '../../../../../../base/browser/dom.js';
import { Disposable } from '../../../../../../base/common/lifecycle.js';
import { autorun, constObservable, derived, derivedOpts, IObservable } from '../../../../../../base/common/observable.js';
import { isEqual } from '../../../../../../base/common/resources.js';
import { URI } from '../../../../../../base/common/uri.js';
import { localize } from '../../../../../../nls.js';
import { ICommandService } from '../../../../../../platform/commands/common/commands.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { IInstantiationService } from '../../../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../../../platform/log/common/log.js';
import { IOpenerService } from '../../../../../../platform/opener/common/opener.js';
import { IEditorService } from '../../../../../services/editor/common/editorService.js';
import { IEditSessionEntryDiff } from '../../../common/editing/chatEditingService.js';
import { IChatRendererContent, IChatTurnPillsPart } from '../../../common/model/chatViewModel.js';
import { MultiDiffEditorInput } from '../../../../multiDiffEditor/browser/multiDiffEditorInput.js';
import { MultiDiffEditorItem } from '../../../../multiDiffEditor/browser/multiDiffSourceResolverService.js';
import { ChatTreeItem } from '../../chat.js';
import { IChatResponseFileChangesService } from '../../chatResponseFileChangesService.js';
import { ChatTurnPillsWidget, diffStatsEqual, EMPTY_DIFF_STATS, IChatTurnPillsModel, IDiffStats, IPreviewFile, observeTurnStatusPillsConfig, openChatPreviewFile, previewFilesEqual, previewKind } from '../chatTurnPills.js';
import { IChatContentPart, IChatContentPartRenderContext } from './chatContentParts.js';

/**
 * Renders the turn's status pills (changes + preview) inside a completed chat
 * response, mirroring the floating pills shown above the input while the turn
 * streams. Fed by the per-request diffs from {@link IChatResponseFileChangesService}
 * (agent host sessions), so it reflects the same authoritative per-turn changes as
 * the "Changed N files" summary. The part self-hides when the turn produced no
 * changes.
 */
export class ChatTurnPillsContentPart extends Disposable implements IChatContentPart {

	readonly domNode: HTMLElement;

	private readonly _diffs: IObservable<readonly IEditSessionEntryDiff[]>;

	constructor(
		private readonly _content: IChatTurnPillsPart,
		_context: IChatContentPartRenderContext,
		@IChatResponseFileChangesService chatResponseFileChangesService: IChatResponseFileChangesService,
		@ICommandService commandService: ICommandService,
		@IOpenerService openerService: IOpenerService,
		@ILogService logService: ILogService,
		@IEditorService private readonly _editorService: IEditorService,
		@IConfigurationService configurationService: IConfigurationService,
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

		const previewFiles = derivedOpts<readonly IPreviewFile[]>({ owner: this, equalsFn: previewFilesEqual }, reader => {
			const created: IPreviewFile[] = [];
			const edited: IPreviewFile[] = [];
			for (const diff of this._diffs.read(reader)) {
				const kind = previewKind(diff.modifiedURI);
				if (!kind) {
					continue;
				}
				// The agent host provider maps a created file's `originalURI` to its
				// `modifiedURI` (there is no before-content), so equal URIs mark a
				// creation. Created files are listed first so the primary preview is
				// the first created file, else the first edited one.
				const isCreated = isEqual(diff.originalURI, diff.modifiedURI);
				(isCreated ? created : edited).push({ uri: diff.modifiedURI, kind, created: isCreated });
			}
			return [...created, ...edited];
		});

		const pillsConfig = observeTurnStatusPillsConfig(configurationService);
		const model: IChatTurnPillsModel = {
			stats,
			previewFiles,
			changesEnabled: derived(reader => pillsConfig.read(reader).changes),
			previewEnabled: derived(reader => pillsConfig.read(reader).preview),
			openChanges: () => this._openChanges(),
			openPreviewFile: file => openChatPreviewFile(file, commandService, openerService, logService),
		};

		const widget = this._register(this._instantiationService.createInstance(ChatTurnPillsWidget, model));
		this.domNode.appendChild(widget.element);

		this._register(autorun(reader => {
			this.domNode.style.display = widget.isVisible.read(reader) ? '' : 'none';
		}));
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

	hasSameContent(other: IChatRendererContent, _followingContent: IChatRendererContent[], _element: ChatTreeItem): boolean {
		return other.kind === 'turnPills'
			&& other.requestId === this._content.requestId
			&& isEqual(other.sessionResource, this._content.sessionResource);
	}
}
