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
"""Python formatting style settings."""

import os
import re
import textwrap

from yapf.yapflib import errors
from yapf.yapflib import py3compat


class StyleConfigError(errors.YapfError):
  """Raised when there's a problem reading the style configuration."""
  pass


def Get(setting_name):
  """Get a style setting."""
  return _style[setting_name]


def Help():
  """Return dict mapping style names to help strings."""
  return _STYLE_HELP


def SetGlobalStyle(style):
  """Set a style dict."""
  global _style
  _style = style


_STYLE_HELP = dict(
    ALIGN_CLOSING_BRACKET_WITH_VISUAL_INDENT=
    'Align closing bracket with visual indentation.',
    COLUMN_LIMIT='The column limit.',
    I18N_COMMENT=textwrap.dedent("""\
      The regex for an i18n comment. The presence of this comment stops
      reformatting of that line, because the comments are required to be
      next to the string they translate."""),
    I18N_FUNCTION_CALL=textwrap.dedent("""\
      The i18n function call names. The presence of this function stops
      reformattting on that line, because the string it has cannot be moved
      away from the i18n comment."""),
    INDENT_DICTIONARY_VALUE=textwrap.dedent("""\
      Indent the dictionary value if it cannot fit on the same line as the
      dictionary key.

      For example:

      config = {
          'key1':
              'value1',
          'key2': value1 +
                  value2,
      }"""),
    INDENT_WIDTH='The number of columns to use for indentation.',
    CONTINUATION_INDENT_WIDTH='Indent width used for line continuations.',
    BLANK_LINE_BEFORE_NESTED_CLASS_OR_DEF=textwrap.dedent("""\
      Insert a blank line before a 'def' or 'class' immediately nested
      within another 'def' or 'class'.

      For example:

      class Foo:
                         # <------ this blank line
        def method():
          ..."""),
    DEDENT_CLOSING_BRACKETS=textwrap.dedent("""\
      Put closing brackets on a separate line, dedented, if the bracketed
      expression can't fit in a single line. Applies to all kinds of brackets,
      including function definitions and calls.

      For example:

      config = {
          'key1': 'value1',
          'key2': 'value2',
      }        # <--- this bracket is dedented and on a separate line

      time_series = self.remote_client.query_entity_counters(
        entity='dev3246.region1',
        key='dns.query_latency_tcp',
        transform=Transformation.AVERAGE(window=timedelta(seconds=60)),
        start_ts=now()-timedelta(days=3),
        end_ts=now(),
      )        # <--- this bracket is dedented and on a separate line
      """),
    JOIN_MULTIPLE_LINES=
    "Join short lines into one line. E.g., single line 'if' statements.",
    SPACE_BETWEEN_ENDING_COMMA_AND_CLOSING_BRACKET=textwrap.dedent("""\
      Insert a space between the ending comma and closing bracket of a list,
      etc."""),
    SPACES_BEFORE_COMMENT=
    'The number of spaces required before a trailing comment.',
    SPLIT_BEFORE_BITWISE_OPERATOR=
    "Set to True to prefer splitting before '&', '|' or '^' rather than after.",
    SPLIT_BEFORE_LOGICAL_OPERATOR=
    "Set to True to prefer splitting before 'and' or 'or' rather than after.",
    SPLIT_BEFORE_NAMED_ASSIGNS='Split named assignments onto individual lines.',
    SPLIT_PENALTY_AFTER_UNARY_OPERATOR=
    'The penalty for splitting the line after a unary operator.',
    SPLIT_PENALTY_EXCESS_CHARACTER=
    'The penalty for characters over the column limit.',
    SPLIT_PENALTY_BITWISE_OPERATOR=
    "The penalty of splitting the line around the '&', '|', and '^' operators.",
    SPLIT_PENALTY_IMPORT_NAMES=textwrap.dedent("""\
    The penalty of splitting a list of "import as" names.

    For example:

      from a_very_long_or_indented_module_name_yada_yad import (long_argument_1,
                                                                long_argument_2,
                                                                long_argument_3)

    would reformat to something like:

      from a_very_long_or_indented_module_name_yada_yad import (
          long_argument_1, long_argument_2, long_argument_3)
    """),
    SPLIT_PENALTY_LOGICAL_OPERATOR=
    "The penalty of splitting the line around the 'and' and 'or' operators.",
    SPLIT_PENALTY_AFTER_OPENING_BRACKET=
    'The penalty for splitting right after the opening bracket.',
    SPLIT_PENALTY_FOR_ADDED_LINE_SPLIT=textwrap.dedent("""\
      The penalty incurred by adding a line split to the unwrapped line. The
      more line splits added the higher the penalty."""),
    # BASED_ON_STYLE='Which predefined style this style is based on',
)


