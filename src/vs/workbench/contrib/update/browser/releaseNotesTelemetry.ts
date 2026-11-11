/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { Schemas } from '../../../../base/common/network.js';
import { URI } from '../../../../base/common/uri.js';
import { ITelemetryService, TelemetryLevel } from '../../../../platform/telemetry/common/telemetry.js';

export type ReleaseNotesSource = 'automaticUpdate' | 'command' | 'updateMenu' | 'postUpdateWidget' | 'other';
type ContentKind = 'section' | 'note' | 'highlights' | 'highlight';
type Reason = 'periodic' | 'hidden' | 'blur' | 'idle' | 'contentExit' | 'qualified' | 'closed' | 'replaced' | 'shutdown';
type Action = 'link' | 'sectionNavigation' | 'setting' | 'tryoutRun' | 'tryoutSetup' | 'showOnUpdateChanged';
type TargetKind = 'documentation' | 'external' | 'command' | 'anchor' | 'other';

export interface IReleaseNotesRegion {
	readonly index: number;
	readonly kind: ContentKind;
	readonly parentIndex: number;
	readonly headingLevel: number;
	readonly endIndex: number;
}

export interface IReleaseNotesManifest {
	readonly regions: readonly IReleaseNotesRegion[];
	readonly links: readonly { readonly index: number; readonly contentIndex: number; readonly targetKind: TargetKind; readonly settingUri?: string }[];
	readonly tryouts: readonly { readonly index: number; readonly linkIndex: number; readonly contentIndex: number }[];
}

interface ISample {
	readonly contents: readonly number[];
	readonly tryouts: readonly number[];
	readonly depth: number;
	readonly isScrollable: boolean;
}

interface ICallbacks {
	readonly now: () => number;
	readonly getTryout: (index: number) => { readonly id: string; readonly kind: 'ready' | 'hidden' | 'unavailable'; readonly hasSetup: boolean } | undefined;
}

type CommonEvent = {
	schemaVersion: number;
	viewInstanceId: number;
	notesVersion: string;
	notesRevision: string;
	contentVariant: 'stable' | 'insider' | 'other';
};

