/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import type { Node, Macro, Environment } from '@unified-latex/unified-latex-types';
import { TeXElement, TeXElementType, OutlineConfig } from './types';
import { get, wait } from './cache';
import { argContentToStr } from './utils/parserUtils';
import { resolveFile, sanitizeInputFilePath, getDirname, joinPath } from './utils/fileUtils';
import { OutputChannelLogger } from '../utils/logger';

/**
 * Complete LaTeX outline structure parser
 * Ported from latex-workshop with full functionality:
 * - AST-based parsing
 * - Subfile support
 * - Rnw (R Sweave) support
 * - Section numbering
 * - Float numbering
 * - All original features
 */

let logger: OutputChannelLogger | undefined;
let rootFilePath: string | undefined;

export function initializeStructure(log: OutputChannelLogger, rootFile?: string): void {
	logger = log;
	rootFilePath = rootFile;
}

/**
 * Construct outline structure for a file
 */
export async function construct(filePath?: string, subFile = true): Promise<TeXElement[]> {
	filePath = filePath ?? rootFilePath;
	if (filePath === undefined) {
		return [];
	}

	const config = refreshLaTeXModelConfig(subFile);
	const structs: Record<string, TeXElement[]> = {};
	await constructFile(filePath, config, structs);

	let struct = subFile ? insertSubFile(structs) : structs[filePath] ?? [];
	struct = nestNonSection(struct);
	struct = nestSection(struct, config);
	fixSectionToLine(struct, config, Number.MAX_SAFE_INTEGER);

	const configuration = vscode.workspace.getConfiguration('latex');
	if (subFile && configuration.get<boolean>('outline.floats.number.enabled', false)) {
		struct = addFloatNumber(struct);
	}
	if (subFile && configuration.get<boolean>('outline.numbers.enabled', false)) {
		struct = addSectionNumber(struct, config);
	}

	return struct;
}

/**
 * Construct structure for a single file
 */
async function constructFile(
	filePath: string,
	config: OutlineConfig,
	structs: Record<string, TeXElement[]>
): Promise<void> {
	if (structs[filePath] !== undefined) {
		return;
	}

	await wait(filePath);
	const fileCache = get(filePath);
	if (!fileCache) {
		logger?.warn(`Error loading cache for ${filePath}`);
		return;
	}

	const content = fileCache.content;
	const ast = fileCache.ast;
	if (!content || !ast) {
		logger?.warn(`Error loading ${content ? 'AST' : 'content'} during structuring: ${filePath}`);
		return;
	}

	// Get Rnw child chunks
	const rnwSub = await parseRnwChildMacro(content, filePath, rootFilePath || '');

	// Parse each base-level node
	const rootElement: { children: TeXElement[] } = { children: [] };
	structs[filePath] = rootElement.children;
	let inAppendix = false;

	logger?.info(`Parsing ${ast.content.length} nodes from AST for ${filePath}`);
	let nodeCount = 0;
	for (const node of ast.content) {
		if (['string', 'parbreak', 'whitespace'].includes(node.type)) {
			continue;
		}
		nodeCount++;
		// Appendix is a one-way journey
		if (await parseNode(node, rnwSub, rootElement, filePath, config, structs, inAppendix)) {
			inAppendix = true;
		}
	}
	logger?.info(`Parsed ${nodeCount} non-whitespace nodes, generated ${rootElement.children.length} elements for ${filePath}`);
}

/**
 * Choose caption from multiple arguments
 */
function chooseCaption(...args: Array<{ content?: Node[] } | undefined>): string {
	for (const arg of args) {
		if (arg && arg.content && arg.content.length > 0) {
			return argContentToStr(arg.content);
		}
	}
	return '';
}

/**
 * Parse a node recursively
 */
