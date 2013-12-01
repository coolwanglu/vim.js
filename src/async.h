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
typedef struct async_context_struct
{
    union
    {
        int i;
        void *p;
    } ret;
    char * data;
    size_t data_used;
    size_t data_len;
    int (*callback)(struct async_context_struct *);
    struct async_context_struct * prev_context;
} async_context;

typedef int (*async_callback_t)(async_context *);


/*
 * Initialize a new async context before calling a new async function
 */
inline 
async_context *
async_push( async_context * prev_context, async_callback_t callback )
{
    async_context * ctx = malloc(sizeof(async_context));
    ctx->data = NULL;
    ctx->data_used = 0;
    ctx->data_len = 0;
    ctx->prev_context = prev_context;
    ctx->callback = callback;
    return ctx;
}

/*
 * store parameters into the context
 * no mem check here
 */
inline
void 
async_put( async_context * context, char * value, size_t length)
{
    if(!(context->data))
    {
        context->data = malloc(length);
        context->data_used = 0;
        context->data_len = length;
    }

    size_t need_len = context->data_used + length;
    if(need_len > context->data_len)
    {
        while(need_len > context->data_len)
            context->data_len *= 2;
        context->data = realloc(context->data, context->data_len);
    }

    memcpy(context->data+context->data_used, value, length);
    context->data_used += length;
}


/*
 * get parameters from the context
 * p is the pointer used so far
 * no mem check here
 */
inline
void
async_get( char ** p, async_context * context, char * value, size_t length)
{
    if((*p) == NULL)
        *p = context->data;
    memcpy(value, *p, length);
    (*p) += length;
}



/*
 * Resume the previous context 
 */
inline
void 
async_return(async_context * context)
{
    (*(context->callback))(context);
}

/*
 * Return to previous async context
 */
inline
async_context * 
async_pop( async_context * context)
{
    async_context * prev_context = context->prev_context;
    free(context->data);
    free(context);
    return prev_context;
}

// used to insert argument for function declarations
#define DECL_ASYNC_ARG ,async_context * _async_context
#define DECL_ASYNC_ARG1 async_context * _async_context

// a hidden variable to store context
#define ASYNC_CTX _async_context

// used when calling async functions
#define ASYNC_ARG , ASYNC_CTX
#define ASYNC_ARG1 ASYNC_CTX

// declare/define common callback functions
#define DEFINE_ASYNC_CALLBACK(fn) static int fn (async_context * ASYNC_CTX)

// insert a new callback to the context
#define ASYNC_PUSH(callback) (ASYNC_CTX = async_push(ASYNC_CTX, callback))
// used in callback, to get the previous context
#define ASYNC_POP (ASYNC_CTX = async_pop(ASYNC_CTX))
// used in callback, make sure that we have called ASYNC_PUSH and ASYNC_POP properly
#define ASYNC_CHECK(func) (assert(ASYNC_CTX->callback == func));

// send and retrive the return value between callbacks
// integer
#define ASYNC_RETVAL (ASYNC_CTX->ret.i)
#define ASYNC_RETURN(reti) { int _async_ret = (int)(reti); \
    ASYNC_CTX->ret.i = _async_ret; \
    async_return(ASYNC_CTX); \
    return _async_ret; }
// pointer
#define ASYNC_RETVAL_P (ASYNC_CTX->ret.p)
#define ASYNC_RETURN_P(retp) { void * _async_ret = (void*)(retp); \
    ASYNC_CTX->ret.p = _async_ret; \
    async_return(ASYNC_CTX); \
    return _async_ret; }
#define ASYNC_RETURN_P_(retp, ret2) { void * _async_ret = (void*)(retp); \
    ASYNC_CTX->ret.p = _async_ret; \
    async_return(ASYNC_CTX); \
    return ret2; }


// store something in the context
#define ASYNC_PUT(val) async_put(ASYNC_CTX, ((char*)(&val)), sizeof(val));

// retrive somethinbg from the context, must be in the same order/type as stored
#define ASYNC_GET_INIT char * _async_get_pointer = NULL;
#define ASYNC_GET_T(T, val) T val;async_get(&_async_get_pointer, ASYNC_CTX, ((char*)(&val)), sizeof(val));
#define ASYNC_GET(val) ASYNC_GET_T(int, val)

// to push/get lots of variables
#define DEFINE_ASYNC_VARIABLE_STORE(fn) struct async_variable_store__##fn

#define ASYNC_CLEAR_DATA ASYNC_CTX->data_used = 0;

#else // FEAT_GUI_BROWSER
#define DECL_ASYNC_ARG 
#define ASYNC_ARG 
#define ASYNC_ARG1 
#define ASYNC_RETURN(ret) return (ret)
#define ASYNC_PUSH(callback)
#define ASYNC_POP
#endif // FEAT_GUI_BROWSER
