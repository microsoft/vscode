/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { enableHotReload, hotRequire } from '@hediet/node-reload';
import { Module } from 'module';
import { IDebugValueEditorGlobals, IPlaygroundRunnerGlobals } from '../src/util/common/debugValueEditorGlobals';

/** See {@link file://./../.vscode/extensions/visualization-runner/README.md} */

enableHotReload({ loggingEnabled: false });

const r = Module.prototype.require;
(Module as any).prototype.require = function (this: { filename: string }, path: string) {
	if (path === 'vitest') {
		return createVitestModule(this.filename);
	}
	return r.call(this, path);
};

function run(args: { fileName: string; path: string[] }) {
	console.log('> Running test: ' + args.path.join(' > '));
	setTestFile(args.fileName);
	setTest(args.path);
	runCurrentTest();
}

const g = globalThis as any as IDebugValueEditorGlobals & IPlaygroundRunnerGlobals;
g.$$playgroundRunner_data = { currentPath: [] };

// The timeout seems to fix a deadlock-issue of tsx, when the run function is called from the debugger.
g.$$debugValueEditor_run = args => (setTimeout(() => { run(args); }, 0));
(g.$$debugValueEditor_debugChannels ?? (g.$$debugValueEditor_debugChannels = {}))['run'] = host => ({
	handleRequest: (args) => { setTimeout(() => run(args as any), 0); }
});

let hotRequireDisposable: any;
let currentFileName: string | undefined = undefined;
function setTestFile(fileName: string) {
	if (currentFileName === fileName) {
		return;
	}
	currentFileName = fileName;
	if (hotRequireDisposable) { hotRequireDisposable.dispose(); }
	let isFirst = true;
	hotRequireDisposable = hotRequire(module, fileName, cur => {
		if (isFirst) {
			console.log('> Loading tests');
			isFirst = false;
		} else {
			console.log('> Running test: ' + currentPath.join(' > '));
			runCurrentTest();
		}
		return {
			dispose: () => {
				testsPerFileName.get(fileName)?.clearCache();
			}
		};
	});
}

let currentPath: string[] = [];
function setTest(path: string[]) {
	currentPath = path;
	g.$$playgroundRunner_data.currentPath = path;
}
setTest([]);

async function runCurrentTest() {
	const t = testsPerFileName.get(currentFileName!)?.findTest(currentPath);
	if (!t) {
		console.error('Test not found', currentPath);
		return;
	}
	try {
		const startTime = Date.now();
		g.$$debugValueEditor_properties = [];
		await t?.runner();
		const endTime = Date.now();
		const duration = endTime - startTime;
		console.log('> Test finished (' + duration + 'ms).');
	} catch (e) {
		console.error('Test failed:', e);
	}
}


const testsPerFileName = new Map<string, TestContainer>();

function createVitestModule(filename: string) {
	let items: (Test | TestContainer)[] = [];
	function getDiscoverFn(fn: () => void) {
		return () => {
			items = [];
			const i = items;
			fn();
			items = [];
			return i;
		};
	}

	let currentTestContainer: TestContainer;

	const vitest = {} as any;
	vitest.describe = function (name: string, fn: () => void) {
		currentTestContainer = new TestContainer(name, getDiscoverFn(fn));
		items.push(currentTestContainer);

	};
	vitest.test = function (name: string, fn: () => void) {
		items.push(new Test(name, fn));
	};

	vitest.expect = function () {
		return {
			toBe: function () { },
			toMatchInlineSnapshot: function () { },
			toMatchFileSnapshot: function () { },
		};
	};

	testsPerFileName.set(filename, new TestContainer(filename, () => {
		const i = items;
		items = [];
		return i;
	}));

	return vitest;
}

class TestContainer {
	private readonly _tests = new Map<string, Test>();
	private readonly _containers = new Map<string, TestContainer>();

	private _discovered = false;

	constructor(
		public readonly name: string,
		private readonly _discoverFn: () => (Test | TestContainer)[],
	) {
	}

	private _discover(): void {
		if (this._discovered) {
			return;
		}
		this._discovered = true;
		for (const t of this._discoverFn()) {
			if (t instanceof Test) {
				this._tests.set(t.name, t);
			} else {
				this._containers.set(t.name, t);
			}
		}
	}

	getTest(name: string): Test | undefined {
		this._discover();
		return this._tests.get(name);
	}

	getContainer(name: string): TestContainer | undefined {
		this._discover();
		return this._containers.get(name);
	}

	findTest(path: string[]): Test | undefined {
		if (path.length === 0) {
			throw new Error('Invalid path');
		}
		let cur: TestContainer = this;
		for (let i = 0; i < path.length - 1; i++) {
			const c = cur.getContainer(path[i]);
			if (!c) { return undefined; }
			cur = c;
		}
		return cur.getTest(path[path.length - 1]);
	}

	clearCache(): void {
		this._discovered = false;
		this._tests.clear();
		this._containers.clear();
	}
}

class Test {
	constructor(
		public readonly name: string,
		public readonly runner: () => Promise<void> | void,
	) { }
}

console.log('> Playground runner ready.');

setTimeout(() => {
	if (currentPath.length === 0) {
		console.error('Did not run a test after 5 seconds. Probably a bug in the extension?');
	}
}, 5000);
