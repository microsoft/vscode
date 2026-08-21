/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { IEnvService } from '../../../../../platform/env/common/envService';
import { RequestId } from '../../../../../platform/networking/common/fetch';
import { createServiceIdentifier } from '../../../../../util/common/services';
import { generateUuid } from '../../../../../util/vs/base/common/uuid';
import { IInstantiationService, ServicesAccessor } from '../../../../../util/vs/platform/instantiation/common/instantiation';
import { ICompletionsTelemetryService } from '../../bridge/src/completionsTelemetryServiceBridge';
import {
	BuildInfo,
	dumpForTelemetry,
	formatNameAndVersion, ICompletionsEditorAndPluginInfo
} from './config';
import { ExpConfig } from './experiments/expConfig';
import { ICompletionsFeaturesService } from './experiments/featuresService';
import { FilterSettings } from './experiments/filters';
import { ExpServiceTelemetryNames } from './experiments/telemetryNames';
import { APIJsonData } from './openai/openai';
import { Prompt } from './prompt/prompt';
import { ICompletionsTelemetryUserConfigService } from './telemetry/userConfig';
import { ICompletionsPromiseQueueService } from './util/promiseQueue';

export enum TelemetryStore {
	Standard,
	Enhanced,
}

export namespace TelemetryStore {
	export function isEnhanced(store: TelemetryStore): boolean {
		return store === TelemetryStore.Enhanced;
	}
}

function isEnhanced(store: TelemetryStore): boolean {
	return store === TelemetryStore.Enhanced;
}

const ftTelemetryEvents = [
	'engine.prompt',
	'engine.completion',
	'ghostText.capturedAfterAccepted',
	'ghostText.capturedAfterRejected',
];

const MAX_PROPERTY_LENGTH = 8192;
// The largest context size we have today is 168k which can fit in 21 properties of 8k each.
const MAX_CONCATENATED_PROPERTIES = 21;

export type TelemetryProperties = { [key: string]: string };
export type TelemetryMeasurements = { [key: string]: number };


/**
 * A class holding the data we want send to telemetry,
 * {@link TelemetryData.properties} containing the strings
 * and {@link TelemetryData.measurements} containing the numbers.
 *
 * Additionally, this keeps tracks of timestamps {@link TelemetryData.created} and {@link TelemetryData.displayed}
 * that can be used to track when this object was created or when information
 * contained in this object was surfaced to the user.
 *
 * This is meant be used as an argument to
 * {@link telemetry}, {@link telemetryError}, or {@link telemetryException}.
 */
export class TelemetryData {
	properties: TelemetryProperties;
	measurements: TelemetryMeasurements;
	issuedTime: number;
	displayedTime?: number;

	private static keysExemptedFromSanitization: string[] = [
		ExpServiceTelemetryNames.featuresTelemetryPropertyName,
	];

	protected constructor(properties: TelemetryProperties, measurements: TelemetryMeasurements, issuedTime: number) {
		this.properties = properties;
		this.measurements = measurements;
		this.issuedTime = issuedTime;
	}

	static createAndMarkAsIssued(
		properties?: TelemetryProperties,
		measurements?: TelemetryMeasurements
	): TelemetryData {
		return new TelemetryData(properties || {}, measurements || {}, now());
	}

	/**
	 * @param properties new properties, which will overwrite old ones in case of a clash
	 * @param measurements new measurements, which will overwrite old ones in case of a clash
	 * @returns a TelemetryData object whose contents extend (copies of) the current one's and whose creation date is not updated
	 */
	extendedBy(properties?: TelemetryProperties, measurements?: TelemetryMeasurements): TelemetryData {
		const newProperties = { ...this.properties, ...properties };
		const newMeasurements = { ...this.measurements, ...measurements };
		const newData = new TelemetryData(newProperties, newMeasurements, this.issuedTime);
		newData.displayedTime = this.displayedTime;

		return newData;
	}

