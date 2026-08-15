from src.ex import fraction_to_decimal

def test_fraction_to_decimal():
    assert fraction_to_decimal(1, 2) == 0.5
    assert fraction_to_decimal(3, 4) == 0.75
    assert fraction_to_decimal(2, 5) == 0.4
    assert fraction_to_decimal(5, 2) == 2.5
    assert fraction_to_decimal(0, 1) == 0.0