/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IObservableWithChange, IReader } from './base.js';

export interface IChangeTracker<TChangeSummary> {
	createChangeSummary(previousChangeSummary: TChangeSummary | undefined): TChangeSummary;
	handleChange(ctx: IChangeContext, change: TChangeSummary): boolean;
	beforeUpdate?(reader: IReader, change: TChangeSummary): void;
}

export interface IChangeContext {
	readonly changedObservable: IObservableWithChange<any, any>;
	readonly change: unknown;

	/**
	 * Returns if the given observable caused the change.
	 */
	didChange<T, TChange>(observable: IObservableWithChange<T, TChange>): this is { change: TChange };
}

export function recordChanges<TObs extends Record<any, IObservableWithChange<any, any>>>(obs: TObs):
	IChangeTracker<{ [TKey in keyof TObs]: ReturnType<TObs[TKey]['get']> }
		& { changes: readonly ({ [TKey in keyof TObs]: { key: TKey; change: TObs[TKey]['TChange'] } }[keyof TObs])[] }> {
	return {
		createChangeSummary: (_previousChangeSummary) => {
			return {
				changes: [],
			} as any;
		},
		handleChange(ctx, changeSummary) {
			for (const key in obs) {
				if (ctx.didChange(obs[key])) {
					(changeSummary.changes as any).push({ key, change: ctx.change });
				}
			}
			return true;
		},
		beforeUpdate(reader, changeSummary) {
			for (const key in obs) {
				changeSummary[key] = obs[key].read(reader);
			}
		}
	};
}
