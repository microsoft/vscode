/*---------------------------------------------------------------------------------------------
 *  Copyright (c) RoboAgent. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * A lightweight, best-effort extraction of the ROS2-relevant facts from a
 * `CMakeLists.txt`. This is not a CMake evaluator — it recognises the common
 * ament_cmake call shapes by regex. Good enough to populate the knowledge
 * graph with executable targets and interface generation.
 */
/** An `add_executable(<name> <sources...>)` target. */
export interface CMakeExecutable {
	readonly name: string;
	/** Source files listed for the target (relative paths, e.g. `src/talker.cpp`). */
	readonly sources: string[];
}

export interface ParsedCMakeLists {
	/** Executable target names from `add_executable(<name> ...)`. */
	readonly executables: string[];
	/** Executable targets with their listed source files. */
	readonly executableTargets: CMakeExecutable[];
	/** Packages passed to `find_package(<pkg> ...)`. */
	readonly findPackages: string[];
	/** True when `rosidl_generate_interfaces(...)` is present (interface package). */
	readonly generatesInterfaces: boolean;
	/** Interface files (e.g. `msg/Foo.msg`) listed in `rosidl_generate_interfaces`. */
	readonly interfaceFiles: string[];
}

/** Strip `#` line comments and `#[[ ]]` block comments. */
function stripComments(text: string): string {
	return text
		.replace(/#\[\[[\s\S]*?\]\]/g, '')
		.replace(/#[^\n]*/g, '');
}

function matchAll(text: string, re: RegExp): RegExpExecArray[] {
	const out: RegExpExecArray[] = [];
	let m: RegExpExecArray | null;
	while ((m = re.exec(text)) !== null) {
		out.push(m);
	}
	return out;
}

export function parseCMakeLists(rawText: string): ParsedCMakeLists {
	const text = stripComments(rawText);

	// add_executable(target_name src1.cpp src2.cpp ...) — capture target + its sources.
	const CPP_SOURCE_RE = /\.(?:cpp|cc|cxx|c\+\+|c)$/i;
	const executableTargets: CMakeExecutable[] = [];
	for (const m of matchAll(text, /add_executable\s*\(([^)]*)\)/g)) {
		const tokens = m[1].split(/\s+/).map(t => t.trim()).filter(Boolean);
		if (tokens.length === 0) {
			continue;
		}
		const name = tokens[0];
		if (name.startsWith('$')) {
			continue; // ${VAR} target we can't resolve
		}
		const sources = tokens.slice(1).filter(t => !t.startsWith('$') && CPP_SOURCE_RE.test(t));
		executableTargets.push({ name, sources: dedupe(sources) });
	}
	const executables = dedupe(executableTargets.map(t => t.name));

	const findPackages = matchAll(text, /find_package\s*\(\s*([A-Za-z0-9_.-]+)/g)
		.map(m => m[1])
		.filter(name => name !== 'ament_cmake' && name !== 'ament_cmake_ros');

	const interfaceBlocks = matchAll(text, /rosidl_generate_interfaces\s*\(([\s\S]*?)\)/g);
	const generatesInterfaces = interfaceBlocks.length > 0;
	const interfaceFiles: string[] = [];
	for (const block of interfaceBlocks) {
		const body = block[1];
		// Tokens that look like msg/Foo.msg, srv/Bar.srv, action/Baz.action
		for (const m of matchAll(body, /["']?((?:msg|srv|action)\/[A-Za-z0-9_./-]+\.(?:msg|srv|action))["']?/g)) {
			interfaceFiles.push(m[1]);
		}
	}

	return {
		executables,
		executableTargets,
		findPackages: dedupe(findPackages),
		generatesInterfaces,
		interfaceFiles: dedupe(interfaceFiles)
	};
}

function dedupe(values: string[]): string[] {
	return Array.from(new Set(values));
}
