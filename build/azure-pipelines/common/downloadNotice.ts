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
import { type Artifact, e, requestAZDOAPI } from './publish.ts';
import { retry } from './retry.ts';

const ARTIFACT_NAME = 'notice_output';
const QUALITY_JOB_NAMES = ['Quality Checks', 'Quality'];
// The merged, shipping NOTICE (CG + scanned extension licenses + cglicenses overrides).
const SHIPPING_NOTICE_NAME = 'ThirdPartyNotices.new.txt';
const TARGET_NOTICE = path.resolve('ThirdPartyNotices.txt');

// Short poll budget: 15 attempts x 30s = 7.5 minutes. Deliberately far below the
// copilot 30min so a never-produced artifact degrades to fallback quickly, but
// long enough to outlast the parallel Quality stage (CG + scan + merge).
const POLL_ATTEMPTS = 15;
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

async function getPipelineArtifacts(): Promise<Artifact[]> {
	const result = await requestAZDOAPI<{ readonly value: Artifact[] }>('artifacts');
	return result.value;
}

async function getQualityJob(): Promise<TimelineRecord | undefined> {
	const timeline = await retry(() => requestAZDOAPI<Timeline>('timeline'));
	return timeline.records.find(r => r.type === 'Job' && QUALITY_JOB_NAMES.includes(r.name));
}

async function downloadArtifact(artifact: Artifact, downloadPath: string): Promise<void> {
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
async function waitForArtifact(): Promise<Artifact | undefined> {
	const startTime = Date.now();

	for (let index = 0; index < POLL_ATTEMPTS; index++) {
		const elapsed = Math.round((Date.now() - startTime) / 1000);

		try {
			log(`Waiting for ${ARTIFACT_NAME} artifact (attempt ${index + 1}/${POLL_ATTEMPTS}, ${elapsed}s elapsed)...`);

			// Best-effort: if the Quality job has completed and clearly failed,
			// stop early -- the artifact is not coming. continueOnError steps in
			// the Quality stage mean a "failed" job can still upload the artifact,
			// so we only bail on a hard, completed failure.
			const qualityJob = await getQualityJob().catch(() => undefined);
			if (qualityJob) {
				log(`  * Quality job: state=${qualityJob.state}, result=${qualityJob.result ?? 'n/a'}`);
			}

			const allArtifacts = await retry(() => getPipelineArtifacts());
			log(`  * Found ${allArtifacts.length} artifact(s): ${allArtifacts.map(a => a.name).join(', ') || '(none)'}`);

			const artifact = allArtifacts.find(a => a.name === ARTIFACT_NAME);
			if (artifact) {
				// IMPORTANT: the notice_output artifact is populated in TWO phases by
				// two different Quality-stage steps -- first generated.txt + meta, then
				// (seconds later) the shipping ThirdPartyNotices.new.txt. The artifact
				// NAME appears after phase 1, so we must NOT accept it until the Quality
				// job has COMPLETED, otherwise we race and download before .new.txt lands.
				if (qualityJob && qualityJob.state === 'completed') {
					log('  * notice_output artifact found and Quality job completed');
					return artifact;
				}
				log('  * notice_output found but Quality job still running (uploads may be incomplete); waiting...');
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
