#!/usr/bin/env python
# Copyright 2017 The Chromium Authors. All rights reserved.
# Use of this source code is governed by a BSD-style license that can be
# found in the LICENSE file.

import sys

if len(sys.argv) < 3:
  print ('Usage: %s output_deps_file input1_deps_file input2_deps_file ...' %
         sys.argv[0])
  sys.exit(1)

output_filename = sys.argv[1]
input_filenames = sys.argv[2:]

requires = set()
for input_filename in input_filenames:
  for line in open(input_filename):
    # Ignore blank lines
    if not line.strip():
      continue
    # Allow comments starting with '#'
    if line.startswith('#'):
      continue
    requires.add(line)

with open(output_filename, 'w') as output_file:
  output_file.write(''.join(sorted(list(requires))))
