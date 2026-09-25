/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { stringHash } from '../../../../../../../base/common/hash.js';

/**
 * The greeting the website hero hid in its binary field. The website spelled it out in letters;
 * here the binary digits carry it as 8-bit ASCII instead.
 */
export const imageGenerationFieldMessage = 'HAPPY_CODING!';

const messageBits = [...imageGenerationFieldMessage].map(character => character.charCodeAt(0).toString(2).padStart(8, '0')).join('');

const crestGlyphs = ['·', ':', '=', '+', '*', '#'];

/**
 * Every glyph the field can show; cells store an index into this list, and the index of a binary
 * digit is its value.
 */
export const imageGenerationFieldGlyphs: readonly string[] = ['0', '1', ...crestGlyphs];

/**
 * How a cell's glyph is painted.
 */
export interface IImageGenerationFieldTone {
	/** Whether the tone belongs to the crest of a swell rather than to the binary digits. */
	readonly crest: boolean;
	/** How strongly the tone reads, from barely visible (> 0) to full strength (1). */
	readonly strength: number;
}

const binaryToneCount = 4;

/**
 * Binary digits fade in four steps toward the crests and the edges of the field, and crest glyphs
 * strengthen in one step per glyph toward the top of each crest.
 */
export const imageGenerationFieldTones: readonly IImageGenerationFieldTone[] = [
	...Array.from({ length: binaryToneCount }, (_, index) => ({ crest: false, strength: (index + 1) / binaryToneCount })),
	...crestGlyphs.map((_, index) => ({ crest: true, strength: (index + 1) / crestGlyphs.length })),
];

const glyphBits = 3;
const glyphMask = (1 << glyphBits) - 1;

/**
 * Returns the index into {@link imageGenerationFieldTones} of a cell, or -1 when the cell is empty.
 */
export function getImageGenerationFieldCellTone(cell: number): number {
	return (cell >> glyphBits) - 1;
}

/**
 * Returns the index into {@link imageGenerationFieldGlyphs} of a non-empty cell.
 */
export function getImageGenerationFieldCellGlyph(cell: number): number {
	return cell & glyphMask;
}

function encodeCell(tone: number, glyph: number): number {
	return ((tone + 1) << glyphBits) | glyph;
}

interface ISwell {
	/** Relative height of the swell. */
	readonly amplitude: number;
	/** Distance between crests, as a fraction of the field's shorter side. */
	readonly length: number;
	/** Direction of travel in radians, clockwise from rightward. */
	readonly direction: number;
	/** Distance the crests travel per second, as a fraction of the field's shorter side. */
	readonly speed: number;
}

// One long swell rolls through the field while two smaller ones cross it, so that the crests
// bend, break and join again like moving water.
const swellTemplates: readonly ISwell[] = [
	{ amplitude: 1, length: 0.38, direction: 1.35, speed: 0.04 },
	{ amplitude: 0.35, length: 0.27, direction: 1, speed: 0.035 },
	{ amplitude: 0.2, length: 0.18, direction: 1.9, speed: 0.055 },
];
const swellAmplitudes = Float64Array.from(swellTemplates, swell => swell.amplitude);
const swellAmplitude = swellAmplitudes.reduce((sum, amplitude) => sum + amplitude, 0);
const crestThreshold = 0.22;
// The swells rarely all peak together, so the densest glyph is reserved for crests above this.
const crestPeak = 0.8;
const binaryFadeStart = 0.1;
const flowSpeed = 0.25;
const warpStrength = 0.6;

// The field fills a rectangle with rounded corners. Its edges fade out over a wide band that
// begins just inside the rectangle, wobbles slowly and has a fine grain, so that they look soft,
// uneven and natural rather than ruled.
const cornerRadius = 0.14;
const edgeInset = 0.045;
const edgeFadeWidth = 0.2;
const edgeWobble = 0.07;
const edgeGrain = 0.06;

// Each digit flips for a moment every half minute or so, and only 2% of digits are flipped at a
// time, so the message stays readable.
const flipSpeed = 0.1;
const flipThreshold = Math.cos(0.02 * Math.PI / 2);

function mix32(value: number): number {
	value = Math.imul(value ^ (value >>> 16), 0x85ebca6b);
	value = Math.imul(value ^ (value >>> 13), 0xc2b2ae35);
	return (value ^ (value >>> 16)) >>> 0;
}

