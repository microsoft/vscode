/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { Constants, MinimapCharRenderer } from 'vs/editor/common/view/minimapCharRenderer';
import { MinimapCharRendererFactory } from 'vs/editor/test/common/view/minimapCharRendererFactory';
import { createMinimapCharRenderer } from 'vs/editor/common/view/runtimeMinimapCharRenderer';

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

renderImageData(sampleData.data, sampleData.width, sampleData.height, 10, 100);
renderMinimapCharRenderer(minimapCharRenderer, 400);
renderMinimapCharRenderer(createMinimapCharRenderer(), 600);

function renderMinimapCharRenderer(minimapCharRenderer: MinimapCharRenderer, y: number): void {

	let x2 = new Uint8ClampedArray(Constants.x2_CHAR_HEIGHT * Constants.x2_CHAR_WIDTH * Constants.RGBA_CHANNELS_CNT * Constants.CHAR_COUNT);
	for (let chCode = Constants.START_CH_CODE; chCode <= Constants.END_CH_CODE; chCode++) {
		minimapCharRenderer.x2RenderChar(x2, Constants.CHAR_COUNT, 0, chCode - Constants.START_CH_CODE, chCode);
	}
	renderImageData(x2, Constants.x2_CHAR_WIDTH * Constants.CHAR_COUNT, Constants.x2_CHAR_HEIGHT, 10, y);

	let x1 = new Uint8ClampedArray(Constants.x1_CHAR_HEIGHT * Constants.x1_CHAR_WIDTH * Constants.RGBA_CHANNELS_CNT * Constants.CHAR_COUNT);
	for (let chCode = Constants.START_CH_CODE; chCode <= Constants.END_CH_CODE; chCode++) {
		minimapCharRenderer.x1RenderChar(x1, Constants.CHAR_COUNT, 0, chCode - Constants.START_CH_CODE, chCode);
	}
	renderImageData(x1, Constants.x1_CHAR_WIDTH * Constants.CHAR_COUNT, Constants.x1_CHAR_HEIGHT, 10, y + 100);
}

(function () {
	let r = 'let x2Data = [', offset = 0;
	for (let charIndex = 0; charIndex < Constants.CHAR_COUNT; charIndex++) {
		let charCode = charIndex + Constants.START_CH_CODE;
		r += '\n\n// ' + String.fromCharCode(charCode);

		for (let i = 0; i < Constants.x2_CHAR_HEIGHT * Constants.x2_CHAR_WIDTH * Constants.CA_CHANNELS_CNT; i++) {
			if (i % 4 === 0) {
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

		for (let i = 0; i < Constants.x1_CHAR_HEIGHT * Constants.x1_CHAR_WIDTH * Constants.CA_CHANNELS_CNT; i++) {
			if (i % 2 === 0) {
				r += '\n';
			}
			r += minimapCharRenderer.x1charData[offset] + ',';
			offset++;
		}

	}
	r += '\n\n]';
	console.log(r);
})();



function renderImageData(data: Uint8ClampedArray, width: number, height: number, left: number, top: number): void {
	let output = '';
	var offset = 0;
	var PX_SIZE = 15;
	for (var i = 0; i < height; i++) {
		for (var j = 0; j < width; j++) {
			var R = data[offset];
			var G = data[offset + 1];
			var B = data[offset + 2];
			var A = data[offset + 3];
			offset += 4;

			output += `<div style="position:absolute;top:${PX_SIZE * i}px;left:${PX_SIZE * j}px;width:${PX_SIZE}px;height:${PX_SIZE}px;background:rgba(${R},${G},${B},${A / 256})"></div>`;
		}
	}

	var domNode = document.createElement('div');
	domNode.style.position = 'absolute';
	domNode.style.top = top + 'px';
	domNode.style.left = left + 'px';
	domNode.style.width = (width * PX_SIZE) + 'px';
	domNode.style.height = (height * PX_SIZE) + 'px';
	domNode.style.border = '1px solid #ccc';
	domNode.style.background = '#000000';
	domNode.innerHTML = output;
	document.body.appendChild(domNode);
}
