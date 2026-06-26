/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Component Governance (CG) NOTICE cutover.
//
// During each platform compile stage this script pulls the CG-generated NOTICE
// (produced by the parallel Quality stage as the `notice_output` artifact) and
// overwrites the repo-root ThirdPartyNotices.txt BEFORE gulp packages it
// (build/gulpfile.vscode.ts reads 'ThirdPartyNotices.txt' at package time).
//
// It clones the proven copilot VSIX background-download harness: a detached
// `deemon` poller starts at compile start (maximum overlap) and the package
// step attaches/blocks on it right before packaging. If the artifact is ready
// by then the added wall-clock is near-zero; otherwise we block for at most a
// short budget and then DEGRADE to the legacy mixin notice.
//
// Design notes:
//   * copy-then-overwrite: mixin-quality.ts is left untouched (shared chokepoint
//     used by 8+ pipelines). The legacy ThirdPartyNotices.txt it lays down is
//     our guaranteed fallback, so we never ship with NO notice.
//   * NON-FATAL: this script always exits 0. A notice problem must never break
//     packaging during the cutover. Steady-state can flip to fatal later.
//   * SHORT poll budget (not the copilot 30min): a missing artifact must degrade
//     to fallback fast, otherwise the non-fatal design is defeated by a 30min hang.
//   * Three greppable markers so a build log answers "fresh vs stale vs off":
//       [notice-cutover] RESULT=fresh     overwrote from notice_output (logs producer)
//       [notice-cutover] RESULT=fallback  artifact missing -> kept legacy notice
//       [notice-cutover] RESULT=disabled  feature flag off -> kept legacy notice

import fs from 'fs';
import path from 'path';
import { Readable } from 'stream';
import type { ReadableStream } from 'stream/web';
import { pipeline } from 'node:stream/promises';
import yauzl from 'yauzl';
import { e, requestAZDOAPI } from './publish.ts';
import { retry } from './retry.ts';

const ARTIFACT_NAME = 'notice_output';
const QUALITY_JOB_NAMES = ['Quality Checks', 'Quality'];
// The merged, shipping NOTICE (CG + scanned extension licenses + cglicenses overrides).
const SHIPPING_NOTICE_NAME = 'ThirdPartyNotices.new.txt';
const TARGET_NOTICE = path.resolve('ThirdPartyNotices.txt');

// Poll budget: 30 attempts x 30s = 15 minutes. Deliberately far below the
// copilot 30min so a never-produced artifact degrades to fallback quickly, but
// with generous margin over the parallel Quality stage (CG + scan + merge).
// The gate accepts only once ThirdPartyNotices.new.txt has been downloaded,
// extracted, and validated non-empty (>1KB) -- merely seeing it in the
// container listing is NOT sufficient, because the listing entry can appear
// before the file's content has finished committing (see waitForNotice). On
// such a mid-upload miss we keep polling rather than falling back, so a
// fast-compiling platform can never ship the legacy notice while its peers
// ship the CG notice. The Quality-completion backstop ends the wait early only
// when .new.txt was never produced at all.
// NB: this is the OUTER artifact-availability poll. It is unrelated to the
// inner retry() wrapper in retry.ts, which independently retries each AZDO API
// call up to 10 times for transient network errors and emits no attempt log.
const POLL_ATTEMPTS = 30;
const POLL_INTERVAL_MS = 30_000;

function log(message: string): void {
	console.log(`[notice-cutover] [${new Date().toISOString()}] ${message}`);
}

interface TimelineRecord {
	readonly name: string;
	readonly type: string;
	readonly state: string;
	readonly result: string;
}

interface Timeline {
	readonly records: TimelineRecord[];
}

// We need the container `data` field (which the publish.ts Artifact type omits)
// to list the FILES inside the notice_output container artifact. For a container
// artifact, resource.data looks like "#/<containerId>/<rootPath>".
interface NoticeArtifact {
	readonly name: string;
	readonly resource: {
		readonly downloadUrl: string;
		readonly data?: string;
		readonly properties: {
			readonly artifactsize: number;
		};
	};
}

function installDiagnostics(): void {
	process.on('uncaughtException', err => {
		console.error('[notice-cutover] Uncaught exception:', err);
		// Non-fatal: never break packaging because of a notice problem.
		process.exit(0);
	});
	process.on('unhandledRejection', reason => {
		console.error('[notice-cutover] Unhandled rejection:', reason);
		process.exit(0);
	});
	for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP', 'SIGBREAK'] as const) {
		process.on(signal, () => {
			console.error(`[notice-cutover] Received ${signal}, exiting.`);
			process.exit(0);
		});
	}
}

