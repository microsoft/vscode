/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import minimist from 'minimist';
import { EmbeddingType } from '../../src/platform/embeddings/common/embeddingsComputer';
import { CacheMode } from './simulationContext';

/** Number of runs that are stored in baseline.json */
export const BASELINE_RUN_COUNT = 10;

export type NesDatagen = {
	readonly input: string;
	readonly output: string | undefined;
	readonly rowOffset: number;
	readonly workerMode: boolean;
}

export class SimulationOptions {
	public static fromProcessArgs(): SimulationOptions {
		return new SimulationOptions(process.argv);
	}

	public static fromArray(argv: readonly string[]): SimulationOptions {
		return new SimulationOptions(argv);
	}

	private readonly argv: minimist.ParsedArgs;

	public readonly help: boolean;
	public readonly listModels: boolean;
	public readonly listTests: boolean;
	public readonly listSuites: boolean;
	public readonly jsonOutput: boolean;
	public readonly nRuns: number;
	public readonly chatModel: string | undefined;
	public readonly smartChatModel: string | undefined;
	public readonly fastChatModel: string | undefined;
	public readonly fastRewriteModel: string | undefined;
	public readonly summarizeHistory: boolean;
	public readonly swebenchPrompt: boolean;
	public readonly embeddingType: EmbeddingType | undefined;
	public readonly boost: boolean;
	public readonly parallelism: number;
	public readonly lmCacheMode: CacheMode;
	public readonly modelCacheMode: CacheMode;
	public readonly resourcesCacheMode: CacheMode;
	public readonly cachePath: string | undefined;
	public readonly externalBaseline: string | undefined;
	public readonly externalScenarios: string | undefined;
	public readonly output: string | undefined;
	public readonly inline: boolean;
	public readonly sidebar: boolean;
	public readonly applyChatCodeBlocks: boolean;
	public readonly stageCacheEntries: boolean;
	public readonly ci: boolean;
	public readonly gc: boolean;
	public readonly externalCacheLayersPath: string | undefined;
	public readonly verbose: number | boolean | undefined;
	public readonly grep: string[] | string | undefined;
	public readonly omitGrep: string | undefined;
	public readonly heapSnapshots: boolean | string | undefined;
	/**   --scenario-test, --scenarioTest          Run tests from provided scenario test file name */
	public readonly scenarioTest: string | undefined;
	public readonly isUpdateBaseline: boolean;
	public readonly noFetch: boolean;
	public readonly noCachePointer: boolean;
	/**
	 * A label for the current simulation run, to be displayed in the UI for distinguishing between runs.
	 */
	public readonly label: string;
	public readonly runServerPoweredNesProvider: boolean;
	public readonly nes: 'external' | 'coffe' | undefined;
	public readonly nesUrl: string | undefined;
	public readonly nesApiKey: string | undefined;

	public readonly nesDatagen: NesDatagen | undefined;

	public readonly subcommand: 'nes-datagen' | undefined;

	public readonly disabledTools: Set<string>;

	/** If true, all tests are run in the extension host */
	public readonly inExtensionHost: boolean;
	/** Extensions to ensure are available in the extension host */
	public readonly installExtensions: string[];
	/** Whether to run headless (defaults to false) */
	public readonly headless: boolean;
	/** @internal Only run a single test number */
	public readonly runNumber: number;
	/** Explicit workspace URI to use for stest --in-extension-host */
	public readonly useScenarioWorkspace: boolean;

	/** If true, will try to use code search using our service. */
	public readonly useExperimentalCodeSearchService: boolean;

	public readonly configFile: string | undefined;

	public readonly modelConfigFile: string | undefined;

