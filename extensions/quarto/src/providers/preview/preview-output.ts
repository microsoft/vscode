/*
 * preview-output.ts
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

import * as tmp from "tmp";
import * as path from "path";
import * as fs from "fs";

export class PreviewOutputSink {
  constructor(
    readonly handler_: (output: string) => Promise<void>,
    readonly tick_: () => Promise<void>
  ) {
    // allocate a directory for preview output
    tmp.setGracefulCleanup();
    const previewDir = tmp.dirSync({ prefix: "quarto-preview" });
    this.outputFile_ = path.join(previewDir.name, "preview.log");

    // watch for changes
    setInterval(async () => {
      const lastModified = fs.existsSync(this.outputFile_)
        ? fs.statSync(this.outputFile_).mtimeMs
        : 0;
      if (lastModified > this.lastModified_) {
        this.lastModified_ = lastModified;
        await this.readOutput();
      }
      await this.tick_();
    }, 200);
  }

  public dispose() {
    this.reset();
  }

  public outputFile() {
    return this.outputFile_;
  }

  public reset() {
    try {
      if (this.outputFd_ !== -1) {
        fs.closeSync(this.outputFd_);
        this.outputFd_ = -1;
      }
      if (fs.existsSync(this.outputFile_)) {
        fs.unlinkSync(this.outputFile_);
      }
    } catch (e) {
    } finally {
      this.lastModified_ = 0;
    }
  }

  private async readOutput() {
    // open file on demand
    if (this.outputFd_ === -1) {
      try {
        this.outputFd_ = fs.openSync(this.outputFile_, "r");
      } catch (error) {
        console.log("error opening preview output file");
        console.error(error);
        return;
      }
    }
    const kBufferSize = 2048;
    const buffer = new Buffer(kBufferSize);
    const readBuffer = () => {
      return fs.readSync(this.outputFd_, buffer, 0, kBufferSize, null);
    };
    let bytesRead = readBuffer();
    while (bytesRead > 0) {
      await this.handler_(buffer.toString("utf8", 0, bytesRead));
      bytesRead = readBuffer();
    }
  }

  private lastModified_ = 0;
  private outputFd_ = -1;
  private readonly outputFile_: string;
}