function getAzdoFetchOptions() {
	return {
		headers: {
			'Accept': 'application/json;api-version=5.0-preview.1',
			'Accept-Encoding': 'gzip, deflate, br',
			'Accept-Language': 'en-US,en;q=0.9',
			'Referer': 'https://dev.azure.com',
			Authorization: `Bearer ${e('SYSTEM_ACCESSTOKEN')}`
		}
	};
}

async function getPipelineArtifacts(): Promise<NoticeArtifact[]> {
	const result = await requestAZDOAPI<{ readonly value: NoticeArtifact[] }>('artifacts');
	return result.value;
}

// Lists the FILES inside a container artifact via the AZDO container-items API.
// NOTE: a file path can appear in this listing slightly BEFORE its content has
// finished committing to the container (observed in build 450517: the listing
// showed ThirdPartyNotices.new.txt one poll before the artifact download
// actually yielded it). So this listing is a NECESSARY but not SUFFICIENT
// readiness signal -- the caller must still download+extract+validate the file
// before accepting it. Returns the file paths, or undefined if the listing
// could not be retrieved (transient error) so the caller can distinguish "file
// genuinely absent" from "could not check".
async function listArtifactFiles(artifact: NoticeArtifact): Promise<string[] | undefined> {
	// resource.data for a container artifact looks like: #/<containerId>/<rootPath>
	const match = /^#\/(\d+)\/(.+)$/.exec(artifact.resource.data ?? '');
	if (!match) {
		return undefined;
	}

	const [, containerId, itemPath] = match;
	const collectionUri = e('SYSTEM_COLLECTIONURI').replace(/\/$/, '');
	const url = `${collectionUri}/_apis/resources/Containers/${containerId}?itemPath=${encodeURIComponent(itemPath)}&isShallow=false&api-version=4.1-preview.4`;

	const res = await retry(() => fetch(url, getAzdoFetchOptions()));
	if (!res.ok) {
		throw new Error(`Container items request failed: ${res.status}`);
	}

	const body = await res.json() as { readonly value: { readonly path: string; readonly itemType: string }[] };
	return body.value.filter(item => item.itemType === 'file').map(item => item.path);
}

async function getQualityJob(): Promise<TimelineRecord | undefined> {
	const timeline = await retry(() => requestAZDOAPI<Timeline>('timeline'));
	return timeline.records.find(r => r.type === 'Job' && QUALITY_JOB_NAMES.includes(r.name));
}

async function downloadArtifact(artifact: NoticeArtifact, downloadPath: string): Promise<void> {
	const abortController = new AbortController();
	const timeout = setTimeout(() => abortController.abort(), 4 * 60 * 1000);

	try {
		const res = await fetch(artifact.resource.downloadUrl, { ...getAzdoFetchOptions(), signal: abortController.signal });

		if (!res.ok) {
			throw new Error(`Unexpected status code: ${res.status}`);
		}

		await pipeline(Readable.fromWeb(res.body as ReadableStream), fs.createWriteStream(downloadPath));
	} finally {
		clearTimeout(timeout);
	}
}

async function unzip(zipPath: string, outputPath: string): Promise<string[]> {
	return new Promise((resolve, reject) => {
		yauzl.open(zipPath, { lazyEntries: true, autoClose: true }, (err, zipfile) => {
			if (err) {
				return reject(err);
			}

			const result: string[] = [];
			zipfile!.on('entry', entry => {
				if (/\/$/.test(entry.fileName)) {
					zipfile!.readEntry();
				} else {
					zipfile!.openReadStream(entry, (err, istream) => {
						if (err) {
							return reject(err);
						}

						const filePath = path.join(outputPath, entry.fileName);

						// Zip-slip guard: ensure the resolved entry path stays within
						// outputPath. A crafted zip could use ../ segments to escape and
						// overwrite repo files used later in the build.
						const resolvedOutput = path.resolve(outputPath);
						const resolvedTarget = path.resolve(filePath);
						if (resolvedTarget !== resolvedOutput && !resolvedTarget.startsWith(resolvedOutput + path.sep)) {
							return reject(new Error(`Zip entry escapes output directory (zip-slip): ${entry.fileName}`));
						}

						fs.mkdirSync(path.dirname(filePath), { recursive: true });

						const ostream = fs.createWriteStream(filePath);
						ostream.on('finish', () => {
							result.push(filePath);
							zipfile!.readEntry();
						});
						ostream.on('error', err => reject(err));
						istream?.on('error', err => reject(err));
						istream!.pipe(ostream);
					});
				}
			});

			zipfile!.on('close', () => resolve(result));
			zipfile!.readEntry();
		});
	});
}