	/**
	 * registers current time as the point where this was displayed
	 * (no-op if a display time is already registered)
	 */
	markAsDisplayed(): void {
		if (this.displayedTime === undefined) {
			this.displayedTime = now();
		}
	}

	/** This function is a fallback - if we are a TelemetryData object instead of a TelemetryWithExp,
	 * we don't actually know our real ExP assignment list. Historically, all telemetry has been emitted
	 * with a 'partial' list of assignments that are gathered using a blank set of filters, and there may
	 * be downstream telemetry users depending on this partial list.
	 * However, this partial list likely disagrees with the true, complete list that TelemetryWithExp
	 * can emit, so there is the possibility of inconsistent telemetry (different events from the same user/context
	 * will have different experimental assignments).
	 * All telemetry events that impact scorecards (namely ghostText) MUST use TelemetryWithExp, but
	 * this fallback is a bandaid for other events that don't impact scorecards.
	 * Downstream users SHOULD NOT depend on the partial list, and this fallback should eventually be removed
	 * in favor of properly plumbing a TelemetryWithExp object through in the cases where the
	 * assignment list is necessary.
	 */
	async extendWithExpTelemetry(accessor: ServicesAccessor): Promise<void> {
		const { filters, exp } = await accessor.get(ICompletionsFeaturesService).getFallbackExpAndFilters();
		exp.addToTelemetry(this);
		filters.addToTelemetry(this);
	}

	extendWithEditorAgnosticFields(accessor: ServicesAccessor): void {
		const envService = accessor.get(IEnvService);
		const editorAndPluginInfo = accessor.get(ICompletionsEditorAndPluginInfo);

		this.properties['editor_version'] = formatNameAndVersion(editorAndPluginInfo.getEditorInfo());
		this.properties['editor_plugin_version'] = formatNameAndVersion(
			editorAndPluginInfo.getEditorPluginInfo()
		);
		this.properties['client_machineid'] = envService.machineId;
		this.properties['client_sessionid'] = envService.sessionId;
		this.properties['copilot_version'] = `copilot/${BuildInfo.getVersion()}`;
		if (typeof process !== 'undefined') {
			this.properties['runtime_version'] = `node/${process.versions.node}`;
		}

		this.properties['common_extname'] = editorAndPluginInfo.getEditorPluginInfo().name;
		this.properties['common_extversion'] = editorAndPluginInfo.getEditorPluginInfo().version;
		this.properties['common_vscodeversion'] = formatNameAndVersion(editorAndPluginInfo.getEditorInfo());
	}

	/**
	 * Iterate config keys defined in the package.json, lookup current config
	 * value and return as telemetry property. Property name in dotted notation
	 * and value is a json string.
	 * e.g. { 'copilot.autocompletion.count': 3 }
	 */
	extendWithConfigProperties(accessor: ServicesAccessor): void {
		const configProperties: { [key: string]: string } = dumpForTelemetry(accessor);
		configProperties['copilot.build'] = BuildInfo.getBuild();
		configProperties['copilot.buildType'] = BuildInfo.getBuildType();

		// By being the second argument, configProperties will always override
		this.properties = { ...this.properties, ...configProperties };
	}

	extendWithRequestId(requestId: RequestId): void {
		const requestProperties = {
			headerRequestId: requestId.headerRequestId,
			serverExperiments: requestId.serverExperiments,
			deploymentId: requestId.deploymentId,
		};
		this.properties = { ...this.properties, ...requestProperties };
	}

	private static keysToRemoveFromStandardTelemetry: string[] = [
		'gitRepoHost',
		'gitRepoName',
		'gitRepoOwner',
		'gitRepoUrl',
		'gitRepoPath',
		'repo',
		'request_option_nwo',
		'userKind',
	];

