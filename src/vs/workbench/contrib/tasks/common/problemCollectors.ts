/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IStringDictionary, INumberDictionary } from '../../../../base/common/collections.js';
import { URI } from '../../../../base/common/uri.js';
import { Event, Emitter } from '../../../../base/common/event.js';
import { IDisposable, DisposableStore, Disposable } from '../../../../base/common/lifecycle.js';

import { IModelService } from '../../../../editor/common/services/model.js';

import { ILineMatcher, createLineMatcher, ProblemMatcher, IProblemMatch, ApplyToKind, IWatchingPattern, getResource } from './problemMatcher.js';
import { IMarkerService, IMarkerData, MarkerSeverity, IMarker } from '../../../../platform/markers/common/markers.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { isWindows } from '../../../../base/common/platform.js';

export const enum ProblemCollectorEventKind {
	BackgroundProcessingBegins = 'backgroundProcessingBegins',
	BackgroundProcessingEnds = 'backgroundProcessingEnds'
}

export interface IProblemCollectorEvent {
	kind: ProblemCollectorEventKind;
}

namespace IProblemCollectorEvent {
	export function create(kind: ProblemCollectorEventKind) {
		return Object.freeze({ kind });
	}
}

export interface IProblemMatcher {
	processLine(line: string): void;
}

export abstract class AbstractProblemCollector extends Disposable implements IDisposable {

	private matchers: INumberDictionary<ILineMatcher[]>;
	private activeMatcher: ILineMatcher | null;
	protected _numberOfMatches: number;
	private _maxMarkerSeverity?: MarkerSeverity;
	private buffer: string[];
	private bufferLength: number;
	private openModels: IStringDictionary<boolean>;
	protected readonly modelListeners = new DisposableStore();
	private tail: Promise<void> | undefined;

	// [owner] -> ApplyToKind
	protected applyToByOwner: Map<string, ApplyToKind>;
	// [owner] -> [resource] -> URI
	private resourcesToClean: Map<string, Map<string, URI>>;
	// [owner] -> [resource] -> [markerkey] -> markerData
	private markers: Map<string, Map<string, Map<string, IMarkerData>>>;
	// [owner] -> [resource] -> number;
	private deliveredMarkers: Map<string, Map<string, number>>;

	protected _onDidStateChange: Emitter<IProblemCollectorEvent>;

	protected readonly _onDidFindFirstMatch = new Emitter<void>();
	readonly onDidFindFirstMatch = this._onDidFindFirstMatch.event;

	protected readonly _onDidFindErrors = new Emitter<IMarker[]>();
	readonly onDidFindErrors = this._onDidFindErrors.event;

	protected readonly _onDidRequestInvalidateLastMarker = new Emitter<void>();
	readonly onDidRequestInvalidateLastMarker = this._onDidRequestInvalidateLastMarker.event;

	constructor(public readonly problemMatchers: ProblemMatcher[], protected markerService: IMarkerService, protected modelService: IModelService, fileService?: IFileService) {
		super();
		this.matchers = Object.create(null);
		this.bufferLength = 1;
		problemMatchers.map(elem => createLineMatcher(elem, fileService)).forEach((matcher) => {
			const length = matcher.matchLength;
			if (length > this.bufferLength) {
				this.bufferLength = length;
			}
			let value = this.matchers[length];
			if (!value) {
				value = [];
				this.matchers[length] = value;
			}
			value.push(matcher);
		});
		this.buffer = [];
		this.activeMatcher = null;
		this._numberOfMatches = 0;
		this._maxMarkerSeverity = undefined;
		this.openModels = Object.create(null);
		this.applyToByOwner = new Map<string, ApplyToKind>();
		for (const problemMatcher of problemMatchers) {
			const current = this.applyToByOwner.get(problemMatcher.owner);
			if (current === undefined) {
				this.applyToByOwner.set(problemMatcher.owner, problemMatcher.applyTo);
			} else {
				this.applyToByOwner.set(problemMatcher.owner, this.mergeApplyTo(current, problemMatcher.applyTo));
			}
		}
		this.resourcesToClean = new Map<string, Map<string, URI>>();
		this.markers = new Map<string, Map<string, Map<string, IMarkerData>>>();
		this.deliveredMarkers = new Map<string, Map<string, number>>();
		this._register(this.modelService.onModelAdded((model) => {
			this.openModels[model.uri.toString()] = true;
		}, this, this.modelListeners));
		this._register(this.modelService.onModelRemoved((model) => {
			delete this.openModels[model.uri.toString()];
		}, this, this.modelListeners));
		this.modelService.getModels().forEach(model => this.openModels[model.uri.toString()] = true);

		this._onDidStateChange = new Emitter();
	}

