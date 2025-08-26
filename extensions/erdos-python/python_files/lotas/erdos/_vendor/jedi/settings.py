"""
This module contains variables with global |jedi| settings. To change the
behavior of |jedi|, change the variables defined in :mod:`jedi.settings`.

Plugins should expose an interface so that the user can adjust the
configuration.


Example usage::

    from jedi import settings
    settings.case_insensitive_completion = True


Completion output
~~~~~~~~~~~~~~~~~

.. autodata:: case_insensitive_completion
.. autodata:: add_bracket_after_function


Filesystem cache
~~~~~~~~~~~~~~~~

.. autodata:: cache_directory


Parser
~~~~~~

.. autodata:: fast_parser


Dynamic stuff
~~~~~~~~~~~~~

.. autodata:: dynamic_array_additions
.. autodata:: dynamic_params
.. autodata:: dynamic_params_for_other_modules
.. autodata:: auto_import_modules


Caching
~~~~~~~

.. autodata:: call_signatures_validity


"""
import os
import platform

# ----------------
# Completion Output Settings
# ----------------

case_insensitive_completion = True
"""
Completions are by default case insensitive.
"""

add_bracket_after_function = False
"""
Adds an opening bracket after a function for completions.
"""

# ----------------
# Filesystem Cache
# ----------------

if platform.system().lower() == 'windows':
    _cache_directory = os.path.join(
        os.getenv('LOCALAPPDATA') or os.path.expanduser('~'),
        'Jedi',
        'Jedi',
    )
elif platform.system().lower() == 'darwin':
    _cache_directory = os.path.join('~', 'Library', 'Caches', 'Jedi')
else:
    _cache_directory = os.path.join(os.getenv('XDG_CACHE_HOME') or '~/.cache',
                                    'jedi')
cache_directory = os.path.expanduser(_cache_directory)
"""
The path where the cache is stored.

On Linux, this defaults to ``~/.cache/jedi/``, on OS X to
``~/Library/Caches/Jedi/`` and on Windows to ``%LOCALAPPDATA%\\Jedi\\Jedi\\``.
On Linux, if the environment variable ``$XDG_CACHE_HOME`` is set,
``$XDG_CACHE_HOME/jedi`` is used instead of the default one.
"""

# ----------------
# Parser
# ----------------

fast_parser = True
"""
Uses Parso's diff parser. If it is enabled, this might cause issues, please
read the warning on :class:`.Script`. This feature makes it possible to only
parse the parts again that have changed, while reusing the rest of the syntax
tree.
"""

_cropped_file_size = int(10e6)  # 1 Megabyte
"""
Jedi gets extremely slow if the file size exceed a few thousand lines.
To avoid getting stuck completely Jedi crops the file at some point.

One megabyte of typical Python code equals about 20'000 lines of code.
"""

# ----------------
# Dynamic Stuff
# ----------------

dynamic_array_additions = True
"""
check for `append`, etc. on arrays: [], {}, () as well as list/set calls.
"""

dynamic_params = True
"""
A dynamic param completion, finds the callees of the function, which define
the params of a function.
"""

dynamic_params_for_other_modules = True
"""
Do the same for other modules.
"""

dynamic_flow_information = True
"""
Check for `isinstance` and other information to infer a type.
"""

auto_import_modules = [
    'gi',  # This third-party repository (GTK stuff) doesn't really work with jedi
]
"""
Modules that will not be analyzed but imported, if they contain Python code.
This improves autocompletion for libraries that use ``setattr`` or
``globals()`` modifications a lot.
"""

allow_unsafe_interpreter_executions = True
"""
Controls whether descriptors are evaluated when using an Interpreter. This is
something you might want to control when using Jedi from a Repl (e.g. IPython)

Generally this setting allows Jedi to execute __getitem__ and descriptors like
`property`.
"""

# ----------------
# Caching Validity
# ----------------

call_signatures_validity = 3.0
"""
Finding function calls might be slow (0.1-0.5s). This is not acceptible for
normal writing. Therefore cache it for a short time.
"""