async function parseNode(
	node: Node,
	rnwSub: Array<{ subFile: string; path: string; line: number }>,
	root: { children: TeXElement[] },
	filePath: string,
	config: OutlineConfig,
	structs: Record<string, TeXElement[]>,
	inAppendix: boolean
): Promise<boolean> {
	const nodeAny = node as any;
	const attributes = {
		lineFr: (nodeAny.position?.start?.line ?? 1) - 1,
		lineTo: (nodeAny.position?.end?.line ?? 1) - 1,
		filePath,
		children: [] as TeXElement[]
	};

	let element: TeXElement | undefined;

	if (node.type === 'macro' && config.macros.secs.includes((node as Macro).content)) {
		const macro = node as Macro;
		logger?.info(`Found section macro: ${macro.content}, args: ${macro.args?.length ?? 0}`);
		// unified-latex: optional args come first, then mandatory args
		// For \section[short]{title}: args[0] = [short], args[1] = {title}
		// For \section{title}: args[0] = {title}
		const mandatoryArg = macro.args?.find(arg => arg.openMark === '{');
		if (mandatoryArg) {
			const label = argContentToStr(mandatoryArg.content);
			logger?.info(`Creating section element: ${macro.content} with label: "${label}"`);
			// Check if there's an optional argument (for starred sections)
			const hasOptionalArg = macro.args?.some(arg => arg.openMark === '[');
			element = {
				type: hasOptionalArg && macro.args?.[0]?.content?.[0]
					? TeXElementType.SectionAst
					: TeXElementType.Section,
				name: macro.content,
				label: label,
				appendix: inAppendix,
				...attributes
			};
		} else {
			logger?.warn(`Section macro ${macro.content} has no mandatory argument`);
		}
	} else if (node.type === 'macro' && config.macros.cmds.includes((node as Macro).content)) {
		const macro = node as Macro;
		const argStr = argContentToStr(macro.args?.[2]?.content || []);
		element = {
			type: TeXElementType.Macro,
			name: macro.content,
			label: `#${macro.content}${argStr ? `: ${argStr}` : ''}`,
			...attributes
		};
	} else if (node.type === 'macro' && (node as Macro).content === 'appendix') {
		inAppendix = true;
	} else if (node.type === 'environment') {
		const env = node as Environment;
		if (env.env === 'frame') {
			const frameTitleMacro = env.content.find(
				(sub: Node) => sub.type === 'macro' && (sub as Macro).content === 'frametitle'
			);
			const caption = chooseCaption(
				env.args?.[3],
				frameTitleMacro ? (frameTitleMacro as Macro).args?.[2] : undefined
			);
			element = {
				type: TeXElementType.Environment,
				name: env.env,
				label: `${env.env.charAt(0).toUpperCase()}${env.env.slice(1)}${config.caption && caption ? `: ${caption}` : ''}`,
				...attributes
			};
		} else if (
			((env.env === 'figure' || env.env === 'figure*') && config.macros.envs.includes('figure')) ||
			((env.env === 'table' || env.env === 'table*') && config.macros.envs.includes('table'))
		) {
			const captionMacro = env.content.find(
				(sub: Node) => sub.type === 'macro' && (sub as Macro).content === 'caption'
			);
			const caption = chooseCaption(
				captionMacro ? (captionMacro as Macro).args?.[0] : undefined,
				captionMacro ? (captionMacro as Macro).args?.[1] : undefined
			);
			const envName = env.env.endsWith('*') ? env.env.slice(0, -1) : env.env;
			element = {
				type: TeXElementType.Environment,
				name: envName,
				label: `${envName.charAt(0).toUpperCase()}${envName.slice(1)}${config.caption && caption ? `: ${caption}` : ''}`,
				...attributes
			};
		} else if (env.env === 'macro' || env.env === 'environment') {
			// DocTeX
			const envAny = env as any;
			const caption = envAny.content?.[0]?.content?.[0];
			element = {
				type: TeXElementType.Environment,
				name: env.env,
				label: `${env.env.charAt(0).toUpperCase()}${env.env.slice(1)}${config.caption && caption ? `: ${(caption as any).content}` : ''}`,
				...attributes
			};
		} else if (config.macros.envs.includes(env.env)) {
			element = {
				type: TeXElementType.Environment,
				name: env.env,
				label: `${env.env.charAt(0).toUpperCase()}${env.env.slice(1)}`,
				...attributes
			};
		}
	} else 	if (node.type === 'macro') {
		const macro = node as Macro;
		const inputCommands = ['input', 'InputIfFileExists', 'include', 'SweaveInput', 'subfile', 'subfileinclude', 'loadglsentries', 'markdownInput'];

		if (inputCommands.includes(macro.content)) {
			const arg0 = sanitizeInputFilePath(argContentToStr(macro.args?.[0]?.content || []));
			const subFile = await resolveFile(
				[getDirname(filePath), getDirname(rootFilePath || ''), ...config.texDirs],
				arg0
			);
			if (subFile) {
				element = {
					type: TeXElementType.SubFile,
					name: macro.content,
					label: config.subFile ? subFile : arg0,
					...attributes
				};
				if (config.subFile) {
					await constructFile(subFile, config, structs);
				}
			}
		} else if (['import', 'inputfrom', 'includefrom'].includes(macro.content)) {
			const arg0 = sanitizeInputFilePath(argContentToStr(macro.args?.[0]?.content || []));
			const arg1 = sanitizeInputFilePath(argContentToStr(macro.args?.[1]?.content || []));
			const subFile = await resolveFile(
				[arg0, joinPath(getDirname(rootFilePath || ''), arg0)],
				arg1
			);
			if (subFile) {
				element = {
					type: TeXElementType.SubFile,
					name: macro.content,
					label: config.subFile ? subFile : arg1,
					...attributes
				};
				if (config.subFile) {
					await constructFile(subFile, config, structs);
				}
			}
		} else if (['subimport', 'subinputfrom', 'subincludefrom'].includes(macro.content)) {
			const arg0 = sanitizeInputFilePath(argContentToStr(macro.args?.[0]?.content || []));
			const arg1 = sanitizeInputFilePath(argContentToStr(macro.args?.[1]?.content || []));
			const subFile = await resolveFile(
				[getDirname(filePath)],
				joinPath(arg0, arg1)
			);
			if (subFile) {
				element = {
					type: TeXElementType.SubFile,
					name: macro.content,
					label: config.subFile ? subFile : arg1,
					...attributes
				};
				if (config.subFile) {
					await constructFile(subFile, config, structs);
				}
			}
		}
	}

	// Handle Rnw chunks
	if (rnwSub.length > 0 && rnwSub[rnwSub.length - 1].line >= attributes.lineFr) {
		const rnw = rnwSub.pop();
		if (rnw) {
			root.children.push({
				type: TeXElementType.SubFile,
				name: 'RnwChild',
				label: config.subFile ? rnw.subFile : rnw.path,
				lineFr: attributes.lineFr,
				lineTo: attributes.lineTo,
				filePath,
				children: []
			});
			if (config.subFile) {
				await constructFile(rnw.subFile, config, structs);
			}
		}
	}

	if (element) {
		root.children.push(element);
		root = element as any;
	}

	// Recursively parse children
	if ('content' in node && typeof nodeAny.content !== 'string' && Array.isArray(nodeAny.content)) {
		for (const sub of nodeAny.content) {
			if (['string', 'parbreak', 'whitespace'].includes(sub.type)) {
				continue;
			}
			inAppendix = await parseNode(sub, rnwSub, root, filePath, config, structs, inAppendix);
		}
	}

	return inAppendix;
}

