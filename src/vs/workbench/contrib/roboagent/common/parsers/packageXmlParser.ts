/*---------------------------------------------------------------------------------------------
 *  Copyright (c) RoboAgent. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Ros2BuildType } from '../ros2WorkspaceModel.js';

/**
 * The result of parsing a `package.xml` manifest. `buildType` is `undefined`
 * when the manifest does not declare one via `<export><build_type>` — callers
 * should fall back to inspecting sibling files (CMakeLists.txt / setup.py).
 */
export interface ParsedPackageXml {
	readonly name: string;
	readonly version: string;
	readonly description: string;
	readonly maintainers: string[];
	readonly buildType: Ros2BuildType | undefined;
	readonly dependencies: {
		readonly build: string[];
		readonly exec: string[];
		readonly test: string[];
	};
	readonly isInterfacePackage: boolean;
}

const TAG_CACHE = new Map<string, RegExp>();

/** Case-sensitive match of the (first) text content of `<tag>...</tag>`. */
function firstTag(xml: string, tag: string): string | undefined {
	let re = TAG_CACHE.get(tag);
	if (!re) {
		re = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, 'i');
		TAG_CACHE.set(tag, re);
	}
	const m = re.exec(xml);
	return m ? decodeEntities(m[1].trim()) : undefined;
}

/** All text contents of every `<tag>...</tag>` occurrence. */
function allTags(xml: string, tag: string): string[] {
	const re = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, 'ig');
	const out: string[] = [];
	let m: RegExpExecArray | null;
	while ((m = re.exec(xml)) !== null) {
		const value = decodeEntities(m[1].trim());
		if (value) {
			out.push(value);
		}
	}
	return out;
}

function decodeEntities(text: string): string {
	return text
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&quot;/g, '"')
		.replace(/&apos;/g, '\'')
		.replace(/&amp;/g, '&');
}

/** Strip XML comments so commented-out dependencies are ignored. */
function stripComments(xml: string): string {
	return xml.replace(/<!--[\s\S]*?-->/g, '');
}

function dedupe(values: string[]): string[] {
	return Array.from(new Set(values));
}

/**
 * Parse a ROS2 `package.xml` manifest (format 1/2/3). Tolerant of missing
 * fields; never throws. Returns `undefined` when no `<name>` can be found,
 * which callers treat as "not a real package manifest".
 */
export function parsePackageXml(rawXml: string): ParsedPackageXml | undefined {
	const xml = stripComments(rawXml);

	const name = firstTag(xml, 'name');
	if (!name) {
		return undefined;
	}

	// <depend> counts as both build and exec dependency.
	const commonDeps = allTags(xml, 'depend');
	const buildDeps = dedupe([
		...allTags(xml, 'build_depend'),
		...allTags(xml, 'buildtool_depend'),
		...commonDeps
	]);
	const execDeps = dedupe([
		...allTags(xml, 'exec_depend'),
		...allTags(xml, 'run_depend'), // format 1 legacy
		...commonDeps
	]);
	const testDeps = dedupe(allTags(xml, 'test_depend'));

	// Maintainer text lives between the tags; the email is an attribute we ignore.
	const maintainers = dedupe(allTags(xml, 'maintainer'));

	// <export><build_type>ament_cmake</build_type></export>
	const buildType = normalizeBuildType(firstTag(xml, 'build_type'));

	// <member_of_group>rosidl_interface_packages</member_of_group>
	const isInterfacePackage = allTags(xml, 'member_of_group').some(g => g === 'rosidl_interface_packages');

	return {
		name,
		version: firstTag(xml, 'version') ?? '0.0.0',
		description: firstTag(xml, 'description') ?? '',
		maintainers,
		buildType,
		dependencies: { build: buildDeps, exec: execDeps, test: testDeps },
		isInterfacePackage
	};
}

function normalizeBuildType(value: string | undefined): Ros2BuildType | undefined {
	switch (value) {
		case 'ament_cmake':
		case 'ament_python':
		case 'cmake':
			return value;
		default:
			return undefined;
	}
}
