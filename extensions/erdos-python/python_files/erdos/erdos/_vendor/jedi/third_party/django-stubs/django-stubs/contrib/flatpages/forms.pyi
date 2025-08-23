from typing import Any

from django import forms

class FlatpageForm(forms.ModelForm):
    url: Any = ...
    def clean_url(self) -> str: ...
