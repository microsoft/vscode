/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// @ts-check
'use strict';

// Node.js built-ins
const fs = require('fs');
const http = require('http');
const path = require('path');
const url = require('url');
const events = require('events');
const { promisify } = require('node:util');
const { randomBytes } = require('crypto');

// Third-party modules
const glob = require('glob');
const minimatch = require('minimatch');
const minimist = require('minimist');
const mocha = require('mocha');
const createStatsCollector = require('mocha/lib/stats-collector');
const MochaJUnitReporter = require('mocha-junit-reporter');
const playwright = require('@playwright/test');
const yaserver = require('yaserver');

// Internal modules
const { applyReporter } = require('../reporter');

/**
 * @type {{
 *   run: string;
 *   grep: string;
 *   runGlob: string;
 *   browser: string;
 *   reporter: string;
 *   'reporter-options': string;
 *   tfs: string;
 *   build: boolean;
 *   debug: boolean;
 *   sequential: boolean;
 *   help: boolean;
 * }}
 */

const args = minimist(process.argv.slice(2), {
	boolean: ['build', 'debug', 'sequential', 'help'],
	string: ['run', 'grep', 'runGlob', 'browser', 'reporter', 'reporter-options', 'tfs'],

	default: {
		build: false,
		browser: ['chromium', 'firefox', 'webkit'],
		reporter: process.platform === 'win32' ? 'list' : 'spec',
		'reporter-options': ''
	},

	alias: {
		grep: ['g', 'f'],
		runGlob: ['glob', 'runGrep'],
		debug: ['debug-browser'],
		help: 'h'
	},

	describe: {
		build:             'Run with build output (out-build)',
		run:               'Only run tests matching <relative_file_path>',
		grep:              'Only run tests matching <pattern>',
		debug:             'Do not run browsers headless',
		sequential:        'Only run suites for a single browser at a time',
		browser:           'Browsers in which tests should run. Format: "chromium", or "chromium-chrome"',
		reporter:          'The Mocha reporter to use',
		'reporter-options':'Options for the Mocha reporter',
		tfs:               'TFS reporting output',
		help:              'Show this help message'
	}
});


if (args.help) {
	console.log(`
Usage: node ${path.basename(process.argv[1])} [options]

Options:
  --build                    Run with build output (out-build)
  --run <file>              Only run tests matching <relative_file_path>
  --grep, -g, -f <pattern>   Only run tests matching <pattern>
  --debug, --debug-browser   Do not run browsers headless
  --sequential               Only run suites for a single browser at a time
  --browser <browser>        Browsers in which tests should run (e.g. "chromium", "chromium-msedge")
  --reporter <reporter>      The Mocha reporter to use
  --reporter-options <opts>  Options for the Mocha reporter
  --tfs <tfs>                TFS reporting output
  --help, -h                 Show this help message
`);
	process.exit(0);
}
const isDebug = Boolean(args.debug);

const withReporter = (() => {
	if (args.tfs) {
		return (browserType, runner) => {
			new mocha.reporters.Spec(runner);

			const safeTfsName = args.tfs.toLowerCase().replace(/[^\w]/g, '-');
			const mochaFile = process.env.BUILD_ARTIFACTSTAGINGDIRECTORY
				? path.join(
					process.env.BUILD_ARTIFACTSTAGINGDIRECTORY,
					`test-results/${process.platform}-${process.arch}-${browserType}-${safeTfsName}-results.xml`
				)
				: undefined;

			new MochaJUnitReporter(runner, {
				reporterOptions: {
					testsuitesTitle: `${args.tfs} ${process.platform}`,
					mochaFile
				}
			});
		};
	}

	return (_, runner) => applyReporter(runner, args);
})();

const outdir = args.build ? 'out-build' : 'out';
const rootDir = path.resolve(__dirname, '..', '..', '..');
const out = path.join(rootDir, outdir);

function ensureArray(value) {
	return Array.isArray(value) ? value : [value];
}

const testModules = (async () => {
	const excludePattern = '**/{node,electron-sandbox,electron-main,electron-utility}/**/*.test.js';
	const defaultGlob = '**/*.test.js';

	const isUsingFileList = Boolean(args.run);
	const isUsingGlob = !isUsingFileList;
	const pattern = args.runGlob || defaultGlob;
	const isDefaultPattern = pattern === defaultGlob;

	let filesPromise;

	if (isUsingFileList) {
		const fileList = ensureArray(args.run).map(file => {
			const jsPath = file.replace(/^src/, 'out').replace(/\.ts$/, '.js');
			return path.relative(out, jsPath);
		});
		filesPromise = Promise.resolve(fileList);
	} else {
		filesPromise = new Promise((resolve, reject) => {
			glob(pattern, { cwd: out }, (err, files) => {
				err ? reject(err) : resolve(files);
			});
		});
	}

	return filesPromise.then(files => {
		const modules = [];

		for (const file of files) {
			if (!minimatch(file, excludePattern)) {
				modules.push(file.replace(/\.js$/, ''));
			} else if (!isDefaultPattern) {
				console.warn(`DROPPING ${file} because it cannot be run inside a browser`);
			}
		}

		return modules;
	});
})();

