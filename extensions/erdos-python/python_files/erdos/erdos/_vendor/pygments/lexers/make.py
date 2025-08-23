"""
    pygments.lexers.make
    ~~~~~~~~~~~~~~~~~~~~

    Lexers for Makefiles and similar.

    :copyright: Copyright 2006-2025 by the Pygments team, see AUTHORS.
    :license: BSD, see LICENSE for details.
"""

import re

from erdos.erdos._vendor.pygments.lexer import Lexer, RegexLexer, include, bygroups, \
    do_insertions, using
from erdos.erdos._vendor.pygments.token import Text, Comment, Operator, Keyword, Name, String, \
    Punctuation, Whitespace
from erdos.erdos._vendor.pygments.lexers.shell import BashLexer

__all__ = ['MakefileLexer', 'BaseMakefileLexer', 'CMakeLexer']


class MakefileLexer(Lexer):
    """
    Lexer for BSD and GNU make extensions (lenient enough to handle both in
    the same file even).

    *Rewritten in Pygments 0.10.*
    """

    name = 'Makefile'
    aliases = ['make', 'makefile', 'mf', 'bsdmake']
    filenames = ['*.mak', '*.mk', 'Makefile', 'makefile', 'Makefile.*', 'GNUmakefile']
    mimetypes = ['text/x-makefile']
    url = 'https://en.wikipedia.org/wiki/Make_(software)'
    version_added = ''

    r_special = re.compile(
        r'^(?:'
        # BSD Make
        r'\.\s*(include|undef|error|warning|if|else|elif|endif|for|endfor)|'
        # GNU Make
        r'\s*(ifeq|ifneq|ifdef|ifndef|else|endif|-?include|define|endef|:|vpath)|'
        # GNU Automake
        r'\s*(if|else|endif))(?=\s)')
    r_comment = re.compile(r'^\s*@?#')

    def get_tokens_unprocessed(self, text):
        ins = []
        lines = text.splitlines(keepends=True)
        done = ''
        lex = BaseMakefileLexer(**self.options)
        backslashflag = False
        for line in lines:
            if self.r_special.match(line) or backslashflag:
                ins.append((len(done), [(0, Comment.Preproc, line)]))
                backslashflag = line.strip().endswith('\\')
            elif self.r_comment.match(line):
                ins.append((len(done), [(0, Comment, line)]))
            else:
                done += line
        yield from do_insertions(ins, lex.get_tokens_unprocessed(done))

    def analyse_text(text):
        # Many makefiles have $(BIG_CAPS) style variables
        if re.search(r'\$\([A-Z_]+\)', text):
            return 0.1


class BaseMakefileLexer(RegexLexer):
    """
    Lexer for simple Makefiles (no preprocessing).
    """

    name = 'Base Makefile'
    aliases = ['basemake']
    filenames = []
    mimetypes = []
    url = 'https://en.wikipedia.org/wiki/Make_(software)'
    version_added = '0.10'

    tokens = {
        'root': [
            # recipes (need to allow spaces because of expandtabs)
            (r'^(?:[\t ]+.*\n|\n)+', using(BashLexer)),
            # special variables
            (r'\$[<@$+%?|*]', Keyword),
            (r'\s+', Whitespace),
            (r'#.*?\n', Comment),
            (r'((?:un)?export)(\s+)(?=[\w${}\t -]+\n)',
             bygroups(Keyword, Whitespace), 'export'),
            (r'(?:un)?export\s+', Keyword),
            # assignment
            (r'([\w${}().-]+)(\s*)([!?:+]?=)([ \t]*)((?:.*\\\n)+|.*\n)',
             bygroups(
                Name.Variable, Whitespace, Operator, Whitespace,
                using(BashLexer))),
            # strings
            (r'"(\\\\|\\[^\\]|[^"\\])*"', String.Double),
            (r"'(\\\\|\\[^\\]|[^'\\])*'", String.Single),
            # targets
            (r'([^\n:]+)(:+)([ \t]*)', bygroups(
                Name.Function, Operator, Whitespace),
             'block-header'),
            # expansions
            (r'\$\(', Keyword, 'expansion'),
        ],
        'expansion': [
            (r'[^\w$().-]+', Text),
            (r'[\w.-]+', Name.Variable),
            (r'\$', Keyword),
            (r'\(', Keyword, '#push'),
            (r'\)', Keyword, '#pop'),
        ],
        'export': [
            (r'[\w${}-]+', Name.Variable),
            (r'\n', Text, '#pop'),
            (r'\s+', Whitespace),
        ],
        'block-header': [
            (r'[,|]', Punctuation),
            (r'#.*?\n', Comment, '#pop'),
            (r'\\\n', Text),  # line continuation
            (r'\$\(', Keyword, 'expansion'),
            (r'[a-zA-Z_]+', Name),
            (r'\n', Whitespace, '#pop'),
            (r'.', Text),
        ],
    }


