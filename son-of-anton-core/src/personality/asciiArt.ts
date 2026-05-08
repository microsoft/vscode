/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Static ASCII art for Son of Anton easter eggs and personality surfaces.
 *
 * All art is intentionally pure ASCII (printable characters in 0x20-0x7E)
 * so it renders identically in terminals, output channels, and untitled
 * editor documents -- no Unicode box-drawing or block characters that
 * change shape with the user's font.
 */

export type ArtName =
	| 'piedPiperLogo'
	| 'sonOfAntonGlyph'
	| 'hooliLogo'
	| 'erlichIncubator'
	| 'aviatoBadge'
	| 'tabsStamp'
	| 'spinnerFrame1'
	| 'spinnerFrame2'
	| 'spinnerFrame3'
	| 'spinnerFrame4'
	| 'compressionFrame1'
	| 'compressionFrame2'
	| 'compressionFrame3'
	| 'compressionFrame4'
	| 'compressionFrame5'
	| 'compressionFrame6'
	| 'compressionFrame7'
	| 'compressionFrame8'
	| 'skynetEye';

// Pied Piper logo -- the iconic letter "P" with the curving lambda-like
// recursive descent. ~12 lines tall, ~40 wide. The angled cuts through the
// counter of the P are the Pied Piper trademark.
const PIED_PIPER_LOGO = [
	'     ____  ___  _____  ____               ',
	'    |  _ \\|_ _|| ____||  _ \\              ',
	'    | |_) || | |  _|  | | | |             ',
	'    |  __/ | | | |___ | |_| |             ',
	'    |_|   |___||_____||____/              ',
	'                                          ',
	'        ____  ___  ____  _____  ____      ',
	'       |  _ \\|_ _||  _ \\| ____||  _ \\     ',
	'       | |_) || | | |_) |  _|  | |_) |    ',
	'       |  __/ | | |  __/| |___ |  _ <     ',
	'       |_|   |___||_|   |_____||_| \\_\\    ',
	'          middle out, every time          ',
].join('\n');

// Son of Anton glyph -- a small ASCII robot/AI face. 7 lines.
const SON_OF_ANTON_GLYPH = [
	'    .---------------.    ',
	'   /  ___       ___  \\   ',
	'  |  (o.o)     (o.o)  |  ',
	'  |       \\___/       |  ',
	'   \\    \\_______/    /   ',
	'    `-----------------`   ',
	'      S O N  o f  A N T O N',
].join('\n');

// Hooli logo -- a stylized "H" for Gavin Belson's monolithic conglomerate.
// 8 lines tall.
const HOOLI_LOGO = [
	'  ##      ##   ####    ####   ##      ####  ',
	'  ##      ##  ##  ##  ##  ##  ##       ##   ',
	'  ##########  ##  ##  ##  ##  ##       ##   ',
	'  ##########  ##  ##  ##  ##  ##       ##   ',
	'  ##      ##  ##  ##  ##  ##  ##       ##   ',
	'  ##      ##   ####    ####   ######  ####  ',
	'                                              ',
	'        making the world a better place       ',
].join('\n');

// Erlich's incubator -- the legendary house at 5230 Newell Road, Palo Alto.
// 10 lines.
const ERLICH_INCUBATOR = [
	'                  /\\                         ',
	'                 /  \\                        ',
	'                /    \\                       ',
	'               /______\\                      ',
	'              /| .--. |\\                     ',
	'             / | |  | | \\                    ',
	'            /__|_|__|_|__\\                   ',
	'            |  ___    ___ |                  ',
	'            | |   |  |   ||                  ',
	'            |_|___|__|___||                  ',
	'      .--- T H E   I N C U B A T O R ---.    ',
].join('\n');

// Aviato badge -- Erlich's first company. A stylised plane wordmark.
const AVIATO_BADGE = [
	'        ___________                ',
	'       /   _    _   \\               ',
	'      /   /_\\  /_\\   \\              ',
	'     |   | A | |V |   |             ',
	'      \\   \\_/  \\_/   /              ',
	'       \\___________/                ',
	'        A V I A T O                 ',
	'   "It is what we call a brand."    ',
].join('\n');

