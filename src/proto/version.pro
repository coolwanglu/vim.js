/* version.c */
async_context *async_push __ARGS((async_context *prev_context, async_callback_t callback));
void async_put __ARGS((async_context *context, char *value, size_t length));
void async_get __ARGS((char **p, async_context *context, char *value, size_t length));
void async_return __ARGS((async_context *context));
async_context *async_pop __ARGS((async_context *context));
void make_version __ARGS((void));
int highest_patch __ARGS((void));
int has_patch __ARGS((int n));
void ex_version __ARGS((exarg_T *eap));
void list_version __ARGS((void));
void maybe_intro_message __ARGS((void));
void intro_message __ARGS((int colon));
void ex_intro __ARGS((exarg_T *eap));
/* vim: set ft=c : */
