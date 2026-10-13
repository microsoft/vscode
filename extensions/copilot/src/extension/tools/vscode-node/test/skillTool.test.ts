/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { FileType } from '../../../../platform/filesystem/common/fileTypes';
import { URI } from '../../../../util/vs/base/common/uri';
import { listRelatedFiles, listRelatedFilesRecursive, parseSkillContext, ReadDirectoryFn, resolveSkillUri } from '../../node/skillTool';

suite('parseSkillContext', () => {
	test('returns inline when no frontmatter', () => {
		assert.strictEqual(parseSkillContext('# My Skill\nSome content'), 'inline');
	});

	test('returns inline when frontmatter has no context field', () => {
		const content = '---\nname: test\n---\n# My Skill';
		assert.strictEqual(parseSkillContext(content), 'inline');
	});

	test('returns fork when context is fork', () => {
		const content = '---\ncontext: fork\n---\n# My Skill';
		assert.strictEqual(parseSkillContext(content), 'fork');
	});

	test('returns inline when context is not fork', () => {
		const content = '---\ncontext: inline\n---\n# My Skill';
		assert.strictEqual(parseSkillContext(content), 'inline');
	});

	test('returns fork with extra whitespace around value', () => {
		const content = '---\ncontext:   fork  \n---\n# My Skill';
		assert.strictEqual(parseSkillContext(content), 'fork');
	});

	test('returns inline for empty content', () => {
		assert.strictEqual(parseSkillContext(''), 'inline');
	});

	test('handles context field among other frontmatter fields', () => {
		const content = '---\nname: my-skill\ncontext: fork\ndescription: A skill\n---\n# My Skill';
		assert.strictEqual(parseSkillContext(content), 'fork');
	});

	test('returns inline when frontmatter delimiters are missing closing', () => {
		const content = '---\ncontext: fork\n# No closing delimiter';
		assert.strictEqual(parseSkillContext(content), 'inline');
	});

	test('returns inline when --- appears only once', () => {
		const content = '---\nSome text without closing frontmatter';
		assert.strictEqual(parseSkillContext(content), 'inline');
	});

	test('returns inline for context value that contains fork as substring', () => {
		const content = '---\ncontext: forked\n---\n# My Skill';
		assert.strictEqual(parseSkillContext(content), 'inline');
	});

	test('returns inline when context field is in body not frontmatter', () => {
		const content = '---\nname: test\n---\ncontext: fork\n# Not in frontmatter';
		assert.strictEqual(parseSkillContext(content), 'inline');
	});

	test('returns inline for context: Fork (case-sensitive)', () => {
		const content = '---\ncontext: Fork\n---\n# My Skill';
		assert.strictEqual(parseSkillContext(content), 'inline');
	});

	test('returns inline for context: FORK (case-sensitive)', () => {
		const content = '---\ncontext: FORK\n---\n# My Skill';
		assert.strictEqual(parseSkillContext(content), 'inline');
	});

	test('returns inline when context key is part of another key', () => {
		const content = '---\nmycontext: fork\n---\n# My Skill';
		assert.strictEqual(parseSkillContext(content), 'inline');
	});

	test('handles context as first field in frontmatter', () => {
		const content = '---\ncontext: fork\nname: test\n---\n# My Skill';
		assert.strictEqual(parseSkillContext(content), 'fork');
	});

	test('handles context as last field in frontmatter', () => {
		const content = '---\nname: test\ndescription: A skill\ncontext: fork\n---\n# My Skill';
		assert.strictEqual(parseSkillContext(content), 'fork');
	});

	test('returns inline for empty frontmatter', () => {
		const content = '---\n---\n# My Skill';
		assert.strictEqual(parseSkillContext(content), 'inline');
	});

	test('returns inline for context with no value', () => {
		const content = '---\ncontext:\n---\n# My Skill';
		assert.strictEqual(parseSkillContext(content), 'inline');
	});

	test('returns inline when --- appears in body after valid frontmatter', () => {
		const content = '---\nname: test\n---\nSome body\n---\ncontext: fork\n---';
		assert.strictEqual(parseSkillContext(content), 'inline');
	});

	test('handles content with only frontmatter and no body', () => {
		const content = '---\ncontext: fork\n---';
		assert.strictEqual(parseSkillContext(content), 'fork');
	});

	test('handles multiline frontmatter values before context', () => {
		const content = '---\ndescription: |\n  This is a long\n  multiline description\ncontext: fork\n---\n# My Skill';
		assert.strictEqual(parseSkillContext(content), 'fork');
	});

	test('returns inline for context with quoted value', () => {
		const content = '---\ncontext: "fork"\n---\n# My Skill';
		assert.strictEqual(parseSkillContext(content), 'inline');
	});

	test('handles tab-indented context value', () => {
		const content = '---\ncontext:\tfork\n---\n# Skill';
		assert.strictEqual(parseSkillContext(content), 'fork');
	});
});

