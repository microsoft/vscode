/*---------------------------------------------------------------------------------------------
 *  Copyright (c) RoboAgent. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export interface IDisposable {
	dispose(): void;
}

export function toDisposable(fn: () => void): IDisposable {
	let disposed = false;
	return {
		dispose: () => {
			if (!disposed) {
				disposed = true;
				fn();
			}
		}
	};
}

/** Collects disposables and disposes them together (last added, first disposed). */
export class DisposableStore implements IDisposable {
	private readonly items: IDisposable[] = [];
	private disposed = false;

	add<T extends IDisposable>(item: T): T {
		if (this.disposed) {
			item.dispose();
		} else {
			this.items.push(item);
		}
		return item;
	}

	dispose(): void {
		if (this.disposed) {
			return;
		}
		this.disposed = true;
		while (this.items.length) {
			this.items.pop()!.dispose();
		}
	}
}