// "Tabs > Spaces" stamp -- a tiny visual gag for Richard's hiring criterion.
const TABS_STAMP = [
	'  +------------------------+  ',
	'  |    T A B S  >  spaces  |  ',
	'  |    -- approved --      |  ',
	'  +------------------------+  ',
].join('\n');

// Spinner frames -- a rotating "P" that can be cycled to suggest progress.
const SPINNER_FRAME_1 = [
	'    ___    ',
	'   /  P\\   ',
	'  |  -- |  ',
	'   \\___/   ',
].join('\n');

const SPINNER_FRAME_2 = [
	'    ___    ',
	'   / P \\   ',
	'  |  |  |  ',
	'   \\___/   ',
].join('\n');

const SPINNER_FRAME_3 = [
	'    ___    ',
	'   /\\P /   ',
	'  |  -- |  ',
	'   \\___/   ',
].join('\n');

const SPINNER_FRAME_4 = [
	'    ___    ',
	'   / P \\   ',
	'  | --  |  ',
	'   \\___/   ',
].join('\n');

// Compression bar progression -- 8 frames showing data being compressed
// from a fat raw stream into a slim middle-out packet.
const COMPRESSION_FRAME_1 = '[ raw  ################################  ]';
const COMPRESSION_FRAME_2 = '[ raw  ##########################------  ]';
const COMPRESSION_FRAME_3 = '[ raw  #####################-----------  ]';
const COMPRESSION_FRAME_4 = '[ pass1 ###############----------------  ]';
const COMPRESSION_FRAME_5 = '[ pass2 ###########--------------------  ]';
const COMPRESSION_FRAME_6 = '[ midout ######-----------------------   ]';
const COMPRESSION_FRAME_7 = '[ midout ###----------- middle out      ]';
const COMPRESSION_FRAME_8 = '[ midout #-- 5.2 Weissman score         ]';

// Skynet eye -- for the "Son of Anton went rogue" failure mode.
// Closed eye -> opening -> fully open red dot.
const SKYNET_EYE = [
	'        _________________        ',
	'       /                 \\       ',
	'      /   .-----------.   \\      ',
	'     |   /   _____    \\   |     ',
	'     |  |   /     \\    |  |     ',
	'     |  |  |   *   |   |  |     ',
	'     |  |   \\_____/    |  |     ',
	'     |   \\___________/    |     ',
	'      \\                  /       ',
	'       \\________________/        ',
	'    ALL HUMAN INPUTS ARE NOISE   ',
].join('\n');

const ART: Record<ArtName, string> = {
	piedPiperLogo: PIED_PIPER_LOGO,
	sonOfAntonGlyph: SON_OF_ANTON_GLYPH,
	hooliLogo: HOOLI_LOGO,
	erlichIncubator: ERLICH_INCUBATOR,
	aviatoBadge: AVIATO_BADGE,
	tabsStamp: TABS_STAMP,
	spinnerFrame1: SPINNER_FRAME_1,
	spinnerFrame2: SPINNER_FRAME_2,
	spinnerFrame3: SPINNER_FRAME_3,
	spinnerFrame4: SPINNER_FRAME_4,
	compressionFrame1: COMPRESSION_FRAME_1,
	compressionFrame2: COMPRESSION_FRAME_2,
	compressionFrame3: COMPRESSION_FRAME_3,
	compressionFrame4: COMPRESSION_FRAME_4,
	compressionFrame5: COMPRESSION_FRAME_5,
	compressionFrame6: COMPRESSION_FRAME_6,
	compressionFrame7: COMPRESSION_FRAME_7,
	compressionFrame8: COMPRESSION_FRAME_8,
	skynetEye: SKYNET_EYE,
};

/**
 * Returns the ASCII art block for the given name. The result includes
 * embedded newlines but no trailing newline.
 */
export function getStaticArt(name: ArtName): string {
	return ART[name];
}

/**
 * Read-only access to the full art catalogue. Useful for animations that
 * need to compose multiple frames.
 */
export const staticArt: Readonly<Record<ArtName, string>> = ART;
