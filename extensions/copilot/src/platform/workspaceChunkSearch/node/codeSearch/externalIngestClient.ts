/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import ingestUtils = require('@github/blackbird-external-ingest-utils');
import * as l10n from '@vscode/l10n';
import crypto from 'crypto';
import { CancellationToken } from 'vscode-languageserver-protocol';
import { toErrorMessage } from '../../../../util/common/errorMessage';
import { Result } from '../../../../util/common/result';
import { CallTracker } from '../../../../util/common/telemetryCorrelationId';
import { raceCancellationError, timeout } from '../../../../util/vs/base/common/async';
import { encodeBase64, VSBuffer } from '../../../../util/vs/base/common/buffer';
import { CancellationTokenSource } from '../../../../util/vs/base/common/cancellation';
import { CancellationError, isCancellationError } from '../../../../util/vs/base/common/errors';
import { Disposable } from '../../../../util/vs/base/common/lifecycle';
import { URI } from '../../../../util/vs/base/common/uri';
import { IAuthenticationService } from '../../../authentication/common/authentication';
import { EmbeddingType } from '../../../embeddings/common/embeddingsComputer';
import { githubHeaders, IGithubApiFetcherService } from '../../../github/common/githubApiFetcherService';
import { ILogService } from '../../../log/common/logService';
import { ITelemetryService } from '../../../telemetry/common/telemetry';


export interface ExternalIngestFile {
	readonly uri: URI;
	readonly relativePath: string;
	readonly docSha: Uint8Array;

	read(): Promise<Uint8Array>;
}

export interface ExternalIngestUpdateIndexResult {
	readonly checkpoint: string;
	readonly totalFileCount: number;
	readonly updatedFileCount: number;
}

export interface ExternalIngestFileSet {
	readonly files: readonly ExternalIngestFile[];
	readonly checkpoint: string;
}

export function computeCheckpointHash(files: readonly { readonly uri: URI; readonly docSha: Uint8Array }[]): string {
	const hash = crypto.createHash('sha256');
	for (const file of files) {
		hash.update(file.uri.toString());
		hash.update(file.docSha);
	}
	return hash.digest().toString('base64');
}

/**
 * Interface for the external ingest client that handles indexing and searching files.
 */
export interface IExternalIngestClient {
	updateIndex(
		filesetName: string,
		fileSet: ExternalIngestFileSet,
		callTracker: CallTracker,
		token: CancellationToken,
		onProgress?: (message: string) => void
	): Promise<Result<ExternalIngestUpdateIndexResult, Error>>;

	listFilesets(callTracker: CallTracker, token: CancellationToken): Promise<string[]>;
	deleteFileset(filesetName: string, callTracker: CallTracker, token: CancellationToken): Promise<void>;

	searchFilesets(filesetName: string, prompt: string, limit: number, callTracker: CallTracker, token: CancellationToken): Promise<SearchFilesetsResponse | undefined>;

	/**
	 * Quickly checks if a file can be ingested based on its path and size.
	 */
	canIngestPathAndSize(filePath: string, size: number): boolean;

	/**
	 * Checks if a file can be ingested based on its path and file contents.
	 */
	canIngestDocument(filePath: string, data: Uint8Array): boolean;
}

export class ExternalIngestRequestError extends Error {
	constructor(
		message: string,
		public readonly response: Response
	) {
		super(message);
	}
}

function isConflictError(e: unknown): e is ExternalIngestRequestError {
	return e instanceof ExternalIngestRequestError && e.response.status === 409;
}

interface CodedSymbolRange {
	readonly start: number;
	readonly end: number;
}

export class ExternalIngestClient extends Disposable implements IExternalIngestClient {
	private static readonly PROMISE_POOL_SIZE = 64;
	private static baseUrl = 'https://api.github.com';

	private readonly _ingestFilter = new ingestUtils.IngestFilter();

	constructor(
		@IGithubApiFetcherService private readonly githubApiFetcherService: IGithubApiFetcherService,
		@IAuthenticationService private readonly authenticationService: IAuthenticationService,
		@ILogService private readonly logService: ILogService,
		@ITelemetryService private readonly telemetryService: ITelemetryService,
	) {
		super();

		ingestUtils.setupPanicHooks();
	}

