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
const createStatsCollector = require('../../../node_modules/mocha/lib/stats-collector');
const MochaJUnitReporter = require('mocha-junit-reporter');
const url = require('url');
const minimatch = require('minimatch');
const playwright = require('@playwright/test');
const { applyReporter } = require('../reporter');

// opts
const defaultReporterName = process.platform === 'win32' ? 'list' : 'spec';
const optimist = require('optimist')
	// .describe('grep', 'only run tests matching <pattern>').alias('grep', 'g').alias('grep', 'f').string('grep')
	.describe('build', 'run with build output (out-build)').boolean('build')
	.describe('run', 'only run tests matching <relative_file_path>').string('run')
	.describe('grep', 'only run tests matching <pattern>').alias('grep', 'g').alias('grep', 'f').string('grep')
	.describe('debug', 'do not run browsers headless').alias('debug', ['debug-browser']).boolean('debug')
	.describe('sequential', 'only run suites for a single browser at a time').boolean('sequential')
	.describe('browser', 'browsers in which tests should run').string('browser').default('browser', ['chromium', 'firefox', 'webkit'])
	.describe('reporter', 'the mocha reporter').string('reporter').default('reporter', defaultReporterName)
	.describe('reporter-options', 'the mocha reporter options').string('reporter-options').default('reporter-options', '')
	.describe('tfs', 'tfs').string('tfs')
	.describe('help', 'show the help').alias('help', 'h');

// logic
const argv = optimist.argv;

if (argv.help) {
	optimist.showHelp();
	process.exit(0);
}

const withReporter = (function () {
	if (argv.tfs) {
		{
			return (browserType, runner) => {
				new mocha.reporters.Spec(runner);
				new MochaJUnitReporter(runner, {
					reporterOptions: {
						testsuitesTitle: `${argv.tfs} ${process.platform}`,
						mochaFile: process.env.BUILD_ARTIFACTSTAGINGDIRECTORY ? path.join(process.env.BUILD_ARTIFACTSTAGINGDIRECTORY, `test-results/${process.platform}-${process.arch}-${browserType}-${argv.tfs.toLowerCase().replace(/[^\w]/g, '-')}-results.xml`) : undefined
					}
				});
			};
		}
	} else {
		return (_, runner) => applyReporter(runner, argv);
	}
})();

const outdir = argv.build ? 'out-build' : 'out';
const out = path.join(__dirname, `../../../${outdir}`);

function ensureIsArray(a) {
	return Array.isArray(a) ? a : [a];
}

const testModules = (async function () {

	const excludeGlob = '**/{node,electron-sandbox,electron-main}/**/*.test.js';
	let isDefaultModules = true;
	let promise;

	if (argv.run) {
		// use file list (--run)
		isDefaultModules = false;
		promise = Promise.resolve(ensureIsArray(argv.run).map(file => {
			file = file.replace(/^src/, 'out');
			file = file.replace(/\.ts$/, '.js');
			return path.relative(out, file);
		}));

	} else {
		// glob patterns (--glob)
		const defaultGlob = '**/*.test.js';
		const pattern = argv.run || defaultGlob;
		isDefaultModules = pattern === defaultGlob;

		promise = new Promise((resolve, reject) => {
			glob(pattern, { cwd: out }, (err, files) => {
				if (err) {
					reject(err);
				} else {
					resolve(files);
				}
			});
		});
	}

	return promise.then(files => {
		const modules = [];
		for (const file of files) {
			if (!minimatch(file, excludeGlob)) {
				modules.push(file.replace(/\.js$/, ''));

			} else if (!isDefaultModules) {
				console.warn(`DROPPONG ${file} because it cannot be run inside a browser`);
			}
		}
		return modules;
	});
})();

function consoleLogFn(msg) {
	const type = msg.type();
	const candidate = console[type];
	if (candidate) {
		return candidate;
	}

	if (type === 'warning') {
		return console.warn;
	}

	return console.log;
}

