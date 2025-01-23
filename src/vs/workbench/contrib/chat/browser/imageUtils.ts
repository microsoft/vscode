/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/


/**
 * Resizes an image provided as a UInt8Array string. Resizing is based on Open AI's algorithm for tokenzing images.
 * https://platform.openai.com/docs/guides/vision#calculating-costs
 * @param data - The UInt8Array string of the image to resize.
 * @returns A promise that resolves to the UInt8Array string of the resized image.
 */

export async function resizeImage(data: Uint8Array): Promise<Uint8Array> {
	const blob = new Blob([data]);
	const img = new Image();
	const url = URL.createObjectURL(blob);
	img.src = url;

	return new Promise((resolve, reject) => {
		img.onload = () => {
			URL.revokeObjectURL(url);
			let { width, height } = img;

			// Calculate the new dimensions while maintaining the aspect ratio
			if (width > 2048 || height > 2048) {
				const scaleFactor = 2048 / Math.max(width, height);
				width = Math.round(width * scaleFactor);
				height = Math.round(height * scaleFactor);
			} else {
				resolve(data);
				return;
			}

			const scaleFactor = 768 / Math.min(width, height);
			width = Math.round(width * scaleFactor);
			height = Math.round(height * scaleFactor);

			const canvas = document.createElement('canvas');
			canvas.width = width;
			canvas.height = height;
			const ctx = canvas.getContext('2d');
			if (ctx) {
				ctx.drawImage(img, 0, 0, width, height);
				canvas.toBlob((blob) => {
					if (blob) {
						const reader = new FileReader();
						reader.onload = () => {
							resolve(new Uint8Array(reader.result as ArrayBuffer));
						};
						reader.onerror = (error) => reject(error);
						reader.readAsArrayBuffer(blob);
					} else {
						reject(new Error('Failed to create blob from canvas'));
					}
				}, 'image/png');
			} else {
				reject(new Error('Failed to get canvas context'));
			}
		};
		img.onerror = (error) => {
			URL.revokeObjectURL(url);
			reject(error);
		};
	});
}
