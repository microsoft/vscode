/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { createServiceIdentifier } from '../../../../../util/common/services';
import { Command, StatusKind } from '../../types/src';

export interface StatusChangedEvent {
	kind: StatusKind;
	message?: string;
	busy: boolean;
	command?: Command;
}

export const ICompletionsStatusReporter = createServiceIdentifier<ICompletionsStatusReporter>('ICompletionsStatusReporter');
export interface ICompletionsStatusReporter {
	readonly _serviceBrand: undefined;

	busy: boolean;

	withProgress<T>(callback: () => Promise<T>): Promise<T>;

	forceStatus(kind: StatusKind, message?: string, command?: Command): void;
	forceNormal(): void;
	setError(message: string, command?: Command): void;
	setWarning(message: string): void;
	setInactive(message: string): void;
	clearInactive(): void;
}

export abstract class StatusReporter implements ICompletionsStatusReporter {
	declare _serviceBrand: undefined;

	#inProgressCount = 0;
	#kind: StatusKind = 'Normal';
	#message: string | undefined;
	#command: Command | undefined;
	#startup = true;

	abstract didChange(event: StatusChangedEvent): void;

	get busy() {
		return this.#inProgressCount > 0;
	}

	withProgress<T>(callback: () => Promise<T>): Promise<T> {
		if (this.#kind === 'Warning') { this.forceNormal(); }
		if (this.#inProgressCount++ === 0) { this.#didChange(); }
		return callback().finally(() => {
			if (--this.#inProgressCount === 0) { this.#didChange(); }
		});
	}

	forceStatus(kind: StatusKind, message?: string, command?: Command) {
		if (this.#kind === kind && this.#message === message && !command && !this.#command && !this.#startup) { return; }
		this.#kind = kind;
		this.#message = message;
		this.#command = command;
		this.#startup = false;
		this.#didChange();
	}

	forceNormal() {
		if (this.#kind === 'Inactive') { return; }
		this.forceStatus('Normal');
	}

	setError(message: string, command?: Command) {
		this.forceStatus('Error', message, command);
	}

	setWarning(message: string) {
		if (this.#kind === 'Error') { return; }
		this.forceStatus('Warning', message);
	}

	setInactive(message: string) {
		if (this.#kind === 'Error' || this.#kind === 'Warning') { return; }
		this.forceStatus('Inactive', message);
	}

	clearInactive() {
		if (this.#kind !== 'Inactive') { return; }
		this.forceStatus('Normal');
	}

	#didChange() {
		const event = { kind: this.#kind, message: this.#message, busy: this.busy, command: this.#command };
		this.didChange(event);
	}
}

// Don't delete. Needed for tests that don't care about status changes
export class NoOpStatusReporter extends StatusReporter {
	override didChange() { }
}