def CreatePEP8Style():
  return dict(
      ALIGN_CLOSING_BRACKET_WITH_VISUAL_INDENT=True,
      COLUMN_LIMIT=79,
      DEDENT_CLOSING_BRACKETS=False,
      I18N_COMMENT='',
      I18N_FUNCTION_CALL='',
      INDENT_DICTIONARY_VALUE=False,
      INDENT_WIDTH=4,
      CONTINUATION_INDENT_WIDTH=4,
      BLANK_LINE_BEFORE_NESTED_CLASS_OR_DEF=False,
      JOIN_MULTIPLE_LINES=True,
      SPACE_BETWEEN_ENDING_COMMA_AND_CLOSING_BRACKET=True,
      SPACES_BEFORE_COMMENT=2,
      SPLIT_BEFORE_BITWISE_OPERATOR=True,
      SPLIT_BEFORE_LOGICAL_OPERATOR=False,
      SPLIT_BEFORE_NAMED_ASSIGNS=True,
      SPLIT_PENALTY_AFTER_UNARY_OPERATOR=10000,
      SPLIT_PENALTY_EXCESS_CHARACTER=2500,
      SPLIT_PENALTY_BITWISE_OPERATOR=300,
      SPLIT_PENALTY_IMPORT_NAMES=0,
      SPLIT_PENALTY_LOGICAL_OPERATOR=300,
      SPLIT_PENALTY_AFTER_OPENING_BRACKET=30,
      SPLIT_PENALTY_FOR_ADDED_LINE_SPLIT=30,
  )  # yapf: disable


def CreateGoogleStyle():
  style = CreatePEP8Style()
  style['ALIGN_CLOSING_BRACKET_WITH_VISUAL_INDENT'] = False
  style['COLUMN_LIMIT'] = 80
  style['INDENT_WIDTH'] = 4
  style['BLANK_LINE_BEFORE_NESTED_CLASS_OR_DEF'] = True
  style['I18N_COMMENT'] = r'#\..*'
  style['I18N_FUNCTION_CALL'] = ['N_', '_']
  style['SPACE_BETWEEN_ENDING_COMMA_AND_CLOSING_BRACKET'] = False
  return style


def CreateChromiumStyle():
  style = CreateGoogleStyle()
  style['INDENT_DICTIONARY_VALUE'] = True
  style['INDENT_WIDTH'] = 2
  style['JOIN_MULTIPLE_LINES'] = False
  return style


def CreateFacebookStyle():
  style = CreatePEP8Style()
  style['ALIGN_CLOSING_BRACKET_WITH_VISUAL_INDENT'] = False
  style['COLUMN_LIMIT'] = 80
  style['DEDENT_CLOSING_BRACKETS'] = True
  style['JOIN_MULTIPLE_LINES'] = False
  style['SPACES_BEFORE_COMMENT'] = 2
  style['SPLIT_PENALTY_AFTER_OPENING_BRACKET'] = 0
  style['SPLIT_PENALTY_FOR_ADDED_LINE_SPLIT'] = 30
  return style


_STYLE_NAME_TO_FACTORY = dict(
    pep8=CreatePEP8Style,
    chromium=CreateChromiumStyle,
    google=CreateGoogleStyle,
    facebook=CreateFacebookStyle,
)  # yapf: disable


def _StringListConverter(s):
  """Option value converter for a comma-separated list of strings."""
  return [part.strip() for part in s.split(',')]


def _BoolConverter(s):
  """Option value converter for a boolean."""
  return py3compat.CONFIGPARSER_BOOLEAN_STATES[s.lower()]

# Different style options need to have their values interpreted differently when
# read from the config file. This dict maps an option name to a "converter"
# function that accepts the string read for the option's value from the file and
# returns it wrapper in actual Python type that's going to be meaningful to
# yapf.
#
# Note: this dict has to map all the supported style options.
_STYLE_OPTION_VALUE_CONVERTER = dict(
    ALIGN_CLOSING_BRACKET_WITH_VISUAL_INDENT=_BoolConverter,
    COLUMN_LIMIT=int,
    DEDENT_CLOSING_BRACKETS=_BoolConverter,
    I18N_COMMENT=str,
    I18N_FUNCTION_CALL=_StringListConverter,
    INDENT_DICTIONARY_VALUE=_BoolConverter,
    INDENT_WIDTH=int,
    CONTINUATION_INDENT_WIDTH=int,
    BLANK_LINE_BEFORE_NESTED_CLASS_OR_DEF=_BoolConverter,
    JOIN_MULTIPLE_LINES=_BoolConverter,
    SPACE_BETWEEN_ENDING_COMMA_AND_CLOSING_BRACKET=_BoolConverter,
    SPACES_BEFORE_COMMENT=int,
    SPLIT_BEFORE_BITWISE_OPERATOR=_BoolConverter,
    SPLIT_BEFORE_LOGICAL_OPERATOR=_BoolConverter,
    SPLIT_BEFORE_NAMED_ASSIGNS=_BoolConverter,
    SPLIT_PENALTY_AFTER_UNARY_OPERATOR=int,
    SPLIT_PENALTY_EXCESS_CHARACTER=int,
    SPLIT_PENALTY_BITWISE_OPERATOR=int,
    SPLIT_PENALTY_IMPORT_NAMES=int,
    SPLIT_PENALTY_LOGICAL_OPERATOR=int,
    SPLIT_PENALTY_AFTER_OPENING_BRACKET=int,
    SPLIT_PENALTY_FOR_ADDED_LINE_SPLIT=int,)


