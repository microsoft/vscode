/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { TelemetryReporter } from '../telemetryReporter';
import { generateUuid } from '../util/uuid';
import type { MarkdownDocumentFeatures } from './markdownDocumentFeatures';

export type MarkdownEditorMode = 'read' | 'edit';

/**
 * Why a session ended. Closing the editor and switching it to another editor type both
 * dispose the webview panel and cannot be told apart, so both are `closed`.
 */
export type MarkdownEditorSessionEnd = 'closed' | 'shutdown';

export interface MarkdownEditorViewState {
	readonly visible: boolean;
	/** The panel is the active editor and the window has focus. */
	readonly focused: boolean;
}

export interface MarkdownEditorSessionStart {
	readonly scheme: string;
	readonly textLength: number;
	readonly mode: MarkdownEditorMode;
	readonly viewState: MarkdownEditorViewState;
}

/**
 * Accounts the usage of one Markdown editor (one webview panel) and reports it as a
 * `markdownEditor.session` summary when the session ends, plus a `markdownEditor.modeChanged`
 * event per mode switch. Reports no content, file names or paths.
 */
export class MarkdownEditorSessionTelemetry {

	readonly #sessionId = generateUuid();
	readonly #openedAt: number;
	readonly #scheme: string;
	readonly #sizeBucket: string;
	readonly #initialMode: MarkdownEditorMode;
	#mode: MarkdownEditorMode;
	#modeSwitches = 0;
	#editCount = 0;
	#firstEditMs = -1;
	readonly #visible = new DurationAccumulator();
	readonly #focused = new DurationAccumulator();
	readonly #reporter: TelemetryReporter;
	readonly #now: () => number;
	#untitledDocumentId: string | undefined;
	#documentFeatures: MarkdownDocumentFeatures | undefined;
	#ended = false;

	constructor(
		reporter: TelemetryReporter,
		start: MarkdownEditorSessionStart,
		now: () => number = Date.now,
	) {
		this.#reporter = reporter;
		this.#now = now;
		this.#openedAt = now();
		this.#scheme = start.scheme === 'file' || start.scheme === 'untitled' ? start.scheme : 'other';
		this.#sizeBucket = getSizeBucket(start.textLength);
		this.#initialMode = this.#mode = start.mode;
		this.setViewState(start.viewState);
	}

	setUntitledDocumentId(untitledDocumentId: string | undefined): void {
		this.#untitledDocumentId = untitledDocumentId;
	}

	/** The constructs the document used when it was opened. Not reported for documents too large to scan. */
	setDocumentFeatures(features: MarkdownDocumentFeatures): void {
		this.#documentFeatures = features;
	}

