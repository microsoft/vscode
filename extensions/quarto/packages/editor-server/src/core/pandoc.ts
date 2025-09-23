/*
 * pandoc.ts
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

import stream from 'node:stream';
import * as child_process from "node:child_process";


export interface PandocServerOptions {
  pandocPath: string;
  resourcesDir: string;
  payloadLimitMb: number;
}

export async function runPandoc(pandoc: PandocServerOptions, args: readonly string[] | null, stdin?: string) : Promise<string> {
  return new Promise((resolve, reject) => {
    const child = child_process.execFile(pandoc.pandocPath, args, { 
      encoding: "utf-8", 
      maxBuffer: pandoc.payloadLimitMb * 1024 * 1024 }, 
      (error, stdout, stderr) => {
        if (error) {
          reject(error);
        } else if (child.exitCode !== 0) {
          reject(new Error(`Error status ${child.exitCode}: ${stderr.trim()}`));
        } else {
          resolve(stdout.trim());
        }
    });  
    if (stdin) {
      const stdinStream = new stream.Readable();
      stdinStream.push(stdin);  
      stdinStream.push(null);  
      if (child.stdin) {
        child.stdin.on('error', () => {
          // allow errors to be reported by main handler
        });
        stdinStream.pipe(child.stdin);
      } else {
        reject(new Error("Unable to access Pandoc stdin stream"));
      }
    }
  });
}