	public get onDidStateChange(): Event<IProblemCollectorEvent> {
		return this._onDidStateChange.event;
	}

	public processLine(line: string) {
		if (this.tail) {
			const oldTail = this.tail;
			this.tail = oldTail.then(() => {
				return this.processLineInternal(line);
			});
		} else {
			this.tail = this.processLineInternal(line);
		}
	}

	protected abstract processLineInternal(line: string): Promise<void>;

	public override dispose() {
		super.dispose();
		this.modelListeners.dispose();
	}

	public get numberOfMatches(): number {
		return this._numberOfMatches;
	}

	public get maxMarkerSeverity(): MarkerSeverity | undefined {
		return this._maxMarkerSeverity;
	}

	protected tryFindMarker(line: string): IProblemMatch | null {
		let result: IProblemMatch | null = null;
		if (this.activeMatcher) {
			result = this.activeMatcher.next(line);
			if (result) {
				this.captureMatch(result);
				return result;
			}
			this.clearBuffer();
			this.activeMatcher = null;
		}
		if (this.buffer.length < this.bufferLength) {
			this.buffer.push(line);
		} else {
			const end = this.buffer.length - 1;
			for (let i = 0; i < end; i++) {
				this.buffer[i] = this.buffer[i + 1];
			}
			this.buffer[end] = line;
		}

		result = this.tryMatchers();
		if (result) {
			this.clearBuffer();
		}
		return result;
	}

	protected async shouldApplyMatch(result: IProblemMatch): Promise<boolean> {
		switch (result.description.applyTo) {
			case ApplyToKind.allDocuments:
				return true;
			case ApplyToKind.openDocuments:
				return !!this.openModels[(await result.resource).toString()];
			case ApplyToKind.closedDocuments:
				return !this.openModels[(await result.resource).toString()];
			default:
				return true;
		}
	}

	private mergeApplyTo(current: ApplyToKind, value: ApplyToKind): ApplyToKind {
		if (current === value || current === ApplyToKind.allDocuments) {
			return current;
		}
		return ApplyToKind.allDocuments;
	}

	private tryMatchers(): IProblemMatch | null {
		this.activeMatcher = null;
		const length = this.buffer.length;
		for (let startIndex = 0; startIndex < length; startIndex++) {
			const candidates = this.matchers[length - startIndex];
			if (!candidates) {
				continue;
			}
			for (const matcher of candidates) {
				const result = matcher.handle(this.buffer, startIndex);
				if (result.match) {
					this.captureMatch(result.match);
					if (result.continue) {
						this.activeMatcher = matcher;
					}
					return result.match;
				}
			}
		}
		return null;
	}

	private captureMatch(match: IProblemMatch): void {
		this._numberOfMatches++;
		if (this._maxMarkerSeverity === undefined || match.marker.severity > this._maxMarkerSeverity) {
			this._maxMarkerSeverity = match.marker.severity;
		}
	}

	private clearBuffer(): void {
		if (this.buffer.length > 0) {
			this.buffer = [];
		}
	}

	protected recordResourcesToClean(owner: string): void {
		const resourceSetToClean = this.getResourceSetToClean(owner);
		this.markerService.read({ owner: owner }).forEach(marker => resourceSetToClean.set(marker.resource.toString(), marker.resource));
	}

	protected recordResourceToClean(owner: string, resource: URI): void {
		this.getResourceSetToClean(owner).set(resource.toString(), resource);
	}

	protected removeResourceToClean(owner: string, resource: string): void {
		const resourceSet = this.resourcesToClean.get(owner);
		resourceSet?.delete(resource);
	}

