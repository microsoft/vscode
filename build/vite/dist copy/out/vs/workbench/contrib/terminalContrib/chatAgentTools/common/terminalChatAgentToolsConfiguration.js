/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { localize } from '../../../../../nls.js';
import { terminalProfileBaseProperties } from '../../../../../platform/terminal/common/terminalPlatformConfiguration.js';
import { PolicyCategory } from '../../../../../base/common/policy.js';
export var TerminalChatAgentToolsSettingId;
(function (TerminalChatAgentToolsSettingId) {
    TerminalChatAgentToolsSettingId["EnableAutoApprove"] = "chat.tools.terminal.enableAutoApprove";
    TerminalChatAgentToolsSettingId["AutoApprove"] = "chat.tools.terminal.autoApprove";
    TerminalChatAgentToolsSettingId["AutoApproveWorkspaceNpmScripts"] = "chat.tools.terminal.autoApproveWorkspaceNpmScripts";
    TerminalChatAgentToolsSettingId["IgnoreDefaultAutoApproveRules"] = "chat.tools.terminal.ignoreDefaultAutoApproveRules";
    TerminalChatAgentToolsSettingId["BlockDetectedFileWrites"] = "chat.tools.terminal.blockDetectedFileWrites";
    TerminalChatAgentToolsSettingId["ShellIntegrationTimeout"] = "chat.tools.terminal.shellIntegrationTimeout";
    TerminalChatAgentToolsSettingId["AutoReplyToPrompts"] = "chat.tools.terminal.autoReplyToPrompts";
    TerminalChatAgentToolsSettingId["OutputLocation"] = "chat.tools.terminal.outputLocation";
    TerminalChatAgentToolsSettingId["AgentSandboxEnabled"] = "chat.agent.sandbox.enabled";
    TerminalChatAgentToolsSettingId["AgentSandboxNetworkAllowedDomains"] = "chat.agent.sandbox.allowedNetworkDomains";
    TerminalChatAgentToolsSettingId["AgentSandboxNetworkDeniedDomains"] = "chat.agent.sandbox.deniedNetworkDomains";
    TerminalChatAgentToolsSettingId["AgentSandboxLinuxFileSystem"] = "chat.agent.sandbox.fileSystem.linux";
    TerminalChatAgentToolsSettingId["AgentSandboxMacFileSystem"] = "chat.agent.sandbox.fileSystem.mac";
    TerminalChatAgentToolsSettingId["PreventShellHistory"] = "chat.tools.terminal.preventShellHistory";
    TerminalChatAgentToolsSettingId["EnforceTimeoutFromModel"] = "chat.tools.terminal.enforceTimeoutFromModel";
    TerminalChatAgentToolsSettingId["DetachBackgroundProcesses"] = "chat.tools.terminal.detachBackgroundProcesses";
    TerminalChatAgentToolsSettingId["BackgroundNotifications"] = "chat.tools.terminal.backgroundNotifications";
    TerminalChatAgentToolsSettingId["IdlePollInterval"] = "chat.tools.terminal.idlePollInterval";
    TerminalChatAgentToolsSettingId["TerminalProfileLinux"] = "chat.tools.terminal.terminalProfile.linux";
    TerminalChatAgentToolsSettingId["TerminalProfileMacOs"] = "chat.tools.terminal.terminalProfile.osx";
    TerminalChatAgentToolsSettingId["TerminalProfileWindows"] = "chat.tools.terminal.terminalProfile.windows";
    TerminalChatAgentToolsSettingId["DeprecatedAgentSandboxEnabled"] = "chat.agent.sandbox";
    TerminalChatAgentToolsSettingId["DeprecatedAgentSandboxNetworkAllowedDomains"] = "chat.agent.sandboxNetwork.allowedDomains";
    TerminalChatAgentToolsSettingId["DeprecatedAgentSandboxNetworkDeniedDomains"] = "chat.agent.sandboxNetwork.deniedDomains";
    TerminalChatAgentToolsSettingId["DeprecatedAgentSandboxLinuxFileSystem"] = "chat.agent.sandboxFileSystem.linux";
    TerminalChatAgentToolsSettingId["DeprecatedAgentSandboxMacFileSystem"] = "chat.agent.sandboxFileSystem.mac";
    TerminalChatAgentToolsSettingId["DeprecatedAutoApproveCompatible"] = "chat.agent.terminal.autoApprove";
    TerminalChatAgentToolsSettingId["DeprecatedAutoApprove1"] = "chat.agent.terminal.allowList";
    TerminalChatAgentToolsSettingId["DeprecatedAutoApprove2"] = "chat.agent.terminal.denyList";
    TerminalChatAgentToolsSettingId["DeprecatedAutoApprove3"] = "github.copilot.chat.agent.terminal.allowList";
    TerminalChatAgentToolsSettingId["DeprecatedAutoApprove4"] = "github.copilot.chat.agent.terminal.denyList";
})(TerminalChatAgentToolsSettingId || (TerminalChatAgentToolsSettingId = {}));
export var TerminalChatAgentToolsSandboxEnabledValue;
(function (TerminalChatAgentToolsSandboxEnabledValue) {
    TerminalChatAgentToolsSandboxEnabledValue["Off"] = "off";
    TerminalChatAgentToolsSandboxEnabledValue["On"] = "on";
})(TerminalChatAgentToolsSandboxEnabledValue || (TerminalChatAgentToolsSandboxEnabledValue = {}));
const autoApproveBoolean = {
    type: 'boolean',
    enum: [
        true,
        false,
    ],
    enumDescriptions: [
        localize('autoApprove.true', "Automatically approve the pattern."),
        localize('autoApprove.false', "Require explicit approval for the pattern."),
    ],
    description: localize('autoApprove.key', "The start of a command to match against. A regular expression can be provided by wrapping the string in `/` characters."),
};
const terminalChatAgentProfileSchema = {
    type: 'object',
    required: ['path'],
    properties: {
        path: {
            description: localize('terminalChatAgentProfile.path', "A path to a shell executable."),
            type: 'string',
        },
        ...terminalProfileBaseProperties,
    }
};
export const terminalChatAgentToolsConfiguration = {
    ["chat.tools.terminal.enableAutoApprove" /* TerminalChatAgentToolsSettingId.EnableAutoApprove */]: {
        description: localize('autoApproveMode.description', "Controls whether to allow auto approval in the run in terminal tool."),
        type: 'boolean',
        default: true,
        policy: {
            name: 'ChatToolsTerminalEnableAutoApprove',
            category: PolicyCategory.IntegratedTerminal,
            minimumVersion: '1.104',
            localization: {
                description: {
                    key: 'autoApproveMode.description',
                    value: localize('autoApproveMode.description', "Controls whether to allow auto approval in the run in terminal tool."),
                }
            }
        }
    },
    ["chat.tools.terminal.autoApprove" /* TerminalChatAgentToolsSettingId.AutoApprove */]: {
        markdownDescription: [
            localize('autoApprove.description.intro', "A list of commands or regular expressions that control whether the run in terminal tool commands require explicit approval. These will be matched against the start of a command. A regular expression can be provided by wrapping the string in {0} characters followed by optional flags such as {1} for case-insensitivity.", '`/`', '`i`'),
            localize('autoApprove.description.values', "Set to {0} to automatically approve commands, {1} to always require explicit approval or {2} to unset the value.", '`true`', '`false`', '`null`'),
            localize('autoApprove.description.subCommands', "Note that these commands and regular expressions are evaluated for every _sub-command_ within the full _command line_, so {0} for example will need both {1} and {2} to match a {3} entry and must not match a {4} entry in order to auto approve. Inline commands such as {5} (process substitution) should also be detected.", '`foo && bar`', '`foo`', '`bar`', '`true`', '`false`', '`<(foo)`'),
            localize('autoApprove.description.commandLine', "An object can be used to match against the full command line instead of matching sub-commands and inline commands, for example {0}. In order to be auto approved _both_ the sub-command and command line must not be explicitly denied, then _either_ all sub-commands or command line needs to be approved.", '`{ approve: false, matchCommandLine: true }`'),
            localize('autoApprove.defaults', "Note that there's a default set of rules to allow and also deny commands. Consider setting {0} to {1} to ignore all default rules to ensure there are no conflicts with your own rules. Do this at your own risk, the default denial rules are designed to protect you against running dangerous commands.", `\`#${"chat.tools.terminal.ignoreDefaultAutoApproveRules" /* TerminalChatAgentToolsSettingId.IgnoreDefaultAutoApproveRules */}#\``, '`true`'),
            [
                localize('autoApprove.description.examples.title', 'Examples:'),
                `|${localize('autoApprove.description.examples.value', "Value")}|${localize('autoApprove.description.examples.description', "Description")}|`,
                '|---|---|',
                '| `\"mkdir\": true` | ' + localize('autoApprove.description.examples.mkdir', "Allow all commands starting with {0}", '`mkdir`'),
                '| `\"npm run build\": true` | ' + localize('autoApprove.description.examples.npmRunBuild', "Allow all commands starting with {0}", '`npm run build`'),
                '| `\"bin/test.sh\": true` | ' + localize('autoApprove.description.examples.binTest', "Allow all commands that match the path {0} ({1}, {2}, etc.)", '`bin/test.sh`', '`bin\\test.sh`', '`./bin/test.sh`'),
                '| `\"/^git (status\\|show\\\\b.*)$/\": true` | ' + localize('autoApprove.description.examples.regexGit', "Allow {0} and all commands starting with {1}", '`git status`', '`git show`'),
                '| `\"/^Get-ChildItem\\\\b/i\": true` | ' + localize('autoApprove.description.examples.regexCase', "will allow {0} commands regardless of casing", '`Get-ChildItem`'),
                '| `\"/.*/\": true` | ' + localize('autoApprove.description.examples.regexAll', "Allow all commands (denied commands still require approval)"),
                '| `\"rm\": false` | ' + localize('autoApprove.description.examples.rm', "Require explicit approval for all commands starting with {0}", '`rm`'),
                '| `\"/\\\\.ps1/i\": { approve: false, matchCommandLine: true }` | ' + localize('autoApprove.description.examples.ps1', "Require explicit approval for any _command line_ that contains {0} regardless of casing", '`".ps1"`'),
                '| `\"rm\": null` | ' + localize('autoApprove.description.examples.rmUnset', "Unset the default {0} value for {1}", '`false`', '`rm`'),
            ].join('\n'),
        ].join('\n\n'),
        type: 'object',
        additionalProperties: {
            anyOf: [
                autoApproveBoolean,
                {
                    type: 'object',
                    properties: {
                        approve: autoApproveBoolean,
                        matchCommandLine: {
                            type: 'boolean',
                            enum: [
                                true,
                                false,
                            ],
                            enumDescriptions: [
                                localize('autoApprove.matchCommandLine.true', "Match against the full command line, eg. `foo && bar`."),
                                localize('autoApprove.matchCommandLine.false', "Match against sub-commands and inline commands, eg. `foo && bar` will need both `foo` and `bar` to match."),
                            ],
                            description: localize('autoApprove.matchCommandLine', "Whether to match against the full command line, as opposed to splitting by sub-commands and inline commands."),
                        }
                    },
                    required: ['approve']
                },
                {
                    type: 'null',
                    description: localize('autoApprove.null', "Ignore the pattern, this is useful for unsetting the same pattern set at a higher scope."),
                },
            ]
        },
        default: {
            // This is the default set of terminal auto approve commands. Note that these are best
            // effort and do not aim to provide exhaustive coverage to prevent dangerous commands
            // from executing as that is simply not feasible. Workspace trust and warnings of
            // possible prompt injection are _the_ thing protecting the user in agent mode, once
            // that trust boundary has been breached all bets are off as trusting a workspace that
            // contains anything malicious has already compromised the machine.
            //
            // Instead, the focus here is to unblock the user from approving clearly safe commands
            // frequently and cover common edge cases that could arise from the user auto-approving
            // commands.
            //
            // Take for example `find` which looks innocuous and most users are likely to auto
            // approve future calls when offered. However, the `-exec` argument can run anything. So
            // instead of leaving this decision up to the user we provide relatively safe defaults
            // and block common edge cases. So offering these default rules, despite their flaws, is
            // likely to protect the user more in general than leaving everything up to them (plus
            // make agent mode more convenient).
            // #region Safe commands
            //
            // Generally safe and common readonly commands
            cd: true,
            echo: true,
            ls: true,
            dir: true,
            pwd: true,
            cat: true,
            head: true,
            tail: true,
            findstr: true,
            wc: true,
            tr: true,
            cut: true,
            cmp: true,
            which: true,
            basename: true,
            dirname: true,
            realpath: true,
            readlink: true,
            stat: true,
            file: true,
            od: true,
            du: true,
            df: true,
            sleep: true,
            nl: true,
            // grep
            // - Variable
            // - `-f`: Read patterns from file, this is an acceptable risk since you can do similar
            //   with cat
            // - `-P`: PCRE risks include denial of service (memory exhaustion, catastrophic
            //   backtracking) which could lock up the terminal. Older PCRE versions allow code
            //   execution via this flag but this has been patched with CVEs.
            // - Variable injection is possible, but requires setting a variable which would need
            //   manual approval.
            grep: true,
            // #endregion
            // #region Safe sub-commands
            //
            // Safe and common sub-commands
            // Note: These patterns support `-C <path>` and `--no-pager` immediately after `git`
            '/^git(\\s+(-C\\s+\\S+|--no-pager))*\\s+status\\b/': true,
            '/^git(\\s+(-C\\s+\\S+|--no-pager))*\\s+log\\b/': true,
            '/^git(\\s+(-C\\s+\\S+|--no-pager))*\\s+log\\b.*\\s--output(=|\\s|$)/': false,
            '/^git(\\s+(-C\\s+\\S+|--no-pager))*\\s+show\\b/': true,
            '/^git(\\s+(-C\\s+\\S+|--no-pager))*\\s+diff\\b/': true,
            '/^git(\\s+(-C\\s+\\S+|--no-pager))*\\s+ls-files\\b/': true,
            // git grep
            // - `--open-files-in-pager`: This is the configured pager, so no risk of code execution
            // - See notes on `grep`
            '/^git(\\s+(-C\\s+\\S+|--no-pager))*\\s+grep\\b/': true,
            // git branch
            // - `-d`, `-D`, `--delete`: Prevent branch deletion
            // - `-m`, `-M`: Prevent branch renaming
            // - `--force`: Generally dangerous
            '/^git(\\s+(-C\\s+\\S+|--no-pager))*\\s+branch\\b/': true,
            '/^git(\\s+(-C\\s+\\S+|--no-pager))*\\s+branch\\b.*\\s-(d|D|m|M|-delete|-force)\\b/': false,
            // docker - readonly sub-commands
            '/^docker\\s+(ps|images|info|version|inspect|logs|top|stats|port|diff|search|events)\\b/': true,
            '/^docker\\s+(container|image|network|volume|context|system)\\s+(ls|ps|inspect|history|show|df|info)\\b/': true,
            '/^docker\\s+compose\\s+(ps|ls|top|logs|images|config|version|port|events)\\b/': true,
            // #endregion
            // #region PowerShell
            'Get-ChildItem': true,
            'Get-Content': true,
            'Get-Date': true,
            'Get-Random': true,
            'Get-Location': true,
            'Set-Location': true,
            'Write-Host': true,
            'Write-Output': true,
            'Out-String': true,
            'Split-Path': true,
            'Join-Path': true,
            'Start-Sleep': true,
            'Where-Object': true,
            // Blanket approval of safe verbs
            '/^Select-[a-z0-9]/i': true,
            '/^Measure-[a-z0-9]/i': true,
            '/^Compare-[a-z0-9]/i': true,
            '/^Format-[a-z0-9]/i': true,
            '/^Sort-[a-z0-9]/i': true,
            // #endregion
            // #region Package managers (npm, yarn, pnpm)
            //
            // Read-only commands that don't modify files or execute arbitrary code.
            // npm read-only commands
            '/^npm\\s+(ls|list|outdated|view|info|show|explain|why|root|prefix|bin|search|doctor|fund|repo|bugs|docs|home|help(-search)?)\\b/': true,
            '/^npm\\s+config\\s+(list|get)\\b/': true,
            '/^npm\\s+pkg\\s+get\\b/': true,
            '/^npm\\s+audit$/': true,
            '/^npm\\s+cache\\s+verify\\b/': true,
            // yarn read-only commands
            '/^yarn\\s+(list|outdated|info|why|bin|help|versions)\\b/': true,
            '/^yarn\\s+licenses\\b/': true,
            '/^yarn\\s+audit\\b(?!.*\\bfix\\b)/': true,
            '/^yarn\\s+config\\s+(list|get)\\b/': true,
            '/^yarn\\s+cache\\s+dir\\b/': true,
            // pnpm read-only commands
            '/^pnpm\\s+(ls|list|outdated|why|root|bin|doctor)\\b/': true,
            '/^pnpm\\s+licenses\\b/': true,
            '/^pnpm\\s+audit\\b(?!.*\\bfix\\b)/': true,
            '/^pnpm\\s+config\\s+(list|get)\\b/': true,
            // Safe lockfile-only installs since we trust the workspace and lock file is trusted.
            'npm ci': true,
            '/^yarn\\s+install\\s+--frozen-lockfile\\b/': true,
            '/^pnpm\\s+install\\s+--frozen-lockfile\\b/': true,
            // #endregion
            // #region Safe + disabled args
            //
            // Commands that are generally allowed with special cases we block. Note that shell
            // expansion is handled by the inline command detection when parsing sub-commands.
            // column
            // - `-c`: We block excessive columns that could lead to memory exhaustion.
            column: true,
            '/^column\\b.*\\s-c\\s+[0-9]{4,}/': false,
            // date
            // -s|--set: Sets the system clock
            date: true,
            '/^date\\b.*\\s(-s|--set)\\b/': false,
            // find
            // - `-delete`: Deletes files or directories.
            // - `-exec`/`-execdir`: Execute on results.
            // - `-fprint`/`fprintf`/`fls`: Writes files.
            // - `-ok`/`-okdir`: Like exec but with a confirmation.
            find: true,
            '/^find\\b.*\\s-(delete|exec|execdir|fprint|fprintf|fls|ok|okdir)\\b/': false,
            // rg (ripgrep)
            // - `--pre`: Executes arbitrary command as preprocessor for every file searched.
            // - `--hostname-bin`: Executes arbitrary command to get hostname.
            rg: true,
            '/^rg\\b.*\\s(--pre|--hostname-bin)\\b/': false,
            // sed
            // - `-e`/`--expression`: Add the commands in script to the set of commands to be run
            //   while processing the input.
            // - `-f`/`--file`: Add the commands contained in the file script-file to the set of
            //   commands to be run while processing the input.
            // - `w`/`W` commands: Write to files (blocked by `-i` check + agent typically won't use).
            // - `s///e` flag: Executes substitution result as shell command
            // - `s///w` flag: Write substitution result to file
            // - `;W` Write first line of pattern space to file
            // - Note that `--sandbox` exists which blocks unsafe commands that could potentially be
            //   leveraged to auto approve
            // - In-place editing (`-i`, `-I`, `--in-place`) is detected and blocked via file write
            //   detection if necessary
            sed: true,
            '/^sed\\b.*\\s(-[a-zA-Z]*(e|f)[a-zA-Z]*|--expression|--file)\\b/': false,
            '/^sed\\b.*s\\/.*\\/.*\\/[ew]/': false,
            '/^sed\\b.*;W/': false,
            // sort
            // - `-o`: Output redirection can write files (`sort -o /etc/something file`) which are
            //   blocked currently
            // - `-S`: Memory exhaustion is possible (`sort -S 100G file`), we allow possible denial
            //   of service.
            sort: true,
            '/^sort\\b.*\\s-(o|S)\\b/': false,
            // tree
            // - `-o`: Output redirection can write files (`tree -o /etc/something file`) which are
            //   blocked currently
            tree: true,
            '/^tree\\b.*\\s-o\\b/': false,
            // xxd
            // - Only allow flags and a single input file as it's difficult to parse the outfile
            //   positional argument safely.
            '/^xxd$/': true,
            '/^xxd\\b(\\s+-\\S+)*\\s+[^-\\s]\\S*$/': true,
            // #endregion
            // #region Dangerous commands
            //
            // There are countless dangerous commands available on the command line, the defaults
            // here include common ones that the user is likely to want to explicitly approve first.
            // This is not intended to be a catch all as the user needs to opt-in to auto-approve
            // commands, it provides some additional safety when the commands get approved by overly
            // broad user/workspace rules.
            // Deleting files
            rm: false,
            rmdir: false,
            del: false,
            'Remove-Item': false,
            ri: false,
            rd: false,
            erase: false,
            dd: false,
            // Managing/killing processes, dangerous thing to do generally
            kill: false,
            ps: false,
            top: false,
            'Stop-Process': false,
            spps: false,
            taskkill: false,
            'taskkill.exe': false,
            // Web requests, prompt injection concerns
            curl: false,
            wget: false,
            'Invoke-RestMethod': false,
            'Invoke-WebRequest': false,
            'irm': false,
            'iwr': false,
            // File permissions and ownership, messing with these can cause hard to diagnose issues
            chmod: false,
            chown: false,
            'Set-ItemProperty': false,
            'sp': false,
            'Set-Acl': false,
            // General eval/command execution, can lead to anything else running
            jq: false,
            xargs: false,
            eval: false,
            'Invoke-Expression': false,
            iex: false,
            // #endregion
        },
    },
    ["chat.tools.terminal.ignoreDefaultAutoApproveRules" /* TerminalChatAgentToolsSettingId.IgnoreDefaultAutoApproveRules */]: {
        type: 'boolean',
        default: false,
        tags: ['experimental'],
        markdownDescription: localize('ignoreDefaultAutoApproveRules.description', "Whether to ignore the built-in default auto-approve rules used by the run in terminal tool as defined in {0}. When this setting is enabled, the run in terminal tool will ignore any rule that comes from the default set but still follow rules defined in the user, remote and workspace settings. Use this setting at your own risk; the default auto-approve rules are designed to protect you against running dangerous commands.", `\`#${"chat.tools.terminal.autoApprove" /* TerminalChatAgentToolsSettingId.AutoApprove */}#\``),
    },
    ["chat.tools.terminal.autoApproveWorkspaceNpmScripts" /* TerminalChatAgentToolsSettingId.AutoApproveWorkspaceNpmScripts */]: {
        restricted: true,
        type: 'boolean',
        // In order to use agent mode the workspace must be trusted, this plus the fact that
        // modifying package.json is protected means this is safe to enable by default.
        default: true,
        tags: ['experimental'],
        markdownDescription: localize('autoApproveWorkspaceNpmScripts.description', "Whether to automatically approve npm, yarn, and pnpm run commands when the script is defined in a workspace package.json file. Since the workspace is trusted, scripts defined in package.json are considered safe to run without explicit approval."),
    },
    ["chat.tools.terminal.blockDetectedFileWrites" /* TerminalChatAgentToolsSettingId.BlockDetectedFileWrites */]: {
        type: 'string',
        enum: ['never', 'outsideWorkspace', 'all'],
        enumDescriptions: [
            localize('blockFileWrites.never', "Allow all detected file writes."),
            localize('blockFileWrites.outsideWorkspace', "Block file writes detected outside the workspace. This depends on the shell integration feature working correctly to determine the current working directory of the terminal."),
            localize('blockFileWrites.all', "Block all detected file writes."),
        ],
        default: 'outsideWorkspace',
        tags: ['experimental'],
        markdownDescription: localize('blockFileWrites.description', "Controls whether detected file write operations are blocked in the run in terminal tool. When detected, this will require explicit approval regardless of whether the command would normally be auto approved. Note that this cannot detect all possible methods of writing files, this is what is currently detected:\n\n- File redirection (detected via the bash or PowerShell tree sitter grammar)\n- `sed` in-place editing (`-i`, `-I`, `--in-place`)"),
    },
    ["chat.tools.terminal.shellIntegrationTimeout" /* TerminalChatAgentToolsSettingId.ShellIntegrationTimeout */]: {
        markdownDescription: localize('shellIntegrationTimeout.description', "Configures the duration in milliseconds to wait for shell integration to be detected when the run in terminal tool launches a new terminal. Set to `0` to skip the wait entirely, the default value `-1` uses a variable wait time based on the value of {0} and whether it's a remote window. A large value can be useful if your shell starts very slowly.", `\`#${"terminal.integrated.shellIntegration.enabled" /* TerminalSettingId.ShellIntegrationEnabled */}#\``),
        type: 'integer',
        minimum: -1,
        maximum: 60000,
        default: -1,
        markdownDeprecationMessage: localize('shellIntegrationTimeout.deprecated', 'Use {0} instead', `\`#${"terminal.integrated.shellIntegration.timeout" /* TerminalSettingId.ShellIntegrationTimeout */}#\``)
    },
    ["chat.tools.terminal.idlePollInterval" /* TerminalChatAgentToolsSettingId.IdlePollInterval */]: {
        markdownDescription: localize('idlePollInterval.description', "Configures the idle poll interval in milliseconds used by the run in terminal tool to detect when commands have finished executing. Lower values make command detection faster but may cause false positives on slow systems. This primarily affects terminals without shell integration where idle detection is used instead of shell integration events."),
        type: 'integer',
        minimum: 50,
        maximum: 10000,
        default: 1000,
    },
    ["chat.tools.terminal.terminalProfile.linux" /* TerminalChatAgentToolsSettingId.TerminalProfileLinux */]: {
        restricted: true,
        markdownDescription: localize('terminalChatAgentProfile.linux', "The terminal profile to use on Linux for chat agent's run in terminal tool."),
        type: ['object', 'null'],
        default: null,
        'anyOf': [
            { type: 'null' },
            terminalChatAgentProfileSchema
        ],
        defaultSnippets: [
            {
                body: {
                    path: '${1}'
                }
            }
        ]
    },
    ["chat.tools.terminal.terminalProfile.osx" /* TerminalChatAgentToolsSettingId.TerminalProfileMacOs */]: {
        restricted: true,
        markdownDescription: localize('terminalChatAgentProfile.osx', "The terminal profile to use on macOS for chat agent's run in terminal tool."),
        type: ['object', 'null'],
        default: null,
        'anyOf': [
            { type: 'null' },
            terminalChatAgentProfileSchema
        ],
        defaultSnippets: [
            {
                body: {
                    path: '${1}'
                }
            }
        ]
    },
    ["chat.tools.terminal.terminalProfile.windows" /* TerminalChatAgentToolsSettingId.TerminalProfileWindows */]: {
        restricted: true,
        markdownDescription: localize('terminalChatAgentProfile.windows', "The terminal profile to use on Windows for chat agent's run in terminal tool."),
        type: ['object', 'null'],
        default: null,
        'anyOf': [
            { type: 'null' },
            terminalChatAgentProfileSchema
        ],
        defaultSnippets: [
            {
                body: {
                    path: '${1}'
                }
            }
        ]
    },
    ["chat.tools.terminal.autoReplyToPrompts" /* TerminalChatAgentToolsSettingId.AutoReplyToPrompts */]: {
        type: 'boolean',
        default: false,
        tags: ['experimental'],
        markdownDescription: localize('autoReplyToPrompts.key', "Whether to automatically respond to prompts in the terminal such as `Confirm? y/n`. This is an experimental feature and may not work in all scenarios.\n\n**This feature is inherently risky to use as you're deferring potentially sensitive decisions to an LLM. Use at your own risk.**"),
    },
    ["chat.tools.terminal.outputLocation" /* TerminalChatAgentToolsSettingId.OutputLocation */]: {
        markdownDescription: localize('outputLocation.description', "Where to show the output from the run in terminal tool."),
        type: 'string',
        enum: ['terminal', 'chat'],
        enumDescriptions: [
            localize('outputLocation.terminal', "Reveal the terminal in the panel or editor in addition to chat."),
            localize('outputLocation.chat', "Reveal the terminal output within chat only."),
        ],
        default: 'chat',
        tags: ['experimental'],
        experiment: {
            mode: 'auto'
        }
    },
    ["chat.agent.sandbox.enabled" /* TerminalChatAgentToolsSettingId.AgentSandboxEnabled */]: {
        markdownDescription: localize('agentSandbox.enabledSetting', "Controls whether agent mode uses sandboxing to restrict what tools can do. When enabled, tools like the terminal are run in a sandboxed environment to limit access to the system."),
        type: 'string',
        enum: ["off" /* TerminalChatAgentToolsSandboxEnabledValue.Off */, "on" /* TerminalChatAgentToolsSandboxEnabledValue.On */],
        enumDescriptions: [
            localize('agentSandbox.enabledSetting.offDescription', 'Disable sandboxing for agent mode tools.'),
            localize('agentSandbox.enabledSetting.onDescription', 'Enable sandboxing for agent mode tools.'),
        ],
        default: "off" /* TerminalChatAgentToolsSandboxEnabledValue.Off */,
        tags: ['preview'],
        restricted: true,
        experiment: {
            mode: 'auto'
        }
    },
    ["chat.agent.sandbox.allowedNetworkDomains" /* TerminalChatAgentToolsSettingId.AgentSandboxNetworkAllowedDomains */]: {
        markdownDescription: localize('agentSandbox.networkSetting.allowedDomains', "Note: this setting is applicable only when {0} is enabled. Allowed domains for network access in sandbox. Supports wildcards like {1} and an empty list means no network access.", `\`#${"chat.agent.sandbox.enabled" /* TerminalChatAgentToolsSettingId.AgentSandboxEnabled */}#\``, '`*.example.com`'),
        type: 'array',
        items: { type: 'string' },
        default: [],
        tags: ['preview'],
        restricted: true,
    },
    ["chat.agent.sandbox.deniedNetworkDomains" /* TerminalChatAgentToolsSettingId.AgentSandboxNetworkDeniedDomains */]: {
        markdownDescription: localize('agentSandbox.networkSetting.deniedDomains', "Note: this setting is applicable only when {0} is enabled. Array of denied domains for network access in sandbox (checked first, takes precedence over {1}).", `\`#${"chat.agent.sandbox.enabled" /* TerminalChatAgentToolsSettingId.AgentSandboxEnabled */}#\``, `\`#${"chat.agent.sandbox.allowedNetworkDomains" /* TerminalChatAgentToolsSettingId.AgentSandboxNetworkAllowedDomains */}#\``),
        type: 'array',
        items: { type: 'string' },
        default: [],
        tags: ['preview'],
        restricted: true,
    },
    ["chat.agent.sandbox.fileSystem.linux" /* TerminalChatAgentToolsSettingId.AgentSandboxLinuxFileSystem */]: {
        markdownDescription: localize('agentSandbox.linuxFileSystemSetting', "Note: this setting is applicable only when {0} is enabled. Controls file system access in sandbox on Linux. Paths do not support glob patterns, only literal paths (ex: ./src/, ~/.ssh, .env). **bubblewrap** and **socat** should be installed for this setting to work.", `\`#${"chat.agent.sandbox.enabled" /* TerminalChatAgentToolsSettingId.AgentSandboxEnabled */}#\``),
        type: 'object',
        properties: {
            denyRead: {
                type: 'array',
                description: localize('agentSandbox.linuxFileSystemSetting.denyRead', "Array of paths to deny read access. Leave empty to allow reading all paths."),
                items: { type: 'string' },
                default: []
            },
            allowWrite: {
                type: 'array',
                description: localize('agentSandbox.linuxFileSystemSetting.allowWrite', "Array of paths to allow write access. Leave empty to disallow all writes."),
                items: { type: 'string' },
                default: ['.']
            },
            denyWrite: {
                type: 'array',
                description: localize('agentSandbox.linuxFileSystemSetting.denyWrite', "Array of paths to deny write access within allowed paths (takes precedence over allowWrite)."),
                items: { type: 'string' },
                default: []
            }
        },
        default: {
            denyRead: [],
            allowWrite: ['.'],
            denyWrite: []
        },
        tags: ['preview'],
        restricted: true,
    },
    ["chat.agent.sandbox.fileSystem.mac" /* TerminalChatAgentToolsSettingId.AgentSandboxMacFileSystem */]: {
        markdownDescription: localize('agentSandbox.macFileSystemSetting', "Note: this setting is applicable only when {0} is enabled. Controls file system access in sandbox on macOS. Paths also support git-style glob patterns(ex: *.ts, ./src, ./src/**/*.ts, file?.txt).", `\`#${"chat.agent.sandbox.enabled" /* TerminalChatAgentToolsSettingId.AgentSandboxEnabled */}#\``),
        type: 'object',
        properties: {
            denyRead: {
                type: 'array',
                description: localize('agentSandbox.macFileSystemSetting.denyRead', "Array of paths to deny read access. Leave empty to allow reading all paths."),
                items: { type: 'string' },
                default: []
            },
            allowWrite: {
                type: 'array',
                description: localize('agentSandbox.macFileSystemSetting.allowWrite', "Array of paths to allow write access. Leave empty to disallow all writes."),
                items: { type: 'string' },
                default: ['.']
            },
            denyWrite: {
                type: 'array',
                description: localize('agentSandbox.macFileSystemSetting.denyWrite', "Array of paths to deny write access within allowed paths (takes precedence over allowWrite)."),
                items: { type: 'string' },
                default: []
            }
        },
        default: {
            denyRead: [],
            allowWrite: ['.'],
            denyWrite: []
        },
        tags: ['preview'],
        restricted: true,
    },
    ["chat.tools.terminal.preventShellHistory" /* TerminalChatAgentToolsSettingId.PreventShellHistory */]: {
        type: 'boolean',
        default: true,
        markdownDescription: [
            localize('preventShellHistory.description', "Whether to exclude commands run by the terminal tool from the shell history. See below for the supported shells and the method used for each:"),
            `- \`bash\`: ${localize('preventShellHistory.description.bash', "Sets `HISTCONTROL=ignorespace` and prepends the command with space")}`,
            `- \`zsh\`: ${localize('preventShellHistory.description.zsh', "Sets `HIST_IGNORE_SPACE` option and prepends the command with space")}`,
            `- \`fish\`: ${localize('preventShellHistory.description.fish', "Sets `fish_private_mode` to prevent any command from entering history")}`,
            `- \`pwsh\`: ${localize('preventShellHistory.description.pwsh', "Sets a custom history handler via PSReadLine's `AddToHistoryHandler` to prevent any command from entering history")}`,
        ].join('\n'),
    },
    ["chat.tools.terminal.enforceTimeoutFromModel" /* TerminalChatAgentToolsSettingId.EnforceTimeoutFromModel */]: {
        restricted: true,
        type: 'boolean',
        default: true,
        tags: ['experimental'],
        experiment: {
            mode: 'auto'
        },
        markdownDescription: localize('enforceTimeoutFromModel.description', "Whether to enforce the timeout value provided by the model in the run in terminal tool. When enabled, if the model provides a timeout parameter, the tool will stop tracking the command after that duration and return the output collected so far."),
    },
    ["chat.tools.terminal.detachBackgroundProcesses" /* TerminalChatAgentToolsSettingId.DetachBackgroundProcesses */]: {
        included: false,
        restricted: true,
        type: 'boolean',
        default: false,
        tags: ['experimental'],
        markdownDescription: localize('detachBackgroundProcesses.description', "Whether to detach persistent terminal processes so they survive when VS Code exits. When enabled, commands started with `mode: \"async\"` (legacy: `isBackground: true`) are wrapped with `nohup` (POSIX) or `Start-Process` (Windows) so the process continues running after the terminal is disposed."),
    },
    ["chat.tools.terminal.backgroundNotifications" /* TerminalChatAgentToolsSettingId.BackgroundNotifications */]: {
        restricted: true,
        type: 'boolean',
        default: false,
        tags: ['experimental'],
        markdownDescription: localize('backgroundNotifications.description', "Whether to automatically notify the agent when a background terminal command completes or needs input. When enabled, a steering message is sent to the chat session with the exit code and terminal output, and the output monitor continues running to detect prompts for input."),
    }
};
for (const id of [
    "chat.agent.terminal.allowList" /* TerminalChatAgentToolsSettingId.DeprecatedAutoApprove1 */,
    "chat.agent.terminal.denyList" /* TerminalChatAgentToolsSettingId.DeprecatedAutoApprove2 */,
    "github.copilot.chat.agent.terminal.allowList" /* TerminalChatAgentToolsSettingId.DeprecatedAutoApprove3 */,
    "github.copilot.chat.agent.terminal.denyList" /* TerminalChatAgentToolsSettingId.DeprecatedAutoApprove4 */,
    "chat.agent.terminal.autoApprove" /* TerminalChatAgentToolsSettingId.DeprecatedAutoApproveCompatible */,
]) {
    terminalChatAgentToolsConfiguration[id] = {
        deprecated: true,
        markdownDeprecationMessage: localize('autoApprove.deprecated', 'Use {0} instead', `\`#${"chat.tools.terminal.autoApprove" /* TerminalChatAgentToolsSettingId.AutoApprove */}#\``)
    };
}
terminalChatAgentToolsConfiguration["chat.agent.sandboxNetwork.allowedDomains" /* TerminalChatAgentToolsSettingId.DeprecatedAgentSandboxNetworkAllowedDomains */] = {
    type: 'array',
    items: { type: 'string' },
    deprecated: true,
    markdownDeprecationMessage: localize('agentSandbox.allowedNetworkDomains.deprecated', 'Use {0} instead', `\`#${"chat.agent.sandbox.allowedNetworkDomains" /* TerminalChatAgentToolsSettingId.AgentSandboxNetworkAllowedDomains */}#\``),
};
terminalChatAgentToolsConfiguration["chat.agent.sandboxNetwork.deniedDomains" /* TerminalChatAgentToolsSettingId.DeprecatedAgentSandboxNetworkDeniedDomains */] = {
    type: 'array',
    items: { type: 'string' },
    deprecated: true,
    markdownDeprecationMessage: localize('agentSandbox.deniedNetworkDomains.deprecated', 'Use {0} instead', `\`#${"chat.agent.sandbox.deniedNetworkDomains" /* TerminalChatAgentToolsSettingId.AgentSandboxNetworkDeniedDomains */}#\``),
};
terminalChatAgentToolsConfiguration["chat.agent.sandboxFileSystem.linux" /* TerminalChatAgentToolsSettingId.DeprecatedAgentSandboxLinuxFileSystem */] = {
    type: 'object',
    deprecated: true,
    markdownDeprecationMessage: localize('agentSandbox.fileSystemLinux.deprecated', 'Use {0} instead', `\`#${"chat.agent.sandbox.fileSystem.linux" /* TerminalChatAgentToolsSettingId.AgentSandboxLinuxFileSystem */}#\``),
};
terminalChatAgentToolsConfiguration["chat.agent.sandboxFileSystem.mac" /* TerminalChatAgentToolsSettingId.DeprecatedAgentSandboxMacFileSystem */] = {
    type: 'object',
    deprecated: true,
    markdownDeprecationMessage: localize('agentSandbox.fileSystemMac.deprecated', 'Use {0} instead', `\`#${"chat.agent.sandbox.fileSystem.mac" /* TerminalChatAgentToolsSettingId.AgentSandboxMacFileSystem */}#\``),
};
terminalChatAgentToolsConfiguration["chat.agent.sandbox" /* TerminalChatAgentToolsSettingId.DeprecatedAgentSandboxEnabled */] = {
    type: 'boolean',
    deprecated: true,
    included: false,
    markdownDeprecationMessage: localize('agentSandbox.enabled.deprecated', 'Use {0} instead', `\`#${"chat.agent.sandbox.enabled" /* TerminalChatAgentToolsSettingId.AgentSandboxEnabled */}#\``),
};
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidGVybWluYWxDaGF0QWdlbnRUb29sc0NvbmZpZ3VyYXRpb24uanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi90ZXJtaW5hbENvbnRyaWIvY2hhdEFnZW50VG9vbHMvY29tbW9uL3Rlcm1pbmFsQ2hhdEFnZW50VG9vbHNDb25maWd1cmF0aW9uLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBSWhHLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSx1QkFBdUIsQ0FBQztBQUdqRCxPQUFPLEVBQUUsNkJBQTZCLEVBQUUsTUFBTSwwRUFBMEUsQ0FBQztBQUN6SCxPQUFPLEVBQUUsY0FBYyxFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFFdEUsTUFBTSxDQUFOLElBQWtCLCtCQWtDakI7QUFsQ0QsV0FBa0IsK0JBQStCO0lBQ2hELDhGQUEyRCxDQUFBO0lBQzNELGtGQUErQyxDQUFBO0lBQy9DLHdIQUFxRixDQUFBO0lBQ3JGLHNIQUFtRixDQUFBO0lBQ25GLDBHQUF1RSxDQUFBO0lBQ3ZFLDBHQUF1RSxDQUFBO0lBQ3ZFLGdHQUE2RCxDQUFBO0lBQzdELHdGQUFxRCxDQUFBO0lBQ3JELHFGQUFrRCxDQUFBO0lBQ2xELGlIQUE4RSxDQUFBO0lBQzlFLCtHQUE0RSxDQUFBO0lBQzVFLHNHQUFtRSxDQUFBO0lBQ25FLGtHQUErRCxDQUFBO0lBQy9ELGtHQUErRCxDQUFBO0lBQy9ELDBHQUF1RSxDQUFBO0lBQ3ZFLDhHQUEyRSxDQUFBO0lBQzNFLDBHQUF1RSxDQUFBO0lBQ3ZFLDRGQUF5RCxDQUFBO0lBRXpELHFHQUFrRSxDQUFBO0lBQ2xFLG1HQUFnRSxDQUFBO0lBQ2hFLHlHQUFzRSxDQUFBO0lBRXRFLHVGQUFvRCxDQUFBO0lBQ3BELDJIQUF3RixDQUFBO0lBQ3hGLHlIQUFzRixDQUFBO0lBQ3RGLCtHQUE0RSxDQUFBO0lBQzVFLDJHQUF3RSxDQUFBO0lBQ3hFLHNHQUFtRSxDQUFBO0lBQ25FLDJGQUF3RCxDQUFBO0lBQ3hELDBGQUF1RCxDQUFBO0lBQ3ZELDBHQUF1RSxDQUFBO0lBQ3ZFLHlHQUFzRSxDQUFBO0FBQ3ZFLENBQUMsRUFsQ2lCLCtCQUErQixLQUEvQiwrQkFBK0IsUUFrQ2hEO0FBRUQsTUFBTSxDQUFOLElBQWtCLHlDQUdqQjtBQUhELFdBQWtCLHlDQUF5QztJQUMxRCx3REFBVyxDQUFBO0lBQ1gsc0RBQVMsQ0FBQTtBQUNWLENBQUMsRUFIaUIseUNBQXlDLEtBQXpDLHlDQUF5QyxRQUcxRDtBQVFELE1BQU0sa0JBQWtCLEdBQWdCO0lBQ3ZDLElBQUksRUFBRSxTQUFTO0lBQ2YsSUFBSSxFQUFFO1FBQ0wsSUFBSTtRQUNKLEtBQUs7S0FDTDtJQUNELGdCQUFnQixFQUFFO1FBQ2pCLFFBQVEsQ0FBQyxrQkFBa0IsRUFBRSxvQ0FBb0MsQ0FBQztRQUNsRSxRQUFRLENBQUMsbUJBQW1CLEVBQUUsNENBQTRDLENBQUM7S0FDM0U7SUFDRCxXQUFXLEVBQUUsUUFBUSxDQUFDLGlCQUFpQixFQUFFLHlIQUF5SCxDQUFDO0NBQ25LLENBQUM7QUFFRixNQUFNLDhCQUE4QixHQUFnQjtJQUNuRCxJQUFJLEVBQUUsUUFBUTtJQUNkLFFBQVEsRUFBRSxDQUFDLE1BQU0sQ0FBQztJQUNsQixVQUFVLEVBQUU7UUFDWCxJQUFJLEVBQUU7WUFDTCxXQUFXLEVBQUUsUUFBUSxDQUFDLCtCQUErQixFQUFFLCtCQUErQixDQUFDO1lBQ3ZGLElBQUksRUFBRSxRQUFRO1NBQ2Q7UUFDRCxHQUFHLDZCQUE2QjtLQUNoQztDQUNELENBQUM7QUFFRixNQUFNLENBQUMsTUFBTSxtQ0FBbUMsR0FBb0Q7SUFDbkcsaUdBQW1ELEVBQUU7UUFDcEQsV0FBVyxFQUFFLFFBQVEsQ0FBQyw2QkFBNkIsRUFBRSxzRUFBc0UsQ0FBQztRQUM1SCxJQUFJLEVBQUUsU0FBUztRQUNmLE9BQU8sRUFBRSxJQUFJO1FBQ2IsTUFBTSxFQUFFO1lBQ1AsSUFBSSxFQUFFLG9DQUFvQztZQUMxQyxRQUFRLEVBQUUsY0FBYyxDQUFDLGtCQUFrQjtZQUMzQyxjQUFjLEVBQUUsT0FBTztZQUN2QixZQUFZLEVBQUU7Z0JBQ2IsV0FBVyxFQUFFO29CQUNaLEdBQUcsRUFBRSw2QkFBNkI7b0JBQ2xDLEtBQUssRUFBRSxRQUFRLENBQUMsNkJBQTZCLEVBQUUsc0VBQXNFLENBQUM7aUJBQ3RIO2FBQ0Q7U0FDRDtLQUNEO0lBQ0QscUZBQTZDLEVBQUU7UUFDOUMsbUJBQW1CLEVBQUU7WUFDcEIsUUFBUSxDQUFDLCtCQUErQixFQUFFLGdVQUFnVSxFQUFFLEtBQUssRUFBRSxLQUFLLENBQUM7WUFDelgsUUFBUSxDQUFDLGdDQUFnQyxFQUFFLGtIQUFrSCxFQUFFLFFBQVEsRUFBRSxTQUFTLEVBQUUsUUFBUSxDQUFDO1lBQzdMLFFBQVEsQ0FBQyxxQ0FBcUMsRUFBRSxnVUFBZ1UsRUFBRSxjQUFjLEVBQUUsT0FBTyxFQUFFLE9BQU8sRUFBRSxRQUFRLEVBQUUsU0FBUyxFQUFFLFVBQVUsQ0FBQztZQUNwYixRQUFRLENBQUMscUNBQXFDLEVBQUUsOFNBQThTLEVBQUUsOENBQThDLENBQUM7WUFDL1ksUUFBUSxDQUFDLHNCQUFzQixFQUFFLDRTQUE0UyxFQUFFLE1BQU0sdUhBQTZELEtBQUssRUFBRSxRQUFRLENBQUM7WUFDbGE7Z0JBQ0MsUUFBUSxDQUFDLHdDQUF3QyxFQUFFLFdBQVcsQ0FBQztnQkFDL0QsSUFBSSxRQUFRLENBQUMsd0NBQXdDLEVBQUUsT0FBTyxDQUFDLElBQUksUUFBUSxDQUFDLDhDQUE4QyxFQUFFLGFBQWEsQ0FBQyxHQUFHO2dCQUM3SSxXQUFXO2dCQUNYLHdCQUF3QixHQUFHLFFBQVEsQ0FBQyx3Q0FBd0MsRUFBRSxzQ0FBc0MsRUFBRSxTQUFTLENBQUM7Z0JBQ2hJLGdDQUFnQyxHQUFHLFFBQVEsQ0FBQyw4Q0FBOEMsRUFBRSxzQ0FBc0MsRUFBRSxpQkFBaUIsQ0FBQztnQkFDdEosOEJBQThCLEdBQUcsUUFBUSxDQUFDLDBDQUEwQyxFQUFFLDZEQUE2RCxFQUFFLGVBQWUsRUFBRSxnQkFBZ0IsRUFBRSxpQkFBaUIsQ0FBQztnQkFDMU0saURBQWlELEdBQUcsUUFBUSxDQUFDLDJDQUEyQyxFQUFFLDhDQUE4QyxFQUFFLGNBQWMsRUFBRSxZQUFZLENBQUM7Z0JBQ3ZMLHlDQUF5QyxHQUFHLFFBQVEsQ0FBQyw0Q0FBNEMsRUFBRSw4Q0FBOEMsRUFBRSxpQkFBaUIsQ0FBQztnQkFDckssdUJBQXVCLEdBQUcsUUFBUSxDQUFDLDJDQUEyQyxFQUFFLDZEQUE2RCxDQUFDO2dCQUM5SSxzQkFBc0IsR0FBRyxRQUFRLENBQUMscUNBQXFDLEVBQUUsOERBQThELEVBQUUsTUFBTSxDQUFDO2dCQUNoSixvRUFBb0UsR0FBRyxRQUFRLENBQUMsc0NBQXNDLEVBQUUseUZBQXlGLEVBQUUsVUFBVSxDQUFDO2dCQUM5TixxQkFBcUIsR0FBRyxRQUFRLENBQUMsMENBQTBDLEVBQUUscUNBQXFDLEVBQUUsU0FBUyxFQUFFLE1BQU0sQ0FBQzthQUN0SSxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUM7U0FDWixDQUFDLElBQUksQ0FBQyxNQUFNLENBQUM7UUFDZCxJQUFJLEVBQUUsUUFBUTtRQUNkLG9CQUFvQixFQUFFO1lBQ3JCLEtBQUssRUFBRTtnQkFDTixrQkFBa0I7Z0JBQ2xCO29CQUNDLElBQUksRUFBRSxRQUFRO29CQUNkLFVBQVUsRUFBRTt3QkFDWCxPQUFPLEVBQUUsa0JBQWtCO3dCQUMzQixnQkFBZ0IsRUFBRTs0QkFDakIsSUFBSSxFQUFFLFNBQVM7NEJBQ2YsSUFBSSxFQUFFO2dDQUNMLElBQUk7Z0NBQ0osS0FBSzs2QkFDTDs0QkFDRCxnQkFBZ0IsRUFBRTtnQ0FDakIsUUFBUSxDQUFDLG1DQUFtQyxFQUFFLHdEQUF3RCxDQUFDO2dDQUN2RyxRQUFRLENBQUMsb0NBQW9DLEVBQUUsMkdBQTJHLENBQUM7NkJBQzNKOzRCQUNELFdBQVcsRUFBRSxRQUFRLENBQUMsOEJBQThCLEVBQUUsOEdBQThHLENBQUM7eUJBQ3JLO3FCQUNEO29CQUNELFFBQVEsRUFBRSxDQUFDLFNBQVMsQ0FBQztpQkFDckI7Z0JBQ0Q7b0JBQ0MsSUFBSSxFQUFFLE1BQU07b0JBQ1osV0FBVyxFQUFFLFFBQVEsQ0FBQyxrQkFBa0IsRUFBRSwwRkFBMEYsQ0FBQztpQkFDckk7YUFDRDtTQUNEO1FBQ0QsT0FBTyxFQUFFO1lBQ1Isc0ZBQXNGO1lBQ3RGLHFGQUFxRjtZQUNyRixpRkFBaUY7WUFDakYsb0ZBQW9GO1lBQ3BGLHNGQUFzRjtZQUN0RixtRUFBbUU7WUFDbkUsRUFBRTtZQUNGLHNGQUFzRjtZQUN0Rix1RkFBdUY7WUFDdkYsWUFBWTtZQUNaLEVBQUU7WUFDRixrRkFBa0Y7WUFDbEYsd0ZBQXdGO1lBQ3hGLHNGQUFzRjtZQUN0Rix3RkFBd0Y7WUFDeEYsc0ZBQXNGO1lBQ3RGLG9DQUFvQztZQUVwQyx3QkFBd0I7WUFDeEIsRUFBRTtZQUNGLDhDQUE4QztZQUU5QyxFQUFFLEVBQUUsSUFBSTtZQUNSLElBQUksRUFBRSxJQUFJO1lBQ1YsRUFBRSxFQUFFLElBQUk7WUFDUixHQUFHLEVBQUUsSUFBSTtZQUNULEdBQUcsRUFBRSxJQUFJO1lBQ1QsR0FBRyxFQUFFLElBQUk7WUFDVCxJQUFJLEVBQUUsSUFBSTtZQUNWLElBQUksRUFBRSxJQUFJO1lBQ1YsT0FBTyxFQUFFLElBQUk7WUFDYixFQUFFLEVBQUUsSUFBSTtZQUNSLEVBQUUsRUFBRSxJQUFJO1lBQ1IsR0FBRyxFQUFFLElBQUk7WUFDVCxHQUFHLEVBQUUsSUFBSTtZQUNULEtBQUssRUFBRSxJQUFJO1lBQ1gsUUFBUSxFQUFFLElBQUk7WUFDZCxPQUFPLEVBQUUsSUFBSTtZQUNiLFFBQVEsRUFBRSxJQUFJO1lBQ2QsUUFBUSxFQUFFLElBQUk7WUFDZCxJQUFJLEVBQUUsSUFBSTtZQUNWLElBQUksRUFBRSxJQUFJO1lBQ1YsRUFBRSxFQUFFLElBQUk7WUFDUixFQUFFLEVBQUUsSUFBSTtZQUNSLEVBQUUsRUFBRSxJQUFJO1lBQ1IsS0FBSyxFQUFFLElBQUk7WUFDWCxFQUFFLEVBQUUsSUFBSTtZQUVSLE9BQU87WUFDUCxhQUFhO1lBQ2IsdUZBQXVGO1lBQ3ZGLGFBQWE7WUFDYixnRkFBZ0Y7WUFDaEYsbUZBQW1GO1lBQ25GLGlFQUFpRTtZQUNqRSxxRkFBcUY7WUFDckYscUJBQXFCO1lBQ3JCLElBQUksRUFBRSxJQUFJO1lBRVYsYUFBYTtZQUViLDRCQUE0QjtZQUM1QixFQUFFO1lBQ0YsK0JBQStCO1lBRS9CLG9GQUFvRjtZQUNwRixtREFBbUQsRUFBRSxJQUFJO1lBQ3pELGdEQUFnRCxFQUFFLElBQUk7WUFDdEQsc0VBQXNFLEVBQUUsS0FBSztZQUM3RSxpREFBaUQsRUFBRSxJQUFJO1lBQ3ZELGlEQUFpRCxFQUFFLElBQUk7WUFDdkQscURBQXFELEVBQUUsSUFBSTtZQUUzRCxXQUFXO1lBQ1gsd0ZBQXdGO1lBQ3hGLHdCQUF3QjtZQUN4QixpREFBaUQsRUFBRSxJQUFJO1lBRXZELGFBQWE7WUFDYixvREFBb0Q7WUFDcEQsd0NBQXdDO1lBQ3hDLG1DQUFtQztZQUNuQyxtREFBbUQsRUFBRSxJQUFJO1lBQ3pELG9GQUFvRixFQUFFLEtBQUs7WUFFM0YsaUNBQWlDO1lBQ2pDLHlGQUF5RixFQUFFLElBQUk7WUFDL0YseUdBQXlHLEVBQUUsSUFBSTtZQUMvRywrRUFBK0UsRUFBRSxJQUFJO1lBRXJGLGFBQWE7WUFFYixxQkFBcUI7WUFFckIsZUFBZSxFQUFFLElBQUk7WUFDckIsYUFBYSxFQUFFLElBQUk7WUFDbkIsVUFBVSxFQUFFLElBQUk7WUFDaEIsWUFBWSxFQUFFLElBQUk7WUFDbEIsY0FBYyxFQUFFLElBQUk7WUFDcEIsY0FBYyxFQUFFLElBQUk7WUFDcEIsWUFBWSxFQUFFLElBQUk7WUFDbEIsY0FBYyxFQUFFLElBQUk7WUFDcEIsWUFBWSxFQUFFLElBQUk7WUFDbEIsWUFBWSxFQUFFLElBQUk7WUFDbEIsV0FBVyxFQUFFLElBQUk7WUFDakIsYUFBYSxFQUFFLElBQUk7WUFDbkIsY0FBYyxFQUFFLElBQUk7WUFFcEIsaUNBQWlDO1lBQ2pDLHFCQUFxQixFQUFFLElBQUk7WUFDM0Isc0JBQXNCLEVBQUUsSUFBSTtZQUM1QixzQkFBc0IsRUFBRSxJQUFJO1lBQzVCLHFCQUFxQixFQUFFLElBQUk7WUFDM0IsbUJBQW1CLEVBQUUsSUFBSTtZQUV6QixhQUFhO1lBRWIsNkNBQTZDO1lBQzdDLEVBQUU7WUFDRix3RUFBd0U7WUFFeEUseUJBQXlCO1lBQ3pCLGtJQUFrSSxFQUFFLElBQUk7WUFDeEksbUNBQW1DLEVBQUUsSUFBSTtZQUN6Qyx5QkFBeUIsRUFBRSxJQUFJO1lBQy9CLGtCQUFrQixFQUFFLElBQUk7WUFDeEIsOEJBQThCLEVBQUUsSUFBSTtZQUVwQywwQkFBMEI7WUFDMUIsMERBQTBELEVBQUUsSUFBSTtZQUNoRSx3QkFBd0IsRUFBRSxJQUFJO1lBQzlCLG9DQUFvQyxFQUFFLElBQUk7WUFDMUMsb0NBQW9DLEVBQUUsSUFBSTtZQUMxQyw0QkFBNEIsRUFBRSxJQUFJO1lBRWxDLDBCQUEwQjtZQUMxQixzREFBc0QsRUFBRSxJQUFJO1lBQzVELHdCQUF3QixFQUFFLElBQUk7WUFDOUIsb0NBQW9DLEVBQUUsSUFBSTtZQUMxQyxvQ0FBb0MsRUFBRSxJQUFJO1lBRTFDLHFGQUFxRjtZQUNyRixRQUFRLEVBQUUsSUFBSTtZQUNkLDRDQUE0QyxFQUFFLElBQUk7WUFDbEQsNENBQTRDLEVBQUUsSUFBSTtZQUVsRCxhQUFhO1lBRWIsK0JBQStCO1lBQy9CLEVBQUU7WUFDRixtRkFBbUY7WUFDbkYsa0ZBQWtGO1lBRWxGLFNBQVM7WUFDVCwyRUFBMkU7WUFDM0UsTUFBTSxFQUFFLElBQUk7WUFDWixrQ0FBa0MsRUFBRSxLQUFLO1lBRXpDLE9BQU87WUFDUCxrQ0FBa0M7WUFDbEMsSUFBSSxFQUFFLElBQUk7WUFDViw4QkFBOEIsRUFBRSxLQUFLO1lBRXJDLE9BQU87WUFDUCw2Q0FBNkM7WUFDN0MsNENBQTRDO1lBQzVDLDZDQUE2QztZQUM3Qyx1REFBdUQ7WUFDdkQsSUFBSSxFQUFFLElBQUk7WUFDVixzRUFBc0UsRUFBRSxLQUFLO1lBRTdFLGVBQWU7WUFDZixpRkFBaUY7WUFDakYsa0VBQWtFO1lBQ2xFLEVBQUUsRUFBRSxJQUFJO1lBQ1Isd0NBQXdDLEVBQUUsS0FBSztZQUUvQyxNQUFNO1lBQ04scUZBQXFGO1lBQ3JGLGdDQUFnQztZQUNoQyxvRkFBb0Y7WUFDcEYsbURBQW1EO1lBQ25ELDBGQUEwRjtZQUMxRixnRUFBZ0U7WUFDaEUsb0RBQW9EO1lBQ3BELG1EQUFtRDtZQUNuRCx3RkFBd0Y7WUFDeEYsOEJBQThCO1lBQzlCLHVGQUF1RjtZQUN2RiwyQkFBMkI7WUFDM0IsR0FBRyxFQUFFLElBQUk7WUFDVCxpRUFBaUUsRUFBRSxLQUFLO1lBQ3hFLCtCQUErQixFQUFFLEtBQUs7WUFDdEMsZUFBZSxFQUFFLEtBQUs7WUFFdEIsT0FBTztZQUNQLHVGQUF1RjtZQUN2RixzQkFBc0I7WUFDdEIsd0ZBQXdGO1lBQ3hGLGdCQUFnQjtZQUNoQixJQUFJLEVBQUUsSUFBSTtZQUNWLDBCQUEwQixFQUFFLEtBQUs7WUFFakMsT0FBTztZQUNQLHVGQUF1RjtZQUN2RixzQkFBc0I7WUFDdEIsSUFBSSxFQUFFLElBQUk7WUFDVixzQkFBc0IsRUFBRSxLQUFLO1lBRTdCLE1BQU07WUFDTixvRkFBb0Y7WUFDcEYsZ0NBQWdDO1lBQ2hDLFNBQVMsRUFBRSxJQUFJO1lBQ2YsdUNBQXVDLEVBQUUsSUFBSTtZQUU3QyxhQUFhO1lBRWIsNkJBQTZCO1lBQzdCLEVBQUU7WUFDRixxRkFBcUY7WUFDckYsd0ZBQXdGO1lBQ3hGLHFGQUFxRjtZQUNyRix3RkFBd0Y7WUFDeEYsOEJBQThCO1lBRTlCLGlCQUFpQjtZQUNqQixFQUFFLEVBQUUsS0FBSztZQUNULEtBQUssRUFBRSxLQUFLO1lBQ1osR0FBRyxFQUFFLEtBQUs7WUFDVixhQUFhLEVBQUUsS0FBSztZQUNwQixFQUFFLEVBQUUsS0FBSztZQUNULEVBQUUsRUFBRSxLQUFLO1lBQ1QsS0FBSyxFQUFFLEtBQUs7WUFDWixFQUFFLEVBQUUsS0FBSztZQUVULDhEQUE4RDtZQUM5RCxJQUFJLEVBQUUsS0FBSztZQUNYLEVBQUUsRUFBRSxLQUFLO1lBQ1QsR0FBRyxFQUFFLEtBQUs7WUFDVixjQUFjLEVBQUUsS0FBSztZQUNyQixJQUFJLEVBQUUsS0FBSztZQUNYLFFBQVEsRUFBRSxLQUFLO1lBQ2YsY0FBYyxFQUFFLEtBQUs7WUFFckIsMENBQTBDO1lBQzFDLElBQUksRUFBRSxLQUFLO1lBQ1gsSUFBSSxFQUFFLEtBQUs7WUFDWCxtQkFBbUIsRUFBRSxLQUFLO1lBQzFCLG1CQUFtQixFQUFFLEtBQUs7WUFDMUIsS0FBSyxFQUFFLEtBQUs7WUFDWixLQUFLLEVBQUUsS0FBSztZQUVaLHVGQUF1RjtZQUN2RixLQUFLLEVBQUUsS0FBSztZQUNaLEtBQUssRUFBRSxLQUFLO1lBQ1osa0JBQWtCLEVBQUUsS0FBSztZQUN6QixJQUFJLEVBQUUsS0FBSztZQUNYLFNBQVMsRUFBRSxLQUFLO1lBRWhCLG9FQUFvRTtZQUNwRSxFQUFFLEVBQUUsS0FBSztZQUNULEtBQUssRUFBRSxLQUFLO1lBQ1osSUFBSSxFQUFFLEtBQUs7WUFDWCxtQkFBbUIsRUFBRSxLQUFLO1lBQzFCLEdBQUcsRUFBRSxLQUFLO1lBRVYsYUFBYTtTQUN3RTtLQUN0RjtJQUNELHlIQUErRCxFQUFFO1FBQ2hFLElBQUksRUFBRSxTQUFTO1FBQ2YsT0FBTyxFQUFFLEtBQUs7UUFDZCxJQUFJLEVBQUUsQ0FBQyxjQUFjLENBQUM7UUFDdEIsbUJBQW1CLEVBQUUsUUFBUSxDQUFDLDJDQUEyQyxFQUFFLHdhQUF3YSxFQUFFLE1BQU0sbUZBQTJDLEtBQUssQ0FBQztLQUM1aUI7SUFDRCwySEFBZ0UsRUFBRTtRQUNqRSxVQUFVLEVBQUUsSUFBSTtRQUNoQixJQUFJLEVBQUUsU0FBUztRQUNmLG9GQUFvRjtRQUNwRiwrRUFBK0U7UUFDL0UsT0FBTyxFQUFFLElBQUk7UUFDYixJQUFJLEVBQUUsQ0FBQyxjQUFjLENBQUM7UUFDdEIsbUJBQW1CLEVBQUUsUUFBUSxDQUFDLDRDQUE0QyxFQUFFLHNQQUFzUCxDQUFDO0tBQ25VO0lBQ0QsNkdBQXlELEVBQUU7UUFDMUQsSUFBSSxFQUFFLFFBQVE7UUFDZCxJQUFJLEVBQUUsQ0FBQyxPQUFPLEVBQUUsa0JBQWtCLEVBQUUsS0FBSyxDQUFDO1FBQzFDLGdCQUFnQixFQUFFO1lBQ2pCLFFBQVEsQ0FBQyx1QkFBdUIsRUFBRSxpQ0FBaUMsQ0FBQztZQUNwRSxRQUFRLENBQUMsa0NBQWtDLEVBQUUsK0tBQStLLENBQUM7WUFDN04sUUFBUSxDQUFDLHFCQUFxQixFQUFFLGlDQUFpQyxDQUFDO1NBQ2xFO1FBQ0QsT0FBTyxFQUFFLGtCQUFrQjtRQUMzQixJQUFJLEVBQUUsQ0FBQyxjQUFjLENBQUM7UUFDdEIsbUJBQW1CLEVBQUUsUUFBUSxDQUFDLDZCQUE2QixFQUFFLDZiQUE2YixDQUFDO0tBQzNmO0lBQ0QsNkdBQXlELEVBQUU7UUFDMUQsbUJBQW1CLEVBQUUsUUFBUSxDQUFDLHFDQUFxQyxFQUFFLDhWQUE4VixFQUFFLE1BQU0sOEZBQXlDLEtBQUssQ0FBQztRQUMxZCxJQUFJLEVBQUUsU0FBUztRQUNmLE9BQU8sRUFBRSxDQUFDLENBQUM7UUFDWCxPQUFPLEVBQUUsS0FBSztRQUNkLE9BQU8sRUFBRSxDQUFDLENBQUM7UUFDWCwwQkFBMEIsRUFBRSxRQUFRLENBQUMsb0NBQW9DLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSw4RkFBeUMsS0FBSyxDQUFDO0tBQ25KO0lBQ0QsK0ZBQWtELEVBQUU7UUFDbkQsbUJBQW1CLEVBQUUsUUFBUSxDQUFDLDhCQUE4QixFQUFFLDRWQUE0VixDQUFDO1FBQzNaLElBQUksRUFBRSxTQUFTO1FBQ2YsT0FBTyxFQUFFLEVBQUU7UUFDWCxPQUFPLEVBQUUsS0FBSztRQUNkLE9BQU8sRUFBRSxJQUFJO0tBQ2I7SUFDRCx3R0FBc0QsRUFBRTtRQUN2RCxVQUFVLEVBQUUsSUFBSTtRQUNoQixtQkFBbUIsRUFBRSxRQUFRLENBQUMsZ0NBQWdDLEVBQUUsNkVBQTZFLENBQUM7UUFDOUksSUFBSSxFQUFFLENBQUMsUUFBUSxFQUFFLE1BQU0sQ0FBQztRQUN4QixPQUFPLEVBQUUsSUFBSTtRQUNiLE9BQU8sRUFBRTtZQUNSLEVBQUUsSUFBSSxFQUFFLE1BQU0sRUFBRTtZQUNoQiw4QkFBOEI7U0FDOUI7UUFDRCxlQUFlLEVBQUU7WUFDaEI7Z0JBQ0MsSUFBSSxFQUFFO29CQUNMLElBQUksRUFBRSxNQUFNO2lCQUNaO2FBQ0Q7U0FDRDtLQUNEO0lBQ0Qsc0dBQXNELEVBQUU7UUFDdkQsVUFBVSxFQUFFLElBQUk7UUFDaEIsbUJBQW1CLEVBQUUsUUFBUSxDQUFDLDhCQUE4QixFQUFFLDZFQUE2RSxDQUFDO1FBQzVJLElBQUksRUFBRSxDQUFDLFFBQVEsRUFBRSxNQUFNLENBQUM7UUFDeEIsT0FBTyxFQUFFLElBQUk7UUFDYixPQUFPLEVBQUU7WUFDUixFQUFFLElBQUksRUFBRSxNQUFNLEVBQUU7WUFDaEIsOEJBQThCO1NBQzlCO1FBQ0QsZUFBZSxFQUFFO1lBQ2hCO2dCQUNDLElBQUksRUFBRTtvQkFDTCxJQUFJLEVBQUUsTUFBTTtpQkFDWjthQUNEO1NBQ0Q7S0FDRDtJQUNELDRHQUF3RCxFQUFFO1FBQ3pELFVBQVUsRUFBRSxJQUFJO1FBQ2hCLG1CQUFtQixFQUFFLFFBQVEsQ0FBQyxrQ0FBa0MsRUFBRSwrRUFBK0UsQ0FBQztRQUNsSixJQUFJLEVBQUUsQ0FBQyxRQUFRLEVBQUUsTUFBTSxDQUFDO1FBQ3hCLE9BQU8sRUFBRSxJQUFJO1FBQ2IsT0FBTyxFQUFFO1lBQ1IsRUFBRSxJQUFJLEVBQUUsTUFBTSxFQUFFO1lBQ2hCLDhCQUE4QjtTQUM5QjtRQUNELGVBQWUsRUFBRTtZQUNoQjtnQkFDQyxJQUFJLEVBQUU7b0JBQ0wsSUFBSSxFQUFFLE1BQU07aUJBQ1o7YUFDRDtTQUNEO0tBQ0Q7SUFDRCxtR0FBb0QsRUFBRTtRQUNyRCxJQUFJLEVBQUUsU0FBUztRQUNmLE9BQU8sRUFBRSxLQUFLO1FBQ2QsSUFBSSxFQUFFLENBQUMsY0FBYyxDQUFDO1FBQ3RCLG1CQUFtQixFQUFFLFFBQVEsQ0FBQyx3QkFBd0IsRUFBRSw0UkFBNFIsQ0FBQztLQUNyVjtJQUNELDJGQUFnRCxFQUFFO1FBQ2pELG1CQUFtQixFQUFFLFFBQVEsQ0FBQyw0QkFBNEIsRUFBRSx5REFBeUQsQ0FBQztRQUN0SCxJQUFJLEVBQUUsUUFBUTtRQUNkLElBQUksRUFBRSxDQUFDLFVBQVUsRUFBRSxNQUFNLENBQUM7UUFDMUIsZ0JBQWdCLEVBQUU7WUFDakIsUUFBUSxDQUFDLHlCQUF5QixFQUFFLGlFQUFpRSxDQUFDO1lBQ3RHLFFBQVEsQ0FBQyxxQkFBcUIsRUFBRSw4Q0FBOEMsQ0FBQztTQUMvRTtRQUNELE9BQU8sRUFBRSxNQUFNO1FBQ2YsSUFBSSxFQUFFLENBQUMsY0FBYyxDQUFDO1FBQ3RCLFVBQVUsRUFBRTtZQUNYLElBQUksRUFBRSxNQUFNO1NBQ1o7S0FDRDtJQUNELHdGQUFxRCxFQUFFO1FBQ3RELG1CQUFtQixFQUFFLFFBQVEsQ0FBQyw2QkFBNkIsRUFBRSxvTEFBb0wsQ0FBQztRQUNsUCxJQUFJLEVBQUUsUUFBUTtRQUNkLElBQUksRUFBRSxvSEFBNkY7UUFDbkcsZ0JBQWdCLEVBQUU7WUFDakIsUUFBUSxDQUFDLDRDQUE0QyxFQUFFLDBDQUEwQyxDQUFDO1lBQ2xHLFFBQVEsQ0FBQywyQ0FBMkMsRUFBRSx5Q0FBeUMsQ0FBQztTQUNoRztRQUNELE9BQU8sMkRBQStDO1FBQ3RELElBQUksRUFBRSxDQUFDLFNBQVMsQ0FBQztRQUNqQixVQUFVLEVBQUUsSUFBSTtRQUNoQixVQUFVLEVBQUU7WUFDWCxJQUFJLEVBQUUsTUFBTTtTQUNaO0tBQ0Q7SUFDRCxvSEFBbUUsRUFBRTtRQUNwRSxtQkFBbUIsRUFBRSxRQUFRLENBQUMsNENBQTRDLEVBQUUsa0xBQWtMLEVBQUUsTUFBTSxzRkFBbUQsS0FBSyxFQUFFLGlCQUFpQixDQUFDO1FBQ2xWLElBQUksRUFBRSxPQUFPO1FBQ2IsS0FBSyxFQUFFLEVBQUUsSUFBSSxFQUFFLFFBQVEsRUFBRTtRQUN6QixPQUFPLEVBQUUsRUFBRTtRQUNYLElBQUksRUFBRSxDQUFDLFNBQVMsQ0FBQztRQUNqQixVQUFVLEVBQUUsSUFBSTtLQUNoQjtJQUNELGtIQUFrRSxFQUFFO1FBQ25FLG1CQUFtQixFQUFFLFFBQVEsQ0FBQywyQ0FBMkMsRUFBRSw4SkFBOEosRUFBRSxNQUFNLHNGQUFtRCxLQUFLLEVBQUUsTUFBTSxrSEFBaUUsS0FBSyxDQUFDO1FBQ3hYLElBQUksRUFBRSxPQUFPO1FBQ2IsS0FBSyxFQUFFLEVBQUUsSUFBSSxFQUFFLFFBQVEsRUFBRTtRQUN6QixPQUFPLEVBQUUsRUFBRTtRQUNYLElBQUksRUFBRSxDQUFDLFNBQVMsQ0FBQztRQUNqQixVQUFVLEVBQUUsSUFBSTtLQUNoQjtJQUNELHlHQUE2RCxFQUFFO1FBQzlELG1CQUFtQixFQUFFLFFBQVEsQ0FBQyxxQ0FBcUMsRUFBRSwyUUFBMlEsRUFBRSxNQUFNLHNGQUFtRCxLQUFLLENBQUM7UUFDalosSUFBSSxFQUFFLFFBQVE7UUFDZCxVQUFVLEVBQUU7WUFDWCxRQUFRLEVBQUU7Z0JBQ1QsSUFBSSxFQUFFLE9BQU87Z0JBQ2IsV0FBVyxFQUFFLFFBQVEsQ0FBQyw4Q0FBOEMsRUFBRSw2RUFBNkUsQ0FBQztnQkFDcEosS0FBSyxFQUFFLEVBQUUsSUFBSSxFQUFFLFFBQVEsRUFBRTtnQkFDekIsT0FBTyxFQUFFLEVBQUU7YUFDWDtZQUNELFVBQVUsRUFBRTtnQkFDWCxJQUFJLEVBQUUsT0FBTztnQkFDYixXQUFXLEVBQUUsUUFBUSxDQUFDLGdEQUFnRCxFQUFFLDJFQUEyRSxDQUFDO2dCQUNwSixLQUFLLEVBQUUsRUFBRSxJQUFJLEVBQUUsUUFBUSxFQUFFO2dCQUN6QixPQUFPLEVBQUUsQ0FBQyxHQUFHLENBQUM7YUFDZDtZQUNELFNBQVMsRUFBRTtnQkFDVixJQUFJLEVBQUUsT0FBTztnQkFDYixXQUFXLEVBQUUsUUFBUSxDQUFDLCtDQUErQyxFQUFFLDhGQUE4RixDQUFDO2dCQUN0SyxLQUFLLEVBQUUsRUFBRSxJQUFJLEVBQUUsUUFBUSxFQUFFO2dCQUN6QixPQUFPLEVBQUUsRUFBRTthQUNYO1NBQ0Q7UUFDRCxPQUFPLEVBQUU7WUFDUixRQUFRLEVBQUUsRUFBRTtZQUNaLFVBQVUsRUFBRSxDQUFDLEdBQUcsQ0FBQztZQUNqQixTQUFTLEVBQUUsRUFBRTtTQUNiO1FBQ0QsSUFBSSxFQUFFLENBQUMsU0FBUyxDQUFDO1FBQ2pCLFVBQVUsRUFBRSxJQUFJO0tBQ2hCO0lBQ0QscUdBQTJELEVBQUU7UUFDNUQsbUJBQW1CLEVBQUUsUUFBUSxDQUFDLG1DQUFtQyxFQUFFLG9NQUFvTSxFQUFFLE1BQU0sc0ZBQW1ELEtBQUssQ0FBQztRQUN4VSxJQUFJLEVBQUUsUUFBUTtRQUNkLFVBQVUsRUFBRTtZQUNYLFFBQVEsRUFBRTtnQkFDVCxJQUFJLEVBQUUsT0FBTztnQkFDYixXQUFXLEVBQUUsUUFBUSxDQUFDLDRDQUE0QyxFQUFFLDZFQUE2RSxDQUFDO2dCQUNsSixLQUFLLEVBQUUsRUFBRSxJQUFJLEVBQUUsUUFBUSxFQUFFO2dCQUN6QixPQUFPLEVBQUUsRUFBRTthQUNYO1lBQ0QsVUFBVSxFQUFFO2dCQUNYLElBQUksRUFBRSxPQUFPO2dCQUNiLFdBQVcsRUFBRSxRQUFRLENBQUMsOENBQThDLEVBQUUsMkVBQTJFLENBQUM7Z0JBQ2xKLEtBQUssRUFBRSxFQUFFLElBQUksRUFBRSxRQUFRLEVBQUU7Z0JBQ3pCLE9BQU8sRUFBRSxDQUFDLEdBQUcsQ0FBQzthQUNkO1lBQ0QsU0FBUyxFQUFFO2dCQUNWLElBQUksRUFBRSxPQUFPO2dCQUNiLFdBQVcsRUFBRSxRQUFRLENBQUMsNkNBQTZDLEVBQUUsOEZBQThGLENBQUM7Z0JBQ3BLLEtBQUssRUFBRSxFQUFFLElBQUksRUFBRSxRQUFRLEVBQUU7Z0JBQ3pCLE9BQU8sRUFBRSxFQUFFO2FBQ1g7U0FDRDtRQUNELE9BQU8sRUFBRTtZQUNSLFFBQVEsRUFBRSxFQUFFO1lBQ1osVUFBVSxFQUFFLENBQUMsR0FBRyxDQUFDO1lBQ2pCLFNBQVMsRUFBRSxFQUFFO1NBQ2I7UUFDRCxJQUFJLEVBQUUsQ0FBQyxTQUFTLENBQUM7UUFDakIsVUFBVSxFQUFFLElBQUk7S0FDaEI7SUFDRCxxR0FBcUQsRUFBRTtRQUN0RCxJQUFJLEVBQUUsU0FBUztRQUNmLE9BQU8sRUFBRSxJQUFJO1FBQ2IsbUJBQW1CLEVBQUU7WUFDcEIsUUFBUSxDQUFDLGlDQUFpQyxFQUFFLCtJQUErSSxDQUFDO1lBQzVMLGVBQWUsUUFBUSxDQUFDLHNDQUFzQyxFQUFFLG9FQUFvRSxDQUFDLEVBQUU7WUFDdkksY0FBYyxRQUFRLENBQUMscUNBQXFDLEVBQUUscUVBQXFFLENBQUMsRUFBRTtZQUN0SSxlQUFlLFFBQVEsQ0FBQyxzQ0FBc0MsRUFBRSx1RUFBdUUsQ0FBQyxFQUFFO1lBQzFJLGVBQWUsUUFBUSxDQUFDLHNDQUFzQyxFQUFFLG1IQUFtSCxDQUFDLEVBQUU7U0FDdEwsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDO0tBQ1o7SUFDRCw2R0FBeUQsRUFBRTtRQUMxRCxVQUFVLEVBQUUsSUFBSTtRQUNoQixJQUFJLEVBQUUsU0FBUztRQUNmLE9BQU8sRUFBRSxJQUFJO1FBQ2IsSUFBSSxFQUFFLENBQUMsY0FBYyxDQUFDO1FBQ3RCLFVBQVUsRUFBRTtZQUNYLElBQUksRUFBRSxNQUFNO1NBQ1o7UUFDRCxtQkFBbUIsRUFBRSxRQUFRLENBQUMscUNBQXFDLEVBQUUsc1BBQXNQLENBQUM7S0FDNVQ7SUFDRCxpSEFBMkQsRUFBRTtRQUM1RCxRQUFRLEVBQUUsS0FBSztRQUNmLFVBQVUsRUFBRSxJQUFJO1FBQ2hCLElBQUksRUFBRSxTQUFTO1FBQ2YsT0FBTyxFQUFFLEtBQUs7UUFDZCxJQUFJLEVBQUUsQ0FBQyxjQUFjLENBQUM7UUFDdEIsbUJBQW1CLEVBQUUsUUFBUSxDQUFDLHVDQUF1QyxFQUFFLHlTQUF5UyxDQUFDO0tBQ2pYO0lBQ0QsNkdBQXlELEVBQUU7UUFDMUQsVUFBVSxFQUFFLElBQUk7UUFDaEIsSUFBSSxFQUFFLFNBQVM7UUFDZixPQUFPLEVBQUUsS0FBSztRQUNkLElBQUksRUFBRSxDQUFDLGNBQWMsQ0FBQztRQUN0QixtQkFBbUIsRUFBRSxRQUFRLENBQUMscUNBQXFDLEVBQUUsbVJBQW1SLENBQUM7S0FDelY7Q0FDRCxDQUFDO0FBRUYsS0FBSyxNQUFNLEVBQUUsSUFBSTs7Ozs7O0NBTWhCLEVBQUUsQ0FBQztJQUNILG1DQUFtQyxDQUFDLEVBQUUsQ0FBQyxHQUFHO1FBQ3pDLFVBQVUsRUFBRSxJQUFJO1FBQ2hCLDBCQUEwQixFQUFFLFFBQVEsQ0FBQyx3QkFBd0IsRUFBRSxpQkFBaUIsRUFBRSxNQUFNLG1GQUEyQyxLQUFLLENBQUM7S0FDekksQ0FBQztBQUNILENBQUM7QUFFRCxtQ0FBbUMsOEhBQTZFLEdBQUc7SUFDbEgsSUFBSSxFQUFFLE9BQU87SUFDYixLQUFLLEVBQUUsRUFBRSxJQUFJLEVBQUUsUUFBUSxFQUFFO0lBQ3pCLFVBQVUsRUFBRSxJQUFJO0lBQ2hCLDBCQUEwQixFQUFFLFFBQVEsQ0FBQywrQ0FBK0MsRUFBRSxpQkFBaUIsRUFBRSxNQUFNLGtIQUFpRSxLQUFLLENBQUM7Q0FDdEwsQ0FBQztBQUVGLG1DQUFtQyw0SEFBNEUsR0FBRztJQUNqSCxJQUFJLEVBQUUsT0FBTztJQUNiLEtBQUssRUFBRSxFQUFFLElBQUksRUFBRSxRQUFRLEVBQUU7SUFDekIsVUFBVSxFQUFFLElBQUk7SUFDaEIsMEJBQTBCLEVBQUUsUUFBUSxDQUFDLDhDQUE4QyxFQUFFLGlCQUFpQixFQUFFLE1BQU0sZ0hBQWdFLEtBQUssQ0FBQztDQUNwTCxDQUFDO0FBRUYsbUNBQW1DLGtIQUF1RSxHQUFHO0lBQzVHLElBQUksRUFBRSxRQUFRO0lBQ2QsVUFBVSxFQUFFLElBQUk7SUFDaEIsMEJBQTBCLEVBQUUsUUFBUSxDQUFDLHlDQUF5QyxFQUFFLGlCQUFpQixFQUFFLE1BQU0sdUdBQTJELEtBQUssQ0FBQztDQUMxSyxDQUFDO0FBRUYsbUNBQW1DLDhHQUFxRSxHQUFHO0lBQzFHLElBQUksRUFBRSxRQUFRO0lBQ2QsVUFBVSxFQUFFLElBQUk7SUFDaEIsMEJBQTBCLEVBQUUsUUFBUSxDQUFDLHVDQUF1QyxFQUFFLGlCQUFpQixFQUFFLE1BQU0sbUdBQXlELEtBQUssQ0FBQztDQUN0SyxDQUFDO0FBRUYsbUNBQW1DLDBGQUErRCxHQUFHO0lBQ3BHLElBQUksRUFBRSxTQUFTO0lBQ2YsVUFBVSxFQUFFLElBQUk7SUFDaEIsUUFBUSxFQUFFLEtBQUs7SUFDZiwwQkFBMEIsRUFBRSxRQUFRLENBQUMsaUNBQWlDLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSxzRkFBbUQsS0FBSyxDQUFDO0NBQzFKLENBQUMifQ==