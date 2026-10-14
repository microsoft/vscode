/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/* Data for the Copilot request-handler bridge ("shim"); values marked "Provisional" are placeholders until measured on target hardware. */

// #region Targets

/** `process.platform`-`process.arch` pairs the bridge supports. */
export const LOCAL_MODEL_SUPPORTED_TARGETS = ['win32-x64', 'win32-arm64', 'darwin-arm64', 'darwin-x64', 'linux-x64', 'linux-arm64'] as const;
export type LocalModelTarget = typeof LOCAL_MODEL_SUPPORTED_TARGETS[number];

// #endregion

// #region Catalog

/** CAPI on-device ids Auto admits today. Delete once CAPI publishes them. */
export const KNOWN_AUTO_LOCAL_IDS: readonly string[] = ['mai-code-1.1-flash-local'];

/** Suffix CAPI uses for on-device ids. Never doubled when deriving a `capiId`. */
export const LOCAL_CAPI_ID_SUFFIX = '-local';
/** Asset-name suffix replaced by {@link LOCAL_CAPI_ID_SUFFIX} (`MAI-Code-1.1-Flash-On-Device` -> `mai-code-1.1-flash-local`). */
export const ON_DEVICE_ASSET_SUFFIX = '-on-device';

/** The Azure ML registry on-device models are discovered in and downloaded from: public and anonymous. */
export const PUBLIC_REGISTRY = 'azureml';
/** The registry of a catalog entry; its models live under `azureml-models/<registry>/` in the shared store. */
export type LocalModelRegistryName = typeof PUBLIC_REGISTRY;

/** The registry's canonical catalog metadata keys, the scope of the Copilot CLI and app; values are typed. */
export const LOCAL_MODEL_METADATA = {
	publisher: 'publisher',
	modelFlavor: 'modelFlavor',
	keywords: 'keywords',
	displayName: 'displayName',
	maxInputTokens: 'maxInputTokens',
	textContextWindow: 'textContextWindow',
	maxOutputTokens: 'maxOutputTokens',
	supportsToolCalling: 'supportsToolCalling',
	license: 'license',
	licenseDescription: 'licenseDescription',
	directoryPath: 'directoryPath',
	/** A JSON object `{ downloadBytes, peakDiskBytes, recommendedVramBytes }`; a JSON string when it is a tag. */
	requirements: 'githubCopilotLocalRequirements',
} as const;

/** The Microsoft GGUF coding scope a catalog model must be in, the Copilot CLI's scope. */
export const LOCAL_MODEL_METADATA_SCOPE = { publisher: 'Microsoft', modelFlavor: 'GGUF', keyword: 'Coding' } as const;

/** Azure ML tags (string values): the production registry's canonical names, with an earlier tag contract still read as a fallback. */
export const LOCAL_MODEL_TAGS = {
	localCoding: 'localCoding',
	modelFormat: 'modelFormat',
	githubCopilotLocal: 'githubCopilotLocal',
	modelFlavor: 'model_flavor',
	displayName: 'displayName',
	downloadBytes: 'downloadBytes',
	peakDiskBytes: 'peakDiskBytes',
	recommendedVramBytes: 'recommendedVramBytes',
	maxInputTokens: 'maxInputTokens',
	textContextWindow: 'textContextWindow',
	maxPromptTokens: 'maxPromptTokens',
	maxContextWindowTokens: 'maxContextWindowTokens',
	maxOutputTokens: 'maxOutputTokens',
	supportsToolCalling: 'supportsToolCalling',
	supportsToolCalls: 'supportsToolCalls',
	license: 'license',
	licenseDescription: 'licenseDescription',
	licenseName: 'licenseName',
	licenseUrl: 'licenseUrl',
	requirements: 'githubCopilotLocalRequirements',
	minLlamaCppBuild: 'minLlamaCppBuild',
	directoryPath: 'directoryPath',
	modelUri: 'modelUri',
} as const;

