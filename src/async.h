#ifdef ASYNC
#include <string.h>
#include <stdlib.h>

/*
 * Everything we need to store for async functions
 */
typedef struct async_context_struct
{
    union
    {
        int i;
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
async_put( async_context * context, void * value, size_t length)
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
async_get( char ** p, async_context * context, void * value, size_t length)
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
async_return( async_context * context, int ret)
{
    context->ret.i = ret;
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

#define DECL_ASYNC_ARG ,async_context * _async_context
#define ASYNC_ARG _async_context
#define DEFINE_ASYNC_CALLBACK(fn) static int fn (async_context * _async_context)
#define ASYNC_PUSH(callback) (_async_context = async_push(_async_context, callback))
#define ASYNC_POP (_async_context = async_pop(_async_context))
#define ASYNC_RETURN(ret) { int _async_ret = (ret); async_return(_async_context, _async_ret); return _async_ret; }
// used in callback, retrieve retval from previous function
#define ASYNC_RETVAL (_async_context->ret.i)
#define ASYNC_CHECK(func) (assert(_async_context->callback == func));
#define ASYNC_PUT(val) async_put(_async_context, (&val), sizeof(val));
#define ASYNC_GET_INIT char * _async_get_pointer = NULL;
#define ASYNC_GET(val) async_get(&_async_get_pointer, _async_context, val, sizeof(val));

#else
#define DECL_ASYNC_ARG 
#define ASYNC_RETURN(ret) return (ret)
#define ASYNC_PUSH(callback)
#define ASYNC_POP
#endif