type CommonClassification = {
	owner: 'ntrogh';
	comment: 'Measures engagement with official in-product release notes without collecting their content.';
	schemaVersion: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'The event schema version.' };
	viewInstanceId: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Renderer-local opening sequence, correlated only within the existing telemetry session.' };
	notesVersion: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The normalized public release major and minor version.' };
	notesRevision: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'SHA-256 of the public, unpersonalized release document; empty if fetching failed.' };
	contentVariant: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The bounded conditional-rendering variant: stable, insider, or other.' };
};
type OpenEvent = CommonEvent & { source: ReleaseNotesSource; outcome: 'rendered' | 'failed' | 'superseded'; durationMs: number; failureStage?: 'fetch' | 'render' };
type OpenClassification = CommonClassification & {
	source: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The product-owned opening entry point.' };
	outcome: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'Whether the in-product opening rendered, failed, or was superseded.' };
	durationMs: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Elapsed opening time in milliseconds.' };
	failureStage?: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'The bounded failed stage, fetch or render, without error details.' };
};
type ShownEvent = CommonEvent & { source: ReleaseNotesSource; initialDepthBucket: number; isScrollable: boolean };
type ShownClassification = CommonClassification & {
	source: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The product-owned opening entry point.' };
	initialDepthBucket: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Initial normalized scroll position in 25-percent buckets, including restoration.' };
	isScrollable: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Whether the document exceeds the content viewport.' };
};
type DwellEvent = CommonEvent & { checkpointSequence: number; reason: Reason; visibleMs: number; activeReadingMs: number };
type DwellClassification = CommonClassification & {
	checkpointSequence: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Monotonic snapshot sequence within this document instance.' };
	reason: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The bounded checkpoint lifecycle reason.' };
	visibleMs: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Cumulative foreground exposure time in milliseconds; snapshots are not additive.' };
	activeReadingMs: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Cumulative focused non-idle exposure in milliseconds, an attention estimate rather than proof of reading.' };
};
type EngagementEvent = DwellEvent & { maxDepthBucket: number; sectionCount: number; interactionCount: number };
type EngagementClassification = DwellClassification & {
	maxDepthBucket: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Maximum normalized scroll reach in 25-percent buckets, not reading completion.' };
	sectionCount: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Number of distinct qualified heading sections.' };
	interactionCount: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Number of validated user activations in this document.' };
};
type SectionEvent = CommonEvent & { sectionIndex: number; parentSectionIndex: number; headingLevel: number };
type SectionClassification = CommonClassification & {
	sectionIndex: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Bounded heading index in the exact public document revision.' };
	parentSectionIndex: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Parent content index, or -1 if absent.' };
	headingLevel: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'The section heading level, 2 or 3.' };
};
type ContentEvent = DwellEvent & { contentKind: ContentKind; contentIndex: number; parentContentIndex: number; visitCount: number; qualifiedExposure: boolean };
type ContentClassification = DwellClassification & {
	contentKind: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Region type: section, note, highlights block, or individual highlight.' };
	contentIndex: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Bounded region index in the exact public document revision.' };
	parentContentIndex: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Parent region index, or -1 if absent. Parent and child dwell overlap.' };
	visitCount: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Number of distinct foreground exposure intervals, including short visits.' };
	qualifiedExposure: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Whether this region received a continuous two-second active exposure.' };
};
type TryoutEvent = CommonEvent & { sectionIndex: number; linkIndex: number; tryoutId: string; availability: 'ready' | 'unavailable'; hasSetup: boolean };
type TryoutClassification = CommonClassification & {
	sectionIndex: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Containing content region, or -1 if absent.' };
	linkIndex: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Bounded occurrence index in the exact public document revision.' };
	tryoutId: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The registered product-owned feature example identifier.' };
	availability: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Whether the exposed affordance was ready or unavailable.' };
	hasSetup: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Whether an explicit setup action was available.' };
};
type InteractionEvent = CommonEvent & { action: Action; contentIndex: number; sectionIndex: number; linkIndex: number; targetKind?: TargetKind; tryoutId?: string; runId?: string; availability?: 'ready' | 'unavailable'; newValue?: boolean };
type InteractionClassification = CommonClassification & {
	action: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Bounded user action, not its success or feature adoption.' };
	contentIndex: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Most specific containing note or highlight, or -1 if absent.' };
	sectionIndex: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Containing heading section, or -1 if absent.' };
	linkIndex: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Bounded authored link index, or -1 for a product control.' };
	targetKind?: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Coarse destination category; no URL, anchor, setting identifier, or command is collected.' };
	tryoutId?: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The validated registered feature example ID, when applicable.' };
	runId?: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Ephemeral ID joining an accepted activation to the existing tryout lifecycle, including across windows.' };
	availability?: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Ready or unavailable at validated tryout activation.' };
	newValue?: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'The new value of the built-in show-release-notes-on-update checkbox only.' };
};

interface IDwell {
	visibleMs: number;
	activeReadingMs: number;
	continuousMs: number;
	visitCount: number;
	visible: boolean;
	qualified: boolean;
	snapshot: string;
}

const maximumRegions = 512;
const maximumLinks = 4096;
const idleMs = 60_000;
let nextInstanceId = 0;

