/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import fs from 'fs';
import debug from 'debug';
import path from 'path';
import { downloadArtifact } from '@electron/get';
import productJson from '../../product.json';

interface ProductConfiguration {
	quality?: string;
	[key: string]: unknown;
}

const product: ProductConfiguration = productJson;

const d = debug('explorer-dll-fetcher');

export async function downloadExplorerDll(outDir: string, quality: string = 'stable', targetArch: string = 'x64'): Promise<void> {
	const fileNamePrefix = quality === 'insider' ? 'code_insider' : 'code';
	const fileName = `${fileNamePrefix}_explorer_command_${targetArch}.dll`;

	if (!await fs.existsSync(outDir)) {
		await fs.mkdirSync(outDir, { recursive: true });
	}

	// Read and parse checksums file
	const checksumsFilePath = path.join(path.dirname(__dirname), 'checksums', 'explorer-dll.txt');
	const checksumsContent = fs.readFileSync(checksumsFilePath, 'utf8');
	const checksums: Record<string, string> = {};

	checksumsContent.split('\n').forEach(line => {
		const trimmedLine = line.trim();
		if (trimmedLine) {
			const [checksum, filename] = trimmedLine.split(/\s+/);
			if (checksum && filename) {
				checksums[filename] = checksum;
			}
		}
	});

	d(`downloading ${fileName}`);
	const artifact = await downloadArtifact({
		isGeneric: true,
		version: 'v4.0.0-355426',
		artifactName: fileName,
		checksums,
		mirrorOptions: {
			mirror: 'https://github.com/microsoft/vscode-explorer-command/releases/download/',
			customDir: 'v4.0.0-355426',
			customFilename: fileName
		}
	});

	d(`moving ${artifact} to ${outDir}`);
	await fs.copyFileSync(artifact, path.join(outDir, fileName));
}

async function main(outputDir?: string): Promise<void> {
	const arch = process.env['VSCODE_ARCH'];

	if (!outputDir) {
		throw new Error('Required build env not set');
	}

	await downloadExplorerDll(outputDir, product.quality, arch);
}

if (require.main === module) {
	main(process.argv[2]).catch(err => {
		console.error(err);
		process.exit(1);
	});
}
