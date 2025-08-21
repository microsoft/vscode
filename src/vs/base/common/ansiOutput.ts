/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2025 Lotas Inc. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

let identifier = 0;

export enum ANSIStyle {
	Bold = 'ansiBold',
	Dim = 'ansiDim',
	Italic = 'ansiItalic',
	Underlined = 'ansiUnderlined',
	SlowBlink = 'ansiSlowBlink',
	RapidBlink = 'ansiRapidBlink',
	Hidden = 'ansiHidden',
	CrossedOut = 'ansiCrossedOut',
	Fraktur = 'ansiFraktur',
	DoubleUnderlined = 'ansiDoubleUnderlined',
	Framed = 'ansiFramed',
	Encircled = 'ansiEncircled',
	Overlined = 'ansiOverlined',
	Superscript = 'ansiSuperscript',
	Subscript = 'ansiSubscript'
}

export enum ANSIFont {
	AlternativeFont1 = 'ansiAlternativeFont1',
	AlternativeFont2 = 'ansiAlternativeFont2',
	AlternativeFont3 = 'ansiAlternativeFont3',
	AlternativeFont4 = 'ansiAlternativeFont4',
	AlternativeFont5 = 'ansiAlternativeFont5',
	AlternativeFont6 = 'ansiAlternativeFont6',
	AlternativeFont7 = 'ansiAlternativeFont7',
	AlternativeFont8 = 'ansiAlternativeFont8',
	AlternativeFont9 = 'ansiAlternativeFont9'
}

export enum ANSIColor {
	Black = 'ansiBlack',
	Red = 'ansiRed',
	Green = 'ansiGreen',
	Yellow = 'ansiYellow',
	Blue = 'ansiBlue',
	Magenta = 'ansiMagenta',
	Cyan = 'ansiCyan',
	White = 'ansiWhite',
	BrightBlack = 'ansiBrightBlack',
	BrightRed = 'ansiBrightRed',
	BrightGreen = 'ansiBrightGreen',
	BrightYellow = 'ansiBrightYellow',
	BrightBlue = 'ansiBrightBlue',
	BrightMagenta = 'ansiBrightMagenta',
	BrightCyan = 'ansiBrightCyan',
	BrightWhite = 'ansiBrightWhite'
}

export interface ANSIOutputLine {
	readonly id: string;
	readonly outputRuns: ANSIOutputRun[];
}

export interface ANSIOutputRun {
	readonly id: string;
	readonly hyperlink?: ANSIHyperlink;
	readonly format?: ANSIFormat;
	readonly text: string;
}

export interface ANSIHyperlink {
	readonly url: string;
	readonly params?: Map<string, string>;
}

export interface ANSIFormat {
	readonly styles?: ANSIStyle[];
	readonly foregroundColor?: ANSIColor | string;
	readonly backgroundColor?: ANSIColor | string;
	readonly underlinedColor?: string;
	readonly font?: string;
}

export class ANSIOutput {
	private _parserState = ParserState.BufferingOutput;
	private _cs = '';
	private _sgrState?: SGRState = undefined;
	private _osc = '';
	private _outputLines: OutputLine[] = [];
	private _outputLine = 0;
	private _outputColumn = 0;
	private _buffer = '';
	private _pendingNewline = false;
	private _hyperlink?: Hyperlink;

	get isBuffering() {
		return this._parserState === ParserState.BufferingOutput;
	}

	get outputLines() {
		this.flushBuffer();
		return this._outputLines;
	}

	public static processOutput(output: string) {
		const ansiOutput = new ANSIOutput();
		ansiOutput.processOutput(output);
		return ansiOutput.outputLines;
	}

	copyStylesFrom(ansiOutput: ANSIOutput) {
		this._sgrState = !ansiOutput._sgrState || ansiOutput._sgrState.isNeutral ?
			undefined :
			ansiOutput._sgrState.copy();
	}