/** Records one official document; DOM samples contain only host-assigned numeric identities. */
export class ReleaseNotesTelemetry extends Disposable {
	readonly metadata: CommonEvent;
	manifest: IReleaseNotesManifest = { regions: [], links: [], tryouts: [] };
	failureStage: 'fetch' | 'render' = 'fetch';
	private readonly started: number;
	private lastTime: number;
	private lastActivity: number;
	private enabled: boolean;
	private ready = false;
	private visible = false;
	private active = false;
	private shown = false;
	private sample: ISample = { contents: [], tryouts: [], depth: 0, isScrollable: false };
	private readonly dwell = new Map<number, IDwell>();
	private readonly tryoutDwell = new Map<number, { key: string; continuousMs: number }>();
	private readonly shownTryouts = new Set<string>();
	private visibleMs = 0;
	private activeReadingMs = 0;
	private checkpointActiveMs = 0;
	private maxDepthBucket = 0;
	private interactions = 0;
	private sequence = 0;
	private snapshot = '';
	private ended = false;

	constructor(
		version: string,
		quality: string | undefined,
		private readonly source: ReleaseNotesSource,
		private readonly callbacks: ICallbacks,
		@ITelemetryService private readonly telemetryService: ITelemetryService,
	) {
		super();
		this.metadata = {
			schemaVersion: 1, viewInstanceId: ++nextInstanceId,
			notesVersion: /^\d{1,4}\.\d{1,4}\.\d{1,4}(?:-[a-zA-Z0-9.-]+)?$/.test(version) ? version.split('.').slice(0, 2).join('.') : 'unknown',
			notesRevision: '', contentVariant: quality === 'stable' || quality === 'insider' ? quality : 'other',
		};
		this.started = this.lastTime = this.lastActivity = callbacks.now();
		this.enabled = telemetryService.telemetryLevel === TelemetryLevel.USAGE;
	}

	opened(outcome: OpenEvent['outcome']): void {
		if (this.canLog()) {
			this.telemetryService.publicLog2<OpenEvent, OpenClassification>('releaseNotes.openResult', {
				...this.metadata, source: this.source, outcome, durationMs: Math.max(0, Math.round(this.callbacks.now() - this.started)),
				...(outcome === 'failed' ? { failureStage: this.failureStage } : {}),
			});
		}
	}

	get isTracking(): boolean {
		return this.ready && this.visible && this.canLog();
	}

	waitForPresentation(): void {
		this.tick();
		this.flush('hidden');
		this.ready = false;
		this.updateRegions();
	}

	setVisibility(visible: boolean, active: boolean): void {
		this.tick();
		const reason = !visible ? 'hidden' : !active ? 'blur' : undefined;
		if (reason && (this.visible && !visible || this.active && !active)) {
			this.flush(reason);
		}
		if (this.active && !active) {
			for (const dwell of this.dwell.values()) {
				dwell.continuousMs = 0;
			}
			this.tryoutDwell.clear();
		}
		if (active && !this.active) {
			this.lastActivity = this.callbacks.now();
		}
		this.visible = visible;
		this.active = active && visible;
		this.updateRegions();
		this.show();
	}

	activity(): void {
		this.tick();
		if (this.enabled && this.visible && this.active) {
			this.lastActivity = this.callbacks.now();
		}
	}

	receive(message: Record<string, unknown>): boolean {
		if (typeof message.type !== 'string') {
			return false;
		}
		if (message.type === 'releaseNotesTelemetrySample') {
			if (Object.keys(message).some(key => !['type', 'documentId', 'contents', 'tryouts', 'depth', 'isScrollable'].includes(key))
				|| !this.validIndexes(message.contents, this.manifest.regions)
				|| !this.validIndexes(message.tryouts, this.manifest.tryouts)
				|| typeof message.depth !== 'number' || !Number.isFinite(message.depth) || message.depth < 0 || message.depth > 100
				|| typeof message.isScrollable !== 'boolean') {
				return false;
			}
			this.tick();
			this.sample = { contents: message.contents, tryouts: message.tryouts, depth: message.depth, isScrollable: message.isScrollable };
			if (!this.ready) {
				this.lastActivity = this.callbacks.now();
				this.ready = true;
			}
			this.updateRegions();
			this.show();
		} else if (message.type === 'releaseNotesTelemetryActivity') {
			if (Object.keys(message).some(key => !['type', 'documentId'].includes(key))) {
				return false;
			}
			this.activity();
		} else if (message.type === 'releaseNotesTelemetryLink') {
			if (Object.keys(message).some(key => !['type', 'documentId', 'index'].includes(key))
				|| typeof message.index !== 'number' || !Number.isInteger(message.index) || !this.manifest.links[message.index]) {
				return false;
			}
			const link = this.manifest.links[message.index];
			if (!link.settingUri && !this.manifest.tryouts.some(tryout => tryout.linkIndex === link.index)) {
				this.interact(link.targetKind === 'anchor' ? 'sectionNavigation' : 'link', link.index);
			}
		} else {
			return false;
		}
		return true;
	}

