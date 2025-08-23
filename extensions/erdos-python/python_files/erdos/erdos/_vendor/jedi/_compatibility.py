"""
This module is here to ensure compatibility of Windows/Linux/MacOS and
different Python versions.
"""
import errno
import sys
import pickle
from typing import Any


class Unpickler(pickle.Unpickler):
    def find_class(self, module: str, name: str) -> Any:
        # Python 3.13 moved pathlib implementation out of __init__.py as part of
        # generalising its implementation. Ensure that we support loading
        # pickles from 3.13 on older version of Python. Since 3.13 maintained a
        # compatible API, pickles from older Python work natively on the newer
        # version.
        if module == 'pathlib._local':
            module = 'pathlib'
        return super().find_class(module, name)


def pickle_load(file):
    try:
        return Unpickler(file).load()
    # Python on Windows don't throw EOF errors for pipes. So reraise them with
    # the correct type, which is caught upwards.
    except OSError:
        if sys.platform == 'win32':
            raise EOFError()
        raise


def pickle_dump(data, file, protocol):
    try:
        pickle.dump(data, file, protocol)
        # On Python 3.3 flush throws sometimes an error even though the writing
        # operation should be completed.
        file.flush()
    # Python on Windows don't throw EPIPE errors for pipes. So reraise them with
    # the correct type and error number.
    except OSError:
        if sys.platform == 'win32':
            raise IOError(errno.EPIPE, "Broken pipe")
        raise
