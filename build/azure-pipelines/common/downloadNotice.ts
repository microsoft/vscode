/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// E-lite: Component Governance (CG) NOTICE cutover.
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
// Design notes (see oss-cutover design log):
//   * copy-then-overwrite: mixin-quality.ts is left untouched (shared chokepoint
//     used by 8+ pipelines). The legacy ThirdPartyNotices.txt it lays down is
//     our guaranteed fallback, so we never ship with NO notice.
//   * NON-FATAL: this script always exits 0. A notice problem must never break
//     packaging during the cutover. Steady-state can flip to fatal later.
//   * SHORT poll budget (not the copilot 30min): a missing artifact must degrade
//     to fallback fast, otherwise the non-fatal design is defeated by a 30min hang.
//   * Three greppable markers so a build log answers "fresh vs stale vs off":
//       [notice-elite] RESULT=fresh     overwrote from notice_output (logs producer)
//       [notice-elite] RESULT=fallback  artifact missing -> kept legacy notice
//       [notice-elite] RESULT=disabled  feature flag off -> kept legacy notice

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

// Poll budget: 20 attempts x 30s = 10 minutes. Deliberately far below the
// copilot 30min so a never-produced artifact degrades to fallback quickly, but
// with generous margin over the parallel Quality stage (CG + scan + merge).
// The PRIMARY gate accepts the instant ThirdPartyNotices.new.txt appears in the
// container listing (observed ~3-4min), so the budget is mostly safety margin;
// the Quality-completion backstop ends the wait early if the file never lands.
// NB: this is the OUTER artifact-availability poll. It is unrelated to the
// inner retry() wrapper in retry.ts, which independently retries each AZDO API
// call up to 10 times for transient network errors and emits no attempt log.
const POLL_ATTEMPTS = 20;
const POLL_INTERVAL_MS = 30_000;

