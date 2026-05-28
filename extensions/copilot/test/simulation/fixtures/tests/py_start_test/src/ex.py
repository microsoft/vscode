from fractions import Fraction

def decimal_to_fraction(decimal):
    """
    Converts a decimal number to a fraction.
    """
    return Fraction(decimal).limit_denominator()

def fraction_to_decimal(numerator, denominator):
    """
    Converts a fraction to a decimal number.
    """
    return numerator / denominator