/*  vim: set sw=2 ts=2 et : */
/*
 * vim_post.js
 * Load vim with callback
 *
 *
 * Copyright (c) 2013 Lu Wang <coolwanglu@gmail.com>
 */

// assume that we don't have any dependencies
// call _main with callback
(function (_, args) {
  assert(((runDependencies == 0)), "cannot call main when async dependencies remain! (listen on __ATMAIN__)");
  assert(((__ATPRERUN__.length == 0)), "cannot call main when preRun functions remain to be called");
  args = ((args || []));
  ensureInitRuntime();

  // setup environment
  ENV['USER'] = 'root';
  ENV['HOME'] = '/root'; 
  ENV['PWD'] = '/root';
  ENV['_'] = '/bin/vim';

  // setup dirs
  Module["FS_createPath"]("/", "root", true, true);
  FS.currentPath = '/root';

  var argc = ((args.length + 1));
  function pad() {
    for (var i = 0; i < 3; ++i) {
      argv.push(0); 
    }
  }
  var argv = [allocate(intArrayFromString("/bin/vim"), "i8", ALLOC_NORMAL),];
  pad();
  for (var i = 0; i < argc - 1; ++i) {
    argv.push(allocate(intArrayFromString(args[i]), "i8", ALLOC_NORMAL));
    pad(); 
  }
  argv.push(0);
  argv = allocate(argv, "i32", ALLOC_NORMAL);
  initialStackTop = STACKTOP;
  try {
    var crashed = false;
    var ret = Module["_main"](_, argc, argv, 0);
    if (!Module["noExitRuntime"]) {
      exit(ret); 
    } 
  } catch (e) {
    if (e instanceof ExitStatus) {
    } else if (e == "SimulateInfiniteLoop") {
      Module["noExitRuntime"] = true;
    } else {
      crashed = true;

      if (e && (typeof e === "object") && e.stack) {
        Module.printErr("exception thrown: " + [e,e.stack,]); 
      }
      throw e; 
    }
  } finally {
    calledMain = true; 
//    Module["vimjs-exit"](crashed);
  }
})(function(){ console.log('Vim.js exited.'); }, [/* command line args for vim */]);
