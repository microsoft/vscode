/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/


export class DelaySession {
	private extraDebounce = 0;

	constructor(
		private baseDebounceTime: number,
		private expectedTotalTime: number | undefined,
		private readonly providerInvocationTime: number = Date.now(),
	) {
	}

	public setExtraDebounce(extraDebounce: number): void {
		this.extraDebounce = extraDebounce;
	}

	public setBaseDebounceTime(baseDebounceTime: number): void {
		this.baseDebounceTime = baseDebounceTime;
	}

	public setExpectedTotalTime(expectedTotalTime: number): void {
		this.expectedTotalTime = expectedTotalTime;
	}

	getDebounceTime() {
		const expectedDebounceTime = this.expectedTotalTime === undefined
			? this.baseDebounceTime
			: Math.min(this.baseDebounceTime, this.expectedTotalTime);

		const expectedDebounceTimeWithExtras = expectedDebounceTime + this.extraDebounce;

		const timeAlreadySpent = Date.now() - this.providerInvocationTime;
		const actualDebounceTime = Math.max(0, expectedDebounceTimeWithExtras - timeAlreadySpent);

		return actualDebounceTime;
	}

	getArtificialDelay() {
		if (this.expectedTotalTime === undefined) {
			return 0;
		}

		const timeAlreadySpent = Date.now() - this.providerInvocationTime;
		const delay = Math.max(0, this.expectedTotalTime - timeAlreadySpent);
		return delay;
	}
}
