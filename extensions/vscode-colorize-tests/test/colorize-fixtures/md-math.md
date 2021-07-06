<!-- Should highlight math blocks -->

$$
\theta
$$

$$
\theta{ % comment
$$

**a**

$$
\relax{x}{1} = \int_{-\infty}^\infty
    \hat\xi\,e^{2 \pi i \xi x}
    \,d\xi % comment
$$

$
x = 1.1 \int_{a}
$

$
\begin{smallmatrix}
   1 & 2 \\
   4 & 3
\end{smallmatrix}
$

$
x = a_0 + \frac{1}{a_1 + \frac{1}{a_2 + \frac{1}{a_3 + a_4}}}
$

$
\displaystyle {1 + \frac{q^2}{(1-q)}+\frac{q^6}{(1-q)(1-q^2)}+\cdots }= \prod_{j=0}^{\infty}\frac{1}{(1-q^{5j+2})(1-q^{5j+3})}, \quad\quad \text{for }\lvert q\rvert<1.
$

<!--  Should highlight inline -->

a **a** $$ \theta $$ aa a **a**

a **a** $ \theta $ aa a **a**

$ \theta $

$$ 1 \theta 1 1 $$

<!--  Should not highlight inline cases without whitespace -->

$10 $20

**a** $10 $20 **a**

**a** a $10 $20 a **a**

a **a**$ \theta $aa a **a**

a **a**$$ \theta $$aa a **a**

<!--
$$
\theta % comment
$$
-->

Should be disabled in fenced code blocks:

```txt
$$
\displaystyle
\left( \sum_{k=1}^n a_k b_k \right)^2
\leq
\left( \sum_{k=1}^n a_k^2 \right)
\left( \sum_{k=1}^n b_k^2 \right)
$$
```
