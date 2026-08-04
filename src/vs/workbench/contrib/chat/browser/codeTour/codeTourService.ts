/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { Disposable, DisposableMap, IDisposable } from '../../../../../base/common/lifecycle.js';
import { IObservable, ISettableObservable, observableValue } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { generateUuid } from '../../../../../base/common/uuid.js';
import { isCodeEditor } from '../../../../../editor/browser/editorBrowser.js';
import { IRange, Range } from '../../../../../editor/common/core/range.js';
import { DocumentSymbol } from '../../../../../editor/common/languages.js';
import { ILanguageFeaturesService } from '../../../../../editor/common/services/languageFeatures.js';
import { ITextModelService } from '../../../../../editor/common/services/resolverService.js';
import { TextEditorSelectionRevealType } from '../../../../../platform/editor/common/editor.js';
import { IAgentNetworkFilterService } from '../../../../../platform/networkFilter/common/networkFilterService.js';
import { createDecorator, IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import { RangeHighlightDecorations } from '../../../../browser/codeeditor.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';
import { IBrowserViewWorkbenchService } from '../../../browserView/common/browserView.js';
import { IChatCodeTourData, IChatCodeTourStop, IChatService } from '../../common/chatService/chatService.js';

export const ICodeTourService = createDecorator<ICodeTourService>('codeTourService');

/**
 * Live state for a tour that is still being presented. Persisted tours (e.g.
 * after a window reload) have no runtime, but their stops remain replayable.
 */
export interface ICodeTourRuntime {
	/** Index of the stop the tour is currently showing, or `-1` before the first stop. */
	readonly currentIndex: IObservable<number>;
	/** Whether the tour is finished, either because the agent reached the last stop or the user ended it. */
	readonly finished: IObservable<boolean>;
}

export interface ICodeTourService {
	readonly _serviceBrand: undefined;

	/**
	 * Starts a tour for a chat session, replacing any tour that session already
	 * has. The returned data is the live object the tool hands to the renderer:
	 * its `stops` array is appended to as the agent contributes stops.
	 */
	startTour(sessionResource: URI, title: string): IChatCodeTourData;

	/** The tour currently being presented in a chat session, if any. */
	getActiveTour(sessionResource: URI): IChatCodeTourData | undefined;

	/** Appends a stop to the session's tour and reveals it. Returns `false` when the tour already ended. */
	addStop(sessionResource: URI, stop: IChatCodeTourStop, isLast: boolean): Promise<boolean>;

	/**
	 * Reveals a stop without changing tour membership, used when the user clicks
	 * a past stop in the tour widget. Works for persisted tours too, in which
	 * case `tourId` has no runtime and only navigation happens.
	 */
	revealStop(tourId: string, index: number, stop: IChatCodeTourStop): Promise<void>;

	/** Observes the live runtime of a tour, or `undefined` when it is not running. */
	observeRuntime(tourId: string): IObservable<ICodeTourRuntime | undefined>;

	/** Ends the tour early at the user's request. */
	stopTour(tourId: string): void;

	/** Whether the session's tour was ended by the user. */
	isStopped(sessionResource: URI): boolean;

	/**
	 * Resolves a stop's range from an explicit line span, or from a symbol name
	 * when the agent could not supply line numbers.
	 */
	resolveRange(resource: URI, startLine: number | undefined, endLine: number | undefined, symbol: string | undefined): Promise<IRange | undefined>;
}

/** How a tour ended, reported once per tour in telemetry. */
type CodeTourEndReason =
	/** The agent presented its final stop. */
	| 'completed'
	/** The user pressed "Stop Tour". */
	| 'stopped'
	/** The tour was still running when the session or a new tour replaced it. */
	| 'abandoned';

type CodeTourEndedEvent = {
	endReason: CodeTourEndReason;
	stopCount: number;
	stopsWithRange: number;
	stopsWithUrl: number;
	replayCount: number;
};

type CodeTourEndedClassification = {
	endReason: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'How the code tour ended: completed, stopped by the user, or abandoned.' };
	stopCount: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Number of stops the agent presented in the tour.' };
	stopsWithRange: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'How many stops resolved to a concrete code range, which indicates how precise the agent was able to be.' };
	stopsWithUrl: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'How many stops also opened a page in the integrated browser.' };
	replayCount: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'How many times the user clicked a past stop to navigate back to it.' };
	owner: 'osortega';
	comment: 'Reports how a guided code tour ended so we can tell whether tours are watched through, cut short, or abandoned.';
};

class CodeTour extends Disposable {

	readonly currentIndex: ISettableObservable<number> = observableValue(this, -1);
	readonly finished: ISettableObservable<boolean> = observableValue(this, false);

	/** Set once telemetry has been reported, so each tour is only counted once. */
	ended = false;
	replayCount = 0;

	readonly data: IChatCodeTourData;