/**
 * Insert subfile structures into main structure
 */
function insertSubFile(
	structs: Record<string, TeXElement[]>,
	struct?: TeXElement[],
	traversed: string[] = []
): TeXElement[] {
	if (rootFilePath === undefined) {
		return [];
	}
	const structToProcess: TeXElement[] = JSON.parse(JSON.stringify(struct ?? structs[rootFilePath] ?? []));
	traversed = traversed.length === 0 ? [rootFilePath] : traversed;
	const elements: TeXElement[] = [];

	for (const element of structToProcess) {
		if (
			element.type === TeXElementType.SubFile &&
			structs[element.label] &&
			!traversed.includes(element.label)
		) {
			elements.push(...insertSubFile(structs, structs[element.label], [...traversed, element.label]));
			continue;
		}
		if (element.children.length > 0) {
			element.children = insertSubFile(structs, element.children, traversed);
		}
		elements.push(element);
	}

	return elements;
}

/**
 * Nest non-section elements under sections
 */
function nestNonSection(struct: TeXElement[]): TeXElement[] {
	const elements: TeXElement[] = [];
	let currentSection: TeXElement | undefined;

	for (const element of struct) {
		if (element.type === TeXElementType.Section || element.type === TeXElementType.SectionAst) {
			elements.push(element);
			currentSection = element;
		} else if (currentSection === undefined) {
			elements.push(element);
		} else {
			currentSection.children.push(element);
		}
		if (element.children.length > 0) {
			element.children = nestNonSection(element.children);
		}
	}

	return elements;
}

/**
 * Nest sections hierarchically
 */
function nestSection(struct: TeXElement[], config: OutlineConfig): TeXElement[] {
	const stack: TeXElement[] = [];
	const elements: TeXElement[] = [];

	for (const element of struct) {
		if (element.type !== TeXElementType.Section && element.type !== TeXElementType.SectionAst) {
			elements.push(element);
		} else if (stack.length === 0) {
			stack.push(element);
			elements.push(element);
		} else if ((config.secIndex[element.name] ?? -1) <= (config.secIndex[stack[0].name] ?? -1)) {
			stack.length = 0;
			stack.push(element);
			elements.push(element);
		} else if ((config.secIndex[element.name] ?? -1) > (config.secIndex[stack[stack.length - 1].name] ?? -1)) {
			stack[stack.length - 1].children.push(element);
			stack.push(element);
		} else {
			while ((config.secIndex[element.name] ?? -1) <= (config.secIndex[stack[stack.length - 1].name] ?? -1)) {
				stack.pop();
			}
			stack[stack.length - 1].children.push(element);
			stack.push(element);
		}
	}

	return elements;
}

/**
 * Fix section line ranges
 */
