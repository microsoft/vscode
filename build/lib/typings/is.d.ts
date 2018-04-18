declare module 'is' {
	function a(value: any, type: string): boolean;
	function defined(value: any): boolean;
	function undef(value: any): boolean;
	function object(value: any): boolean;
	function string(value: any): value is string;
	function boolean(value: any): boolean;
	function array(value: any): boolean;
	function empty<T>(value: Object | Array<T>): boolean;
	function equal<T extends Object | Array<any> | Function | Date>(value: T, other: T): boolean;
}