	processOutput(output: string) {
		for (let i = 0; i < output.length; i++) {
			if (this._pendingNewline) {
				this.flushBuffer();
				this._outputLine++;
				this._outputColumn = 0;
				this._pendingNewline = false;
			}

			const char = output.charAt(i);

			switch (this._parserState) {
				case ParserState.BufferingOutput: {
					switch (char) {
						case '\x1b': {
							this.flushBuffer();
							this._parserState = ParserState.EscapeSequenceStarted;
							break;
						}
						case '\x9b': {
							this.flushBuffer();
							this._cs = '';
							this._parserState = ParserState.ParsingControlSequence;
							break;
						}
						case '\x9d': {
							this.flushBuffer();
							this._osc = '';
							this._parserState = ParserState.ParsingOperatingSystemCommand;
							break;
						}
						default: {
							this.processCharacter(char);
							break;
						}
					}
					break;
				}

				case ParserState.EscapeSequenceStarted: {
					switch (char) {
						case '[': {
							this._cs = '';
							this._parserState = ParserState.ParsingControlSequence;
							break;
						}
						case ']': {
							this._osc = '';
							this._parserState = ParserState.ParsingOperatingSystemCommand;
							break;
						}
						default: {
							this._parserState = ParserState.BufferingOutput;
							this.processCharacter(char);
							break;
						}
					}
					break;
				}

				case ParserState.ParsingControlSequence: {
					this._cs += char;
					if (char.match(/^[A-Za-z]$/)) {
						this.processControlSequence();
					}
					break;
				}

				case ParserState.ParsingOperatingSystemCommand: {
					this._osc += char;
					const match = this._osc.match(/^(.*)(?:\x1b\x5c|\x07|\x9c)$/);
					if (match && match.length === 2) {
						this._osc = match[1];
						this.processOperatingSystemCommand();
					}
					break;
				}
			}
		}

		this.flushBuffer();
	}

	truncatedOutputLines(maxOutputLines: number) {
		if (maxOutputLines <= 0) {
			return [];
		}

		if (this.outputLines.length <= maxOutputLines) {
			return this.outputLines;
		}

		return this._outputLines.slice(-maxOutputLines);
	}

	private flushBuffer() {
		for (let i = this._outputLines.length; i < this._outputLine + 1; i++) {
			this._outputLines.push(new OutputLine());
		}

		if (this._buffer) {
			const outputLine = this._outputLines[this._outputLine];
			outputLine.insert(this._buffer, this._outputColumn, this._sgrState, this._hyperlink);
			this._outputColumn += this._buffer.length;
			this._buffer = '';
		}
	}

	private processCharacter(char: string) {
		switch (char) {
			case '\b': {
				this.flushBuffer();
				if (this._outputColumn > 0) {
					this._outputColumn--;
				}
				break;
			}
			case '\n': {
				this._pendingNewline = true;
				break;
			}
			case '\r': {
				this.flushBuffer();
				this._outputColumn = 0;
				break;
			}
			default: {
				this._buffer += char;
				break;
			}
		}
	}

	private processControlSequence() {
		switch (this._cs.charAt(this._cs.length - 1)) {
			case 'A': {
				this.processCUU();
				break;
			}
			case 'B': {
				this.processCUD();
				break;
			}
			case 'C': {
				this.processCUF();
				break;
			}
			case 'D': {
				this.processCUB();
				break;
			}
			case 'H': {
				this.processCUP();
				break;
			}
			case 'J': {
				this.processED();
				break;
			}
			case 'K': {
				this.processEL();
				break;
			}
			case 'm': {
				this.processSGR();
				break;
			}
			default: {
				break;
			}
		}

		this._parserState = ParserState.BufferingOutput;
	}

	private processCUU() {
		const match = this._cs.match(/^([0-9]*)A$/);
		if (match) {
			this._outputLine = Math.max(this._outputLine - rangeParam(match[1], 1, 1), 0);
		}
	}

	private processCUD() {
		const match = this._cs.match(/^([0-9]*)B$/);
		if (match) {
			this._outputLine = this._outputLine + rangeParam(match[1], 1, 1);
		}
	}

	private processCUF() {
		const match = this._cs.match(/^([0-9]*)C$/);
		if (match) {
			this._outputColumn = this._outputColumn + rangeParam(match[1], 1, 1);
		}
	}

	private processCUB() {
		const match = this._cs.match(/^([0-9]*)D$/);
		if (match) {
			this._outputColumn = Math.max(this._outputColumn - rangeParam(match[1], 1, 1), 0);
		}
	}

	private processCUP() {
		const match = this._cs.match(/^([0-9]*)(?:;?([0-9]*))H$/);
		if (match) {
			this._outputLine = rangeParam(match[1], 1, 1) - 1;
			this._outputColumn = rangeParam(match[2], 1, 1) - 1;
		}
	}

	private processED() {
		const match = this._cs.match(/^([0-9]*)J$/);
		if (match) {
			switch (getParam(match[1], 0)) {
				case 0: {
					this._outputLines[this._outputLine].clearToEndOfLine(this._outputColumn);
					for (let i = this._outputLine + 1; i < this._outputLines.length; i++) {
						this._outputLines[i].clearEntireLine();
					}
					break;
				}
				case 1: {
					this._outputLines[this._outputLine].clearToBeginningOfLine(this._outputColumn);
					for (let i = 0; i < this._outputLine; i++) {
						this._outputLines[i].clearEntireLine();
					}
					break;
				}
				case 2: {
					for (let i = 0; i < this._outputLines.length; i++) {
						this._outputLines[i].clearEntireLine();
					}
					break;
				}
			}
		}
	}

