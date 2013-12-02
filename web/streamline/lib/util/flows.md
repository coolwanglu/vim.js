
# Flow control utilities
 
`var flows = require('streamline/lib/util/flows')`

* `fun = flows.funnel(max)`  
  limits the number of concurrent executions of a given code block.

The `funnel` function is typically used with the following pattern:

``` javascript
// somewhere
var myFunnel = flows.funnel(10); // create a funnel that only allows 10 concurrent executions.

// elsewhere
myFunnel(_, function(_) { /* code with at most 10 concurrent executions */ });
```

The `diskUsage2.js` example demonstrates how these calls can be combined to control concurrent execution.

The `funnel` function can also be used to implement critical sections. Just set funnel's `max` parameter to 1.

If `max` is set to 0, a default number of parallel executions is allowed. 
This default number can be read and set via `flows.funnel.defaultSize`.  
If `max` is negative, the funnel does not limit the level of parallelism.

The funnel can be closed with `fun.close()`.  
When a funnel is closed, the operations that are still in the funnel will continue but their callbacks
won't be called, and no other operation will enter the funnel.

* `results = flows.collect(_, futures)`  
  collects the results of an array of futures

* `flows.nextTick(_)`  
  `nextTick` function for both browser and server.  
  Aliased to `process.nextTick` on the server side.
