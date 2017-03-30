/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import nls = require('vs/nls');

import { registerColor, ColorIdentifier } from 'vs/platform/theme/common/colorRegistry';

/**
 * The color identifiers for the terminal's ansi colors. The index in the array corresponds to the index
 * of the color in the terminal color table.
 */
export const ansiColorIdentifiers: ColorIdentifier[] = [];

const ansiColorMap = {
	terminalAnsiBlack: {
		index: 0,
		defaults: {
			light: '#000000',
			dark: '#000000',
			hc: '#000000'
		}
	},
	terminalAnsiRed: {
		index: 1,
		defaults: {
			light: '#cd3131',
			dark: '#cd3131',
			hc: '#cd0000'
		}
	},
	terminalAnsiGreen: {
		index: 2,
		defaults: {
			light: '#00BC00',
			dark: '#0DBC79',
			hc: '#00cd00'
		}
	},
	terminalAnsiYellow: {
		index: 3,
		defaults: {
			light: '#949800',
			dark: '#e5e510',
			hc: '#cdcd00'
		}
	},
	terminalAnsiBlue: {
		index: 4,
		defaults: {
			light: '#0451a5',
			dark: '#2472c8',
			hc: '#0000ee'
		}
	},
	terminalAnsiMagenta: {
		index: 5,
		defaults: {
			light: '#bc05bc',
			dark: '#bc3fbc',
			hc: '#cd00cd'
		}
	},
	terminalAnsiCyan: {
		index: 6,
		defaults: {
			light: '#0598bc',
			dark: '#11a8cd',
			hc: '#00cdcd'
		}
	},
	terminalAnsiWhite: {
		index: 7,
		defaults: {
			light: '#555555',
			dark: '#e5e5e5',
			hc: '#e5e5e5'
		}
	},
	terminalAnsiBrightBlack: {
		index: 8,
		defaults: {
			light: '#666666',
			dark: '#666666',
			hc: '#7f7f7f'
		}
	},
	terminalAnsiBrightRed: {
		index: 9,
		defaults: {
			light: '#cd3131',
			dark: '#f14c4c',
			hc: '#ff0000'
		}
	},
	terminalAnsiBrightGreen: {
		index: 10,
		defaults: {
			light: '#14CE14',
			dark: '#23d18b',
			hc: '#00ff00'
		}
	},
	terminalAnsiBrightYellow: {
		index: 11,
		defaults: {
			light: '#b5ba00',
			dark: '#f5f543',
			hc: '#ffff00'
		}
	},
	terminalAnsiBrightBlue: {
		index: 12,
		defaults: {
			light: '#0451a5',
			dark: '#3b8eea',
			hc: '#5c5cff'
		}
	},
	terminalAnsiBrightMagenta: {
		index: 13,
		defaults: {
			light: '#bc05bc',
			dark: '#d670d6',
			hc: '#ff00ff'
		}
	},
	terminalAnsiBrightCyan: {
		index: 14,
		defaults: {
			light: '#0598bc',
			dark: '#29b8db',
			hc: '#00ffff'
		}
	},
	terminalAnsiBrightWhite: {
		index: 15,
		defaults: {
			light: '#a5a5a5',
			dark: '#e5e5e5',
			hc: '#ffffff'
		}
	}
};

export function registerColors(): void {
	for (let id in ansiColorMap) {
		let entry = ansiColorMap[id];
		let colorName = id.substring(12);
		ansiColorIdentifiers[entry.index] = registerColor(id, entry.defaults, nls.localize('terminal.ansiColor', '\'{0}\' ansi color in the terminal.', colorName));
	}
}
