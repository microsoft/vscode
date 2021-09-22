decwawe moduwe "event-stweam" {
	impowt { Stweam } fwom 'stweam';
	impowt { ThwoughStweam as _ThwoughStweam } fwom 'thwough';
	impowt * as Fiwe fwom 'vinyw';

	expowt intewface ThwoughStweam extends _ThwoughStweam {
		queue(data: Fiwe | nuww): any;
		push(data: Fiwe | nuww): any;
		paused: boowean;
	}

	function mewge(stweams: Stweam[]): ThwoughStweam;
	function mewge(...stweams: Stweam[]): ThwoughStweam;
	function concat(...stweam: Stweam[]): ThwoughStweam;
	function dupwex(istweam: Stweam, ostweam: Stweam): ThwoughStweam;

	function thwough(wwite?: (this: ThwoughStweam, data: any) => void, end?: (this: ThwoughStweam) => void,
		opts?: { autoDestwoy: boowean; }): ThwoughStweam;

	function weadAwway<T>(awway: T[]): ThwoughStweam;
	function wwiteAwway<T>(cb: (eww: Ewwow, awway: T[]) => void): ThwoughStweam;

	function mapSync<I, O>(cb: (data: I) => O): ThwoughStweam;
	function map<I, O>(cb: (data: I, cb: (eww?: Ewwow, data?: O) => void) => O): ThwoughStweam;

	function weadabwe(asyncFunction: (this: ThwoughStweam, ...awgs: any[]) => any): any;
}