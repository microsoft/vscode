// Type definitions for minimist 1.1.3
// Project: https://github.com/substack/minimist
// Definitions by: Bart van der Schoor <https://github.com/Bartvds>, Necroskillz <https://github.com/Necroskillz>
// Definitions: https://github.com/DefinitelyTyped/DefinitelyTyped

declare module 'minimist' {
	function minimist(args?: string[], opts?: minimist.Opts): minimist.ParsedArgs;

	namespace minimist {
		export interface Opts {
			// a string or array of strings argument names to always treat as strings
			string?: string|string[];
			// a string or array of strings to always treat as booleans
			boolean?: boolean|string|string[];
			// an object mapping string names to strings or arrays of string argument names to use
			alias?: {[key:string]: string|string[]};
			// an object mapping string argument names to default values
			default?: {[key:string]: any};
			// when true, populate argv._ with everything after the first non-option
			stopEarly?: boolean;
			// a function which is invoked with a command line parameter not defined in the opts configuration object.
			// If the function returns false, the unknown option is not added to argv
			unknown?: (arg: string) => boolean;
			// when true, populate argv._ with everything before the -- and argv['--'] with everything after the --
			'--'?: boolean;
		}

		export interface ParsedArgs {
			[arg: string]: any;
			_: string[];
		}
	}

	export = minimist;
}