async function runTestsInBrowser(testModules, browserType) {
	const browser = await playwright[browserType].launch({ headless: !Boolean(argv.debug), devtools: Boolean(argv.debug) });
	const context = await browser.newContext();
	const page = await context.newPage();
	const target = url.pathToFileURL(path.join(__dirname, 'renderer.html'));
	if (argv.build) {
		if (process.env.BUILD_ARTIFACTSTAGINGDIRECTORY) {
			target.search = `?build=true&ci=true`;
		} else {
			target.search = `?build=true`;
		}
	} else if (process.env.BUILD_ARTIFACTSTAGINGDIRECTORY) {
		target.search = `?ci=true`;
	}

	const emitter = new events.EventEmitter();
	await page.exposeFunction('mocha_report', (type, data1, data2) => {
		emitter.emit(type, data1, data2);
	});

	await page.goto(target.href);

	page.on('console', async msg => {
		consoleLogFn(msg)(msg.text(), await Promise.all(msg.args().map(async arg => await arg.jsonValue())));
	});

	withReporter(browserType, new EchoRunner(emitter, browserType.toUpperCase()));

	// collection failures for console printing
	const failingModuleIds = [];
	const failingTests = [];
	emitter.on('fail', (test, err) => {
		failingTests.push({ title: test.fullTitle, message: err.message });

		if (err.stack) {
			const regex = /(vs\/.*\.test)\.js/;
			for (const line of String(err.stack).split('\n')) {
				const match = regex.exec(line);
				if (match) {
					failingModuleIds.push(match[1]);
					return;
				}
			}
		}
	});

	try {
		// @ts-expect-error
		await page.evaluate(opts => loadAndRun(opts), {
			modules: testModules,
			grep: argv.grep,
		});
	} catch (err) {
		console.error(err);
	}
	await browser.close();

	if (failingTests.length > 0) {
		let res = `The followings tests are failing:\n - ${failingTests.map(({ title, message }) => `${title} (reason: ${message})`).join('\n - ')}`;

		if (failingModuleIds.length > 0) {
			res += `\n\nTo DEBUG, open ${browserType.toUpperCase()} and navigate to ${target.href}?${failingModuleIds.map(module => `m=${module}`).join('&')}`;
		}

		return `${res}\n`;
	}
}

class EchoRunner extends events.EventEmitter {

	constructor(event, title = '') {
		super();
		createStatsCollector(this);
		event.on('start', () => this.emit('start'));
		event.on('end', () => this.emit('end'));
		event.on('suite', (suite) => this.emit('suite', EchoRunner.deserializeSuite(suite, title)));
		event.on('suite end', (suite) => this.emit('suite end', EchoRunner.deserializeSuite(suite, title)));
		event.on('test', (test) => this.emit('test', EchoRunner.deserializeRunnable(test)));
		event.on('test end', (test) => this.emit('test end', EchoRunner.deserializeRunnable(test)));
		event.on('hook', (hook) => this.emit('hook', EchoRunner.deserializeRunnable(hook)));
		event.on('hook end', (hook) => this.emit('hook end', EchoRunner.deserializeRunnable(hook)));
		event.on('pass', (test) => this.emit('pass', EchoRunner.deserializeRunnable(test)));
		event.on('fail', (test, err) => this.emit('fail', EchoRunner.deserializeRunnable(test, title), EchoRunner.deserializeError(err)));
		event.on('pending', (test) => this.emit('pending', EchoRunner.deserializeRunnable(test)));
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
			fullTitle: () => titleExtra && runnable.fullTitle ? `${runnable.fullTitle} - /${titleExtra}/` : runnable.fullTitle,
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

	// run tests in selected browsers
	const browserTypes = Array.isArray(argv.browser)
		? argv.browser : [argv.browser];

	let messages = [];
	let didFail = false;

	try {
		if (argv.sequential) {
			for (const browserType of browserTypes) {
				messages.push(await runTestsInBrowser(modules, browserType));
			}
		} else {
			messages = await Promise.all(browserTypes.map(async browserType => {
				return await runTestsInBrowser(modules, browserType);
			}));
		}
	} catch (err) {
		console.error(err);
		process.exit(1);
	}

	// aftermath
	for (const msg of messages) {
		if (msg) {
			didFail = true;
			console.log(msg);
		}
	}
	process.exit(didFail ? 1 : 0);

}).catch(err => {
	console.error(err);
});
