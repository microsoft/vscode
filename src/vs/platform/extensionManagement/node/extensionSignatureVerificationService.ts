/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { importAMDNodeModule } from 'vs/amdX';
import { getErrorMessage } from 'vs/base/common/errors';
import { IGalleryExtension } from 'vs/platform/extensionManagement/common/extensionManagement';
import { TargetPlatform } from 'vs/platform/extensions/common/extensions';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { ILogService, LogLevel } from 'vs/platform/log/common/log';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';

export const IExtensionSignatureVerificationService = createDecorator<IExtensionSignatureVerificationService>('IExtensionSignatureVerificationService');

/**
 * A service for verifying signed extensions.
 */
export interface IExtensionSignatureVerificationService {
	readonly _serviceBrand: undefined;

	/**
	 * Verifies an extension file (.vsix) against a signature archive file.
	 * @param { string } extensionId The extension identifier.
	 * @param { string } vsixFilePath The extension file path.
	 * @param { string } signatureArchiveFilePath The signature archive file path.
	 * @returns { Promise<boolean> } A promise with `true` if the extension is validly signed and trusted;
	 * otherwise, `false` because verification is not enabled (e.g.:  in the OSS version of VS Code).
	 * @throws { ExtensionSignatureVerificationError } An error with a code indicating the validity, integrity, or trust issue
	 * found during verification or a more fundamental issue (e.g.:  a required dependency was not found).
	 */
	verify(extension: IGalleryExtension, vsixFilePath: string, signatureArchiveFilePath: string, clientTargetPlatform?: TargetPlatform): Promise<boolean>;
}

declare module vsceSign {
	export function verify(vsixFilePath: string, signatureArchiveFilePath: string, verbose: boolean): Promise<ExtensionSignatureVerificationResult>;
}

export enum ExtensionSignatureVerificationCode {
	'Success' = 'Success',
	'RequiredArgumentMissing' = 'RequiredArgumentMissing',
	'InvalidArgument' = 'InvalidArgument',
	'PackageIsUnreadable' = 'PackageIsUnreadable',
	'UnhandledException' = 'UnhandledException',
	'SignatureManifestIsMissing' = 'SignatureManifestIsMissing',
	'SignatureManifestIsUnreadable' = 'SignatureManifestIsUnreadable',
	'SignatureIsMissing' = 'SignatureIsMissing',
	'SignatureIsUnreadable' = 'SignatureIsUnreadable',
	'CertificateIsUnreadable' = 'CertificateIsUnreadable',
	'SignatureArchiveIsUnreadable' = 'SignatureArchiveIsUnreadable',
	'FileAlreadyExists' = 'FileAlreadyExists',
	'SignatureArchiveIsInvalidZip' = 'SignatureArchiveIsInvalidZip',
	'SignatureArchiveHasSameSignatureFile' = 'SignatureArchiveHasSameSignatureFile',

	'PackageIntegrityCheckFailed' = 'PackageIntegrityCheckFailed',
	'SignatureIsInvalid' = 'SignatureIsInvalid',
	'SignatureManifestIsInvalid' = 'SignatureManifestIsInvalid',
	'SignatureIntegrityCheckFailed' = 'SignatureIntegrityCheckFailed',
	'EntryIsMissing' = 'EntryIsMissing',
	'EntryIsTampered' = 'EntryIsTampered',
	'Untrusted' = 'Untrusted',
	'CertificateRevoked' = 'CertificateRevoked',
	'SignatureIsNotValid' = 'SignatureIsNotValid',
	'UnknownError' = 'UnknownError',
	'PackageIsInvalidZip' = 'PackageIsInvalidZip',
	'SignatureArchiveHasTooManyEntries' = 'SignatureArchiveHasTooManyEntries',
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

export class ExtensionSignatureVerificationError extends Error {
	constructor(
		public readonly code: ExtensionSignatureVerificationCode,
	) {
		super(code);
	}
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
		// ESM-uncomment-begin
		// if (typeof importAMDNodeModule === 'function') { /* fixes unused import, remove me */}
		// const mod = '@vscode/vsce-sign';
		// return import(mod);
		// ESM-uncomment-end

		// ESM-comment-begin
		return importAMDNodeModule('@vscode/vsce-sign', 'src/main.js');
		// ESM-comment-end
	}

	public async verify(extension: IGalleryExtension, vsixFilePath: string, signatureArchiveFilePath: string, clientTargetPlatform?: TargetPlatform): Promise<boolean> {
		let module: typeof vsceSign;
		const extensionId = extension.identifier.id;

		try {
			module = await this.vsceSign();
		} catch (error) {
			this.logService.error('Could not load vsce-sign module', getErrorMessage(error));
			this.logService.info(`Extension signature verification is not done: ${extensionId}`);
			return false;
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

		this.logService.info(`Extension signature verification result for ${extensionId}: ${result.code}. Executed: ${result.didExecute}. Duration: ${duration}ms.`);
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
			extensionVersion: extension.version,
			code: result.code,
			internalCode: result.internalCode,
			duration,
			didExecute: result.didExecute,
			clientTargetPlatform,
		});

		if (result.code === ExtensionSignatureVerificationCode.Success) {
			return true;
		}

		throw new ExtensionSignatureVerificationError(result.code);
	}
}