/** The Copilot CLI's temporary requirements for this exact version until the registry publishes `githubCopilotLocalRequirements`; published values always win. */
export const UNPUBLISHED_REQUIREMENTS_FALLBACK = {
	registry: 'azureml',
	assetName: 'MAI-Code-1.1-Flash-On-Device',
	version: '1',
	downloadBytes: 56_688_835_352,
	peakDiskBytes: 56_688_835_352,
	recommendedVramBytes: 103_079_215_104,
} as const;

export const DISPLAY_NAME_MAX_LENGTH = 100;

/*
 * The Azure ML catalog endpoints the Copilot CLI uses: the anonymous backends of the Azure AI Foundry portal, so no Azure
 * account is needed (the documented routes all require sign-in). The search only accepts User-Agents starting with
 * `AzureAiStudio` ({@link getAzureMlSearchUserAgent}); `eastus` is only the region that answers `crossRegion`. The lookup
 * returns a version's metadata and a read-only SAS URL of its storage container; downloads then use the documented Blob API.
 */
export const AZURE_ML_PUBLIC_SEARCH_URL = 'https://ai.azure.com/api/eastus/ux/v1.0/entities/crossRegion';
export const AZURE_ML_SEARCH_USER_AGENT = 'AzureAiStudio';
export const AZURE_ML_PUBLIC_RESOLVE_URL = 'https://eastus.api.azureml.ms/modelregistry/v1.0/registry/models/nonazureaccount';

/** The search's User-Agent: the prefix it requires, then VS Code and its version when known, so Azure ML can tell VS Code's requests apart. */
export function getAzureMlSearchUserAgent(productVersion: string | undefined): string {
	return productVersion ? `${AZURE_ML_SEARCH_USER_AGENT} VSCode/${productVersion}` : AZURE_ML_SEARCH_USER_AGENT;
}
/** Download hosts (HTTPS on 443 only): the registry's storage accounts, and Azure ML's API hosts, whose data proxy can hand out SAS URLs. */
export const AZURE_ML_DOWNLOAD_HOST_SUFFIXES: readonly string[] = ['.blob.core.windows.net', '.api.azureml.ms'];
/** Sent on every blob request: gzipped small blobs lose `Content-Length` and get weak ETags, which the size checks and resume rely on. */
export const BLOB_REQUEST_HEADERS: Readonly<Record<string, string>> = { 'Accept-Encoding': 'identity' };
export const CATALOG_REFRESH_INTERVAL_MS = 24 * 60 * 60_000;
export const MAX_CONCURRENT_RESOLUTIONS = 2;
export const CONTAINER_LIST_MAX_BLOBS = 200;
export const CONTAINER_LIST_MAX_BYTES = 1024 * 1024;
export const PRESET_INI_MAX_BYTES = 64 * 1024;
export const PRESET_INI_FILE_NAME = 'llama-default.ini';
/** The registry's runtime config, which supersedes `llama-default.ini`; preferred when both exist. */
export const PRESET_JSON_FILE_NAME = 'llama-config.json';

// #endregion

// #region Download and storage

export const DISK_PREFLIGHT_MARGIN_BYTES = 2 * 1024 * 1024 * 1024;
export const DOWNLOAD_MAX_REDIRECTS = 5;
export const DOWNLOAD_MAX_SAS_RENEWALS = 2;
export const DOWNLOAD_PROGRESS_THROTTLE_MS = 250;
export const HASH_CHUNK_BYTES = 1024 * 1024;
export const PLACE_RENAME_RETRIES = 4;
export const PLACE_RENAME_RETRY_DELAY_MS = 250;
export const PARTIAL_FILE_SUFFIX = '.vscode.partial';
/**
 * Consecutive transient failures of one file's transfer before the download pauses for Retry. An attempt that wrote new
 * bytes resets the count, so a long download survives many interruptions.
 */