def CreateStyleFromConfig(style_config):
  """Create a style dict from the given config.

  Arguments:
    style_config: either a style name or a file name. The file is expected to
      contain settings. It can have a special BASED_ON_STYLE setting naming the
      style which it derives from. If no such setting is found, it derives from
      the default style. When style_config is None, the DEFAULT_STYLE_FACTORY
      config is created.

  Returns:
    A style dict.

  Raises:
    StyleConfigError: if an unknown style option was encountered.
  """
  if style_config is None:
    return DEFAULT_STYLE_FACTORY()
  style_factory = _STYLE_NAME_TO_FACTORY.get(style_config.lower())
  if style_factory is not None:
    return style_factory()
  if style_config.startswith('{'):
    # Most likely a style specification from the command line.
    config = _CreateConfigParserFromConfigString(style_config)
  else:
    # Unknown config name: assume it's a file name then.
    config = _CreateConfigParserFromConfigFile(style_config)
  return _CreateStyleFromConfigParser(config)


def _CreateConfigParserFromConfigString(config_string):
  """Given a config string from the command line, return a config parser."""
  if config_string[0] != '{' or config_string[-1] != '}':
    raise StyleConfigError("Invalid style dict syntax: '{}'.".format(
        config_string))
  config = py3compat.ConfigParser()
  config.add_section('style')
  for key, value in re.findall(r'([a-zA-Z0-9_]+)\s*[:=]\s*([a-zA-Z0-9_]+)',
                               config_string):
    config.set('style', key, value)
  return config


def _CreateConfigParserFromConfigFile(config_filename):
  """Read the file and return a ConfigParser object."""
  if not os.path.exists(config_filename):
    # Provide a more meaningful error here.
    raise StyleConfigError('"{0}" is not a valid style or file path'.format(
        config_filename))
  with open(config_filename) as style_file:
    config = py3compat.ConfigParser()
    config.read_file(style_file)
    if config_filename.endswith(SETUP_CONFIG):
      if not config.has_section('yapf'):
        raise StyleConfigError('Unable to find section [yapf] in {0}'.format(
            config_filename))
    elif config_filename.endswith(LOCAL_STYLE):
      if not config.has_section('style'):
        raise StyleConfigError('Unable to find section [style] in {0}'.format(
            config_filename))
    else:
      if not config.has_section('style'):
        raise StyleConfigError('Unable to find section [style] in {0}'.format(
            config_filename))
    return config


def _CreateStyleFromConfigParser(config):
  """Create a style dict from a configuration file.

  Arguments:
    config: a ConfigParser object.

  Returns:
    A style dict.

  Raises:
    StyleConfigError: if an unknown style option was encountered.
  """
  # Initialize the base style.
  section = 'yapf' if config.has_section('yapf') else 'style'
  if config.has_option('style', 'based_on_style'):
    based_on = config.get('style', 'based_on_style').lower()
    base_style = _STYLE_NAME_TO_FACTORY[based_on]()
  elif config.has_option('yapf', 'based_on_style'):
    based_on = config.get('yapf', 'based_on_style').lower()
    base_style = _STYLE_NAME_TO_FACTORY[based_on]()
  else:
    base_style = DEFAULT_STYLE_FACTORY()

  # Read all options specified in the file and update the style.
  for option, value in config.items(section):
    if option.lower() == 'based_on_style':
      # Now skip this one - we've already handled it and it's not one of the
      # recognized style options.
      continue
    option = option.upper()
    if option not in _STYLE_OPTION_VALUE_CONVERTER:
      raise StyleConfigError('Unknown style option "{0}"'.format(option))
    try:
      base_style[option] = _STYLE_OPTION_VALUE_CONVERTER[option](value)
    except ValueError:
      raise StyleConfigError("'{}' is not a valid setting for {}.".format(
          value, option))
  return base_style

# The default style - used if yapf is not invoked without specifically
# requesting a formatting style.
DEFAULT_STYLE = 'pep8'
DEFAULT_STYLE_FACTORY = CreatePEP8Style

# The name of the file to use for global style definition.
GLOBAL_STYLE = (os.path.join(os.getenv('XDG_CONFIG_HOME') or
                os.path.expanduser('~/.config'), 'yapf', 'style'))

# The name of the file to use for directory-local style definition.
LOCAL_STYLE = '.style.yapf'

# Alternative place for directory-local style definition. Style should be
# specified in the '[yapf]' section.
SETUP_CONFIG = 'setup.cfg'

# TODO(eliben): For now we're preserving the global presence of a style dict.
# Refactor this so that the style is passed around through yapf rather than
# being global.
_style = {}
SetGlobalStyle(DEFAULT_STYLE_FACTORY())
