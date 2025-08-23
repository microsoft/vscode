import os
import warnings
from pathlib import Path
from typing import AbstractSet, Any, Callable, ClassVar, Dict, List, Mapping, Optional, Tuple, Type, Union

from erdos.erdos._vendor.pydantic.config import BaseConfig, Extra
from erdos.erdos._vendor.pydantic.fields import ModelField
from erdos.erdos._vendor.pydantic.main import BaseModel
from erdos.erdos._vendor.pydantic.types import JsonWrapper
from erdos.erdos._vendor.pydantic.typing import StrPath, display_as_type, get_origin, is_union
from erdos.erdos._vendor.pydantic.utils import deep_update, lenient_issubclass, path_type, sequence_like

env_file_sentinel = str(object())

SettingsSourceCallable = Callable[['BaseSettings'], Dict[str, Any]]
DotenvType = Union[StrPath, List[StrPath], Tuple[StrPath, ...]]


class SettingsError(ValueError):
    pass


class BaseSettings(BaseModel):
    """
    Base class for settings, allowing values to be overridden by environment variables.

    This is useful in production for secrets you do not wish to save in code, it plays nicely with docker(-compose),
    Heroku and any 12 factor app design.
    """

    def __init__(
        __pydantic_self__,
        _env_file: Optional[DotenvType] = env_file_sentinel,
        _env_file_encoding: Optional[str] = None,
        _env_nested_delimiter: Optional[str] = None,
        _secrets_dir: Optional[StrPath] = None,
        **values: Any,
    ) -> None:
        # Uses something other than `self` the first arg to allow "self" as a settable attribute
        super().__init__(
            **__pydantic_self__._build_values(
                values,
                _env_file=_env_file,
                _env_file_encoding=_env_file_encoding,
                _env_nested_delimiter=_env_nested_delimiter,
                _secrets_dir=_secrets_dir,
            )
        )

    def _build_values(
        self,
        init_kwargs: Dict[str, Any],
        _env_file: Optional[DotenvType] = None,
        _env_file_encoding: Optional[str] = None,
        _env_nested_delimiter: Optional[str] = None,
        _secrets_dir: Optional[StrPath] = None,
    ) -> Dict[str, Any]:
        # Configure built-in sources
        init_settings = InitSettingsSource(init_kwargs=init_kwargs)
        env_settings = EnvSettingsSource(
            env_file=(_env_file if _env_file != env_file_sentinel else self.__config__.env_file),
            env_file_encoding=(
                _env_file_encoding if _env_file_encoding is not None else self.__config__.env_file_encoding
            ),
            env_nested_delimiter=(
                _env_nested_delimiter if _env_nested_delimiter is not None else self.__config__.env_nested_delimiter
            ),
            env_prefix_len=len(self.__config__.env_prefix),
        )
        file_secret_settings = SecretsSettingsSource(secrets_dir=_secrets_dir or self.__config__.secrets_dir)
        # Provide a hook to set built-in sources priority and add / remove sources
        sources = self.__config__.customise_sources(
            init_settings=init_settings, env_settings=env_settings, file_secret_settings=file_secret_settings
        )
        if sources:
            return deep_update(*reversed([source(self) for source in sources]))
        else:
            # no one should mean to do this, but I think returning an empty dict is marginally preferable
            # to an informative error and much better than a confusing error
            return {}

    class Config(BaseConfig):
        env_prefix: str = ''
        env_file: Optional[DotenvType] = None
        env_file_encoding: Optional[str] = None
        env_nested_delimiter: Optional[str] = None
        secrets_dir: Optional[StrPath] = None
        validate_all: bool = True
        extra: Extra = Extra.forbid
        arbitrary_types_allowed: bool = True
        case_sensitive: bool = False

        @classmethod
        def prepare_field(cls, field: ModelField) -> None:
            env_names: Union[List[str], AbstractSet[str]]
            field_info_from_config = cls.get_field_info(field.name)

            env = field_info_from_config.get('env') or field.field_info.extra.get('env')
            if env is None:
                if field.has_alias:
                    warnings.warn(
                        'aliases are no longer used by BaseSettings to define which environment variables to read. '
                        'Instead use the "env" field setting. '
                        'See https://pydantic-docs.helpmanual.io/usage/settings/#environment-variable-names',
                        FutureWarning,
                    )
                env_names = {cls.env_prefix + field.name}
            elif isinstance(env, str):
                env_names = {env}
            elif isinstance(env, (set, frozenset)):
                env_names = env
            elif sequence_like(env):
                env_names = list(env)
            else:
                raise TypeError(f'invalid field env: {env!r} ({display_as_type(env)}); should be string, list or set')

            if not cls.case_sensitive:
                env_names = env_names.__class__(n.lower() for n in env_names)
            field.field_info.extra['env_names'] = env_names

        @classmethod
        def customise_sources(
            cls,
            init_settings: SettingsSourceCallable,
            env_settings: SettingsSourceCallable,
            file_secret_settings: SettingsSourceCallable,
        ) -> Tuple[SettingsSourceCallable, ...]:
            return init_settings, env_settings, file_secret_settings

        @classmethod
        def parse_env_var(cls, field_name: str, raw_val: str) -> Any:
            return cls.json_loads(raw_val)

    # populated by the metaclass using the Config class defined above, annotated here to help IDEs only
    __config__: ClassVar[Type[Config]]


