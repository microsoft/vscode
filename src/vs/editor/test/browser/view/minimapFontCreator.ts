/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { Constants, MinimapCharRenderer } from 'vs/editor/common/view/minimapCharRenderer';
import { MinimapCharRendererFactory } from 'vs/editor/test/common/view/minimapCharRendererFactory';
import { getOrCreateMinimapCharRenderer } from 'vs/editor/common/view/runtimeMinimapCharRenderer';
import { RGBA } from 'vs/base/common/color';

let canvas = <HTMLCanvasElement>document.getElementById('my-canvas');
let ctx = canvas.getContext('2d');

canvas.style.height = 100 + 'px';
canvas.height = 100;

canvas.width = Constants.CHAR_COUNT * Constants.SAMPLED_CHAR_WIDTH;
canvas.style.width = (Constants.CHAR_COUNT * Constants.SAMPLED_CHAR_WIDTH) + 'px';

ctx.fillStyle = '#ffffff';
ctx.font = 'bold 16px monospace';
for (let chCode = Constants.START_CH_CODE; chCode <= Constants.END_CH_CODE; chCode++) {
	ctx.fillText(String.fromCharCode(chCode), (chCode - Constants.START_CH_CODE) * Constants.SAMPLED_CHAR_WIDTH, Constants.SAMPLED_CHAR_HEIGHT);
}

let sampleData = ctx.getImageData(0, 4, Constants.SAMPLED_CHAR_WIDTH * Constants.CHAR_COUNT, Constants.SAMPLED_CHAR_HEIGHT);
let minimapCharRenderer = MinimapCharRendererFactory.create(sampleData.data);

renderImageData(sampleData, 10, 100);
renderMinimapCharRenderer(minimapCharRenderer, 400);
renderMinimapCharRenderer(getOrCreateMinimapCharRenderer(), 600);

function createFakeImageData(width: number, height: number): ImageData {
	return {
		width: width,
		height: height,
		data: new Uint8ClampedArray(width * height * Constants.RGBA_CHANNELS_CNT)
	};
}

function renderMinimapCharRenderer(minimapCharRenderer: MinimapCharRenderer, y: number): void {

	let background = new RGBA(0, 0, 0, 255);
	let color = new RGBA(255, 255, 255, 255);

	{
		let x2 = createFakeImageData(Constants.x2_CHAR_WIDTH * Constants.CHAR_COUNT, Constants.x2_CHAR_HEIGHT);
		// set the background color
		for (let i = 0, len = x2.data.length / 4; i < len; i++) {
			x2.data[4 * i + 0] = background.r;
			x2.data[4 * i + 1] = background.g;
			x2.data[4 * i + 2] = background.b;
			x2.data[4 * i + 3] = 255;
		}
		let dx = 0;
		for (let chCode = Constants.START_CH_CODE; chCode <= Constants.END_CH_CODE; chCode++) {
			minimapCharRenderer.x2RenderChar(x2, dx, 0, chCode, color, background, false);
			dx += Constants.x2_CHAR_WIDTH;
		}
		renderImageData(x2, 10, y);
	}
	{
		let x1 = createFakeImageData(Constants.x1_CHAR_WIDTH * Constants.CHAR_COUNT, Constants.x1_CHAR_HEIGHT);
		// set the background color
		for (let i = 0, len = x1.data.length / 4; i < len; i++) {
			x1.data[4 * i + 0] = background.r;
			x1.data[4 * i + 1] = background.g;
			x1.data[4 * i + 2] = background.b;
			x1.data[4 * i + 3] = 255;
		}
		let dx = 0;
		for (let chCode = Constants.START_CH_CODE; chCode <= Constants.END_CH_CODE; chCode++) {
			minimapCharRenderer.x1RenderChar(x1, dx, 0, chCode, color, background, false);
			dx += Constants.x1_CHAR_WIDTH;
		}
		renderImageData(x1, 10, y + 100);
	}
}

(function () {
	let r = 'let x2Data = [', offset = 0;
	for (let charIndex = 0; charIndex < Constants.CHAR_COUNT; charIndex++) {
		let charCode = charIndex + Constants.START_CH_CODE;
		r += '\n\n// ' + String.fromCharCode(charCode);

		for (let i = 0; i < Constants.x2_CHAR_HEIGHT * Constants.x2_CHAR_WIDTH; i++) {
			if (i % 2 === 0) {
				r += '\n';
			}
			r += minimapCharRenderer.x2charData[offset] + ',';
			offset++;
		}

	}
	r += '\n\n]';
	console.log(r);
})();

(function () {
	let r = 'let x1Data = [', offset = 0;
	for (let charIndex = 0; charIndex < Constants.CHAR_COUNT; charIndex++) {
		let charCode = charIndex + Constants.START_CH_CODE;
		r += '\n\n// ' + String.fromCharCode(charCode);

		for (let i = 0; i < Constants.x1_CHAR_HEIGHT * Constants.x1_CHAR_WIDTH; i++) {
			r += '\n';
			r += minimapCharRenderer.x1charData[offset] + ',';
			offset++;
		}

	}
	r += '\n\n]';
	console.log(r);
})();



function renderImageData(imageData: ImageData, left: number, top: number): void {
	let output = '';
	var offset = 0;
	var PX_SIZE = 15;
	for (var i = 0; i < imageData.height; i++) {
		for (var j = 0; j < imageData.width; j++) {
			var R = imageData.data[offset];
			var G = imageData.data[offset + 1];
			var B = imageData.data[offset + 2];
			var A = imageData.data[offset + 3];
			offset += 4;

			output += `<div style="position:absolute;top:${PX_SIZE * i}px;left:${PX_SIZE * j}px;width:${PX_SIZE}px;height:${PX_SIZE}px;background:rgba(${R},${G},${B},${A / 256})"></div>`;
		}
	}

	var domNode = document.createElement('div');
	domNode.style.position = 'absolute';
	domNode.style.top = top + 'px';
	domNode.style.left = left + 'px';
	domNode.style.width = (imageData.width * PX_SIZE) + 'px';
	domNode.style.height = (imageData.height * PX_SIZE) + 'px';
	domNode.style.border = '1px solid #ccc';
	domNode.style.background = '#000000';
	domNode.innerHTML = output;
	document.body.appendChild(domNode);
}
