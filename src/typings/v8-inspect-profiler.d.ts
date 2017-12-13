declare module 'v8-inspect-profiler' {

	export interface ProfileResult {
		profile: Profile;
	}

	export interface Profile {
		nodes: ProfileNode[];
		samples?: number[];
		timeDeltas?: number[];
		startTime: number;
		endTime: number;
	}

	export interface ProfileNode {
		id: number;
		hitCount?: number;
		children?: number[];
		callFrame: {
			url: string;
			scriptId: string;
			functionName: string;
			lineNumber: number;
			columnNumber: number;
		};
		deoptReason?: string;
		positionTicks?: { line: number; ticks: number }[];
	}

	export interface ProfilingSession {
		stop(afterDelay?: number): PromiseLike<ProfileResult>;
	}

	export interface Target {
		description: string,
    	devtoolsFrontendUrl: string,
		id: string,
		title: string,
		type: string,
		url: string,
		webSocketDebuggerUrl: string
	}

	export function listTabs(options: { port: number, tries?: number, retyWait?: number }): PromiseLike<Target[]>;
	export function startProfiling(options: { port: number, tries?: number, retyWait?: number, chooseTab?: (targets: Target[]) => any }): PromiseLike<ProfilingSession>;
	export function writeProfile(profile: ProfileResult, name?: string): PromiseLike<void>;
	export function rewriteAbsolutePaths(profile, replaceWith?);
}