	setMode(mode: MarkdownEditorMode): void {
		if (this.#ended || mode === this.#mode) {
			return;
		}
		this.#mode = mode;
		this.#modeSwitches++;
		/* __GDPR__
			"markdownEditor.modeChanged" : {
				"owner": "hediet",
				"comment": "Sent when the user switches a Markdown editor between reading and editing.",
				"sessionId": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Random id of the Markdown editor session, to correlate with markdownEditor.session." },
				"to": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "The new mode: read or edit." },
				"msSinceOpen": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "comment": "Milliseconds since the editor was opened." }
			}
		*/
		this.#reporter.sendTelemetryEvent('markdownEditor.modeChanged', {
			sessionId: this.#sessionId,
			to: mode,
		}, {
			msSinceOpen: this.#now() - this.#openedAt,
		});
	}

	/** Records a document change made through this editor's webview. */
	recordEdit(): void {
		if (this.#ended) {
			return;
		}
		if (this.#editCount === 0) {
			this.#firstEditMs = this.#now() - this.#openedAt;
		}
		this.#editCount++;
	}

	setViewState(viewState: MarkdownEditorViewState): void {
		if (this.#ended) {
			return;
		}
		const now = this.#now();
		this.#visible.set(viewState.visible, now);
		this.#focused.set(viewState.visible && viewState.focused, now);
	}

	end(ended: MarkdownEditorSessionEnd): void {
		if (this.#ended) {
			return;
		}
		const now = this.#now();
		this.#ended = true;
		/* __GDPR__
			"markdownEditor.session" : {
				"owner": "hediet",
				"comment": "Summary of one Markdown editor session (from opening the editor until it is closed or the window shuts down), to understand whether and how the Markdown editor is used.",
				"sessionId": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Random id of the Markdown editor session." },
				"scheme": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "The document scheme: file, untitled or other." },
				"sizeBucket": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Document length in characters when opened: 0, <1k, <10k, <100k or >=100k." },
				"initialMode": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "The mode the editor opened in: read or edit." },
				"finalMode": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "The mode when the session ended: read or edit." },
				"ended": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "How the session ended: closed (editor closed or reopened with another editor) or shutdown (window closed or reloaded, or extension deactivated)." },
				"untitledDocumentId": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "The untitledDocumentId of the untitledDocument events, if the document was untitled when opened." },
				"hasMermaid": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Whether the document had a Mermaid code block when opened. Absent for documents of 100k characters or more." },
				"hasMath": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Whether the document had math (math blocks or inline math) when opened. Absent for large documents." },
				"hasHtmlBlock": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Whether the document had a line starting with an HTML tag when opened. Absent for large documents." },
				"hasFrontMatter": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Whether the document started with front matter when opened. Absent for large documents." },
				"hasTable": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Whether the document had a table when opened. Absent for large documents." },
				"hasFootnote": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Whether the document had a footnote definition when opened. Absent for large documents." },
				"hasTaskList": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Whether the document had a task list item when opened. Absent for large documents." },
				"headingCountBucket": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Number of headings when opened: 0, 1-5, 6-20 or >20. Absent for large documents." },
				"modeSwitches": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "comment": "How often the user switched between reading and editing." },
				"editCount": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "comment": "Number of document changes made through this editor (not through other editors of the document)." },
				"firstEditMs": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "comment": "Milliseconds from opening to the first change made through this editor, or -1 if there was none." },
				"visibleMs": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "comment": "Milliseconds the editor was visible." },
				"focusedMs": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "comment": "Milliseconds the editor was visible, the active editor and in a focused window." },
				"lifetimeMs": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "comment": "Milliseconds from opening to the end of the session." }
			}
		*/
		this.#reporter.sendTelemetryEvent('markdownEditor.session', {
			sessionId: this.#sessionId,
			scheme: this.#scheme,
			sizeBucket: this.#sizeBucket,
			initialMode: this.#initialMode,
			finalMode: this.#mode,
			ended,
			...(this.#untitledDocumentId ? { untitledDocumentId: this.#untitledDocumentId } : {}),
			...(this.#documentFeatures ? featureProperties(this.#documentFeatures) : {}),
		}, {
			modeSwitches: this.#modeSwitches,
			editCount: this.#editCount,
			firstEditMs: this.#firstEditMs,
			visibleMs: this.#visible.total(now),
			focusedMs: this.#focused.total(now),
			lifetimeMs: now - this.#openedAt,
		});
	}
}

class DurationAccumulator {
	#total = 0;
	#since: number | undefined;

	set(on: boolean, now: number): void {
		if (on && this.#since === undefined) {
			this.#since = now;
		} else if (!on && this.#since !== undefined) {
			this.#total += now - this.#since;
			this.#since = undefined;
		}
	}

	total(now: number): number {
		return this.#total + (this.#since === undefined ? 0 : now - this.#since);
	}
}

function featureProperties(features: MarkdownDocumentFeatures): Record<string, string> {
	return {
		hasMermaid: String(features.hasMermaid),
		hasMath: String(features.hasMath),
		hasHtmlBlock: String(features.hasHtmlBlock),
		hasFrontMatter: String(features.hasFrontMatter),
		hasTable: String(features.hasTable),
		hasFootnote: String(features.hasFootnote),
		hasTaskList: String(features.hasTaskList),
		headingCountBucket: features.headingCountBucket,
	};
}

function getSizeBucket(textLength: number): string {
	if (textLength === 0) {
		return '0';
	} else if (textLength < 1_000) {
		return '<1k';
	} else if (textLength < 10_000) {
		return '<10k';
	} else if (textLength < 100_000) {
		return '<100k';
	}
	return '>=100k';
}
