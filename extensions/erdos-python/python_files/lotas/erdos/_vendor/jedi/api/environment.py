"""
Environments are a way to activate different Python versions or Virtualenvs for
static analysis. The Python binary in that environment is going to be executed.
"""
import os
import sys
import hashlib
import filecmp
from collections import namedtuple
from shutil import which
from typing import TYPE_CHECKING

from lotas.erdos._vendor.jedi.cache import memoize_method, time_cache
from lotas.erdos._vendor.jedi.inference.compiled.subprocess import CompiledSubprocess, \
    InferenceStateSameProcess, InferenceStateSubprocess

import lotas.erdos._vendor.parso as parso

if TYPE_CHECKING:
    from lotas.erdos._vendor.jedi.inference import InferenceState


_VersionInfo = namedtuple('VersionInfo', 'major minor micro')  # type: ignore[name-match]

_SUPPORTED_PYTHONS = ['3.13', '3.12', '3.11', '3.10', '3.9', '3.8', '3.7', '3.6']
_SAFE_PATHS = ['/usr/bin', '/usr/local/bin']
_CONDA_VAR = 'CONDA_PREFIX'
_CURRENT_VERSION = '%s.%s' % (sys.version_info.major, sys.version_info.minor)


class InvalidPythonEnvironment(Exception):
    """
    If you see this exception, the Python executable or Virtualenv you have
    been trying to use is probably not a correct Python version.
    """


class _BaseEnvironment:
    @memoize_method
    def get_grammar(self):
        version_string = '%s.%s' % (self.version_info.major, self.version_info.minor)
        return parso.load_grammar(version=version_string)

    @property
    def _sha256(self):
        try:
            return self._hash
        except AttributeError:
            self._hash = _calculate_sha256_for_file(self.executable)
            return self._hash


def _get_info():
    return (
        sys.executable,
        sys.prefix,
        sys.version_info[:3],
    )


class Environment(_BaseEnvironment):
    """
    This class is supposed to be created by internal Jedi architecture. You
    should not create it directly. Please use create_environment or the other
    functions instead. It is then returned by that function.
    """
    _subprocess = None

    def __init__(self, executable, env_vars=None):
        self._start_executable = executable
        self._env_vars = env_vars
        # Initialize the environment
        self._get_subprocess()

    def _get_subprocess(self):
        if self._subprocess is not None and not self._subprocess.is_crashed:
            return self._subprocess

        try:
            self._subprocess = CompiledSubprocess(self._start_executable,
                                                  env_vars=self._env_vars)
            info = self._subprocess._send(None, _get_info)
        except Exception as exc:
            raise InvalidPythonEnvironment(
                "Could not get version information for %r: %r" % (
                    self._start_executable,
                    exc))

        # Since it could change and might not be the same(?) as the one given,
        # set it here.
        self.executable = info[0]
        """
        The Python executable, matches ``sys.executable``.
        """
        self.path = info[1]
        """
        The path to an environment, matches ``sys.prefix``.
        """
        self.version_info = _VersionInfo(*info[2])
        """
        Like :data:`sys.version_info`: a tuple to show the current
        Environment's Python version.
        """
        return self._subprocess

    def __repr__(self):
        version = '.'.join(str(i) for i in self.version_info)
        return '<%s: %s in %s>' % (self.__class__.__name__, version, self.path)

    def get_inference_state_subprocess(
        self,
        inference_state: 'InferenceState',
    ) -> InferenceStateSubprocess:
        return InferenceStateSubprocess(inference_state, self._get_subprocess())

    @memoize_method
    def get_sys_path(self):
        """
        The sys path for this environment. Does not include potential
        modifications from e.g. appending to :data:`sys.path`.

        :returns: list of str
        """
        # It's pretty much impossible to generate the sys path without actually
        # executing Python. The sys path (when starting with -S) itself depends
        # on how the Python version was compiled (ENV variables).
        # If you omit -S when starting Python (normal case), additionally
        # site.py gets executed.
        return self._get_subprocess().get_sys_path()


