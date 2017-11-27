declare module 'v8-inspect-profiler' {

	export interface Profile { }

	export interface ProfilingSession {
		stop(afterDelay?: number): PromiseLike<Profile>;
	}

	export function startProfiling(options: { port: number, tries?: number, retyWait?: number }): PromiseLike<ProfilingSession>;
	export function writeProfile(profile: Profile, name?: string): PromiseLike<void>;
	export function rewriteAbsolutePaths(profile, replaceWith?);
}
