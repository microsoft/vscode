/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// import * as vscode from 'vscode';
import { ConfigKey, IConfigurationService } from '../../../platform/configuration/common/configurationService';
import { IVSCodeExtensionContext } from '../../../platform/extContext/common/extensionContext';
import { IFileSystemService } from '../../../platform/filesystem/common/fileSystemService';
import { IWorkspaceService } from '../../../platform/workspace/common/workspaceService';
import { createServiceIdentifier } from '../../../util/common/services';
import { distinct } from '../../../util/vs/base/common/arrays';
import { CancellationToken } from '../../../util/vs/base/common/cancellation';
import { Disposable } from '../../../util/vs/base/common/lifecycle';
import * as path from '../../../util/vs/base/common/path';
import { URI } from '../../../util/vs/base/common/uri';
import { ILanguageToolsProvider } from './languageToolsProvider';

export interface IDebuggableCommandIdentifier {
	readonly _serviceBrand: undefined;

	/**
	 * Gets whether the given command, run in the given directory, might be debuggable.
	 */
	isDebuggable(cwd: URI | undefined, command: string, token: CancellationToken): Promise<boolean>;
}

export const IDebuggableCommandIdentifier = createServiceIdentifier<IDebuggableCommandIdentifier>('IDebuggableCommandIdentifier');

export class DebuggableCommandIdentifier extends Disposable implements IDebuggableCommandIdentifier {
	declare readonly _serviceBrand: undefined;

	private recentlySeenLanguages = new Set<string>();

	constructor(
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IVSCodeExtensionContext private readonly context: IVSCodeExtensionContext,
		@IWorkspaceService workspaceService: IWorkspaceService,
		@ILanguageToolsProvider private readonly languageToolsProvider: ILanguageToolsProvider,
		@IFileSystemService private readonly fileSystemService: IFileSystemService,
	) {
		super();
		this._register(workspaceService.onDidOpenTextDocument(e => {
			if (!KNOWN_DEBUGGABLE_LANGUAGES.includes(e.languageId)) {
				this.recentlySeenLanguages.add(e.languageId);
			}
		}));
	}

	/**
	 * @inheritdoc
	 *
	 * This logic is as follows:
	 *
	 * - If the user has configured specific inclusions or exclusions for
	 *   the command, then use those.
	 * - If the command being run is a relative path or within the CWD, assume
	 *   it's debuggable. This might be native code compiled to an executable.
	 * - If one of the debuggable commands we know about matches, then it's
	 *   debuggable.
	 * - If the user has interacted with languages for which we don't know the
	 *   appropriate debuggable commands, ask the language model and update
	 *   our storage.
	 *
	 */
	public async isDebuggable(cwd: URI | undefined, commandLine: string, token: CancellationToken): Promise<boolean> {
		if (!this.isGloballyEnabled()) {
			return false;
		}

		const command = extractCommandNameFromCLI(commandLine).toLowerCase();

		return this.getSpecificTreatment(command)
			?? this.isWellKnownCommand(command)
			?? await this.isWorkspaceLocal(cwd, command)
			?? await this.isModelSuggestedCommand(command, token)
			?? false;
	}

	private isGloballyEnabled() {
		return this.configurationService.getConfig(ConfigKey.TerminalToDebuggerEnabled);
	}

	private async isWorkspaceLocal(cwd: URI | undefined, command: string): Promise<true | undefined> {
		const abs = path.isAbsolute(command) ? URI.file(command) : cwd && URI.joinPath(cwd, command);

		if (!abs) {
			return undefined;
		}

		try {
			await this.fileSystemService.stat(abs);
			return true;
		} catch {
			// no-op
		}
	}

	private async isModelSuggestedCommand(command: string, token: CancellationToken) {
		const known = this.loadModelKnownCommands();

		// check ones we queried for previously and don't query for them again.
		for (const language of known.languages) {
			this.recentlySeenLanguages.delete(language);
		}
		if (known.commands.some(c => this.commandIncludes(command, c))) {
			return true;
		}
		if (!this.recentlySeenLanguages.size) {
			return false;
		}

		const languages = [...this.recentlySeenLanguages];
		this.recentlySeenLanguages.clear();
		const { commands, ok } = await this.languageToolsProvider.getToolsForLanguages(languages, token);

		if (ok) {
			this.storeModelKnownCommands({
				languages: known.languages.concat(languages),
				commands: distinct(known.commands.concat(commands)),
			});
		}

		return commands.some(c => this.commandIncludes(command, c));
	}