	private validIndexes(value: unknown, entries: readonly { readonly index: number }[]): value is number[] {
		const indexes = new Set(entries.map(entry => entry.index));
		return Array.isArray(value) && value.length <= indexes.size
			&& value.every(index => typeof index === 'number' && Number.isInteger(index) && indexes.has(index))
			&& new Set(value).size === value.length;
	}

	setting(uri: string, index: unknown): boolean {
		if (typeof index !== 'number' || !Number.isInteger(index) || this.manifest.links[index]?.settingUri !== uri) {
			return false;
		}
		this.interact('setting', index);
		return true;
	}

	tryout(index: number, action: 'run' | 'setup', runId?: string): void {
		const occurrence = this.manifest.tryouts.find(tryout => tryout.index === index);
		const state = this.callbacks.getTryout(index);
		if (occurrence && state && state.kind !== 'hidden') {
			this.interact(action === 'run' ? 'tryoutRun' : 'tryoutSetup', occurrence.linkIndex, {
				tryoutId: state.id, availability: state.kind, ...(runId ? { runId } : {}),
			});
		}
	}

	checkbox(newValue: boolean): void {
		this.interact('showOnUpdateChanged', -1, { newValue });
	}

	private interact(action: Action, index: number, extra: Pick<InteractionEvent, 'tryoutId' | 'availability' | 'runId' | 'newValue'> = {}): void {
		this.activity();
		if (!this.canLog() || !this.ready || !this.visible) {
			return;
		}
		const link = this.manifest.links[index];
		const contentIndex = link?.contentIndex ?? -1;
		let sectionIndex = contentIndex;
		while (sectionIndex >= 0 && !this.manifest.regions[sectionIndex].headingLevel) {
			sectionIndex = this.manifest.regions[sectionIndex].parentIndex;
		}
		this.interactions++;
		this.telemetryService.publicLog2<InteractionEvent, InteractionClassification>('releaseNotes.interaction', {
			...this.metadata, action, contentIndex, sectionIndex, linkIndex: index,
			...(link ? { targetKind: link.targetKind } : {}), ...extra,
		});
	}

