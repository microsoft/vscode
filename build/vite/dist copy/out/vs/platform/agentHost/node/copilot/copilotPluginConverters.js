/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { spawn } from 'child_process';
import { OS } from '../../../../base/common/platform.js';
import { dirname } from '../../../../base/common/path.js';
// ---------------------------------------------------------------------------
// MCP servers
// ---------------------------------------------------------------------------
/**
 * Converts parsed MCP server definitions into the SDK's `mcpServers` config.
 */
export function toSdkMcpServers(defs) {
    const result = {};
    for (const def of defs) {
        const config = def.configuration;
        if (config.type === "stdio" /* McpServerType.LOCAL */) {
            result[def.name] = {
                type: 'local',
                command: config.command,
                args: config.args ? [...config.args] : [],
                tools: ['*'],
                ...(config.env && { env: toStringEnv(config.env) }),
                ...(config.cwd && { cwd: config.cwd }),
            };
        }
        else {
            result[def.name] = {
                type: 'http',
                url: config.url,
                tools: ['*'],
                ...(config.headers && { headers: { ...config.headers } }),
            };
        }
    }
    return result;
}
/**
 * Ensures all env values are strings (the SDK requires `Record<string, string>`).
 */
function toStringEnv(env) {
    const result = {};
    for (const [key, value] of Object.entries(env)) {
        if (value !== null) {
            result[key] = String(value);
        }
    }
    return result;
}
// ---------------------------------------------------------------------------
// Custom agents
// ---------------------------------------------------------------------------
/**
 * Converts parsed plugin agents into the SDK's `customAgents` config.
 * Reads each agent's `.md` file to use as the prompt.
 */
export async function toSdkCustomAgents(agents, fileService) {
    const configs = [];
    for (const agent of agents) {
        try {
            const content = await fileService.readFile(agent.uri);
            configs.push({
                name: agent.name,
                prompt: content.value.toString(),
            });
        }
        catch {
            // Skip agents whose file cannot be read
        }
    }
    return configs;
}
// ---------------------------------------------------------------------------
// Skill directories
// ---------------------------------------------------------------------------
/**
 * Converts parsed plugin skills into the SDK's `skillDirectories` config.
 * The SDK expects directory paths; we extract the parent directory of each SKILL.md.
 */
export function toSdkSkillDirectories(skills) {
    const seen = new Set();
    const result = [];
    for (const skill of skills) {
        // SKILL.md parent directory is the skill directory
        const dir = dirname(skill.uri.fsPath);
        if (!seen.has(dir)) {
            seen.add(dir);
            result.push(dir);
        }
    }
    return result;
}
// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------
/**
 * Resolves the effective command for the current platform from a parsed hook command.
 */
function resolveEffectiveCommand(hook, os) {
    if (os === 1 /* OperatingSystem.Windows */ && hook.windows) {
        return hook.windows;
    }
    else if (os === 2 /* OperatingSystem.Macintosh */ && hook.osx) {
        return hook.osx;
    }
    else if (os === 3 /* OperatingSystem.Linux */ && hook.linux) {
        return hook.linux;
    }
    return hook.command;
}
/**
 * Executes a hook command as a shell process. Returns the stdout on success,
 * or throws on non-zero exit code or timeout.
 */
function executeHookCommand(hook, stdin) {
    const command = resolveEffectiveCommand(hook, OS);
    if (!command) {
        return Promise.resolve('');
    }
    const timeout = (hook.timeout ?? 30) * 1000;
    const cwd = hook.cwd?.fsPath;
    return new Promise((resolve, reject) => {
        const isWindows = OS === 1 /* OperatingSystem.Windows */;
        const shell = isWindows ? 'cmd.exe' : '/bin/sh';
        const shellArgs = isWindows ? ['/c', command] : ['-c', command];
        const child = spawn(shell, shellArgs, {
            cwd,
            env: { ...process.env, ...hook.env },
            stdio: ['pipe', 'pipe', 'pipe'],
            timeout,
        });
        let stdout = '';
        let stderr = '';
        child.stdout.on('data', (data) => { stdout += data.toString(); });
        child.stderr.on('data', (data) => { stderr += data.toString(); });
        if (stdin) {
            child.stdin.write(stdin);
            child.stdin.end();
        }
        else {
            child.stdin.end();
        }
        child.on('error', reject);
        child.on('close', (code) => {
            if (code === 0) {
                resolve(stdout);
            }
            else {
                reject(new Error(`Hook command exited with code ${code}: ${stderr || stdout}`));
            }
        });
    });
}
/**
 * Mapping from canonical hook type identifiers to SDK SessionHooks handler keys.
 */
