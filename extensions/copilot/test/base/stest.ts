/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as fs from 'fs';
import path from 'path';
import { Config, ExperimentBasedConfig, ExperimentBasedConfigType } from '../../src/platform/configuration/common/configurationService';
import { EmbeddingType } from '../../src/platform/embeddings/common/embeddingsComputer';
import { ILogTarget, LogLevel } from '../../src/platform/log/common/logService';
import { ISimulationTestContext } from '../../src/platform/simulationTestContext/common/simulationTestContext';
import { TestingServiceCollection } from '../../src/platform/test/node/services';
import { createServiceIdentifier } from '../../src/util/common/services';
import { grepStrToRegex } from '../simulation/shared/grepFilter';
import { EXPLICIT_LOG_TAG, IMPLICIT_LOG_TAG, ITestLocation, IWrittenFile, SIMULATION_EXPLICIT_LOG_FILENAME, SIMULATION_IMPLICIT_LOG_FILENAME, SimulationTestOutcome } from '../simulation/shared/sharedTypes';
import { computeSHA256 } from './hash';
import { SimulationOptions } from './simulationOptions';
export { REPO_ROOT } from '../util';

export interface SimulationTestFunction {
	(testingServiceCollection: TestingServiceCollection): Promise<unknown> | unknown;
}

export interface ISimulationTestOptions {
	optional?: boolean;
	skip?: (opts: SimulationOptions) => boolean;
	location?: ITestLocation;
	conversationPath?: string;
	scenarioFolderPath?: string;
	stateFile?: string;
}

export class SimulationTestOptions {
	public get optional(): boolean {
		if (this._suiteOpts.optional) {
			return true;
		}
		return this._opts.optional ?? false;
	}

	public skip(opts: SimulationOptions): boolean {
		if (this._suiteOpts.skip(opts)) {
			return true;
		}
		return this.mySkip(opts);
	}

	private _cachedMySkip: boolean | undefined = undefined;
	private mySkip(opts: SimulationOptions): boolean {
		if (this._cachedMySkip === undefined) {
			this._cachedMySkip = this._opts.skip?.(opts) ?? false;
		}
		return this._cachedMySkip;
	}

	public get location(): ITestLocation | undefined {
		return this._opts.location;
	}

	public get conversationPath(): string | undefined {
		return this._opts.conversationPath;
	}

	public get scenarioFolderPath() {
		return this._opts.scenarioFolderPath;
	}

	public get stateFile() {
		return this._opts.stateFile;
	}

	constructor(
		private readonly _opts: ISimulationTestOptions,
		private readonly _suiteOpts: SimulationSuiteOptions
	) { }
}

export interface ISimulationTestDescriptor {

	/**
	 * This is used to capture the test scenario description itself.
	 */
	readonly description: string;

	/**
	 * The programming language used for the test.
	 *
	 * If not set, may be inherited from the suite this test in if the suite descriptor specifies the language.
	 */
	readonly language?: string;

	/**
	 * The model used for the test.
	 */
	readonly model?: string;

	/**
	 * The embeddings model used for the test.
	 */
	readonly embeddingType?: EmbeddingType;

	/**
	 * Setting configurations defined for the test
	 */
	readonly configurations?: Configuration<any>[];

	/**
	 * Non-extension settings configurations defined for the test
	 */
	readonly nonExtensionConfigurations?: NonExtensionConfiguration[] | undefined;

	/**
	 * Arbitrary attributes that will be serialised to the metadata.json file.
	 */
	readonly attributes?: Record<string, string | number>;
}

export type NonExtensionConfiguration = [string, any];

export type Configuration<T> = { key: ExperimentBasedConfig<ExperimentBasedConfigType> | Config<T>; value: T };

export class SimulationTest {

