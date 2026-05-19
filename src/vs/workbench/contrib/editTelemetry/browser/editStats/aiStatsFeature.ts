/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { TaskQueue, timeout } from '../../../../../base/common/async.js';
import { Disposable, DisposableStore, toDisposable } from '../../../../../base/common/lifecycle.js';
import { autorun, derived, IObservable, observableValue } from '../../../../../base/common/observable.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../../platform/storage/common/storage.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import { localize } from '../../../../../nls.js';
import { IChatStatusDashboardSectionService } from '../../../chat/browser/chatStatus/chatStatusDashboardSectionService.js';
import { IChatModel, IChatRequestModel } from '../../../chat/common/model/chatModel.js';
import { IChatService } from '../../../chat/common/chatService/chatService.js';
import { createAiStatsHover } from './aiStatsView.js';

export interface IAiStatsOverview {
	readonly totalTokens: number;
	/** Mean tokens per active day (days with at least one chat request) within the range. */
	readonly avgTokensPerDay: number;
	readonly currentStreak: number;
	/** Identifier of the most-used model in the range, or undefined if no data. */
	readonly favoriteModel: string | undefined;
	/** Day with the highest token usage in the range, or undefined if no data. */
	readonly topDay: { readonly dateMs: number; readonly tokens: number } | undefined;
}

const DAY_MS = 24 * 60 * 60 * 1000;

interface IDayBucket {
	requests: number;
	tokens: number;
	hourBuckets: number[]; // length 24
	modelCounts: { [modelId: string]: number };
}

interface IAiStatsData {
	/** Day bucket keyed by yyyymmdd (local time). */
	days: { [day: string]: IDayBucket };
}

const MAX_DAYS_RETAINED = 30;

export class AiStatsFeature extends Disposable {

	private readonly _data: IValue<IAiStatsData>;
	private readonly _dataVersion = observableValue(this, 0);
	private readonly _recomputeTick = observableValue(this, 0);

	/**
	 * Bumps the {@link overview} derived so callers (e.g. the status bar hover)
	 * can force a recomputation, picking up things like a date rollover that
	 * does not produce a new chat request.
	 */
	triggerRecompute(): void {
		this._recomputeTick.set(this._recomputeTick.get() + 1, undefined);
	}

	constructor(
		@IStorageService private readonly _storageService: IStorageService,
		@IChatService private readonly _chatService: IChatService,
		@IChatStatusDashboardSectionService private readonly _sectionService: IChatStatusDashboardSectionService,
		@ITelemetryService private readonly _telemetryService: ITelemetryService,
	) {
		super();

		const storedValue = getStoredValue<IAiStatsData>(this._storageService, 'chatUsageStats', StorageScope.PROFILE, StorageTarget.USER);
		this._data = rateLimitWrite(storedValue, 1, this._store);

		// Listen to all chat models, current and future
		this._register(autorun(reader => {
			const models = this._chatService.chatModels.read(reader);
			for (const model of models) {
				reader.store.add(this._observeModel(model));
			}
		}));

		// Register a collapsible section in the Copilot status menu
		this._register(this._sectionService.registerSection({
			id: 'aiStats',
			title: localize('aiStats.section', "Metrics"),
			render: container => {
				this.triggerRecompute();
				this._sendOpenTelemetry();
				const store = new DisposableStore();
				const elem = createAiStatsHover({
					data: this,
				}).keepUpdated(store);
				container.appendChild(elem.element);
				return store;
			}
		}));
	}

	private _sendOpenTelemetry(): void {
		const overview = this.overview.get();
		this._telemetryService.publicLog2<{
			totalTokens: number;
			avgTokensPerDay: number;
		}, {
			owner: 'hediet';
			comment: 'Fired when the AI usage stats section is rendered in the Copilot status menu';
			totalTokens: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Total completion tokens counted' };
			avgTokensPerDay: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Mean tokens per active day in range' };
		}>('aiStatsStatusBar.hover', {
			totalTokens: overview.totalTokens,
			avgTokensPerDay: overview.avgTokensPerDay,
		});
	}