const HOOK_TYPE_TO_SDK_KEY = {
    'PreToolUse': 'onPreToolUse',
    'PostToolUse': 'onPostToolUse',
    'UserPromptSubmit': 'onUserPromptSubmitted',
    'SessionStart': 'onSessionStart',
    'SessionEnd': 'onSessionEnd',
    'ErrorOccurred': 'onErrorOccurred',
};
/**
 * Converts parsed plugin hooks into SDK {@link SessionHooks} handler functions.
 *
 * Each handler executes the hook's shell commands sequentially when invoked.
 * Hook types that don't map to SDK handler keys are silently ignored.
 *
 * The optional `editTrackingHooks` parameter provides internal edit-tracking
 * callbacks from {@link CopilotAgentSession} that are merged with plugin hooks.
 */
export function toSdkHooks(hookGroups, editTrackingHooks) {
    // Group all commands by SDK handler key
    const commandsByKey = new Map();
    for (const group of hookGroups) {
        const sdkKey = HOOK_TYPE_TO_SDK_KEY[group.type];
        if (!sdkKey) {
            continue;
        }
        const existing = commandsByKey.get(sdkKey) ?? [];
        existing.push(...group.commands);
        commandsByKey.set(sdkKey, existing);
    }
    const hooks = {};
    // Pre-tool-use handler
    const preToolCommands = commandsByKey.get('onPreToolUse');
    if (preToolCommands?.length || editTrackingHooks) {
        hooks.onPreToolUse = async (input) => {
            await editTrackingHooks?.onPreToolUse(input);
            if (preToolCommands) {
                const stdin = JSON.stringify(input);
                for (const cmd of preToolCommands) {
                    try {
                        const output = await executeHookCommand(cmd, stdin);
                        if (output.trim()) {
                            try {
                                const parsed = JSON.parse(output);
                                if (parsed && typeof parsed === 'object') {
                                    return parsed;
                                }
                            }
                            catch {
                                // Non-JSON output is fine — no modification
                            }
                        }
                    }
                    catch {
                        // Hook failures are non-fatal
                    }
                }
            }
        };
    }
    // Post-tool-use handler
    const postToolCommands = commandsByKey.get('onPostToolUse');
    if (postToolCommands?.length || editTrackingHooks) {
        hooks.onPostToolUse = async (input) => {
            await editTrackingHooks?.onPostToolUse(input);
            if (postToolCommands) {
                const stdin = JSON.stringify(input);
                for (const cmd of postToolCommands) {
                    try {
                        await executeHookCommand(cmd, stdin);
                    }
                    catch {
                        // Hook failures are non-fatal
                    }
                }
            }
        };
    }
    // User-prompt-submitted handler
    const promptCommands = commandsByKey.get('onUserPromptSubmitted');
    if (promptCommands?.length) {
        hooks.onUserPromptSubmitted = async (input) => {
            const stdin = JSON.stringify(input);
            for (const cmd of promptCommands) {
                try {
                    await executeHookCommand(cmd, stdin);
                }
                catch {
                    // Hook failures are non-fatal
                }
            }
        };
    }
    // Session-start handler
    const startCommands = commandsByKey.get('onSessionStart');
    if (startCommands?.length) {
        hooks.onSessionStart = async (input) => {
            const stdin = JSON.stringify(input);
            for (const cmd of startCommands) {
                try {
                    await executeHookCommand(cmd, stdin);
                }
                catch {
                    // Hook failures are non-fatal
                }
            }
        };
    }
    // Session-end handler
    const endCommands = commandsByKey.get('onSessionEnd');
    if (endCommands?.length) {
        hooks.onSessionEnd = async (input) => {
            const stdin = JSON.stringify(input);
            for (const cmd of endCommands) {
                try {
                    await executeHookCommand(cmd, stdin);
                }
                catch {
                    // Hook failures are non-fatal
                }
            }
        };
    }
    // Error-occurred handler
    const errorCommands = commandsByKey.get('onErrorOccurred');
    if (errorCommands?.length) {
        hooks.onErrorOccurred = async (input) => {
            const stdin = JSON.stringify(input);
            for (const cmd of errorCommands) {
                try {
                    await executeHookCommand(cmd, stdin);
                }
                catch {
                    // Hook failures are non-fatal
                }
            }
        };
    }
    return hooks;
}
/**
 * Checks whether two sets of parsed plugins produce equivalent SDK config.
 * Used to determine if a session needs to be refreshed.
 */