class CMakeLexer(RegexLexer):
    """
    Lexer for CMake files.
    """
    name = 'CMake'
    url = 'https://cmake.org/documentation/'
    aliases = ['cmake']
    filenames = ['*.cmake', 'CMakeLists.txt']
    mimetypes = ['text/x-cmake']
    version_added = '1.2'

    tokens = {
        'root': [
            # (r'(ADD_CUSTOM_COMMAND|ADD_CUSTOM_TARGET|ADD_DEFINITIONS|'
            # r'ADD_DEPENDENCIES|ADD_EXECUTABLE|ADD_LIBRARY|ADD_SUBDIRECTORY|'
            # r'ADD_TEST|AUX_SOURCE_DIRECTORY|BUILD_COMMAND|BUILD_NAME|'
            # r'CMAKE_MINIMUM_REQUIRED|CONFIGURE_FILE|CREATE_TEST_SOURCELIST|'
            # r'ELSE|ELSEIF|ENABLE_LANGUAGE|ENABLE_TESTING|ENDFOREACH|'
            # r'ENDFUNCTION|ENDIF|ENDMACRO|ENDWHILE|EXEC_PROGRAM|'
            # r'EXECUTE_PROCESS|EXPORT_LIBRARY_DEPENDENCIES|FILE|FIND_FILE|'
            # r'FIND_LIBRARY|FIND_PACKAGE|FIND_PATH|FIND_PROGRAM|FLTK_WRAP_UI|'
            # r'FOREACH|FUNCTION|GET_CMAKE_PROPERTY|GET_DIRECTORY_PROPERTY|'
            # r'GET_FILENAME_COMPONENT|GET_SOURCE_FILE_PROPERTY|'
            # r'GET_TARGET_PROPERTY|GET_TEST_PROPERTY|IF|INCLUDE|'
            # r'INCLUDE_DIRECTORIES|INCLUDE_EXTERNAL_MSPROJECT|'
            # r'INCLUDE_REGULAR_EXPRESSION|INSTALL|INSTALL_FILES|'
            # r'INSTALL_PROGRAMS|INSTALL_TARGETS|LINK_DIRECTORIES|'
            # r'LINK_LIBRARIES|LIST|LOAD_CACHE|LOAD_COMMAND|MACRO|'
            # r'MAKE_DIRECTORY|MARK_AS_ADVANCED|MATH|MESSAGE|OPTION|'
            # r'OUTPUT_REQUIRED_FILES|PROJECT|QT_WRAP_CPP|QT_WRAP_UI|REMOVE|'
            # r'REMOVE_DEFINITIONS|SEPARATE_ARGUMENTS|SET|'
            # r'SET_DIRECTORY_PROPERTIES|SET_SOURCE_FILES_PROPERTIES|'
            # r'SET_TARGET_PROPERTIES|SET_TESTS_PROPERTIES|SITE_NAME|'
            # r'SOURCE_GROUP|STRING|SUBDIR_DEPENDS|SUBDIRS|'
            # r'TARGET_LINK_LIBRARIES|TRY_COMPILE|TRY_RUN|UNSET|'
            # r'USE_MANGLED_MESA|UTILITY_SOURCE|VARIABLE_REQUIRES|'
            # r'VTK_MAKE_INSTANTIATOR|VTK_WRAP_JAVA|VTK_WRAP_PYTHON|'
            # r'VTK_WRAP_TCL|WHILE|WRITE_FILE|'
            # r'COUNTARGS)\b', Name.Builtin, 'args'),
            (r'\b(\w+)([ \t]*)(\()', bygroups(Name.Builtin, Whitespace,
                                              Punctuation), 'args'),
            include('keywords'),
            include('ws')
        ],
        'args': [
            (r'\(', Punctuation, '#push'),
            (r'\)', Punctuation, '#pop'),
            (r'(\$\{)(.+?)(\})', bygroups(Operator, Name.Variable, Operator)),
            (r'(\$ENV\{)(.+?)(\})', bygroups(Operator, Name.Variable, Operator)),
            (r'(\$<)(.+?)(>)', bygroups(Operator, Name.Variable, Operator)),
            (r'(?s)".*?"', String.Double),
            (r'\\\S+', String),
            (r'\[(?P<level>=*)\[[\w\W]*?\](?P=level)\]', String.Multiline),
            (r'[^)$"# \t\n]+', String),
            (r'\n', Whitespace),  # explicitly legal
            include('keywords'),
            include('ws')
        ],
        'string': [

        ],
        'keywords': [
            (r'\b(WIN32|UNIX|APPLE|CYGWIN|BORLAND|MINGW|MSVC|MSVC_IDE|MSVC60|'
             r'MSVC70|MSVC71|MSVC80|MSVC90)\b', Keyword),
        ],
        'ws': [
            (r'[ \t]+', Whitespace),
            (r'#\[(?P<level>=*)\[[\w\W]*?\](?P=level)\]', Comment),
            (r'#.*\n', Comment),
        ]
    }

    def analyse_text(text):
        exp = (
            r'^[ \t]*CMAKE_MINIMUM_REQUIRED[ \t]*'
            r'\([ \t]*VERSION[ \t]*\d+(\.\d+)*[ \t]*'
            r'([ \t]FATAL_ERROR)?[ \t]*\)[ \t]*'
            r'(#[^\n]*)?$'
        )
        if re.search(exp, text, flags=re.MULTILINE | re.IGNORECASE):
            return 0.8
        return 0.0