function log(message: string): void {
	console.log(`[notice-elite] [${new Date().toISOString()}] ${message}`);
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
		console.error('[notice-elite] Uncaught exception:', err);
		// Non-fatal: never break packaging because of a notice problem.
		process.exit(0);
	});
	process.on('unhandledRejection', reason => {
		console.error('[notice-elite] Unhandled rejection:', reason);
		process.exit(0);
	});
	for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP', 'SIGBREAK'] as const) {
		process.on(signal, () => {
			console.error(`[notice-elite] Received ${signal}, exiting.`);
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
// Container-artifact file uploads are atomic per file: a file only appears in
// this listing AFTER its upload has finished, so seeing ThirdPartyNotices.new.txt
// here means it is fully written and safe to download. Returns the file paths,
// or undefined if the listing could not be retrieved (transient error) so the
// caller can distinguish "file genuinely absent" from "could not check".
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
						fs.mkdirSync(path.dirname(filePath), { recursive: true });

						const ostream = fs.createWriteStream(filePath);
						ostream.on('finish', () => {
							result.push(filePath);
							zipfile!.readEntry();
						});
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

// Returns the artifact if it appears within the short budget, otherwise undefined.
async function waitForArtifact(): Promise<NoticeArtifact | undefined> {
	const startTime = Date.now();

	for (let index = 0; index < POLL_ATTEMPTS; index++) {
		const elapsed = Math.round((Date.now() - startTime) / 1000);

		try {
			log(`Waiting for ${ARTIFACT_NAME} artifact (attempt ${index + 1}/${POLL_ATTEMPTS}, ${elapsed}s elapsed)...`);

			// The Quality job state is only a BACKSTOP now (see below): if it has
			// completed and .new.txt is still absent, the file is never coming and
			// we give up early instead of burning the whole budget.
			const qualityJob = await getQualityJob().catch(() => undefined);
			if (qualityJob) {
				log(`  * Quality job: state=${qualityJob.state}, result=${qualityJob.result ?? 'n/a'}`);
			}

			const allArtifacts = await retry(() => getPipelineArtifacts());
			log(`  * Found ${allArtifacts.length} artifact(s): ${allArtifacts.map(a => a.name).join(', ') || '(none)'}`);

			const artifact = allArtifacts.find(a => a.name === ARTIFACT_NAME);
			if (artifact) {
				// PRIMARY GATE: accept the instant ThirdPartyNotices.new.txt actually
				// exists inside the container artifact. The artifact is populated in
				// TWO phases by two Quality-stage steps (first generated.txt + meta,
				// then seconds-to-minutes later the shipping .new.txt). The artifact
				// NAME appears after phase 1, so checking the NAME alone races. But a
				// container file appears in the listing only after its upload finishes,
				// so the listing is an exact, race-free readiness signal -- and it lets
				// us accept as soon as .new.txt lands rather than waiting for the whole
				// Quality job to finish (which observably wastes ~80s of margin).
				const files = await listArtifactFiles(artifact).catch(() => undefined);
				if (files === undefined) {
					// Could not list (transient error or unexpected data shape). Do not
					// give up; just retry next poll. The budget still bounds the wait.
					log('  * could not list notice_output files yet; will recheck next poll');
				} else {
					log(`  * notice_output files: ${files.map(f => path.basename(f)).join(', ') || '(empty)'}`);
					if (files.some(f => path.basename(f) === SHIPPING_NOTICE_NAME)) {
						log(`  * ${SHIPPING_NOTICE_NAME} present in artifact; accepting.`);
						return artifact;
					}
					// BACKSTOP: file confirmed absent AND the Quality job has finished
					// => it is never coming. Fall back instead of polling the full budget.
					if (qualityJob && qualityJob.state === 'completed') {
						log(`  * Quality job completed but ${SHIPPING_NOTICE_NAME} absent from artifact; giving up.`);
						return undefined;
					}
					log(`  * ${SHIPPING_NOTICE_NAME} not in artifact yet; waiting...`);
				}
			} else if (qualityJob && qualityJob.state === 'completed') {
				log('  * Quality job completed but no notice_output artifact; giving up.');
				return undefined;
			}

			log(`  * Not ready yet, waiting ${POLL_INTERVAL_MS / 1000}s...`);
		} catch (err) {
			console.error(`[notice-elite] WARNING: poll attempt failed: ${err}`);
		}

		await new Promise(c => setTimeout(c, POLL_INTERVAL_MS));
	}

	return undefined;
}

async function main(): Promise<void> {
	installDiagnostics();

	// Feature flag = instant rollback. Default ON during the cutover validation;
	// set VSCODE_OVERWRITE_TPN=false to force the legacy mixin notice.
	if (process.env['VSCODE_OVERWRITE_TPN'] === 'false') {
		log('RESULT=disabled feature flag off (VSCODE_OVERWRITE_TPN=false); keeping legacy notice.');
		return;
	}

	const artifact = await waitForArtifact();
	if (!artifact) {
		log(`RESULT=fallback ${ARTIFACT_NAME} artifact unavailable within budget; keeping legacy notice.`);
		return;
	}

	const tmpDir = path.resolve('.build/tmp-notice');
	fs.rmSync(tmpDir, { recursive: true, force: true });
	fs.mkdirSync(tmpDir, { recursive: true });
	const artifactZipPath = path.join(tmpDir, 'notice_output.zip');

	log('Downloading notice_output artifact...');
	await retry(() => downloadArtifact(artifact, artifactZipPath));

	log('Extracting notice_output artifact...');
	const files = await unzip(artifactZipPath, tmpDir);
	const shipping = files.find(f => path.basename(f) === SHIPPING_NOTICE_NAME);

	if (!shipping) {
		log(`RESULT=fallback artifact present but ${SHIPPING_NOTICE_NAME} missing; keeping legacy notice.`);
		fs.rmSync(tmpDir, { recursive: true, force: true });
		return;
	}

	const size = fs.statSync(shipping).size;
	// Guard: a tiny file means the merge produced nothing usable. Keep legacy.
	if (size <= 1024) {
		log(`RESULT=fallback ${SHIPPING_NOTICE_NAME} too small (${size} bytes); keeping legacy notice.`);
		fs.rmSync(tmpDir, { recursive: true, force: true });
		return;
	}

	// Log provenance for legal traceability: which build/commit produced this NOTICE.
	const metaFile = files.find(f => path.basename(f) === 'notice-meta.txt');
	if (metaFile) {
		log('NOTICE provenance:');
		for (const line of fs.readFileSync(metaFile, 'utf8').split(/\r?\n/)) {
			if (line.trim()) {
				log(`    ${line}`);
			}
		}
	}

	const legacySize = fs.existsSync(TARGET_NOTICE) ? fs.statSync(TARGET_NOTICE).size : 0;
	fs.copyFileSync(shipping, TARGET_NOTICE);
	log(`RESULT=fresh overwrote ${TARGET_NOTICE} with CG NOTICE (${size} bytes; legacy was ${legacySize} bytes).`);

	fs.rmSync(tmpDir, { recursive: true, force: true });
}

main().catch(err => {
	// Non-fatal: log and exit 0 so packaging proceeds with the legacy notice.
	console.error('[notice-elite] Non-fatal error; keeping legacy notice:', err);
	process.exitCode = 0;
});
