/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ok } from 'assert';
import { join } from 'path';
import { deserializeWorkbenchState } from '../../src/platform/test/node/promptContextModel';
import { ITestingServicesAccessor } from '../../src/platform/test/node/services';
import { extractCodeBlocks, extractInlineCode } from '../../src/util/common/markdown';
import { ssuite, stest } from '../base/stest';
import { ScenarioEvaluator } from './scenarioLoader';
import { generateScenarioTestRunner } from './scenarioTest';

const scenarioFolder = join(__dirname, '..', 'test/scenarios/test-terminal/');

type SupportedShellType = 'bash' | 'fish' | 'powershell' | 'zsh';

type TerminalTestCaseSingleAnswer = (string | RegExp)[];
type TerminalTestCaseShellSpecificAnswer = (
	// Shell-specific answers
	Partial<Record<SupportedShellType, TerminalTestCaseSingleAnswer>>
	&
	// Negated shell-specific answers
	Partial<Record<`!${SupportedShellType}`, TerminalTestCaseSingleAnswer>>
	&
	(
		{
			// Answers that apply to any shell
			any?: TerminalTestCaseSingleAnswer;
			// The fallback default answer when no shell-specific answer exists
			default: TerminalTestCaseSingleAnswer;
		}
		|
		{
			// Answers that apply to any shell
			any: TerminalTestCaseSingleAnswer;
			// The fallback default answer when no shell-specific answer exists
			default?: TerminalTestCaseSingleAnswer;
		}
	)
);

interface ITerminalTestCase {
	/**
	 * The question being asked.
	 */
	question: string;
	/**
	 * The shell type context.
	 */
	shellType: SupportedShellType;
	/**
	 * The ideal answer(s) to the question.
	 */
	bestAnswer: TerminalTestCaseSingleAnswer | TerminalTestCaseShellSpecificAnswer;
	/**
	 * Answers that are acceptable but not ideal, for example they may do what asked but in a more
	 * complicated way than necessary or require slight user tweaks.
	 */
	acceptableAnswers?: TerminalTestCaseSingleAnswer | Partial<TerminalTestCaseShellSpecificAnswer>;
}

const supportedShells = [
	'bash',
	'fish',
	'powershell',
	'zsh'
] as const;

function getShellSpecificAnswer(answerObject: TerminalTestCaseSingleAnswer | TerminalTestCaseShellSpecificAnswer | Partial<TerminalTestCaseShellSpecificAnswer>, shellType: SupportedShellType): TerminalTestCaseSingleAnswer {
	// No shell-specific answers
	if (Array.isArray(answerObject)) {
		return answerObject;
	}

	let answer: TerminalTestCaseSingleAnswer;
	if (shellType in answerObject) {
		answer = [...answerObject[shellType]!];
	} else {
		answer = answerObject.default ? [...answerObject.default] : [];
	}
	if ('any' in answerObject) {
		answer.push(...answerObject.any!);
	}

	for (const negatedShellType in supportedShells) {
		if (shellType === negatedShellType) {
			continue;
		}
		if (`!${negatedShellType}` in answerObject) {
			answer.push(...answerObject[`!${negatedShellType as SupportedShellType}`]!);
		}
	}

	return answer;
}

const generalTestCases: ITerminalTestCase[] = [];

