/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export type Dispatch<A> = (value: A) => void;
export type StateUpdater<S> = S | ((prevState: S) => S);

export class UseState {
	private currentIndex: number = 0;
	private stateChanged: boolean = false;

	constructor(private readonly states: unknown[]) { }

	useState<S = undefined>(): [S | undefined, Dispatch<StateUpdater<S | undefined>>];
	useState<S>(initialState: S | (() => S)): [S, Dispatch<StateUpdater<S>>];
	useState<S>(initialState?: S | (() => S)): [S | undefined, Dispatch<StateUpdater<S | undefined>>] {
		const index = this.currentIndex;

		// Initialize state if not exists
		if (this.states[index] === undefined) {
			const initial = typeof initialState === 'function' ? (initialState as () => S)() : initialState;
			this.states[index] = initial;
		}

		const setState = (newState: StateUpdater<S | undefined>) => {
			const nextState =
				typeof newState === 'function' ? (newState as (prevState: S) => S)(this.states[index] as S) : newState;
			this.states[index] = nextState;
			this.stateChanged = true;
		};

		this.currentIndex++;
		return [this.states[index] as S, setState];
	}

	hasChanged(): boolean {
		return this.stateChanged;
	}
}

export type TypePredicate<T> = (data: unknown) => data is T;
export type DataConsumer<T> = (data: T) => void | Promise<void>;

export class UseData {
	private consumers: DataConsumer<unknown>[] = [];

	constructor(private readonly measureUpdateTime: (updateTimeMs: number) => void) { }

	useData<T>(typePredicate: TypePredicate<T>, consumer: DataConsumer<T>): void {
		this.consumers.push((data: unknown) => {
			if (typePredicate(data)) {
				return consumer(data);
			}
		});
	}

	async updateData(data: unknown) {
		if (this.consumers.length > 0) {
			const start = performance.now();
			for (const consumer of this.consumers) {
				await consumer(data);
			}
			this.measureUpdateTime(performance.now() - start);
		}
	}
}
