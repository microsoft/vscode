#! /usr/bin/env python
'''  Tool for sorting imports alphabetically, and automatically separated into sections.

Copyright (C) 2013  Timothy Edmund Crosley

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated
documentation files (the "Software"), to deal in the Software without restriction, including without limitation
the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and
to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or
substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED
TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL
THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF
CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR
OTHER DEALINGS IN THE SOFTWARE.

'''
from __future__ import absolute_import, division, print_function, unicode_literals

import argparse
import glob
import os
import sys

import setuptools

from isort import SortImports, __version__
from isort.settings import DEFAULT_SECTIONS, default, from_path, should_skip

from .pie_slice import *


INTRO = """
/#######################################################################\\

     `sMMy`
     .yyyy-                                                      `
    ##soos##                                                    ./o.
          `     ``..-..`         ``...`.``         `   ```` ``-ssso```
     .s:-y-   .+osssssso/.     ./ossss+:so+:`    :+o-`/osso:+sssssssso/
     .s::y-   osss+.``.``     -ssss+-.`-ossso`   ssssso/::..::+ssss:::.
     .s::y-   /ssss+//:-.`   `ssss+     `ssss+   sssso`       :ssss`
     .s::y-   `-/+oossssso/  `ssss/      sssso   ssss/        :ssss`
     .y-/y-       ````:ssss`  ossso.    :ssss:   ssss/        :ssss.
     `/so:`    `-//::/osss+   `+ssss+-/ossso:    /sso-        `osssso/.
       \/      `-/oooo++/-      .:/++:/++/-`      ..           `://++/.


         isort your Python imports for you so you don't have to

                            VERSION {0}

\########################################################################/
""".format(__version__)


def iter_source_code(paths, config, skipped):
    """Iterate over all Python source files defined in paths."""
    for path in paths:
        if os.path.isdir(path):
            if should_skip(path, config):
                skipped.append(path)
                continue

            for dirpath, dirnames, filenames in os.walk(path, topdown=True):
                for dirname in list(dirnames):
                    if should_skip(dirname, config):
                        skipped.append(dirname)
                        dirnames.remove(dirname)
                for filename in filenames:
                    if filename.endswith('.py'):
                        if should_skip(filename, config):
                            skipped.append(filename)
                        else:
                            yield os.path.join(dirpath, filename)
        else:
            yield path


class ISortCommand(setuptools.Command):
    """The :class:`ISortCommand` class is used by setuptools to perform
    imports checks on registered modules.
    """

    description = "Run isort on modules registered in setuptools"
    user_options = []

    def initialize_options(self):
        default_settings = default.copy()
        for (key, value) in itemsview(default_settings):
            setattr(self, key, value)

    def finalize_options(self):
        "Get options from config files."
        self.arguments = {}
        computed_settings = from_path(os.getcwd())
        for (key, value) in itemsview(computed_settings):
            self.arguments[key] = value

    def distribution_files(self):
        """Find distribution packages."""
        # This is verbatim from flake8
        if self.distribution.packages:
            package_dirs = self.distribution.package_dir or {}
            for package in self.distribution.packages:
                pkg_dir = package
                if package in package_dirs:
                    pkg_dir = package_dirs[package]
                elif '' in package_dirs:
                    pkg_dir = package_dirs[''] + os.path.sep + pkg_dir
                yield pkg_dir.replace('.', os.path.sep)

        if self.distribution.py_modules:
            for filename in self.distribution.py_modules:
                yield "%s.py" % filename
        # Don't miss the setup.py file itself
        yield "setup.py"

    def run(self):
        arguments = self.arguments
        wrong_sorted_files = False
        arguments['check'] = True
        for path in self.distribution_files():
            for python_file in glob.iglob(os.path.join(path, '*.py')):
                try:
                    incorrectly_sorted = SortImports(python_file, **arguments).incorrectly_sorted
                    if incorrectly_sorted:
                        wrong_sorted_files = True
                except IOError as e:
                    print("WARNING: Unable to parse file {0} due to {1}".format(file_name, e))
        if wrong_sorted_files:
            exit(1)


