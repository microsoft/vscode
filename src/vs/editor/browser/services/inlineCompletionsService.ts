/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { TimeoutTimer } from '../../../base/common/async.js';
import { BugIndicatingError } from '../../../base/common/errors.js';
import { Emitter, Event } from '../../../base/common/event.js';
import { Disposable } from '../../../base/common/lifecycle.js';
import { localize, localize2 } from '../../../nls.js';
import { Action2 } from '../../../platform/actions/common/actions.js';
import { ContextKeyExpr, IContextKeyService, RawContextKey } from '../../../platform/contextkey/common/contextkey.js';
import { InstantiationType, registerSingleton } from '../../../platform/instantiation/common/extensions.js';
import { createDecorator, ServicesAccessor } from '../../../platform/instantiation/common/instantiation.js';
import { IQuickInputService, IQuickPickItem } from '../../../platform/quickinput/common/quickInput.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../platform/storage/common/storage.js';
import { ITelemetryService } from '../../../platform/telemetry/common/telemetry.js';

export const IInlineCompletionsService = createDecorator<IInlineCompletionsService>('IInlineCompletionsService');

export interface IInlineCompletionsService {
	readonly _serviceBrand: undefined;

	readonly onDidChangeIsSnoozing: Event<boolean>;

	/**
	 * Get the remaining time (in ms) for which inline completions should be snoozed,
	 * or 0 if not snoozed.
	 */
	readonly snoozeTimeLeft: number;

	/**
	 * Snooze inline completions for the specified duration. If already snoozed, extend the snooze time.
	 */
	snooze(durationMs?: number): void;

	/**
	 * Snooze inline completions for the specified duration. If already snoozed, overwrite the existing snooze time.
	 */
	setSnoozeDuration(durationMs: number): void;

	/**
	 * Check if inline completions are currently snoozed.
	*/
	isSnoozing(): boolean;

	/**
	 * Cancel the current snooze.
	*/
	cancelSnooze(): void;

	/**
	 * Report an inline completion.
	 */
	reportNewCompletion(requestUuid: string): void;
}

const InlineCompletionsSnoozing = new RawContextKey<boolean>('inlineCompletions.snoozed', false, localize('inlineCompletions.snoozed', "Whether inline completions are currently snoozed"));

export class InlineCompletionsService extends Disposable implements IInlineCompletionsService {
	declare readonly _serviceBrand: undefined;

	private _onDidChangeIsSnoozing = this._register(new Emitter<boolean>());
	readonly onDidChangeIsSnoozing: Event<boolean> = this._onDidChangeIsSnoozing.event;

	private static readonly SNOOZE_DURATION = 300_000; // 5 minutes

	private _snoozeTimeEnd: undefined | number = undefined;
	get snoozeTimeLeft(): number {
		if (this._snoozeTimeEnd === undefined) {
			return 0;
		}
		return Math.max(0, this._snoozeTimeEnd - Date.now());
	}

	private _timer: TimeoutTimer;

	constructor(
		@IContextKeyService private _contextKeyService: IContextKeyService,
		@ITelemetryService private _telemetryService: ITelemetryService,
	) {
		super();

		this._timer = this._register(new TimeoutTimer());

		const inlineCompletionsSnoozing = InlineCompletionsSnoozing.bindTo(this._contextKeyService);
		this._register(this.onDidChangeIsSnoozing(() => inlineCompletionsSnoozing.set(this.isSnoozing())));
	}

	snooze(durationMs: number = InlineCompletionsService.SNOOZE_DURATION): void {
		this.setSnoozeDuration(durationMs + this.snoozeTimeLeft);
	}

	setSnoozeDuration(durationMs: number): void {
		if (durationMs < 0) {
			throw new BugIndicatingError(`Invalid snooze duration: ${durationMs}. Duration must be non-negative.`);
		}
		if (durationMs === 0) {
			this.cancelSnooze();
			return;
		}

		const wasSnoozing = this.isSnoozing();
		const timeLeft = this.snoozeTimeLeft;

		this._snoozeTimeEnd = Date.now() + durationMs;

		if (!wasSnoozing) {
			this._onDidChangeIsSnoozing.fire(true);
		}

		this._timer.cancelAndSet(
			() => {
				if (!this.isSnoozing()) {
					this._onDidChangeIsSnoozing.fire(false);
				} else {
					throw new BugIndicatingError('Snooze timer did not fire as expected');
				}
			},
			this.snoozeTimeLeft + 1,
		);

		this._reportSnooze(durationMs - timeLeft, durationMs);
	}

	isSnoozing(): boolean {
		return this.snoozeTimeLeft > 0;
	}

