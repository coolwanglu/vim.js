
# Container for global context

The `globals` module is a container for the global `context` object which is maintained across
asynchronous calls.

This context is very handy to store information that all calls should be able to access
but that you don't want to pass explicitly via function parameters. The most obvious example is
the `locale` that each request may set differently and that your low level libraries should
be able to retrieve to format messages.

`var globals = require('streamline/lib/globals')`

* `globals.context = ctx`
* `ctx = globals.context`  
  sets and gets the context

Note: an empty context (`{}`) is automatically set by the server wrappers of the `streams` module,
before they dispatch a request. So, with these wrappers, each request starts with a fresh empty context.