	/**
	 * Remove the known properties relating to repository information from the telemetry data if necessary
	 */
	static maybeRemoveRepoInfoFromProperties(
		store: TelemetryStore,
		map: { [key: string]: string }
	): { [key: string]: string } {
		if (isEnhanced(store)) {
			// We want to keep including these properties in enhanced telemetry.
			return map;
		}
		// deliberately written in the same style as `sanitizeKeys` to minimise risk
		const returnValue: { [key: string]: string } = {};
		for (const key in map) {
			if (!TelemetryData.keysToRemoveFromStandardTelemetry.includes(key)) {
				returnValue[key] = map[key];
			}
		}
		return returnValue;
	}

	sanitizeKeys(): void {
		this.properties = TelemetryData.sanitizeKeys(this.properties);
		this.measurements = TelemetryData.sanitizeKeys(this.measurements);
		// Not just keys anymore, also values
		for (const key in this.measurements) {
			if (isNaN(this.measurements[key])) {
				delete this.measurements[key];
			}
		}
	}

	multiplexProperties(): void {
		this.properties = TelemetryData.multiplexProperties(this.properties);
	}

	static sanitizeKeys<V>(map?: { [key: string]: V }): { [key: string]: V } {
		// We need all keys to not have dots in them for telemetry to function
		map = map || {};
		const returnValue: { [key: string]: V } = {};
		// Iterate over all keys in the map and replace dots with underscores
		for (const key in map) {
			const newKey = TelemetryData.keysExemptedFromSanitization.includes(key) ? key : key.replace(/\./g, '_');
			returnValue[newKey] = map[key];
		}
		return returnValue;
	}

	static multiplexProperties(properties: TelemetryProperties): TelemetryProperties {
		const newProperties = { ...properties };
		for (const key in properties) {
			const value = properties[key];
			// Test the length of value
			let remainingValueCharactersLength = value?.length ?? 0;
			if (remainingValueCharactersLength > MAX_PROPERTY_LENGTH) {
				let lastStartIndex = 0;
				let newPropertiesCount = 0;
				while (remainingValueCharactersLength > 0 && newPropertiesCount < MAX_CONCATENATED_PROPERTIES) {
					newPropertiesCount += 1;
					let propertyName = key;
					if (newPropertiesCount > 1) {
						propertyName = key + '_' + (newPropertiesCount < 10 ? '0' : '') + newPropertiesCount;
					}
					let offsetIndex = lastStartIndex + MAX_PROPERTY_LENGTH;
					if (remainingValueCharactersLength < MAX_PROPERTY_LENGTH) {
						offsetIndex = lastStartIndex + remainingValueCharactersLength;
					}
					newProperties[propertyName] = value.slice(lastStartIndex, offsetIndex);
					remainingValueCharactersLength -= MAX_PROPERTY_LENGTH;
					lastStartIndex += MAX_PROPERTY_LENGTH;
				}
			}
		}
		return newProperties;
	}

	updateMeasurements(now: number): void {
		const timeSinceIssued = now - this.issuedTime;
		this.measurements.timeSinceIssuedMs = timeSinceIssued;

		if (this.displayedTime !== undefined) {
			const timeSinceDisplayed = now - this.displayedTime;
			this.measurements.timeSinceDisplayedMs = timeSinceDisplayed;
		}

		// Set the current time right before sending the telemetry.
		if (this.measurements.current_time === undefined) {
			// Because of the way CTS converts the time, we can only get the current time in seconds.
			this.measurements.current_time = nowSeconds(now);
		}
	}

	// Now is passed as an argument to avoid any measurement discrepancies due to
	// async operations in the telemetry event.
	async makeReadyForSending(
		accessor: ServicesAccessor,
		store: TelemetryStore,
		includeExp: 'IncludeExp' | 'SkipExp',
		now: number
	): Promise<void> {
		const instantiationService = accessor.get(IInstantiationService);
		this.extendWithConfigProperties(accessor);
		this.extendWithEditorAgnosticFields(accessor);
		this.sanitizeKeys();
		this.multiplexProperties();
		// the `includeExp` parameter is so we don't get into an infinite loop sending telemetry about
		// ExP itself.
		if (includeExp === 'IncludeExp') {
			// we actually want to do this step _after_ sanitizing the keys, because the keys may be unsanitary (and still required)
			await this.extendWithExpTelemetry(accessor);
		}
		this.updateMeasurements(now);
		Object.assign(this.properties, instantiationService.invokeFunction(createRequiredProperties));
	}
}

