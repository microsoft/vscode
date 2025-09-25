/*
 * metadata.ts
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


import path from "node:path";
import fs from "node:fs";

import * as semver from "semver";

import * as yaml from "js-yaml";
import { ExecFileSyncOptions } from "child_process";
import { md5Hash } from "../../core-node/src/hash.js";
import { QuartoContext } from "./context.js";

export function projectDirForDocument(doc: string) {
  let dir = path.dirname(doc);
  for (;;) {
    if (hasQuartoProject(dir)) {
      return dir;
    } else {
      const nextDir = path.dirname(dir);
      if (nextDir !== dir) {
        dir = nextDir;
      } else {
        break;
      }
    }
  }
  return undefined;
}

export function metadataFilesForDocument(doc: string) {
  const files: string[] = [];

  let dir = path.dirname(doc);
  for (;;) {
    if (hasQuartoProject(dir)) {
      files.push(
        ...["_quarto.yml", "_quarto.yaml"]
          .map((file) => path.join(dir, file))
          .filter(fs.existsSync)
      );
      return files;
    } else {
      files.push(
        ...["_metadata.yml", "_metadata.yaml"]
          .map((file) => path.join(dir, file))
          .filter(fs.existsSync)
      );
      const nextDir = path.dirname(dir);
      if (nextDir !== dir) {
        dir = nextDir;
      } else {
        break;
      }
    }
  }
  return undefined;
}

export function hasQuartoProject(dir?: string) {
  if (dir) {
    return (
      fs.existsSync(path.join(dir, "_quarto.yml")) ||
      fs.existsSync(path.join(dir, "_quarto.yaml"))
    );
  } else {
    return false;
  }
}

// context
// cli
// quarto-core

export function yamlFromMetadataFile(file: string): Record<string, unknown> | null {
  const yamlSrc = fs.readFileSync(file, "utf-8");
  try {
    if (yamlSrc.trim().length > 0) {
      const yamlOpts = yaml.load(yamlSrc) as Record<string, unknown>;
      return yamlOpts;
    }
  } catch (err) {
    console.error(err);
  }
  return {};
}

export type QuartoProjectConfig = {
  dir: string;
  config: {
    project: {
      type: string;
      preview: {
        serve: { /* */ };
      };
    };
    format: Record<string,unknown> | string;
    [key: string]: unknown;
  };
  files: {
    input: string[];
    config: string[];
  };
};

export interface QuartoFormatInfo {
  name: string;
  format: string;
  declared?: boolean;
  version?: string;
}

export const htmlFormat: QuartoFormatInfo = { name: "HTML", format: "html" };
export const docxFormat: QuartoFormatInfo = { name: "MS Word", format: "docx" };
export const pdfFormat: QuartoFormatInfo = { name: "PDF (LaTeX)", format: "pdf" };
export const typstFormat: QuartoFormatInfo = { name: "PDF (Typst)", format: "typst", version: "1.4.388" };
export const dashboardFormat: QuartoFormatInfo = { name: "Dashboard", format: "dashboard" };
export const revealjsFormat: QuartoFormatInfo = { name: "RevealJS", format: "revealjs" };

export const standardFormats = [htmlFormat, typstFormat, pdfFormat, docxFormat];
export const knownFormats = standardFormats.concat([dashboardFormat, revealjsFormat]);

export type QuartoDocumentFormats = Record<string,QuartoFormatInfo>;

