import threading


class BankAccount:
    def __init__(self):
        self.is_open = False
        self.balance = None
        self.lock = threading.Lock()

    def get_balance(self):
        with self.lock:
            if not self.is_open:
                raise ValueError('account not open')
            return self.balance

    def open(self):
        if self.is_open:
            raise ValueError('account already open')
        self.is_open = True
        self.balance = 0

    def deposit(self, amount):
        with self.lock:
            if not self.is_open:
                raise ValueError('account not open')
            if amount <= 0:
                raise ValueError('amount must be greater than 0')
            self.balance += amount

    def withdraw(self, amount):
        with self.lock:
            if not self.is_open:
                raise ValueError('account not open')
            if amount <= 0:
                raise ValueError('amount must be greater than 0')
            if amount > self.balance:
                raise ValueError('amount must be less than balance')
            self.balance -= amount

    def close(self):
        if not self.is_open:
            raise ValueError('account not open')
        self.is_open = False