function consoleLogFn(msg) {
	const type = msg.type();
	if (console[type]) {
		return console[type];
	}
	return type === 'warning' ? console.warn : console.log;
}

async function createServer() {
	// Unique URL prefix to prevent collisions with other services
	const prefix = '/' + randomBytes(16).toString('hex');
	const serveStatic = await yaserver.createServer({ rootDir });

	/**
	 * Handle remote method execution with JSON request/response.
	 */
	const remoteMethod = async (req, res, fn) => {
		try {
			const params = await new Promise((resolve, reject) => {
				const body = [];
				req.on('data', chunk => body.push(chunk));
				req.on('end', () => resolve(JSON.parse(Buffer.concat(body).toString())));
				req.on('error', reject);
			});

			const result = await fn(...params);
			res.writeHead(200, { 'Content-Type': 'application/json' });
			res.end(JSON.stringify(result));
		} catch (err) {
			res.writeHead(500);
			res.end(err.message);
		}
	};

	/**
	 * Normalize test paths for use with snapshots in ESM.
	 */
	const massagePath = p =>
		String(p).replace(/\\/g, '/').replace(prefix, rootDir);

	const server = http.createServer((req, res) => {
		if (!req.url?.startsWith(prefix)) {
			return res.writeHead(404).end();
		}

		// Strip prefix for internal routing
		req.url = req.url.slice(prefix.length);

		switch (req.url) {
			case '/remoteMethod/__readFileInTests':
				return remoteMethod(req, res, p => fs.promises.readFile(massagePath(p), 'utf-8'));
			case '/remoteMethod/__writeFileInTests':
				return remoteMethod(req, res, (p, contents) => fs.promises.writeFile(massagePath(p), contents));
			case '/remoteMethod/__readDirInTests':
				return remoteMethod(req, res, p => fs.promises.readdir(massagePath(p)));
			case '/remoteMethod/__unlinkInTests':
				return remoteMethod(req, res, p => fs.promises.unlink(massagePath(p)));
			case '/remoteMethod/__mkdirPInTests':
				return remoteMethod(req, res, p => fs.promises.mkdir(massagePath(p), { recursive: true }));
			default:
				return serveStatic.handle(req, res);
		}
	});

	return new Promise((resolve, reject) => {
		server.listen(0, 'localhost', () => {
			const port = server.address().port;
			resolve({
				dispose: () => server.close(),
				url: `http://localhost:${port}${prefix}`
			});
		});
		server.on('error', reject);
	});
}
async function runTestsInBrowser(testModules, browserType, browserChannel) {
	const server = await createServer();
	const browser = await playwright[browserType].launch({
		headless: !isDebug,
		devtools: isDebug,
		channel: browserChannel
	});
	const context = await browser.newContext();
	const page = await context.newPage();

	// Construct test page URL
	const target = new URL(`${server.url}/test/unit/browser/renderer.html`);
	target.searchParams.set('baseUrl', url.pathToFileURL(path.join(rootDir, 'src')).toString());
	if (args.build) target.searchParams.set('build', 'true');
	if (process.env.BUILD_ARTIFACTSTAGINGDIRECTORY) target.searchParams.set('ci', 'true');

	// Attach CSS modules as base64-encoded gzip
	await promisify(require('glob'))('**/*.css', { cwd: out }).then(async cssModules => {
		const blob = await new Response(cssModules.join(',')).blob();
		const gzipped = await new Response(blob.stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer();
		target.searchParams.set('_devCssData', Buffer.from(gzipped).toString('base64'));
	});

	// Setup event emitter for mocha reporting
	const emitter = new events.EventEmitter();
	await page.exposeFunction('mocha_report', (type, a, b) => emitter.emit(type, a, b));

	await page.goto(target.href);

	// Inject NLS messages if using build output
	if (args.build) {
		const nlsData = await fs.promises.readFile(path.join(out, 'nls.messages.json'), 'utf8');
		await page.evaluate(data => {
			// @ts-ignore
			globalThis._VSCODE_NLS_MESSAGES = JSON.parse(data);
		}, nlsData);
	}

	// Pipe browser console output
	page.on('console', async msg => {
		const args = await Promise.all(msg.args().map(arg => arg.jsonValue()));
		consoleLogFn(msg)(msg.text(), args);
	});

	// Attach test reporter
	const title = browserChannel
		? `${browserType.toUpperCase()}-${browserChannel.toUpperCase()}`
		: browserType.toUpperCase();

	withReporter(browserType, new EchoRunner(emitter, title));

	// Track failing tests
	const failingTests = [];
	const failingModuleIds = [];

	emitter.on('fail', (test, err) => {
		failingTests.push({ title: test.fullTitle, message: err.message });

		if (err.stack) {
			const match = [...err.stack.matchAll(/(vs\/.*\.test)\.js/g)];
			if (match.length) {
				failingModuleIds.push(match[0][1]);
			}
		}
	});

	// Execute tests
	try {
		// @ts-expect-error
		await page.evaluate(opts => loadAndRun(opts), {
			modules: testModules,
			grep: args.grep
		});
	} catch (err) {
		console.error(err);
	}

	if (!isDebug) {
		server.dispose();
		await browser.close();
	}

	// Report failures if any
	if (failingTests.length > 0) {
		let result = `The following tests are failing:\n - ` + failingTests
			.map(({ title, message }) => `${title} (reason: ${message})`)
			.join('\n - ');

		if (failingModuleIds.length > 0) {
			const debugQuery = failingModuleIds.map(id => `m=${id}`).join('&');
			result += `\n\nTo DEBUG, open ${title} and navigate to:\n${target.href}?${debugQuery}`;
		}

		return `${result}\n`;
	}
}
class EchoRunner extends events.EventEmitter {
	constructor(eventEmitter, titleSuffix = '') {
		super();
		createStatsCollector(this);

		// Forward and transform incoming events
		eventEmitter.on('start', () => this.emit('start'));
		eventEmitter.on('end', () => this.emit('end'));

		for (const evt of ['suite', 'suite end']) {
			eventEmitter.on(evt, suite => {
				this.emit(evt, EchoRunner.deserializeSuite(suite, titleSuffix));
			});
		}

		for (const evt of ['test', 'test end', 'hook', 'hook end', 'pass', 'pending']) {
			eventEmitter.on(evt, item => {
				this.emit(evt, EchoRunner.deserializeRunnable(item, titleSuffix));
			});
		}

		eventEmitter.on('fail', (test, err) => {
			this.emit(
				'fail',
				EchoRunner.deserializeRunnable(test, titleSuffix),
				EchoRunner.deserializeError(err)
			);
		});
	}

	// Add title suffix to differentiate tests from multiple browsers
	static deserializeSuite(suite, titleSuffix) {
		return {
			root: suite.root,
			suites: suite.suites,
			tests: suite.tests,
			title: titleSuffix && suite.title ? `${suite.title} - /${titleSuffix}/` : suite.title,
			titlePath: () => suite.titlePath,
			fullTitle: () => suite.fullTitle,
			timeout: () => suite.timeout,
			retries: () => suite.retries,
			slow: () => suite.slow,
			bail: () => suite.bail,
		};
	}

	static deserializeRunnable(runnable, titleSuffix) {
		return {
			title: runnable.title,
			fullTitle: () =>
				titleSuffix && runnable.fullTitle
					? `${runnable.fullTitle} - /${titleSuffix}/`
					: runnable.fullTitle,
			titlePath: () => runnable.titlePath,
			async: runnable.async,
			slow: () => runnable.slow,
			speed: runnable.speed,
			duration: runnable.duration,
			currentRetry: () => runnable.currentRetry,
		};
	}

	// Pass through the error while preserving its inspect method
	static deserializeError(err) {
		const originalInspect = err.inspect;
		err.inspect = () => originalInspect;
		return err;
	}
}

testModules.then(async (modules) => {
	const browsers = Array.isArray(args.browser) ? args.browser : [args.browser];
	let messages = [];
	let didFail = false;

	try {
		if (args.sequential) {
			// Run one browser at a time (sequential)
			for (const browser of browsers) {
				const [browserType, browserChannel] = browser.split('-');
				const result = await runTestsInBrowser(modules, browserType, browserChannel);
				messages.push(result);
			}
		} else {
			// Run all browsers in parallel
			messages = await Promise.all(browsers.map(async (browser) => {
				const [browserType, browserChannel] = browser.split('-');
				return await runTestsInBrowser(modules, browserType, browserChannel);
			}));
		}
	} catch (err) {
		console.error('Test execution failed:', err);
		if (!isDebug) {
			process.exit(1);
		}
	}

	// Output messages and track failure status
	for (const msg of messages) {
		if (msg) {
			didFail = true;
			console.log(msg);
		}
	}

	if (!isDebug) {
		process.exit(didFail ? 1 : 0);
	}
}).catch((err) => {
	console.error('Failed to load test modules:', err);
});