export function quartoDocumentFormats(
  context: QuartoContext,
  file: string,
  frontMatter: string,
  ensureFormats = standardFormats
) : Array<QuartoFormatInfo> | undefined {
  
   // disqualifying conditions
   if (!fs.existsSync(file)) {
    return undefined;
  }
  // lookup in cache
  if (formatsCache.has(file)) {
    // get the value
    const cache = formatsCache.get(file);

    // if its undefined that means there is no project config
    if (cache === undefined) {
      return undefined;
      // otherwise check the hash (i.e. has the project file or the config
      // files it includes changed)
    } else if (cache.hash === formatsHash(file, frontMatter)) {
      return cache.formats;
    }
  }

  // run inspect (expensive)
  const config = JSON.parse(context.runQuarto({ cwd: path.dirname(file) }, "inspect", path.basename(file))) as Record<string,unknown>;
  if (config["formats"]) {
    const formatsRaw = config["formats"] as Record<string, { identifier: { ["display-name"]: string }}>;
    const formats = Object.keys(formatsRaw).map(format => {
      const formatInfo: QuartoFormatInfo = {
        name: formatsRaw[format].identifier["display-name"],
        format,
        declared: true
      };
      return formatInfo;
    });
    formatsCache.set(file, {
      hash: formatsHash(file, frontMatter),
      formats
    });
    // add 'ensureFormats' (apply version filter)
    for (const format of ensureFormats) {
      if (!formats.find(f => f.format === format.format)) {
        if (!format.version || (context.available && semver.gte(context.version, format.version))) {
          formats.push(format);
        }
      }
    }
    //  return with name fixups
    return formats
      .map(format => {
        const knownFormat = knownFormats.find(f => f.format === format.format);
        return {
          ...format,
          name: knownFormat?.name || format.name
        };
    });
  } else {
    return undefined;
  }
}

export async function quartoProjectConfig(
  runQuarto: (options: ExecFileSyncOptions, ...args: string[]) => string,
  file: string
): Promise<QuartoProjectConfig | undefined> {
  // disqualifying conditions
  if (!fs.existsSync(file)) {
    return undefined;
  }
  // lookup in cache
  if (configCache.has(file)) {
    // get the value
    const cache = configCache.get(file);

    // if its undefined that means there is no project config
    if (cache === undefined) {
      return undefined;
      // otherwise check the hash (i.e. has the project file or the config
      // files it includes changed)
    } else if (cache.hash === configHash(cache.config)) {
      return cache.config;
    }
  }

  // try to find the config
  let config: QuartoProjectConfig | undefined;

  try {
    if (fs.statSync(file).isDirectory()) {
      config = JSON.parse(
        runQuarto({ cwd: file }, "inspect")
      ) as QuartoProjectConfig;
      // older versions of quarto don't provide the dir so fill it in if we need to
      if (!config.dir) {
        config.dir = file;
      }
    } else {
      config = JSON.parse(
        runQuarto({ cwd: path.dirname(file) }, "inspect", path.basename(file))
      ).project as QuartoProjectConfig | undefined;
      // older versions of quarto don't provide the dir so fill it in if we need to
      if (config && !config.dir) {
        const projectDir = projectDirForDocument(file);
        if (projectDir) {
          config.dir = projectDir;
        } else {
          // can't determine the project dir so we are going to say no project
          config = undefined;
        }
      }
    }
  } catch (e) {
    config = undefined;
  }

  // now store the config in the cache
  configCache.set(
    file,
    config ? { hash: configHash(config), config } : undefined
  );

  // return it
  return config;
}

// cache previously read configs (undefined means no project)
const configCache = new Map<
  string,
  { hash: string; config: QuartoProjectConfig } | undefined
>();

// include modification times of referenced config files in cache key
function configHash(config: QuartoProjectConfig) {
  return config.files.config.reduce((hash, file) => {
    return hash + fs.statSync(file).mtimeMs.toLocaleString();
  }, "");
}


// cache previously read format lists
const formatsCache = new Map<
  string,
  { hash: string, formats: Array<QuartoFormatInfo> } | undefined
>();

function formatsHash(file: string, frontMatter: string) {
  const metadataFiles = metadataFilesForDocument(file) || [];
  const filesHash = metadataFiles.reduce((hash, file) => {
    return hash + fs.statSync(file).mtimeMs.toLocaleString();
  }, "");
  return filesHash + md5Hash(frontMatter);
}