export function parsedPluginsEqual(a, b) {
    // Simple structural comparison via JSON serialization.
    // We serialize only the essential fields, replacing URIs with strings.
    const serialize = (plugins) => {
        return JSON.stringify(plugins.map(p => ({
            hooks: p.hooks.map(h => ({ type: h.type, commands: h.commands.map(c => ({ command: c.command, windows: c.windows, linux: c.linux, osx: c.osx, cwd: c.cwd?.toString(), env: c.env, timeout: c.timeout })) })),
            mcpServers: p.mcpServers.map(m => ({ name: m.name, configuration: m.configuration })),
            skills: p.skills.map(s => ({ uri: s.uri.toString(), name: s.name })),
            agents: p.agents.map(a => ({ uri: a.uri.toString(), name: a.name })),
        })));
    };
    return serialize(a) === serialize(b);
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY29waWxvdFBsdWdpbkNvbnZlcnRlcnMuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9wbGF0Zm9ybS9hZ2VudEhvc3Qvbm9kZS9jb3BpbG90L2NvcGlsb3RQbHVnaW5Db252ZXJ0ZXJzLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sRUFBRSxLQUFLLEVBQUUsTUFBTSxlQUFlLENBQUM7QUFFdEMsT0FBTyxFQUFtQixFQUFFLEVBQUUsTUFBTSxxQ0FBcUMsQ0FBQztBQUkxRSxPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0saUNBQWlDLENBQUM7QUFJMUQsOEVBQThFO0FBQzlFLGNBQWM7QUFDZCw4RUFBOEU7QUFFOUU7O0dBRUc7QUFDSCxNQUFNLFVBQVUsZUFBZSxDQUFDLElBQXFDO0lBQ3BFLE1BQU0sTUFBTSxHQUFvQyxFQUFFLENBQUM7SUFDbkQsS0FBSyxNQUFNLEdBQUcsSUFBSSxJQUFJLEVBQUUsQ0FBQztRQUN4QixNQUFNLE1BQU0sR0FBRyxHQUFHLENBQUMsYUFBYSxDQUFDO1FBQ2pDLElBQUksTUFBTSxDQUFDLElBQUksc0NBQXdCLEVBQUUsQ0FBQztZQUN6QyxNQUFNLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQyxHQUFHO2dCQUNsQixJQUFJLEVBQUUsT0FBTztnQkFDYixPQUFPLEVBQUUsTUFBTSxDQUFDLE9BQU87Z0JBQ3ZCLElBQUksRUFBRSxNQUFNLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDLEdBQUcsTUFBTSxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQyxFQUFFO2dCQUN6QyxLQUFLLEVBQUUsQ0FBQyxHQUFHLENBQUM7Z0JBQ1osR0FBRyxDQUFDLE1BQU0sQ0FBQyxHQUFHLElBQUksRUFBRSxHQUFHLEVBQUUsV0FBVyxDQUFDLE1BQU0sQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDO2dCQUNuRCxHQUFHLENBQUMsTUFBTSxDQUFDLEdBQUcsSUFBSSxFQUFFLEdBQUcsRUFBRSxNQUFNLENBQUMsR0FBRyxFQUFFLENBQUM7YUFDdEMsQ0FBQztRQUNILENBQUM7YUFBTSxDQUFDO1lBQ1AsTUFBTSxDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsR0FBRztnQkFDbEIsSUFBSSxFQUFFLE1BQU07Z0JBQ1osR0FBRyxFQUFFLE1BQU0sQ0FBQyxHQUFHO2dCQUNmLEtBQUssRUFBRSxDQUFDLEdBQUcsQ0FBQztnQkFDWixHQUFHLENBQUMsTUFBTSxDQUFDLE9BQU8sSUFBSSxFQUFFLE9BQU8sRUFBRSxFQUFFLEdBQUcsTUFBTSxDQUFDLE9BQU8sRUFBRSxFQUFFLENBQUM7YUFDekQsQ0FBQztRQUNILENBQUM7SUFDRixDQUFDO0lBQ0QsT0FBTyxNQUFNLENBQUM7QUFDZixDQUFDO0FBRUQ7O0dBRUc7QUFDSCxTQUFTLFdBQVcsQ0FBQyxHQUEyQztJQUMvRCxNQUFNLE1BQU0sR0FBMkIsRUFBRSxDQUFDO0lBQzFDLEtBQUssTUFBTSxDQUFDLEdBQUcsRUFBRSxLQUFLLENBQUMsSUFBSSxNQUFNLENBQUMsT0FBTyxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUM7UUFDaEQsSUFBSSxLQUFLLEtBQUssSUFBSSxFQUFFLENBQUM7WUFDcEIsTUFBTSxDQUFDLEdBQUcsQ0FBQyxHQUFHLE1BQU0sQ0FBQyxLQUFLLENBQUMsQ0FBQztRQUM3QixDQUFDO0lBQ0YsQ0FBQztJQUNELE9BQU8sTUFBTSxDQUFDO0FBQ2YsQ0FBQztBQUVELDhFQUE4RTtBQUM5RSxnQkFBZ0I7QUFDaEIsOEVBQThFO0FBRTlFOzs7R0FHRztBQUNILE1BQU0sQ0FBQyxLQUFLLFVBQVUsaUJBQWlCLENBQUMsTUFBdUMsRUFBRSxXQUF5QjtJQUN6RyxNQUFNLE9BQU8sR0FBd0IsRUFBRSxDQUFDO0lBQ3hDLEtBQUssTUFBTSxLQUFLLElBQUksTUFBTSxFQUFFLENBQUM7UUFDNUIsSUFBSSxDQUFDO1lBQ0osTUFBTSxPQUFPLEdBQUcsTUFBTSxXQUFXLENBQUMsUUFBUSxDQUFDLEtBQUssQ0FBQyxHQUFHLENBQUMsQ0FBQztZQUN0RCxPQUFPLENBQUMsSUFBSSxDQUFDO2dCQUNaLElBQUksRUFBRSxLQUFLLENBQUMsSUFBSTtnQkFDaEIsTUFBTSxFQUFFLE9BQU8sQ0FBQyxLQUFLLENBQUMsUUFBUSxFQUFFO2FBQ2hDLENBQUMsQ0FBQztRQUNKLENBQUM7UUFBQyxNQUFNLENBQUM7WUFDUix3Q0FBd0M7UUFDekMsQ0FBQztJQUNGLENBQUM7SUFDRCxPQUFPLE9BQU8sQ0FBQztBQUNoQixDQUFDO0FBRUQsOEVBQThFO0FBQzlFLG9CQUFvQjtBQUNwQiw4RUFBOEU7QUFFOUU7OztHQUdHO0FBQ0gsTUFBTSxVQUFVLHFCQUFxQixDQUFDLE1BQXVDO0lBQzVFLE1BQU0sSUFBSSxHQUFHLElBQUksR0FBRyxFQUFVLENBQUM7SUFDL0IsTUFBTSxNQUFNLEdBQWEsRUFBRSxDQUFDO0lBQzVCLEtBQUssTUFBTSxLQUFLLElBQUksTUFBTSxFQUFFLENBQUM7UUFDNUIsbURBQW1EO1FBQ25ELE1BQU0sR0FBRyxHQUFHLE9BQU8sQ0FBQyxLQUFLLENBQUMsR0FBRyxDQUFDLE1BQU0sQ0FBQyxDQUFDO1FBQ3RDLElBQUksQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUM7WUFDcEIsSUFBSSxDQUFDLEdBQUcsQ0FBQyxHQUFHLENBQUMsQ0FBQztZQUNkLE1BQU0sQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLENBQUM7UUFDbEIsQ0FBQztJQUNGLENBQUM7SUFDRCxPQUFPLE1BQU0sQ0FBQztBQUNmLENBQUM7QUFFRCw4RUFBOEU7QUFDOUUsUUFBUTtBQUNSLDhFQUE4RTtBQUU5RTs7R0FFRztBQUNILFNBQVMsdUJBQXVCLENBQUMsSUFBd0IsRUFBRSxFQUFtQjtJQUM3RSxJQUFJLEVBQUUsb0NBQTRCLElBQUksSUFBSSxDQUFDLE9BQU8sRUFBRSxDQUFDO1FBQ3BELE9BQU8sSUFBSSxDQUFDLE9BQU8sQ0FBQztJQUNyQixDQUFDO1NBQU0sSUFBSSxFQUFFLHNDQUE4QixJQUFJLElBQUksQ0FBQyxHQUFHLEVBQUUsQ0FBQztRQUN6RCxPQUFPLElBQUksQ0FBQyxHQUFHLENBQUM7SUFDakIsQ0FBQztTQUFNLElBQUksRUFBRSxrQ0FBMEIsSUFBSSxJQUFJLENBQUMsS0FBSyxFQUFFLENBQUM7UUFDdkQsT0FBTyxJQUFJLENBQUMsS0FBSyxDQUFDO0lBQ25CLENBQUM7SUFDRCxPQUFPLElBQUksQ0FBQyxPQUFPLENBQUM7QUFDckIsQ0FBQztBQUVEOzs7R0FHRztBQUNILFNBQVMsa0JBQWtCLENBQUMsSUFBd0IsRUFBRSxLQUFjO0lBQ25FLE1BQU0sT0FBTyxHQUFHLHVCQUF1QixDQUFDLElBQUksRUFBRSxFQUFFLENBQUMsQ0FBQztJQUNsRCxJQUFJLENBQUMsT0FBTyxFQUFFLENBQUM7UUFDZCxPQUFPLE9BQU8sQ0FBQyxPQUFPLENBQUMsRUFBRSxDQUFDLENBQUM7SUFDNUIsQ0FBQztJQUVELE1BQU0sT0FBTyxHQUFHLENBQUMsSUFBSSxDQUFDLE9BQU8sSUFBSSxFQUFFLENBQUMsR0FBRyxJQUFJLENBQUM7SUFDNUMsTUFBTSxHQUFHLEdBQUcsSUFBSSxDQUFDLEdBQUcsRUFBRSxNQUFNLENBQUM7SUFFN0IsT0FBTyxJQUFJLE9BQU8sQ0FBUyxDQUFDLE9BQU8sRUFBRSxNQUFNLEVBQUUsRUFBRTtRQUM5QyxNQUFNLFNBQVMsR0FBRyxFQUFFLG9DQUE0QixDQUFDO1FBQ2pELE1BQU0sS0FBSyxHQUFHLFNBQVMsQ0FBQyxDQUFDLENBQUMsU0FBUyxDQUFDLENBQUMsQ0FBQyxTQUFTLENBQUM7UUFDaEQsTUFBTSxTQUFTLEdBQUcsU0FBUyxDQUFDLENBQUMsQ0FBQyxDQUFDLElBQUksRUFBRSxPQUFPLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxJQUFJLEVBQUUsT0FBTyxDQUFDLENBQUM7UUFFaEUsTUFBTSxLQUFLLEdBQUcsS0FBSyxDQUFDLEtBQUssRUFBRSxTQUFTLEVBQUU7WUFDckMsR0FBRztZQUNILEdBQUcsRUFBRSxFQUFFLEdBQUcsT0FBTyxDQUFDLEdBQUcsRUFBRSxHQUFHLElBQUksQ0FBQyxHQUFHLEVBQUU7WUFDcEMsS0FBSyxFQUFFLENBQUMsTUFBTSxFQUFFLE1BQU0sRUFBRSxNQUFNLENBQUM7WUFDL0IsT0FBTztTQUNQLENBQUMsQ0FBQztRQUVILElBQUksTUFBTSxHQUFHLEVBQUUsQ0FBQztRQUNoQixJQUFJLE1BQU0sR0FBRyxFQUFFLENBQUM7UUFFaEIsS0FBSyxDQUFDLE1BQU0sQ0FBQyxFQUFFLENBQUMsTUFBTSxFQUFFLENBQUMsSUFBWSxFQUFFLEVBQUUsR0FBRyxNQUFNLElBQUksSUFBSSxDQUFDLFFBQVEsRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFDMUUsS0FBSyxDQUFDLE1BQU0sQ0FBQyxFQUFFLENBQUMsTUFBTSxFQUFFLENBQUMsSUFBWSxFQUFFLEVBQUUsR0FBRyxNQUFNLElBQUksSUFBSSxDQUFDLFFBQVEsRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFFMUUsSUFBSSxLQUFLLEVBQUUsQ0FBQztZQUNYLEtBQUssQ0FBQyxLQUFLLENBQUMsS0FBSyxDQUFDLEtBQUssQ0FBQyxDQUFDO1lBQ3pCLEtBQUssQ0FBQyxLQUFLLENBQUMsR0FBRyxFQUFFLENBQUM7UUFDbkIsQ0FBQzthQUFNLENBQUM7WUFDUCxLQUFLLENBQUMsS0FBSyxDQUFDLEdBQUcsRUFBRSxDQUFDO1FBQ25CLENBQUM7UUFFRCxLQUFLLENBQUMsRUFBRSxDQUFDLE9BQU8sRUFBRSxNQUFNLENBQUMsQ0FBQztRQUMxQixLQUFLLENBQUMsRUFBRSxDQUFDLE9BQU8sRUFBRSxDQUFDLElBQUksRUFBRSxFQUFFO1lBQzFCLElBQUksSUFBSSxLQUFLLENBQUMsRUFBRSxDQUFDO2dCQUNoQixPQUFPLENBQUMsTUFBTSxDQUFDLENBQUM7WUFDakIsQ0FBQztpQkFBTSxDQUFDO2dCQUNQLE1BQU0sQ0FBQyxJQUFJLEtBQUssQ0FBQyxpQ0FBaUMsSUFBSSxLQUFLLE1BQU0sSUFBSSxNQUFNLEVBQUUsQ0FBQyxDQUFDLENBQUM7WUFDakYsQ0FBQztRQUNGLENBQUMsQ0FBQyxDQUFDO0lBQ0osQ0FBQyxDQUFDLENBQUM7QUFDSixDQUFDO0FBRUQ7O0dBRUc7QUFDSCxNQUFNLG9CQUFvQixHQUF1QztJQUNoRSxZQUFZLEVBQUUsY0FBYztJQUM1QixhQUFhLEVBQUUsZUFBZTtJQUM5QixrQkFBa0IsRUFBRSx1QkFBdUI7SUFDM0MsY0FBYyxFQUFFLGdCQUFnQjtJQUNoQyxZQUFZLEVBQUUsY0FBYztJQUM1QixlQUFlLEVBQUUsaUJBQWlCO0NBQ2xDLENBQUM7QUFFRjs7Ozs7Ozs7R0FRRztBQUNILE1BQU0sVUFBVSxVQUFVLENBQ3pCLFVBQXVDLEVBQ3ZDLGlCQUdDO0lBRUQsd0NBQXdDO0lBQ3hDLE1BQU0sYUFBYSxHQUFHLElBQUksR0FBRyxFQUE0QyxDQUFDO0lBQzFFLEtBQUssTUFBTSxLQUFLLElBQUksVUFBVSxFQUFFLENBQUM7UUFDaEMsTUFBTSxNQUFNLEdBQUcsb0JBQW9CLENBQUMsS0FBSyxDQUFDLElBQUksQ0FBQyxDQUFDO1FBQ2hELElBQUksQ0FBQyxNQUFNLEVBQUUsQ0FBQztZQUNiLFNBQVM7UUFDVixDQUFDO1FBQ0QsTUFBTSxRQUFRLEdBQUcsYUFBYSxDQUFDLEdBQUcsQ0FBQyxNQUFNLENBQUMsSUFBSSxFQUFFLENBQUM7UUFDakQsUUFBUSxDQUFDLElBQUksQ0FBQyxHQUFHLEtBQUssQ0FBQyxRQUFRLENBQUMsQ0FBQztRQUNqQyxhQUFhLENBQUMsR0FBRyxDQUFDLE1BQU0sRUFBRSxRQUFRLENBQUMsQ0FBQztJQUNyQyxDQUFDO0lBRUQsTUFBTSxLQUFLLEdBQWlCLEVBQUUsQ0FBQztJQUUvQix1QkFBdUI7SUFDdkIsTUFBTSxlQUFlLEdBQUcsYUFBYSxDQUFDLEdBQUcsQ0FBQyxjQUFjLENBQUMsQ0FBQztJQUMxRCxJQUFJLGVBQWUsRUFBRSxNQUFNLElBQUksaUJBQWlCLEVBQUUsQ0FBQztRQUNsRCxLQUFLLENBQUMsWUFBWSxHQUFHLEtBQUssRUFBRSxLQUE4QyxFQUFFLEVBQUU7WUFDN0UsTUFBTSxpQkFBaUIsRUFBRSxZQUFZLENBQUMsS0FBSyxDQUFDLENBQUM7WUFDN0MsSUFBSSxlQUFlLEVBQUUsQ0FBQztnQkFDckIsTUFBTSxLQUFLLEdBQUcsSUFBSSxDQUFDLFNBQVMsQ0FBQyxLQUFLLENBQUMsQ0FBQztnQkFDcEMsS0FBSyxNQUFNLEdBQUcsSUFBSSxlQUFlLEVBQUUsQ0FBQztvQkFDbkMsSUFBSSxDQUFDO3dCQUNKLE1BQU0sTUFBTSxHQUFHLE1BQU0sa0JBQWtCLENBQUMsR0FBRyxFQUFFLEtBQUssQ0FBQyxDQUFDO3dCQUNwRCxJQUFJLE1BQU0sQ0FBQyxJQUFJLEVBQUUsRUFBRSxDQUFDOzRCQUNuQixJQUFJLENBQUM7Z0NBQ0osTUFBTSxNQUFNLEdBQUcsSUFBSSxDQUFDLEtBQUssQ0FBQyxNQUFNLENBQUMsQ0FBQztnQ0FDbEMsSUFBSSxNQUFNLElBQUksT0FBTyxNQUFNLEtBQUssUUFBUSxFQUFFLENBQUM7b0NBQzFDLE9BQU8sTUFBTSxDQUFDO2dDQUNmLENBQUM7NEJBQ0YsQ0FBQzs0QkFBQyxNQUFNLENBQUM7Z0NBQ1IsNENBQTRDOzRCQUM3QyxDQUFDO3dCQUNGLENBQUM7b0JBQ0YsQ0FBQztvQkFBQyxNQUFNLENBQUM7d0JBQ1IsOEJBQThCO29CQUMvQixDQUFDO2dCQUNGLENBQUM7WUFDRixDQUFDO1FBQ0YsQ0FBQyxDQUFDO0lBQ0gsQ0FBQztJQUVELHdCQUF3QjtJQUN4QixNQUFNLGdCQUFnQixHQUFHLGFBQWEsQ0FBQyxHQUFHLENBQUMsZUFBZSxDQUFDLENBQUM7SUFDNUQsSUFBSSxnQkFBZ0IsRUFBRSxNQUFNLElBQUksaUJBQWlCLEVBQUUsQ0FBQztRQUNuRCxLQUFLLENBQUMsYUFBYSxHQUFHLEtBQUssRUFBRSxLQUE4QyxFQUFFLEVBQUU7WUFDOUUsTUFBTSxpQkFBaUIsRUFBRSxhQUFhLENBQUMsS0FBSyxDQUFDLENBQUM7WUFDOUMsSUFBSSxnQkFBZ0IsRUFBRSxDQUFDO2dCQUN0QixNQUFNLEtBQUssR0FBRyxJQUFJLENBQUMsU0FBUyxDQUFDLEtBQUssQ0FBQyxDQUFDO2dCQUNwQyxLQUFLLE1BQU0sR0FBRyxJQUFJLGdCQUFnQixFQUFFLENBQUM7b0JBQ3BDLElBQUksQ0FBQzt3QkFDSixNQUFNLGtCQUFrQixDQUFDLEdBQUcsRUFBRSxLQUFLLENBQUMsQ0FBQztvQkFDdEMsQ0FBQztvQkFBQyxNQUFNLENBQUM7d0JBQ1IsOEJBQThCO29CQUMvQixDQUFDO2dCQUNGLENBQUM7WUFDRixDQUFDO1FBQ0YsQ0FBQyxDQUFDO0lBQ0gsQ0FBQztJQUVELGdDQUFnQztJQUNoQyxNQUFNLGNBQWMsR0FBRyxhQUFhLENBQUMsR0FBRyxDQUFDLHVCQUF1QixDQUFDLENBQUM7SUFDbEUsSUFBSSxjQUFjLEVBQUUsTUFBTSxFQUFFLENBQUM7UUFDNUIsS0FBSyxDQUFDLHFCQUFxQixHQUFHLEtBQUssRUFBRSxLQUF5QixFQUFFLEVBQUU7WUFDakUsTUFBTSxLQUFLLEdBQUcsSUFBSSxDQUFDLFNBQVMsQ0FBQyxLQUFLLENBQUMsQ0FBQztZQUNwQyxLQUFLLE1BQU0sR0FBRyxJQUFJLGNBQWMsRUFBRSxDQUFDO2dCQUNsQyxJQUFJLENBQUM7b0JBQ0osTUFBTSxrQkFBa0IsQ0FBQyxHQUFHLEVBQUUsS0FBSyxDQUFDLENBQUM7Z0JBQ3RDLENBQUM7Z0JBQUMsTUFBTSxDQUFDO29CQUNSLDhCQUE4QjtnQkFDL0IsQ0FBQztZQUNGLENBQUM7UUFDRixDQUFDLENBQUM7SUFDSCxDQUFDO0lBRUQsd0JBQXdCO0lBQ3hCLE1BQU0sYUFBYSxHQUFHLGFBQWEsQ0FBQyxHQUFHLENBQUMsZ0JBQWdCLENBQUMsQ0FBQztJQUMxRCxJQUFJLGFBQWEsRUFBRSxNQUFNLEVBQUUsQ0FBQztRQUMzQixLQUFLLENBQUMsY0FBYyxHQUFHLEtBQUssRUFBRSxLQUF5QixFQUFFLEVBQUU7WUFDMUQsTUFBTSxLQUFLLEdBQUcsSUFBSSxDQUFDLFNBQVMsQ0FBQyxLQUFLLENBQUMsQ0FBQztZQUNwQyxLQUFLLE1BQU0sR0FBRyxJQUFJLGFBQWEsRUFBRSxDQUFDO2dCQUNqQyxJQUFJLENBQUM7b0JBQ0osTUFBTSxrQkFBa0IsQ0FBQyxHQUFHLEVBQUUsS0FBSyxDQUFDLENBQUM7Z0JBQ3RDLENBQUM7Z0JBQUMsTUFBTSxDQUFDO29CQUNSLDhCQUE4QjtnQkFDL0IsQ0FBQztZQUNGLENBQUM7UUFDRixDQUFDLENBQUM7SUFDSCxDQUFDO0lBRUQsc0JBQXNCO0lBQ3RCLE1BQU0sV0FBVyxHQUFHLGFBQWEsQ0FBQyxHQUFHLENBQUMsY0FBYyxDQUFDLENBQUM7SUFDdEQsSUFBSSxXQUFXLEVBQUUsTUFBTSxFQUFFLENBQUM7UUFDekIsS0FBSyxDQUFDLFlBQVksR0FBRyxLQUFLLEVBQUUsS0FBeUIsRUFBRSxFQUFFO1lBQ3hELE1BQU0sS0FBSyxHQUFHLElBQUksQ0FBQyxTQUFTLENBQUMsS0FBSyxDQUFDLENBQUM7WUFDcEMsS0FBSyxNQUFNLEdBQUcsSUFBSSxXQUFXLEVBQUUsQ0FBQztnQkFDL0IsSUFBSSxDQUFDO29CQUNKLE1BQU0sa0JBQWtCLENBQUMsR0FBRyxFQUFFLEtBQUssQ0FBQyxDQUFDO2dCQUN0QyxDQUFDO2dCQUFDLE1BQU0sQ0FBQztvQkFDUiw4QkFBOEI7Z0JBQy9CLENBQUM7WUFDRixDQUFDO1FBQ0YsQ0FBQyxDQUFDO0lBQ0gsQ0FBQztJQUVELHlCQUF5QjtJQUN6QixNQUFNLGFBQWEsR0FBRyxhQUFhLENBQUMsR0FBRyxDQUFDLGlCQUFpQixDQUFDLENBQUM7SUFDM0QsSUFBSSxhQUFhLEVBQUUsTUFBTSxFQUFFLENBQUM7UUFDM0IsS0FBSyxDQUFDLGVBQWUsR0FBRyxLQUFLLEVBQUUsS0FBd0IsRUFBRSxFQUFFO1lBQzFELE1BQU0sS0FBSyxHQUFHLElBQUksQ0FBQyxTQUFTLENBQUMsS0FBSyxDQUFDLENBQUM7WUFDcEMsS0FBSyxNQUFNLEdBQUcsSUFBSSxhQUFhLEVBQUUsQ0FBQztnQkFDakMsSUFBSSxDQUFDO29CQUNKLE1BQU0sa0JBQWtCLENBQUMsR0FBRyxFQUFFLEtBQUssQ0FBQyxDQUFDO2dCQUN0QyxDQUFDO2dCQUFDLE1BQU0sQ0FBQztvQkFDUiw4QkFBOEI7Z0JBQy9CLENBQUM7WUFDRixDQUFDO1FBQ0YsQ0FBQyxDQUFDO0lBQ0gsQ0FBQztJQUVELE9BQU8sS0FBSyxDQUFDO0FBQ2QsQ0FBQztBQUVEOzs7R0FHRztBQUNILE1BQU0sVUFBVSxrQkFBa0IsQ0FBQyxDQUEyQixFQUFFLENBQTJCO0lBQzFGLHVEQUF1RDtJQUN2RCx1RUFBdUU7SUFDdkUsTUFBTSxTQUFTLEdBQUcsQ0FBQyxPQUFpQyxFQUFFLEVBQUU7UUFDdkQsT0FBTyxJQUFJLENBQUMsU0FBUyxDQUFDLE9BQU8sQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDO1lBQ3ZDLEtBQUssRUFBRSxDQUFDLENBQUMsS0FBSyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsRUFBRSxJQUFJLEVBQUUsQ0FBQyxDQUFDLElBQUksRUFBRSxRQUFRLEVBQUUsQ0FBQyxDQUFDLFFBQVEsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLEVBQUUsT0FBTyxFQUFFLENBQUMsQ0FBQyxPQUFPLEVBQUUsT0FBTyxFQUFFLENBQUMsQ0FBQyxPQUFPLEVBQUUsS0FBSyxFQUFFLENBQUMsQ0FBQyxLQUFLLEVBQUUsR0FBRyxFQUFFLENBQUMsQ0FBQyxHQUFHLEVBQUUsR0FBRyxFQUFFLENBQUMsQ0FBQyxHQUFHLEVBQUUsUUFBUSxFQUFFLEVBQUUsR0FBRyxFQUFFLENBQUMsQ0FBQyxHQUFHLEVBQUUsT0FBTyxFQUFFLENBQUMsQ0FBQyxPQUFPLEVBQUUsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDO1lBQzVNLFVBQVUsRUFBRSxDQUFDLENBQUMsVUFBVSxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsRUFBRSxJQUFJLEVBQUUsQ0FBQyxDQUFDLElBQUksRUFBRSxhQUFhLEVBQUUsQ0FBQyxDQUFDLGFBQWEsRUFBRSxDQUFDLENBQUM7WUFDckYsTUFBTSxFQUFFLENBQUMsQ0FBQyxNQUFNLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxFQUFFLEdBQUcsRUFBRSxDQUFDLENBQUMsR0FBRyxDQUFDLFFBQVEsRUFBRSxFQUFFLElBQUksRUFBRSxDQUFDLENBQUMsSUFBSSxFQUFFLENBQUMsQ0FBQztZQUNwRSxNQUFNLEVBQUUsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLEVBQUUsR0FBRyxFQUFFLENBQUMsQ0FBQyxHQUFHLENBQUMsUUFBUSxFQUFFLEVBQUUsSUFBSSxFQUFFLENBQUMsQ0FBQyxJQUFJLEVBQUUsQ0FBQyxDQUFDO1NBQ3BFLENBQUMsQ0FBQyxDQUFDLENBQUM7SUFDTixDQUFDLENBQUM7SUFDRixPQUFPLFNBQVMsQ0FBQyxDQUFDLENBQUMsS0FBSyxTQUFTLENBQUMsQ0FBQyxDQUFDLENBQUM7QUFDdEMsQ0FBQyJ9