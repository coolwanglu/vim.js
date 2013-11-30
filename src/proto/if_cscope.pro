/* if_cscope.c */
async_context *async_push __ARGS((async_context *prev_context, async_callback_t callback));
void async_put __ARGS((async_context *context, void *value, size_t length));
void async_get __ARGS((char **p, async_context *context, void *value, size_t length));
void async_return __ARGS((async_context *context, int ret));
async_context *async_pop __ARGS((async_context *context));
char_u *get_cscope_name __ARGS((expand_T *xp, int idx));
void set_context_in_cscope_cmd __ARGS((expand_T *xp, char_u *arg, cmdidx_T cmdidx));
void do_cscope __ARGS((exarg_T *eap));
void do_scscope __ARGS((exarg_T *eap));
void do_cstag __ARGS((exarg_T *eap));
int cs_fgets __ARGS((char_u *buf, int size));
void cs_free_tags __ARGS((void));
void cs_print_tags __ARGS((void));
int cs_connection __ARGS((int num, char_u *dbpath, char_u *ppath));
void cs_end __ARGS((void));
/* vim: set ft=c : */