function random(seed: number, first: number, second: number): number {
	return mix32(seed ^ Math.imul(first + 1, 0x27d4eb2d) ^ Math.imul(second + 1, 0x165667b1)) / 0x100000000;
}

function smoothstep(edge0: number, edge1: number, value: number): number {
	const amount = Math.min(1, Math.max(0, (value - edge0) / (edge1 - edge0)));
	return amount * amount * (3 - 2 * amount);
}

/**
 * Sines and cosines that only depend on a cell's position, stored per cell so that
 * `sin(term + phase)` becomes arithmetic by the angle addition identities.
 */
const enum PositionTerm {
	SinDiagonal,
	CosDiagonal,
	SinRippleA,
	CosRippleA,
	SinRippleB,
	CosRippleB,
	SinFlip,
	CosFlip,
	SinWobbleA,
	CosWobbleA,
	SinWobbleB,
	CosWobbleB,
	SinWobbleC,
	CosWobbleC,
	Count,
}

/**
 * A character-grid rendition of the 2025 code.visualstudio.com hero background, reworked as water:
 * swells roll through a rectangle of binary digits, and their crests are drawn with denser glyphs.
 * Read as 8-bit ASCII, every row of digits spells {@link imageGenerationFieldMessage} over and
 * over, each row starting at a different bit so that the rows don't line up into stripes.
 *
 * The website drew soft blobs at full resolution through six WebGL passes and then kept one
 * sample per character. This model evaluates its surface directly at each character cell instead,
 * bending the swells with the website's distortion so that they flow. The terms that only depend
 * on a cell's position are computed once per size, so that a frame costs little trigonometry.
 */
export class ImageGenerationField {

	private readonly seed: number;
	private readonly swellWaveX = new Float64Array(swellTemplates.length);
	private readonly swellWaveY = new Float64Array(swellTemplates.length);
	private readonly swellAngularSpeeds = new Float64Array(swellTemplates.length);
	private readonly swellOffsets = new Float64Array(swellTemplates.length);

	private _columns = 0;
	private _rows = 0;
	private _cells = new Uint16Array(0);
	private bits = new Uint8Array(0);
	private edgeDistances = new Float32Array(0);
	private swellPhases = new Float64Array(0);
	private positionTerms = new Float32Array(0);
	private columnWaves = new Float32Array(0);
	private columnTurbulence = new Float32Array(0);
	private rowWaves = new Float32Array(0);
	private rowTurbulence = new Float32Array(0);

	constructor(seed: string) {
		this.seed = mix32(stringHash(seed, 0));
		swellTemplates.forEach((swell, index) => {
			const waveNumber = 2 * Math.PI / swell.length;
			const direction = swell.direction + (random(this.seed, index, 1) - 0.5) * 0.4;
			this.swellWaveX[index] = Math.cos(direction) * waveNumber;
			this.swellWaveY[index] = Math.sin(direction) * waveNumber;
			this.swellAngularSpeeds[index] = waveNumber * swell.speed;
			this.swellOffsets[index] = random(this.seed, index, 2) * 2 * Math.PI;
		});
	}

	get columns(): number {
		return this._columns;
	}

	get rows(): number {
		return this._rows;
	}

	/**
	 * One entry per cell in row-major order: 0 when empty, otherwise an encoded tone and glyph.
	 */
	get cells(): Uint16Array {
		return this._cells;
	}

