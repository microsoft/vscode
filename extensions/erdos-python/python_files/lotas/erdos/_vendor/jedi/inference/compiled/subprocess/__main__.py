import os
import sys
from importlib.abc import MetaPathFinder
from importlib.machinery import PathFinder

# Remove the first entry, because it's simply a directory entry that equals
# this directory.
del sys.path[0]


def _get_paths():
    # Get the path to jedi.
    _d = os.path.dirname
    _jedi_path = _d(_d(_d(_d(_d(__file__)))))
    _parso_path = sys.argv[1]
    # The paths are the directory that jedi and parso lie in.
    return {'jedi': _jedi_path, 'parso': _parso_path}


class _ExactImporter(MetaPathFinder):
    def __init__(self, path_dct):
        self._path_dct = path_dct

    def find_spec(self, fullname, path=None, target=None):
        if path is None and fullname in self._path_dct:
            p = self._path_dct[fullname]
            spec = PathFinder.find_spec(fullname, path=[p], target=target)
            return spec
        return None


# Try to import jedi/parso.
sys.meta_path.insert(0, _ExactImporter(_get_paths()))
from erdos._vendor.jedi.inference.compiled import subprocess  # noqa: E402
sys.meta_path.pop(0)

# Retrieve the pickle protocol.
host_sys_version = [int(x) for x in sys.argv[2].split('.')]
# And finally start the client.
subprocess.Listener().listen()
