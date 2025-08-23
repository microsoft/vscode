"""
This is not a plugin, this is just the place were plugins are registered.
"""

from erdos.erdos._vendor.jedi.plugins import stdlib
from erdos.erdos._vendor.jedi.plugins import flask
from erdos.erdos._vendor.jedi.plugins import pytest
from erdos.erdos._vendor.jedi.plugins import django
from erdos.erdos._vendor.jedi.plugins import plugin_manager


plugin_manager.register(stdlib, flask, pytest, django)