class _SameEnvironmentMixin:
    def __init__(self):
        self._start_executable = self.executable = sys.executable
        self.path = sys.prefix
        self.version_info = _VersionInfo(*sys.version_info[:3])
        self._env_vars = None


class SameEnvironment(_SameEnvironmentMixin, Environment):
    pass


class InterpreterEnvironment(_SameEnvironmentMixin, _BaseEnvironment):
    def get_inference_state_subprocess(
        self,
        inference_state: 'InferenceState',
    ) -> InferenceStateSameProcess:
        return InferenceStateSameProcess(inference_state)

    def get_sys_path(self):
        return sys.path


def _get_virtual_env_from_var(env_var='VIRTUAL_ENV'):
    """Get virtualenv environment from VIRTUAL_ENV environment variable.

    It uses `safe=False` with ``create_environment``, because the environment
    variable is considered to be safe / controlled by the user solely.
    """
    var = os.environ.get(env_var)
    if var:
        # Under macOS in some cases - notably when using Pipenv - the
        # sys.prefix of the virtualenv is /path/to/env/bin/.. instead of
        # /path/to/env so we need to fully resolve the paths in order to
        # compare them.
        if os.path.realpath(var) == os.path.realpath(sys.prefix):
            return _try_get_same_env()

        try:
            return create_environment(var, safe=False)
        except InvalidPythonEnvironment:
            pass


def _calculate_sha256_for_file(path):
    sha256 = hashlib.sha256()
    with open(path, 'rb') as f:
        for block in iter(lambda: f.read(filecmp.BUFSIZE), b''):
            sha256.update(block)
    return sha256.hexdigest()


def get_default_environment():
    """
    Tries to return an active Virtualenv or conda environment.
    If there is no VIRTUAL_ENV variable or no CONDA_PREFIX variable set
    set it will return the latest Python version installed on the system. This
    makes it possible to use as many new Python features as possible when using
    autocompletion and other functionality.

    :returns: :class:`.Environment`
    """
    virtual_env = _get_virtual_env_from_var()
    if virtual_env is not None:
        return virtual_env

    conda_env = _get_virtual_env_from_var(_CONDA_VAR)
    if conda_env is not None:
        return conda_env

    return _try_get_same_env()


def _try_get_same_env():
    env = SameEnvironment()
    if not os.path.basename(env.executable).lower().startswith('python'):
        # This tries to counter issues with embedding. In some cases (e.g.
        # VIM's Python Mac/Windows, sys.executable is /foo/bar/vim. This
        # happens, because for Mac a function called `_NSGetExecutablePath` is
        # used and for Windows `GetModuleFileNameW`. These are both platform
        # specific functions. For all other systems sys.executable should be
        # alright. However here we try to generalize:
        #
        # 1. Check if the executable looks like python (heuristic)
        # 2. In case it's not try to find the executable
        # 3. In case we don't find it use an interpreter environment.
        #
        # The last option will always work, but leads to potential crashes of
        # Jedi - which is ok, because it happens very rarely and even less,
        # because the code below should work for most cases.
        if os.name == 'nt':
            # The first case would be a virtualenv and the second a normal
            # Python installation.
            checks = (r'Scripts\python.exe', 'python.exe')
        else:
            # For unix it looks like Python is always in a bin folder.
            checks = (
                'bin/python%s.%s' % (sys.version_info[0], sys.version[1]),
                'bin/python%s' % (sys.version_info[0]),
                'bin/python',
            )
        for check in checks:
            guess = os.path.join(sys.exec_prefix, check)
            if os.path.isfile(guess):
                # Bingo - We think we have our Python.
                return Environment(guess)
        # It looks like there is no reasonable Python to be found.
        return InterpreterEnvironment()
    # If no virtualenv is found, use the environment we're already
    # using.
    return env