/**
 * A TelemetryData object that also contains the filters and ExP config that are applicable to current request context.
 * Telemetry which is used to generate scorecards *must* use this class over the bare TelemetryData class in order
 * to guarantee that the events are attached to the correct scorecard. Known events that fall into this category are:
 * - `ghostText.issued`
 * - `ghostText.shown`
 * - `ghostText.accepted`
 * - `ghostText.performance`
 *
 * It is highly recommended to use this class for most other telemetry events as well, to ensure that the events can be
 * tied correctly to active experiments in post-hoc analyses.
 *
 * This object should only be created directly by the `updateExPValuesAndAssignments` function of `experiments/features.ts`,
 * unless testing.
 *
 * This class should not be used for telemetry that does not take place in the context of a "completion request".
 */
export class TelemetryWithExp extends TelemetryData {
	filtersAndExp: { filters: FilterSettings; exp: ExpConfig };

	constructor(
		properties: TelemetryProperties,
		measurements: TelemetryMeasurements,
		issuedTime: number,
		filtersAndExp: { filters: FilterSettings; exp: ExpConfig }
	) {
		super(properties, measurements, issuedTime);
		this.filtersAndExp = filtersAndExp;
	}

	override extendedBy(properties?: TelemetryProperties, measurements?: TelemetryMeasurements): TelemetryWithExp {
		const newProperties = { ...this.properties, ...properties };
		const newMeasurements = { ...this.measurements, ...measurements };
		const newData = new TelemetryWithExp(newProperties, newMeasurements, this.issuedTime, this.filtersAndExp);
		newData.displayedTime = this.displayedTime;

		return newData;
	}

	/** Include the known ExP assignment list into the properties/measurements blocks
	 * of the telemetry event.
	 * This method is correct/consistent for TelemetryWithExp, unlike TelemetryData's.
	 */
	override extendWithExpTelemetry(): Promise<void> {
		this.filtersAndExp.exp.addToTelemetry(this);
		this.filtersAndExp.filters.addToTelemetry(this);
		return Promise.resolve();
	}

	static createEmptyConfigForTesting(): TelemetryWithExp {
		return new TelemetryWithExp({}, {}, 0, {
			filters: new FilterSettings({}),
			exp: ExpConfig.createEmptyConfig(),
		});
	}
}

// Helpers
function sendTelemetryEvent(
	completionsTelemetryService: ICompletionsTelemetryService,
	store: TelemetryStore,
	name: string,
	data: { properties: TelemetryProperties; measurements: TelemetryMeasurements }
): void {
	const properties = TelemetryData.maybeRemoveRepoInfoFromProperties(store, data.properties);
	if (!isEnhanced(store)) {
		completionsTelemetryService.sendGHTelemetryEvent(
			name,
			properties,
			data.measurements
		);
	} else {
		completionsTelemetryService.sendEnhancedGHTelemetryEvent(
			name,
			properties,
			data.measurements
		);
	}
}

function sendTelemetryErrorEvent(
	accessor: ServicesAccessor,
	store: TelemetryStore,
	name: string,
	data: { properties: TelemetryProperties; measurements: TelemetryMeasurements }
): void {
	const telemetryService = accessor.get(ICompletionsTelemetryService);
	const properties = TelemetryData.maybeRemoveRepoInfoFromProperties(store, data.properties);
	telemetryService.sendGHTelemetryErrorEvent(
		name,
		properties,
		data.measurements
	);
}