	private processEL() {
		const match = this._cs.match(/^([0-9]*)K$/);
		if (match) {
			const outputLine = this._outputLines[this._outputLine];

			switch (getParam(match[1], 0)) {
				case 0: {
					outputLine.clearToEndOfLine(this._outputColumn);
					break;
				}
				case 1: {
					outputLine.clearToBeginningOfLine(this._outputColumn);
					break;
				}
				case 2: {
					outputLine.clearEntireLine();
					break;
				}
			}
		}
	}

	private processSGR() {
		const sgrState = this._sgrState ? this._sgrState.copy() : new SGRState();

		const sgrParams = this._cs
			.slice(0, -1)
			.split(';')
			.map(sgrParam => sgrParam === '' ? SGRParam.Reset : parseInt(sgrParam, 10));

		for (let index = 0; index < sgrParams.length; index++) {
			const sgrParam = sgrParams[index];

			const processSetColor = (): ANSIColor | string | undefined => {
				if (index + 1 === sgrParams.length) {
					return undefined;
				}

				switch (sgrParams[++index]) {
					case SGRParamColor.Color256: {
						if (index + 1 === sgrParams.length) {
							return undefined;
						}

						const colorIndex = sgrParams[++index];

						switch (colorIndex) {
							case SGRParamIndexedColor.Black: {
								return ANSIColor.Black;
							}
							case SGRParamIndexedColor.Red: {
								return ANSIColor.Red;
							}
							case SGRParamIndexedColor.Green: {
								return ANSIColor.Green;
							}
							case SGRParamIndexedColor.Yellow: {
								return ANSIColor.Yellow;
							}
							case SGRParamIndexedColor.Blue: {
								return ANSIColor.Blue;
							}
							case SGRParamIndexedColor.Magenta: {
								return ANSIColor.Magenta;
							}
							case SGRParamIndexedColor.Cyan: {
								return ANSIColor.Cyan;
							}
							case SGRParamIndexedColor.White: {
								return ANSIColor.White;
							}
							case SGRParamIndexedColor.BrightBlack: {
								return ANSIColor.BrightBlack;
							}
							case SGRParamIndexedColor.BrightRed: {
								return ANSIColor.BrightRed;
							}
							case SGRParamIndexedColor.BrightGreen: {
								return ANSIColor.BrightGreen;
							}
							case SGRParamIndexedColor.BrightYellow: {
								return ANSIColor.BrightYellow;
							}
							case SGRParamIndexedColor.BrightBlue: {
								return ANSIColor.BrightBlue;
							}
							case SGRParamIndexedColor.BrightMagenta: {
								return ANSIColor.BrightMagenta;
							}
							case SGRParamIndexedColor.BrightCyan: {
								return ANSIColor.BrightCyan;
							}
							case SGRParamIndexedColor.BrightWhite: {
								return ANSIColor.BrightWhite;
							}
							default: {
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
						}
					}

					case SGRParamColor.ColorRGB: {
						const rgb = [0, 0, 0];
						for (let i = 0; i < 3 && index + 1 < sgrParams.length; i++) {
							rgb[i] = sgrParams[++index];
						}

						return '#' +
							twoDigitHex(rgb[0]) +
							twoDigitHex(rgb[1]) +
							twoDigitHex(rgb[2]);
					}
				}

				return undefined;
			};

			switch (sgrParam) {
				case SGRParam.Reset: {
					sgrState.reset();
					break;
				}
				case SGRParam.Bold: {
					sgrState.setStyle(ANSIStyle.Bold);
					break;
				}
				case SGRParam.Dim: {
					sgrState.setStyle(ANSIStyle.Dim);
					break;
				}
				case SGRParam.Italic: {
					sgrState.setStyle(ANSIStyle.Italic);
					break;
				}
				case SGRParam.Underlined: {
					sgrState.setStyle(ANSIStyle.Underlined, ANSIStyle.DoubleUnderlined);
					break;
				}
				case SGRParam.SlowBlink: {
					sgrState.setStyle(ANSIStyle.SlowBlink, ANSIStyle.RapidBlink);
					break;
				}
				case SGRParam.RapidBlink: {
					sgrState.setStyle(ANSIStyle.RapidBlink, ANSIStyle.SlowBlink);
					break;
				}
				case SGRParam.Reversed: {
					sgrState.setReversed(true);
					break;
				}
				case SGRParam.Hidden: {
					sgrState.setStyle(ANSIStyle.Hidden);
					break;
				}
				case SGRParam.CrossedOut: {
					sgrState.setStyle(ANSIStyle.CrossedOut);
					break;
				}
				case SGRParam.PrimaryFont: {
					sgrState.setFont();
					break;
				}
				case SGRParam.AlternativeFont1: {
					sgrState.setFont(ANSIFont.AlternativeFont1);
					break;
				}
				case SGRParam.AlternativeFont2: {
					sgrState.setFont(ANSIFont.AlternativeFont2);
					break;
				}
				case SGRParam.AlternativeFont3: {
					sgrState.setFont(ANSIFont.AlternativeFont3);
					break;
				}
				case SGRParam.AlternativeFont4: {
					sgrState.setFont(ANSIFont.AlternativeFont4);
					break;
				}
				case SGRParam.AlternativeFont5: {
					sgrState.setFont(ANSIFont.AlternativeFont5);
					break;
				}
				case SGRParam.AlternativeFont6: {
					sgrState.setFont(ANSIFont.AlternativeFont6);
					break;
				}
				case SGRParam.AlternativeFont7: {
					sgrState.setFont(ANSIFont.AlternativeFont7);
					break;
				}
				case SGRParam.AlternativeFont8: {
					sgrState.setFont(ANSIFont.AlternativeFont8);
					break;
				}
				case SGRParam.AlternativeFont9: {
					sgrState.setFont(ANSIFont.AlternativeFont9);
					break;
				}
				case SGRParam.Fraktur: {
					sgrState.setStyle(ANSIStyle.Fraktur);
					break;
				}
				case SGRParam.DoubleUnderlined: {
					sgrState.setStyle(ANSIStyle.DoubleUnderlined, ANSIStyle.Underlined);
					break;
				}
				case SGRParam.NormalIntensity: {
					sgrState.deleteStyles(ANSIStyle.Bold, ANSIStyle.Dim);
					break;
				}
				case SGRParam.NotItalicNotFraktur: {
					sgrState.deleteStyles(ANSIStyle.Italic, ANSIStyle.Fraktur);
					break;
				}
				case SGRParam.NotUnderlined: {
					sgrState.deleteStyles(ANSIStyle.Underlined, ANSIStyle.DoubleUnderlined);
					break;
				}
				case SGRParam.NotBlinking: {
					sgrState.deleteStyles(ANSIStyle.SlowBlink, ANSIStyle.RapidBlink);
					break;
				}
				case SGRParam.ProportionalSpacing: {
					break;
				}
				case SGRParam.NotReversed: {
					sgrState.setReversed(false);
					break;
				}
				case SGRParam.Reveal: {
					sgrState.deleteStyles(ANSIStyle.Hidden);
					break;
				}
				case SGRParam.NotCrossedOut: {
					sgrState.deleteStyles(ANSIStyle.CrossedOut);
					break;
				}
				case SGRParam.ForegroundBlack: {
					sgrState.setForegroundColor(ANSIColor.Black);
					break;
				}
				case SGRParam.ForegroundRed: {
					sgrState.setForegroundColor(ANSIColor.Red);
					break;
				}
				case SGRParam.ForegroundGreen: {
					sgrState.setForegroundColor(ANSIColor.Green);
					break;
				}
				case SGRParam.ForegroundYellow: {
					sgrState.setForegroundColor(ANSIColor.Yellow);
					break;
				}
				case SGRParam.ForegroundBlue: {
					sgrState.setForegroundColor(ANSIColor.Blue);
					break;
				}
				case SGRParam.ForegroundMagenta: {
					sgrState.setForegroundColor(ANSIColor.Magenta);
					break;
				}
				case SGRParam.ForegroundCyan: {
					sgrState.setForegroundColor(ANSIColor.Cyan);
					break;
				}
				case SGRParam.ForegroundWhite: {
					sgrState.setForegroundColor(ANSIColor.White);
					break;
				}
				case SGRParam.SetForeground: {
					const foregroundColor = processSetColor();
					if (foregroundColor) {
						sgrState.setForegroundColor(foregroundColor);
					}
					break;
				}
				case SGRParam.DefaultForeground: {
					sgrState.setForegroundColor();
					break;
				}
				case SGRParam.BackgroundBlack: {
					sgrState.setBackgroundColor(ANSIColor.Black);
					break;
				}
				case SGRParam.BackgroundRed: {
					sgrState.setBackgroundColor(ANSIColor.Red);
					break;
				}
				case SGRParam.BackgroundGreen: {
					sgrState.setBackgroundColor(ANSIColor.Green);
					break;
				}
				case SGRParam.BackgroundYellow: {
					sgrState.setBackgroundColor(ANSIColor.Yellow);
					break;
				}
				case SGRParam.BackgroundBlue: {
					sgrState.setBackgroundColor(ANSIColor.Blue);
					break;
				}
				case SGRParam.BackgroundMagenta: {
					sgrState.setBackgroundColor(ANSIColor.Magenta);
					break;
				}
				case SGRParam.BackgroundCyan: {
					sgrState.setBackgroundColor(ANSIColor.Cyan);
					break;
				}
				case SGRParam.BackgroundWhite: {
					sgrState.setBackgroundColor(ANSIColor.White);
					break;
				}
				case SGRParam.SetBackground: {
					const backgroundColor = processSetColor();
					if (backgroundColor) {
						sgrState.setBackgroundColor(backgroundColor);
					}
					break;
				}
				case SGRParam.DefaultBackground: {
					sgrState.setBackgroundColor();
					break;
				}
				case SGRParam.ForegroundBrightBlack: {
					sgrState.setForegroundColor(ANSIColor.BrightBlack);
					break;
				}
				case SGRParam.ForegroundBrightRed: {
					sgrState.setForegroundColor(ANSIColor.BrightRed);
					break;
				}
				case SGRParam.ForegroundBrightGreen: {
					sgrState.setForegroundColor(ANSIColor.BrightGreen);
					break;
				}
				case SGRParam.ForegroundBrightYellow: {
					sgrState.setForegroundColor(ANSIColor.BrightYellow);
					break;
				}
				case SGRParam.ForegroundBrightBlue: {
					sgrState.setForegroundColor(ANSIColor.BrightBlue);
					break;
				}
				case SGRParam.ForegroundBrightMagenta: {
					sgrState.setForegroundColor(ANSIColor.BrightMagenta);
					break;
				}
				case SGRParam.ForegroundBrightCyan: {
					sgrState.setForegroundColor(ANSIColor.BrightCyan);
					break;
				}
				case SGRParam.ForegroundBrightWhite: {
					sgrState.setForegroundColor(ANSIColor.BrightWhite);
					break;
				}
				case SGRParam.BackgroundBrightBlack: {
					sgrState.setBackgroundColor(ANSIColor.BrightBlack);
					break;
				}
				case SGRParam.BackgroundBrightRed: {
					sgrState.setBackgroundColor(ANSIColor.BrightRed);
					break;
				}
				case SGRParam.BackgroundBrightGreen: {
					sgrState.setBackgroundColor(ANSIColor.BrightGreen);
					break;
				}
				case SGRParam.BackgroundBrightYellow: {
					sgrState.setBackgroundColor(ANSIColor.BrightYellow);
					break;
				}
				case SGRParam.BackgroundBrightBlue: {
					sgrState.setBackgroundColor(ANSIColor.BrightBlue);
					break;
				}
				case SGRParam.BackgroundBrightMagenta: {
					sgrState.setBackgroundColor(ANSIColor.BrightMagenta);
					break;
				}
				case SGRParam.BackgroundBrightCyan: {
					sgrState.setBackgroundColor(ANSIColor.BrightCyan);
					break;
				}
				case SGRParam.BackgroundBrightWhite: {
					sgrState.setBackgroundColor(ANSIColor.BrightWhite);
					break;
				}
				default: {
					break;
				}
			}
		}

		this._sgrState = sgrState.isNeutral ? undefined : sgrState;
	}

	private processOperatingSystemCommand() {
		const match = this._osc.match(/^([0-9]+);(.*)$/);
		if (match && match.length === 3) {
			this._osc = match[2];

			switch (match[1]) {
				case '8': {
					this.processOSC8();
					break;
				}
				default: {
					break;
				}
			}
		}

		this._parserState = ParserState.BufferingOutput;
	}

	private processOSC8() {
		let hyperlink: Hyperlink | undefined = undefined;

		const match = this._osc.match(/^(.*?);(.*?)$/);
		if (match && match.length === 3) {
			const url = match[2].trim();

			if (url) {
				hyperlink = new Hyperlink(url, match[1].trim());
			}
		}

		this._hyperlink = hyperlink;
	}
}

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

enum SGRParamIndexedColor {
	Black = 0,
	Red = 1,
	Green = 2,
	Yellow = 3,
	Blue = 4,
	Magenta = 5,
	Cyan = 6,
	White = 7,
	BrightBlack = 8,
	BrightRed = 9,
	BrightGreen = 10,
	BrightYellow = 11,
	BrightBlue = 12,
	BrightMagenta = 13,
	BrightCyan = 14,
	BrightWhite = 15
}

enum ParserState {
	BufferingOutput,
	EscapeSequenceStarted,
	ParsingControlSequence,
	ParsingOperatingSystemCommand
}

class SGRState implements ANSIFormat {
	private _styles?: Set<ANSIStyle>;
	private _foregroundColor?: ANSIColor | string;
	private _backgroundColor?: ANSIColor | string;
	private _underlinedColor?: string;
	private _reversed?: boolean;
	private _font?: ANSIFont;

