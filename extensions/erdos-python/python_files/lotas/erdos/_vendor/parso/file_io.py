import os
from pathlib import Path
from typing import Union


class FileIO:
    def __init__(self, path: Union[os.PathLike, str]):
        if isinstance(path, str):
            path = Path(path)
        self.path = path

    def read(self):  # Returns bytes/str
        # We would like to read unicode here, but we cannot, because we are not
        # sure if it is a valid unicode file. Therefore just read whatever is
        # here.
        with open(self.path, 'rb') as f:
            return f.read()

    def get_last_modified(self):
        """
        Returns float - timestamp or None, if path doesn't exist.
        """
        try:
            return os.path.getmtime(self.path)
        except FileNotFoundError:
            return None

    def __repr__(self):
        return '%s(%s)' % (self.__class__.__name__, self.path)


class KnownContentFileIO(FileIO):
    def __init__(self, path, content):
        super().__init__(path)
        self._content = content

    def read(self):
        return self._content