	resize(columns: number, rows: number): void {
		if (columns === this._columns && rows === this._rows) {
			return;
		}
		this._columns = columns;
		this._rows = rows;
		this._cells = new Uint16Array(columns * rows);
		this.bits = new Uint8Array(columns * rows);
		this.edgeDistances = new Float32Array(columns * rows);
		this.swellPhases = new Float64Array(columns * rows * swellTemplates.length);
		this.positionTerms = new Float32Array(columns * rows * PositionTerm.Count);
		this.columnWaves = new Float32Array(columns);
		this.columnTurbulence = new Float32Array(columns);
		this.rowWaves = new Float32Array(rows);
		this.rowTurbulence = new Float32Array(rows);

		// Swells and edges are measured against the shorter side, so that they keep their shape
		// and the fade keeps its width on fields that are not square.
		const shorterSide = Math.min(columns, rows);
		const halfWidth = columns / shorterSide / 2;
		const halfHeight = rows / shorterSide / 2;
		for (let row = 0; row < rows; row++) {
			const y = (row + 0.5) / rows;
			const top = (row + 0.5) / shorterSide;
			const messageOffset = Math.floor(random(this.seed ^ 0x2545f491, row, 0) * messageBits.length);
			for (let column = 0; column < columns; column++) {
				const x = (column + 0.5) / columns;
				const left = (column + 0.5) / shorterSide;
				const index = row * columns + column;
				this.bits[index] = messageBits[(messageOffset + column) % messageBits.length] === '1' ? 1 : 0;

				const cornerX = Math.abs(left - halfWidth) - (halfWidth - cornerRadius);
				const cornerY = Math.abs(top - halfHeight) - (halfHeight - cornerRadius);
				const outside = Math.sqrt(Math.max(cornerX, 0) ** 2 + Math.max(cornerY, 0) ** 2) + Math.min(Math.max(cornerX, cornerY), 0);
				const grain = (random(this.seed ^ 0x68e31da4, column, row) - 0.5) * edgeGrain;
				this.edgeDistances[index] = cornerRadius - outside + grain;

				for (let swell = 0; swell < swellTemplates.length; swell++) {
					this.swellPhases[index * swellTemplates.length + swell] = this.swellWaveX[swell] * left + this.swellWaveY[swell] * top + this.swellOffsets[swell];
				}

				const diagonal = (x + y) * 2.5;
				const rippleA = Math.sqrt((x - 0.3) ** 2 + (y - 0.7) ** 2) * 6;
				const rippleB = Math.sqrt((x - 0.7) ** 2 + (y - 0.3) ** 2) * 5;
				const flip = random(this.seed ^ 0x5bd1e995, column, row) * 100;
				const wobbleA = 5.1 * x + 2.3 * y;
				const wobbleB = -3.3 * x + 6.7 * y + 1.3;
				const wobbleC = 9.7 * x - 4.1 * y + 4.1;
				this.positionTerms.set([
					Math.sin(diagonal), Math.cos(diagonal),
					Math.sin(rippleA), Math.cos(rippleA),
					Math.sin(rippleB), Math.cos(rippleB),
					Math.sin(flip), Math.cos(flip),
					Math.sin(wobbleA), Math.cos(wobbleA),
					Math.sin(wobbleB), Math.cos(wobbleB),
					Math.sin(wobbleC), Math.cos(wobbleC),
				], index * PositionTerm.Count);
			}
		}
	}