	public static equivalent(sgrState1?: SGRState, sgrState2?: SGRState) {
		const setReplacer = (_: any, value: any) =>
			value instanceof Set ? !value.size ? undefined : Array.from(value) : value;

		return sgrState1 === sgrState2 ||
			JSON.stringify(sgrState1, setReplacer) === JSON.stringify(sgrState2, setReplacer);
	}

	get isNeutral() {
		return (
			this._styles === undefined &&
			this._foregroundColor === undefined &&
			this._backgroundColor === undefined &&
			this._underlinedColor === undefined &&
			this._reversed === undefined &&
			this._font === undefined
		);
	}

	reset() {
		this._styles = undefined;
		this._foregroundColor = undefined;
		this._backgroundColor = undefined;
		this._underlinedColor = undefined;
		this._reversed = undefined;
		this._font = undefined;
	}

	copy(): SGRState {
		const copy = new SGRState();
		if (this._styles && this._styles.size) {
			const styles = new Set<ANSIStyle>();
			this._styles.forEach(style => styles.add(style));
			copy._styles = styles;
		}
		copy._foregroundColor = this._foregroundColor;
		copy._backgroundColor = this._backgroundColor;
		copy._underlinedColor = this._underlinedColor;
		copy._reversed = this._reversed;
		copy._font = this._font;
		return copy;
	}