	tick(): void {
		const now = this.callbacks.now();
		const elapsed = Math.max(0, now - this.lastTime);
		const enabled = this.canLog();
		if (enabled !== this.enabled) {
			this.enabled = enabled;
			this.lastActivity = now;
			for (const dwell of this.dwell.values()) {
				dwell.continuousMs = 0;
			}
			this.tryoutDwell.clear();
			this.lastTime = now;
			return;
		}
		// A stalled/suspended renderer cannot establish exposure during the missing samples.
		const delta = elapsed <= 5000 && enabled && this.ready && this.visible ? elapsed : 0;
		const activeDelta = this.active ? Math.min(delta, Math.max(0, this.lastActivity + idleMs - this.lastTime)) : 0;
		this.lastTime = now;
		this.visibleMs += delta;
		this.activeReadingMs += activeDelta;
		if (this.shown && this.visible && enabled) {
			this.maxDepthBucket = Math.max(this.maxDepthBucket, Math.floor(this.sample.depth / 25) * 25);
		}
		for (const region of this.manifest.regions) {
			const dwell = this.dwell.get(region.index);
			if (!dwell?.visible) {
				continue;
			}
			dwell.visibleMs += delta;
			dwell.activeReadingMs += activeDelta;
			if (activeDelta > 0) {
				dwell.continuousMs += activeDelta;
			} else if (elapsed > 0) {
				dwell.continuousMs = 0;
			}
			if (!dwell.qualified && dwell.continuousMs >= 2000) {
				dwell.qualified = true;
				if (region.headingLevel === 2 || region.headingLevel === 3) {
					this.telemetryService.publicLog2<SectionEvent, SectionClassification>('releaseNotes.sectionShown', {
						...this.metadata, sectionIndex: region.index, parentSectionIndex: region.parentIndex, headingLevel: region.headingLevel,
					});
				}
				this.flushContent(region, dwell, 'qualified');
			}
		}
		for (const occurrence of this.manifest.tryouts) {
			const state = this.callbacks.getTryout(occurrence.index);
			if (!enabled || !this.visible || !this.sample.tryouts.includes(occurrence.index) || !state || state.kind === 'hidden') {
				this.tryoutDwell.delete(occurrence.index);
				continue;
			}
			const key = `${occurrence.index}:${state.kind}`;
			const previous = this.tryoutDwell.get(occurrence.index);
			const continuousMs = previous?.key === key ? activeDelta > 0 ? previous.continuousMs + activeDelta : elapsed === 0 ? previous.continuousMs : 0 : 0;
			this.tryoutDwell.set(occurrence.index, { key, continuousMs });
			if (continuousMs >= 2000 && !this.shownTryouts.has(key)) {
				this.shownTryouts.add(key);
				this.telemetryService.publicLog2<TryoutEvent, TryoutClassification>('releaseNotes.tryoutShown', {
					...this.metadata, sectionIndex: occurrence.contentIndex, linkIndex: occurrence.linkIndex,
					tryoutId: state.id, availability: state.kind, hasSetup: state.hasSetup,
				});
			}
		}
		if (this.activeReadingMs - this.checkpointActiveMs >= 30_000) {
			this.flush('periodic');
			this.checkpointActiveMs = this.activeReadingMs;
		} else if (activeDelta > 0 && now >= this.lastActivity + idleMs) {
			this.flush('idle');
		}
	}

	private canLog(): boolean {
		return !this.ended && this.telemetryService.telemetryLevel === TelemetryLevel.USAGE;
	}

	private show(): void {
		if (!this.shown && this.ready && this.visible && this.canLog()) {
			this.shown = true;
			this.maxDepthBucket = Math.floor(this.sample.depth / 25) * 25;
			this.telemetryService.publicLog2<ShownEvent, ShownClassification>('releaseNotes.shown', {
				...this.metadata, source: this.source, initialDepthBucket: this.maxDepthBucket, isScrollable: this.sample.isScrollable,
			});
		}
	}

	private updateRegions(): void {
		for (const region of this.manifest.regions) {
			let dwell = this.dwell.get(region.index);
			if (!dwell) {
				dwell = { visibleMs: 0, activeReadingMs: 0, continuousMs: 0, visitCount: 0, visible: false, qualified: false, snapshot: '' };
				this.dwell.set(region.index, dwell);
			}
			const visible = this.enabled && this.ready && this.visible && this.sample.contents.includes(region.index);
			if (visible !== dwell.visible) {
				if (visible) {
					dwell.visitCount++;
				} else {
					this.flushContent(region, dwell, 'contentExit');
				}
				dwell.visible = visible;
				dwell.continuousMs = 0;
			}
		}
		for (const occurrence of this.manifest.tryouts) {
			const state = this.callbacks.getTryout(occurrence.index);
			if (this.enabled && this.ready && this.visible && this.sample.tryouts.includes(occurrence.index) && state && state.kind !== 'hidden') {
				const key = `${occurrence.index}:${state.kind}`;
				if (this.tryoutDwell.get(occurrence.index)?.key !== key) {
					this.tryoutDwell.set(occurrence.index, { key, continuousMs: 0 });
				}
			} else {
				this.tryoutDwell.delete(occurrence.index);
			}
		}
	}

