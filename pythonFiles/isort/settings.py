"""isort/settings.py.

Defines how the default settings for isort should be loaded

(First from the default setting dictionary at the top of the file, then overridden by any settings
 in ~/.isort.cfg if there are any)

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

"""
from __future__ import absolute_import, division, print_function, unicode_literals

import fnmatch
import os
from collections import namedtuple

from .pie_slice import *

try:
    import configparser
except ImportError:
    import ConfigParser as configparser

MAX_CONFIG_SEARCH_DEPTH = 25 # The number of parent directories isort will look for a config file within
DEFAULT_SECTIONS = ("FUTURE", "STDLIB", "THIRDPARTY", "FIRSTPARTY", "LOCALFOLDER")

WrapModes = ('GRID', 'VERTICAL', 'HANGING_INDENT', 'VERTICAL_HANGING_INDENT', 'VERTICAL_GRID', 'VERTICAL_GRID_GROUPED', 'NOQA')
WrapModes = namedtuple('WrapModes', WrapModes)(*range(len(WrapModes)))

# Note that none of these lists must be complete as they are simply fallbacks for when included auto-detection fails.
default = {'force_to_top': [],
           'skip': ['__init__.py', ],
           'skip_glob': [],
           'line_length': 79,
           'wrap_length': 0,
           'sections': DEFAULT_SECTIONS,
           'known_future_library': ['__future__'],
           'known_standard_library': ["abc", "anydbm", "argparse", "array", "asynchat", "asyncore", "atexit", "base64",
                                      "BaseHTTPServer", "bisect", "bz2", "calendar", "cgitb", "cmd", "codecs",
                                      "collections", "commands", "compileall", "ConfigParser", "contextlib", "Cookie",
                                      "copy", "cPickle", "cProfile", "cStringIO", "csv", "datetime", "dbhash", "dbm",
                                      "decimal", "difflib", "dircache", "dis", "doctest", "dumbdbm", "EasyDialogs",
                                      "errno", "exceptions", "filecmp", "fileinput", "fnmatch", "fractions",
                                      "functools", "gc", "gdbm", "getopt", "getpass", "gettext", "glob", "grp", "gzip",
                                      "hashlib", "heapq", "hmac", "imaplib", "imp", "inspect", "io", "itertools", "json",
                                      "linecache", "locale", "logging", "mailbox", "math", "mhlib", "mmap",
                                      "multiprocessing", "operator", "optparse", "os", "pdb", "pickle", "pipes",
                                      "pkgutil", "platform", "plistlib", "pprint", "profile", "pstats", "pwd", "pyclbr",
                                      "pydoc", "Queue", "random", "re", "readline", "resource", "rlcompleter",
                                      "robotparser", "sched", "select", "shelve", "shlex", "shutil", "signal",
                                      "SimpleXMLRPCServer", "site", "sitecustomize", "smtpd", "smtplib", "socket",
                                      "SocketServer", "sqlite3", "string", "StringIO", "struct", "subprocess", "sys",
                                      "sysconfig", "tabnanny", "tarfile", "tempfile", "textwrap", "threading", "time",
                                      "timeit", "trace", "traceback", "unittest", "urllib", "urllib2", "urlparse",
                                      "usercustomize", "uuid", "warnings", "weakref", "webbrowser", "whichdb", "xml",
                                      "xmlrpclib", "zipfile", "zipimport", "zlib", 'builtins', '__builtin__', 'thread',
                                      "binascii", "statistics", "unicodedata", "fcntl"],
           'known_third_party': ['google.appengine.api'],
           'known_first_party': [],
           'multi_line_output': WrapModes.GRID,
           'forced_separate': [],
           'indent': ' ' * 4,
           'length_sort': False,
           'add_imports': [],
           'remove_imports': [],
           'force_single_line': False,
           'default_section': 'FIRSTPARTY',
           'import_heading_future': '',
           'import_heading_stdlib': '',
           'import_heading_thirdparty': '',
           'import_heading_firstparty': '',
           'import_heading_localfolder': '',
           'balanced_wrapping': False,
           'use_parentheses': False,
           'order_by_type': True,
           'atomic': False,
           'lines_after_imports': -1,
           'lines_between_sections': 1,
           'combine_as_imports': False,
           'combine_star': False,
           'include_trailing_comma': False,
           'from_first': False,
           'verbose': False,
           'quiet': False,
           'force_adds': False,
           'force_alphabetical_sort': False,
           'force_grid_wrap': False,
           'force_sort_within_sections': False,
           'show_diff': False}