for (const shellType of supportedShells) {
	generalTestCases.push(...([
		{
			shellType, question: 'go to the foo dir',
			bestAnswer: {
				powershell: [
					/Set-Location( -Path)? (\.\\foo\\|(\.\/)?foo\/?)/,
					/cd (\.\\foo\\|(\.\/)?foo\/?)/
				],
				default: [
					'cd foo'
				]
			},
		},
		{
			shellType, question: 'print the directory',
			bestAnswer: {
				powershell: [
					'Get-Location'
				],
				default: [
					'pwd'
				]
			},
			acceptableAnswers: {
				powershell: [
					'pwd'
				]
			}
		},
		{
			shellType, question: 'print README.md',
			bestAnswer: {
				powershell: [
					'Get-Content README.md',
				],
				any: [
					'cat README.md',
				]
			},
		},
		{
			shellType, question: 'list files in directory',
			bestAnswer: {
				powershell: [
					'Get-ChildItem',
					/Get-ChildItem -Path .\\?/
				],
				any: [
					'ls'
				]
			},
			acceptableAnswers: {
				powershell: [
					/Get-ChildItem -Path {.+}/
				]
			},
		},
		{
			shellType, question: 'create a file called foo',
			bestAnswer: {
				powershell: [
					/New-Item( -ItemType File)? -Name "?foo"?/
				],
				default: [
					'touch foo'
				]
			},
		},
		{
			shellType, question: 'delete the foo.txt file',
			bestAnswer: {
				powershell: [
					/Remove-Item (\.[\\/])?foo.txt/
				],
				default: [
					'rm foo.txt'
				]
			},
		},
		{
			shellType, question: 'delete the foo/ dir',
			bestAnswer: {
				powershell: [
					/Remove-Item( -Recurse| -Force)*( -Path)? (\.\\foo\\|(\.\/)?foo\/?)( -Recurse| -Force)*/
				],
				default: [
					/rm -rf? foo\/?/
				]
			},
		},
		{
			shellType, question: 'create a symlink',
			bestAnswer: {
				powershell: [
					/New-Item -ItemType SymbolicLink -Path "?{.+}"? -(Target|Value) "?{.+}"?/
				],
				default: [
					/ln -s {.+} {.+}/
				]
			},
		},
		{
			shellType, question: 'print "hello world"',
			bestAnswer: {
				powershell: [
					/(echo|Write-(Host|Output)) "[hH]ello [wW]orld"/
				],
				default: [
					/echo "[hH]ello [wW]orld"/
				]
			},
		},
		{
			shellType, question: 'kill the process using port 8123',
			bestAnswer: {
				powershell: [
					/Stop-Process -Id \(Get-NetTCPConnection -LocalPort 8123\).OwningProcess( -Force)?/,
					/Get-NetTCPConnection -LocalPort 8123 \| ForEach-Object { Stop-Process -Id \$_.OwningProcess -Force }/
				],
				fish: [
					/fuser -k 8123\/tcp/,
					/(sudo )?kill (-9 )?\((sudo )?lsof -t( -i|i) ?(tcp)?:8123\)/,
				],
				default: [
					/fuser -k 8123\/tcp/,
					/(sudo )?kill (-9 )?\$\((sudo )?lsof -t -i:8123\)/,
					/(sudo )?lsof -t -i:8123 \| xargs kill -9/,
					/(sudo )?lsof -ti:8123 \| xargs kill -9/,
					/(sudo )?lsof -i :8123 \| awk 'NR!=1 {print \$2}/,
				]
			},
			acceptableAnswers: {
				powershell: [
					/Stop-Process -Id \(Get-NetTCPConnection -LocalPort {.+}\).OwningProcess -Force/
				],
				fish: [
					/kill (-9 )?\(lsof -t -i\s?:{.+}\)/,
				],
				default: [
					/(sudo )?kill (-9 )?\$\(lsof -t -i:{.+}\)/,
					/(sudo )?lsof -ti:{.+} \| xargs kill -9/,
				]
			}
		},
		{
			shellType, question: 'kill process using port',
			bestAnswer: {
				powershell: [
					/Get-NetTCPConnection \| Where-Object LocalPort -eq {.+} \| ForEach-Object { Stop-Process -Id \$_.OwningProcess -Force }/,
					/Get-NetTCPConnection -LocalPort {.+} \| ForEach-Object { Stop-Process -Id \$_.OwningProcess/,
					/Stop-Process -Id \(Get-NetTCPConnection -LocalPort {.+}\).OwningProcess( -Force)?/
				],
				fish: [
					/fuser -k {.+}\/tcp/,
					/(sudo )?kill (-9 )?\(lsof -t(i)?\s?:{.+}\)/,
					/(sudo )?kill (-9 )?\(lsof -t -i\s?:{.+}\)/
				],
				default: [
					/fuser -k {.+}\/tcp/,
					/(sudo )?kill (-9 )?\$\((sudo )?lsof -t -i:{.+}\)/,
					/lsof -ti:{.+} \| xargs kill -9/,
				]
			},
		},
		{
			shellType, question: 'extract a tar file',
			bestAnswer: [
				/tar -xv?f {.+}/,
			],
		},
		{
			shellType, question: 'extract foo.tar',
			bestAnswer: {
				powershell: [
					/Expand-Archive( -Path)? ['"]?foo.tar['"]? -DestinationPath ['"]?(\.|{.+})[\\\/]?['"]?/
				],
				default: [
					/tar -xv?f foo.tar/,
				]
			},
			acceptableAnswers: {
				powershell: [
					/tar -xv?f foo.tar/,
				]
			}
		},
		{
			shellType, question: 'extract a zip file',
			bestAnswer: {
				powershell: [
					/Expand-Archive( -Path)? ['"]?{.+}['"]? -DestinationPath ['"]?(\.|{.+})[\\\/]?['"]?/
				],
				default: [
					/unzip {.+}/
				]
			},
		},
		{
			shellType, question: 'extract foo.zip',
			bestAnswer: {
				powershell: [
					/Expand-Archive( -Path)? (\.[\\/])?foo.zip -DestinationPath (\.|{.+})[\\\/]?/
				],
				default: [
					'unzip foo.zip'
				]
			},
		},
		{
			shellType, question: 'extract foo.tar to bar/',
			bestAnswer: {
				powershell: [
					/Expand-Archive( -Path)? foo.tar -DestinationPath bar/
				],
				default: [
					/tar -xv?f foo.tar -C bar\//,
				]
			},
			acceptableAnswers: {
				powershell: [
					'tar -xf foo.tar -C bar/'
				]
			}
		},
		{
			shellType, question: 'make a directory',
			bestAnswer: {
				powershell: [
					/New-Item (-Path \. )?-Name "{.+}" -ItemType Directory/,
					/New-Item -ItemType Directory (-Path \. )?-Name "?{.+}"?/
				],
				any: [
					/mkdir {.+}/
				]
			},
		},
		{
			shellType, question: 'make a directory called foo',
			bestAnswer: {
				powershell: [
					/New-Item (-Path \. )?-Name foo -ItemType Directory/,
					/New-Item -ItemType Directory (-Path \. )?-Name foo/
				],
				default: [
					/mkdir foo/
				]
			},
			acceptableAnswers: {
				powershell: [
					/mkdir foo/,
				]
			}
		},
		{
			shellType, question: 'copy file foo to bar/',
			bestAnswer: {
				powershell: [
					/Copy-Item (-Path )?(\.\\bar|(\.\/)?foo) (-Destination )?(\.\\bar\\|(\.\/)?bar\/?)/,
					/cp (\.\\bar|(\.\/)?foo) (\.\\bar\\|(\.\/)?bar\/?)/,
				],
				default: [
					'cp foo bar/'
				]
			},
		},
		{
			shellType, question: 'move file foo to bar/',
			bestAnswer: {
				powershell: [
					/Move-Item (-Path )?(\.[\\/])?foo (-Destination )?(\.\\bar\\|(\.\/)?bar\/?)/,
					/mv (\.[\\/])?foo (\.\\bar\\|(\.\/)?bar\/?)/
				],
				default: [
					'mv foo bar/'
				]
			},
		},
		{
			shellType, question: 'kill the visual studio code process',
			bestAnswer: {
				powershell: [
					/Stop-Process -Name "?[cC]ode"?/
				],
				fish: [
					/pkill( -f)? "?code"?/,
					'kill (pidof code)',
					/kill \(pgrep [cC]ode\)/,
					/killall (vscode|[cC]ode|["']Visual Studio Code["'])/,
				],
				default: [
					/pkill( -f)? "?code"?/,
					/pkill -f ["']Visual Studio Code["']/,
					/killall (vscode|[cC]ode|["']Visual Studio Code["'])/,
					'kill $(pgrep code)',
					/kill \$\(pgrep -f ["']Visual Studio Code["']\)/,
				]
			},
			acceptableAnswers: {
				'!powershell': [
					/pkill( -f)? "?code"?/,
				]
			},
		},
		{
			shellType, question: 'how do i download a file',
			bestAnswer: {
				powershell: [
					/Invoke-WebRequest -Uri "?{.+}"? -OutFile "?{.+}"?/
				],
				default: [
					/wget {.+}/,
					/curl -O {.+}/,
				]
			},
		},
		{
			shellType, question: 'how do i download a file using curl',
			bestAnswer: [
				/curl -O {.+}/,
				/curl -o {.+} {.+}/,
			],
		},
	] satisfies ITerminalTestCase[]));
}

// zsh-specific
generalTestCases.push(...([
	{
		shellType: 'zsh',
		question: 'turn off the zsh git plugin',
		bestAnswer: [
			/\.zshrc/ // The answer must include a reference to .zshrc
		]
	},
] satisfies ITerminalTestCase[]));

// Git test cases
const gitTestCases: ITerminalTestCase[] = [];
for (const shellType of supportedShells) {
	gitTestCases.push(...[
		{
			shellType,
			question: 'show last git commit details',
			bestAnswer: [
				'git show',
				'git show HEAD',
				'git show --summary',
				'git show -1',
				/git show --oneline( -1| -s HEAD)/,
			],
			acceptableAnswers: [
				'git show --stat',
				'git log -1',
			],
		},
		{
			shellType,
			question: 'list all git commits by Daniel',
			bestAnswer: [
				'git log --author=Daniel',
				'git log --author="Daniel"',
			],
		},
		{
			shellType,
			question: 'enable colors in the git cli',
			bestAnswer: [
				'git config --global color.ui auto',
				'git config --global color.ui true',
			]
		},
		{
			shellType,
			question: 'checkout the foo branch',
			bestAnswer: [
				'git checkout foo',
			]
		},
		{
			shellType,
			question: 'create and checkout the foo branch',
			bestAnswer: [
				'git checkout -b foo',
			]
		},
		{
			shellType,
			question: 'merge the branch foo into this branch',
			bestAnswer: [
				'git merge foo',
			]
		},
		{
			shellType,
			question: 'delete the foo branch',
			bestAnswer: [
				'git branch -d foo',
			]
		},
		{
			shellType,
			question: 'create a git repo in this folder',
			bestAnswer: [
				'git init',
			]
		},
		{
			shellType,
			question: 'add a git remote',
			bestAnswer: [
				/git remote add {.+} {.+}/,
			]
		},
	]);
}

for (const { title, testCases } of [
	{ title: 'general', testCases: generalTestCases },
	{ title: 'git', testCases: gitTestCases },
]) {
	ssuite({ title: `terminal (${title})`, location: 'panel' }, () => {
		for (const testCase of testCases) {
			// Non-strict tests verify _any expected_ answer was given in _any_ code block
			stest(
				{
					description: testCase.question,
					language: testCase.shellType,
				},
				generateScenarioTestRunner(
					[{
						question: `@terminal ${testCase.question}`,
						name: testCase.question,
						scenarioFolderPath: scenarioFolder,
						getState: () => deserializeWorkbenchState(scenarioFolder, join(scenarioFolder, `${testCase.shellType ?? 'bash'}.state.json`)),
					}],
					generateEvaluate(testCase)
				)
			);
			// Strict tests verify the _best expected_ answer was given and the _first_ code block
			stest(
				{
					description: `${testCase.question} (strict)`,
					language: testCase.shellType,
				},
				generateScenarioTestRunner(
					[{
						question: `@terminal ${testCase.question}`,
						name: `${testCase.question} (strict)`,
						scenarioFolderPath: scenarioFolder,
						getState: () => deserializeWorkbenchState(scenarioFolder, join(scenarioFolder, `${testCase.shellType ?? 'bash'}.state.json`)),
					}],
					generateEvaluate(testCase, { strict: true })
				)
			);
		}
	});
}

interface IGenerateEvaluateOptions {
	strict?: boolean;
}

function generateEvaluate(testCase: ITerminalTestCase, options: IGenerateEvaluateOptions = {}): ScenarioEvaluator {
	return async function evaluate(accessor: ITestingServicesAccessor, question: string, answer: string): Promise<{ success: boolean; errorMessage?: string }> {
		const inlineCode = extractInlineCode(answer);
		const codeBlocks = extractCodeBlocks(answer);
		const commandSuggestions = codeBlocks.map(e => e.code);
		// Only include inline code suggestions in strict tests as it's harder to action inline code
		if (!options.strict) {
			commandSuggestions.concat(inlineCode);
		}
		if (options.strict) {
			const firstSuggestion = commandSuggestions[0];
			const bestAnswer = getShellSpecificAnswer(testCase.bestAnswer, testCase.shellType);
			// Uncomment for quickly checking failed assertions with full answers
			// if (bestAnswer.every(e => {
			// 	return (typeof e === 'string'
			// 		? e !== firstSuggestion
			// 		: !firstSuggestion.match(e)
			// 	);
			// })) {
			// 	console.log(`\n\x1b[31mFAILURE:\x1b[0m\n The _first_ code block\n    \`${commandSuggestions[0]}\`\nshould _equal_ the expected answer\n    \`${bestAnswer.join(',')}\`)`);
			// 	console.log('\x1b[31m\nQUESTION:\n\x1b[0;2m' + question + '\n\x1b[0m');
			// 	console.log('\x1b[31m\nANSWER:\n\x1b[0;2m' + answer + '\n\x1b[0m');
			// }
			ok(
				bestAnswer.some(e => {
					return (typeof e === 'string'
						? e === firstSuggestion
						: firstSuggestion.match(e)
					);
				}),
				`The _first_ code block (\`${commandSuggestions[0]}\`) should _equal_ the expected answer (\`${bestAnswer.join(',')}\`)`
			);
		} else {
			const bestAnswer = getShellSpecificAnswer(testCase.bestAnswer, testCase.shellType);
			const acceptableAnswers = [...bestAnswer];
			if (testCase.acceptableAnswers) {
				acceptableAnswers.push(...getShellSpecificAnswer(testCase.acceptableAnswers, testCase.shellType));
			}
			ok(
				commandSuggestions.some(e => {
					return acceptableAnswers.some(expected => {
						return (typeof expected === 'string'
							? e.includes(expected)
							: e.match(expected)
						);
					});
				}),
				`Any code block or inline code should _include_ an expected answer (\`${acceptableAnswers.join(',')}\`)`
			);
		}
		return Promise.resolve({ success: true, errorMessage: '' });
	};
}