	setStyle(style: ANSIStyle, ...stylesToDelete: ANSIStyle[]) {
		if (this._styles) {
			for (const style of stylesToDelete) {
				this._styles.delete(style);
			}
		} else {
			this._styles = new Set<ANSIStyle>();
		}

		this._styles.add(style);
	}

	deleteStyles(...stylesToDelete: ANSIStyle[]) {
		if (this._styles) {
			for (const style of stylesToDelete) {
				this._styles.delete(style);
			}

			if (!this._styles.size) {
				this._styles = undefined;
			}
		}
	}

	setForegroundColor(color?: ANSIColor | string) {
		if (!this._reversed) {
			this._foregroundColor = color;
		} else {
			this._backgroundColor = color;
		}
	}

	setBackgroundColor(color?: ANSIColor | string) {
		if (!this._reversed) {
			this._backgroundColor = color;
		} else {
			this._foregroundColor = color;
		}
	}

	setReversed(reversed: boolean) {
		if (reversed) {
			if (!this._reversed) {
				this._reversed = true;
				this.reverseForegroundAndBackgroundColors();
			}
		} else {
			if (this._reversed) {
				this._reversed = undefined;
				this.reverseForegroundAndBackgroundColors();
			}
		}
	}

	setFont(font?: ANSIFont) {
		this._font = font;
	}