@lru_cache()
def from_path(path):
    computed_settings = default.copy()
    _update_settings_with_config(path, '.editorconfig', '~/.editorconfig', ('*', '*.py', '**.py'), computed_settings)
    _update_settings_with_config(path, '.isort.cfg', '~/.isort.cfg', ('settings', 'isort'), computed_settings)
    _update_settings_with_config(path, 'setup.cfg', None, ('isort', ), computed_settings)
    return computed_settings


def _update_settings_with_config(path, name, default, sections, computed_settings):
    editor_config_file = default and os.path.expanduser(default)
    tries = 0
    current_directory = path
    while current_directory and tries < MAX_CONFIG_SEARCH_DEPTH:
        potential_path = os.path.join(current_directory, native_str(name))
        if os.path.exists(potential_path):
            editor_config_file = potential_path
            break

        new_directory = os.path.split(current_directory)[0]
        if current_directory == new_directory:
            break
        current_directory = new_directory
        tries += 1

    if editor_config_file and os.path.exists(editor_config_file):
        _update_with_config_file(editor_config_file, sections, computed_settings)


def _update_with_config_file(file_path, sections, computed_settings):
    settings = _get_config_data(file_path, sections).copy()
    if not settings:
        return

    if file_path.endswith(".editorconfig"):
        indent_style = settings.pop('indent_style', "").strip()
        indent_size = settings.pop('indent_size', "").strip()
        if indent_style == "space":
            computed_settings['indent'] = " " * (indent_size and int(indent_size) or 4)
        elif indent_style == "tab":
            computed_settings['indent'] = "\t" * (indent_size and int(indent_size) or 1)

        max_line_length = settings.pop('max_line_length', "").strip()
        if max_line_length:
            computed_settings['line_length'] = int(max_line_length)

    for key, value in itemsview(settings):
        access_key = key.replace('not_', '').lower()
        existing_value_type = type(default.get(access_key, ''))
        if existing_value_type in (list, tuple):
            # sections has fixed order values; no adding or substraction from any set
            if access_key == 'sections':
                computed_settings[access_key] = tuple(_as_list(value))
            else:
                existing_data = set(computed_settings.get(access_key, default.get(access_key)))
                if key.startswith('not_'):
                    computed_settings[access_key] = list(existing_data.difference(_as_list(value)))
                else:
                    computed_settings[access_key] = list(existing_data.union(_as_list(value)))
        elif existing_value_type == bool and value.lower().strip() == "false":
            computed_settings[access_key] = False
        elif key.startswith('known_'):
            computed_settings[access_key] = list(_as_list(value))
        else:
            computed_settings[access_key] = existing_value_type(value)


def _as_list(value):
    return filter(bool, [item.strip() for item in value.split(",")])


@lru_cache()
def _get_config_data(file_path, sections):
    with open(file_path, 'rU') as config_file:
        if file_path.endswith(".editorconfig"):
            line = "\n"
            last_position = config_file.tell()
            while line:
                line = config_file.readline()
                if "[" in line:
                    config_file.seek(last_position)
                    break
                last_position = config_file.tell()

        config = configparser.SafeConfigParser()
        config.readfp(config_file)
        settings = dict()
        for section in sections:
            if config.has_section(section):
                settings.update(dict(config.items(section)))

        return settings

    return {}


def should_skip(filename, config):
    """Returns True if the file should be skipped based on the passed in settings."""
    for skip_path in config['skip']:
        if skip_path.endswith(filename):
            return True

    position = os.path.split(filename)
    while position[1]:
        if position[1] in config['skip']:
            return True
        position = os.path.split(position[0])

    for glob in config['skip_glob']:
        if fnmatch.fnmatch(filename, glob):
            return True

    return False
