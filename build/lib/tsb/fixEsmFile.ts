/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { updateCssImports } from './updateCssImports.js'

const RE_IMPORT = /^import(.*)('|")(.*)('|")/
const RE_EXPORT = /^export(.*)from ('|")(.*)('|")/
const RE_FROM_END = /\} from ('|")(.*)('|")/

const commonJs: string[] = []

const fixEsmImportLine = (relative: string, line: string) => {
	if (line.trim() === 'import * as assert from \'assert\'') {
		return 'import assert from \'assert\''
	}
	const importMatch = line.match(RE_IMPORT)
	if (!importMatch) {
		throw new Error(`multiline import not supported: ${line}`)
	}
	const imports = importMatch[1]
	const quote1 = importMatch[2]
	const path = importMatch[3]
	const quote2 = importMatch[4]
	const isVs = path.startsWith('vs/')
	const isRelative = path.startsWith('.')
	const isJs = path.endsWith('.js')
	if (!isVs && (!isRelative || isJs)) {
		return line
	}
	const extension = commonJs.includes(path) ? '.cjs' : '.js'
	if (isRelative) {
		return `import${imports}${quote1}${path}${extension}${quote2}`
	}
	const slashCount = relative.split('/').length
	const prefix = '../'.repeat(slashCount - 1)
	return `import${imports}${quote1}${prefix}${path}${extension}${quote2}`
}


const fixEsmExportLine = (relative: string, line: string) => {
	const exportMatch = line.match(RE_EXPORT)
	if (!exportMatch) {
		throw new Error(`multiline export not supported: ${line}`)
	}
	const exports = exportMatch[1]
	const quote1 = exportMatch[2]
	const path = exportMatch[3]
	const quote2 = exportMatch[4]
	const isVs = path.startsWith('vs')
	const isRelative = path.startsWith('.')
	if (!isVs && !isRelative || path.endsWith('.js')) {
		return line
	}
	const extension = commonJs.includes(path) ? '.cjs' : '.js'
	if (isRelative) {
		return `export${exports}from ${quote1}${path}${extension}${quote2}`
	}
	const slashCount = relative.split('/').length
	const prefix = '../'.repeat(slashCount - 1)
	return `export${exports}from ${quote1}${prefix}${path}${extension}${quote2}`
}

const fixEsmFromEndLine = (relative: string, line: string) => {
	const exportMatch = line.match(RE_FROM_END)
	if (!exportMatch) {
		throw new Error(`multiline export not supported: ${line}`)
	}
	const quote1 = exportMatch[1]
	const path = exportMatch[2]
	const quote2 = exportMatch[3]
	const isVs = path.startsWith('vs')
	const isRelative = path.startsWith('.')
	if (!isVs && !isRelative || path.endsWith('.js')) {
		return line
	}
	const extension = '.js'
	if (isRelative) {
		return `from ${quote1}${path}${extension}${quote2};`
	}
	const slashCount = relative.split('/').length
	const prefix = '../'.repeat(slashCount - 1)
	return `from ${quote1}${prefix}${path}${extension}${quote2};`
}

const fixEsmImportExportLine = (relative: string, line: string) => {
	if (line.startsWith('import ')) {
		return fixEsmImportLine(relative, line)
	}
	if (line.startsWith('export') && line.includes(' from \'')) {
		return fixEsmExportLine(relative, line)
	}
	if (line.startsWith('} from \'') || line.startsWith('} from "')) {
		return fixEsmFromEndLine(relative, line)
	}
	return line
}


function fixEsmImportExportLines(relative: string, lines: readonly string[]) {
	const newLines: string[] = []
	for (const line of lines) {
		newLines.push(
			fixEsmImportExportLine(relative, line)
		)
	}
	return newLines
}

function fixEsmImports(relative: string, content: string) {
	const lines = content.split('\n')
	const newLines = fixEsmImportExportLines(relative, lines)
	return newLines.join('\n')
}

export function fixEsmFile(relative: string, content: string) {
	return fixEsmImports(relative, updateCssImports(content))
}