export const DOWNLOAD_MAX_TRANSFER_ATTEMPTS = 8;
/** Backoff before the n-th transient retry: this, doubled per consecutive failure, at most {@link DOWNLOAD_RETRY_MAX_DELAY_MS}. */
export const DOWNLOAD_RETRY_BASE_DELAY_MS = 1_000;
export const DOWNLOAD_RETRY_MAX_DELAY_MS = 30_000;
/** Time for a download request to receive its response headers. */
export const DOWNLOAD_CONNECT_TIMEOUT_MS = 30_000;
/** Time without a byte from a download response before the connection counts as dead. */
export const DOWNLOAD_IDLE_TIMEOUT_MS = 60_000;

// #endregion

// #region llama.cpp qualification

/** Flags a `llama-server --help` must list to qualify (capability-based; no version pin). */
export const REQUIRED_LLAMA_SERVER_FLAGS: readonly string[] = [
	'--host',
	'--port',
	'--model',
	'--alias',
	'--ctx-size',
	'--parallel',
	'--n-gpu-layers',
	'--jinja',
	'--api-key',
	'--list-devices',
	'--fit',
	'--device',
	'--split-mode',
];

/** The environment form of `--api-key`: per-spawn keys travel in it, not on the command line, which other users can read in process listings on Linux and macOS. */
export const LLAMA_API_KEY_ENV = 'LLAMA_API_KEY';

/** Additionally required when the preset uses a draft model. */
export const REQUIRED_DRAFT_LLAMA_SERVER_FLAGS: readonly string[] = ['--device-draft'];

/** Optional speculative-decoding flags: when `--spec-type` or its `draft-dflash` value is missing, the speculative configuration is dropped and `dflashSupported` is false. */
export const OPTIONAL_SPEC_FLAGS: readonly string[] = ['--spec-type', '--spec-draft-model', '--spec-draft-n-max', '--spec-draft-p-min', '--spec-draft-ngl'];
export const DFLASH_SPEC_TYPE = 'draft-dflash';

export const LLAMA_SERVER_PROBE_TIMEOUT_MS = 10_000;
export const LLAMA_SERVER_PROBE_OUTPUT_CAP_BYTES = 64 * 1024;

// #endregion

// #region Architecture compatibility

/** First `Range` read of the primary GGUF when looking for `general.architecture` (normally the first key). */
export const GGUF_ARCHITECTURE_READ_INITIAL_BYTES = 256 * 1024;
/** Hard cap on the bytes read (remote or local) to find `general.architecture`; beyond it the architecture is unknown. */
export const GGUF_ARCHITECTURE_READ_MAX_BYTES = 8 * 1024 * 1024;
/** Longest architecture name that is probed (llama.cpp names are short, for example `qwen3moe` or `gpt-oss`). */
export const LLAMA_ARCHITECTURE_NAME_MAX_LENGTH = 64;

/** Architectures no llama.cpp release supports yet, with the change that adds support; remove an entry once a release supports it. */
export const UNPACKAGED_LLAMA_ARCHITECTURES: Readonly<Record<string, string>> = {
	'maion-coder': 'ggml-org/llama.cpp#29778',
};

/** Public llama.cpp `LLM_ARCH` names reported as-is in telemetry; anything else (a GGUF header may be private content) is `other`. */
export const LOCAL_MODEL_TELEMETRY_ARCHITECTURES: readonly string[] = [
	'llama', 'llama4', 'mistral3', 'qwen2', 'qwen2moe', 'qwen3', 'qwen3moe', 'qwen3next', 'qwen35', 'qwen35moe',
	'gemma2', 'gemma3', 'gemma3n', 'phi3', 'phimoe', 'gpt-oss', 'deepseek2', 'glm4', 'glm4moe', 'granite', 'granitemoe',
	'command-r', 'cohere2', 'olmo2', 'starcoder2', 'smollm3', 'lfm2', 'ernie4_5', 'ernie4_5-moe', 'seed_oss', 'falcon-h1',
];

// #endregion

// #region Fit and serving

