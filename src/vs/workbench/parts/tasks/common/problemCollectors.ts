/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { IStringDictionary, INumberDictionary } from 'vs/base/common/collections';
import URI from 'vs/base/common/uri';
import { EventEmitter } from 'vs/base/common/eventEmitter';
import { IDisposable } from 'vs/base/common/lifecycle';

import { IModelService } from 'vs/editor/common/services/modelService';

import { ILineMatcher, createLineMatcher, ProblemMatcher, ProblemMatch, ApplyToKind, WatchingPattern, getResource } from 'vs/platform/markers/common/problemMatcher';
import { IMarkerService, IMarkerData } from 'vs/platform/markers/common/markers';

export namespace ProblemCollectorEvents {
	export let WatchingBeginDetected: string = 'watchingBeginDetected';
	export let WatchingEndDetected: string = 'watchingEndDetected';
}

export interface IProblemMatcher {
	processLine(line: string): void;
}

export class AbstractProblemCollector extends EventEmitter implements IDisposable {

	private matchers: INumberDictionary<ILineMatcher[]>;
	private activeMatcher: ILineMatcher;
	private _numberOfMatches: number;
	private buffer: string[];
	private bufferLength: number;
	private openModels: IStringDictionary<boolean>;
	private modelListeners: IDisposable[];

