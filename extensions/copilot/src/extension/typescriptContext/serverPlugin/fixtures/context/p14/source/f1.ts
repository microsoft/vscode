export interface Result {
	value: number;
	message: string;
}

export class Calculator {
	private result: number;

	constructor(initial: number = 0) {
		this.result = initial;
	}

	public add(x: number): Calculator {
		this.result += x;
		return this;
	}

	public getResult(): Result {
		return {
			value: this.result,
			message: `Result is ${this.result}`
		};
	}
}

export function createCalculator(initial?: number): Calculator {
	return new Calculator(initial);
}

export function getValue(): number {
	return 42;
}