	public get styles() {
		return !this._styles ? undefined : Array.from(this._styles);
	}

	public get foregroundColor() {
		if (this._backgroundColor && !this._foregroundColor) {
			switch (this._backgroundColor) {
				case ANSIColor.Black:
				case ANSIColor.BrightBlack:
				case ANSIColor.Red:
				case ANSIColor.BrightRed: {
					return ANSIColor.White;
				}

				case ANSIColor.Green:
				case ANSIColor.BrightGreen:
				case ANSIColor.Yellow:
				case ANSIColor.BrightYellow:
				case ANSIColor.Blue:
				case ANSIColor.BrightBlue:
				case ANSIColor.Magenta:
				case ANSIColor.BrightMagenta:
				case ANSIColor.Cyan:
				case ANSIColor.BrightCyan:
				case ANSIColor.White:
				case ANSIColor.BrightWhite: {
					return ANSIColor.Black;
				}
			}
		}

		return this._foregroundColor;
	}

	public get backgroundColor() {
		return this._backgroundColor;
	}

	public get underlinedColor() {
		return this._underlinedColor;
	}

	public get font() {
		return this._font;
	}

	private reverseForegroundAndBackgroundColors() {
		const foregroundColor = this._foregroundColor;
		this._foregroundColor = this._backgroundColor;
		this._backgroundColor = foregroundColor;
	}
}

class OutputLine implements ANSIOutputLine {
	private _id = generateId();
	private _outputRuns: OutputRun[] = [];
	private _totalLength = 0;

	public clearEntireLine() {
		if (this._totalLength) {
			this._outputRuns = [new OutputRun(' '.repeat(this._totalLength))];
		}
	}

	public clearToEndOfLine(column: number) {
		column = Math.max(column, 0);

		if (column >= this._totalLength) {
			return;
		}

		if (column === 0) {
			this.clearEntireLine();
			return;
		}

		let leftOffset = 0;
		let leftOutputRun: OutputRun | undefined;
		let leftOutputRunIndex: number | undefined = undefined;
		for (let index = 0; index < this._outputRuns.length; index++) {
			const outputRun = this._outputRuns[index];

			if (column < leftOffset + outputRun.text.length) {
				leftOutputRun = outputRun;
				leftOutputRunIndex = index;
				break;
			}

			leftOffset += outputRun.text.length;
		}

		if (leftOutputRun === undefined || leftOutputRunIndex === undefined) {
			return;
		}

		const leftTextLength = column - leftOffset;

		const erasureText = ' '.repeat(this._totalLength - column);
		const outputRuns: OutputRun[] = [];
		if (!leftTextLength) {
			outputRuns.push(new OutputRun(erasureText));
		} else {
			const leftText = leftOutputRun.text.slice(0, leftTextLength);
			outputRuns.push(new OutputRun(
				leftText,
				leftOutputRun.sgrState,
				leftOutputRun.hyperlink
			));
			outputRuns.push(new OutputRun(erasureText));
		}

		this.outputRuns.splice(
			leftOutputRunIndex,
			this._outputRuns.length - leftOutputRunIndex,
			...outputRuns
		);
	}

