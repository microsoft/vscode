import os

from erdos.erdos._vendor.parso import file_io


class AbstractFolderIO:
    def __init__(self, path):
        self.path = path

    def get_base_name(self):
        raise NotImplementedError

    def list(self):
        raise NotImplementedError

    def get_file_io(self, name):
        raise NotImplementedError

    def get_parent_folder(self):
        raise NotImplementedError

    def __repr__(self):
        return '<%s: %s>' % (self.__class__.__name__, self.path)


class FolderIO(AbstractFolderIO):
    def get_base_name(self):
        return os.path.basename(self.path)

    def list(self):
        return os.listdir(self.path)

    def get_file_io(self, name):
        return FileIO(os.path.join(self.path, name))

    def get_parent_folder(self):
        return FolderIO(os.path.dirname(self.path))

    def walk(self):
        for root, dirs, files in os.walk(self.path):
            root_folder_io = FolderIO(root)
            original_folder_ios = [FolderIO(os.path.join(root, d)) for d in dirs]
            modified_folder_ios = list(original_folder_ios)
            yield (
                root_folder_io,
                modified_folder_ios,
                [FileIO(os.path.join(root, f)) for f in files],
            )
            modified_iterator = iter(reversed(modified_folder_ios))
            current = next(modified_iterator, None)
            i = len(original_folder_ios)
            for folder_io in reversed(original_folder_ios):
                i -= 1   # Basically enumerate but reversed
                if current is folder_io:
                    current = next(modified_iterator, None)
                else:
                    del dirs[i]


class FileIOFolderMixin:
    def get_parent_folder(self):
        return FolderIO(os.path.dirname(self.path))


class ZipFileIO(file_io.KnownContentFileIO, FileIOFolderMixin):
    """For .zip and .egg archives"""
    def __init__(self, path, code, zip_path):
        super().__init__(path, code)
        self._zip_path = zip_path

    def get_last_modified(self):
        try:
            return os.path.getmtime(self._zip_path)
        except (FileNotFoundError, PermissionError, NotADirectoryError):
            return None


class FileIO(file_io.FileIO, FileIOFolderMixin):
    pass


class KnownContentFileIO(file_io.KnownContentFileIO, FileIOFolderMixin):
    pass