	private _observeModel(model: IChatModel): DisposableStore {
		const store = new DisposableStore();

		// Track tokens we've already added per request to avoid double counting
		const tokensAddedByRequestId = new Map<string, number>();

		// Process any requests already on the model when we attach
		for (const req of model.getRequests()) {
			this._recordRequest(req);
			const tokens = req.response?.completionTokenCount;
			if (typeof tokens === 'number' && tokens > 0) {
				tokensAddedByRequestId.set(req.id, tokens);
				this._recordTokens(req, tokens);
			}
		}

		store.add(model.onDidChange(e => {
			if (e.kind === 'addRequest') {
				this._recordRequest(e.request);
			} else if (e.kind === 'completedRequest' || e.kind === 'changedRequest') {
				const tokens = e.request.response?.completionTokenCount ?? 0;
				const previously = tokensAddedByRequestId.get(e.request.id) ?? 0;
				const delta = tokens - previously;
				if (delta > 0) {
					tokensAddedByRequestId.set(e.request.id, tokens);
					this._recordTokens(e.request, delta);
				}
			} else if (e.kind === 'removeRequest') {
				tokensAddedByRequestId.delete(e.requestId);
			}
		}));

		return store;
	}

	private _recordRequest(request: IChatRequestModel): void {
		const data = this._getData();
		const ts = request.timestamp ?? Date.now();
		const date = new Date(ts);
		const bucket = this._getDayBucket(data, date);
		bucket.requests += 1;
		bucket.hourBuckets[date.getHours()] += 1;
		const modelId = request.modelId;
		if (modelId) {
			bucket.modelCounts[modelId] = (bucket.modelCounts[modelId] ?? 0) + 1;
		}
		this._persist(data);
	}

	private _recordTokens(request: IChatRequestModel, deltaTokens: number): void {
		const data = this._getData();
		const ts = request.timestamp ?? Date.now();
		const bucket = this._getDayBucket(data, new Date(ts));
		bucket.tokens += deltaTokens;
		this._persist(data);
	}

	private _getData(): IAiStatsData {
		return this._data.getValue() ?? { days: {} };
	}

	private _getDayBucket(data: IAiStatsData, date: Date): IDayBucket {
		const key = dayKey(date);
		let bucket = data.days[key];
		if (!bucket) {
			bucket = {
				requests: 0,
				tokens: 0,
				hourBuckets: new Array<number>(24).fill(0),
				modelCounts: {},
			};
			data.days[key] = bucket;
			// Trim oldest days
			const allKeys = Object.keys(data.days).sort();
			while (allKeys.length > MAX_DAYS_RETAINED) {
				const removed = allKeys.shift()!;
				delete data.days[removed];
			}
		}
		// Defensive: ensure shape after JSON round-trip
		if (!Array.isArray(bucket.hourBuckets) || bucket.hourBuckets.length !== 24) {
			const next = new Array<number>(24).fill(0);
			if (Array.isArray(bucket.hourBuckets)) {
				for (let i = 0; i < Math.min(24, bucket.hourBuckets.length); i++) {
					next[i] = bucket.hourBuckets[i] ?? 0;
				}
			}
			bucket.hourBuckets = next;
		}
		if (!bucket.modelCounts) {
			bucket.modelCounts = {};
		}
		return bucket;
	}

	private _persist(data: IAiStatsData): void {
		this._data.writeValue(data);
		this._dataVersion.set(this._dataVersion.get() + 1, undefined);
	}

	readonly overview: IObservable<IAiStatsOverview> = derived(this, reader => {
		this._dataVersion.read(reader);
		this._recomputeTick.read(reader);
		return computeOverview(this._getData(), Date.now());
	});
}

function dayKey(date: Date): string {
	const y = date.getFullYear();
	const m = (date.getMonth() + 1).toString().padStart(2, '0');
	const d = date.getDate().toString().padStart(2, '0');
	return `${y}${m}${d}`;
}

function dayKeyFromTimestamp(ts: number): string {
	return dayKey(new Date(ts));
}

