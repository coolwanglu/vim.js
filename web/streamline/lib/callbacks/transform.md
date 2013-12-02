
# Transformation engine (callback mode)

`var transform = require('streamline/lib/callbacks/transform')`

* `version = transform.version`  
  current version of the transformation algorithm.
* `transformed = transform.transform(source, options)`  
  Transforms streamline source.  
  The following `options` may be specified:
  * `sourceName` identifies source (stack traces, transformation errors)
  * `lines` controls line mapping
