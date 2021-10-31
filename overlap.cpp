 when (src, dst)
  {
    src.balance = src.balance - amount;
    dst.balance = dst.balance + amount;
  }

   when (acct)
  {
    acct.balance = acct.balance - amount;
    acct.balance = acct.balance + amount;
  }