	cancelSnooze(): void {
		if (this.isSnoozing()) {
			this._reportSnooze(-this.snoozeTimeLeft, 0);
			this._snoozeTimeEnd = undefined;
			this._timer.cancel();
			this._onDidChangeIsSnoozing.fire(false);
		}
	}

	private _lastCompletionId: string | undefined;
	private _recentCompletionIds: string[] = [];
	reportNewCompletion(requestUuid: string): void {
		this._lastCompletionId = requestUuid;

		this._recentCompletionIds.unshift(requestUuid);
		if (this._recentCompletionIds.length > 5) {
			this._recentCompletionIds.pop();
		}
	}

	private _reportSnooze(deltaMs: number, totalMs: number): void {
		const deltaSeconds = Math.round(deltaMs / 1000);
		const totalSeconds = Math.round(totalMs / 1000);
		type WorkspaceStatsClassification = {
			owner: 'benibenj';
			comment: 'Snooze duration for inline completions';
			deltaSeconds: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The duration by which the snooze has changed, in seconds.' };
			totalSeconds: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The total duration for which inline completions are snoozed, in seconds.' };
			lastCompletionId: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The ID of the last completion.' };
			recentCompletionIds: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The IDs of the recent completions.' };
		};
		type WorkspaceStatsEvent = {
			deltaSeconds: number;
			totalSeconds: number;
			lastCompletionId: string | undefined;
			recentCompletionIds: string[];
		};
		this._telemetryService.publicLog2<WorkspaceStatsEvent, WorkspaceStatsClassification>('inlineCompletions.snooze', {
			deltaSeconds,
			totalSeconds,
			lastCompletionId: this._lastCompletionId,
			recentCompletionIds: this._recentCompletionIds,
		});
	}
}

registerSingleton(IInlineCompletionsService, InlineCompletionsService, InstantiationType.Delayed);

const snoozeInlineSuggestId = 'editor.action.inlineSuggest.snooze';
const cancelSnoozeInlineSuggestId = 'editor.action.inlineSuggest.cancelSnooze';
const LAST_SNOOZE_DURATION_KEY = 'inlineCompletions.lastSnoozeDuration';

export class SnoozeInlineCompletion extends Action2 {
	public static ID = snoozeInlineSuggestId;
	constructor() {
		super({
			id: SnoozeInlineCompletion.ID,
			title: localize2('action.inlineSuggest.snooze', "Snooze Inline Suggestions"),
			precondition: ContextKeyExpr.true(),
			f1: true,
		});
	}

	public async run(accessor: ServicesAccessor, ...args: unknown[]): Promise<void> {
		const quickInputService = accessor.get(IQuickInputService);
		const inlineCompletionsService = accessor.get(IInlineCompletionsService);
		const storageService = accessor.get(IStorageService);

		let durationMs: number | undefined;
		if (args.length > 0 && typeof args[0] === 'number') {
			durationMs = args[0] * 60_000;
		}

		if (!durationMs) {
			durationMs = await this.getDurationFromUser(quickInputService, storageService);
		}

		if (durationMs) {
			inlineCompletionsService.setSnoozeDuration(durationMs);
		}
	}

	private async getDurationFromUser(quickInputService: IQuickInputService, storageService: IStorageService): Promise<number | undefined> {
		const lastSelectedDuration = storageService.getNumber(LAST_SNOOZE_DURATION_KEY, StorageScope.PROFILE, 300_000);

		const items: (IQuickPickItem & { value: number })[] = [
			{ label: '1 minute', id: '1', value: 60_000 },
			{ label: '5 minutes', id: '5', value: 300_000 },
			{ label: '10 minutes', id: '10', value: 600_000 },
			{ label: '15 minutes', id: '15', value: 900_000 },
			{ label: '30 minutes', id: '30', value: 1_800_000 },
			{ label: '60 minutes', id: '60', value: 3_600_000 }
		];

		const picked = await quickInputService.pick(items, {
			placeHolder: localize('snooze.placeholder', "Select snooze duration for Inline Suggestions"),
			activeItem: items.find(item => item.value === lastSelectedDuration),
		});

		if (picked) {
			storageService.store(LAST_SNOOZE_DURATION_KEY, picked.value, StorageScope.PROFILE, StorageTarget.USER);
			return picked.value;
		}

		return undefined;
	}
}

export class CancelSnoozeInlineCompletion extends Action2 {
	public static ID = cancelSnoozeInlineSuggestId;
	constructor() {
		super({
			id: CancelSnoozeInlineCompletion.ID,
			title: localize2('action.inlineSuggest.cancelSnooze', "Cancel Snooze Inline Suggestions"),
			precondition: InlineCompletionsSnoozing,
			f1: true,
		});
	}

	public async run(accessor: ServicesAccessor): Promise<void> {
		accessor.get(IInlineCompletionsService).cancelSnooze();
	}
}