	flush(reason: Reason): void {
		if (!this.canLog() || !this.shown) {
			return;
		}
		const sectionCount = this.manifest.regions.filter(region => region.headingLevel > 0 && region.headingLevel <= 3 && this.dwell.get(region.index)?.qualified).length;
		const counters = { visibleMs: Math.round(this.visibleMs), activeReadingMs: Math.round(this.activeReadingMs), maxDepthBucket: this.maxDepthBucket, sectionCount, interactionCount: this.interactions };
		const snapshot = JSON.stringify(counters);
		if (snapshot !== this.snapshot) {
			this.snapshot = snapshot;
			this.telemetryService.publicLog2<EngagementEvent, EngagementClassification>('releaseNotes.engagement', {
				...this.metadata, checkpointSequence: ++this.sequence, reason, ...counters,
			});
		}
		for (const region of this.manifest.regions) {
			const dwell = this.dwell.get(region.index);
			if (dwell) {
				this.flushContent(region, dwell, reason);
			}
		}
	}

	private flushContent(region: IReleaseNotesRegion, dwell: IDwell, reason: Reason): void {
		if (!this.canLog() || !this.shown || dwell.visibleMs === 0) {
			return;
		}
		const counters = { visibleMs: Math.round(dwell.visibleMs), activeReadingMs: Math.round(dwell.activeReadingMs), visitCount: dwell.visitCount, qualifiedExposure: dwell.qualified };
		const snapshot = JSON.stringify(counters);
		if (snapshot !== dwell.snapshot) {
			dwell.snapshot = snapshot;
			this.telemetryService.publicLog2<ContentEvent, ContentClassification>('releaseNotes.contentEngagement', {
				...this.metadata, checkpointSequence: ++this.sequence, reason, contentKind: region.kind,
				contentIndex: region.index, parentContentIndex: region.parentIndex, ...counters,
			});
		}
	}

	finish(reason: 'closed' | 'replaced' | 'shutdown'): void {
		if (!this.ended) {
			this.tick();
			this.flush(reason);
			this.ended = true;
		}
	}

	override dispose(): void {
		this.finish('closed');
		super.dispose();
	}
}

