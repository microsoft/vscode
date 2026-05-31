*italics*, **bold**, ``literal``.

1. A list
2. With items
   - With sub-lists ...
   - ... of things.
3. Other things

definition list
  A list of terms and their definition

Literal block::

    x = 2 + 3


Section separators are all interchangeable.

=====
Title
=====

--------
Subtitle
--------

Section 1
=========

Section 2
---------

Section 3
~~~~~~~~~

| Keeping line
| breaks.


+-------------+--------------+
| Fancy table | with columns |
+=============+==============+
| row 1, col 1| row 1, col 2 |
+-------------+--------------+

============ ============
Simple table with columns
============ ============
row 1, col1  row 1, col 2
============ ============

Block quote is indented.

  This space intentionally not important.

Doctest block

>>> 2 +3
5

A footnote [#note]_.

.. [#note]  https://docutils.sourceforge.io/docs/ref/rst/restructuredtext.html#footnotes


Citation [cite]_.

.. [cite] https://bing.com

a simple link_.

A `fancier link`_ .

.. _link: https://docutils.sourceforge.io/
.. _fancier link: https://www.sphinx-doc.org/en/master/usage/restructuredtext/basics.html


An `inline link <https://code.visualstudio.com>`__ .

.. image:: https://code.visualstudio.com/assets/images/code-stable.png

.. function: example()
   :module: mod


:sub:`subscript`
:sup:`superscript`

.. This is a comment.

..
  And a bigger,
  longer comment.


A |subst| of something.

.. |subst| replace:: substitution
