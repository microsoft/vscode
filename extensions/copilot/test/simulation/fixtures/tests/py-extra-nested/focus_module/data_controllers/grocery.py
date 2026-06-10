class GroceryItem:
    def __init__(self, name, price, quantity):
        self.name = name
        self.price = price
        self.quantity = quantity

def create_grocery_item(name, price, quantity):
    return GroceryItem(name, price, quantity)