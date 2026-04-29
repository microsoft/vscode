/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, DisposableStore } from '../../../../base/common/lifecycle.js';
import { ResourceMap } from '../../../../base/common/map.js';
import { autorun } from '../../../../base/common/observable.js';
import { URI, UriComponents } from '../../../../base/common/uri.js';
import { CommandsRegistry } from '../../../../platform/commands/common/commands.js';
import { AnnotatedDocument, IAnnotatedDocuments } from './helpers/annotatedDocuments.js';
import { createDocWithJustReason } from './helpers/documentWithAnnotatedEdits.js';
import { DocumentEditSourceTracker } from './telemetry/editTracker.js';

export type AiContributionLevel = 'chatAndAgent' | 'all';

interface TrackerEntry {
	readonly trackerStore: DisposableStore;
	readonly tracker: DocumentEditSourceTracker;
}

/**
 * Tracks AI-generated edits across open documents using the edit telemetry pipeline.
 */
export class AiContributionFeature extends Disposable {

	private readonly _trackers = new ResourceMap<TrackerEntry>();
	private readonly _documentsByUri = new ResourceMap<AnnotatedDocument>();

	constructor(
		annotatedDocuments: IAnnotatedDocuments,
	) {
		super();

		this._register(autorun(reader => {
			const docs = annotatedDocuments.documents.read(reader);
			const activeUris = new ResourceMap<boolean>();

			for (const doc of docs) {
				const uri = doc.document.uri;
				activeUris.set(uri, true);
				this._documentsByUri.set(uri, doc);

				if (!this._trackers.has(uri)) {
					this._trackers.set(uri, this._createTrackerEntry(doc));
				}
			}

			for (const [uri, entry] of this._trackers) {
				if (!activeUris.has(uri)) {
					entry.trackerStore.dispose();
					this._trackers.delete(uri);
					this._documentsByUri.delete(uri);
				}
			}
		}));

		this._register(CommandsRegistry.registerCommand('_aiEdits.hasAiContributions', (_accessor, resources: UriComponents[], level: AiContributionLevel) => {
			return this._hasAiContributions(resources, level);
		}));

		this._register(CommandsRegistry.registerCommand('_aiEdits.clearAiContributions', (_accessor, resources: UriComponents[]) => {
			this._clearAiContributions(resources);
		}));

		this._register(CommandsRegistry.registerCommand('_aiEdits.clearAllAiContributions', () => {
			this._clearAiContributions();
		}));
	}

	override dispose(): void {
		for (const [, entry] of this._trackers) {
			entry.trackerStore.dispose();
		}
		super.dispose();
	}

	private _createTrackerEntry(doc: AnnotatedDocument): TrackerEntry {
		const trackerStore = new DisposableStore();
		const docWithJustReason = createDocWithJustReason(doc.documentWithAnnotations, trackerStore);
		const tracker = trackerStore.add(new DocumentEditSourceTracker(docWithJustReason, undefined));
		return { trackerStore, tracker };
	}

	private _hasAiContributions(resources: UriComponents[], level: AiContributionLevel): boolean {
		for (const resource of resources) {
			const entry = this._trackers.get(URI.revive(resource));
			if (entry) {
				for (const edit of entry.tracker.getTrackedRanges()) {
					if (edit.source.category === 'ai' && (level === 'all' || edit.source.feature === 'chat')) {
						return true;
					}
				}
			}
		}
		return false;
	}

	private _clearAiContributions(resources?: UriComponents[]): void {
		const uris = resources ? resources.map(r => URI.revive(r)) : [...this._trackers.keys()];
		for (const uri of uris) {
			const entry = this._trackers.get(uri);
			if (entry) {
				entry.trackerStore.dispose();
				const doc = this._documentsByUri.get(uri);
				if (doc) {
					this._trackers.set(uri, this._createTrackerEntry(doc));
				} else {
					this._trackers.delete(uri);
					this._documentsByUri.delete(uri);
				}
			}
		}
	}
}
