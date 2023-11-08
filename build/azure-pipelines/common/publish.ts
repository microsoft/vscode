/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fs from 'fs';
import * as path from 'path';
import { Readable } from 'stream';
import { finished } from 'stream/promises';
import * as yauzl from 'yauzl';

function e(name: string): string {
	const result = process.env[name];

	if (typeof result !== 'string') {
		throw new Error(`Missing env: ${name}`);
	}

	return result;
}

class State {

	private statePath: string;
	private set = new Set<string>();

	constructor() {
		const pipelineWorkspacePath = e('PIPELINE_WORKSPACE');
		const previousState = fs.readdirSync(pipelineWorkspacePath)
			.map(name => /^artifacts_processed_(\d+)$/.exec(name))
			.filter((match): match is RegExpExecArray => !!match)
			.map(match => ({ name: match![0], attempt: Number(match![1]) }))
			.sort((a, b) => b.attempt - a.attempt)[0];

		if (previousState) {
			const previousStatePath = path.join(pipelineWorkspacePath, previousState.name, previousState.name + '.txt');
			fs.readFileSync(previousStatePath, 'utf8').split(/\n/).forEach(name => this.set.add(name));
		}

		const stageAttempt = e('SYSTEM_STAGEATTEMPT');
		this.statePath = path.join(pipelineWorkspacePath, `artifacts_processed_${stageAttempt}`, `artifacts_processed_${stageAttempt}.txt`);
		fs.mkdirSync(path.dirname(this.statePath), { recursive: true });
		fs.writeFileSync(this.statePath, [...this.set.values()].join('\n'));
	}

	get size(): number {
		return this.set.size;
	}

	has(name: string): boolean {
		return this.set.has(name);
	}

	add(name: string): void {
		this.set.add(name);
		fs.appendFileSync(this.statePath, `${name}\n`);
	}

	[Symbol.iterator](): IterableIterator<string> {
		return this.set[Symbol.iterator]();
	}
}

interface Artifact {
	readonly name: string;
	readonly resource: {
		readonly downloadUrl: string;
		readonly properties: {
			readonly artifactsize: number;
		};
	};
}

async function getPipelineArtifacts(): Promise<Artifact[]> {
	const res = await fetch(`${e('BUILDS_API_URL')}artifacts?api-version=6.0`, { headers: { Authorization: `Bearer ${e('SYSTEM_ACCESSTOKEN')}` } });

	if (!res.ok) {
		throw new Error(`Failed to fetch artifacts: ${res.statusText}`);
	}

	const { value: artifacts } = await res.json() as { readonly value: Artifact[] };
	return artifacts.filter(a => /^vscode_/.test(a.name) && !/sbom$/.test(a.name));
}

interface TimelineRecord {
	readonly name: string;
	readonly type: string;
	readonly state: string;
}

interface Timeline {
	readonly records: TimelineRecord[];
}

async function getPipelineTimeline(): Promise<Timeline> {
	const res = await fetch(`${e('BUILDS_API_URL')}timeline?api-version=6.0`, { headers: { Authorization: `Bearer ${e('SYSTEM_ACCESSTOKEN')}` } });

	if (!res.ok) {
		throw new Error(`Failed to fetch artifacts: ${res.statusText}`);
	}

	const result = await res.json() as Timeline;
	return result;
}

async function downloadArtifact(artifact: Artifact, downloadPath: string): Promise<void> {
	const res = await fetch(artifact.resource.downloadUrl, { headers: { Authorization: `Bearer ${e('SYSTEM_ACCESSTOKEN')}` } });

	if (!res.ok) {
		throw new Error(`Failed to download artifact: ${res.statusText}`);
	}

	const istream = Readable.fromWeb(res.body as any);
	const ostream = fs.createWriteStream(downloadPath);
	await finished(istream.pipe(ostream));
}