	public async getAuthToken(): Promise<string | undefined> {
		return (await this.authenticationService.getGitHubSession('permissive', { silent: true }))?.accessToken
			?? (await this.authenticationService.getGitHubSession('any', { silent: true }))?.accessToken;
	}

	public canIngestPathAndSize(filePath: string, size: number): boolean {
		const result = ingestUtils.canIngestPathAndSize(this._ingestFilter, filePath, size);
		return typeof result.failureReason === 'undefined';
	}

	public canIngestDocument(filePath: string, data: Uint8Array): boolean {
		const result = ingestUtils.canIngestDocument(this._ingestFilter, filePath, new ingestUtils.DocumentContents(data));
		return typeof result.failureReason === 'undefined';
	}

	private getHeaders(): Record<string, string> {
		return {
			'Content-Type': 'application/json',
		};
	}

	private async makeRequest(authToken: string, method: 'GET' | 'POST' | 'DELETE', path: string, body: unknown | undefined, options: { retriesOn500?: number; retriesOnRateLimiting?: number }, callTracker: CallTracker, token: CancellationToken): Promise<Response> {
		const pathId = path.replace(/^\//, '').replace(/\//g, '-');
		const url = `${ExternalIngestClient.baseUrl}${path}`;

		const retriesOn500 = options.retriesOn500 ?? (method === 'GET' ? 3 : 0);

		const response = await this.githubApiFetcherService.makeRequest({
			url,
			headers: this.getHeaders(),
			method,
			body,
			authToken,
			telemetry: { urlId: pathId, callerInfo: callTracker },
			retriesOn500,
			retriesOnRateLimiting: options.retriesOnRateLimiting,
		}, token);

		if (response.ok) {
			return response;
		}

		/* __GDPR__
			"externalIngestClient.post.error" : {
				"owner": "copilot-core",
				"comment": "Logging when a external ingest request fails",
				"path": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "The API path that was called" },
				"statusCode": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "comment": "The response status code" }
			}
		*/
		this.telemetryService.sendMSFTTelemetryEvent('externalIngestClient.post.error', {
			path: pathId,
		}, { statusCode: response.status });

		this.logService.warn(`ExternalIngestClient(${method} ${path}): Got ${response.status}, request failed`);

		throw new ExternalIngestRequestError(`${method} ${pathId} failed with status ${response.status}`, response);
	}

	async updateIndex(filesetName: string, fileSet: ExternalIngestFileSet, inCallTracker: CallTracker, token: CancellationToken, onProgress?: (message: string) => void): Promise<Result<ExternalIngestUpdateIndexResult, Error>> {
		const callTracker = inCallTracker.add('ExternalIngestClient::updateIndex');
		const authToken = await raceCancellationError(this.getAuthToken(), token);
		if (!authToken) {
			this.logService.warn('ExternalIngestClient::updateIndex(): No auth token available');
			return Result.error(new Error('No auth token available'));
		}

		const { files: allFiles, checkpoint: newCheckpoint } = fileSet;

		// Initial setup
		const mappings = new Map</* sha */ string, ExternalIngestFile>();
		const geoFilter = new ingestUtils.GeoFilter();

		this.logService.info(`ExternalIngestClient::updateIndex(). Creating ingest for fileset: ${filesetName}`);

		onProgress?.(l10n.t('Scanning files...'));
		this.logService.trace(`ExternalIngestClient::updateIndex(). Checking for ingestable files...`);
		const ingestableCheckStart = performance.now();

		const allDocShas: Uint8Array[] = [];
		for (const file of allFiles) {
			if (token.isCancellationRequested) {
				throw new CancellationError();
			}

			geoFilter.push(file.docSha);
			allDocShas.push(file.docSha);

			const docShaBase64 = Buffer.from(file.docSha).toString('base64');
			mappings.set(docShaBase64, file);
		}

		this.logService.debug(`ExternalIngestClient::updateIndex(). Found ${mappings.size} ingestable files in ${Math.round(performance.now() - ingestableCheckStart)}ms`,);

		// Coded symbols used during finalization of the fileset.
		// TODO: this range should be the entire fileset, right?
		const codedSymbols = ingestUtils.createCodedSymbols(allDocShas, 0, 1).map((cs) => Buffer.from(cs).toString('base64'));

		// Retry loop for 409 Conflict: per the external indexing spec, if any ingestion
		// endpoint returns 409, discard the ingest_id and restart from CreateCheckpoint.
		const maxConflictRetries = 3;
		for (let conflictAttempt = 0; conflictAttempt < maxConflictRetries; conflictAttempt++) {
			if (conflictAttempt > 0) {
				this.logService.warn(`ExternalIngestClient::updateIndex(): 409 Conflict, restarting from CreateCheckpoint (attempt ${conflictAttempt + 1}/${maxConflictRetries})`);
				onProgress?.(l10n.t('Server conflict, restarting ingestion...'));
			}

			try {
				return await this.performIngestion(authToken, filesetName, newCheckpoint, geoFilter, codedSymbols, allDocShas, mappings, callTracker, token, onProgress);
			} catch (err) {
				if (isCancellationError(err)) {
					throw err;
				}

				if (isConflictError(err) && conflictAttempt < maxConflictRetries - 1) {
					continue;
				}

				return Result.error(err instanceof Error ? err : new Error(String(err)));
			}
		}
		return Result.error(new Error('Ingest failed after max conflict retries'));
	}

	private async performIngestion(
		authToken: string,
		filesetName: string,
		newCheckpoint: string,
		geoFilter: ingestUtils.GeoFilter,
		codedSymbols: string[],
		allDocShas: Uint8Array[],
		mappings: Map<string, ExternalIngestFile>,
		callTracker: CallTracker,
		token: CancellationToken,
		onProgress?: (message: string) => void,
	): Promise<Result<ExternalIngestUpdateIndexResult, Error>> {
		onProgress?.(l10n.t('Creating snapshot...'));

		// Create checkpoint (phase 1). A 429 without Retry-After means "too many filesets",
		// which requires cleaning up old filesets before retrying.
		const createIngestBody = {
			fileset_name: filesetName,
			new_checkpoint: newCheckpoint,
			geo_filter: Buffer.from(geoFilter.toBytes()).toString('base64'),
			coded_symbols: codedSymbols,
		};
		let createIngestResponse: Response;
		try {
			createIngestResponse = await this.makeRequest(authToken, 'POST', '/external/code/ingest', createIngestBody, {}, callTracker, token);
		} catch (err) {
			const retryAfter = err.response.headers.get('Retry-After');
			if (err instanceof ExternalIngestRequestError && err.response.status === 429 && !retryAfter) {
				this.logService.info('ExternalIngestClient::performIngestion(): Got 429 (too many filesets), cleaning up...');
				onProgress?.(l10n.t("Too many filesets, cleaning up old ones..."));
				await raceCancellationError(this.cleanupOldFilesets(authToken, filesetName, callTracker, token), token);
				onProgress?.(l10n.t("Retrying snapshot creation..."));
				createIngestResponse = await this.makeRequest(authToken, 'POST', '/external/code/ingest', createIngestBody, {}, callTracker, token);
			} else {
				throw err;
			}
		}

		const res = await raceCancellationError(createIngestResponse.json(), token) as { ingest_id: string; coded_symbol_range: CodedSymbolRange };
		const ingestId = res.ingest_id;
		let codedSymbolRange: CodedSymbolRange | undefined = res.coded_symbol_range;

		if (
			ingestId === '' &&
			codedSymbolRange.start === 0 &&
			codedSymbolRange.end === 0
		) {
			this.logService.info('ExternalIngestClient::performIngestion(): Ingest has already run successfully');
			return Result.ok({ checkpoint: newCheckpoint, totalFileCount: mappings.size, updatedFileCount: 0 });
		}
		this.logService.debug(`ExternalIngestClient::performIngestion(): Got ingest ID: ${ingestId}`);

		// Phase 2: Set reconciliation
		onProgress?.(l10n.t('Reconciling with server...'));
		this.logService.debug('ExternalIngestClient::performIngestion(): Starting set reconciliation...');

		while (codedSymbolRange) {
			if (token.isCancellationRequested) {
				throw new CancellationError();
			}

			this.logService.debug(`ExternalIngestClient::performIngestion(): Creating coded symbols for ${codedSymbolRange.start} to ${codedSymbolRange.end}`);
			const nextCodedSymbols = ingestUtils.createCodedSymbols(
				allDocShas,
				codedSymbolRange.start,
				codedSymbolRange.end,
			).map(cs => Buffer.from(cs).toString('base64'));
			try {
				const pushCodedSymbolsResponse = await this.makeRequest(
					authToken,
					'POST',
					'/external/code/ingest/coded_symbols',
					{
						ingest_id: ingestId,
						coded_symbols: nextCodedSymbols,
						coded_symbol_range: codedSymbolRange,
					},
					{},
					callTracker,
					token
				);
				const body = await raceCancellationError(pushCodedSymbolsResponse.json(), token) as { next_coded_symbol_range?: CodedSymbolRange };
				codedSymbolRange = body.next_coded_symbol_range;
			} catch (err) {
				if (isCancellationError(err) || isConflictError(err)) {
					throw err;
				}

				this.logService.error(`ExternalIngestClient::performIngestion(): Failed to push coded symbols: ${err}`);
				throw new Error(`Exception during push coded symbols: ${err}`);
			}
		}

		// Phase 3 + 4: Upload documents, then finalize.
		const maxFinalizeAttempts = 3;
		// Unique docShas the server accepted across all finalize passes. Using a set (rather
		// than summing per-pass counts) prevents over-reporting `updatedFileCount` when the
		// same document is re-uploaded after a finalize 412.
		const uploadedDocShas = new Set<string>();
		for (let finalizeAttempt = 0; ; finalizeAttempt++) {
			const uploadedThisPass = await this.uploadDocuments(authToken, ingestId, mappings, uploadedDocShas, callTracker, token, onProgress);

			// Phase 4: Finalize
			onProgress?.(l10n.t('Finalizing index...'));
			try {
				const resp = await this.makeRequest(authToken, 'POST', '/external/code/ingest/finalize', {
					ingest_id: ingestId,
				}, {}, callTracker, token);

				this.logService.info('ExternalIngestClient::performIngestion(): Successfully finalized ingest.');
				const requestId = resp.headers.get('x-github-request-id');
				const body = await resp.text();
				this.logService.debug(`requestId: '${requestId}', body: ${body}`);
				break;
			} catch (err) {
				const isPhaseMismatch = err instanceof ExternalIngestRequestError && err.response.status === 412;

				// 412 means the server is not yet in the finalize phase. Re-poll `/batch`,
				// re-upload anything still missing, back off and retry.
				if (isPhaseMismatch && finalizeAttempt < maxFinalizeAttempts - 1) {
					this.logService.warn(`ExternalIngestClient::performIngestion(): Finalize returned 412 (phase mismatch), re-uploading missing documents and retrying (attempt ${finalizeAttempt + 1}/${maxFinalizeAttempts})`);
					onProgress?.(l10n.t('Reconciling remaining documents...'));
					await timeout(1000, token);
					continue;
				}

				// Retries are exhausted. If the final pass uploaded nothing - i.e. the
				// server reported no missing documents yet still refuses to finalize -
				// surface a distinct, more diagnostic error: this is most likely a
				// server-side phase issue that no amount of client retrying can resolve.
				if (isPhaseMismatch && uploadedThisPass === 0) {
					const requestId = err.response.headers.get(githubHeaders.requestId);
					throw new Error(`External ingest finalize still reported a phase mismatch (412) after ${maxFinalizeAttempts} attempts even though the server reported no missing documents${requestId ? ` (requestId: ${requestId})` : ''}. This likely indicates a server-side issue.`);
				}

				throw err;
			}
		}

		return Result.ok({ checkpoint: newCheckpoint, totalFileCount: mappings.size, updatedFileCount: uploadedDocShas.size });
	}

	/**
	 * Uploads every document the server still needs for the given ingest.
	 *
	 * Polls `/external/code/ingest/batch` for the set of documents the server is
	 * missing and uploads them in parallel. A fresh "seen" set is used on every
	 * call so that re-running this after a finalize phase mismatch re-uploads any
	 * documents the server is still expecting. Returns the number of documents
	 * uploaded during this pass.
	 */
	private async uploadDocuments(
		authToken: string,
		ingestId: string,
		mappings: Map<string, ExternalIngestFile>,
		uploadedDocShas: Set<string>,
		callTracker: CallTracker,
		token: CancellationToken,
		onProgress?: (message: string) => void,
	): Promise<number> {
		// Phase 3: Document upload
		onProgress?.(l10n.t('Uploading documents...'));
		this.logService.debug('ExternalIngestClient::performIngestion(): Starting document upload...');

		let pageToken = undefined;
		const seenDocShas = new Set<string>();
		const uploading = new Set<Promise<void>>();
		let uploaded = 0;
		// Documents whose upload request ultimately failed (after the HTTP layer's own
		// 5xx/rate-limit retries). These are NOT counted as uploaded and cause the pass
		// to fail with a descriptive error rather than silently leaving the server in the
		// upload phase (which would otherwise surface later as a confusing finalize 412).
		const failedUploads: Array<{ readonly relativePath: string; readonly status?: number; readonly requestId?: string | null }> = [];
		// A fatal upload error (e.g. a 404 meaning the ingest itself is gone) aborts the
		// whole pass. We record it rather than rejecting the pooled upload promise, because
		// an intermediate `Promise.all(uploading)` could otherwise swallow the rejection.
		let fatalUploadError: ExternalIngestRequestError | undefined;
		const uploadStart = performance.now();

		const uploadCts = new CancellationTokenSource(token);
		try {
			do {
				if (token.isCancellationRequested) {
					throw new CancellationError();
				}

				// A fatal upload error (e.g. the ingest is gone) was seen on a previous
				// page - stop fetching more work and drain what is in flight.
				if (fatalUploadError) {
					break;
				}

				try {
					await raceCancellationError(Promise.all(uploading), token);
				} catch (e) {
					if (isCancellationError(e) || isConflictError(e)) {
						throw e;
					}
					this.logService.error('ExternalIngestClient::performIngestion(): Error uploading document:', e);
				}

				this.logService.debug(`ExternalIngestClient::performIngestion(): /batch started with pageToken: ${pageToken}`);

				const getBatchResponse = await this.makeRequest(authToken, 'POST', '/external/code/ingest/batch', {
					ingest_id: ingestId,
					page_token: pageToken,
				}, {}, callTracker, token);

				const { doc_ids: docIds, next_page_token: nextPageToken } =
					await raceCancellationError(getBatchResponse.json(), token) as { doc_ids: string[] | undefined; next_page_token: string | undefined };

				this.logService.debug(`ExternalIngestClient::performIngestion(): /batch returned ${docIds?.length ?? 0} doc IDs for upload. Next page token: ${nextPageToken}`);

				if (docIds) {
					const newSet = new Set(docIds);
					const toUpload = new Set([...newSet].filter(x => !seenDocShas.has(x)));
					this.logService.debug(`ExternalIngestClient::performIngestion(): /batch seeing ${toUpload.size} new documents.`);
					if (toUpload.size === 0) {
						break;
					}

					for (const requestedDocSha of toUpload) {
						if (token.isCancellationRequested) {
							throw new CancellationError();
						}

						if (fatalUploadError) {
							break;
						}

						seenDocShas.add(requestedDocSha);
						const p = (async () => {
							const fileEntry = mappings.get(requestedDocSha);
							if (!fileEntry) {
								this.logService.error(`ExternalIngestClient::performIngestion(): Server requested a docSha with no local mapping: ${requestedDocSha}`);
								failedUploads.push({ relativePath: `<unmapped docSha ${requestedDocSha}>` });
								return;
							}

							try {
								this.logService.debug(`ExternalIngestClient::performIngestion(): Uploading file: ${fileEntry.relativePath}`);

								let content: string | undefined = undefined;
								try {
									const bytes = await fileEntry.read();
									content = encodeBase64(VSBuffer.wrap(bytes));
								} catch (err) {
									this.logService.warn(`ExternalIngestClient::performIngestion(): Failed to read file for ${fileEntry.relativePath}: ${toErrorMessage(err, true)}`);
								}

								await this.makeRequest(authToken, 'POST', '/external/code/ingest/document', {
									ingest_id: ingestId,

									// If the file read failed, we still upload but pass empty content and empty path.
									// This signals that we've completed the upload but the document should be deleted
									content: typeof content === 'string' ? content : '',
									file_path: typeof content === 'string' ? fileEntry.relativePath : '',
									doc_id: requestedDocSha,
								}, { retriesOn500: 3, retriesOnRateLimiting: 10 }, callTracker, uploadCts.token);

								// Only successful uploads are counted.
								uploaded += 1;
								uploadedDocShas.add(requestedDocSha);
							} catch (e) {
								if (isCancellationError(e) || isConflictError(e)) {
									throw e;
								}

								if (e instanceof ExternalIngestRequestError) {
									const requestId = e.response.headers.get(githubHeaders.requestId);
									const responseBody = await e.response.text().catch(() => undefined);

									this.logService.error(`ExternalIngestClient::performIngestion(): Document upload for ${fileEntry.relativePath} failed with status: '${e.response.status}', requestId: '${requestId}'${responseBody ? `, body: ${responseBody}` : ''}`);

									// A 404 means the ingest itself is gone server-side; no further
									// uploads or a finalize can succeed. Record it as fatal so the pass
									// aborts deterministically after draining (rather than relying on a
									// rejection that an intermediate `Promise.all` could swallow).
									if (e.response.status === 404) {
										fatalUploadError ??= new ExternalIngestRequestError(`Ingest not found (404) for document: ${fileEntry.relativePath}`, e.response);
									} else {
										// Record the failure so the pass surfaces a descriptive error after
										// draining, instead of swallowing it and stranding the server.
										failedUploads.push({ relativePath: fileEntry.relativePath, status: e.response.status, requestId });
									}
								} else {
									this.logService.error('ExternalIngestClient::performIngestion(): Error uploading document:', e);
									failedUploads.push({ relativePath: fileEntry.relativePath });
								}
							}
						})();
						p.finally(() => {
							uploading.delete(p);
							const processed = uploaded + failedUploads.length;
							if (processed % 10 === 0) {
								const remaining = mappings.size - processed;
								onProgress?.(l10n.t('Uploading documents... ({0} remaining)', remaining));
								const elapsed = Math.round(performance.now() - uploadStart);
								const docsPerSecond = Math.round(uploaded / (elapsed / 1000));
								this.logService.info(
									`Uploaded ${uploaded} documents in ${elapsed}ms (${docsPerSecond}Hz)`,
								);
							}
						});
						uploading.add(p);

						if (uploading.size >= ExternalIngestClient.PROMISE_POOL_SIZE) {
							await Promise.race(uploading);
						}
					}
				}

				pageToken = nextPageToken;
			} while (pageToken);

			await raceCancellationError(Promise.all(uploading), uploadCts.token);

		} finally {
			uploadCts.cancel();
			uploadCts.dispose();
		}

		this.logService.info(
			`ExternalIngestClient::performIngestion(): Uploaded ${uploaded} ingestable files in ${Math.round(performance.now() - uploadStart)}ms`,
		);

		// A fatal error (e.g. the ingest is gone) takes precedence and aborts the run.
		if (fatalUploadError) {
			throw fatalUploadError;
		}

		// Surface a descriptive error if any document failed to upload. Doing this here -
		// rather than swallowing the failure - means the run fails with the real cause
		// (e.g. a 5xx on a specific document) instead of later masquerading as a finalize
		// phase mismatch, and prevents the server from being stranded mid-upload.
		if (failedUploads.length > 0) {
			const first = failedUploads[0];
			const detail = `${first.relativePath}${first.status !== undefined ? ` (status ${first.status})` : ''}${first.requestId ? `, requestId: ${first.requestId}` : ''}`;
			throw new Error(`Failed to upload ${failedUploads.length} document(s) to the external ingest service. First failure: ${detail}.`);
		}

		return uploaded;
	}

	async listFilesets(callTracker: CallTracker, token: CancellationToken): Promise<string[]> {
		const authToken = await this.getAuthToken();
		if (!authToken) {
			this.logService.warn('ExternalIngestClient::listFilesets(): No auth token available');
			return [];
		}

		const filesets = await this.listFilesetsWithDetails(authToken, callTracker.add('ExternalIngestClient::listFilesets'), token);
		return filesets.map(x => x.name);
	}

	private async listFilesetsWithDetails(authToken: string, callTracker: CallTracker, token: CancellationToken): Promise<Array<{ name: string; checkpoint: string; status: string }>> {
		const resp = await this.makeRequest(authToken, 'GET', '/external/code/ingest', undefined, {}, callTracker.add('ExternalIngestClient::listFilesetsWithDetails'), token);
		const body = await resp.json() as { filesets?: Array<{ name: string; checkpoint: string; status: string }>; max_filesets: number };
		return body.filesets ?? [];
	}

	/**
	 * Cleans up old filesets to make room for new ones.
	 */
	private async cleanupOldFilesets(authToken: string, currentFilesetName: string, inCallTracker: CallTracker, token: CancellationToken): Promise<void> {
		const callTracker = inCallTracker.add('ExternalIngestClient::cleanupOldFilesets');
		const filesets = await this.listFilesetsWithDetails(authToken, callTracker, token);

		const candidates = filesets.filter(f => f.name !== currentFilesetName);
		const toDelete = candidates.at(-1);
		if (toDelete) {
			await this.deleteFilesetByName(authToken, toDelete.name, callTracker, token);
		}
	}

	async deleteFileset(filesetName: string, callTracker: CallTracker, token: CancellationToken): Promise<void> {
		const authToken = await this.getAuthToken();
		if (!authToken) {
			this.logService.warn('ExternalIngestClient::deleteFileset(): No auth token available');
			return;
		}

		return this.deleteFilesetByName(authToken, filesetName, callTracker.add('ExternalIngestClient::deleteFileset'), token);
	}

	async deleteFilesetByName(authToken: string, fileSetName: string, callTracker: CallTracker, token: CancellationToken): Promise<void> {
		const resp = await this.makeRequest(authToken, 'DELETE', '/external/code/ingest', { fileset_name: fileSetName }, {}, callTracker.add('ExternalIngestClient::deleteFilesetByName'), token);
		const requestId = resp.headers.get('x-github-request-id');
		const respBody = await resp.text();
		this.logService.debug(`ExternalIngestClient::deleteFilesetByName(): Delete response - requestId: '${requestId}', body: ${respBody}`);
		this.logService.info(`ExternalIngestClient::deleteFilesetByName(): Deleted: ${fileSetName}`);
	}

	async searchFilesets(filesetName: string, prompt: string, limit: number, callTracker: CallTracker, token: CancellationToken): Promise<SearchFilesetsResponse | undefined> {
		const authToken = await this.getAuthToken();
		if (!authToken) {
			this.logService.warn('ExternalIngestClient::searchFilesets(): No auth token available');
			return undefined;
		}

		this.logService.debug(`ExternalIngestClient::searchFilesets(): Searching fileset '${filesetName}' for prompt: '${prompt}'`);
		const embeddingType = EmbeddingType.metis_1024_I16_Binary;
		const resp = await this.makeRequest(authToken, 'POST', '/external/embeddings/code/search', {
			prompt,
			scoping_query: `fileset:${filesetName}`,
			embedding_model: embeddingType.id,
			limit,
		}, {}, callTracker.add('ExternalIngestClient::searchFilesets'), token);

		return await resp.json() as SearchFilesetsResponse;
	}
}

interface SearchFilesetsResponse {
	readonly results: SearchFilesetsResult[] | undefined;
	readonly embedding_model: string;
}

export interface SearchFilesetsResult {
	readonly location: SearchLocation;
	readonly distance: number;
	readonly chunk: SearchChunk;
	readonly text: string;
}

interface SearchLocation {
	readonly fileset: string;
	readonly checkpoint: string;
	readonly doc_id: string;
	readonly path: string;
}

interface SearchChunk {
	readonly hash: string;
	readonly text: string;
	readonly line_range: LineRange;
	readonly range: CharacterRange;
}

interface LineRange {
	readonly start: number;
	readonly end: number;
}

interface CharacterRange {
	readonly start: number;
	readonly end: number;
}