	public readonly options: SimulationTestOptions;
	public readonly description: string;
	public readonly language: string | undefined;
	public readonly model: string | undefined;
	public readonly embeddingType: EmbeddingType | undefined;
	public readonly configurations: Configuration<any>[] | undefined;
	public readonly nonExtensionConfigurations: NonExtensionConfiguration[] | undefined;
	public readonly attributes: Record<string, string | number> | undefined;

	constructor(
		descriptor: ISimulationTestDescriptor,
		options: ISimulationTestOptions,
		public readonly suite: SimulationSuite,
		private readonly _runner: SimulationTestFunction,
	) {
		this.description = descriptor.description;
		this.language = descriptor.language;
		this.model = descriptor.model;
		this.embeddingType = descriptor.embeddingType;
		this.configurations = descriptor.configurations;
		this.nonExtensionConfigurations = descriptor.nonExtensionConfigurations;
		this.attributes = descriptor.attributes;
		this.options = new SimulationTestOptions(options, suite.options);
	}

	public get fullName(): string {
		return `${this.suite.fullName} ${this.language ? `[${this.language}] ` : ''}- ${this.description}${this.model ? ` - (${this.model})` : ''}${this.embeddingType ? ` - (${this.embeddingType})` : ''}`;
	}

	public get outcomeCategory(): string {
		return this.suite.outcomeCategory;
	}

	public get outcomeFileName(): string {
		return getOutcomeFileName(this.fullName);
	}

	public run(testingServiceCollection: TestingServiceCollection): Promise<unknown> {
		return Promise.resolve(this._runner(testingServiceCollection));
	}

	toString(): string {
		return `SimulationTest: ${this.fullName}`;
	}
}

export function getOutcomeFileName(testName: string): string {
	let suffix = '';
	if (testName.endsWith(' - (gpt-4)')) {
		testName = testName.substring(0, testName.length - 10);
		suffix = '-gpt-4';
	} else if (testName.endsWith(' - (gpt-3.5-turbo)')) {
		testName = testName.substring(0, testName.length - 18);
		suffix = '-gpt-3.5-turbo';
	}
	const result = toDirname(testName);
	return `${result.substring(0, 60)}${suffix}.json`.replace(/-+/g, '-');
}

export interface ISimulationSuiteOptions {
	optional?: boolean;
	skip?: (opts: SimulationOptions) => boolean;
	location?: ITestLocation;
}

export class SimulationSuiteOptions {
	public get optional(): boolean {
		return this._opts.optional ?? false;
	}

	private _cachedSkip: boolean | undefined = undefined;
	public skip(opts: SimulationOptions): boolean {
		if (this._cachedSkip === undefined) {
			this._cachedSkip = this._opts.skip?.(opts) ?? false;
		}
		return this._cachedSkip;
	}

	public get location(): ITestLocation | undefined {
		return this._opts.location;
	}

	constructor(
		private readonly _opts: ISimulationSuiteOptions
	) { }
}

export type ExtHostDescriptor = boolean; // todo: more things like extension config later

export interface ISimulationSuiteDescriptor {

	/***
	 * This is used to group tests together.
	 * If using a slashCommand, use the command name else use "generic"
	 */
	readonly title: string;


	/***
	 * This is used to capture the test scenario scope.
	 * Example: e2e, prompt, generate etc.
	 */
	readonly subtitle?: string;
	readonly location: 'inline' | 'panel' | 'external' | 'context';

	/**
	 * The programming language this suite tests.
	 *
	 * The test within the suite will also have this language if they do not specify a language in their descriptor {@link ISimulationTestDescriptor}.
	 */
	readonly language?: string;

	/**
	 * Settings that override default settings in configuration service.
	 *
	 * These settings can further be overridden by the test itself.
	 */
	readonly configurations?: Configuration<any>[];

	/**
	 * Non-extension settings configurations defined for the test
	 */
	readonly nonExtensionConfigurations?: NonExtensionConfiguration[] | undefined;

	/**
	 * Set to true to run in a real VS Code extension host.
	 */
	readonly extHost?: ExtHostDescriptor;
}

