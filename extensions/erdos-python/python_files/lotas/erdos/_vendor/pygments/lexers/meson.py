"""
    pygments.lexers.meson
    ~~~~~~~~~~~~~~~~~~~~~

    Pygments lexer for the Meson build system

    :copyright: Copyright 2006-2025 by the Pygments team, see AUTHORS.
    :license: BSD, see LICENSE for details.
"""

from lotas.erdos._vendor.pygments.lexer import RegexLexer, words, include
from lotas.erdos._vendor.pygments.token import Comment, Name, Number, Punctuation, Operator, \
    Keyword, String, Whitespace

__all__ = ['MesonLexer']


class MesonLexer(RegexLexer):
    """Meson language lexer.

    The grammar definition use to transcribe the syntax was retrieved from
    https://mesonbuild.com/Syntax.html#grammar for version 0.58.
    Some of those definitions are improperly transcribed, so the Meson++
    implementation was also checked: https://github.com/dcbaker/meson-plus-plus.
    """

    # TODO String interpolation @VARNAME@ inner matches
    # TODO keyword_arg: value inner matches

    name = 'Meson'
    url = 'https://mesonbuild.com/'
    aliases = ['meson', 'meson.build']
    filenames = ['meson.build', 'meson_options.txt']
    mimetypes = ['text/x-meson']
    version_added = '2.10'

    tokens = {
        'root': [
            (r'#.*?$', Comment),
            (r"'''.*'''", String.Single),
            (r'[1-9][0-9]*', Number.Integer),
            (r'0o[0-7]+', Number.Oct),
            (r'0x[a-fA-F0-9]+', Number.Hex),
            include('string'),
            include('keywords'),
            include('expr'),
            (r'[a-zA-Z_][a-zA-Z_0-9]*', Name),
            (r'\s+', Whitespace),
        ],
        'string': [
            (r"[']{3}([']{0,2}([^\\']|\\(.|\n)))*[']{3}", String),
            (r"'.*?(?<!\\)(\\\\)*?'", String),
        ],
        'keywords': [
            (words((
                'if',
                'elif',
                'else',
                'endif',
                'foreach',
                'endforeach',
                'break',
                'continue',
            ),
                   suffix=r'\b'), Keyword),
        ],
        'expr': [
            (r'(in|and|or|not)\b', Operator.Word),
            (r'(\*=|/=|%=|\+]=|-=|==|!=|\+|-|=)', Operator),
            (r'[\[\]{}:().,?]', Punctuation),
            (words(('true', 'false'), suffix=r'\b'), Keyword.Constant),
            include('builtins'),
            (words((
                'meson',
                'build_machine',
                'host_machine',
                'target_machine',
            ),
                   suffix=r'\b'), Name.Variable.Magic),
        ],
        'builtins': [
            # This list was extracted from the v0.58 reference manual
            (words((
                'add_global_arguments',
                'add_global_link_arguments',
                'add_languages',
                'add_project_arguments',
                'add_project_link_arguments',
                'add_test_setup',
                'assert',
                'benchmark',
                'both_libraries',
                'build_target',
                'configuration_data',
                'configure_file',
                'custom_target',
                'declare_dependency',
                'dependency',
                'disabler',
                'environment',
                'error',
                'executable',
                'files',
                'find_library',
                'find_program',
                'generator',
                'get_option',
                'get_variable',
                'include_directories',
                'install_data',
                'install_headers',
                'install_man',
                'install_subdir',
                'is_disabler',
                'is_variable',
                'jar',
                'join_paths',
                'library',
                'message',
                'project',
                'range',
                'run_command',
                'set_variable',
                'shared_library',
                'shared_module',
                'static_library',
                'subdir',
                'subdir_done',
                'subproject',
                'summary',
                'test',
                'vcs_tag',
                'warning',
            ),
                   prefix=r'(?<!\.)',
                   suffix=r'\b'), Name.Builtin),
            (r'(?<!\.)import\b', Name.Namespace),
        ],
    }