interface ExtractedNotice {
	readonly shippingPath: string;
	readonly metaFile: string | undefined;
	readonly size: number;
}

// Downloads + extracts the notice_output artifact into tmpDir and validates that
// ThirdPartyNotices.new.txt is actually present AND non-empty (>1KB). Returns the
// extracted notice on success, or undefined if the file is missing/too small in
// the EXTRACTED output -- which, when the container listing claimed it was there,
// means the content is still committing (mid-upload). The caller treats undefined
// as "not ready yet" and re-polls; it must NEVER be treated as terminal fallback,
// because a fast platform that hits this window would otherwise ship the legacy
// notice while its peers ship the CG notice (the cross-arch mismatch bug).
async function tryExtractNotice(artifact: NoticeArtifact, tmpDir: string): Promise<ExtractedNotice | undefined> {
	fs.rmSync(tmpDir, { recursive: true, force: true });
	fs.mkdirSync(tmpDir, { recursive: true });
	const artifactZipPath = path.join(tmpDir, 'notice_output.zip');

	log('  * downloading notice_output artifact to verify content...');
	await retry(() => downloadArtifact(artifact, artifactZipPath));

	log('  * extracting notice_output artifact...');
	const files = await unzip(artifactZipPath, tmpDir);
	const shipping = files.find(f => path.basename(f) === SHIPPING_NOTICE_NAME);

	if (!shipping) {
		log(`  * ${SHIPPING_NOTICE_NAME} listed but not yet in extracted output (mid-upload); will recheck next poll.`);
		return undefined;
	}

	const size = fs.statSync(shipping).size;
	// Guard: a tiny file means the merge produced nothing usable OR the upload is
	// still in flight. Either way, do not accept it -- re-poll.
	if (size <= 1024) {
		log(`  * ${SHIPPING_NOTICE_NAME} extracted but too small (${size} bytes; mid-upload or empty merge); will recheck next poll.`);
		return undefined;
	}

	const metaFile = files.find(f => path.basename(f) === 'notice-meta.txt');
	return { shippingPath: shipping, metaFile, size };
}