export class SimulationSuite {
	public readonly options: SimulationSuiteOptions;

	public readonly language: string | undefined;

	private readonly _title: string;
	private readonly _subtitle: string | undefined;
	private readonly _location: 'inline' | 'panel' | 'external' | 'context';

	public readonly configurations: Configuration<any>[] | undefined;
	public readonly nonExtensionConfigurations: NonExtensionConfiguration[] | undefined;
	public readonly extHost: ExtHostDescriptor | undefined;

	constructor(
		descriptor: ISimulationSuiteDescriptor,
		opts: ISimulationSuiteOptions = {},
		public readonly tests: SimulationTest[] = [],
	) {
		this._title = descriptor.title;
		this._subtitle = descriptor.subtitle;
		this._location = descriptor.location;
		this.language = descriptor.language;
		this.configurations = descriptor.configurations;
		this.nonExtensionConfigurations = descriptor.nonExtensionConfigurations;
		this.options = new SimulationSuiteOptions(opts);
	}

	public get fullName(): string {
		return `${this._title} ${this._subtitle ? `(${this._subtitle}) ` : ''}[${this._location}]`;
	}

	public get outcomeCategory(): string {
		return `${this._title}${this._subtitle ? `-${this._subtitle}` : ''}-${this._location}`;
	}
}

export type SimulationTestFilter = (test: SimulationTest) => boolean;
export function createSimulationTestFilter(grep?: string[] | string, omitGrep?: string): SimulationTestFilter {
	const filters: ((test: SimulationTest) => boolean)[] = [];
	if (grep) {

		if (typeof grep === 'string') {
			let trimmedGrep = grep.trim();
			const isSuiteNameSearch = trimmedGrep.startsWith('!s:');
			if (isSuiteNameSearch) {
				trimmedGrep = trimmedGrep.replace(/^!s:/, '');
			}
			const grepRegex = grepStrToRegex(trimmedGrep);
			filters.push((test) => isSuiteNameSearch ? grepRegex.test(test.suite.fullName) : grepRegex.test(test.fullName));
		} else {
			const grepArr = Array.isArray(grep) ? grep : [grep];
			for (const grep of grepArr) {
				const grepLowerCase = String(grep).toLowerCase();
				const grepFilter = (str: string) => str.toLowerCase().indexOf(grepLowerCase) >= 0;
				filters.push((test) => grepFilter(test.fullName));
			}
		}
	}

	if (omitGrep) {
		const omitGrepRegex = grepStrToRegex(omitGrep);
		filters.push((test) => !omitGrepRegex.test(test.fullName));
	}
	return (test: SimulationTest) => filters.every(shouldRunTest => shouldRunTest(test));
}

class SimulationTestsRegistryClass {
	private readonly defaultSuite: SimulationSuite = new SimulationSuite({ title: 'generic', location: 'inline' });
	private suites: SimulationSuite[] = [this.defaultSuite];
	private currentSuite: SimulationSuite = this.defaultSuite;
	private readonly testNames = new Set<string>();

	private _inputPath: string | undefined;
	public setInputPath(inputPath: string) {
		this._inputPath = inputPath;
	}

	private _testPath: string | undefined;
	private _filter: (test: SimulationTest) => boolean = () => true;
	public setFilters(testPath?: string, grep?: string[] | string, omitGrep?: string) {
		this._testPath = testPath;
		this._filter = createSimulationTestFilter(grep, omitGrep);
	}

	public getAllSuites(): readonly SimulationSuite[] {
		return this.suites;
	}

	public getAllTests(): readonly SimulationTest[] {
		const allTests = this.suites.reduce((prev, curr) => prev.concat(curr.tests), [] as SimulationTest[]);
		const testsToRun = allTests.filter(this._filter).sort((t0, t1) => t0.fullName.localeCompare(t1.fullName));
		return testsToRun;
	}

	private _allowTestReregistration = false;

	public allowTestReregistration() {
		this._allowTestReregistration = true;
	}

