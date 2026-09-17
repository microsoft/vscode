enum MyEnum {
	//// { "title": "Enum - rename", "oldName": "One", "newName": "Four", "expected": "yes" }
	One,
	Two,
	//// { "title": "Enum - no rename", "oldName": "Three", "newName": "Two", "expected": "no" }
	Three
}

class Base {
	public foo() { }
}

class Derived extends Base {
	//// { "title": "Method - rename", "oldName": "bar", "newName": "bazz", "expected": "yes" }
	bar() { }

	//// { "title": "Method - no rename", "oldName": "baz", "newName": "bar", "expected": "no" }
	baz() { }

	//// { "title": "Method - no rename inherited", "oldName": "faz", "newName": "foo", "expected": "no" }
	faz() { }
}

namespace MyNamespace {
	function foo() { }

	function
		//// { "title": "Function - rename", "oldName": "bar", "newName": "bazz", "expected": "yes" }
		bar() { }

	function
		//// { "title": "Function - no rename", "oldName": "baz", "newName": "bar", "expected": "no" }
		baz() { }
}

function main() {
	const
		//// { "title": "Variable - rename", "oldName": "x", "newName": "y", "expected": "yes" }
		x = 10;

	const
		//// { "title": "Variable - no rename", "oldName": "z", "newName": "x", "expected": "no" }
		z = 20;
}

type MyType = {
}

//// { "title": "Type - rename", "oldName": "TypeOne", "newName": "YourType", "expected": "yes", "delta": 5 }
type TypeOne = {
}

//// { "title": "Type - no rename", "oldName": "TypeTwo", "newName": "MyType", "expected": "no", "delta": 5 }
type TypeTwo = {
}

export type EndOfLife = {
	skuPlan: string | undefined;
	//// { "title": "Type - property rename - multiple declarations", "oldName": "skuPlan", "newName": "skuType", "expected": "no" }
	skuPlan: string | undefined;

	sig(value: string): void;
	//// { "title": "Type - method rename - multiple declarations", "oldName": "sign", "newName": "sig2", "expected": "yes" }
	sign(value: number): void;

	mark(value: number): void;
	//// { "title": "Type - method no rename - multiple declarations", "oldName": "mark", "newName": "mark2", "expected": "no" }
	mark(value: number): void;
}

export interface I2 {
	skuPlan: string | undefined;
	//// { "title": "Interface - property rename - multiple declarations", "oldName": "skuPlan", "newName": "skuType", "expected": "no" }
	skuPlan: string | undefined;

	sig(value: string): void;
	//// { "title": "Interface - method rename - multiple declarations", "oldName": "sign", "newName": "sig2", "expected": "yes" }
	sign(value: number): void;

	mark(value: number): void;
	//// { "title": "Interface - method no rename - multiple declarations", "oldName": "mark", "newName": "mark2", "expected": "no" }
	mark(value: number): void;
}

export class C1 {
	skuPlan: string | undefined;
	//// { "title": "Class - property rename - multiple declarations", "oldName": "skuPlan", "newName": "skuType", "expected": "no" }
	skuPlan: string | undefined;

	foo(number: number): string;
	foo(string: string): string;
	//// { "title": "Class - method rename - multiple declarations", "oldName": "foo", "newName": "foo2", "expected": "yes" }
	foo(param: number | string): string {
		return param.toString();
	}

	bar(number: number): string;
	bar(number: number): string;
	//// { "title": "Class - method rename - multiple declarations", "oldName": "bar", "newName": "bar2", "expected": "no" }
	bar(param: number | string): string {
		return param.toString();
	}

	bazz(number: number): string;
	bazz(string: string): string;
	bazz(param: number | string): string {
		return param.toString();
	}
	//// { "title": "Class - method rename - multiple declarations", "oldName": "bazz", "newName": "bazz2", "expected": "no" }
	bazz(param: Function): string {
		return param.toString();
	}
}

export namespace N1 {
	function foo(param: number): string;
	function foo(param: string): string;
	//// { "title": "Namespace - function rename - multiple declarations", "oldName": "foo", "newName": "foo2", "expected": "yes" }
	function foo(param: number | string): string {
		return param.toString();
	}

	function bar(param: number): string;
	function bar(param: number): string;
	//// { "title": "Namespace - function rename - multiple declarations", "oldName": "bar", "newName": "bar2", "expected": "no" }
	function bar(param: number | string): string {
		return param.toString();
	}

	function bazz(param: number): string;
	function bazz(param: string): string;
	function bazz(param: number | string): string {
		return param.toString();
	}
	//// { "title": "Namespace - function rename - multiple declarations", "oldName": "bazz", "newName": "bazz2", "expected": "no" }
	function bazz(param: Function): string {
		return param.toString();
	}
}

export function sameName(): void {
}

export namespace N2 {
	function foo(): void {
	}
	//// { "title": "Namespace function - rename", "oldName": "bar", "newName": "sameName", "expected": "yes" }
	function bar(): void {
	}

	//// { "title": "Namespace function - rename", "oldName": "baz", "newName": "foo", "expected": "no" }
	function baz(): void {
	}
}

export function myFunc(): void {
	function foo(): void {
	}
	//// { "title": "Function function - rename", "oldName": "bar", "newName": "sameName", "expected": "yes" }
	function bar(): void {
	}

	//// { "title": "Function function - rename", "oldName": "baz", "newName": "foo", "expected": "no" }
	function baz(): void {
	}
}

export function redeclaredVariable(): void {
	const minimalIconWidth = 16;
	//// { "title": "Variable - no rename redeclared", "oldName": "minimalIconWidth", "newName": "minimalIconWidthWithPadding", "expected": "no", "delta": 6 }
	const minimalIconWidth = minimalIconWidth + 2;
}

export function redeclaredVariableFunctionScoped(minimalIconWidth = 16): void {
	//// { "title": "Variable - no rename redeclared param", "oldName": "minimalIconWidth", "newName": "minimalIconWidthWithPadding", "expected": "no", "delta": 6 }
	const minimalIconWidth = minimalIconWidth + 2;
}