	protected constructor(processArgv: readonly string[]) {
		const argv = minimist(processArgv.slice(2));
		this.argv = argv;
		this.help = boolean(argv['help'], false);
		this.listModels = boolean(argv['list-models'], false);
		this.listTests = boolean(argv['list-tests'], false);
		this.listSuites = boolean(argv['list-suites'], false);
		this.jsonOutput = boolean(argv['json'], false);
		this.isUpdateBaseline = boolean(argv['update-baseline'] ?? argv['u'], false);
		this.boost = boolean(argv['boost'], false);
		const fetch = boolean(argv['fetch'], true);
		this.noFetch = !fetch; // `--no-fetch` becomes argv[`fetch`] because of how minimist works
		const cachePointer = boolean(argv['cache-pointer'], true);
		this.noCachePointer = !cachePointer; // `--no-cache-pointer` becomes argv[`cache-pointer`] because of how minimist works
		this.nRuns = typeof argv['n'] === 'number' ? argv['n'] : (this.isUpdateBaseline || argv['ci'] ? BASELINE_RUN_COUNT : 10);
		this.chatModel = this.argv['model'];
		this.smartChatModel = this.argv['smart-model'];
		this.fastChatModel = this.argv['fast-model'];
		this.fastRewriteModel = this.argv['fast-rewrite-model'];
		this.summarizeHistory = boolean(argv['summarize-history'], true);
		this.swebenchPrompt = boolean(argv['swebench-prompt'], false);
		this.embeddingType = cliOptionsToWellKnownEmbeddingsType(this.argv['embedding-model']);
		this.parallelism = this.argv['parallelism'] ?? this.argv['p'] ?? 20;
		this.modelCacheMode = this.argv['skip-model-cache'] ? CacheMode.Disable : CacheMode.Default;
		this.lmCacheMode = (
			this.argv['skip-cache'] ? CacheMode.Disable
				: (this.argv['require-cache'] ? CacheMode.Require : CacheMode.Default)
		);
		this.resourcesCacheMode = (
			this.argv['skip-resources-cache'] ? CacheMode.Disable : CacheMode.Default
		);
		this.externalScenarios = this.argv['external-scenarios'];
		this.externalBaseline = this.argv['external-baseline']; // must be set after `externalScenarios`
		this.validateExternalBaseline();
		this.output = this.argv['output'];
		this.cachePath = this.argv['cache-location'];
		this.inline = boolean(this.argv['inline'], false);
		this.sidebar = boolean(this.argv['sidebar'], false);
		this.applyChatCodeBlocks = boolean(this.argv['apply-chat-code-blocks'], false);
		this.stageCacheEntries = boolean(this.argv['stage-cache-entries'], false);
		this.ci = boolean(this.argv['ci'], false);
		this.gc = boolean(this.argv['gc'], false);
		this.externalCacheLayersPath = argv['external-cache-layers-path'];
		this.verbose = this.argv['verbose'];
		this.grep = argv['grep'];
		this.omitGrep = argv['omit-grep'];
		this.heapSnapshots = argv['heap-snapshots'];
		this.scenarioTest = argv['scenarioTest'] ?? argv['scenario-test'];
		this.label = argv['label'] ?? '';

		this.inExtensionHost = boolean(argv['in-extension-host'], false);
		this.installExtensions = argv['install-extension'] ? argv['install-extension'].split(',') : [];
		this.headless = boolean(argv['headless'], true);
		this.runNumber = Number(argv['run-number']) || 0;

		this.runServerPoweredNesProvider = boolean(argv['runServerPoweredNesProvider'], false);

		this.nes = SimulationOptions.validateNesArgument(argv['nes']);

		this.nesUrl = argv['nes-url'];
		// [SuppressMessage("Microsoft.Security", "CS002:SecretInNextLine", Justification="used for local simulation tests")]
		this.nesApiKey = argv['nes-api-key'];
		SimulationOptions.validateNesUrlOverride(this.nesUrl, this.nesApiKey);

		this.disabledTools = argv['disable-tools'] ? new Set(argv['disable-tools'].split(',')) : new Set();
		this.useScenarioWorkspace = boolean(argv['scenario-workspace-folder'], false);

		this.useExperimentalCodeSearchService = boolean(argv['use-experimental-code-search-service'], false);

		const isNesDatagen = (argv._ as string[]).includes('nes-datagen');
		this.subcommand = isNesDatagen ? 'nes-datagen' : undefined;
		this.nesDatagen = isNesDatagen && argv['input']
			? {
				input: argv['input'],
				output: argv['out'],
				rowOffset: typeof argv['row-offset'] === 'number' ? argv['row-offset'] : 0,
				workerMode: boolean(argv['worker'], false),
			}
			: undefined;

		this.configFile = argv['config-file'];
		this.modelConfigFile = argv['model-config-file'];
	}