class InitSettingsSource:
    __slots__ = ('init_kwargs',)

    def __init__(self, init_kwargs: Dict[str, Any]):
        self.init_kwargs = init_kwargs

    def __call__(self, settings: BaseSettings) -> Dict[str, Any]:
        return self.init_kwargs

    def __repr__(self) -> str:
        return f'InitSettingsSource(init_kwargs={self.init_kwargs!r})'


class EnvSettingsSource:
    __slots__ = ('env_file', 'env_file_encoding', 'env_nested_delimiter', 'env_prefix_len')

    def __init__(
        self,
        env_file: Optional[DotenvType],
        env_file_encoding: Optional[str],
        env_nested_delimiter: Optional[str] = None,
        env_prefix_len: int = 0,
    ):
        self.env_file: Optional[DotenvType] = env_file
        self.env_file_encoding: Optional[str] = env_file_encoding
        self.env_nested_delimiter: Optional[str] = env_nested_delimiter
        self.env_prefix_len: int = env_prefix_len

    def __call__(self, settings: BaseSettings) -> Dict[str, Any]:  # noqa C901
        """
        Build environment variables suitable for passing to the Model.
        """
        d: Dict[str, Any] = {}

        if settings.__config__.case_sensitive:
            env_vars: Mapping[str, Optional[str]] = os.environ
        else:
            env_vars = {k.lower(): v for k, v in os.environ.items()}

        dotenv_vars = self._read_env_files(settings.__config__.case_sensitive)
        if dotenv_vars:
            env_vars = {**dotenv_vars, **env_vars}

        for field in settings.__fields__.values():
            env_val: Optional[str] = None
            for env_name in field.field_info.extra['env_names']:
                env_val = env_vars.get(env_name)
                if env_val is not None:
                    break

            is_complex, allow_parse_failure = self.field_is_complex(field)
            if is_complex:
                if env_val is None:
                    # field is complex but no value found so far, try explode_env_vars
                    env_val_built = self.explode_env_vars(field, env_vars)
                    if env_val_built:
                        d[field.alias] = env_val_built
                else:
                    # field is complex and there's a value, decode that as JSON, then add explode_env_vars
                    try:
                        env_val = settings.__config__.parse_env_var(field.name, env_val)
                    except ValueError as e:
                        if not allow_parse_failure:
                            raise SettingsError(f'error parsing env var "{env_name}"') from e

                    if isinstance(env_val, dict):
                        d[field.alias] = deep_update(env_val, self.explode_env_vars(field, env_vars))
                    else:
                        d[field.alias] = env_val
            elif env_val is not None:
                # simplest case, field is not complex, we only need to add the value if it was found
                d[field.alias] = env_val

        return d

    def _read_env_files(self, case_sensitive: bool) -> Dict[str, Optional[str]]:
        env_files = self.env_file
        if env_files is None:
            return {}

        if isinstance(env_files, (str, os.PathLike)):
            env_files = [env_files]

        dotenv_vars = {}
        for env_file in env_files:
            env_path = Path(env_file).expanduser()
            if env_path.is_file():
                dotenv_vars.update(
                    read_env_file(env_path, encoding=self.env_file_encoding, case_sensitive=case_sensitive)
                )

        return dotenv_vars

    def field_is_complex(self, field: ModelField) -> Tuple[bool, bool]:
        """
        Find out if a field is complex, and if so whether JSON errors should be ignored
        """
        if lenient_issubclass(field.annotation, JsonWrapper):
            return False, False

        if field.is_complex():
            allow_parse_failure = False
        elif is_union(get_origin(field.type_)) and field.sub_fields and any(f.is_complex() for f in field.sub_fields):
            allow_parse_failure = True
        else:
            return False, False

        return True, allow_parse_failure

    def explode_env_vars(self, field: ModelField, env_vars: Mapping[str, Optional[str]]) -> Dict[str, Any]:
        """
        Process env_vars and extract the values of keys containing env_nested_delimiter into nested dictionaries.

        This is applied to a single field, hence filtering by env_var prefix.
        """
        prefixes = [f'{env_name}{self.env_nested_delimiter}' for env_name in field.field_info.extra['env_names']]
        result: Dict[str, Any] = {}
        for env_name, env_val in env_vars.items():
            if not any(env_name.startswith(prefix) for prefix in prefixes):
                continue
            # we remove the prefix before splitting in case the prefix has characters in common with the delimiter
            env_name_without_prefix = env_name[self.env_prefix_len :]
            _, *keys, last_key = env_name_without_prefix.split(self.env_nested_delimiter)
            env_var = result
            for key in keys:
                env_var = env_var.setdefault(key, {})
            env_var[last_key] = env_val

        return result

    def __repr__(self) -> str:
        return (
            f'EnvSettingsSource(env_file={self.env_file!r}, env_file_encoding={self.env_file_encoding!r}, '
            f'env_nested_delimiter={self.env_nested_delimiter!r})'
        )


