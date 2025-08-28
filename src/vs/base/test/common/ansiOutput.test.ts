/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2023-2025 Posit Software, PBC. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from './utils.js';
import { ANSIColor, ANSIFormat, ANSIOutput, ANSIStyle } from '../../common/ansiOutput.js';

const BS = '\b';
const CR = '\r';
const LF = '\n';
const CRLF = `\r\n`;
const PANGRAM = 'The quick brown fox jumps over the lazy dog';

let csiIndex = 0;
const CSI = () => {
	switch (csiIndex) {
		case 0:
			csiIndex++;
			return '\x1b[';
		default:
			csiIndex = 0;
			return '\x9b';
	}
};

let oscIndex = 0;
const OSC = () => {
	switch (oscIndex) {
		case 0:
			oscIndex++;
			return '\x1b]';
		default:
			oscIndex = 0;
			return '\x9d';
	}
};

let stIndex = 0;
const ST = () => {
	switch (stIndex) {
		case 0:
			stIndex++;
			return '\x1b\x5c';
		case 1:
			stIndex++;
			return '\x07';
		default:
			stIndex = 0;
			return '\x9c';
	}
};

enum SGRParam {
	Reset = 0,
	Bold = 1,
	Dim = 2,
	Italic = 3,
	Underlined = 4,
	SlowBlink = 5,
	RapidBlink = 6,
	Reversed = 7,
	Hidden = 8,
	CrossedOut = 9,
	PrimaryFont = 10,
	AlternativeFont1 = 11,
	AlternativeFont2 = 12,
	AlternativeFont3 = 13,
	AlternativeFont4 = 14,
	AlternativeFont5 = 15,
	AlternativeFont6 = 16,
	AlternativeFont7 = 17,
	AlternativeFont8 = 18,
	AlternativeFont9 = 19,
	Fraktur = 20,
	DoubleUnderlined = 21,
	NormalIntensity = 22,
	NotItalicNotFraktur = 23,
	NotUnderlined = 24,
	NotBlinking = 25,
	ProportionalSpacing = 26,
	NotReversed = 27,
	Reveal = 28,
	NotCrossedOut = 29,
	ForegroundBlack = 30,
	ForegroundRed = 31,
	ForegroundGreen = 32,
	ForegroundYellow = 33,
	ForegroundBlue = 34,
	ForegroundMagenta = 35,
	ForegroundCyan = 36,
	ForegroundWhite = 37,
	SetForeground = 38,
	DefaultForeground = 39,
	BackgroundBlack = 40,
	BackgroundRed = 41,
	BackgroundGreen = 42,
	BackgroundYellow = 43,
	BackgroundBlue = 44,
	BackgroundMagenta = 45,
	BackgroundCyan = 46,
	BackgroundWhite = 47,
	SetBackground = 48,
	DefaultBackground = 49,
	DisableProportionalSpacing = 50,
	Framed = 51,
	Encircled = 52,
	Overlined = 53,
	NotFramedNotEncircled = 54,
	NotOverlined = 55,
	SetUnderline = 58,
	DefaultUnderline = 59,
	IdeogramUnderlineOrRightSideLine = 60,
	IdeogramDoubleUnderlineOrDoubleRightSideLine = 61,
	IdeogramOverlineOrLeftSideLine = 62,
	IdeogramDoubleOverlineOrDoubleLeftSideLine = 63,
	IdeogramStressMarking = 64,
	NoIdeogramAttributes = 65,
	Superscript = 73,
	Subscript = 74,
	NotSuperscriptNotSubscript = 75,
	ForegroundBrightBlack = 90,
	ForegroundBrightRed = 91,
	ForegroundBrightGreen = 92,
	ForegroundBrightYellow = 93,
	ForegroundBrightBlue = 94,
	ForegroundBrightMagenta = 95,
	ForegroundBrightCyan = 96,
	ForegroundBrightWhite = 97,
	BackgroundBrightBlack = 100,
	BackgroundBrightRed = 101,
	BackgroundBrightGreen = 102,
	BackgroundBrightYellow = 103,
	BackgroundBrightBlue = 104,
	BackgroundBrightMagenta = 105,
	BackgroundBrightCyan = 106,
	BackgroundBrightWhite = 107
}

enum SGRParamColor {
	Color256 = 5,
	ColorRGB = 2
}

type SGRValue = SGRParam | SGRParamColor | number;

interface SGRTestScenario {
	sgr: SGRValue[];
	ansiFormat: ANSIFormat;
}

const map8BitColorIndexToColor = (colorIndex: number) => {
	switch (colorIndex) {
		case 0:
			return ANSIColor.Black;
		case 1:
			return ANSIColor.Red;
		case 2:
			return ANSIColor.Green;
		case 3:
			return ANSIColor.Yellow;
		case 4:
			return ANSIColor.Blue;
		case 5:
			return ANSIColor.Magenta;
		case 6:
			return ANSIColor.Cyan;
		case 7:
			return ANSIColor.White;
		case 8:
			return ANSIColor.BrightBlack;
		case 9:
			return ANSIColor.BrightRed;
		case 10:
			return ANSIColor.BrightGreen;
		case 11:
			return ANSIColor.BrightYellow;
		case 12:
			return ANSIColor.BrightBlue;
		case 13:
			return ANSIColor.BrightMagenta;
		case 14:
			return ANSIColor.BrightCyan;
		case 15:
			return ANSIColor.BrightWhite;
		default:
			if (colorIndex % 1 !== 0) {
				return undefined;
			}
			if (colorIndex >= 16 && colorIndex <= 231) {
				let colorNumber = colorIndex - 16;
				let blue = colorNumber % 6;
				colorNumber = (colorNumber - blue) / 6;
				let green = colorNumber % 6;
				colorNumber = (colorNumber - green) / 6;
				let red = colorNumber;
				blue = Math.round(blue * 255 / 5);
				green = Math.round(green * 255 / 5);
				red = Math.round(red * 255 / 5);
				return '#' +
					twoDigitHex(red) +
					twoDigitHex(green) +
					twoDigitHex(blue);
			} else if (colorIndex >= 232 && colorIndex <= 255) {
				const rgb = Math.round((colorIndex - 232) / 23 * 255);
				const grayscale = twoDigitHex(rgb);
				return '#' + grayscale + grayscale + grayscale;
			} else {
				return undefined;
			}
	}
};

const makeCUB = (count?: number) => {
	if (count === undefined) {
		return `${CSI()}D`;
	} else {
		return `${CSI()}${count}D`;
	}
};

const makeCUD = (count?: number) => {
	if (count === undefined) {
		return `${CSI()}B`;
	} else {
		return `${CSI()}${count}B`;
	}
};

const makeCUF = (count?: number) => {
	if (count === undefined) {
		return `${CSI()}C`;
	} else {
		return `${CSI()}${count}C`;
	}
};

const makeCUP = (line?: number, column?: number) => {
	if (line === undefined && column === undefined) {
		return `${CSI()}H`;
	} else if (line !== undefined && column === undefined) {
		return `${CSI()}${line}H`;
	} else if (line === undefined && column !== undefined) {
		return `${CSI()};${column}H`;
	} else {
		return `${CSI()}${line};${column}H`;
	}
};

const makeCUU = (count?: number) => {
	if (count === undefined) {
		return `${CSI()}A`;
	} else {
		return `${CSI()}${count}A`;
	}
};

const makeED = (direction: 'end-of-screen' | 'end-of-screen-explicit-0' | 'beginning-of-screen' | 'entire-screen' = 'end-of-screen') => {
	switch (direction) {
		case 'end-of-screen':
			return `${CSI()}J`;
		case 'end-of-screen-explicit-0':
			return `${CSI()}0J`;
		case 'beginning-of-screen':
			return `${CSI()}1J`;
		case 'entire-screen':
			return `${CSI()}2J`;
	}
};

const makeEL = (direction: 'end-of-line' | 'end-of-line-explicit-0' | 'beginning-of-line' | 'entire-line' = 'end-of-line') => {
	switch (direction) {
		case 'end-of-line':
			return `${CSI()}K`;
		case 'end-of-line-explicit-0':
			return `${CSI()}0K`;
		case 'beginning-of-line':
			return `${CSI()}1K`;
		case 'entire-line':
			return `${CSI()}2K`;
	}
};