suite('listRelatedFilesRecursive', () => {
	function makeReadDirectory(tree: Record<string, [string, FileType][]>): ReadDirectoryFn {
		return async (uri: URI) => {
			return tree[uri.path] ?? [];
		};
	}

	const baseUri = URI.file('/skills/my-skill');

	test('lists files excluding SKILL.md', async () => {
		const readDir = makeReadDirectory({
			'/skills/my-skill': [
				['SKILL.md', FileType.File],
				['helper.py', FileType.File],
				['README.md', FileType.File],
			],
		});

		const files: string[] = [];
		await listRelatedFilesRecursive(baseUri, baseUri, files, readDir);
		assert.deepStrictEqual(files, ['helper.py', 'README.md']);
	});

	test('excludes SKILL.md case-insensitively', async () => {
		const readDir = makeReadDirectory({
			'/skills/my-skill': [
				['skill.md', FileType.File],
				['Skill.MD', FileType.File],
				['data.json', FileType.File],
			],
		});

		const files: string[] = [];
		await listRelatedFilesRecursive(baseUri, baseUri, files, readDir);
		assert.deepStrictEqual(files, ['data.json']);
	});

	test('recurses into subdirectories', async () => {
		const readDir = makeReadDirectory({
			'/skills/my-skill': [
				['SKILL.md', FileType.File],
				['lib', FileType.Directory],
			],
			'/skills/my-skill/lib': [
				['utils.ts', FileType.File],
			],
		});

		const files: string[] = [];
		await listRelatedFilesRecursive(baseUri, baseUri, files, readDir);
		assert.deepStrictEqual(files, ['lib/utils.ts']);
	});

	test('skips blacklisted directories', async () => {
		const readDir = makeReadDirectory({
			'/skills/my-skill': [
				['index.ts', FileType.File],
				['node_modules', FileType.Directory],
				['.git', FileType.Directory],
				['src', FileType.Directory],
			],
			'/skills/my-skill/node_modules': [
				['pkg.json', FileType.File],
			],
			'/skills/my-skill/.git': [
				['HEAD', FileType.File],
			],
			'/skills/my-skill/src': [
				['main.ts', FileType.File],
			],
		});

		const files: string[] = [];
		await listRelatedFilesRecursive(baseUri, baseUri, files, readDir);
		assert.deepStrictEqual(files, ['index.ts', 'src/main.ts']);
	});

	test('respects max depth of 5', async () => {
		// Build a tree 7 levels deep
		const tree: Record<string, [string, FileType][]> = {};
		for (let i = 0; i <= 7; i++) {
			const path = '/skills/my-skill' + '/d'.repeat(i);
			const entries: [string, FileType][] = [
				[`file${i}.txt`, FileType.File],
			];
			if (i < 7) {
				entries.push(['d', FileType.Directory]);
			}
			tree[path] = entries;
		}

		const readDir = makeReadDirectory(tree);
		const files: string[] = [];
		await listRelatedFilesRecursive(baseUri, baseUri, files, readDir);

		// depth 0 (root) through depth 5 should have files (6 files total)
		// depth 6+ should be skipped
		assert.strictEqual(files.length, 6);
		assert.ok(files.includes('file0.txt'));
		assert.ok(files.includes('d/d/d/d/d/file5.txt'));
		assert.ok(!files.some(f => f.includes('file6.txt')));
	});

	test('stops at MAX_RELATED_FILES (50)', async () => {
		const entries: [string, FileType][] = [];
		for (let i = 0; i < 60; i++) {
			entries.push([`file${i}.txt`, FileType.File]);
		}

		const readDir = makeReadDirectory({
			'/skills/my-skill': entries,
		});

		const files: string[] = [];
		await listRelatedFilesRecursive(baseUri, baseUri, files, readDir);
		assert.strictEqual(files.length, 50);
	});
});

suite('listRelatedFiles', () => {
	test('returns empty array on error', async () => {
		const readDir: ReadDirectoryFn = async () => {
			throw new Error('ENOENT');
		};

		const result = await listRelatedFiles(URI.file('/nonexistent'), readDir);
		assert.deepStrictEqual(result, []);
	});

	test('returns files from flat directory', async () => {
		const readDir: ReadDirectoryFn = async () => [
			['SKILL.md', FileType.File],
			['template.txt', FileType.File],
		];

		const result = await listRelatedFiles(URI.file('/skills/test'), readDir);
		assert.deepStrictEqual(result, ['template.txt']);
	});
});

