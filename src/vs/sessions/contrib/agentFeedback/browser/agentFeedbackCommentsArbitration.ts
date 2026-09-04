/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { ResourceMap } from '../../../../base/common/map.js';
import { Schemas } from '../../../../base/common/network.js';
import { URI } from '../../../../base/common/uri.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { ICommentInfo, ICommentService } from '../../../../workbench/contrib/comments/browser/commentService.js';

export const AGENT_FEEDBACK_COMMENT_CONTROLLER_ID = 'vscode.agentFeedback';

export const IAgentFeedbackCommentsArbitrationService = createDecorator<IAgentFeedbackCommentsArbitrationService>('agentFeedbackCommentsArbitrationService');

export interface IAgentFeedbackCommentsArbitrationService {
	readonly _serviceBrand: undefined;
	readonly onDidChange: Event<void>;
	resolve(resource: URI): Promise<boolean>;
	usesWorkbenchComments(resource: URI): boolean;
	usesNativeComments(resource: URI): boolean;
}

export class AgentFeedbackCommentsArbitrationService extends Disposable implements IAgentFeedbackCommentsArbitrationService {

	declare readonly _serviceBrand: undefined;

	private readonly _onDidChange = this._register(new Emitter<void>());
	readonly onDidChange = this._onDidChange.event;

	private readonly _resolvedModes = new ResourceMap<boolean>();
	private readonly _pendingResolutions = new ResourceMap<Promise<boolean>>();

	constructor(
		@ICommentService private readonly _commentService: ICommentService,
	) {
		super();

		this._register(Event.any(
			this._commentService.onDidSetDataProvider,
			this._commentService.onDidDeleteDataProvider,
		)(() => this._clearResolvedModes()));
		this._register(this._commentService.onDidUpdateCommentingRanges(event => {
			if (event.uniqueOwner !== AGENT_FEEDBACK_COMMENT_CONTROLLER_ID) {
				this._clearResolvedModes();
			}
		}));
		this._register(this._commentService.onDidUpdateCommentThreads(event => {
			if (event.uniqueOwner === AGENT_FEEDBACK_COMMENT_CONTROLLER_ID) {
				return;
			}

			for (const thread of [...event.added, ...event.changed]) {
				if (thread.resource) {
					this._setMode(URI.parse(thread.resource), true);
				}
			}
			for (const pending of event.pending) {
				this._setMode(pending.uri, true);
			}
			for (const thread of event.removed) {
				if (thread.resource) {
					const resource = URI.parse(thread.resource);
					this._clearResolvedMode(resource);
					void this.resolve(resource);
				}
			}
		}));
		this._register(this._commentService.onDidFetchDocumentComments(event => {
			this._acceptCommentInfos(event.resource, event.commentInfos);
		}));
	}

	usesWorkbenchComments(resource: URI): boolean {
		return this._resolvedModes.get(resource) === true;
	}

	usesNativeComments(resource: URI): boolean {
		return this._resolvedModes.get(resource) === false;
	}

	resolve(resource: URI): Promise<boolean> {
		if (resource.scheme === Schemas.commentsInput) {
			return Promise.resolve(false);
		}

		const resolved = this._resolvedModes.get(resource);
		if (resolved !== undefined) {
			return Promise.resolve(resolved);
		}

		const pending = this._pendingResolutions.get(resource);
		if (pending) {
			return pending;
		}

		const resolution = this._commentService.getDocumentComments(resource)
			.then(() => this.usesWorkbenchComments(resource))
			.finally(() => {
				if (this._pendingResolutions.get(resource) === resolution) {
					this._pendingResolutions.delete(resource);
				}
			});
		this._pendingResolutions.set(resource, resolution);
		return resolution;
	}

	private _acceptCommentInfos(resource: URI, commentInfos: readonly (ICommentInfo | null)[]): void {
		const usesWorkbenchComments = commentInfos.some(info =>
			info !== null
			&& info.uniqueOwner !== AGENT_FEEDBACK_COMMENT_CONTROLLER_ID
			&& this._claimsResource(info));
		this._setMode(resource, usesWorkbenchComments);
	}

	private _setMode(resource: URI, usesWorkbenchComments: boolean): void {
		if (this._resolvedModes.get(resource) === usesWorkbenchComments) {
			return;
		}

		this._resolvedModes.set(resource, usesWorkbenchComments);
		this._onDidChange.fire();
		this._commentService.updateCommentingRanges(AGENT_FEEDBACK_COMMENT_CONTROLLER_ID);
	}

	private _claimsResource(commentInfo: ICommentInfo): boolean {
		return commentInfo.threads.length > 0
			|| (commentInfo.pendingCommentThreads?.length ?? 0) > 0
			|| commentInfo.commentingRanges.ranges.length > 0
			|| commentInfo.commentingRanges.fileComments;
	}

	private _clearResolvedMode(resource: URI): void {
		this._resolvedModes.delete(resource);
		this._pendingResolutions.delete(resource);
		this._onDidChange.fire();
	}

	private _clearResolvedModes(): void {
		this._resolvedModes.clear();
		this._pendingResolutions.clear();
		this._onDidChange.fire();
	}
}