const makeSGR = (...parameters: SGRParam[]) => {
	return CSI() + parameters.map(parameter => `${parameter}`).join(';') + 'm';
};

const makeOSC8 = (text: string, url: string, params: string = '') => {
	return `${OSC()}8;${params};${url}${ST()}${text}${OSC()}8;;${ST()}`;
};

const setupStandardScreen = () => {
	const ansiOutput = new ANSIOutput();
	for (let i = 0; i < 25; i++) {
		ansiOutput.processOutput('0'.repeat(80));
		if (i < 24) {
			ansiOutput.processOutput(CRLF);
		}
	}
	return ansiOutput;
};

const makeLines = (count: number): string[] => {
	const lines: string[] = [];
	for (let i = 0; i < count; i++) {
		lines.push('0'.repeat(Math.floor(Math.random() * 1024) + (i === count - 1 ? 1 : 0)));
	}
	return lines;
};

export const twoDigitHex = (value: number) => {
	if (value < 0) {
		return '00';
	} else if (value > 255) {
		return 'ff';
	}
	const hex = value.toString(16);
	return hex.length === 2 ? hex : '0' + hex;
};

suite('ANSIOutput', () => {
	test('Test ANSIOutput.processOutput with empty string', () => {
		const outputLines = ANSIOutput.processOutput('');
		assert.equal(outputLines.length, 1);
		assert.ok(outputLines[0].id.length >= 1);
		assert.equal(outputLines[0].outputRuns.length, 0);
	});

	test('Test ANSIOutput.processOutput with PANGRAM', () => {
		const outputLines = ANSIOutput.processOutput(PANGRAM);
		assert.equal(outputLines.length, 1);
		assert.ok(outputLines[0].id.length >= 1);
		assert.equal(outputLines[0].outputRuns.length, 1);
		assert.equal(outputLines[0].outputRuns[0].text, PANGRAM);
	});

	test('Test ANSIOutput with no output', () => {
		const ansiOutput = new ANSIOutput();
		const outputLines = ansiOutput.outputLines;
		assert.equal(outputLines.length, 1);
		assert.equal(outputLines[0].outputRuns.length, 0);
	});

	test('Test ANSIOutput BS "[BS]"', () => {
		const ansiOutput = new ANSIOutput();
		ansiOutput.processOutput(BS);
		const outputLines = ansiOutput.outputLines;
		assert.equal(outputLines.length, 1);
		assert.equal(outputLines[0].outputRuns.length, 0);
	});

	test('Test ANSIOutput BS "[BS][BS][BS][BS][BS][BS][BS][BS][BS][BS]"', () => {
		const ansiOutput = new ANSIOutput();
		ansiOutput.processOutput(BS.repeat(10));
		const outputLines = ansiOutput.outputLines;
		assert.equal(outputLines.length, 1);
		assert.equal(outputLines[0].outputRuns.length, 0);
	});

	test('Test ANSIOutput BS "Hello X[BS]World"', () => {
		const ansiOutput = new ANSIOutput();
		ansiOutput.processOutput(`Hello X${BS}World`);
		const outputLines = ansiOutput.outputLines;
		const expectedOutput = 'Hello World';
		assert.equal(outputLines.length, 1);
		assert.equal(outputLines[0].outputRuns.length, 1);
		assert.ok(outputLines[0].outputRuns[0].id.length >= 1);
		assert.equal(outputLines[0].outputRuns[0].format, undefined);
		assert.equal(outputLines[0].outputRuns[0].text, expectedOutput);
	});

	test('Test ANSIOutput BS "Hello XXXX[BS][BS][BS][BS]World"', () => {
		const ansiOutput = new ANSIOutput();
		ansiOutput.processOutput(`Hello XXXX${BS.repeat(4)}World`);
		const outputLines = ansiOutput.outputLines;
		const expectedOutput = 'Hello World';
		assert.equal(outputLines.length, 1);
		assert.equal(outputLines[0].outputRuns.length, 1);
		assert.ok(outputLines[0].outputRuns[0].id.length >= 1);
		assert.equal(outputLines[0].outputRuns[0].format, undefined);
		assert.equal(outputLines[0].outputRuns[0].text, expectedOutput);
	});

	test('Test ANSIOutput BS "HelloXXXXX[BS][BS][BS][BS][BS] World"', () => {
		const ansiOutput = new ANSIOutput();
		ansiOutput.processOutput(`HelloXXXXX${BS.repeat(5)} World`);
		const outputLines = ansiOutput.outputLines;
		const expectedOutput = 'Hello World';
		assert.equal(outputLines.length, 1);
		assert.equal(outputLines[0].outputRuns.length, 1);
		assert.ok(outputLines[0].outputRuns[0].id.length >= 1);
		assert.equal(outputLines[0].outputRuns[0].format, undefined);
		assert.equal(outputLines[0].outputRuns[0].text, expectedOutput);
	});

	test('Test ANSIOutput BS "HelloXXXXX[BS][BS][BS][BS][BS][BS][BS][BS][BS][BS] World"', () => {
		const ansiOutput = new ANSIOutput();
		ansiOutput.processOutput(`HelloXXXXX${BS.repeat(10)}Hello World`);
		const outputLines = ansiOutput.outputLines;
		const expectedOutput = 'Hello World';
		assert.equal(outputLines.length, 1);
		assert.equal(outputLines[0].outputRuns.length, 1);
		assert.ok(outputLines[0].outputRuns[0].id.length >= 1);
		assert.equal(outputLines[0].outputRuns[0].format, undefined);
		assert.equal(outputLines[0].outputRuns[0].text, expectedOutput);
	});

	test('Test ANSIOutput BS RED GREEN BLUE becomes RED BLUE', () => {
		const testText = 'This is some text for testing purposes';
		const ansiOutput = new ANSIOutput();
		ansiOutput.processOutput(`${makeSGR(SGRParam.ForegroundRed)}${testText}${makeSGR(SGRParam.ForegroundGreen)}${testText}${makeSGR(SGRParam.ForegroundBlue)}${BS.repeat(testText.length)}${testText}${makeSGR()}`);
		const outputLines = ansiOutput.outputLines;
		assert.equal(outputLines.length, 1);
		assert.equal(outputLines[0].outputRuns.length, 2);
		assert.ok(outputLines[0].outputRuns[0].id.length >= 1);
		assert.equal(outputLines[0].outputRuns[0].format!.foregroundColor, ANSIColor.Red);
		assert.equal(outputLines[0].outputRuns[0].text, testText);
		assert.ok(outputLines[0].outputRuns[1].id.length >= 1);
		assert.equal(outputLines[0].outputRuns[1].format!.foregroundColor, ANSIColor.Blue);
		assert.equal(outputLines[0].outputRuns[1].text, testText);
	});

	test('Test ANSIOutput BS RED GREEN BLUE becomes BLUE GREEN', () => {
		const testText = 'This is some text for testing purposes';
		const ansiOutput = new ANSIOutput();
		ansiOutput.processOutput(`${makeSGR(SGRParam.ForegroundRed)}${testText}${makeSGR(SGRParam.ForegroundGreen)}${testText}${makeSGR(SGRParam.ForegroundBlue)}${BS.repeat(testText.length * 2)}${testText}${makeSGR()}`);
		const outputLines = ansiOutput.outputLines;
		assert.equal(outputLines.length, 1);
		assert.equal(outputLines[0].outputRuns.length, 2);
		assert.ok(outputLines[0].outputRuns[0].id.length >= 1);
		assert.equal(outputLines[0].outputRuns[0].format!.foregroundColor, ANSIColor.Blue);
		assert.equal(outputLines[0].outputRuns[0].text, testText);
		assert.ok(outputLines[0].outputRuns[1].id.length >= 1);
		assert.equal(outputLines[0].outputRuns[1].format!.foregroundColor, ANSIColor.Green);
		assert.equal(outputLines[0].outputRuns[1].text, testText);
	});

	test('Test ANSIOutput with PANGRAM', () => {
		const ansiOutput = new ANSIOutput();
		ansiOutput.processOutput(PANGRAM);
		const outputLines = ansiOutput.outputLines;
		assert.equal(outputLines.length, 1);
		assert.ok(outputLines[0].id.length >= 1);
		assert.equal(outputLines[0].outputRuns.length, 1);
		assert.equal(outputLines[0].outputRuns[0].text, PANGRAM);
	});

	test('Test ANSIOutput with two lines separated by LF', () => {
		const ansiOutput = new ANSIOutput();
		ansiOutput.processOutput(`${PANGRAM}${LF}${PANGRAM}`);
		const outputLines = ansiOutput.outputLines;
		assert.equal(outputLines.length, 2);
		for (let i = 0; i < outputLines.length; i++) {
			assert.equal(outputLines[i].outputRuns.length, 1);
			assert.ok(outputLines[i].outputRuns[0].id.length >= 1);
			assert.equal(outputLines[i].outputRuns[0].format, undefined);
			assert.equal(outputLines[i].outputRuns[0].text, PANGRAM);
		}
	});

	test('Test ANSIOutput with two lines separated by CRLF', () => {
		const ansiOutput = new ANSIOutput();
		ansiOutput.processOutput(`${PANGRAM}${CRLF}${PANGRAM}`);
		const outputLines = ansiOutput.outputLines;
		assert.equal(outputLines.length, 2);
		for (let i = 0; i < outputLines.length; i++) {
			assert.equal(outputLines[i].outputRuns.length, 1);
			assert.ok(outputLines[i].outputRuns[0].id.length >= 1);
			assert.equal(outputLines[i].outputRuns[0].format, undefined);
			assert.equal(outputLines[i].outputRuns[0].text, PANGRAM);
		}
	});

	test('Test ANSIOutput with 10 lines separated by LF and CRLF', () => {
		testOutputLines(10, LF);
		testOutputLines(10, CRLF);
	});

	test('Test ANSIOutput with 100 lines separated by LF and CRLF', () => {
		testOutputLines(100, LF);
		testOutputLines(100, CRLF);
	});

	test('Test ANSIOutput with 2,500 output lines separated by LF and CRLF', () => {
		testOutputLines(2500, LF);
		testOutputLines(2500, CRLF);
	});

	test('Test ANSIOutput with 10,000 output lines separated by LF and CRLF', () => {
		testOutputLines(10000, LF);
		testOutputLines(10000, CRLF);
	});

	test('Text that exactly overwriting output runs to the right works', () => {
		const ansiOutput = new ANSIOutput();
		ansiOutput.processOutput(`${makeSGR(SGRParam.ForegroundRed)}0123456789${makeSGR()}`);
		ansiOutput.processOutput(`${makeSGR(SGRParam.ForegroundBlue)}0123456789${makeSGR()}`);
		ansiOutput.processOutput(`${makeSGR(SGRParam.ForegroundGreen)}0123456789${makeSGR()}`);
		ansiOutput.processOutput(CR);
		ansiOutput.processOutput("                              ");
		ansiOutput.processOutput(CR);
		ansiOutput.processOutput("0123456789");
		const outputLines = ansiOutput.outputLines;
		assert.equal(outputLines.length, 1);
		assert.equal(outputLines[0].outputRuns.length, 1);
		assert.ok(outputLines[0].outputRuns[0].id.length >= 1);
		assert.equal(outputLines[0].outputRuns[0].format, undefined);
		assert.equal(outputLines[0].outputRuns[0].text, '0123456789                    ');
	});

	test('Text that over overwriting output runs to the right works', () => {
		const ansiOutput = new ANSIOutput();
		ansiOutput.processOutput(`${makeSGR(SGRParam.ForegroundRed)}0123456789${makeSGR()}`);
		ansiOutput.processOutput(`${makeSGR(SGRParam.ForegroundBlue)}0123456789${makeSGR()}`);
		ansiOutput.processOutput(`${makeSGR(SGRParam.ForegroundGreen)}0123456789${makeSGR()}`);
		ansiOutput.processOutput(CR);
		ansiOutput.processOutput("                                        ");
		ansiOutput.processOutput(CR);
		ansiOutput.processOutput("0123456789");
		const outputLines = ansiOutput.outputLines;
		assert.equal(outputLines.length, 1);
		assert.equal(outputLines[0].outputRuns.length, 1);
		assert.ok(outputLines[0].outputRuns[0].id.length >= 1);
		assert.equal(outputLines[0].outputRuns[0].format, undefined);
		assert.equal(outputLines[0].outputRuns[0].text, '0123456789                              ');
	});

	test('Test CUB (Cursor Backward)', () => {
		const ansiOutput = new ANSIOutput();
		ansiOutput.processOutput('0'.repeat(80));
		ansiOutput.processOutput(makeCUB());
		checkOutputPosition(ansiOutput, 0, 79);
		ansiOutput.processOutput(makeCUB(1));
		checkOutputPosition(ansiOutput, 0, 78);
		ansiOutput.processOutput(makeCUB(10));
		checkOutputPosition(ansiOutput, 0, 68);
		ansiOutput.processOutput(makeCUB(100));
		checkOutputPosition(ansiOutput, 0, 0);
	});

	test('Test CUB (Cursor Backward) to start of line', () => {
		const ansiOutput = new ANSIOutput();
		ansiOutput.processOutput('0'.repeat(80));
		ansiOutput.processOutput(makeCUB(80));
		ansiOutput.processOutput('XXXXXXXXXX');
		const outputLines = ansiOutput.outputLines;
		assert.equal(outputLines.length, 1);
		assert.equal(outputLines[0].outputRuns.length, 1);
		assert.ok(outputLines[0].outputRuns[0].id.length >= 1);
		assert.equal(outputLines[0].outputRuns[0].format, undefined);
		assert.equal(outputLines[0].outputRuns[0].text, 'XXXXXXXXXX0000000000000000000000000000000000000000000000000000000000000000000000');
	});

	test('Test CUB (Cursor Backward) to middle of line', () => {
		const ansiOutput = new ANSIOutput();
		ansiOutput.processOutput('0'.repeat(80));
		ansiOutput.processOutput(makeCUB(45));
		ansiOutput.processOutput('XXXXXXXXXX');
		const outputLines = ansiOutput.outputLines;
		assert.equal(outputLines.length, 1);
		assert.equal(outputLines[0].outputRuns.length, 1);
		assert.ok(outputLines[0].outputRuns[0].id.length >= 1);
		assert.equal(outputLines[0].outputRuns[0].format, undefined);
		assert.equal(outputLines[0].outputRuns[0].text, '00000000000000000000000000000000000XXXXXXXXXX00000000000000000000000000000000000');
	});

	test('Test CUB (Cursor Backward) to end of line', () => {
		const ansiOutput = new ANSIOutput();
		ansiOutput.processOutput('0'.repeat(80));
		ansiOutput.processOutput(makeCUB(10));
		ansiOutput.processOutput('XXXXXXXXXX');
		const outputLines = ansiOutput.outputLines;
		assert.equal(outputLines.length, 1);
		assert.equal(outputLines[0].outputRuns.length, 1);
		assert.ok(outputLines[0].outputRuns[0].id.length >= 1);
		assert.equal(outputLines[0].outputRuns[0].format, undefined);
		assert.equal(outputLines[0].outputRuns[0].text, '0000000000000000000000000000000000000000000000000000000000000000000000XXXXXXXXXX');
	});

	test('Test CUD (Cursor Down)', () => {
		const ansiOutput = setupStandardScreen();
		ansiOutput.processOutput(makeCUP());
		ansiOutput.processOutput(makeCUD());
		checkOutputPosition(ansiOutput, 1, 0);
		ansiOutput.processOutput(makeCUD(1));
		checkOutputPosition(ansiOutput, 2, 0);
		ansiOutput.processOutput(makeCUD(10));
		checkOutputPosition(ansiOutput, 12, 0);
		ansiOutput.processOutput(makeCUD(100));
		checkOutputPosition(ansiOutput, 112, 0);
	});

	test('Test CUF (Cursor Forward)', () => {
		const ansiOutput = new ANSIOutput();
		ansiOutput.processOutput("0".repeat(80));
		ansiOutput.processOutput(makeCUP());
		ansiOutput.processOutput(makeCUF());
		checkOutputPosition(ansiOutput, 0, 1);
		ansiOutput.processOutput(makeCUF(1));
		checkOutputPosition(ansiOutput, 0, 2);
		ansiOutput.processOutput(makeCUF(10));
		checkOutputPosition(ansiOutput, 0, 12);
		ansiOutput.processOutput(makeCUF(100));
		checkOutputPosition(ansiOutput, 0, 112);
	});

	test('Test CUF (Cursor Forward) to start of line', () => {
		const ansiOutput = new ANSIOutput();
		ansiOutput.processOutput('0'.repeat(80));
		ansiOutput.processOutput(makeCUB(80));
		ansiOutput.processOutput(makeCUF());
		ansiOutput.processOutput('XXXXXXXXXX');
		const outputLines = ansiOutput.outputLines;
		assert.equal(outputLines.length, 1);
		assert.equal(outputLines[0].outputRuns.length, 1);
		assert.ok(outputLines[0].outputRuns[0].id.length >= 1);
		assert.equal(outputLines[0].outputRuns[0].format, undefined);
		assert.equal(outputLines[0].outputRuns[0].text, '0XXXXXXXXXX000000000000000000000000000000000000000000000000000000000000000000000');
	});

	test('Test CUF (Cursor Forward) to middle of line', () => {
		const ansiOutput = new ANSIOutput();
		ansiOutput.processOutput('0'.repeat(80));
		ansiOutput.processOutput(makeCUB(80));
		ansiOutput.processOutput(makeCUF(35));
		ansiOutput.processOutput('XXXXXXXXXX');
		const outputLines = ansiOutput.outputLines;
		assert.equal(outputLines.length, 1);
		assert.equal(outputLines[0].outputRuns.length, 1);
		assert.ok(outputLines[0].outputRuns[0].id.length >= 1);
		assert.equal(outputLines[0].outputRuns[0].format, undefined);
		assert.equal(outputLines[0].outputRuns[0].text, '00000000000000000000000000000000000XXXXXXXXXX00000000000000000000000000000000000');
	});

	test('Test CUF (Cursor Forward) to end of line', () => {
		const ansiOutput = new ANSIOutput();
		ansiOutput.processOutput('0'.repeat(80));
		ansiOutput.processOutput(makeCUB(80));
		ansiOutput.processOutput(makeCUF(70));
		ansiOutput.processOutput('XXXXXXXXXX');
		const outputLines = ansiOutput.outputLines;
		assert.equal(outputLines.length, 1);
		assert.equal(outputLines[0].outputRuns.length, 1);
		assert.ok(outputLines[0].outputRuns[0].id.length >= 1);
		assert.equal(outputLines[0].outputRuns[0].format, undefined);
		assert.equal(outputLines[0].outputRuns[0].text, '0000000000000000000000000000000000000000000000000000000000000000000000XXXXXXXXXX');
	});

	test("Tests CUP (Cursor Position)", () => {
		const ansiOutput = setupStandardScreen();
		ansiOutput.processOutput(makeCUP());
		checkOutputPosition(ansiOutput, 0, 0);
		ansiOutput.processOutput(makeCUP(10, 10));
		checkOutputPosition(ansiOutput, 9, 9);
		ansiOutput.processOutput(makeCUP(100, 100));
		checkOutputPosition(ansiOutput, 99, 99);
		ansiOutput.processOutput(makeCUP(8192, 8192));
		checkOutputPosition(ansiOutput, 8191, 8191);
	});

	test("Tests CUU (Cursor Up)", () => {
		const ansiOutput = setupStandardScreen();
		ansiOutput.processOutput(makeCUU());
		checkOutputPosition(ansiOutput, 23, 80);
		ansiOutput.processOutput(makeCUU(1));
		checkOutputPosition(ansiOutput, 22, 80);
		ansiOutput.processOutput(makeCUU(10));
		checkOutputPosition(ansiOutput, 12, 80);
		ansiOutput.processOutput(makeCUU(20));
		checkOutputPosition(ansiOutput, 0, 80);
	});

	test('Tests end of screen ED using implicit 0', () => {
		const ansiOutput = setupStandardScreen();
		ansiOutput.processOutput(makeCUP(13, 41));
		ansiOutput.processOutput(makeED('end-of-screen'));
		const zeros = '0'.repeat(80);
		for (let i = 0; i < 12; i++) {
			assert.equal(ansiOutput.outputLines[i].outputRuns.length, 1);
			assert.equal(ansiOutput.outputLines[i].outputRuns[0].text, zeros);
		}
		assert.equal(ansiOutput.outputLines[12].outputRuns.length, 2);
		assert.equal(ansiOutput.outputLines[12].outputRuns[0].text, '0000000000000000000000000000000000000000');
		assert.equal(ansiOutput.outputLines[12].outputRuns[1].text, '                                        ');
		const spaces = ' '.repeat(80);
		for (let i = 13; i < 24; i++) {
			assert.equal(ansiOutput.outputLines[i].outputRuns.length, 1);
			assert.equal(ansiOutput.outputLines[i].outputRuns[0].text, spaces);
		}
	});

	test('Tests end of screen ED using explicit 0', () => {
		const ansiOutput = setupStandardScreen();
		ansiOutput.processOutput(makeCUP(13, 41));
		checkOutputPosition(ansiOutput, 12, 40);
		ansiOutput.processOutput(makeED('end-of-screen-explicit-0'));
		const zeros = '0'.repeat(80);
		for (let i = 0; i < 12; i++) {
			assert.equal(ansiOutput.outputLines[i].outputRuns.length, 1);
			assert.equal(ansiOutput.outputLines[i].outputRuns[0].text, zeros);
		}
		assert.equal(ansiOutput.outputLines[12].outputRuns.length, 2);
		assert.equal(ansiOutput.outputLines[12].outputRuns[0].text, '0000000000000000000000000000000000000000');
		assert.equal(ansiOutput.outputLines[12].outputRuns[1].text, '                                        ');
		const spaces = ' '.repeat(80);
		for (let i = 13; i < 24; i++) {
			assert.equal(ansiOutput.outputLines[i].outputRuns.length, 1);
			assert.equal(ansiOutput.outputLines[i].outputRuns[0].text, spaces);
		}
	});

	test('Tests ED 1', () => {
		const ansiOutput = setupStandardScreen();
		ansiOutput.processOutput(makeCUP(13, 41));
		checkOutputPosition(ansiOutput, 12, 40);
		ansiOutput.processOutput(makeED('beginning-of-screen'));
		const spaces = ' '.repeat(80);
		for (let i = 0; i < 12; i++) {
			assert.equal(ansiOutput.outputLines[i].outputRuns.length, 1);
			assert.equal(ansiOutput.outputLines[i].outputRuns[0].text, spaces);
		}
		assert.equal(ansiOutput.outputLines[12].outputRuns.length, 2);
		assert.equal(ansiOutput.outputLines[12].outputRuns[0].text, '                                        ');
		assert.equal(ansiOutput.outputLines[12].outputRuns[1].text, '0000000000000000000000000000000000000000');
		const zeros = '0'.repeat(80);
		for (let i = 13; i < 24; i++) {
			assert.equal(ansiOutput.outputLines[i].outputRuns.length, 1);
			assert.equal(ansiOutput.outputLines[i].outputRuns[0].text, zeros);
		}
	});

	test('Tests ED 2 from the bottom', () => {
		const ansiOutput = setupStandardScreen();
		ansiOutput.processOutput(makeED('entire-screen'));
		checkOutputPosition(ansiOutput, 24, 80);
		assert.equal(ansiOutput.outputLines.length, 25);
		const spaces = ' '.repeat(80);
		for (let i = 0; i < 25; i++) {
			assert.equal(ansiOutput.outputLines[i].outputRuns.length, 1);
			assert.equal(ansiOutput.outputLines[i].outputRuns[0].text, spaces);
		}
	});

	test('Tests ED 2 from the top', () => {
		const ansiOutput = setupStandardScreen();
		ansiOutput.processOutput(makeCUP());
		ansiOutput.processOutput(makeED('entire-screen'));
		checkOutputPosition(ansiOutput, 0, 0);
		assert.equal(ansiOutput.outputLines.length, 25);
		const spaces = ' '.repeat(80);
		for (let i = 0; i < 25; i++) {
			assert.equal(ansiOutput.outputLines[i].outputRuns.length, 1);
			assert.equal(ansiOutput.outputLines[i].outputRuns[0].text, spaces);
		}
	});

	test("Tests EL 0 when there is nothing to clear", () => {
		const ansiOutput = new ANSIOutput();
		ansiOutput.processOutput(makeEL("end-of-line"));
		assert.equal(ansiOutput.outputLines[0].outputRuns.length, 0);
	});

	test('Tests EL 0 using implicit 0', () => {
		const ansiOutput = new ANSIOutput();
		ansiOutput.processOutput('0'.repeat(80));
		ansiOutput.processOutput(CR);
		ansiOutput.processOutput(makeEL('end-of-line'));
		assert.equal(ansiOutput.outputLines[0].outputRuns.length, 1);
		assert.equal(ansiOutput.outputLines[0].outputRuns[0].text, ' '.repeat(80));
	});

	test('Tests EL 0 using explicit 0', () => {
		const ansiOutput = new ANSIOutput();
		ansiOutput.processOutput('0'.repeat(80));
		ansiOutput.processOutput(CR);
		ansiOutput.processOutput(makeEL('end-of-line-explicit-0'));
		assert.equal(ansiOutput.outputLines[0].outputRuns.length, 1);
		assert.equal(ansiOutput.outputLines[0].outputRuns[0].text, ' '.repeat(80));
	});

	test('Tests EL 1', () => {
		const ansiOutput = new ANSIOutput();
		ansiOutput.processOutput('0'.repeat(80));
		ansiOutput.processOutput(makeEL('beginning-of-line'));
		assert.equal(ansiOutput.outputLines[0].outputRuns.length, 1);
		assert.equal(ansiOutput.outputLines[0].outputRuns[0].text, ' '.repeat(80));
	});

	test('Tests EL 2', () => {
		const ansiOutput = new ANSIOutput();
		ansiOutput.processOutput('0'.repeat(80));
		ansiOutput.processOutput(makeCUP(1, 41));
		ansiOutput.processOutput(makeEL('entire-line'));
		assert.equal(ansiOutput.outputLines[0].outputRuns.length, 1);
		assert.equal(ansiOutput.outputLines[0].outputRuns[0].text, ' '.repeat(80));
	});

	test('Tests foreground colors with no background colors', () => {
		const testScenarios: SGRTestScenario[] = [
			{
				sgr: [
					SGRParam.ForegroundBlack
				],
				ansiFormat: {
					foregroundColor: ANSIColor.Black
				}
			},
			{
				sgr: [
					SGRParam.ForegroundRed
				],
				ansiFormat: {
					foregroundColor: ANSIColor.Red
				}
			},
			{
				sgr: [
					SGRParam.ForegroundGreen
				],
				ansiFormat: {
					foregroundColor: ANSIColor.Green
				}
			},
			{
				sgr: [
					SGRParam.ForegroundYellow
				],
				ansiFormat: {
					foregroundColor: ANSIColor.Yellow
				}
			},
			{
				sgr: [
					SGRParam.ForegroundBlue
				],
				ansiFormat: {
					foregroundColor: ANSIColor.Blue
				}
			},
			{
				sgr: [
					SGRParam.ForegroundMagenta
				],
				ansiFormat: {
					foregroundColor: ANSIColor.Magenta
				}
			},
			{
				sgr: [
					SGRParam.ForegroundCyan
				],
				ansiFormat: {
					foregroundColor: ANSIColor.Cyan
				}
			},
			{
				sgr: [
					SGRParam.ForegroundWhite
				],
				ansiFormat: {
					foregroundColor: ANSIColor.White
				}
			},
			{
				sgr: [
					SGRParam.ForegroundBrightBlack
				],
				ansiFormat: {
					foregroundColor: ANSIColor.BrightBlack
				}
			},
			{
				sgr: [
					SGRParam.ForegroundBrightRed
				],
				ansiFormat: {
					foregroundColor: ANSIColor.BrightRed
				}
			},
			{
				sgr: [
					SGRParam.ForegroundBrightGreen
				],
				ansiFormat: {
					foregroundColor: ANSIColor.BrightGreen
				}
			},
			{
				sgr: [
					SGRParam.ForegroundBrightYellow
				],
				ansiFormat: {
					foregroundColor: ANSIColor.BrightYellow
				}
			},
			{
				sgr: [
					SGRParam.ForegroundBrightBlue
				],
				ansiFormat: {
					foregroundColor: ANSIColor.BrightBlue
				}
			},
			{
				sgr: [
					SGRParam.ForegroundBrightMagenta
				],
				ansiFormat: {
					foregroundColor: ANSIColor.BrightMagenta
				}
			},
			{
				sgr: [
					SGRParam.ForegroundBrightCyan
				],
				ansiFormat: {
					foregroundColor: ANSIColor.BrightCyan
				}
			},
			{
				sgr: [
					SGRParam.ForegroundBrightWhite
				],
				ansiFormat: {
					foregroundColor: ANSIColor.BrightWhite
				}
			}
		];

		for (const testScenario of testScenarios) {
			const ansiOutput = new ANSIOutput();
			ansiOutput.processOutput(`${makeSGR(...testScenario.sgr)}${PANGRAM}${makeSGR()}`);
			const outputLines = ansiOutput.outputLines;
			assert.equal(outputLines.length, 1);
			assert.equal(outputLines[0].outputRuns.length, 1);
			assert.equal(outputLines[0].outputRuns[0].text, PANGRAM);
			assert.notEqual(outputLines[0].outputRuns[0].format, undefined);
			assert.equal(outputLines[0].outputRuns[0].format!.styles, testScenario.ansiFormat.styles);
			assert.equal(outputLines[0].outputRuns[0].format!.foregroundColor, testScenario.ansiFormat.foregroundColor);
			assert.equal(outputLines[0].outputRuns[0].format!.backgroundColor, testScenario.ansiFormat.backgroundColor);
			assert.equal(outputLines[0].outputRuns[0].format!.underlinedColor, testScenario.ansiFormat.underlinedColor);
			assert.equal(outputLines[0].outputRuns[0].format!.font, testScenario.ansiFormat.font);
		}
	});

	test('Tests background colors and automatically contrasting foreground colors', () => {
		const testScenarios: SGRTestScenario[] = [
			{
				sgr: [
					SGRParam.BackgroundBlack
				],
				ansiFormat: {
					foregroundColor: ANSIColor.White,
					backgroundColor: ANSIColor.Black
				}
			},
			{
				sgr: [
					SGRParam.BackgroundRed
				],
				ansiFormat: {
					foregroundColor: ANSIColor.White,
					backgroundColor: ANSIColor.Red
				}
			},
			{
				sgr: [
					SGRParam.BackgroundGreen
				],
				ansiFormat: {
					foregroundColor: ANSIColor.Black,
					backgroundColor: ANSIColor.Green
				}
			},
			{
				sgr: [
					SGRParam.BackgroundYellow
				],
				ansiFormat: {
					foregroundColor: ANSIColor.Black,
					backgroundColor: ANSIColor.Yellow
				}
			},
			{
				sgr: [
					SGRParam.BackgroundBlue
				],
				ansiFormat: {
					foregroundColor: ANSIColor.Black,
					backgroundColor: ANSIColor.Blue
				}
			},
			{
				sgr: [
					SGRParam.BackgroundMagenta
				],
				ansiFormat: {
					foregroundColor: ANSIColor.Black,
					backgroundColor: ANSIColor.Magenta
				}
			},
			{
				sgr: [
					SGRParam.BackgroundCyan
				],
				ansiFormat: {
					foregroundColor: ANSIColor.Black,
					backgroundColor: ANSIColor.Cyan
				}
			},
			{
				sgr: [
					SGRParam.BackgroundWhite
				],
				ansiFormat: {
					foregroundColor: ANSIColor.Black,
					backgroundColor: ANSIColor.White
				}
			},
			{
				sgr: [
					SGRParam.BackgroundBrightBlack
				],
				ansiFormat: {
					foregroundColor: ANSIColor.White,
					backgroundColor: ANSIColor.BrightBlack
				}
			},
			{
				sgr: [
					SGRParam.BackgroundBrightRed
				],
				ansiFormat: {
					foregroundColor: ANSIColor.White,
					backgroundColor: ANSIColor.BrightRed
				}
			},
			{
				sgr: [
					SGRParam.BackgroundBrightGreen
				],
				ansiFormat: {
					foregroundColor: ANSIColor.Black,
					backgroundColor: ANSIColor.BrightGreen
				}
			},
			{
				sgr: [
					SGRParam.BackgroundBrightYellow
				],
				ansiFormat: {
					foregroundColor: ANSIColor.Black,
					backgroundColor: ANSIColor.BrightYellow
				}
			},
			{
				sgr: [
					SGRParam.BackgroundBrightBlue
				],
				ansiFormat: {
					foregroundColor: ANSIColor.Black,
					backgroundColor: ANSIColor.BrightBlue
				}
			},
			{
				sgr: [
					SGRParam.BackgroundBrightMagenta
				],
				ansiFormat: {
					foregroundColor: ANSIColor.Black,
					backgroundColor: ANSIColor.BrightMagenta
				}
			},
			{
				sgr: [
					SGRParam.BackgroundBrightCyan
				],
				ansiFormat: {
					foregroundColor: ANSIColor.Black,
					backgroundColor: ANSIColor.BrightCyan
				}
			},
			{
				sgr: [
					SGRParam.BackgroundBrightWhite
				],
				ansiFormat: {
					foregroundColor: ANSIColor.Black,
					backgroundColor: ANSIColor.BrightWhite
				}
			}
		];

		for (const testScenario of testScenarios) {
			const ansiOutput = new ANSIOutput();
			ansiOutput.processOutput(`${makeSGR(...testScenario.sgr)}${PANGRAM}${makeSGR()}`);
			const outputLines = ansiOutput.outputLines;
			assert.equal(outputLines.length, 1);
			assert.equal(outputLines[0].outputRuns.length, 1);
			assert.equal(outputLines[0].outputRuns[0].text, PANGRAM);
			assert.notEqual(outputLines[0].outputRuns[0].format, undefined);
			assert.equal(outputLines[0].outputRuns[0].format!.styles, testScenario.ansiFormat.styles);
			assert.equal(outputLines[0].outputRuns[0].format!.foregroundColor, testScenario.ansiFormat.foregroundColor);
			assert.equal(outputLines[0].outputRuns[0].format!.backgroundColor, testScenario.ansiFormat.backgroundColor);
			assert.equal(outputLines[0].outputRuns[0].format!.underlinedColor, testScenario.ansiFormat.underlinedColor);
			assert.equal(outputLines[0].outputRuns[0].format!.font, testScenario.ansiFormat.font);
		}
	});

	test('Tests ANSI 16 matrix', () => {
		type SGRToAnsiColorMap = [SGRParam, ANSIColor];

		const foregroundColors: SGRToAnsiColorMap[] = [
			[SGRParam.ForegroundBlack, ANSIColor.Black],
			[SGRParam.ForegroundRed, ANSIColor.Red],
			[SGRParam.ForegroundGreen, ANSIColor.Green],
			[SGRParam.ForegroundYellow, ANSIColor.Yellow],
			[SGRParam.ForegroundBlue, ANSIColor.Blue],
			[SGRParam.ForegroundMagenta, ANSIColor.Magenta],
			[SGRParam.ForegroundCyan, ANSIColor.Cyan],
			[SGRParam.ForegroundWhite, ANSIColor.White],
			[SGRParam.ForegroundBrightBlack, ANSIColor.BrightBlack],
			[SGRParam.ForegroundBrightRed, ANSIColor.BrightRed],
			[SGRParam.ForegroundBrightGreen, ANSIColor.BrightGreen],
			[SGRParam.ForegroundBrightYellow, ANSIColor.BrightYellow],
			[SGRParam.ForegroundBrightBlue, ANSIColor.BrightBlue],
			[SGRParam.ForegroundBrightMagenta, ANSIColor.BrightMagenta],
			[SGRParam.ForegroundBrightCyan, ANSIColor.BrightCyan],
			[SGRParam.ForegroundBrightWhite, ANSIColor.BrightWhite]
		];

		const backgroundColors: SGRToAnsiColorMap[] = [
			[SGRParam.BackgroundBlack, ANSIColor.Black],
			[SGRParam.BackgroundRed, ANSIColor.Red],
			[SGRParam.BackgroundGreen, ANSIColor.Green],
			[SGRParam.BackgroundYellow, ANSIColor.Yellow],
			[SGRParam.BackgroundBlue, ANSIColor.Blue],
			[SGRParam.BackgroundMagenta, ANSIColor.Magenta],
			[SGRParam.BackgroundCyan, ANSIColor.Cyan],
			[SGRParam.BackgroundWhite, ANSIColor.White],
			[SGRParam.BackgroundBrightBlack, ANSIColor.BrightBlack],
			[SGRParam.BackgroundBrightRed, ANSIColor.BrightRed],
			[SGRParam.BackgroundBrightGreen, ANSIColor.BrightGreen],
			[SGRParam.BackgroundBrightYellow, ANSIColor.BrightYellow],
			[SGRParam.BackgroundBrightBlue, ANSIColor.BrightBlue],
			[SGRParam.BackgroundBrightMagenta, ANSIColor.BrightMagenta],
			[SGRParam.BackgroundBrightCyan, ANSIColor.BrightCyan],
			[SGRParam.BackgroundBrightWhite, ANSIColor.BrightWhite]
		];

		const testScenarios: SGRTestScenario[] = [];
		for (const foregroundColor of foregroundColors) {
			for (const backgroundColor of backgroundColors) {
				testScenarios.push({
					sgr: [foregroundColor[0], backgroundColor[0]],
					ansiFormat: {
						foregroundColor: foregroundColor[1],
						backgroundColor: backgroundColor[1]
					}
				});
			}
		}

		for (const testScenario of testScenarios) {
			const ansiOutput = new ANSIOutput();
			ansiOutput.processOutput(`${makeSGR(...testScenario.sgr)}${PANGRAM}${makeSGR()}`);
			const outputLines = ansiOutput.outputLines;
			assert.equal(outputLines.length, 1);
			assert.equal(outputLines[0].outputRuns.length, 1);
			assert.equal(outputLines[0].outputRuns[0].text, PANGRAM);
			assert.notEqual(outputLines[0].outputRuns[0].format, undefined);
			assert.equal(outputLines[0].outputRuns[0].format!.styles, testScenario.ansiFormat.styles);
			assert.equal(outputLines[0].outputRuns[0].format!.foregroundColor, testScenario.ansiFormat.foregroundColor);
			assert.equal(outputLines[0].outputRuns[0].format!.backgroundColor, testScenario.ansiFormat.backgroundColor);
			assert.equal(outputLines[0].outputRuns[0].format!.underlinedColor, testScenario.ansiFormat.underlinedColor);
			assert.equal(outputLines[0].outputRuns[0].format!.font, testScenario.ansiFormat.font);
		}
	});

	test('Tests ANSI 256 matrix', () => {
		const testScenarios: SGRTestScenario[] = [];
		for (let foregroundIndex = 0; foregroundIndex < 256; foregroundIndex++) {
			for (let backgroundIndex = 0; backgroundIndex < 256; backgroundIndex++) {
				testScenarios.push({
					sgr: [
						SGRParam.SetForeground,
						SGRParamColor.Color256,
						foregroundIndex,
						SGRParam.SetBackground,
						SGRParamColor.Color256,
						backgroundIndex
					],
					ansiFormat: {
						foregroundColor: map8BitColorIndexToColor(foregroundIndex),
						backgroundColor: map8BitColorIndexToColor(backgroundIndex)
					}
				});
			}
		}

		for (const testScenario of testScenarios) {
			const ansiOutput = new ANSIOutput();
			ansiOutput.processOutput(`${makeSGR(...testScenario.sgr)}${PANGRAM}${makeSGR()}`);
			const outputLines = ansiOutput.outputLines;
			assert.equal(outputLines.length, 1);
			assert.equal(outputLines[0].outputRuns.length, 1);
			assert.equal(outputLines[0].outputRuns[0].text, PANGRAM);
			assert.notEqual(outputLines[0].outputRuns[0].format, undefined);
			assert.equal(outputLines[0].outputRuns[0].format!.styles, testScenario.ansiFormat.styles);
			assert.equal(outputLines[0].outputRuns[0].format!.foregroundColor, testScenario.ansiFormat.foregroundColor);
			assert.equal(outputLines[0].outputRuns[0].format!.backgroundColor, testScenario.ansiFormat.backgroundColor);
			assert.equal(outputLines[0].outputRuns[0].format!.underlinedColor, testScenario.ansiFormat.underlinedColor);
			assert.equal(outputLines[0].outputRuns[0].format!.font, testScenario.ansiFormat.font);
		}
	});

	test('Tests ANSI RGB matrix', () => {
		const testScenarios: SGRTestScenario[] = [];
		for (let r = 0; r < 256; r++) {
			for (let g = 0; g < 256; g++) {
				testScenarios.push({
					sgr: [
						SGRParam.SetForeground,
						SGRParamColor.ColorRGB,
						r,
						g,
						128,
						SGRParam.SetBackground,
						SGRParamColor.ColorRGB,
						r,
						g,
						128,
					],
					ansiFormat: {
						foregroundColor: `#${twoDigitHex(r)}${twoDigitHex(g)}${twoDigitHex(128)}`,
						backgroundColor: `#${twoDigitHex(r)}${twoDigitHex(g)}${twoDigitHex(128)}`
					}
				});
			}
		}

		for (const testScenario of testScenarios) {
			const ansiOutput = new ANSIOutput();
			ansiOutput.processOutput(`${makeSGR(...testScenario.sgr)}${PANGRAM}${makeSGR()}`);
			const outputLines = ansiOutput.outputLines;
			assert.equal(outputLines.length, 1);
			assert.equal(outputLines[0].outputRuns.length, 1);
			assert.equal(outputLines[0].outputRuns[0].text, PANGRAM);
			assert.notEqual(outputLines[0].outputRuns[0].format, undefined);
			assert.equal(outputLines[0].outputRuns[0].format!.styles, testScenario.ansiFormat.styles);
			assert.equal(outputLines[0].outputRuns[0].format!.foregroundColor, testScenario.ansiFormat.foregroundColor);
			assert.equal(outputLines[0].outputRuns[0].format!.backgroundColor, testScenario.ansiFormat.backgroundColor);
			assert.equal(outputLines[0].outputRuns[0].format!.underlinedColor, testScenario.ansiFormat.underlinedColor);
			assert.equal(outputLines[0].outputRuns[0].format!.font, testScenario.ansiFormat.font);
		}
	});

	test('Tests insertion of blue text into an output run of red text', () => {
		const ansiOutput = new ANSIOutput();
		ansiOutput.processOutput(`${makeSGR(SGRParam.ForegroundRed)}${'0'.repeat(80)}${makeSGR()}`);
		ansiOutput.processOutput(makeCUB(45));
		ansiOutput.processOutput(`${makeSGR(SGRParam.ForegroundBlue)}XXXXXXXXXX${makeSGR()}`);
		const outputLines = ansiOutput.outputLines;

		assert.equal(outputLines.length, 1);
		assert.equal(outputLines[0].outputRuns.length, 3);

		assert.ok(outputLines[0].outputRuns[0].id.length >= 1);
		assert.notEqual(outputLines[0].outputRuns[0].format, undefined);
		assert.equal(outputLines[0].outputRuns[0].format!.styles, undefined);
		assert.equal(outputLines[0].outputRuns[0].format!.foregroundColor, ANSIColor.Red);
		assert.equal(outputLines[0].outputRuns[0].format!.backgroundColor, undefined);
		assert.equal(outputLines[0].outputRuns[0].format!.underlinedColor, undefined);
		assert.equal(outputLines[0].outputRuns[0].format!.font, undefined);
		assert.equal(outputLines[0].outputRuns[0].text, '00000000000000000000000000000000000');

		assert.ok(outputLines[0].outputRuns[1].id.length >= 1);
		assert.notEqual(outputLines[0].outputRuns[1].format, undefined);
		assert.equal(outputLines[0].outputRuns[1].format!.styles, undefined);
		assert.equal(outputLines[0].outputRuns[1].format!.foregroundColor, ANSIColor.Blue);
		assert.equal(outputLines[0].outputRuns[1].format!.backgroundColor, undefined);
		assert.equal(outputLines[0].outputRuns[1].format!.underlinedColor, undefined);
		assert.equal(outputLines[0].outputRuns[1].format!.font, undefined);
		assert.equal(outputLines[0].outputRuns[1].text, 'XXXXXXXXXX');

		assert.ok(outputLines[0].outputRuns[2].id.length >= 1);
		assert.notEqual(outputLines[0].outputRuns[2].format, undefined);
		assert.equal(outputLines[0].outputRuns[2].format!.styles, undefined);
		assert.equal(outputLines[0].outputRuns[2].format!.foregroundColor, ANSIColor.Red);
		assert.equal(outputLines[0].outputRuns[2].format!.backgroundColor, undefined);
		assert.equal(outputLines[0].outputRuns[2].format!.underlinedColor, undefined);
		assert.equal(outputLines[0].outputRuns[2].format!.font, undefined);
		assert.equal(outputLines[0].outputRuns[2].text, '00000000000000000000000000000000000');
	});

	test("Tests styles", () => {
		const testStyle = (sgr: SGRParam, ansiStyle: ANSIStyle) => {
			const ansiOutput = new ANSIOutput();
			ansiOutput.processOutput(`${makeSGR(sgr)}${'0'.repeat(80)}${makeSGR()}`);
			const outputLines = ansiOutput.outputLines;
			assert.equal(outputLines.length, 1);
			assert.equal(outputLines[0].outputRuns.length, 1);
			assert.ok(outputLines[0].outputRuns[0].id.length >= 1);
			assert.notEqual(outputLines[0].outputRuns[0].format, undefined);
			assert.equal(outputLines[0].outputRuns[0].format!.styles!.length, 1);
			assert.equal(outputLines[0].outputRuns[0].format!.styles![0], ansiStyle);
			assert.equal(outputLines[0].outputRuns[0].format!.foregroundColor, undefined);
			assert.equal(outputLines[0].outputRuns[0].format!.backgroundColor, undefined);
			assert.equal(outputLines[0].outputRuns[0].format!.underlinedColor, undefined);
			assert.equal(outputLines[0].outputRuns[0].format!.font, undefined);
			assert.equal(outputLines[0].outputRuns[0].text, '0'.repeat(80));
		};

		testStyle(SGRParam.Bold, ANSIStyle.Bold);
		testStyle(SGRParam.Dim, ANSIStyle.Dim);
		testStyle(SGRParam.Italic, ANSIStyle.Italic);
		testStyle(SGRParam.Underlined, ANSIStyle.Underlined);
		testStyle(SGRParam.SlowBlink, ANSIStyle.SlowBlink);
		testStyle(SGRParam.RapidBlink, ANSIStyle.RapidBlink);
		testStyle(SGRParam.Hidden, ANSIStyle.Hidden);
		testStyle(SGRParam.CrossedOut, ANSIStyle.CrossedOut);
		testStyle(SGRParam.Fraktur, ANSIStyle.Fraktur);
		testStyle(SGRParam.DoubleUnderlined, ANSIStyle.DoubleUnderlined);
	});

	test('Tests OSC 8 scenario 1', () => {
		const linkText = 'This is LOTAS!!!';
		const linkURL = 'http://www.lotas.io';
		const ansiOutput = new ANSIOutput();
		ansiOutput.processOutput(makeOSC8(linkText, linkURL));
		const outputLines = ansiOutput.outputLines;

		assert.equal(outputLines.length, 1);
		assert.ok(outputLines[0].id.length >= 1);
		assert.equal(outputLines[0].outputRuns.length, 1);
		assert.equal(outputLines[0].outputRuns[0].format, undefined);
		assert.notEqual(outputLines[0].outputRuns[0].hyperlink, undefined);
		assert.equal(outputLines[0].outputRuns[0].hyperlink!.url, linkURL);
		assert.equal(outputLines[0].outputRuns[0].hyperlink!.params, undefined);
		assert.equal(outputLines[0].outputRuns[0].text, linkText);
	});

	test('Tests OSC 8 scenario 2', () => {
		const linkText = 'This is LOTAS!!!';
		const linkURL = 'http://www.lotas.io';
		const ansiOutput = new ANSIOutput();
		ansiOutput.processOutput(PANGRAM);
		ansiOutput.processOutput(makeOSC8(linkText, linkURL));
		ansiOutput.processOutput(PANGRAM);
		const outputLines = ansiOutput.outputLines;

		assert.equal(outputLines.length, 1);

		assert.ok(outputLines[0].id.length >= 1);
		assert.equal(outputLines[0].outputRuns.length, 3);

		assert.ok(outputLines[0].outputRuns[0].id.length >= 1);
		assert.equal(outputLines[0].outputRuns[0].format, undefined);
		assert.equal(outputLines[0].outputRuns[0].hyperlink, undefined);
		assert.equal(outputLines[0].outputRuns[0].text, PANGRAM);

		assert.ok(outputLines[0].outputRuns[1].id.length >= 1);
		assert.equal(outputLines[0].outputRuns[1].format, undefined);
		assert.notEqual(outputLines[0].outputRuns[1].hyperlink, undefined);
		assert.equal(outputLines[0].outputRuns[1].hyperlink!.url, linkURL);
		assert.equal(outputLines[0].outputRuns[1].hyperlink!.params, undefined);
		assert.equal(outputLines[0].outputRuns[1].text, linkText);

		assert.ok(outputLines[0].outputRuns[2].id.length >= 1);
		assert.equal(outputLines[0].outputRuns[2].format, undefined);
		assert.equal(outputLines[0].outputRuns[2].hyperlink, undefined);
		assert.equal(outputLines[0].outputRuns[2].text, PANGRAM);
	});

	test('Tests OSC 8 scenario 3', () => {
		const linkText = 'This is LOTAS!!!';
		const linkURL = 'http://www.lotas.io';
		const ansiOutput = new ANSIOutput();
		ansiOutput.processOutput(PANGRAM + '\n');
		ansiOutput.processOutput(makeOSC8(`${linkText}\n${linkText}\n`, linkURL));
		ansiOutput.processOutput(PANGRAM);
		const outputLines = ansiOutput.outputLines;

		assert.equal(outputLines.length, 4);

		assert.ok(outputLines[0].id.length >= 1);
		assert.equal(outputLines[0].outputRuns.length, 1);
		assert.ok(outputLines[0].outputRuns[0].id.length >= 1);
		assert.equal(outputLines[0].outputRuns[0].format, undefined);
		assert.equal(outputLines[0].outputRuns[0].text, PANGRAM);

		assert.ok(outputLines[1].id.length >= 1);
		assert.equal(outputLines[1].outputRuns.length, 1);
		assert.ok(outputLines[1].outputRuns[0].id.length >= 1);
		assert.equal(outputLines[1].outputRuns[0].format, undefined);
		assert.notEqual(outputLines[1].outputRuns[0].hyperlink, undefined);
		assert.equal(outputLines[1].outputRuns[0].hyperlink!.url, linkURL);
		assert.equal(outputLines[1].outputRuns[0].hyperlink!.params, undefined);
		assert.equal(outputLines[1].outputRuns[0].text, linkText);

		assert.ok(outputLines[2].id.length >= 1);
		assert.equal(outputLines[2].outputRuns.length, 1);
		assert.ok(outputLines[2].outputRuns[0].id.length >= 1);
		assert.equal(outputLines[2].outputRuns[0].format, undefined);
		assert.notEqual(outputLines[2].outputRuns[0].hyperlink, undefined);
		assert.equal(outputLines[2].outputRuns[0].hyperlink!.url, linkURL);
		assert.equal(outputLines[1].outputRuns[0].hyperlink!.params, undefined);
		assert.equal(outputLines[2].outputRuns[0].text, linkText);

		assert.ok(outputLines[3].id.length >= 1);
		assert.equal(outputLines[3].outputRuns.length, 1);
		assert.ok(outputLines[3].outputRuns[0].id.length >= 1);
		assert.equal(outputLines[3].outputRuns[0].format, undefined);
		assert.equal(outputLines[3].outputRuns[0].text, PANGRAM);
	});

	test('Tests OSC 8 scenario 4', () => {
		const linkText = 'This is LOTAS!!!';
		const linkURL = 'http://www.lotas.io';
		const ansiOutput = new ANSIOutput();
		ansiOutput.processOutput(PANGRAM + '\n');
		ansiOutput.processOutput(makeOSC8(`${makeSGR(SGRParam.ForegroundRed)}${linkText}\n${linkText}${makeSGR()}\n`, linkURL));
		ansiOutput.processOutput(PANGRAM);
		const outputLines = ansiOutput.outputLines;

		assert.equal(outputLines.length, 4);

		assert.ok(outputLines[0].id.length >= 1);
		assert.equal(outputLines[0].outputRuns.length, 1);
		assert.ok(outputLines[0].outputRuns[0].id.length >= 1);
		assert.equal(outputLines[0].outputRuns[0].format, undefined);
		assert.equal(outputLines[0].outputRuns[0].text, PANGRAM);

		assert.ok(outputLines[1].id.length >= 1);
		assert.equal(outputLines[1].outputRuns.length, 1);
		assert.ok(outputLines[1].outputRuns[0].id.length >= 1);
		assert.notEqual(outputLines[1].outputRuns[0].format, undefined);
		assert.equal(outputLines[1].outputRuns[0].format!.foregroundColor, ANSIColor.Red);
		assert.notEqual(outputLines[1].outputRuns[0].hyperlink, undefined);
		assert.equal(outputLines[1].outputRuns[0].hyperlink!.url, linkURL);
		assert.equal(outputLines[1].outputRuns[0].hyperlink!.params, undefined);
		assert.equal(outputLines[1].outputRuns[0].text, linkText);

		assert.ok(outputLines[2].id.length >= 1);
		assert.equal(outputLines[2].outputRuns.length, 1);
		assert.ok(outputLines[2].outputRuns[0].id.length >= 1);
		assert.notEqual(outputLines[2].outputRuns[0].format, undefined);
		assert.equal(outputLines[2].outputRuns[0].format!.foregroundColor, ANSIColor.Red);
		assert.notEqual(outputLines[2].outputRuns[0].hyperlink, undefined);
		assert.equal(outputLines[2].outputRuns[0].hyperlink!.url, linkURL);
		assert.equal(outputLines[2].outputRuns[0].hyperlink!.params, undefined);
		assert.equal(outputLines[2].outputRuns[0].text, linkText);

		assert.ok(outputLines[3].id.length >= 1);
		assert.equal(outputLines[3].outputRuns.length, 1);
		assert.ok(outputLines[3].outputRuns[0].id.length >= 1);
		assert.equal(outputLines[3].outputRuns[0].format, undefined);
		assert.equal(outputLines[3].outputRuns[0].text, PANGRAM);
	});

	const testOutputLines = (count: number, terminator: string) => {
		const lines = makeLines(count);
		const ansiOutput = new ANSIOutput();
		ansiOutput.processOutput(lines.join(terminator));
		const outputLines = ansiOutput.outputLines;

		assert.equal(outputLines.length, lines.length);
		for (let i = 0; i < outputLines.length; i++) {
			if (!lines[i].length) {
				assert.equal(outputLines[i].outputRuns.length, 0);
			} else {
				assert.ok(outputLines[i].id.length >= 1);
				assert.equal(outputLines[i].outputRuns.length, 1);
				assert.equal(outputLines[i].outputRuns[0].text.length, lines[i].length);
			}
		}
	};

	const checkOutputPosition = (ansiOutput: ANSIOutput, outputLine: number, outputColumn: number) => {
		assert.equal(ansiOutput['_outputLine' as keyof ANSIOutput] as unknown as number, outputLine);
		assert.equal(ansiOutput['_outputColumn' as keyof ANSIOutput] as unknown as number, outputColumn);
	};

	ensureNoDisposablesAreLeakedInTestSuite();
});
