/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Coder Technologies. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fs from 'fs';
import * as path from 'path';
import * as tarStream from 'tar-stream';
import * as util from 'util';
import { CancellationToken } from 'vs/base/common/cancellation';
import * as vszip from 'vs/base/node/zip';
import * as nls from 'vs/nls';
import product from 'vs/platform/product/common/product';
import { IProductConfiguration } from 'vs/workbench/workbench.web.api';

// We will be overriding these, so keep a reference to the original.
const vszipExtract = vszip.extract;
const vszipBuffer = vszip.buffer;

export const tar = async (tarPath: string, files: vszip.IFile[]): Promise<string> => {
	const pack = tarStream.pack();
	const chunks: Buffer[] = [];
	const ended = new Promise<Buffer>((resolve) => {
		pack.on('end', () => resolve(Buffer.concat(chunks)));
	});
	pack.on('data', (chunk: Buffer) => chunks.push(chunk));
	for (let i = 0; i < files.length; i++) {
		const file = files[i];
		pack.entry({ name: file.path }, file.contents);
	}
	pack.finalize();
	await util.promisify(fs.writeFile)(tarPath, await ended);
	return tarPath;
};

export const extract = async (archivePath: string, extractPath: string, options: vszip.IExtractOptions = {}, token: CancellationToken): Promise<void> => {
	try {
		await extractTar(archivePath, extractPath, options, token);
	} catch (error) {
		if (error.toString().includes('Invalid tar header')) {
			await vszipExtract(archivePath, extractPath, options, token);
		}
	}
};

export const buffer = (targetPath: string, filePath: string): Promise<Buffer> => {
	return new Promise<Buffer>(async (resolve, reject) => {
		try {
			let done: boolean = false;
			await extractAssets(targetPath, new RegExp(filePath), (assetPath: string, data: Buffer) => {
				if (path.normalize(assetPath) === path.normalize(filePath)) {
					done = true;
					resolve(data);
				}
			});
			if (!done) {
				throw new Error('couldn\'t find asset ' + filePath);
			}
		} catch (error) {
			if (error.toString().includes('Invalid tar header')) {
				vszipBuffer(targetPath, filePath).then(resolve).catch(reject);
			} else {
				reject(error);
			}
		}
	});
};

const extractAssets = async (tarPath: string, match: RegExp, callback: (path: string, data: Buffer) => void): Promise<void> => {
	return new Promise<void>((resolve, reject): void => {
		const extractor = tarStream.extract();
		const fail = (error: Error) => {
			extractor.destroy();
			reject(error);
		};
		extractor.once('error', fail);
		extractor.on('entry', async (header, stream, next) => {
			const name = header.name;
			if (match.test(name)) {
				extractData(stream).then((data) => {
					callback(name, data);
					next();
				}).catch(fail);
			} else {
				stream.on('end', () => next());
				stream.resume(); // Just drain it.
			}
		});
		extractor.on('finish', resolve);
		fs.createReadStream(tarPath).pipe(extractor);
	});
};

const extractData = (stream: NodeJS.ReadableStream): Promise<Buffer> => {
	return new Promise((resolve, reject): void => {
		const fileData: Buffer[] = [];
		stream.on('error', reject);
		stream.on('end', () => resolve(Buffer.concat(fileData)));
		stream.on('data', (data) => fileData.push(data));
	});
};

const extractTar = async (tarPath: string, targetPath: string, options: vszip.IExtractOptions = {}, token: CancellationToken): Promise<void> => {
	return new Promise<void>((resolve, reject): void => {
		const sourcePathRegex = new RegExp(options.sourcePath ? `^${options.sourcePath}` : '');
		const extractor = tarStream.extract();
		const fail = (error: Error) => {
			extractor.destroy();
			reject(error);
		};
		extractor.once('error', fail);
		extractor.on('entry', async (header, stream, next) => {
			const nextEntry = (): void => {
				stream.on('end', () => next());
				stream.resume();
			};

			const rawName = path.normalize(header.name);
			if (token.isCancellationRequested || !sourcePathRegex.test(rawName)) {
				return nextEntry();
			}

			const fileName = rawName.replace(sourcePathRegex, '');
			const targetFileName = path.join(targetPath, fileName);
			if (/\/$/.test(fileName)) {
				/*
					NOTE:@coder: they removed mkdirp in favor of fs.promises
					See commit: https://github.com/microsoft/vscode/commit/a0d76bb9834b63a02fba8017a6306511fe1ab4fe#diff-2bf233effbb62ea789bb7c4739d222a43ccd97ed9f1219f75bb07e9dee91c1a7
					3/11/21 @jsjoeio
				*/
				return fs.promises.mkdir(targetFileName, { recursive: true }).then(nextEntry);
			}

			const dirName = path.dirname(fileName);
			const targetDirName = path.join(targetPath, dirName);
			if (targetDirName.indexOf(targetPath) !== 0) {
				return fail(new Error(nls.localize('invalid file', 'Error extracting {0}. Invalid file.', fileName)));
			}

			/*
				NOTE:@coder: they removed mkdirp in favor of fs.promises
				See commit: https://github.com/microsoft/vscode/commit/a0d76bb9834b63a02fba8017a6306511fe1ab4fe#diff-2bf233effbb62ea789bb7c4739d222a43ccd97ed9f1219f75bb07e9dee91c1a7
				3/11/21 @jsjoeio
			*/
			await fs.promises.mkdir(targetDirName, { recursive: true });

			const fstream = fs.createWriteStream(targetFileName, { mode: header.mode });
			fstream.once('close', () => next());
			fstream.once('error', fail);
			stream.pipe(fstream);
		});
		extractor.once('finish', resolve);
		fs.createReadStream(tarPath).pipe(extractor);
	});
};

/**
 * Override original functionality so we can use a custom marketplace with
 * either tars or zips.
 */
export const enableCustomMarketplace = (): void => {
	const extensionsGallery: IProductConfiguration['extensionsGallery'] = {
		serviceUrl: process.env.SERVICE_URL || 'https://extensions.coder.com/api',
		itemUrl: process.env.ITEM_URL || '',
		controlUrl: '',
		recommendationsUrl: '',
		...(product.extensionsGallery || {}),
	};

	// Workaround for readonly property.
	Object.assign(product, { extensionsGallery });

	const target = vszip as typeof vszip;

	target.zip = tar;
	target.extract = extract;
	target.buffer = buffer;
};
