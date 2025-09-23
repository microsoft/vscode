/*
 * limiter.ts
 *
 * Copyright (C) 2023 by Posit Software, PBC
 * Copyright (c) Microsoft Corporation. All rights reserved.
 *
 * Unless you have received this program directly from Posit Software pursuant
 * to the terms of a commercial license agreement with Posit Software, then
 * this program is licensed to you under the terms of version 3 of the
 * GNU Affero General Public License. This program is distributed WITHOUT
 * ANY EXPRESS OR IMPLIED WARRANTY, INCLUDING THOSE OF NON-INFRINGEMENT,
 * MERCHANTABILITY OR FITNESS FOR A PARTICULAR PURPOSE. Please refer to the
 * AGPL (http://www.gnu.org/licenses/agpl-3.0.txt) for more details.
 *
 */

interface ILimitedTaskFactory<T> {
	factory: ITask<Promise<T>>;
	c: (value: T | Promise<T>) => void;
	e: (error?: unknown) => void;
}

interface ITask<T> {
	(): T;
}

/**
 * A helper to queue N promises and run them all with a max degree of parallelism. The helper
 * ensures that at any time no more than M promises are running at the same time.
 *
 * Taken from 'src/vs/base/common/async.ts'
 */
export class Limiter<T> {

	#size = 0;
	#runningPromises: number;
	readonly #maxDegreeOfParalellism: number;
	readonly #outstandingPromises: ILimitedTaskFactory<T>[];

	constructor(maxDegreeOfParalellism: number) {
		this.#maxDegreeOfParalellism = maxDegreeOfParalellism;
		this.#outstandingPromises = [];
		this.#runningPromises = 0;
	}

	get size(): number {
		return this.#size;
	}

	queue(factory: ITask<Promise<T>>): Promise<T> {
		this.#size++;

		return new Promise<T>((c, e) => {
			this.#outstandingPromises.push({ factory, c, e });
			this.#consume();
		});
	}

	#consume(): void {
		while (this.#outstandingPromises.length && this.#runningPromises < this.#maxDegreeOfParalellism) {
			const iLimitedTask = this.#outstandingPromises.shift()!;
			this.#runningPromises++;

			const promise = iLimitedTask.factory();
			promise.then(iLimitedTask.c, iLimitedTask.e);
			promise.then(() => this.#consumed(), () => this.#consumed());
		}
	}

	#consumed(): void {
		this.#size--;
		this.#runningPromises--;

		if (this.#outstandingPromises.length > 0) {
			this.#consume();
		}
	}
}