	constructor(problemMatchers: ProblemMatcher[], private modelService: IModelService) {
		super();
		this.matchers = Object.create(null);
		this.bufferLength = 1;
		problemMatchers.map(elem => createLineMatcher(elem)).forEach((matcher) => {
			let length = matcher.matchLength;
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
		this.openModels = Object.create(null);
		this.modelListeners = [];
		this.modelService.onModelAdded((model) => {
			this.openModels[model.uri.toString()] = true;
		}, this, this.modelListeners);
		this.modelService.onModelRemoved((model) => {
			delete this.openModels[model.uri.toString()];
		}, this, this.modelListeners);
		this.modelService.getModels().forEach(model => this.openModels[model.uri.toString()] = true);
	}

	public dispose() {
		this.modelListeners.forEach(disposable => disposable.dispose());
	}

	public get numberOfMatches(): number {
		return this._numberOfMatches;
	}

	protected tryFindMarker(line: string): ProblemMatch {
		let result: ProblemMatch = null;
		if (this.activeMatcher) {
			result = this.activeMatcher.next(line);
			if (result) {
				this._numberOfMatches++;
				return result;
			}
			this.clearBuffer();
			this.activeMatcher = null;
		}
		if (this.buffer.length < this.bufferLength) {
			this.buffer.push(line);
		} else {
			let end = this.buffer.length - 1;
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

	protected isOpen(resource: URI): boolean {
		return !!this.openModels[resource.toString()];
	}

	protected shouldApplyMatch(result: ProblemMatch): boolean {
		switch (result.description.applyTo) {
			case ApplyToKind.allDocuments:
				return true;
			case ApplyToKind.openDocuments:
				return this.openModels[result.resource.toString()];
			case ApplyToKind.closedDocuments:
				return !this.openModels[result.resource.toString()];
			default:
				return true;
		}
	}

	private tryMatchers(): ProblemMatch {
		this.activeMatcher = null;
		let length = this.buffer.length;
		for (let startIndex = 0; startIndex < length; startIndex++) {
			let candidates = this.matchers[length - startIndex];
			if (!candidates) {
				continue;
			}
			for (let i = 0; i < candidates.length; i++) {
				let matcher = candidates[i];
				let result = matcher.handle(this.buffer, startIndex);
				if (result.match) {
					this._numberOfMatches++;
					if (result.continue) {
						this.activeMatcher = matcher;
					}
					return result.match;
				}
			}
		}
		return null;
	}

	private clearBuffer(): void {
		if (this.buffer.length > 0) {
			this.buffer = [];
		}
	}
}

export enum ProblemHandlingStrategy {
	Clean
}

export class StartStopProblemCollector extends AbstractProblemCollector implements IProblemMatcher {
	private owners: string[];
	private markerService: IMarkerService;
	private strategy: ProblemHandlingStrategy;

	// Global state
	private currentResourcesWithMarkers: IStringDictionary<URI[]>;
	private reportedResourcesWithMarkers: IStringDictionary<IStringDictionary<URI>>;

	// Current State
	private currentResource: URI = null;
	private currentResourceAsString: string = null;
	private markers: IStringDictionary<IMarkerData[]> = Object.create(null);


	constructor(problemMatchers: ProblemMatcher[], markerService: IMarkerService, modelService: IModelService, strategy: ProblemHandlingStrategy = ProblemHandlingStrategy.Clean) {
		super(problemMatchers, modelService);
		let ownerSet: { [key: string]: boolean; } = Object.create(null);
		problemMatchers.forEach(description => ownerSet[description.owner] = true);
		this.owners = Object.keys(ownerSet);
		this.markerService = markerService;
		this.strategy = strategy;
		this.currentResourcesWithMarkers = Object.create(null);
		this.reportedResourcesWithMarkers = Object.create(null);
		this.owners.forEach((owner) => {
			this.currentResourcesWithMarkers[owner] = this.markerService.read({ owner: owner }).map(m => m.resource);
			this.reportedResourcesWithMarkers[owner] = Object.create(null);
		});
		this.currentResource = null;
		this.currentResourceAsString = null;
		this.markers = Object.create(null);
	}

	public processLine(line: string): void {
		let markerMatch = this.tryFindMarker(line);
		if (!markerMatch) {
			return;
		}

		let owner = markerMatch.description.owner;
		let resource = markerMatch.resource;
		let resourceAsString = resource.toString();
		let shouldApplyMatch = this.shouldApplyMatch(markerMatch);
		if (shouldApplyMatch) {
			if (this.currentResourceAsString !== resourceAsString) {
				if (this.currentResource) {
					Object.keys(this.markers).forEach((owner) => {
						this.markerService.changeOne(owner, this.currentResource, this.markers[owner]);
					});
					this.markers = Object.create(null);
				}
				this.reportedResourcesWithMarkers[owner][resourceAsString] = resource;
				this.currentResource = resource;
				this.currentResourceAsString = resourceAsString;
			}
			let markerData = this.markers[owner];
			if (!markerData) {
				markerData = [];
				this.markers[owner] = markerData;
			}
			markerData.push(markerMatch.marker);
		} else {
			this.reportedResourcesWithMarkers[owner][resourceAsString] = resource;
		}
	}

	public done(): void {
		if (this.currentResource) {
			Object.keys(this.markers).forEach((owner) => {
				this.markerService.changeOne(owner, this.currentResource, this.markers[owner]);
			});
		}
		if (this.strategy === ProblemHandlingStrategy.Clean) {
			Object.keys(this.currentResourcesWithMarkers).forEach((owner) => {
				let toRemove: URI[] = [];
				let withMarkers = this.reportedResourcesWithMarkers[owner];
				this.currentResourcesWithMarkers[owner].forEach((resource) => {
					if (!withMarkers[resource.toString()]) {
						toRemove.push(resource);
					}
				});
				this.markerService.remove(owner, toRemove);
			});
		}
		this.currentResource = null;
		this.currentResourceAsString = null;
		this.markers = Object.create(null);
	}
}

interface OwnedWatchingPattern {
	problemMatcher: ProblemMatcher;
	pattern: WatchingPattern;
}

export class WatchingProblemCollector extends AbstractProblemCollector implements IProblemMatcher {

	private problemMatchers: ProblemMatcher[];
	private watchingBeginsPatterns: OwnedWatchingPattern[];
	private watchingEndsPatterns: OwnedWatchingPattern[];
	private markerService: IMarkerService;

	// Current State
	private currentResource: URI;
	private currentResourceAsString: string;
	private markers: IStringDictionary<IMarkerData[]>;

	// Cleaning state
	private ignoreOpenResourcesByOwner: IStringDictionary<boolean>;
	private resourcesToClean: IStringDictionary<IStringDictionary<URI>>;

	constructor(problemMatchers: ProblemMatcher[], markerService: IMarkerService, modelService: IModelService) {
		super(problemMatchers, modelService);
		this.problemMatchers = problemMatchers;
		this.markerService = markerService;
		this.resetCurrentResource();
		this.resourcesToClean = Object.create(null);
		this.ignoreOpenResourcesByOwner = Object.create(null);
		this.watchingBeginsPatterns = [];
		this.watchingEndsPatterns = [];
		this.problemMatchers.forEach(matcher => {
			if (matcher.watching) {
				this.watchingBeginsPatterns.push({ problemMatcher: matcher, pattern: matcher.watching.beginsPattern });
				this.watchingEndsPatterns.push({ problemMatcher: matcher, pattern: matcher.watching.endsPattern });
			}
		});
	}

	public aboutToStart(): void {
		this.problemMatchers.forEach(matcher => {
			if (matcher.watching && matcher.watching.activeOnStart) {
				this.emit(ProblemCollectorEvents.WatchingBeginDetected, {});
				this.recordResourcesToClean(matcher.owner);
			}
			let value: boolean = this.ignoreOpenResourcesByOwner[matcher.owner];
			if (!value) {
				this.ignoreOpenResourcesByOwner[matcher.owner] = (matcher.applyTo === ApplyToKind.closedDocuments);
			} else {
				let newValue = value && (matcher.applyTo === ApplyToKind.closedDocuments);
				if (newValue !== value) {
					this.ignoreOpenResourcesByOwner[matcher.owner] = newValue;
				}
			}
		});
	}

	public processLine(line: string): void {
		if (this.tryBegin(line) || this.tryFinish(line)) {
			return;
		}
		let markerMatch = this.tryFindMarker(line);
		if (!markerMatch) {
			return;
		}
		let resource = markerMatch.resource;
		let owner = markerMatch.description.owner;
		let resourceAsString = resource.toString();
		let shouldApplyMatch = this.shouldApplyMatch(markerMatch);
		if (shouldApplyMatch) {
			if (this.currentResourceAsString !== resourceAsString) {
				this.removeResourceToClean(owner, resourceAsString);
				if (this.currentResource) {
					this.deliverMarkersForCurrentResource();
				}
				this.currentResource = resource;
				this.currentResourceAsString = resourceAsString;
			}
			let markerData = this.markers[owner];
			if (!markerData) {
				markerData = [];
				this.markers[owner] = markerData;
			}
			markerData.push(markerMatch.marker);
		} else {
			this.removeResourceToClean(owner, resourceAsString);
		}
	}

	public forceDelivery(): void {
		this.deliverMarkersForCurrentResource(false);
		Object.keys(this.resourcesToClean).forEach((owner) => {
			this.cleanMarkers(owner, false);
		});
		this.resourcesToClean = Object.create(null);
	}

	private tryBegin(line: string): boolean {
		let result = false;
		for (let i = 0; i < this.watchingBeginsPatterns.length; i++) {
			let beginMatcher = this.watchingBeginsPatterns[i];
			let matches = beginMatcher.pattern.regexp.exec(line);
			if (matches) {
				this.emit(ProblemCollectorEvents.WatchingBeginDetected, {});
				result = true;
				let owner = beginMatcher.problemMatcher.owner;
				if (matches[1]) {
					let resource = getResource(matches[1], beginMatcher.problemMatcher);
					if (this.currentResourceAsString && this.currentResourceAsString === resource.toString()) {
						this.resetCurrentResource();
					}
					this.recordResourceToClean(owner, resource);
				} else {
					this.recordResourcesToClean(owner);
					this.resetCurrentResource();
				}
			}
		}
		return result;
	}

	private tryFinish(line: string): boolean {
		let result = false;
		for (let i = 0; i < this.watchingEndsPatterns.length; i++) {
			let endMatcher = this.watchingEndsPatterns[i];
			let matches = endMatcher.pattern.regexp.exec(line);
			if (matches) {
				this.emit(ProblemCollectorEvents.WatchingEndDetected, {});
				result = true;
				let owner = endMatcher.problemMatcher.owner;
				this.cleanMarkers(owner);
				this.deliverMarkersForCurrentResource();
			}
		}
		return result;
	}

	private recordResourcesToClean(owner: string): void {
		let resourceSetToClean = this.getResourceSetToClean(owner);
		this.markerService.read({ owner: owner }).forEach(marker => resourceSetToClean[marker.resource.toString()] = marker.resource);
	}

	private recordResourceToClean(owner: string, resource: URI): void {
		this.getResourceSetToClean(owner)[resource.toString()] = resource;
	}

	private removeResourceToClean(owner: string, resource: string): void {
		let resourceSet = this.resourcesToClean[owner];
		if (resourceSet) {
			delete resourceSet[resource];
		}
	}

	private cleanMarkers(owner: string, remove: boolean = true): void {
		let resourceSet = this.resourcesToClean[owner];
		if (resourceSet) {
			let toClean = Object.keys(resourceSet).map(key => resourceSet[key]).filter(resource => {
				// Check whether we need to ignore open documents for this owner.
				return this.ignoreOpenResourcesByOwner[owner] ? !this.isOpen(resource) : true;
			});
			this.markerService.remove(owner, toClean);
			if (remove) {
				delete this.resourcesToClean[owner];
			}
		}
	}

	private deliverMarkersForCurrentResource(resetCurrentResource: boolean = true): void {
		if (this.currentResource) {
			Object.keys(this.markers).forEach((owner) => {
				this.markerService.changeOne(owner, this.currentResource, this.markers[owner]);
			});
		}
		if (resetCurrentResource) {
			this.resetCurrentResource();
		}
	}

	private getResourceSetToClean(owner: string): IStringDictionary<URI> {
		let result = this.resourcesToClean[owner];
		if (!result) {
			result = Object.create(null);
			this.resourcesToClean[owner] = result;
		}
		return result;
	}

	private resetCurrentResource(): void {
		this.currentResource = null;
		this.currentResourceAsString = null;
		this.markers = Object.create(null);
	}
}