	private getResourceSetToClean(owner: string): Map<string, URI> {
		let result = this.resourcesToClean.get(owner);
		if (!result) {
			result = new Map<string, URI>();
			this.resourcesToClean.set(owner, result);
		}
		return result;
	}

	protected cleanAllMarkers(): void {
		this.resourcesToClean.forEach((value, owner) => {
			this._cleanMarkers(owner, value);
		});
		this.resourcesToClean = new Map<string, Map<string, URI>>();
	}

	protected cleanMarkers(owner: string): void {
		const toClean = this.resourcesToClean.get(owner);
		if (toClean) {
			this._cleanMarkers(owner, toClean);
			this.resourcesToClean.delete(owner);
		}
	}

	private _cleanMarkers(owner: string, toClean: Map<string, URI>): void {
		const uris: URI[] = [];
		const applyTo = this.applyToByOwner.get(owner);
		toClean.forEach((uri, uriAsString) => {
			if (
				applyTo === ApplyToKind.allDocuments ||
				(applyTo === ApplyToKind.openDocuments && this.openModels[uriAsString]) ||
				(applyTo === ApplyToKind.closedDocuments && !this.openModels[uriAsString])
			) {
				uris.push(uri);
			}
		});
		this.markerService.remove(owner, uris);
	}

	protected recordMarker(marker: IMarkerData, owner: string, resourceAsString: string): void {
		let markersPerOwner = this.markers.get(owner);
		if (!markersPerOwner) {
			markersPerOwner = new Map<string, Map<string, IMarkerData>>();
			this.markers.set(owner, markersPerOwner);
		}
		let markersPerResource = markersPerOwner.get(resourceAsString);
		if (!markersPerResource) {
			markersPerResource = new Map<string, IMarkerData>();
			markersPerOwner.set(resourceAsString, markersPerResource);
		}
		const key = IMarkerData.makeKeyOptionalMessage(marker, false);
		let existingMarker;
		if (!markersPerResource.has(key)) {
			markersPerResource.set(key, marker);
		} else if (((existingMarker = markersPerResource.get(key)) !== undefined) && (existingMarker.message.length < marker.message.length) && isWindows) {
			// Most likely https://github.com/microsoft/vscode/issues/77475
			// Heuristic dictates that when the key is the same and message is smaller, we have hit this limitation.
			markersPerResource.set(key, marker);
		}
	}

	protected reportMarkers(): void {
		this.markers.forEach((markersPerOwner, owner) => {
			const deliveredMarkersPerOwner = this.getDeliveredMarkersPerOwner(owner);
			markersPerOwner.forEach((markers, resource) => {
				this.deliverMarkersPerOwnerAndResourceResolved(owner, resource, markers, deliveredMarkersPerOwner);
			});
		});
	}

	protected deliverMarkersPerOwnerAndResource(owner: string, resource: string): void {
		const markersPerOwner = this.markers.get(owner);
		if (!markersPerOwner) {
			return;
		}
		const deliveredMarkersPerOwner = this.getDeliveredMarkersPerOwner(owner);
		const markersPerResource = markersPerOwner.get(resource);
		if (!markersPerResource) {
			return;
		}
		this.deliverMarkersPerOwnerAndResourceResolved(owner, resource, markersPerResource, deliveredMarkersPerOwner);
	}

	private deliverMarkersPerOwnerAndResourceResolved(owner: string, resource: string, markers: Map<string, IMarkerData>, reported: Map<string, number>): void {
		if (markers.size !== reported.get(resource)) {
			const toSet: IMarkerData[] = [];
			markers.forEach(value => toSet.push(value));
			this.markerService.changeOne(owner, URI.parse(resource), toSet);
			reported.set(resource, markers.size);
		}
	}

	private getDeliveredMarkersPerOwner(owner: string): Map<string, number> {
		let result = this.deliveredMarkers.get(owner);
		if (!result) {
			result = new Map<string, number>();
			this.deliveredMarkers.set(owner, result);
		}
		return result;
	}