	public clearToBeginningOfLine(column: number) {
		column = Math.max(column, 0);

		if (column === 0) {
			return;
		}

		if (column >= this._totalLength) {
			this.clearEntireLine();
			return;
		}

		let rightOffset = this._totalLength;
		let rightOutputRun: OutputRun | undefined;
		let rightOutputRunIndex: number | undefined = undefined;
		for (let index = this._outputRuns.length - 1; index >= 0; index--) {
			const outputRun = this._outputRuns[index];

			if (column >= rightOffset - outputRun.text.length) {
				rightOutputRun = outputRun;
				rightOutputRunIndex = index;
				break;
			}

			rightOffset -= outputRun.text.length;
		}

		if (rightOutputRun === undefined || rightOutputRunIndex === undefined) {
			return;
		}

		const rightTextLength = rightOffset - column;

		const erasureText = ' '.repeat(column);
		const outputRuns = [new OutputRun(erasureText)];
		if (rightTextLength) {
			const rightOutputRunText = rightOutputRun.text.slice(-rightTextLength);
			outputRuns.push(new OutputRun(
				rightOutputRunText,
				rightOutputRun.sgrState,
				rightOutputRun.hyperlink
			));
		}

		this.outputRuns.splice(
			0,
			rightOutputRunIndex + 1,
			...outputRuns
		);
	}

	public insert(text: string, column: number, sgrState?: SGRState, hyperlink?: Hyperlink) {
		if (!text.length) {
			return;
		}

		if (column === this._totalLength) {
			this._totalLength += text.length;

			if (this._outputRuns.length) {
				const lastOutputRun = this._outputRuns[this._outputRuns.length - 1];
				if (SGRState.equivalent(lastOutputRun.sgrState, sgrState) &&
					Hyperlink.equivalent(lastOutputRun.hyperlink, hyperlink)) {
					lastOutputRun.appendText(text);
					return;
				}
			}

			this._outputRuns.push(new OutputRun(text, sgrState, hyperlink));
			return;
		}

		if (column > this._totalLength) {
			const spacer = ' '.repeat(column - this._totalLength);

			this._totalLength += spacer.length + text.length;

			if (this._outputRuns.length) {
				const lastOutputRun = this._outputRuns[this._outputRuns.length - 1];
				if (SGRState.equivalent(lastOutputRun.sgrState, sgrState) &&
					Hyperlink.equivalent(lastOutputRun.hyperlink, hyperlink)) {
					lastOutputRun.appendText(spacer + text);
					return;
				}
			}

			this._outputRuns.push(new OutputRun(spacer));
			this._outputRuns.push(new OutputRun(text, sgrState, hyperlink));
			return;
		}

		let leftOffset = 0;
		let leftOutputRunIndex: number | undefined = undefined;
		for (let index = 0; index < this._outputRuns.length; index++) {
			const outputRun = this._outputRuns[index];

			if (column < leftOffset + outputRun.text.length) {
				leftOutputRunIndex = index;
				break;
			}

			leftOffset += outputRun.text.length;
		}

		if (leftOutputRunIndex === undefined) {
			this._outputRuns.push(new OutputRun(text, sgrState, hyperlink));
			return;
		}

		if (column + text.length >= this._totalLength) {
			const leftTextLength = column - leftOffset;

			const outputRuns: OutputRun[] = [];
			if (!leftTextLength) {
				outputRuns.push(new OutputRun(text, sgrState, hyperlink));
			} else {
				const leftOutputRun = this._outputRuns[leftOutputRunIndex];
				const leftText = leftOutputRun.text.slice(0, leftTextLength);

				if (SGRState.equivalent(leftOutputRun.sgrState, sgrState) &&
					Hyperlink.equivalent(leftOutputRun.hyperlink, hyperlink)) {
					outputRuns.push(new OutputRun(leftText + text, sgrState, hyperlink));
				} else {
					outputRuns.push(new OutputRun(
						leftText,
						leftOutputRun.sgrState,
						leftOutputRun.hyperlink
					));

					outputRuns.push(new OutputRun(
						text,
						sgrState,
						hyperlink
					));
				}
			}

			this._totalLength = leftOffset + leftTextLength + text.length;
			this.outputRuns.splice(
				leftOutputRunIndex,
				this.outputRuns.length - leftOutputRunIndex,
				...outputRuns
			);

			return;
		}

		let rightOffset = this._totalLength;
		let rightOutputRunIndex: number | undefined = undefined;
		for (let index = this._outputRuns.length - 1; index >= 0; index--) {
			const outputRun = this._outputRuns[index];

			if (column + text.length > rightOffset - outputRun.text.length) {
				rightOutputRunIndex = index;
				break;
			}

			rightOffset -= outputRun.text.length;
		}

		if (rightOutputRunIndex === undefined) {
			this._outputRuns.push(new OutputRun(text, sgrState, hyperlink));
			return;
		}

		const outputRuns: OutputRun[] = [];

		const leftOutputRunTextLength = column - leftOffset;
		if (leftOutputRunTextLength) {
			const leftOutputRun = this._outputRuns[leftOutputRunIndex];
			const leftOutputRunText = leftOutputRun.text.slice(0, leftOutputRunTextLength);
			outputRuns.push(new OutputRun(
				leftOutputRunText,
				leftOutputRun.sgrState,
				leftOutputRun.hyperlink
			));
		}

		outputRuns.push(new OutputRun(text, sgrState, hyperlink));

		const rightOutputRunTextLength = rightOffset - (column + text.length);
		if (rightOutputRunTextLength) {
			const rightOutputRun = this._outputRuns[rightOutputRunIndex];
			const rightOutputRunText = rightOutputRun.text.slice(-rightOutputRunTextLength);
			outputRuns.push(new OutputRun(
				rightOutputRunText,
				rightOutputRun.sgrState,
				rightOutputRun.hyperlink
			));
		}

		this._outputRuns.splice(
			leftOutputRunIndex,
			(rightOutputRunIndex - leftOutputRunIndex) + 1,
			...outputRuns
		);

		if (this._outputRuns.length > 1) {
			this._outputRuns = OutputRun.optimizeOutputRuns(this._outputRuns);
		}

		this._totalLength = this._outputRuns.reduce((totalLength, outputRun) =>
			totalLength + outputRun.text.length,
			0
		);
	}

