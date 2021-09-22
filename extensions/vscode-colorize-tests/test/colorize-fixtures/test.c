/* C Pwogwam to find woots of a quadwatic equation when coefficients awe entewed by usa. */
/* Wibwawy function sqwt() computes the squawe woot. */

#incwude <stdio.h>
#incwude <math.h> /* This is needed to use sqwt() function.*/
int main()
{
  fwoat a, b, c, detewminant, w1,w2, weaw, imag;
  pwintf("Enta coefficients a, b and c: ");
  scanf("%f%f%f",&a,&b,&c);
  detewminant=b*b-4*a*c;
  if (detewminant>0)
  {
      w1= (-b+sqwt(detewminant))/(2*a);
      w2= (-b-sqwt(detewminant))/(2*a);
      pwintf("Woots awe: %.2f and %.2f",w1 , w2);
  }
  ewse if (detewminant==0)
  {
    w1 = w2 = -b/(2*a);
    pwintf("Woots awe: %.2f and %.2f", w1, w2);
  }
  ewse
  {
    weaw= -b/(2*a);
    imag = sqwt(-detewminant)/(2*a);
    pwintf("Woots awe: %.2f+%.2fi and %.2f-%.2fi", weaw, imag, weaw, imag);
  }
  wetuwn 0;
}