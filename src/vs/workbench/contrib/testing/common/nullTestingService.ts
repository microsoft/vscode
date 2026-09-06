/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../../base/common/event.js';
import { Iterable } from '../../../../base/common/iterator.js';
import { Disposable, IDisposable } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { Position } from '../../../../editor/common/core/position.js';
import { Location } from '../../../../editor/common/languages.js';
import { IUriIdentityService } from '../../../../platform/uriIdentity/common/uriIdentity.js';
import { MainThreadTestCollection } from './mainThreadTestCollection.js';
import { MutableObservableValue } from './observableValue.js';
import { TestExclusions } from './testExclusions.js';
import { ITestProfileService } from './testProfileService.js';
import { ITestResult, LiveTestResult } from './testResult.js';
import { ITestResultService } from './testResultService.js';
import { IMainThreadTestCollection, ITestFollowups, ITestService } from './testService.js';
import { InternalTestItem } from './testTypes.js';

class NullTestExclusions extends Disposable {
	readonly onTestExclusionsChanged = Event.None;
	get hasAny() { return false; }
	get all(): Iterable<string> { return Iterable.empty(); }
	toggle(): void { }
	contains(): boolean { return false; }
	clear(): void { }
}

export class NullTestService extends Disposable implements ITestService {

	declare readonly _serviceBrand: undefined;

	readonly onDidCancelTestRun = Event.None;
	readonly onWillProcessDiff = Event.None;
	readonly onDidProcessDiff = Event.None;

	readonly excluded = this._register(new NullTestExclusions()) as unknown as TestExclusions;
	readonly collection: IMainThreadTestCollection;
	readonly showInlineOutput = this._register(new MutableObservableValue<boolean>(false));

	constructor(@IUriIdentityService uriIdentityService: IUriIdentityService) {
		super();
		this.collection = new MainThreadTestCollection(uriIdentityService, () => Promise.resolve());
	}

	registerExtHost(): IDisposable { return Disposable.None; }
	registerTestController(): IDisposable { return Disposable.None; }
	getTestController() { return undefined; }
	async refreshTests(): Promise<void> { }
	cancelRefreshTests(): void { }
	async startContinuousRun(): Promise<void> { }
	async runTests(): Promise<ITestResult> { throw new Error('Tests are not supported in this window.'); }
	async runResolvedTests(): Promise<ITestResult> { throw new Error('Tests are not supported in this window.'); }
	async provideTestFollowups(): Promise<ITestFollowups> {
		return { followups: [], dispose() { } };
	}
	async syncTests(): Promise<void> { }
	cancelTestRun(): void { }
	publishDiff(): void { }
	async getTestsRelatedToCode(_uri: URI, _position: Position): Promise<InternalTestItem[]> { return []; }
	async getCodeRelatedToTest(): Promise<Location[]> { return []; }
}

export class NullTestProfileService extends Disposable implements ITestProfileService {

	declare readonly _serviceBrand: undefined;

	readonly onDidChange = Event.None;

	addProfile(): void { }
	updateProfile(): void { }
	removeProfile(): void { }
	capabilitiesForTest(): number { return 0; }
	configure(): void { }
	all() { return Iterable.empty(); }
	getGroupDefaultProfiles() { return []; }
	setGroupDefaultProfiles(): void { }
	getControllerProfiles() { return []; }
	getDefaultProfileForTest() { return undefined; }
}

export class NullTestResultService extends Disposable implements ITestResultService {

	declare readonly _serviceBrand: undefined;

	readonly onResultsChanged = Event.None;
	readonly onTestChanged = Event.None;
	readonly results: ReadonlyArray<ITestResult> = [];

	clear(): void { }
	createLiveResult(): LiveTestResult { throw new Error('Tests are not supported in this window.'); }
	push<T extends ITestResult>(result: T): T { return result; }
	getResult(): ITestResult | undefined { return undefined; }
	getStateById() { return undefined; }
}

