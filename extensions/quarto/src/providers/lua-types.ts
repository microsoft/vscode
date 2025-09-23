/* eslint-disable @typescript-eslint/naming-convention */
/*
 * lua-types.ts
 *
 * Copyright (C) 2022 by Posit Software, PBC
 *
 * Unless you have received this program directly from Posit Software pursuant
 * to the terms of a commercial license agreement with Posit Software, then
 * this program is licensed to you under the terms of version 3 of the
 * GNU Affero General Public License. This program is distributed WITHOUT
 * ANY EXPRESS OR IMPLIED WARRANTY, INCLUDING THOSE OF NON-INFRINGEMENT,
 * MERCHANTABILITY OR FITNESS FOR A PARTICULAR PURPOSE. Please refer to the
 * AGPL (http://www.gnu.org/licenses/agpl-3.0.txt) for more details.
 *
 */

import * as path from "path";
import * as fs from "fs";

import {
  ExtensionContext,
  workspace,
  extensions,
  commands,
  window,
  MessageItem,
  ConfigurationTarget,
} from "vscode";

import { ensureGitignore } from "core-node";

import { QuartoContext } from "quarto-core";

import { join } from "path";
import { safeUpdateConfig } from "../core/config";

export async function activateLuaTypes(
  context: ExtensionContext,
  quartoContext: QuartoContext
) {

  // check for glob in workspace
  const workspaceHasFile = async (glob: string) => {
    const kExclude = "**/{node_modules,renv,packrat,venv,env}/**";
    return (await workspace.findFiles(glob, kExclude, 10)).length > 0;
  };

  // check pref to see if we are syncing types
  const config = workspace.getConfiguration("quarto");
  if (config.get("lua.provideTypes") === false) {
    return;
  }

  // bail if we aren't using the file scheme
  if (workspace.workspaceFolders?.[0]?.uri.scheme !== "file") {
    return;
  }

  // compute path to .luarc.json (make sure we have at least one worksapce folder)
  const luarc =
    workspace.workspaceFolders && workspace.workspaceFolders.length > 0
      ? path.join(workspace.workspaceFolders[0].uri.fsPath, ".luarc.json")
      : undefined;
  if (!luarc) {
    return;
  }

  // if we aren't prompting to install the lua extension then
  // check for it and bail if its not there
  if (!isLuaLspInstalled() && !canPromptForLuaLspInstall(context)) {
    return;
  }

  // check if we are using lua for extensoin development
  if (await workspaceHasFile("_extensions/*/*.lua")) {
    await syncLuaTypes(context, quartoContext, luarc);
  } else {
    const handler = workspace.onDidOpenTextDocument(
      async (e) => {
        if (path.extname(e.fileName) === ".lua") {
          if (workspace.asRelativePath(e.fileName) !== e.fileName) {
            await syncLuaTypes(context, quartoContext, luarc);
            handler.dispose();
          }
        }
      },
      null,
      context.subscriptions
    );
  }
}