	public printHelp(): void {
		console.log([
			`Example usages: `,
			`  npm run simulate`,
			`  npm run simulate -- --external-scenarios=<path> --inline --output=<path>`,
			`  npm run simulate -- --external-scenarios=<path> --sidebar --output=<path>`,
			`  npm run simulate -- --external-scenarios=<path> --nes --output=<path>`,
			`  npm run simulate -- --update-baseline`,
			``,
			`  -u, --update-baseline              Updates scores in baseline.json if they change as a result of your changes to prompts sent to the model`,
			`  --external-scenarios               Path to a directory containing scenarios to run`,
			`  --inline                           Run inline chat external scenarios`,
			`  --sidebar                          Run sidebar chat external scenarios`,
			`  --nes                              Run NES external scenarios`,
			`  --output                           Path to a directory where to generate output`,
			`  --n                                Run each scenario N times`,
			`  --ci                               Equivalent to --n=${BASELINE_RUN_COUNT} but throws if the baseline is not up-to-date`,
			`  --gc                               Used with --require-cache to compact cache layers into the baseline cache`,
			`  --external-cache-layers-path       Used to specify the path to the external cache layers`,
			`  --grep                             Run a test which contains the passed-in string`,
			`  --omit-grep                        Run a test which does not contain the passed-in string`,
			`  --embedding-model                  Specify the model to use for the embedding endpoint (default: ada)`,
			`                                     Values: ada, text3small, text3large`,
			`  --list-models                      List available chat models`,
			`  --model                            Specify the model to use for the chat endpoint (use --list-models to see valid options)`,
			`  --smart-model                      Specify the model to use in place of the smarter slower model, i.e GPT 4o`,
			`  --fast-model                       Specify the model to use in place of the faster / less smart model, i.e GPT 4o mini`,
			`  --fast-rewrite-model               [experimental] Specify the model to use for the fast rewrite endpoint`,
			`  -p, --parallelism                  [experimental] Run tests in parallel (default: 1)`,
			`  --skip-cache                       [experimental] Do not use the cache for language model requests`,
			`  --require-cache                    [experimental] Require cache hits, fail on cache misses`,
			`  --regenerate-cache                 [experimental] Fetch all responses and refresh the cache`,
			`  --skip-resources-cache             [experimental] Do not use the cache for computed resources`,
			`  --skip-model-cache                 [experimental] Do not use the cache for model metadata`,
			`  --stage-cache-entries              [experimental] Stage cache files that were used in current simulation run`,
			`  --list-tests                       List tests without running them`,
			`  --json                             Print output in JSONL format`,
			`  --verbose                          Print more information about test and assertion failures`,
			`  --scenario-test                    Run tests from provided scenario test file name, e.g., 'docComment.stest' or 'docComment.stest.ts' (--scenarioTest is supported but will be deprecated in future)`,
			`  --no-fetch                         Do not send requests to the model endpoint (uses cache but doesn't write to it) (useful to make sure prompts are unchanged by observing cache misses)`,
			`  --no-cache-pointer                 [experimental] Do not write files to outcome/`,
			`  --label                            A label for the current simulation run, to be displayed in the UI for distinguishing between runs`,
			`  --nes-url                           To override endpoint URL for NES (must be used with --nes-api-key)`,
			`  --nes-api-key                        API key for endpoint URL provided via NES (must be used with --nes-url)`,
			`  --runServerPoweredNesProvider      Run stests against the http server powered NES provider (server must be run at port 8001)`,
			`  --disable-tools                    A comma-separated list of tools to disable`,
			`  --swebench-prompt                  Use the headless swebench prompt for agent mode`,
			`  --summarize-history                Enable experimental conversation history summarization in agent mode`,
			`  --scenario-workspace-folder        If true, runs the stest inline in the scenario's workspace folder`,
			`  --config-file                      Path to a JSON file containing configuration options`,
			`  --model-config-file                Path to a JSON file containing model configuration options`,
			``,
			`Subcommands:`,
			`  nes-datagen                        Generate training data from alternative action recordings`,
			`                                     Run 'npm run simulate -- nes-datagen --help' for options`,
			``,
		].join('\n'));
	}