def get_cached_default_environment():
    var = os.environ.get('VIRTUAL_ENV') or os.environ.get(_CONDA_VAR)
    environment = _get_cached_default_environment()

    # Under macOS in some cases - notably when using Pipenv - the
    # sys.prefix of the virtualenv is /path/to/env/bin/.. instead of
    # /path/to/env so we need to fully resolve the paths in order to
    # compare them.
    if var and os.path.realpath(var) != os.path.realpath(environment.path):
        _get_cached_default_environment.clear_cache()
        return _get_cached_default_environment()
    return environment


@time_cache(seconds=10 * 60)  # 10 Minutes
def _get_cached_default_environment():
    try:
        return get_default_environment()
    except InvalidPythonEnvironment:
        # It's possible that `sys.executable` is wrong. Typically happens
        # when Jedi is used in an executable that embeds Python. For further
        # information, have a look at:
        # https://github.com/davidhalter/jedi/issues/1531
        return InterpreterEnvironment()


def find_virtualenvs(paths=None, *, safe=True, use_environment_vars=True):
    """
    :param paths: A list of paths in your file system to be scanned for
        Virtualenvs. It will search in these paths and potentially execute the
        Python binaries.
    :param safe: Default True. In case this is False, it will allow this
        function to execute potential `python` environments. An attacker might
        be able to drop an executable in a path this function is searching by
        default. If the executable has not been installed by root, it will not
        be executed.
    :param use_environment_vars: Default True. If True, the VIRTUAL_ENV
        variable will be checked if it contains a valid VirtualEnv.
        CONDA_PREFIX will be checked to see if it contains a valid conda
        environment.

    :yields: :class:`.Environment`
    """
    if paths is None:
        paths = []

    _used_paths = set()

    if use_environment_vars:
        # Using this variable should be safe, because attackers might be
        # able to drop files (via git) but not environment variables.
        virtual_env = _get_virtual_env_from_var()
        if virtual_env is not None:
            yield virtual_env
            _used_paths.add(virtual_env.path)

        conda_env = _get_virtual_env_from_var(_CONDA_VAR)
        if conda_env is not None:
            yield conda_env
            _used_paths.add(conda_env.path)

    for directory in paths:
        if not os.path.isdir(directory):
            continue

        directory = os.path.abspath(directory)
        for path in os.listdir(directory):
            path = os.path.join(directory, path)
            if path in _used_paths:
                # A path shouldn't be inferred twice.
                continue
            _used_paths.add(path)

            try:
                executable = _get_executable_path(path, safe=safe)
                yield Environment(executable)
            except InvalidPythonEnvironment:
                pass


def find_system_environments(*, env_vars=None):
    """
    Ignores virtualenvs and returns the Python versions that were installed on
    your system. This might return nothing, if you're running Python e.g. from
    a portable version.

    The environments are sorted from latest to oldest Python version.

    :yields: :class:`.Environment`
    """
    for version_string in _SUPPORTED_PYTHONS:
        try:
            yield get_system_environment(version_string, env_vars=env_vars)
        except InvalidPythonEnvironment:
            pass


# TODO: this function should probably return a list of environments since
# multiple Python installations can be found on a system for the same version.
def get_system_environment(version, *, env_vars=None):
    """
    Return the first Python environment found for a string of the form 'X.Y'
    where X and Y are the major and minor versions of Python.

    :raises: :exc:`.InvalidPythonEnvironment`
    :returns: :class:`.Environment`
    """
    exe = which('python' + version)
    if exe:
        if exe == sys.executable:
            return SameEnvironment()
        return Environment(exe)

    if os.name == 'nt':
        for exe in _get_executables_from_windows_registry(version):
            try:
                return Environment(exe, env_vars=env_vars)
            except InvalidPythonEnvironment:
                pass
    raise InvalidPythonEnvironment("Cannot find executable python%s." % version)


