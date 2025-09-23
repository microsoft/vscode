/*
 * platform.ts
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

import * as child_process from "child_process";

export function isWindows() {
  return process.platform === "win32";
}

export function isRStudioWorkbench() {
  // RS_SERVER_URL e.g. https://daily-rsw.soleng.rstudioservices.com/
  // RS_SESSION_URL e.g. /s/eae053c9ab5a71168ee19/
  return process.env.RS_SERVER_URL && process.env.RS_SESSION_URL;
}


export function gitHubCodespaceName() {
  return process.env.CODESPACE_NAME;
}

export function gitHubCodespacePortForwardingDomain() {
  return process.env.GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN;
}

export function isGitHubCodespaces() {
  return !!gitHubCodespacePortForwardingDomain() && !!gitHubCodespaceName();
}

export function gitHubCodeSpacesProxyUri() {
  const CODESPACE_NAME = gitHubCodespaceName();
  const GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN =
    gitHubCodespacePortForwardingDomain();
  if (CODESPACE_NAME && GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN) {
    return `https://${CODESPACE_NAME}-{{port}}.${GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN}`;
  } else {
    return undefined;
  }
}

export function isVSCodeServer() {
  return !!vsCodeServerProxyUri();
}

export function vsCodeServerProxyUri() {
  return process.env.VSCODE_PROXY_URI;
}

export function vsCodeWebUrl(serverUrl: string) {
  // transform if this is a localhost url
  const url = new URL(serverUrl);
  if (url.hostname === "localhost" || url.hostname === "127.0.0.1") {
    const port = url.port;
    if (isRStudioWorkbench()) {
      return rswURL(port);
    } else if (isVSCodeServer()) {
      return vsCodeServerProxyUri()!.replace("{{port}}", `${port}`);
    }
  }
  // default to reflecting back serverUrl
  return serverUrl;

}

export function rswURL(port: string) {
  const server = process.env.RS_SERVER_URL!;
  const session = process.env.RS_SESSION_URL!;
  const portToken = rswPortToken(port);
  const url = `${server}${session.slice(1)}p/${portToken}/`;
  return url;
}

function rswPortToken(port: string) {
  try {
    const result = child_process.execFileSync(
      "/usr/lib/rstudio-server/bin/rserver-url",
      [port],
      {
        encoding: "utf-8",
      }
    ) as unknown as string;
    return result;
  } catch (e) {
    throw new Error(`Failed to map RSW port token`);
  }
}