class SecretsSettingsSource:
    __slots__ = ('secrets_dir',)

    def __init__(self, secrets_dir: Optional[StrPath]):
        self.secrets_dir: Optional[StrPath] = secrets_dir

    def __call__(self, settings: BaseSettings) -> Dict[str, Any]:
        """
        Build fields from "secrets" files.
        """
        secrets: Dict[str, Optional[str]] = {}

        if self.secrets_dir is None:
            return secrets

        secrets_path = Path(self.secrets_dir).expanduser()

        if not secrets_path.exists():
            warnings.warn(f'directory "{secrets_path}" does not exist')
            return secrets

        if not secrets_path.is_dir():
            raise SettingsError(f'secrets_dir must reference a directory, not a {path_type(secrets_path)}')

        for field in settings.__fields__.values():
            for env_name in field.field_info.extra['env_names']:
                path = find_case_path(secrets_path, env_name, settings.__config__.case_sensitive)
                if not path:
                    # path does not exist, we currently don't return a warning for this
                    continue

                if path.is_file():
                    secret_value = path.read_text().strip()
                    if field.is_complex():
                        try:
                            secret_value = settings.__config__.parse_env_var(field.name, secret_value)
                        except ValueError as e:
                            raise SettingsError(f'error parsing env var "{env_name}"') from e

                    secrets[field.alias] = secret_value
                else:
                    warnings.warn(
                        f'attempted to load secret file "{path}" but found a {path_type(path)} instead.',
                        stacklevel=4,
                    )
        return secrets

    def __repr__(self) -> str:
        return f'SecretsSettingsSource(secrets_dir={self.secrets_dir!r})'


def read_env_file(
    file_path: StrPath, *, encoding: str = None, case_sensitive: bool = False
) -> Dict[str, Optional[str]]:
    try:
        from dotenv import dotenv_values
    except ImportError as e:
        raise ImportError('python-dotenv is not installed, run `pip install pydantic[dotenv]`') from e

    file_vars: Dict[str, Optional[str]] = dotenv_values(file_path, encoding=encoding or 'utf8')
    if not case_sensitive:
        return {k.lower(): v for k, v in file_vars.items()}
    else:
        return file_vars


def find_case_path(dir_path: Path, file_name: str, case_sensitive: bool) -> Optional[Path]:
    """
    Find a file within path's directory matching filename, optionally ignoring case.
    """
    for f in dir_path.iterdir():
        if f.name == file_name:
            return f
        elif not case_sensitive and f.name.lower() == file_name.lower():
            return f
    return None
