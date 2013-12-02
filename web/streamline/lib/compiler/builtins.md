
# Streamline built-ins
 
## Array functions  

These functions are asynchronous variants of the EcmaScript 5 Array functions.

Common Rules: 

These variants are postfixed by an underscore.  
They take the `_` callback as first parameter.  
They pass the `_` callback as first argument to their `fn` callback.  
Most of them have an optional `options` second parameter which controls the level of 
parallelism. This `options` parameter may be specified either as `{ parallel: par }` 
where `par` is an integer, or directly as a `par` integer value.  
The `par` values are interpreted as follows:

* If absent or equal to 1, execution is sequential.
* If > 1, at most `par` operations are parallelized.
* if 0, a default number of operations are parallelized. 
  This default is defined by `flows.funnel.defaultSize` (4 by default - see `flows` module).
* If < 0 or Infinity, operations are fully parallelized (no limit).

Functions:

* `array.forEach_(_[, options], fn[, thisObj])`  
  `fn` is called as `fn(_, elt, i)`.
* `result = array.map_(_[, options], fn[, thisObj])`  
  `fn` is called as `fn(_, elt, i)`.
* `result = array.filter_(_[, options], fn[, thisObj])`  
  `fn` is called as `fn(_, elt)`.
* `bool = array.every_(_[, options], fn[, thisObj])`  
  `fn` is called as `fn(_, elt)`.
* `bool = array.some_(_[, options], fn[, thisObj])`  
  `fn` is called as `fn(_, elt)`.
* `result = array.reduce_(_, fn, val[, thisObj])`  
  `fn` is called as `val = fn(_, val, elt, i, array)`.
* `result = array.reduceRight_(_, fn, val[, thisObj])`  
  `fn` is called as `val = fn(_, val, elt, i, array)`.
* `array = array.sort_(_, compare [, beg [, end]])`  
  `compare` is called as `cmp = compare(_, elt1, elt2)`.  
  Note: this function _changes_ the original array (and returns it).

## Function functions  

* `result = fn.apply_(_, thisObj, args[, index])`  
  Helper to use `Function.prototype.apply` inside streamlined functions.  
  Equivalent to `result = fn.apply(thisObj, argsWith_)` where `argsWith_` is 
  a modified `args` in which the callback has been inserted at `index` 
  (at the end of the argument list if `index` is omitted or negative).
