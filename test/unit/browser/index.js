/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

//@ts-check

const path = require('path');
const glob = require('glob');
const events = require('events');
const mocha = require('mocha');
const createStatsCollector = require('../../../node_modules/mocha/lib/stats-collector');
const MochaJUnitReporter = require('mocha-junit-reporter');
const url = require('url');
const cp = require('child_process');
const minimatch = require('minimatch');
const playwright = require('playwright');
const tsMorph = require('ts-morph');

// opts
const defaultReporterName = process.platform === 'win32' ? 'list' : 'spec';
const optimist = require('optimist')
	// .describe('grep', 'only run tests matching <pattern>').alias('grep', 'g').alias('grep', 'f').string('grep')
	.describe('build', 'run with build output (out-build)').boolean('build')
	.describe('run', 'only run tests matching <relative_file_path>').string('run')
	.describe('commit', 'only run tests that are impacted by the changes in the specified commit').string('commit')
	.describe('glob', 'only run tests matching <glob_pattern>').string('glob')
	.describe('debug', 'do not run browsers headless').boolean('debug')
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
			}
		}
	} else {
		const reporterPath = path.join(path.dirname(require.resolve('mocha')), 'lib', 'reporters', argv.reporter);
		let ctor;

		try {
			ctor = require(reporterPath);
		} catch (err) {
			try {
				ctor = require(argv.reporter);
			} catch (err) {
				ctor = process.platform === 'win32' ? mocha.reporters.List : mocha.reporters.Spec;
				console.warn(`could not load reporter: ${argv.reporter}, using ${ctor.name}`);
			}
		}

		function parseReporterOption(value) {
			let r = /^([^=]+)=(.*)$/.exec(value);
			return r ? { [r[1]]: r[2] } : {};
		}

		let reporterOptions = argv['reporter-options'];
		reporterOptions = typeof reporterOptions === 'string' ? [reporterOptions] : reporterOptions;
		reporterOptions = reporterOptions.reduce((r, o) => Object.assign(r, parseReporterOption(o)), {});

		return (_, runner) => new ctor(runner, { reporterOptions })
	}
})()

const outdir = argv.build ? 'out-build' : 'out';
const out = path.join(__dirname, `../../../${outdir}`);

function ensureIsArray(a) {
	return Array.isArray(a) ? a : [a];
}

