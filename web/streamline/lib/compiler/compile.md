
# Compiler and file loader
 
`var compiler = require('streamline/lib/compiler/compile')`

* `compiler.compile(_, paths, options)`  
  Compiles streamline source files in `paths`.  
  Generates a `foo.js` file for each `foo._js` file found in `paths`.
  `paths` may be a list of files or a list of directories which
  will be traversed recursively.  
  `options`  is a set of options for the `transform` operation.