	constructor(title: string) {
		super();
		this.data = { kind: 'codeTour', tourId: generateUuid(), title, stops: [] };
	}

	add<T extends IDisposable>(disposable: T): T {
		return this._register(disposable);
	}
}

export class CodeTourService extends Disposable implements ICodeTourService {

	declare readonly _serviceBrand: undefined;

	private readonly _toursBySession = this._register(new DisposableMap<string, CodeTour>());
	private readonly _toursById = new Map<string, CodeTour>();

	/**
	 * Observables handed out by {@link observeRuntime}. Cached so repeated calls
	 * for the same tour reuse one observable, and so a widget created before its
	 * tour is registered still lights up once the tour arrives.
	 */
	private readonly _runtimeObservables = new Map<string, ISettableObservable<ICodeTourRuntime | undefined>>();

	/**
	 * Tours the user ended with "Stop Tour". Tracked separately from
	 * {@link CodeTour.finished} so a tour that simply reached its last stop does
	 * not make the tool report the tour as user-cancelled.
	 */
	private readonly _stoppedTourIds = new Set<string>();

	private readonly _rangeHighlight: RangeHighlightDecorations;

	constructor(
		@IEditorService private readonly _editorService: IEditorService,
		@IInstantiationService instantiationService: IInstantiationService,
		@ILanguageFeaturesService private readonly _languageFeaturesService: ILanguageFeaturesService,
		@ITextModelService private readonly _textModelService: ITextModelService,
		@IBrowserViewWorkbenchService private readonly _browserViewService: IBrowserViewWorkbenchService,
		@IAgentNetworkFilterService private readonly _agentNetworkFilterService: IAgentNetworkFilterService,
		@ITelemetryService private readonly _telemetryService: ITelemetryService,
		@IChatService private readonly _chatService: IChatService,
	) {
		super();

		this._rangeHighlight = this._register(instantiationService.createInstance(RangeHighlightDecorations));

		this._register(this._chatService.onDidDisposeSession(e => {
			for (const resource of e.sessionResources) {
				this._disposeTourForSession(resource);
			}
		}));

		// A tour belongs to the turn that produced it. Ending it when the next
		// turn starts keeps "Stop Tour" meaningful for the rest of the current
		// turn while still letting a later `/explain` start a fresh tour.
		this._register(this._chatService.onDidSubmitRequest(e => this._disposeTourForSession(e.chatSessionResource)));
	}

	startTour(sessionResource: URI, title: string): IChatCodeTourData {
		this._disposeTourForSession(sessionResource);

		const tour = new CodeTour(title);
		this._toursBySession.set(sessionResource.toString(), tour);
		this._toursById.set(tour.data.tourId, tour);
		this._runtimeObservable(tour.data.tourId).set({ currentIndex: tour.currentIndex, finished: tour.finished }, undefined);

		// `onDidSubmitRequest` misses turns that an agent host starts itself when
		// draining its own queue, so watch the session model too: every turn adds
		// a request to it, whichever side initiated it.
		const model = this._chatService.getSession(sessionResource);
		if (model) {
			tour.add(model.onDidChange(e => {
				if (e.kind === 'addRequest') {
					this._disposeTourForSession(sessionResource);
				}
			}));
		}

		return tour.data;
	}

	getActiveTour(sessionResource: URI): IChatCodeTourData | undefined {
		return this._toursBySession.get(sessionResource.toString())?.data;
	}

	async addStop(sessionResource: URI, stop: IChatCodeTourStop, isLast: boolean): Promise<boolean> {
		const tour = this._toursBySession.get(sessionResource.toString());
		if (!tour || tour.finished.get()) {
			return false;
		}

		tour.data.stops.push(stop);
		tour.currentIndex.set(tour.data.stops.length - 1, undefined);
		await this._navigate(stop);

		if (isLast) {
			tour.finished.set(true, undefined);
			this._reportTourEnded(tour, 'completed');
		}
		return true;
	}

	async revealStop(tourId: string, index: number, stop: IChatCodeTourStop): Promise<void> {
		const tour = this._toursById.get(tourId);
		if (tour) {
			tour.replayCount++;
			tour.currentIndex.set(index, undefined);
		}
		await this._navigate(stop);
	}

	observeRuntime(tourId: string): IObservable<ICodeTourRuntime | undefined> {
		return this._runtimeObservable(tourId);
	}

	stopTour(tourId: string): void {
		const tour = this._toursById.get(tourId);
		if (!tour || tour.finished.get()) {
			return;
		}
		tour.finished.set(true, undefined);
		this._stoppedTourIds.add(tourId);
		this._rangeHighlight.removeHighlightRange();
		this._reportTourEnded(tour, 'stopped');
	}

	isStopped(sessionResource: URI): boolean {
		const tour = this._toursBySession.get(sessionResource.toString());
		return !!tour && this._stoppedTourIds.has(tour.data.tourId);
	}