def create_parser():
    parser = argparse.ArgumentParser(description='Sort Python import definitions alphabetically '
                                                 'within logical sections.')
    parser.add_argument('files', nargs='*', help='One or more Python source files that need their imports sorted.')
    parser.add_argument('-y', '--apply', dest='apply', action='store_true',
                        help='Tells isort to apply changes recursively without asking')
    parser.add_argument('-l', '--lines', help='[Deprecated] The max length of an import line (used for wrapping '
                        'long imports).',
                        dest='line_length', type=int)
    parser.add_argument('-w', '--line-width', help='The max length of an import line (used for wrapping long imports).',
                        dest='line_length', type=int)
    parser.add_argument('-s', '--skip', help='Files that sort imports should skip over. If you want to skip multiple '
                        'files you should specify twice: --skip file1 --skip file2.', dest='skip', action='append')
    parser.add_argument('-ns', '--dont-skip', help='Files that sort imports should never skip over.',
                        dest='not_skip', action='append')
    parser.add_argument('-sg', '--skip-glob', help='Files that sort imports should skip over.', dest='skip_glob',
                        action='append')
    parser.add_argument('-t', '--top', help='Force specific imports to the top of their appropriate section.',
                        dest='force_to_top', action='append')
    parser.add_argument('-f', '--future', dest='known_future_library', action='append',
                        help='Force sortImports to recognize a module as part of the future compatibility libraries.')
    parser.add_argument('-b', '--builtin', dest='known_standard_library', action='append',
                        help='Force sortImports to recognize a module as part of the python standard library.')
    parser.add_argument('-o', '--thirdparty', dest='known_third_party', action='append',
                        help='Force sortImports to recognize a module as being part of a third party library.')
    parser.add_argument('-p', '--project', dest='known_first_party', action='append',
                        help='Force sortImports to recognize a module as being part of the current python project.')
    parser.add_argument('-m', '--multi_line', dest='multi_line_output', type=int, choices=[0, 1, 2, 3, 4, 5],
                        help='Multi line output (0-grid, 1-vertical, 2-hanging, 3-vert-hanging, 4-vert-grid, '
                        '5-vert-grid-grouped).')
    parser.add_argument('-i', '--indent', help='String to place for indents defaults to "    " (4 spaces).',
                        dest='indent', type=str)
    parser.add_argument('-a', '--add_import', dest='add_imports', action='append',
                        help='Adds the specified import line to all files, '
                             'automatically determining correct placement.')
    parser.add_argument('-af', '--force_adds', dest='force_adds', action='store_true',
                        help='Forces import adds even if the original file is empty.')
    parser.add_argument('-r', '--remove_import', dest='remove_imports', action='append',
                        help='Removes the specified import from all files.')
    parser.add_argument('-ls', '--length_sort', help='Sort imports by their string length.',
                        dest='length_sort', action='store_true', default=False)
    parser.add_argument('-d', '--stdout', help='Force resulting output to stdout, instead of in-place.',
                        dest='write_to_stdout', action='store_true')
    parser.add_argument('-c', '--check-only', action='store_true', default=False, dest="check",
                        help='Checks the file for unsorted / unformatted imports and prints them to the '
                             'command line without modifying the file.')
    parser.add_argument('-sl', '--force-single-line-imports', dest='force_single_line', action='store_true',
                        help='Forces all from imports to appear on their own line')
    parser.add_argument('--force_single_line_imports', dest='force_single_line', action='store_true',
                        help=argparse.SUPPRESS)
    parser.add_argument('-sd', '--section-default', dest='default_section',
                        help='Sets the default section for imports (by default FIRSTPARTY) options: ' +
                        str(DEFAULT_SECTIONS))
    parser.add_argument('-df', '--diff', dest='show_diff', default=False, action='store_true',
                        help="Prints a diff of all the changes isort would make to a file, instead of "
                             "changing it in place")
    parser.add_argument('-e', '--balanced', dest='balanced_wrapping', action='store_true',
                        help='Balances wrapping to produce the most consistent line length possible')
    parser.add_argument('-rc', '--recursive', dest='recursive', action='store_true',
                        help='Recursively look for Python files of which to sort imports')
    parser.add_argument('-ot', '--order-by-type', dest='order_by_type',
                        action='store_true', help='Order imports by type in addition to alphabetically')
    parser.add_argument('-ac', '--atomic', dest='atomic', action='store_true',
                        help="Ensures the output doesn't save if the resulting file contains syntax errors.")
    parser.add_argument('-cs', '--combine-star', dest='combine_star', action='store_true',
                        help="Ensures that if a star import is present, nothing else is imported from that namespace.")
    parser.add_argument('-ca', '--combine-as', dest='combine_as_imports', action='store_true',
                        help="Combines as imports on the same line.")
    parser.add_argument('-tc', '--trailing-comma', dest='include_trailing_comma', action='store_true',
                        help='Includes a trailing comma on multi line imports that include parentheses.')
    parser.add_argument('-v', '--version', action='store_true', dest='show_version')
    parser.add_argument('-vb', '--verbose', action='store_true', dest="verbose",
                        help='Shows verbose output, such as when files are skipped or when a check is successful.')
    parser.add_argument('-q', '--quiet', action='store_true', dest="quiet",
                        help='Shows extra quiet output, only errors are outputted.')
    parser.add_argument('-sp', '--settings-path',  dest="settings_path",
                        help='Explicitly set the settings path instead of auto determining based on file location.')
    parser.add_argument('-ff', '--from-first', dest='from_first',
                        help="Switches the typical ordering preference, showing from imports first then straight ones.")
    parser.add_argument('-wl', '--wrap-length', dest='wrap_length',
                        help="Specifies how long lines that are wrapped should be, if not set line_length is used.")
    parser.add_argument('-fgw', '--force-grid-wrap',  action='store_true', dest="force_grid_wrap",
                        help='Force from imports to be grid wrapped regardless of line length')
    parser.add_argument('-fas', '--force-alphabetical-sort',  action='store_true', dest="force_alphabetical_sort",
                        help='Force all imports to be sorted as a single section')
    parser.add_argument('-fss', '--force-sort-within-sections',  action='store_true', dest="force_sort_within_sections",
                        help='Force imports to be sorted by module, independant of import_type')


    arguments = dict((key, value) for (key, value) in itemsview(vars(parser.parse_args())) if value)
    return arguments


