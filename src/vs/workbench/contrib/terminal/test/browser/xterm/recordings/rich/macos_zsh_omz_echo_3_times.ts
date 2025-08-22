/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
/* eslint-disable */

// macOS 15.5
// zsh 5.9
// oh-my-zsh fa396ad
// Steps:
// - Open terminal
// - Type echo a
// - Press enter
// - Type echo b
// - Press enter
// - Type echo c
// - Press enter
export const events = [
	{
		"type": "resize",
		"cols": 107,
		"rows": 24
	},
	{
		"type": "output",
		"data": "\u001b]633;P;ContinuationPrompt=%_> \u0007\u001b]633;P;PromptType=p10k\u0007\u001b]633;P;HasRichCommandDetection=True\u0007\u001b[1m\u001b[7m%\u001b[27m\u001b[1m\u001b[0m                                                                                                          \r \r"
	},
	{
		"type": "output",
		"data": "\u001b]633;D\u0007"
	},
	{
		"type": "output",
		"data": ""
	},
	{
		"type": "output",
		"data": "\u001b]633;P;Cwd=/Users/tyriar/playground/test1\u0007\u001b]633;EnvSingleStart;0;448d50d0-70fe-4ab5-842e-132f3b1c159a;\u0007\u001b]633;EnvSingleEnd;448d50d0-70fe-4ab5-842e-132f3b1c159a;\u0007\r\u001b[0m\u001b[27m\u001b[24m\u001b[J\u001b]633;A\u0007tyriar@Mac test1 % \u001b]633;B\u0007\u001b[K\u001b[?2004h"
	},
	{
		"type": "promptInputChange",
		"data": "|"
	},
	{
		"type": "input",
		"data": "e"
	},
	{
		"type": "output",
		"data": "e"
	},
	{
		"type": "promptInputChange",
		"data": "e|"
	},
	{
		"type": "input",
		"data": "c"
	},
	{
		"type": "output",
		"data": "\bec"
	},
	{
		"type": "promptInputChange",
		"data": "ec|"
	},
	{
		"type": "input",
		"data": "h"
	},
	{
		"type": "output",
		"data": "h"
	},
	{
		"type": "promptInputChange",
		"data": "ech|"
	},
	{
		"type": "input",
		"data": "o"
	},
	{
		"type": "output",
		"data": "o"
	},
	{
		"type": "promptInputChange",
		"data": "echo|"
	},
	{
		"type": "input",
		"data": " "
	},
	{
		"type": "output",
		"data": " "
	},
	{
		"type": "promptInputChange",
		"data": "echo |"
	},
	{
		"type": "input",
		"data": "a"
	},
	{
		"type": "output",
		"data": "a"
	},
	{
		"type": "promptInputChange",
		"data": "echo a|"
	},
	{
		"type": "input",
		"data": "\r"
	},
	{
		"type": "output",
		"data": "\u001b[?2004l\r\r\n\u001b]633;E;echo a;448d50d0-70fe-4ab5-842e-132f3b1c159a\u0007"
	},
	{
		"type": "output",
		"data": "\u001b]633;C\u0007"
	},
	{
		"type": "output",
		"data": "a\r\n\u001b[1m\u001b[7m%\u001b[27m\u001b[1m\u001b[0m                                                                                                          \r \r"
	},
	{
		"type": "output",
		"data": "\u001b]633;D;0\u0007"
	},
	{
		"type": "output",
		"data": ""
	},
	{
		"type": "promptInputChange",
		"data": "echo a"
	},
	{
		"type": "output",
		"data": "\u001b]633;P;Cwd=/Users/tyriar/playground/test1\u0007\u001b]633;EnvSingleStart;0;448d50d0-70fe-4ab5-842e-132f3b1c159a;\u0007\u001b]633;EnvSingleEnd;448d50d0-70fe-4ab5-842e-132f3b1c159a;\u0007\r\u001b[0m\u001b[27m\u001b[24m\u001b[J\u001b]633;A\u0007tyriar@Mac test1 % \u001b]633;B\u0007\u001b[K\u001b[?2004h"
	},
	{
		"type": "promptInputChange",
		"data": "|"
	},
	{
		"type": "input",
		"data": "e"
	},
	{
		"type": "output",
		"data": "e"
	},
	{
		"type": "promptInputChange",
		"data": "e|"
	},
	{
		"type": "input",
		"data": "c"
	},
	{
		"type": "output",
		"data": "\bec"
	},
	{
		"type": "promptInputChange",
		"data": "ec|"
	},
	{
		"type": "input",
		"data": "h"
	},
	{
		"type": "output",
		"data": "h"
	},
	{
		"type": "promptInputChange",
		"data": "ech|"
	},
	{
		"type": "input",
		"data": "o"
	},
	{
		"type": "output",
		"data": "o"
	},
	{
		"type": "promptInputChange",
		"data": "echo|"
	},
	{
		"type": "input",
		"data": " "
	},
	{
		"type": "output",
		"data": " "
	},
	{
		"type": "promptInputChange",
		"data": "echo |"
	},
	{
		"type": "input",
		"data": "b"
	},
	{
		"type": "output",
		"data": "b"
	},
	{
		"type": "promptInputChange",
		"data": "echo b|"
	},
	{
		"type": "input",
		"data": "\r"
	},
	{
		"type": "output",
		"data": "\u001b[?2004l\r\r\n\u001b]633;E;echo b;448d50d0-70fe-4ab5-842e-132f3b1c159a\u0007"
	},
	{
		"type": "output",
		"data": "\u001b]633;C\u0007"
	},
	{
		"type": "output",
		"data": "b\r\n\u001b[1m\u001b[7m%\u001b[27m\u001b[1m\u001b[0m                                                                                                          \r \r"
	},
	{
		"type": "output",
		"data": "\u001b]633;D;0\u0007"
	},
	{
		"type": "output",
		"data": ""
	},
	{
		"type": "promptInputChange",
		"data": "echo b"
	},
	{
		"type": "output",
		"data": "\u001b]633;P;Cwd=/Users/tyriar/playground/test1\u0007\u001b]633;EnvSingleStart;0;448d50d0-70fe-4ab5-842e-132f3b1c159a;\u0007\u001b]633;EnvSingleEnd;448d50d0-70fe-4ab5-842e-132f3b1c159a;\u0007\r\u001b[0m\u001b[27m\u001b[24m\u001b[J\u001b]633;A\u0007tyriar@Mac test1 % \u001b]633;B\u0007\u001b[K\u001b[?2004h"
	},
	{
		"type": "promptInputChange",
		"data": "|"
	},
	{
		"type": "input",
		"data": "e"
	},
	{
		"type": "output",
		"data": "e"
	},
	{
		"type": "promptInputChange",
		"data": "e|"
	},
	{
		"type": "input",
		"data": "c"
	},
	{
		"type": "output",
		"data": "\bec"
	},
	{
		"type": "promptInputChange",
		"data": "ec|"
	},
	{
		"type": "input",
		"data": "h"
	},
	{
		"type": "output",
		"data": "h"
	},
	{
		"type": "promptInputChange",
		"data": "ech|"
	},
	{
		"type": "input",
		"data": "o"
	},
	{
		"type": "output",
		"data": "o"
	},
	{
		"type": "promptInputChange",
		"data": "echo|"
	},
	{
		"type": "input",
		"data": " "
	},
	{
		"type": "output",
		"data": " "
	},
	{
		"type": "promptInputChange",
		"data": "echo |"
	},
	{
		"type": "input",
		"data": "c"
	},
	{
		"type": "output",
		"data": "c"
	},
	{
		"type": "promptInputChange",
		"data": "echo c|"
	},
	{
		"type": "input",
		"data": "\r"
	},
	{
		"type": "output",
		"data": "\u001b[?2004l\r\r\n"
	},
	{
		"type": "output",
		"data": "\u001b]633;E;echo c;448d50d0-70fe-4ab5-842e-132f3b1c159a\u0007"
	},
	{
		"type": "output",
		"data": "\u001b]633;C\u0007"
	},
	{
		"type": "output",
		"data": "c\r\n\u001b[1m\u001b[7m%\u001b[27m\u001b[1m\u001b[0m                                                                                                          \r \r"
	},
	{
		"type": "output",
		"data": "\u001b]633;D;0\u0007"
	},
	{
		"type": "output",
		"data": ""
	},
	{
		"type": "promptInputChange",
		"data": "echo c"
	},
	{
		"type": "output",
		"data": "\u001b]633;P;Cwd=/Users/tyriar/playground/test1\u0007\u001b]633;EnvSingleStart;0;448d50d0-70fe-4ab5-842e-132f3b1c159a;\u0007\u001b]633;EnvSingleEnd;448d50d0-70fe-4ab5-842e-132f3b1c159a;\u0007\r\u001b[0m\u001b[27m\u001b[24m\u001b[J\u001b]633;A\u0007tyriar@Mac test1 % \u001b]633;B\u0007\u001b[K\u001b[?2004h"
	},
	{
		"type": "promptInputChange",
		"data": "|"
	}
];