const testModules = (async function () {

	const excludeGlob = '**/{node,electron-sandbox,electron-browser,electron-main}/**/*.test.js';
	let isDefaultModules = true;
	let promise;

	const processTestFiles = (files) => {
		return ensureIsArray(files).map(file => {
			file = file.replace(/^src/, 'out');
			file = file.replace(/\.ts$/, '.js');
			return path.relative(out, file);
		});
	}

	const getGlobFiles = (globPattern) => {
		const defaultGlob = '**/*.test.js';
		const pattern = globPattern || defaultGlob
		isDefaultModules = pattern === defaultGlob;

		return new Promise((resolve, reject) => {
			glob(pattern, { cwd: out }, (err, files) => {
				if (err) {
					reject(err);
				} else {
					resolve(files)
				}
			});
		});
	}

	if (argv.run) {
		// use file list (--run)
		isDefaultModules = false;
		promise = Promise.resolve(processTestFiles(argv.run));

	} else if (argv.commit) {
		// use file list based on commit (--commit)
		isDefaultModules = false;

		const getCommitChanges = (commit) => {
			let changes = [];

			const changesRaw = cp.execSync(`git diff-tree --no-commit-id --name-status -r ${commit}`, { encoding: 'utf8' });
			for (const change of changesRaw.split('\n')) {
				const changeDetails = change.split('\t');

				// Invalid output
				if (changeDetails.length !== 2) {
					continue;
				}

				// Deleted file
				if (changeDetails[0] === 'D') {
					continue;
				}

				changes.push(changeDetails[1]);
			}
			return changes;
		}

		const createDependencyMap = () => {
			const dependencyMap = new Map();
			const project = new tsMorph.Project({
				tsConfigFilePath: 'src/tsconfig.json',
			});
			for (let file of project.getSourceFiles()) {
				const references = [];
				const filePath = file.getFilePath();
				const filePathKey = filePath.substr(filePath.indexOf('src/'));

				for (let node of file.getReferencingNodesInOtherSourceFiles()) {
					// @ts-expect-error
					if (node.getKind() === tsMorph.SyntaxKind.ImportDeclaration && !node.isTypeOnly()) {
						const referenceFilePath = node.getSourceFile().getFilePath();
						references.push(referenceFilePath.substr(referenceFilePath.indexOf('src/')));
					}
				}

				dependencyMap.set(filePathKey, references);
			}

			return dependencyMap;
		}

		const getReachableTestSuites = (root) => {
			const array = [];
			const visited = new Set([...root]);

			const getIndentation = (indentation) => {
				let indentationStr = '';
				for (let i = 0; i < indentation; i++) {
					indentationStr = indentationStr + '    ';
				}
				return indentationStr;
			}

			array.push({ indentation: 0, file: root });
			while (array.length !== 0) {
				//let item = array.shift(); // BFS
				let item = array.pop(); // DFS
				if (item.file.endsWith('.test.ts')) {
					console.log(getIndentation(item.indentation) + ' * ' + item.file);
				} else {
					console.log(getIndentation(item.indentation) + ' - ' + item.file);
				}
				const dependencies = dependencyMap.get(item.file);
				dependencies
					.filter(d => !visited.has(d))
					.forEach(d => {
						visited.add(d);
						array.push({ indentation: item.indentation + 1, file: d });
					});
			}

			return [...visited].filter(f => f.endsWith('.test.ts'));
		}

		const commnitChanges = getCommitChanges(argv.commit);
		if (commnitChanges.some(file => !file.endsWith('.ts'))) {
			// There are changes in the commit that are .ts files
			promise = getGlobFiles(undefined);
			return;
		}

		const testFiles = new Set();
		const dependencyMap = createDependencyMap();
		for (const file of commnitChanges) {
			// Added/Modified test file
			if (file.endsWith('.test.ts')) {
				testFiles.add(file);
				continue;
			}
			// Add reachable test suites
			getReachableTestSuites(file).forEach(f => testFiles.add(f));
		}

		console.log(testFiles);
		promise = Promise.resolve(processTestFiles([...testFiles]));

	} else {
		// glob patterns (--glob)
		promise = getGlobFiles(argv.glob);
	}

	return promise.then(files => {
		const modules = [];
		for (let file of files) {
			if (!minimatch(file, excludeGlob)) {
				modules.push(file.replace(/\.js$/, ''));

			} else if (!isDefaultModules) {
				console.warn(`DROPPING ${file} because it cannot be run inside a browser`);
			}
		}
		return modules;
	})
})();


async function runTestsInBrowser(testModules, browserType) {
	const args = process.platform === 'linux' && browserType === 'chromium' ? ['--no-sandbox'] : undefined; // disable sandbox to run chrome on certain Linux distros
	const browser = await playwright[browserType].launch({ headless: !Boolean(argv.debug), args });
	const context = await browser.newContext();
	const page = await context.newPage();
	const target = url.pathToFileURL(path.join(__dirname, 'renderer.html'));
	if (argv.build) {
		target.search = `?build=true`;
	}
	await page.goto(target.href);

	const emitter = new events.EventEmitter();
	await page.exposeFunction('mocha_report', (type, data1, data2) => {
		emitter.emit(type, data1, data2)
	});

	page.on('console', async msg => {
		console[msg.type()](msg.text(), await Promise.all(msg.args().map(async arg => await arg.jsonValue())));
	});

	withReporter(browserType, new EchoRunner(emitter, browserType.toUpperCase()));

	// collection failures for console printing
	const fails = [];
	emitter.on('fail', (test, err) => {
		if (err.stack) {
			const regex = /(vs\/.*\.test)\.js/;
			for (let line of String(err.stack).split('\n')) {
				const match = regex.exec(line);
				if (match) {
					fails.push(match[1]);
					break;
				}
			}
		}
	});

	try {
		// @ts-expect-error
		await page.evaluate(modules => loadAndRun(modules), testModules);
	} catch (err) {
		console.error(err);
	}
	await browser.close();

	if (fails.length > 0) {
		return `to DEBUG, open ${browserType.toUpperCase()} and navigate to ${target.href}?${fails.map(module => `m=${module}`).join('&')}`;
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

	// run tests in selected browsers
	const browserTypes = Array.isArray(argv.browser)
		? argv.browser : [argv.browser];

	const promises = browserTypes.map(async browserType => {
		try {
			return await runTestsInBrowser(modules, browserType);
		} catch (err) {
			console.error(err);
			process.exit(1);
		}
	});

	// aftermath
	let didFail = false;
	const messages = await Promise.all(promises);
	for (let msg of messages) {
		if (msg) {
			didFail = true;
			console.log(msg);
		}
	}
	process.exit(didFail ? 1 : 0);

}).catch(err => {
	console.error(err);
});