	public registerTest(testDescriptor: ISimulationTestDescriptor, options: ISimulationTestOptions, runner: SimulationTestFunction): void {
		if (testDescriptor.language === undefined && this.currentSuite.language) {
			testDescriptor = { ...testDescriptor, language: this.currentSuite.language };
		}

		// inherit configurations from suite
		if (this.currentSuite.configurations !== undefined) {
			const updatedConfigurations =
				testDescriptor.configurations === undefined
					? this.currentSuite.configurations
					: [...this.currentSuite.configurations, ...testDescriptor.configurations];
			testDescriptor = { ...testDescriptor, configurations: updatedConfigurations };
		}

		if (this.currentSuite.nonExtensionConfigurations !== undefined) {
			const updatedNonExtConfig: NonExtensionConfiguration[] = this.currentSuite.nonExtensionConfigurations.slice(0);
			updatedNonExtConfig.push(...testDescriptor.nonExtensionConfigurations ?? []);
			testDescriptor = { ...testDescriptor, nonExtensionConfigurations: updatedNonExtConfig };
		}

		// remove newlines, carriage returns, bad whitespace, etc
		testDescriptor = { ...testDescriptor, description: testDescriptor.description.replace(/\s+/g, ' ') };

		// force a length of 100 chars for a stest name
		if (testDescriptor.description.length > 100) {
			testDescriptor = { ...testDescriptor, description: testDescriptor.description.substring(0, 100) + '…' };
		}

		const test = new SimulationTest(testDescriptor, options, this.currentSuite, runner);
		// change this validation up
		if (this.testNames.has(test.fullName) && !this._allowTestReregistration) {
			throw new Error(`Cannot have two tests with the same name: ${test.fullName}`);
		}
		this.testNames.add(test.fullName);

		this.currentSuite.tests.push(test);
	}

	public registerSuite(descriptor: ISimulationSuiteDescriptor, options: ISimulationSuiteOptions, factory: (inputPath?: string) => void) {
		if (this._testPath && options.location !== undefined) {

			const testBasename = path.basename(options.location.path);
			const testBasenameWithoutExtension = testBasename.replace(/\.[^/.]+$/, '');

			if (this._testPath !== testBasename && this._testPath !== testBasenameWithoutExtension) {
				return;
			}
		}

		const suite = new SimulationSuite(descriptor, options);

		function suiteId(s: SimulationSuite): string {
			return s.options.location?.path + '###' + s.fullName;
		}
		this.suites = this.suites.filter(s => suiteId(s) !== suiteId(suite)); // When re-registering a suite, delete the old one
		this.suites.push(suite);
		this.invokeSuiteFactory(suite, factory);
	}

	private invokeSuiteFactory(suite: SimulationSuite, factory: (inputPath?: string) => void) {
		try {
			this.currentSuite = suite;
			factory(this._inputPath);
		} finally {
			this.currentSuite = this.defaultSuite;
		}
	}
}

export const SimulationTestsRegistry = new SimulationTestsRegistryClass();

function captureLocation(fn: Function): ITestLocation | undefined {
	try {
		const err = new Error();
		Error.captureStackTrace(err, fn);
		throw err;
	} catch (e) {

		const stack = (<string[]>e.stack.split('\n')).at(1);
		if (!stack) {
			// It looks like sometimes the stack is empty,
			// so let's add a fallback case
			return captureLocationUsingClassicalWay();
		}
		return extractPositionFromStackTraceLine(stack);
	}

	function captureLocationUsingClassicalWay(): ITestLocation | undefined {
		try {
			throw new Error();
		} catch (e) {
			// Error:
			//     at captureLocationUsingClassicalWay (/Users/alex/src/vscode-copilot/test/base/stest.ts:398:10)
			//     at captureLocation (/Users/alex/src/vscode-copilot/test/base/stest.ts:374:11)
			//     at stest (/Users/alex/src/vscode-copilot/test/base/stest.ts:467:84)
			//     at /Users/alex/src/vscode-copilot/test/codeMapper/codeMapper.stest.ts:22:2
			const stack = (<string[]>e.stack.split('\n')).at(4);
			if (!stack) {
				console.log(`No stack in captureLocation`);
				console.log(e.stack);
				return undefined;
			}
			return extractPositionFromStackTraceLine(stack);
		}
	}

	function extractPositionFromStackTraceLine(stack: string): ITestLocation | undefined {
		const r1 = /\((.+):(\d+):(\d+)\)/;
		const r2 = /at (.+):(\d+):(\d+)/;
		const match = stack.match(r1) ?? stack.match(r2);
		if (!match) {
			console.log(`No matches in stack for captureLocation`);
			console.log(stack);
			return undefined;
		}

		return {
			path: match[1],
			position: {
				line: Number(match[2]) - 1,
				character: Number(match[3]) - 1,
			}
		};
	}
}

