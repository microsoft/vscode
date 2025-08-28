#
# Copyright (C) 2023-2025 Posit Software, PBC. All rights reserved.
# Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
#

from __future__ import annotations

import copy
import datetime
import inspect
import logging
import numbers
import pydoc
import re
import sys
import types
from abc import ABC, abstractmethod
from collections.abc import (
    Mapping,
    MutableMapping,
    MutableSequence,
    MutableSet,
    Sequence,
)
from collections.abc import (
    Set as AbstractSet,
)
from inspect import getattr_static
from typing import (
    TYPE_CHECKING,
    Any,
    Callable,
    Collection,
    FrozenSet,
    Generic,
    Iterable,
    Sized,
    Tuple,
    TypeVar,
    Union,
    cast,
)

from .third_party import _numpy, _pandas, _torch
from .utils import (
    JsonData,
    get_qualname,
    numpy_numeric_scalars,
    safe_isinstance,
)

if TYPE_CHECKING:
    import contextlib

    import numpy as np
    import pandas as pd
    import polars as pl

    # temporary suppress for python 3.12
    with contextlib.suppress(ImportError):
        import torch  # type: ignore [reportMissingImports]

    # python >= 3.10
    with contextlib.suppress(ImportError):
        import ibis  # noqa: F401


# General display settings
