# Copyright 2015 Google Inc. All Rights Reserved.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.
"""Utilities for Python2 / Python3 compatibility."""

import io
import sys

PY3 = sys.version_info[0] == 3

if PY3:
  StringIO = io.StringIO
  BytesIO = io.BytesIO

  import codecs
  open_with_encoding = codecs.open

  range = range
  ifilter = filter
  raw_input = input

  import configparser

  # Mappings from strings to booleans (such as '1' to True, 'false' to False,
  # etc.)
  CONFIGPARSER_BOOLEAN_STATES = configparser.ConfigParser.BOOLEAN_STATES
else:
  import __builtin__
  import cStringIO
  StringIO = BytesIO = cStringIO.StringIO

  open_with_encoding = io.open

  range = xrange

  from itertools import ifilter
  raw_input = raw_input

  import ConfigParser as configparser
  CONFIGPARSER_BOOLEAN_STATES = configparser.ConfigParser._boolean_states  # pylint: disable=protected-access


def EncodeAndWriteToStdout(s, encoding):
  """Encode the given string and emit to stdout.

  The string may contain non-ascii characters. This is a problem when stdout is
  redirected, because then Python doesn't know the encoding and we may get a
  UnicodeEncodeError.

  Arguments:
    s: (string) The string to encode.
    encoding: (string) The encoding of the string.
  """
  if PY3:
    sys.stdout.buffer.write(codecs.encode(s, encoding))
  else:
    sys.stdout.write(s.encode(encoding))


def unicode(s):
  """Force conversion of s to unicode."""
  if PY3:
    return s
  else:
    return __builtin__.unicode(s, 'utf-8')


# In Python 3.2+, readfp is deprecated in favor of read_file, which doesn't
# exist in Python 2 yet. To avoid deprecation warnings, subclass ConfigParser to
# fix this - now read_file works across all Python versions we care about.
class ConfigParser(configparser.ConfigParser):
  if not PY3:

    def read_file(self, fp, source=None):
      self.readfp(fp, filename=source)