/* eslint-disable eslint-js/no-restricted-syntax -- These helpers inspect only the isolated release-notes document. */
/** Assigns bounded identities after sanitization; labels are available only in the offline manifest. */
export function indexReleaseNotesContent(container: HTMLElement): IReleaseNotesManifest {
	for (const element of container.querySelectorAll('[data-release-notes-content-index], [data-release-notes-link-index]')) {
		element.removeAttribute('data-release-notes-content-index');
		element.removeAttribute('data-release-notes-link-index');
	}
	const regions: IReleaseNotesRegion[] = [];
	const regionElements: HTMLElement[] = [];
	const headings: { element: HTMLElement; index: number; level: number }[] = [];
	for (const element of container.querySelectorAll<HTMLElement>('h2, h3, h4, .release-notes-highlights, .highlights-table, .release-notes-highlights li, .highlights-table td')) {
		if (regions.length === maximumRegions) {
			break;
		}
		const headingLevel = /^H[234]$/.test(element.tagName) ? Number(element.tagName.slice(1)) : 0;
		const highlights = element.matches('.release-notes-highlights, .highlights-table');
		const highlight = !headingLevel && !highlights;
		if (element.matches('.highlights-table') && element.parentElement?.closest('.release-notes-highlights')) {
			continue;
		}
		if (highlight && element.parentElement?.closest('li, td') && container.contains(element.parentElement.closest('li, td'))) {
			continue;
		}
		while (headings.length && headingLevel && headings[headings.length - 1].level >= headingLevel) {
			headings.pop();
		}
		let containing = -1;
		for (let i = regionElements.length - 1; i >= 0; i--) {
			if (regionElements[i].contains(element)) {
				containing = i;
				break;
			}
		}
		const parentIndex = containing >= 0 ? containing : headings[headings.length - 1]?.index ?? -1;
		const index = regions.length;
		regions.push({ index, kind: highlights ? 'highlights' : highlight ? 'highlight' : headingLevel === 2 ? 'section' : 'note', parentIndex, headingLevel, endIndex: -1 });
		regionElements.push(element);
		element.setAttribute('data-release-notes-content-index', String(index));
		if (headingLevel) {
			headings.push({ element, index, level: headingLevel });
		}
	}
	const ranged = regions.map(region => ({
		...region,
		endIndex: region.headingLevel ? regions.find(next => next.index > region.index && next.headingLevel > 0 && next.headingLevel <= region.headingLevel)?.index ?? -1 : -1,
	}));
	const links: IReleaseNotesManifest['links'][number][] = [];
	const tryouts: IReleaseNotesManifest['tryouts'][number][] = [];
	// Inline code and unavailable tryouts reserve their authored occurrence even without a link.
	for (const element of container.querySelectorAll<HTMLElement>('a, code, .release-notes-tryout-fallback')) {
		if (links.length === maximumLinks) {
			break;
		}
		if (element.parentElement?.closest('a, code, pre')) {
			continue;
		}
		const anchor = element.matches('a') ? element : element.querySelector('a');
		const href = anchor?.getAttribute('href') ?? '';
		const uri = URI.parse(href);
		let contentIndex = -1;
		for (let i = 0; i < regionElements.length; i++) {
			const region = ranged[i];
			const start = regionElements[i];
			const end = region.endIndex >= 0 ? regionElements[region.endIndex] : undefined;
			if (start.contains(element) || region.headingLevel && start.compareDocumentPosition(element) & 4 && (!end || element.compareDocumentPosition(end) & 4)) {
				contentIndex = i;
			}
		}
		const index = links.length;
		const occurrence = anchor?.closest<HTMLElement>('[data-release-notes-tryout-index]');
		const fallback = element.matches('.release-notes-tryout-fallback') || element.querySelector('.release-notes-tryout-fallback');
		const targetKind: TargetKind = occurrence || fallback ? 'command'
			: href.startsWith('#') ? 'anchor' : uri.scheme === Schemas.command ? 'command'
				: uri.scheme === Schemas.http || uri.scheme === Schemas.https ? uri.authority === 'code.visualstudio.com' ? 'documentation' : 'external' : 'other';
		links.push({ index, contentIndex, targetKind, ...(uri.scheme === Schemas.codeSetting ? { settingUri: (anchor as HTMLAnchorElement).href } : {}) });
		element.setAttribute('data-release-notes-link-index', String(index));
		if (occurrence) {
			tryouts.push({ index: Number(occurrence.dataset.releaseNotesTryoutIndex), linkIndex: index, contentIndex });
		}
	}
	return { regions: ranged, links, tryouts };
}

