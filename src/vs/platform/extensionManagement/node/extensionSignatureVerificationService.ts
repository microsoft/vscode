/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { getErrorMessage } from '../../../base/common/errors.js';
import { isDefined } from '../../../base/common/types.js';
import { TargetPlatform } from '../../extensions/common/extensions.js';
import { createDecorator } from '../../instantiation/common/instantiation.js';
import { ILogService, LogLevel } from '../../log/common/log.js';
import { ITelemetryService } from '../../telemetry/common/telemetry.js';
import { ExtensionSignatureVerificationCode } from '../common/extensionManagement.js';

export const IExtensionSignatureVerificationService = createDecorator<IExtensionSignatureVerificationService>('IExtensionSignatureVerificationService');

export interface IExtensionSignatureVerificationResult {
	readonly code: ExtensionSignatureVerificationCode;
}

/**
 * A service for verifying signed extensions.
 */
export interface IExtensionSignatureVerificationService {
	readonly _serviceBrand: undefined;

	/**
	 * Verifies an extension file (.vsix) against a signature archive file.
	 * @param extensionId The extension identifier.
	 * @param version The extension version.
	 * @param vsixFilePath The extension file path.
	 * @param signatureArchiveFilePath The signature archive file path.
	 * @returns returns the verification result or undefined if the verification was not executed.
	 */
	verify(extensionId: string, version: string, vsixFilePath: string, signatureArchiveFilePath: string, clientTargetPlatform?: TargetPlatform): Promise<IExtensionSignatureVerificationResult | undefined>;
}

declare namespace vsceSign {
	export function verify(vsixFilePath: string, signatureArchiveFilePath: string, verbose: boolean): Promise<ExtensionSignatureVerificationResult>;
}

/**
 * Extension signature verification result
 */
export interface ExtensionSignatureVerificationResult {
	readonly code: ExtensionSignatureVerificationCode;
	readonly didExecute: boolean;
	readonly internalCode?: number;
	readonly output?: string;
}

export class ExtensionSignatureVerificationService implements IExtensionSignatureVerificationService {
	declare readonly _serviceBrand: undefined;

	private moduleLoadingPromise: Promise<typeof vsceSign> | undefined;

	constructor(
		@ILogService private readonly logService: ILogService,
		@ITelemetryService private readonly telemetryService: ITelemetryService,
	) { }

	private vsceSign(): Promise<typeof vsceSign> {
		if (!this.moduleLoadingPromise) {
			this.moduleLoadingPromise = this.resolveVsceSign();
		}

		return this.moduleLoadingPromise;
	}

	private async resolveVsceSign(): Promise<typeof vsceSign> {
		const mod = '@vscode/vsce-sign';
		return import(mod);
	}

	public async verify(extensionId: string, version: string, vsixFilePath: string, signatureArchiveFilePath: string, clientTargetPlatform?: TargetPlatform): Promise<IExtensionSignatureVerificationResult | undefined> {
		let module: typeof vsceSign;

		try {
			module = await this.vsceSign();
		} catch (error) {
			this.logService.error('Could not load vsce-sign module', getErrorMessage(error));
			this.logService.info(`Extension signature verification is not done: ${extensionId}`);
			return undefined;
		}

		const startTime = new Date().getTime();
		let result: ExtensionSignatureVerificationResult;

		try {
			this.logService.trace(`Verifying extension signature for ${extensionId}...`);
			result = await module.verify(vsixFilePath, signatureArchiveFilePath, this.logService.getLevel() === LogLevel.Trace);
		} catch (e) {
			result = {
				code: ExtensionSignatureVerificationCode.UnknownError,
				didExecute: false,
				output: getErrorMessage(e)
			};
		}

		const duration = new Date().getTime() - startTime;

		this.logService.info(`Extension signature verification result for ${extensionId}: ${result.code}. ${isDefined(result.internalCode) ? `Internal Code: ${result.internalCode}. ` : ''}Executed: ${result.didExecute}. Duration: ${duration}ms.`);
		this.logService.trace(`Extension signature verification output for ${extensionId}:\n${result.output}`);

		type ExtensionSignatureVerificationClassification = {
			owner: 'sandy081';
			comment: 'Extension signature verification event';
			extensionId: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'extension identifier' };
			extensionVersion: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'extension version' };
			code: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'result code of the verification' };
			internalCode?: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; 'isMeasurement': true; comment: 'internal code of the verification' };
			duration: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; 'isMeasurement': true; comment: 'amount of time taken to verify the signature' };
			didExecute: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'whether the verification was executed' };
			clientTargetPlatform?: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'target platform of the client' };
		};
		type ExtensionSignatureVerificationEvent = {
			extensionId: string;
			extensionVersion: string;
			code: string;
			internalCode?: number;
			duration: number;
			didExecute: boolean;
			clientTargetPlatform?: string;
		};
		this.telemetryService.publicLog2<ExtensionSignatureVerificationEvent, ExtensionSignatureVerificationClassification>('extensionsignature:verification', {
			extensionId,
			extensionVersion: version,
			code: result.code,
			internalCode: result.internalCode,
			duration,
			didExecute: result.didExecute,
			clientTargetPlatform,
		});

		return { code: result.code };
	}
}
