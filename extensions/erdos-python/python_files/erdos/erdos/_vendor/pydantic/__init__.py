# flake8: noqa
from erdos.erdos._vendor.pydantic import dataclasses
from erdos.erdos._vendor.pydantic.annotated_types import create_model_from_namedtuple, create_model_from_typeddict
from erdos.erdos._vendor.pydantic.class_validators import root_validator, validator
from erdos.erdos._vendor.pydantic.config import BaseConfig, ConfigDict, Extra
from erdos.erdos._vendor.pydantic.decorator import validate_arguments
from erdos.erdos._vendor.pydantic.env_settings import BaseSettings
from erdos.erdos._vendor.pydantic.error_wrappers import ValidationError
from erdos.erdos._vendor.pydantic.errors import *
from erdos.erdos._vendor.pydantic.fields import Field, PrivateAttr, Required
from erdos.erdos._vendor.pydantic.main import *
from erdos.erdos._vendor.pydantic.networks import *
from erdos.erdos._vendor.pydantic.parse import Protocol
from erdos.erdos._vendor.pydantic.tools import *
from erdos.erdos._vendor.pydantic.types import *
from erdos.erdos._vendor.pydantic.version import VERSION, compiled

__version__ = VERSION

# WARNING __all__ from pydantic.errors is not included here, it will be removed as an export here in v2
# please use "from pydantic.errors import ..." instead
__all__ = [
    # annotated types utils
    'create_model_from_namedtuple',
    'create_model_from_typeddict',
    # dataclasses
    'dataclasses',
    # class_validators
    'root_validator',
    'validator',
    # config
    'BaseConfig',
    'ConfigDict',
    'Extra',
    # decorator
    'validate_arguments',
    # env_settings
    'BaseSettings',
    # error_wrappers
    'ValidationError',
    # fields
    'Field',
    'Required',
    # main
    'BaseModel',
    'create_model',
    'validate_model',
    # network
    'AnyUrl',
    'AnyHttpUrl',
    'FileUrl',
    'HttpUrl',
    'stricturl',
    'EmailStr',
    'NameEmail',
    'IPvAnyAddress',
    'IPvAnyInterface',
    'IPvAnyNetwork',
    'PostgresDsn',
    'CockroachDsn',
    'AmqpDsn',
    'RedisDsn',
    'MongoDsn',
    'KafkaDsn',
    'validate_email',
    # parse
    'Protocol',
    # tools
    'parse_file_as',
    'parse_obj_as',
    'parse_raw_as',
    'schema_of',
    'schema_json_of',
    # types
    'NoneStr',
    'NoneBytes',
    'StrBytes',
    'NoneStrBytes',
    'StrictStr',
    'ConstrainedBytes',
    'conbytes',
    'ConstrainedList',
    'conlist',
    'ConstrainedSet',
    'conset',
    'ConstrainedFrozenSet',
    'confrozenset',
    'ConstrainedStr',
    'constr',
    'PyObject',
    'ConstrainedInt',
    'conint',
    'PositiveInt',
    'NegativeInt',
    'NonNegativeInt',
    'NonPositiveInt',
    'ConstrainedFloat',
    'confloat',
    'PositiveFloat',
    'NegativeFloat',
    'NonNegativeFloat',
    'NonPositiveFloat',
    'FiniteFloat',
    'ConstrainedDecimal',
    'condecimal',
    'ConstrainedDate',
    'condate',
    'UUID1',
    'UUID3',
    'UUID4',
    'UUID5',
    'FilePath',
    'DirectoryPath',
    'Json',
    'JsonWrapper',
    'SecretField',
    'SecretStr',
    'SecretBytes',
    'StrictBool',
    'StrictBytes',
    'StrictInt',
    'StrictFloat',
    'PaymentCardNumber',
    'PrivateAttr',
    'ByteSize',
    'PastDate',
    'FutureDate',
    # version
    'compiled',
    'VERSION',
]