	public printTrainHelp(): void {
		console.log([
			`Usage: npm run simulate -- --config-file=<path> [global options] nes-datagen --input=<path> [options]`,
			``,
			`Generate training data by replaying alternative action recordings through the NES prompt pipeline.`,
			`The prompting strategy is read from the model configuration in --config-file.`,
			``,
			`Options:`,
			`  --input                            Path to a JSON file with training data recordings (required)`,
			`  --out                              Output path for JSON file. Default: <input-path>_output.json`,
			``,
			`Global options (placed before 'nes-datagen'):`,
			`  --config-file                      Path to a JSON config file (required for nes-datagen)`,
			`                                     Must include "chat.advanced.inlineEdits.xtabProvider.modelConfiguration"`,
			`                                     with at least { "modelName", "promptingStrategy", "includeTagsInCurrentFile" }`,
			`  -p, --parallelism                  Number of parallel workers (default: 20)`,
			`  --verbose                          Print detailed progress and error information`,
			`  --help                             Show this help message`,
			``,
			`Examples:`,
			`  npm run simulate -- --config-file=config.json nes-datagen --input=data.json`,
			`  npm run simulate -- --config-file=config.json --parallelism=10 --verbose nes-datagen --input=data.json`,
			``,
		].join('\n'));
	}

	private validateExternalBaseline() {
		if (this.externalBaseline && !this.externalScenarios) {
			throw new Error('External scenarios must be provided for external baseline to work.');
		}
	}

	private static validateNesArgument(nes: unknown): 'external' | 'coffe' | undefined {
		if (nes === undefined || nes === null) {
			return undefined;
		}
		if (typeof nes === 'boolean') { // this's for backward compat because previously it was possible to just pass `--nes` to run external stests against NES
			return 'external';
		}
		if (typeof nes !== 'string') {
			throw new Error(`--nes must be a string, but got: ${typeof nes}`);
		}
		switch (nes) {
			case 'external':
			case 'coffe':
				return nes;
			default:
				throw new Error(`--nes can only be 'external' or 'coffe', but got: ${nes}`);
		}
	}

	private static validateNesUrlOverride(nesUrl: string | undefined, nesApiKey: string | undefined): void {
		if (nesUrl !== undefined && nesApiKey === undefined) {
			throw new Error(`--nesApiKey must be provided when --nesUrl is set`);
		}
		if (nesUrl === undefined && nesApiKey !== undefined) {
			throw new Error(`--nesUrl must be provided when --nesApiKey is set`);
		}
	}
}

function cliOptionsToWellKnownEmbeddingsType(model: string | undefined): EmbeddingType | undefined {
	switch (model) {
		case 'text3small':
		case EmbeddingType.text3small_512.id:
			return EmbeddingType.text3small_512;

		case 'metis':
		case EmbeddingType.metis_1024_I16_Binary.id:
			return EmbeddingType.metis_1024_I16_Binary;

		case undefined:
			return undefined;

		default:
			throw new Error(`Unknown embedding model: ${model}`);
	}
}

function boolean(value: any, defaultValue: boolean): boolean {
	if (typeof value === 'undefined') {
		return defaultValue;
	}
	if (value === 'false') {
		// treat the string 'false' as false
		return false;
	}
	return Boolean(value);
}
