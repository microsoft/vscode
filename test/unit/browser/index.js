/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

//@ts-check
'use strict';

const path = require('path');
const glob = require('glob');
const events = require('events');
const mocha = require('mocha');
const createStatsCollector = require('mocha/lib/stats-collector');
const MochaJUnitReporter = require('mocha-junit-reporter');
const url = require('url');
const minimatch = require('minimatch');
const fs = require('fs');
const playwright = require('@playwright/test');
const { applyReporter } = require('../reporter');
const yaserver = require('yaserver');
const http = require('http');
const { randomBytes } = require('crypto');
const minimist = require('minimist');
const { promisify } = require('node:util');

/**
 * @type {{
 * run: string;
 * grep: string;
 * runGlob: string;
 * browser: string;
 * reporter: string;
 * 'reporter-options': string;
 * tfs: string;
 * build: boolean;
 * debug: boolean;
 * sequential: boolean;
 * help: boolean;
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
		build: 'run with build output (out-build)',
		run: 'only run tests matching <relative_file_path>',
		grep: 'only run tests matching <pattern>',
		debug: 'do not run browsers headless',
		sequential: 'only run suites for a single browser at a time',
		browser: 'browsers in which tests should run (supports browser channels)',
		reporter: 'the mocha reporter',
		'reporter-options': 'the mocha reporter options',
		tfs: 'tfs',
		help: 'show the help'
	}
});

if (args.help) {
	console.log(`Usage: node ${process.argv[1]} [options]

Options:
--build              run with build output (out-build)
--run <relative_file_path> only run tests matching <relative_file_path>
--grep, -g, -f <pattern> only run tests matching <pattern>
--debug, --debug-browser do not run browsers headless
--sequential         only run suites for a single browser at a time
--browser <browser>  browsers in which tests should run (e.g. chromium-msedge)
--reporter <reporter> the mocha reporter
--reporter-options <reporter-options> the mocha reporter options
--tfs <tfs>          tfs
--help, -h           show the help`);
	process.exit(0);
}

const isDebug = !!args.debug;

const withReporter = (function () {
	if (args.tfs) {
		return (browserType, runner) => {
			new mocha.reporters.Spec(runner);
			new MochaJUnitReporter(runner, {
				reporterOptions: {
					testsuitesTitle: `${args.tfs} ${process.platform}`,
					mochaFile: process.env.BUILD_ARTIFACTSTAGINGDIRECTORY 
						? path.join(process.env.BUILD_ARTIFACTSTAGINGDIRECTORY, 
							`test-results/${process.platform}-${process.arch}-${browserType}-${args.tfs.toLowerCase().replace(/[^\w]/g, '-')}-results.xml`) 
						: undefined
				}
			});
		};
	} else {
		return (_, runner) => applyReporter(runner, args);
	}
})();

const outdir = args.build ? 'out-build' : 'out';
const rootDir = path.resolve(__dirname, '..', '..', '..');
const out = path.join(rootDir, `${outdir}`);

function ensureIsArray(a) {
	return Array.isArray(a) ? a : [a];
}

const testModules = (async function () {
	const excludeGlob = '**/{node,electron-sandbox,electron-main,electron-utility}/**/*.test.js';
	let isDefaultModules = true;
	let promise;

	if (args.run) {
		isDefaultModules = false;
		promise = Promise.resolve(ensureIsArray(args.run).map(file => {
			file = file.replace(/^src/, 'out');
			file = file.replace(/\.ts$/, '.js');
			return path.relative(out, file);
		}));
	} else {
		const defaultGlob = '**/*.test.js';
		const pattern = args.runGlob || defaultGlob;
		isDefaultModules = pattern === defaultGlob;

		promise = new Promise((resolve, reject) => {
			glob(pattern, { cwd: out }, (err, files) => {
				err ? reject(err) : resolve(files);
			});
		});
	}

	return promise.then(files => {
		const modules = [];
		for (const file of files) {
			if (!minimatch(file, excludeGlob)) {
				modules.push(file.replace(/\.js$/, ''));
			} else if (!isDefaultModules) {
				console.warn(`DROPPING ${file} - cannot run in browser`);
			}
		}
		return modules;
	});
})();

