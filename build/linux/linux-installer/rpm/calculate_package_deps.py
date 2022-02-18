#!/usr/bin/env python
# Copyright 2017 The Chromium Authors. All rights reserved.
# Use of this source code is governed by a BSD-style license that can be
# found in the LICENSE file.

"""Given a binary, uses find-requires to check that its package dependencies
are satisfiable on all supported rpm-based distros.
"""

from __future__ import print_function

import argparse
import json
import os
import subprocess
import sys

parser = argparse.ArgumentParser()
parser.add_argument('binary')
parser.add_argument('dep_filename')
parser.add_argument('shlibs', nargs='*')
parser.add_argument('--distro-check', action='store_true')
args = parser.parse_args()

binary = os.path.abspath(args.binary)
dep_filename = args.dep_filename
bundled_shlibs = [os.path.basename(file) for file in args.shlibs]
distro_check = args.distro_check

if os.stat(binary).st_mode & 0o111 == 0:
  print(('/usr/lib/rpm/elfdeps requires that binaries have an executable ' +
         'bit set, but binary "%s" does not.') % os.path.basename(binary))
  sys.exit(1)

proc = subprocess.Popen(['/usr/lib/rpm/find-requires'], stdin=subprocess.PIPE,
                        stdout=subprocess.PIPE, stderr=subprocess.PIPE)
(stdout, stderr) = proc.communicate((binary + '\n').encode('utf8'))
exit_code = proc.wait()
if exit_code != 0:
  print('find-requires failed with exit code ' + str(exit_code))
  print('stderr was ' + stderr)
  sys.exit(1)

stdout = stdout.decode('utf8')
requires = set([] if stdout == '' else stdout.rstrip('\n').split('\n'))

script_dir = os.path.dirname(os.path.abspath(__file__))
provides_file = open(os.path.join(script_dir, 'dist_package_provides.json'))
distro_package_provides = json.load(provides_file)

remove_requires = set()
ret_code = 0
if distro_check:
  for distro in distro_package_provides:
    for requirement in requires:
      if any([requirement.startswith(shlib) for shlib in bundled_shlibs]):
        remove_requires.add(requirement)
        continue
      if requirement not in distro_package_provides[distro]:
        print(
            'Unexpected new dependency %s on distro %s caused by binary %s' % (
                requirement, distro, os.path.basename(binary)),
            file=sys.stderr)
        ret_code = 1
        continue
if ret_code == 0:
  requires = requires.difference(remove_requires)
  with open(dep_filename, 'w') as dep_file:
    for requirement in sorted(list(requires)):
      dep_file.write(requirement + '\n')
sys.exit(ret_code)