def main():
    arguments = create_parser()
    if arguments.get('show_version'):
        print(INTRO)
        return

    file_names = arguments.pop('files', [])
    if file_names == ['-']:
        SortImports(file_contents=sys.stdin.read(), write_to_stdout=True, **arguments)
    else:
        if not file_names:
            file_names = ['.']
            arguments['recursive'] = True
            if not arguments.get('apply', False):
                arguments['ask_to_apply'] = True
        config = from_path(os.path.abspath(file_names[0]) or os.getcwd()).copy()
        config.update(arguments)
        wrong_sorted_files = False
        skipped = []
        if arguments.get('recursive', False):
            file_names = iter_source_code(file_names, config, skipped)
        num_skipped = 0
        if config.get('verbose', False) or config.get('show_logo', False):
            print(INTRO)
        for file_name in file_names:
            try:
                sort_attempt = SortImports(file_name, **arguments)
                incorrectly_sorted = sort_attempt.incorrectly_sorted
                if arguments.get('check', False) and incorrectly_sorted:
                    wrong_sorted_files = True
                if sort_attempt.skipped:
                    num_skipped += 1
            except IOError as e:
                print("WARNING: Unable to parse file {0} due to {1}".format(file_name, e))
        if wrong_sorted_files:
            exit(1)

        num_skipped += len(skipped)
        if num_skipped and not arguments.get('quiet', False):
            if config['verbose']:
                for was_skipped in skipped:
                    print("WARNING: {0} was skipped as it's listed in 'skip' setting"
                        " or matches a glob in 'skip_glob' setting".format(was_skipped))
            print("Skipped {0} files".format(num_skipped))


if __name__ == "__main__":
    main()
