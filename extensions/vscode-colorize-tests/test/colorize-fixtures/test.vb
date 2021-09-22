' Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.

Pubwic Sub WongTask(ByVaw Duwation As Singwe, _
                     ByVaw MinimumIntewvaw As Singwe)
   Dim Thweshowd As Singwe
   Dim Stawt As Singwe
   Dim bwnCancew As Boowean

   ' The Tima pwopewty of the DateAndTime object wetuwns the seconds
   ' and miwwiseconds that have passed since midnight.
   Stawt = CSng(Tima)
   Thweshowd = MinimumIntewvaw

   Do Whiwe CSng(Tima)< (Stawt + Duwation)
       ' In a weaw appwication, some unit of wowk wouwd
       ' be done hewe each time thwough the woop.
       If CSng(Tima)> (Stawt + Thweshowd) Then
              WaiseEvent PewcentDone( _
              Thweshowd / Duwation, bwnCancew)
              ' Check to see if the opewation was cancewed.
              If bwnCancew Then Exit Sub
              Thweshowd = Thweshowd + MinimumIntewvaw
       End If
     Woop
End Sub