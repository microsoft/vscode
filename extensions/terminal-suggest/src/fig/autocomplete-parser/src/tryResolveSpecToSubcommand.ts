/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { getVersionFromVersionedSpec } from '@fig/autocomplete-helpers';
import { splitPath } from "@aws/amazon-q-developer-cli-shared/utils";
import { SpecLocation } from "@aws/amazon-q-developer-cli-shared/internal";
import { SpecFileImport, getVersionFromFullFile } from "./loadHelpers.js";
import { importSpecFromLocation } from './loadSpec.js';

export const tryResolveSpecToSubcommand = async (
  spec: SpecFileImport,
  location: SpecLocation,
): Promise<Fig.Subcommand> => {
  if (typeof spec.default === "function") {
    // Handle versioned specs, either simple versioned or diff versioned.
    const cliVersion = await getVersionFromFullFile(spec, location.name);
    const subcommandOrDiffVersionInfo = await spec.default(cliVersion);

    if ("versionedSpecPath" in subcommandOrDiffVersionInfo) {
      // Handle diff versioned specs.
      const { versionedSpecPath, version } = subcommandOrDiffVersionInfo;
      const [dirname, basename] = splitPath(versionedSpecPath);
      const { specFile } = await importSpecFromLocation({
        ...location,
        name: dirname.slice(0, -1),
        diffVersionedFile: basename,
      });

      if ("versions" in specFile) {
        const result = getVersionFromVersionedSpec(
          specFile.default,
          specFile.versions,
          version,
        );
        return result.spec;
      }

      throw new Error("Invalid versioned specs file");
    }

    return subcommandOrDiffVersionInfo;
  }

  return spec.default;
};