/** Serialized into the existing nonce-protected webview; it never sends text or destinations. */
export function initializeReleaseNotesTelemetry(
	targetDocument: Document,
	targetWindow: Window & typeof globalThis,
	documentId: string,
	regions: readonly IReleaseNotesRegion[],
	vscode: { postMessage(message: object): void },
	tryoutIndexes: readonly number[] = [],
): () => void {
	const controller = new targetWindow.AbortController();
	const options = { signal: controller.signal };
	const elements = new Map<number, HTMLElement>();
	for (const element of targetDocument.querySelectorAll<HTMLElement>('[data-release-notes-content-index]')) {
		elements.set(Number(element.dataset.releaseNotesContentIndex), element);
	}
	let frame: number | undefined;
	let presented = false;
	let lastActivity = -Infinity;
	const intersecting = (top: number, bottom: number) => {
		const height = Math.max(0, bottom - top);
		return height > 0 && Math.min(bottom, targetWindow.innerHeight) - Math.max(top, 0) >= Math.min(height, targetWindow.innerHeight) / 2;
	};
	const sample = () => {
		frame = undefined;
		if (!presented) {
			return;
		}
		const contents: number[] = [];
		for (const region of regions) {
			const element = elements.get(region.index);
			if (!element || element.hidden || !element.getClientRects().length) {
				continue;
			}
			const rect = element.getBoundingClientRect();
			const bottom = region.headingLevel
				? elements.get(region.endIndex)?.getBoundingClientRect().top ?? targetDocument.documentElement.scrollHeight - targetWindow.scrollY
				: rect.bottom;
			if (intersecting(rect.top, bottom)) {
				contents.push(region.index);
			}
		}
		const tryouts: number[] = [];
		for (const element of targetDocument.querySelectorAll<HTMLElement>('[data-release-notes-tryout-index]')) {
			const rect = element.getBoundingClientRect();
			const index = Number(element.dataset.releaseNotesTryoutIndex);
			if (tryoutIndexes.includes(index) && !element.hidden && element.getClientRects().length && intersecting(rect.top, rect.bottom)) {
				tryouts.push(index);
			}
		}
		const scrolling = targetDocument.scrollingElement;
		const distance = scrolling ? scrolling.scrollHeight - scrolling.clientHeight : 0;
		vscode.postMessage({
			type: 'releaseNotesTelemetrySample', documentId, contents, tryouts,
			depth: distance > 0 ? Math.max(0, Math.min(100, 100 * scrolling!.scrollTop / distance)) : 100,
			isScrollable: distance > 0,
		});
	};
	const schedule = () => {
		frame ??= targetWindow.requestAnimationFrame(sample);
	};
	const activity = (event: Event) => {
		if (event.isTrusted && targetWindow.performance.now() - lastActivity >= 250) {
			lastActivity = targetWindow.performance.now();
			vscode.postMessage({ type: 'releaseNotesTelemetryActivity', documentId });
		}
	};
	for (const type of ['keydown', 'pointerdown', 'pointermove', 'wheel', 'touchstart']) {
		targetDocument.addEventListener(type, activity, { ...options, passive: true });
	}
	targetDocument.addEventListener('click', event => {
		const link = event.target instanceof targetWindow.Element ? event.target.closest<HTMLAnchorElement>('a[href]') : null;
		const occurrence = link?.closest<HTMLElement>('[data-release-notes-link-index]');
		if (event.isTrusted && occurrence && !link?.closest('[data-release-notes-tryout-index]') && !link?.getAttribute('href')?.startsWith('code-setting:')) {
			vscode.postMessage({ type: 'releaseNotesTelemetryLink', documentId, index: Number(occurrence.dataset.releaseNotesLinkIndex) });
		}
	}, options);
	targetWindow.addEventListener('scroll', schedule, { ...options, passive: true });
	targetWindow.addEventListener('resize', schedule, options);
	targetWindow.addEventListener('pageshow', schedule, options);
	targetDocument.addEventListener('visibilitychange', schedule, options);
	targetWindow.addEventListener('message', event => {
		if (event.data?.type === 'releaseNotesTelemetryMeasure' && event.data.documentId === documentId) {
			// The webview shell delivers host messages only after presenting and restoring the content.
			presented = true;
			schedule();
		}
	}, options);
	const observer = new targetWindow.ResizeObserver(schedule);
	observer.observe(targetDocument.body);
	const dispose = () => {
		controller.abort();
		observer.disconnect();
		if (frame !== undefined) {
			targetWindow.cancelAnimationFrame(frame);
		}
	};
	targetWindow.addEventListener('pagehide', dispose, { ...options, once: true });
	return dispose;
}
/* eslint-enable eslint-js/no-restricted-syntax */
