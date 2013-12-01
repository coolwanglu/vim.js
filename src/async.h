/*
 * functions and macros for async functions calls
 * Copyright (c) 2013 Lu Wang <coolwanglu@gmail.com>
 */
#ifdef FEAT_GUI_BROWSER
#include <string.h>
#include <stdlib.h>

/*
 * Everything we need to store for async functions
 * async_context_struct are chained, it works pretty much as a custom stack, 
 * which stores local variables and return values
 */
typedef struct { } async_context;

// used to insert argument for function declarations
#define DECL_ASYNC_ARG ,async_context * _async_context
#define DECL_ASYNC_ARG_ONLY async_context * _async_context
#define DECL_ASYNC_ARG_FIRST async_context * _async_context,
// the KR style
#define DECL_ASYNC_ARG_KR async_context * _async_context;

// used when calling async functions
#define ASYNC_ARG , _async_context
#define ASYNC_ARG_ONLY _async_context
#define ASYNC_ARG_FIRST _async_context,

#else // FEAT_GUI_BROWSER

#define DECL_ASYNC_ARG 
#define DECL_ASYNC_ARG1
#define DECL_ASYNC_ARG2
#define ASYNC_ARG 
#define ASYNC_ARG_ONLY 
#define ASYNC_ARG_FIRST 

#endif // FEAT_GUI_BROWSER