/**
 * @remarks DO NOT FORGET to register the test file in `simulationTests.ts` for local test files
 */
export function ssuite(descriptor: ISimulationSuiteDescriptor, factory: (inputPath?: string) => void) {
	SimulationTestsRegistry.registerSuite(descriptor, { optional: false, location: captureLocation(ssuite) }, factory);
}
ssuite.optional = function (skip: (opts: SimulationOptions) => boolean, descriptor: ISimulationSuiteDescriptor, factory: (inputPath?: string) => void) {
	SimulationTestsRegistry.registerSuite(descriptor, { optional: true, skip, location: captureLocation(ssuite.optional) }, factory);
};
ssuite.skip = function (descriptor: ISimulationSuiteDescriptor, factory: (inputPath?: string) => void) {
	SimulationTestsRegistry.registerSuite(descriptor, { optional: true, skip: (_: SimulationOptions) => true, location: captureLocation(ssuite.skip) }, factory);
};

/**
 * The test function will receive as first argument a context.
 *
 * On the context, you will find a good working ChatMLFetcher which uses caching
 * and a caching slot which matches the run number.
 *
 * You will also find `SimulationTestRuntime` on the context, which allows you
 * to use logging in your test or write files to the test outcome directory.
 */
export function stest(testDescriptor: string | ISimulationTestDescriptor, runner: SimulationTestFunction, opts?: ISimulationTestOptions) {
	testDescriptor = typeof testDescriptor === 'string' ? { description: testDescriptor } : testDescriptor;
	SimulationTestsRegistry.registerTest(testDescriptor, { optional: false, location: captureLocation(stest), ...opts }, runner);
}
stest.optional = function (skip: () => boolean, testDescriptor: ISimulationTestDescriptor, runner: SimulationTestFunction, opts?: ISimulationTestOptions) {
	SimulationTestsRegistry.registerTest(testDescriptor, { optional: true, skip, location: captureLocation(stest.optional), ...opts }, runner);
};
stest.skip = function (testDescriptor: ISimulationTestDescriptor, runner: SimulationTestFunction, opts?: ISimulationTestOptions) {
	SimulationTestsRegistry.registerTest(testDescriptor, { optional: true, skip: () => true, location: captureLocation(stest.skip), ...opts }, runner);
};

export const ISimulationTestRuntime = createServiceIdentifier<ISimulationTestRuntime>('ISimulationTestRuntime');

export interface ISimulationTestRuntime extends ILogTarget, ISimulationTestContext {

	logIt(level: LogLevel, metadataStr: string, ...extra: any[]): void;
	shouldLog(level: LogLevel): boolean | undefined;
	log(message: string, err?: any): void;
	flushLogs(): Promise<void>;
	writeFile(filename: string, contents: Uint8Array | string, tag: string): Promise<string>;
	getWrittenFiles(): IWrittenFile[];
	getOutcome(): SimulationTestOutcome | undefined;
	setOutcome(outcome: SimulationTestOutcome): void;
	getExplicitScore(): number | undefined;
	setExplicitScore(score: number): void;
}

