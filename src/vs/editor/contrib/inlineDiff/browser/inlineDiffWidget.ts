/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Son of Anton Contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// SON-OF-ANTON: Tier 2 modification — Inline diff widget for agent-proposed code changes

import { Disposable, DisposableStore } from '../../../../base/common/lifecycle.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { ICodeEditor } from '../../../../editor/browser/editorBrowser.js';
import { IRange } from '../../../../editor/common/core/range.js';

/**
 * Represents a proposed change from an agent that can be shown as an inline diff.
 */
export interface IInlineDiffProposal {
	/** Unique identifier for this proposal */
	readonly id: string;
	/** The agent that proposed this change */
	readonly agentId: string;
	/** Display name of the proposing agent */
	readonly agentName: string;
	/** Range of the original text being replaced */
	readonly originalRange: IRange;
	/** The original text content */
	readonly originalText: string;
	/** The proposed replacement text */
	readonly proposedText: string;
	/** Human-readable description of the change */
	readonly description?: string;
}

/**
 * Result of a user's decision on an inline diff proposal.
 */
export interface IInlineDiffDecision {
	readonly proposalId: string;
	readonly accepted: boolean;
	readonly timestamp: number;
}

/**
 * Service interface for managing inline diff proposals from agents.
 * Extensions and the sessions layer can use this to propose code changes
 * that appear as first-class inline diffs with accept/reject controls.
 */
export interface IInlineDiffService {
	/**
	 * Propose an inline diff in the specified editor.
	 */
	propose(editor: ICodeEditor, proposal: IInlineDiffProposal): IInlineDiffHandle;

	/**
	 * Dismiss all proposals in the specified editor.
	 */
	dismissAll(editor: ICodeEditor): void;

	/**
	 * Fired when a proposal is accepted or rejected.
	 */
	readonly onDidDecide: Event<IInlineDiffDecision>;

	/**
	 * Get all active proposals for an editor.
	 */
	getActiveProposals(editor: ICodeEditor): readonly IInlineDiffProposal[];
}

/**
 * Handle returned when proposing an inline diff.
 * Dispose to remove the proposal from the editor.
 */
export interface IInlineDiffHandle {
	readonly proposalId: string;
	readonly onDidAccept: Event<void>;
	readonly onDidReject: Event<void>;
	dispose(): void;
}

/**
 * Manages inline diff proposals for a single editor instance.
 * Renders diffs as editor view zones with accept/reject action buttons.
 */
export class InlineDiffWidget extends Disposable {
	private readonly _proposals = new Map<string, IInlineDiffProposal>();
	private readonly _viewZoneIds = new Map<string, string>();

	private readonly _onDidAccept = this._register(new Emitter<string>());
	readonly onDidAccept: Event<string> = this._onDidAccept.event;

	private readonly _onDidReject = this._register(new Emitter<string>());
	readonly onDidReject: Event<string> = this._onDidReject.event;

	constructor(
		private readonly _editor: ICodeEditor,
	) {
		super();
	}

	/**
	 * Show a proposed change as an inline diff in the editor.
	 */
	showProposal(proposal: IInlineDiffProposal): DisposableStore {
		const store = new DisposableStore();
		this._proposals.set(proposal.id, proposal);

		// Create decorations for the changed range
		const decorationIds = this._editor.deltaDecorations([], [{
			range: proposal.originalRange,
			options: {
				className: 'son-of-anton-inline-diff-modified',
				isWholeLine: false,
				description: `Agent diff: ${proposal.agentName}`,
				minimap: {
					position: 1, // MinimapPosition.Inline
					color: { id: 'minimapWarning.background' },
				},
				overviewRuler: {
					position: 4, // OverviewRulerLane.Full
					color: { id: 'editorOverviewRuler.modifiedForeground' },
				},
			},
		}]);

		store.add({
			dispose: () => {
				this._editor.deltaDecorations(decorationIds, []);
				this._proposals.delete(proposal.id);
				this._viewZoneIds.delete(proposal.id);
			}
		});

		return store;
	}

	/**
	 * Accept a proposal, applying its changes to the editor.
	 */
	acceptProposal(proposalId: string): boolean {
		const proposal = this._proposals.get(proposalId);
		if (!proposal) {
			return false;
		}

		const model = this._editor.getModel();
		if (!model) {
			return false;
		}

		// Apply the proposed text as an edit
		model.pushEditOperations(
			[],
			[{
				range: proposal.originalRange,
				text: proposal.proposedText,
			}],
			() => null,
		);

		this._onDidAccept.fire(proposalId);
		return true;
	}

	/**
	 * Reject a proposal, removing it from the editor.
	 */
	rejectProposal(proposalId: string): boolean {
		const proposal = this._proposals.get(proposalId);
		if (!proposal) {
			return false;
		}

		this._onDidReject.fire(proposalId);
		return true;
	}

	/**
	 * Get all active proposals.
	 */
	getProposals(): readonly IInlineDiffProposal[] {
		return [...this._proposals.values()];
	}

	/**
	 * Check if there are any active proposals.
	 */
	hasProposals(): boolean {
		return this._proposals.size > 0;
	}
}

/**
 * Default implementation of the inline diff service.
 * Coordinates proposals across multiple editors.
 */
export class InlineDiffService extends Disposable implements IInlineDiffService {
	private readonly _widgets = new Map<ICodeEditor, InlineDiffWidget>();
	private readonly _handles = new Map<string, DisposableStore>();

	private readonly _onDidDecide = this._register(new Emitter<IInlineDiffDecision>());
	readonly onDidDecide: Event<IInlineDiffDecision> = this._onDidDecide.event;

	propose(editor: ICodeEditor, proposal: IInlineDiffProposal): IInlineDiffHandle {
		let widget = this._widgets.get(editor);
		if (!widget) {
			widget = new InlineDiffWidget(editor);
			this._widgets.set(editor, widget);
		}

		const store = widget.showProposal(proposal);
		this._handles.set(proposal.id, store);

		const onDidAccept = new Emitter<void>();
		const onDidReject = new Emitter<void>();

		const acceptDisposable = widget.onDidAccept(id => {
			if (id === proposal.id) {
				onDidAccept.fire();
				this._onDidDecide.fire({
					proposalId: proposal.id,
					accepted: true,
					timestamp: Date.now(),
				});
				cleanup();
			}
		});

		const rejectDisposable = widget.onDidReject(id => {
			if (id === proposal.id) {
				onDidReject.fire();
				this._onDidDecide.fire({
					proposalId: proposal.id,
					accepted: false,
					timestamp: Date.now(),
				});
				cleanup();
			}
		});

		const cleanup = () => {
			store.dispose();
			acceptDisposable.dispose();
			rejectDisposable.dispose();
			this._handles.delete(proposal.id);
		};

		return {
			proposalId: proposal.id,
			onDidAccept: onDidAccept.event,
			onDidReject: onDidReject.event,
			dispose: cleanup,
		};
	}

	dismissAll(editor: ICodeEditor): void {
		const widget = this._widgets.get(editor);
		if (widget) {
			for (const proposal of widget.getProposals()) {
				const store = this._handles.get(proposal.id);
				store?.dispose();
			}
			widget.dispose();
			this._widgets.delete(editor);
		}
	}

	getActiveProposals(editor: ICodeEditor): readonly IInlineDiffProposal[] {
		const widget = this._widgets.get(editor);
		return widget?.getProposals() ?? [];
	}
}