	protected cleanMarkerCaches(): void {
		this._numberOfMatches = 0;
		this._maxMarkerSeverity = undefined;
		this.markers.clear();
		this.deliveredMarkers.clear();
	}

	public done(): void {
		this.reportMarkers();
		this.cleanAllMarkers();
	}
}

export const enum ProblemHandlingStrategy {
	Clean
}

export class StartStopProblemCollector extends AbstractProblemCollector implements IProblemMatcher {
	private owners: string[];

	private currentOwner: string | undefined;
	private currentResource: string | undefined;

	private _hasStarted: boolean = false;

	constructor(problemMatchers: ProblemMatcher[], markerService: IMarkerService, modelService: IModelService, _strategy: ProblemHandlingStrategy = ProblemHandlingStrategy.Clean, fileService?: IFileService) {
		super(problemMatchers, markerService, modelService, fileService);
		const ownerSet: { [key: string]: boolean } = Object.create(null);
		problemMatchers.forEach(description => ownerSet[description.owner] = true);
		this.owners = Object.keys(ownerSet);
		this.owners.forEach((owner) => {
			this.recordResourcesToClean(owner);
		});
	}

	protected async processLineInternal(line: string): Promise<void> {
		if (!this._hasStarted) {
			this._hasStarted = true;
			this._onDidStateChange.fire(IProblemCollectorEvent.create(ProblemCollectorEventKind.BackgroundProcessingBegins));
		}
		const markerMatch = this.tryFindMarker(line);
		if (!markerMatch) {
			return;
		}

		const owner = markerMatch.description.owner;
		const resource = await markerMatch.resource;
		const resourceAsString = resource.toString();
		this.removeResourceToClean(owner, resourceAsString);
		const shouldApplyMatch = await this.shouldApplyMatch(markerMatch);
		if (shouldApplyMatch) {
			this.recordMarker(markerMatch.marker, owner, resourceAsString);
			if (this.currentOwner !== owner || this.currentResource !== resourceAsString) {
				if (this.currentOwner && this.currentResource) {
					this.deliverMarkersPerOwnerAndResource(this.currentOwner, this.currentResource);
				}
				this.currentOwner = owner;
				this.currentResource = resourceAsString;
			}
		}
	}
}

interface IBackgroundPatterns {
	key: string;
	matcher: ProblemMatcher;
	begin: IWatchingPattern;
	end: IWatchingPattern;
}

export class WatchingProblemCollector extends AbstractProblemCollector implements IProblemMatcher {

	private backgroundPatterns: IBackgroundPatterns[];

	// workaround for https://github.com/microsoft/vscode/issues/44018
	private _activeBackgroundMatchers: Set<string>;

	// Current State
	private currentOwner: string | undefined;
	private currentResource: string | undefined;

	private lines: string[] = [];
	public beginPatterns: RegExp[] = [];
	constructor(problemMatchers: ProblemMatcher[], markerService: IMarkerService, modelService: IModelService, fileService?: IFileService) {
		super(problemMatchers, markerService, modelService, fileService);
		this.resetCurrentResource();
		this.backgroundPatterns = [];
		this._activeBackgroundMatchers = new Set<string>();
		this.problemMatchers.forEach(matcher => {
			if (matcher.watching) {
				const key: string = generateUuid();
				this.backgroundPatterns.push({
					key,
					matcher: matcher,
					begin: matcher.watching.beginsPattern,
					end: matcher.watching.endsPattern
				});
				this.beginPatterns.push(matcher.watching.beginsPattern.regexp);
			}
		});

		this.modelListeners.add(this.modelService.onModelRemoved(modelEvent => {
			let markerChanged: IDisposable | undefined = Event.debounce(
				this.markerService.onMarkerChanged,
				(last: readonly URI[] | undefined, e: readonly URI[]) => (last ?? []).concat(e),
				500,
				false,
				true
			)(async (markerEvent: readonly URI[]) => {
				if (!markerEvent || !markerEvent.includes(modelEvent.uri) || (this.markerService.read({ resource: modelEvent.uri }).length !== 0)) {
					return;
				}
				const oldLines = Array.from(this.lines);
				for (const line of oldLines) {
					await this.processLineInternal(line);
				}
			});

			this._register(markerChanged); // Ensures markerChanged is tracked and disposed of properly

			setTimeout(() => {
				if (markerChanged) {
					const _markerChanged = markerChanged;
					markerChanged = undefined;
					_markerChanged.dispose();
				}
			}, 600);
		}));
	}

