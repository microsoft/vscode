"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
exports.main = void 0;
const fs = require("fs");
const path = require("path");
const stream_1 = require("stream");
const promises_1 = require("stream/promises");
const yauzl = require("yauzl");
function e(name) {
    const result = process.env[name];
    if (typeof result !== 'string') {
        throw new Error(`Missing env: ${name}`);
    }
    return result;
}
class State {
    statePath;
    set = new Set();
    constructor() {
        const pipelineWorkspacePath = e('PIPELINE_WORKSPACE');
        const previousState = fs.readdirSync(pipelineWorkspacePath)
            .map(name => /^artifacts_processed_(\d+)$/.exec(name))
            .filter((match) => !!match)
            .map(match => ({ name: match[0], attempt: Number(match[1]) }))
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
    get size() {
        return this.set.size;
    }
    has(name) {
        return this.set.has(name);
    }
    add(name) {
        this.set.add(name);
        fs.appendFileSync(this.statePath, `${name}\n`);
    }
    [Symbol.iterator]() {
        return this.set[Symbol.iterator]();
    }
}
async function getPipelineArtifacts() {
    const res = await fetch(`${e('BUILDS_API_URL')}artifacts?api-version=6.0`, { headers: { Authorization: `Bearer ${e('SYSTEM_ACCESSTOKEN')}` } });
    if (!res.ok) {
        throw new Error(`Failed to fetch artifacts: ${res.statusText}`);
    }
    const { value: artifacts } = await res.json();
    return artifacts.filter(a => /^vscode_/.test(a.name) && !/sbom$/.test(a.name));
}
async function getPipelineTimeline() {
    const res = await fetch(`${e('BUILDS_API_URL')}timeline?api-version=6.0`, { headers: { Authorization: `Bearer ${e('SYSTEM_ACCESSTOKEN')}` } });
    if (!res.ok) {
        throw new Error(`Failed to fetch artifacts: ${res.statusText}`);
    }
    const result = await res.json();
    return result;
}
async function downloadArtifact(artifact, downloadPath) {
    const res = await fetch(artifact.resource.downloadUrl, { headers: { Authorization: `Bearer ${e('SYSTEM_ACCESSTOKEN')}` } });
    if (!res.ok) {
        throw new Error(`Failed to download artifact: ${res.statusText}`);
    }
    const istream = stream_1.Readable.fromWeb(res.body);
    const ostream = fs.createWriteStream(downloadPath);
    await (0, promises_1.finished)(istream.pipe(ostream));
}
async function unzip(packagePath, outputPath) {
    return new Promise((resolve, reject) => {
        let lastFilePath;
        yauzl.open(packagePath, { lazyEntries: true }, (err, zipfile) => {
            if (err) {
                return reject(err);
            }
            zipfile.on('entry', async (entry) => {
                if (!/\/$/.test(entry.fileName)) {
                    await new Promise((resolve, reject) => {
                        zipfile.openReadStream(entry, async (err, istream) => {
                            if (err) {
                                return reject(err);
                            }
                            try {
                                const filePath = path.join(outputPath, entry.fileName);
                                await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
                                const ostream = fs.createWriteStream(filePath);
                                await (0, promises_1.finished)(istream.pipe(ostream));
                                lastFilePath = filePath;
                                resolve(undefined);
                            }
                            catch (err) {
                                reject(err);
                            }
                        });
                    });
                }
                zipfile.readEntry();
            });
            zipfile.on('end', () => resolve(lastFilePath));
            zipfile.readEntry();
        });
    });
}
async function main() {
    const state = new State();
    for (const name of state) {
        console.log(`Already processed artifact: ${name}`);
    }
    const stages = new Set();
    if (e('VSCODE_BUILD_STAGE_WINDOWS') === 'True') {
        stages.add('Windows');
    }
    if (e('VSCODE_BUILD_STAGE_LINUX') === 'True') {
        stages.add('Linux');
    }
    if (e('VSCODE_BUILD_STAGE_ALPINE') === 'True') {
        stages.add('Alpine');
    }
    if (e('VSCODE_BUILD_STAGE_MACOS') === 'True') {
        stages.add('macOS');
    }
    if (e('VSCODE_BUILD_STAGE_WEB') === 'True') {
        stages.add('Web');
    }
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
                    const { product, os, arch, type } = match.groups;
                    console.log('Publishing artifact:', { path: artifactPath, product, os, arch, type });
                    // TODO@joaomoreno! createasset
                    state.add(artifact.name);
                }
                catch (err) {
                    console.error(err);
                    continue;
                }
            }
        }
        const [timeline, artifacts2] = await Promise.all([getPipelineTimeline(), getPipelineArtifacts()]);
        const stagesCompleted = new Set();
        for (const record of timeline.records) {
            if (record.type === 'stage' && record.state === 'completed' && stages.has(record.name)) {
                stagesCompleted.add(record.name);
            }
        }
        if (stagesCompleted.size === stages.size && artifacts2.length === state.size) {
            break;
        }
        console.log('Known timeline record types', [...new Set(timeline.records.map(r => r.type))]);
        console.log('All stage timeline records', timeline.records.filter(r => r.type === 'stage'));
        console.log(`Stages completed: ${stagesCompleted.size}/${stages.size}`);
        console.log(`Artifacts processed: ${state.size}/${artifacts2.length}`);
        await new Promise(c => setTimeout(c, 10000));
    }
    console.log(`All ${state.size} artifacts published!`);
}
exports.main = main;
if (require.main === module) {
    const [] = process.argv.slice(2);
    main().then(() => {
        process.exit(0);
    }, err => {
        console.error(err);
        process.exit(1);
    });
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicHVibGlzaC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbInB1Ymxpc2gudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IjtBQUFBOzs7Z0dBR2dHOzs7QUFFaEcseUJBQXlCO0FBQ3pCLDZCQUE2QjtBQUM3QixtQ0FBa0M7QUFDbEMsOENBQTJDO0FBQzNDLCtCQUErQjtBQUUvQixTQUFTLENBQUMsQ0FBQyxJQUFZO0lBQ3RCLE1BQU0sTUFBTSxHQUFHLE9BQU8sQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLENBQUM7SUFFakMsSUFBSSxPQUFPLE1BQU0sS0FBSyxRQUFRLEVBQUUsQ0FBQztRQUNoQyxNQUFNLElBQUksS0FBSyxDQUFDLGdCQUFnQixJQUFJLEVBQUUsQ0FBQyxDQUFDO0lBQ3pDLENBQUM7SUFFRCxPQUFPLE1BQU0sQ0FBQztBQUNmLENBQUM7QUFFRCxNQUFNLEtBQUs7SUFFRixTQUFTLENBQVM7SUFDbEIsR0FBRyxHQUFHLElBQUksR0FBRyxFQUFVLENBQUM7SUFFaEM7UUFDQyxNQUFNLHFCQUFxQixHQUFHLENBQUMsQ0FBQyxvQkFBb0IsQ0FBQyxDQUFDO1FBQ3RELE1BQU0sYUFBYSxHQUFHLEVBQUUsQ0FBQyxXQUFXLENBQUMscUJBQXFCLENBQUM7YUFDekQsR0FBRyxDQUFDLElBQUksQ0FBQyxFQUFFLENBQUMsNkJBQTZCLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFDO2FBQ3JELE1BQU0sQ0FBQyxDQUFDLEtBQUssRUFBNEIsRUFBRSxDQUFDLENBQUMsQ0FBQyxLQUFLLENBQUM7YUFDcEQsR0FBRyxDQUFDLEtBQUssQ0FBQyxFQUFFLENBQUMsQ0FBQyxFQUFFLElBQUksRUFBRSxLQUFNLENBQUMsQ0FBQyxDQUFDLEVBQUUsT0FBTyxFQUFFLE1BQU0sQ0FBQyxLQUFNLENBQUMsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUM7YUFDL0QsSUFBSSxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsRUFBRSxFQUFFLENBQUMsQ0FB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