export class Foo {
	public foo(): void {
	}
}

export interface Bar {
	bar(): void;
}

export type Baz = {
	baz(): void;
	bazz: () => number;
}

export enum Enum {
	a = 1,
	b = 2
}

export const enum CEnum {
	a = 1,
	b = 2
}