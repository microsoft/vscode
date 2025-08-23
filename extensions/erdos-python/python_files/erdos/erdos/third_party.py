#
# Copyright (C) 2025 Lotas Inc. All rights reserved.
# Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
#


def _numpy():
    import numpy

    return numpy


def _pandas():
    import pandas as pd

    return pd


def _polars():
    import polars as pl

    return pl


def _torch():
    import torch

    return torch


def _pyarrow():
    import pyarrow as pa

    return pa


def _sqlalchemy():
    import sqlalchemy

    return sqlalchemy


__all__ = ["_numpy", "_pandas", "_polars", "_pyarrow", "_sqlalchemy", "_torch"]


def is_pandas(table):
    try:
        import pandas as pd
    except ImportError:
        return False

    return bool(isinstance(table, (pd.DataFrame, pd.Series)))


def is_polars(table):
    try:
        import polars as pl
    except ImportError:
        return False

    return bool(isinstance(table, (pl.DataFrame, pl.Series)))




