async function syncLuaTypes(
  context: ExtensionContext,
  quartoContext: QuartoContext,
  luarc: string
) {
  // if we don't have the extension that see if we should prompt to install it
  if (!isLuaLspInstalled() && canPromptForLuaLspInstall(context)) {
    const install: MessageItem = { title: "Install Now" };
    const notNow: MessageItem = { title: "Maybe Later" };
    const neverInstall: MessageItem = { title: "Don't Ask Again" };
    const result = await window.showInformationMessage<MessageItem>(
      "Quarto can provide completion and diagnostics for Lua scripts in this workspace if the " +
      "[Lua extension](https://marketplace.visualstudio.com/items?itemName=sumneko.lua) " +
      "is installed. Do you want to install it now?",
      install,
      notNow,
      neverInstall
    );
    if (result === install) {
      await commands.executeCommand(
        "workbench.extensions.installExtension",
        "sumneko.lua"
      );
    } else {
      if (result === neverInstall) {
        preventPromptForLspInstall(context);
      }
      return;
    }
  }

  // constants
  const kGenerator = "Generator";
  const kWorkspaceLibrary = "Lua.workspace.library";
  const kRuntimePlugin = "Lua.runtime.plugin";

  // determine the path to the quarto lua types (bail if we don't have it)
  const luaTypesDir = path.join(quartoContext.resourcePath, "lua-types");
  if (!fs.existsSync(luaTypesDir) || !fs.statSync(luaTypesDir).isDirectory()) {
    return;
  }

  // if there are Lua libraries in the workspace then bail
  const luaConfig = workspace.getConfiguration("Lua");
  const inspectLibrary = luaConfig.inspect("workspace.library");
  if (inspectLibrary?.workspaceValue || inspectLibrary?.workspaceFolderValue) {
    return;
  }

  // read base luarc (provide default if there is none)
  const kDefaultLuaRc = {
    [kGenerator]: [
      "Quarto",
      "This file provides type information for Lua completion and diagnostics.",
      "Quarto will automatically update this file to reflect the current path",
      "of your Quarto installation, and the file will also be added to .gitignore",
      "since it points to the absolute path of Quarto on the local system.",
      "Remove the 'Generator' key to manage this file's contents manually.",
    ],
    "Lua.runtime.version": "Lua 5.3",
    "Lua.workspace.checkThirdParty": false,
    [kWorkspaceLibrary]: [],
    [kRuntimePlugin]: "",
    "Lua.completion.showWord": "Disable",
    "Lua.completion.keywordSnippet": "Both",
    "Lua.diagnostics.disable": ["lowercase-global", "trailing-space"],
  };
  const luarcJson = (
    fs.existsSync(luarc)
      ? JSON.parse(fs.readFileSync(luarc, { encoding: "utf-8" }))
      : kDefaultLuaRc
  ) as Record<string, unknown>;

  // if there is no generator then leave it alone
  if (luarcJson[kGenerator] === undefined) {
    return;
  }

  // see if we need to make any updates
  let rewriteLuarc = false;

  // if the current workspace library is out of sync then change it and re-write
  if (
    JSON.stringify(luarcJson[kWorkspaceLibrary]) !==
    JSON.stringify([luaTypesDir])
  ) {
    luarcJson[kWorkspaceLibrary] = [luaTypesDir];
    rewriteLuarc = true;
  }

  // if the current Lua.runtime.plugin is out of sync then change it and re-write
  const pluginPaths = [
    join(luaTypesDir, "plugin.lua"),
    join(quartoContext.resourcePath, "lua-plugin", "plugin.lua"),
  ];
  for (const pluginPath of pluginPaths) {
    if (fs.existsSync(pluginPath)) {
      if (pluginPath !== luarcJson[kRuntimePlugin]) {
        luarcJson[kRuntimePlugin] = pluginPath;
        rewriteLuarc = true;
      }
      break;
    }
  }

  // rewrite if we need to
  if (rewriteLuarc) {
    fs.writeFileSync(luarc, JSON.stringify(luarcJson, undefined, 2));
  }

  // fix issue w/ git protocol (but not if we just installed the LSP as the config
  // entries won't be there yet)
  await ensureNoGitScheme();

  // ensure gitignore
  ensureGitignore(path.dirname(luarc), ["/" + path.basename(luarc)]);
}

// git scheme doesn't have our folder level settings so all of the
// implicit pandoc globals show up as 'undefined global'. it looks
// like the Lua plugin already attempts to disable diagnostics by
// default for "git" protocol but it doesn't seem to work in current
// versions of VS Code. Here we set a more sensible default (but
// only if the user hasn't explicitly interacted with this setting)
async function ensureNoGitScheme() {
  const luaConfig = workspace.getConfiguration("Lua");
  if (luaConfig.has("workspace.supportScheme")) {
    const inspectSupportScheme = luaConfig.inspect("workspace.supportScheme");
    if (
      !inspectSupportScheme?.globalValue &&
      !inspectSupportScheme?.workspaceValue &&
      !inspectSupportScheme?.workspaceFolderValue
    ) {
      await safeUpdateConfig(async () => {
        await luaConfig.update(
          "workspace.supportScheme",
          ["file", "default"],
          ConfigurationTarget.Global
        );
      });
    }
  }
}

const kPromptForLuaLspInstall = "quarto.lua.promptLspInstall";

function isLuaLspInstalled() {
  return extensions.getExtension("sumneko.lua") !== undefined;
}

function canPromptForLuaLspInstall(context: ExtensionContext) {
  return context.workspaceState.get<boolean>(kPromptForLuaLspInstall) !== false;
}

function preventPromptForLspInstall(context: ExtensionContext) {
  context.workspaceState.update(kPromptForLuaLspInstall, false);
}
