/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createHash } from 'crypto';
import { CancellationToken } from '../../../base/common/cancellation.js';
import { URI } from '../../../base/common/uri.js';
import { IFileService } from '../../files/common/files.js';
import { ILogService } from '../../log/common/log.js';
import { createDecorator } from '../../instantiation/common/instantiation.js';
import { InstantiationType, registerSingleton } from '../../instantiation/common/extensions.js';
import { IDownloadService } from '../../download/common/download.js';
import { IMcpBundleManifest, IMcpServerPackage } from '../common/mcpManagement.js';
import { extract, ExtractError } from '../../../base/node/zip.js';
import { generateUuid } from '../../../base/common/uuid.js';
import { listenStream } from '../../../base/common/stream.js';
import { localize } from '../../../nls.js';

export const IMcpBundleService = createDecorator<IMcpBundleService>('mcpBundleService');

/**
 * Result of downloading and extracting an MCPB bundle.
 */
export interface IMcpBundleDownloadResult {
	/** Path where the bundle was extracted */
	readonly extractedPath: URI;
	/** Parsed manifest from manifest.json */
	readonly manifest: IMcpBundleManifest;
}

/**
 * Service for handling MCPB (MCP Bundle) package operations.
 */
export interface IMcpBundleService {
	readonly _serviceBrand: undefined;

	/**
	 * Download, verify, and extract an MCPB bundle.
	 * @param serverPackage The server package containing bundle URL and checksum
	 * @param targetDir The base directory where the bundle should be extracted
	 * @param token Cancellation token
	 * @returns The extracted path and parsed manifest
	 */
	downloadAndExtract(serverPackage: IMcpServerPackage, targetDir: URI, token: CancellationToken): Promise<IMcpBundleDownloadResult>;

	/**
	 * Read and parse the manifest.json manifest from an extracted bundle.
	 * @param extractedPath Path to the extracted bundle
	 * @returns Parsed manifest
	 */
	readManifest(extractedPath: URI): Promise<IMcpBundleManifest>;

	/**
	 * Clean up an extracted bundle directory.
	 * @param extractedPath Path to the extracted bundle
	 */
	cleanup(extractedPath: URI): Promise<void>;
}

/**
 * Error thrown during MCPB bundle operations.
 */
export class McpBundleServiceError extends Error {
	constructor(
		message: string,
		readonly code: 'DOWNLOAD_FAILED' | 'CHECKSUM_MISMATCH' | 'CORRUPT_ZIP' | 'MISSING_MANIFEST' | 'INVALID_MANIFEST' | 'EXTRACTION_FAILED' | 'INSECURE_URL'
	) {
		super(message);
		this.name = 'McpBundleServiceError';
	}
}

/**
 * Service for downloading, verifying, and extracting MCPB (MCP Bundle) packages.
 */
export class McpBundleService implements IMcpBundleService {

	declare readonly _serviceBrand: undefined;

	private static readonly MAX_RETRIES = 2;
	private static readonly RETRY_DELAY_MS = 1000;
	private static readonly MANIFEST_FILENAME = 'manifest.json';

	constructor(
		@IFileService private readonly fileService: IFileService,
		@IDownloadService private readonly downloadService: IDownloadService,
		@ILogService private readonly logService: ILogService,
	) { }

