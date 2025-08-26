import path from 'path';
import * as vscode from 'vscode';
import { readFile } from 'fs';

type CoversionErrorMsg = {
	status: 'error';
	message: string;
};

export function activate(context: vscode.ExtensionContext) {
	context.subscriptions.push(
		vscode.commands.registerCommand(
			'erdosNotebookHelpers.convertImageToBase64',
			async (imageSrc: string, baseLoc: string) => new Promise<string | CoversionErrorMsg>((resolve) => {
				const fullImagePath = path.join(baseLoc, imageSrc);
				const fileExtension = path.extname(imageSrc).slice(1);
				const mimeType = mimeTypeMap[fileExtension.toLowerCase()];
				if (!mimeType) {
					resolve({
						status: 'error',
						message: `Unsupported file type: "${fileExtension}."`,
					});
					return;
				}
				try {
					readFile(fullImagePath, (err, data) => {
						if (err) {
							resolve({
								status: 'error',
								message: err.message,
							});
						} else if (!data) {
							resolve({
								status: 'error',
								message: `No data found in file "${fullImagePath}."`,
							});
						} else {
							resolve(`data:${mimeType};base64,${data.toString('base64')}`);
						}
					});
				} catch (e) {
					return {
						type: 'error',
						message: e instanceof Error ? e.message : `Error occured while converting image ${fullImagePath} to base64.`,
					};
				}
			})
		)
	);
}

const mimeTypeMap: Record<string, string> = {
	png: 'image/png',
	apng: 'image/apng',
	avif: 'image/avif',
	ico: 'image/vnd.microsoft.icon',
	jpeg: 'image/jpeg',
	jpg: 'image/jpeg',
	gif: 'image/gif',
	bmp: 'image/bmp',
	webp: 'image/webp',
	svg: 'image/svg+xml',
	tiff: 'image/tiff',
	tif: 'image/tiff',
};

