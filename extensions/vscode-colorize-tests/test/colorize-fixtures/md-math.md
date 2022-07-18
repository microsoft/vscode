<!-- Should highlight math blocks -->

$$
\theta
$$

**md**

$$
\theta{ % comment
$$

**md**

$$
\relax{x}{1} = \int_{-\infty}^\infty
    \hat\xi\,e^{2 \pi i \xi x}
    \,d\xi % comment
$$

**md**

$
x = 1.1 \int_{a}
$

**md**

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

<!-- Should be disabled in comments -->

<!--
$$
\theta % comment
$$
-->

<!-- Should be disabled in fenced code blocks -->

```txt
$$
\displaystyle
\left( \sum_{k=1}^n a_k b_k \right)^2
\leq
\left( \sum_{k=1}^n a_k^2 \right)
\left( \sum_{k=1}^n b_k^2 \right)
$$
```

<!-- #128411 -->

- list item
    **abc**
    $$
    \begin{aligned}
        &\text{Any equation}
        \\
        &\text {Inconsistent KaTeX keyword highlighting}
    \end{aligned}
    $$
    **xyz**


<!-- Support both \text{stuff} and \text {stuff} -->

$$
\text{stuff}
\text {stuff}
$$

<!-- Should not highlight inside of raw code block -->

    $$
    \frac{1}{2}
    $$

<!-- Should highlight leading and trailing equations on same line  -->

$$ \vec{a}
\vec{a}
\vec{a} $$

**md**

$ \vec{a}
\vec{a}
\vec{a} $

**md**

\vec{a}

**md**

$ \vec{a}
\vec{a}
 = [2, 3] $

<!-- Should highlight inline blocks -->

a **b** $$
    **b**

**md**

a **b** $$
    \frac{1}{2}
    $$
    **b**

**p**

a **b**
    $$
    \frac{1}{2}
    $$
    **b**

<!-- Should allow inline code to be followed by non word character #136584 -->

Should be highlighted $\frac{1}{2}$.

Should not be highlighted $\frac{1}{2}$text

Should not be highlighted $\frac{1}{2}$10

<!-- Should not highlight dollar amount at start of line #136535 -->

$12.45

$12.45 x

x $12.45

<!-- Should not interpret text for skipped percent (\%) -->

$$ \% Should not be highlighted $$
