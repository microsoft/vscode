# Copyright (c) Microsoft Corporation. All rights reserved.
# Licensed under the MIT License.

from django.apps import AppConfig
from django.utils.functional import cached_property


class PollsConfig(AppConfig):
    @cached_property
    def default_auto_field(self):
        return "django.db.models.BigAutoField"

    name = "polls"