function sendFTTelemetryEvent(
	accessor: ServicesAccessor,
	store: TelemetryStore,
	name: string,
	data: { properties: TelemetryProperties; measurements: TelemetryMeasurements }
): void {
	if (!shouldSendFinetuningTelemetry(accessor)) {
		return;
	}
	// const completionsTelemetryService = accessor.get(ICompletionsTelemetryService);
	// const properties = TelemetryData.maybeRemoveRepoInfoFromProperties(store, data.properties);
	// completionsTelemetryService.sendGHFTTelemetryEvent(
	// 	name,
	// 	properties,
	// 	data.measurements
	// );
}

/**
 * Creates an object containing info about the length of the prompt suitable
 * for saving in standard telemetry.
 */
export function telemetrizePromptLength(prompt: Prompt): { [key: string]: number } {
	return {
		// prefix length + sum of context length
		promptCharLen: prompt.prefix.length + (prompt.context?.reduce((sum, c) => sum + c.length, 0) ?? 0),
		promptSuffixCharLen: prompt.suffix.length,
	};
}

export function now(): number {
	return performance.now();
}

function nowSeconds(now: number): number {
	return Math.floor(now / 1000);
}

function shouldSendEnhanced(accessor: ServicesAccessor): boolean {
	return accessor.get(ICompletionsTelemetryUserConfigService).optedIn;
}

function shouldSendFinetuningTelemetry(accessor: ServicesAccessor): boolean {
	return accessor.get(ICompletionsTelemetryUserConfigService).ftFlag !== '';
}

export function telemetry(accessor: ServicesAccessor, name: string, telemetryData?: TelemetryData, store?: TelemetryStore) {
	return accessor.get(ICompletionsPromiseQueueService).register(_telemetry(accessor, name, now(), telemetryData?.extendedBy(), store));
}

async function _telemetry(
	accessor: ServicesAccessor,
	name: string,
	now: number,
	telemetryData?: TelemetryData,
	store = TelemetryStore.Standard
) {
	const completionsTelemetryService = accessor.get(ICompletionsTelemetryService);
	const instantiationService = accessor.get(IInstantiationService);

	// if telemetry data isn't given, make a new one to hold at least the config
	const definedTelemetryData = telemetryData || TelemetryData.createAndMarkAsIssued({}, {});
	await definedTelemetryData.makeReadyForSending(accessor, store ?? false, 'IncludeExp', now);
	if (!isEnhanced(store) || instantiationService.invokeFunction(shouldSendEnhanced)) {
		sendTelemetryEvent(completionsTelemetryService, store, name, definedTelemetryData);
	}
	if (isEnhanced(store) && ftTelemetryEvents.includes(name) && instantiationService.invokeFunction(shouldSendFinetuningTelemetry)) {
		instantiationService.invokeFunction(sendFTTelemetryEvent, store, name, definedTelemetryData);
	}
}

export function telemetryExpProblem(accessor: ServicesAccessor, telemetryProperties: { reason: string }) {
	const promiseQueueService = accessor.get(ICompletionsPromiseQueueService);
	return promiseQueueService.register(_telemetryExpProblem(accessor, telemetryProperties, now()));
}

async function _telemetryExpProblem(accessor: ServicesAccessor, telemetryProperties: { reason: string }, now: number) {
	const completionsTelemetryService = accessor.get(ICompletionsTelemetryService);
	const name = 'expProblem';
	const definedTelemetryData = TelemetryData.createAndMarkAsIssued(telemetryProperties, {});
	await definedTelemetryData.makeReadyForSending(accessor, TelemetryStore.Standard, 'SkipExp', now);
	sendTelemetryEvent(completionsTelemetryService, TelemetryStore.Standard, name, definedTelemetryData);
}

/**
 * Send a telemetry message as-is, without the usual Copilot-specific processing from
 * `createAndMarkAsIssued` / `makeReadyForSending`.
 *
 * There is also no sanitization or validation currently. When adding new messages
 * using this method, make sure to add some tests of the fields, e.g. in `extension/src/ghostTest/telemetry.test.ts`.
 */