	async downloadAndExtract(serverPackage: IMcpServerPackage, targetDir: URI, token: CancellationToken): Promise<IMcpBundleDownloadResult> {
		this.logService.info(`MCPB Bundle Service: Starting download - identifier: ${serverPackage.identifier}, target: ${targetDir.fsPath}`);

		const bundleUrl = this.getBundleUrl(serverPackage);
		if (!bundleUrl) {
			throw new McpBundleServiceError(
				localize('mcpb.missingUrl', "MCPB package is missing download URL"),
				'DOWNLOAD_FAILED'
			);
		}

		// Validate URL security - require HTTPS for remote downloads
		if (!this.isSecureUrl(bundleUrl)) {
			throw new McpBundleServiceError(
				localize('mcpb.insecureUrl', "MCPB bundle URL must use HTTPS for security. HTTP is only allowed for localhost."),
				'INSECURE_URL'
			);
		}

		this.logService.info(`MCPB Bundle Service: Bundle URL: ${bundleUrl.toString()}`);

		// Ensure target directory exists
		if (!await this.fileService.exists(targetDir)) {
			this.logService.info(`MCPB Bundle Service: Creating target directory: ${targetDir.fsPath}`);
			await this.fileService.createFolder(targetDir);
		}

		// Create unique temp file for download
		const tempFileName = `mcpb-${generateUuid()}.zip`;
		const tempFilePath = URI.joinPath(targetDir, tempFileName);

		// Determine extraction target path
		// If identifier is a URL, extract the filename; otherwise use the identifier directly
		let bundleName: string;
		if (serverPackage.identifier.startsWith('https://') || serverPackage.identifier.startsWith('http://')) {
			// Extract filename from URL and remove extension
			const urlPath = URI.parse(serverPackage.identifier).path;
			const fileName = urlPath.split('/').pop() || 'bundle';
			bundleName = fileName.replace(/\.(mcpb|zip)$/i, '');
		} else {
			bundleName = serverPackage.identifier.replace(/\//g, '.');
		}

		const extractedPath = URI.joinPath(
			targetDir,
			serverPackage.version ? `${bundleName}-${serverPackage.version}` : bundleName
		);

		try {
			// Download with retries
			await this.downloadWithRetry(bundleUrl, tempFilePath, token);

			// Verify checksum if provided
			if (serverPackage.fileSha256) {
				await this.verifyChecksum(tempFilePath, serverPackage.fileSha256);
			}

			// Extract the bundle
			await this.extractBundle(tempFilePath, extractedPath, token);

			// Read and validate manifest
			const manifest = await this.readManifest(extractedPath);

			this.logService.info('MCPB bundle successfully downloaded and extracted', serverPackage.identifier);

			return { extractedPath, manifest };
		} finally {
			// Clean up temp file
			try {
				if (await this.fileService.exists(tempFilePath)) {
					await this.fileService.del(tempFilePath);
				}
			} catch (error) {
				this.logService.warn('Failed to clean up temporary download file', tempFilePath.toString(), error);
			}
		}
	}

	async readManifest(extractedPath: URI): Promise<IMcpBundleManifest> {
		const manifestPath = URI.joinPath(extractedPath, McpBundleService.MANIFEST_FILENAME);

		if (!await this.fileService.exists(manifestPath)) {
			throw new McpBundleServiceError(
				localize('mcpb.missingManifest', "MCPB bundle is missing {0} manifest file", McpBundleService.MANIFEST_FILENAME),
				'MISSING_MANIFEST'
			);
		}

		try {
			const content = await this.fileService.readFile(manifestPath);
			const manifest = JSON.parse(content.value.toString()) as IMcpBundleManifest;

			// Validate required fields
			if (!manifest.command || typeof manifest.command !== 'string') {
				throw new McpBundleServiceError(
					localize('mcpb.invalidManifestCommand', "MCPB manifest is missing required 'command' field"),
					'INVALID_MANIFEST'
				);
			}

			// Validate args if present
			if (manifest.args !== undefined && !Array.isArray(manifest.args)) {
				throw new McpBundleServiceError(
					localize('mcpb.invalidManifestArgs', "MCPB manifest 'args' field must be an array"),
					'INVALID_MANIFEST'
				);
			}

			// Validate env if present
			if (manifest.env !== undefined && (typeof manifest.env !== 'object' || Array.isArray(manifest.env))) {
				throw new McpBundleServiceError(
					localize('mcpb.invalidManifestEnv', "MCPB manifest 'env' field must be an object"),
					'INVALID_MANIFEST'
				);
			}

			return manifest;
		} catch (error) {
			if (error instanceof McpBundleServiceError) {
				throw error;
			}
			throw new McpBundleServiceError(
				localize('mcpb.parseManifestError', "Failed to parse MCPB manifest: {0}", error instanceof Error ? error.message : String(error)),
				'INVALID_MANIFEST'
			);
		}
	}

	async cleanup(extractedPath: URI): Promise<void> {
		try {
			if (await this.fileService.exists(extractedPath)) {
				await this.fileService.del(extractedPath, { recursive: true });
				this.logService.trace('Cleaned up MCPB bundle directory', extractedPath.toString());
			}
		} catch (error) {
			this.logService.error('Failed to clean up MCPB bundle directory', extractedPath.toString(), error);
		}
	}

	private getBundleUrl(serverPackage: IMcpServerPackage): URI | undefined {
		// For MCPB packages, the identifier field often contains the full download URL
		const identifier = serverPackage.identifier;
		if (identifier && (identifier.startsWith('https://') || identifier.startsWith('http://'))) {
			return URI.parse(identifier);
		}

		// Fall back to registryBaseUrl if identifier is not a URL
		if (!serverPackage.registryBaseUrl) {
			return undefined;
		}

		// The registryBaseUrl should contain the full URL to the bundle
		// or we construct it from the base URL and identifier
		const baseUrl = serverPackage.registryBaseUrl;

		// If the URL already looks complete (ends with .zip or similar), use it directly
		if (baseUrl.endsWith('.zip') || baseUrl.endsWith('.mcpb')) {
			return URI.parse(baseUrl);
		}

		// Otherwise, construct the URL from base + identifier + version
		const version = serverPackage.version || 'latest';
		return URI.parse(`${baseUrl}/${identifier}/${version}/bundle.zip`);
	}

	private async downloadWithRetry(url: URI, destination: URI, token: CancellationToken): Promise<void> {
		let lastError: Error | undefined;

		for (let attempt = 0; attempt <= McpBundleService.MAX_RETRIES; attempt++) {
			if (token.isCancellationRequested) {
				throw new McpBundleServiceError(
					localize('mcpb.downloadCancelled', "MCPB bundle download was cancelled"),
					'DOWNLOAD_FAILED'
				);
			}

			try {
				this.logService.trace(`Downloading MCPB bundle (attempt ${attempt + 1}/${McpBundleService.MAX_RETRIES + 1})`, url.toString());
				await this.downloadService.download(url, destination, token);
				this.logService.info('MCPB bundle downloaded successfully', url.toString());
				return;
			} catch (error) {
				lastError = error instanceof Error ? error : new Error(String(error));
				this.logService.warn(`MCPB bundle download attempt ${attempt + 1} failed`, url.toString(), lastError);

				if (attempt < McpBundleService.MAX_RETRIES) {
					// Exponential backoff
					const delay = McpBundleService.RETRY_DELAY_MS * Math.pow(2, attempt);
					await this.delay(delay);
				}
			}
		}

		throw new McpBundleServiceError(
			localize('mcpb.downloadFailed', "Failed to download MCPB bundle after {0} attempts: {1}", McpBundleService.MAX_RETRIES + 1, lastError?.message || 'Unknown error'),
			'DOWNLOAD_FAILED'
		);
	}

	private async verifyChecksum(filePath: URI, expectedSha256: string): Promise<void> {
		this.logService.trace('Verifying MCPB bundle checksum', filePath.toString());

		const stream = (await this.fileService.readFileStream(filePath)).value;
		const actualChecksum = await new Promise<string>((resolve, reject) => {
			const hash = createHash('sha256');

			listenStream(stream, {
				onData: data => hash.update(data.buffer),
				onError: error => reject(error),
				onEnd: () => resolve(hash.digest('hex'))
			});
		});

		// Normalize both checksums to lowercase hex for comparison
		const normalizedExpected = expectedSha256.toLowerCase().replace(/^0x/, '');
		const normalizedActual = actualChecksum.toLowerCase();

		if (normalizedExpected !== normalizedActual) {
			// Delete the corrupted file
			try {
				await this.fileService.del(filePath);
			} catch (e) {
				this.logService.warn('Failed to delete file with checksum mismatch', filePath.toString());
			}

			throw new McpBundleServiceError(
				localize('mcpb.checksumMismatch', "MCPB bundle checksum verification failed. Expected {0}, got {1}", normalizedExpected, normalizedActual),
				'CHECKSUM_MISMATCH'
			);
		}

		this.logService.trace('MCPB bundle checksum verified successfully', filePath.toString());
	}

	private async extractBundle(zipPath: URI, targetPath: URI, token: CancellationToken): Promise<void> {
		this.logService.trace('Extracting MCPB bundle', zipPath.toString(), 'to', targetPath.toString());

		// Ensure target directory exists and is clean
		if (await this.fileService.exists(targetPath)) {
			await this.fileService.del(targetPath, { recursive: true });
		}

		try {
			await extract(zipPath.fsPath, targetPath.fsPath, { overwrite: true }, token);
			this.logService.info('MCPB bundle extracted successfully', targetPath.toString());
		} catch (error) {
			// Clean up partial extraction
			try {
				if (await this.fileService.exists(targetPath)) {
					await this.fileService.del(targetPath, { recursive: true });
				}
			} catch (cleanupError) {
				this.logService.warn('Failed to clean up partial extraction', targetPath.toString());
			}

			if (error instanceof ExtractError && error.type === 'CorruptZip') {
				throw new McpBundleServiceError(
					localize('mcpb.corruptZip', "MCPB bundle archive is corrupt"),
					'CORRUPT_ZIP'
				);
			}

			throw new McpBundleServiceError(
				localize('mcpb.extractionFailed', "Failed to extract MCPB bundle: {0}", error instanceof Error ? error.message : String(error)),
				'EXTRACTION_FAILED'
			);
		}
	}

	private delay(ms: number): Promise<void> {
		return new Promise(resolve => setTimeout(resolve, ms));
	}

	/**
	 * Validates that the URL is secure for downloading MCPB bundles.
	 * HTTPS is required for remote downloads to prevent man-in-the-middle attacks.
	 * HTTP is only allowed for localhost addresses (for local testing).
	 */
	private isSecureUrl(url: URI): boolean {
		const scheme = url.scheme.toLowerCase();

		// HTTPS is always allowed
		if (scheme === 'https') {
			return true;
		}

		// HTTP is only allowed for localhost/local addresses (for testing)
		if (scheme === 'http') {
			const host = url.authority.toLowerCase();

			// Handle IPv6 addresses (enclosed in brackets, e.g., [::1]:8080)
			if (host.startsWith('[')) {
				const bracketEnd = host.indexOf(']');
				if (bracketEnd !== -1) {
					const ipv6Host = host.substring(1, bracketEnd);
					return ipv6Host === '::1';
				}
			}

			// Extract hostname without port for IPv4/hostname
			const hostname = host.includes(':') ? host.split(':')[0] : host;
			return hostname === 'localhost' || hostname === '127.0.0.1';
		}

		return false;
	}
}

registerSingleton(IMcpBundleService, McpBundleService, InstantiationType.Delayed);