async function unzip(packagePath: string, outputPath: string): Promise<string> {
	return new Promise((resolve, reject) => {
		let lastFilePath: string | undefined;

		yauzl.open(packagePath, { lazyEntries: true }, (err, zipfile) => {
			if (err) {
				return reject(err);
			}

			zipfile!.on('entry', async entry => {
				if (!/\/$/.test(entry.fileName)) {
					await new Promise((resolve, reject) => {
						zipfile!.openReadStream(entry, async (err, istream) => {
							if (err) {
								return reject(err);
							}

							try {
								const filePath = path.join(outputPath, entry.fileName);
								await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
								const ostream = fs.createWriteStream(filePath);
								await finished(istream!.pipe(ostream));
								lastFilePath = filePath;
								resolve(undefined);
							} catch (err) {
								reject(err);
							}
						});
					});
				}

				zipfile!.readEntry();
			});

			zipfile!.on('end', () => resolve(lastFilePath!));
			zipfile!.readEntry();
		});
	});
}

export async function main() {
	const state = new State();

	for (const name of state) {
		console.log(`Already processed artifact: ${name}`);
	}

	const stages = new Set<string>();
	if (e('VSCODE_BUILD_STAGE_WINDOWS') === 'True') { stages.add('Windows'); }
	if (e('VSCODE_BUILD_STAGE_LINUX') === 'True') { stages.add('Linux'); }
	if (e('VSCODE_BUILD_STAGE_ALPINE') === 'True') { stages.add('Alpine'); }
	if (e('VSCODE_BUILD_STAGE_MACOS') === 'True') { stages.add('macOS'); }
	if (e('VSCODE_BUILD_STAGE_WEB') === 'True') { stages.add('Web'); }

	while (true) {
		const artifacts = await getPipelineArtifacts();

		for (const artifact of artifacts) {
			if (!state.has(artifact.name)) {
				const match = /^vscode_(?<product>[^_]+)_(?<os>[^_]+)_(?<arch>[^_]+)_(?<type>[^_]+)$/.exec(artifact.name);

				if (!match) {
					console.warn('Invalid artifact name:', artifact.name);
					continue;
				}

				try {
					console.log(`Processing ${artifact.name} (${artifact.resource.downloadUrl})`);

					const artifactZipPath = path.join(e('AGENT_TEMPDIRECTORY'), `${artifact.name}.zip`);
					console.log(`Downloading artifact...`);
					await downloadArtifact(artifact, artifactZipPath);

					console.log(`Extracting artifact...`);
					const artifactPath = await unzip(artifactZipPath, e('AGENT_TEMPDIRECTORY'));
					const artifactSize = fs.statSync(artifactPath).size;

					if (artifactSize !== Number(artifact.resource.properties.artifactsize)) {
						throw new Error(`Artifact size mismatch. Expected ${artifact.resource.properties.artifactsize}. Actual ${artifactSize}`);
					}

					const { product, os, arch, type } = match.groups!;
					console.log('Publishing artifact:', { path: artifactPath, product, os, arch, type });

					// TODO@joaomoreno! createasset

					state.add(artifact.name);
				} catch (err) {
					console.error(err);
					continue;
				}
			}
		}

		const timeline = await getPipelineTimeline();
		console.log(timeline);

		const stagesCompleted = new Set<string>();

		for (const record of timeline.records) {
			if (record.type === 'stage' && record.state === 'completed' && stages.has(record.name)) {
				stagesCompleted.add(record.name);
			}
		}

		const artifacts2 = await getPipelineArtifacts();
		console.log(artifacts2);

		if (stagesCompleted.size === stages.size && artifacts2.length === state.size) {
			break;
		}

		console.log(`Stages completed: ${stagesCompleted.size}/${stages.size}`);
		console.log(`Artifacts processed: ${state.size}/${artifacts2.length}`);

		await new Promise(c => setTimeout(c, 10_000));
	}

	console.log(`All ${state.size} artifacts published!`);
}

if (require.main === module) {
	const [] = process.argv.slice(2);

	main().then(() => {
		process.exit(0);
	}, err => {
		console.error(err);
		process.exit(1);
	});
}