	public aboutToStart(): void {
		for (const background of this.backgroundPatterns) {
			if (background.matcher.watching && background.matcher.watching.activeOnStart) {
				this._activeBackgroundMatchers.add(background.key);
				this._onDidStateChange.fire(IProblemCollectorEvent.create(ProblemCollectorEventKind.BackgroundProcessingBegins));
				this.recordResourcesToClean(background.matcher.owner);
			}
		}
	}

	protected async processLineInternal(line: string): Promise<void> {
		if (await this.tryBegin(line) || this.tryFinish(line)) {
			return;
		}
		this.lines.push(line);
		const markerMatch = this.tryFindMarker(line);
		if (!markerMatch) {
			return;
		}
		const resource = await markerMatch.resource;
		const owner = markerMatch.description.owner;
		const resourceAsString = resource.toString();
		this.removeResourceToClean(owner, resourceAsString);
		const shouldApplyMatch = await this.shouldApplyMatch(markerMatch);
		if (shouldApplyMatch) {
			this.recordMarker(markerMatch.marker, owner, resourceAsString);
			if (this.currentOwner !== owner || this.currentResource !== resourceAsString) {
				this.reportMarkersForCurrentResource();
				this.currentOwner = owner;
				this.currentResource = resourceAsString;
			}
		}
	}

	public forceDelivery(): void {
		this.reportMarkersForCurrentResource();
	}

	private async tryBegin(line: string): Promise<boolean> {
		let result = false;
		for (const background of this.backgroundPatterns) {
			const matches = background.begin.regexp.exec(line);
			if (matches) {
				if (this._activeBackgroundMatchers.has(background.key)) {
					continue;
				}
				this._activeBackgroundMatchers.add(background.key);
				result = true;
				this._onDidFindFirstMatch.fire();
				this.lines = [];
				this.lines.push(line);
				this._onDidStateChange.fire(IProblemCollectorEvent.create(ProblemCollectorEventKind.BackgroundProcessingBegins));
				this.cleanMarkerCaches();
				this.resetCurrentResource();
				const owner = background.matcher.owner;
				const file = matches[background.begin.file!];
				if (file) {
					const resource = getResource(file, background.matcher);
					this.recordResourceToClean(owner, await resource);
				} else {
					this.recordResourcesToClean(owner);
				}
			}
		}
		return result;
	}

	private tryFinish(line: string): boolean {
		let result = false;
		for (const background of this.backgroundPatterns) {
			const matches = background.end.regexp.exec(line);
			if (matches) {
				if (this._numberOfMatches > 0) {
					this._onDidFindErrors.fire(this.markerService.read({ owner: background.matcher.owner }));
				} else {
					this._onDidRequestInvalidateLastMarker.fire();
				}
				if (this._activeBackgroundMatchers.has(background.key)) {
					this._activeBackgroundMatchers.delete(background.key);
					this.resetCurrentResource();
					this._onDidStateChange.fire(IProblemCollectorEvent.create(ProblemCollectorEventKind.BackgroundProcessingEnds));
					result = true;
					this.lines.push(line);
					const owner = background.matcher.owner;
					this.cleanMarkers(owner);
					this.cleanMarkerCaches();
				}
			}
		}
		return result;
	}

	private resetCurrentResource(): void {
		this.reportMarkersForCurrentResource();
		this.currentOwner = undefined;
		this.currentResource = undefined;
	}

	private reportMarkersForCurrentResource(): void {
		if (this.currentOwner && this.currentResource) {
			this.deliverMarkersPerOwnerAndResource(this.currentOwner, this.currentResource);
		}
	}

	public override done(): void {
		[...this.applyToByOwner.keys()].forEach(owner => {
			this.recordResourcesToClean(owner);
		});
		super.done();
	}

	public isWatching(): boolean {
		return this.backgroundPatterns.length > 0;
	}
}
