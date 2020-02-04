/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

//@ts-check

const path = require('path');
const glob = require('glob');
const events = require('events');
const mocha = require('mocha');
const url = require('url');
const minimatch = require('minimatch');
const playwright = require('playwright');

// opts
const defaultReporterName = process.platform === 'win32' ? 'list' : 'spec';
const optimist = require('optimist')
	.describe('grep', 'only run tests matching <pattern>').alias('grep', 'g').alias('grep', 'f').string('grep')
	.describe('run', 'only run tests matching <file_pattern>').alias('run', 'glob').string('runGlob')
	.describe('build', 'run with build output (out-build)').boolean('build')
	.describe('reporter', 'the mocha reporter').string('reporter').default('reporter', defaultReporterName)
	.describe('reporter-options', 'the mocha reporter options').string('reporter-options').default('reporter-options', '')
	.describe('tfs', 'tfs').string('tfs')
	.describe('help', 'show the help').alias('help', 'h');

// logic
const argv = optimist.argv;


const Reporter = (function () {
	const reporterPath = path.join(path.dirname(require.resolve('mocha')), 'lib', 'reporters', argv.reporter);
	let Reporter;

	try {
		Reporter = require(reporterPath);
	} catch (err) {
		try {
			Reporter = require(argv.reporter);
		} catch (err) {
			Reporter = process.platform === 'win32' ? mocha.reporters.List : mocha.reporters.Spec;
			console.warn(`could not load reporter: ${argv.reporter}, using ${Reporter.name}`);
		}
	}

	// let reporterOptions = argv['reporter-options'];
	// reporterOptions = typeof reporterOptions === 'string' ? [reporterOptions] : reporterOptions;
	// reporterOptions = reporterOptions.reduce((r, o) => Object.assign(r, parseReporterOption(o)), {});

	return Reporter
})()

const outdir = argv.build ? 'out-build' : 'out';
const out = path.join(__dirname, `../../${outdir}`);

const testModules = (async function () {

	const defaultGlob = '**/test/**/{common,browser}/**/*.test.js';
	const pattern = argv.glob || defaultGlob

	return new Promise((resolve, reject) => {
		glob(pattern, { cwd: out }, (err, files) => {
			if (err) {
				reject(err);
				return;
			}

			let modules = files.map(file => file.replace(/\.js$/, ''));

			if (pattern !== defaultGlob) {
				// defaultGlob is the biggest set of files
				const len = modules.length;
				modules = modules.filter(module => !minimatch(module, defaultGlob));
				if (len !== modules.length) {
					console.warn(`DROPPED ${len - modules.length} files because ${pattern} is more relaxed than ${defaultGlob}`)
				}
			}

			resolve(modules);
		});
	})
})();


async function runTestsInBrowser(testModules, browserType) {

	const browser = await playwright[browserType].launch();
	const context = await browser.newContext();

	const target = url.pathToFileURL(path.join(__dirname, 'renderer.html'));
	const page = await context.newPage(target.href);

	const emitter = new events.EventEmitter();
	await page.exposeFunction('mocha_report', (type, data1, data2) => {
		emitter.emit(type, data1, data2)
	});

	page.on('console', async msg => {
		console[msg.type()](msg.text(), await Promise.all(msg.args().map(async arg => await arg.jsonValue())));
	});

	new Reporter(new EchoRunner(emitter, browserType.toUpperCase()));

	try {
		// @ts-ignore
		await page.evaluate(modules => loadAndRun(modules), testModules);
	} catch (err) {
		console.error(err);
	}
	await browser.close();
}

class EchoRunner extends events.EventEmitter {

	constructor(event, title = '') {
		super();
		event.on('start', () => this.emit('start'));
		event.on('end', () => this.emit('end'));
		event.on('suite', (suite) => this.emit('suite', EchoRunner.deserializeSuite(suite, title)));
		event.on('suite end', (suite) => this.emit('suite end', EchoRunner.deserializeSuite(suite, title)));
		event.on('test', (test) => this.emit('test', EchoRunner.deserializeRunnable(test)));
		event.on('test end', (test) => this.emit('test end', EchoRunner.deserializeRunnable(test)));
		event.on('hook', (hook) => this.emit('hook', EchoRunner.deserializeRunnable(hook)));
		event.on('hook end', (hook) => this.emit('hook end', EchoRunner.deserializeRunnable(hook)));
		event.on('pass', (test) => this.emit('pass', EchoRunner.deserializeRunnable(test)));
		event.on('fail', (test, err) => this.emit('fail', EchoRunner.deserializeRunnable(test), EchoRunner.deserializeError(err)));
		event.on('pending', (test) => this.emit('pending', EchoRunner.deserializeRunnable(test)));
	}

	static deserializeSuite(suite, titleExtra) {
		return {
			root: suite.root,
			suites: suite.suites,
			tests: suite.tests,
			title: titleExtra && suite.title ? `${suite.title} - /${titleExtra}/` : suite.title,
			fullTitle: () => suite.fullTitle,
			timeout: () => suite.timeout,
			retries: () => suite.retries,
			enableTimeouts: () => suite.enableTimeouts,
			slow: () => suite.slow,
			bail: () => suite.bail
		};
	}

	static deserializeRunnable(runnable) {
		return {
			title: runnable.title,
			fullTitle: () => runnable.fullTitle,
			async: runnable.async,
			slow: () => runnable.slow,
			speed: runnable.speed,
			duration: runnable.duration
		};
	}

	static deserializeError(err) {
		const inspect = err.inspect;
		err.inspect = () => inspect;
		return err;
	}
}

testModules.then(async modules => {
	await Promise.all([
		runTestsInBrowser(modules, 'chromium'),
		runTestsInBrowser(modules, 'webkit'),
		// runTestsInBrowser(modules, 'firefox'),
	]);
}).catch(err => {
	console.error(err);
});
