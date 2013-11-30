/* os_beos.c */
async_context *async_push __ARGS((async_context *prev_context, async_callback_t callback));
void async_put __ARGS((async_context *context, void *value, size_t length));
void async_get __ARGS((char **p, async_context *context, void *value, size_t length));
void async_return __ARGS((async_context *context, int ret));
async_context *async_pop __ARGS((async_context *context));
void beos_cleanup_read_thread __ARGS((void));
int beos_select __ARGS((int nbits, struct fd_set *rbits, struct fd_set *wbits, struct fd_set *ebits, struct timeval *timeout));
/* vim: set ft=c : */