	private isWellKnownCommand(command: string): boolean | undefined {
		// an 'include' check to handle things like pip3 vs pip
		return KNOWN_DEBUGGABLE_COMMANDS.some(tool => this.commandIncludes(command, tool)) || undefined;
	}

	private getSpecificTreatment(command: string): boolean | undefined {
		const patterns = this.configurationService.getConfig(ConfigKey.Advanced.TerminalToDebuggerPatterns);
		for (const pattern of patterns) {
			if (pattern.startsWith('!') && this.commandIncludes(command, pattern)) {
				return false;
			} else if (this.commandIncludes(command, pattern)) {
				return true;
			}
		}
	}

	private commandIncludes(command: string, needle: string) {
		const idx = command.indexOf(needle);
		return idx >= 0 &&
			(idx === 0 || command[idx - 1] === ' ') &&
			(idx + needle.length === command.length || command[idx + needle.length] === ' ');
	}

	private loadModelKnownCommands() {
		return this.context.globalState.get<IKnownCommandsState>(DEBUGGABLE_COMMAND_STORAGE_KEY, {
			languages: [],
			commands: [],
		});
	}

	private storeModelKnownCommands(commands: IKnownCommandsState) {
		return this.context.globalState.update(DEBUGGABLE_COMMAND_STORAGE_KEY, commands);
	}
}

interface IKnownCommandsState {
	languages: string[];
	commands: string[];
}

const DEBUGGABLE_COMMAND_STORAGE_KEY = 'chat.debuggableCommands';

function extractCommandNameFromCLI(command: string) {
	// todo: support less common cases of quoting and environment variables
	const re = /\s*([^\s]+)/;
	const match = re.exec(command);
	return match ? match[1] : command;
}

/**
 * Seed some built-in patterns to avoid LM lookups for common cases.
 * Generated in test/simulation/debugTools.stest.ts, do not edit directly!
 */
