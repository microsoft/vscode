/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createServiceIdentifier } from '../../../util/common/services';
import { ExcludeSettingOptions } from '../../../vscodeTypes';
import { IFileSystemService } from '../../filesystem/common/fileSystemService';
import { ISearchService } from '../../search/common/searchService';

export const ITestDepsResolver = createServiceIdentifier<ITestDepsResolver>('ITestDepsResolver');

export interface ITestDepsResolver {

	readonly _serviceBrand: undefined;

	/**
	 * @returns The list of test dependencies for the current file based on the language either using language knowledge or by using Copilot.
	 */
	getTestDeps(languageId: string): Promise<string[]>;
}

export class TestDepsResolver implements ITestDepsResolver {
	declare readonly _serviceBrand: undefined;

	/**
	 * languageId -> test dependencies
	 *
	 * TODO@ulugbekna: this can be outdated if package.json changes or a new workspace folder with a different package.json is added
	 */
	private _cachedResults: Map<string, string[]>;

	private readonly _textDecoder: TextDecoder;

	private _perLanguageTestDepsFinder: Map<string, ITestDepsFinder> = new Map();

	constructor(
		@ISearchService private readonly _searchService: ISearchService,
		@IFileSystemService private readonly _fileSystemService: IFileSystemService,
	) {
		this._cachedResults = new Map();
		this._textDecoder = new TextDecoder();
	}

	async getTestDeps(languageId: string): Promise<string[]> {
		const cachedResult = this._cachedResults.get(languageId);
		if (cachedResult !== undefined) {
			return cachedResult;
		}

		const testDepsFinder = this.getTestDepsFinder(languageId);
		if (testDepsFinder === undefined) {
			return [];
		}

		const result = await testDepsFinder.findTestDeps();

		this._cachedResults.set(languageId, result);
		return result;
	}

	private getTestDepsFinder(languageId: string): ITestDepsFinder | undefined {
		let finder = this._perLanguageTestDepsFinder.get(languageId);
		if (finder === undefined) {
			switch (languageId) {
				case 'javascript':
				case 'javascriptreact':
				case 'typescript':
				case 'typescriptreact': {
					finder = new JsTsTestDepsFinder(this._searchService, this._fileSystemService, this._textDecoder);
					break;
				}
				case 'python': {
					finder = new PyTestDepsFinder(this._searchService, this._fileSystemService, this._textDecoder);
					break;
				}
				case 'java': {
					finder = new JavaTestDepsFinder(this._searchService, this._fileSystemService, this._textDecoder);
					break;
				}
			}
		}
		if (finder !== undefined) {
			this._perLanguageTestDepsFinder.set(languageId, finder);
		}
		return finder;
	}
}

export interface ITestDepsFinder {
	findTestDeps(): Promise<string[]>;
}

class JsTsTestDepsFinder implements ITestDepsFinder {

	private _jsTsTestDeps = new Set(['mocha', 'jest', 'vitest', 'chai', 'ava', 'jasmine', 'qunit', 'tape', 'cypress', 'puppeteer', 'enzyme', 'testing-library', 'sinon', 'supertest', 'happy-dom', 'playwright']);

	constructor(
		private readonly _searchService: ISearchService,
		private readonly _fileSystemService: IFileSystemService,
		private readonly _textDecoder: TextDecoder,
	) {
	}

	/**
	 * Search for test dependencies in package.json files in the workspace.
	 */
	public async findTestDeps(): Promise<string[]> {
		const packageJsonUris = await this._searchService.findFiles('**/package.json', { exclude: ['**/node_modules/**'], useExcludeSettings: ExcludeSettingOptions.FilesExclude });
		const testDeps = await Promise.allSettled(
			packageJsonUris.map(async uri => {
				const content = await this._fileSystemService.readFile(uri);
				const packageJson = JSON.parse(this._textDecoder.decode(content));
				const deps = packageJson.dependencies || {};
				const devDeps = packageJson.devDependencies || {};
				const testDeps = [deps, devDeps].flatMap(deps => Object.keys(deps).filter(dep => this._jsTsTestDeps.has(dep)));
				return testDeps;
			})
		);
		return testDeps.flatMap(result => result.status === 'fulfilled' ? result.value : []);
	}
}

class PyTestDepsFinder implements ITestDepsFinder {

	private _pyTestDeps = ['pytest', 'nose', 'unittest', 'tox', 'doctest', 'hypothesis', 'mock', 'coverage', 'behave', 'robotframework'];

	constructor(
		private readonly _searchService: ISearchService,
		private readonly _fileSystemService: IFileSystemService,
		private readonly _textDecoder: TextDecoder,
	) {
	}

	/**
	 * Search for test dependencies in package.json files in the workspace.
	 */
	public async findTestDeps(): Promise<string[]> {
		const testDeps = new Set<string>();

		const projectFiles = ['pyproject.toml', 'setup.py', 'requirements.txt', 'tox.ini'];

		const projectFileUris = await this._searchService.findFiles(`**/{${projectFiles.join(',')}}`);

		await Promise.all(projectFileUris.map(async uri => {
			const content = await this._fileSystemService.readFile(uri);
			const contentStr = this._textDecoder.decode(content);

			if (uri.path.endsWith('pyproject.toml')) {
				// pyproject.toml
				const deps = this._getPyProjectTomlDeps(contentStr);
				deps.forEach((dep: string) => testDeps.add(dep));
			} else if (uri.path.endsWith('setup.py')) {
				// setup.py
				const deps = this._getSetupPyDeps(contentStr);
				deps.forEach((dep: string) => testDeps.add(dep));
			} else if (uri.path.endsWith('requirements.txt')) {
				// requirements.txt
				const deps = this._getRequirementsTxtDeps(contentStr);
				deps.forEach((dep: string) => testDeps.add(dep));
			} else if (uri.path.endsWith('tox.ini')) {
				// tox.ini
				testDeps.add('tox');
			}
		}));
		return Array.from(testDeps);
	}

	private _getPyProjectTomlDeps(content: string): string[] {
		return this._pyTestDeps.filter(testDep => content.includes(testDep));
	}

	private _getSetupPyDeps(content: string): string[] {
		return this._pyTestDeps.filter(testDep => content.includes(testDep));
	}

	private _getRequirementsTxtDeps(content: string): string[] {
		return this._pyTestDeps.filter(testDep => content.includes(testDep));
	}
}

class JavaTestDepsFinder implements ITestDepsFinder {

	private _javaTestDeps = ['junit', 'testng', 'mockito', 'assertj', 'hamcrest', 'powermock', 'spock', 'cucumber', 'arquillian', 'selenium', 'rest-assured', 'wiremock', 'pitest'];

	constructor(
		private readonly _searchService: ISearchService,
		private readonly _fileSystemService: IFileSystemService,
		private readonly _textDecoder: TextDecoder,
	) {
	}

	async findTestDeps(): Promise<string[]> {
		const testDeps = new Set<string>();

		const projectFiles = ['pom.xml', 'build.gradle', 'build.gradle.kts'];

		const projectFileUris = await this._searchService.findFiles(`**/{${projectFiles.join(',')}}`);

		await Promise.all(projectFileUris.map(async uri => {
			const content = await this._fileSystemService.readFile(uri);
			const contentStr = this._textDecoder.decode(content);

			this._javaTestDeps.filter(testDep => contentStr.includes(testDep)).forEach(dep => testDeps.add(dep));
		}));

		return Array.from(testDeps);
	}
}