export function telemetryRaw(
	accessor: ServicesAccessor,
	name: string,
	props: TelemetryProperties,
	measurements: TelemetryMeasurements
) {
	const completionsTelemetryService = accessor.get(ICompletionsTelemetryService);
	const properties = { ...props, ...createRequiredProperties(accessor) };
	sendTelemetryEvent(completionsTelemetryService, TelemetryStore.Standard, name, { properties, measurements });
}

function createRequiredProperties(accessor: ServicesAccessor) {
	const editorAndPluginInfo = accessor.get(ICompletionsEditorAndPluginInfo);
	const properties: TelemetryProperties = {
		unique_id: generateUuid(), // add a unique id to the telemetry event so copilot-foundations can correlate with duplicate events
		common_extname: editorAndPluginInfo.getEditorPluginInfo().name,
		common_extversion: editorAndPluginInfo.getEditorPluginInfo().version,
		common_vscodeversion: formatNameAndVersion(editorAndPluginInfo.getEditorInfo()),
	};
	const telemetryConfig = accessor.get(ICompletionsTelemetryUserConfigService);
	return { ...telemetryConfig.getProperties(), ...properties };
}

export function telemetryException(
	telemetryService: ICompletionsTelemetryService,
	maybeError: unknown,
	transaction: string,
) {
	return telemetryService.sendGHTelemetryException(maybeError, transaction || '');
}

type TelemetryCatcher = (...args: never[]) => unknown;

export function telemetryCatch<F extends TelemetryCatcher>(
	completionsTelemetryService: ICompletionsTelemetryService,
	completionsPromiseQueueService: ICompletionsPromiseQueueService,
	fn: F,
	transaction: string,
): (...args: Parameters<F>) => void {
	const wrapped = async (...args: Parameters<F>) => {
		try {
			await fn(...args);
		} catch (error) {
			telemetryException(completionsTelemetryService, error, transaction);
		}
	};
	return (...args) => completionsPromiseQueueService.register(wrapped(...args));
}

export function telemetryError(accessor: ServicesAccessor, name: string, telemetryData?: TelemetryData, store?: TelemetryStore) {
	return accessor.get(ICompletionsPromiseQueueService).register(_telemetryError(accessor, name, now(), telemetryData?.extendedBy(), store));
}

async function _telemetryError(
	accessor: ServicesAccessor,
	name: string,
	now: number,
	telemetryData?: TelemetryData,
	store = TelemetryStore.Standard
) {
	if (isEnhanced(store) && !shouldSendEnhanced(accessor)) {
		return;
	}
	const instantiationService = accessor.get(IInstantiationService);
	const definedTelemetryData = telemetryData || TelemetryData.createAndMarkAsIssued({}, {});
	await definedTelemetryData.makeReadyForSending(accessor, store, 'IncludeExp', now);
	instantiationService.invokeFunction(sendTelemetryErrorEvent, store, name, definedTelemetryData);
}

export function logEngineCompletion(
	accessor: ServicesAccessor,
	completionText: string,
	jsonData: APIJsonData,
	requestId: RequestId,
	choiceIndex: number
) {
	const telemetryData = TelemetryData.createAndMarkAsIssued({
		completionTextJson: JSON.stringify(completionText),
		choiceIndex: choiceIndex.toString(),
	});

	if (jsonData.logprobs) {
		for (const [key, value] of Object.entries(jsonData.logprobs)) {
			telemetryData.properties['logprobs_' + key] = JSON.stringify(value) ?? 'unset';
		}
	}

	telemetryData.extendWithRequestId(requestId);
	return telemetry(accessor, 'engine.completion', telemetryData, TelemetryStore.Enhanced);
}