export class SimulationTestRuntime implements ISimulationTestRuntime {

	declare readonly _serviceBrand: undefined;

	private readonly explicitLogMessages: string[] = [];
	private readonly implicitLogMessages: string[] = [];
	private readonly writtenFiles: IWrittenFile[] = [];
	private score?: number;
	private outcome: SimulationTestOutcome | undefined = undefined;

	constructor(
		private readonly baseDir: string,
		private readonly testOutcomeDir: string,
		protected readonly runNumber: number
	) { }

	public readonly isInSimulationTests = true;

	public logIt(level: LogLevel, metadataStr: string, ...extra: any[]): void {
		const timestamp = new Date().toISOString();
		this.implicitLogMessages.push(`[${timestamp}] ${metadataStr} ${extra.join(' ')}`);
	}

	public shouldLog(level: LogLevel): boolean | undefined {
		return undefined;
	}

	public log(message: string, err?: any): void {
		if (err) {
			message += ' ' + (err.stack ? String(err.stack) : String(err));
		}
		this.explicitLogMessages.push(message);
	}

	public async flushLogs(): Promise<void> {
		if (this.explicitLogMessages.length > 0) {
			await this.writeFile(SIMULATION_EXPLICIT_LOG_FILENAME, this.explicitLogMessages.join('\n'), EXPLICIT_LOG_TAG);
		}
		if (this.implicitLogMessages.length > 0) {
			await this.writeFile(SIMULATION_IMPLICIT_LOG_FILENAME, this.implicitLogMessages.join('\n'), IMPLICIT_LOG_TAG);
		}
	}

	public async writeFile(filename: string, contents: Uint8Array | string, tag: string): Promise<string> {
		const dest = this._findUniqueFilename(
			path.join(this.testOutcomeDir, this.massageFilename(filename))
		);

		const relativePath = path.relative(this.baseDir, dest);
		this.writtenFiles.push({
			relativePath,
			tag
		});

		await fs.promises.mkdir(path.dirname(dest), { recursive: true });
		await fs.promises.writeFile(dest, contents);
		return relativePath;
	}

	protected massageFilename(filename: string): string {
		return `${(this.runNumber).toString().padStart(2, '0')}-${filename}`;
	}

	/**
	 * Generate a new filePath in case this filePath already exists.
	 */
	private _findUniqueFilename(initialFilePath: string): string {
		for (let i = 0; i < 1000; i++) {
			let filePath = initialFilePath;
			if (i > 0) {
				// This file was already written, we'll rename it to <basename>.X.<ext>
				const ext = path.extname(initialFilePath);
				const basename = initialFilePath.substring(0, initialFilePath.length - ext.length);
				filePath = `${basename}.${i}${ext}`;
			}
			const relativePath = path.relative(this.baseDir, filePath);
			const exists = this.writtenFiles.find(x => x.relativePath === relativePath);
			if (!exists) {
				return filePath;
			}
		}
		return initialFilePath;
	}

	public getWrittenFiles(): IWrittenFile[] {
		return this.writtenFiles.slice(0);
	}

	public getOutcome(): SimulationTestOutcome | undefined {
		return this.outcome;
	}

	public setOutcome(outcome: SimulationTestOutcome) {
		this.outcome = outcome;
	}

	public getExplicitScore(): number | undefined {
		return this.score;
	}

	public setExplicitScore(score: number) {
		this.score = score;
	}
}

const FILENAME_LIMIT = 125;

export function toDirname(testName: string): string {
	const filename = testName.replace(/[^a-zA-Z0-9]/g, '-').replace(/-+/g, '-').toLowerCase();
	if (filename.length > FILENAME_LIMIT) { // windows file names can not exceed 255 chars and path length limits, so keep it short
		return `${filename.substring(0, FILENAME_LIMIT)}-${computeSHA256(filename).substring(0, 8)}`;
	}
	return filename;
}