"""
Utilities for end-users.
"""

import __main__
from collections import namedtuple
import logging
import traceback
import re
import os
import sys

from jedi import Interpreter


READLINE_DEBUG = False


def setup_readline(namespace_module=__main__, fuzzy=False):
    """
    This function sets up :mod:`readline` to use Jedi in a Python interactive
    shell.

    If you want to use a custom ``PYTHONSTARTUP`` file (typically
    ``$HOME/.pythonrc.py``), you can add this piece of code::

        try:
            from erdos._vendor.jedi.utils import setup_readline
        except ImportError:
            # Fallback to the stdlib readline completer if it is installed.
            # Taken from http://docs.python.org/2/library/rlcompleter.html
            print("Jedi is not installed, falling back to readline")
            try:
                import readline
                import rlcompleter
                readline.parse_and_bind("tab: complete")
            except ImportError:
                print("Readline is not installed either. No tab completion is enabled.")
        else:
            setup_readline()

    This will fallback to the readline completer if Jedi is not installed.
    The readline completer will only complete names in the global namespace,
    so for example::

        ran<TAB>

    will complete to ``range``.

    With Jedi the following code::

        range(10).cou<TAB>

    will complete to ``range(10).count``, this does not work with the default
    cPython :mod:`readline` completer.

    You will also need to add ``export PYTHONSTARTUP=$HOME/.pythonrc.py`` to
    your shell profile (usually ``.bash_profile`` or ``.profile`` if you use
    bash).
    """
    if READLINE_DEBUG:
        logging.basicConfig(
            filename='/tmp/jedi.log',
            filemode='a',
            level=logging.DEBUG
        )

    class JediRL:
        def complete(self, text, state):
            """
            This complete stuff is pretty weird, a generator would make
            a lot more sense, but probably due to backwards compatibility
            this is still the way how it works.

            The only important part is stuff in the ``state == 0`` flow,
            everything else has been copied from the ``rlcompleter`` std.
            library module.
            """
            if state == 0:
                sys.path.insert(0, os.getcwd())
                # Calling python doesn't have a path, so add to sys.path.
                try:
                    logging.debug("Start REPL completion: " + repr(text))
                    interpreter = Interpreter(text, [namespace_module.__dict__])

                    completions = interpreter.complete(fuzzy=fuzzy)
                    logging.debug("REPL completions: %s", completions)

                    self.matches = [
                        text[:len(text) - c._like_name_length] + c.name_with_symbols
                        for c in completions
                    ]
                except:
                    logging.error("REPL Completion error:\n" + traceback.format_exc())
                    raise
                finally:
                    sys.path.pop(0)
            try:
                return self.matches[state]
            except IndexError:
                return None

    try:
        # Need to import this one as well to make sure it's executed before
        # this code. This didn't use to be an issue until 3.3. Starting with
        # 3.4 this is different, it always overwrites the completer if it's not
        # already imported here.
        import rlcompleter  # noqa: F401
        import readline
    except ImportError:
        print("Jedi: Module readline not available.")
    else:
        readline.set_completer(JediRL().complete)
        readline.parse_and_bind("tab: complete")
        # jedi itself does the case matching
        readline.parse_and_bind("set completion-ignore-case on")
        # because it's easier to hit the tab just once
        readline.parse_and_bind("set show-all-if-unmodified")
        readline.parse_and_bind("set show-all-if-ambiguous on")
        # don't repeat all the things written in the readline all the time
        readline.parse_and_bind("set completion-prefix-display-length 2")
        # No delimiters, Jedi handles that.
        readline.set_completer_delims('')


def version_info():
    """
    Returns a namedtuple of Jedi's version, similar to Python's
    ``sys.version_info``.
    """
    Version = namedtuple('Version', 'major, minor, micro')
    from jedi import __version__
    tupl = re.findall(r'[a-z]+|\d+', __version__)
    return Version(*[x if i == 3 else int(x) for i, x in enumerate(tupl)])
