import json
from enum import Enum
from typing import TYPE_CHECKING, Any, Callable, Dict, ForwardRef, Optional, Tuple, Type, Union

from lotas.erdos._vendor.typing_extensions import Literal, Protocol

from lotas.erdos._vendor.pydantic.typing import AnyArgTCallable, AnyCallable
from lotas.erdos._vendor.pydantic.utils import GetterDict
from lotas.erdos._vendor.pydantic.version import compiled

if TYPE_CHECKING:
    from typing import overload

    from lotas.erdos._vendor.pydantic.fields import ModelField
    from lotas.erdos._vendor.pydantic.main import BaseModel

    ConfigType = Type['BaseConfig']

    class SchemaExtraCallable(Protocol):
        @overload
        def __call__(self, schema: Dict[str, Any]) -> None:
            pass

        @overload
        def __call__(self, schema: Dict[str, Any], model_class: Type[BaseModel]) -> None:
            pass

else:
    SchemaExtraCallable = Callable[..., None]

__all__ = 'BaseConfig', 'ConfigDict', 'get_config', 'Extra', 'inherit_config', 'prepare_config'


class Extra(str, Enum):
    allow = 'allow'
    ignore = 'ignore'
    forbid = 'forbid'


# https://github.com/cython/cython/issues/4003
# Fixed in Cython 3 and Pydantic v1 won't support Cython 3.
# Pydantic v2 doesn't depend on Cython at all.
if not compiled:
    from lotas.erdos._vendor.typing_extensions import TypedDict

    class ConfigDict(TypedDict, total=False):
        title: Optional[str]
        anystr_lower: bool
        anystr_strip_whitespace: bool
        min_anystr_length: int
        max_anystr_length: Optional[int]
        validate_all: bool
        extra: Extra
        allow_mutation: bool
        frozen: bool
        allow_population_by_field_name: bool
        use_enum_values: bool
        fields: Dict[str, Union[str, Dict[str, str]]]
        validate_assignment: bool
        error_msg_templates: Dict[str, str]
        arbitrary_types_allowed: bool
        orm_mode: bool
        getter_dict: Type[GetterDict]
        alias_generator: Optional[Callable[[str], str]]
        keep_untouched: Tuple[type, ...]
        schema_extra: Union[Dict[str, object], 'SchemaExtraCallable']
        json_loads: Callable[[str], object]
        json_dumps: AnyArgTCallable[str]
        json_encoders: Dict[Type[object], AnyCallable]
        underscore_attrs_are_private: bool
        allow_inf_nan: bool
        copy_on_model_validation: Literal['none', 'deep', 'shallow']
        # whether dataclass `__post_init__` should be run after validation
        post_init_call: Literal['before_validation', 'after_validation']

else:
    ConfigDict = dict  # type: ignore


class BaseConfig:
    title: Optional[str] = None
    anystr_lower: bool = False
    anystr_upper: bool = False
    anystr_strip_whitespace: bool = False
    min_anystr_length: int = 0
    max_anystr_length: Optional[int] = None
    validate_all: bool = False
    extra: Extra = Extra.ignore
    allow_mutation: bool = True
    frozen: bool = False
    allow_population_by_field_name: bool = False
    use_enum_values: bool = False
    fields: Dict[str, Union[str, Dict[str, str]]] = {}
    validate_assignment: bool = False
    error_msg_templates: Dict[str, str] = {}
    arbitrary_types_allowed: bool = False
    orm_mode: bool = False
    getter_dict: Type[GetterDict] = GetterDict
    alias_generator: Optional[Callable[[str], str]] = None
    keep_untouched: Tuple[type, ...] = ()
    schema_extra: Union[Dict[str, Any], 'SchemaExtraCallable'] = {}
    json_loads: Callable[[str], Any] = json.loads
    json_dumps: Callable[..., str] = json.dumps
    json_encoders: Dict[Union[Type[Any], str, ForwardRef], AnyCallable] = {}
    underscore_attrs_are_private: bool = False
    allow_inf_nan: bool = True

    # whether inherited models as fields should be reconstructed as base model,
    # and whether such a copy should be shallow or deep
    copy_on_model_validation: Literal['none', 'deep', 'shallow'] = 'shallow'

    # whether `Union` should check all allowed types before even trying to coerce
    smart_union: bool = False
    # whether dataclass `__post_init__` should be run before or after validation
    post_init_call: Literal['before_validation', 'after_validation'] = 'before_validation'

    @classmethod
    def get_field_info(cls, name: str) -> Dict[str, Any]:
        """
        Get properties of FieldInfo from the `fields` property of the config class.
        """

        fields_value = cls.fields.get(name)

        if isinstance(fields_value, str):
            field_info: Dict[str, Any] = {'alias': fields_value}
        elif isinstance(fields_value, dict):
            field_info = fields_value
        else:
            field_info = {}

        if 'alias' in field_info:
            field_info.setdefault('alias_priority', 2)

        if field_info.get('alias_priority', 0) <= 1 and cls.alias_generator:
            alias = cls.alias_generator(name)
            if not isinstance(alias, str):
                raise TypeError(f'Config.alias_generator must return str, not {alias.__class__}')
            field_info.update(alias=alias, alias_priority=1)
        return field_info

    @classmethod
    def prepare_field(cls, field: 'ModelField') -> None:
        """
        Optional hook to check or modify fields during model creation.
        """
        pass


def get_config(config: Union[ConfigDict, Type[object], None]) -> Type[BaseConfig]:
    if config is None:
        return BaseConfig

    else:
        config_dict = (
            config
            if isinstance(config, dict)
            else {k: getattr(config, k) for k in dir(config) if not k.startswith('__')}
        )

        class Config(BaseConfig):
            ...

        for k, v in config_dict.items():
            setattr(Config, k, v)
        return Config


def inherit_config(self_config: 'ConfigType', parent_config: 'ConfigType', **namespace: Any) -> 'ConfigType':
    if not self_config:
        base_classes: Tuple['ConfigType', ...] = (parent_config,)
    elif self_config == parent_config:
        base_classes = (self_config,)
    else:
        base_classes = self_config, parent_config

    namespace['json_encoders'] = {
        **getattr(parent_config, 'json_encoders', {}),
        **getattr(self_config, 'json_encoders', {}),
        **namespace.get('json_encoders', {}),
    }

    return type('Config', base_classes, namespace)


def prepare_config(config: Type[BaseConfig], cls_name: str) -> None:
    if not isinstance(config.extra, Extra):
        try:
            config.extra = Extra(config.extra)
        except ValueError:
            raise ValueError(f'"{cls_name}": {config.extra} is not a valid value for "extra"')