	public get id() {
		return this._id;
	}

	public get outputRuns(): ANSIOutputRun[] {
		return this._outputRuns;
	}
}

class OutputRun implements ANSIOutputRun {
	private _id = generateId();
	private readonly _hyperlink?: Hyperlink;
	private _text: string;
	private readonly _sgrState?: SGRState;

	get sgrState() {
		return this._sgrState;
	}

	constructor(text: string, sgrState?: SGRState, hyperlink?: Hyperlink) {
		this._text = text;
		this._sgrState = sgrState;
		this._hyperlink = hyperlink;
	}

	public static optimizeOutputRuns(outputRuns: OutputRun[]) {
		const optimizedOutputRuns = [outputRuns[0]];
		for (let right = 1, left = 0; right < outputRuns.length; right++) {
			const leftOutputRun = outputRuns[left];
			const rightOutputRun = outputRuns[right];

			if (SGRState.equivalent(leftOutputRun.sgrState, rightOutputRun.sgrState) &&
				Hyperlink.equivalent(leftOutputRun.hyperlink, rightOutputRun.hyperlink)) {
				leftOutputRun._text += rightOutputRun._text;
			} else {
				optimizedOutputRuns[++left] = rightOutputRun;
			}
		}

		return optimizedOutputRuns;
	}

	appendText(text: string) {
		this._text += text;
	}

	public get id() {
		return this._id;
	}

	get hyperlink() {
		return this._hyperlink;
	}

	public get format() {
		return this._sgrState;
	}

	public get text() {
		return this._text;
	}
}

class Hyperlink implements ANSIHyperlink {
	public params?: Map<string, string>;

	constructor(public readonly url: string, params: string) {
		if (params) {
			for (const param of params.split(':')) {
				const match = param.match(/^(.+)=(.*)$/);
				if (match && match.length === 3) {
					const name = match[1].trim();
					if (name) {
						const value = match[2].trim();

						if (!this.params) {
							this.params = new Map<string, string>();
						}

						this.params.set(name, value);
					}
				}
			}
		}
	}

	public static equivalent(hyperlink1?: Hyperlink, hyperlink2?: Hyperlink) {
		return hyperlink1 === hyperlink2 || hyperlink1?.url === hyperlink2?.url;
	}
}

const generateId = () => {
	return ++identifier + '';
};

const rangeParam = (value: string, defaultValue: number, minValue: number) => {
	const param = getParam(value, defaultValue);
	return Math.max(param, minValue);
};

const getParam = (value: string, defaultValue: number) => {
	const param = parseInt(value);
	return Number.isNaN(param) ? defaultValue : param;
};

const twoDigitHex = (value: number) => {
	const hex = Math.max(Math.min(255, value), 0).toString(16);
	return hex.length === 2 ? hex : '0' + hex;
};