	async resolveRange(resource: URI, startLine: number | undefined, endLine: number | undefined, symbol: string | undefined): Promise<IRange | undefined> {
		if (typeof startLine === 'number' && startLine > 0) {
			const start = Math.floor(startLine);
			const end = typeof endLine === 'number' && endLine >= start ? Math.floor(endLine) : start;
			return new Range(start, 1, end, Number.MAX_SAFE_INTEGER);
		}

		if (!symbol) {
			return undefined;
		}

		let reference;
		try {
			reference = await this._textModelService.createModelReference(resource);
		} catch {
			return undefined;
		}

		try {
			const model = reference.object.textEditorModel;
			for (const provider of this._languageFeaturesService.documentSymbolProvider.ordered(model)) {
				const symbols = await provider.provideDocumentSymbols(model, CancellationToken.None);
				const match = symbols && findSymbol(symbols, symbol);
				if (match) {
					return match.range;
				}
			}
			return undefined;
		} catch {
			// The caller opens the file without a selection and tells the model so.
			return undefined;
		} finally {
			reference.dispose();
		}
	}

	/**
	 * Reveals a stop: opens the file without stealing focus from chat, highlights
	 * the range, and opens the stop's page in the integrated browser when it has one.
	 */
	private async _navigate(stop: IChatCodeTourStop): Promise<void> {
		if (stop.uri) {
			const resource = URI.revive(stop.uri);
			const pane = await this._editorService.openEditor({
				resource,
				options: {
					selection: stop.range,
					selectionRevealType: TextEditorSelectionRevealType.NearTopIfOutsideViewport,
					// The tour narrates in chat, so keep focus where the user is
					// reading, and reuse one preview tab instead of piling up
					// pinned editors over a long tour.
					preserveFocus: true,
					pinned: false,
				},
			});

			this._rangeHighlight.removeHighlightRange();
			const control = pane?.getControl();
			if (stop.range && isCodeEditor(control)) {
				this._rangeHighlight.highlightRange({ resource, range: stop.range }, control);
			}
		}

		if (stop.url) {
			// The URL comes from the model, so it goes through the same network
			// filter the integrated browser tools use before anything is loaded.
			const uri = URI.parse(stop.url);
			if (this._agentNetworkFilterService.isUriAllowed(uri)) {
				const browserInput = this._browserViewService.getOrCreateLazy(generateUuid(), { url: stop.url });
				const group = await this._browserViewService.getPreferredGroup();
				await this._editorService.openEditor(browserInput, { preserveFocus: true }, group);
			}
		}
	}

	private _runtimeObservable(tourId: string): ISettableObservable<ICodeTourRuntime | undefined> {
		let obs = this._runtimeObservables.get(tourId);
		if (!obs) {
			obs = observableValue<ICodeTourRuntime | undefined>('codeTourRuntime', undefined);
			this._runtimeObservables.set(tourId, obs);
		}
		return obs;
	}

	private _disposeTourForSession(sessionResource: URI): void {
		const key = sessionResource.toString();
		const existing = this._toursBySession.get(key);
		if (!existing) {
			return;
		}
		this._reportTourEnded(existing, 'abandoned');
		this._toursById.delete(existing.data.tourId);
		this._stoppedTourIds.delete(existing.data.tourId);
		this._runtimeObservables.get(existing.data.tourId)?.set(undefined, undefined);
		this._runtimeObservables.delete(existing.data.tourId);
		this._toursBySession.deleteAndDispose(key);
		this._rangeHighlight.removeHighlightRange();
	}

	/** Reports a tour exactly once, the first time it reaches a terminal state. */
	private _reportTourEnded(tour: CodeTour, endReason: CodeTourEndReason): void {
		if (tour.ended || tour.data.stops.length === 0) {
			return;
		}
		tour.ended = true;

		this._telemetryService.publicLog2<CodeTourEndedEvent, CodeTourEndedClassification>('chat.codeTour.ended', {
			endReason,
			stopCount: tour.data.stops.length,
			stopsWithRange: tour.data.stops.filter(s => !!s.range).length,
			stopsWithUrl: tour.data.stops.filter(s => !!s.url).length,
			replayCount: tour.replayCount,
		});
	}
}

/** Depth-first search for a symbol by name, falling back to a case-insensitive match. */
function findSymbol(symbols: readonly DocumentSymbol[], name: string): DocumentSymbol | undefined {
	for (const symbol of symbols) {
		if (symbol.name === name) {
			return symbol;
		}
		const child = symbol.children && findSymbol(symbol.children, name);
		if (child) {
			return child;
		}
	}
	for (const symbol of symbols) {
		if (symbol.name.toLowerCase() === name.toLowerCase()) {
			return symbol;
		}
	}
	return undefined;
}