// Returns the validated, extracted CG NOTICE if it becomes available within the
// short budget, otherwise undefined (caller keeps the legacy notice).
async function waitForNotice(tmpDir: string): Promise<ExtractedNotice | undefined> {
	const startTime = Date.now();

	for (let index = 0; index < POLL_ATTEMPTS; index++) {
		const elapsed = Math.round((Date.now() - startTime) / 1000);

		try {
			log(`Waiting for ${ARTIFACT_NAME} artifact (attempt ${index + 1}/${POLL_ATTEMPTS}, ${elapsed}s elapsed)...`);

			// The Quality job state is only a BACKSTOP (see below): if it has
			// completed and .new.txt never even appeared in the listing, the file
			// is never coming and we give up early instead of burning the budget.
			const qualityJob = await getQualityJob().catch(() => undefined);
			if (qualityJob) {
				log(`  * Quality job: state=${qualityJob.state}, result=${qualityJob.result ?? 'n/a'}`);
			}

			const allArtifacts = await retry(() => getPipelineArtifacts());
			log(`  * Found ${allArtifacts.length} artifact(s): ${allArtifacts.map(a => a.name).join(', ') || '(none)'}`);

			const artifact = allArtifacts.find(a => a.name === ARTIFACT_NAME);
			if (artifact) {
				// The notice_output container is populated in TWO phases by the
				// Quality stage (first generated.txt + meta, then seconds-to-minutes
				// later the shipping .new.txt). We accept ONLY once .new.txt has been
				// downloaded, extracted, and validated non-empty -- the listing alone
				// races against content-commit (build 450517 armhf), so on a listing
				// hit we attempt a real download+extract and re-poll if it isn't ready.
				const files = await listArtifactFiles(artifact).catch(() => undefined);
				if (files === undefined) {
					// Could not list (transient error or unexpected data shape). Do not
					// give up; just retry next poll. The budget still bounds the wait.
					log('  * could not list notice_output files yet; will recheck next poll');
				} else {
					log(`  * notice_output files: ${files.map(f => path.basename(f)).join(', ') || '(empty)'}`);
					if (files.some(f => path.basename(f) === SHIPPING_NOTICE_NAME)) {
						log(`  * ${SHIPPING_NOTICE_NAME} listed; verifying extracted content...`);
						const extracted = await tryExtractNotice(artifact, tmpDir).catch(err => {
							// A download/extract failure here (e.g. partial zip mid-upload)
							// is NOT terminal: keep polling within budget.
							log(`  * download/extract attempt failed (${err}); will recheck next poll.`);
							return undefined;
						});
						if (extracted) {
							log(`  * ${SHIPPING_NOTICE_NAME} extracted and validated (${extracted.size} bytes); accepting.`);
							return extracted;
						}
						// Listed but not yet downloadable/valid: fall through to wait + re-poll.
						// Deliberately NO early give-up here even if the Quality job reports
						// "completed" -- the artifact upload is async (continueOnError) and may
						// still be finalizing, so we let the budget bound the wait.
					} else if (qualityJob && qualityJob.state === 'completed') {
						// BACKSTOP: .new.txt was never even listed AND Quality finished
						// => it is never coming. Fall back instead of polling the full budget.
						log(`  * Quality job completed but ${SHIPPING_NOTICE_NAME} never appeared in artifact; giving up.`);
						return undefined;
					} else {
						log(`  * ${SHIPPING_NOTICE_NAME} not in artifact yet; waiting...`);
					}
				}
			} else if (qualityJob && qualityJob.state === 'completed') {
				log('  * Quality job completed but no notice_output artifact; giving up.');
				return undefined;
			}

			log(`  * Not ready yet, waiting ${POLL_INTERVAL_MS / 1000}s...`);
		} catch (err) {
			console.error(`[notice-cutover] WARNING: poll attempt failed: ${err}`);
		}

		await new Promise(c => setTimeout(c, POLL_INTERVAL_MS));
	}

	log(`Poll budget exhausted (${POLL_ATTEMPTS} attempts) without a valid ${SHIPPING_NOTICE_NAME}.`);
	return undefined;
}

async function main(): Promise<void> {
	installDiagnostics();

	// Feature flag = instant rollback. Default ON during the cutover validation;
	// set VSCODE_OVERWRITE_TPN=false to force the legacy mixin notice. Check is
	// case-insensitive on purpose so YAML casing (true/false vs True/False) can't
	// silently break the rollback lever.
	if ((process.env['VSCODE_OVERWRITE_TPN'] ?? '').trim().toLowerCase() === 'false') {
		log('RESULT=disabled feature flag off (VSCODE_OVERWRITE_TPN=false); keeping legacy notice.');
		return;
	}

	const tmpDir = path.resolve('.build/tmp-notice');
	const notice = await waitForNotice(tmpDir);
	if (!notice) {
		// Only reached on GENUINE exhaustion or a confirmed never-produced artifact
		// -- never on a transient mid-upload miss (those re-poll inside waitForNotice).
		log(`RESULT=fallback ${SHIPPING_NOTICE_NAME} unavailable within budget; keeping legacy notice.`);
		fs.rmSync(tmpDir, { recursive: true, force: true });
		return;
	}

	// Log provenance for legal traceability: which build/commit produced this NOTICE.
	if (notice.metaFile) {
		log('NOTICE provenance:');
		for (const line of fs.readFileSync(notice.metaFile, 'utf8').split(/\r?\n/)) {
			if (line.trim()) {
				log(`    ${line}`);
			}
		}
	}

	const legacySize = fs.existsSync(TARGET_NOTICE) ? fs.statSync(TARGET_NOTICE).size : 0;
	fs.copyFileSync(notice.shippingPath, TARGET_NOTICE);
	log(`RESULT=fresh overwrote ${TARGET_NOTICE} with CG NOTICE (${notice.size} bytes; legacy was ${legacySize} bytes).`);

	fs.rmSync(tmpDir, { recursive: true, force: true });
}

main().catch(err => {
	// Non-fatal: log and exit 0 so packaging proceeds with the legacy notice.
	console.error('[notice-cutover] Non-fatal error; keeping legacy notice:', err);
	process.exitCode = 0;
});