	/**
	 * Computes the cells at `timeMs`. A still frame holds the water at rest and flips no digits.
	 */
	update(timeMs: number, still = false): void {
		const columns = this._columns;
		const rows = this._rows;
		if (!columns || !rows) {
			return;
		}

		const seconds = still ? 0 : timeMs / 1000;
		const phase = seconds * flowSpeed;

		// The website's distortion shader, one term at a time:
		//   x += sin(x·4 + 0.6p)·0.08 + sin((x+y)·2.5 + 0.8p)·0.1 + sin(|(x,y)-(0.3,0.7)|·6 + 0.7p)·0.15 + turbulence
		//   y += cos(y·3 + 0.5p)·0.12 + sin((x+y)·2.5 + 0.8p)·0.1 + cos(|(x,y)-(0.7,0.3)|·5 + 0.56p)·0.18 + turbulence
		//   turbulence = sin(x·8 + p)·cos(y·7 + 0.9p)·0.06
		for (let column = 0; column < columns; column++) {
			const x = (column + 0.5) / columns;
			this.columnWaves[column] = Math.sin(x * 4 + phase * 0.6) * 0.08;
			this.columnTurbulence[column] = Math.sin(x * 8 + phase) * 0.06;
		}
		for (let row = 0; row < rows; row++) {
			const y = (row + 0.5) / rows;
			this.rowWaves[row] = Math.cos(y * 3 + phase * 0.5) * 0.12;
			this.rowTurbulence[row] = Math.cos(y * 7 + phase * 0.9);
		}
		const sinDiagonalPhase = Math.sin(phase * 0.8);
		const cosDiagonalPhase = Math.cos(phase * 0.8);
		const sinRippleAPhase = Math.sin(phase * 0.7);
		const cosRippleAPhase = Math.cos(phase * 0.7);
		const sinRippleBPhase = Math.sin(phase * 0.56);
		const cosRippleBPhase = Math.cos(phase * 0.56);
		const sinFlipPhase = Math.sin(seconds * flipSpeed);
		const cosFlipPhase = Math.cos(seconds * flipSpeed);
		const sinWobbleAPhase = Math.sin(seconds * 0.35);
		const cosWobbleAPhase = Math.cos(seconds * 0.35);
		const sinWobbleBPhase = Math.sin(seconds * -0.27);
		const cosWobbleBPhase = Math.cos(seconds * -0.27);
		const sinWobbleCPhase = Math.sin(seconds * 0.41);
		const cosWobbleCPhase = Math.cos(seconds * 0.41);
		const swellCount = swellTemplates.length;
		// Wrapping each swell's time term to one period keeps the arguments of the sines below small,
		// which keeps them on the fast path of `Math.sin` for clock times in milliseconds since 1970.
		const swellTimes = this.swellAngularSpeeds.map(angularSpeed => (angularSpeed * seconds) % (2 * Math.PI));
		const { swellPhases, swellWaveX, swellWaveY } = this;
		const terms = this.positionTerms;

		for (let row = 0; row < rows; row++) {
			for (let column = 0; column < columns; column++) {
				const index = row * columns + column;
				const term = index * PositionTerm.Count;
				const diagonal = (terms[term + PositionTerm.SinDiagonal] * cosDiagonalPhase + terms[term + PositionTerm.CosDiagonal] * sinDiagonalPhase) * 0.1;
				const rippleA = (terms[term + PositionTerm.SinRippleA] * cosRippleAPhase + terms[term + PositionTerm.CosRippleA] * sinRippleAPhase) * 0.15;
				const rippleB = (terms[term + PositionTerm.CosRippleB] * cosRippleBPhase - terms[term + PositionTerm.SinRippleB] * sinRippleBPhase) * 0.18;
				const turbulence = this.columnTurbulence[column] * this.rowTurbulence[row];
				const flowX = (this.columnWaves[column] + diagonal + rippleA + turbulence) * warpStrength;
				const flowY = (this.rowWaves[row] + diagonal + rippleB + turbulence) * warpStrength;

				let height = 0;
				for (let swell = 0; swell < swellCount; swell++) {
					height += swellAmplitudes[swell] * Math.sin(swellPhases[index * swellCount + swell] + swellWaveX[swell] * flowX + swellWaveY[swell] * flowY - swellTimes[swell]);
				}

				const wobble = (terms[term + PositionTerm.SinWobbleA] * cosWobbleAPhase + terms[term + PositionTerm.CosWobbleA] * sinWobbleAPhase) * 0.5
					+ (terms[term + PositionTerm.SinWobbleB] * cosWobbleBPhase + terms[term + PositionTerm.CosWobbleB] * sinWobbleBPhase) * 0.35
					+ (terms[term + PositionTerm.SinWobbleC] * cosWobbleCPhase + terms[term + PositionTerm.CosWobbleC] * sinWobbleCPhase) * 0.25;
				const fade = smoothstep(edgeInset, edgeInset + edgeFadeWidth, this.edgeDistances[index] + wobble * edgeWobble);
				// Raising the surface to the power 1.5 narrows the crests and widens the troughs, like water.
				const surface = (height / swellAmplitude + 1) / 2;
				const crest = surface * Math.sqrt(surface) * fade;

				let tone: number;
				let glyph: number;
				if (crest >= crestThreshold) {
					const level = Math.min(crestGlyphs.length - 1, Math.floor((crest - crestThreshold) / (crestPeak - crestThreshold) * crestGlyphs.length));
					tone = binaryToneCount + level;
					glyph = 2 + level;
				} else {
					tone = Math.ceil(fade * (1 - smoothstep(binaryFadeStart, crestThreshold, crest)) * binaryToneCount) - 1;
					const flip = terms[term + PositionTerm.SinFlip] * cosFlipPhase + terms[term + PositionTerm.CosFlip] * sinFlipPhase;
					glyph = this.bits[index] ^ (!still && Math.abs(flip) > flipThreshold ? 1 : 0);
				}

				this._cells[index] = tone < 0 ? 0 : encodeCell(tone, glyph);
			}
		}
	}

	/**
	 * Renders the cells as text, one line per row, with spaces for empty cells.
	 */
	toString(): string {
		const lines: string[] = [];
		for (let row = 0; row < this._rows; row++) {
			let line = '';
			for (let column = 0; column < this._columns; column++) {
				const cell = this._cells[row * this._columns + column];
				line += cell ? imageGenerationFieldGlyphs[getImageGenerationFieldCellGlyph(cell)] : ' ';
			}
			lines.push(line);
		}
		return lines.join('\n');
	}
}