export function computeOverview(data: IAiStatsData, now: number): IAiStatsOverview {
	const startOfToday = new Date(now);
	startOfToday.setHours(0, 0, 0, 0);

	const cutoff = startOfToday.getTime() - 29 * DAY_MS;

	const allKeys = Object.keys(data.days).sort();
	const includedKeys = allKeys.filter(k => parseDayKey(k) >= cutoff);

	let tokens = 0;
	const modelTotals = new Map<string, number>();
	let topDay: { dateMs: number; tokens: number } | undefined;

	for (const key of includedKeys) {
		const bucket = data.days[key];
		tokens += bucket.tokens;
		if (bucket.tokens > 0 && (!topDay || bucket.tokens > topDay.tokens)) {
			topDay = { dateMs: parseDayKey(key), tokens: bucket.tokens };
		}
		if (bucket.modelCounts) {
			for (const [m, c] of Object.entries(bucket.modelCounts)) {
				modelTotals.set(m, (modelTotals.get(m) ?? 0) + c);
			}
		}
	}

	// Current streak computed within the included range
	const activeDayKeys = includedKeys.filter(k => data.days[k].requests > 0);
	const activeDaySet = new Set(activeDayKeys);
	const currentStreak = computeCurrentStreak(activeDaySet, startOfToday.getTime(), cutoff);

	// Average tokens per active day (days with at least one chat request).
	const avgTokensPerDay = activeDayKeys.length > 0
		? Math.round(tokens / activeDayKeys.length)
		: 0;

	let favoriteModel: string | undefined;
	let favoriteCount = 0;
	for (const [m, c] of modelTotals) {
		if (c > favoriteCount) {
			favoriteCount = c;
			favoriteModel = m;
		}
	}

	return {
		totalTokens: tokens,
		avgTokensPerDay,
		currentStreak,
		favoriteModel,
		topDay,
	};
}

function parseDayKey(key: string): number {
	const y = parseInt(key.substring(0, 4), 10);
	const m = parseInt(key.substring(4, 6), 10) - 1;
	const d = parseInt(key.substring(6, 8), 10);
	return new Date(y, m, d).getTime();
}

function computeCurrentStreak(activeDays: ReadonlySet<string>, todayMs: number, cutoff: number | undefined): number {
	// Current streak: consecutive trailing days ending today (or yesterday if today not active)
	let current = 0;
	let cursor = todayMs;
	// If today not active, start from yesterday
	if (!activeDays.has(dayKeyFromTimestamp(cursor))) {
		cursor -= DAY_MS;
	}
	while (activeDays.has(dayKeyFromTimestamp(cursor))) {
		if (cutoff !== undefined && cursor < cutoff) {
			break;
		}
		current++;
		cursor -= DAY_MS;
	}
	return current;
}

interface IValue<T> {
	writeValue(value: T | undefined): void;
	getValue(): T | undefined;
}

function rateLimitWrite<T>(targetValue: IValue<T>, maxWritesPerSecond: number, store: DisposableStore): IValue<T> {
	const queue = new TaskQueue();
	const minIntervalMs = 1000 / maxWritesPerSecond;
	let _value: T | undefined = undefined;
	let valueVersion = 0;
	let savedVersion = 0;
	store.add(toDisposable(() => {
		if (valueVersion !== savedVersion) {
			targetValue.writeValue(_value);
			savedVersion = valueVersion;
		}
	}));

	return {
		writeValue(value: T | undefined): void {
			valueVersion++;
			const v = valueVersion;
			_value = value;

			queue.clearPending();
			queue.schedule(async () => {
				targetValue.writeValue(value);
				savedVersion = v;
				await timeout(minIntervalMs);
			});
		},
		getValue(): T | undefined {
			if (valueVersion > 0) {
				return _value;
			}
			return targetValue.getValue();
		}
	};
}

function getStoredValue<T>(service: IStorageService, key: string, scope: StorageScope, target: StorageTarget): IValue<T> {
	let lastValue: T | undefined = undefined;
	let hasLastValue = false;
	return {
		writeValue(value: T | undefined): void {
			if (value === undefined) {
				service.remove(key, scope);
			} else {
				service.store(key, JSON.stringify(value), scope, target);
			}
			lastValue = value;
			hasLastValue = true;
		},
		getValue(): T | undefined {
			if (hasLastValue) {
				return lastValue;
			}
			const strVal = service.get(key, scope);
			if (strVal === undefined) {
				lastValue = undefined;
			} else {
				try {
					lastValue = JSON.parse(strVal) as T | undefined;
				} catch {
					lastValue = undefined;
				}
			}
			hasLastValue = true;
			return lastValue;
		}
	};
}