suite('resolveSkillUri', () => {
	const skillA = URI.file('/skills/alpha/SKILL.md');
	const skillB = URI.file('/skills/beta/SKILL.md');
	const skillC = URI.file('/skills/gamma/SKILL.md');

	function makeSkillIndex(...uris: URI[]): { readonly skills: Iterable<URI> } {
		return { skills: uris };
	}

	function makeGetSkillInfo(map: Map<string, string>): (uri: URI) => { readonly skillName: string } | undefined {
		return (uri: URI) => {
			const name = map.get(uri.toString());
			return name ? { skillName: name } : undefined;
		};
	}

	test('resolves matching skill by name', () => {
		const infoMap = new Map([
			[skillA.toString(), 'alpha'],
			[skillB.toString(), 'beta'],
		]);
		const result = resolveSkillUri(
			'beta',
			'index-content',
			() => makeSkillIndex(skillA, skillB),
			makeGetSkillInfo(infoMap),
		);
		assert.strictEqual(result.toString(), skillB.toString());
	});

	test('resolves first skill when only one exists', () => {
		const infoMap = new Map([[skillA.toString(), 'alpha']]);
		const result = resolveSkillUri(
			'alpha',
			'index-content',
			() => makeSkillIndex(skillA),
			makeGetSkillInfo(infoMap),
		);
		assert.strictEqual(result.toString(), skillA.toString());
	});

	test('throws when skill name not found, lists available skills', () => {
		const infoMap = new Map([
			[skillA.toString(), 'alpha'],
			[skillB.toString(), 'beta'],
			[skillC.toString(), 'gamma'],
		]);
		assert.throws(
			() => resolveSkillUri(
				'nonexistent',
				'index-content',
				() => makeSkillIndex(skillA, skillB, skillC),
				makeGetSkillInfo(infoMap),
			),
			(err: Error) => {
				assert.ok(err.message.includes('"nonexistent"'));
				assert.ok(err.message.includes('Available skills: alpha, beta, gamma'));
				return true;
			}
		);
	});

	test('throws when indexValue is undefined', () => {
		assert.throws(
			() => resolveSkillUri(
				'any-skill',
				undefined,
				() => makeSkillIndex(),
				() => undefined,
			),
			(err: Error) => {
				assert.ok(err.message.includes('"any-skill" not found'));
				assert.ok(!err.message.includes('Available skills'));
				return true;
			}
		);
	});

	test('throws with no available skills when index has no skills', () => {
		assert.throws(
			() => resolveSkillUri(
				'missing',
				'index-content',
				() => makeSkillIndex(),
				() => undefined,
			),
			(err: Error) => {
				assert.ok(err.message.includes('"missing" not found'));
				assert.ok(!err.message.includes('Available skills'));
				return true;
			}
		);
	});

	test('skips skills where getSkillInfo returns undefined', () => {
		const infoMap = new Map([
			[skillB.toString(), 'beta'],
		]);
		// skillA has no info, only skillB does
		assert.throws(
			() => resolveSkillUri(
				'nonexistent',
				'index-content',
				() => makeSkillIndex(skillA, skillB),
				makeGetSkillInfo(infoMap),
			),
			(err: Error) => {
				// Only beta should appear in available skills
				assert.ok(err.message.includes('Available skills: beta'));
				assert.ok(!err.message.includes('alpha'));
				return true;
			}
		);
	});

	test('returns first match when multiple skills have same name', () => {
		const uri1 = URI.file('/skills/a/SKILL.md');
		const uri2 = URI.file('/skills/b/SKILL.md');
		const result = resolveSkillUri(
			'duplicate',
			'index-content',
			() => makeSkillIndex(uri1, uri2),
			() => ({ skillName: 'duplicate' }),
		);
		assert.strictEqual(result.toString(), uri1.toString());
	});

	test('passes index text to parseInstructionIndexFile', () => {
		let receivedText: string | undefined;
		const infoMap = new Map([[skillA.toString(), 'alpha']]);
		resolveSkillUri(
			'alpha',
			'my-special-index-content',
			(text) => { receivedText = text; return makeSkillIndex(skillA); },
			makeGetSkillInfo(infoMap),
		);
		assert.strictEqual(receivedText, 'my-special-index-content');
	});

	test('does not call parseInstructionIndexFile when indexValue is undefined', () => {
		let wasCalled = false;
		assert.throws(
			() => resolveSkillUri(
				'skill',
				undefined,
				() => { wasCalled = true; return makeSkillIndex(); },
				() => undefined,
			),
		);
		assert.strictEqual(wasCalled, false);
	});

	test('matches skill name exactly (case-sensitive)', () => {
		const infoMap = new Map([[skillA.toString(), 'Alpha']]);
		assert.throws(
			() => resolveSkillUri(
				'alpha',
				'index-content',
				() => makeSkillIndex(skillA),
				makeGetSkillInfo(infoMap),
			),
			(err: Error) => {
				assert.ok(err.message.includes('Available skills: Alpha'));
				return true;
			}
		);
	});
});
