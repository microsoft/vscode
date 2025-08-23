# Copyright (c) Microsoft Corporation. All rights reserved.
# Licensed under the MIT License.

import os
import sys

# Prevent overwriting itself, since sys.argv[0] is the path to this file
if len(sys.argv) > 1:
    # Last argument is the target file into which we'll write the env variables line by line.
    output_file = sys.argv[-1]
else:
    raise ValueError("Missing output file argument")

with open(output_file, "w") as outfile:  # noqa: PTH123
    for key, val in os.environ.items():  # noqa: FURB122
        outfile.write(f"{key}={val}\n")