function fixSectionToLine(structure: TeXElement[], config: OutlineConfig, lastLine: number): void {
	const sections = structure.filter(
		section => config.secIndex[section.name] !== undefined
	);

	sections.forEach(section => {
		const sameFileSections = sections.filter(
			candidate =>
				candidate.filePath === section.filePath &&
				candidate.lineFr >= section.lineFr &&
				candidate !== section
		);

		if (sameFileSections.length > 0 && sameFileSections[0].lineFr === section.lineFr) {
			// On the same line
			return;
		} else if (sameFileSections.length > 0) {
			section.lineTo = sameFileSections[0].lineFr - 1;
		} else {
			section.lineTo = lastLine;
		}

		if (section.children.length > 0) {
			fixSectionToLine(section.children, config, section.lineTo);
		}
	});
}

/**
 * Add float numbers to labels
 */
function addFloatNumber(struct: TeXElement[], counter: Record<string, number> = {}): TeXElement[] {
	for (const element of struct) {
		if (
			element.type === TeXElementType.Environment &&
			element.name !== 'macro' &&
			element.name !== 'environment'
		) {
			counter[element.name] = (counter[element.name] ?? 0) + 1;
			const parts = element.label.split(':');
			parts[0] += ` ${counter[element.name]}`;
			element.label = parts.join(':');
		}
		if (element.children.length > 0) {
			addFloatNumber(element.children, counter);
		}
	}
	return struct;
}

/**
 * Add section numbers to labels
 */
function addSectionNumber(
	struct: TeXElement[],
	config: OutlineConfig,
	tag = '',
	lowest?: number
): TeXElement[] {
	if (lowest === undefined) {
		const sectionLevels = struct
			.filter(element => config.secIndex[element.name] !== undefined)
			.map(element => config.secIndex[element.name]!);
		lowest = sectionLevels.length > 0 ? Math.min(...sectionLevels) : 0;
	}

	let counter: Record<number, number> = {};
	let inAppendix = false;

	for (const element of struct) {
		if (element.appendix && !inAppendix) {
			inAppendix = true;
			counter = {};
		}

		const secIndex = config.secIndex[element.name];
		if (secIndex === undefined) {
			continue;
		}

		if (element.type === TeXElementType.Section) {
			counter[secIndex] = (counter[secIndex] ?? 0) + 1;
		}

		let sectionNumber =
			tag +
			'0.'.repeat(secIndex - lowest) +
			(counter[secIndex] ?? 0).toString();

		if (inAppendix) {
			const segments = sectionNumber.split('.');
			segments[0] = String.fromCharCode(parseInt(segments[0]) + 64);
			sectionNumber = segments.join('.');
		}

		element.label = `${element.type === TeXElementType.Section ? sectionNumber : '*'} ${element.label}`;

		if (element.children.length > 0) {
			addSectionNumber(element.children, config, sectionNumber + '.', secIndex + 1);
		}
	}

	return struct;
}

/**
 * Parse Rnw child macro
 */
async function parseRnwChildMacro(
	content: string,
	file: string,
	rootFile: string
): Promise<Array<{ subFile: string; path: string; line: number }>> {
	const children: Array<{ subFile: string; path: string; line: number }> = [];
	const childRegExp = /<<(?:[^,]*,)*\s*child='([^']*)'\s*(?:,[^,]*)*>>=/g;

	while (true) {
		const result = childRegExp.exec(content);
		if (!result) {
			break;
		}
		const matchedPath = sanitizeInputFilePath(result[1]);
		const subFile = await resolveFile(
			[getDirname(file), getDirname(rootFile)],
			matchedPath
		);
		if (subFile) {
			const line = (content.slice(0, result.index).match(/\n/g) || []).length;
			children.push({ subFile, path: matchedPath, line });
		}
	}

	return children;
}

/**
 * Refresh LaTeX model configuration
 */
function refreshLaTeXModelConfig(subFile = true, defaultFloats = ['frame']): OutlineConfig {
	const configuration = vscode.workspace.getConfiguration('latex');
	const structConfig: OutlineConfig = {
		macros: {
			cmds: configuration.get<string[]>('outline.commands', ['label']),
			envs: configuration.get<boolean>('outline.floats.enabled', true)
				? ['figure', 'table', ...defaultFloats]
				: defaultFloats,
			secs: []
		},
		secIndex: {},
		texDirs: configuration.get<string[]>('texDirs', []),
		subFile,
		caption: configuration.get<boolean>('outline.floats.caption.enabled', true)
	};

	const hierarchy = configuration.get<string[]>('outline.sections', [
		'part',
		'chapter',
		'section',
		'subsection',
		'subsubsection',
		'paragraph',
		'subparagraph'
	]);

	hierarchy.forEach((sec, index) => {
		sec.split('|').forEach(cmd => {
			structConfig.secIndex[cmd] = index;
		});
	});

	structConfig.macros.secs = hierarchy.map(sec => sec.split('|')).flat();

	return structConfig;
}