def create_environment(path, *, safe=True, env_vars=None):
    """
    Make it possible to manually create an Environment object by specifying a
    Virtualenv path or an executable path and optional environment variables.

    :raises: :exc:`.InvalidPythonEnvironment`
    :returns: :class:`.Environment`
    """
    if os.path.isfile(path):
        _assert_safe(path, safe)
        return Environment(path, env_vars=env_vars)
    return Environment(_get_executable_path(path, safe=safe), env_vars=env_vars)


def _get_executable_path(path, safe=True):
    """
    Returns None if it's not actually a virtual env.
    """

    if os.name == 'nt':
        pythons = [os.path.join(path, 'Scripts', 'python.exe'), os.path.join(path, 'python.exe')]
    else:
        pythons = [os.path.join(path, 'bin', 'python')]
    for python in pythons:
        if os.path.exists(python):
            break
    else:
        raise InvalidPythonEnvironment("%s seems to be missing." % python)

    _assert_safe(python, safe)
    return python


def _get_executables_from_windows_registry(version):
    import winreg

    # TODO: support Python Anaconda.
    sub_keys = [
        r'SOFTWARE\Python\PythonCore\{version}\InstallPath',
        r'SOFTWARE\Wow6432Node\Python\PythonCore\{version}\InstallPath',
        r'SOFTWARE\Python\PythonCore\{version}-32\InstallPath',
        r'SOFTWARE\Wow6432Node\Python\PythonCore\{version}-32\InstallPath'
    ]
    for root_key in [winreg.HKEY_CURRENT_USER, winreg.HKEY_LOCAL_MACHINE]:
        for sub_key in sub_keys:
            sub_key = sub_key.format(version=version)
            try:
                with winreg.OpenKey(root_key, sub_key) as key:
                    prefix = winreg.QueryValueEx(key, '')[0]
                    exe = os.path.join(prefix, 'python.exe')
                    if os.path.isfile(exe):
                        yield exe
            except WindowsError:
                pass


def _assert_safe(executable_path, safe):
    if safe and not _is_safe(executable_path):
        raise InvalidPythonEnvironment(
            "The python binary is potentially unsafe.")


def _is_safe(executable_path):
    # Resolve sym links. A venv typically is a symlink to a known Python
    # binary. Only virtualenvs copy symlinks around.
    real_path = os.path.realpath(executable_path)

    if _is_unix_safe_simple(real_path):
        return True

    # Just check the list of known Python versions. If it's not in there,
    # it's likely an attacker or some Python that was not properly
    # installed in the system.
    for environment in find_system_environments():
        if environment.executable == real_path:
            return True

        # If the versions don't match, just compare the binary files. If we
        # don't do that, only venvs will be working and not virtualenvs.
        # venvs are symlinks while virtualenvs are actual copies of the
        # Python files.
        # This still means that if the system Python is updated and the
        # virtualenv's Python is not (which is probably never going to get
        # upgraded), it will not work with Jedi. IMO that's fine, because
        # people should just be using venv. ~ dave
        if environment._sha256 == _calculate_sha256_for_file(real_path):
            return True
    return False


def _is_unix_safe_simple(real_path):
    if _is_unix_admin():
        # In case we are root, just be conservative and
        # only execute known paths.
        return any(real_path.startswith(p) for p in _SAFE_PATHS)

    uid = os.stat(real_path).st_uid
    # The interpreter needs to be owned by root. This means that it wasn't
    # written by a user and therefore attacking Jedi is not as simple.
    # The attack could look like the following:
    # 1. A user clones a repository.
    # 2. The repository has an innocent looking folder called foobar. jedi
    #    searches for the folder and executes foobar/bin/python --version if
    #    there's also a foobar/bin/activate.
    # 3. The attacker has gained code execution, since he controls
    #    foobar/bin/python.
    return uid == 0


def _is_unix_admin():
    try:
        return os.getuid() == 0
    except AttributeError:
        return False  # Windows
