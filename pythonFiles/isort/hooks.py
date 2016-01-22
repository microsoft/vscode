"""isort.py.

Defines a git hook to allow pre-commit warnings and errors about import order.

usage:
    exit_code = git_hook(strict=True)

Copyright (C) 2015  Helen Sherwood-Taylor

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

"""
import subprocess

from isort import SortImports


def get_output(command):
    """
    Run a command and return raw output

    :param str command: the command to run
    :returns: the stdout output of the command
    """
    return subprocess.check_output(command.split())


def get_lines(command):
    """
    Run a command and return lines of output

    :param str command: the command to run
    :returns: list of whitespace-stripped lines output by command
    """
    stdout = get_output(command)
    return [line.strip().decode('utf-8') for line in stdout.splitlines()]


def git_hook(strict=False):
    """
    Git pre-commit hook to check staged files for isort errors

    :param bool strict - if True, return number of errors on exit,
        causing the hook to fail. If False, return zero so it will
        just act as a warning.

    :return number of errors if in strict mode, 0 otherwise.
    """

    # Get list of files modified and staged
    diff_cmd = "git diff-index --cached --name-only --diff-filter=ACMRTUXB HEAD"
    files_modified = get_lines(diff_cmd)

    errors = 0
    for filename in files_modified:
        if filename.endswith('.py'):
            # Get the staged contents of the file
            staged_cmd = "git show :%s" % filename
            staged_contents = get_output(staged_cmd)

            sort = SortImports(
                file_path=filename,
                file_contents=staged_contents.decode(),
                check=True
            )

            if sort.incorrectly_sorted:
                errors += 1

    return errors if strict else 0