export function logEnginePrompt(accessor: ServicesAccessor, prompt: Prompt, telemetryData: TelemetryData) {
	const promptTelemetry: Record<string, string> = {
		promptJson: JSON.stringify({ prefix: prompt.prefix, context: prompt.context }),
		promptSuffixJson: JSON.stringify(prompt.suffix),
	};

	// Re-add context to stringified request.option.extra if it exists
	if (prompt.context) {
		const optionExtra = telemetryData.properties['request.option.extra']
			? (JSON.parse(telemetryData.properties['request.option.extra']) as Record<string, unknown>)
			: {};
		optionExtra.context = prompt.context;
		promptTelemetry['request.option.extra'] = JSON.stringify(optionExtra);
	}

	const telemetryDataWithPrompt = telemetryData.extendedBy(promptTelemetry);
	return telemetry(accessor, 'engine.prompt', telemetryDataWithPrompt, TelemetryStore.Enhanced);
}

// Please don't delete these classes. They are needed for tests.
export abstract class CopilotTelemetryReporter {
	abstract sendTelemetryEvent(
		eventName: string,
		properties?: {
			[key: string]: string;
		},
		measurements?: {
			[key: string]: number;
		}
	): void;
	abstract sendTelemetryErrorEvent(
		eventName: string,
		properties?: {
			[key: string]: string;
		},
		measurements?: {
			[key: string]: number;
		},
		errorProps?: string[]
	): void;
	abstract dispose(): Promise<void>;
}

export const ICompletionsTelemetryReporters = createServiceIdentifier<ICompletionsTelemetryReporters>('ICompletionsTelemetryReporters');
export interface ICompletionsTelemetryReporters {
	readonly _serviceBrand: undefined;
	getReporter(accessor: ServicesAccessor, store?: TelemetryStore): CopilotTelemetryReporter | undefined;
	getEnhancedReporter(accessor: ServicesAccessor): CopilotTelemetryReporter | undefined;
	getFTReporter(accessor: ServicesAccessor): CopilotTelemetryReporter | undefined;
	setReporter(reporter: CopilotTelemetryReporter): void;
	setEnhancedReporter(reporter: CopilotTelemetryReporter): void;
	setFTReporter(reporter: CopilotTelemetryReporter): void;
	deactivate(): Promise<void>;
}

export class TelemetryReporters implements ICompletionsTelemetryReporters {
	declare _serviceBrand: undefined;

	private reporter: CopilotTelemetryReporter | undefined;
	private reporterEnhanced: CopilotTelemetryReporter | undefined;
	private reporterFT: CopilotTelemetryReporter | undefined;

	getReporter(accessor: ServicesAccessor, store = TelemetryStore.Standard): CopilotTelemetryReporter | undefined {
		return isEnhanced(store) ? this.getEnhancedReporter(accessor) : this.reporter;
	}
	getEnhancedReporter(accessor: ServicesAccessor): CopilotTelemetryReporter | undefined {
		// Callers should do this check themselves as they may need to behave differently
		// if we are not sending enhanced telemetry. The guard here is a backstop.
		// Note: if the decision about what telemetry to send when the user is opted-out
		// becomes more nuanced, we may need to drop this backstop.
		if (shouldSendEnhanced(accessor)) {
			return this.reporterEnhanced;
		}
		return undefined;
	}

	getFTReporter(accessor: ServicesAccessor): CopilotTelemetryReporter | undefined {
		return undefined;
	}

	setReporter(reporter: CopilotTelemetryReporter): void {
		this.reporter = reporter;
	}
	setEnhancedReporter(reporter: CopilotTelemetryReporter): void {
		this.reporterEnhanced = reporter;
	}

	setFTReporter(reporter: CopilotTelemetryReporter): void {
		this.reporterFT = reporter;
	}

	/**
	 * Synchronously unassign all reporters and asynchronously shut them down.
	 */
	async deactivate(): Promise<void> {
		const reporters = [this.reporter, this.reporterEnhanced, this.reporterFT];
		this.reporter = this.reporterEnhanced = this.reporterFT = undefined;
		await Promise.all(reporters.map(r => r?.dispose()));
	}
}