const KNOWN_DEBUGGABLE_COMMANDS = ['abap', 'ant', 'automake', 'autotools', 'ava', 'babel', 'bcp', 'behat', 'behave', 'biber', 'bibtex', 'bmake', 'boot', 'broccoli-sass', 'browserify', 'build_runner', 'bundler', 'busted', 'cabal', 'cargo', 'cargo-bench', 'cargo-fuzz', 'cargo-make', 'cargo-run', 'cargo-test', 'cargo-watch', 'carthage', 'carton', 'clang', 'clippy-driver', 'clj', 'clojure', 'cmake', 'cocoapods', 'codeception', 'common_test', 'composer', 'conan', 'coverage', 'cpan', 'cpanm', 'csc', 'ct_run', 'ctest', 'cucumber', 'cuda-gdb', 'cuda-memcheck', 'cypress', 'dart', 'dart-sass', 'dart2js', 'dartanalyzer', 'dartdevc', 'db2cli', 'ddemangle', 'devenv', 'devtools', 'dfix', 'dialyzer', 'dmd', 'doctest', 'dotnet', 'dotnet-script', 'dotnet-test-nunit', 'dotnet-test-xunit', 'dpp', 'dscanner', 'dsymutil', 'dub', 'dune', 'dustmite', 'dvilualatex', 'dvipdf', 'dvipdfmx', 'dvips', 'erl', 'erlang', 'erlc', 'esbuild', 'escript', 'eunit', 'eyeglass', 'fastlane', 'fennel', 'flutter', 'forever', 'fpc', 'fsharpc', 'fsi', 'g', 'gaiden', 'gcc', 'gcov', 'gdb', 'gdc', 'ghc', 'ghcid', 'gmake', 'gmaven', 'go', 'gpars', 'gradle', 'grape', 'griffon', 'grinder', 'grip', 'groovy', 'groovyc', 'grunt', 'grunt-sass', 'gulp', 'gulp-sass', 'hdevtools', 'hlint', 'hspec', 'irb', 'isql', 'jasmine', 'java', 'javac', 'jazzy', 'jdeps', 'jest', 'jlink', 'julia', 'junit', 'kaocha', 'karma', 'kobalt', 'kotest', 'kotlin-dsl', 'kotlinc', 'kscript', 'latexmk', 'lazbuild', 'lcov', 'ld', 'ldc2', 'ldoc', 'leiningen', 'lldb', 'lua', 'luacheck', 'luajit', 'lualatex', 'luarocks', 'luaunit', 'make', 'markdown', 'markdown-it', 'markdown-pdf', 'marked', 'matlab', 'maven', 'mbuild', 'mcc', 'md2pdf', 'mdbook', 'merlin', 'mex', 'midje', 'minitest', 'mlint', 'mmake', 'mocha', 'mockk', 'mono', 'moonscript', 'msbuild', 'mssql-cli', 'mstest', 'multimarkdown', 'mysql', 'ncu', 'ninja', 'nmake', 'node', 'node-sass', 'nose', 'npm', 'npx', 'nrepl', 'nsight', 'nsys', 'nunit-console', 'nvcc', 'ocamlbuild', 'ocamlc', 'ocamldebug', 'ocamlfind', 'ocamlopt', 'ocamlrun', 'opam', 'otest', 'otool', 'paket', 'panda', 'pandoc', 'parcel', 'pdflatex', 'perl', 'perl6', 'perlbrew', 'pgbench', 'phing', 'php', 'php-cs-fixer', 'phpcs', 'phpdbg', 'phpstan', 'phpunit', 'pip', 'pipenv', 'plackup', 'playwright', 'pm2', 'pmake', 'powershell', 'ppc386', 'ppcrossarm', 'ppcrossavr', 'ppcrossmips', 'ppcrossppc', 'ppcrosssparc', 'ppcrosswin32', 'ppcrossx64', 'protractor', 'prove', 'pry', 'psql', 'psysh', 'pub', 'pwsh', 'pytest', 'python', 'qmake', 'quickcheck', 'rails', 'rake', 'rakudo', 'rdmd', 'react-scripts', 'rebar3', 'relx', 'remake', 'rollup', 'rspec', 'rubocop', 'ruby', 'runghc', 'rustc', 'rustup', 'sass', 'sassc', 'scons', 'showdown', 'sinatra', 'speclj', 'spek', 'spock', 'spring-boot', 'sqlcmd', 'sqlite3', 'sqsh', 'stack', 'svelte-kit', 'swift', 'swiftc', 'test', 'test-runner', 'testng', 'testthat', 'tools', 'torch', 'tox', 'ts-node', 'tsc', 'unittest', 'utop', 'valgrind', 'vbc', 'virtualenv', 'vite', 'vstest', 'vue-cli-service', 'vue-test-utils', 'webdev', 'webpack', 'x', 'xcodebuild', 'xctest', 'xelatex', 'xunit', 'yarn', 'zef', 'zig'];

/**
 * Languages the {@link KNOWN_DEBUGGABLE_COMMANDS} covers.
 * Generated in test/simulation/debugTools.stest.ts, do not edit directly!
 */
const KNOWN_DEBUGGABLE_LANGUAGES = ['abap', 'bat', 'bibtex', 'c', 'clojure', 'code-refactoring', 'coffeescript', 'cpp', 'csharp', 'css', 'cuda-cpp', 'd', 'dart', 'diff', 'dockercompose', 'dockerfile', 'erlang', 'fsharp', 'git-commit', 'git-rebase', 'github-issues', 'go', 'graphql', 'groovy', 'haml', 'handlebars', 'haskell', 'html', 'ini', 'jade', 'java', 'javascript', 'javascriptreact', 'json', 'jsonc', 'julia', 'kotlin', 'latex', 'less', 'log', 'lua', 'makefile', 'markdown', 'matlab', 'objective-c', 'objective-cpp', 'ocaml', 'pascal', 'perl', 'perl6', 'php', 'pip-requirements', 'plaintext', 'powershell', 'pug', 'python', 'r', 'razor', 'ruby', 'rust', 'sass', 'scss', 'shaderlab', 'shellscript', 'slim', 'snippets', 'sql', 'stylus', 'svelte', 'swift', 'tex', 'text', 'toml', 'typescript', 'typescriptreact', 'vb', 'vue', 'vue-html', 'xml', 'xsl', 'yaml', 'zig'];
