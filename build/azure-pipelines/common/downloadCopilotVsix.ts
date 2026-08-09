/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import fs from 'fs';
import path from 'path';
import { Readable } from 'stream';
import type { ReadableStream } from 'stream/web';
import { pipeline } from 'node:stream/promises';
import yauzl from 'yauzl';
import { type Artifact, e, requestAZDOAPI } from './publish.ts';
import { retry } from './retry.ts';

const ARTIFACT_NAME = 'copilot_vsix';
const COPILOT_JOB_NAME = 'Copilot';

interface TimelineRecord {
	readonly name: string;
	readonly type: string;
	readonly state: string;
	readonly result: string;
}

interface Timeline {
	readonly records: TimelineRecord[];
}

function log(message: string): void {
	console.log(`[${new Date().toISOString()}] ${message}`);
}

/**
 * Installs process-level diagnostic handlers so that, when this script runs detached
 * via `deemon`, an abnormal termination still leaves a trace in the captured output.
 * Without these, a crash or a received signal can surface only as an opaque daemon
 * exit code (e.g. `0xDEAD`) with no indication of the cause.
 */
function installDiagnostics(): void {
	process.on('uncaughtException', err => {
		console.error('[downloadCopilotVsix] Uncaught exception:', err);
		process.exit(1);
	});
	process.on('unhandledRejection', reason => {
		console.error('[downloadCopilotVsix] Unhandled rejection:', reason);
		process.exit(1);
	});
	for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP', 'SIGBREAK'] as const) {
		process.on(signal, () => {
			console.error(`[downloadCopilotVsix] Received ${signal}, exiting.`);
			process.exit(1);
		});
	}
	process.on('exit', code => log(`Process exiting with code ${code}.`));
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
	return result.value.filter(a => !/sbom$/.test(a.name));
}

async function getPipelineTimeline(): Promise<Timeline> {
	return await requestAZDOAPI<Timeline>('timeline');
}

async function getCopilotJob(): Promise<TimelineRecord | undefined> {
	const timeline = await retry(() => getPipelineTimeline());
	return timeline.records.find(r => r.type === 'Job' && r.name === COPILOT_JOB_NAME);
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

						// Unix file mode is stored in the upper 16 bits of externalFileAttributes.
						// Preserve it so executables like node-pty's spawn-helper stay executable.
						const mode = (entry.externalFileAttributes >>> 16) & 0o777;
						const ostream = fs.createWriteStream(filePath, mode ? { mode } : undefined);
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

async function waitForArtifact(): Promise<Artifact> {
	const startTime = Date.now();

	for (let index = 0; index < 60; index++) {
		const elapsed = Math.round((Date.now() - startTime) / 1000);

		try {
			log(`Waiting for Copilot VSIX artifact to be uploaded (attempt ${index + 1}/60, ${elapsed}s elapsed)...`);

			// Check the Copilot job status so we can abort early if it failed
			log('  * Checking Copilot job status...');
			const copilotJob = await getCopilotJob();
			if (copilotJob) {
				log(`  * Copilot job status: state=${copilotJob.state}, result=${copilotJob.result ?? 'n/a'}`);
				if (copilotJob.state === 'completed' && copilotJob.result !== 'succeeded' && copilotJob.result !== 'succeededWithIssues') {
					throw new Error(`Copilot job failed (result=${copilotJob.result}). Aborting.`);
				}
			} else {
				log('  * Copilot job not found in timeline yet');
			}

			log('  * Fetching pipeline artifacts...');
			const allArtifacts = await retry(() => getPipelineArtifacts());
			log(`  * Found ${allArtifacts.length} artifact(s): ${allArtifacts.map(a => a.name).join(', ') || '(none)'}`);

			const artifact = allArtifacts.find(a => a.name === ARTIFACT_NAME);
			if (artifact) {
				log('  * Copilot VSIX artifact found');
				return artifact;
			}

			log('  * Not found yet, waiting 30s...');
		} catch (err) {
			if (err instanceof Error && err.message.includes('Copilot job failed')) {
				throw err;
			}
			console.error(`WARNING: Failed to check for artifact: ${err}`);
		}

		await new Promise(c => setTimeout(c, 30_000));
	}

	throw new Error('Copilot VSIX artifact was not uploaded within 30 minutes.');
}

async function main(): Promise<void> {
	installDiagnostics();

	const outputDir = path.resolve('.build/extensions/copilot');

	log('Waiting for Copilot VSIX artifact...');
	const artifact = await waitForArtifact();

	// Download the artifact (a zip containing the VSIX)
	const tmpDir = path.resolve('.build/tmp-copilot');
	fs.mkdirSync(tmpDir, { recursive: true });
	const artifactZipPath = path.join(tmpDir, 'artifact.zip');

	console.log('Downloading Copilot VSIX artifact...');
	await retry(() => downloadArtifact(artifact, artifactZipPath));

	// Extract the artifact zip to get the VSIX file
	console.log('Extracting artifact zip...');
	const artifactFiles = await unzip(artifactZipPath, tmpDir);
	const vsixFile = artifactFiles.find(f => f.endsWith('.vsix'));

	if (!vsixFile) {
		throw new Error('No .vsix file found in the Copilot artifact');
	}

	console.log(`Found VSIX: ${vsixFile}`);

	// Extract the VSIX (which is also a zip) to the output directory
	// VSIX files contain an 'extension/' folder with the actual extension files
	console.log(`Extracting VSIX to ${outputDir}...`);
	fs.rmSync(outputDir, { recursive: true, force: true });
	fs.mkdirSync(outputDir, { recursive: true });

	const vsixTmpDir = path.join(tmpDir, 'vsix-contents');
	fs.mkdirSync(vsixTmpDir, { recursive: true });

	await unzip(vsixFile, vsixTmpDir);

	// Move extension/ contents to the output directory
	const extensionDir = path.join(vsixTmpDir, 'extension');
	if (!fs.existsSync(extensionDir)) {
		throw new Error('VSIX does not contain an extension/ directory');
	}

	// Copy all files from extension/ to outputDir
	copyDirSync(extensionDir, outputDir);

	// Cleanup
	fs.rmSync(tmpDir, { recursive: true, force: true });

	console.log('Copilot VSIX successfully extracted to .build/extensions/copilot/');
}

function copyDirSync(src: string, dest: string): void {
	fs.mkdirSync(dest, { recursive: true });
	const entries = fs.readdirSync(src, { withFileTypes: true });
	for (const entry of entries) {
		const srcPath = path.join(src, entry.name);
		const destPath = path.join(dest, entry.name);
		if (entry.isDirectory()) {
			copyDirSync(srcPath, destPath);
		} else {
			fs.copyFileSync(srcPath, destPath);
		}
	}
}

main().catch(err => {
	console.error('[downloadCopilotVsix] Fatal error:', err);
	process.exitCode = 1;
});
