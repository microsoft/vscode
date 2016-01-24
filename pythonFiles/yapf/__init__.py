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
"""YAPF.

YAPF uses the algorithm in clang-format to figure out the "best" formatting for
Python code. It looks at the program as a series of "unwrappable lines" ---
i.e., lines which, if there were no column limit, we would place all tokens on
that line. It then uses a priority queue to figure out what the best formatting
is --- i.e., the formatting with the least penalty.

It differs from tools like autopep8 and pep8ify in that it doesn't just look for
violations of the style guide, but looks at the module as a whole, making
formatting decisions based on what's the best format for each line.

If no filenames are specified, YAPF reads the code from stdin.
"""
from __future__ import print_function

import argparse
import logging
import os
import sys

from yapf.yapflib import errors
from yapf.yapflib import file_resources
from yapf.yapflib import py3compat
from yapf.yapflib import style
from yapf.yapflib import yapf_api

__version__ = '0.6.2'


def main(argv):
  """Main program.

  Arguments:
    argv: command-line arguments, such as sys.argv (including the program name
      in argv[0]).

  Returns:
    0 if there were no changes, non-zero otherwise.

  Raises:
    YapfError: if none of the supplied files were Python files.
  """
  parser = argparse.ArgumentParser(description='Formatter for Python code.')
  parser.add_argument('-v',
                      '--version',
                      action='store_true',
                      help='show version number and exit')

  diff_inplace_group = parser.add_mutually_exclusive_group()
  diff_inplace_group.add_argument('-d',
                                  '--diff',
                                  action='store_true',
                                  help='print the diff for the fixed source')
  diff_inplace_group.add_argument('-i',
                                  '--in-place',
                                  action='store_true',
                                  help='make changes to files in place')

  lines_recursive_group = parser.add_mutually_exclusive_group()
  lines_recursive_group.add_argument('-r',
                                     '--recursive',
                                     action='store_true',
                                     help='run recursively over directories')
  lines_recursive_group.add_argument(
      '-l',
      '--lines',
      metavar='START-END',
      action='append',
      default=None,
      help='range of lines to reformat, one-based')

  parser.add_argument('-e',
                      '--exclude',
                      metavar='PATTERN',
                      action='append',
                      default=None,
                      help='patterns for files to exclude from formatting')
  parser.add_argument(
      '--style',
      action='store',
      help=('specify formatting style: either a style name (for example "pep8" '
            'or "google"), or the name of a file with style settings. The '
            'default is pep8 unless a %s or %s file located in one of the '
            'parent directories of the source file (or current directory for '
            'stdin)' % (style.LOCAL_STYLE, style.SETUP_CONFIG)))
  parser.add_argument('--style-help',
                      action='store_true',
                      help='show style settings and exit')
  parser.add_argument('--no-local-style',
                      action='store_true',
                      help="don't search for local style definition")
  parser.add_argument('--verify',
                      action='store_true',
                      help='try to verify reformatted code for syntax errors')

  parser.add_argument('files', nargs='*')
  args = parser.parse_args(argv[1:])

  if args.version:
    print('yapf {}'.format(__version__))
    return 0

  if args.style_help:
    style.SetGlobalStyle(style.CreateStyleFromConfig(args.style))
    for option, docstring in sorted(style.Help().items()):
      print(option, '=', style.Get(option), sep='')
      for line in docstring.splitlines():
        print('  ', line)
      print()
    return 0

  if args.lines and len(args.files) > 1:
    parser.error('cannot use -l/--lines with more than one file')

  lines = _GetLines(args.lines) if args.lines is not None else None
  if not args.files:
    # No arguments specified. Read code from stdin.
    if args.in_place or args.diff:
      parser.error('cannot use --in-place or --diff flags when reading '
                   'from stdin')

    original_source = []
    while True:
      try:
        # Use 'raw_input' instead of 'sys.stdin.read', because otherwise the
        # user will need to hit 'Ctrl-D' more than once if they're inputting
        # the program by hand. 'raw_input' throws an EOFError exception if
        # 'Ctrl-D' is pressed, which makes it easy to bail out of this loop.
        original_source.append(py3compat.raw_input())
      except EOFError:
        break
    style_config = args.style
    if style_config is None and not args.no_local_style:
      style_config = file_resources.GetDefaultStyleForDir(os.getcwd())
    reformatted_source, changed = yapf_api.FormatCode(
        py3compat.unicode('\n'.join(original_source) + '\n'),
        filename='<stdin>',
        style_config=style_config,
        lines=lines,
        verify=args.verify)
    sys.stdout.write(reformatted_source)
    return 2 if changed else 0

  files = file_resources.GetCommandLineFiles(args.files, args.recursive,
                                             args.exclude)
  if not files:
    raise errors.YapfError('Input filenames did not match any python files')
  changed = FormatFiles(files,
                        lines,
                        style_config=args.style,
                        no_local_style=args.no_local_style,
                        in_place=args.in_place,
                        print_diff=args.diff,
                        verify=args.verify)
  return 2 if changed else 0


def FormatFiles(filenames,
                lines,
                style_config=None,
                no_local_style=False,
                in_place=False,
                print_diff=False,
                verify=True):
  """Format a list of files.

  Arguments:
    filenames: (list of unicode) A list of files to reformat.
    lines: (list of tuples of integers) A list of tuples of lines, [start, end],
      that we want to format. The lines are 1-based indexed. This argument
      overrides the 'args.lines'. It can be used by third-party code (e.g.,
      IDEs) when reformatting a snippet of code.
    style_config: (string) Style name or file path.
    no_local_style: (string) If style_config is None don't search for
      directory-local style configuration.
    in_place: (bool) Modify the files in place.
    print_diff: (bool) Instead of returning the reformatted source, return a
      diff that turns the formatted source into reformatter source.
    verify: (bool) True if reformatted code should be verified for syntax.

  Returns:
    True if the source code changed in any of the files being formatted.
  """
  changed = False
  for filename in filenames:
    logging.info('Reformatting %s', filename)
    if style_config is None and not no_local_style:
      style_config = (
          file_resources.GetDefaultStyleForDir(os.path.dirname(filename)))
    try:
      reformatted_code, encoding, has_change = yapf_api.FormatFile(
          filename,
          in_place=in_place,
          style_config=style_config,
          lines=lines,
          print_diff=print_diff,
          verify=verify,
          logger=logging.warning)
      changed |= has_change
    except SyntaxError as e:
      e.filename = filename
      raise
    if reformatted_code is not None:
      file_resources.WriteReformattedCode(filename, reformatted_code, in_place,
                                          encoding)
  return changed


def _GetLines(line_strings):
  """Parses the start and end lines from a line string like 'start-end'.

  Arguments:
    line_strings: (array of string) A list of strings representing a line
      range like 'start-end'.

  Returns:
    A list of tuples of the start and end line numbers.

  Raises:
    ValueError: If the line string failed to parse or was an invalid line range.
  """
  lines = []
  for line_string in line_strings:
    # The 'list' here is needed by Python 3.
    line = list(map(int, line_string.split('-', 1)))
    if line[0] < 1:
      raise errors.YapfError('invalid start of line range: %r' % line)
    if line[0] > line[1]:
      raise errors.YapfError('end comes before start in line range: %r', line)
    lines.append(tuple(line))
  return lines


def run_main():  # pylint: disable=invalid-name
  try:
    sys.exit(main(sys.argv))
  except errors.YapfError as e:
    sys.stderr.write('yapf: ' + str(e) + '\n')
    sys.exit(1)


if __name__ == '__main__':
  run_main()