// Provisional until measured on target hardware:
export const NEAR_FIT_RATIO = 0.85;
export const MIN_AUTO_DECODE_TPS = 8;
export const MAX_AUTO_TTFT_MS = 10_000;
export const IDLE_UNLOAD_MS = 15 * 60_000;
export const FIRST_OUTPUT_TIMEOUT_MS = 120_000;
export const LOAD_TIMEOUT_MS = 10 * 60_000;
export const QUEUE_TIMEOUT_MS = 120_000;
export const DOWN_MARK_MS = 60_000;

/** Prompts with fewer uncached tokens aren't shown as reading the conversation: they finish within about one batch and would only flash. */
export const PROMPT_PROGRESS_MIN_TOKENS = 1024;
/** Minimum interval between two prompt processing percentages reported for one request. */
export const PROMPT_PROGRESS_INTERVAL_MS = 500;

/** OS reserve when computing spare system memory for `near` fit: max(8 GiB, 10 % of RAM). */
export const SYSTEM_MEMORY_RESERVE_MIN_BYTES = 8 * 1024 * 1024 * 1024;
export const SYSTEM_MEMORY_RESERVE_RATIO = 0.1;

/** Footprint: `(primary + draft + context buffers) x 1.02 + 256 MiB`; the factor and overhead cover what llama.cpp doesn't report (driver context, allocator slack). */
export const FOOTPRINT_OVERHEAD_BYTES = 256 * 1024 * 1024;
export const FOOTPRINT_FACTOR = 1.02;

/** Context sizes a user may choose for an on-device model, capped by its trained context, its limits and its preset. */
export const CONTEXT_SIZE_OPTIONS: readonly number[] = [65_536, 131_072, 262_144];
/** The context size used until the user chooses one. */
export const DEFAULT_CONTEXT_SIZE = 131_072;

/** Context steps for the last-resort reduction within `near-fit`; never below the last. */
export const REDUCED_CONTEXT_STEPS: readonly number[] = [262_144, 131_072, 65_536];
/** Tokens reserved for chat-template overhead in the `/auto` limits patch. */
export const CHAT_TEMPLATE_RESERVE_TOKENS = 1024;
export const PRESET_MAX_PARALLEL = 64;
/** `--ctx-checkpoints` for a recurrent model whose preset turns them off (llama.cpp would reprocess the whole prompt every turn); each holds recurrent state in system memory. */
export const RECURRENT_MODEL_CTX_CHECKPOINTS = 4;

export const SERVER_HEALTH_POLL_MS = 500;
export const SERVER_PORT_BIND_RETRIES = 3;
export const SERVER_API_KEY_BYTES = 32;
export const WARMUP_GENERATED_TOKENS = 32;
export const RESTART_BACKOFF_MS: readonly number[] = [5_000, 30_000];
/** System-initiated drain bound (setting disabled, AH shutdown). User-initiated drains have no timeout. */
export const SYSTEM_DRAIN_TIMEOUT_MS = 10_000;
export const SIGKILL_GRACE_MS = 5_000;
export const STDERR_TAIL_BYTES = 4 * 1024;

// #endregion

// #region Request routing

/** Origin of the sentinel BYOK provider; requests to it are served locally or fail closed, never passed through. */
export const SENTINEL_ORIGIN = 'http://on-device.vscode.invalid';
export const SENTINEL_BASE_URL = `${SENTINEL_ORIGIN}/v1`;
export const SENTINEL_MODEL_PROVIDER = 'llama_cpp';

/** Default CAPI origin family; signed-in accounts may add their resolved endpoints. */
export const DEFAULT_CAPI_ORIGIN = 'https://api.githubcopilot.com';

export const ROUTE_EVICTION_GRACE_MS = 10 * 60_000;
export const ROUTE_TABLE_SOFT_CAP = 1024;

// #endregion

// #region llama.cpp probing

/** Output cap for `llama-server --help` only: b11459 already prints ~60 KB, so the 64 KiB probe cap would soon drop late flags (`--parallel`). */
export const LLAMA_SERVER_HELP_OUTPUT_CAP_BYTES = 256 * 1024;

// #endregion