function consoleLogFn(msg) {
	const type = msg.type();
	if (console[type]) return console[type];
	return type === 'warning' ? console.warn : console.log;
}

async function createServer() {
	const prefix = '/' + randomBytes(16).toString('hex');
	const serveStatic = await yaserver.createServer({ rootDir });

	const remoteMethod = async (req, response, fn) => {
		const params = await new Promise((resolve, reject) => {
			const body = [];
			req.on('data', chunk => body.push(chunk));
			req.on('end', () => resolve(JSON.parse(Buffer.concat(body).toString())));
			req.on('error', reject);
		});
		try {
			const result = await fn(...params);
			response.writeHead(200, { 'Content-Type': 'application/json' });
			response.end(JSON.stringify(result));
		} catch (err) {
			response.writeHead(500);
			response.end(err.message);
		}
	};

	const server = http.createServer((request, response) => {
		if (!request.url?.startsWith(prefix)) {
			return response.writeHead(404).end();
		}

		request.url = request.url.slice(prefix.length);

		function massagePath(p) {
			return String(p).replace(/\\/g, '/').replace(prefix, rootDir);
		}

		switch (request.url) {
			case '/remoteMethod/__readFileInTests':
				return remoteMethod(request, response, p => fs.promises.readFile(massagePath(p), 'utf-8'));
			case '/remoteMethod/__writeFileInTests':
				return remoteMethod(request, response, (p, contents) => fs.promises.writeFile(massagePath(p), contents));
			case '/remoteMethod/__readDirInTests':
				return remoteMethod(request, response, p => fs.promises.readdir(massagePath(p)));
			case '/remoteMethod/__unlinkInTests':
				return remoteMethod(request, response, p => fs.promises.unlink(massagePath(p)));
			case '/remoteMethod/__mkdirPInTests':
				return remoteMethod(request, response, p => fs.promises.mkdir(massagePath(p), { recursive: true }));
			default:
				return serveStatic.handle(request, response);
		}
	});

	return new Promise((resolve, reject) => {
		server.listen(0, 'localhost', () => {
			resolve({
				dispose: () => server.close(),
				url: `http://localhost:${server.address().port}${prefix}`
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

	// Validate browser channel actually launched
	if (browserChannel && !browser.version().includes(browserChannel)) {
		throw new Error(`Failed to launch ${browserType}-${browserChannel}`);
	}

	const context = await browser.newContext();
	const page = await context.newPage();
	const target = new URL(server.url + '/test/unit/browser/renderer.html');
	target.searchParams.set('baseUrl', url.pathToFileURL(path.join(rootDir, 'src')).toString());
	if (args.build) target.searchParams.set('build', 'true');
	if (process.env.BUILD_ARTIFACTSTAGINGDIRECTORY) target.searchParams.set('ci', 'true');

	// Load CSS assets with error handling
	try {
		const cssModules = await promisify(glob)('**/*.css', { cwd: out });
		const blob = await new Response(cssModules.join(',')).blob();
		const gzipped = await new Response(blob.stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer();
		target.searchParams.set('_devCssData', Buffer.from(gzipped).toString('base64'));
	} catch (error) {
		console.error('Failed to load CSS assets:', error);
		throw new Error('CSS asset loading failed');
	}

	const emitter = new events.EventEmitter();
	await page.exposeFunction('mocha_report', (type, data1, data2) => {
		emitter.emit(type, data1, data2);
	});

	await page.goto(target.href);

	if (args.build) {
		try {
			const nlsMessages = await fs.promises.readFile(path.join(out, 'nls.messages.json'), 'utf8');
			await page.evaluate(value => {
				// @ts-ignore
				globalThis._VSCODE_NLS_MESSAGES = JSON.parse(value);
			}, nlsMessages);
		} catch (error) {
			console.error('Failed to load NLS messages:', error);
			throw new Error('NLS initialization failed');
		}
	}

	page.on('console', async msg => {
		const args = await Promise.all(msg.args().map(arg => arg.jsonValue()));
		consoleLogFn(msg)(msg.text(), args);
	});

	withReporter(browserType, new EchoRunner(emitter, 
		browserChannel ? `${browserType.toUpperCase()}-${browserChannel.toUpperCase()}` : browserType.toUpperCase()
	));

	const failingModuleIds = [];
	const failingTests = [];
	emitter.on('fail', (test, err) => {
		failingTests.push({ title: test.fullTitle, message: err.message });

		if (err.stack) {
			const match = err.stack.match(/(vs\/.*\.test)\.js/);
			if (match) failingModuleIds.push(match[1]);
		}
	});

	try {
		// @ts-expect-error
		await page.evaluate(opts => loadAndRun(opts), {
			modules: testModules,
			grep: args.grep,
		});
	} catch (err) {
		console.error('Test execution failed:', err);
	}

	if (!isDebug) {
		server?.dispose();
		await context.close();
		await browser.close();
	} else {
		console.log(`[DEBUG] Browser kept open - ${browserType} ${browser.version()}`);
	}

	if (failingTests.length > 0) {
		let result = `Failed tests:\n - ${failingTests.map(t => `${t.title}: ${t.message}`).join('\n - ')}`;
		if (failingModuleIds.length > 0) {
			result += `\n\nDebug URL: ${target.href}?${failingModuleIds.map(m => `m=${m}`).join('&')}`;
		}
		return result;
	}
}

class EchoRunner extends events.EventEmitter {
	constructor(event, title = '') {
		super();
		createStatsCollector(this);
		event.on('start', () => this.emit('start'));
		event.on('end', () => this.emit('end'));
		event.on('suite', suite => this.emit('suite', this.constructor.deserializeSuite(suite, title)));
		event.on('suite end', suite => this.emit('suite end', this.constructor.deserializeSuite(suite, title)));
		event.on('test', test => this.emit('test', this.constructor.deserializeRunnable(test)));
		event.on('test end', test => this.emit('test end', this.constructor.deserializeRunnable(test)));
		event.on('hook', hook => this.emit('hook', this.constructor.deserializeRunnable(hook)));
		event.on('hook end', hook => this.emit('hook end', this.constructor.deserializeRunnable(hook)));
		event.on('pass', test => this.emit('pass', this.constructor.deserializeRunnable(test)));
		event.on('fail', (test, err) => this.emit('fail', 
			this.constructor.deserializeRunnable(test, title), 
			this.constructor.deserializeError(err)
		));
		event.on('pending', test => this.emit('pending', this.constructor.deserializeRunnable(test)));
	}

	static deserializeSuite(suite, titleExtra) {
		return {
			root: suite.root,
			suites: suite.suites,
			tests: suite.tests,
			title: titleExtra && suite.title ? `${suite.title} - /${titleExtra}/` : suite.title,
			titlePath: () => suite.titlePath,
			fullTitle: () => suite.fullTitle,
			timeout: () => suite.timeout,
			retries: () => suite.retries,
			slow: () => suite.slow,
			bail: () => suite.bail
		};
	}

	static deserializeRunnable(runnable, titleExtra) {
		return {
			title: runnable.title,
			fullTitle: () => titleExtra && runnable.fullTitle 
				? `${runnable.fullTitle} - /${titleExtra}/` 
				: runnable.fullTitle,
			titlePath: () => runnable.titlePath,
			async: runnable.async,
			slow: () => runnable.slow,
			speed: runnable.speed,
			duration: runnable.duration,
			currentRetry: () => runnable.currentRetry,
		};
	}

	static deserializeError(err) {
		const inspect = err.inspect;
		err.inspect = () => inspect;
		return err;
	}
}

testModules.then(async modules => {
	const browsers = ensureIsArray(args.browser);
	let messages = [];
	let didFail = false;

	try {
		if (args.sequential) {
			for (const browser of browsers) {
				const [type, channel] = browser.split('-');
				messages.push(await runTestsInBrowser(modules, type, channel));
			}
		} else {
			messages = await Promise.all(browsers.map(async browser => {
				const [type, channel] = browser.split('-');
				return runTestsInBrowser(modules, type, channel);
			}));
		}
	} catch (err) {
		console.error('Fatal error:', err);
		if (!isDebug) process.exit(1);
	}

	for (const msg of messages) {
		if (msg) {
			didFail = true;
			console.log(msg);
		}
	}

	if (!isDebug) process.exit(didFail ? 1 : 0);
}).catch(err => {
	console.error('Test module loading failed:', err);
	process.exit(1);
});
